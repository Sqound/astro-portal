// The settings half of « Deux versions de ce plan »: every field of a plan
// outside its targets, compared between the two versions of a diverged plan
// and composed into the merged plan the same way on the web and on the
// server (conformance fixture `plan-merge-fields`).
//
// Vocabulary: `local` is the version of the device that resolves (this
// browser's set-aside attempt on the web, this phone's own edit on the
// phone); `other` is the server's live copy (the other device's write). A
// choice names one of the two: `"local"` or `"other"`.
//
// A row is one setting the person can see and choose. `equipment` is split
// into its parts (telescope, mount, camera…); `date` carries the plan's
// `nightId` with it (the night belongs to the date). Fields that are never a
// row:
// - `items`: the targets, composed on the rails, given by the caller;
// - `view`: display preferences, last write, silent — the version being
//   written now (`local`) keeps its own (the server's when it has none);
// - `launchedSchedule`: the execution record of a launched night, never
//   merged — the server's copy (`other`) always wins;
// - `migrationReview`, `locationReview`, `locationReviewReason`: recomputed
//   by the planner, taken from the server's copy;
// - `status`/`archivedAt` and any field this list does not name (inside
//   `equipment` too): silent three-way — the side that changed since the base
//   wins, the server's copy otherwise.

/**
 * The rows, in the order the screens list them: what the plan is, its
 * equipment, its constraints, then the conditions of its night (the wind
 * tolerance with the darkness and the span).
 */
export const planFieldRows = Object.freeze([
  Object.freeze({ id: "name", keys: ["name"] }),
  Object.freeze({ id: "date", keys: ["date", "nightId"], compare: ["date"] }),
  Object.freeze({ id: "location", keys: ["location"] }),
  Object.freeze({ id: "equipment.mode", equipment: ["mode"] }),
  Object.freeze({
    id: "equipment.telescope",
    equipment: ["telescopeId"],
  }),
  Object.freeze({ id: "equipment.mount", equipment: ["mountId"] }),
  Object.freeze({
    id: "equipment.camera",
    equipment: ["cameraId"],
  }),
  Object.freeze({
    id: "equipment.eyepiece",
    equipment: ["eyepieceId", "eyepieceFocalLengthMm"],
  }),
  Object.freeze({
    id: "equipment.modifier",
    equipment: ["modifierId"],
  }),
  Object.freeze({ id: "equipment.filters", equipment: ["filterIds"] }),
  Object.freeze({
    id: "equipment.restrictToEquipment",
    equipment: ["restrictToEquipment"],
  }),
  Object.freeze({ id: "minAltitude", keys: ["minAltitude"] }),
  Object.freeze({
    id: "moonSeparationMinimum",
    keys: ["moonSeparationMinimum"],
  }),
  Object.freeze({
    id: "moonSeparationMinimumByFilter",
    keys: ["moonSeparationMinimumByFilter"],
  }),
  Object.freeze({ id: "mountSafety", keys: ["mountSafety"] }),
  Object.freeze({ id: "catalogueSelection", keys: ["catalogueSelection"] }),
  Object.freeze({
    id: "equipment.windTolerance",
    equipment: ["windTolerance"],
  }),
  Object.freeze({ id: "darkness", keys: ["darkness"] }),
  Object.freeze({ id: "nightSpan", keys: ["nightSpan"] }),
]);

export const planFieldRowIds = Object.freeze(
  planFieldRows.map((row) => row.id),
);

export const planFieldSideLocal = "local";
export const planFieldSideOther = "other";

// Never compared, never a row; each has its own rule (see above).
const viewKeys = ["view"];
const serverKeys = [
  "launchedSchedule",
  "migrationReview",
  "locationReview",
  "locationReviewReason",
];
const rowTopKeys = new Set(
  planFieldRows.flatMap((row) => (row.equipment ? [] : row.keys)),
);
const rowEquipmentKeys = new Set(
  planFieldRows.flatMap((row) => row.equipment || []),
);
const notSilentTopKeys = new Set([
  "items",
  "equipment",
  ...viewKeys,
  ...serverKeys,
  ...rowTopKeys,
]);

const windPresets = {
  light: [15, 25],
  standard: [20, 30],
  heavy: [30, 45],
};

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const has = (object, key) =>
  isObject(object) && Object.prototype.hasOwnProperty.call(object, key);
const copy = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function numeric(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

// Nothing to choose between: absent, null, "", false, [] and an object of
// such values all read the same (a plan written by another surface may omit
// what this one spells out empty).
function empty(value) {
  if (value === undefined || value === null || value === "" || value === false)
    return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isObject(value)) return Object.values(value).every(empty);
  return false;
}

/** Equality of two stored values, tolerant of their spelling. */
export function samePlanFieldValue(left, right) {
  if (empty(left) && empty(right)) return true;
  const leftNumber = numeric(left);
  const rightNumber = numeric(right);
  if (leftNumber !== null && rightNumber !== null)
    return leftNumber === rightNumber;
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((value, index) => samePlanFieldValue(value, right[index]))
    );
  if (isObject(left) && isObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].every((key) => samePlanFieldValue(left[key], right[key]));
  }
  return left === right;
}

// What a row compares: the plan's own reading of its fields, so that two
// spellings of the same setting are never shown as a difference.
function comparable(rowId, values) {
  switch (rowId) {
    case "equipment.filters":
      return [
        ...new Set(
          (Array.isArray(values.filterIds) ? values.filterIds : []).map(String),
        ),
      ].sort();
    case "equipment.windTolerance": {
      const tolerance = isObject(values.windTolerance)
        ? values.windTolerance
        : {};
      const preset = windPresets[tolerance.preset] ? tolerance.preset : null;
      if (tolerance.preset === "custom")
        return {
          preset: "custom",
          sustainedKmh: numeric(tolerance.sustainedKmh),
          gustKmh: numeric(tolerance.gustKmh),
        };
      const [sustainedKmh, gustKmh] = windPresets[preset || "standard"];
      return { preset: preset || "standard", sustainedKmh, gustKmh };
    }
    case "darkness":
      return ["nautical", "civil"].includes(values.darkness)
        ? values.darkness
        : "astronomical";
    case "nightSpan": {
      const span = values.nightSpan;
      return isObject(span) && span.mode === "custom"
        ? { mode: "custom", start: span.start, end: span.end }
        : { mode: "astronomical" };
    }
    case "location": {
      // The place as the person knows it: its name, where it is, its height,
      // its time zone and its horizon. The bookkeeping a surface adds around
      // it (an id, a version, a review flag, a link to a known place) is not
      // a setting of the plan.
      const place = isObject(values.location) ? values.location : {};
      const coordinate = (value) => {
        const number = numeric(value);
        return number === null ? null : Math.round(number * 1e5) / 1e5;
      };
      return {
        name: typeof place.name === "string" ? place.name.trim() : place.name,
        latitude: coordinate(place.latitude),
        longitude: coordinate(place.longitude),
        elevation: place.elevation,
        timeZone: place.timeZone,
        horizonMask: place.horizonMask,
      };
    }
    case "mountSafety": {
      const safety = isObject(values.mountSafety) ? values.mountSafety : {};
      const start = numeric(safety.azimuthStart);
      const end = numeric(safety.azimuthEnd);
      const cable = start !== null && end !== null;
      return {
        enabled: Boolean(safety.enabled),
        zenithAvoidanceDegrees: numeric(safety.zenithAvoidanceDegrees) || 0,
        azimuthStart: cable ? start : null,
        azimuthEnd: cable ? end : null,
        // MERIDIAN-LIMIT-02a: stored and compared, never computed with here.
        // The cut is on unless the plan says otherwise; the plan's own N
        // (null: the mount's value).
        meridianCut: safety.meridianCut !== false,
        meridianLimitMinutes: numeric(safety.meridianLimitMinutes),
      };
    }
    default:
      return values;
  }
}

// The raw values a row holds in [plan], keyed by their own field names.
function rowValues(row, plan) {
  const source = row.equipment
    ? isObject(plan?.equipment)
      ? plan.equipment
      : {}
    : plan || {};
  const keys = row.equipment || row.compare || row.keys;
  return Object.fromEntries(
    keys.filter((key) => has(source, key)).map((key) => [key, source[key]]),
  );
}

function rowsEqual(row, left, right) {
  return samePlanFieldValue(
    comparable(row.id, rowValues(row, left)),
    comparable(row.id, rowValues(row, right)),
  );
}

// Writes [row]'s fields of [from] into [target] (absent stays absent).
function writeRow(row, target, from) {
  const keys = row.equipment || row.keys;
  const source = row.equipment ? from?.equipment : from;
  const destination = row.equipment ? target.equipment : target;
  for (const key of keys) {
    if (has(source, key)) destination[key] = copy(source[key]);
    else delete destination[key];
  }
}

// Silent three-way for a field with no row: the side that changed since the
// base, the server's copy otherwise (no base, or both changed).
function silentSide(key, local, other, base, inEquipment) {
  const read = (plan) =>
    inEquipment
      ? isObject(plan?.equipment)
        ? plan.equipment[key]
        : undefined
      : plan?.[key];
  if (!base) return planFieldSideOther;
  const localChanged = !samePlanFieldValue(read(local), read(base));
  const otherChanged = !samePlanFieldValue(read(other), read(base));
  return localChanged && !otherChanged
    ? planFieldSideLocal
    : planFieldSideOther;
}

/**
 * The rows that differ between [local] and [other], in screen order, with
 * the side each one starts on:
 * - with a common [base]: the side that changed since the base
 *   (`reason: "changed"`); both changed → `preselected: null`;
 * - without one: the more recent version ([options.newer], `"local"` by
 *   default), `reason: "newer"`.
 * `changed` lists the sides that changed since the base (empty without one).
 */
export function planFieldDifferences(local, other, base = null, options = {}) {
  const newer =
    options?.newer === planFieldSideOther
      ? planFieldSideOther
      : planFieldSideLocal;
  const hasBase = isObject(base);
  return planFieldRows
    .filter((row) => !rowsEqual(row, local, other))
    .map((row) => {
      const changed = hasBase
        ? [
            ...(rowsEqual(row, local, base) ? [] : [planFieldSideLocal]),
            ...(rowsEqual(row, other, base) ? [] : [planFieldSideOther]),
          ]
        : [];
      const preselected = !hasBase
        ? newer
        : changed.length === 1
          ? changed[0]
          : null;
      return {
        field: row.id,
        local: rowValues({ ...row, compare: null }, local),
        other: rowValues({ ...row, compare: null }, other),
        changed,
        preselected,
        reason: hasBase ? "changed" : "newer",
      };
    });
}

/**
 * The merged plan of a divergence: [options.items] as its targets (the
 * server's targets when omitted), one value per differing row from
 * [choices] (`{ <row id>: "local" | "other" }`) or, when a row has no
 * choice, from its pre-selected side, and every other field by its own rule
 * (see the top of this file).
 *
 * Returns `{ rows, choices, missing, unknown, payload }`: `missing` lists the
 * rows that still need a choice (both sides changed them) — `payload` is
 * `null` until it is empty; `unknown` lists the choice keys that name no row
 * (the server refuses them).
 */
export function mergePlanFields(
  local,
  other,
  base = null,
  choices = {},
  options = {},
) {
  const given = isObject(choices) ? choices : {};
  const unknown = Object.keys(given)
    .filter((key) => !planFieldRowIds.includes(key))
    .sort();
  const rows = planFieldDifferences(local, other, base, options);
  const effective = {};
  const missing = [];
  for (const row of rows) {
    const choice = given[row.field];
    const side =
      choice === planFieldSideLocal || choice === planFieldSideOther
        ? choice
        : row.preselected;
    if (side) effective[row.field] = side;
    else missing.push(row.field);
  }
  if (missing.length || unknown.length)
    return { rows, choices: effective, missing, unknown, payload: null };

  const localPlan = isObject(local) ? local : {};
  const otherPlan = isObject(other) ? other : {};
  const basePlan = isObject(base) ? base : null;
  const payload = {};
  // Silent fields: every key of either side that no rule above names.
  const topKeys = new Set([
    ...Object.keys(localPlan),
    ...Object.keys(otherPlan),
  ]);
  for (const key of topKeys) {
    if (notSilentTopKeys.has(key)) continue;
    const from =
      silentSide(key, localPlan, otherPlan, basePlan, false) ===
      planFieldSideLocal
        ? localPlan
        : otherPlan;
    if (has(from, key)) payload[key] = copy(from[key]);
  }
  if (has(localPlan, "equipment") || has(otherPlan, "equipment")) {
    payload.equipment = {};
    const equipmentKeys = new Set([
      ...Object.keys(isObject(localPlan.equipment) ? localPlan.equipment : {}),
      ...Object.keys(isObject(otherPlan.equipment) ? otherPlan.equipment : {}),
    ]);
    for (const key of equipmentKeys) {
      if (rowEquipmentKeys.has(key)) continue;
      const from =
        silentSide(key, localPlan, otherPlan, basePlan, true) ===
        planFieldSideLocal
          ? localPlan
          : otherPlan;
      if (has(from.equipment, key))
        payload.equipment[key] = copy(from.equipment[key]);
    }
  }
  // Rows: the chosen side where they differ, the server's copy where they
  // read the same.
  for (const row of planFieldRows) {
    if (row.equipment && !payload.equipment) continue;
    const from =
      effective[row.id] === planFieldSideLocal ? localPlan : otherPlan;
    writeRow(row, payload, from);
  }
  for (const key of viewKeys)
    if (has(localPlan, key)) payload[key] = copy(localPlan[key]);
    else if (has(otherPlan, key)) payload[key] = copy(otherPlan[key]);
  for (const key of serverKeys)
    if (has(otherPlan, key)) payload[key] = copy(otherPlan[key]);
  payload.items = copy(
    Array.isArray(options?.items)
      ? options.items
      : Array.isArray(otherPlan.items)
        ? otherPlan.items
        : [],
  );
  return { rows, choices: effective, missing, unknown, payload };
}

/** Every row on one side: the two shortcuts (« Garder … version »). */
export function planFieldChoicesFor(rows, side) {
  return Object.fromEntries((rows || []).map((row) => [row.field, side]));
}
