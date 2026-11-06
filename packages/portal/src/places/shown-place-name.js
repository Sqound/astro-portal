import { isSamePlace } from "../planner/place-time-zone.js";

/**
 * The name a place is shown under (a capture, a night, a line of the Journal).
 *
 * A night and its plan keep a **copy** of the place they were made at (name,
 * position, and the place's `id` when it was one of « Mes lieux »). The copy
 * is frozen, the place is not: renamed, or given a neutral name, the place is
 * the truth. So the name shown is that of the live place the copy stands for
 * (the same `id`, else the same position), and the copy's own name only when
 * no live place stands for it.
 *
 * A position is never a name: a place created from the frames' coordinates
 * and never named (« 36.73° N 139.99° E ») would say where the person lives
 * wherever its name is read. Such a name is passed over, and the next copy
 * (the night's place, then the plan's) speaks; none: no name.
 *
 * Pure: the caller hands over the live places (`knownPlaces`) it has read.
 */

const NUMBER = String.raw`-?\d{1,3}(?:[.,]\d+)?`;
const POSITION = new RegExp(
  String.raw`^\s*${NUMBER}\s*°?\s*[NSns]?\s*[,;/·]?\s*${NUMBER}\s*°?\s*[EWOewo]?\s*$`,
);

/** Whether `name` is a position written as a name (« 36.73° N 139.99° E », « 36.7, 139.9 »). */
export function isPositionName(name) {
  return typeof name === "string" && POSITION.test(name);
}

const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** The name of one copy of a place: its live place's, else its own; `null` for a position. */
export function placeCopyName(copy, knownPlaces = []) {
  if (!copy || typeof copy !== "object") return null;
  const live = (Array.isArray(knownPlaces) ? knownPlaces : []).find((known) =>
    isSamePlace(known, copy),
  );
  for (const name of [text(live?.name), text(copy.name), text(copy.locality)])
    if (name !== null && !isPositionName(name)) return name;
  return null;
}

/** The name shown for a place that has several copies, the first that speaks first. */
export function shownPlaceName(copies, knownPlaces = []) {
  for (const copy of copies) {
    const name = placeCopyName(copy, knownPlaces);
    if (name !== null) return name;
  }
  return null;
}
