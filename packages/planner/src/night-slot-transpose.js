// The call sites of `transposeNightSpan` (`night-span.js`):
// a chosen slot follows the place's local hours when the place changes zone,
// within the new astronomical night, and goes back to the whole night, with
// one line saying so, when less than an hour is left. Layered on top of
// `applyNightPlace` (a tested rule that never grows a field), the
// way `location-review.js` is.
import { planWithNightSpan, transposeNightSpan } from "./night-span.js";
import { planNightWindow } from "./planner.js";

/** The dark night `{ start, end }` of `date` at `place` (the plan's darkness). */
function darkNightAt(date, darkness, place) {
  const window = planNightWindow({ date, darkness }, place);
  return window ? { start: window.darkStart, end: window.darkEnd } : null;
}

/**
 * `after` (the state once `applyNightPlace` moved the place) with the custom
 * slot of each plan of its active night transposed from the place of `before`
 * to the new one: `{ state, fellBack, slots }` — `slots` the ids of the plans
 * that held a custom slot, `fellBack` those put back on the astronomical
 * night. The exact same `after` comes back when no plan holds a slot.
 */
export function transposeNightSpansOfPlaceChange(before, after) {
  const from = before?.location;
  const to = after?.location;
  const fellBack = [];
  const slots = [];
  if (!from || !to) return { state: after, fellBack, slots };
  const plans = (after.plans || []).map((plan) => {
    if (
      !plan ||
      plan.nightId !== after.activeNightId ||
      plan.nightSpan?.mode !== "custom"
    )
      return plan;
    const date = plan.date ?? after.date;
    const night = darkNightAt(date, plan.darkness, to);
    if (!night) return plan;
    const result = transposeNightSpan({
      span: plan.nightSpan,
      date,
      from,
      to,
      night,
    });
    slots.push(plan.id);
    if (result.fellBack) fellBack.push(plan.id);
    return planWithNightSpan(plan, result.span);
  });
  return slots.length
    ? { state: { ...after, plans }, fellBack, slots }
    : { state: after, fellBack, slots };
}

/**
 * The browser's record of tonight's slot (`{ date, start, end }`, no plan to
 * hold it) moved with the place: `{ record, fellBack }`, `record` `null` when
 * the slot went back to the whole night.
 */
export function transposeDeviceSlot({ record, darkness, from, to }) {
  if (!record || !from || !to) return { record, fellBack: false };
  const night = darkNightAt(record.date, darkness, to);
  if (!night) return { record, fellBack: false };
  const result = transposeNightSpan({
    span: { mode: "custom", start: record.start, end: record.end },
    date: record.date,
    from,
    to,
    night,
  });
  if (result.span?.mode !== "custom")
    return { record: null, fellBack: result.fellBack };
  return {
    record: {
      date: record.date,
      start: result.span.start,
      end: result.span.end,
    },
    fellBack: false,
  };
}
