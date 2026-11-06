import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";
import { withSerializedSqliteRetry } from "./db-transaction-retry.js";
import { publishChange } from "../api/change-bus.js";
import { audit } from "./plan-project-links.js";
import {
  archivePlannerPayload,
  apiPlanStatus,
  canonicalJson,
  hydratedPayloadVia,
  lockTenantPlans,
  parseJson,
  planRevision,
  refuseBeyondPlanLimit,
  refuseNightPlaceConflict,
  replacePlanItems,
  resourceForPlanRow,
  storedClosedAs,
} from "./planner-state-repository.js";
import { SESSION_GRACE_DAYS, purgeAtOf } from "../sessions/session-grace.js";
import { erasePlanRows, eraseProjectRows } from "./trash-erasure.js";

/**
 * The trash of the plans: the plans of one night and the multi-night plans
 * (`projects`) the owner deleted, kept `PLAN_GRACE_DAYS` days, restorable,
 * then erased by the hourly maintenance — the rule of the sessions
 * (`session-trash-repository.js`).
 *
 * **A plan of one night** goes to the trash through `DELETE /v1/plans/{id}`
 * or the web planner's save (`planner-state-repository.js`, which writes
 * `deleted_at` and `purge_at`). Here: the list, the restoration (the night
 * rule and the numeric guard apply as to a new plan; the open session that
 * went with it comes back), and the erasure (its items, framings and
 * versions; a session or a capture that still names it keeps its night and
 * loses the plan).
 *
 * **A multi-night plan** goes to the trash here. Its nights still to come
 * (a plan of one night not run: active or abandoned, with no session) go
 * with it; every night already run — a plan with its session, a session
 * attached by itself — is detached and stays in the Journal as an ordinary
 * session, its integrations with it. `trash_json` keeps what the deletion
 * did, and the restoration gives it back: the plans that went with it, the
 * links of the nights it was detached from (those still free).
 *
 * A row deleted before the trash existed (`deleted_at` set, `purge_at`
 * NULL) is never listed, restored nor erased here.
 */

export const PLAN_GRACE_DAYS = SESSION_GRACE_DAYS;

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

/** The whole days left before `purgeAt`, rounded up, never below 0. */
export function planDaysRemaining(purgeAt, at) {
  const purge = Date.parse(purgeAt ?? "");
  const now = Date.parse(at ?? "");
  if (!Number.isFinite(purge) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.ceil((purge - now) / DAY_MILLISECONDS));
}

const plainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const itemsOf = (payload) =>
  Array.isArray(payload?.items) ? payload.items.filter(plainObject) : [];

const later = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

/** The resource of a stored multi-night plan (`project.schema.json`). */
export function projectResourceOfRow(row) {
  const fields = parseJson(row.payload_json, {});
  const revision = Number(row.revision);
  return {
    id: row.id,
    revision: Number.isSafeInteger(revision) && revision >= 1 ? revision : 1,
    status: row.status,
    target: fields?.target ?? null,
    goalMinutes: fields?.goalMinutes ?? null,
    place: fields?.place ?? null,
    equipment: fields?.equipment ?? null,
    constraints: fields?.constraints ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function trashOf(row) {
  const trash = parseJson(row?.trash_json, {});
  const list = (value) =>
    Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
  return {
    plans: list(trash?.plans),
    sessions: list(trash?.sessions),
    detachedPlans: Array.isArray(trash?.detachedPlans)
      ? trash.detachedPlans.filter(
          (entry) =>
            plainObject(entry) &&
            typeof entry.planId === "string" &&
            Array.isArray(entry.itemIds),
        )
      : [],
    detachedSessions: list(trash?.detachedSessions),
    detachedIntegrations: list(trash?.detachedIntegrations),
  };
}

export async function createPlanTrashRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);

  const inClause = (values) => values.map(() => "?").join(", ");

  /** The plan in the trash, or `null`. */
  async function trashedPlanRow(executor, tenantId, planId) {
    return (
      (
        await executor.query(
          `SELECT * FROM plans WHERE id = ? AND tenant_id = ?
             AND deleted_at IS NOT NULL AND purge_at IS NOT NULL`,
          [planId, tenantId],
        )
      ).rows[0] ?? null
    );
  }

  async function trashedProjectRow(executor, tenantId, projectId) {
    return (
      (
        await executor.query(
          `SELECT * FROM projects WHERE id = ? AND tenant_id = ?
             AND deleted_at IS NOT NULL AND purge_at IS NOT NULL`,
          [projectId, tenantId],
        )
      ).rows[0] ?? null
    );
  }

  /**
   * The items of a live plan rewritten by `change`: the revision goes up by
   * one and the payload it had is kept as history, as every write does.
   * Answers whether anything changed.
   */
  async function rewriteItems(tx, tenantId, planId, change, timestamp) {
    const row = (
      await tx.query(
        "SELECT * FROM plans WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
        [planId, tenantId],
      )
    ).rows[0];
    if (!row) return false;
    const payload = parseJson(row.payload_json, null);
    if (!plainObject(payload)) return false;
    const items = itemsOf(payload);
    const next = items.map(change);
    if (canonicalJson(next) === canonicalJson(items)) return false;
    await archivePlannerPayload(tx, {
      tenantId,
      plan: row,
      payloadJson: row.payload_json,
      timestamp,
    });
    await tx.run(
      "UPDATE plans SET payload_json = ?, revision = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
      [
        canonicalJson({ ...payload, items: next }),
        planRevision(row.revision) + 1,
        later(row.updated_at, timestamp),
        planId,
        tenantId,
      ],
    );
    await replacePlanItems(tx, { tenantId, planId, items: next, timestamp });
    return true;
  }

  /**
   * Brings one plan of the trash back, in `tx`: the night rule and the
   * numeric guard of a new plan when it is still to be run, its revision
   * up by one (a device's stale copy then conflicts instead of overwriting
   * it), the link to a multi-night plan that is gone taken out, and the
   * open session that went with it given back. Throws the plan store's
   * refusals (`plan_limit_reached`, `plan_night_place_conflict`).
   */
  async function restorePlanIn(
    tx,
    { tenantId, row, planLimit, plannerMultiple, timestamp },
  ) {
    const closedAs = storedClosedAs(row.settings_json);
    if (row.status === "pending" && !closedAs) {
      await refuseBeyondPlanLimit(tx, tenantId, planLimit, {
        plannerMultiple,
        date: row.plan_date,
        planId: row.id,
        guidedEvening: Number(row.guided_evening) === 1,
      });
      await refuseNightPlaceConflict(tx, tenantId, {
        planId: row.id,
        fields: {
          clientId: row.client_id,
          name: row.name,
          planDate: row.plan_date,
          locationJson: row.location_json,
          guidedEvening: Number(row.guided_evening) === 1 ? 1 : 0,
        },
        closedAs: closedAs ?? undefined,
      });
    }
    if (row.payload_json !== null && row.payload_json !== undefined)
      await archivePlannerPayload(tx, {
        tenantId,
        plan: row,
        payloadJson: row.payload_json,
        timestamp,
      });
    await tx.run(
      `UPDATE plans SET deleted_at = NULL, purge_at = NULL, revision = ?,
         updated_at = ? WHERE id = ? AND tenant_id = ?`,
      [
        planRevision(row.revision) + 1,
        later(row.updated_at, timestamp),
        row.id,
        tenantId,
      ],
    );
    // A multi-night plan its items name that is not live any more (in the
    // trash, erased): the plan comes back as a plan of one night.
    const payload = parseJson(row.payload_json, null);
    const named = [
      ...new Set(
        itemsOf(payload)
          .map((item) => item.projectId)
          .filter((id) => typeof id === "string" && id),
      ),
    ];
    let gone = new Set();
    if (named.length) {
      const live = new Set(
        (
          await tx.query(
            `SELECT id FROM projects WHERE tenant_id = ? AND deleted_at IS NULL
               AND id IN (${inClause(named)})`,
            [tenantId, ...named],
          )
        ).rows.map((project) => project.id),
      );
      gone = new Set(named.filter((id) => !live.has(id)));
    }
    if (gone.size)
      await rewriteItems(
        tx,
        tenantId,
        row.id,
        (item) => {
          if (!gone.has(item.projectId)) return item;
          const { projectId: _projectId, ...rest } = item;
          return rest;
        },
        timestamp,
      );
    // The open session that went to the trash with the plan (a night in
    // progress deleted « quand même »): the same instant.
    const sessions = (
      await tx.query(
        `SELECT id FROM observation_sessions
         WHERE tenant_id = ? AND plan_id = ? AND deleted_at = ?`,
        [tenantId, row.id, row.deleted_at],
      )
    ).rows;
    let sessionsRestored = 0;
    for (const session of sessions) {
      const holder = (
        await tx.query(
          `SELECT id FROM observation_sessions
           WHERE tenant_id = ? AND plan_id = ? AND deleted_at IS NULL`,
          [tenantId, row.id],
        )
      ).rows[0];
      if (holder) break;
      await tx.run(
        `UPDATE observation_sessions SET deleted_at = NULL, updated_at = ?
         WHERE id = ? AND tenant_id = ?`,
        [timestamp, session.id, tenantId],
      );
      sessionsRestored += 1;
    }
    const hadFramings = Boolean(
      (
        await tx.query(
          "SELECT plan_id FROM plan_framings WHERE plan_id = ? LIMIT 1",
          [row.id],
        )
      ).rows[0],
    );
    return { sessionsRestored, hadFramings };
  }

  function signal(tenantId, domains, originClientInstanceId = null) {
    const list = [...new Set(domains)].filter(Boolean);
    if (list.length)
      publishChange({ tenantId, domains: list, originClientInstanceId });
  }

  return {
    async close() {
      if (ownsDriver) await db.close();
    },

    /**
     * The plans and multi-night plans in the trash, the most recently
     * deleted first: `{ plans: [{ plan, deletedAt, purgeAt, daysRemaining,
     * projectId }], projects: [{ project, deletedAt, purgeAt, daysRemaining,
     * planIds, detachedSessionCount }] }`. `projectId` names the
     * multi-night plan a plan went to the trash with (`null` otherwise).
     */
    async deletedList({ tenantId, timestamp = new Date().toISOString() }) {
      const planRows = (
        await db.query(
          `SELECT * FROM plans WHERE tenant_id = ?
             AND deleted_at IS NOT NULL AND purge_at IS NOT NULL
           ORDER BY deleted_at DESC, id DESC`,
          [tenantId],
        )
      ).rows;
      const projectRows = (
        await db.query(
          `SELECT * FROM projects WHERE tenant_id = ?
             AND deleted_at IS NOT NULL AND purge_at IS NOT NULL
           ORDER BY deleted_at DESC, id DESC`,
          [tenantId],
        )
      ).rows;
      const withProject = new Map();
      const projects = projectRows.map((row) => {
        const trash = trashOf(row);
        for (const planId of trash.plans) withProject.set(planId, row.id);
        return {
          project: projectResourceOfRow(row),
          deletedAt: row.deleted_at,
          purgeAt: row.purge_at,
          daysRemaining: planDaysRemaining(row.purge_at, timestamp),
          planIds: trash.plans,
          detachedSessionCount: new Set([
            ...trash.detachedSessions,
            ...trash.detachedPlans.map((entry) => entry.planId),
          ]).size,
        };
      });
      const plans = [];
      for (const row of planRows) {
        const resource = resourceForPlanRow(row);
        plans.push({
          plan: {
            ...resource,
            payload: await hydratedPayloadVia(db, tenantId, resource.payload),
          },
          deletedAt: row.deleted_at,
          purgeAt: row.purge_at,
          daysRemaining: planDaysRemaining(row.purge_at, timestamp),
          projectId: withProject.get(row.id) ?? null,
        });
      }
      return { plans, projects, graceDays: PLAN_GRACE_DAYS };
    },

    /**
     * `POST /v1/plans/{id}/restore`: `{ kind: "missing" }` or `{ kind:
     * "ok", plan }`; the store's refusals are thrown.
     */
    async restorePlan({
      tenantId,
      userId = null,
      planId,
      planLimit = 0,
      plannerMultiple = true,
      originClientInstanceId = null,
      timestamp = new Date().toISOString(),
    }) {
      const result = await withSerializedSqliteRetry(db, async (tx) => {
        await lockTenantPlans(tx, tenantId);
        const row = await trashedPlanRow(tx, tenantId, planId);
        if (!row) return { kind: "missing" };
        const restored = await restorePlanIn(tx, {
          tenantId,
          row,
          planLimit,
          plannerMultiple,
          timestamp,
        });
        await audit(tx, {
          tenantId,
          userId,
          eventType: "plan.restored",
          details: { planId, sessions: restored.sessionsRestored },
          at: timestamp,
        });
        const live = (
          await tx.query("SELECT * FROM plans WHERE id = ? AND tenant_id = ?", [
            planId,
            tenantId,
          ])
        ).rows[0];
        return { kind: "ok", row: live, ...restored };
      });
      if (result.kind !== "ok") return result;
      signal(
        tenantId,
        [
          "plans",
          result.hadFramings ? "framings" : null,
          result.sessionsRestored ? "sessions" : null,
        ],
        originClientInstanceId,
      );
      const resource = resourceForPlanRow(result.row);
      return {
        kind: "ok",
        plan: {
          ...resource,
          payload: await hydratedPayloadVia(db, tenantId, resource.payload),
        },
      };
    },

    /**
     * `POST /v1/plans/{id}/erase`: `{ kind: "missing" }`, `{ kind:
     * "not_deleted" }` (a live plan is deleted first) or `{ kind: "ok" }`.
     */
    async erasePlan({
      tenantId,
      userId = null,
      planId,
      timestamp = new Date().toISOString(),
    }) {
      const result = await withSerializedSqliteRetry(db, async (tx) => {
        const any = (
          await tx.query(
            "SELECT id, deleted_at, purge_at FROM plans WHERE id = ? AND tenant_id = ?",
            [planId, tenantId],
          )
        ).rows[0];
        if (!any || (any.deleted_at && !any.purge_at))
          return { kind: "missing" };
        if (!any.deleted_at) return { kind: "not_deleted" };
        const erased = await erasePlanRows(tx, { tenantId, planId });
        await audit(tx, {
          tenantId,
          userId,
          eventType: "plan.erased",
          details: { planId },
          at: timestamp,
        });
        return { kind: "ok", ...erased };
      });
      if (result.kind === "ok")
        signal(tenantId, [
          "plans",
          result.framings ? "framings" : null,
          result.sessions ? "sessions" : null,
        ]);
      return result;
    },

    /**
     * `POST /v1/projects/{id}/trash`: the multi-night plan to the trash,
     * its nights to come with it, its nights run detached. `{ kind:
     * "missing" }`, `{ kind: "in_progress", planIds, sessionIds }` (a
     * night of it runs on a device and `force` was not given) or `{ kind:
     * "ok", project, deletedAt, purgeAt, planIds, detachedSessionCount }`.
     */
    async trashProject({
      tenantId,
      userId = null,
      projectId,
      force = false,
      originClientInstanceId = null,
      timestamp = new Date().toISOString(),
    }) {
      const result = await withSerializedSqliteRetry(db, async (tx) => {
        await lockTenantPlans(tx, tenantId);
        const project = (
          await tx.query(
            "SELECT * FROM projects WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
            [projectId, tenantId],
          )
        ).rows[0];
        if (!project) return { kind: "missing" };
        const plans = (
          await tx.query(
            "SELECT * FROM plans WHERE tenant_id = ? AND deleted_at IS NULL",
            [tenantId],
          )
        ).rows.filter((row) =>
          itemsOf(parseJson(row.payload_json, null)).some(
            (item) => item.projectId === projectId,
          ),
        );
        const sessionsOf = new Map();
        if (plans.length)
          for (const session of (
            await tx.query(
              `SELECT id, plan_id, status, finished_at FROM observation_sessions
               WHERE tenant_id = ? AND deleted_at IS NULL
                 AND plan_id IN (${inClause(plans.map((row) => row.id))})`,
              [tenantId, ...plans.map((row) => row.id)],
            )
          ).rows) {
            const list = sessionsOf.get(session.plan_id) ?? [];
            list.push(session);
            sessionsOf.set(session.plan_id, list);
          }
        const trashed = [];
        const trashedSessions = [];
        const detached = [];
        const running = [];
        for (const row of plans) {
          const sessions = sessionsOf.get(row.id) ?? [];
          const open = sessions.filter(
            (session) =>
              !session.finished_at &&
              ["open", "paused"].includes(session.status),
          );
          const toCome =
            ["active", "abandoned"].includes(apiPlanStatus(row.status)) &&
            sessions.length === open.length;
          if (toCome) {
            if (open.length) running.push(row.id);
            trashed.push(row);
            trashedSessions.push(...open.map((session) => session.id));
          } else
            detached.push({
              planId: row.id,
              itemIds: itemsOf(parseJson(row.payload_json, null))
                .filter((item) => item.projectId === projectId)
                .map((item) => String(item.id ?? "")),
            });
        }
        if (running.length && !force)
          return {
            kind: "in_progress",
            planIds: running,
            sessionIds: trashedSessions,
          };
        const purgeAt = purgeAtOf(timestamp);
        for (const row of trashed)
          await tx.run(
            `UPDATE plans SET deleted_at = ?, purge_at = ?, updated_at = ?
             WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
            [
              timestamp,
              purgeAt,
              later(row.updated_at, timestamp),
              row.id,
              tenantId,
            ],
          );
        for (const sessionId of trashedSessions)
          await tx.run(
            `UPDATE observation_sessions SET deleted_at = ?, updated_at = ?
             WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
            [timestamp, timestamp, sessionId, tenantId],
          );
        for (const entry of detached)
          await rewriteItems(
            tx,
            tenantId,
            entry.planId,
            (item) => {
              if (item.projectId !== projectId) return item;
              const { projectId: _projectId, ...rest } = item;
              return rest;
            },
            timestamp,
          );
        const detachedSessions = (
          await tx.query(
            "SELECT id FROM observation_sessions WHERE tenant_id = ? AND project_id = ? AND deleted_at IS NULL",
            [tenantId, projectId],
          )
        ).rows.map((row) => row.id);
        if (detachedSessions.length)
          await tx.run(
            `UPDATE observation_sessions SET project_id = NULL, updated_at = ?
             WHERE tenant_id = ? AND project_id = ? AND deleted_at IS NULL`,
            [timestamp, tenantId, projectId],
          );
        const detachedIntegrations = (
          await tx.query(
            "SELECT id FROM project_integrations WHERE tenant_id = ? AND project_id = ?",
            [tenantId, projectId],
          )
        ).rows.map((row) => row.id);
        if (detachedIntegrations.length)
          await tx.run(
            "UPDATE project_integrations SET project_id = NULL, updated_at = ? WHERE tenant_id = ? AND project_id = ?",
            [timestamp, tenantId, projectId],
          );
        const trash = {
          plans: trashed.map((row) => row.id),
          sessions: trashedSessions,
          detachedPlans: detached,
          detachedSessions,
          detachedIntegrations,
        };
        await tx.run(
          `UPDATE projects SET deleted_at = ?, purge_at = ?, trash_json = ?,
             updated_at = ? WHERE id = ? AND tenant_id = ?`,
          [
            timestamp,
            purgeAt,
            JSON.stringify(trash),
            later(project.updated_at, timestamp),
            projectId,
            tenantId,
          ],
        );
        await audit(tx, {
          tenantId,
          userId,
          eventType: "project.deleted",
          details: {
            projectId,
            plans: trash.plans.length,
            detached: detached.length + detachedSessions.length,
          },
          at: timestamp,
        });
        return {
          kind: "ok",
          project: projectResourceOfRow(project),
          deletedAt: timestamp,
          purgeAt,
          planIds: trash.plans,
          detachedSessionCount: new Set([
            ...detachedSessions,
            ...detached.map((entry) => entry.planId),
          ]).size,
          sessions: Boolean(trashedSessions.length || detachedSessions.length),
          plans: Boolean(trashed.length || detached.length),
        };
      });
      if (result.kind === "ok")
        signal(
          tenantId,
          [
            "projects",
            result.plans ? "plans" : null,
            result.sessions ? "sessions" : null,
          ],
          originClientInstanceId,
        );
      return result;
    },

    /**
     * `POST /v1/projects/{id}/restore`: `{ kind: "missing" }` or `{ kind:
     * "ok", project, plansRestored, plansKept }`: `plansKept` counts the
     * plans that went with it and could not come back (their night is
     * taken since, or the plan limit is reached): they stay in the trash.
     */
    async restoreProject({
      tenantId,
      userId = null,
      projectId,
      planLimit = 0,
      plannerMultiple = true,
      originClientInstanceId = null,
      timestamp = new Date().toISOString(),
    }) {
      const result = await withSerializedSqliteRetry(db, async (tx) => {
        await lockTenantPlans(tx, tenantId);
        const project = await trashedProjectRow(tx, tenantId, projectId);
        if (!project) return { kind: "missing" };
        const trash = trashOf(project);
        await tx.run(
          `UPDATE projects SET deleted_at = NULL, purge_at = NULL,
             trash_json = NULL, updated_at = ? WHERE id = ? AND tenant_id = ?`,
          [later(project.updated_at, timestamp), projectId, tenantId],
        );
        let plansRestored = 0;
        let plansKept = 0;
        for (const planId of trash.plans) {
          const row = await trashedPlanRow(tx, tenantId, planId);
          if (!row || row.deleted_at !== project.deleted_at) continue;
          try {
            await restorePlanIn(tx, {
              tenantId,
              row,
              planLimit,
              plannerMultiple,
              timestamp,
            });
            plansRestored += 1;
          } catch (error) {
            // Its night is taken since, or the limit is reached: that plan
            // stays in the trash, the rest comes back.
            if (
              !["plan_limit_reached", "plan_night_place_conflict"].includes(
                error?.code,
              )
            )
              throw error;
            plansKept += 1;
          }
        }
        // The nights it was detached from, when they are still free.
        for (const entry of trash.detachedPlans) {
          const itemIds = new Set(entry.itemIds);
          await rewriteItems(
            tx,
            tenantId,
            entry.planId,
            (item) =>
              itemIds.has(String(item.id ?? "")) && !item.projectId
                ? { ...item, projectId }
                : item,
            timestamp,
          );
        }
        if (trash.detachedSessions.length)
          await tx.run(
            `UPDATE observation_sessions SET project_id = ?, updated_at = ?
             WHERE tenant_id = ? AND project_id IS NULL AND deleted_at IS NULL
               AND id IN (${inClause(trash.detachedSessions)})`,
            [projectId, timestamp, tenantId, ...trash.detachedSessions],
          );
        if (trash.detachedIntegrations.length)
          await tx.run(
            `UPDATE project_integrations SET project_id = ?, updated_at = ?
             WHERE tenant_id = ? AND project_id IS NULL
               AND id IN (${inClause(trash.detachedIntegrations)})`,
            [projectId, timestamp, tenantId, ...trash.detachedIntegrations],
          );
        await audit(tx, {
          tenantId,
          userId,
          eventType: "project.restored",
          details: { projectId, plansRestored, plansKept },
          at: timestamp,
        });
        const live = (
          await tx.query(
            "SELECT * FROM projects WHERE id = ? AND tenant_id = ?",
            [projectId, tenantId],
          )
        ).rows[0];
        return {
          kind: "ok",
          project: projectResourceOfRow(live),
          plansRestored,
          plansKept,
        };
      });
      if (result.kind === "ok")
        signal(
          tenantId,
          ["projects", "plans", "sessions"],
          originClientInstanceId,
        );
      return result;
    },

    /**
     * `POST /v1/projects/{id}/erase`: `{ kind: "missing" }`, `{ kind:
     * "not_deleted" }` or `{ kind: "ok", plansErased }`. The plans that went
     * with it and are still in the trash are erased with it; its image
     * stays in the captures, without its multi-night plan.
     */
    async eraseProject({
      tenantId,
      userId = null,
      projectId,
      timestamp = new Date().toISOString(),
    }) {
      const result = await withSerializedSqliteRetry(db, async (tx) => {
        const any = (
          await tx.query(
            "SELECT * FROM projects WHERE id = ? AND tenant_id = ?",
            [projectId, tenantId],
          )
        ).rows[0];
        if (!any || (any.deleted_at && !any.purge_at))
          return { kind: "missing" };
        if (!any.deleted_at) return { kind: "not_deleted" };
        const { plansErased } = await eraseProjectRows(tx, {
          tenantId,
          row: any,
        });
        await audit(tx, {
          tenantId,
          userId,
          eventType: "project.erased",
          details: { projectId, plansErased },
          at: timestamp,
        });
        return { kind: "ok", plansErased };
      });
      if (result.kind === "ok")
        signal(tenantId, [
          "projects",
          "captures",
          result.plansErased ? "plans" : null,
        ]);
      return result;
    },

    /**
     * What the maintenance erases at `at`: `{ plans: [{ tenantId, planId }],
     * projects: [{ tenantId, projectId }] }`, the rows whose `purge_at` is
     * past.
     */
    async expired({ at = new Date().toISOString(), limit = 200 } = {}) {
      const projects = (
        await db.query(
          `SELECT id, tenant_id FROM projects
           WHERE deleted_at IS NOT NULL AND purge_at IS NOT NULL AND purge_at <= ?
           ORDER BY purge_at, id LIMIT ?`,
          [at, limit],
        )
      ).rows.map((row) => ({ tenantId: row.tenant_id, projectId: row.id }));
      const plans = (
        await db.query(
          `SELECT id, tenant_id FROM plans
           WHERE deleted_at IS NOT NULL AND purge_at IS NOT NULL AND purge_at <= ?
           ORDER BY purge_at, id LIMIT ?`,
          [at, limit],
        )
      ).rows.map((row) => ({ tenantId: row.tenant_id, planId: row.id }));
      return { plans, projects };
    },
  };
}
