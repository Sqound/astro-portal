import {
  allSessionsDone,
  createProjectNightRepository,
} from "../persistence/project-night-repository.js";
import { writeDeclaredIntegrationsForSession } from "../persistence/project-integration-repository.js";
import { MULTI_NIGHT_ATTACH_CAPABILITY } from "./project-integrations.js";

/**
 * The nights of a multi-night plan (`project.schema.json`, `night`, `nightsWrite`, `nights`;
 * api/projects.md), framework-free: a route adapter supplies the space,
 * the person and the body, and turns the value or the thrown
 * `ProjectNightError` into HTTP.
 *
 * - `list` (the nights, and the candidates of the same target) never needs
 *   a capability, on any service.
 * - `attach` and `detach` need the multi-night plans: `multiNightActive(userId)`
 *   decides (the capability `planner.mosaic`; always on a private
 *   server), else `403 multi_night_not_active` naming
 *   `planner.mosaic`. The integrations that follow a night stay under
 *   `analysis.progression` (project-integrations.js). A night or a plan that is
 *   not of the plan's target is `409 target_mismatch`, whatever the
 *   capability; every night and plan is checked before one is attached.
 */

const MAX_IDS = 50;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ProjectNightError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "ProjectNightError";
    this.code = code;
    this.status = status;
    this.body = { error: { code, message }, ...details };
  }
}

const invalid = (message) => new ProjectNightError("invalid_request", message);

/** The refusal of a space that does not hold the right to attach nights. */
const multiNightNotActive = () =>
  new ProjectNightError(
    "multi_night_not_active",
    "Attaching nights to a multi-night plan needs a right this space does not hold: the nights stay readable, none is attached.",
    { status: 403, capability: MULTI_NIGHT_ATTACH_CAPABILITY },
  );

const projectNotFound = () =>
  new ProjectNightError("project_not_found", "The project was not found.", {
    status: 404,
  });

/** The refusals the repository names, in the contract's words. */
function refusalError(refusal) {
  const ids = {
    ...(refusal.sessionId ? { sessionId: refusal.sessionId } : {}),
    ...(refusal.planId ? { planId: refusal.planId } : {}),
  };
  switch (refusal.refusal) {
    case "session_not_found":
      return new ProjectNightError(
        "session_not_found",
        "The night was not found.",
        { status: 404, ...ids },
      );
    case "plan_not_found":
      return new ProjectNightError(
        "plan_not_found",
        "The plan was not found.",
        { status: 404, ...ids },
      );
    case "night_not_found":
      return new ProjectNightError(
        "night_not_found",
        "Neither a night nor a plan of this space has this id.",
        { status: 404 },
      );
    default:
      return new ProjectNightError(
        "target_mismatch",
        "This night is not of the target of the multi-night plan.",
        { status: 409, ...ids },
      );
  }
}

/** A list of night or plan ids: UUIDs, at most fifty, without repeats. */
function idList(value, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_IDS)
    throw invalid(`${label} is a list of ${MAX_IDS} identifiers at most.`);
  for (const id of value)
    if (typeof id !== "string" || !uuidPattern.test(id))
      throw invalid(`${label}[] is a UUID.`);
  return [...new Set(value.map((id) => id.toLowerCase()))];
}

/** The body `{ sessionIds?, planIds? }`, at least one id in all. */
export function parseNightsBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw invalid("The body is { sessionIds: [...], planIds: [...] }.");
  for (const key of Object.keys(body))
    if (key !== "sessionIds" && key !== "planIds")
      throw invalid(`Unexpected property "${key}".`);
  const sessionIds = idList(body.sessionIds, "sessionIds");
  const planIds = idList(body.planIds, "planIds");
  if (!sessionIds.length && !planIds.length)
    throw invalid("Name at least one night (sessionIds) or plan (planIds).");
  return { sessionIds, planIds };
}

export async function createProjectNightService({
  driver,
  dialect,
  multiNightActive = async () => false,
  repository = null,
  now,
} = {}) {
  const resolvedDriver = driver ?? null;
  const store =
    repository ||
    (await createProjectNightRepository({
      driver,
      dialect,
      ...(now ? { now } : {}),
    }));

  async function requireProject(tenantId, projectId) {
    if (typeof projectId !== "string" || !uuidPattern.test(projectId))
      throw projectNotFound();
    const project = await store.projectOf(tenantId, projectId.toLowerCase());
    if (!project) throw projectNotFound();
    return project;
  }

  async function requireMultiNight(userId) {
    if (!(await multiNightActive(userId))) throw multiNightNotActive();
  }

  async function listBody(tenantId, project) {
    return {
      projectId: project.id,
      ...(await store.nights(tenantId, project, { candidates: true })),
    };
  }

  return {
    capability: MULTI_NIGHT_ATTACH_CAPABILITY,

    /**
     * `GET /v1/projects/candidates?targetId=|framingId=`: the nights and the
     * plans of one night of a target that has no multi-night plan yet, what
     * « À partir de plans déjà existants » lists. Never gated.
     */
    async candidates({ tenantId, targetId = null, framingId = null }) {
      const target = {
        ...(typeof targetId === "string" && targetId.trim()
          ? { targetId: targetId.trim() }
          : {}),
        ...(typeof framingId === "string" && framingId.trim()
          ? { framingId: framingId.trim() }
          : {}),
      };
      const candidates = await store.candidatesOf(tenantId, target);
      if (candidates === null)
        throw invalid("Name a target: targetId or framingId.");
      return { candidates };
    },

    /** `GET /v1/projects/{projectId}/nights`: never gated. */
    async list({ tenantId, projectId }) {
      return await listBody(
        tenantId,
        await requireProject(tenantId, projectId),
      );
    },

    /** What the project read alone adds: its `nights`. */
    async projectNights({ tenantId, projectId }) {
      const project = await store.projectOf(tenantId, projectId);
      if (!project) return { nights: [], allSessionsDone: false };
      const { nights } = await store.nights(tenantId, project);
      // No night `upcoming` or `to_debrief`, at least one `done`.
      return { nights, allSessionsDone: allSessionsDone(nights) };
    },

    /**
     * The multi-night plan's flag from the nights its answer lists (the
     * answer of `POST /v1/projects` with source nights).
     */
    allSessionsDone,

    /**
     * The multi-night plans a night (`sessionId`) or a plan of one night
     * (`planId`) belongs to — the filter of `GET /v1/projects`.
     */
    async projectIdsOf({ tenantId, sessionId = null, planId = null }) {
      const id = (value) =>
        typeof value === "string" && uuidPattern.test(value)
          ? value.toLowerCase()
          : null;
      if (!id(sessionId) && !id(planId)) return new Set();
      return await store.projectIdsOf(tenantId, {
        sessionId: id(sessionId),
        planId: id(planId),
      });
    },

    /** Checks the multi-night right only (`POST /v1/projects` with sources). */
    requireMultiNight,

    /**
     * Checks, before a multi-night plan of `target` exists, that every
     * night and plan of `body` can be attached to it (`POST /v1/projects`
     * with `fromSessionIds` / `fromPlanIds`). Throws the refusal.
     */
    async checkSources({ tenantId, target, sessionIds, planIds }) {
      const keys = await store.targetKeysOf(tenantId, target);
      if (!keys.size) throw invalid("target names a targetId or a framingId.");
      const plan = await store.attachPlan(tenantId, keys, {
        sessionIds,
        planIds,
      });
      if (plan.refusal) throw refusalError(plan);
    },

    /** `POST /v1/projects/{projectId}/nights`. */
    async attach({
      tenantId,
      userId,
      projectId,
      body,
      originClientInstanceId = null,
    }) {
      await requireMultiNight(userId);
      const project = await requireProject(tenantId, projectId);
      const { sessionIds, planIds } = parseNightsBody(body);
      const result = await store.attach({
        tenantId,
        userId,
        project,
        sessionIds,
        planIds,
        originClientInstanceId,
      });
      if (result.refusal) throw refusalError(result);
      // A night attached afterwards gets its declared integration lines,
      // from its debriefing or its events.
      if (resolvedDriver)
        for (const sessionId of result.sessionIds ?? [])
          await writeDeclaredIntegrationsForSession(
            resolvedDriver,
            tenantId,
            sessionId,
          );
      return await listBody(tenantId, project);
    },

    /** `DELETE /v1/projects/{projectId}/nights/{nightId}`. */
    async detach({
      tenantId,
      userId,
      projectId,
      nightId,
      originClientInstanceId = null,
    }) {
      await requireMultiNight(userId);
      const project = await requireProject(tenantId, projectId);
      if (typeof nightId !== "string" || !uuidPattern.test(nightId))
        throw refusalError({ refusal: "night_not_found" });
      const result = await store.detach({
        tenantId,
        userId,
        project,
        nightId: nightId.toLowerCase(),
        originClientInstanceId,
      });
      if (result.refusal) throw refusalError(result);
      return await listBody(tenantId, project);
    },
  };
}
