import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  bortleFromSqm,
  decodeSkyQualityRadiance,
  deriveSkyQualityPackGrid,
  encodeSkyQualityRadiance,
  nearestSkyQualityRadiance,
  sampleSkyQualityRadiance,
  skyQualityCalibrationAt,
  skyQualityCalibrationRegions,
  skyQualityCalibrationVersion,
  skyQualityRadianceLevels,
  skyQualityRadianceMaximum,
  skyQualityLuminancePerRadiance,
  skyQualityRadianceOffset,
  sqmFromViirsRadiance,
} from "portal/sky-quality.js";
import {
  createPlannerSkyQualityCache,
  ensureSkyQualityPackRaster,
  loadSkyQualityRaster,
  resetSkyQualityRaster,
  skyQualityRasterDirectory,
} from "portal/planner/sky-quality.server.js";

import {
  skyQualityKernel,
  skyQualityKernelBlend,
  skyQualityKernelCellAverage,
  skyQualityKernelFar,
  skyQualityKernelNear,
  skyQualityKernelNormalisation,
  skyQualityKernelRadiusKm,
  skyQualityKernelSplit,
} from "../scripts/sky-quality-kernel.mjs";
import {
  aggregateByCell,
  calibrationSources,
  downloadMeasurementSets,
  globeAtNightDocumentIds,
  globeAtNightUrl,
  readJapanStarWatching,
  sqmFromArtificial,
} from "../scripts/calibrate-sky-quality.mjs";
import {
  syntheticRadiance,
  writeSyntheticGeoTiff,
} from "./helpers/synthetic-geotiff.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const script = join(packageRoot, "scripts", "prepare-sky-quality-raster.mjs");
const tileFixture = join(
  packageRoot,
  "..",
  "astro-contracts/fixtures/sky-quality-tile.json",
);

function prepare(input, directory, extra = []) {
  return execFileSync(
    process.execPath,
    [
      script,
      "--input",
      input,
      "--static-data-dir",
      directory,
      "--year",
      "2025",
      "--arcminutes",
      "30",
      // The default 6' offline-pack variant does not divide a 30' test grid
      // (it would need to be COARSER, not finer); tests that exercise the
      // pack derivation pass their own compatible --pack-arcminutes via
      // `extra` (a later occurrence of the same flag overrides this one).
      "--pack-arcminutes",
      "0",
      ...extra,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

test("the 8-bit log encoding round-trips every level exactly", () => {
  for (let level = 0; level < skyQualityRadianceLevels; level += 1) {
    const radiance = decodeSkyQualityRadiance(level);
    assert.equal(typeof radiance, "number");
    assert.equal(encodeSkyQualityRadiance(radiance), level);
  }
  assert.equal(decodeSkyQualityRadiance(0), 0);
  assert.ok(
    Math.abs(
      decodeSkyQualityRadiance(skyQualityRadianceLevels - 1) -
        skyQualityRadianceMaximum,
    ) < 1e-6,
  );
  assert.equal(decodeSkyQualityRadiance(skyQualityRadianceLevels), null);
  assert.equal(decodeSkyQualityRadiance(-1), null);
  assert.equal(encodeSkyQualityRadiance(-1), 0);
  assert.equal(encodeSkyQualityRadiance(skyQualityRadianceMaximum * 10), 255);
  // Worst-case quantization, expressed where it matters: sky brightness.
  let worst = 0;
  for (let level = 1; level < skyQualityRadianceLevels - 1; level += 1) {
    const low = sqmFromViirsRadiance(decodeSkyQualityRadiance(level));
    const high = sqmFromViirsRadiance(decodeSkyQualityRadiance(level + 1));
    if (low !== null && high !== null) worst = Math.max(worst, low - high);
  }
  // One encoding step is 0.0208 dex, which is 0.052 mag/arcsec² where the
  // artificial component dominates; the reported SQM is then rounded to
  // 0.01 mag, so the largest gap between two neighbouring levels is 0.06.
  assert.ok(
    worst <= 0.065,
    `quantization step ${worst} mag/arcsec² is too coarse`,
  );
});

test("propagated radiance converts linearly to artificial luminance", () => {
  // Artificial zenith luminance is linear in the light reaching the
  // observer, so twice the propagated radiance is exactly twice the
  // artificial luminance — which is 0.75 mag, not 0.75 of anything else.
  const artificial = (sqm) => 108000000 * 10 ** (-0.4 * sqm) - 0.171168465;
  assert.ok(
    Math.abs(
      artificial(sqmFromViirsRadiance(20)) /
        artificial(sqmFromViirsRadiance(10)) -
        2,
    ) < 0.01,
  );
  assert.equal(
    sqmFromViirsRadiance(1),
    Number(
      (
        -2.5 *
        Math.log10((skyQualityLuminancePerRadiance + 0.171168465) / 108000000)
      ).toFixed(2),
    ),
  );
  // The calibration lives in one place and is a plausible luminance per unit
  // radiance, not a stray edit.
  assert.ok(
    skyQualityLuminancePerRadiance > 0.05 && skyQualityLuminancePerRadiance < 1,
  );
  // Below the natural background the result is floored at 22.0, never darker.
  assert.equal(sqmFromViirsRadiance(0), 22);
  assert.equal(sqmFromViirsRadiance(0.0001), 22);
  assert.equal(sqmFromViirsRadiance(-5), 22);
  assert.equal(sqmFromViirsRadiance("not a number"), null);
  assert.ok(sqmFromViirsRadiance(0.3) > sqmFromViirsRadiance(3));
  assert.equal(bortleFromSqm(sqmFromViirsRadiance(0)), 1);
  assert.equal(bortleFromSqm(sqmFromViirsRadiance(100)), 9);
});

test("the propagation kernel behaves like a propagation kernel", () => {
  // Monotone, bounded, and truncated exactly where the model says.
  assert.equal(skyQualityKernel(0), 1);
  assert.equal(skyQualityKernel(skyQualityKernelRadiusKm + 1e-9), 0);
  assert.ok(skyQualityKernel(skyQualityKernelRadiusKm) > 0);
  assert.equal(skyQualityKernel(-1), 0);
  let previous = Infinity;
  for (let distance = 1; distance <= 300; distance += 1) {
    const weight = skyQualityKernel(distance);
    assert.ok(weight > 0 && weight < previous, `not decreasing at ${distance}`);
    previous = weight;
  }
  // Duriscoe et al. (2018) equation (11) with this exponent scale: the
  // effective exponent grows with distance, from about 0.74 near 1 km to
  // about 3.64 at the truncation radius. (At exactly 1 km the kernel is 1 by
  // construction and the exponent cannot be read off it, so measure at 2 km.)
  assert.equal(skyQualityKernel(1), 1);
  const exponentAt = (distance) =>
    -Math.log(skyQualityKernel(distance)) / Math.log(distance);
  assert.ok(Math.abs(exponentAt(2) - 0.896) < 0.01, `${exponentAt(2)}`);
  assert.ok(Math.abs(exponentAt(300) - 3.639) < 0.01, `${exponentAt(300)}`);
  assert.ok(exponentAt(2) < exponentAt(20));
  assert.ok(exponentAt(20) < exponentAt(200));

  // The split is exactly a split: near + far reproduces the kernel at every
  // distance, the far half is identically zero inside the ramp, and the near
  // half stops at its outer edge.
  for (let distance = 0; distance <= 320; distance += 0.25) {
    assert.ok(
      Math.abs(
        skyQualityKernelNear(distance) +
          skyQualityKernelFar(distance) -
          skyQualityKernel(distance),
      ) < 1e-12,
      `split broken at ${distance} km`,
    );
  }
  assert.equal(skyQualityKernelFar(skyQualityKernelSplit.innerKm), 0);
  assert.equal(skyQualityKernelFar(skyQualityKernelSplit.innerKm - 1), 0);
  assert.equal(skyQualityKernelNear(skyQualityKernelSplit.outerKm), 0);
  assert.equal(skyQualityKernelNear(skyQualityKernelSplit.outerKm + 10), 0);
  // The ramp is C¹: its derivative vanishes at both ends, so quantising a
  // source onto the coarse grid never moves it across a steep step.
  const slope = (distance) =>
    (skyQualityKernelBlend(distance + 1e-5) -
      skyQualityKernelBlend(distance - 1e-5)) /
    2e-5;
  assert.ok(Math.abs(slope(skyQualityKernelSplit.innerKm + 1e-4)) < 1e-3);
  assert.ok(Math.abs(slope(skyQualityKernelSplit.outerKm - 1e-4)) < 1e-3);

  // The normalisation is the kernel's own surface integral, which is what
  // keeps the propagated field in nW/cm²/sr. Check it against an independent
  // midpoint sum rather than against a recorded number.
  const normalisation = skyQualityKernelNormalisation();
  let midpoint = 0;
  const steps = 400000;
  for (let index = 0; index < steps; index += 1) {
    const distance = ((index + 0.5) * skyQualityKernelRadiusKm) / steps;
    midpoint +=
      (2 *
        Math.PI *
        distance *
        skyQualityKernel(distance) *
        skyQualityKernelRadiusKm) /
      steps;
  }
  assert.ok(Math.abs(normalisation / midpoint - 1) < 1e-4);

  // A cell average is not the centre value where the kernel curves, and is
  // the centre value where it does not.
  const near = skyQualityKernelCellAverage(skyQualityKernel, 0, 0, 3.7, 3.7);
  assert.ok(near > 0 && near < 1.1 && near !== skyQualityKernel(0));
  const far = skyQualityKernelCellAverage(skyQualityKernel, 120, 0, 3.7, 3.7);
  assert.ok(Math.abs(far / skyQualityKernel(120) - 1) < 2e-3);
});

test("a uniformly lit plane propagates to its own radiance", () => {
  // The defining property of the normalisation: summing a constant radiance
  // over the cells inside the truncation radius, weighted by the kernel and
  // the cell areas, gives back that constant. This is what makes the stored
  // field comparable with the raw composite and lets the luminance constant
  // be a pure calibration.
  const cellKm = 3.706;
  const radius = Math.ceil(skyQualityKernelRadiusKm / cellKm);
  const averagingKm = 4 * cellKm;
  let total = 0;
  for (let row = -radius; row <= radius; row += 1)
    for (let column = -radius; column <= radius; column += 1) {
      const northSouth = row * cellKm;
      const eastWest = column * cellKm;
      const distance = Math.hypot(northSouth, eastWest);
      const weight =
        distance < averagingKm
          ? skyQualityKernelCellAverage(
              skyQualityKernel,
              eastWest,
              northSouth,
              cellKm,
              cellKm,
            )
          : skyQualityKernel(distance);
      total += weight * cellKm * cellKm;
    }
  const propagated = total / skyQualityKernelNormalisation();
  assert.ok(
    Math.abs(propagated - 1) < 0.02,
    `a uniform field propagated to ${propagated}, not 1`,
  );
});

test("an isolated lit cell propagates to the kernel's own profile", () => {
  // One cell of radiance R and area A, alone, must produce R·A·K(d)/N at
  // distance d — the radial profile the kernel prescribes, with no extra
  // shape of its own.
  const cellKm = 3.706;
  const radiance = 12;
  const area = cellKm * cellKm;
  const normalisation = skyQualityKernelNormalisation();
  for (const distance of [20, 45, 80, 150, 280]) {
    const expected =
      (radiance * area * skyQualityKernel(distance)) / normalisation;
    const modelled =
      (radiance *
        area *
        (skyQualityKernelNear(distance) + skyQualityKernelFar(distance))) /
      normalisation;
    assert.ok(
      Math.abs(modelled / expected - 1) < 1e-12,
      `profile broken at ${distance} km`,
    );
    assert.ok(expected > 0);
  }
  // Beyond the truncation radius an isolated cell contributes exactly zero.
  assert.equal(skyQualityKernel(skyQualityKernelRadiusKm + 1), 0);
});

test("the fixture tile decodes and samples as a real raster does", async () => {
  const tile = JSON.parse(await readFile(tileFixture, "utf8"));
  const data = Buffer.from(tile.data, "base64");
  assert.equal(data.length, tile.width * tile.height);
  assert.equal(tile.encoding.offset, skyQualityRadianceOffset);
  assert.equal(tile.encoding.maximum, skyQualityRadianceMaximum);
  assert.equal(tile.encoding.levels, skyQualityRadianceLevels);
  assert.equal(tile.cellSizeDegrees, 1 / 30);
  assert.equal(tile.bounds.west, tile.west);
  assert.equal(tile.bounds.north, tile.north);
  const grid = { ...tile, data };

  // A tile is a window on the globe, not a global grid: it must not wrap.
  const westEdge = sampleSkyQualityRadiance(grid, tile.north - 0.5, tile.west);
  assert.equal(typeof westEdge, "number");

  // Nearest neighbour reproduces a cell exactly; bilinear at the same point
  // agrees with it, and between two cells it stays between their values.
  const row = 40;
  const column = 55;
  const latitude = tile.north - (row + 0.5) * tile.cellSizeDegrees;
  const longitude = tile.west + (column + 0.5) * tile.cellSizeDegrees;
  const cell = decodeSkyQualityRadiance(data[row * tile.width + column]);
  assert.equal(nearestSkyQualityRadiance(grid, latitude, longitude), cell);
  assert.ok(
    Math.abs(sampleSkyQualityRadiance(grid, latitude, longitude) - cell) < 1e-9,
  );
  const neighbour = decodeSkyQualityRadiance(
    data[row * tile.width + column + 1],
  );
  const between = sampleSkyQualityRadiance(
    grid,
    latitude,
    longitude + tile.cellSizeDegrees / 2,
  );
  assert.ok(between >= Math.min(cell, neighbour) - 1e-9);
  assert.ok(between <= Math.max(cell, neighbour) + 1e-9);

  // The tile is cut from the real composite over a coast, so it has to span
  // dark ocean and a lit city, not one flat value.
  const levels = new Set(data);
  assert.ok(levels.size > 32, `tile has only ${levels.size} distinct levels`);
  assert.equal(Math.min(...levels), 0);
  assert.ok(Math.max(...levels) > 150);
});

test("the preparation script is rerunnable, idempotent and compression-agnostic", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "sky-quality-raster-"));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const plain = join(workspace, "plain.tif");
  const packed = join(workspace, "packed.tif");
  await writeSyntheticGeoTiff(plain);
  await writeSyntheticGeoTiff(packed, { compression: 8, predictor: 3 });

  const first = join(workspace, "first");
  prepare(plain, first, ["--fixture-tile", "off"]);
  const manifest = JSON.parse(
    await readFile(join(first, "sky-quality", "manifest.json"), "utf8"),
  );
  assert.equal(
    manifest.attribution,
    "This product was made utilizing VIIRS Nighttime Lights (VNL) data " +
      "produced by the Earth Observation Group, Payne Institute for Public " +
      "Policy, Colorado School of Mines.",
  );
  assert.equal(manifest.license, "CC BY 4.0");
  assert.equal(manifest.year, 2025);
  assert.equal(manifest.grid.width, 720);
  assert.equal(manifest.grid.height, 360);
  assert.equal(manifest.grid.bytes, 720 * 360);
  assert.equal(manifest.encoding.offset, skyQualityRadianceOffset);
  assert.match(manifest.checksum, /^sha256:[0-9a-f]{64}$/);
  const raster = await readFile(join(first, "sky-quality", manifest.file));
  assert.equal(raster.length, manifest.grid.bytes);

  // Same input, second run: same bytes, same checksum.
  prepare(plain, first, ["--fixture-tile", "off"]);
  const again = JSON.parse(
    await readFile(join(first, "sky-quality", "manifest.json"), "utf8"),
  );
  assert.equal(again.checksum, manifest.checksum);

  // Deflate with the floating-point predictor decodes to the same raster.
  const second = join(workspace, "second");
  prepare(packed, second, ["--fixture-tile", "off"]);
  const packedManifest = JSON.parse(
    await readFile(join(second, "sky-quality", "manifest.json"), "utf8"),
  );
  assert.equal(packedManifest.checksum, manifest.checksum);

  // End to end: resample, then propagate. The corner of the synthetic patch
  // is dark on the ground (0.04 nW/cm²/sr) and 220 km from the bright centre,
  // so the cell that lands in the raster must be the kernel's answer, not the
  // ground radiance under it — that difference is the whole point of the
  // propagation. Recomputed here from the source function by a plain gather
  // over the whole output grid, independently of the script's two-scale
  // scatter.
  const {
    cellSizeDegrees,
    height: gridHeight,
    width: gridWidth,
  } = manifest.grid;
  const factor = Math.round(cellSizeDegrees * 240);
  const meanAt = (row, column) => {
    // Only the 4° × 4° patch at -4..0 E, -2..2 N carries any light.
    const west = manifest.grid.west + column * cellSizeDegrees;
    const north = manifest.grid.north - row * cellSizeDegrees;
    if (west < -4 || west >= 0 || north > 2 || north <= -2) return 0;
    const column0 = Math.round((west + 4) * 240);
    const row0 = Math.round((2 - north) * 240);
    let total = 0;
    for (let y = 0; y < factor; y += 1)
      for (let x = 0; x < factor; x += 1)
        total += syntheticRadiance(row0 + y, column0 + x, {
          width: 960,
          height: 960,
        });
    return total / factor ** 2;
  };
  const earthRadiusKm = 6371.0087714;
  const radians = Math.PI / 180;
  const areaOf = (row) => {
    const north = 90 - row * cellSizeDegrees;
    return (
      earthRadiusKm *
      earthRadiusKm *
      cellSizeDegrees *
      radians *
      (Math.sin(north * radians) -
        Math.sin((north - cellSizeDegrees) * radians))
    );
  };
  const rowKm = cellSizeDegrees * earthRadiusKm * radians;
  const averagingKm = 4 * rowKm;
  const normalisation = skyQualityKernelNormalisation();
  const propagatedAt = (targetRow, targetColumn) => {
    let total = 0;
    const rows = Math.ceil(skyQualityKernelRadiusKm / rowKm);
    for (let row = targetRow - rows; row <= targetRow + rows; row += 1) {
      if (row < 0 || row >= gridHeight) continue;
      const northSouthKm = (targetRow - row) * rowKm;
      const meanLatitude =
        90 -
        (row + 0.5) * cellSizeDegrees -
        ((targetRow - row) * cellSizeDegrees) / 2;
      const columnKm =
        cellSizeDegrees *
        earthRadiusKm *
        radians *
        Math.cos(meanLatitude * radians);
      const area = areaOf(row);
      for (let column = 0; column < gridWidth; column += 1) {
        const value = meanAt(row, column);
        if (!(value > 0)) continue;
        let offset = targetColumn - column;
        if (offset > gridWidth / 2) offset -= gridWidth;
        if (offset < -gridWidth / 2) offset += gridWidth;
        const eastWestKm = offset * columnKm;
        const distance = Math.hypot(northSouthKm, eastWestKm);
        if (distance > skyQualityKernelRadiusKm) continue;
        const weight =
          distance < averagingKm
            ? skyQualityKernelCellAverage(
                skyQualityKernel,
                eastWestKm,
                northSouthKm,
                columnKm,
                rowKm,
              )
            : skyQualityKernel(distance);
        total += value * area * weight;
      }
    }
    return total / normalisation;
  };
  const cornerColumn = Math.round((-4 - manifest.grid.west) / cellSizeDegrees);
  const cornerRow = Math.round((manifest.grid.north - 2) / cellSizeDegrees);
  const expected = propagatedAt(cornerRow, cornerColumn);
  const actual = decodeSkyQualityRadiance(
    raster[cornerRow * gridWidth + cornerColumn],
  );
  assert.ok(
    Math.abs(actual / expected - 1) < 0.05,
    `cell holds ${actual}, an independent gather says ${expected}`,
  );
  // And it really is brighter than the ground under it.
  assert.ok(
    actual > 2 * meanAt(cornerRow, cornerColumn),
    `propagation added nothing: ${actual} vs ${meanAt(cornerRow, cornerColumn)}`,
  );

  // A few-degree tile comes out of the same run at the same encoding.
  const tilePath = join(workspace, "tile.json");
  prepare(plain, first, [
    "--fixture-tile",
    tilePath,
    "--fixture-tile-bounds",
    "-4,-2,0,2",
  ]);
  const tile = JSON.parse(await readFile(tilePath, "utf8"));
  assert.equal(tile.width, 8);
  assert.equal(tile.height, 8);
  assert.equal(Buffer.from(tile.data, "base64").length, 64);
  assert.equal(tile.source.year, 2025);
});

test("the service samples an installed raster and stays silent without one", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "sky-quality-service-"));
  t.after(() => {
    resetSkyQualityRaster();
    return rm(workspace, { recursive: true, force: true });
  });
  const input = join(workspace, "input.tif");
  await writeSyntheticGeoTiff(input);
  prepare(input, workspace, ["--fixture-tile", "off"]);

  resetSkyQualityRaster();
  const installed = await loadSkyQualityRaster(join(workspace, "sky-quality"));
  assert.equal(installed.year, 2025);
  assert.equal(installed.grid.data.length, 720 * 360);

  const load = createPlannerSkyQualityCache({ raster: async () => installed });
  const estimate = await load({ latitude: 0, longitude: -2 });
  assert.deepEqual(Object.keys(estimate).sort(), [
    "bortleClass",
    "calculatedAt",
    "calibration",
    "estimated",
    "method",
    "source",
    "sqm",
    "stale",
  ]);
  assert.equal(estimate.source, "viirs-vnl-2025");
  assert.equal(
    estimate.method,
    "viirs-propagated-radiance-zenith-sky-brightness",
  );
  assert.equal(estimate.estimated, true);
  assert.ok(estimate.sqm >= 10 && estimate.sqm <= 22.1);
  assert.ok(estimate.bortleClass >= 1 && estimate.bortleClass <= 9);
  // (0, -2) is off the coast of west Africa: no region matches, so this is
  // the global calibration set, additive and versioned.
  assert.match(estimate.calibration, /^\d{4}-\d{2}\/global$/);

  // No raster: one warning, no throw, no outbound request, and the contract's
  // existing unavailable state.
  resetSkyQualityRaster();
  const warnings = [];
  const original = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    const missing = join(workspace, "absent");
    assert.equal(await loadSkyQualityRaster(missing), null);
    assert.equal(await loadSkyQualityRaster(missing), null);
    assert.equal(await loadSkyQualityRaster(missing), null);
  } finally {
    console.warn = original;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Sky-quality raster unavailable/);
});

test("the raster directory follows the static-data package convention", () => {
  const previous = { ...process.env };
  try {
    delete process.env.ASTRO_PORTAL_SKY_QUALITY_RASTER_DIR;
    process.env.ASTRO_PORTAL_STATIC_DATA_DIR = "/tmp/static-data-example";
    assert.equal(
      skyQualityRasterDirectory(),
      join("/tmp/static-data-example", "sky-quality"),
    );
    process.env.ASTRO_PORTAL_SKY_QUALITY_RASTER_DIR = "/tmp/override-example";
    assert.equal(skyQualityRasterDirectory(), "/tmp/override-example");
  } finally {
    for (const name of Object.keys(process.env))
      if (name.startsWith("ASTRO_PORTAL_")) delete process.env[name];
    Object.assign(process.env, previous);
  }
});

// ── Offline pack: the 6' derived raster ──────────────

/** Restores an environment variable after a test that needs to change it,
 * whether or not it was set at all. */
function withPackEnv(name, value, run) {
  const had = Object.prototype.hasOwnProperty.call(process.env, name);
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return (async () => {
    try {
      return await run();
    } finally {
      if (had) process.env[name] = previous;
      else delete process.env[name];
    }
  })();
}

const packEncoding = {
  offset: skyQualityRadianceOffset,
  maximum: skyQualityRadianceMaximum,
  levels: skyQualityRadianceLevels,
};

test("deriveSkyQualityPackGrid reduces a real 2' grid (10800×5400) to exactly 3600×1800 = 6 480 000 bytes", () => {
  const width = 10800;
  const height = 5400;
  // No real raster is committed here: an all-zero buffer of the real
  // dimensions proves the byte count and the 3×3 tiling without needing one.
  const data = Buffer.alloc(width * height);
  const grid = deriveSkyQualityPackGrid(
    { width, height, cellSizeDegrees: 2 / 60, north: 90, west: -180, data },
    packEncoding,
    3,
  );
  assert.equal(grid.width, 3600);
  assert.equal(grid.height, 1800);
  assert.equal(grid.data.length, 6480000);
  assert.ok(Math.abs(grid.cellSizeDegrees - 0.1) < 1e-12, "6' = 0.1°");
  assert.equal(grid.populatedCells, 0);
});

test("deriveSkyQualityPackGrid rejects a source grid that is not an exact multiple of the factor", () => {
  assert.throws(
    () =>
      deriveSkyQualityPackGrid(
        {
          width: 10,
          height: 9,
          cellSizeDegrees: 1,
          data: Buffer.alloc(90),
        },
        packEncoding,
        3,
      ),
    /not an exact/,
  );
});

test("a uniform field reduces to the same encoded level everywhere (round-trip is exact)", () => {
  const width = 9;
  const height = 6;
  const level = 137;
  const data = Buffer.alloc(width * height, level);
  const grid = deriveSkyQualityPackGrid(
    { width, height, cellSizeDegrees: 2 / 60, north: 10, west: -6, data },
    packEncoding,
    3,
  );
  assert.equal(grid.width, 3);
  assert.equal(grid.height, 2);
  assert.deepEqual(new Set(grid.data), new Set([level]));
  assert.equal(grid.populatedCells, grid.width * grid.height);
});

test("a mixed 3×3 block averages DECODED radiances, area-weighted by latitude — not a naive mean of levels", () => {
  // Three rows at three different latitude bands (10° cells, well away from
  // the equator) so their area weights genuinely differ, each holding
  // different encoded levels.
  const levelsByRow = [
    [10, 50, 90],
    [130, 170, 210],
    [0, 40, 80],
  ];
  const width = 3;
  const height = 3;
  const cellSizeDegrees = 10;
  const north = 30;
  const data = Buffer.from(levelsByRow.flat());
  const grid = deriveSkyQualityPackGrid(
    { width, height, cellSizeDegrees, north, west: -15, data },
    packEncoding,
    3,
  );
  assert.equal(grid.width, 1);
  assert.equal(grid.height, 1);

  // Hand-computed: the exact same `sin(φ_north) − sin(φ_south)` area weight
  // the preparation script's own resampling uses, applied by hand to the
  // ALREADY-TRUSTED `decodeSkyQualityRadiance`/`encodeSkyQualityRadiance`
  // round trip (proven exact by the round-trip test above).
  const radians = Math.PI / 180;
  const rowWeight = (row) => {
    const top = north - row * cellSizeDegrees;
    const bottom = top - cellSizeDegrees;
    return Math.sin(top * radians) - Math.sin(bottom * radians);
  };
  let sum = 0;
  let weightTotal = 0;
  for (let row = 0; row < 3; row += 1) {
    const weight = rowWeight(row);
    weightTotal += weight * 3;
    for (let column = 0; column < 3; column += 1)
      sum += decodeSkyQualityRadiance(levelsByRow[row][column]) * weight;
  }
  const expectedLevel = encodeSkyQualityRadiance(sum / weightTotal);
  assert.equal(grid.data[0], expectedLevel);

  // Proof the weighting actually matters: a naive UNWEIGHTED mean of the
  // same 9 decoded radiances lands on a DIFFERENT byte level, because row 2
  // (closest to the equator here, so the widest cells) is far brighter and
  // must carry more weight than a plain average would give it.
  const naiveMean =
    levelsByRow
      .flat()
      .reduce((total, level) => total + decodeSkyQualityRadiance(level), 0) / 9;
  assert.notEqual(encodeSkyQualityRadiance(naiveMean), expectedLevel);
});

test("deriving the same source grid twice produces byte-identical output (same sha-256)", () => {
  const width = 300;
  const height = 150;
  const data = Buffer.alloc(width * height);
  // A reproducible, non-trivial pattern — not all zero, not all equal.
  for (let index = 0; index < data.length; index += 1)
    data[index] = (index * 37 + Math.floor(index / width) * 11) % 256;
  const source = {
    width,
    height,
    cellSizeDegrees: 2 / 60,
    north: 90,
    west: -180,
    data,
  };
  const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
  const first = deriveSkyQualityPackGrid(source, packEncoding, 3);
  const second = deriveSkyQualityPackGrid(source, packEncoding, 3);
  assert.equal(hash(first.data), hash(second.data));
  assert.ok(new Set(first.data).size > 1, "not a trivially uniform result");
});

test("the server's lazy derivation matches the script's own --pack-arcminutes output bit for bit", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "sky-quality-pack-cross-"));
  t.after(() => {
    resetSkyQualityRaster();
    return rm(workspace, { recursive: true, force: true });
  });
  const input = join(workspace, "input.tif");
  await writeSyntheticGeoTiff(input);

  // One directory produced entirely by the script (--pack-arcminutes 90,
  // an exact ×3 of --arcminutes 30's 720×360 grid), one with only the base
  // raster, for the server to derive the same variant from lazily.
  const scriptSide = join(workspace, "script-side");
  prepare(input, scriptSide, [
    "--arcminutes",
    "30",
    "--pack-arcminutes",
    "90",
    "--fixture-tile",
    "off",
  ]);
  const scriptPackRaster = await readFile(
    join(scriptSide, "sky-quality", "pack", "raster.bin"),
  );
  const scriptPackManifest = JSON.parse(
    await readFile(
      join(scriptSide, "sky-quality", "pack", "manifest.json"),
      "utf8",
    ),
  );
  assert.equal(scriptPackRaster.length, 240 * 120);

  const serverSide = join(workspace, "server-side");
  prepare(input, serverSide, [
    "--arcminutes",
    "30",
    "--pack-arcminutes",
    "0",
    "--fixture-tile",
    "off",
  ]);

  resetSkyQualityRaster();
  await withPackEnv(
    "ASTRO_PORTAL_SKY_QUALITY_RASTER_DIR",
    join(serverSide, "sky-quality"),
    async () => {
      const derived = await ensureSkyQualityPackRaster({ arcminutes: 90 });
      assert.ok(derived);
      const hash = (buffer) =>
        createHash("sha256").update(buffer).digest("hex");
      assert.equal(hash(derived.raster), hash(scriptPackRaster));
      assert.equal(derived.manifest.checksum, scriptPackManifest.checksum);
      assert.equal(derived.manifest.grid.width, scriptPackManifest.grid.width);
      assert.equal(
        derived.manifest.grid.height,
        scriptPackManifest.grid.height,
      );
      assert.equal(derived.manifest.derivedFrom.width, 720);
      assert.equal(derived.manifest.derivedFrom.height, 360);
    },
  );
});

test("ensureSkyQualityPackRaster re-derives when the installed source raster's checksum changes", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "sky-quality-pack-stale-"));
  t.after(() => {
    resetSkyQualityRaster();
    return rm(workspace, { recursive: true, force: true });
  });
  const inputA = join(workspace, "a.tif");
  const inputB = join(workspace, "b.tif");
  await writeSyntheticGeoTiff(inputA);
  await writeSyntheticGeoTiff(inputB, {
    sample: (row, column, options) =>
      syntheticRadiance(row, column, options) * 2,
  });

  const staticDataDirectory = join(workspace, "static-data");
  prepare(inputA, staticDataDirectory, [
    "--arcminutes",
    "30",
    "--pack-arcminutes",
    "90",
    "--fixture-tile",
    "off",
  ]);
  const packDirectory = join(staticDataDirectory, "sky-quality", "pack");
  const firstPackRaster = await readFile(join(packDirectory, "raster.bin"));
  const firstPackManifest = JSON.parse(
    await readFile(join(packDirectory, "manifest.json"), "utf8"),
  );

  resetSkyQualityRaster();
  await withPackEnv(
    "ASTRO_PORTAL_SKY_QUALITY_RASTER_DIR",
    join(staticDataDirectory, "sky-quality"),
    async () => {
      // Already up to date: re-checking must not change anything.
      const upToDate = await ensureSkyQualityPackRaster({ arcminutes: 90 });
      assert.equal(upToDate.manifest.checksum, firstPackManifest.checksum);

      // Replace the SOURCE raster with different content but leave `pack/`
      // untouched: its recorded `derivedFrom.checksum` now disagrees with
      // the newly installed source.
      prepare(inputB, staticDataDirectory, [
        "--arcminutes",
        "30",
        "--pack-arcminutes",
        "0",
        "--fixture-tile",
        "off",
      ]);
      const reDerived = await ensureSkyQualityPackRaster({ arcminutes: 90 });
      assert.notEqual(reDerived.manifest.checksum, firstPackManifest.checksum);
      const hash = (buffer) =>
        createHash("sha256").update(buffer).digest("hex");
      assert.notEqual(hash(reDerived.raster), hash(firstPackRaster));
    },
  );
});

test("a read-only static-data directory yields no pack component, never a throw", async (t) => {
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    // Root ignores directory modes: nothing here is read-only for it, so
    // the scenario cannot be produced. Skipped, not passed.
    t.skip("running as root: a read-only directory is still writable");
    return;
  }
  const workspace = await mkdtemp(join(tmpdir(), "sky-quality-pack-readonly-"));
  const rasterDirectory = join(workspace, "static-data", "sky-quality");
  t.after(async () => {
    resetSkyQualityRaster();
    await chmod(rasterDirectory, 0o755).catch(() => {});
    return rm(workspace, { recursive: true, force: true });
  });
  const input = join(workspace, "input.tif");
  await writeSyntheticGeoTiff(input);
  prepare(input, join(workspace, "static-data"), [
    "--arcminutes",
    "30",
    "--pack-arcminutes",
    "0",
    "--fixture-tile",
    "off",
  ]);
  // Read + execute only: the source raster stays readable, but nothing can
  // be created underneath — `pack/` cannot be `mkdir`'d.
  await chmod(rasterDirectory, 0o555);

  resetSkyQualityRaster();
  const warnings = [];
  const original = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    await withPackEnv(
      "ASTRO_PORTAL_SKY_QUALITY_RASTER_DIR",
      rasterDirectory,
      async () => {
        // 90' is an exact ×3 of the installed 30' source, so this would
        // otherwise succeed — isolating the read-only directory as the
        // only cause of failure.
        const result = await ensureSkyQualityPackRaster({ arcminutes: 90 });
        assert.equal(result, null);
      },
    );
  } finally {
    console.warn = original;
  }
  assert.equal(warnings.length, 1);
  assert.match(
    warnings[0],
    /Offline-pack sky-quality raster derivation failed/,
  );
});

// ── The optional Japanese calibration source ─────────────────────────────
// Small SYNTHETIC extracts only; no campaign data is committed here. The
// shapes are the two that an export of the public 環境GIS star-watching
// layer produces, plus the bare array a paged export ends up as.

const japanFeature = (attributes, { geojson = false } = {}) =>
  geojson
    ? {
        geometry: {
          coordinates: [attributes.longitude, attributes.latitude],
          type: "Point",
        },
        properties: attributes,
        type: "Feature",
      }
    : {
        attributes,
        geometry: { x: attributes.longitude, y: attributes.latitude },
      };

const japanRow = (overrides = {}) => ({
  latitude: 36.1,
  longitude: 138.2,
  magnitude: 20.8,
  measure_season: 1,
  measure_year: 2024,
  variation: 0.1,
  ...overrides,
});

const readJapan = (rows, fromYear = 2019, maximumVariation = 0.2) =>
  readJapanStarWatching(
    JSON.stringify({ features: rows.map((row) => japanFeature(row)) }),
    fromYear,
    maximumVariation,
  );

test("the Japanese star-watching reader accepts every export shape", () => {
  const rows = [
    japanRow(),
    japanRow({ latitude: 36.2, magnitude: 19.4, measure_season: 2 }),
  ];
  const esri = readJapan(rows);
  const geojson = readJapanStarWatching(
    JSON.stringify({
      features: rows.map((row) => japanFeature(row, { geojson: true })),
      type: "FeatureCollection",
    }),
    2019,
  );
  const bare = readJapanStarWatching(
    JSON.stringify(rows.map((row) => japanFeature(row))),
    2019,
  );
  assert.deepEqual(esri, geojson);
  assert.deepEqual(esri, bare);
  assert.deepEqual(esri[0], {
    latitude: 36.1,
    longitude: 138.2,
    season: "summer",
    source: "japan-star-watching",
    sqm: 20.8,
    year: 2024,
  });
  assert.equal(esri[1].season, "winter");
});

test("the Japanese reader applies its documented filters", () => {
  // ばらつき above the limit is the campaign's own "this frame was uneven".
  assert.equal(readJapan([japanRow({ variation: 0.35 })]).length, 0);
  assert.equal(readJapan([japanRow({ variation: 0.35 })], 2019, 0.5).length, 1);
  // A row with no variation at all is kept rather than silently dropped.
  assert.equal(readJapan([japanRow({ variation: null })]).length, 1);
  // Outside the range the published campaign tables span.
  assert.equal(readJapan([japanRow({ magnitude: 13.5 })]).length, 0);
  assert.equal(readJapan([japanRow({ magnitude: 22.6 })]).length, 0);
  assert.equal(readJapan([japanRow({ magnitude: 14.6 })]).length, 1);
  assert.equal(readJapan([japanRow({ magnitude: 22.45 })]).length, 1);
  assert.equal(readJapan([japanRow({ magnitude: "—" })]).length, 0);
  // --from-year, as everywhere else.
  assert.equal(readJapan([japanRow({ measure_year: 2018 })]).length, 0);
  assert.equal(readJapan([japanRow({ measure_year: 2018 })], 2018).length, 1);
  // Nonsense positions never reach the sampler.
  assert.equal(readJapan([japanRow({ latitude: 99 })]).length, 0);
  assert.equal(readJapan([japanRow({ longitude: null })]).length, 0);
  // An empty or unexpected payload is empty, not a crash.
  assert.deepEqual(readJapanStarWatching("{}", 2019), []);
  assert.deepEqual(readJapanStarWatching("[]", 2019), []);
});

test("Japanese rows aggregate like any other per-cell source", () => {
  // Five readings inside one 2' cell, and one lonely site elsewhere: the
  // median survives, and a cell below --min-readings is dropped.
  const inOneCell = [20.5, 20.7, 20.6, 20.8, 20.6].map((magnitude, index) =>
    japanRow({ latitude: 36.11 + index * 0.0001, magnitude }),
  );
  const rows = readJapan([
    ...inOneCell,
    japanRow({ latitude: 40, longitude: 140 }),
  ]);
  assert.equal(rows.length, 6);
  const cells = aggregateByCell(rows, 2 / 60, 3);
  assert.equal(cells.length, 1);
  assert.equal(cells[0].readings, 5);
  assert.ok(Math.abs(cells[0].latitude - 36.11) < 0.01);
  // The aggregate carries an artificial luminance, which is what the fit
  // consumes; it has to round-trip back to the median reading.
  assert.ok(cells[0].artificial > 0);
  assert.ok(Math.abs(sqmFromArtificial(cells[0].artificial) - 20.6) < 1e-9);
});

test("the Japanese source is declared with its licence, feeds the Japan regional constant, and never the global one", () => {
  const source = calibrationSources.japanStarWatching;
  assert.match(source.attribution, /環境省/);
  assert.match(source.attribution, /国立環境研究所/);
  // The asymmetry between the two publications has to stay visible: the
  // openly licensed one has no coordinates, the one with coordinates is not
  // openly licensed.
  assert.match(source.license, /PDL1\.0/);
  assert.match(source.license, /no coordinates/);
  assert.match(source.license, /reproduction reserved/);
  // The GLOBAL constant this repository ships is fitted without those rows,
  // regardless of the regional table below.
  assert.equal(skyQualityLuminancePerRadiance, 0.299);
  const japanRegion = skyQualityCalibrationRegions.find(
    (region) => region.id === "japan",
  );
  assert.ok(japanRegion, "the regional table must carry a Japan entry");
  assert.match(japanRegion.provenance.source, /環境省/);
  assert.ok(japanRegion.luminancePerRadiance > skyQualityLuminancePerRadiance);
});

// ── Regional calibration table ──────────────────────────────────────────

test("skyQualityCalibrationAt matches Japan for Japanese cities and falls back to global just across the strait", () => {
  assert.equal(skyQualityCalibrationAt(35.6762, 139.6503).id, "japan"); // Tokyo
  assert.equal(skyQualityCalibrationAt(43.0618, 141.3545).id, "japan"); // Sapporo
  assert.equal(skyQualityCalibrationAt(26.2124, 127.6809).id, "japan"); // Naha
  assert.equal(skyQualityCalibrationAt(27.094, 142.1928).id, "japan"); // Ogasawara
  assert.equal(skyQualityCalibrationAt(35.1796, 129.0756).id, "global"); // Busan
  assert.equal(skyQualityCalibrationAt(37.5665, 126.978).id, "global"); // Seoul
  assert.equal(skyQualityCalibrationAt(13.4443, 144.7937).id, "global"); // Guam
});

test("skyQualityCalibrationAt falls back to global without a usable position, exactly as before this table existed", () => {
  assert.equal(skyQualityCalibrationAt().id, "global");
  assert.equal(skyQualityCalibrationAt(undefined, undefined).id, "global");
  assert.equal(skyQualityCalibrationAt("not-a-number", 139.65).id, "global");
  assert.equal(
    skyQualityCalibrationAt(35.68, 139.65).luminancePerRadiance !==
      skyQualityLuminancePerRadiance,
    true,
  );
});

test("sqmFromViirsRadiance is unchanged without a position and applies the region with one", () => {
  const radiance = 8;
  const withoutPosition = sqmFromViirsRadiance(radiance);
  assert.equal(withoutPosition, sqmFromViirsRadiance(radiance, null, null));
  const tokyo = sqmFromViirsRadiance(radiance, 35.6762, 139.6503);
  const busan = sqmFromViirsRadiance(radiance, 35.1796, 129.0756);
  assert.equal(busan, withoutPosition); // outside the table: old behaviour.
  assert.notEqual(tokyo, withoutPosition); // inside Japan: the region applies.
  // The Japan constant is higher, so the same radiance reads as a brighter
  // (numerically lower) SQM there than under the global constant.
  assert.ok(tokyo < withoutPosition);
});

test("skyQualityCalibrationVersion is the calibration-set half of the API's `calibration` field", () => {
  assert.match(skyQualityCalibrationVersion, /^\d{4}-\d{2}$/);
});

// ── Globe at Night download: the id table and its explicit failures ─────

test("globeAtNightUrl builds the real per-id URL and rejects an unknown year", () => {
  assert.equal(
    globeAtNightUrl(2025),
    "https://globeatnight.org/documents/1190/GaN2025.csv",
  );
  assert.equal(
    globeAtNightUrl(2019),
    "https://globeatnight.org/documents/665/GaN2019.csv",
  );
  assert.throws(() => globeAtNightUrl(1999), /No known Globe at Night/);
  // Every id in the table actually has to build a well-formed URL.
  for (const year of Object.keys(globeAtNightDocumentIds))
    assert.match(
      globeAtNightUrl(Number(year)),
      /^https:\/\/globeatnight\.org\/documents\/\d+\/GaN\d{4}\.csv$/,
    );
});

test("downloadMeasurementSets never touches the network: a fake fetch is required, and a 404 fails loudly", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "sky-quality-download-"));
  try {
    const requested = [];
    const okFetch = async (url) => {
      requested.push(url);
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from(`data for ${url}`, "utf8"),
      };
    };
    const paths = await downloadMeasurementSets({
      workDirectory,
      fromYear: 2024,
      toYear: 2025,
      fetchImpl: okFetch,
      log: () => {},
    });
    assert.equal(paths.length, 3); // NPS + GaN2024 + GaN2025
    assert.equal(requested.length, 3);
    assert.ok(requested[0].includes("nsdmap.geojson"));
    assert.ok(requested[1].endsWith("/documents/926/GaN2024.csv"));
    assert.ok(requested[2].endsWith("/documents/1190/GaN2025.csv"));

    const notFoundFetch = async () => ({ ok: false, status: 404 });
    await assert.rejects(
      downloadMeasurementSets({
        workDirectory,
        fromYear: 2024,
        toYear: 2024,
        fetchImpl: notFoundFetch,
        log: () => {},
      }),
      /Download failed:.*HTTP 404/,
    );
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
});
