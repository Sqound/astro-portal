// The input of a plan's frise: a stored plan turned into what
// `plan-frise.js` takes — the dark night, the place's offset, one item per
// placed target with its label, its slot and the heights of the target over the
// night.
//
// **The heights are the planner's own**: the series come from
// `planNightGeometry` (the plan's date, place and darkness and the targets of
// its items, one sample every ten minutes from the start of the night) and the
// night from `planNightWindow`, as `tonightPlanCard` reads it. No second
// ephemeris, nothing from an execution: the frise shows the plan as planned.
//
// One geometry computation per **version** of a plan: the result is cached
// under a fingerprint of the plan's date, place, darkness and items (their
// slots and targets), so a card that renders again never computes again and
// a plan that changes does.
import { planNightGeometry, planNightWindow } from "./planner.js";
import { zoneOffsetMinutes } from "./horizon-path-mode.js";
import { planTargetLabel } from "./tonight-overview.js";
import { customSpanOfWindow, friseWithSpan } from "./night-span.js";
import { planFrise } from "./plan-frise.js";

/** How many plan versions the cache keeps (the least recently used goes first). */
export const planFriseCacheLimit = 96;

const cache = new Map();
let computations = 0;

/** How many times the planner's geometry was computed since the cache was cleared. */
export const planFriseGeometryComputations = () => computations;

/** Empties the cache and the counter. */
export function resetPlanFriseCache() {
  cache.clear();
  computations = 0;
}

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// The item's slot, or `null` when it has none (an item that draws no block).
function slotOf(item) {
  if (!isObject(item)) return null;
  const { startMinute: start, endMinute: end } = item;
  if (typeof start !== "number" || typeof end !== "number") return null;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return null;
  return { start, end };
}

/** Whether `plan` has a target placed on its night (a slot): it can have a frise. */
export function planHasPlacedTarget(plan) {
  return Array.isArray(plan?.items) && plan.items.some((item) => slotOf(item));
}

function fingerprint(plan, location, items) {
  return JSON.stringify([
    plan.date ?? null,
    plan.darkness ?? null,
    location
      ? [location.latitude, location.longitude, location.timeZone]
      : null,
    items.map((item) => [
      item.startMinute,
      item.endMinute,
      item.target?.coordinate ?? null,
      item.target?.objects ?? null,
      item.target?.stellarium?.source ?? null,
      planTargetLabel(item),
    ]),
  ]);
}

function compute(plan, location, items) {
  computations += 1;
  let window = null;
  try {
    window = planNightWindow(plan, location);
  } catch {
    return null;
  }
  if (!window?.darkStart || !window?.darkEnd) return null;
  const keyed = [];
  const targets = [];
  items.forEach((item, index) => {
    if (!slotOf(item)) return;
    const key = `item-${index}`;
    keyed.push({ item, key });
    if (isObject(item.target))
      targets.push({
        ...item.target,
        id: key,
        source: key,
        plannerSource: null,
      });
  });
  if (!keyed.length) return null;
  // The series of every item that has a target the planner can place.
  const seriesByKey = new Map();
  try {
    const geometry = planNightGeometry({
      date: plan.date,
      location,
      targets,
      planetReferences: { planets: [] },
      darkness: plan.darkness,
    });
    for (const candidate of geometry?.candidates ?? [])
      seriesByKey.set(
        candidate.target.id,
        candidate.series.map(({ time, altitude }) => ({ time, altitude })),
      );
  } catch {
    // A target the planner cannot place: its block is drawn with its name and
    // no curve.
    seriesByKey.clear();
  }
  return {
    night: { start: window.darkStart, end: window.darkEnd },
    items: keyed.map(({ item, key }) => {
      const { start, end } = slotOf(item);
      return {
        key,
        label: planTargetLabel(item),
        startMinute: start,
        endMinute: end,
        series: seriesByKey.get(key) ?? null,
      };
    }),
  };
}

/**
 * The input of the frise of `plan` (a stored plan), or `null` when the plan has
 * none: no usable night (no place coordinates, no date) or no target placed on
 * it. The night is searched for the plan's own `location`, else `place`; the
 * hours are those of `timeZone` (the zone the page writes its times in), else
 * of the plan's place; a place with no usable time zone reads as UTC, offset 0,
 * as the clock text of the cards does.
 *
 * The result is what `planFrise` and `planFriseScale` take (without `scale`
 * and `heights`).
 */
export function planFriseInput(plan, { place = null, timeZone } = {}) {
  const location = plan?.location ?? place;
  if (!isObject(plan) || !isObject(location)) return null;
  const items = Array.isArray(plan.items) ? plan.items.filter(isObject) : [];
  if (!items.some((item) => slotOf(item))) return null;
  const key = fingerprint(plan, location, items);
  let geometry;
  if (cache.has(key)) {
    geometry = cache.get(key);
    cache.delete(key);
    cache.set(key, geometry);
  } else {
    geometry = compute(plan, location, items);
    cache.set(key, geometry);
    while (cache.size > planFriseCacheLimit)
      cache.delete(cache.keys().next().value);
  }
  if (!geometry) return null;
  return {
    night: geometry.night,
    utcOffsetMinutes: zoneOffsetMinutes(
      geometry.night.start,
      timeZone ?? location.timeZone,
    ),
    items: geometry.items,
    // The night the plan chose, when it chose one.
    span: spanOf(plan, location),
  };
}

// The custom span of `plan`, `{ start, end }`, or `null` for the whole night.
// Most plans take the whole night: no search for the Sun for them.
function spanOf(plan, location) {
  if (plan?.nightSpan?.mode !== "custom") return null;
  try {
    return customSpanOfWindow(planNightWindow(plan, location));
  } catch {
    return null;
  }
}

/**
 * The frise of the plan `input` (a result of `planFriseInput`) on `scale`
 * (`undefined` for the plan's own), with the night the plan chose laid on it;
 * `null` when there is nothing to draw.
 */
export function planFriseOf(input, { scale } = {}) {
  if (!input) return null;
  const frise = planFrise(scale ? { ...input, scale } : input);
  return frise ? friseWithSpan(frise, input.span) : null;
}
