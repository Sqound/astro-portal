import { isShippedLocale } from "astro-contracts/locales";
import { targetLibrarySortOrders } from "../target-library.server.js";

/**
 * The catalogue query string, parsed and validated once.
 *
 * Two public routes read the same shared catalogue: `GET /v1/targets`, which
 * answers with the portal's full presentation of each entry, and
 * `GET /v1/target-index`, which answers with the compact columnar index of
 * the same entries. They differ in what they project, never in which targets
 * they select or in how they order them, so the filters, the ordering
 * parameters and their refusals live here rather than in either route.
 */

export function invalidRequest(message) {
  return Object.assign(new Error(message), {
    code: "invalid_request",
    status: 400,
  });
}

/**
 * `sort=planner` and `sort=notoriety` are opt-in: an absent or empty
 * parameter keeps the designation ordering every existing client reads these
 * routes for (the planner's catalogue screens ask for `notoriety`). Anything
 * else is a client mistake and is
 * reported rather than silently downgraded to the default ordering.
 */
export function requestedSort(value) {
  if (value === null || value === "") return "";
  if (!targetLibrarySortOrders.includes(value))
    throw invalidRequest(
      `sort must be one of ${targetLibrarySortOrders.join(", ")}.`,
    );
  return value;
}

/**
 * `mode` (`visual`, `photo`) keeps, of a selection, the targets proposed in
 * that mode, and counts each selection in it; absent or empty, every target
 * of the selection. Anything else is reported, as for `sort`.
 */
export function requestedMode(value) {
  if (value === null || value === "") return "";
  if (value !== "visual" && value !== "photo")
    throw invalidRequest("mode must be one of visual, photo.");
  return value;
}

/**
 * The two optional observer parameters of the planner ordering. They only
 * describe how to rank, never what to return, so an absent value is valid:
 * the ranking then simply carries no visibility term.
 */
export function optionalDegrees(value, field, minimum, maximum) {
  if (value === null || value.trim() === "") return null;
  const degrees = Number(value);
  if (!Number.isFinite(degrees) || degrees < minimum || degrees > maximum)
    throw invalidRequest(
      `${field} must be a number between ${minimum} and ${maximum}.`,
    );
  return degrees;
}

export function requestedLocale(url) {
  return isShippedLocale(url.searchParams.get("locale"))
    ? url.searchParams.get("locale")
    : "en";
}

export function favoriteFilterIds(favorites, mode) {
  if (mode === "photo") return favorites.photoTargetIds;
  if (mode === "visual") return favorites.visualTargetIds;
  return [
    ...new Set([...favorites.photoTargetIds, ...favorites.visualTargetIds]),
  ];
}

/**
 * Every filter and ordering term of the query string, ready for
 * `targetLibrarySearch` or `targetIndexSearch`. Pagination is left to the
 * caller: the two routes cap a page at different sizes, because a compact
 * row is a fraction of a presented target.
 */
export function targetSelectionFrom(url) {
  return {
    locale: requestedLocale(url),
    query: url.searchParams.get("q") || "",
    type: url.searchParams.get("type") || "",
    constellation: url.searchParams.get("constellation") || "",
    catalogue: url.searchParams.get("catalogue") || "",
    selection: url.searchParams.get("selection") || "",
    mode: requestedMode(url.searchParams.get("mode")),
    hemisphere: url.searchParams.get("hemisphere") || "",
    season: url.searchParams.get("season") || "",
    featured: url.searchParams.get("featured") === "1",
    sort: requestedSort(url.searchParams.get("sort")),
    latitude: optionalDegrees(
      url.searchParams.get("latitude"),
      "latitude",
      -90,
      90,
    ),
    minimumAltitude: optionalDegrees(
      url.searchParams.get("minimumAltitude"),
      "minimumAltitude",
      0,
      89,
    ),
  };
}
