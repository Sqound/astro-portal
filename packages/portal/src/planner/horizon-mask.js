import { cardinalDirection } from "./cardinal-directions.js";
// The observing place's horizon profile: thirty-six sampled azimuths, one
// every 10°, shared by the horizon editor, the sky map and every visibility
// calculation.
//
// A mask written on a coarser grid (the twelve points at 30° every place had
// before the finer grid, or any other grid between 10° and 30°) is read by
// linear interpolation onto the 10° grid: the curve it describes is the same,
// so every altitude computed from it is the same. Nothing rewrites a stored
// mask; the next write simply stores the thirty-six points.
//
// Each point of the 10° grid may carry
// `surveyedAt`, the instant its 10° sector was last surveyed (recorded in
// augmented reality on the phone, or moved by hand in an editor), an ISO 8601
// timestamp. A sector without it is « à relever ». Only a mask already on the
// 10° grid keeps its dates: a coarser or scattered mask is resampled, and a
// resampled sector was never surveyed. The phone application reads and
// writes the same.

export const horizonMaskStep = 10;
export const horizonMaskPointCount = 360 / horizonMaskStep;

// The grids a stored mask may lie on, coarsest first: every divisor of 360
// from the former 30° grid down to the 10° grid. A mask whose points all lie
// on one of them is that grid (an absent node is a flat horizon there, as it
// always was); any other point is moved to the nearest 10° direction.
const sourceGridSteps = [30, 24, 20, 18, 15, 12, 10];

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const wrapAzimuth = (azimuth) => ((azimuth % 360) + 360) % 360;

const onGrid = (azimuth, step) =>
  Math.abs(azimuth / step - Math.round(azimuth / step)) < 1e-9;

// The survey instant a point carries, as stored, when it is one.
const surveyedAtOf = (point) =>
  typeof point?.surveyedAt === "string" &&
  !Number.isNaN(Date.parse(point.surveyedAt))
    ? point.surveyedAt
    : undefined;

export function defaultHorizonMask() {
  return {
    enabled: false,
    points: Array.from({ length: horizonMaskPointCount }, (_, index) => ({
      azimuth: index * horizonMaskStep,
      altitude: 0,
    })),
  };
}

// The altitude of the 10° node `azimuth` on a source grid of `step` degrees
// whose node altitudes are `nodes`. Same arithmetic as `horizonAltitude`, so
// a node of the fine grid is, to the bit, the altitude the coarse mask gave
// at that azimuth.
function resampledAltitude(nodes, step, azimuth) {
  const previousIndex = Math.floor(azimuth / step + 1e-9) % nodes.length;
  const nextIndex = (previousIndex + 1) % nodes.length;
  const previousAzimuth = previousIndex * step;
  const nextAzimuth = previousAzimuth + step;
  const ratio = (azimuth - previousAzimuth) / (nextAzimuth - previousAzimuth);
  const previous = nodes[previousIndex];
  return previous + (nodes[nextIndex] - previous) * ratio;
}

// The points as stored when they already are the 10° grid, in order and in
// range: what `normaliseHorizonMask` would return for them, without the work.
function canonicalPoints(value) {
  const points = Array.isArray(value?.points) ? value.points : null;
  if (!points || points.length !== horizonMaskPointCount) return null;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (
      typeof point?.azimuth !== "number" ||
      typeof point?.altitude !== "number" ||
      point.azimuth !== index * horizonMaskStep ||
      !(point.altitude >= 0 && point.altitude <= 90)
    )
      return null;
  }
  return points;
}

export function normaliseHorizonMask(value) {
  const fallback = defaultHorizonMask();
  if (!value || typeof value !== "object") return fallback;
  const points = (Array.isArray(value.points) ? value.points : [])
    .map((point) => ({
      azimuth: Number(point?.azimuth),
      altitude: Number(point?.altitude),
      surveyedAt: surveyedAtOf(point),
    }))
    .filter(
      (point) =>
        Number.isFinite(point.azimuth) && Number.isFinite(point.altitude),
    )
    .map((point) => ({
      azimuth: wrapAzimuth(point.azimuth),
      altitude: clamp(point.altitude, 0, 90),
      surveyedAt: point.surveyedAt,
    }));
  const step = sourceGridSteps.find((candidate) =>
    points.every((point) => onGrid(point.azimuth, candidate)),
  );
  let altitudes;
  // The survey dates, on the 10° grid only.
  const surveyed = fallback.points.map(() => undefined);
  if (step) {
    // On a grid: its nodes, later points winning, then read at every 10°.
    const nodes = Array.from({ length: 360 / step }, () => 0);
    for (const point of points) {
      const index = Math.round(point.azimuth / step) % nodes.length;
      nodes[index] = point.altitude;
      if (step === horizonMaskStep) surveyed[index] = point.surveyedAt;
    }
    altitudes = fallback.points.map((point) =>
      resampledAltitude(nodes, step, point.azimuth),
    );
  } else {
    // Off every grid: each point goes to the nearest 10° direction; the
    // closest point wins a direction, the later one on a tie.
    altitudes = fallback.points.map((point) => point.altitude);
    const distances = altitudes.map(() => Infinity);
    for (const point of points) {
      const scaled = point.azimuth / horizonMaskStep;
      const index = Math.round(scaled) % horizonMaskPointCount;
      const distance = Math.abs(scaled - Math.round(scaled));
      if (distance <= distances[index]) {
        distances[index] = distance;
        altitudes[index] = point.altitude;
      }
    }
  }
  return {
    enabled: Boolean(value.enabled),
    points: fallback.points.map((point, index) => ({
      ...point,
      altitude: altitudes[index],
      ...(surveyed[index] ? { surveyedAt: surveyed[index] } : {}),
    })),
  };
}

/** The instant each 10° sector of the mask was last surveyed (index 0 =
 * north, then every 10° eastwards), `null` for a sector « à relever ». */
export function horizonSurveyDates(value) {
  return normaliseHorizonMask(value).points.map((point) =>
    point.surveyedAt ? new Date(point.surveyedAt) : null,
  );
}

/** Whether the place's mask actually hides part of the sky (a point above
 * the horizon line): « Aucun horizon » is said when it does not (the
 * place's details of « Cette nuit »). */
export function horizonMaskHasProfile(value) {
  return normaliseHorizonMask(value).points.some((point) => point.altitude > 0);
}

/** How many of the mask's directions rise above 0°: the points the recorded
 * horizon traces (the mask always holds thirty-six). */
export function horizonTracedPointCount(value) {
  return normaliseHorizonMask(value).points.filter(
    (point) => point.altitude > 0,
  ).length;
}

export function horizonAltitude(mask, azimuth) {
  const points = canonicalPoints(mask) ?? normaliseHorizonMask(mask).points;
  const normalizedAzimuth = wrapAzimuth(Number(azimuth));
  const nextIndex =
    Math.ceil(normalizedAzimuth / horizonMaskStep) % points.length;
  const previousIndex = (nextIndex - 1 + points.length) % points.length;
  const previous = points[previousIndex];
  const next = points[nextIndex];
  const previousAzimuth = previous.azimuth;
  const nextAzimuth =
    next.azimuth > previousAzimuth ? next.azimuth : next.azimuth + 360;
  const adjustedAzimuth =
    normalizedAzimuth < previousAzimuth
      ? normalizedAzimuth + 360
      : normalizedAzimuth;
  const ratio =
    (adjustedAzimuth - previousAzimuth) / (nextAzimuth - previousAzimuth);
  return previous.altitude + (next.altitude - previous.altitude) * ratio;
}

// Sixteen-point compass label for one sampled azimuth, used by the editor's
// readout and by the direction selector.
export function horizonCardinalDirection(azimuth, locale = "fr") {
  return cardinalDirection(azimuth, locale, 16);
}
