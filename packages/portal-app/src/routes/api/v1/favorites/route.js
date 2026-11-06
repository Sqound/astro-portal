import {
  clientInstanceIdFrom,
  deviceV1Access,
} from "../../../../lib/v1/access.js";
import { writeAccessFor } from "../../../../lib/v1/entitlement-provider.js";
import { v1Error, v1Json } from "../../../../lib/v1/response.js";
import { targetLibrarySearch } from "../../../../lib/target-library.server.js";
import { targetFavoriteRepository } from "../../../../lib/target-favorite-repository.server.js";
import { readJsonBody } from "portal/api/json-body.js";

/** The most items one import may carry (a phone's own favorites). */
const favoriteImportMaximumItems = 500;

const storageUnavailable = () =>
  Object.assign(new Error("Favorite storage is unavailable."), {
    code: "favorite_storage_unavailable",
    status: 503,
  });

const invalidRequest = (message) =>
  v1Error(
    Object.assign(new Error(message), { code: "invalid_request", status: 400 }),
  );

/** The paired device reads its own owner's favorites, in both modes. */
export async function GET(request) {
  // Favorites are a catalogue preference, not plan synchronization.
  const access = await deviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  try {
    const repository = await targetFavoriteRepository();
    if (!repository) throw storageUnavailable();
    return v1Json(await repository.favoriteTargetIdsByMode(access.userId));
  } catch (error) {
    return v1Error(error, {
      code: "favorite_storage_unavailable",
      message: "Favorite storage is unavailable.",
      status: 503,
    });
  }
}

/**
 * POST /v1/favorites `{ action: "import", items: [{ targetId, mode }] }`: the favorites a phone kept — made
 * without a space and sent when the device is attached, or ticked offline —
 * added to its owner's in one call. Additive and idempotent: sending the
 * same items again changes nothing, nothing is removed, and a target the
 * catalogue no longer has is reported (`unknown_target`) rather than
 * refused. A paired device's bearer only, like `PUT /v1/favorites/{id}`,
 * with the same soft-downgrade gate (an import only adds).
 */
export async function POST(request) {
  const access = await deviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    if (error?.code === "payload_too_large") return v1Error(error);
    return invalidRequest("A JSON favorite import is required.");
  }
  if (body?.action !== "import" || !Array.isArray(body?.items))
    return invalidRequest(
      "Send { action: 'import', items: [{ targetId, mode }] }.",
    );
  if (body.items.length > favoriteImportMaximumItems)
    return invalidRequest(
      `An import carries ${favoriteImportMaximumItems} favorites at most.`,
    );
  const items = [];
  for (const item of body.items) {
    const targetId =
      typeof item?.targetId === "string" ? item.targetId.trim() : "";
    if (
      !targetId ||
      targetId.length > 200 ||
      !["photo", "visual"].includes(item?.mode)
    )
      return invalidRequest(
        "Each favorite carries a target identifier and a photo or visual mode.",
      );
    items.push({ targetId, mode: item.mode });
  }
  const writeAccess = await writeAccessFor(access.userId);
  if (writeAccess.readOnly)
    return v1Error(
      Object.assign(
        new Error(
          "This account's subscription has ended: new favorites are suspended; existing favorites remain readable and exportable.",
        ),
        { code: "entitlement_read_only", status: 403 },
      ),
    );
  try {
    // As `PUT /v1/favorites/{id}`: reading the shared catalogue first makes
    // sure it has been synchronized into persistence before the favorite
    // relation checks its targets.
    if (items.length)
      await targetLibrarySearch({
        targetIds: items.map((item) => item.targetId),
        limit: 1,
      });
    const repository = await targetFavoriteRepository();
    if (!repository) throw storageUnavailable();
    return v1Json(
      await repository.importTargetFavorites({
        tenantId: access.tenantId,
        userId: access.userId,
        items,
        originClientInstanceId: clientInstanceIdFrom(request),
      }),
    );
  } catch (error) {
    return v1Error(error, {
      code: "favorite_storage_unavailable",
      message: "Favorite storage is unavailable.",
      status: 503,
    });
  }
}
