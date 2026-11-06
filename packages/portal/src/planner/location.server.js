import { find } from "geo-tz";
import { distinctPlaceResults } from "./place-results.js";
import { geocoderLanguage } from "astro-contracts/locales";
import { placeCoordinates } from "./state.js";

const cache = new Map();
const elevationCache = new Map();
let lastLookup = 0;
let queue = Promise.resolve();
export function timeZoneForCoordinates(value) {
  const coordinates = placeCoordinates(value);
  if (!coordinates) throw new Error("Invalid geographic coordinates.");
  const zones = find(coordinates.latitude, coordinates.longitude);
  if (!zones.length) throw new Error("No time zone found for this location.");
  return { ...coordinates, timeZone: zones[0], timeZones: zones };
}
export async function terrainElevationForCoordinates(value, request = fetch) {
  const coordinates = placeCoordinates(value);
  if (!coordinates) throw new Error("Invalid geographic coordinates.");
  const key = `${coordinates.latitude.toFixed(5)}:${coordinates.longitude.toFixed(5)}`;
  const cached = elevationCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const url = new URL(
    process.env.ASTRO_PORTAL_ELEVATION_URL ||
      "https://api.open-meteo.com/v1/elevation",
  );
  url.searchParams.set("latitude", String(coordinates.latitude));
  url.searchParams.set("longitude", String(coordinates.longitude));
  const response = await request(url, {
    headers: {
      "User-Agent":
        "Astro-Portal/1.0 (+https://github.com/sqound/astro-portal)",
      accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error("Terrain elevation is temporarily unavailable.");
  const payload = await response.json();
  const elevation = Number(payload?.elevation?.[0]);
  if (!Number.isFinite(elevation))
    throw new Error("Terrain elevation response is invalid.");
  const result = String(Math.round(elevation));
  if (elevationCache.size > 500)
    elevationCache.delete(elevationCache.keys().next().value);
  elevationCache.set(key, {
    value: result,
    expires: Date.now() + 24 * 60 * 60 * 1000,
  });
  return result;
}
// A leading comma-separated segment that opens with a digit is the street
// line `photon()` below builds from `[housenumber, street]`, never a place
// name.
const STREET_LINE = /^\d/;

/**
 * The place name to *suggest* for a resolved position, alongside the full
 * label the caller already gets in `name`/`locality`.
 *
 * `photon()` flattens every geocoder component into one comma-joined label
 * (`[name, housenumber + street, city || district, state, country]`); a full
 * postal address is a poor default name for an observing site, so this stops
 * at the finest *place* level the label still carries — the named
 * feature/hamlet/neighbourhood/locality, never the street line before it.
 *
 * Deterministic and independent of the server's own locale: it only checks
 * whether the label's first segment opens with an ASCII digit (a house
 * number), never the language or script of the text itself — a Japanese
 * street line built the same way (`3 Chome-1 Shinjuku, …`) is recognised
 * exactly like a Latin-script one. The rule is pinned by the
 * `place-short-name` fixture — see
 * `packages/astro-contracts/fixtures/place-short-name.json`.
 */
export function suggestedPlaceName(label) {
  const source = String(label ?? "");
  const parts = source
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 2) return source.trim();
  return STREET_LINE.test(parts[0]) ? parts[1] : parts[0];
}

async function photon(path, parameters) {
  const base =
    process.env.ASTRO_PORTAL_GEOCODER_URL || "https://photon.komoot.io/";
  const url = new URL(path, base.endsWith("/") ? base : base + "/");
  url.search = new URLSearchParams(parameters).toString();
  const key = url.href;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  if (cache.size > 250) cache.delete(cache.keys().next().value);
  // Only explicit searches / completed position choices, never autocomplete.
  // Bound traffic across visitors and keep address queries out of application logs.
  const lookup = queue.then(async () => {
    const delay = Math.max(0, 1100 - (Date.now() - lastLookup));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastLookup = Date.now();
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Astro-Portal/1.0 (+https://github.com/sqound/astro-portal)",
        accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error("Address search is temporarily unavailable.");
    const payload = await response.json();
    const value = (payload.features || [])
      .map((feature) => {
        const [longitude, latitude] = feature.geometry?.coordinates || [];
        if (!placeCoordinates({ latitude, longitude })) return null;
        const p = feature.properties || {};
        const street = [p.housenumber, p.street].filter(Boolean).join(" ");
        const name = [
          ...new Set(
            [p.name, street, p.city || p.district, p.state, p.country].filter(
              Boolean,
            ),
          ),
        ].join(", ");
        return {
          ...timeZoneForCoordinates({ latitude, longitude }),
          name,
          locality: name,
          shortName: suggestedPlaceName(name),
        };
      })
      .filter(Boolean)
      .slice(0, 10);
    cache.set(key, { value, expires: Date.now() + 30 * 60 * 1000 });
    return value;
  });
  queue = lookup.catch(() => {});
  return lookup;
}
/**
 * The `lang` parameter of a place-name request for a reader of `locale`: the
 * registry's `geocoder` attribute (the languages the service accepts), else
 * none — the service then answers with the local name of each place, as it
 * does for Japanese.
 */
export function placeNameLanguageParameters(locale) {
  const language = geocoderLanguage(String(locale ?? ""));
  return language ? { lang: language } : {};
}

// What a search asks the geocoder for, and what it keeps once the duplicates
// are gone: the extra ones make up for those.
const SEARCH_ASKED = 10;
const SEARCH_KEPT = 6;

export { distinctPlaceResults };

export async function searchPlannerPlaces(query, locale = "en") {
  const q = String(query || "").trim();
  if (q.length < 2 || q.length > 240)
    throw new Error("Enter an address or place name (2–240 characters).");
  return distinctPlaceResults(
    await photon("api/", {
      q,
      limit: String(SEARCH_ASKED),
      ...placeNameLanguageParameters(locale),
    }),
  ).slice(0, SEARCH_KEPT);
}
export async function resolvePlannerPlace(
  value,
  locale = "en",
  reverse = false,
) {
  const resolved = timeZoneForCoordinates(value);
  const suppliedElevation =
    value?.elevation !== undefined &&
    value?.elevation !== null &&
    String(value.elevation).trim() !== "" &&
    Number.isFinite(Number(value.elevation))
      ? String(Math.round(Number(value.elevation)))
      : null;
  let elevation = suppliedElevation;
  let elevationSource = suppliedElevation === null ? "open-meteo" : "provided";
  if (elevation === null) {
    try {
      elevation = await terrainElevationForCoordinates(resolved);
    } catch {
      elevation = "0";
      elevationSource = "unavailable";
    }
  }
  const geographic = { ...resolved, elevation, elevationSource };
  if (!reverse) return geographic;
  try {
    const results = await photon("reverse", {
      lat: String(resolved.latitude),
      lon: String(resolved.longitude),
      limit: "1",
      ...placeNameLanguageParameters(locale),
    });
    return { ...results[0], ...geographic };
  } catch {
    // A geocoder outage must not prevent saving a precisely selected GPS point.
    return geographic;
  }
}
