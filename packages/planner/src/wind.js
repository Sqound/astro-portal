// The wind and gust tolerance of the mount.
//
// A tolerance is two limits, the sustained wind and the gusts, in km/h,
// chosen among three presets or typed by hand. It is a setting of the mount
// on this browser (`localStorage`, a map keyed by the inventory mount's id,
// `default` without one), copied into each plan that uses that mount as
// `plan.equipment.windTolerance`; a plan without it reads "Standard".
// `windAssessment` compares the night's hourly forecast with it.
import { planTakesDarkness } from "./darkness-setting.js";

// `localStorage` key of the browser preference.
export const windToleranceStorageKey = "planner.windTolerance";
// The key of the map when the plan names no mount of the inventory.
export const windToleranceDefaultKey = "default";
export const defaultWindPreset = "standard";

// The limits of a hand-typed value, and the share of a limit from which an
// hour is "proche de la limite" (90 %).
export const windToleranceRule = Object.freeze({
  minimumKmh: 5,
  maximumKmh: 80,
  stepKmh: 1,
  nearPercent: 90,
});

// The four choices, in the order of the screen, with the message key of
// their label. `custom` has no values of its own.
export const windTolerancePresets = Object.freeze([
  Object.freeze({
    preset: "light",
    sustainedKmh: 15,
    gustKmh: 25,
    label: "plannerWindPresetLight",
  }),
  Object.freeze({
    preset: "standard",
    sustainedKmh: 20,
    gustKmh: 30,
    label: "plannerWindPresetStandard",
  }),
  Object.freeze({
    preset: "heavy",
    sustainedKmh: 30,
    gustKmh: 45,
    label: "plannerWindPresetHeavy",
  }),
  Object.freeze({
    preset: "custom",
    sustainedKmh: null,
    gustKmh: null,
    label: "plannerWindPresetCustom",
  }),
]);

const hourMs = 3600000;
const presetNamed = (name) =>
  windTolerancePresets.find(
    (entry) => entry.preset === name && entry.preset !== "custom",
  ) || null;
const standard = () => presetNamed(defaultWindPreset);

// A hand-typed limit: a whole number of km/h between 5 and 80, `fallback`
// when it is not a number.
function limit(value, fallback) {
  const number =
    typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : typeof value === "number"
        ? value
        : Number.NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(
    windToleranceRule.maximumKmh,
    Math.max(windToleranceRule.minimumKmh, Math.round(number)),
  );
}

// `{ preset, sustainedKmh, gustKmh }` from anything: a preset's name, a stored
// object, or nothing ("Standard"). A named preset always carries its own
// values; "Personnalisé" keeps two whole numbers between 5 and 80 km/h, a
// missing one taking the value of "Standard".
export function normalizeWindTolerance(value) {
  const fallback = standard();
  const source =
    typeof value === "string"
      ? { preset: value }
      : value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
  if (source.preset === "custom")
    return {
      preset: "custom",
      sustainedKmh: limit(source.sustainedKmh, fallback.sustainedKmh),
      gustKmh: limit(source.gustKmh, fallback.gustKmh),
    };
  const preset = presetNamed(source.preset) || fallback;
  return {
    preset: preset.preset,
    sustainedKmh: preset.sustainedKmh,
    gustKmh: preset.gustKmh,
  };
}

export function sameWindTolerance(a, b) {
  const left = normalizeWindTolerance(a);
  const right = normalizeWindTolerance(b);
  return (
    left.preset === right.preset &&
    left.sustainedKmh === right.sustainedKmh &&
    left.gustKmh === right.gustKmh
  );
}

// The key of a plan's equipment in the preference map: the inventory mount's
// id, else `default` (a guest, or "Aucune").
export function windToleranceKey(equipment) {
  return equipmentHasMount(equipment)
    ? String(equipment.mountId)
    : windToleranceDefaultKey;
}

// Whether `equipment` names a mount at all. The wind tolerance is the
// mount's: a plan without one (a visual plan on a Dobsonian, "Aucune monture
// choisie") has no limit for the gusts to come near, so its targets are never
// flagged "rafales proches de la limite de votre monture".
export function equipmentHasMount(equipment) {
  const id = equipment?.mountId;
  return !(id === null || id === undefined || id === "" || id === "none");
}

// The stored map, every entry normalised; an unreadable store or value gives
// an empty map.
export function readWindTolerancePreferences(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(windToleranceStorageKey) || "");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [
        key,
        normalizeWindTolerance(value),
      ]),
    );
  } catch {
    return {};
  }
}

// Whether the map was stored; a refusing storage still lets the choice apply
// to the plans.
export function writeWindTolerancePreferences(storage, preferences) {
  try {
    storage.setItem(windToleranceStorageKey, JSON.stringify(preferences || {}));
    return true;
  } catch {
    return false;
  }
}

// The tolerance this browser keeps for the mount of `equipment`.
export function windToleranceForEquipment(preferences, equipment) {
  const stored = preferences?.[windToleranceKey(equipment)];
  return normalizeWindTolerance(stored);
}

// `equipment` with the tolerance kept for its mount: written when one is
// kept, removed otherwise (the plan then reads "Standard"). Used when a
// plan changes mount.
export function equipmentWithWindTolerance(equipment, preferences) {
  const next = { ...(equipment || {}) };
  const stored = preferences?.[windToleranceKey(equipment)];
  if (stored && typeof stored === "object")
    next.windTolerance = normalizeWindTolerance(stored);
  else delete next.windTolerance;
  return next;
}

// The plan's own tolerance, "Standard" when it has none.
export function planWindTolerance(plan) {
  return normalizeWindTolerance(plan?.equipment?.windTolerance);
}

export function planWithWindTolerance(plan, tolerance) {
  return {
    ...plan,
    equipment: {
      ...(plan?.equipment || {}),
      windTolerance: normalizeWindTolerance(tolerance),
    },
  };
}

// Writes `tolerance`, chosen for the mount `key`, into every plan using that
// mount that can still take it (the rule of the twilight threshold: pending,
// no observation session, night not started) and does not already carry it:
// `{ plans, changedIds }`, `plans` being the same array when nothing changes.
export function applyWindToleranceToPlans(plans, key, tolerance, options = {}) {
  const target = normalizeWindTolerance(tolerance);
  const changedIds = [];
  const next = (plans || []).map((plan) => {
    if (windToleranceKey(plan?.equipment) !== String(key)) return plan;
    if (sameWindTolerance(planWindTolerance(plan), target)) return plan;
    if (!planTakesDarkness(plan, options)) return plan;
    changedIds.push(plan.id);
    return planWithWindTolerance(plan, target);
  });
  return changedIds.length
    ? { plans: next, changedIds }
    : { plans: plans || [], changedIds };
}

const instant = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
const measured = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

// `ok`, `near` (at least 90 % of a limit) or `over` (beyond a limit) for one
// value against its limit; compared in percent of whole numbers so 27
// against 30 is exactly "near", with no rounding of 0.9 × 30.
function valueLevel(value, max) {
  if (value === null) return null;
  if (value > max) return "over";
  if (value * 100 >= max * windToleranceRule.nearPercent) return "near";
  return "ok";
}
const rank = { ok: 0, near: 1, over: 2 };
const worse = (a, b) =>
  a === null ? b : b === null ? a : rank[b] > rank[a] ? b : a;

// The night's wind against the mount's tolerance. `hourly` holds the rows of
// `hourlyAstronomyForecast` (`time` in epoch milliseconds, `wind` and `gust`
// in km/h); each row stands for the hour that starts at `time`, and only the
// hours overlapping `window` (`{ start, end }`, ISO-8601 or milliseconds;
// absent: every row) count. Returns `null` when no hour of the window has a
// wind or a gust; otherwise the level of each hour, the night's level (the
// worst), the strongest gust and sustained wind with the first hour they are
// reached, and the first hour `near` or worse and the first hour `over`.
export function windAssessment({ hourly, tolerance, window } = {}) {
  const limits = normalizeWindTolerance(tolerance);
  const start = instant(window?.start);
  const end = instant(window?.end);
  const hours = [];
  for (const row of Array.isArray(hourly) ? hourly : []) {
    const time = instant(row?.time);
    if (time === null) continue;
    if (start !== null && time + hourMs <= start) continue;
    if (end !== null && time >= end) continue;
    const wind = measured(row.wind);
    const gust = measured(row.gust);
    if (wind === null && gust === null) continue;
    hours.push({
      time,
      wind,
      gust,
      level: worse(
        valueLevel(wind, limits.sustainedKmh),
        valueLevel(gust, limits.gustKmh),
      ),
    });
  }
  if (!hours.length) return null;
  const peak = (key) =>
    hours.reduce(
      (best, hour) =>
        hour[key] !== null && (!best || hour[key] > best[key]) ? hour : best,
      null,
    );
  const gustPeak = peak("gust");
  const windPeak = peak("wind");
  return {
    tolerance: limits,
    level: hours.reduce((level, hour) => worse(level, hour.level), "ok"),
    hours,
    gustMax: gustPeak ? gustPeak.gust : null,
    gustMaxAt: gustPeak ? gustPeak.time : null,
    windMax: windPeak ? windPeak.wind : null,
    windMaxAt: windPeak ? windPeak.time : null,
    firstNearAt: hours.find((hour) => hour.level !== "ok")?.time ?? null,
    firstOverAt: hours.find((hour) => hour.level === "over")?.time ?? null,
  };
}

// What the line on tonight's wind speaks of: the gusts, or the sustained wind
// when it is the one that sets the night's level (a setting of 22 / 34 km/h,
// gusts reaching 31 under 34 and the sustained wind above 22). `{ subject:
// "gust" | "sustained", level, value, at }` from an assessment, `null` when
// it has neither a gust nor a sustained wind. The gusts speak on a tie, and
// when only they were forecast. The level is the same as the assessment's.
export function windTonightSubject(assessment) {
  const limits = normalizeWindTolerance(assessment?.tolerance);
  const gustLevel = valueLevel(measured(assessment?.gustMax), limits.gustKmh);
  const windLevel = valueLevel(
    measured(assessment?.windMax),
    limits.sustainedKmh,
  );
  const gust = {
    subject: "gust",
    level: gustLevel,
    value: assessment?.gustMax,
    at: assessment?.gustMaxAt ?? null,
  };
  const sustained = {
    subject: "sustained",
    level: windLevel,
    value: assessment?.windMax,
    at: assessment?.windMaxAt ?? null,
  };
  if (
    windLevel !== null &&
    (gustLevel === null || rank[windLevel] > rank[gustLevel])
  )
    return sustained;
  return gustLevel !== null ? gust : null;
}
