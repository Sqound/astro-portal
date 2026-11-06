import { resolveWriteAccess, staticProfile } from "../capabilities/provider.js";
import { OPEN_SOURCE_PROFILE } from "../capabilities/profiles.js";
import {
  createPlaceRepository,
  PlaceStoreError,
} from "../persistence/place-repository.js";

/**
 * Framework-free v1 places service (`v1.md`, « Places »), on the model of
 * `framing-resources.js`. Route
 * adapters supply an authenticated tenant/user identity (a web session or a
 * device token) and turn returned values and errors into HTTP.
 *
 * Every write (`write`, `remove`, `setDefault`, `importPlaces`) passes the
 * read-only gate of `POST /v1/equipment`: in the read-only window it answers
 * `403 entitlement_read_only`, and the places stay readable (the device
 * keeps using its own copy and its queue waits). No capability is added: reading
 * and writing one's places needs none.
 */
export class PlaceResourceError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "PlaceResourceError";
    this.code = code;
    this.status = status;
    this.body = { error: { code, message }, ...details };
    Object.assign(this, details);
  }
}

function apiError(error) {
  if (error instanceof PlaceResourceError) return error;
  if (error instanceof PlaceStoreError) {
    const {
      code,
      message,
      status,
      name: _name,
      stack: _stack,
      ...details
    } = error;
    return new PlaceResourceError(code, message, { status, ...details });
  }
  return new PlaceResourceError(
    "place_storage_unavailable",
    "Place storage is unavailable.",
    { status: 503 },
  );
}

function requiredIdentifier(value, label) {
  const result = String(value ?? "").trim();
  if (!result)
    throw new PlaceResourceError("invalid_request", `${label} is required.`);
  return result;
}

const notFound = () =>
  new PlaceResourceError("place_not_found", "The place was not found.", {
    status: 404,
  });

/**
 * Methods:
 * - list({ tenantId }) → { places, defaultPlaceId, defaultPlaceEditedAt }
 * - get({ tenantId, placeId }) → place (or 404)
 * - write({ tenantId, userId, placeId, body, … }) → { place, applied, created }
 * - remove({ tenantId, userId, placeId, at, … }) → { deleted: true } | { deleted: false, place }
 * - setDefault({ tenantId, userId, body, … }) → { defaultPlaceId, defaultPlaceEditedAt, applied }
 * - importPlaces({ tenantId, userId, body, … }) → { places, imported }
 */
export async function createPlaceResourceService({
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
    (await createPlaceRepository({
      databasePath,
      databaseUrl,
      driver,
      dialect,
    }));
  const provider = entitlementProvider || staticProfile(capabilities);

  async function requireWriteAccess(userId) {
    const access = await resolveWriteAccess(
      provider,
      requiredIdentifier(userId, "User id"),
    );
    if (access.readOnly)
      throw new PlaceResourceError(
        "entitlement_read_only",
        "This account's subscription has ended: place writes are suspended; existing places remain readable and exportable.",
        { status: 403 },
      );
  }

  return {
    async close() {
      await store.close?.();
    },

    async list({ tenantId }) {
      try {
        return await store.list({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          timestamp: now(),
        });
      } catch (error) {
        throw apiError(error);
      }
    },

    async get({ tenantId, placeId }) {
      try {
        const place = await store.get({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          placeId: requiredIdentifier(placeId, "Place id"),
        });
        if (!place) throw notFound();
        return place;
      } catch (error) {
        throw apiError(error);
      }
    },

    async write({
      tenantId,
      userId,
      placeId,
      body,
      originClientInstanceId = null,
    }) {
      try {
        await requireWriteAccess(userId);
        return await store.write({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          placeId,
          body,
          originClientInstanceId,
          timestamp: now(),
        });
      } catch (error) {
        throw apiError(error);
      }
    },

    async remove({
      tenantId,
      userId,
      placeId,
      at = null,
      originClientInstanceId = null,
    }) {
      try {
        await requireWriteAccess(userId);
        const result = await store.remove({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          placeId: requiredIdentifier(placeId, "Place id"),
          at,
          originClientInstanceId,
          timestamp: now(),
        });
        return result.deleted
          ? { deleted: true }
          : { deleted: false, place: result.place };
      } catch (error) {
        throw apiError(error);
      }
    },

    async setDefault({
      tenantId,
      userId,
      body,
      originClientInstanceId = null,
    }) {
      try {
        await requireWriteAccess(userId);
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw new PlaceResourceError(
            "invalid_request",
            "A JSON { placeId, editedAt } is required.",
          );
        if (!("placeId" in body))
          throw new PlaceResourceError(
            "invalid_request",
            "placeId, a place's id or null, is required.",
          );
        return await store.setDefault({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          placeId: body.placeId,
          editedAt: body.editedAt,
          originClientInstanceId,
          timestamp: now(),
        });
      } catch (error) {
        throw apiError(error);
      }
    },

    async importPlaces({
      tenantId,
      userId,
      body,
      originClientInstanceId = null,
    }) {
      try {
        await requireWriteAccess(userId);
        return await store.importPlaces({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          places: body?.places,
          originClientInstanceId,
          timestamp: now(),
        });
      } catch (error) {
        throw apiError(error);
      }
    },
  };
}
