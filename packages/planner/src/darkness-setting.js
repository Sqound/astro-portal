// The twilight threshold of the planner.
//
// The threshold is a preference of the browser: choosing one becomes the
// default of new plans and is written to every plan that can still take it
// (`applyDarknessToPlans`). Every plan carries its own `darkness`, so a night
// already executed, or whose night has started, keeps the windows it was
// planned with.
import {
  normalizePlanDarkness,
  planDarknessValues,
} from "portal/planner/state.js";
import { planNightWindow } from "./planner.js";

export { planDarknessValues };

// `localStorage` key of the browser preference.
export const darknessStorageKey = "planner.darkness";
export const defaultDarkness = "astronomical";

// The three choices, in the order of the screen, with the message keys of
// their label, their Sun line, their hint and their short name.
export const darknessChoices = Object.freeze([
  {
    darkness: "astronomical",
    altitude: 18,
    label: "plannerAstronomicalNight",
    hint: "plannerDarknessHintAstronomical",
    short: "plannerDarknessShortAstronomical",
  },
  {
    darkness: "nautical",
    altitude: 12,
    label: "plannerDarknessNautical",
    hint: "plannerDarknessHintNautical",
    short: "plannerDarknessShortNautical",
  },
  {
    darkness: "civil",
    altitude: 6,
    label: "plannerDarknessCivil",
    hint: "plannerDarknessHintCivil",
    short: "plannerDarknessShortCivil",
  },
]);

// The message key of the night's label for a threshold: "Nuit astronomique",
// "Crépuscule nautique", "Crépuscule civil".
export function darknessLabelKey(darkness) {
  return (
    darknessChoices.find((choice) => choice.darkness === darkness)?.label ||
    darknessChoices[0].label
  );
}

const knownStatuses = new Set([
  "pending",
  "executed",
  "partial",
  "abandoned",
  "archived",
]);
const minute = 60000;

// The preference as stored, or the default when storage is missing, refuses
// the read (private window, blocked site data) or holds anything else.
export function readDarknessPreference(storage) {
  try {
    return (
      normalizePlanDarkness(storage?.getItem(darknessStorageKey)) ||
      defaultDarkness
    );
  } catch {
    return defaultDarkness;
  }
}

// Whether the preference was stored; a refusing storage is not an error the
// person has to hear about, the choice still applies to the plans.
export function writeDarknessPreference(storage, value) {
  try {
    storage.setItem(
      darknessStorageKey,
      normalizePlanDarkness(value) || defaultDarkness,
    );
    return true;
  } catch {
    return false;
  }
}

// The plan's own threshold, `astronomical` when absent or unknown.
export function planDarkness(plan) {
  return normalizePlanDarkness(plan?.darkness) || defaultDarkness;
}

// What a plan created now carries: the preference, written only when it is
// not the default, so a plan that never met another threshold stays as it was.
export function newPlanDarkness(preference) {
  const darkness = normalizePlanDarkness(preference) || defaultDarkness;
  return darkness === defaultDarkness ? {} : { darkness };
}

// Has the plan's night begun at `now` (epoch milliseconds)? It begins at
// sunset (the dark start when the Sun never sets); a plan whose night cannot
// be computed begins with its date.
export function planNightHasStarted(plan, now) {
  const window = planNightWindow(plan);
  const begin = Date.parse(window?.sunset || window?.darkStart || "");
  if (Number.isFinite(begin)) return now >= begin;
  return (
    typeof plan?.date === "string" &&
    plan.date < new Date(now).toISOString().slice(0, 10)
  );
}

// A plan takes a new threshold when it is pending, has no observation
// session, and its night has not started: never an executed, partial,
// abandoned or archived plan.
export function planTakesDarkness(plan, { now, sessionPlanIds = [] } = {}) {
  if (!plan || typeof plan !== "object") return false;
  const status = knownStatuses.has(plan.status) ? plan.status : "pending";
  if (status !== "pending" || plan.archivedAt) return false;
  if (new Set(sessionPlanIds).has(plan.id)) return false;
  return !planNightHasStarted(plan, now);
}

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// A scheduled interval counts its minutes from the start of the night, so a
// new threshold moves that origin; the intervals follow it, to keep their
// clock time, and stay inside the new night. One that would fall wholly
// outside it is brought back to the edge, with its own length. Nothing is
// removed.
function reanchoredItems(items, shift, total) {
  if (!Array.isArray(items) || !shift) return items;
  return items.map((item) => {
    if (!item || typeof item !== "object") return item;
    const next = { ...item };
    const hasStart = isNumber(item.startMinute);
    const hasEnd = isNumber(item.endMinute);
    if (hasStart) next.startMinute = clamp(item.startMinute + shift, 0, total);
    if (hasEnd)
      next.endMinute = clamp(
        item.endMinute + shift,
        hasStart ? next.startMinute : 0,
        total,
      );
    if (hasStart && hasEnd) {
      const length = item.endMinute - item.startMinute;
      if (next.endMinute === next.startMinute && length > 0) {
        if (next.startMinute >= total)
          next.startMinute = Math.max(0, total - length);
        next.endMinute = Math.min(total, next.startMinute + length);
      }
      if (isNumber(item.durationMinutes))
        next.durationMinutes = next.endMinute - next.startMinute;
    }
    return next;
  });
}

// One plan with a new threshold: its `darkness`, and its intervals moved so
// that they keep their clock time.
export function planWithDarkness(plan, darkness) {
  const target = normalizePlanDarkness(darkness) || defaultDarkness;
  const next = { ...plan, darkness: target };
  const before = planNightWindow(plan);
  const after = planNightWindow(next);
  if (!before || !after || !Array.isArray(plan.items) || !plan.items.length)
    return next;
  // The minutes count from the start of the dark night, never from a custom
  // span: a plan whose span is chosen keeps its intervals' clock time against
  // its dark night too.
  const shift = Math.round(
    (Date.parse(before.darkStart) - Date.parse(after.darkStart)) / minute,
  );
  const total = Math.max(
    1,
    Math.round(
      (Date.parse(after.darkEnd) - Date.parse(after.darkStart)) / minute,
    ),
  );
  return { ...next, items: reanchoredItems(plan.items, shift, total) };
}

// Applies `darkness` to every plan of `plans` that takes it and does not
// already have it: `{ plans, changedIds }`, `plans` being the same array when
// nothing changes. `sessionPlanIds` lists the plans that have an observation
// session.
export function applyDarknessToPlans(plans, darkness, options = {}) {
  const target = normalizePlanDarkness(darkness) || defaultDarkness;
  const changedIds = [];
  const next = (plans || []).map((plan) => {
    if (planDarkness(plan) === target) return plan;
    if (!planTakesDarkness(plan, options)) return plan;
    changedIds.push(plan.id);
    return planWithDarkness(plan, target);
  });
  return changedIds.length
    ? { plans: next, changedIds }
    : { plans: plans || [], changedIds };
}

// The three windows of a night for the place and date of `plan`, for the
// "Effet sur ce soir" lines: `{ darkness, start, end, minutes }` each, in
// the order astronomical, nautical, civil; `null` when the night cannot be
// computed.
export function darknessEffects(plan) {
  const place = plan?.location;
  if (!plan?.date || !place) return null;
  const rows = planDarknessValues.map((darkness) => {
    const window = planNightWindow({
      date: plan.date,
      location: place,
      darkness,
    });
    return window
      ? {
          darkness,
          start: window.darkStart,
          end: window.darkEnd,
          minutes: Math.round(
            (Date.parse(window.darkEnd) - Date.parse(window.darkStart)) /
              minute,
          ),
        }
      : null;
  });
  return rows.every(Boolean) ? rows : null;
}
