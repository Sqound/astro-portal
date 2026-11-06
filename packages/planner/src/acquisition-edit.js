// How a choice of "Prise de vue par cible" is written into a plan on the
// web: pure functions over the plan, and the preference of this browser that
// prefills the next new plan.
//
// A chosen value is **never rewritten by the rule**: what the person chose is
// stored as it is, and "Revenir aux suggestions" is the only thing that
// erases it. The filter of an item's first line is mirrored into
// `item.filter`, so that a reader that does not know `acquisition` (the
// iCalendar export, the printable sheet, an installed application of an
// earlier version) still shows the right filter (`normalizePlanAcquisition`).
import {
  acquisitionLimits,
  acquisitionLineRefusal,
  normalizeAcquisitionLine,
  normalizePlanAcquisition,
  planItemAcquisitionLines,
} from "./plan-acquisition.js";

// `localStorage` key of the browser preference: a line, never
// synchronised — it only prefills the defaults of the next new plan, as the
// twilight threshold does (`planner.darkness`).
export const acquisitionDefaultsStorageKey = "planner.acquisition_defaults";

const plain = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const has = (line, key) => Object.hasOwn(line ?? {}, key);

/** Whether a line chooses nothing. */
export const lineIsEmpty = (line) => !line || Object.keys(line).length === 0;

/** [plan] with its defaults set to [line] (`null` or an empty line: none). */
export function planWithAcquisitionDefaults(plan, line) {
  const { acquisitionDefaults: _previous, ...rest } = plan;
  return lineIsEmpty(line)
    ? rest
    : { ...rest, acquisitionDefaults: { ...line } };
}

/**
 * [item] with its first line set to [line] (`null` or an empty line: the
 * first line goes, and the item has no choice left when it had no other
 * line). The filter of the first line is mirrored into `item.filter`.
 */
export function itemWithAcquisitionLine(item, line) {
  const lines = planItemAcquisitionLines(item);
  const rest = lines.slice(1);
  // An emptied first line over other lines stays as an empty line ("all
  // inherited"): the other lines keep their places.
  const next = [
    ...(!lineIsEmpty(line) ? [line] : rest.length ? [{}] : []),
    ...rest,
  ];
  const { acquisition: _previous, ...result } = item;
  const written = next.length
    ? { ...result, acquisition: { lines: next } }
    : result;
  const aligned = normalizePlanAcquisition({ items: [written] });
  const first = aligned?.items?.[0];
  return plain(first) ? first : written;
}

/** [plan] with the item [itemId]'s first line set to [line]. */
export function planWithItemLine(plan, itemId, line) {
  return {
    ...plan,
    items: (plan.items ?? []).map((item) =>
      String(item?.id) === String(itemId)
        ? itemWithAcquisitionLine(item, line)
        : item,
    ),
  };
}

/** [line] with its exposure set (`null`: inherited again). */
export function lineWithExposure(line, seconds) {
  const { exposureSeconds: _previous, ...rest } = line ?? {};
  return seconds === null || seconds === undefined
    ? rest
    : { ...rest, exposureSeconds: seconds };
}

/**
 * [line] with its gain set: [chosen] false inherits it again, true with a
 * `null` [gain] is "the device's own setting".
 */
export function lineWithGain(line, { chosen, gain = null }) {
  const { gain: _previous, ...rest } = line ?? {};
  return chosen ? { ...rest, gain } : rest;
}

/**
 * [line] with its filter set: [chosen] false inherits it again, true with a
 * `null` [filter] is "no filter".
 */
export function lineWithFilter(line, { chosen, filter = null }) {
  const { filter: _previous, ...rest } = line ?? {};
  return chosen ? { ...rest, filter } : rest;
}

/** Whether the value is an exposure the contract accepts (> 0, ≤ 86 400 s). */
export const exposureIsValid = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0 &&
  value <= acquisitionLimits.exposureSeconds;

/** The text typed in an exposure field as a number: "1,5" is 1.5; `null` for none. */
export function exposureFromText(text) {
  const clean = String(text ?? "")
    .trim()
    .replace(",", ".");
  if (!clean) return null;
  return Number(clean);
}

/** The text an exposure is shown as in its field: "120", "1.5". */
export const exposureToText = (value) =>
  typeof value === "number" && Number.isFinite(value) ? String(value) : "";

/** The refusal of [line] the service would answer, `null` when it is fine. */
export const lineRefusal = (line) =>
  lineIsEmpty(line) ? null : acquisitionLineRefusal(line);

// ——— The preference of this browser ———

/** The defaults remembered on this browser, `null` for none. */
export function readAcquisitionDefaultsPreference(storage) {
  try {
    const raw = storage?.getItem(acquisitionDefaultsStorageKey);
    if (!raw) return null;
    const line = normalizeAcquisitionLine(JSON.parse(raw));
    return lineIsEmpty(line) ? null : line;
  } catch {
    return null;
  }
}

/** Remembers [line] (`null` or empty forgets it); whether the storage took it. */
export function writeAcquisitionDefaultsPreference(storage, line) {
  try {
    if (lineIsEmpty(line)) storage.removeItem(acquisitionDefaultsStorageKey);
    else storage.setItem(acquisitionDefaultsStorageKey, JSON.stringify(line));
    return true;
  } catch {
    return false;
  }
}

/**
 * What a plan created now carries: the remembered defaults, written only when
 * there are some, so a plan that never met any stays as it was.
 */
export function newPlanAcquisitionDefaults(preference) {
  const line = normalizeAcquisitionLine(preference);
  return lineIsEmpty(line) ? {} : { acquisitionDefaults: line };
}

export { has as lineHas };
