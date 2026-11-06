// The plan as a frise: the rule that turns a plan's
// night, its blocks and the heights of its targets into what a frise draws —
// one hour scale, one block per target over its slot, the height of the target
// as a curve inside the block, the twilights, two reference heights. Nothing
// here is an ephemeris: the heights come from the series the planner already
// computes (`planNightGeometry`, one sample every ten minutes), and the frise
// shows the plan **as planned**, never the execution. No word, no format, no
// DOM.
//
// Pure, JSON in and JSON out, like `target-path.js`.
//
// **Plan input** (`planFriseScale` takes a list of them, `planFrise` takes
// one with `scale` and `heights` added):
//
//     { night: { start, end },       // ISO-8601 UTC instants of the dark night
//       utcOffsetMinutes,            // the place's offset at the start of the night
//       items: [ { key, label, startMinute, endMinute, series } ] }
//
// The minutes of an item count from `night.start`, as every plan item does;
// `series` is `[ { time, altitude } ]` (extra fields are ignored) or `null`.
//
// A **clock minute** is the local minute of the day counted from the local
// midnight of the day of the noon that precedes the night: 18:30 is 1110,
// 05:00 the next morning is 1740. The hours of the scale are therefore the
// whole local hours of the place, whatever its offset (+5:30 included).

const minuteMs = 60000;
const dayMinutes = 1440;
const noonMinutes = 720;
const halfHourMinutes = 30;

/** The reference heights of a frise. */
export const planFriseDefaultHeights = [30, 60];

/** A trend needs this many degrees of change through the slot. */
export const planFriseTrendDegrees = 10;

const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function instantMs(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

const iso = (ms) => new Date(Math.round(ms)).toISOString();

// The heights are never negative here: the round half up.
const roundHeight = (value) => Math.floor(value + 0.5);

// The night of a plan input: its start (ms), its length in minutes and the
// clock minute of its start; `null` when it cannot be used.
function nightOf(plan) {
  const night = plan?.night;
  if (!isObject(night)) return null;
  const start = instantMs(night.start);
  const end = instantMs(night.end);
  if (start === null || end === null || end <= start) return null;
  const offset = finite(plan.utcOffsetMinutes) ?? 0;
  const local = start / minuteMs + offset;
  const day = Math.floor(local / dayMinutes);
  const timeOfDay = local - day * dayMinutes;
  // The noon that precedes the night: the same day's when the night starts
  // after noon, the previous day's otherwise.
  const noonDay = timeOfDay >= noonMinutes ? day : day - 1;
  return {
    startMs: start,
    minutes: (end - start) / minuteMs,
    clock: local - noonDay * dayMinutes,
  };
}

// An item that draws a block: a finite slot of positive length.
function slotOf(item) {
  if (!isObject(item)) return null;
  const start = finite(item.startMinute);
  const end = finite(item.endMinute);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

/**
 * The hour scale shared by `plans`: the union of their nights, in clock
 * minutes, and of their blocks (which may lie in the twilight when a plan has a
 * custom span), its start rounded **down** and its end **up** to the half hour.
 * `{ startClock, endClock }`, or `null` when no plan has a usable night. A plan
 * with an unusable night is ignored; a plan with a usable night counts even
 * without a block, so a caller that wants only the plans that show a frise
 * passes only those.
 *
 * The night 18:54 → 04:38 gives 1110 → 1740, i.e. 18:30 → 05:00.
 */
export function planFriseScale(plans) {
  let low = null;
  let high = null;
  const take = (from, to) => {
    low = low === null ? from : Math.min(low, from);
    high = high === null ? to : Math.max(high, to);
  };
  for (const plan of Array.isArray(plans) ? plans : []) {
    const night = nightOf(plan);
    if (night === null) continue;
    take(night.clock, night.clock + night.minutes);
    if (Array.isArray(plan.items))
      for (const item of plan.items) {
        const slot = slotOf(item);
        if (slot) take(night.clock + slot.start, night.clock + slot.end);
      }
  }
  if (low === null || high === null) return null;
  return {
    startClock: Math.floor(low / halfHourMinutes) * halfHourMinutes,
    endClock: Math.ceil(high / halfHourMinutes) * halfHourMinutes,
  };
}

function seriesPoints(series) {
  if (!Array.isArray(series)) return [];
  const points = [];
  for (const point of series) {
    if (!isObject(point)) continue;
    const ms = instantMs(point.time);
    const altitude = finite(point.altitude);
    if (ms !== null && altitude !== null) points.push({ ms, altitude });
  }
  return points.sort((left, right) => left.ms - right.ms);
}

// The height at `ms`, interpolated linearly between the two samples around it
// (`points` sorted, `ms` inside their span).
function altitudeAt(points, ms) {
  for (let index = 1; index < points.length; index += 1) {
    const after = points[index];
    if (ms <= after.ms) {
      const before = points[index - 1];
      const span = after.ms - before.ms;
      if (span <= 0) return after.altitude;
      return (
        before.altitude +
        ((after.altitude - before.altitude) * (ms - before.ms)) / span
      );
    }
  }
  return points.at(-1).altitude;
}

const clamp = (altitude) => Math.min(90, Math.max(0, altitude));

/**
 * What a frise draws for one plan: `{ scale: { startClock, endClock, start,
 * end }, night: { start, end, x0, x1 }, heights: [{ degrees, y }], ticks:
 * [{ at, hour, labelled }], blocks: [{ key, label, start, end, x0, x1, from,
 * to, trend, curve }] }`, or `null` without a usable night or without a
 * block. `args` is a plan input (see the top of this file) with the scale
 * (`scale`: `null` for the plan's own `planFriseScale`, or a shared one) and
 * the reference heights (`heights`, `planFriseDefaultHeights` when absent).
 *
 * The `x` values are fractions of the scale (0 to 1 for what lies inside it);
 * `y` is the height over 90° (0 to 1). `ticks` are the whole local hours
 * strictly inside the scale, `labelled` on the even ones. A block is an item
 * with a finite slot of positive length. Its `curve` is the list `{ x, altitude
 * }` made of the start of the part of the slot the series covers, every sample
 * strictly inside it, and its end (the end heights interpolated linearly
 * between the two samples around them), **every altitude clamped to 0°–90°: a
 * part of the slot under the horizon is drawn at 0° and no lower**. `curve` is
 * `null` when the series is `null`, empty or does not cover the slot at all.
 * `from` and `to` are the whole-degree heights at the first and last point of
 * the curve (or `null`); `trend` is `rises` when the heights never decrease
 * through the slot and rise by at least `planFriseTrendDegrees`, `falls` for
 * the mirror, `none` otherwise.
 */
export function planFrise(args) {
  const night = nightOf(args);
  if (night === null) return null;
  const slots = [];
  if (Array.isArray(args.items))
    for (const item of args.items) {
      const slot = slotOf(item);
      if (slot) slots.push({ item, slot });
    }
  if (!slots.length) return null;
  const scale = isObject(args.scale) ? args.scale : planFriseScale([args]);
  const startClock = finite(scale?.startClock);
  const endClock = finite(scale?.endClock);
  if (startClock === null || endClock === null || endClock <= startClock)
    return null;
  const length = endClock - startClock;
  const x = (clock) => (clock - startClock) / length;
  const clockOf = (ms) => night.clock + (ms - night.startMs) / minuteMs;

  const heights = Array.isArray(args.heights)
    ? args.heights.map(finite).filter((degrees) => degrees !== null)
    : [...planFriseDefaultHeights];

  const ticks = [];
  for (
    let clock = Math.floor(startClock / 60) * 60 + 60;
    clock < endClock;
    clock += 60
  ) {
    const hour = (((Math.floor(clock / 60) % 24) + 24) % 24) | 0;
    ticks.push({ at: x(clock), hour, labelled: hour % 2 === 0 });
  }

  const blocks = [];
  for (const { item, slot } of slots) {
    const slotStartMs = night.startMs + slot.start * minuteMs;
    const slotEndMs = night.startMs + slot.end * minuteMs;
    const points = seriesPoints(item.series);
    let curve = null;
    if (points.length >= 2) {
      const low = Math.max(slotStartMs, points[0].ms);
      const high = Math.min(slotEndMs, points.at(-1).ms);
      if (high > low)
        curve = [
          { x: x(clockOf(low)), altitude: clamp(altitudeAt(points, low)) },
          ...points
            .filter((point) => point.ms > low && point.ms < high)
            .map((point) => ({
              x: x(clockOf(point.ms)),
              altitude: clamp(point.altitude),
            })),
          { x: x(clockOf(high)), altitude: clamp(altitudeAt(points, high)) },
        ];
    }
    let from = null;
    let to = null;
    let trend = "none";
    if (curve) {
      const altitudes = curve.map((point) => point.altitude);
      from = roundHeight(altitudes[0]);
      to = roundHeight(altitudes.at(-1));
      const never = (breaks) => {
        for (let index = 1; index < altitudes.length; index += 1)
          if (breaks(altitudes[index - 1], altitudes[index])) return false;
        return true;
      };
      const change = altitudes.at(-1) - altitudes[0];
      if (
        change >= planFriseTrendDegrees &&
        never((before, after) => after < before)
      )
        trend = "rises";
      else if (
        -change >= planFriseTrendDegrees &&
        never((before, after) => after > before)
      )
        trend = "falls";
    }
    blocks.push({
      key: item.key ?? null,
      label: item.label ?? null,
      start: iso(slotStartMs),
      end: iso(slotEndMs),
      x0: x(night.clock + slot.start),
      x1: x(night.clock + slot.end),
      from,
      to,
      trend,
      curve,
    });
  }

  return {
    scale: {
      startClock: Math.round(startClock),
      endClock: Math.round(endClock),
      start: iso(night.startMs + (startClock - night.clock) * minuteMs),
      end: iso(night.startMs + (endClock - night.clock) * minuteMs),
    },
    night: {
      start: iso(night.startMs),
      end: iso(night.startMs + night.minutes * minuteMs),
      x0: x(night.clock),
      x1: x(night.clock + night.minutes),
    },
    heights: heights.map((degrees) => ({ degrees, y: degrees / 90 })),
    ticks,
    blocks,
  };
}
