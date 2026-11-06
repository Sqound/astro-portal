import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { encodeSkyQualityRadiance } from "portal/sky-quality.js";

/**
 * A tiny, deterministic, fictional measurement set for the calibration
 * script's tests: a 1-degree raster, a few National Park Service-shaped
 * features, Globe at Night-shaped rows, rows in the Japanese campaign's export
 * shape and rows in the generic `--input-region` shape. Every reading is the
 * magnitude a chosen constant would give for the cell's radiance, plus a small
 * fixed wobble, so a fit has a known answer. Nothing here is a real
 * measurement and no test reaches the network.
 */
const cellSizeDegrees = 1;
const width = 360;
const height = 180;

const naturalSkyLuminance = 0.171168465;
const luminanceZeroPoint = 108000000;
const sqmFor = (artificial) =>
  -2.5 * Math.log10((artificial + naturalSkyLuminance) / luminanceZeroPoint);

/** Cell centres: `count` cells in a row-major block from (north, west). */
function block(north, west, rows, columns) {
  const cells = [];
  for (let row = 0; row < rows; row += 1)
    for (let column = 0; column < columns; column += 1)
      cells.push({
        latitude: north - row - 0.5,
        longitude: west + column + 0.5,
        index: cells.length,
      });
  return cells;
}

const radianceOf = (cell) => 0.4 + ((cell.index * 7) % 11) * 1.3;

export const syntheticCells = {
  // Globe at Night-shaped cells in a dry, fictional patch (global constant).
  global: block(45, -110, 3, 5),
  // Cells inside the `japan` polygon of the shipped table.
  japan: block(40, 136, 2, 4),
  // Cells in a fictional candidate region that is not in the shipped table.
  candidate: block(50, 8, 2, 4),
};
export const syntheticConstants = { global: 0.3, japan: 0.8, candidate: 0.55 };
export const syntheticCandidateRing = [
  [50.2, 7.8],
  [50.2, 12.2],
  [47.8, 12.2],
  [47.8, 7.8],
];

const wobble = (index, reading) => (((index * 5 + reading * 3) % 7) - 3) * 0.02;

export async function writeSyntheticCalibrationSet(directory) {
  const rasterDirectory = join(directory, "raster");
  await mkdir(rasterDirectory, { recursive: true });
  const data = Buffer.alloc(width * height, encodeSkyQualityRadiance(0.03));
  const place = (cell) => {
    const row = Math.floor(90 - cell.latitude);
    const column = Math.floor(cell.longitude + 180);
    data[row * width + column] = encodeSkyQualityRadiance(radianceOf(cell));
  };
  for (const cells of Object.values(syntheticCells)) cells.forEach(place);
  await writeFile(join(rasterDirectory, "raster.bin"), data);
  await writeFile(
    join(rasterDirectory, "manifest.json"),
    JSON.stringify({
      file: "raster.bin",
      grid: {
        bytes: data.length,
        cellSizeDegrees,
        height,
        north: 90,
        populatedCells: data.length,
        west: -180,
        width,
      },
      product: "average_masked",
      year: 2025,
    }),
  );

  // The radiance the script will sample is the DECODED byte, so the readings
  // are derived from the same encode/decode round trip, not from the raw value.
  const decoded = (cell) => {
    const row = Math.floor(90 - cell.latitude);
    const column = Math.floor(cell.longitude + 180);
    return data[row * width + column];
  };
  const { decodeSkyQualityRadiance } = await import("portal/sky-quality.js");
  const magnitude = (cell, constant, reading) =>
    sqmFor(constant * decodeSkyQualityRadiance(decoded(cell))) +
    wobble(cell.index, reading);

  const nps = {
    type: "FeatureCollection",
    features: syntheticCells.global.slice(0, 5).map((cell) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [cell.longitude, cell.latitude] },
      properties: {
        MID_DATE_LMT: "6/15/2022",
        ZENITH_ART:
          (luminanceZeroPoint *
            10 ** (-0.4 * magnitude(cell, syntheticConstants.global, 0)) -
            naturalSkyLuminance) *
          1000,
      },
    })),
  };
  await writeFile(join(directory, "nps.geojson"), JSON.stringify(nps));

  const gan = [
    "Latitude,Longitude,UTDate,CloudCover,SQMReading",
    ...syntheticCells.global.flatMap((cell) =>
      [0, 1, 2, 3].map(
        (reading) =>
          `${cell.latitude},${cell.longitude},2023-0${reading + 1}-10,clear,` +
          magnitude(cell, syntheticConstants.global, reading).toFixed(2),
      ),
    ),
    // Filtered out: cloudy, and outside the plausible window.
    "45.5,-109.5,2023-05-10,cloudy,19.5",
    "45.5,-109.5,2023-05-11,clear,9.99",
    "",
  ].join("\n");
  await writeFile(join(directory, "gan.csv"), gan);

  const japan = {
    features: syntheticCells.japan.flatMap((cell) =>
      [0, 1, 2, 3].map((reading) => ({
        attributes: {
          latitude: cell.latitude,
          longitude: cell.longitude,
          magnitude: Number(
            magnitude(cell, syntheticConstants.japan, reading).toFixed(2),
          ),
          measure_season: reading % 2 ? 2 : 1,
          measure_year: 2022,
          variation: 0.1,
        },
        geometry: { x: cell.longitude, y: cell.latitude },
      })),
    ),
  };
  await writeFile(join(directory, "japan.json"), JSON.stringify(japan));

  const regionCsv = (license, extraHeader = "") =>
    [
      "# source: a fictional national campaign",
      `# license: ${license}`,
      ...(extraHeader ? [extraHeader] : []),
      "latitude,longitude,magnitude,date,scatter",
      ...syntheticCells.candidate.flatMap((cell) =>
        [0, 1, 2, 3].map(
          (reading) =>
            `${cell.latitude},${cell.longitude},` +
            `${magnitude(cell, syntheticConstants.candidate, reading).toFixed(2)},` +
            `2023-0${reading + 1}-10,0.1`,
        ),
      ),
      // Dropped by the documented filters: scatter too large, and too old.
      `${syntheticCells.candidate[0].latitude},${syntheticCells.candidate[0].longitude},19.9,2023-09-10,0.9`,
      `${syntheticCells.candidate[0].latitude},${syntheticCells.candidate[0].longitude},19.9,2012-09-10,0.1`,
      "",
    ].join("\n");
  await writeFile(join(directory, "campaign.csv"), regionCsv("CC BY 4.0"));
  await writeFile(join(directory, "campaign-odbl.csv"), regionCsv("ODbL-1.0"));
  await writeFile(
    join(directory, "campaign-unlicensed.csv"),
    regionCsv("CC BY 4.0").replace("# license: CC BY 4.0\n", ""),
  );
  await writeFile(
    join(directory, "candidate.json"),
    JSON.stringify({ polygons: [syntheticCandidateRing] }),
  );

  return {
    campaign: join(directory, "campaign.csv"),
    campaignOdbl: join(directory, "campaign-odbl.csv"),
    campaignUnlicensed: join(directory, "campaign-unlicensed.csv"),
    candidate: join(directory, "candidate.json"),
    gan: join(directory, "gan.csv"),
    japan: join(directory, "japan.json"),
    nps: join(directory, "nps.geojson"),
    rasterDirectory,
  };
}
