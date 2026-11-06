// The source of the suggested places: an Overpass API instance over
// OpenStreetMap, queried by the service at search time (docs/PLACES.md).
// Nothing from it is stored beyond the in-memory cache of
// `./suggested.js`; nothing from it is ever written into the repository, a
// fixture or an offline pack. The observer never talks to the source: the
// service does, with its own User-Agent and a rounded search centre.

export const placesUserAgent =
  "Astro-Portal/1.0 (+https://github.com/sqound/astro-portal)";
export const defaultPlacesUrl = "https://overpass-api.de/api/interpreter";
// A real search (named peaks, viewpoints and parks within 30 km) takes 14 to
// 22 s on the public instances and more from a distant data centre: 30 s is
// the budget of one attempt, server side (`[timeout:]`) and client side.
export const placesTimeoutSeconds = 30;
// The one instance tried after the default one has failed (timeout, network
// error, 5xx, unreadable answer); never after a 4xx, never when an instance
// was chosen with `ASTRO_PORTAL_PLACES_URL`.
export const fallbackPlacesUrl = "https://lz4.overpass-api.de/api/interpreter";

// The place types an observer can ask for, in the order a feature matching
// several of them is classified in explicit Overpass mode. That mode uses
// national parks/nature reserves; the local extract uses leisure=park.
export const placeTypes = Object.freeze([
  "viewpoint",
  "campsite",
  "park",
  "picnic",
]);
export const placeTypeTags = Object.freeze({
  viewpoint: Object.freeze([["tourism", "viewpoint"]]),
  campsite: Object.freeze([["tourism", "camp_site"]]),
  park: Object.freeze([
    ["boundary", "national_park"],
    ["leisure", "nature_reserve"],
  ]),
  picnic: Object.freeze([["tourism", "picnic_site"]]),
});

const elementTypes = Object.freeze(["node", "way", "relation"]);

/**
 * The source settings, read from the environment at each call so a test (or
 * an administrator restarting the service) can change them:
 * Unset or osm-extract reads ASTRO_PORTAL_PLACES_DB locally.
 * `ASTRO_PORTAL_PLACES=overpass` explicitly chooses the remote source;
 * `ASTRO_PORTAL_PLACES=off` switches the suggestions off,
 * `ASTRO_PORTAL_PLACES_URL` points at another Overpass instance.
 */
export function placesSourceSettings(env = process.env) {
  const switch_ = String(env.ASTRO_PORTAL_PLACES ?? "")
    .trim()
    .toLowerCase();
  return {
    enabled: !["off", "false", "0", "no", "disabled"].includes(switch_),
    source: switch_ === "overpass" ? "overpass" : "osm-extract",
    path: String(env.ASTRO_PORTAL_PLACES_DB || "").trim(),
    url: String(env.ASTRO_PORTAL_PLACES_URL || "").trim() || defaultPlacesUrl,
  };
}

const coordinate = (value) => Number(value).toFixed(2);

/**
 * The Overpass QL query for named features of `types` within `radiusKm` of a
 * (rounded) centre. Nodes are printed with their coordinates; ways and
 * relations with their tags and centre only (`out tags center`), never their
 * geometry or members, which for a national park would weigh megabytes.
 */
export function overpassAroundQuery({ latitude, longitude, radiusKm, types }) {
  const around = `(around:${Math.round(radiusKm * 1000)},${coordinate(
    latitude,
  )},${coordinate(longitude)})`;
  const filters = [];
  for (const type of placeTypes)
    if (types.includes(type))
      for (const [key, value] of placeTypeTags[type])
        filters.push(`  nwr["${key}"="${value}"]["name"]${around};`);
  return [
    `[out:json][timeout:${placesTimeoutSeconds}];`,
    "(",
    ...filters,
    ")->.found;",
    "node.found;",
    "out body;",
    "(way.found; relation.found;);",
    "out tags center;",
  ].join("\n");
}

/**
 * The query for one known place, by its OpenStreetMap type and number
 * (`node/123`). `null` when the identifier is not one.
 */
export function overpassElementQuery(reference) {
  const parsed = parseOsmReference(reference);
  if (!parsed) return null;
  const out = parsed.elementType === "node" ? "out body;" : "out tags center;";
  return [
    `[out:json][timeout:${placesTimeoutSeconds}];`,
    `${parsed.elementType}(${parsed.number});`,
    out,
  ].join("\n");
}

/** `node/123` (or `osm:node/123`) → `{ elementType, number }`, else null. */
export function parseOsmReference(reference) {
  const match = /^(?:osm:)?(node|way|relation)\/([1-9][0-9]{0,15})$/.exec(
    String(reference ?? "").trim(),
  );
  if (!match) return null;
  return { elementType: match[1], number: match[2] };
}

/** The supported type a feature's tags describe, else null. */
export function placeTypeOfTags(tags) {
  for (const type of placeTypes)
    if (placeTypeTags[type].some(([key, value]) => tags?.[key] === value))
      return type;
  return null;
}

// The source's own sentence about a place, kept as written (never translated).
const descriptionLimit = 500;

const text = (value, limit = 200) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, limit) : undefined;
};

// Only an http(s) address is ever handed to a client as a link.
const website = (tags) => {
  for (const key of ["website", "contact:website", "url"]) {
    const value = text(tags?.[key], 500);
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" || url.protocol === "http:")
        return url.href;
    } catch {
      // Not an address: try the next tag.
    }
  }
  return undefined;
};

// `ele` in metres; OpenStreetMap allows "1720", "1720 m" or "1720.5".
const elevation = (tags) => {
  const match = /^\s*(-?[0-9]+(?:\.[0-9]+)?)\s*(?:m)?\s*$/.exec(
    String(tags?.ele ?? ""),
  );
  if (!match) return undefined;
  const value = Math.round(Number(match[1]));
  return value >= -500 && value <= 9000 ? value : undefined;
};

const sixDecimals = (value) => Number(Number(value).toFixed(6));

/**
 * One Overpass element → a source place, or null when it is unnamed, of no
 * supported type, or has no usable position. `name` follows the observer's
 * language when the feature carries one (`name:fr`, `name:ja`…), else the
 * feature's own name.
 */
export function placeFromOverpassElement(element, locale = "en") {
  if (!element || !elementTypes.includes(element.type)) return null;
  const tags = element.tags || {};
  const own = text(tags.name);
  if (!own) return null;
  const type = placeTypeOfTags(tags);
  if (!type) return null;
  const position =
    element.type === "node"
      ? { lat: element.lat, lon: element.lon }
      : element.center || {};
  const latitude = Number(position.lat);
  const longitude = Number(position.lon);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null;
  const exactLanguage = String(locale || "").replaceAll("_", "-");
  const language = String(locale || "")
    .toLowerCase()
    .split(/[-_]/)[0];
  const place = {
    id: `osm:${element.type}/${element.id}`,
    name:
      text(tags[`name:${exactLanguage}`]) ||
      (language && text(tags[`name:${language}`])) ||
      own,
    type,
    latitude: sixDecimals(latitude),
    longitude: sixDecimals(longitude),
  };
  const details = {
    website: website(tags),
    description: text(tags.description, descriptionLimit),
    openingHours: text(tags.opening_hours),
    access: text(tags.access),
    fee: text(tags.fee),
    elevation: elevation(tags),
  };
  for (const [key, value] of Object.entries(details))
    if (value !== undefined) place[key] = value;
  return place;
}

const sourceError = (message, extra = {}) =>
  Object.assign(new Error(message), { code: "source", ...extra });

async function queryOnce(query, request, url) {
  let response;
  try {
    response = await request(url, {
      method: "POST",
      headers: {
        "User-Agent": placesUserAgent,
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal: AbortSignal.timeout(placesTimeoutSeconds * 1000),
    });
  } catch (cause) {
    throw sourceError("The places source did not answer.", { cause });
  }
  if (!response.ok)
    throw sourceError(`The places source answered ${response.status}.`, {
      status: response.status,
    });
  try {
    const payload = await response.json();
    if (!Array.isArray(payload?.elements)) throw new Error("No elements.");
    return payload.elements;
  } catch (cause) {
    throw sourceError("The places source answer is invalid.", { cause });
  }
}

/**
 * Ask the source. Throws an error with `code: "source"` on any failure
 * (refused, timed out, not JSON). When the instance is the default one
 * (`ASTRO_PORTAL_PLACES_URL` unset), a failure other than a 4xx answer is
 * retried once on `fallbackPlacesUrl`, whose error is the one thrown if it
 * fails too; a configured mirror is never retried elsewhere, so a private
 * server's choice is never overridden. One attempt waits
 * `placesTimeoutSeconds`: the worst case of a search is twice that.
 */
export async function queryOverpass(query, { request = fetch, url } = {}) {
  const target = url || placesSourceSettings().url;
  try {
    return await queryOnce(query, request, target);
  } catch (error) {
    const clientError = error.status >= 400 && error.status < 500;
    if (target !== defaultPlacesUrl || clientError) throw error;
    return queryOnce(query, request, fallbackPlacesUrl);
  }
}
