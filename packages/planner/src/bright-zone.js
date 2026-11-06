// A target crossing a bright zone of the sky: the light layer of the horizon
// map (`horizon-light-layer.js`) read along the target's own path through the
// night, so that the score of a target (`target-score.js`, criterion "Qualité
// du ciel") pays for the glow of a town the target moves through, not only
// for the sky at the zenith.
//
// It reads the layer through the layer's own functions — `horizonLightSqmAt`
// for the brightness of a direction, the same two thresholds (21.6 and 18.0
// mag/arcsec²) for "tinted" and "strongest" — so the score and the
// drawing never disagree. Pure and JSON in, JSON out.
//
// - Sampling: the samples of `path` (the ten-minute series of the card,
//   `{ time, altitude, azimuth }`) inside `window`; each sample counts once,
//   so the series being regular, the share is a share of time. A sample
//   whose direction the grid cannot read (a missing cell) is ignored, in the
//   numerator and the denominator.
// - Weight of a sample: 0 at 21.6 mag/arcsec² and darker (the layer is not
//   tinted there), growing linearly with the brightness to 1 at 18.0 and
//   brighter — the `t` the layer's colour ramp is read with.
// - `share`: the mean weight of the samples read, to the thousandth.
// - `deduction`: `round(points × mean weight)`, in points, `points` being the
//   points the criterion gives for the zenith sky: never more than that, so
//   the criterion never goes below 0 and the total never leaves 100.

import {
  horizonLightBrightSqm,
  horizonLightDarkSqm,
  horizonLightSqmAt,
} from "./horizon-light-layer.js";

/** The scale of the "Qualité du ciel" criterion, the cap of the deduction. */
export const brightZoneScale = 10;

const compassPoints = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function instant(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// Half up.
const round = (value) => Math.floor(value + 0.5);

/**
 * How much a sky brightness weighs, 0 to 1: nothing at 21.6 mag/arcsec² and
 * darker (or an unusable value), everything at 18.0 and brighter, linear in
 * between — the position on the layer's ramp.
 */
export function brightZoneWeight(sqm) {
  const value = finite(sqm);
  if (value === null || value >= horizonLightDarkSqm) return 0;
  return Math.min(
    1,
    (horizonLightDarkSqm - value) /
      (horizonLightDarkSqm - horizonLightBrightSqm),
  );
}

// The ranges of `window` (`{ start, end }`, or a list of them; ISO-8601 or
// epoch milliseconds) as `[from, to]` milliseconds.
function rangesOf(window) {
  return (Array.isArray(window) ? window : [window])
    .map((range) => [instant(range?.start), instant(range?.end)])
    .filter(([from, to]) => from !== null && to !== null && to >= from);
}

/**
 * The bright zone a target crosses.
 *
 * - `path`: `[{ time, altitude, azimuth }]`, the target's series;
 * - `grid`: the brightness by direction (`skyBrightnessByDirection`);
 * - `window`: where the target is observed, `{ start, end }` or a list of
 *   them (the best window of `targetNightPath`, else the stretches clear of
 *   the mask above the minimum altitude);
 * - `points`: the points the criterion gives for the zenith sky, the cap of
 *   the deduction (default: the scale of the criterion, 10).
 *
 * Returns `{ available, worstSqm, share, from, to, azimuth, compass,
 * deduction }`. `available` is false without a usable grid or when no sample
 * of the window can be read: nothing is deducted. `worstSqm` (tenths of
 * mag/arcsec²), `from` / `to` (ISO-8601, the first and last tinted samples),
 * `azimuth` (whole degrees) and `compass` (`N` … `NW`) describe the
 * brightest sample and are null when no sample is tinted.
 */
export function brightZoneCrossing({
  path,
  grid,
  window,
  points = brightZoneScale,
} = {}) {
  const ranges = rangesOf(window);
  const cap = finite(points) === null ? brightZoneScale : Math.max(0, points);
  let read = 0;
  let weights = 0;
  let from = null;
  let to = null;
  let worst = null;
  for (const sample of Array.isArray(path) ? path : []) {
    const time = instant(sample?.time);
    const altitude = finite(sample?.altitude);
    const azimuth = finite(sample?.azimuth);
    if (time === null || altitude === null || azimuth === null) continue;
    if (!ranges.some(([start, end]) => time >= start && time <= end)) continue;
    const sqm = horizonLightSqmAt(grid, azimuth, altitude);
    if (sqm === null) continue;
    read += 1;
    const weight = brightZoneWeight(sqm);
    weights += weight;
    if (!(sqm < horizonLightDarkSqm)) continue;
    if (from === null) from = time;
    to = time;
    if (worst === null || sqm < worst.sqm) worst = { sqm, azimuth };
  }
  if (!read)
    return {
      available: false,
      worstSqm: null,
      share: 0,
      from: null,
      to: null,
      azimuth: null,
      compass: null,
      deduction: 0,
    };
  const wrapped = worst ? ((worst.azimuth % 360) + 360) % 360 : null;
  return {
    available: true,
    worstSqm: worst ? round(worst.sqm * 10) / 10 : null,
    share: round((weights / read) * 1000) / 1000,
    from: from === null ? null : new Date(from).toISOString(),
    to: to === null ? null : new Date(to).toISOString(),
    azimuth: wrapped === null ? null : round(wrapped) % 360,
    compass: wrapped === null ? null : compassPoints[round(wrapped / 45) % 8],
    deduction: Math.min(cap, round((cap * weights) / read)),
  };
}
