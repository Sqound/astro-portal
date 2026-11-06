import { createPlanTrashRepository } from "../persistence/plan-trash-repository.js";
import { PlanResourceStoreError } from "../persistence/planner-state-repository.js";

/** The stable application error for thin HTTP adapters (`body` is the v1 envelope). */
export class PlanTrashError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "PlanTrashError";
    this.code = code;
    this.status = status;
    this.body = { error: { code, message }, ...details };
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const planNotFound = () =>
  new PlanTrashError("plan_not_found", "The plan was not found.", {
    status: 404,
  });
const projectNotFound = () =>
  new PlanTrashError("project_not_found", "The project was not found.", {
    status: 404,
  });

function tenantOf(tenantId) {
  const tenant = String(tenantId || "").trim();
  if (!tenant)
    throw new PlanTrashError("invalid_request", "Tenant id is required.");
  return tenant;
}

/** An id that is not a UUID names nothing of the space. */
function idOf(value, notFound) {
  const id = String(value || "").trim();
  if (!UUID.test(id)) throw notFound();
  return id;
}

/** The plan store's refusals (the night rule, the limit) as they are. */
function refusal(error) {
  if (error instanceof PlanTrashError) return error;
  if (error instanceof PlanResourceStoreError) {
    const {
      code,
      message,
      status,
      name: _name,
      stack: _stack,
      ...details
    } = error;
    return new PlanTrashError(code, message, { status, ...details });
  }
  return error;
}

/**
 * Framework-free service of the deleted plans — the plans of one night and
 * the multi-night plans (« plans multi-nuits », internally projects).
 * **Rights**: a deletion, a restoration and an erasure are a voluntary
 * clean-up of the owner's data, never held by a right; a restored plan still
 * to run meets the night rule and the numeric guard of a new plan
 * (`rightsFor(userId)` → `{ planLimit, plannerMultiple }`, the plan
 * service's `writeRightsFor`).
 *
 * - list({ tenantId }) -> `{ plans, projects, graceDays }`
 * - restorePlan({ tenantId, userId, planId }) -> `{ plan }`
 * - erasePlan({ tenantId, userId, planId }) -> `{ planId, erased: true }`
 * - trashProject({ tenantId, userId, projectId, force }) -> `{ project,
 *   deletedAt, purgeAt, daysRemaining, planIds, detachedSessionCount }`;
 *   `409 project_in_progress` (with `planIds`) when a night of it runs on a
 *   device and `force` is not given
 * - restoreProject({ tenantId, userId, projectId }) -> `{ project,
 *   plansRestored, plansKept }`
 * - eraseProject({ tenantId, userId, projectId }) -> `{ projectId, erased:
 *   true, plansErased }`
 * - purgeExpired({ at }) -> `{ plans, projects, failed }`: the hourly
 *   maintenance
 */
export async function createPlanTrashService({
  repository = null,
  databasePath,
  databaseUrl,
  driver,
  dialect,
  rightsFor = async () => ({ planLimit: 0, plannerMultiple: true }),
  now = () => new Date().toISOString(),
} = {}) {
  const store =
    repository ||
    (await createPlanTrashRepository({
      databasePath,
      databaseUrl,
      driver,
      dialect,
    }));

  async function rights(userId) {
    const answer = (await rightsFor(userId)) ?? {};
    return {
      planLimit: answer.planLimit ?? 0,
      plannerMultiple: answer.plannerMultiple !== false,
    };
  }

  return {
    async close() {
      await store.close?.();
    },

    async list({ tenantId }) {
      return await store.deletedList({
        tenantId: tenantOf(tenantId),
        timestamp: now(),
      });
    },

    async restorePlan({
      tenantId,
      userId = null,
      planId,
      originClientInstanceId = null,
    }) {
      try {
        const result = await store.restorePlan({
          tenantId: tenantOf(tenantId),
          userId,
          planId: idOf(planId, planNotFound),
          ...(await rights(userId)),
          originClientInstanceId,
          timestamp: now(),
        });
        if (result.kind === "missing") throw planNotFound();
        return { plan: result.plan };
      } catch (error) {
        throw refusal(error);
      }
    },

    async erasePlan({ tenantId, userId = null, planId }) {
      const id = idOf(planId, planNotFound);
      const result = await store.erasePlan({
        tenantId: tenantOf(tenantId),
        userId,
        planId: id,
        timestamp: now(),
      });
      if (result.kind === "missing") throw planNotFound();
      if (result.kind === "not_deleted")
        throw new PlanTrashError(
          "plan_not_deleted",
          "Only a deleted plan is erased: delete it first.",
          { status: 409 },
        );
      return { planId: id, erased: true };
    },

    async trashProject({
      tenantId,
      userId = null,
      projectId,
      force = false,
      originClientInstanceId = null,
    }) {
      const at = now();
      const result = await store.trashProject({
        tenantId: tenantOf(tenantId),
        userId,
        projectId: idOf(projectId, projectNotFound),
        force: Boolean(force),
        originClientInstanceId,
        timestamp: at,
      });
      if (result.kind === "missing") throw projectNotFound();
      if (result.kind === "in_progress")
        throw new PlanTrashError(
          "project_in_progress",
          "A night of this multi-night plan is running on a device: delete it with force to take that night to the trash too.",
          { status: 409, planIds: result.planIds },
        );
      return {
        project: result.project,
        deletedAt: result.deletedAt,
        purgeAt: result.purgeAt,
        daysRemaining: Math.max(
          0,
          Math.ceil((Date.parse(result.purgeAt) - Date.parse(at)) / 86_400_000),
        ),
        planIds: result.planIds,
        detachedSessionCount: result.detachedSessionCount,
      };
    },

    async restoreProject({
      tenantId,
      userId = null,
      projectId,
      originClientInstanceId = null,
    }) {
      const result = await store.restoreProject({
        tenantId: tenantOf(tenantId),
        userId,
        projectId: idOf(projectId, projectNotFound),
        ...(await rights(userId)),
        originClientInstanceId,
        timestamp: now(),
      });
      if (result.kind === "missing") throw projectNotFound();
      return {
        project: result.project,
        plansRestored: result.plansRestored,
        plansKept: result.plansKept,
      };
    },

    async eraseProject({ tenantId, userId = null, projectId }) {
      const id = idOf(projectId, projectNotFound);
      const result = await store.eraseProject({
        tenantId: tenantOf(tenantId),
        userId,
        projectId: id,
        timestamp: now(),
      });
      if (result.kind === "missing") throw projectNotFound();
      if (result.kind === "not_deleted")
        throw new PlanTrashError(
          "project_not_deleted",
          "Only a deleted multi-night plan is erased: delete it first.",
          { status: 409 },
        );
      return { projectId: id, erased: true, plansErased: result.plansErased };
    },

    async purgeExpired({ at = now() } = {}) {
      const expired = await store.expired({ at });
      let projects = 0;
      let plans = 0;
      let failed = 0;
      // The multi-night plans first: they take the plans that went with
      // them.
      for (const { tenantId, projectId } of expired.projects)
        try {
          const result = await store.eraseProject({
            tenantId,
            projectId,
            timestamp: at,
          });
          if (result.kind === "ok") {
            projects += 1;
            plans += result.plansErased;
          }
        } catch {
          failed += 1;
        }
      for (const { tenantId, planId } of expired.plans)
        try {
          const result = await store.erasePlan({
            tenantId,
            planId,
            timestamp: at,
          });
          if (result.kind === "ok") plans += 1;
        } catch {
          // One plan that will not go does not hold the others: the next
          // sweep tries it again.
          failed += 1;
        }
      return { plans, projects, failed };
    },
  };
}
