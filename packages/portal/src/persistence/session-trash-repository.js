import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";
import { withSerializedSqliteRetry } from "./db-transaction-retry.js";
import { publishChange } from "../api/change-bus.js";
import { audit } from "./plan-project-links.js";
import {
  sessionResourceWithCounts,
  sessionRowById,
} from "./observation-session-repository.js";
import { SESSION_GRACE_DAYS } from "../sessions/session-grace.js";

// "Session" here is always an OBSERVATION session; see the naming note at the
// top of persistence/observation-session-repository.js.

/**
 * The trash of the sessions: the soft deletion of a
 * session, its restoration, its erasure (at once, or by the maintenance once
 * `SESSION_GRACE_DAYS` days have passed). Reads of the deleted sessions as
 * Journal lines are `journal-repository.js#deletedList`; the erasure of the
 * captures (their files included) is the caller's, handed in as
 * `removeCapture`, because the files are not this layer's.
 *
 * A deleted session reads as absent everywhere (`sessionRowById` filters it);
 * only the functions here say `includeDeleted`. It keeps its `plan_id`, its
 * events and its captures untouched until the erasure: the plan it came from
 * is never written by a deletion.
 */

const later = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

/** The instant before which a session deleted is past its grace at `at`. */
export function graceCutoff(at) {
  return new Date(
    Date.parse(at) - SESSION_GRACE_DAYS * DAY_MILLISECONDS,
  ).toISOString();
}

export async function createSessionTrashRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
  // What a composition keeps about a night beyond the core's tables
  // (`sessions.erasure`): `footprint(executor, { tenantId, sessionId })`
  // resolves to the counts it adds, `erase(transaction, …)` deletes its rows.
  complement = null,
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);

  async function countOf(executor, sql, params) {
    return Number((await executor.query(sql, params)).rows[0]?.count || 0);
  }

  /** What the erasure of a session takes with it, counted. */
  async function footprintOf(executor, { tenantId, sessionId }) {
    const [
      events,
      supplements,
      analyses,
      steps,
      packageImports,
      integrations,
      captures,
      added,
    ] = await Promise.all([
      countOf(
        executor,
        "SELECT COUNT(*) AS count FROM session_events WHERE session_id = ?",
        [sessionId],
      ),
      countOf(
        executor,
        "SELECT COUNT(*) AS count FROM session_supplements WHERE session_id = ?",
        [sessionId],
      ),
      countOf(
        executor,
        "SELECT COUNT(*) AS count FROM session_analyses WHERE tenant_id = ? AND session_id = ?",
        [tenantId, sessionId],
      ),
      countOf(
        executor,
        "SELECT COUNT(*) AS count FROM acquisition_steps WHERE tenant_id = ? AND session_id = ?",
        [tenantId, sessionId],
      ),
      countOf(
        executor,
        "SELECT COUNT(*) AS count FROM session_package_imports WHERE tenant_id = ? AND session_id = ?",
        [tenantId, sessionId],
      ),
      countOf(
        executor,
        "SELECT COUNT(*) AS count FROM project_integrations WHERE tenant_id = ? AND night_id = ?",
        [tenantId, sessionId],
      ),
      countOf(
        executor,
        "SELECT COUNT(*) AS count FROM captures WHERE tenant_id = ? AND session_id = ?",
        [tenantId, sessionId],
      ),
      complement?.footprint?.(executor, { tenantId, sessionId }),
    ]);
    return {
      events,
      supplements,
      analyses,
      steps,
      packageImports,
      // The contract's count of the device journal's lines: `0` without a
      // composition that keeps any.
      deviceJournalLines: 0,
      integrations,
      captures,
      ...added,
    };
  }

  /** The rows of a session, the session last (the foreign keys). */
  async function eraseRows(transaction, { tenantId, sessionId }) {
    await transaction.run("DELETE FROM session_events WHERE session_id = ?", [
      sessionId,
    ]);
    await transaction.run(
      "DELETE FROM session_supplements WHERE session_id = ?",
      [sessionId],
    );
    await transaction.run(
      "DELETE FROM session_analyses WHERE tenant_id = ? AND session_id = ?",
      [tenantId, sessionId],
    );
    await transaction.run(
      "DELETE FROM acquisition_steps WHERE tenant_id = ? AND session_id = ?",
      [tenantId, sessionId],
    );
    await transaction.run(
      "DELETE FROM session_package_imports WHERE tenant_id = ? AND session_id = ?",
      [tenantId, sessionId],
    );
    // The uploads of its captures are done (the captures went first); one
    // still in progress keeps its part file and loses only its night.
    await transaction.run(
      "DELETE FROM upload_sessions WHERE tenant_id = ? AND session_id = ? AND state <> 'in_progress'",
      [tenantId, sessionId],
    );
    await transaction.run(
      "UPDATE upload_sessions SET session_id = NULL WHERE tenant_id = ? AND session_id = ?",
      [tenantId, sessionId],
    );
    await complement?.erase?.(transaction, { tenantId, sessionId });
    await transaction.run(
      "DELETE FROM project_integrations WHERE tenant_id = ? AND night_id = ?",
      [tenantId, sessionId],
    );
    // A sky measure derived from the night keeps its value for the place;
    // only the link to the erased night goes.
    await transaction.run(
      "UPDATE place_sky_measures SET session_id = NULL WHERE tenant_id = ? AND session_id = ?",
      [tenantId, sessionId],
    );
    await transaction.run(
      "DELETE FROM observation_sessions WHERE id = ? AND tenant_id = ?",
      [sessionId, tenantId],
    );
  }

  return {
    async close() {
      if (ownsDriver) await db.close();
    },

    /**
     * `DELETE /v1/sessions/{id}`. `{ kind: "missing" }`, `{ kind:
     * "not_finished" }` (a night in progress is not deleted) or `{ kind:
     * "ok", session, deleted }`: `deleted` is false for a replay (the
     * session was already deleted, nothing moves).
     */
    async softDelete({
      tenantId,
      userId = null,
      sessionId,
      originClientInstanceId = null,
      timestamp = new Date().toISOString(),
    }) {
      const result = await withSerializedSqliteRetry(
        db,
        async (transaction) => {
          const row = await sessionRowById(transaction, {
            tenantId,
            sessionId,
            includeDeleted: true,
          });
          if (!row) return { kind: "missing" };
          if (row.deleted_at)
            return {
              kind: "ok",
              deleted: false,
              session: await sessionResourceWithCounts(transaction, row),
            };
          if (row.status !== "finished") return { kind: "not_finished" };
          await transaction.run(
            `UPDATE observation_sessions SET deleted_at = ?, updated_at = ?
             WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
            [
              timestamp,
              later(row.updated_at || row.created_at, timestamp),
              sessionId,
              tenantId,
            ],
          );
          await audit(transaction, {
            tenantId,
            userId,
            eventType: "session.deleted",
            details: { sessionId, planId: row.plan_id ?? null },
            at: timestamp,
          });
          return {
            kind: "ok",
            deleted: true,
            session: await sessionResourceWithCounts(
              transaction,
              await sessionRowById(transaction, {
                tenantId,
                sessionId,
                includeDeleted: true,
              }),
            ),
          };
        },
      );
      if (result.kind === "ok" && result.deleted)
        publishChange({
          tenantId,
          domains: ["sessions"],
          originClientInstanceId,
        });
      return result;
    },

    /**
     * `POST /v1/sessions/{id}/restore`. `{ kind: "missing" }`, `{ kind:
     * "plan_taken", sessionId }` (the plan has another session since: a
     * plan holds one), or `{ kind: "ok", session, restored }`: a session
     * that was not deleted is returned as it is (`restored` false).
     */
    async restore({
      tenantId,
      userId = null,
      sessionId,
      originClientInstanceId = null,
      timestamp = new Date().toISOString(),
    }) {
      let capturesMoved = false;
      const result = await withSerializedSqliteRetry(
        db,
        async (transaction) => {
          const row = await sessionRowById(transaction, {
            tenantId,
            sessionId,
            includeDeleted: true,
          });
          if (!row) return { kind: "missing" };
          if (!row.deleted_at)
            return {
              kind: "ok",
              restored: false,
              session: await sessionResourceWithCounts(transaction, row),
            };
          if (row.plan_id) {
            const holder = (
              await transaction.query(
                `SELECT id FROM observation_sessions
                 WHERE tenant_id = ? AND plan_id = ? AND deleted_at IS NULL`,
                [tenantId, row.plan_id],
              )
            ).rows[0];
            if (holder) return { kind: "plan_taken", sessionId: holder.id };
          }
          await transaction.run(
            `UPDATE observation_sessions SET deleted_at = NULL, updated_at = ?
             WHERE id = ? AND tenant_id = ?`,
            [
              later(row.updated_at || row.created_at, timestamp),
              sessionId,
              tenantId,
            ],
          );
          // The captures masked for the 30
          // days come back to the devices that read `GET /v1/captures?since=`.
          // That cursor reads the later of `created_at` and `restored_at`
          // (migration 88): the restoration is the instant they are added to
          // the space again, and the date they were added (`created_at`) is
          // not touched. Forward only; a capture of the session without an
          // image stays as it is (the lists do not show it).
          const moved = await transaction.run(
            `UPDATE captures SET restored_at = ?
             WHERE tenant_id = ? AND session_id = ? AND sha256 IS NOT NULL
               AND (restored_at IS NULL OR restored_at < ?)
               AND created_at < ?`,
            [timestamp, tenantId, sessionId, timestamp, timestamp],
          );
          capturesMoved = moved.rowCount > 0;
          await audit(transaction, {
            tenantId,
            userId,
            eventType: "session.restored",
            details: { sessionId, planId: row.plan_id ?? null },
            at: timestamp,
          });
          return {
            kind: "ok",
            restored: true,
            session: await sessionResourceWithCounts(
              transaction,
              await sessionRowById(transaction, { tenantId, sessionId }),
            ),
          };
        },
      );
      if (result.kind === "ok" && result.restored)
        publishChange({
          tenantId,
          domains: capturesMoved ? ["sessions", "captures"] : ["sessions"],
          originClientInstanceId,
        });
      return result;
    },

    /**
     * The first half of an erasure: the deleted session, what the erasure
     * would take (counted), and the ids of the captures to remove first.
     * `{ kind: "missing" }`, `{ kind: "not_deleted" }` or `{ kind: "ok",
     * footprint, captureIds }`.
     */
    async prepareErasure({ tenantId, sessionId }) {
      const row = await sessionRowById(db, {
        tenantId,
        sessionId,
        includeDeleted: true,
      });
      if (!row) return { kind: "missing" };
      if (!row.deleted_at) return { kind: "not_deleted" };
      const captureIds = (
        await db.query(
          "SELECT id FROM captures WHERE tenant_id = ? AND session_id = ? ORDER BY created_at, id",
          [tenantId, sessionId],
        )
      ).rows.map((capture) => capture.id);
      return {
        kind: "ok",
        footprint: await footprintOf(db, { tenantId, sessionId }),
        captureIds,
      };
    },

    /**
     * The second half: the rows of the session and the session, once its
     * captures are gone. Only a deleted session is erased. Answers `{ kind:
     * "ok", footprint }` (counted before the erasure) or `{ kind: "missing"
     * | "not_deleted" }`.
     */
    async eraseDeleted({
      tenantId,
      userId = null,
      sessionId,
      timestamp = new Date().toISOString(),
    }) {
      const result = await withSerializedSqliteRetry(
        db,
        async (transaction) => {
          const row = await sessionRowById(transaction, {
            tenantId,
            sessionId,
            includeDeleted: true,
          });
          if (!row) return { kind: "missing" };
          if (!row.deleted_at) return { kind: "not_deleted" };
          const footprint = await footprintOf(transaction, {
            tenantId,
            sessionId,
          });
          await eraseRows(transaction, { tenantId, sessionId });
          await audit(transaction, {
            tenantId,
            userId,
            eventType: "session.erased",
            details: { sessionId, planId: row.plan_id ?? null, footprint },
            at: timestamp,
          });
          return { kind: "ok", footprint };
        },
      );
      if (result.kind === "ok")
        publishChange({
          tenantId,
          domains: ["sessions", "projects", "captures"],
        });
      return result;
    },

    /** The deleted sessions past their grace at `at`: `[{ tenantId, sessionId }]`. */
    async expired({ at = new Date().toISOString(), limit = 200 } = {}) {
      return (
        await db.query(
          `SELECT id, tenant_id FROM observation_sessions
           WHERE deleted_at IS NOT NULL AND deleted_at <= ?
           ORDER BY deleted_at, id LIMIT ?`,
          [graceCutoff(at), limit],
        )
      ).rows.map((row) => ({ tenantId: row.tenant_id, sessionId: row.id }));
    },
  };
}
