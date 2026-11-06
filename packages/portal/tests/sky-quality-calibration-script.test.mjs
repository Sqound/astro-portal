import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assessRegionCampaignLicense,
  assessRegionFit,
  bootstrapScaleInterval,
  downloadMeasurementSets,
  globeAtNightDocumentIds,
  readRegionCampaign,
  regionAcceptance,
  residualStatistics,
} from "../scripts/calibrate-sky-quality.mjs";
import { skyQualityLuminancePerRadiance } from "portal/sky-quality.js";
import {
  syntheticConstants,
  writeSyntheticCalibrationSet,
} from "./helpers/synthetic-calibration.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const script = join(packageRoot, "scripts", "calibrate-sky-quality.mjs");
const golden = (name) =>
  readFile(
    join(packageRoot, "tests", "fixtures", "calibration-golden", name),
    "utf8",
  );

// No test here reaches the network: the script is given files on disk and no
// `--download`.
async function withSet(callback) {
  const directory = await mkdtemp(join(tmpdir(), "sky-quality-calibration-"));
  try {
    const set = await writeSyntheticCalibrationSet(directory);
    const base = [
      "--raster-dir",
      set.rasterDirectory,
      "--input",
      set.nps,
      "--input",
      set.gan,
    ];
    const run = (...extra) =>
      execFileSync(process.execPath, [script, ...base, ...extra], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    return await callback({ set, run });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const rounded = (value) =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "number" ? Number(item.toPrecision(9)) : item,
    ),
  );

test("the global fit and the Japan fit print exactly what they printed before the generic input existed", async () => {
  await withSet(async ({ set, run }) => {
    assert.equal(run(), await golden("global.txt"));
    assert.deepEqual(
      rounded(JSON.parse(run("--json"))),
      rounded(JSON.parse(await golden("global.json"))),
    );
    const japan = ["--input-japan", set.japan, "--region", "japan"];
    assert.equal(run(...japan), await golden("japan.txt"));
    assert.deepEqual(
      rounded(JSON.parse(run(...japan, "--json"))),
      rounded(JSON.parse(await golden("japan.json"))),
    );
  });
});

test("--input-region is read, filtered, and fitted for its region only", async () => {
  await withSet(async ({ set, run }) => {
    const report = JSON.parse(
      run(
        "--input-region",
        set.campaign,
        "--region",
        "candidate",
        "--region-polygon",
        set.candidate,
        "--json",
      ),
    );
    // 8 cells x 4 readings kept; the too-scattered row and the 2012 row
    // (before --from-year 2019) are dropped by the documented filters.
    assert.equal(report.regionInputFiles.length, 1);
    assert.equal(report.regionInputFiles[0].measurements, 32);
    assert.equal(report.regionInputFiles[0].license, "CC BY 4.0");
    assert.equal(report.region.inputs.measurements, 32);
    assert.equal(report.region.inputs.cells, 8);
    assert.ok(
      Math.abs(report.region.inputs.fit.scale - syntheticConstants.candidate) <
        0.01,
      `fitted ${report.region.inputs.fit.scale}`,
    );
    // The text report names the source and keeps the global figures intact.
    const text = run(
      "--input-region",
      set.campaign,
      "--region",
      "candidate",
      "--region-polygon",
      set.candidate,
    );
    assert.match(text, /national campaign \(--input-region\)/);
    assert.match(text, /luminancePerRadiance = 0\.55/);
  });
});

test("an input-region campaign never moves the global fit", async () => {
  await withSet(async ({ set, run }) => {
    const plain = JSON.parse(run("--json"));
    const withCampaign = JSON.parse(
      run("--input-region", set.campaign, "--json"),
    );
    assert.deepEqual(withCampaign.fit, plain.fit);
    assert.deepEqual(withCampaign.perSource, plain.perSource);
    assert.equal(withCampaign.globeAtNightCells, plain.globeAtNightCells);
    // Without --region it is only counted, not fitted anywhere.
    assert.equal(withCampaign.region, null);
  });
});

test("a campaign under ODbL, with no licence, or from STARS4ALL / TESS is refused as an input", async () => {
  await withSet(async ({ set, run }) => {
    assert.throws(
      () => run("--input-region", set.campaignOdbl),
      (error) => /refused/.test(error.stderr) && /ODbL/.test(error.stderr),
    );
    assert.throws(
      () => run("--input-region", set.campaignUnlicensed),
      (error) => /no "# license:" line/.test(error.stderr),
    );
  });
  for (const license of [
    "ODbL-1.0",
    "CC BY-NC 4.0",
    "CC BY-SA 4.0",
    "CC BY-NC-SA 4.0",
    "all rights reserved",
    "unknown",
    "",
  ])
    assert.equal(assessRegionCampaignLicense(license).ok, false, license);
  assert.equal(
    assessRegionCampaignLicense("CC BY 4.0", "STARS4ALL TESS-W network").ok,
    false,
  );
  for (const license of [
    "CC0 1.0",
    "CC BY 4.0",
    "CC-BY-4.0",
    "public domain",
    "PDL 1.0",
    "Open Government Licence v3.0",
    "written agreement: only a fitted constant is shipped",
  ])
    assert.equal(assessRegionCampaignLicense(license).ok, true, license);
});

test("readRegionCampaign documents its CSV shape and refuses a file that does not follow it", () => {
  const header = "# source: a campaign\n# license: CC0\n";
  const read = (body, from = 2019, max = 0.2, options) =>
    readRegionCampaign(header + body, from, max, options);
  // Date as a bare year, optional scatter column, empty scatter keeps the row.
  const rows = read(
    "latitude,longitude,magnitude,date\n46.5,8.0,20.3,2023\n46.6,8.1,19.9,2022-05-01\n",
  ).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    latitude: 46.5,
    longitude: 8,
    source: "region-campaign",
    sqm: 20.3,
    year: 2023,
  });
  assert.equal(
    read("latitude,longitude,magnitude,date,scatter\n46.5,8.0,20.3,2023,\n")
      .rows.length,
    1,
  );
  // Filters: magnitude window, position, year, scatter.
  const body = (line) => `latitude,longitude,magnitude,date,scatter\n${line}\n`;
  assert.equal(read(body("46.5,8.0,13.9,2023,0.1")).rows.length, 0);
  assert.equal(read(body("46.5,8.0,22.6,2023,0.1")).rows.length, 0);
  assert.equal(read(body("96.5,8.0,20.0,2023,0.1")).rows.length, 0);
  assert.equal(read(body("46.5,8.0,20.0,2018,0.1")).rows.length, 0);
  assert.equal(read(body("46.5,8.0,20.0,2018,0.1"), 2018).rows.length, 1);
  assert.equal(read(body("46.5,8.0,20.0,2023,0.3")).rows.length, 0);
  assert.equal(read(body("46.5,8.0,20.0,2023,0.3"), 2019, 0.5).rows.length, 1);
  // A header without the date, or without a position, is not the shape.
  assert.throws(
    () => read("latitude,longitude,magnitude\n46.5,8.0,20.0\n"),
    /needs latitude, longitude, magnitude and date/,
  );
  // The licence gate is the only thing --validate-region switches off.
  const odbl =
    "# source: x\n# license: ODbL\nlatitude,longitude,magnitude,date\n46.5,8.0,20.0,2023\n";
  assert.throws(() => readRegionCampaign(odbl, 2019), /refused/);
  assert.equal(
    readRegionCampaign(odbl, 2019, 0.2, { requireLicense: false }).rows.length,
    1,
  );
});

test("--validate-region compares the constants with a validation-only set and fits nothing", async () => {
  await withSet(async ({ set, run }) => {
    const plain = JSON.parse(run("--json"));
    const report = JSON.parse(
      run("--validate-region", set.campaignOdbl, "--json"),
    );
    // An ODbL file is accepted here, and the global fit does not move.
    assert.deepEqual(report.fit, plain.fit);
    assert.equal(report.validation.length, 1);
    assert.equal(report.validation[0].license, "ODbL-1.0");
    assert.equal(report.validation[0].cells, 8);
    assert.ok(report.validation[0].atCompiledIn.bias > 0.3);
    assert.equal(report.regionInputFiles, undefined);
    const text = run("--validate-region", set.campaignOdbl);
    assert.match(
      text,
      /validation only #1 \(ODbL-1\.0; never fitted, never shipped\)/,
    );
  });
});

test("the bootstrap interval is deterministic and the acceptance rule needs cells, an interval clear of the global constant, and a better RMS", () => {
  const sites = Array.from({ length: 40 }, (_, index) => ({
    artificial: 0.5 + index * 0.4,
    propagated: (0.5 + index * 0.4) / 0.6 + ((index % 5) - 2) * 0.03,
  }));
  const first = bootstrapScaleInterval(sites, 100);
  assert.deepEqual(first, bootstrapScaleInterval(sites, 100));
  assert.ok(first.low <= first.high);
  assert.equal(bootstrapScaleInterval(sites.slice(0, 3), 100), null);

  const fit = { sites: 40, rmsMagnitudes: 0.3, scale: 0.6, bias: 0 };
  const clear = { low: 0.5, high: 0.7 };
  assert.equal(
    assessRegionFit({ fit, interval: clear, rmsAtCompiledIn: 0.8 }).credible,
    true,
  );
  const reasons = (input) => assessRegionFit(input).reasons.join(" | ");
  assert.match(
    reasons({
      fit: { ...fit, sites: 12 },
      interval: clear,
      rmsAtCompiledIn: 0.8,
    }),
    /only 12 cells/,
  );
  assert.match(
    reasons({ fit, interval: { low: 0.25, high: 0.34 }, rmsAtCompiledIn: 0.8 }),
    /contains the global constant/,
  );
  assert.match(
    reasons({ fit, interval: clear, rmsAtCompiledIn: 0.3 }),
    /no better than the global constant/,
  );
  assert.match(
    reasons({ fit, interval: null, rmsAtCompiledIn: 0.8 }),
    /--bootstrap/,
  );
  assert.equal(
    assessRegionFit({
      fit: { ...fit, sites: 40 },
      interval: clear,
      rmsAtCompiledIn: 0.8,
    }).thin,
    true,
  );
  assert.equal(regionAcceptance.minimumCells, 30);
  assert.ok(
    residualStatistics(
      [{ artificial: 1, propagated: 1 / skyQualityLuminancePerRadiance }],
      skyQualityLuminancePerRadiance,
    ).rmsMagnitudes < 1e-9,
  );
});

test("--bootstrap prints the interval, the global constant's RMS on the same cells and a verdict", async () => {
  await withSet(async ({ set, run }) => {
    const common = [
      "--input-region",
      set.campaign,
      "--region",
      "candidate",
      "--region-polygon",
      set.candidate,
    ];
    const text = run(...common, "--bootstrap", "100");
    assert.match(text, /95 % interval 0\.5\d\d–0\.5\d\d \(100 draws\)/);
    assert.match(text, /verdict: NOT credible — only 8 cells/);
    const json = JSON.parse(run(...common, "--bootstrap", "100", "--json"));
    assert.equal(json.region.checks.inputs.verdict.credible, false);
    assert.ok(json.region.checks.inputs.atCompiledIn.bias > 0.3);
    // Without the flag, no check at all.
    assert.equal(JSON.parse(run(...common, "--json")).region.checks, undefined);
  });
});

test("a candidate polygon needs a name, and a download defaults to the newest year the id table knows", async () => {
  await withSet(async ({ set, run }) => {
    assert.throws(
      () => run("--region-polygon", set.candidate),
      (error) => /needs --region/.test(error.stderr),
    );
  });
  const newest = Math.max(...Object.keys(globeAtNightDocumentIds).map(Number));
  const requested = [];
  const directory = await mkdtemp(join(tmpdir(), "sky-quality-download-"));
  try {
    await downloadMeasurementSets({
      workDirectory: directory,
      fromYear: newest - 1,
      fetchImpl: async (url) => {
        requested.push(url);
        return { ok: true, arrayBuffer: async () => Buffer.from("x") };
      },
      log: () => {},
    });
    assert.equal(requested.length, 3); // NPS + the last two years: no 404 on a year not published yet
    assert.ok(requested[2].endsWith(`GaN${newest}.csv`));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
