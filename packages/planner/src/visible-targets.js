import { visibleThatNight } from "./target-night-facts.js";

// "Visible that night" of "Add a target" on the web: the targets that were high at the session's
// place during its hours, offered beside the search when a target is added to a
// session (the debriefing and "Remanier la session"). Free and pure: JSON in,
// JSON out. The height is `visibleThatNight` (the very computation of the sheet
// of a target), so the list says what the sheet would.
//
// Defaults (nothing fixes which targets): the pool is the catalogue's
// selection "Essentielles" plus the person's favourites — never the whole
// catalogue, whose highest rows would be obscure objects near the zenith;
// judged between the session's real hours when it has both, else over the
// astronomical night; at least 30° at its best, above the place's horizon
// mask; the highest first, twenty at most; what the session already holds is
// left out.

/** The lowest best height a target must reach to be offered, in degrees. */
export const visibleTargetsMinimumAltitude = 30;

/** The most rows the list holds. */
export const visibleTargetsLimit = 20;

const finite = (value) => {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : null;
};

/**
 * What the list is judged against, or `null` when the session has no usable
 * place or night (the list is then absent and the search stays alone, with no
 * message): the plan's place with its horizon mask, else the place the
 * session recorded; the night's evening; the session's real hours, both or
 * neither, in the right order.
 */
export function visibleTargetsSpan({
  planPlace = null,
  recordedPlace = null,
  date,
  start = null,
  end = null,
  darkness,
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ""))) return null;
  let place = null;
  for (const candidate of [planPlace, recordedPlace]) {
    if (!candidate || typeof candidate !== "object") continue;
    const latitude = finite(candidate.latitude);
    const longitude = finite(candidate.longitude);
    if (latitude === null || longitude === null) continue;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    place = { ...candidate, latitude, longitude };
    break;
  }
  if (!place) return null;
  const from = Date.parse(start);
  const to = Date.parse(end);
  const hours = Number.isFinite(from) && Number.isFinite(to) && to > from;
  return {
    place,
    date,
    from: hours ? new Date(from).toISOString() : null,
    to: hours ? new Date(to).toISOString() : null,
    darkness,
  };
}

/**
 * The pool: the Essentielles and the favourites, one row per target, `ra` in
 * hours and `dec` in degrees as `visibleThatNight` reads them. A row without
 * an identifier or a coordinate is dropped.
 */
export function visibleTargetsPool(...lists) {
  const pool = new Map();
  for (const list of lists)
    for (const entry of Array.isArray(list) ? list : []) {
      const id = typeof entry?.id === "string" ? entry.id : null;
      const ra = finite(entry?.ra);
      const dec = finite(entry?.dec);
      if (!id || ra === null || dec === null || pool.has(id)) continue;
      pool.set(id, { ...entry, id, ra, dec });
    }
  return [...pool.values()];
}

/**
 * The rows of the list: `[{ ...target, maxAltitude, at }]`, the highest
 * first, without the targets in `taken` (identifiers or designations).
 */
export function visibleTargetsRows({
  pool,
  span,
  taken = [],
  limit = visibleTargetsLimit,
}) {
  if (!span || !Array.isArray(pool) || !pool.length) return [];
  const left = new Set(taken.map(String));
  const candidates = pool.filter(
    (target) => !left.has(target.id) && !left.has(String(target.designation)),
  );
  const found = visibleThatNight({
    targets: candidates.map(({ id, ra, dec }) => ({ id, ra, dec })),
    place: span.place,
    date: span.date,
    from: span.from ?? undefined,
    to: span.to ?? undefined,
    minimumAltitude: visibleTargetsMinimumAltitude,
    limit,
    darkness: span.darkness,
  });
  const byId = new Map(candidates.map((target) => [target.id, target]));
  return found
    .map((entry) => ({
      ...byId.get(entry.targetId),
      maxAltitude: entry.maxAltitude,
      at: entry.at,
    }))
    .filter((row) => row.id)
    .slice(0, limit);
}

/**
 * A row of `GET /api/planner-targets` (degrees, J2000) or of
 * `GET /api/target-library` (hours): the pool's row, `ra` in hours.
 */
export function visibleTargetFromLibrary(target, { degrees = false } = {}) {
  const coordinate = target?.coordinate;
  const ra = finite(coordinate?.ra);
  return {
    id: target?.id ?? null,
    designation: target?.designation ?? null,
    name: target?.name ?? null,
    typeKey: target?.skyTarget?.typeKey ?? target?.typeKey ?? null,
    photoUrl:
      target?.curatedPhotoImageUrl ??
      target?.previewUrl ??
      target?.imageUrl ??
      null,
    ra: ra === null ? null : degrees ? ra / 15 : ra,
    dec: finite(coordinate?.dec),
  };
}
