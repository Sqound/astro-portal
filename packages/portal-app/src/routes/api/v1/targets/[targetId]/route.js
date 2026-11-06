import { isShippedLocale } from "astro-contracts/locales";
import { optionalDeviceV1Access } from "../../../../../lib/v1/access.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";
import { targetKnowledgeFor } from "../../../../../lib/target-library.server.js";
import { targetFavoriteRepository } from "../../../../../lib/target-favorite-repository.server.js";

const targetIdPattern = /^[a-z0-9][a-z0-9 .:_-]{0,199}$/i;

function notFound() {
  return v1Error(
    Object.assign(new Error("Target was not found."), {
      code: "target_not_found",
      status: 404,
    }),
  );
}

/** Public target knowledge, with the caller's favorite flags when paired. */
export async function GET(request, { params }) {
  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  const { targetId } = await params;
  const id = decodeURIComponent(targetId || "").trim();
  const url = new URL(request.url);
  const locale = isShippedLocale(url.searchParams.get("locale"))
    ? url.searchParams.get("locale")
    : "en";
  if (!targetIdPattern.test(id)) return notFound();
  try {
    // A constellation's two lists (its bright stars, its targets) hold at
    // most `listLimit` items each, with their total.
    const listLimit = Number(url.searchParams.get("listLimit"));
    const knowledge = await targetKnowledgeFor({ id }, locale, {
      ...(Number.isInteger(listLimit) && listLimit > 0 ? { listLimit } : {}),
    });
    if (!knowledge) return notFound();
    if (!access.userId)
      return v1Json(knowledge, {
        headers: { "Cache-Control": "public, max-age=300" },
      });
    const repository = await targetFavoriteRepository();
    if (!repository)
      throw Object.assign(new Error("Favorite storage is unavailable."), {
        code: "favorite_storage_unavailable",
        status: 503,
      });
    const favorites = await repository.favoriteTargetIdsByMode(access.userId);
    return v1Json({
      ...knowledge,
      photoFavorite: favorites.photoTargetIds.includes(knowledge.id),
      visualFavorite: favorites.visualTargetIds.includes(knowledge.id),
    });
  } catch (error) {
    return v1Error(error, {
      code: "target_library_unavailable",
      message: "The target library is unavailable.",
      status: 503,
    });
  }
}
