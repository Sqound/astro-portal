// The span of the night a plan uses: "Durée de la nuit" in the
// place-and-date stage.
//
// A plan either takes the whole dark night (`nightSpan` absent or `{ mode:
// "astronomical" }`) or a custom span `{ mode: "custom", start, end }` chosen
// with two handles on a timeline: ten-minute steps, never before sunset nor
// after sunrise, thirty minutes at least (`nightSpanRule`). The span never
// re-times the plan: its intervals keep their minutes, counted from the start
// of the dark night as before. The placement of a new target stays inside the
// span (`cardWithinNightSpan`), and an interval that reaches outside it is
// flagged, never removed (`scheduleItemNightSpanReason` in
// `recommendations.js`).
import { zonedDateOrLongitudeAnchor } from "astro-core/night-window.js";
import { nightSpanRule } from "portal/planner/state.js";

const minute = 60000;
const hour = 3600000;
const step = nightSpanRule.stepMinutes * minute;
const minimum = nightSpanRule.minimumMinutes * minute;

// The upper limits of light and moderate rain, in mm per hour (the usual
// meteorological classes); heavier is heavy rain. An hour with less than
// 0.1 mm is dry.
export const nightSpanRainLimits = Object.freeze({
  wetMillimetres: 0.1,
  lightMillimetres: 2.5,
  moderateMillimetres: 7.6,
});

// An instant as epoch milliseconds: a number, or an ISO-8601 string; `null`
// for anything else.
function instant(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const iso = (value) => new Date(value).toISOString();
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// `{ start, end }` in epoch milliseconds, `null` unless both are instants and
// the end comes after the start.
function interval(value) {
  const start = instant(value?.start);
  const end = instant(value?.end);
  return start !== null && end !== null && end > start ? { start, end } : null;
}

// The two edges of `span` brought onto the grid of `bounds`: the start up to
// a ten-minute mark, the end down to one, both inside the bounds.
function snappedEdges(span, bounds) {
  return {
    start: clamp(Math.ceil(span.start / step) * step, bounds.start, bounds.end),
    end: clamp(Math.floor(span.end / step) * step, bounds.start, bounds.end),
  };
}

/**
 * The custom span a plan takes when "Définir" is chosen: its dark night,
 * brought inwards onto ten-minute marks and inside `bounds` (`planNightSpanSky`
 * `bounds`, sunset to sunrise). `sky` is `{ darkStart, darkEnd, bounds }`.
 * `null` when there are no bounds or less than thirty minutes are left.
 */
export function customNightSpan(sky) {
  const bounds = interval(sky?.bounds);
  const dark = interval({ start: sky?.darkStart, end: sky?.darkEnd });
  if (!bounds || !dark) return null;
  const { start, end } = snappedEdges(dark, bounds);
  if (end - start < minimum) return null;
  return { mode: "custom", start: iso(start), end: iso(end) };
}

/**
 * One handle of the span moved to the instant `to` (epoch milliseconds or
 * ISO-8601): `edge` is `"start"` or `"end"`. `to` is rounded to the nearest
 * ten minutes, then kept inside `bounds` and thirty minutes at least from the
 * other edge, which is itself brought onto the grid first. Returns the new
 * `{ mode: "custom", start, end }`, or `null` when `span`, `bounds`, `edge`
 * or `to` cannot be read or the bounds hold less than thirty minutes.
 */
export function movedNightSpan({ span, edge, to, bounds } = {}) {
  const range = interval(bounds);
  const current = interval(span);
  const target = instant(to);
  if (!range || !current || target === null) return null;
  if (edge !== "start" && edge !== "end") return null;
  if (range.end - range.start < minimum) return null;
  let { start, end } = snappedEdges(current, range);
  const rounded = Math.round(target / step) * step;
  if (edge === "start") {
    end = Math.max(end, range.start + minimum);
    start = clamp(rounded, range.start, end - minimum);
  } else {
    start = Math.min(start, range.end - minimum);
    end = clamp(rounded, start + minimum, range.end);
  }
  return { mode: "custom", start: iso(start), end: iso(end) };
}

/**
 * The keyboard's move: one handle `steps` ten-minute steps later (negative:
 * earlier) than where it stands once brought onto the grid. Same result and
 * limits as `movedNightSpan`.
 */
export function steppedNightSpan({ span, edge, steps, bounds } = {}) {
  const range = interval(bounds);
  const current = interval(span);
  if (!range || !current || !Number.isInteger(steps)) return null;
  const edges = snappedEdges(current, range);
  const from = edge === "start" ? edges.start : edges.end;
  return movedNightSpan({ span, edge, to: from + steps * step, bounds });
}

/**
 * The periods the Moon is above the horizon between `start` and `end`
 * (instants), read off `moonSeries` (`[{ time, altitude }]`, the altitude in
 * degrees): straight lines between samples, each crossing rounded to the
 * minute. `[{ start, end }]` in ISO-8601, clipped to `start`–`end`; nothing
 * is assumed beyond the samples.
 */
export function nightSpanMoonIntervals(moonSeries, start, end) {
  const from = instant(start);
  const to = instant(end);
  if (from === null || to === null || !(to > from)) return [];
  const points = (Array.isArray(moonSeries) ? moonSeries : [])
    .map((point) => ({
      time: instant(point?.time),
      altitude: Number(point?.altitude),
    }))
    .filter((point) => point.time !== null && Number.isFinite(point.altitude))
    .sort((left, right) => left.time - right.time);
  if (!points.length) return [];
  const periods = [];
  let rise = points[0].altitude > 0 ? points[0].time : null;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    const wasUp = previous.altitude > 0;
    const isUp = point.altitude > 0;
    if (wasUp === isUp) continue;
    const ratio = previous.altitude / (previous.altitude - point.altitude);
    const crossing =
      Math.round(
        (previous.time + (point.time - previous.time) * ratio) / minute,
      ) * minute;
    if (isUp) rise = crossing;
    else {
      periods.push({ start: rise, end: crossing });
      rise = null;
    }
  }
  if (rise !== null) periods.push({ start: rise, end: points.at(-1).time });
  return periods
    .map((period) => ({
      start: Math.max(period.start, from),
      end: Math.min(period.end, to),
    }))
    .filter((period) => period.end > period.start)
    .map((period) => ({ start: iso(period.start), end: iso(period.end) }));
}

// How the Moon's periods read over a span: `all` (up throughout), `none`,
// `until` (up at the start, sets inside), `from` (rises inside, up at the
// end), `until-from` (sets, then rises again), `between` (anything else:
// from the first rise to the last set).
function moonKind(periods, start, end) {
  if (!periods.length) return "none";
  const first = periods[0];
  const last = periods.at(-1);
  const upAtStart = Date.parse(first.start) === start;
  const upAtEnd = Date.parse(last.end) === end;
  if (periods.length === 1) {
    if (upAtStart && upAtEnd) return "all";
    if (upAtStart) return "until";
    if (upAtEnd) return "from";
    return "between";
  }
  if (periods.length === 2 && upAtStart && upAtEnd) return "until-from";
  return "between";
}

function rainLevel(amount) {
  if (amount < nightSpanRainLimits.lightMillimetres) return "light";
  if (amount < nightSpanRainLimits.moderateMillimetres) return "moderate";
  return "heavy";
}

/**
 * What the forecast and the Moon say about a span of the night, for the line
 * "Forecast over this range: clouds 8 to 18 % · no rain · Moon up
 * until 21:05" and the timeline's description.
 *
 * `hourly` holds the rows of `hourlyAstronomyForecast` (`time` in epoch
 * milliseconds, `cloud` in %, `precipitationAmount` in mm when the forecast
 * carries it); an hour counts when it overlaps the span. `moonSeries` is
 * `planNightSpanSky`'s; `span` is `{ start, end }`.
 *
 * Returns `null` without a readable span, else `{ start, end, minutes,
 * forecast, moon }`:
 * - `forecast`: `null` when no hour of the forecast overlaps the span (a date
 *   beyond its range, nothing cached offline), else `{ cloudMin, cloudMax,
 *   rain }`, the cloud cover's extremes (`null` without values) and `rain`:
 *   `null` when the forecast has no rain amounts, else `{ level, from,
 *   fromStart }` — `level` `"none"`, `"light"` (under 2.5 mm/h),
 *   `"moderate"` (under 7.6) or `"heavy"`, from the wettest hour; `from` the
 *   first wet hour (0.1 mm or more), the span's start when it is already
 *   raining then (`fromStart`); `null` with `"none"`;
 * - `moon`: `{ kind, periods }`, `periods` from `nightSpanMoonIntervals` and
 *   `kind` one of `all`, `none`, `until`, `from`, `until-from`, `between`.
 */
export function nightSpanForecastSummary(hourly, moonSeries, span) {
  const range = interval(span);
  if (!range) return null;
  const { start, end } = range;
  const rows = (Array.isArray(hourly) ? hourly : []).filter((row) => {
    const time = instant(row?.time);
    return time !== null && time < end && time + hour > start;
  });
  let forecast = null;
  if (rows.length) {
    const clouds = rows
      .map((row) => row.cloud)
      .filter((value) => typeof value === "number" && Number.isFinite(value));
    let rain = null;
    if (rows.some((row) => "precipitationAmount" in row)) {
      const wet = rows.filter(
        (row) =>
          typeof row.precipitationAmount === "number" &&
          row.precipitationAmount >= nightSpanRainLimits.wetMillimetres,
      );
      if (!wet.length) rain = { level: "none", from: null, fromStart: false };
      else {
        const first = instant(wet[0].time);
        const fromStart = first <= start;
        rain = {
          level: rainLevel(
            Math.max(...wet.map((row) => row.precipitationAmount)),
          ),
          from: iso(fromStart ? start : first),
          fromStart,
        };
      }
    }
    forecast = {
      cloudMin: clouds.length ? Math.min(...clouds) : null,
      cloudMax: clouds.length ? Math.max(...clouds) : null,
      rain,
    };
  }
  const periods = nightSpanMoonIntervals(moonSeries, start, end);
  return {
    start: iso(start),
    end: iso(end),
    minutes: Math.round((end - start) / minute),
    forecast,
    moon: { kind: moonKind(periods, start, end), periods },
  };
}

/**
 * A recommendation card seen through the span of the night, for the
 * placement cascade (`plannedItemPlacement`): its quality windows
 * (`visibilityWindows`) cut to the span, and its usable period
 * (`usableStart`/`usableEnd`, the cascade's last resort) kept inside it — the
 * whole span when the target is not usable during it. A missing key stays
 * missing. The card itself when `span` cannot be read.
 */
export function cardWithinNightSpan(card, span) {
  const range = interval(span);
  if (!card || typeof card !== "object" || !range) return card;
  const next = { ...card };
  if (Array.isArray(card.visibilityWindows))
    next.visibilityWindows = card.visibilityWindows.flatMap((window) => {
      const period = interval(window);
      if (!period) return [];
      const start = Math.max(period.start, range.start);
      const end = Math.min(period.end, range.end);
      return end > start
        ? [{ ...window, start: iso(start), end: iso(end) }]
        : [];
    });
  const usableStart = instant(card.usableStart);
  const usableEnd = instant(card.usableEnd);
  if (usableStart !== null && usableEnd !== null) {
    const from = Math.max(usableStart, range.start);
    const to = Math.min(usableEnd, range.end);
    next.usableStart = iso(to > from ? from : range.start);
    next.usableEnd = iso(to > from ? to : range.end);
  }
  return next;
}

/**
 * The span a plan's night uses, for the placement and the review reason:
 * `{ start, end }` of `window` (`planNightWindow`) when it is a custom span,
 * else `null` (the whole night: nothing to restrict).
 */
export function customSpanOfWindow(window) {
  return window?.span === "custom"
    ? { start: window.start, end: window.end }
    : null;
}

/**
 * A plan with a new span of the night: `nightSpan` is `{ mode:
 * "astronomical" }` or a custom span. Only the property changes: the
 * intervals keep their minutes (they count from the dark night, which the
 * span never moves), and none is removed — one that falls outside the span
 * is flagged instead (`scheduleItemNightSpanReason`).
 */
export function planWithNightSpan(plan, nightSpan) {
  return {
    ...plan,
    nightSpan:
      nightSpan?.mode === "custom"
        ? { mode: "custom", start: nightSpan.start, end: nightSpan.end }
        : { mode: "astronomical" },
  };
}

/**
 * The night a plan chose, as the frises read it. The span is
 * a property of **the plan**; each plan of a night carries its own.
 *
 * How a slot (`start`, `end`: epoch milliseconds or ISO-8601) sits against
 * `span` (`{ start, end }` the same): `{ fit, insideShare, greyed }` — `fit` is
 * `inside`, `straddling` (on a line) or `outside`; `greyed` when the slot is
 * entirely outside or less than half of it is inside (a slot mostly outside the
 * night is shown as an afterthought).
 */
export function readSlotAgainstSpan({ start, end, span } = {}) {
  const from = instant(start);
  const to = instant(end);
  const range = interval(span);
  if (from === null || to === null || !range || !(to > from))
    return { fit: "inside", insideShare: 1, greyed: false };
  const inside = Math.max(
    0,
    Math.min(to, range.end) - Math.max(from, range.start),
  );
  if (inside <= 0) return { fit: "outside", insideShare: 0, greyed: true };
  if (from >= range.start && to <= range.end)
    return { fit: "inside", insideShare: 1, greyed: false };
  const share = clamp(inside / (to - from), 0, 1);
  return { fit: "straddling", insideShare: share, greyed: share < 0.5 };
}

/** How many of `slots` (`{ start, end }` each) are greyed against `span`. */
export function slotsBeyondSpan(slots, span) {
  return slots.filter(
    ({ start, end }) => readSlotAgainstSpan({ start, end, span }).greyed,
  ).length;
}

/**
 * `frise` (the result of `planFrise`) with the chosen night laid on it:
 * `span: { start, end, x0, x1, beyond }` — the two lines as fractions of the
 * scale and how many targets lie beyond (all their blocks greyed; never more
 * than the targets the card counts as planned) — and, on each block, `fit`
 * and `greyed`. `frise` itself when there is no span.
 */
export function friseWithSpan(frise, span) {
  const range = interval(span);
  const night = frise?.night;
  const nightStart = instant(night?.start);
  const nightEnd = instant(night?.end);
  if (
    !range ||
    nightStart === null ||
    nightEnd === null ||
    !(nightEnd > nightStart) ||
    !Number.isFinite(night.x0) ||
    !Number.isFinite(night.x1)
  )
    return frise;
  const x = (value) =>
    night.x0 +
    ((value - nightStart) / (nightEnd - nightStart)) * (night.x1 - night.x0);
  // "N cibles au-delà" counts targets, as "N cibles planifiées" does: a
  // target is the label of its blocks (a block with no label is a target of
  // its own), and it lies beyond when every one of its blocks is greyed.
  const targets = new Map();
  const blocks = (frise.blocks ?? []).map((block, index) => {
    const reading = readSlotAgainstSpan({
      start: block.start,
      end: block.end,
      span: range,
    });
    const identity = block.label ? `label:${block.label}` : `block:${index}`;
    targets.set(identity, (targets.get(identity) ?? true) && reading.greyed);
    return { ...block, fit: reading.fit, greyed: reading.greyed };
  });
  const beyond = [...targets.values()].filter(Boolean).length;
  return {
    ...frise,
    blocks,
    span: {
      start: iso(range.start),
      end: iso(range.end),
      x0: x(range.start),
      x1: x(range.end),
      beyond,
    },
  };
}

// A chosen slot follows the place's local hours. The least
// a transposed slot may keep of the new night, below which it goes back to
// the whole astronomical night (and says so).
const transposedMinimum = hour;

function localNoon(date, place) {
  const longitude = Number(String(place?.longitude ?? "").trim());
  return zonedDateOrLongitudeAnchor(
    date,
    12,
    place?.timeZone,
    Number.isFinite(longitude) ? longitude : 0,
  )?.getTime();
}

/**
 * The slot of a night when its place changes zone: `{ span, fellBack }`.
 * `span` is the plan's `nightSpan` (`{ mode: "custom", start, end }`, anything
 * else is returned untouched); `date` the night's civil date; `from` and `to`
 * the old and new places (`timeZone`, `longitude`, read like the night's own
 * anchor: zone, else the longitude); `night` the new place's dark night
 * `{ start, end }`.
 *
 * The slot is transposed by wall-clock time (19:00–23:00 stays 19:00–23:00
 * at the new place: the instants move by the gap of the two local noons),
 * then intersected with `night`, brought inwards onto ten-minute marks. With
 * no gap the slot is left as it is; with less than one hour left it goes
 * back to `{ mode: "astronomical" }` and `fellBack` is true — the caller says
 * so, never silently.
 */
export function transposeNightSpan({ span, date, from, to, night } = {}) {
  const current = span?.mode === "custom" ? interval(span) : null;
  if (!current) return { span: span ?? null, fellBack: false };
  const fromNoon = localNoon(date, from);
  const toNoon = localNoon(date, to);
  if (
    fromNoon === undefined ||
    toNoon === undefined ||
    !Number.isFinite(fromNoon) ||
    !Number.isFinite(toNoon) ||
    fromNoon === toNoon
  )
    return { span, fellBack: false };
  const dark = interval(night);
  if (!dark) return { span, fellBack: false };
  const gap = toNoon - fromNoon;
  const start =
    Math.ceil(Math.max(current.start + gap, dark.start) / step) * step;
  const end = Math.floor(Math.min(current.end + gap, dark.end) / step) * step;
  if (end - start < transposedMinimum)
    return { span: { mode: "astronomical" }, fellBack: true };
  return {
    span: { mode: "custom", start: iso(start), end: iso(end) },
    fellBack: false,
  };
}
