import { createHash, randomUUID } from "node:crypto";
import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";
import { canonicalJson } from "./planner-state-repository.js";
import { countOf, spaceLimit } from "./space-limits.js";
import { publishChange } from "../api/change-bus.js";
import {
  effectiveEventResources,
  parseLayer,
} from "../journal/session-rework-layer.js";
import {
  derivedFieldsForRows,
  derivedFieldsOf,
  planRowsById,
} from "./session-derived.js";
import { purgeAtOf } from "../sessions/session-grace.js";

// "Session" in this file is always an OBSERVATION session
// (packages/astro-contracts/schemas/api/v1.md, "Observation sessions and
// debriefing"): the append-only record of a night, stored in
// `observation_sessions`/`session_events`/`session_supplements` (migrations
// 17 and 19). It is a different resource from the browser's cookie
// authentication session (the `sessions` table migration 1 created, still
// read by authentication-repository.js) — hence every export here is named
// observationSession... / ...ObservationSession... rather than plain
// "session", the collision this contract explicitly calls out.

const now = () => new Date().toISOString();

function parseJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * ISO-8601 UTC instants with fixed millisecond precision and a "Z" suffix —
 * every timestamp this file writes or reads — sort lexicographically exactly
 * as they sort chronologically, so a plain string comparison is enough for
 * the "latest of creation/finish/newest event" high-water mark
 * (api/v1.md, "Clocks, ordering and pagination").
 */
function laterTimestamp(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Whether the instant `a` is strictly before `b`, both ISO-8601 — compared
 * as instants (a device may send microseconds, the service writes
 * milliseconds), never as strings. A missing side is never "before".
 */
function instantBefore(a, b) {
  if (!a || !b) return false;
  return Date.parse(a) < Date.parse(b);
}

/** A package-level error that route adapters map to the v1 error envelope. */
export class ObservationSessionStoreError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "ObservationSessionStoreError";
    this.code = code;
    this.status = status;
    Object.assign(this, details);
  }
}

// Exported: shared with debrief-repository.js, which reads/writes the
// SAME observation_sessions/session_events/ session_supplements rows
// from its own single transaction and must not diverge from this
// module's own reading of them.
export const SESSION_ORIGINS = Object.freeze([
  "execution",
  "debrief",
  "import",
  "astro-sync",
  "capture",
]);

/**
 * The domains a session write announces: the session's own, and the plans'
 * when the session belongs to a plan — a plan whose night is open, paused or
 * over says so in the plan read (`executionState`), so a page or a phone
 * that follows the plans must read them again.
 */
function sessionDomains(planId) {
  return planId ? ["plans", "sessions"] : ["sessions"];
}

/**
 * The session resource (`session.schema.json`, `resource`). `derived` is
 * what the service works out when it answers (`session-derived.js`):
 * `outcome`, `projectId` and `eveningDate`. `origin` is the column (NULL
 * reads `execution`), `reworkRevision` and `reworkedAt` the rework's.
 */
export function sessionResourceForRow(row, derived) {
  const { outcome, projectId, eveningDate } = derived ?? derivedFieldsOf(row);
  return {
    id: row.id,
    planId: row.plan_id || null,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    clientSessionId: row.client_session_id || null,
    // Additive: only when given, so that a session of a single plan reads
    // exactly as before.
    ...(row.execution_id ? { executionId: row.execution_id } : {}),
    ...(row.piloting ? { piloting: row.piloting } : {}),
    // Additive: how the night was closed, only when the phone said it --
    // absent reads « unknown » (an earlier session).
    ...(row.closed_by ? { closedBy: row.closed_by } : {}),
    outcome,
    origin: row.origin || "execution",
    projectId,
    eveningDate,
    reworkRevision: Number(row.rework_revision || 0),
    reworkedAt: row.reworked_at || null,
    // Additive: only for a deleted session (the trash and the sync read
    // that asks for the deleted ones); a live session reads exactly as
    // before.
    ...(row.deleted_at
      ? { deletedAt: row.deleted_at, purgeAt: purgeAtOf(row.deleted_at) }
      : {}),
  };
}

export function sessionResourceForRowWithInlineCounts(row, derived) {
  return {
    ...sessionResourceForRow(row, derived),
    eventCount: Number(row.event_count || 0),
    supplementCount: Number(row.supplement_count || 0),
    pendingSupplementCount: Number(row.pending_supplement_count || 0),
  };
}

export function eventResourceForRow(row) {
  return {
    eventId: row.event_id,
    sessionId: row.session_id,
    type: row.type,
    recordedAt: row.recorded_at,
    receivedAt: row.received_at,
    originDeviceId: row.origin_device_id || null,
    // Additive (session-event-ingest.schema.json $defs.timing): absent
    // rather than null for a row this task's routes did not write.
    ...(row.timing ? { timing: row.timing } : {}),
    // Additive (session-event-ingest.schema.json $defs.source): absent for a
    // row no caller wrote.
    ...(row.source ? { source: row.source } : {}),
    payload: parseJson(row.payload, {}),
  };
}

// planId is not a session_supplements column (migration 17): a supplement
// belongs to one session, and the session already names its own plan, so the
// caller passes the session's planId through rather than this table
// duplicating it.
export function supplementResourceForRow(row, planId) {
  return {
    id: row.id,
    sessionId: row.session_id,
    planId: planId || null,
    status: row.status,
    payload: parseJson(row.payload, {}),
    originDeviceId: row.origin_device_id || null,
    deviceLabel: row.device_label || null,
    createdAt: row.created_at,
    // decided_at/event_ids_json are not migration-17/19 columns: this
    // repository does not create or decide supplements on its own ("Late field
    // data: session supplements"), so a row may not have them. Reading them
    // defensively here means the migration that adds the columns needs no
    // matching edit in this reader.
    decidedAt: row.decided_at || null,
    eventIds: row.event_ids_json ? parseJson(row.event_ids_json, []) : [],
  };
}

/**
 * One session row of the space. **A deleted session reads as absent**
 * (every route of a session answers `404 session_not_found` for it)
 * unless the caller is the trash and says `includeDeleted`.
 */
export async function sessionRowById(
  driver,
  { tenantId, sessionId, includeDeleted = false },
) {
  return (
    (
      await driver.query(
        `SELECT * FROM observation_sessions WHERE id = ? AND tenant_id = ?${
          includeDeleted ? "" : " AND deleted_at IS NULL"
        }`,
        [sessionId, tenantId],
      )
    ).rows[0] || null
  );
}

/** The live session of a plan (a plan holds at most one), or `null`. */
export async function sessionRowForPlan(driver, { tenantId, planId }) {
  return (
    (
      await driver.query(
        "SELECT * FROM observation_sessions WHERE tenant_id = ? AND plan_id = ? AND deleted_at IS NULL",
        [tenantId, planId],
      )
    ).rows[0] || null
  );
}

async function sessionRowForClientSessionId(
  driver,
  { tenantId, clientSessionId, lock = false },
) {
  return (
    (
      await driver.query(
        "SELECT * FROM observation_sessions WHERE tenant_id = ? AND client_session_id = ?" +
          (lock && driver.dialect === "postgres" ? " FOR UPDATE" : ""),
        [tenantId, clientSessionId],
      )
    ).rows[0] || null
  );
}

export async function countsForSession(driver, sessionId) {
  const row = (
    await driver.query(
      `SELECT
         (SELECT COUNT(*) FROM session_events WHERE session_id = ?) AS event_count,
         (SELECT COUNT(*) FROM session_supplements WHERE session_id = ?) AS supplement_count,
         (SELECT COUNT(*) FROM session_supplements WHERE session_id = ? AND status = 'proposed') AS pending_supplement_count`,
      [sessionId, sessionId, sessionId],
    )
  ).rows[0];
  return {
    eventCount: Number(row?.event_count || 0),
    supplementCount: Number(row?.supplement_count || 0),
    pendingSupplementCount: Number(row?.pending_supplement_count || 0),
  };
}

/**
 * An execution (`clientSessionId`) whose session was deleted is not made
 * again behind the owner's back: the answer names the deleted session,
 * which the trash restores.
 */
function refuseDeletedExecution(row) {
  if (row?.deleted_at)
    throw new ObservationSessionStoreError(
      "session_deleted",
      "The session of this execution was deleted: restore it from the deleted sessions, or start a new execution.",
      { status: 409, sessionId: row.id },
    );
}

/**
 * A session of the trash brought back by the creation that names its
 * execution again (`reviveDeleted`: a second sending of the same content by
 * Astro Sync, whose `clientSessionId` is derived from it), attached to
 * `planId` — the plan its erased or replaced plan had. Its captures come
 * back to the devices (the rule of `POST /v1/sessions/{id}/restore`), and the
 * audit says so (`session.restored`, `recreated`). Nothing is erased.
 */
async function reviveDeletedSession(
  transaction,
  { tenantId, row, planId, timestamp },
) {
  await transaction.run(
    `UPDATE observation_sessions SET deleted_at = NULL, plan_id = ?,
       updated_at = ? WHERE id = ? AND tenant_id = ?`,
    [planId, laterTimestamp(row.updated_at, timestamp), row.id, tenantId],
  );
  const moved = await transaction.run(
    `UPDATE captures SET restored_at = ?
     WHERE tenant_id = ? AND session_id = ? AND sha256 IS NOT NULL
       AND (restored_at IS NULL OR restored_at < ?)
       AND created_at < ?`,
    [timestamp, tenantId, row.id, timestamp, timestamp],
  );
  await transaction.run(
    "INSERT INTO audit_events (id, tenant_id, user_id, event_type, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      randomUUID(),
      tenantId,
      null,
      "session.restored",
      JSON.stringify({ sessionId: row.id, planId, recreated: true }),
      timestamp,
    ],
  );
  return { capturesMoved: moved.rowCount > 0 };
}

/** The resource of one session row, its derived fields worked out (one plan read). */
export async function sessionResourceFor(driver, row) {
  const plan = row.plan_id
    ? ((await planRowsById(driver, row.tenant_id, [row.plan_id])).get(
        row.plan_id,
      ) ?? null)
    : null;
  return sessionResourceForRow(row, derivedFieldsOf(row, plan));
}

export async function sessionResourceWithCounts(driver, row) {
  const counts = await countsForSession(driver, row.id);
  return { ...(await sessionResourceFor(driver, row)), ...counts };
}

/**
 * One page of a session's events read through its rework: `rawRows` are the
 * log's rows of the page (at most `limit + 1`, ordered by `(received_at,
 * event_id)`, `since` already applied), the events a rework added that fall
 * at or after `since` join them, and the page is cut at `limit`. A session
 * never reworked answers exactly the log, as before. An event a rework
 * replaced is left out unless `includeReplaced`.
 */
export function effectiveEventsPage(
  sessionRow,
  rawRows,
  { limit, since, includeReplaced = false },
) {
  const layer = parseLayer(sessionRow.rework_json);
  const raw = rawRows.map(eventResourceForRow);
  const merged = effectiveEventResources(raw, layer, sessionRow.id, {
    includeReplaced,
  }).filter(
    (event) => !(event.rework?.added && since && event.receivedAt < since),
  );
  // Events the page hid (replaced ones) must not make the last page look final.
  const hasMore = merged.length > limit || rawRows.length > limit;
  const events = merged.length > limit ? merged.slice(0, limit) : merged;
  return {
    events,
    nextSince: events.length ? events[events.length - 1].receivedAt : null,
    hasMore,
  };
}

/**
 * Granular v1 observation-session persistence, on the exact pattern of
 * planner-state-repository.js#createPlanResourceRepository: async, dual
 * SQLite/PostgreSQL, tenant-isolated, one transaction per call. Route
 * adapters (and the framework-free service in
 * packages/portal/src/api/observation-sessions.js) supply an authenticated
 * tenant/device identity and turn returned values/errors into HTTP.
 *
 * Methods, and the exact shapes the debrief queue, the debriefing decision and
 * session supplements can build on:
 *
 * - createSession({ tenantId, planId?, startedAt, clientSessionId?,
 *     origin?, originDeviceId?, timestamp? })
 *     -> { resource, created: boolean }
 *   `planId` present: idempotent on (tenantId, planId) — at most one
 *   session per plan. `planId` absent and `clientSessionId` present:
 *   idempotent on (tenantId, clientSessionId). Neither present: always
 *   creates (a direct session with no idempotency key).
 * - getSessionDetail({ tenantId, sessionId, eventsLimit?, timestamp? })
 *     -> { session, supplements: [...], events: { sessionId, events,
 *          nextSince, hasMore } } | null
 *   Does NOT include the read-through `plan` projection
 *   (api/v1.md, "Equipment on a session"): that needs the plan resource
 *   service/repository, a different table this repository does not own, and
 *   is composed by the caller (observation-sessions.js).
 * - listSessions({ tenantId, since?, limit?, timestamp? })
 *     -> { sessions: [...], nextSince, hasMore }
 *   `since` is inclusive against the resource's own `updatedAt` high-water
 *   mark; `limit` is the caller's responsibility to clamp (this method does
 *   not default or cap it beyond using it as SQL LIMIT).
 * - finishSession({ tenantId, sessionId, finishedAt?, closedBy?, timestamp? })
 *     -> resource | null
 *   Idempotent: a session that already carries finishedAt is returned
 *   unchanged (status/finishedAt/updatedAt untouched). A `finishedAt`
 *   older than the session's `reopened_at` is a stale replay (a reopen
 *   came later) and changes nothing either.
 *   `closedBy` (`automatic` | `manual`, validated by the caller) is written
 *   with the finish, and only then -- a replay never moves it; a reopen
 *   clears it (the night resumed).
 * - reopenSession({ tenantId, sessionId, reopenedAt?, timestamp? })
 *     -> resource | null
 *   « Reprendre la nuit »: clears `finished_at`, sets `status` open
 *   and records `reopened_at`. Idempotent on a session that is not
 *   finished; a `reopenedAt` older than the recorded `finished_at` (a later
 *   stop already won) changes nothing; refused with 409
 *   `session_debriefed` when the session's plan is frozen.
 * - ingestEvents({ tenantId, sessionId, originDeviceId?, source?, events, timestamp? })
 *     -> { accepted: [eventId...], duplicate: [eventId...], receivedAt,
 *          resource } | null
 *   `events` must already be schema-valid and free of batch-local duplicate
 *   eventIds (packages/portal/src/session-events/registry.js +
 *   packages/portal/src/api/observation-sessions.js own that
 *   classification); this method only resolves DB-level duplicates — an
 *   existing (session_id, event_id) row is left untouched — and performs
 *   the actual insert, in one transaction. Every stored event's `timing` is
 *   'observed': this method is reached only from
 *   POST /v1/sessions/{id}/events, whose events are always something a
 *   person or a device measured. A future caller writing generated events
 *   (a debrief, an accepted supplement) needs its own insert path carrying
 *   'planned'/'reconstructed', not this one.
 * - listEvents({ tenantId, sessionId, since?, limit?, timestamp? })
 *     -> { sessionId, events: [...], nextSince, hasMore } | null
 *   `since` is inclusive against `receivedAt`; ordered by (receivedAt,
 *   eventId).
 */
export async function createObservationSessionRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);

  return {
    async close() {
      if (ownsDriver) await db.close();
    },

    async createSession({
      tenantId,
      planId = null,
      startedAt,
      clientSessionId = null,
      executionId = null,
      piloting = null,
      origin = "execution",
      originDeviceId = null,
      originClientInstanceId = null,
      reviveDeleted = false,
      timestamp = now(),
    }) {
      const result = await db.transaction(async (transaction) => {
        // Serialize plan and client-session keys together, including a direct
        // execution receiving its first plan while another device retries.
        if (transaction.dialect === "postgres")
          await transaction.query(
            "SELECT id FROM organizations WHERE id = ? FOR UPDATE",
            [tenantId],
          );
        if (planId) {
          const plan = (
            await transaction.query(
              "SELECT id FROM plans WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
              [planId, tenantId],
            )
          ).rows[0];
          if (!plan)
            throw new ObservationSessionStoreError(
              "plan_not_found",
              "The plan was not found.",
              { status: 404 },
            );
          const existing = await sessionRowForPlan(transaction, {
            tenantId,
            planId,
          });
          const source = clientSessionId
            ? await sessionRowForClientSessionId(transaction, {
                tenantId,
                clientSessionId,
                lock: true,
              })
            : null;
          if (
            reviveDeleted &&
            source?.deleted_at &&
            !existing &&
            (!source.plan_id || source.plan_id === planId)
          ) {
            const revived = await reviveDeletedSession(transaction, {
              tenantId,
              row: source,
              planId,
              timestamp,
            });
            return {
              resource: await sessionResourceWithCounts(
                transaction,
                await sessionRowById(transaction, {
                  tenantId,
                  sessionId: source.id,
                }),
              ),
              created: false,
              revived: true,
              ...revived,
            };
          }
          refuseDeletedExecution(source);
          if (source && source.plan_id && source.plan_id !== planId)
            throw new ObservationSessionStoreError(
              "session_plan_conflict",
              "This execution already belongs to another plan.",
              { status: 409 },
            );
          if (source && existing && source.id !== existing.id)
            throw new ObservationSessionStoreError(
              "session_plan_conflict",
              "This plan already has another execution.",
              { status: 409 },
            );
          if (source && !source.plan_id) {
            if (source.status !== "open" && source.status !== "paused")
              throw new ObservationSessionStoreError(
                "session_closed",
                "A finished execution cannot receive a plan.",
                { status: 409 },
              );
            await transaction.run(
              "UPDATE observation_sessions SET plan_id = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND plan_id IS NULL",
              [
                planId,
                laterTimestamp(source.updated_at, timestamp),
                source.id,
                tenantId,
              ],
            );
            return {
              resource: await sessionResourceWithCounts(
                transaction,
                await sessionRowById(transaction, {
                  tenantId,
                  sessionId: source.id,
                }),
              ),
              created: false,
              promoted: true,
            };
          }
          if (existing)
            return {
              resource: await sessionResourceWithCounts(transaction, existing),
              created: false,
            };
        } else if (clientSessionId) {
          const existing = await sessionRowForClientSessionId(transaction, {
            tenantId,
            clientSessionId,
          });
          refuseDeletedExecution(existing);
          if (existing)
            return {
              resource: await sessionResourceWithCounts(transaction, existing),
              created: false,
            };
        }

        // A technical ceiling per space; a replay of an existing session
        // above never reaches it.
        const sessionLimit = spaceLimit("sessionsPerSpace");
        if (
          (await countOf(
            transaction,
            "SELECT COUNT(*) AS count FROM observation_sessions WHERE tenant_id = ?",
            [tenantId],
          )) >= sessionLimit
        )
          throw new ObservationSessionStoreError(
            "session_limit_reached",
            `This space already holds ${sessionLimit} observation sessions.`,
            { status: 409 },
          );

        const id = randomUUID();
        try {
          await transaction.run(
            `INSERT INTO observation_sessions
               (id, tenant_id, plan_id, client_session_id, started_at, status, created_at, updated_at, execution_id, piloting, origin)
             VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
            [
              id,
              tenantId,
              planId,
              clientSessionId,
              startedAt,
              timestamp,
              timestamp,
              executionId,
              piloting,
              origin,
            ],
          );
        } catch (error) {
          // A race with a concurrent create of the same idempotency key: the
          // unique index (migration 19) is the real guard, this is the
          // idempotent-union fallback the doctrine's rule 1 asks for.
          const raced = planId
            ? await sessionRowForPlan(transaction, { tenantId, planId })
            : clientSessionId
              ? await sessionRowForClientSessionId(transaction, {
                  tenantId,
                  clientSessionId,
                })
              : null;
          if (raced)
            return {
              resource: await sessionResourceWithCounts(transaction, raced),
              created: false,
            };
          throw error;
        }
        const created = await sessionRowById(transaction, {
          tenantId,
          sessionId: id,
        });
        return {
          resource: await sessionResourceWithCounts(transaction, created),
          created: true,
        };
      });
      // An idempotent replay (an existing session for this plan/client id)
      // wrote nothing new: no signal for it.
      if (result.created || result.promoted || result.revived)
        publishChange({
          tenantId,
          domains: [
            ...sessionDomains(result.resource.planId),
            ...(result.capturesMoved ? ["captures"] : []),
          ],
          originClientInstanceId,
        });
      const { capturesMoved: _capturesMoved, ...answer } = result;
      return answer;
    },

    async getSessionDetail({
      tenantId,
      sessionId,
      eventsLimit = 50,
      includeReplaced = false,
      timestamp = now(),
    }) {
      return await db.transaction(async (transaction) => {
        const row = await sessionRowById(transaction, { tenantId, sessionId });
        if (!row) return null;
        const counts = await countsForSession(transaction, sessionId);
        const supplementRows = (
          await transaction.query(
            `SELECT session_supplements.*, device_tokens.label AS device_label
             FROM session_supplements
             LEFT JOIN device_tokens ON device_tokens.id = session_supplements.origin_device_id
             WHERE session_supplements.session_id = ?
             ORDER BY session_supplements.created_at, session_supplements.id`,
            [sessionId],
          )
        ).rows;
        const eventRows = (
          await transaction.query(
            `SELECT * FROM session_events WHERE session_id = ?
             ORDER BY received_at, event_id LIMIT ?`,
            [sessionId, eventsLimit + 1],
          )
        ).rows;
        // The log read through the correction layer of the rework: the
        // events a rework added join the page in order.
        const page = effectiveEventsPage(row, eventRows, {
          limit: eventsLimit,
          since: null,
          includeReplaced,
        });
        return {
          session: {
            ...(await sessionResourceFor(transaction, row)),
            ...counts,
          },
          supplements: supplementRows.map((supplementRow) =>
            supplementResourceForRow(supplementRow, row.plan_id),
          ),
          events: {
            sessionId,
            events: page.events,
            nextSince: page.nextSince,
            hasMore: page.hasMore,
          },
        };
      });
    },

    /**
     * `GET /v1/sessions`, the sync read. `deleted`: `exclude` (the default:
     * a deleted session is absent), `include` (the deleted ones too, with
     * their `deletedAt`: how a device learns a deletion) or `only`.
     */
    async listSessions({
      tenantId,
      since = null,
      limit = 50,
      deleted = "exclude",
      timestamp = now(),
    }) {
      return await db.transaction(async (transaction) => {
        const clauses = ["tenant_id = ?"];
        const params = [tenantId];
        if (deleted === "exclude") clauses.push("deleted_at IS NULL");
        else if (deleted === "only") clauses.push("deleted_at IS NOT NULL");
        if (since) {
          clauses.push("COALESCE(updated_at, created_at) >= ?");
          params.push(since);
        }
        const rows = (
          await transaction.query(
            `SELECT observation_sessions.*,
               (SELECT COUNT(*) FROM session_events WHERE session_events.session_id = observation_sessions.id) AS event_count,
               (SELECT COUNT(*) FROM session_supplements WHERE session_supplements.session_id = observation_sessions.id) AS supplement_count,
               (SELECT COUNT(*) FROM session_supplements WHERE session_supplements.session_id = observation_sessions.id AND session_supplements.status = 'proposed') AS pending_supplement_count
             FROM observation_sessions
             WHERE ${clauses.join(" AND ")}
             ORDER BY COALESCE(updated_at, created_at), id
             LIMIT ?`,
            [...params, limit + 1],
          )
        ).rows;
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const derived = await derivedFieldsForRows(transaction, tenantId, page);
        return {
          sessions: page.map((row) =>
            sessionResourceForRowWithInlineCounts(row, derived.get(row.id)),
          ),
          nextSince: page.length
            ? page[page.length - 1].updated_at ||
              page[page.length - 1].created_at
            : null,
          hasMore,
        };
      });
    },

    async finishSession({
      tenantId,
      sessionId,
      finishedAt = null,
      closedBy = null,
      originClientInstanceId = null,
      timestamp = now(),
    }) {
      let didFinish = false;
      const result = await db.transaction(async (transaction) => {
        const current = await sessionRowById(transaction, {
          tenantId,
          sessionId,
        });
        if (!current) return null;
        if (current.finished_at)
          return await sessionResourceWithCounts(transaction, current);
        const resolvedFinishedAt = finishedAt || timestamp;
        // A finish older than the latest reopen is a stale replay —
        // the person resumed the night after that stop.
        if (instantBefore(resolvedFinishedAt, current.reopened_at))
          return await sessionResourceWithCounts(transaction, current);
        const nextUpdatedAt = laterTimestamp(
          current.updated_at || current.created_at,
          resolvedFinishedAt,
        );
        await transaction.run(
          `UPDATE observation_sessions SET finished_at = ?, status = 'finished', updated_at = ?, closed_by = ?
           WHERE id = ? AND tenant_id = ? AND finished_at IS NULL`,
          [resolvedFinishedAt, nextUpdatedAt, closedBy, sessionId, tenantId],
        );
        const updated = await sessionRowById(transaction, {
          tenantId,
          sessionId,
        });
        didFinish = true;
        return await sessionResourceWithCounts(transaction, updated);
      });
      // A session already finished (replay) or missing writes nothing new.
      if (didFinish)
        publishChange({
          tenantId,
          domains: sessionDomains(result?.planId),
          originClientInstanceId,
        });
      return result;
    },

    async reopenSession({
      tenantId,
      sessionId,
      reopenedAt = null,
      originClientInstanceId = null,
      timestamp = now(),
    }) {
      let didReopen = false;
      const result = await db.transaction(async (transaction) => {
        const current = await sessionRowById(transaction, {
          tenantId,
          sessionId,
        });
        if (!current) return null;
        if (current.plan_id) {
          const plan = (
            await transaction.query(
              "SELECT frozen_at FROM plans WHERE id = ? AND tenant_id = ?",
              [current.plan_id, tenantId],
            )
          ).rows[0];
          if (plan?.frozen_at)
            throw new ObservationSessionStoreError(
              "session_debriefed",
              "The night of this session is debriefed; it cannot be resumed.",
              { status: 409 },
            );
        }
        const resolvedReopenedAt = reopenedAt || timestamp;
        if (!current.finished_at) {
          // Not finished (a replay, or a reopen that reached the service
          // before the finish it undoes, which then never comes): the
          // session stays as it is, but the instant is kept so that a stale
          // finish replayed later by another device changes nothing.
          // Only an instant the device gave: the service's own clock is
          // not the device's, and must never outrank the device's next stop.
          if (
            reopenedAt &&
            (!current.reopened_at ||
              instantBefore(current.reopened_at, reopenedAt))
          )
            await transaction.run(
              "UPDATE observation_sessions SET reopened_at = ? WHERE id = ? AND tenant_id = ?",
              [reopenedAt, sessionId, tenantId],
            );
          return await sessionResourceWithCounts(transaction, current);
        }
        // A later stop is already recorded: this reopen is a stale replay.
        if (instantBefore(resolvedReopenedAt, current.finished_at))
          return await sessionResourceWithCounts(transaction, current);
        const nextUpdatedAt = laterTimestamp(
          current.updated_at || current.created_at,
          timestamp,
        );
        await transaction.run(
          `UPDATE observation_sessions
           SET finished_at = NULL, status = 'open', closed_by = NULL, reopened_at = ?, updated_at = ?
           WHERE id = ? AND tenant_id = ? AND finished_at IS NOT NULL`,
          [resolvedReopenedAt, nextUpdatedAt, sessionId, tenantId],
        );
        didReopen = true;
        return await sessionResourceWithCounts(
          transaction,
          await sessionRowById(transaction, { tenantId, sessionId }),
        );
      });
      if (didReopen)
        publishChange({
          tenantId,
          domains: sessionDomains(result?.planId),
          originClientInstanceId,
        });
      return result;
    },

    /**
     * The mode of a session that lives (the
     * person changed the piloting of the night in « Nuit en cours » — free,
     * assisted, mount, smart telescope — after the session was created.
     * `piloting` is already validated. The same value again changes nothing
     * (no `updatedAt` bump, no change published); otherwise the row is
     * written, `updated_at` moves so that every other device reads it, and
     * the change is published. A deleted session reads as absent.
     */
    async setSessionPiloting({
      tenantId,
      sessionId,
      piloting,
      originClientInstanceId = null,
      timestamp = now(),
    }) {
      let changed = false;
      const result = await db.transaction(async (transaction) => {
        const current = await sessionRowById(transaction, {
          tenantId,
          sessionId,
        });
        if (!current) return null;
        if ((current.piloting || null) === piloting)
          return await sessionResourceWithCounts(transaction, current);
        const nextUpdatedAt = laterTimestamp(
          current.updated_at || current.created_at,
          timestamp,
        );
        await transaction.run(
          "UPDATE observation_sessions SET piloting = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
          [piloting, nextUpdatedAt, sessionId, tenantId],
        );
        changed = true;
        return await sessionResourceWithCounts(
          transaction,
          await sessionRowById(transaction, { tenantId, sessionId }),
        );
      });
      if (changed)
        publishChange({
          tenantId,
          domains: ["sessions"],
          originClientInstanceId,
        });
      return result;
    },

    async ingestEvents({
      tenantId,
      sessionId,
      originDeviceId = null,
      source = null,
      originClientInstanceId = null,
      events,
      timestamp = now(),
    }) {
      const result = await db.transaction(async (transaction) => {
        const session = await sessionRowById(transaction, {
          tenantId,
          sessionId,
        });
        if (!session) return null;
        if (!events.length)
          return {
            accepted: [],
            duplicate: [],
            receivedAt: timestamp,
            resource: await sessionResourceWithCounts(transaction, session),
          };

        const ids = events.map((event) => event.eventId);
        const existingRows = (
          await transaction.query(
            `SELECT event_id FROM session_events WHERE session_id = ? AND event_id IN (${ids
              .map(() => "?")
              .join(",")})`,
            [sessionId, ...ids],
          )
        ).rows;
        const existing = new Set(existingRows.map((row) => row.event_id));
        const accepted = [];
        const duplicate = [];
        for (const event of events)
          (existing.has(event.eventId) ? duplicate : accepted).push(event);
        // A technical ceiling per session: the whole batch is refused,
        // nothing written, when its new events would carry the session past
        // it.
        const eventLimit = spaceLimit("eventsPerSession");
        if (
          accepted.length &&
          (await countOf(
            transaction,
            "SELECT COUNT(*) AS count FROM session_events WHERE session_id = ?",
            [sessionId],
          )) +
            accepted.length >
            eventLimit
        )
          throw new ObservationSessionStoreError(
            "session_event_limit_reached",
            `A session holds at most ${eventLimit} events.`,
            { status: 409 },
          );

        const acceptedIds = [];
        for (const event of accepted) {
          await transaction.run(
            `INSERT INTO session_events
               (event_id, session_id, type, payload, recorded_at, received_at, origin_device_id, timing, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'observed', ?)
             ON CONFLICT (session_id, event_id) DO NOTHING`,
            [
              event.eventId,
              sessionId,
              event.type,
              JSON.stringify(event.payload),
              event.recordedAt,
              timestamp,
              originDeviceId,
              source,
            ],
          );
          acceptedIds.push(event.eventId);
        }

        let sessionRow = session;
        if (acceptedIds.length) {
          const nextUpdatedAt = laterTimestamp(
            session.updated_at || session.created_at,
            timestamp,
          );
          await transaction.run(
            "UPDATE observation_sessions SET updated_at = ? WHERE id = ? AND tenant_id = ?",
            [nextUpdatedAt, sessionId, tenantId],
          );
          sessionRow = await sessionRowById(transaction, {
            tenantId,
            sessionId,
          });
        }
        return {
          accepted: acceptedIds,
          duplicate: duplicate.map((event) => event.eventId),
          receivedAt: timestamp,
          resource: await sessionResourceWithCounts(transaction, sessionRow),
        };
      });
      // Only new events (never an all-duplicate or empty batch) are a
      // domain write worth a signal.
      if (result?.accepted?.length)
        publishChange({
          tenantId,
          // A pause or a resume changes what the plan says of its night.
          domains: sessionDomains(
            events.some(
              (event) =>
                (event.type === "pause" || event.type === "resume") &&
                result.accepted.includes(event.eventId),
            )
              ? result.resource.planId
              : null,
          ),
          originClientInstanceId,
        });
      return result;
    },

    async listEvents({
      tenantId,
      sessionId,
      since = null,
      limit = 50,
      includeReplaced = false,
      timestamp = now(),
    }) {
      return await db.transaction(async (transaction) => {
        const session = await sessionRowById(transaction, {
          tenantId,
          sessionId,
        });
        if (!session) return null;
        const clauses = ["session_id = ?"];
        const params = [sessionId];
        if (since) {
          clauses.push("received_at >= ?");
          params.push(since);
        }
        const rows = (
          await transaction.query(
            `SELECT * FROM session_events WHERE ${clauses.join(" AND ")}
             ORDER BY received_at, event_id LIMIT ?`,
            [...params, limit + 1],
          )
        ).rows;
        const page = effectiveEventsPage(session, rows, {
          limit,
          since,
          includeReplaced,
        });
        return {
          sessionId,
          events: page.events,
          nextSince: page.nextSince,
          hasMore: page.hasMore,
        };
      });
    },

    /**
     * A PUT to a FROZEN plan that already has a session stores the submitted
     * payload as a `proposed` session_supplements row instead of discarding
     * it (api/v1.md, "Late field data: session supplements"). Returns `null`
     * when the plan has no session at all — the caller (the PUT route) then
     * keeps the bare `plan_frozen` body unchanged.
     *
     * Idempotency key: `(session_id, origin_device_id, payload_fingerprint)`
     * — a SHA-256 of the submitted payload's canonical JSON, scoped by
     * session and by the originating device (migration 20's own unique
     * index). The exact same payload resubmitted by the exact same device
     * collapses onto one row via ON CONFLICT DO NOTHING; a different device,
     * or a payload that differs by even one byte, proposes its own. This is
     * the "most sober" key the task report weighs against two alternatives:
     * a client-supplied idempotency token (no surface generates one for this
     * path, unlike `clientSessionId` for direct sessions) and the raw
     * payload itself as the key (unbounded width; canonical-JSON equality is
     * exactly what a fixed-width fingerprint already gives).
     */
    async proposeSupplementForFrozenPlan({
      tenantId,
      planId,
      originDeviceId = null,
      payload,
      timestamp = now(),
    }) {
      return await db.transaction(async (transaction) => {
        const session = await sessionRowForPlan(transaction, {
          tenantId,
          planId,
        });
        if (!session) return null;
        const fingerprint = createHash("sha256")
          .update(canonicalJson(payload))
          .digest("hex");
        // A technical ceiling per session: past it, a new payload is not
        // kept and the caller answers the plain `plan_frozen` refusal; a
        // replay of a kept one still finds it.
        const replayed = (
          await transaction.query(
            `SELECT id FROM session_supplements
             WHERE session_id = ? AND origin_device_id = ? AND payload_fingerprint = ?`,
            [session.id, originDeviceId, fingerprint],
          )
        ).rows[0];
        if (replayed)
          return { supplementId: replayed.id, sessionId: session.id };
        if (
          (await countOf(
            transaction,
            "SELECT COUNT(*) AS count FROM session_supplements WHERE session_id = ?",
            [session.id],
          )) >= spaceLimit("supplementsPerSession")
        )
          return null;
        const id = randomUUID();
        await transaction.run(
          `INSERT INTO session_supplements
             (id, session_id, origin_device_id, payload, status, payload_fingerprint, created_at)
           VALUES (?, ?, ?, ?, 'proposed', ?, ?)
           ON CONFLICT (session_id, origin_device_id, payload_fingerprint) DO NOTHING`,
          [
            id,
            session.id,
            originDeviceId,
            JSON.stringify(payload),
            fingerprint,
            timestamp,
          ],
        );
        const existing = (
          await transaction.query(
            `SELECT id FROM session_supplements
             WHERE session_id = ? AND origin_device_id = ? AND payload_fingerprint = ?`,
            [session.id, originDeviceId, fingerprint],
          )
        ).rows[0];
        return { supplementId: existing.id, sessionId: session.id };
      });
    },
  };
}

/**
 * Raw insert for SERVER-GENERATED events (a debrief's plan-to-session
 * mapping, an accepted supplement's own mapping) — the write path next to
 * `ingestEvents` the task calls for, which does NOT force `timing:
 * 'observed'` the way `ingestEvents` does (that method is reached only from
 * `POST /v1/sessions/{id}/events`, whose events are always something a
 * person or a device measured). `timing` is read from each event object
 * instead ('planned'/'reconstructed'/'observed', per the mapping rules of
 * api/v1.md's "From a plan to an observation session"), and
 * `origin_device_id` is always NULL: a generated event originates from this
 * mapping, not from a device (api/v1.md's worked example: "originDeviceId:
 * null — they originate from this mapping, not from a device").
 *
 * Takes an already-open `transaction` (or the raw `db`) rather than opening
 * its own, so debrief-repository.js can call it from inside its own single
 * transaction per call — the SQLite driver this project uses refuses a
 * nested `db.transaction()` call, and even on PostgreSQL a second pooled
 * transaction would defeat the point of sharing one atomic write. Returns
 * the eventIds actually inserted (a deterministic id already present in the
 * journal — from an earlier decision, or from this same transaction's own
 * prior statement — is silently skipped, the same idempotent-union rule
 * `ingestEvents` already applies to a client-submitted batch).
 */
export async function insertGeneratedEventRows(
  transaction,
  { sessionId, events, timestamp },
) {
  if (!events.length) return { accepted: [] };
  const ids = events.map((event) => event.eventId);
  const existingRows = (
    await transaction.query(
      `SELECT event_id FROM session_events WHERE session_id = ? AND event_id IN (${ids
        .map(() => "?")
        .join(",")})`,
      [sessionId, ...ids],
    )
  ).rows;
  const existing = new Set(existingRows.map((row) => row.event_id));
  const accepted = [];
  for (const event of events) {
    if (existing.has(event.eventId)) continue;
    await transaction.run(
      `INSERT INTO session_events
         (event_id, session_id, type, payload, recorded_at, received_at, origin_device_id, timing)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT (session_id, event_id) DO NOTHING`,
      [
        event.eventId,
        sessionId,
        event.type,
        JSON.stringify(event.payload),
        event.recordedAt,
        timestamp,
        event.timing,
      ],
    );
    accepted.push(event.eventId);
  }
  return { accepted };
}
