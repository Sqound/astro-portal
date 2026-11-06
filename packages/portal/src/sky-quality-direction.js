// Sky brightness by direction — an ESTIMATE, not a measurement.
//
// The installed raster (docs/SKY_QUALITY_RASTER.md) holds, per cell, the
// PROPAGATED radiance: the upward radiance of everything within 300 km summed
// with a distance kernel, which the service turns into the ZENITH sky
// brightness of that cell (`sqmFromViirsRadiance` in ./sky-quality.js). This
// module estimates the brightness of the rest of the sky from the same field,
// with nothing but the raster: it needs no network and runs once per place.
//
// Model "line-of-sight-v1"
// ------------------------
// Looking at altitude h towards azimuth A, the line of sight climbs through a
// scattering layer whose density falls off exponentially with height, with a
// scale height H (`layerHeightKm`). At horizontal distance x from the
// observer, the line of sight is at height
//
//     z(x) = x·tan h + x² / (2·R⊕)                  (curved Earth, R⊕ = 6371 km)
//
// above the ground point P(x, A). The artificial light scattered towards the
// observer from there is taken proportional to the zenith glow of P — the
// raster value R(P), which already sums every source around P — times the
// local density of the layer, and is dimmed by the layer crossed on the way
// back. Writing q for the number of "zenith columns" of the layer crossed so
// far (dq = ρ(z)·ds, ρ(z) = e^(−z/H)/H), the artificial brightness is
//
//     B(h, A) = K · Σ R(P(x_k, A)) · e^(−τ·q_k) · Δq_k  /  Σ₉₀ e^(−τ·q_k) · Δq_k
//
// where K is the regional luminance-per-radiance constant (same table as the
// zenith estimate) and the denominator is the same sum for the zenith, so a
// uniform field reads R exactly at 90°. At 90° every sample sits on the
// observer's own cell: the value IS the single-point estimate, to the digit.
//
// Path-length weighting, and its cap. For a uniform field the ratio to the
// zenith is W(h) = (1 − e^(−τ·Q(h))) / (1 − e^(−τ)), where Q(h) is the air
// mass of the layer (the total q along the line of sight). Near the zenith Q
// ≈ 1/sin h, so the artificial glow grows with the path length like a plain
// air mass; towards the horizon the extinction term caps it, because light
// scattered far along a long path is itself dimmed on the way back. The cap
// is 1/(1 − e^(−τ)): 7.2 for the default τ = 0.15, i.e. a uniform glow reads
// at most 2.1 mag brighter on the horizon than at the zenith. This is the
// same shape as the classical single-scattering result for an optically thin
// layer; τ is the zenith optical depth of the scattering layer, V band,
// documented range 0.15–0.5 (clear to hazy). The curved-Earth term keeps Q
// finite at the horizon (≈ 45 columns for H = 5 km).
//
// The mean distance at which the line of sight crosses the layer is about
// H / tan h — 28 km at 10°, 5 km at 45° for H = 5 km — which is the first
// model written for this feature; integrating along the
// whole line of sight instead of reading one point at that distance keeps a
// bright source close to the observer brightest at the horizon rather than in
// a ring at the altitude whose crossing distance happens to match it.
//
// Rules the implementation meets (tested in
// packages/portal/tests/sky-quality-direction.test.mjs):
//   - at 90° the value equals the single-point estimate (same bilinear read,
//     same conversion, same regional calibration);
//   - an altitude below 2° is computed as 2°;
//   - beyond `maximumDistanceKm` along the line of sight, the value at that
//     distance is used; outside the window, the window's edge cell;
//   - the natural background is the 22.0 mag/arcsec² of ./sky-quality.js,
//     NOT weighted by the path: only the artificial part is.
//
// Limits: no terrain (a ridge between a city and the observer screens
// nothing), no observer altitude, one layer height and one optical depth for
// every place and night, no natural brightening towards the horizon
// (airglow, zodiacal light), no clouds reflecting the city back down. See
// "Brightness by direction (estimate)" in docs/SKY_QUALITY_RASTER.md.

import {
  nearestSkyQualityRadiance,
  skyQualityCalibrationAt,
  sqmFromArtificialBrightness,
} from "./sky-quality.js";

export const skyBrightnessDirectionModel = "line-of-sight-v1";

export const skyBrightnessDirectionDefaults = Object.freeze({
  radiusKm: 150,
  azimuthStepDegrees: 5,
  altitudes: Object.freeze([0, 5, 10, 15, 20, 30, 45, 60, 75, 90]),
  layerHeightKm: 5,
  maximumDistanceKm: 150,
  opticalDepth: 0.15,
  minimumAltitudeDegrees: 2,
});

const earthRadiusKm = 6371;
const kilometresPerDegree = (Math.PI * earthRadiusKm) / 180;
const radians = Math.PI / 180;
// Samples along each line of sight, spread evenly over the fraction of the
// layer crossed (u = 1 − e^(−z/H)) up to ten scale heights.
const lineOfSightSamples = 64;
const layerDepthInScaleHeights = 10;

// Numbers only: a string or a null is not a coordinate.
function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function wrap180(longitude) {
  let wrapped = (longitude + 180) % 360;
  if (wrapped < 0) wrapped += 360;
  return wrapped - 180;
}

function wrap360(value) {
  let wrapped = value % 360;
  if (wrapped < 0) wrapped += 360;
  return wrapped;
}

/**
 * The part of a raster needed around a place: every cell whose centre lies
 * within `radiusKm` (plus one cell, for the bilinear read at the edge) of the
 * place, aligned on the raster's own cells, with DECODED radiances.
 *
 * `sample(latitude, longitude)` is the raster's cell reader, called once at
 * each cell centre (longitude in [−180, 180)); it answers a radiance in
 * nW/cm²/sr, or null (read as 0). `cellDegrees`, `gridNorth` and `gridWest`
 * give the raster's geometry, so that the window's cells are the raster's.
 *
 * → `{ west, north, cellDegrees, width, height, radiances }`, row 0 at the
 * north, `radiances[row * width + column]`; `west` in [−180, 180). Null when
 * the input is unusable.
 */
export function skyQualityWindow({
  sample,
  latitude,
  longitude,
  radiusKm = skyBrightnessDirectionDefaults.radiusKm,
  cellDegrees = 1 / 30,
  gridNorth = 90,
  gridWest = -180,
} = {}) {
  const latitudeValue = finite(latitude);
  const longitudeValue = finite(longitude);
  const radius = finite(radiusKm);
  const cell = finite(cellDegrees);
  const north = finite(gridNorth) ?? 90;
  const west = finite(gridWest) ?? -180;
  if (
    typeof sample !== "function" ||
    latitudeValue === null ||
    longitudeValue === null ||
    latitudeValue < -90 ||
    latitudeValue > 90 ||
    longitudeValue < -180 ||
    longitudeValue > 180 ||
    radius === null ||
    radius < 0 ||
    cell === null ||
    cell <= 0
  )
    return null;

  const latitudeSpan = radius / kilometresPerDegree + cell;
  const top = latitudeValue + latitudeSpan;
  const bottom = latitudeValue - latitudeSpan;
  const firstRow = Math.max(
    Math.floor((north - top) / cell),
    Math.ceil((north - 90) / cell),
  );
  const lastRow = Math.min(
    Math.floor((north - bottom) / cell),
    Math.floor((north + 90) / cell) - 1,
  );
  if (lastRow < firstRow) return null;

  const fullCircle = Math.round(360 / cell);
  const poleward = Math.min(
    90,
    Math.max(Math.abs(top), Math.abs(bottom), Math.abs(latitudeValue)),
  );
  const cosine = Math.cos(poleward * radians);
  let firstColumn;
  let width;
  if (poleward >= 89.9 || !(cosine > 0)) {
    firstColumn = 0;
    width = fullCircle;
  } else {
    const longitudeSpan = radius / (kilometresPerDegree * cosine) + cell;
    firstColumn = Math.floor((longitudeValue - longitudeSpan - west) / cell);
    const lastColumn = Math.floor(
      (longitudeValue + longitudeSpan - west) / cell,
    );
    width = lastColumn - firstColumn + 1;
    if (width >= fullCircle) {
      firstColumn = 0;
      width = fullCircle;
    }
  }

  const height = lastRow - firstRow + 1;
  const windowNorth = north - firstRow * cell;
  const windowWest = wrap180(west + firstColumn * cell);
  const radiances = new Array(width * height);
  for (let row = 0; row < height; row += 1) {
    const cellLatitude = windowNorth - (row + 0.5) * cell;
    for (let column = 0; column < width; column += 1) {
      const cellLongitude = wrap180(windowWest + (column + 0.5) * cell);
      const value = finite(sample(cellLatitude, cellLongitude));
      radiances[row * width + column] = value !== null && value > 0 ? value : 0;
    }
  }
  return {
    west: windowWest,
    north: windowNorth,
    cellDegrees: cell,
    width,
    height,
    radiances,
  };
}

/**
 * The window of an installed raster grid (`{ width, height, cellSizeDegrees,
 * north, west, data }`, the shape ./sky-quality.js samples): the raster's own
 * cells around the place, read with `nearestSkyQualityRadiance` at each cell
 * centre. JSON in, JSON out — fixtured as `sky-quality-direction-window`.
 */
export function skyQualityWindowFromGrid(grid, latitude, longitude, radiusKm) {
  const cell = finite(grid?.cellSizeDegrees);
  if (cell === null || cell <= 0) return null;
  return skyQualityWindow({
    sample: (cellLatitude, cellLongitude) =>
      nearestSkyQualityRadiance(grid, cellLatitude, cellLongitude),
    latitude,
    longitude,
    radiusKm: radiusKm ?? skyBrightnessDirectionDefaults.radiusKm,
    cellDegrees: cell,
    gridNorth: finite(grid?.north) ?? 90,
    gridWest: finite(grid?.west) ?? -180,
  });
}

function windowGeometry(window) {
  const width = Number(window?.width);
  const height = Number(window?.height);
  const cell = finite(window?.cellDegrees);
  const north = finite(window?.north);
  const west = finite(window?.west);
  const radiances = window?.radiances;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    cell === null ||
    cell <= 0 ||
    north === null ||
    west === null ||
    !Array.isArray(radiances) ||
    radiances.length !== width * height
  )
    return null;
  return {
    width,
    height,
    cell,
    north,
    west,
    radiances,
    wraps: Math.abs(width * cell - 360) < 1e-9,
  };
}

function windowRadiance(geometry, row, column) {
  const clampedRow =
    row < 0 ? 0 : row > geometry.height - 1 ? geometry.height - 1 : row;
  let clampedColumn;
  if (geometry.wraps) {
    clampedColumn = column % geometry.width;
    if (clampedColumn < 0) clampedColumn += geometry.width;
  } else
    clampedColumn =
      column < 0
        ? 0
        : column > geometry.width - 1
          ? geometry.width - 1
          : column;
  const value = geometry.radiances[clampedRow * geometry.width + clampedColumn];
  return typeof value === "number" && value > 0 ? value : 0;
}

// Bilinear read on decoded radiances, the same arithmetic as
// `sampleSkyQualityRadiance`; `eastOfPlace` is the longitude difference from
// the place, already wrapped into [−180, 180), and `placeColumn` the place's
// own continuous column offset from the window's west edge — so a window
// straddling the antimeridian reads as one piece.
function windowSample(geometry, latitude, eastOfPlace, placeOffset) {
  const x = (placeOffset + eastOfPlace) / geometry.cell - 0.5;
  const y = (geometry.north - latitude) / geometry.cell - 0.5;
  const column = Math.floor(x);
  const row = Math.floor(y);
  const columnFraction = x - column;
  const rowFraction = y - row;
  const northWest = windowRadiance(geometry, row, column);
  const northEast = windowRadiance(geometry, row, column + 1);
  const southWest = windowRadiance(geometry, row + 1, column);
  const southEast = windowRadiance(geometry, row + 1, column + 1);
  const northValue = northWest + (northEast - northWest) * columnFraction;
  const southValue = southWest + (southEast - southWest) * columnFraction;
  return northValue + (southValue - northValue) * rowFraction;
}

// The samples along one line of sight: horizontal distance x_k and weight
// e^(−τ·q_k)·Δq_k (q_k at the middle of the step), before normalisation.
function lineOfSight(altitudeDegrees, layerHeightKm, opticalDepth) {
  const sine = Math.sin(altitudeDegrees * radians);
  const cosine =
    altitudeDegrees >= 90 ? 0 : Math.cos(altitudeDegrees * radians);
  const uMaximum = 1 - Math.exp(-layerDepthInScaleHeights);
  const step = uMaximum / lineOfSightSamples;
  const distances = new Array(lineOfSightSamples);
  const weights = new Array(lineOfSightSamples);
  let crossed = 0;
  for (let k = 0; k < lineOfSightSamples; k += 1) {
    const u = (k + 0.5) * step;
    const heightKm = -layerHeightKm * Math.log(1 - u);
    // Horizontal distance at which the line of sight reaches that height,
    // z = x·tan h + x²/(2R⊕), in the form that stays exact at 90°.
    const distance =
      (2 * heightKm * cosine) /
      (sine +
        Math.sqrt(
          sine * sine + (2 * heightKm * cosine * cosine) / earthRadiusKm,
        ));
    const columns = step / (sine + (cosine * distance) / earthRadiusKm);
    const middle = crossed + columns / 2;
    crossed += columns;
    distances[k] = distance;
    weights[k] = Math.exp(-opticalDepth * middle) * columns;
  }
  return { distances, weights };
}

function destination(latitude, longitude, azimuthDegrees, distanceKm) {
  const angular = distanceKm / earthRadiusKm;
  const bearing = azimuthDegrees * radians;
  const phi = latitude * radians;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinAngular = Math.sin(angular);
  const cosAngular = Math.cos(angular);
  const sinLatitude =
    sinPhi * cosAngular + cosPhi * sinAngular * Math.cos(bearing);
  const destinationLatitude = Math.asin(
    sinLatitude > 1 ? 1 : sinLatitude < -1 ? -1 : sinLatitude,
  );
  const eastward = Math.atan2(
    Math.sin(bearing) * sinAngular * cosPhi,
    cosAngular - sinPhi * sinLatitude,
  );
  return {
    latitude: destinationLatitude / radians,
    eastOfPlace: wrap180(eastward / radians),
  };
}

/**
 * Estimated sky brightness (mag/arcsec²) by altitude and azimuth around a
 * place, from a window of the raster (`skyQualityWindow`).
 *
 * `calibration` is `{ luminancePerRadiance }` (the shape
 * `skyQualityCalibrationAt` answers); omitted, the place's own regional
 * calibration is used, exactly as for the zenith estimate.
 *
 * → `{ model: "line-of-sight-v1", estimate: true, azimuthStepDegrees,
 * altitudes, sqm, zenithSqm }`, `sqm[i][j]` at `altitudes[i]` and azimuth
 * `j × azimuthStepDegrees` (0 = north, 90 = east). Null when the input is
 * unusable.
 */
export function skyBrightnessByDirection({
  latitude,
  longitude,
  window,
  calibration,
  azimuthStepDegrees = skyBrightnessDirectionDefaults.azimuthStepDegrees,
  altitudes = skyBrightnessDirectionDefaults.altitudes,
  layerHeightKm = skyBrightnessDirectionDefaults.layerHeightKm,
  maximumDistanceKm = skyBrightnessDirectionDefaults.maximumDistanceKm,
  opticalDepth = skyBrightnessDirectionDefaults.opticalDepth,
} = {}) {
  const latitudeValue = finite(latitude);
  const longitudeValue = finite(longitude);
  const step = finite(azimuthStepDegrees);
  const layer = finite(layerHeightKm);
  const maximumDistance = finite(maximumDistanceKm);
  const depth = finite(opticalDepth);
  const geometry = windowGeometry(window);
  if (
    latitudeValue === null ||
    longitudeValue === null ||
    latitudeValue < -90 ||
    latitudeValue > 90 ||
    longitudeValue < -180 ||
    longitudeValue > 180 ||
    !geometry ||
    step === null ||
    step <= 0 ||
    step > 360 ||
    layer === null ||
    layer <= 0 ||
    maximumDistance === null ||
    maximumDistance < 0 ||
    depth === null ||
    depth <= 0 ||
    !Array.isArray(altitudes) ||
    altitudes.length === 0 ||
    altitudes.some((altitude) => finite(altitude) === null)
  )
    return null;

  const explicit = finite(calibration?.luminancePerRadiance);
  const luminancePerRadiance =
    explicit !== null && explicit >= 0
      ? explicit
      : skyQualityCalibrationAt(latitudeValue, longitudeValue)
          .luminancePerRadiance;

  const placeOffset = wrap360(longitudeValue - geometry.west);
  const placeRadiance = windowSample(geometry, latitudeValue, 0, placeOffset);
  const toSqm = (radiance) =>
    sqmFromArtificialBrightness(luminancePerRadiance * radiance);
  const zenithSqm = toSqm(placeRadiance);

  const azimuthCount = Math.max(1, Math.floor(360 / step + 1e-9));
  const zenith = lineOfSight(90, layer, depth);
  let zenithTotal = 0;
  for (const weight of zenith.weights) zenithTotal += weight;

  const sqm = altitudes.map((rawAltitude) => {
    const altitude = Math.min(
      90,
      Math.max(
        skyBrightnessDirectionDefaults.minimumAltitudeDegrees,
        Number(rawAltitude),
      ),
    );
    if (altitude >= 90) return new Array(azimuthCount).fill(zenithSqm);
    const { distances, weights } = lineOfSight(altitude, layer, depth);
    const row = new Array(azimuthCount);
    for (let j = 0; j < azimuthCount; j += 1) {
      const azimuth = j * step;
      let sum = 0;
      for (let k = 0; k < distances.length; k += 1) {
        const distance =
          distances[k] > maximumDistance ? maximumDistance : distances[k];
        const point = destination(
          latitudeValue,
          longitudeValue,
          azimuth,
          distance,
        );
        sum +=
          weights[k] *
          windowSample(
            geometry,
            point.latitude,
            point.eastOfPlace,
            placeOffset,
          );
      }
      row[j] = toSqm(sum / zenithTotal);
    }
    return row;
  });

  return {
    model: skyBrightnessDirectionModel,
    estimate: true,
    azimuthStepDegrees: step,
    altitudes: altitudes.map(Number),
    sqm,
    zenithSqm,
  };
}
