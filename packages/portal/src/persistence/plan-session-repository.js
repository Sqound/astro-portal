import { randomUUID } from "node:crypto";
import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";
import { withSerializedSqliteRetry } from "./db-transaction-retry.js";
import { publishChange } from "../api/change-bus.js";
import { audit } from "./plan-project-links.js";
import {
  DEBRIEF_PLAN_OUTCOMES,
  debriefedStatusOf,
  executionStatesForPlanRows,
  sessionFlagsForPlanRows,
} from "./plan-session-flags.js";
import {
  apiPlanStatus,
  archivePlannerPayload,
  canonicalJson,
  hydratedPayloadVia,
  lockTenantPlans,
  parseJson,
  planRevision,
  planRowFor,
  resourceForPlanRow,
} from "./planner-state-repository.js";
import {
  sessionResourceWithCounts,
  sessionRowById,
  sessionRowForPlan,
} from "./observation-session-repository.js";

/**
 * What the owner does to a plan that is history:
 *
 * - **archive / unarchive a debriefed plan** (D-extra). `PUT /v1/plans/{id}`
 *   writes active plans only, so a plan the service froze (its debriefing
 *   was made) could not be archived from a phone: the archive stayed on the
 *   device. The plan keeps its outcome in `plans.archived_from` while its
 *   `status` reads `archived`; « Rétablir » gives it back. Neither moves the
 *   plan's payload, its debriefing or its session.
 * - **make the session of a plan again**: the plan of a deleted session
 *   stays « exécuté » and says its session is missing; this creates the
 *   session anew from the plan and gives the plan back to the debriefing (it
 *   is no longer frozen, its closure rides in `payload.closedAs` as on a
 *   phone that ran the night, and the new session is « À débriefer »).
 *
 * Neither is held by a right: plan correctness is never held by a right.
 */

const OUTCOME_SET = new Set(DEBRIEF_PLAN_OUTCOMES);

export async function createPlanSessionRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);

  async function resourceOf(executor, tenantId, row) {
    const resource = resourceForPlanRow(row);
    const flags = await sessionFlagsForPlanRows(executor, tenantId, [row]);
    const executions = await executionStatesForPlanRows(executor, tenantId, [
      row,
    ]);
    return {
      ...resource,
      ...(flags.get(row.id) ?? {}),
      ...(executions.get(row.id) ?? {}),
      payload: await hydratedPayloadVia(executor, tenantId, resource.payload),
    };
  }

  /** Moves the status of a plan row by one revision; `null` when it raced. */
  async function moveStatus(
    transaction,
    { tenantId, row, status, archivedAt, archivedFrom, timestamp },
  ) {
    const updated = await transaction.run(
      `UPDATE plans
       SET status = ?, archived_at = ?, archived_from = ?, revision = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ? AND revision = ? AND status = ?`,
      [
        status,
        archivedAt,
        archivedFrom,
        planRevision(row.revision) + 1,
        timestamp,
        row.id,
        tenantId,
        planRevision(row.revision),
        row.status,
      ],
    );
    return updated.rowCount
      ? await planRowFor(transaction, tenantId, row.id)
      : null;
  }

  return {
    async close() {
      if (ownsDriver) await db.close();
    },

    /**
     * `POST /v1/plans/{planId}/archive`: `{ kind: "missing" }`, `{ kind:
     * "not_frozen" }` (an active plan is archived by writing it, `closedAs:
     * "archived"`), `{ kind: "conflict" }` (raced) or `{ kind: "ok",
     * resource, changed }` (`changed` false: already archived).
     */
    async archive({
      tenantId,
      userId = null,
      planId,
      originClientInstanceId = null,
      timestamp = new Date().toISOString(),
    }) {
      const result = await withSerializedSqliteRetry(
        db,
        async (transaction) => {
          await lockTenantPlans(transaction, tenantId);
          const row = await planRowFor(transaction, tenantId, planId);
          if (!row) return { kind: "missing" };
          if (row.status === "archived")
            return {
              kind: "ok",
              changed: false,
              resource: await resourceOf(transaction, tenantId, row),
            };
          if (apiPlanStatus(row.status) === "active")
            return { kind: "not_frozen" };
          const moved = await moveStatus(transaction, {
            tenantId,
            row,
            status: "archived",
            archivedAt: timestamp,
            archivedFrom: OUTCOME_SET.has(row.status) ? row.status : null,
            timestamp,
          });
          if (!moved) return { kind: "conflict" };
          await audit(transaction, {
            tenantId,
            userId,
            eventType: "plan.archived",
            details: { planId, from: row.status },
            at: timestamp,
          });
          return {
            kind: "ok",
            changed: true,
            resource: await resourceOf(transaction, tenantId, moved),
          };
        },
      );
      if (result.kind === "ok" && result.changed)
        publishChange({
          tenantId,
          domains: ["plans"],
          originClientInstanceId,
        });
      return result;
    },

    /**
     * `POST /v1/plans/{planId}/unarchive`: gives an archived plan the status
     * it had (`archived_from`; a plan archived by the web before this had
     * none: `executed` if a debriefing froze it, else active). `{ kind:
     * "missing" | "conflict" }` or `{ kind: "ok", resource, changed }`
     * (`changed` false: not archived).
     */
    async unarchive({
      tenantId,
      userId = null,
      planId,
      originClientInstanceId = null,
      timestamp = new Date().toISOString(),
    }) {
      const result = await withSerializedSqliteRetry(
        db,
        async (transaction) => {
          await lockTenantPlans(transaction, tenantId);
          const row = await planRowFor(transaction, tenantId, planId);
          if (!row) return { kind: "missing" };
          if (row.status !== "archived")
            return {
              kind: "ok",
              changed: false,
              resource: await resourceOf(transaction, tenantId, row),
            };
          const status = OUTCOME_SET.has(row.archived_from)
            ? row.archived_from
            : row.frozen_at
              ? "executed"
              : "pending";
          const moved = await moveStatus(transaction, {
            tenantId,
            row,
            status,
            archivedAt: null,
            archivedFrom: null,
            timestamp,
          });
          if (!moved) return { kind: "conflict" };
          await audit(transaction, {
            tenantId,
            userId,
            eventType: "plan.unarchived",
            details: { planId, to: status },
            at: timestamp,
          });
          return {
            kind: "ok",
            changed: true,
            resource: await resourceOf(transaction, tenantId, moved),
          };
        },
      );
      if (result.kind === "ok" && result.changed)
        publishChange({
          tenantId,
          domains: ["plans"],
          originClientInstanceId,
        });
      return result;
    },

    /**
     * `POST /v1/plans/{planId}/session`: the session of a debriefed plan,
     * made again. `{ kind: "missing" }`; `{ kind: "not_debriefed" }` (the
     * plan was never frozen by a debriefing); `{ kind: "archived" }`
     * (restore the plan first); `{ kind: "session_exists", sessionId }`;
     * `{ kind: "conflict" }`; else `{ kind: "ok", plan, session }`.
     */
    async recreateSession({
      tenantId,
      userId = null,
      planId,
      originClientInstanceId = null,
      timestamp = new Date().toISOString(),
    }) {
      const result = await withSerializedSqliteRetry(
        db,
        async (transaction) => {
          await lockTenantPlans(transaction, tenantId);
          const row = await planRowFor(transaction, tenantId, planId);
          if (!row) return { kind: "missing" };
          if (row.status === "archived") return { kind: "archived" };
          const holder = await sessionRowForPlan(transaction, {
            tenantId,
            planId,
          });
          if (holder) return { kind: "session_exists", sessionId: holder.id };
          const outcome = debriefedStatusOf(row);
          if (!outcome) return { kind: "not_debriefed" };

          // The plan goes back to the debriefing: active, not frozen, its
          // debriefing erased (it lived with the deleted session), and its
          // closure carried by the payload as a phone that ran the night
          // carries it.
          const payload = parseJson(row.payload_json, {}) ?? {};
          const settings = parseJson(row.settings_json, {}) ?? {};
          const nextPayload = { ...payload, closedAs: outcome };
          const nextSettings = { ...settings, closedAs: outcome };
          await archivePlannerPayload(transaction, {
            tenantId,
            plan: row,
            payloadJson: row.payload_json,
            timestamp,
          });
          const updated = await transaction.run(
            `UPDATE plans
             SET status = 'pending', frozen_at = NULL, archived_at = NULL,
                 archived_from = NULL, debrief_targets_json = NULL,
                 debrief_added_targets_json = NULL, debrief_reason = NULL,
                 payload_json = ?, settings_json = ?, revision = ?,
                 updated_at = ?
             WHERE id = ? AND tenant_id = ? AND revision = ? AND status = ?`,
            [
              canonicalJson(nextPayload),
              canonicalJson(nextSettings),
              planRevision(row.revision) + 1,
              timestamp,
              planId,
              tenantId,
              planRevision(row.revision),
              row.status,
            ],
          );
          if (!updated.rowCount) return { kind: "conflict" };

          const sessionId = randomUUID();
          const startedAt =
            row.night_start_at || `${row.plan_date}T00:00:00.000Z`;
          await transaction.run(
            `INSERT INTO observation_sessions
             (id, tenant_id, plan_id, started_at, finished_at, status, created_at, updated_at, origin)
             VALUES (?, ?, ?, ?, ?, 'finished', ?, ?, 'debrief')`,
            [
              sessionId,
              tenantId,
              planId,
              startedAt,
              row.night_end_at || startedAt,
              timestamp,
              timestamp,
            ],
          );
          await audit(transaction, {
            tenantId,
            userId,
            eventType: "session.recreated",
            details: { planId, sessionId, outcome },
            at: timestamp,
          });
          return {
            kind: "ok",
            plan: await resourceOf(
              transaction,
              tenantId,
              await planRowFor(transaction, tenantId, planId),
            ),
            session: await sessionResourceWithCounts(
              transaction,
              await sessionRowById(transaction, { tenantId, sessionId }),
            ),
          };
        },
      );
      if (result.kind === "ok")
        publishChange({
          tenantId,
          domains: ["plans", "sessions", "debrief"],
          originClientInstanceId,
        });
      return result;
    },
  };
}
