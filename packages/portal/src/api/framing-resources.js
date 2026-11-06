import { resolveWriteAccess, staticProfile } from "../capabilities/provider.js";
import { OPEN_SOURCE_PROFILE } from "../capabilities/profiles.js";
import {
  createFramingResourceRepository,
  FramingResourceStoreError,
} from "../persistence/framing-repository.js";

/** Framework-free v1 framing service, on the model of `plan-resources.js`.
 * Route adapters supply an authenticated tenant/user identity and turn
 * returned values/errors into HTTP. */
export class FramingResourceError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "FramingResourceError";
    this.code = code;
    this.status = status;
    this.body = { error: { code, message }, ...details };
    Object.assign(this, details);
  }
}

function apiError(error) {
  if (error instanceof FramingResourceError) return error;
  if (error instanceof FramingResourceStoreError) {
    const {
      code,
      message,
      status,
      name: _name,
      stack: _stack,
      ...details
    } = error;
    return new FramingResourceError(code, message, { status, ...details });
  }
  return new FramingResourceError(
    "framing_storage_unavailable",
    "Framing storage is unavailable.",
    { status: 503 },
  );
}

function requiredIdentifier(value, label) {
  const result = String(value || "").trim();
  if (!result)
    throw new FramingResourceError("invalid_request", `${label} is required.`);
  return result;
}

function resourceIdentifier(value, label) {
  const result = requiredIdentifier(value, label);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      result,
    )
  )
    throw new FramingResourceError(
      "invalid_request",
      `${label} must be a UUID.`,
    );
  return result;
}

function parseIfMatch(value) {
  if (value === null || value === undefined || value === "")
    throw new FramingResourceError(
      "precondition_required",
      "If-Match is required for a framing write.",
      { status: 428 },
    );
  if (Number.isInteger(value) && value >= 0) return value;
  const match = /^"(0|[1-9]\d*)"$/.exec(String(value).trim());
  if (!match || !Number.isSafeInteger(Number(match[1])))
    throw new FramingResourceError(
      "invalid_if_match",
      "If-Match must be one quoted non-negative framing revision.",
    );
  return Number(match[1]);
}

function resultOrError(result) {
  if (result?.kind === "missing")
    throw new FramingResourceError(
      "framing_not_found",
      "The framing was not found.",
      { status: 404 },
    );
  if (result?.kind === "conflict")
    throw new FramingResourceError(
      "framing_conflict",
      "The framing changed on another surface.",
      { status: 409, framing: result.framing },
    );
  if (result?.kind === "locked")
    throw new FramingResourceError(
      "framing_locked",
      "This framing was used on an executed plan and cannot be edited, only renamed or copied.",
      { status: 409, framing: result.framing },
    );
  if (result?.kind === "archived")
    throw new FramingResourceError(
      "framing_archived",
      "This framing is archived; restore it before writing to it.",
      { status: 409, framing: result.framing },
    );
  if (result?.kind === "in_use")
    throw new FramingResourceError(
      "framing_in_use",
      "This framing is still referenced by pending plans.",
      { status: 409, pendingPlans: result.pendingPlans },
    );
  if (result?.kind === "not_archived")
    throw new FramingResourceError(
      "framing_not_archived",
      "This framing is not archived.",
      { status: 409 },
    );
  return result;
}

/**
 * Whether a framing's payload is a mosaic: its target stores a sky surface
 * to cover (`target.framing.mosaic`, amendment A2) rather than the single
 * field of the equipment that draws it.
 */
export function isMosaicFramingPayload(payload) {
  const mosaic = payload?.target?.framing?.mosaic;
  return Boolean(mosaic) && typeof mosaic === "object";
}

/**
 * Methods:
 * - list({ tenantId }) -> { framings }
 * - get({ tenantId, framingId }) -> framing resource (or 404)
 * - write({ tenantId, userId, framingId, ifMatch, name, payload, ... })
 *   -> { resource, created }
 * - remove({ tenantId, framingId, ifMatch, ... }) -> { archived, framing } | undefined
 * - restore({ tenantId, framingId, ... }) -> framing resource
 */
export async function createFramingResourceService({
  repository = null,
  databasePath,
  databaseUrl,
  driver,
  dialect,
  entitlementProvider = null,
  capabilities = OPEN_SOURCE_PROFILE,
  now = () => new Date().toISOString(),
} = {}) {
  const store =
    repository ||
    (await createFramingResourceRepository({
      databasePath,
      databaseUrl,
      driver,
      dialect,
    }));
  const provider = entitlementProvider || staticProfile(capabilities);
  const timestamp = () => now();

  // A framing of a single field (a centre and an orientation) belongs to the
  // planner every profile has; a mosaic -- a framing that stores a sky
  // surface to cover with several panels -- needs `planner.mosaic`, to write
  // it and to restore it.
  async function requireMosaicCapability(userId, payload) {
    if (!isMosaicFramingPayload(payload)) return;
    const granted = await provider.capabilitiesFor(userId);
    if (!granted?.["planner.mosaic"])
      throw new FramingResourceError(
        "capability_required",
        "This account cannot create or edit mosaics.",
        { status: 403 },
      );
  }

  /**
   * The read-only write gate, `write` only: `remove` (archiving)
   * and `restore` (un-archiving) are the person managing their own
   * existing library, not new content, on the same doctrine as
   * `plan-resources.js`'s own `remove` staying exempt ("nothing is
   * deleted", never blocking someone from cleaning up or un-doing
   * their own cleanup).
   */
  async function requireWriteAccess(userId) {
    const access = await resolveWriteAccess(provider, userId);
    if (access.readOnly)
      throw new FramingResourceError(
        "entitlement_read_only",
        "This account's subscription has ended: framing writes are suspended; existing framings remain readable and exportable.",
        { status: 403 },
      );
  }

  return {
    async close() {
      await store.close?.();
    },

    async list({ tenantId }) {
      try {
        return {
          framings: await store.list({
            tenantId: requiredIdentifier(tenantId, "Tenant id"),
          }),
        };
      } catch (error) {
        throw apiError(error);
      }
    },

    async get({ tenantId, framingId }) {
      try {
        const resource = await store.get({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          framingId: resourceIdentifier(framingId, "Framing id"),
        });
        if (!resource)
          throw new FramingResourceError(
            "framing_not_found",
            "The framing was not found.",
            { status: 404 },
          );
        return resource;
      } catch (error) {
        throw apiError(error);
      }
    },

    async write({
      tenantId,
      userId,
      framingId,
      ifMatch,
      name,
      payload,
      originDeviceId = null,
      originClientInstanceId = null,
    }) {
      try {
        const normalizedUserId = requiredIdentifier(userId, "User id");
        await requireWriteAccess(normalizedUserId);
        await requireMosaicCapability(normalizedUserId, payload);
        const expectedRevision = parseIfMatch(ifMatch);
        const result = resultOrError(
          await store.write({
            tenantId: requiredIdentifier(tenantId, "Tenant id"),
            userId: normalizedUserId,
            framingId: resourceIdentifier(framingId, "Framing id"),
            expectedRevision,
            name,
            payload,
            originDeviceId,
            originClientInstanceId,
            timestamp: timestamp(),
          }),
        );
        return { resource: result.resource, created: Boolean(result.created) };
      } catch (error) {
        throw apiError(error);
      }
    },

    async remove({
      tenantId,
      userId,
      framingId,
      ifMatch,
      originClientInstanceId = null,
    }) {
      try {
        // No `planner.mosaic`/write-access check here, on purpose: archiving/deleting a
        // framing is the person's own voluntary cleanup, exactly like
        // `plan-resources.js`'s own `remove` (no capability check at all): the
        // person is never stopped from cleaning up their own data, including a
        // framing created while `planner.mosaic` was granted and since lost (any
        // capability change).
        requiredIdentifier(userId, "User id");
        const expectedRevision = parseIfMatch(ifMatch);
        if (expectedRevision === 0)
          throw new FramingResourceError(
            "invalid_if_match",
            "If-Match must be one quoted positive framing revision.",
          );
        const result = resultOrError(
          await store.remove({
            tenantId: requiredIdentifier(tenantId, "Tenant id"),
            framingId: resourceIdentifier(framingId, "Framing id"),
            expectedRevision,
            originClientInstanceId,
            timestamp: timestamp(),
          }),
        );
        return result.archived
          ? { archived: true, framing: result.resource }
          : undefined;
      } catch (error) {
        throw apiError(error);
      }
    },

    async restore({
      tenantId,
      userId,
      framingId,
      originClientInstanceId = null,
    }) {
      try {
        const normalizedUserId = requiredIdentifier(userId, "User id");
        const normalizedTenantId = requiredIdentifier(tenantId, "Tenant id");
        const normalizedFramingId = resourceIdentifier(framingId, "Framing id");
        const archived = await store.get({
          tenantId: normalizedTenantId,
          framingId: normalizedFramingId,
        });
        await requireMosaicCapability(normalizedUserId, archived?.payload);
        const result = resultOrError(
          await store.restore({
            tenantId: normalizedTenantId,
            framingId: normalizedFramingId,
            originClientInstanceId,
            timestamp: timestamp(),
          }),
        );
        return result.resource;
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
        return { ...(await provider.capabilitiesFor(normalizedUserId)) };
      } catch (error) {
        throw apiError(error);
      }
    },
  };
}
