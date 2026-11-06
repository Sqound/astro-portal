import {
  activePlanLimit,
  capabilitiesForAnonymousDevice as anonymousDeviceCapabilities,
  isWriteRefused,
  resolveWriteAccess,
  staticProfile,
} from "../capabilities/provider.js";
import {
  MULTI_NIGHT_LINK_CAPABILITY,
  PLAN_READ_ONLY_MESSAGE,
} from "../persistence/plan-project-links.js";
import { OPEN_SOURCE_PROFILE } from "../capabilities/profiles.js";
import {
  PLAN_LIST_FILTERS,
  planMatchesListFilter,
} from "../planner/plan-main-filter.js";
import {
  createPlanResourceRepository,
  PlanResourceStoreError,
} from "../persistence/planner-state-repository.js";

/**
 * The stable application error for thin HTTP adapters. `body` is already the
 * versioned error envelope; conflict details are retained at its top level.
 */
export class PlanResourceError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "PlanResourceError";
    this.code = code;
    this.status = status;
    // A refused value (the acquisition lines) names its field and its limit
    // inside `error`, as a capture's `invalid_metadata` does.
    const { field, limit, ...rest } = details;
    this.body = {
      error: {
        code,
        message,
        ...(field !== undefined ? { field, limit: limit ?? null } : {}),
      },
      ...rest,
    };
    Object.assign(this, details);
  }
}

function apiError(error) {
  if (error instanceof PlanResourceError) return error;
  if (error instanceof PlanResourceStoreError) {
    const {
      code,
      message,
      status,
      name: _name,
      stack: _stack,
      ...details
    } = error;
    return new PlanResourceError(code, message, { status, ...details });
  }
  return new PlanResourceError(
    "plan_storage_unavailable",
    "Plan storage is unavailable.",
    { status: 503 },
  );
}

function requiredIdentifier(value, label) {
  const result = String(value || "").trim();
  if (!result)
    throw new PlanResourceError("invalid_request", `${label} is required.`);
  return result;
}

function resourceIdentifier(value, label) {
  const result = requiredIdentifier(value, label);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      result,
    )
  )
    throw new PlanResourceError("invalid_request", `${label} must be a UUID.`);
  return result;
}

function parseIfMatch(value) {
  if (value === null || value === undefined || value === "")
    throw new PlanResourceError(
      "precondition_required",
      "If-Match is required for a plan write.",
      { status: 428 },
    );
  if (Number.isInteger(value) && value >= 0) return value;
  const match = /^"(0|[1-9]\d*)"$/.exec(String(value).trim());
  if (!match || !Number.isSafeInteger(Number(match[1])))
    throw new PlanResourceError(
      "invalid_if_match",
      "If-Match must be one quoted non-negative plan revision.",
    );
  return Number(match[1]);
}

/**
 * The read-only write gate: a plan create/update or a version restore is a "new
 * envoi" of content exactly like an upload, so both are refused during the
 * read-only window — unlike `remove` (a voluntary deletion:
 * nothing is deleted, and the person is never stopped from cleaning up their own
 * data).
 */
async function requireWriteAccess(provider, userId) {
  const access = await resolveWriteAccess(provider, userId);
  if (isWriteRefused(access)) throw readOnlyError();
}

const readOnlyError = () =>
  new PlanResourceError("entitlement_read_only", PLAN_READ_ONLY_MESSAGE, {
    status: 403,
  });

/**
 * What a person may do with the `projectId` of a plan item: `allowed` when `planner.mosaic` is held —
 * through the profile, and, in the read-only window, through a capability
 * still held (`isWriteRefused`); `readOnly`
 * when that window is open, in which only the links may be written. A
 * private server never restricts the multi-night plans
 * (`multiNightOpen`): its links are always allowed.
 */
async function projectLinkRights(provider, userId, multiNightOpen) {
  const access = await resolveWriteAccess(provider, userId);
  const capabilities = await provider.capabilitiesFor(userId);
  return {
    access,
    capabilities,
    projectLinks: {
      allowed:
        multiNightOpen() ||
        (capabilities?.[MULTI_NIGHT_LINK_CAPABILITY] === true &&
          !isWriteRefused(access, MULTI_NIGHT_LINK_CAPABILITY)),
      readOnly: access?.readOnly === true,
    },
  };
}

// The numeric guard only; the same-night capability is passed separately.
const planLimitFor = activePlanLimit;

function resultOrError(result) {
  if (result?.kind === "framing_missing")
    throw new PlanResourceError(
      "framing_missing",
      "This plan references a framing unknown to this account.",
      { status: 409, missingFramingIds: result.missingFramingIds },
    );
  if (result?.kind === "missing")
    throw new PlanResourceError("plan_not_found", "The plan was not found.", {
      status: 404,
    });
  if (result?.kind === "frozen") {
    // serverRevision/serverPayload are present only when the underlying
    // store call computed them (writePlanResource does, for every entry of
    // plan.schema.json's refused-write oneOf branch; deletePlanResource and
    // restorePlanResource do not, and their frozen refusal stays exactly as
    // bare as it always was — out of this task's scope).
    const details = { status: 409 };
    if (result.serverRevision !== undefined)
      details.serverRevision = result.serverRevision;
    if (result.serverPayload !== undefined)
      details.serverPayload = result.serverPayload;
    throw new PlanResourceError(
      "plan_frozen",
      "This non-active plan is read-only.",
      details,
    );
  }
  if (result?.kind === "conflict") {
    const details = {
      status: 409,
      serverRevision: result.serverRevision,
      serverPayload: result.serverPayload,
    };
    // A stale PUT sets the submitted payload aside and names it here so a
    // client can restore it directly (documented in `astro-contracts`'
    // `api/v1.md`). A stale DELETE has no submitted payload, so there is
    // nothing to set aside and `versionId` stays absent.
    if (result.versionId) details.versionId = result.versionId;
    throw new PlanResourceError(
      "plan_conflict",
      "The plan changed on another surface.",
      details,
    );
  }
  return result;
}

/**
 * Framework-free v1 plan service. Route adapters supply an authenticated
 * tenant/user/device identity and turn returned values/errors into HTTP.
 *
 * Methods:
 * - list({ tenantId, filter? }) -> { plans, deletedPlanIds } (`filter`: the main filter of
 *   the list: `to_execute` and `executed` (abandoned and archived plans left
 *   out), `abandoned`, `archived`; absent lists all)
 * - get({ tenantId, planId }) -> plan resource (or PlanResourceError 404)
 * - write({ tenantId, userId, planId, ifMatch, payload, originDeviceId })
 *   -> { resource, created }
 * - remove({ tenantId, userId, planId, ifMatch, refuseInProgress?, force? })
 *   -> undefined: the plan goes to the trash (30 days)
 * - restore({ tenantId, userId, planId, versionId }) -> plan resource
 * - briefing({ tenantId }) -> compact briefing
 * - capabilitiesFor(userId) -> fully composed neutral capability map
 */
export async function createPlanResourceService({
  repository = null,
  databasePath,
  databaseUrl,
  driver,
  dialect,
  entitlementProvider = null,
  capabilities = OPEN_SOURCE_PROFILE,
  // Whether the multi-night plans are open whatever the profile
  // (a private server never restricts them), asked at each write.
  multiNightOpen = () => false,
  now = () => new Date().toISOString(),
} = {}) {
  const store =
    repository ||
    (await createPlanResourceRepository({
      databasePath,
      databaseUrl,
      driver,
      dialect,
    }));
  const provider = entitlementProvider || staticProfile(capabilities);
  const timestamp = () => now();

  return {
    async close() {
      await store.close?.();
    },

    async list({ tenantId, filter = null }) {
      try {
        if (
          filter !== null &&
          filter !== undefined &&
          filter !== "" &&
          !PLAN_LIST_FILTERS.includes(filter)
        )
          throw new PlanResourceError(
            "invalid_request",
            "filter must be to_execute, executed, abandoned or archived.",
          );
        const space = requiredIdentifier(tenantId, "Tenant id");
        const plans = await store.listPlanResources({
          tenantId: space,
          timestamp: timestamp(),
        });
        return {
          plans: filter
            ? plans.filter((plan) => planMatchesListFilter(plan, filter))
            : plans,
          // Additive: the plans deleted on another surface, which a device
          // drops from its copy (a plan in the trash comes back in `plans`
          // when it is restored).
          deletedPlanIds:
            (await store.deletedPlanIds?.({ tenantId: space })) ?? [],
        };
      } catch (error) {
        throw apiError(error);
      }
    },

    async get({ tenantId, planId }) {
      try {
        const resource = await store.getPlanResource({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          planId: resourceIdentifier(planId, "Plan id"),
          timestamp: timestamp(),
        });
        if (!resource)
          throw new PlanResourceError(
            "plan_not_found",
            "The plan was not found.",
            { status: 404 },
          );
        return resource;
      } catch (error) {
        throw apiError(error);
      }
    },

    async versions({ tenantId, planId }) {
      try {
        return {
          versions: await store.listPlanVersions({
            tenantId: requiredIdentifier(tenantId, "Tenant id"),
            planId: resourceIdentifier(planId, "Plan id"),
            timestamp: timestamp(),
          }),
        };
      } catch (error) {
        throw apiError(error);
      }
    },

    async write({
      tenantId,
      userId,
      planId,
      ifMatch,
      payload,
      originDeviceId = null,
      originClientInstanceId = null,
      movingPlanIds = [],
    }) {
      try {
        const expectedRevision = parseIfMatch(ifMatch);
        const normalizedTenantId = requiredIdentifier(tenantId, "Tenant id");
        const normalizedUserId = requiredIdentifier(userId, "User id");
        const { access, capabilities, projectLinks } = await projectLinkRights(
          provider,
          normalizedUserId,
          multiNightOpen,
        );
        // In the read-only window a plan is written only to link or unlink
        // a night, and only by a right still held: a creation is
        // never that, and the store refuses any other change.
        if (
          access.readOnly &&
          (!projectLinks.allowed || expectedRevision === 0)
        )
          throw readOnlyError();
        const planLimit = planLimitFor(capabilities);
        const result = resultOrError(
          await store.writePlanResource({
            tenantId: normalizedTenantId,
            userId: normalizedUserId,
            planId: resourceIdentifier(planId, "Plan id"),
            expectedRevision,
            payload,
            originDeviceId,
            originClientInstanceId,
            planLimit,
            plannerMultiple: capabilities?.["planner.multiple"] !== false,
            projectLinks,
            movingPlanIds,
            timestamp: timestamp(),
          }),
        );
        return { resource: result.resource, created: Boolean(result.created) };
      } catch (error) {
        throw apiError(error);
      }
    },

    /**
     * A deletion is conditioned on the base revision like every other plan
     * write. Revision 0 is the creation form of If-Match and never names an
     * existing plan, so it is refused rather than read as a stale write.
     */
    async remove({
      tenantId,
      userId,
      planId,
      ifMatch,
      originClientInstanceId = null,
      // The web asks before it deletes a plan whose night runs on a device
      // (`409 plan_in_progress`), and `force` takes its open session to the
      // trash with it; a device keeps the rule it always had.
      refuseInProgress = false,
      force = false,
    }) {
      try {
        const expectedRevision = parseIfMatch(ifMatch);
        if (expectedRevision === 0)
          throw new PlanResourceError(
            "invalid_if_match",
            "If-Match must be one quoted positive plan revision.",
          );
        resultOrError(
          await store.deletePlanResource({
            tenantId: requiredIdentifier(tenantId, "Tenant id"),
            userId: requiredIdentifier(userId, "User id"),
            planId: resourceIdentifier(planId, "Plan id"),
            expectedRevision,
            originClientInstanceId,
            refuseInProgress: Boolean(refuseInProgress),
            force: Boolean(force),
            timestamp: timestamp(),
          }),
        );
      } catch (error) {
        throw apiError(error);
      }
    },

    async restore({
      tenantId,
      userId,
      planId,
      versionId,
      originClientInstanceId = null,
    }) {
      try {
        const normalizedUserId = requiredIdentifier(userId, "User id");
        await requireWriteAccess(provider, normalizedUserId);
        const { capabilities, projectLinks } = await projectLinkRights(
          provider,
          normalizedUserId,
          multiNightOpen,
        );
        const result = resultOrError(
          await store.restorePlanResource({
            tenantId: requiredIdentifier(tenantId, "Tenant id"),
            userId: normalizedUserId,
            planId: resourceIdentifier(planId, "Plan id"),
            versionId: resourceIdentifier(versionId, "Version id"),
            originClientInstanceId,
            planLimit: activePlanLimit(capabilities),
            plannerMultiple: capabilities?.["planner.multiple"] !== false,
            projectLinks,
            timestamp: timestamp(),
          }),
        );
        return result.resource;
      } catch (error) {
        throw apiError(error);
      }
    },

    /**
     * The lazy debrief-queue catch-up (see
     * planner-state-repository.js#createPlanResourceRepository's own
     * catchUpNightBounds doc comment). Intended caller: the debrief routes,
     * before GET /v1/plans/debrief-queue applies its "night passed" test, and
     * by POST /v1/plans/{planId}/debrief for its own one plan. Not wired to any
     * route by this task.
     */
    async catchUpNightBounds({ tenantId }) {
      try {
        return await store.catchUpNightBounds({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          timestamp: timestamp(),
        });
      } catch (error) {
        throw apiError(error);
      }
    },

    async briefing({ tenantId }) {
      try {
        return await store.briefing({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          timestamp: timestamp(),
        });
      } catch (error) {
        throw apiError(error);
      }
    },

    /**
     * The rights the web planner's plan writes (`PUT /api/plans`, the
     * resolution and the restoration of a version) carry to the store: the
     * numeric guard, the night rule, the read-only window and the right on
     * the links to a multi-night plan.
     */
    async writeRightsFor(userId) {
      try {
        const normalizedUserId = requiredIdentifier(userId, "User id");
        const { access, capabilities, projectLinks } = await projectLinkRights(
          provider,
          normalizedUserId,
          multiNightOpen,
        );
        return {
          planLimit: planLimitFor(capabilities),
          plannerMultiple: capabilities?.["planner.multiple"] !== false,
          readOnly: access?.readOnly === true,
          projectLinks,
        };
      } catch (error) {
        throw apiError(error);
      }
    },

    async capabilitiesFor(userId) {
      try {
        const normalizedUserId =
          userId === null || userId === undefined
            ? null
            : requiredIdentifier(userId, "User id");
        // Copy the fully composed profile so an adapter cannot mutate the
        // provider-owned value between requests.
        return { ...(await provider.capabilitiesFor(normalizedUserId)) };
      } catch (error) {
        throw apiError(error);
      }
    },

    /**
     * The capabilities of a phone with no space: what the purchases the
     * provider proved for it grant; a visitor's when the provider proves
     * none (a private server).
     */
    async capabilitiesForAnonymousDevice(deviceId) {
      try {
        return {
          ...(await anonymousDeviceCapabilities(
            provider,
            requiredIdentifier(deviceId, "Device id"),
          )),
        };
      } catch (error) {
        throw apiError(error);
      }
    },
  };
}
