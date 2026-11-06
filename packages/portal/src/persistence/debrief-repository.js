import { randomUUID } from "node:crypto";
import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";
import {
  retryOnSqliteNestedTransaction,
  withSerializedSqliteRetry,
} from "./db-transaction-retry.js";
import { publishChange } from "../api/change-bus.js";
import { writeCaptureLinesForSession } from "../captures/capture-lines-sync.js";
import { writeDeclaredIntegrationsForSession } from "./project-integration-repository.js";
import {
  apiPlanStatus,
  archivePlannerPayload,
  createPlanResourceRepository,
  normalizePlanResourcePayload,
  normalizedPlanFields,
  parseJson,
  planRevision,
  planVersionOrderTiebreak,
  plannerPlanStatus,
  planRowFor,
  replacePlanItems,
  resourceForPlanRow,
  versionForRow,
} from "./planner-state-repository.js";
import {
  insertGeneratedEventRows,
  sessionResourceWithCounts,
  sessionRowById,
  sessionRowForPlan,
  supplementResourceForRow,
} from "./observation-session-repository.js";
import {
  mapPlanToSession,
  mapSupplementAcceptance,
} from "../session-events/debrief-event-mapping.js";
import {
  layerAfterRework,
  parseLayer,
} from "../journal/session-rework-layer.js";
import { prepareReworkEvents } from "../journal/rework-events.js";
import { audit } from "./plan-project-links.js";
import { debriefedStatusOf } from "./plan-session-flags.js";

// "Session" here is always an OBSERVATION session; see the naming note at
// the top of persistence/observation-session-repository.js. Every export in
// THIS file is named debrief... / ...Debrief... for the same reason, on
// api/v1.md's own vocabulary ("Observation sessions and debriefing").

const now = () => new Date().toISOString();

/** A package-level error that route adapters map to the v1 error envelope. */
export class DebriefStoreError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "DebriefStoreError";
    this.code = code;
    this.status = status;
    Object.assign(this, details);
  }
}

/**
 * The per-target part of a `partial` decision as it is stored
 * (`plans.debrief_targets_json`, migration 45): `reason` only under
 * `skipped`, `acquiredMinutes` only under `done`/`modified`/`partial`,
 * notes never (they are journal events already). Exactly
 * debrief.schema.json's `record.targets[]`.
 */
export function storedDebriefTargets(adjustments = []) {
  return adjustments.map((adjustment) => {
    const observed = adjustment.state !== "skipped";
    return {
      targetId: adjustment.targetId,
      state: adjustment.state,
      ...(adjustment.state === "skipped" && adjustment.reason
        ? { reason: adjustment.reason }
        : {}),
      ...(observed && Number.isSafeInteger(adjustment.acquiredMinutes)
        ? { acquiredMinutes: adjustment.acquiredMinutes }
        : {}),
      // The figures and times declared for an observed target, and the
      // removal of a planned one (read for `skipped` only). Stored, never
      // turned into events.
      ...(observed && Number.isSafeInteger(adjustment.frameCount)
        ? { frameCount: adjustment.frameCount }
        : {}),
      // The exposure per frame declared for the target.
      ...(observed && Number.isFinite(adjustment.exposureSeconds)
        ? { exposureSeconds: adjustment.exposureSeconds }
        : {}),
      ...(observed && adjustment.startedAt
        ? { startedAt: adjustment.startedAt }
        : {}),
      ...(observed && adjustment.finishedAt
        ? { finishedAt: adjustment.finishedAt }
        : {}),
      // The passages declared one at a time.
      ...(observed && Array.isArray(adjustment.passages)
        ? { passages: adjustment.passages }
        : {}),
      ...(!observed && adjustment.removed === true ? { removed: true } : {}),
    };
  });
}

/** The targets a debriefing added, as they are stored (`record.addedTargets`). */
export function storedAddedTargets(addedTargets = []) {
  return addedTargets.map((target) => ({
    targetId: target.targetId,
    ...(target.startedAt ? { startedAt: target.startedAt } : {}),
    ...(target.finishedAt ? { finishedAt: target.finishedAt } : {}),
    ...(Number.isSafeInteger(target.acquiredMinutes)
      ? { acquiredMinutes: target.acquiredMinutes }
      : {}),
    ...(Number.isSafeInteger(target.frameCount)
      ? { frameCount: target.frameCount }
      : {}),
    ...(Number.isFinite(target.exposureSeconds)
      ? { exposureSeconds: target.exposureSeconds }
      : {}),
    ...(target.filter ? { filter: target.filter } : {}),
    ...(Array.isArray(target.passages) ? { passages: target.passages } : {}),
  }));
}

/**
 * debrief.schema.json's `record` for a plan row, or null when the plan was
 * never debriefed (not frozen by a decision).
 */
export function debriefRecordForPlanRow(plan) {
  if (!plan?.frozen_at) return null;
  const outcome = debriefedStatusOf(plan);
  if (!outcome) return null;
  const targets = plan.debrief_targets_json
    ? parseJson(plan.debrief_targets_json)
    : null;
  const addedTargets = plan.debrief_added_targets_json
    ? parseJson(plan.debrief_added_targets_json)
    : null;
  return {
    outcome,
    decidedAt: plan.frozen_at,
    targets: Array.isArray(targets) ? targets : [],
    ...(outcome === "abandoned" && plan.debrief_reason
      ? { reason: plan.debrief_reason }
      : {}),
    ...(Array.isArray(addedTargets) && addedTargets.length
      ? { addedTargets }
      : {}),
  };
}

/**
 * The `abandoned` decision of a device, arriving after the write that closed
 * its plan froze it as abandoned (DEBRIEF-QUEUE-ABANDONED-01): the plan has
 * no session at all (one the owner deleted is not given back), so the night
 * is kept as a finished session of origin `debrief`, as a decision on a
 * pending plan keeps it, and the reason is stored when the plan holds none.
 * A plan that holds a session is left as it is: the decision is then a plain
 * replay. Answers whether a session was made.
 */
async function completeAutomaticAbandonment(
  transaction,
  { tenantId, plan, decision, timestamp },
) {
  const held = (
    await transaction.query(
      "SELECT id FROM observation_sessions WHERE tenant_id = ? AND plan_id = ? LIMIT 1",
      [tenantId, plan.id],
    )
  ).rows[0];
  if (held) return false;
  if (decision.reason && !plan.debrief_reason)
    await transaction.run(
      `UPDATE plans SET debrief_reason = ? WHERE id = ? AND tenant_id = ?`,
      [decision.reason, plan.id, tenantId],
    );
  const nightAnchor = `${plan.plan_date}T00:00:00.000Z`;
  const startedAt =
    decision.session?.startedAt ?? plan.night_start_at ?? nightAnchor;
  const finishedAt =
    decision.session?.finishedAt ?? plan.night_end_at ?? startedAt;
  await transaction.run(
    `INSERT INTO observation_sessions
     (id, tenant_id, plan_id, started_at, finished_at, status, created_at, updated_at, origin, notes)
     VALUES (?, ?, ?, ?, ?, 'finished', ?, ?, 'debrief', ?)`,
    [
      randomUUID(),
      tenantId,
      plan.id,
      startedAt,
      finishedAt,
      timestamp,
      timestamp,
      decision.note ?? null,
    ],
  );
  return true;
}

const laterTimestamp = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

async function eventCountForSession(driver, sessionId) {
  return Number(
    (
      await driver.query(
        "SELECT COUNT(*) AS count FROM session_events WHERE session_id = ?",
        [sessionId],
      )
    ).rows[0]?.count || 0,
  );
}

/**
 * The `{ kind: "ok", ... }` shape both a fresh decision and a replay answer,
 * matching debrief.schema.json's `response` (minus the `kind` discriminator,
 * which the caller strips before handing the body to a route).
 */
async function replayedDecisionResult(transaction, { tenantId, plan }) {
  const sessionRow = await sessionRowForPlan(transaction, {
    tenantId,
    planId: plan.id,
  });
  return {
    kind: "ok",
    plan: resourceForPlanRow(plan),
    session: sessionRow
      ? await sessionResourceWithCounts(transaction, sessionRow)
      : null,
    outcome: debriefedStatusOf(plan) ?? plannerPlanStatus(plan.status),
    decidedAt: plan.frozen_at,
    createdSession: false,
    eventsCreated: 0,
    replayed: true,
  };
}

/**
 * Granular v1 debriefing persistence: the debrief queue, the debriefing
 * decision (the divergence-resolution point and the plan-to-session
 * mapping), and a session supplement's accept/dismiss decision. Shares the
 * `plans`/`plan_versions` tables with planner-state-repository.js and the
 * `observation_sessions`/`session_events`/`session_supplements` tables with
 * observation-session-repository.js — reusing their exported row/resource
 * helpers rather than re-deriving the same shapes, so the three stay
 * byte-for-byte consistent (a plan or session read back through any of the
 * three repositories looks identical).
 *
 * `decide()` and `decideSupplement()` each run their SQL in exactly one
 * transaction per call (`withSerializedSqliteRetry` handles the SQLite
 * driver's single-in-flight-transaction limit under two genuinely
 * concurrent calls; see that module's own comment) — the atomic step that
 * makes "two concurrent calls never produce two sessions or a duplicate
 * event" hold: a single UPDATE, guarded by `status = 'pending' AND
 * frozen_at IS NULL`, is the one write only ONE of two racing transactions
 * can complete, and the loser reads back and returns the winner's own
 * result as a replay. Deterministic eventIds (debrief-event-mapping.js) are
 * the second half of that guarantee: even where the claim above did not
 * exist, two decisions computing the same eventId for the same fact
 * collide on the `(session_id, event_id)` primary key and the union keeps
 * the first row.
 */
export async function createDebriefRepository({
  databasePath,
  databaseUrl,
  driver,
  // The driver knows what it speaks; the URL heuristic is only for the
  // case where this repository opens its own connection. A caller that
  // hands in a PostgresDriver without a URL used to be mis-detected as
  // SQLite — harmless while every migration was portable, fatal from
  // migration 21 on (`rowid` vs `seq`).
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
  // The declared integration lines of a night attached to a multi-night plan:
  // worked out again once a decision is committed, `executed` and `partial`
  // writing them, `abandoned` removing them. It takes the driver, not the
  // transaction (SQLite refuses nested ones).
  writeDeclaredLines = writeDeclaredIntegrationsForSession,
  // The lines of « Intégrations » of the session's captures, filled as
  // « Synchroniser avec la session » would, once the decision is
  // committed (a line the owner corrected is kept).
  writeCaptureLines = writeCaptureLinesForSession,
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);
  // Shares this exact driver: catchUpNightBounds runs in its OWN separate
  // transaction, sequentially before decide()/queue() open theirs — never
  // nested inside them, which the SQLite driver would refuse outright.
  const planResourceRepository = await createPlanResourceRepository({
    driver: db,
    dialect,
  });
  // The Journal reads the debriefing (`debriefRecordForPlanRow`), so its
  // module imports this one: loaded here, when first needed, to keep the two
  // from importing each other at evaluation time.
  const { createJournalRepository } =
    await import("../journal/journal-repository.js");
  const journal = await createJournalRepository({ driver: db, dialect });

  /**
   * The signals the person adds after the fact (`addedEvents`, `eventMoves` of the decision:
   * `eventReplacements`) are the first layer of a rework of the session the debriefing has just written,
   * checked by the rules of the rework itself (`journal/rework-events.js`) in the same transaction: the
   * session reads `reworkRevision` 1, the append-only log is untouched.
   */
  async function applyEventsLayer(
    transaction,
    { tenantId, userId, sessionId, decision, timestamp },
  ) {
    const row = await sessionRowById(transaction, { tenantId, sessionId });
    const layer = parseLayer(row.rework_json);
    const current = (
      await journal.targetsOfRow({ tenantId, row, executor: transaction })
    ).targets;
    const { revision, added, moves } = await prepareReworkEvents(transaction, {
      tenantId,
      sessionId,
      row,
      layer,
      request: {
        addedEvents: decision.addedEvents ?? [],
        eventReplacements: decision.eventReplacements ?? [],
        eventMoves: decision.eventMoves ?? [],
      },
      finalKeys: new Set(current.map((target) => target.targetId)),
      timestamp,
      addedOnly: true,
      fail: (code, message, details) =>
        new DebriefStoreError(code, message, details),
    });
    const next = layerAfterRework(layer, {
      targets: null,
      added,
      eventMoves: moves,
    });
    await transaction.run(
      `UPDATE observation_sessions
       SET rework_json = ?, rework_revision = ?, reworked_at = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
      [
        JSON.stringify(next),
        revision,
        timestamp,
        laterTimestamp(row.updated_at || row.created_at, timestamp),
        sessionId,
        tenantId,
      ],
    );
    await audit(transaction, {
      tenantId,
      userId,
      eventType: "session.reworked",
      details: { sessionId, revision, via: "debrief" },
      at: timestamp,
    });
  }

  return {
    async close() {
      if (ownsDriver) await db.close();
    },

    /**
     * GET /v1/plans/debrief-queue. Catches up every unresolved plan's night
     * boundaries first (api/v1.md, "The night boundaries of a plan"), then
     * returns every `active`, non-frozen plan whose `nightEndAt` has passed
     * — or whose execution session is already finished (a night closed by hand at 3 a.m. is debriefable at once) — each
     * with its stale-device warnings, its set-aside/current version pair when one exists, and its open/paused session
     * marker. A plan whose only session was deleted is not in the queue: the deletion takes the session out of the file,
     * not the plan. The internal plan of a guided evening (`guided_evening`) is never in the queue.
     */
    async queue({ tenantId, timestamp = now() }) {
      // The whole call (the catch-up transaction below, then the read
      // transaction) is retried together: either one can race a concurrent
      // call on the same shared SQLite driver (see db-transaction-retry.js).
      return await retryOnSqliteNestedTransaction(async () => {
        await planResourceRepository.catchUpNightBounds({
          tenantId,
          timestamp,
        });
        return await db.transaction(async (transaction) => {
          const plans = (
            await transaction.query(
              `SELECT * FROM plans
               WHERE tenant_id = ? AND status = 'pending' AND deleted_at IS NULL
                 AND guided_evening = 0
                 AND night_end_at IS NOT NULL
                 AND (night_end_at < ?
                   OR EXISTS (
                     SELECT 1 FROM observation_sessions
                     WHERE observation_sessions.tenant_id = plans.tenant_id
                       AND observation_sessions.plan_id = plans.id
                       AND observation_sessions.deleted_at IS NULL
                       AND observation_sessions.finished_at IS NOT NULL))
                 AND (EXISTS (
                     SELECT 1 FROM observation_sessions
                     WHERE observation_sessions.tenant_id = plans.tenant_id
                       AND observation_sessions.plan_id = plans.id
                       AND observation_sessions.deleted_at IS NULL)
                   OR NOT EXISTS (
                     SELECT 1 FROM observation_sessions
                     WHERE observation_sessions.tenant_id = plans.tenant_id
                       AND observation_sessions.plan_id = plans.id
                       AND observation_sessions.deleted_at IS NOT NULL))
               ORDER BY night_end_at, id`,
              [tenantId, timestamp],
            )
          ).rows;
          if (!plans.length) return { generatedAt: timestamp, entries: [] };

          // Only the phone app keeps plan changes and field notes offline
          // (a row with no application is a legacy phone). Astro Sync keeps
          // nothing of a plan offline, so it has nothing to be late with.
          const devices = (
            await transaction.query(
              `SELECT id, label, last_sync_at FROM device_tokens
               WHERE tenant_id = ? AND revoked_at IS NULL
                 AND (application IS NULL OR application = 'planner')
               ORDER BY created_at, id`,
              [tenantId],
            )
          ).rows;
          const deviceLabelById = new Map(
            devices.map((device) => [device.id, device.label]),
          );

          const entries = [];
          for (const plan of plans) {
            const sessionRow = await sessionRowForPlan(transaction, {
              tenantId,
              planId: plan.id,
            });
            // A night closed by hand before its derived end is stale
            // relative to the moment it was closed, not to a boundary still
            // ahead of the server clock.
            const staleBoundary =
              sessionRow?.finished_at &&
              sessionRow.finished_at < plan.night_end_at
                ? sessionRow.finished_at
                : plan.night_end_at;
            const staleDevices = devices
              .filter(
                (device) =>
                  !device.last_sync_at || device.last_sync_at < staleBoundary,
              )
              .map((device) => ({
                deviceId: device.id,
                label: device.label,
                lastSyncAt: device.last_sync_at || null,
              }));

            const setAsideVersion = (
              await transaction.query(
                `SELECT * FROM plan_versions
                 WHERE tenant_id = ? AND plan_id = ? AND state = 'set_aside'
                   AND (purge_after IS NULL OR purge_after > ?)
                 ORDER BY revision DESC, created_at DESC, ${planVersionOrderTiebreak(dialect)} DESC LIMIT 1`,
                [tenantId, plan.id, timestamp],
              )
            ).rows[0];

            let versions;
            let setAsideVersionId = null;
            if (setAsideVersion) {
              setAsideVersionId = setAsideVersion.id;
              // Field first (api/v1.md, "The debrief queue"): the set-aside
              // reading, then the live one. `origin`/`deviceLabel` for the
              // CURRENT reading are always "web"/null — there is no device
              // column on the live `plans` row itself, only on the
              // plan_versions row a rejected submission was set aside as
              // (see debrief.schema.json `queueVersion` and the worked
              // example in sessions.test.mjs).
              versions = [
                {
                  base: "set_aside",
                  origin: setAsideVersion.origin_device_id ? "field" : "web",
                  versionId: setAsideVersion.id,
                  revision: planRevision(setAsideVersion.revision),
                  createdAt: setAsideVersion.created_at,
                  deviceLabel: setAsideVersion.origin_device_id
                    ? deviceLabelById.get(setAsideVersion.origin_device_id) ||
                      null
                    : null,
                  payload: versionForRow(setAsideVersion).payload,
                },
                {
                  base: "current",
                  origin: "web",
                  versionId: null,
                  revision: planRevision(plan.revision),
                  createdAt: plan.updated_at,
                  deviceLabel: null,
                  payload: resourceForPlanRow(plan).payload,
                },
              ];
            }

            const openSession =
              sessionRow &&
              (sessionRow.status === "open" || sessionRow.status === "paused")
                ? { sessionId: sessionRow.id, status: sessionRow.status }
                : null;

            entries.push({
              planId: plan.id,
              nightStartAt: plan.night_start_at || null,
              nightEndAt: plan.night_end_at,
              plan: resourceForPlanRow(plan),
              ...(versions ? { versions, setAsideVersionId } : {}),
              staleDevices,
              sessionId: sessionRow ? sessionRow.id : null,
              openSession,
            });
          }
          return { generatedAt: timestamp, entries };
        });
      });
    },

    /**
     * POST /v1/plans/{planId}/debrief. Returns one of:
     *   { kind: "missing" }
     *   { kind: "frozen", serverRevision, serverPayload }
     *   { kind: "not_debriefable", reason: "night_in_future" | "session_has_events" }
     *   { kind: "set_aside_version_required" }
     *   { kind: "set_aside_version_not_found" }
     *   { kind: "unknown_target_adjustment", targetId }
     *   { kind: "ok", plan, session, outcome, decidedAt, createdSession,
     *       eventsCreated, replayed }
     */
    async decide({
      tenantId,
      userId,
      planId,
      decision,
      originDeviceId = null,
      originClientInstanceId = null,
      timestamp = now(),
    }) {
      // The whole call — the catch-up transaction ("before anything else",
      // api/v1.md, "The night boundaries of a plan"), sequential with (never
      // nested inside) the decision's own transaction below — is retried
      // together: either one can race a concurrent call on the same shared
      // SQLite driver (see db-transaction-retry.js).
      const result = await retryOnSqliteNestedTransaction(async () => {
        await planResourceRepository.catchUpNightBounds({
          tenantId,
          timestamp,
        });
        return await db.transaction(async (transaction) => {
          const plan = await planRowFor(transaction, tenantId, planId);
          if (!plan) return { kind: "missing" };

          if (apiPlanStatus(plan.status) !== "active") {
            if (plan.frozen_at && debriefedStatusOf(plan)) {
              // A night given up is decided by the write that closes the plan
              // (`closedAs: abandoned`, planner-state-repository.js). A device
              // that still sends the `abandoned` decision afterwards finds the
              // plan decided: a replay, which first gives the night the
              // session it lacks (and the reason, the note it carries).
              const completed =
                decision.outcome === "abandoned" && plan.status === "abandoned"
                  ? await completeAutomaticAbandonment(transaction, {
                      tenantId,
                      plan,
                      decision,
                      timestamp,
                    })
                  : false;
              const replay = await replayedDecisionResult(transaction, {
                tenantId,
                plan,
              });
              return completed ? { ...replay, createdSession: true } : replay;
            }
            // `archived` (or any other frozen status) with no `frozen_at`:
            // never went through a debrief, so there is no earlier decision
            // to replay (api/v1.md, "Idempotency").
            return {
              kind: "frozen",
              serverRevision: planRevision(plan.revision),
              serverPayload: resourceForPlanRow(plan).payload,
            };
          }

          // "Debriefing before the night ends" (api/v1.md): `executed`/
          // `partial` refuse a future night; `abandoned` is accepted at any
          // time instead, EXCEPT when this plan's session already holds field
          // events — a session with events says the night happened, which is
          // the opposite of "abandoned".
          if (decision.outcome === "abandoned") {
            const existingSession = await sessionRowForPlan(transaction, {
              tenantId,
              planId,
            });
            if (existingSession) {
              const eventCount = await eventCountForSession(
                transaction,
                existingSession.id,
              );
              if (eventCount > 0)
                return {
                  kind: "not_debriefable",
                  reason: "session_has_events",
                };
            }
          } else if (
            plan.night_end_at &&
            Date.parse(plan.night_end_at) > Date.parse(timestamp) &&
            // A night finished by hand is over, whatever the derived end
            // says (the execution session carries `finished_at`).
            !(await sessionRowForPlan(transaction, { tenantId, planId }))
              ?.finished_at
          ) {
            return { kind: "not_debriefable", reason: "night_in_future" };
          }

          const hasSetAside = Boolean(
            (
              await transaction.query(
                `SELECT 1 FROM plan_versions
               WHERE tenant_id = ? AND plan_id = ? AND state = 'set_aside'
                 AND (purge_after IS NULL OR purge_after > ?)
               LIMIT 1`,
                [tenantId, planId, timestamp],
              )
            ).rows[0],
          );
          if (hasSetAside && !decision.baseVersion)
            return { kind: "set_aside_version_required" };

          let effectivePayload = parseJson(plan.payload_json);
          let effectiveRevision = planRevision(plan.revision);
          let restoreFields = null;

          if (decision.baseVersion === "set_aside") {
            const versionRow = decision.setAsideVersionId
              ? (
                  await transaction.query(
                    `SELECT * FROM plan_versions
                   WHERE id = ? AND tenant_id = ? AND plan_id = ? AND state = 'set_aside'`,
                    [decision.setAsideVersionId, tenantId, planId],
                  )
                ).rows[0]
              : null;
            if (!versionRow) return { kind: "set_aside_version_not_found" };
            const restoredPayload = normalizePlanResourcePayload(
              parseJson(versionRow.payload_json),
            );
            restoreFields = normalizedPlanFields(restoredPayload);
            effectivePayload = restoredPayload;
            effectiveRevision = planRevision(plan.revision) + 1;
          }

          if (decision.outcome === "partial") {
            const itemIds = new Set(
              effectivePayload.items.map((item) => item.id),
            );
            for (const adjustment of decision.sessionAdjustments?.targets ?? [])
              if (!itemIds.has(adjustment.targetId))
                return {
                  kind: "unknown_target_adjustment",
                  targetId: adjustment.targetId,
                };
          }

          // A target added at the debriefing must be one the space knows (the
          // catalogue, or its own targets), else the same refusal an
          // adjustment of an unknown target gets.
          if (
            decision.outcome !== "abandoned" &&
            decision.addedTargets?.length
          ) {
            const keys = [
              ...new Set(decision.addedTargets.map((added) => added.targetId)),
            ];
            const known = new Set(
              (
                await transaction.query(
                  `SELECT id FROM target_catalogue_entries
                   WHERE id IN (${keys.map(() => "?").join(", ")})
                     AND (space_id IS NULL OR space_id = ?)`,
                  [...keys, tenantId],
                )
              ).rows.map((row) => row.id),
            );
            const unknown = keys.find((key) => !known.has(key));
            if (unknown)
              return {
                kind: "unknown_target_adjustment",
                targetId: unknown,
                added: true,
              };
          }

          // The old current payload becomes `history` the same way an
          // ordinary restore archives it — only once we know the request is
          // otherwise well-formed, so a refused request never pollutes the
          // history with an archive nobody asked for.
          if (restoreFields)
            await archivePlannerPayload(transaction, {
              tenantId,
              plan,
              payloadJson: plan.payload_json,
              timestamp,
            });

          // THE CLAIM: one UPDATE guarded by status='pending' AND frozen_at IS
          // NULL, combining the optional restore with the freeze so the race
          // between two concurrent decisions is resolved by a single
          // row-locked statement. `rowCount === 0` means a concurrent call
          // already froze this plan (on PostgreSQL: blocked on the row lock
          // until that call committed, then re-evaluated and found the row no
          // longer 'pending'); this call then defers entirely to whatever was
          // just committed, exactly as a same-outcome replay would.
          const claim = restoreFields
            ? await transaction.run(
                `UPDATE plans SET
                 client_id = ?, plan_date = ?, name = ?, location_json = ?,
                 equipment_json = ?, min_altitude = ?, settings_json = ?,
                 payload_json = ?, night_start_at = ?, night_end_at = ?,
                 night_bounds_resolved_at = ?, revision = ?, status = ?,
                 frozen_at = ?, updated_at = ?
               WHERE id = ? AND tenant_id = ? AND status = 'pending'
                 AND frozen_at IS NULL`,
                [
                  restoreFields.clientId,
                  restoreFields.planDate,
                  restoreFields.name,
                  restoreFields.locationJson,
                  restoreFields.equipmentJson,
                  restoreFields.minAltitude,
                  restoreFields.settingsJson,
                  restoreFields.payloadJson,
                  restoreFields.nightStartAt,
                  restoreFields.nightEndAt,
                  timestamp,
                  effectiveRevision,
                  decision.outcome,
                  timestamp,
                  timestamp,
                  planId,
                  tenantId,
                ],
              )
            : await transaction.run(
                `UPDATE plans SET status = ?, frozen_at = ?, updated_at = ?
               WHERE id = ? AND tenant_id = ? AND status = 'pending'
                 AND frozen_at IS NULL`,
                [decision.outcome, timestamp, timestamp, planId, tenantId],
              );

          if (!claim.rowCount) {
            const latest = await planRowFor(transaction, tenantId, planId);
            if (!latest) return { kind: "missing" };
            if (!latest.frozen_at)
              // Practically unreachable (the row would still read 'pending' —
              // neither this call nor a racing one actually froze it) but
              // guarded rather than silently mis-replayed.
              throw new DebriefStoreError(
                "debrief_conflict",
                "The plan could not be frozen.",
                { status: 503 },
              );
            return await replayedDecisionResult(transaction, {
              tenantId,
              plan: latest,
            });
          }

          // The per-target part of a partial night, stored with the decision
          // it belongs to, in the same transaction.
          if (decision.outcome === "partial")
            await transaction.run(
              `UPDATE plans SET debrief_targets_json = ?
               WHERE id = ? AND tenant_id = ?`,
              [
                JSON.stringify(
                  storedDebriefTargets(
                    decision.sessionAdjustments?.targets ?? [],
                  ),
                ),
                planId,
                tenantId,
              ],
            );

          // Why a night was not carried out, and the targets the debriefing
          // added, stored with the decision.
          if (decision.outcome === "abandoned" && decision.reason)
            await transaction.run(
              `UPDATE plans SET debrief_reason = ? WHERE id = ? AND tenant_id = ?`,
              [decision.reason, planId, tenantId],
            );
          if (decision.outcome !== "abandoned" && decision.addedTargets?.length)
            await transaction.run(
              `UPDATE plans SET debrief_added_targets_json = ?
               WHERE id = ? AND tenant_id = ?`,
              [
                JSON.stringify(storedAddedTargets(decision.addedTargets)),
                planId,
                tenantId,
              ],
            );

          if (restoreFields)
            await replacePlanItems(transaction, {
              tenantId,
              planId,
              items: restoreFields.items,
              timestamp,
            });

          const frozen = await planRowFor(transaction, tenantId, planId);
          const planForMapping = {
            payload: effectivePayload,
            revision: effectiveRevision,
            nightStartAt: frozen.night_start_at || null,
            nightEndAt: frozen.night_end_at || null,
          };

          let sessionRow = await sessionRowForPlan(transaction, {
            tenantId,
            planId,
          });
          const sessionId = sessionRow ? sessionRow.id : randomUUID();
          let createdSession = false;
          let eventsCreated = 0;

          if (decision.outcome === "abandoned") {
            // The night is kept as a finished session of outcome
            // `abandoned` (its reason is on the plan's debriefing). An
            // EXISTING session is preserved (never removed) and finished if
            // it was still open or paused; we already refused above when it
            // held any event, so a session reachable here is empty. No
            // event of any kind is written, keeping the append-only journal
            // exactly as it was.
            if (!sessionRow) {
              const nightAnchor = `${effectivePayload.date}T00:00:00.000Z`;
              const startedAt =
                decision.session?.startedAt ??
                frozen.night_start_at ??
                nightAnchor;
              const finishedAt =
                decision.session?.finishedAt ??
                frozen.night_end_at ??
                startedAt;
              // The note typed with the abandonment is the night's own note
              // (`night.notes`, which the Journal, the phone's page and the
              // web's page read), never an event.
              await transaction.run(
                `INSERT INTO observation_sessions
                 (id, tenant_id, plan_id, started_at, finished_at, status, created_at, updated_at, origin, notes)
               VALUES (?, ?, ?, ?, ?, 'finished', ?, ?, 'debrief', ?)`,
                [
                  sessionId,
                  tenantId,
                  planId,
                  startedAt,
                  finishedAt,
                  timestamp,
                  timestamp,
                  decision.note ?? null,
                ],
              );
              createdSession = true;
              sessionRow = await sessionRowById(transaction, {
                tenantId,
                sessionId,
              });
            } else {
              if (!sessionRow.finished_at) {
                const finishedAt = timestamp;
                await transaction.run(
                  `UPDATE observation_sessions
               SET status = 'finished', finished_at = ?, updated_at = ?
               WHERE id = ? AND tenant_id = ?`,
                  [
                    finishedAt,
                    laterTimestamp(
                      sessionRow.updated_at || sessionRow.created_at,
                      timestamp,
                    ),
                    sessionId,
                    tenantId,
                  ],
                );
              }
              // The note of the abandonment fills the night's note when
              // the night holds none; a note the person already wrote on
              // the night is never replaced.
              if (decision.note && !sessionRow.notes)
                await transaction.run(
                  `UPDATE observation_sessions SET notes = ?
                   WHERE id = ? AND tenant_id = ?`,
                  [decision.note, sessionId, tenantId],
                );
              sessionRow = await sessionRowById(transaction, {
                tenantId,
                sessionId,
              });
            }
          } else {
            const mapped = mapPlanToSession({
              sessionId,
              plan: planForMapping,
              request: decision,
              now: timestamp,
            });

            if (!sessionRow) {
              await transaction.run(
                `INSERT INTO observation_sessions
                 (id, tenant_id, plan_id, started_at, finished_at, status, created_at, updated_at, origin)
               VALUES (?, ?, ?, ?, ?, 'finished', ?, ?, 'debrief')`,
                [
                  sessionId,
                  tenantId,
                  planId,
                  mapped.session.startedAt,
                  mapped.session.finishedAt,
                  timestamp,
                  timestamp,
                ],
              );
              createdSession = true;
            } else if (!sessionRow.finished_at) {
              // Reused session, still open/paused: the night is over now that
              // it has been debriefed, so it is finished the same way — but a
              // session already finished (its own finishedAt already
              // recorded) is left exactly as it was, the same idempotency
              // finishSession itself already gives a standalone finish call.
              const finishedAt =
                decision.session?.finishedAt ??
                frozen.night_end_at ??
                sessionRow.started_at;
              await transaction.run(
                `UPDATE observation_sessions
               SET status = 'finished', finished_at = ?, updated_at = ?
               WHERE id = ? AND tenant_id = ?`,
                [
                  finishedAt,
                  laterTimestamp(
                    sessionRow.updated_at || sessionRow.created_at,
                    timestamp,
                  ),
                  sessionId,
                  tenantId,
                ],
              );
            }

            const inserted = await insertGeneratedEventRows(transaction, {
              sessionId,
              events: mapped.events,
              timestamp,
            });
            eventsCreated = inserted.accepted.length;

            if (createdSession || inserted.accepted.length)
              await transaction.run(
                `UPDATE observation_sessions SET updated_at = ?
               WHERE id = ? AND tenant_id = ?`,
                [
                  laterTimestamp(
                    sessionRow
                      ? sessionRow.updated_at || sessionRow.created_at
                      : timestamp,
                    timestamp,
                  ),
                  sessionId,
                  tenantId,
                ],
              );

            if (
              decision.addedEvents?.length ||
              decision.eventReplacements?.length ||
              decision.eventMoves?.length
            )
              await applyEventsLayer(transaction, {
                tenantId,
                userId,
                sessionId,
                decision,
                timestamp,
              });

            sessionRow = await sessionRowById(transaction, {
              tenantId,
              sessionId,
            });
          }

          return {
            kind: "ok",
            plan: resourceForPlanRow(frozen),
            session: sessionRow
              ? await sessionResourceWithCounts(transaction, sessionRow)
              : null,
            outcome: decision.outcome,
            decidedAt: timestamp,
            createdSession,
            eventsCreated,
            replayed: false,
          };
        });
      });
      // "missing"/"frozen"/"not_debriefable"/"set_aside_version_required"/
      // "set_aside_version_not_found"/"unknown_target_adjustment" are all
      // refusals that wrote nothing. A replayed "ok" did commit (idempotent
      // no-op), but re-announcing the same, already-known decision is
      // harmless — simpler than distinguishing it here.
      if (result?.kind === "ok") {
        if (result.session?.id) {
          await writeDeclaredLines(db, tenantId, result.session.id);
          await writeCaptureLines(db, tenantId, result.session.id);
        }
        // A decision freezes the plan (its status and revision change) and
        // writes the session of the night: a device whose only signal was
        // `debrief` re-read its queue but neither the plan nor the Journal,
        // so a night debriefed on the web stayed « À débriefer » on the
        // phone until the list was pulled.
        publishChange({
          tenantId,
          domains: ["debrief", "plans", "sessions"],
          originClientInstanceId,
        });
      }
      return result;
    },

    /**
     * The stored debriefing of one plan (debrief.schema.json's `record`),
     * or null when the plan is missing or was never debriefed.
     */
    async debriefRecord({ tenantId, planId }) {
      const plan = await planRowFor(db, tenantId, planId);
      return debriefRecordForPlanRow(plan);
    },

    /**
     * POST /v1/sessions/{id}/supplements/{sid}. Returns one of:
     *   { kind: "session_missing" }
     *   { kind: "supplement_missing" }
     *   { kind: "already_accepted" }  (only for a "dismiss" of an accepted one)
     *   { kind: "ok", supplement, eventsCreated, replayed }
     */
    async decideSupplement({
      tenantId,
      sessionId,
      supplementId,
      decision,
      originClientInstanceId = null,
      timestamp = now(),
    }) {
      const result = await withSerializedSqliteRetry(
        db,
        async (transaction) => {
          const session = await sessionRowById(transaction, {
            tenantId,
            sessionId,
          });
          if (!session) return { kind: "session_missing" };

          const supplementRow = (
            await transaction.query(
              `SELECT session_supplements.*, device_tokens.label AS device_label
             FROM session_supplements
             LEFT JOIN device_tokens ON device_tokens.id = session_supplements.origin_device_id
             WHERE session_supplements.id = ? AND session_supplements.session_id = ?`,
              [supplementId, sessionId],
            )
          ).rows[0];
          if (!supplementRow) return { kind: "supplement_missing" };

          // "accept" targets status 'accepted', "dismiss" targets 'dismissed'
          // — a different vocabulary from the decision string itself.
          const targetStatus = decision === "accept" ? "accepted" : "dismissed";
          if (supplementRow.status === targetStatus) {
            // Same decision replayed: creates nothing, whatever the current
            // state (an accepted supplement's own eventIds are read back).
            return {
              kind: "ok",
              supplement: supplementResourceForRow(
                supplementRow,
                session.plan_id,
              ),
              eventsCreated: 0,
              replayed: true,
            };
          }

          if (decision === "dismiss") {
            if (supplementRow.status === "accepted")
              return { kind: "already_accepted" };
            const dismissed = await transaction.run(
              `UPDATE session_supplements SET status = 'dismissed', decided_at = ?
             WHERE id = ? AND session_id = ? AND status <> 'accepted'`,
              [timestamp, supplementId, sessionId],
            );
            if (!dismissed.rowCount)
              // Lost a race against a concurrent "accept": the invariant
              // ("accepted → dismissed" refused) still holds, just decided by
              // the other call instead of the explicit check above.
              return { kind: "already_accepted" };
            const updated = {
              ...supplementRow,
              status: "dismissed",
              decided_at: timestamp,
            };
            return {
              kind: "ok",
              supplement: supplementResourceForRow(updated, session.plan_id),
              eventsCreated: 0,
              replayed: false,
            };
          }

          // "accept": events for every item of the supplement's own payload
          // that no `target_started` of this session already names. A
          // `target_skipped` does not count — it is not a `target_started`,
          // so accepting still appends the pair and the skip line stays
          // exactly where it is (api/v1.md, "Late field data: session
          // supplements").
          const startedRows = (
            await transaction.query(
              `SELECT payload FROM session_events
             WHERE session_id = ? AND type = 'target_started'`,
              [sessionId],
            )
          ).rows;
          const alreadyStartedPlanItemIds = new Set(
            startedRows.map((row) => {
              const payload = parseJson(row.payload, {});
              return payload.planItemId ?? payload.targetId;
            }),
          );

          // The supplement's own events are anchored on the SESSION's linked
          // plan night boundaries — the plan this session was generated from,
          // read through the link, not the plan's possibly-later revision.
          let planNightStartAt = null;
          if (session.plan_id) {
            const linkedPlan = await planRowFor(
              transaction,
              tenantId,
              session.plan_id,
            );
            planNightStartAt = linkedPlan?.night_start_at || null;
          }

          const supplementPayload = parseJson(supplementRow.payload, {});
          const generated = mapSupplementAcceptance({
            sessionId,
            plan: { nightStartAt: planNightStartAt },
            alreadyStartedPlanItemIds,
            supplement: {
              id: supplementRow.id,
              createdAt: supplementRow.created_at,
              payload: supplementPayload,
            },
          });

          const inserted = await insertGeneratedEventRows(transaction, {
            sessionId,
            events: generated,
            timestamp,
          });

          // eventIds names every id the mapping produced for THIS acceptance,
          // whether or not the row insert itself was newly written (a replay
          // of an accept after a partial earlier failure would still see the
          // same deterministic ids already present) — the supplement's own
          // record of what it asserts, matching sessions.test.mjs's worked
          // example ("A supplement lists exactly those identifiers back").
          const eventIds = generated.map((event) => event.eventId);

          // The guard mirrors the earlier explicit already-accepted check for
          // the race between two concurrent decisions on the same supplement:
          // an "accepted" row is never moved by this statement either way.
          const accepted = await transaction.run(
            `UPDATE session_supplements
           SET status = 'accepted', decided_at = ?, event_ids_json = ?
           WHERE id = ? AND session_id = ? AND status <> 'accepted'`,
            [timestamp, JSON.stringify(eventIds), supplementId, sessionId],
          );
          if (!accepted.rowCount) {
            // Lost a race against a concurrent "accept" of the same
            // supplement: the events it also computed are the SAME
            // deterministic ids (idempotent union already absorbed them
            // above), so this call is a replay of whatever that call is
            // about to answer.
            const raced = (
              await transaction.query(
                `SELECT session_supplements.*, device_tokens.label AS device_label
               FROM session_supplements
               LEFT JOIN device_tokens ON device_tokens.id = session_supplements.origin_device_id
               WHERE session_supplements.id = ? AND session_supplements.session_id = ?`,
                [supplementId, sessionId],
              )
            ).rows[0];
            return {
              kind: "ok",
              supplement: supplementResourceForRow(raced, session.plan_id),
              eventsCreated: 0,
              replayed: true,
            };
          }
          if (inserted.accepted.length)
            await transaction.run(
              `UPDATE observation_sessions SET updated_at = ?
             WHERE id = ? AND tenant_id = ?`,
              [
                laterTimestamp(
                  session.updated_at || session.created_at,
                  timestamp,
                ),
                sessionId,
                tenantId,
              ],
            );

          const updated = {
            ...supplementRow,
            status: "accepted",
            decided_at: timestamp,
            event_ids_json: JSON.stringify(eventIds),
          };
          return {
            kind: "ok",
            supplement: supplementResourceForRow(updated, session.plan_id),
            eventsCreated: inserted.accepted.length,
            replayed: false,
          };
        },
      );
      // "session_missing"/"supplement_missing"/"already_accepted" wrote
      // nothing. An accepted supplement adds events to the session.
      if (result?.kind === "ok")
        publishChange({
          tenantId,
          domains: ["debrief", "sessions"],
          originClientInstanceId,
        });
      return result;
    },
  };
}
