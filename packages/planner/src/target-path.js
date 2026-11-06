import {
  horizonAltitude,
  normaliseHorizonMask,
} from "portal/planner/horizon-mask.js";
import {
  normaliseMountSafety,
  plannerPointConstraint,
  visibilityWindows,
} from "./constraints.js";

// A target's night, intersected with the place's horizon mask: the one
// computation behind the three presentations (the
// per-target movement summary, the horizon map's path mode, the view of the
// horizon in augmented reality). It reads the ten-minute series the planner
// already computes for every card (`{ time, altitude, azimuth,
// moonSeparation }`) and never computes an ephemeris itself.
//
// Pure and JSON in, JSON out.
//
// - `segments`: the night cut into runs of one state — `visible`, `masked`
//   (above 0° but under the mask), `below-minimum` (clear of the mask, under
//   the plan's minimum altitude) or `below-horizon` — each boundary placed
//   at the interpolated crossing instant (linear on the margin between two
//   samples, the technique of `visibilityWindows`), with the points to draw
//   it (the samples inside, plus the interpolated boundaries).
// - `clearsMaskAt` / `backBehindMaskAt`: the instants the target clears the
//   mask and goes back behind it, in order (a notch gives several); empty
//   when the place has no mask.
// - `culmination`: the highest point, refined by a parabola through the
//   highest sample and its two neighbours.
// - `bestWindow`: the visibility window of the card (as `withHorizonMask`
//   computes it) that holds the culmination, else the longest, else null.
// - `hourTicks`: the target at each full hour of the night (shifted by
//   `tickOffsetMinutes`, the place's offset, so a half-hour zone gets its
//   own full hours).
// - `moonSeparationAtCulmination`: whole degrees, from `moonSeries`
//   (`[{ time, moonSeparation }]`) when given, else from the series' own
//   `moonSeparation`; null when neither carries one.
// - `noWindowReason`: when there is no window, why — the most favourable
//   state the target reaches (`below-horizon`, `masked`, `below-minimum`),
//   or the constraint that closes an otherwise clear sky (`moon`, `zenith`,
//   `cables`).

const hourMs = 3600000;

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// A number as the series carries it: a JSON number, nothing coerced.
function numberOrNaN(value) {
  return finite(value) ? value : Number.NaN;
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function wrapAzimuth(value) {
  return ((value % 360) + 360) % 360;
}

// Linear interpolation of an azimuth the short way round (359° → 1° goes
// through 0°, never back through 180°).
function interpolateAzimuth(from, to, ratio) {
  const delta = ((to - from + 540) % 360) - 180;
  return wrapAzimuth(from + delta * ratio);
}

// `new Date(x)` truncates a fractional millisecond toward zero; the same is
// done here so the instant is a whole millisecond.
function instantAt(fromMs, toMs, ratio) {
  return Math.trunc(fromMs + (toMs - fromMs) * ratio);
}

function stateOf(margins) {
  if (margins.horizon < 0) return "below-horizon";
  if (margins.mask < 0) return "masked";
  if (margins.minimum < 0) return "below-minimum";
  return "visible";
}

function marginsAt(point, ratio, next) {
  const mix = (key) =>
    next ? point[key] + (next[key] - point[key]) * ratio : point[key];
  return {
    horizon: mix("horizonMargin"),
    mask: mix("maskMargin"),
    minimum: mix("minimumMargin"),
  };
}

function pathPoint(timeMs, altitude, azimuth) {
  return { time: iso(timeMs), altitude, azimuth };
}

function interpolatedPoint(previous, next, ratio) {
  return pathPoint(
    instantAt(previous.timeMs, next.timeMs, ratio),
    previous.altitude + (next.altitude - previous.altitude) * ratio,
    interpolateAzimuth(previous.azimuth, next.azimuth, ratio),
  );
}

function crossingRatio(before, after) {
  return -before / (after - before);
}

function readPoints(series, profile, minAltitude) {
  const points = [];
  for (const raw of Array.isArray(series) ? series : []) {
    const altitude = numberOrNaN(raw?.altitude);
    const azimuth = numberOrNaN(raw?.azimuth);
    const timeMs =
      typeof raw?.time === "string" ? Date.parse(raw.time) : Number.NaN;
    if (!finite(altitude) || !finite(azimuth) || !finite(timeMs)) continue;
    const moonSeparation = numberOrNaN(raw?.moonSeparation);
    const profileAltitude = profile(azimuth);
    points.push({
      time: raw.time,
      timeMs,
      altitude,
      azimuth: wrapAzimuth(azimuth),
      moonSeparation: finite(moonSeparation) ? moonSeparation : null,
      profileAltitude,
      horizonMargin: altitude,
      maskMargin: altitude - profileAltitude,
      minimumMargin: altitude - minAltitude,
    });
  }
  return points;
}

function buildSegments(points) {
  const segments = [];
  const open = (state, point) => {
    const last = segments.at(-1);
    if (last && last.state === state) return;
    if (last) {
      last.end = point.time;
      last.points.push(point);
      // A state held for no time at all (a sample exactly on a boundary)
      // is no segment: drop it and let its neighbours meet.
      if (last.points.length > 1 && last.start === last.end) {
        segments.pop();
        const previous = segments.at(-1);
        if (previous && previous.state === state) return;
      }
    }
    segments.push({
      state,
      start: point.time,
      end: point.time,
      points: [point],
    });
  };
  points.forEach((point, index) => {
    const here = pathPoint(point.timeMs, point.altitude, point.azimuth);
    if (index === 0) {
      open(stateOf(marginsAt(point, 0)), here);
      return;
    }
    const previous = points[index - 1];
    const ratios = new Set([0, 1]);
    for (const key of ["horizonMargin", "maskMargin", "minimumMargin"]) {
      const before = previous[key];
      const after = point[key];
      if (before < 0 !== after < 0)
        ratios.add(Math.min(1, Math.max(0, crossingRatio(before, after))));
    }
    const breaks = [...ratios].sort((left, right) => left - right);
    for (let step = 0; step < breaks.length - 1; step += 1) {
      const from = breaks[step];
      const to = breaks[step + 1];
      if (to <= from) continue;
      const state = stateOf(marginsAt(previous, (from + to) / 2, point));
      if (state !== segments.at(-1).state)
        open(state, interpolatedPoint(previous, point, from));
    }
    const current = segments.at(-1);
    current.points.push(here);
    current.end = here.time;
  });
  return segments;
}

function maskCrossings(points, maskEnabled) {
  const clearsMaskAt = [];
  const backBehindMaskAt = [];
  if (!maskEnabled) return { clearsMaskAt, backBehindMaskAt };
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    const before = previous.maskMargin;
    const after = next.maskMargin;
    if (before < 0 === after < 0) continue;
    const ratio = Math.min(1, Math.max(0, crossingRatio(before, after)));
    const at = iso(instantAt(previous.timeMs, next.timeMs, ratio));
    (before < 0 ? clearsMaskAt : backBehindMaskAt).push(at);
  }
  return { clearsMaskAt, backBehindMaskAt };
}

function culminationOf(points, profile, maskEnabled) {
  if (!points.length) return null;
  let index = 0;
  points.forEach((point, candidate) => {
    if (point.altitude > points[index].altitude) index = candidate;
  });
  const top = points[index];
  let timeMs = top.timeMs;
  let altitude = top.altitude;
  let azimuth = top.azimuth;
  const before = points[index - 1];
  const after = points[index + 1];
  if (before && after) {
    const curvature = before.altitude - 2 * top.altitude + after.altitude;
    if (curvature < 0) {
      const offset = Math.min(
        0.5,
        Math.max(-0.5, (0.5 * (before.altitude - after.altitude)) / curvature),
      );
      altitude =
        top.altitude - 0.25 * (before.altitude - after.altitude) * offset;
      const neighbour = offset < 0 ? before : after;
      const ratio = Math.abs(offset);
      timeMs = instantAt(top.timeMs, neighbour.timeMs, ratio);
      azimuth = interpolateAzimuth(top.azimuth, neighbour.azimuth, ratio);
    }
  }
  return {
    time: iso(timeMs),
    altitude,
    azimuth,
    masked: maskEnabled && altitude < profile(azimuth),
  };
}

function windowsOf(
  points,
  { maskEnabled, minAltitude, moonSeparationMinimum, mountSafety },
) {
  const constrained = points.map((point) => ({
    time: iso(point.timeMs),
    altitude: point.altitude,
    azimuth: point.azimuth,
    moonSeparation: point.moonSeparation ?? Number.NaN,
    ...plannerPointConstraint({
      point: {
        altitude: point.altitude,
        azimuth: point.azimuth,
        moonSeparation: point.moonSeparation ?? Number.NaN,
      },
      profileAltitude: point.profileAltitude,
      horizonEnabled: maskEnabled,
      minAltitude,
      moonSeparationMinimum,
      mountSafety,
    }),
  }));
  return {
    constrained,
    windows: visibilityWindows(constrained, {
      minAltitude,
      moonSeparationMinimum,
      mountSafety,
    }),
  };
}

function spanOf(window) {
  return Date.parse(window.end) - Date.parse(window.start);
}

function bestWindowOf(windows, culmination) {
  if (!windows.length) return null;
  if (culmination) {
    const at = Date.parse(culmination.time);
    const holding = windows.find(
      (window) =>
        Date.parse(window.start) <= at && at <= Date.parse(window.end),
    );
    if (holding) return holding;
  }
  return windows.reduce(
    (longest, candidate) =>
      spanOf(candidate) > spanOf(longest) ? candidate : longest,
    windows[0],
  );
}

function hourTicksOf(points, offsetMinutes) {
  if (points.length < 2) return [];
  const offsetMs = offsetMinutes * 60000;
  const first = points[0].timeMs;
  const last = points.at(-1).timeMs;
  const ticks = [];
  let index = 0;
  for (
    let tick = Math.ceil((first + offsetMs) / hourMs) * hourMs - offsetMs;
    tick <= last;
    tick += hourMs
  ) {
    while (index < points.length - 2 && points[index + 1].timeMs < tick)
      index += 1;
    const previous = points[index];
    const next = points[index + 1];
    const span = next.timeMs - previous.timeMs;
    const ratio = span > 0 ? (tick - previous.timeMs) / span : 0;
    ticks.push(
      pathPoint(
        tick,
        previous.altitude + (next.altitude - previous.altitude) * ratio,
        interpolateAzimuth(previous.azimuth, next.azimuth, ratio),
      ),
    );
  }
  return ticks;
}

function separationAt(source, timeMs) {
  const samples = (Array.isArray(source) ? source : [])
    .map((sample) => ({
      timeMs:
        typeof sample?.time === "string" ? Date.parse(sample.time) : Number.NaN,
      value: numberOrNaN(sample?.moonSeparation),
    }))
    .filter((sample) => finite(sample.timeMs) && finite(sample.value));
  if (!samples.length) return null;
  if (timeMs <= samples[0].timeMs) return samples[0].value;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const next = samples[index];
    if (timeMs > next.timeMs) continue;
    const span = next.timeMs - previous.timeMs;
    const ratio = span > 0 ? (timeMs - previous.timeMs) / span : 0;
    return previous.value + (next.value - previous.value) * ratio;
  }
  return samples.at(-1).value;
}

function noWindowReasonOf(points, constrained, bestWindow) {
  if (bestWindow || !points.length) return null;
  const states = points.map((point) => stateOf(marginsAt(point, 0)));
  const clear = constrained.find(
    (point, index) => states[index] === "visible" && point.constraint,
  );
  if (clear) return clear.constraint;
  for (const state of ["below-minimum", "masked"])
    if (states.includes(state)) return state;
  return "below-horizon";
}

export function targetNightPath({
  series = [],
  mask = null,
  minAltitude = 0,
  moonSeries = null,
  moonSeparationMinimum = 0,
  mountSafety = null,
  tickOffsetMinutes = 0,
} = {}) {
  const normalizedMask = normaliseHorizonMask(mask);
  const maskEnabled = normalizedMask.enabled;
  const profile = (azimuth) =>
    maskEnabled ? horizonAltitude(normalizedMask, azimuth) : 0;
  const minimum = finite(Number(minAltitude)) ? Number(minAltitude) : 0;
  const moonMinimum = finite(Number(moonSeparationMinimum))
    ? Number(moonSeparationMinimum)
    : 0;
  const offset = finite(Number(tickOffsetMinutes))
    ? Number(tickOffsetMinutes)
    : 0;
  const points = readPoints(series, profile, minimum);
  const culmination = culminationOf(points, profile, maskEnabled);
  const { constrained, windows } = windowsOf(points, {
    maskEnabled,
    minAltitude: minimum,
    moonSeparationMinimum: moonMinimum,
    mountSafety: normaliseMountSafety(mountSafety ?? {}),
  });
  const bestWindow = bestWindowOf(windows, culmination);
  const separation = culmination
    ? separationAt(
        Array.isArray(moonSeries) && moonSeries.length ? moonSeries : points,
        Date.parse(culmination.time),
      )
    : null;
  return {
    start: points.length ? iso(points[0].timeMs) : null,
    end: points.length ? iso(points.at(-1).timeMs) : null,
    maskEnabled,
    segments: buildSegments(points),
    ...maskCrossings(points, maskEnabled),
    culmination,
    bestWindow,
    hourTicks: hourTicksOf(points, offset),
    moonSeparationAtCulmination:
      separation === null ? null : Math.floor(separation + 0.5),
    noWindowReason: noWindowReasonOf(points, constrained, bestWindow),
  };
}

// The hours the target's path writes. Three are always there — the horizon
// (where the visible path starts: the first stretch that is not behind the
// mask, so a mask exit or a rise), the culmination and the end ("Fin") —
// and between two of them one more full hour when the stretch lasts at
// least `intermediateStretchMs`: the full hour nearest to the middle of
// the stretch (taken from `hourTicks`, so on the place's own clock). Pure,
// from the path.
export const intermediateStretchMs = 3 * hourMs;

function nearestHourTick(ticks, middleMs, fromMs, toMs) {
  let best = null;
  for (const tick of ticks) {
    const at = Date.parse(tick.time);
    if (!(tick.altitude >= 0) || at <= fromMs || at >= toMs) continue;
    if (
      !best ||
      Math.abs(at - middleMs) < Math.abs(Date.parse(best.time) - middleMs)
    )
      best = tick;
  }
  return best;
}

export function targetPathKeyHours(path) {
  const segments = Array.isArray(path?.segments) ? path.segments : [];
  const visible = segments.find(
    (segment) =>
      segment.state === "visible" || segment.state === "below-minimum",
  );
  const horizon = visible?.points?.[0] ?? null;
  const above = segments.filter((segment) => segment.state !== "below-horizon");
  const last = above.at(-1)?.points?.at(-1) ?? null;
  const top = path?.culmination?.altitude >= 0 ? path.culmination : null;
  const hours = [];
  if (horizon && top && last) {
    const from = Date.parse(horizon.time);
    const peak = Date.parse(top.time);
    const to = Date.parse(last.time);
    const ticks = Array.isArray(path.hourTicks) ? path.hourTicks : [];
    for (const [start, end] of [
      [from, peak],
      [peak, to],
    ]) {
      if (end - start < intermediateStretchMs) continue;
      const tick = nearestHourTick(ticks, (start + end) / 2, start, end);
      if (tick) hours.push(tick);
    }
  }
  return { horizon, hours };
}
