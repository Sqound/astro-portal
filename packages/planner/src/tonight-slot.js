// The slot of the night chosen on "Cette nuit": the slot is the plan's slot — `plan.nightSpan` of
// tonight's pending plan —, and without such a plan a record in this browser
// for tonight only, forgotten once the night is no longer tonight.
import { customNightSpan, planWithNightSpan } from "./night-span.js";

/** The browser's record of tonight's slot (no plan to hold it). */
export const tonightSlotStorageKey = "astro-portal:tonight:night-slot";

const instant = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function span(start, end) {
  const from = instant(start);
  const to = instant(end);
  return from === null || to === null || to <= from
    ? null
    : { start: new Date(from).toISOString(), end: new Date(to).toISOString() };
}

/**
 * The plan of tonight the slot is written on: the first pending one — never a
 * plan whose night runs on another device (`subject.executing`): it is read here,
 * not written.
 */
export function tonightSlotPlan(subject) {
  return (
    (subject?.plans || []).find(
      (plan) =>
        (plan.status ?? "pending") === "pending" &&
        !subject?.executing?.[plan.id],
    ) || null
  );
}

/** A plan's custom span `{ start, end }`, `null` for the whole night. */
export function planCustomSpan(plan) {
  const nightSpan = plan?.nightSpan;
  return nightSpan?.mode === "custom"
    ? span(nightSpan.start, nightSpan.end)
    : null;
}

/** The browser's record `{ date, start, end }`, `null` without one. */
export function readTonightSlotRecord(storage) {
  try {
    const value = JSON.parse(storage?.getItem(tonightSlotStorageKey) || "null");
    if (!value || typeof value.date !== "string") return null;
    const chosen = span(value.start, value.end);
    return chosen ? { date: value.date, ...chosen } : null;
  } catch {
    return null;
  }
}

/** Writes (or, `record` `null`, forgets) the browser's record. */
export function writeTonightSlotRecord(storage, record) {
  try {
    if (record) storage?.setItem(tonightSlotStorageKey, JSON.stringify(record));
    else storage?.removeItem(tonightSlotStorageKey);
  } catch {
    // Storage refused: the choice holds for this page.
  }
}

/**
 * Tonight's chosen slot `{ start, end }`, `null` for the whole night: the
 * pending plan's custom span when there is such a plan, else the browser's
 * record when it is for the night the page shows.
 */
export function tonightChosenSlot(subject, record) {
  const plan = tonightSlotPlan(subject);
  if (plan) return planCustomSpan(plan);
  return record && record.date === subject?.date
    ? { start: record.start, end: record.end }
    : null;
}

/**
 * The plans with tonight's slot written on the pending plan (`slot` `null`:
 * the whole night), and the plan written; `plan` is `null` without a pending
 * plan (the slot is then the browser's record).
 */
export function plansWithTonightSlot(plans, subject, slot) {
  const plan = tonightSlotPlan(subject);
  if (!plan) return { plans, plan: null };
  const nightSpan = slot
    ? { mode: "custom", start: slot.start, end: slot.end }
    : { mode: "astronomical" };
  return {
    plans: (plans || []).map((entry) =>
      entry.id === plan.id ? planWithNightSpan(entry, nightSpan) : entry,
    ),
    plan,
  };
}

/**
 * The slot brought inwards onto ten-minute marks inside the sky's bounds,
 * as the editor holds it (`{ mode, start, end }`); `null` when less than
 * thirty minutes are left.
 */
export function tonightSnappedSlot(sky, slot) {
  if (!sky || !slot) return null;
  return customNightSpan({
    bounds: sky.bounds,
    darkStart: slot.start,
    darkEnd: slot.end,
  });
}
