// The acquisition lines of a plan (« Prise de vue par cible »): what the
// person chose to shoot, per target and for the whole plan, and what was
// frozen when the night was launched. One line is the line of the captures'
// contract (`schemas/api/capture.schema.json`: `proposedAcquisitionLine`,
// `capture-metadata.js` `acquisitionLineInput`), with the same names, units
// and bounds, plus `binning`, so that what was planned and what was
// measured compare field by field:
//
// - `filter`: the filter as the person names it, 1 to 40 characters, never
//   normalised; `null` is « no filter »; absent is inherited.
// - `exposureSeconds`: one exposure in seconds, more than 0, at most 86 400.
// - `gain`: the camera's gain (or a camera body's ISO), an integer; `null`
//   is « the device's own setting »; absent is inherited.
// - `binning`: an integer from 1 to 8.
// - `frameCount`: the number of exposures, an integer of at least 1.
//
// Every field is optional: an absent field is inherited (target line, then
// `item.filter` for the filter of the first line, then the plan's
// `acquisitionDefaults`, then the suggestion). Only the person's choices are
// stored; the suggestion is computed on reading (`effectiveAcquisition`),
// never written here.
//
// Where the lines live in a plan payload (`schemas/api/plan.schema.json`,
// `schemas/planner/planner-document.schema.json`):
// - `acquisitionDefaults`: one line, the plan's defaults;
// - `items[].acquisition`: `{ lines }`, 1 to 8 lines, the target's choice;
// - `launchedSchedule[].acquisition` (`{ lines }`, the EFFECTIVE lines at
//   the launch, the suggestion resolved) and `launchedSchedule[].ruleVersion`
//   (the version of the suggestion rule that resolved them).
//
// Two readings, pinned by the fixtures `plan-acquisition` and
// `plan-acquisition-refusal`:
// - `planAcquisitionRefusal` is the write check of the service: the first
//   value out of bounds, `{ field, limit, message }` (the vocabulary of a
//   capture line's `invalid_metadata`), or `null`;
// - `normalizePlanAcquisition` is the reading: it keeps what it understands
//   and discards the rest (an unknown field, a value out of bounds, a line
//   that is not an object), and it aligns `item.filter` on the filter of the
//   target's first line, so that a reader that does not know `acquisition`
//   (the iCalendar export, the printable sheet, an installed application of
//   an earlier version) still shows the right filter.

export const acquisitionLimits = Object.freeze({
  filter: 40,
  exposureSeconds: 86400,
  gainMin: -1000,
  gainMax: 100000,
  binningMin: 1,
  binningMax: 8,
  frameCountMax: 100000,
  lines: 8,
  ruleVersion: 64,
});

/** The fields of a line, in the order a normalised line writes them. */
export const acquisitionLineFields = Object.freeze([
  "filter",
  "exposureSeconds",
  "gain",
  "binning",
  "frameCount",
]);

const plain = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
// Characters as the captures count them (code points, not UTF-16 units).
const textLength = (text) => [...text].length;
const integer = (value) =>
  typeof value === "number" && Number.isSafeInteger(value);

const refusal = (field, limit, message) => ({ field, limit, message });

function filterValue(value) {
  if (value === null) return { value: null };
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return { value: null };
  if (textLength(trimmed) > acquisitionLimits.filter) return null;
  return { value: trimmed };
}

function exposureValue(value) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= acquisitionLimits.exposureSeconds
    ? { value }
    : null;
}

function gainValue(value) {
  if (value === null) return { value: null };
  return integer(value) &&
    value >= acquisitionLimits.gainMin &&
    value <= acquisitionLimits.gainMax
    ? { value }
    : null;
}

function binningValue(value) {
  return integer(value) &&
    value >= acquisitionLimits.binningMin &&
    value <= acquisitionLimits.binningMax
    ? { value }
    : null;
}

function frameCountValue(value) {
  return integer(value) &&
    value >= 1 &&
    value <= acquisitionLimits.frameCountMax
    ? { value }
    : null;
}

const fieldValue = {
  filter: filterValue,
  exposureSeconds: exposureValue,
  gain: gainValue,
  binning: binningValue,
  frameCount: frameCountValue,
};

function ruleVersionValue(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && textLength(trimmed) <= acquisitionLimits.ruleVersion
    ? { value: trimmed }
    : null;
}

// ——— The write check ———

function lineFieldRefusal(field, key, value) {
  if (fieldValue[key](value)) return null;
  const path = `${field}.${key}`;
  switch (key) {
    case "filter":
      return typeof value === "string"
        ? refusal(
            path,
            acquisitionLimits.filter,
            `filter holds ${acquisitionLimits.filter} characters at most.`,
          )
        : refusal(
            path,
            acquisitionLimits.filter,
            "filter is a string or null.",
          );
    case "exposureSeconds":
      return typeof value === "number" &&
        Number.isFinite(value) &&
        value > acquisitionLimits.exposureSeconds
        ? refusal(
            path,
            acquisitionLimits.exposureSeconds,
            `exposureSeconds is a duration of ${acquisitionLimits.exposureSeconds} s at most.`,
          )
        : refusal(path, 0, "exposureSeconds is a duration of more than 0 s.");
    case "gain":
      return refusal(path, null, "gain is an integer or null.");
    case "binning":
      return refusal(
        path,
        acquisitionLimits.binningMax,
        `binning is an integer from ${acquisitionLimits.binningMin} to ${acquisitionLimits.binningMax}.`,
      );
    default:
      return integer(value) && value > acquisitionLimits.frameCountMax
        ? refusal(
            path,
            acquisitionLimits.frameCountMax,
            `frameCount is an integer of at most ${acquisitionLimits.frameCountMax}.`,
          )
        : refusal(path, 1, "frameCount is an integer of at least 1.");
  }
}

/** The first refused value of one line at [field], or `null`. */
export function acquisitionLineRefusal(value, field = "acquisitionLine") {
  if (!plain(value))
    return refusal(field, null, "An acquisition line is an object.");
  for (const key of acquisitionLineFields) {
    if (!has(value, key)) continue;
    const refused = lineFieldRefusal(field, key, value[key]);
    if (refused) return refused;
  }
  return null;
}

function linesRefusal(value, field) {
  if (!plain(value))
    return refusal(field, null, "acquisition is an object holding its lines.");
  const lines = value.lines;
  const path = `${field}.lines`;
  if (!Array.isArray(lines) || lines.length < 1)
    return refusal(
      path,
      1,
      `lines is a list of 1 to ${acquisitionLimits.lines} acquisition lines.`,
    );
  if (lines.length > acquisitionLimits.lines)
    return refusal(
      path,
      acquisitionLimits.lines,
      `lines holds ${acquisitionLimits.lines} acquisition lines at most.`,
    );
  for (const [index, line] of lines.entries()) {
    const refused = acquisitionLineRefusal(line, `${path}[${index}]`);
    if (refused) return refused;
  }
  return null;
}

/**
 * The first value of [plan]'s acquisition fields a write refuses
 * (`acquisitionDefaults`, `items[i].acquisition`, `launchedSchedule[i]
 * .acquisition` and `.ruleVersion`), as `{ field, limit, message }` — the
 * field named by its path in the plan — or `null` when there is none. An
 * absent or `null` field is no choice and is never refused; a field a line
 * does not define is not refused either (the reading discards it).
 */
export function planAcquisitionRefusal(plan) {
  if (!plain(plan)) return null;
  if (has(plan, "acquisitionDefaults") && plan.acquisitionDefaults !== null) {
    const refused = acquisitionLineRefusal(
      plan.acquisitionDefaults,
      "acquisitionDefaults",
    );
    if (refused) return refused;
  }
  if (Array.isArray(plan.items))
    for (const [index, item] of plan.items.entries()) {
      if (
        !plain(item) ||
        !has(item, "acquisition") ||
        item.acquisition === null
      )
        continue;
      const refused = linesRefusal(
        item.acquisition,
        `items[${index}].acquisition`,
      );
      if (refused) return refused;
    }
  if (Array.isArray(plan.launchedSchedule))
    for (const [index, entry] of plan.launchedSchedule.entries()) {
      if (!plain(entry)) continue;
      if (has(entry, "acquisition") && entry.acquisition !== null) {
        const refused = linesRefusal(
          entry.acquisition,
          `launchedSchedule[${index}].acquisition`,
        );
        if (refused) return refused;
      }
      if (
        has(entry, "ruleVersion") &&
        entry.ruleVersion !== null &&
        !ruleVersionValue(entry.ruleVersion)
      )
        return refusal(
          `launchedSchedule[${index}].ruleVersion`,
          acquisitionLimits.ruleVersion,
          `ruleVersion is a text of 1 to ${acquisitionLimits.ruleVersion} characters.`,
        );
    }
  return null;
}

// ——— The reading ———

/**
 * One line as it is kept: the fields it understands, each inside its
 * bounds (a filter trimmed, a blank one read as `null`), in the order of
 * `acquisitionLineFields`; `null` when [value] is not an object. A line
 * whose every field is absent is a real line (« everything inherited »).
 */
export function normalizeAcquisitionLine(value) {
  if (!plain(value)) return null;
  const line = {};
  for (const key of acquisitionLineFields) {
    if (!has(value, key)) continue;
    const kept = fieldValue[key](value[key]);
    if (kept) line[key] = kept.value;
  }
  return line;
}

/**
 * `{ lines }` as kept: the lines that are objects, normalised, the first
 * eight; `null` when none is left (no choice).
 */
export function normalizeAcquisitionLines(value) {
  if (!plain(value) || !Array.isArray(value.lines)) return null;
  const lines = value.lines
    .map(normalizeAcquisitionLine)
    .filter((line) => line !== null)
    .slice(0, acquisitionLimits.lines);
  return lines.length ? { lines } : null;
}

/**
 * The filter an old reader must see for [item] once its first line names
 * one: the line's filter, `""` for its « no filter » (`null`), or
 * `undefined` when the first line names none (the item's own filter
 * stands).
 */
function firstLineFilter(acquisition) {
  const first = acquisition?.lines?.[0];
  if (!first || !has(first, "filter")) return undefined;
  return first.filter ?? "";
}

function normalizeItem(item) {
  if (!plain(item) || !has(item, "acquisition")) return item;
  const { acquisition: raw, ...rest } = item;
  const acquisition = normalizeAcquisitionLines(raw);
  if (!acquisition) return rest;
  const next = { ...rest, acquisition };
  const filter = firstLineFilter(acquisition);
  if (filter !== undefined && (item.filter ?? "") !== filter)
    next.filter = filter;
  return next;
}

function normalizeLaunchedEntry(entry) {
  if (!plain(entry)) return entry;
  if (!has(entry, "acquisition") && !has(entry, "ruleVersion")) return entry;
  const { acquisition: rawLines, ruleVersion: rawVersion, ...rest } = entry;
  const acquisition = normalizeAcquisitionLines(rawLines);
  const ruleVersion = ruleVersionValue(rawVersion);
  return {
    ...rest,
    ...(acquisition ? { acquisition } : {}),
    ...(ruleVersion ? { ruleVersion: ruleVersion.value } : {}),
  };
}

/**
 * [plan] with its acquisition fields as kept (see the head of this file):
 * `acquisitionDefaults` normalised (removed when it holds nothing),
 * `items[].acquisition` normalised and `item.filter` aligned on the filter
 * of its first line, `launchedSchedule[].acquisition` and `.ruleVersion`
 * normalised. Every other field is left as it is; a plan that carries none
 * of these fields is answered as it is (the same object).
 */
export function normalizePlanAcquisition(plan) {
  if (!plain(plan)) return plan;
  let next = plan;
  const copy = () => {
    if (next === plan) next = { ...plan };
    return next;
  };
  if (has(plan, "acquisitionDefaults")) {
    const defaults = normalizeAcquisitionLine(plan.acquisitionDefaults);
    const target = copy();
    if (defaults && Object.keys(defaults).length)
      target.acquisitionDefaults = defaults;
    else delete target.acquisitionDefaults;
  }
  if (Array.isArray(plan.items)) {
    const items = plan.items.map(normalizeItem);
    if (items.some((item, index) => item !== plan.items[index]))
      copy().items = items;
  }
  if (Array.isArray(plan.launchedSchedule)) {
    const entries = plan.launchedSchedule.map(normalizeLaunchedEntry);
    if (entries.some((entry, index) => entry !== plan.launchedSchedule[index]))
      copy().launchedSchedule = entries;
  }
  return next;
}

// ——— Readers ———

/** The plan's defaults (one line), `null` when it has none. */
export function planAcquisitionDefaults(plan) {
  const line = plain(plan)
    ? normalizeAcquisitionLine(plan.acquisitionDefaults)
    : null;
  return line && Object.keys(line).length ? line : null;
}

/** The target's chosen lines, `[]` when it chose none. */
export function planItemAcquisitionLines(item) {
  return plain(item)
    ? (normalizeAcquisitionLines(item.acquisition)?.lines ?? [])
    : [];
}

/**
 * What the launch froze, by plan item: `{ [planItemId]: { lines,
 * ruleVersion } }` for every entry of `launchedSchedule` that carries
 * lines (`ruleVersion` `null` when it names none); `{}` for a plan launched
 * without them, or not launched.
 */
export function launchedAcquisitionByItem(plan) {
  const result = {};
  if (!plain(plan) || !Array.isArray(plan.launchedSchedule)) return result;
  for (const entry of plan.launchedSchedule) {
    if (!plain(entry) || typeof entry.planItemId !== "string") continue;
    const acquisition = normalizeAcquisitionLines(entry.acquisition);
    if (!acquisition) continue;
    result[entry.planItemId] = {
      lines: acquisition.lines,
      ruleVersion: ruleVersionValue(entry.ruleVersion)?.value ?? null,
    };
  }
  return result;
}
