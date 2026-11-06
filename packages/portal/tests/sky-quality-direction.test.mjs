import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  sampleSkyQualityRadiance,
  skyQualityCalibrationAt,
  sqmFromViirsRadiance,
} from "portal/sky-quality.js";
import {
  skyBrightnessByDirection,
  skyBrightnessDirectionDefaults,
  skyBrightnessDirectionModel,
  skyQualityWindow,
  skyQualityWindowFromGrid,
} from "portal/sky-quality-direction.js";
import {
  createPlannerSkyQualityCache,
  loadSkyQualityWindow,
} from "portal/planner/sky-quality.server.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const tileFixture = join(
  packageRoot,
  "..",
  "astro-contracts",
  "fixtures",
  "sky-quality-tile.json",
);

// Every synthetic place sits in the open Atlantic (45° N, 30° W), like the
// captures of the planner: no real place, no light but the one we put there.
const place = { latitude: 45, longitude: -30 };
const kilometresPerDegree = (Math.PI * 6371) / 180;

function offsetBy(origin, northKm, eastKm) {
  return {
    latitude: origin.latitude + northKm / kilometresPerDegree,
    longitude:
      origin.longitude +
      eastKm /
        (kilometresPerDegree * Math.cos((origin.latitude * Math.PI) / 180)),
  };
}

// A window whose cells are all `background`, except the one cell containing
// `source`, which reads `radiance`.
function syntheticWindow({
  origin = place,
  radiusKm = 150,
  cellDegrees = 0.05,
  background = 0,
  source = null,
  radiance = 200,
} = {}) {
  return skyQualityWindow({
    sample: (latitude, longitude) => {
      if (
        source &&
        Math.abs(latitude - source.latitude) <= cellDegrees / 2 &&
        Math.abs(longitude - source.longitude) <= cellDegrees / 2
      )
        return radiance;
      return background;
    },
    latitude: origin.latitude,
    longitude: origin.longitude,
    radiusKm,
    cellDegrees,
  });
}

function brightestAzimuth(result, altitude) {
  const row = result.sqm[result.altitudes.indexOf(altitude)];
  let best = 0;
  row.forEach((value, index) => {
    if (value < row[best]) best = index;
  });
  return best * result.azimuthStepDegrees;
}

function angularDifference(a, b) {
  const difference = Math.abs(a - b) % 360;
  return difference > 180 ? 360 - difference : difference;
}

test("the result is a labelled estimate with one row per altitude and one column per azimuth", () => {
  const result = skyBrightnessByDirection({
    ...place,
    window: syntheticWindow({ background: 1 }),
  });
  assert.equal(result.model, skyBrightnessDirectionModel);
  assert.equal(result.model, "line-of-sight-v1");
  assert.equal(result.estimate, true);
  assert.equal(result.azimuthStepDegrees, 5);
  assert.deepEqual(result.altitudes, [
    ...skyBrightnessDirectionDefaults.altitudes,
  ]);
  assert.equal(result.sqm.length, 10);
  for (const row of result.sqm) {
    assert.equal(row.length, 72);
    for (const value of row) assert.equal(typeof value, "number");
  }
  assert.equal(typeof result.zenithSqm, "number");
});

test("V1: at 90° the value is the single-point estimate of the place, on the real fixture tile", async () => {
  const tile = JSON.parse(await readFile(tileFixture, "utf8"));
  const grid = { ...tile, data: Buffer.from(tile.data, "base64") };
  // Points inside the tile, from the lit coast to the dark inland and the
  // ocean; rounded like the service rounds them.
  const points = [
    [38.7, -9.1],
    [38.9, -8.4],
    [39.6, -8.0],
    [37.6, -8.6],
    [40.3, -10.2],
    [38.53, -9.83],
  ];
  const cache = createPlannerSkyQualityCache({
    raster: async () => ({ grid, year: 2025 }),
  });
  for (const [latitude, longitude] of points) {
    const window = skyQualityWindowFromGrid(grid, latitude, longitude, 60);
    const result = skyBrightnessByDirection({
      latitude,
      longitude,
      window,
      altitudes: [90],
      azimuthStepDegrees: 90,
    });
    const single = sqmFromViirsRadiance(
      sampleSkyQualityRadiance(grid, latitude, longitude),
      latitude,
      longitude,
    );
    const served = await cache({ latitude, longitude });
    assert.ok(Math.abs(result.zenithSqm - single) <= 0.01);
    assert.ok(Math.abs(result.zenithSqm - served.sqm) <= 0.01);
    for (const value of result.sqm[0]) assert.equal(value, result.zenithSqm);
  }
});

test("V1: the zenith applies the regional calibration of the place, or the one passed in", () => {
  const japanese = { latitude: 36.2, longitude: 138.3 };
  const window = syntheticWindow({ origin: japanese, background: 2 });
  const regional = skyBrightnessByDirection({ ...japanese, window });
  assert.equal(skyQualityCalibrationAt(36.2, 138.3).id, "japan");
  assert.equal(regional.zenithSqm, sqmFromViirsRadiance(2, 36.2, 138.3));
  const global = skyBrightnessByDirection({
    ...japanese,
    window,
    calibration: { luminancePerRadiance: 0.299 },
  });
  assert.equal(global.zenithSqm, sqmFromViirsRadiance(2));
  assert.ok(global.zenithSqm > regional.zenithSqm);
});

test("V2: one bright cell 30 km north is brightest at 10° towards the north, and fades with altitude", () => {
  const source = offsetBy(place, 30, 0);
  const result = skyBrightnessByDirection({
    ...place,
    window: syntheticWindow({ source }),
  });
  assert.ok(angularDifference(brightestAzimuth(result, 10), 0) <= 5);
  const north = result.sqm.map((row) => row[0]);
  for (let index = 1; index < north.length; index += 1)
    assert.ok(
      north[index] >= north[index - 1],
      `brighter at ${result.altitudes[index]}° than at ${result.altitudes[index - 1]}°`,
    );
  // The opposite side of the sky stays darker than the source's side.
  const south = result.sqm[result.altitudes.indexOf(10)][36];
  assert.ok(south > north[2]);
});

test("V2: one bright cell 80 km east is brightest at 10° towards the east", () => {
  const source = offsetBy(place, 0, 80);
  const result = skyBrightnessByDirection({
    ...place,
    window: syntheticWindow({ source, radiance: 1500 }),
  });
  assert.ok(angularDifference(brightestAzimuth(result, 10), 90) <= 5);
  // A distant dome is brightest a few degrees up: right on the horizon its
  // light crosses the most air on the way back. From 5° upwards it fades.
  const east = result.sqm.map((row) => row[18]);
  const from5 = result.altitudes.indexOf(5);
  for (let index = from5 + 1; index < east.length; index += 1)
    assert.ok(east[index] >= east[index - 1]);
  assert.ok(Math.min(...east) === Math.min(east[0], east[from5]));
});

test("V3: a uniform field reads the same in every azimuth, and brightens towards the horizon", () => {
  const result = skyBrightnessByDirection({
    ...place,
    window: syntheticWindow({ background: 3 }),
  });
  for (const row of result.sqm)
    assert.ok(Math.max(...row) - Math.min(...row) <= 0.01);
  const column = result.sqm.map((row) => row[0]);
  for (let index = 1; index < column.length; index += 1)
    assert.ok(column[index] >= column[index - 1]);
  // The path-length weighting is capped: even on the horizon a uniform glow
  // stays within 1/(1 − e^(−τ)) of its zenith luminance (≈ 2.1 mag at τ = 0.15).
  const artificial = (sqm) => 1.08e8 * 10 ** (-0.4 * sqm) - 0.171168465;
  const ratio = artificial(column[0]) / artificial(result.zenithSqm);
  assert.ok(ratio > 1 && ratio < 1 / (1 - Math.exp(-0.15)) + 0.1, `${ratio}`);
});

test("the default zenith optical depth is 0.15", () => {
  assert.equal(skyBrightnessDirectionDefaults.opticalDepth, 0.15);
});

test("an empty field is the natural sky everywhere", () => {
  const result = skyBrightnessByDirection({
    ...place,
    window: syntheticWindow(),
  });
  assert.equal(result.zenithSqm, 22);
  for (const row of result.sqm)
    for (const value of row) assert.equal(value, 22);
});

test("an altitude below 2° is computed as 2°", () => {
  const window = syntheticWindow({ source: offsetBy(place, 0, 60) });
  const result = skyBrightnessByDirection({
    ...place,
    window,
    altitudes: [-5, 0, 1, 2],
  });
  assert.deepEqual(result.altitudes, [-5, 0, 1, 2]);
  assert.deepEqual(result.sqm[0], result.sqm[3]);
  assert.deepEqual(result.sqm[1], result.sqm[3]);
  assert.deepEqual(result.sqm[2], result.sqm[3]);
  const higher = skyBrightnessByDirection({ ...place, window, altitudes: [3] });
  assert.notDeepEqual(higher.sqm[0], result.sqm[3]);
});

test("a source beyond the maximum distance has no effect; a nearer maximum cuts it off", () => {
  const far = offsetBy(place, 0, 200);
  const window = syntheticWindow({
    source: far,
    radiusKm: 240,
    cellDegrees: 0.1,
    radiance: 2000,
  });
  const cut = skyBrightnessByDirection({ ...place, window });
  for (const row of cut.sqm) for (const value of row) assert.equal(value, 22);

  const near = offsetBy(place, 0, 100);
  const nearWindow = syntheticWindow({ source: near, cellDegrees: 0.1 });
  const reaching = skyBrightnessByDirection({ ...place, window: nearWindow });
  assert.ok(Math.min(...reaching.sqm[0]) < 22);
  const shortened = skyBrightnessByDirection({
    ...place,
    window: nearWindow,
    maximumDistanceKm: 50,
  });
  for (const row of shortened.sqm)
    for (const value of row) assert.equal(value, 22);
});

test("beyond the maximum distance, the value at that distance is used (a lit edge keeps lighting the horizon)", () => {
  // Everything beyond 40 km is lit; the observer sits in a dark disc.
  const window = skyQualityWindow({
    sample: (latitude, longitude) => {
      const north = (latitude - place.latitude) * kilometresPerDegree;
      const east =
        (longitude - place.longitude) *
        kilometresPerDegree *
        Math.cos((place.latitude * Math.PI) / 180);
      return Math.hypot(north, east) > 40 ? 5 : 0;
    },
    ...place,
    radiusKm: 150,
    cellDegrees: 0.05,
  });
  const limited = skyBrightnessByDirection({
    ...place,
    window,
    maximumDistanceKm: 60,
  });
  const full = skyBrightnessByDirection({ ...place, window });
  const horizon = limited.sqm[0];
  assert.ok(Math.max(...horizon) < 22);
  // Clamping at 60 km reads the lit ring for the rest of the path, so the
  // horizon is as bright as with the whole window, to within the rounding.
  for (let index = 0; index < horizon.length; index += 1)
    assert.ok(Math.abs(horizon[index] - full.sqm[0][index]) <= 0.05);
});

test("outside the window, the window's edge cell is used", () => {
  // A tiny window (10 km) whose east half is lit: the lines of sight leave
  // it within a few kilometres and keep reading its edge.
  const window = skyQualityWindow({
    sample: (_latitude, longitude) => (longitude > place.longitude ? 4 : 0),
    ...place,
    radiusKm: 10,
    cellDegrees: 0.02,
  });
  const result = skyBrightnessByDirection({ ...place, window });
  const horizon = result.sqm[0];
  assert.ok(horizon[18] < horizon[54] - 1, `${horizon[18]} ${horizon[54]}`);
  assert.equal(horizon[54], 22);
});

test("a place next to the antimeridian sees a source across it", () => {
  const origin = { latitude: -17, longitude: 179.9 };
  const source = offsetBy(origin, 0, 40);
  source.longitude -= 360;
  assert.ok(source.longitude > -180 && source.longitude < -179.5);
  const window = syntheticWindow({ origin, source, cellDegrees: 0.05 });
  assert.ok(window.west > 170 && window.west < 180);
  const result = skyBrightnessByDirection({ ...origin, window });
  assert.ok(angularDifference(brightestAzimuth(result, 10), 90) <= 5);
});

test("the window of a raster grid is aligned on its cells and wraps across the antimeridian", () => {
  // A global 1° grid whose level is the column index modulo 256.
  const width = 360;
  const height = 180;
  const data = Buffer.alloc(width * height);
  for (let row = 0; row < height; row += 1)
    for (let column = 0; column < width; column += 1)
      data[row * width + column] = column % 200;
  const grid = {
    width,
    height,
    cellSizeDegrees: 1,
    north: 90,
    west: -180,
    data,
  };
  const window = skyQualityWindowFromGrid(grid, 0.2, 179.6, 150);
  assert.equal(window.cellDegrees, 1);
  assert.ok(Number.isInteger(window.west) && Number.isInteger(window.north));
  assert.ok(window.west >= 176 && window.west <= 178);
  // Every window cell is exactly the raster cell under its centre.
  for (let row = 0; row < window.height; row += 1)
    for (let column = 0; column < window.width; column += 1) {
      const latitude = window.north - (row + 0.5);
      let longitude = window.west + column + 0.5;
      if (longitude >= 180) longitude -= 360;
      const expected = sampleSkyQualityRadiance(grid, latitude, longitude);
      assert.ok(
        Math.abs(window.radiances[row * window.width + column] - expected) <
          1e-9,
      );
    }
  // Near a pole the window is the whole circle of latitude.
  const polar = skyQualityWindowFromGrid(grid, 89.5, 10, 150);
  assert.equal(polar.width, 360);
  assert.equal(polar.west, -180);
  assert.equal(polar.north, 90);
});

test("the server reads a window from the installed raster, and none without one", async () => {
  const tile = JSON.parse(await readFile(tileFixture, "utf8"));
  const grid = { ...tile, data: Buffer.from(tile.data, "base64") };
  const window = await loadSkyQualityWindow({
    latitude: 38.9,
    longitude: -8.4,
    radiusKm: 30,
    raster: async () => ({ grid, year: 2025 }),
  });
  assert.equal(window.cellDegrees, tile.cellSizeDegrees);
  assert.equal(window.radiances.length, window.width * window.height);
  assert.ok(window.radiances.some((value) => value > 0));
  assert.equal(
    await loadSkyQualityWindow({
      latitude: 38.9,
      longitude: -8.4,
      raster: async () => null,
    }),
    null,
  );
});

test("unusable input answers null, and the result survives a JSON round trip", () => {
  const window = syntheticWindow({ source: offsetBy(place, 20, 20) });
  assert.equal(skyBrightnessByDirection({ ...place }), null);
  assert.equal(
    skyBrightnessByDirection({ latitude: 95, longitude: 0, window }),
    null,
  );
  assert.equal(
    skyBrightnessByDirection({ ...place, window, azimuthStepDegrees: 0 }),
    null,
  );
  assert.equal(
    skyBrightnessByDirection({ ...place, window, layerHeightKm: -1 }),
    null,
  );
  assert.equal(
    skyBrightnessByDirection({
      ...place,
      window: { ...window, radiances: [1, 2] },
    }),
    null,
  );
  assert.equal(skyQualityWindow({ latitude: 0, longitude: 0 }), null);

  const direct = skyBrightnessByDirection({ ...place, window });
  const travelled = JSON.parse(JSON.stringify(window));
  assert.deepEqual(
    skyBrightnessByDirection({ ...place, window: travelled }),
    direct,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(direct)), direct);
});

test("the validation script's bearings, distances and hemisphere mean are right", async () => {
  const {
    angularDifference: difference,
    artificialLuminance,
    distanceKm,
    hemisphereMeanArtificial,
    initialBearing,
  } = await import("../scripts/validate-sky-direction.mjs");
  const origin = { latitude: 45, longitude: -30 };
  assert.ok(Math.abs(initialBearing(origin, offsetBy(origin, 30, 0))) < 0.01);
  assert.ok(
    Math.abs(initialBearing(origin, { latitude: 45, longitude: -29 }) - 90) <
      0.5,
  );
  assert.ok(Math.abs(distanceKm(origin, offsetBy(origin, 0, 80)) - 80) < 0.1);
  assert.equal(difference(355, 5), 10);
  assert.equal(difference(90, 270), 180);
  assert.equal(artificialLuminance(22), 0);
  // A uniform sky of one artificial luminance averages to that luminance.
  const uniform = {
    altitudes: [0, 30, 60, 90],
    sqm: [
      [20, 20],
      [20, 20],
      [20, 20],
      [20, 20],
    ],
  };
  assert.ok(
    Math.abs(hemisphereMeanArtificial(uniform) - artificialLuminance(20)) <
      1e-12,
  );
});

test("the validation plot is labelled as an estimate and names no place", async () => {
  const { polarPlotHtml } =
    await import("../scripts/validate-sky-direction.mjs");
  const result = skyBrightnessByDirection({
    ...place,
    window: syntheticWindow({ source: offsetBy(place, 30, 0) }),
    azimuthStepDegrees: 30,
  });
  const html = polarPlotHtml({
    site: {
      id: 1,
      description: "Synthetic point <test>",
      latitude: 45,
      longitude: -30,
    },
    result,
    brightest10: 0,
    expected: [0],
  });
  assert.match(html, /estimate/);
  assert.match(html, /45\.0°, -30\.0°/);
  assert.match(html, /Synthetic point &lt;test&gt;/);
  assert.equal(
    (html.match(/<path /g) || []).length,
    (result.altitudes.length - 1) * 12,
  );
});
