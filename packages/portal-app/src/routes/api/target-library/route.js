import { isShippedLocale } from "astro-contracts/locales";
import { targetLibrarySearch } from "../../../lib/target-library.server.js";
import { authEnabled, authService } from "../../../lib/auth.server.js";
import { targetFavoriteRepository } from "../../../lib/target-favorite-repository.server.js";
import { requestedSort } from "../../../lib/v1/targets-query.js";

/** The most identifiers one read may carry: a browser's own favorites. */
const maximumBrowserTargetIds = 500;

export async function GET(request) {
  const url = new URL(request.url);
  const locale = isShippedLocale(url.searchParams.get("locale"))
    ? url.searchParams.get("locale")
    : "en";
  const favoritesOnly = url.searchParams.get("favorites") === "1";
  const favoriteMode = url.searchParams.get("favoriteMode") || "";
  let sort;
  try {
    sort = requestedSort(url.searchParams.get("sort"));
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  try {
    if (favoritesOnly && !authEnabled())
      return Response.json(
        { error: "Favorite targets require enabled authentication." },
        { status: 403 },
      );
    const session = favoritesOnly
      ? await authService().requireSession(request.headers)
      : null;
    const repository = session ? await targetFavoriteRepository() : null;
    if (session && !repository)
      throw new Error("Favorite storage is unavailable.");
    const favorites = session
      ? await repository.favoriteTargetIds(session.user_id, {
          mode: favoriteMode,
        })
      : null;
    // The favorites a browser keeps without a space are asked by their
    // identifiers (`targetIds=a,b`; present and empty: no target). A public
    // read of the shared catalogue, bounded; nothing personal is stored.
    const browserTargetIds =
      !favoritesOnly && url.searchParams.has("targetIds")
        ? url.searchParams
            .get("targetIds")
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id && id.length <= 200)
            .slice(0, maximumBrowserTargetIds)
        : null;
    const result = await targetLibrarySearch({
      locale,
      query: url.searchParams.get("q") || "",
      type: url.searchParams.get("type") || "",
      constellation: url.searchParams.get("constellation") || "",
      catalogue: url.searchParams.get("catalogue") || "",
      selection: url.searchParams.get("selection") || "",
      mode: url.searchParams.get("mode") || "",
      hemisphere: url.searchParams.get("hemisphere") || "",
      season: url.searchParams.get("season") || "",
      offset: url.searchParams.get("offset") || 0,
      limit: url.searchParams.get("limit") || 48,
      featured: url.searchParams.get("featured") === "1",
      sort,
      targetIds: favorites ?? browserTargetIds,
    });
    return Response.json(result, {
      headers: {
        "cache-control": favoritesOnly ? "no-store" : "public, max-age=300",
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 401 });
  }
}
