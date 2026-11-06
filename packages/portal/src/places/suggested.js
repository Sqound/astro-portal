// Suggested places around a centre: named viewpoints, campsites, parks and
// picnic sites from OpenStreetMap, relayed by the service so the source never
// sees the observer, each with the sky-darkness estimate of the installed
// raster (docs/PLACES.md).
//
// What the service sees and keeps: a centre rounded to 0.05° (about 5 km)
// before anything else, a radius among four values, the types asked for. The
// source's answer is kept in memory for 30 minutes (250 entries at most),
// never written anywhere. The local source uses a spherical radius predicate;
// only the client computes distance from its own unrounded reference.

import { createOsmExtractSource, sphericalDistance } from "./osm-extract.js";
import { placeCoordinates } from "../planner/state.js";
import { createPlannerSkyQualityCache } from "../planner/sky-quality.server.js";
import {
  overpassAroundQuery,
  overpassElementQuery,
  parseOsmReference,
  placeFromOverpassElement,
  placeTypes,
  placesSourceSettings,
  queryOverpass,
} from "./overpass.js";

export const placesCentreStepDegrees = 0.05;
export const placesRadiiKm = Object.freeze([10, 30, 60, 100]);
export const placesResultLimit = 50;
export const placesCacheLimit = 250;
export const placesCacheMs = 30 * 60 * 1000;
// One source request at a time, 1.1 s apart at least, process-wide: the
// throttle of the address search (planner/location.server.js), which keeps a
// public Overpass instance's fair-use rules.
export const placesSourceIntervalMs = 1100;

export const placesAttribution = Object.freeze({
  text: "© OpenStreetMap contributors",
  url: "https://www.openstreetmap.org/copyright",
  licence: "ODbL-1.0",
});

/**
 * The search centre as the service (and the client, before sending it) uses
 * it: each coordinate rounded to the nearest 0.05°, written with two
 * decimals. `null` for unusable coordinates.
 */
export function roundPlacesCentre(value) {
  const coordinates = placeCoordinates(value);
  if (!coordinates) return null;
  const round = (number) =>
    Number(
      (
        Math.round(number / placesCentreStepDegrees) * placesCentreStepDegrees
      ).toFixed(2),
    ) + 0;
  return {
    latitude: round(coordinates.latitude),
    longitude: round(coordinates.longitude),
  };
}

const invalid = (message) =>
  Object.assign(new Error(message), { code: "invalid" });

/** `types` as a comma-separated string or an array; absent = every type. */
export function placesTypesFromParameter(value) {
  const list = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
  if (!list.length) return [...placeTypes];
  const unknown = list.filter((entry) => !placeTypes.includes(entry));
  if (unknown.length)
    throw invalid(`Unknown place type: ${unknown.join(", ")}.`);
  return placeTypes.filter((type) => list.includes(type));
}

// Darkest first (to the hundredth of a magnitude, the figure the client
// writes), then nearer to the search centre, then by name. A region at the
// dark end of the raster reads the same everywhere, so the fifty places kept
// among many equal skies must be the nearest ones, not the first by name. The
// centre is the one the service was given, already rounded to about 5 km: the
// service still does not know the observer's position.
const darkestFirst = (centre) => (left, right) =>
  Math.round((right.skyQuality?.sqm ?? -Infinity) * 100) -
    Math.round((left.skyQuality?.sqm ?? -Infinity) * 100) ||
  sphericalDistance(centre, left) - sphericalDistance(centre, right) ||
  left.name.localeCompare(right.name) ||
  left.id.localeCompare(right.id);

/**
 * The places service. Every collaborator is injectable for tests: `request`
 * (fetch), `now`, `intervalMs` (the throttle), `skyQuality` (the darkness
 * estimate at a position, the function of `GET /v1/sky-quality`), `env`.
 */
export function createPlacesService({
  request = fetch,
  now = Date.now,
  intervalMs = placesSourceIntervalMs,
  skyQuality = createPlannerSkyQualityCache(),
  env = process.env,
} = {}) {
  const cache = new Map();
  let queue = Promise.resolve();
  let lastRequest = -Infinity;
  let local, localPath;
  function localSource() {
    const settings = placesSourceSettings(env);
    if (!settings.enabled)
      throw Object.assign(new Error("Suggested places are switched off."), {
        code: "disabled",
      });
    if (settings.source === "overpass") return null;
    if (!local || localPath !== settings.path) {
      local?.close();
      localPath = settings.path;
      local = createOsmExtractSource({ path: settings.path, now });
    }
    return local;
  }

  async function source(query) {
    const settings = placesSourceSettings(env);
    if (!settings.enabled)
      throw Object.assign(new Error("Suggested places are switched off."), {
        code: "disabled",
      });
    const key = `${settings.url}\n${query}`;
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached;
    const lookup = queue.then(async () => {
      const again = cache.get(key);
      if (again && again.expires > now()) return again;
      const delay = Math.max(0, intervalMs - (now() - lastRequest));
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      lastRequest = now();
      const elements = await queryOverpass(query, {
        request,
        url: settings.url,
      });
      const fetchedAt = now();
      const entry = {
        elements,
        fetchedAt: new Date(fetchedAt).toISOString(),
        expires: fetchedAt + placesCacheMs,
      };
      cache.delete(key);
      cache.set(key, entry);
      while (cache.size > placesCacheLimit)
        cache.delete(cache.keys().next().value);
      return entry;
    });
    queue = lookup.catch(() => {});
    return lookup;
  }

  async function darkness(place) {
    try {
      const estimate = await skyQuality({
        latitude: place.latitude,
        longitude: place.longitude,
      });
      if (
        !Number.isFinite(estimate?.sqm) ||
        !Number.isInteger(estimate?.bortleClass)
      )
        return null;
      return {
        bortle: estimate.bortleClass,
        sqm: estimate.sqm,
        estimate: true,
      };
    } catch {
      // No raster installed, or a position it cannot estimate.
      return null;
    }
  }

  const withDarkness = async (place) => ({
    ...place,
    skyQuality: await darkness(place),
  });

  return {
    /**
     * `{ latitude, longitude, radiusKm, types, locale }` → `{ results,
     * truncated, attribution, source, fetchedAt }`. Throws `code: "invalid"`
     * for a bad request, `"disabled"` when switched off, `"source"` when the
     * source fails.
     */
    async suggest({ latitude, longitude, radiusKm, types, locale } = {}) {
      const centre = roundPlacesCentre({ latitude, longitude });
      if (!centre) throw invalid("Valid latitude and longitude are required.");
      const radius = Number(radiusKm);
      if (!placesRadiiKm.includes(radius))
        throw invalid(`The radius is one of ${placesRadiiKm.join(", ")} km.`);
      const wanted = placesTypesFromParameter(types);
      const extract = localSource();
      if (extract) {
        const answer = extract.suggest({
          ...centre,
          radiusKm: radius,
          types: wanted,
          locale,
        });
        const results = answer.places.sort(darkestFirst(centre));
        return {
          results: results.slice(0, placesResultLimit),
          truncated: results.length > placesResultLimit,
          attribution: { ...placesAttribution },
          source: "osm",
          fetchedAt: answer.fetchedAt,
        };
      }
      const answer = await source(
        overpassAroundQuery({ ...centre, radiusKm: radius, types: wanted }),
      );
      const seen = new Set();
      const places = [];
      for (const element of answer.elements) {
        const place = placeFromOverpassElement(element, locale);
        if (!place || !wanted.includes(place.type) || seen.has(place.id))
          continue;
        seen.add(place.id);
        places.push(place);
      }
      const results = (await Promise.all(places.map(withDarkness))).sort(
        darkestFirst(centre),
      );
      return {
        results: results.slice(0, placesResultLimit),
        truncated: results.length > placesResultLimit,
        attribution: { ...placesAttribution },
        source: "osm",
        fetchedAt: answer.fetchedAt,
      };
    },

    /**
     * The current details of one known place (`node/123`), or `null` when
     * the source no longer has it as a named place of a supported type.
     */
    async known({ id, locale } = {}) {
      const reference = parseOsmReference(id);
      if (!reference)
        throw invalid(
          "A known place id is node/, way/ or relation/ and a number.",
        );
      const extract = localSource();
      if (extract) {
        const answer = extract.known({ id, locale });
        return answer.place
          ? { ...answer, attribution: { ...placesAttribution }, source: "osm" }
          : null;
      }
      const answer = await source(overpassElementQuery(id));
      const element = answer.elements.find(
        (candidate) =>
          candidate?.type === reference.elementType &&
          String(candidate?.id) === reference.number,
      );
      const place = element ? placeFromOverpassElement(element, locale) : null;
      if (!place) return null;
      return {
        place: await withDarkness(place),
        attribution: { ...placesAttribution },
        source: "osm",
        fetchedAt: answer.fetchedAt,
      };
    },
  };
}

let shared = null;
const service = () => (shared ??= createPlacesService());

// Test seam: drop the process-wide service, its cache and its throttle.
export function resetPlacesService() {
  shared = null;
}

/** The process-wide service the routes call. */
export const suggestPlaces = (parameters) => service().suggest(parameters);
export const knownPlaceDetails = (parameters) => service().known(parameters);
