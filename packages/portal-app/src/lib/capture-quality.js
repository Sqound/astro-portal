import {
  mergeSessionTelemetry,
  normalizeSessionTelemetry,
} from "./session-telemetry.js";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function median(values) {
  const sorted = values
    .map(finite)
    .filter((value) => value !== null)
    .sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function compactPoint(frame) {
  const dateUtc = String(frame?.dateUtc || "");
  if (!Number.isFinite(Date.parse(dateUtc))) return null;
  const backgroundRelativePercent = finite(frame?.background?.relativePercent);
  const backgroundNoiseAdu = finite(frame?.background?.noiseAdu);
  const fwhmPixels = finite(frame?.stars?.medianFwhmPixels);
  const eccentricity = finite(frame?.stars?.medianEccentricity);
  const detectedStars = finite(frame?.stars?.detected);
  if (
    backgroundRelativePercent === null &&
    backgroundNoiseAdu === null &&
    fwhmPixels === null &&
    eccentricity === null
  )
    return null;
  return {
    dateUtc,
    backgroundRelativePercent,
    backgroundNoiseAdu,
    fwhmPixels,
    eccentricity,
    detectedStars,
  };
}

function pointSummary(points) {
  return {
    fromUtc: points[0].fromUtc || points[0].dateUtc,
    toUtc: points.at(-1).toUtc || points.at(-1).dateUtc,
    dateUtc: points[Math.floor(points.length / 2)].dateUtc,
    backgroundRelativePercent: median(
      points.map((point) => point.backgroundRelativePercent),
    ),
    backgroundNoiseAdu: median(points.map((point) => point.backgroundNoiseAdu)),
    fwhmPixels: median(points.map((point) => point.fwhmPixels)),
    eccentricity: median(points.map((point) => point.eccentricity)),
    detectedStars: median(points.map((point) => point.detectedStars)),
    frameCount: points.reduce(
      (total, point) => total + (point.frameCount || 1),
      0,
    ),
  };
}

/**
 * Keeps portal payloads small while preserving a chronological, robust
 * median series.  The raw per-frame values remain in the private JSON cache.
 */
export function compactQualitySeries(frames, maxPoints = 48) {
  const points = (Array.isArray(frames) ? frames : [])
    .map(compactPoint)
    .filter(Boolean)
    .sort((left, right) => left.dateUtc.localeCompare(right.dateUtc));
  if (!points.length) return [];
  const bucketSize = Math.max(1, Math.ceil(points.length / maxPoints));
  const series = [];
  for (let start = 0; start < points.length; start += bucketSize)
    series.push(pointSummary(points.slice(start, start + bucketSize)));
  return series;
}

export function normalizeCaptureQuality(document) {
  if (document?.schemaVersion !== 1) return null;
  const series = compactQualitySeries(document.frames);
  if (!series.length) return null;
  const telemetry = normalizeSessionTelemetry(document?.sessionTelemetry);
  return {
    schemaVersion: 1,
    frameCount: Number.isInteger(document?.source?.frameCount)
      ? document.source.frameCount
      : series.reduce((total, point) => total + point.frameCount, 0),
    summary: {
      medianFwhmPixels: finite(document?.summary?.medianFwhmPixels),
      medianEccentricity: finite(document?.summary?.medianEccentricity),
      medianBackgroundNoiseAdu: finite(
        document?.summary?.medianBackgroundNoiseAdu,
      ),
    },
    series,
    ...(telemetry.length ? { sessionTelemetry: telemetry } : {}),
  };
}

/** Combines already normalized capture series for one astronomical night. */
export function aggregateCaptureQuality(qualities) {
  const points = (Array.isArray(qualities) ? qualities : [])
    .flatMap((quality) => quality?.series || [])
    .filter((point) => Number.isFinite(Date.parse(point?.dateUtc)))
    .sort((left, right) => left.dateUtc.localeCompare(right.dateUtc));
  if (!points.length) return null;
  const bucketSize = Math.max(1, Math.ceil(points.length / 36));
  const series = [];
  for (let start = 0; start < points.length; start += bucketSize)
    series.push(pointSummary(points.slice(start, start + bucketSize)));
  const telemetry = mergeSessionTelemetry(
    qualities.map((quality) => quality?.sessionTelemetry || []),
  );
  return {
    frameCount: points.reduce(
      (total, point) => total + (point.frameCount || 1),
      0,
    ),
    summary: {
      medianFwhmPixels: median(points.map((point) => point.fwhmPixels)),
      medianEccentricity: median(points.map((point) => point.eccentricity)),
      medianBackgroundNoiseAdu: median(
        points.map((point) => point.backgroundNoiseAdu),
      ),
    },
    series,
    ...(telemetry.length ? { sessionTelemetry: telemetry } : {}),
  };
}
