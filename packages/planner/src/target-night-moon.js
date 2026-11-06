// The Moon over a target's night: the track it draws on the polar map of
// "Déplacement de la cible" (above the horizon only) and the two figures the
// line "Écart avec la Lune" writes — the smallest and the largest separation
// between the target and the Moon over the night shown.
//
// Pure and JSON in, JSON out. `series` is the target's ten-minute samples (`{
// time, altitude, azimuth, moonSeparation }`, the very ones the curve and the
// path are drawn from), `track` the Moon's samples at the same instants (`{
// time, altitude, azimuth }`, `moonHorizontalTrack`, `planner.js`).
//
// - `separation`: `{ min, max }` in whole degrees, taken over the samples
//   where the Moon and the target are both above the horizon (a Moon that is
//   down troubles nothing); `null` when there is none — the Moon down all
//   night, or never up with the target.
// - `runs`: the Moon's track above the horizon, in time order, one run per
//   rising (its ends interpolated at the horizon), each `[{ time, altitude,
//   azimuth }]`; empty when the Moon stays down.

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function wrapAzimuth(value) {
  return ((value % 360) + 360) % 360;
}

function crossing(before, after) {
  const ratio = -before.altitude / (after.altitude - before.altitude);
  const from = Date.parse(before.time);
  const to = Date.parse(after.time);
  const delta = ((after.azimuth - before.azimuth + 540) % 360) - 180;
  return {
    time: new Date(Math.trunc(from + (to - from) * ratio)).toISOString(),
    altitude: 0,
    azimuth: wrapAzimuth(before.azimuth + delta * ratio),
  };
}

function moonRuns(track) {
  const points = (Array.isArray(track) ? track : [])
    .map((point) => ({
      time: point?.time,
      altitude: point?.altitude,
      azimuth: wrapAzimuth(point?.azimuth),
    }))
    .filter(
      (point) =>
        typeof point.time === "string" &&
        finite(point.altitude) &&
        finite(point.azimuth),
    );
  const runs = [];
  let run = null;
  points.forEach((point, index) => {
    const up = point.altitude >= 0;
    const before = points[index - 1];
    if (up) {
      if (!run) {
        run = [];
        runs.push(run);
        if (before) run.push(crossing(before, point));
      }
      run.push(point);
    } else if (run) {
      if (before) run.push(crossing(before, point));
      run = null;
    }
  });
  return runs.filter((candidate) => candidate.length > 1);
}

export function targetNightMoon({ series = [], track = [] } = {}) {
  const moonAt = new Map(
    (Array.isArray(track) ? track : []).map((point) => [
      point?.time,
      point?.altitude,
    ]),
  );
  let min = null;
  let max = null;
  for (const sample of Array.isArray(series) ? series : []) {
    const moonAltitude = moonAt.get(sample?.time);
    if (
      !finite(moonAltitude) ||
      moonAltitude <= 0 ||
      !finite(sample?.altitude) ||
      sample.altitude <= 0 ||
      !finite(sample?.moonSeparation)
    )
      continue;
    if (min === null || sample.moonSeparation < min)
      min = sample.moonSeparation;
    if (max === null || sample.moonSeparation > max)
      max = sample.moonSeparation;
  }
  return {
    separation:
      min === null
        ? null
        : { min: Math.floor(min + 0.5), max: Math.floor(max + 0.5) },
    runs: moonRuns(track),
  };
}
