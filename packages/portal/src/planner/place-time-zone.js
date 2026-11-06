// The zone of a place when the service cannot say: a table of anchors embedded with the application, the nearest one
// giving the zone, and the rule that decides which zone a place is read in.
//
// The table is `place-time-zone-anchors.js` (the IANA time zone database,
// public domain, plus the project's own anchors; no zone-boundary polygon and
// no ODbL data). It is an approximation near the borders of a zone: the
// service, which holds the exact boundaries, refines a zone that came from the
// table (`timeZoneSource` « table ») as soon as it is reached, and a zone the
// person chose is never changed (`timeZoneSource` « chosen »).
import {
  placeTimeZoneNames,
  placeTimeZoneRows,
} from "./place-time-zone-anchors.js";

const radians = Math.PI / 180;
/** Beyond this distance from every anchor a position is at sea. */
export const placeTimeZoneSeaKm = 600;

let anchors = null;
function loadAnchors() {
  if (anchors) return anchors;
  anchors = placeTimeZoneRows.split("|").map((row) => {
    const [zone, latitude, longitude] = row.split(";").map(Number);
    return {
      zone: placeTimeZoneNames[zone],
      latitude: latitude / 100,
      longitude: longitude / 100,
    };
  });
  return anchors;
}

function distanceKm(latitudeA, longitudeA, latitudeB, longitudeB) {
  const a =
    Math.sin(((latitudeB - latitudeA) * radians) / 2) ** 2 +
    Math.cos(latitudeA * radians) *
      Math.cos(latitudeB * radians) *
      Math.sin(((longitudeB - longitudeA) * radians) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** `Etc/GMT` zone of the sea at [longitude] (the sign of POSIX is reversed). */
export function seaTimeZone(longitude) {
  const hours = Math.max(-12, Math.min(14, Math.round(longitude / 15)));
  if (hours === 0) return "Etc/GMT";
  return hours > 0 ? `Etc/GMT-${hours}` : `Etc/GMT+${-hours}`;
}

/**
 * A zone as the place editor and the place's details write it. The sea's
 * zones are named by the POSIX rule, whose sign is the reverse of the one
 * people read: `Etc/GMT+2` is two hours *behind* UTC. They are written
 * « UTC−2 (Etc/GMT+2) » so that no one reads the wrong side of Greenwich;
 * every other zone is its own name.
 */
export function timeZoneShownName(zone) {
  const sea = /^Etc\/GMT([+-])(\d{1,2})$/.exec(String(zone ?? ""));
  if (!sea) return String(zone ?? "");
  const hours = Number(sea[2]);
  if (hours === 0) return String(zone);
  return `UTC${sea[1] === "+" ? "\u2212" : "+"}${hours} (${zone})`;
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * The zone of a position read from the embedded table: the zone of the
 * nearest anchor, or the `Etc/GMT` zone of the sea when none is within
 * `placeTimeZoneSeaKm`. `null` when the position is not valid coordinates.
 */
export function offlineTimeZoneForCoordinates(value) {
  const latitude = finite(value?.latitude);
  const longitude = finite(value?.longitude);
  if (
    latitude === null ||
    longitude === null ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null;
  let best = null;
  let bestKm = Infinity;
  for (const anchor of loadAnchors()) {
    const km = distanceKm(
      latitude,
      longitude,
      anchor.latitude,
      anchor.longitude,
    );
    if (km < bestKm) {
      bestKm = km;
      best = anchor;
    }
  }
  return bestKm <= placeTimeZoneSeaKm && best
    ? best.zone
    : seaTimeZone(longitude);
}

/** Whether [name] is an IANA zone this runtime reads. */
export function isKnownTimeZone(name) {
  if (typeof name !== "string" || !name.trim()) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// The rule (pinned by the fixtures `place-time-zone-rule`
// and `place-time-zone-apply`): which zone a place is read in, and what a
// resolution may write.
//
// A place carries `timeZone` (an IANA name) and, only when the person picked
// it, `timeZoneSource: "chosen"`. In order:
// 1. a zone the person chose is final — no resolution replaces it;
// 2. the service's zone (it holds the exact boundaries) — it refines a zone
//    that came from the table or from an earlier read;
// 3. the zone already stored;
// 4. the embedded table, from the coordinates;
// 5. none — the last resort: hours in UTC, said as such, and the person is
//    offered the choice.

export const chosenTimeZoneSource = "chosen";

export function isChosenTimeZone(place) {
  return (
    place?.timeZoneSource === chosenTimeZoneSource &&
    isKnownTimeZone(place?.timeZone)
  );
}

/**
 * `{ timeZone, source }` — `source` is « chosen », « service », « stored »
 * or « table »; both are `null` when no zone can be given.
 */
export function resolvePlaceTimeZone(place, serviceTimeZone = null) {
  if (isChosenTimeZone(place))
    return { timeZone: place.timeZone, source: "chosen" };
  if (isKnownTimeZone(serviceTimeZone))
    return { timeZone: serviceTimeZone, source: "service" };
  if (isKnownTimeZone(place?.timeZone))
    return { timeZone: place.timeZone, source: "stored" };
  const table = offlineTimeZoneForCoordinates(place);
  return table
    ? { timeZone: table, source: "table" }
    : { timeZone: null, source: null };
}

/**
 * [place] with [timeZone] written in it. A zone the person picked
 * (`chosen`) is marked as such and replaces whatever the place had; a
 * resolved one fills a place that has none, or refines one that was not
 * chosen, and never touches a chosen zone. The place is returned as it came
 * when nothing changes.
 */
export function applyPlaceTimeZone(place, timeZone, chosen = false) {
  if (!place || !isKnownTimeZone(timeZone)) return place;
  if (chosen)
    return { ...place, timeZone, timeZoneSource: chosenTimeZoneSource };
  if (isChosenTimeZone(place) || place.timeZone === timeZone) return place;
  const { timeZoneSource, ...rest } = place;
  return { ...rest, timeZone };
}

/**
 * Why a place cannot be saved yet: `"timeZone"` while it has no zone the
 * runtime reads, `"coordinates"` while it has no position, else `null`.
 */
export function placeSaveBlock(place) {
  const latitude = finite(place?.latitude);
  const longitude = finite(place?.longitude);
  if (
    latitude === null ||
    longitude === null ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return "coordinates";
  return isKnownTimeZone(place?.timeZone) ? null : "timeZone";
}

// ---------------------------------------------------------------------------
// The copies of a place (the plan's, the session's, the person's own list).

/**
 * Two places are the same when they carry the same non-empty id, or sit at
 * the same position (a hundredth of a milli-degree, about eleven metres), or —
 * when one of them has no position — bear the same name: a session's place
 * has no id.
 */
export function isSamePlace(a, b) {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const idA = String(a.id ?? "");
  if (idA && idA === String(b.id ?? "")) return true;
  const latitudeA = finite(a.latitude);
  const longitudeA = finite(a.longitude);
  const latitudeB = finite(b.latitude);
  const longitudeB = finite(b.longitude);
  const hasA = latitudeA !== null && longitudeA !== null;
  const hasB = latitudeB !== null && longitudeB !== null;
  if (!hasA || !hasB) {
    const name = String(a.name ?? "")
      .trim()
      .toLowerCase();
    return (
      name !== "" &&
      name ===
        String(b.name ?? "")
          .trim()
          .toLowerCase()
    );
  }
  return (
    Math.abs(latitudeA - latitudeB) < 0.0001 &&
    Math.abs(longitudeA - longitudeB) < 0.0001
  );
}

/**
 * The place of a session with the zone its hours are read in. The service
 * gives a session's place (`night.place`) a name and a position, never a zone;
 * the zone is found, in order, in the plan's own copy of the place (when it is
 * the same place, or when the session's has no position), then in the places
 * the person keeps. A chosen zone keeps its mark. The table is not read here:
 * it answers at the moment the hours are written (`resolvePlaceTimeZone`).
 * `null` when the session names no place at all.
 */
export function sessionPlaceWithZone(night, plan, knownPlaces = []) {
  const copy = (value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? { ...value }
      : null;
  const base = copy(night) ?? copy(plan);
  if (!base) return null;
  if (isKnownTimeZone(base.timeZone)) return base;
  const hasPosition =
    finite(base.latitude) !== null && finite(base.longitude) !== null;
  const lend = (source) => {
    base.timeZone = source.timeZone;
    if (source.timeZoneSource === chosenTimeZoneSource)
      base.timeZoneSource = chosenTimeZoneSource;
    return base;
  };
  if (
    plan &&
    typeof plan === "object" &&
    isKnownTimeZone(plan.timeZone) &&
    (!hasPosition || isSamePlace(base, plan))
  )
    return lend(plan);
  for (const known of knownPlaces ?? [])
    if (isKnownTimeZone(known?.timeZone) && isSamePlace(known, base))
      return lend(known);
  return base;
}
