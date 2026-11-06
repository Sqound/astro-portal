import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";
import { publishChange } from "../api/change-bus.js";
import {
  layerAfterRework,
  parseLayer,
} from "../journal/session-rework-layer.js";
import {
  knownTargetKeys,
  prepareReworkEvents,
} from "../journal/rework-events.js";
import { createJournalRepository } from "../journal/journal-repository.js";
import {
  sessionResourceFor,
  sessionRowById,
} from "./observation-session-repository.js";
import { audit } from "./plan-project-links.js";
import { writeCaptureLinesForSession } from "../captures/capture-lines-sync.js";
import { writeDeclaredIntegrationsForSession } from "./project-integration-repository.js";

// "Session" here is always an OBSERVATION session; see the naming note at the
// top of persistence/observation-session-repository.js.

const now = () => new Date().toISOString();

/** A package-level error that route adapters map to the v1 error envelope. */
export class SessionReworkStoreError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "SessionReworkStoreError";
    this.code = code;
    this.status = status;
    Object.assign(this, details);
  }
}

const laterTimestamp = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

/**
 * The rework of a session (`session-rework.schema.json`): a **correction
 * layer** stored on the session's own row
 * (`observation_sessions.rework_json`, migration 80), read through by
 * `GET /v1/sessions/{id}`, the events and the Journal. The log of events is
 * never edited. Free: no capability is asked here, on any profile.
 *
 * `rework({ tenantId, userId, sessionId, expectedRevision, request })`
 *   -> `{ kind: "ok", revision }` | `{ kind: "conflict", session }`
 * or a `SessionReworkStoreError`: `session_not_found` (404),
 * `night_not_finished` (409), `invalid_request` (400), `target_not_found`
 * (422, with `targetId`), `event_not_found` (404, `eventId`),
 * `event_not_removable` (409, `eventId`), `session_event_limit_reached` (409).
 * The whole request is checked before anything is written, in the
 * transaction that writes it: all or none.
 *
 * `writeDeclaredLines(driver, tenantId, sessionId)` works the declared
 * integration lines of a multi-night plan out again
 * (`writeDeclaredIntegrationsForSession`): a rework changes the figures
 * they come from. It takes the database driver, not the transaction (SQLite
 * refuses nested ones), so it runs once the rework is committed, next to
 * `publishChange`.
 */
export async function createSessionReworkRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
  writeDeclaredLines = writeDeclaredIntegrationsForSession,
  // The captures' lines follow the rework too.
  writeCaptureLines = writeCaptureLinesForSession,
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);
  const journal = await createJournalRepository({ driver: db, dialect });

  return {
    async close() {
      if (ownsDriver) await db.close();
    },

    async rework({
      tenantId,
      userId,
      sessionId,
      expectedRevision,
      request,
      source = null,
      originClientInstanceId = null,
      timestamp = now(),
    }) {
      const result = await db.transaction(async (transaction) => {
        const row = await sessionRowById(transaction, { tenantId, sessionId });
        if (!row)
          throw new SessionReworkStoreError(
            "session_not_found",
            "The session was not found.",
            { status: 404 },
          );
        if (row.status !== "finished")
          throw new SessionReworkStoreError(
            "night_not_finished",
            "The night is not finished: it cannot be reworked yet.",
            { status: 409 },
          );
        if (Number(row.rework_revision || 0) !== expectedRevision)
          return {
            kind: "conflict",
            session: await sessionResourceFor(transaction, row),
          };

        const layer = parseLayer(row.rework_json);
        const built = await journal.targetsOfRow({
          tenantId,
          row,
          executor: transaction,
        });
        const current = built.targets;
        const currentKeys = new Set(current.map((target) => target.targetId));
        // The targets the sources bring (the plan, the field, the debriefing,
        // Astro Sync): a rework marks them `removed`, never erases them.
        const sourceKeys = new Set(built.sourceKeys);

        // --- the list of targets ---------------------------------------
        let targets;
        const dropped = [];
        if (request.targets) {
          const listed = new Set();
          for (const entry of request.targets) {
            if (listed.has(entry.targetId))
              throw new SessionReworkStoreError(
                "invalid_request",
                `Target "${entry.targetId}" appears twice in targets.`,
              );
            listed.add(entry.targetId);
          }
          for (const key of currentKeys)
            if (!listed.has(key))
              throw new SessionReworkStoreError(
                "invalid_request",
                `targets must list every target of the session; "${key}" is missing (remove it with state "removed").`,
              );
          const fresh = request.targets
            .filter(
              (entry) =>
                !currentKeys.has(entry.targetId) && entry.state !== "removed",
            )
            .map((entry) => entry.targetId);
          const known = await knownTargetKeys(transaction, tenantId, fresh);
          for (const key of fresh)
            if (!known.has(key))
              throw new SessionReworkStoreError(
                "target_not_found",
                "A target is neither in the catalogue nor one of this space's targets.",
                { status: 422, targetId: key },
              );
          targets = [];
          for (const entry of request.targets) {
            // Only a target the night never recorded (a rework's own
            // addition) sent as removed is dropped for good; the others stay,
            // `removed`.
            if (entry.state === "removed" && !sourceKeys.has(entry.targetId)) {
              dropped.push(entry.targetId);
              continue;
            }
            targets.push({
              targetId: entry.targetId,
              state: entry.state,
              startedAt: entry.startedAt ?? null,
              finishedAt: entry.finishedAt ?? null,
              frameCount: entry.frameCount ?? null,
              exposureSeconds: entry.exposureSeconds ?? null,
              filter: entry.filter ?? null,
              reason: entry.reason ?? null,
              // The passages set one at a time.
              passages: entry.passages ?? null,
            });
          }
        }
        const finalKeys = new Set(
          targets
            ? targets.map((target) => target.targetId)
            : current.map((target) => target.targetId),
        );

        // --- the events ------------------------------------------------
        const { revision, added, moves, removals, hide } =
          await prepareReworkEvents(transaction, {
            tenantId,
            sessionId,
            row,
            layer,
            request,
            finalKeys,
            timestamp,
            source,
            fail: (code, message, details) =>
              new SessionReworkStoreError(code, message, details),
          });

        // --- the write -------------------------------------------------
        const next = layerAfterRework(layer, {
          targets,
          dropped,
          added,
          eventMoves: moves,
          eventRemovals: removals,
          hide,
        });
        const updated = await transaction.run(
          `UPDATE observation_sessions
           SET rework_json = ?, rework_revision = ?, reworked_at = ?, updated_at = ?
           WHERE id = ? AND tenant_id = ? AND rework_revision = ?`,
          [
            JSON.stringify(next),
            revision,
            timestamp,
            laterTimestamp(row.updated_at || row.created_at, timestamp),
            sessionId,
            tenantId,
            Number(row.rework_revision || 0),
          ],
        );
        if (!updated.rowCount)
          return {
            kind: "conflict",
            session: await sessionResourceFor(
              transaction,
              await sessionRowById(transaction, { tenantId, sessionId }),
            ),
          };
        await audit(transaction, {
          tenantId,
          userId,
          eventType: "session.reworked",
          details: { sessionId, revision },
          at: timestamp,
        });
        return { kind: "ok", revision };
      });
      if (result.kind === "ok") {
        await writeDeclaredLines(db, tenantId, sessionId);
        await writeCaptureLines(db, tenantId, sessionId);
        publishChange({
          tenantId,
          domains: ["sessions"],
          originClientInstanceId,
        });
      }
      return result;
    },
  };
}
