#!/usr/bin/env node
/*
 * Read a prepared sky-quality raster and print the two checks the model is
 * judged on. Run manually after `prepare-sky-quality-raster.mjs`; it reads
 * nothing but the raster and needs no network.
 *
 *   node packages/portal/scripts/check-sky-quality-raster.mjs \
 *     [--raster-dir <dir>] [--json]
 *
 * ── Transect ─────────────────────────────────────────────────────────────
 * Eight points from the centre of Madrid outwards along azimuth 315°, at 0,
 * 20, 35, 45, 55, 75, 110 and 170 km. A model that ignores the light of the
 * surroundings reads a pristine sky a few tens of kilometres out of a
 * six-million-inhabitant metropolis, because the `average_masked` product
 * zeroes every cell that is not itself lit. The transect makes that failure
 * visible: the profile has to darken away from the city, and no point within
 * 100 km of it may come out as Bortle 1 or 2.
 *
 * ── Control points ───────────────────────────────────────────────────────
 * Public places spanning the whole range, from city cores to observatory
 * sites and open ocean. Two kinds of expectation are listed and the table
 * says which is which:
 *
 * - `measured` — a published ground measurement at that place, cited. These
 *   are worth taking seriously when the model misses them.
 * - `indicative` — an order of magnitude only, with no measurement behind
 *   it. A miss here is a hint, not a defect.
 *
 * Nothing in this file is used to fit anything: the calibration is done in
 * calibrate-sky-quality.mjs against a separate, openly licensed data set.
 */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  bortleFromSqm,
  nearestSkyQualityRadiance,
  sampleSkyQualityRadiance,
  sqmFromViirsRadiance,
} from "../src/sky-quality.js";

const options = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (!argument.startsWith("--")) continue;
  const [name, ...values] = argument.split("=");
  if (values.length) {
    options.set(name, values.join("="));
    continue;
  }
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    options.set(name, next);
    index += 1;
  } else options.set(name, true);
}

const earthRadiusKm = 6371.0087714;
const radians = Math.PI / 180;

// Great-circle destination from a point, given a bearing and a distance.
export function destination(latitude, longitude, bearingDegrees, distanceKm) {
  const angular = distanceKm / earthRadiusKm;
  const latitude1 = latitude * radians;
  const longitude1 = longitude * radians;
  const bearing = bearingDegrees * radians;
  const latitude2 = Math.asin(
    Math.sin(latitude1) * Math.cos(angular) +
      Math.cos(latitude1) * Math.sin(angular) * Math.cos(bearing),
  );
  const longitude2 =
    longitude1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(latitude1),
      Math.cos(angular) - Math.sin(latitude1) * Math.sin(latitude2),
    );
  return {
    latitude: latitude2 / radians,
    longitude: ((longitude2 / radians + 540) % 360) - 180,
  };
}

export const madrid = { latitude: 40.4168, longitude: -3.7038 };
export const transectDistancesKm = [0, 20, 35, 45, 55, 75, 110, 170];

// name, latitude, longitude, [expected SQM low, high] or null, kind, source.
export const controlPoints = [
  [
    "Madrid, Puerta del Sol",
    40.4168,
    -3.7038,
    [17.0, 17.8],
    "measured",
    "Zamorano et al. 2016, JQSRT 181, 52 (arXiv:1512.06694): brightest central cells SQM 17.0, mode ~17.5",
  ],
  [
    "Madrid, UCM observatory",
    40.4506,
    -3.7264,
    [18.2, 18.6],
    "measured",
    "Robles et al. 2021, Remote Sensing 13, 1511: SQM band 18.2-18.6 (V 17.8-18.1)",
  ],
  [
    "Rural Madrid region, ~60 km out",
    40.9,
    -4.25,
    [21.0, 21.5],
    "measured",
    "Zamorano et al. 2016: radial profile reaches ~21 by 60 km, rural ~21.5",
  ],
  [
    "Pic du Midi de Bigorre",
    42.9369,
    0.1425,
    [20.92, 21.52],
    "measured",
    "Charlier 2017, HAL halshs-01620903: SQM-L mean 21.26 over n=33, range 20.92-21.52",
  ],
  [
    "Roque de los Muchachos, La Palma",
    28.7543,
    -17.8849,
    [21.7, 22.0],
    "measured",
    "Benn & Ellison 1998: V 21.9 at solar minimum",
  ],
  [
    "Cerro Paranal",
    -24.6275,
    -70.4044,
    [21.7, 22.0],
    "measured",
    "Patat 2008: V 21.71 +/- 0.24 cycle mean, 21.99 at solar minimum",
  ],
  ["Paris, Notre-Dame", 48.853, 2.3499, [17.3, 18.5], "indicative", null],
  [
    "New York, Manhattan midtown",
    40.7549,
    -73.984,
    [17.0, 17.8],
    "indicative",
    null,
  ],
  ["Tokyo, Chiyoda", 35.6812, 139.7671, [17.0, 17.8], "indicative", null],
  [
    "Paris suburb, ~20 km NE (Chelles)",
    48.8833,
    2.6,
    [18.5, 19.5],
    "indicative",
    null,
  ],
  [
    "Sierra de Guadarrama, ~55 km NW",
    40.7833,
    -4.0167,
    [20.3, 21.3],
    "indicative",
    null,
  ],
  ["Cévennes / Mont Lozère", 44.4236, 3.7361, [21.4, 21.8], "indicative", null],
  [
    "Cherry Springs State Park",
    41.6647,
    -77.8161,
    [21.5, 21.8],
    "indicative",
    null,
  ],
  ["Mid-Atlantic, open ocean", 30.0, -40.0, [22.0, 22.0], "indicative", null],
  ["Sahara, Libyan desert", 24.0, 20.0, null, "indicative", null],
  ["Mauna Kea", 19.8207, -155.4681, null, "indicative", null],
  ["Kiruna, arctic mining town", 67.8558, 20.2253, null, "indicative", null],
];

async function loadRaster(directory) {
  const root = resolve(
    directory ||
      process.env.ASTRO_PORTAL_SKY_QUALITY_RASTER_DIR ||
      join(process.cwd(), "static-data", "sky-quality"),
  );
  const manifest = JSON.parse(
    await readFile(join(root, "manifest.json"), "utf8"),
  );
  const data = await readFile(join(root, manifest.file || "raster.bin"));
  return {
    manifest,
    grid: {
      cellSizeDegrees: manifest.grid.cellSizeDegrees,
      data,
      height: manifest.grid.height,
      north: manifest.grid.north,
      west: manifest.grid.west,
      width: manifest.grid.width,
    },
  };
}

function estimate(grid, latitude, longitude) {
  const refined = sampleSkyQualityRadiance(grid, latitude, longitude);
  const radiance =
    refined === null
      ? nearestSkyQualityRadiance(grid, latitude, longitude)
      : refined;
  const sqm = sqmFromViirsRadiance(radiance);
  return { radiance, sqm, bortle: bortleFromSqm(sqm) };
}

async function main() {
  const { manifest, grid } = await loadRaster(options.get("--raster-dir"));
  const transect = transectDistancesKm.map((distanceKm) => {
    const point = destination(
      madrid.latitude,
      madrid.longitude,
      315,
      distanceKm,
    );
    return {
      distanceKm,
      ...point,
      ...estimate(grid, point.latitude, point.longitude),
    };
  });
  const controls = controlPoints.map(
    ([name, latitude, longitude, expected, kind, source]) => ({
      name,
      latitude,
      longitude,
      expected,
      kind,
      source,
      ...estimate(grid, latitude, longitude),
    }),
  );

  if (options.get("--json")) {
    process.stdout.write(
      `${JSON.stringify({ manifest, transect, controls }, null, 2)}\n`,
    );
    return;
  }

  const number = (value, digits) =>
    value === null || value === undefined ? "—" : value.toFixed(digits);
  process.stdout.write(
    `Raster: ${manifest.grid.width} × ${manifest.grid.height}, ` +
      `${manifest.method || "?"}, ${manifest.source ? "" : ""}` +
      `${manifest.product} ${manifest.year}\n\n`,
  );
  process.stdout.write(
    "Transect — Madrid centre, azimuth 315°\n" +
      "  km  latitude  longitude   radiance     SQM  Bortle\n",
  );
  for (const row of transect)
    process.stdout.write(
      `${String(row.distanceKm).padStart(5)}  ${row.latitude.toFixed(4).padStart(8)}  ` +
        `${row.longitude.toFixed(4).padStart(9)}  ${number(row.radiance, 4).padStart(9)}  ` +
        `${number(row.sqm, 2).padStart(6)}  ${String(row.bortle).padStart(6)}\n`,
    );

  process.stdout.write("\nControl points\n");
  let outside = 0;
  let measuredOutside = 0;
  for (const row of controls) {
    let flag = "";
    if (row.expected && row.sqm !== null) {
      const [low, high] = row.expected;
      const miss =
        row.sqm < low ? low - row.sqm : row.sqm > high ? row.sqm - high : 0;
      if (miss > 0.5) {
        flag = ` OUT by ${miss.toFixed(2)} mag`;
        outside += 1;
        if (row.kind === "measured") measuredOutside += 1;
      } else if (miss > 0) flag = ` (${miss.toFixed(2)} mag outside)`;
    }
    process.stdout.write(
      `  ${row.name.padEnd(36)} ${row.kind.padEnd(10)} ` +
        `${number(row.radiance, 4).padStart(9)}  ` +
        `${number(row.sqm, 2).padStart(6)}  B${row.bortle}` +
        `${row.expected ? `  expect ${row.expected[0]}–${row.expected[1]}` : ""}` +
        `${flag}\n`,
    );
  }
  process.stdout.write(
    `\n${outside} control point(s) more than 0.5 mag outside their range ` +
      `(${measuredOutside} of them measured).\n`,
  );
  for (const row of controls)
    if (row.source) process.stdout.write(`  ${row.name}: ${row.source}\n`);

  const near = transect.filter(
    (row) => row.distanceKm <= 100 && row.bortle <= 2,
  );
  if (near.length)
    process.stdout.write(
      `FAIL: ${near.length} transect point(s) within 100 km of Madrid read ` +
        "Bortle 1–2.\n",
    );
  else
    process.stdout.write(
      "OK: no transect point within 100 km of Madrid reads Bortle 1–2.\n",
    );
}

await main();
