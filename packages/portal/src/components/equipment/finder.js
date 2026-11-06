/**
 * AXIS-CALIBRATION-FINDER-01 (AXF-3, Q1): the telescope's finder, the
 * answer the phone's « Calibrer l’axe » asks before it calibrates. Kept in the
 * item's `planner.finder`: `aligned` (« Aligné sur le tube ») or `none`
 * (« Aucun »); absent, « Non précisé » — the field and the words the
 * application's « Mon matériel » writes (web ↔ mobile parity).
 */

/** The finder values a telescope's form offers, in their order. */
export const FINDER_VALUES = Object.freeze(["", "aligned", "none"]);

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** The finder of [draft]: `aligned`, `none`, or `""` (not said). */
export function finderOf(draft) {
  const value = isObject(draft?.planner) ? draft.planner.finder : undefined;
  return value === "aligned" || value === "none" ? value : "";
}

/** [draft] with its finder set to [value] (`""` leaves the field out). */
export function withFinder(draft, value) {
  const planner = { ...(isObject(draft?.planner) ? draft.planner : {}) };
  if (value === "aligned" || value === "none") planner.finder = value;
  else delete planner.finder;
  return { ...draft, planner };
}
