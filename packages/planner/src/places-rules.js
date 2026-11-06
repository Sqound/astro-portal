// Suggested places on the web: what a suggestion is, and the rules the screens
// apply to it — the centre sent to the service, "déjà dans vos lieux", the
// comparison of skies, the order, the distance, the personal place a
// suggestion becomes.
//
// The service (`GET /v1/places/suggested`, `GET /v1/places/known`) never
// returns a distance: the page computes it from its own, unrounded reference.
// Licence: every screen that shows a suggestion or a detail shows the
// OpenStreetMap attribution; nothing here is shipped with the page.
import { horizonMaskHasProfile } from "portal/planner/horizon-mask.js";
import {
  knownPlaceTypes,
  normalizeKnownPlaceLink,
  placeCoordinates,
  placeDistanceKm,
  placeKinds as ownPlaceKinds,
} from "portal/planner/state.js";

/** The four kinds of places the service suggests ("parcs" = national parks and nature reserves). */
export const placeKinds = knownPlaceTypes;
/**
 * The type of a place of mine: "private" (what a new place is) or one of the
 * four kinds of a suggested place.
 */
export { ownPlaceKinds };

/** The radii the service accepts, in kilometres. */
export const placesRadiiKm = Object.freeze([10, 30, 60, 100]);
/** The radius a search starts with. */
export const placesDefaultRadiusKm = 60;
/** The kinds a search starts with: all but picnic areas. */
export const placesDefaultKinds = Object.freeze([
  "viewpoint",
  "campsite",
  "park",
]);
/** The step the search centre is rounded to before it leaves the page. */
export const placesCentreStepDegrees = 0.05;
/** A suggestion within this distance of one of my places is that place. */
export const placesAlreadyMineKm = 0.5;
/** Two skies within this many magnitudes read "Ciel comparable". */
export const placesComparableMag = 0.2;
/** The link of the attribution (ODbL). */
// Legal credit fixed by the extract policy, independent of translated prose.
export const placesAttributionCredit = "© OpenStreetMap contributors (ODbL)";
export const placesAttributionUrl = "https://www.openstreetmap.org/copyright";

/**
 * The search centre as the service uses it: each coordinate rounded to the
 * nearest 0.05°, two decimals — the rule of `roundPlacesCentre`
 * (`portal/places/suggested.js`, a server module), written again here so that
 * the page never loads the server's code; a test holds the two together.
 * `null` for unusable coordinates.
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

const suggestionId = /^osm:((?:node|way|relation)\/[1-9][0-9]*)$/;
const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** The modelled darkness of a place: a Bortle class and a zenith SQM, always an estimate. */
export function normalizeSkyEstimate(value) {
  if (!value || typeof value !== "object") return null;
  const bortle = Number(value.bortle ?? value.bortleClass);
  const sqm = Number(value.sqm);
  if (!Number.isFinite(bortle) || !Number.isFinite(sqm)) return null;
  return { bortle: Math.round(bortle), sqm };
}

/** The identifier a personal place's `knownPlace.id` stores: `node/123`. */
export const suggestionLinkId = (place) =>
  suggestionId.exec(String(place?.id))?.[1] ?? String(place?.id ?? "");

/**
 * One suggested place as the service gives it, or `null` for anything the
 * contract does not allow: a place without a valid id, name, kind or position
 * is dropped, never guessed.
 */
export function normalizeSuggestedPlace(value) {
  if (!value || typeof value !== "object") return null;
  const { id, name, type, latitude, longitude } = value;
  if (typeof id !== "string" || !suggestionId.test(id)) return null;
  if (typeof name !== "string" || !name.trim()) return null;
  if (!placeKinds.includes(type)) return null;
  if (typeof latitude !== "number" || typeof longitude !== "number")
    return null;
  if (!placeCoordinates({ latitude, longitude })) return null;
  const website = text(value.website);
  const elevation = Number(value.elevation);
  return {
    id,
    name: name.trim(),
    type,
    latitude,
    longitude,
    ...(website && /^https?:\/\//.test(website) ? { website } : {}),
    ...(text(value.description)
      ? { description: text(value.description) }
      : {}),
    ...(text(value.openingHours)
      ? { openingHours: text(value.openingHours) }
      : {}),
    ...(text(value.access) ? { access: text(value.access) } : {}),
    ...(text(value.fee) ? { fee: text(value.fee) } : {}),
    ...(value.elevation !== null &&
    value.elevation !== undefined &&
    Number.isFinite(elevation)
      ? { elevation: Math.round(elevation) }
      : {}),
    sky: normalizeSkyEstimate(value.skyQuality ?? value.sky),
  };
}

/** One answer of the service: the places, whether more were found, and when the source was read. */
export function normalizeSuggestedPage(value, fallbackAt = null) {
  if (!value || typeof value !== "object" || !Array.isArray(value.results))
    return null;
  const fetched = Date.parse(value.fetchedAt);
  const fetchedAt = Number.isFinite(fetched)
    ? new Date(fetched).toISOString()
    : fallbackAt;
  if (!fetchedAt) return null;
  return {
    places: value.results.map(normalizeSuggestedPlace).filter(Boolean),
    truncated: value.truncated === true,
    fetchedAt,
  };
}

/** The `knownPlace` link of a personal place, normalized, or `null`. */
export const knownPlaceLinkOf = (place) =>
  normalizeKnownPlaceLink(place?.knownPlace);

/** The kind of a personal place linked to a known place, else `null`. */
export const linkedPlaceKind = (place) => knownPlaceLinkOf(place)?.type ?? null;

/** What a place is called: its name, else its locality. */
export const placeLabel = (place) =>
  String(place?.name || place?.locality || "").trim();

/**
 * The personal place [suggestion] already is: the one linked to the same
 * known place first, else the nearest within `placesAlreadyMineKm`.
 */
export function alreadyMinePlace(suggestion, mine) {
  const places = Array.isArray(mine) ? mine : [];
  const linkId = suggestionLinkId(suggestion);
  const linked = places.find((place) => knownPlaceLinkOf(place)?.id === linkId);
  if (linked) return linked;
  let nearest = null;
  let nearestKm = null;
  for (const place of places) {
    const km = placeDistanceKm(suggestion, place);
    if (km === null || km > placesAlreadyMineKm) continue;
    if (nearestKm === null || km < nearestKm) {
      nearest = place;
      nearestKm = km;
    }
  }
  return nearest;
}

/**
 * [sqm] against [referenceSqm], to a tenth of a magnitude: within
 * ± `placesComparableMag` the skies are comparable; `delta` is always
 * positive (how much darker or brighter). `null` when either is unknown.
 */
export function compareSky(sqm, referenceSqm) {
  if (!Number.isFinite(sqm) || !Number.isFinite(referenceSqm)) return null;
  const difference = sqm - referenceSqm;
  // A half goes away from zero, rounded.
  const delta =
    (Math.sign(difference) * Math.round(Math.abs(difference) * 10)) / 10;
  if (Math.abs(delta) <= placesComparableMag + 1e-9)
    return { kind: "comparable", delta: Math.abs(delta) };
  return { kind: delta > 0 ? "darker" : "brighter", delta: Math.abs(delta) };
}

/**
 * The tint of a kind of place: private grey, campsite green, viewpoint
 * blue-green, park lavender, picnic area amber (`placeKindColor`).
 */
export const placeKindTones = Object.freeze({
  private: "#9ca5a3",
  campsite: "#77bd91",
  viewpoint: "#83c5d0",
  park: "#b8a8dc",
  picnic: "#d9b16d",
});

const toRgb = (hex) =>
  [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
const toHex = (rgb) =>
  `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;

// The colour at `at` along `stops` (`[position, "#rrggbb"]`, ascending).
function colourAlong(stops, at) {
  if (at <= stops[0][0]) return stops[0][1];
  for (let index = 1; index < stops.length; index++) {
    const [to, toColour] = stops[index];
    if (at <= to) {
      const [from, fromColour] = stops[index - 1];
      const t = (at - from) / (to - from);
      const a = toRgb(fromColour);
      const b = toRgb(toColour);
      return toHex(a.map((value, channel) => value + (b[channel] - value) * t));
    }
  }
  return stops[stops.length - 1][1];
}

const darkerStops = [
  [0, "#9ca5a3"],
  [1, "#b7d39f"],
  [2, "#77bd91"],
  [3.5, "#9cf2b8"],
];
const brighterStops = [
  [0, "#9ca5a3"],
  [1, "#e1b868"],
  [2, "#ef7065"],
];

/**
 * The colour of a gap of sky: the
 * neutral grey at no gap, then — towards a darker sky — a light green at 1,
 * the success green at 2 and the excellent green from 3,5; — towards a
 * brighter sky — amber at 1 and a soft red from 2; continuous between the
 * steps, the neutral grey itself for a comparable sky.
 */
export function skyDeltaTone(comparison) {
  if (!comparison || comparison.kind === "comparable") return "#9ca5a3";
  return colourAlong(
    comparison.kind === "darker" ? darkerStops : brighterStops,
    comparison.delta,
  );
}

/**
 * The plural category the phrase "{value} magnitude(s) plus sombre" takes:
 * 1 — "une magnitude" — in French and
 * Portuguese for a gap below 2 ("0,8 magnitude", "1,5 magnitude"), 2
 * otherwise. A gap is always written with one decimal ("1,0"), so English,
 * German, Spanish and Italian never say "one" for it, and Russian, Japanese
 * and Chinese have one form.
 */
export const magnitudePluralCount = (locale, delta) =>
  /^(fr|pt)(-|$)/.test(String(locale)) && delta < 2 ? 1 : 2;

/**
 * [places] in order — `"distance"`: nearest first from [reference]; `"darkest"`:
 * darkest first (to the hundredth of a magnitude), an unknown sky last; ties by
 * distance when there is a reference, then by name.
 */
export function sortSuggestions(places, sort, reference = null) {
  const distance = (place) => placeDistanceKm(reference, place) ?? Infinity;
  const sorted = [...places];
  sorted.sort((left, right) => {
    // Equal skies (a whole region at the dark end of the raster reads the
    // same) are told apart by what the person can act on: the nearer first.
    const primary =
      sort === "distance"
        ? 0
        : Math.round((right.sky?.sqm ?? -1) * 100) -
          Math.round((left.sky?.sqm ?? -1) * 100);
    const nearer = distance(left) - distance(right);
    return (
      primary ||
      (Number.isFinite(nearer) ? nearer : 0) ||
      left.name.localeCompare(right.name)
    );
  });
  return sorted;
}

const numberFormat = (locale, options) =>
  new Intl.NumberFormat(locale, options);

/** A straight-line distance as the screens write it: a tenth below 1 km ("0,2 km"), whole kilometres above ("38 km"). */
export function formatPlaceDistance(km, locale) {
  const value = Number(km);
  return value < 1
    ? `${numberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)} km`
    : `${numberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value))} km`;
}

/**
 * A magnitude with two decimals in [locale] ("21,89"): the figure a list of
 * places is sorted by, so that two places the order tells apart are not
 * written the same ("Bortle 2 · 21,9" above "Bortle 3 · 21,9").
 */
export const formatMagnitudeFine = (value, locale) =>
  numberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

/** A magnitude with one decimal in [locale] ("21,7"). */
export const formatMagnitude = (value, locale) =>
  numberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);

/** An elevation in whole metres, grouped ("1 720"). */
export const formatMetres = (value, locale) =>
  numberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value));

/** Where a SQM sits on the scale the detail draws (18 → 22), 0 to 1. */
export const skyScalePosition = (sqm) =>
  Math.max(0, Math.min(1, (Number(sqm) - 18) / 4));

/**
 * The page that gives directions to a place: OpenStreetMap's own, in a new
 * tab (the web has no maps application, and no routing service of ours).
 */
export const itineraryUrl = ({ latitude, longitude }) =>
  `https://www.openstreetmap.org/directions?to=${latitude},${longitude}`;

/**
 * The personal place a suggestion becomes: its name and position copied (both
 * editable later), the link `{ source, id, type, linkedAt }` — never the
 * details, which stay with the source. No horizon yet: "Horizon à relever". The
 * time zone is resolved by the caller, like any new place.
 */
export function personalPlaceFromSuggestion(suggestion, { linkedAt, id }) {
  return {
    id,
    name: suggestion.name,
    locality: suggestion.name,
    latitude: String(suggestion.latitude),
    longitude: String(suggestion.longitude),
    ...(Number.isFinite(suggestion.elevation)
      ? { elevation: String(suggestion.elevation) }
      : {}),
    horizonStatus: "unverified",
    kind: suggestion.type,
    knownPlace: {
      source: "osm",
      id: suggestionLinkId(suggestion),
      type: suggestion.type,
      linkedAt: new Date(linkedAt).toISOString(),
    },
  };
}

/**
 * The default place of a list of places — the ONE rule
 * (`packages/astro-contracts/fixtures/places/places-default.json`
 * states it): the place the space
 * marks (`defaultPlaceId`) when it is in the list and has a position;
 * otherwise (nothing marked, or the mark names a place that is gone) the
 * **oldest** place with a position — the one whose last gesture (`editedAt`)
 * is the earliest, a place with no instant before the others, and, for equal
 * instants, the one first in the list. It never depends on the order the list
 * is displayed in: the service lists the most recent place first.
 */
export function defaultPlaceOf(places, markedId = null) {
  const usable = (Array.isArray(places) ? places : []).filter((place) =>
    placeCoordinates(place),
  );
  const marked = markedId
    ? usable.find((place) => place.id === markedId)
    : undefined;
  if (marked) return marked;
  let oldest = null;
  let oldestAt = "";
  for (const place of usable) {
    const at = typeof place.editedAt === "string" ? place.editedAt : "";
    if (!oldest || at < oldestAt) {
      oldest = place;
      oldestAt = at;
    }
  }
  return oldest;
}

/** A place or a position as the reference distances and skies are measured from. */
export function placesReferenceOf(place, name = placeLabel(place)) {
  const coordinates = placeCoordinates(place);
  return coordinates
    ? { name, ...coordinates, placeId: place?.id ?? null }
    : null;
}

// ---------------------------------------------------------------------------
// My places: the type of
// a place of mine, and the rule of possible duplicates —
// `packages/astro-contracts/fixtures/places/places-duplicates.json`
// states it.
// ---------------------------------------------------------------------------

/**
 * Whether a horizon was actually **recorded** for one of my places: it is not
 * marked "à vérifier" and at least one point of its mask rises above 0°. A
 * mask "enabled" whose points are all 0° (the horizon step crossed without
 * tracing anything) records nothing, so the list and the sheet never say
 * "Horizon relevé" for it.
 */
export const placeHorizonRecorded = (place) =>
  Boolean(place) &&
  place.horizonStatus !== "unverified" &&
  horizonMaskHasProfile(place.horizonMask);

/** The distance below which two places of mine are possible duplicates, in metres (strictly). */
export const placeDuplicateMetres = 100;
const duplicateEarthRadiusMetres = 6371008.8;

/**
 * The type of one of my places: its own `kind` (chosen, or filled by the
 * suggestion it was made from), else the type of the known place it links to,
 * else "private" — a place written before the field is read as private.
 */
export const placeKindOf = (place) =>
  ownPlaceKinds.includes(place?.kind)
    ? place.kind
    : (linkedPlaceKind(place) ?? "private");

/**
 * A name as the duplicate rule reads it: Unicode NFD, the combining marks
 * U+0300–U+036F removed, lower case, white space trimmed and every run of it
 * read as one space; nothing else ("ß" stays "ß").
 */
export const foldPlaceName = (name) =>
  String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

function haversineMetres(left, right) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((right.latitude - left.latitude) * rad) / 2) ** 2 +
    Math.cos(left.latitude * rad) *
      Math.cos(right.latitude * rad) *
      Math.sin(((right.longitude - left.longitude) * rad) / 2) ** 2;
  return duplicateEarthRadiusMetres * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * The possible duplicates of a list of places: every pair whose names are
 * equal once folded, or that lie strictly less than `placeDuplicateMetres`
 * apart, in the order of the list (the first place of the pair first), with
 * whether the names are equal and the distance rounded to the metre; and the
 * ids that carry the pill "Doublon possible", in the order of the list.
 * Flagged, never blocked, never merged. A place without a position is never
 * flagged by distance.
 */
export function placeDuplicates(places) {
  const list = Array.isArray(places) ? places : [];
  const duplicates = [];
  list.forEach((left, index) => {
    for (const right of list.slice(index + 1)) {
      const sameName = foldPlaceName(left?.name) === foldPlaceName(right?.name);
      const a = placeCoordinates(left);
      const b = placeCoordinates(right);
      const distance = a && b ? haversineMetres(a, b) : Infinity;
      if (sameName || distance < placeDuplicateMetres)
        duplicates.push({
          ids: [left.id, right.id],
          sameName,
          distanceMetres: Number.isFinite(distance) ? Math.round(distance) : 0,
        });
    }
  });
  const flagged = list
    .filter((place) => duplicates.some((pair) => pair.ids.includes(place.id)))
    .map((place) => place.id);
  return { duplicates, flagged };
}

/**
 * The places that look like [place] among [places] (itself left out): `{ other,
 * sameName, distanceMetres }`, in the order of the list. Used by the line of the
 * editor's step "Enregistrement" and by the sheet of a place.
 */
export function duplicatesOfPlace(place, places) {
  const list = (Array.isArray(places) ? places : []).filter(
    (entry) => entry.id !== place?.id,
  );
  const probe = [place, ...list];
  return placeDuplicates(probe)
    .duplicates.filter((pair) => pair.ids[0] === place?.id)
    .map((pair) => ({
      other: list.find((entry) => entry.id === pair.ids[1]),
      sameName: pair.sameName,
      distanceMetres: pair.distanceMetres,
    }));
}
