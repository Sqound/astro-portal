#!/usr/bin/env node
/*
 * Validate the directional sky-brightness ESTIMATE
 * (../src/sky-quality-direction.js) before anything is drawn with
 * it.
 *
 *   node packages/portal/scripts/validate-sky-direction.mjs \
 *     --raster <sky-quality directory> --sites <sites.json> --out <directory> \
 *     [--nps <nsdmap.geojson>] [--layer-height <km>] [--optical-depth <τ>]
 *
 * Reads a prepared raster (docs/SKY_QUALITY_RASTER.md) and a sites file, and
 * writes into --out:
 *
 *   validation.md    the table (site, zenith SQM, brightest azimuth at 10°,
 *                    expected bearing, difference, horizon-to-zenith contrast)
 *                    and the verdict of each criterion V1–V5;
 *   validation.json  the same, as data;
 *   site-<id>.html   one polar plot per site, 400 × 400, to capture as PNG.
 *
 * Criteria (from the plan that introduced this estimate):
 *   V1  zenith = the service's single-point estimate ± 0.01 mag, every site;
 *   V2  synthetic single source: brightest azimuth at 10° within ± 5°, and
 *       fading with altitude in that azimuth;
 *   V3  synthetic uniform field: no azimuth differs by more than 0.01 mag;
 *   V4  real raster: brightest azimuth at 10° within ± 15° of the expected
 *       bearing for at least 5 of the 6 city cases; each control within
 *       0.3 mag of its zenith at 30°;
 *   V5  (informative, optional) against the National Park Service all-sky
 *       photometry (--nps, the file calibrate-sky-quality.mjs reads): the
 *       model's hemisphere-mean artificial luminance against the measured
 *       MEANLUM_ART_POS, correlation and median ratio.
 *
 * Sites are identified by coordinates rounded to 0.1° and a neutral
 * description, never by a name. The file is
 *   { "sites": [ { "id", "kind": "city" | "between" | "control",
 *                  "description", "latitude", "longitude",
 *                  "references": [ { "description", "latitude",
 *                                    "longitude" } ] } ] }
 * where a city case has one reference (the city centre, rounded), a
 * "between" case two, a control none. Needs no network.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  sampleSkyQualityRadiance,
  nearestSkyQualityRadiance,
  sqmFromViirsRadiance,
  skyQualityCalibrationAt,
} from "../src/sky-quality.js";
import {
  skyBrightnessByDirection,
  skyBrightnessDirectionDefaults,
  skyQualityWindow,
  skyQualityWindowFromGrid,
} from "../src/sky-quality-direction.js";
import {
  createPlannerSkyQualityCache,
  loadSkyQualityRaster,
} from "../src/planner/sky-quality.server.js";

const radians = Math.PI / 180;
const earthRadiusKm = 6371;
const naturalSkyLuminance = 0.171168465;
const luminanceZeroPoint = 108000000;

// ── Pure helpers ────────

/** Initial great-circle bearing from `from` to `to`, degrees in [0, 360). */
export function initialBearing(from, to) {
  const phi1 = from.latitude * radians;
  const phi2 = to.latitude * radians;
  const deltaLambda = (to.longitude - from.longitude) * radians;
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  return (Math.atan2(y, x) / radians + 360) % 360;
}

export function distanceKm(from, to) {
  const phi1 = from.latitude * radians;
  const phi2 = to.latitude * radians;
  const a =
    Math.sin((phi2 - phi1) / 2) ** 2 +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(((to.longitude - from.longitude) * radians) / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

export function angularDifference(a, b) {
  const difference = Math.abs(a - b) % 360;
  return difference > 180 ? 360 - difference : difference;
}

/** Azimuth (degrees) of the brightest (lowest SQM) cell of one row. */
export function brightestAzimuth(result, altitude) {
  const row = result.sqm[result.altitudes.indexOf(altitude)];
  let best = 0;
  for (let index = 1; index < row.length; index += 1)
    if (row[index] < row[best]) best = index;
  return best * result.azimuthStepDegrees;
}

/** Artificial luminance (mcd/m²) behind an SQM value, natural sky removed. */
export function artificialLuminance(sqm) {
  return Math.max(
    0,
    luminanceZeroPoint * 10 ** (-0.4 * sqm) - naturalSkyLuminance,
  );
}

/** Solid-angle mean of the artificial luminance over the hemisphere
 * (trapezoid in altitude, weight cos h), mcd/m². */
export function hemisphereMeanArtificial(result) {
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < result.altitudes.length - 1; i += 1) {
    const low = result.altitudes[i];
    const high = result.altitudes[i + 1];
    const mean = (row) =>
      row.reduce((total, value) => total + artificialLuminance(value), 0) /
      row.length;
    const band = Math.sin(high * radians) - Math.sin(low * radians);
    sum += band * ((mean(result.sqm[i]) + mean(result.sqm[i + 1])) / 2);
    weight += band;
  }
  return weight > 0 ? sum / weight : 0;
}

function pearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Single-hue warm ramp (dark natural sky → strong artificial glow), stepped
// by magnitude; the lightest step is the natural sky and recedes.
const ramp = [
  { from: 21.5, colour: "#f6efe9", label: "≥ 21.5" },
  { from: 20.5, colour: "#f6d2bb", label: "20.5" },
  { from: 19.5, colour: "#f1ab84", label: "19.5" },
  { from: 18.5, colour: "#eb7d4a", label: "18.5" },
  { from: 17.5, colour: "#c4531f", label: "17.5" },
  { from: -Infinity, colour: "#7f3210", label: "< 17.5" },
];
const colourFor = (sqm) => ramp.find((step) => sqm >= step.from).colour;

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

/**
 * A 400 × 400 polar plot of one site, as a standalone HTML page: north up,
 * east right (a map seen from above), the horizon on the rim, the zenith in
 * the centre; one annular sector per (altitude band, azimuth) coloured by
 * SQM; a solid line at the brightest azimuth at 10°, a dashed one at each
 * expected bearing.
 */
export function polarPlotHtml({ site, result, brightest10, expected }) {
  const size = 400;
  const centre = { x: 200, y: 216 };
  const radius = 132;
  const altitudes = result.altitudes;
  const step = result.azimuthStepDegrees;
  const toRadius = (altitude) => radius * (1 - altitude / 90);
  const point = (azimuth, r) => ({
    x: centre.x + r * Math.sin(azimuth * radians),
    y: centre.y - r * Math.cos(azimuth * radians),
  });
  const sectors = [];
  for (let i = 0; i < altitudes.length - 1; i += 1) {
    const outer = toRadius(altitudes[i]);
    const inner = toRadius(altitudes[i + 1]);
    result.sqm[i].forEach((sqm, j) => {
      const start = j * step - step / 2;
      const end = j * step + step / 2;
      const a = point(start, outer);
      const b = point(end, outer);
      const c = point(end, inner);
      const d = point(start, inner);
      sectors.push(
        `<path d="M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${outer} ${outer} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)} L${c.x.toFixed(2)} ${c.y.toFixed(2)} A${inner} ${inner} 0 0 0 ${d.x.toFixed(2)} ${d.y.toFixed(2)} Z" fill="${colourFor(sqm)}" stroke="${colourFor(sqm)}" stroke-width="0.6"><title>${altitudes[i]}°, ${j * step}°: ${sqm}</title></path>`,
      );
    });
  }
  const rings = [30, 60]
    .map(
      (altitude) =>
        `<circle cx="${centre.x}" cy="${centre.y}" r="${toRadius(altitude)}" fill="none" stroke="var(--grid)" stroke-width="1"/>`,
    )
    .join("");
  const line = (azimuth, dashed) => {
    const end = point(azimuth, radius + 10);
    return `<line x1="${centre.x}" y1="${centre.y}" x2="${end.x.toFixed(2)}" y2="${end.y.toFixed(2)}" stroke="var(--ink)" stroke-width="2"${dashed ? ' stroke-dasharray="5 4"' : ""}/>`;
  };
  const compass = [
    ["N", 0],
    ["E", 90],
    ["S", 180],
    ["W", 270],
  ]
    .map(([label, azimuth]) => {
      const p = point(azimuth, radius + 14);
      return `<text x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" text-anchor="middle" class="axis">${label}</text>`;
    })
    .join("");
  const legend = ramp
    .map(
      (step, index) =>
        `<rect x="${12 + index * 62}" y="386" width="60" height="8" rx="2" fill="${step.colour}"/><text x="${12 + index * 62}" y="382" class="legend">${step.label}</text>`,
    )
    .join("");
  const expectedText = expected.length
    ? `expected ${expected.map((value) => `${value.toFixed(0)}°`).join(" / ")} (dashed)`
    : "no expected dome";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Site ${site.id} — directional estimate</title>
<style>
:root { --surface: #ffffff; --ink: #1f1f1d; --muted: #6b6a66; --grid: rgba(31,31,29,0.25); }
html, body { margin: 0; width: ${size}px; height: ${size}px; overflow: hidden; background: var(--surface); font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }
text { fill: var(--ink); }
.title { font-size: 12px; font-weight: 600; }
.sub, .legend { font-size: 10px; fill: var(--muted); }
.axis { font-size: 11px; font-weight: 600; }
</style></head><body>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
<text x="12" y="16" class="title">Site ${site.id} · ${site.latitude.toFixed(1)}°, ${site.longitude.toFixed(1)}° · estimate</text>
<text x="12" y="30" class="sub">${escapeHtml(site.description)}</text>
<text x="12" y="44" class="sub">zenith ${result.zenithSqm} · brightest at 10°: ${brightest10}° (solid) · ${expectedText}</text>
${sectors.join("")}
${rings}
<circle cx="${centre.x}" cy="${centre.y}" r="${radius}" fill="none" stroke="var(--grid)" stroke-width="1"/>
${expected.map((value) => line(value, true)).join("")}
${line(brightest10, false)}
${compass}
<text x="12" y="368" class="legend">SQM, mag/arcsec²</text>
${legend}
</svg></body></html>
`;
}

// ── The run ──────────────────────────────────────────────────────────────

function parseOptions(argv) {
  const options = new Map();
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      options.set(argument, next);
      index += 1;
    } else options.set(argument, true);
  }
  return options;
}

const kilometresPerDegree = (Math.PI * earthRadiusKm) / 180;
function offsetBy(origin, northKm, eastKm) {
  return {
    latitude: origin.latitude + northKm / kilometresPerDegree,
    longitude:
      origin.longitude +
      eastKm / (kilometresPerDegree * Math.cos(origin.latitude * radians)),
  };
}

function syntheticChecks(parameters) {
  const place = { latitude: 45, longitude: -30 };
  const window = (sample) =>
    skyQualityWindow({ sample, ...place, radiusKm: 150, cellDegrees: 0.05 });
  const single = (northKm, eastKm, radiance, bearing) => {
    const source = offsetBy(place, northKm, eastKm);
    const result = skyBrightnessByDirection({
      ...place,
      window: window((latitude, longitude) =>
        Math.abs(latitude - source.latitude) <= 0.025 &&
        Math.abs(longitude - source.longitude) <= 0.025
          ? radiance
          : 0,
      ),
      ...parameters,
    });
    const azimuth = brightestAzimuth(result, 10);
    const column = azimuth / result.azimuthStepDegrees;
    const profile = result.sqm.map((row) => row[column]);
    const peak = profile.indexOf(Math.min(...profile));
    let fadesAbovePeak = true;
    for (let index = peak + 1; index < profile.length; index += 1)
      if (profile[index] < profile[index - 1]) fadesAbovePeak = false;
    return {
      source: `${northKm ? `${northKm} km north` : `${eastKm} km east`}`,
      brightestAzimuth10: azimuth,
      difference: angularDifference(azimuth, bearing),
      peakAltitude: result.altitudes[peak],
      strictlyFromHorizon: peak === 0 && fadesAbovePeak,
      fadesAbovePeak,
      profile,
    };
  };
  const uniform = skyBrightnessByDirection({
    ...place,
    window: window(() => 3),
    ...parameters,
  });
  const spread = Math.max(
    ...uniform.sqm.map((row) => Math.max(...row) - Math.min(...row)),
  );
  const near = single(30, 0, 200, 0);
  const far = single(0, 80, 1500, 90);
  return {
    v2: {
      near,
      far,
      pass:
        near.difference <= 5 &&
        near.strictlyFromHorizon &&
        far.difference <= 5 &&
        far.fadesAbovePeak,
    },
    v3: { spread: Number(spread.toFixed(4)), pass: spread <= 0.01 },
  };
}

async function nationalParkServiceCheck(path, grid, parameters) {
  const collection = JSON.parse(await readFile(path, "utf8"));
  const number = (value) => {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const rows = [];
  for (const feature of collection?.features || []) {
    const properties = feature?.properties || {};
    const coordinates = feature?.geometry?.coordinates;
    const measuredMean = number(properties.MEANLUM_ART_POS);
    const measuredZenith = number(properties.ZENITH_ART);
    if (!Array.isArray(coordinates) || measuredMean === null) continue;
    const latitude = Number(coordinates[1]);
    const longitude = Number(coordinates[0]);
    const window = skyQualityWindowFromGrid(grid, latitude, longitude);
    const result = skyBrightnessByDirection({
      latitude,
      longitude,
      window,
      ...parameters,
      azimuthStepDegrees: 10,
      altitudes: Array.from({ length: 19 }, (_, index) => index * 5),
    });
    if (!result) continue;
    rows.push({
      measuredMean: measuredMean / 1000,
      measuredZenith: measuredZenith === null ? null : measuredZenith / 1000,
      modelMean: hemisphereMeanArtificial(result),
      modelZenith: artificialLuminance(result.zenithSqm),
    });
  }
  // Below ~0.02 mcd/m² (12% of the natural sky) the 0.01-mag rounding of
  // the model and the measurement floor dominate: only lit sites compare.
  const threshold = 0.02;
  const lit = rows.filter(
    (row) => row.measuredMean >= threshold && row.modelMean >= threshold,
  );
  const shape = lit.filter(
    (row) => row.measuredZenith >= threshold && row.modelZenith >= threshold,
  );
  return {
    sites: rows.length,
    compared: lit.length,
    thresholdMcd: threshold,
    correlationLog: Number(
      pearson(
        lit.map((row) => Math.log10(row.modelMean)),
        lit.map((row) => Math.log10(row.measuredMean)),
      ).toFixed(3),
    ),
    medianRatioMean: Number(
      median(lit.map((row) => row.modelMean / row.measuredMean)).toFixed(3),
    ),
    medianRatioZenith: Number(
      median(shape.map((row) => row.modelZenith / row.measuredZenith)).toFixed(
        3,
      ),
    ),
    shapeSites: shape.length,
    medianMeanToZenithModel: Number(
      median(shape.map((row) => row.modelMean / row.modelZenith)).toFixed(3),
    ),
    medianMeanToZenithMeasured: Number(
      median(shape.map((row) => row.measuredMean / row.measuredZenith)).toFixed(
        3,
      ),
    ),
  };
}

function markdown(report) {
  const lines = [];
  const p = report.parameters;
  lines.push(
    `# Directional sky brightness — validation (estimate)`,
    "",
    `Model \`${report.model}\`, layer height ${p.layerHeightKm} km, optical depth ${p.opticalDepth}, maximum distance ${p.maximumDistanceKm} km; raster ${report.raster}.`,
    "",
    "| Site | Kind | Zenith SQM | Single point | Brightest az. at 10° | Expected bearing | Difference | Horizon-to-zenith contrast | At 30°, max gap to zenith |",
    "| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const row of report.sites)
    lines.push(
      `| ${row.id} | ${row.kind} | ${row.zenithSqm} | ${row.singlePointSqm} | ${row.brightestAzimuth10}° | ${row.expected.length ? row.expected.map((value) => `${value.bearing}° (${value.distanceKm} km)`).join(" / ") : "—"} | ${row.difference === null ? "—" : `${row.difference}°`} | ${row.contrast} mag | ${row.gap30} mag |`,
    );
  lines.push("", "| Criterion | Result | Pass |", "| --- | --- | --- |");
  for (const [name, value] of Object.entries(report.criteria))
    lines.push(
      `| ${name} | ${escapeHtml(value.summary)} | ${value.pass === null ? "informative" : value.pass ? "yes" : "**no**"} |`,
    );
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const options = parseOptions(process.argv);
  const rasterDirectory = options.get("--raster");
  const sitesPath = options.get("--sites");
  const out = resolve(options.get("--out") || "build/v2-validate");
  if (typeof rasterDirectory !== "string" || typeof sitesPath !== "string") {
    console.error(
      "Usage: validate-sky-direction.mjs --raster <dir> --sites <file> --out <dir> [--nps <file>] [--layer-height <km>] [--optical-depth <τ>]",
    );
    process.exit(2);
  }
  const parameters = {
    layerHeightKm: Number(
      options.get("--layer-height") ??
        skyBrightnessDirectionDefaults.layerHeightKm,
    ),
    opticalDepth: Number(
      options.get("--optical-depth") ??
        skyBrightnessDirectionDefaults.opticalDepth,
    ),
    maximumDistanceKm: skyBrightnessDirectionDefaults.maximumDistanceKm,
  };
  const installed = await loadSkyQualityRaster(resolve(rasterDirectory));
  if (!installed) {
    console.error(`No usable raster in ${rasterDirectory}.`);
    process.exit(1);
  }
  const service = createPlannerSkyQualityCache({
    raster: async () => installed,
  });
  const { sites } = JSON.parse(await readFile(sitesPath, "utf8"));
  await mkdir(out, { recursive: true });

  const rows = [];
  for (const site of sites) {
    const window = skyQualityWindowFromGrid(
      installed.grid,
      site.latitude,
      site.longitude,
    );
    const result = skyBrightnessByDirection({
      latitude: site.latitude,
      longitude: site.longitude,
      window,
      ...parameters,
    });
    const served = await service({
      latitude: site.latitude,
      longitude: site.longitude,
    });
    const direct = sqmFromViirsRadiance(
      sampleSkyQualityRadiance(installed.grid, site.latitude, site.longitude) ??
        nearestSkyQualityRadiance(
          installed.grid,
          site.latitude,
          site.longitude,
        ),
      site.latitude,
      site.longitude,
    );
    const brightest10 = brightestAzimuth(result, 10);
    const expected = (site.references || []).map((reference) => ({
      bearing: Number(initialBearing(site, reference).toFixed(0)),
      distanceKm: Number(distanceKm(site, reference).toFixed(0)),
    }));
    const difference = expected.length
      ? Math.min(
          ...expected.map((value) =>
            angularDifference(brightest10, value.bearing),
          ),
        )
      : null;
    const horizon = Math.min(...result.sqm[0]);
    const row30 = result.sqm[result.altitudes.indexOf(30)];
    const gap30 = Math.max(
      ...row30.map((value) => Math.abs(value - result.zenithSqm)),
    );
    rows.push({
      id: site.id,
      kind: site.kind,
      latitude: site.latitude,
      longitude: site.longitude,
      calibration: skyQualityCalibrationAt(site.latitude, site.longitude).id,
      zenithSqm: result.zenithSqm,
      singlePointSqm: served.sqm,
      directSqm: direct,
      brightestAzimuth10: brightest10,
      brightest10Sqm: Math.min(...result.sqm[result.altitudes.indexOf(10)]),
      expected,
      // For a "between" site, the difference to the brighter-looking
      // reference is informative; only city cases count for V4.
      difference,
      contrast: Number((result.zenithSqm - horizon).toFixed(2)),
      gap30: Number(gap30.toFixed(2)),
    });
    await writeFile(
      join(out, `site-${site.id}.html`),
      polarPlotHtml({
        site,
        result,
        brightest10,
        expected: expected.map((value) => value.bearing),
      }),
    );
  }

  const cities = rows.filter((row) => row.kind === "city");
  const controls = rows.filter((row) => row.kind === "control");
  const v1Gap = Math.max(
    ...rows.map((row) =>
      Math.max(
        Math.abs(row.zenithSqm - row.singlePointSqm),
        Math.abs(row.zenithSqm - row.directSqm),
      ),
    ),
  );
  const citiesWithin = cities.filter((row) => row.difference <= 15).length;
  const controlGap = Math.max(...controls.map((row) => row.gap30));
  const synthetic = syntheticChecks(parameters);
  const criteria = {
    V1: {
      summary: `largest gap between the zenith and the single-point estimate: ${v1Gap.toFixed(2)} mag over ${rows.length} sites`,
      pass: v1Gap <= 0.01,
    },
    V2: {
      summary: `source 30 km north: brightest at ${synthetic.v2.near.brightestAzimuth10}° at 10°, fading from the horizon upwards: ${synthetic.v2.near.strictlyFromHorizon ? "yes" : "no"}; source 80 km east: brightest at ${synthetic.v2.far.brightestAzimuth10}°, peak at ${synthetic.v2.far.peakAltitude}°, fading above it: ${synthetic.v2.far.fadesAbovePeak ? "yes" : "no"}`,
      pass: synthetic.v2.pass,
    },
    V3: {
      summary: `uniform field: largest spread across azimuths ${synthetic.v3.spread} mag`,
      pass: synthetic.v3.pass,
    },
    V4: {
      summary: `${citiesWithin} of ${cities.length} city cases within ± 15° (differences ${cities.map((row) => `${row.difference}°`).join(", ")}); controls at 30°: largest gap to zenith ${controlGap.toFixed(2)} mag`,
      pass: citiesWithin >= 5 && controlGap <= 0.3,
    },
  };
  let nps = null;
  if (typeof options.get("--nps") === "string") {
    nps = await nationalParkServiceCheck(
      options.get("--nps"),
      installed.grid,
      parameters,
    );
    criteria.V5 = {
      summary: `${nps.compared} lit sites of ${nps.sites}: log correlation of the hemisphere-mean artificial luminance ${nps.correlationLog}, median ratio model/measured ${nps.medianRatioMean} (zenith alone: ${nps.medianRatioZenith}); mean-to-zenith ratio, median, model ${nps.medianMeanToZenithModel} vs measured ${nps.medianMeanToZenithMeasured} (${nps.shapeSites} sites)`,
      pass: null,
    };
  } else
    criteria.V5 = {
      summary: "not run: no --nps file given",
      pass: null,
    };

  const report = {
    model: "line-of-sight-v1",
    estimate: true,
    raster: `${installed.year} composite, ${installed.grid.width} × ${installed.grid.height}`,
    parameters,
    sites: rows,
    synthetic,
    nps,
    criteria,
  };
  await writeFile(
    join(out, "validation.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(join(out, "validation.md"), markdown(report));
  console.log(markdown(report));
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
