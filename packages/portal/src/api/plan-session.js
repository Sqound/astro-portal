import { createPlanSessionRepository } from "../persistence/plan-session-repository.js";

// "Session" here is always an OBSERVATION session; see the naming note at the
// top of persistence/observation-session-repository.js.

/** The stable application error for thin HTTP adapters (`body` is the v1 envelope). */
export class PlanSessionError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "PlanSessionError";
    this.code = code;
    this.status = status;
    this.body = { error: { code, message }, ...details };
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const notFound = () =>
  new PlanSessionError("plan_not_found", "The plan was not found.", {
    status: 404,
  });

function identifiers({ tenantId, planId }) {
  const tenant = String(tenantId || "").trim();
  if (!tenant)
    throw new PlanSessionError("invalid_request", "Tenant id is required.");
  const plan = String(planId || "").trim();
  if (!UUID.test(plan))
    throw new PlanSessionError("invalid_request", "Plan id must be a UUID.");
  return { tenantId: tenant, planId: plan };
}

const conflict = () =>
  new PlanSessionError(
    "plan_conflict",
    "The plan changed on another surface: read it again.",
    { status: 409 },
  );

/**
 * Framework-free service of what the owner does to a plan that is history:
 * archive and unarchive a debriefed plan, make the session of a plan
 * again. Never held by a right (plan correctness is never held by a right).
 *
 * - archive({ tenantId, userId, planId }) -> `{ plan }`
 * - unarchive({ tenantId, userId, planId }) -> `{ plan }`
 * - recreateSession({ tenantId, userId, planId }) -> `{ plan, session }`
 */
export async function createPlanSessionService({
  repository = null,
  databasePath,
  databaseUrl,
  driver,
  dialect,
  now = () => new Date().toISOString(),
} = {}) {
  const store =
    repository ||
    (await createPlanSessionRepository({
      databasePath,
      databaseUrl,
      driver,
      dialect,
    }));

  return {
    async close() {
      await store.close?.();
    },

    async archive({
      tenantId,
      userId = null,
      planId,
      originClientInstanceId = null,
    }) {
      const result = await store.archive({
        ...identifiers({ tenantId, planId }),
        userId,
        originClientInstanceId,
        timestamp: now(),
      });
      if (result.kind === "missing") throw notFound();
      if (result.kind === "not_frozen")
        throw new PlanSessionError(
          "plan_not_frozen",
          "An active plan is archived by writing it with closedAs archived.",
          { status: 409 },
        );
      if (result.kind === "conflict") throw conflict();
      return { plan: result.resource };
    },

    async unarchive({
      tenantId,
      userId = null,
      planId,
      originClientInstanceId = null,
    }) {
      const result = await store.unarchive({
        ...identifiers({ tenantId, planId }),
        userId,
        originClientInstanceId,
        timestamp: now(),
      });
      if (result.kind === "missing") throw notFound();
      if (result.kind === "conflict") throw conflict();
      return { plan: result.resource };
    },

    async recreateSession({
      tenantId,
      userId = null,
      planId,
      originClientInstanceId = null,
    }) {
      const result = await store.recreateSession({
        ...identifiers({ tenantId, planId }),
        userId,
        originClientInstanceId,
        timestamp: now(),
      });
      if (result.kind === "missing") throw notFound();
      if (result.kind === "not_debriefed")
        throw new PlanSessionError(
          "plan_not_debriefed",
          "Only a plan whose night was debriefed has a session to make again.",
          { status: 409 },
        );
      if (result.kind === "archived")
        throw new PlanSessionError(
          "plan_archived",
          "This plan is archived: restore it before making its session again.",
          { status: 409 },
        );
      if (result.kind === "session_exists")
        throw new PlanSessionError(
          "session_exists",
          "This plan has a session.",
          { status: 409, sessionId: result.sessionId },
        );
      if (result.kind === "conflict") throw conflict();
      return { plan: result.plan, session: result.session };
    },
  };
}
