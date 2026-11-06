import { optionalDeviceV1Access } from "../../../../lib/v1/access.js";
import { v1Error, v1Json } from "../../../../lib/v1/response.js";
import { targetLibrarySearch } from "../../../../lib/target-library.server.js";
import { targetFavoriteRepository } from "../../../../lib/target-favorite-repository.server.js";
import {
  favoriteFilterIds,
  targetSelectionFrom,
} from "../../../../lib/v1/targets-query.js";

function libraryFailure(error) {
  return v1Error(error, {
    code: "target_library_unavailable",
    message: "The target library is unavailable.",
    status: 503,
  });
}

/**
 * The shared catalogue is public, exactly as the web library route is. A
 * paired device additionally receives its owner's favorite flags, and may
 * restrict the search to its own favorites.
 */
export async function GET(request) {
  // Reading the shared catalogue is not plan synchronization.
  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  const url = new URL(request.url);
  const favoritesOnly = url.searchParams.get("favorites") === "1";
  const favoriteMode = url.searchParams.get("favoriteMode") || "";
  try {
    if (favoritesOnly && !access.userId)
      return v1Error(
        Object.assign(new Error("Device authentication required."), {
          code: "device_authentication_required",
          status: 401,
        }),
      );
    const repository = access.userId ? await targetFavoriteRepository() : null;
    if (access.userId && !repository)
      throw Object.assign(new Error("Favorite storage is unavailable."), {
        code: "favorite_storage_unavailable",
        status: 503,
      });
    const favorites = repository
      ? await repository.favoriteTargetIdsByMode(access.userId)
      : null;
    const result = await targetLibrarySearch({
      ...targetSelectionFrom(url),
      offset: url.searchParams.get("offset") || 0,
      limit: url.searchParams.get("limit") || 48,
      targetIds: favoritesOnly
        ? favoriteFilterIds(favorites, favoriteMode)
        : null,
    });
    if (!favorites)
      return v1Json(result, {
        headers: { "Cache-Control": "public, max-age=300" },
      });
    const photoFavorites = new Set(favorites.photoTargetIds);
    const visualFavorites = new Set(favorites.visualTargetIds);
    return v1Json({
      ...result,
      targets: result.targets.map((target) => ({
        ...target,
        photoFavorite: photoFavorites.has(target.id),
        visualFavorite: visualFavorites.has(target.id),
      })),
    });
  } catch (error) {
    return libraryFailure(error);
  }
}
