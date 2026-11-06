#!/usr/bin/env node
/*
 * Fit the single constant that turns the prepared raster's propagated
 * radiance into an artificial zenith luminance, and print the residuals.
 * Offline once the measurement files are on disk; it reads nothing else but
 * a prepared raster.
 *
 *   node packages/portal/scripts/calibrate-sky-quality.mjs \
 *     --raster-dir <dir> --input <file> [--input <file> …] \
 *     [--input-japan <file> …] [--calibrate-with-japan] \
 *     [--region <id>] [--region-polygon <file>] \
 *     [--input-region <file> …] [--validate-region <file> …] [--bootstrap <n>] \
 *     [--from-year 2019] [--min-readings 3] [--max-variation 0.2] [--json]
 *   node packages/portal/scripts/calibrate-sky-quality.mjs \
 *     --raster-dir <dir> --download [--work-dir <dir>]
 *
 * `--region <id>` restricts a SEPARATE fit to whatever readings fall inside
 * one entry of `skyQualityCalibrationRegions`
 * (../src/sky-quality.js) — same filters as the global fit above (year
 * window, aggregation, minimum readings per cell), just fewer sites. It
 * never changes the global fit printed above it. When `--input-japan` is
 * also given, the region fit uses the Japan star-watching campaign rows
 * restricted to the region (see below for why that source, unlike Globe at
 * Night, is fitted rather than merely reported for Japan); the campaign's
 * own Globe-at-Night-only fit, restricted the same way, is printed
 * alongside it for comparison. Without `--input-japan`, the region fit
 * falls back to Globe at Night alone. This is the whole mechanism for
 * adding a region: measurements under a compatible licence, `--region` to
 * get a number, a new table entry, regenerated fixtures — no
 * other code changes.
 *
 * ── Another country's campaign, and the acceptance rule (phase v3-33) ─────
 * `--input-region <file>` (repeatable) reads a national campaign under an
 * acceptable licence in ONE documented CSV shape, see
 * `readRegionCampaign` below and docs/SKY_QUALITY_RASTER.md: leading
 * `# source:` and `# license:` lines, then a header with `latitude`,
 * `longitude`, `magnitude` (mag/arcsec² at the zenith), `date` (ISO date or a
 * year) and an optional `scatter`. It feeds ONLY the `--region` fit (a third
 * block next to the Japanese campaign and Globe at Night) and is reported,
 * never folded into the global fit. A file whose licence is not on the
 * allow-list (ODbL, anything non-commercial or share-alike, no licence at
 * all, or a STARS4ALL / TESS source) is refused with the reason.
 * `--validate-region <file>` reads the same shape WITHOUT the licence check
 * and only compares the constants against it: the way to use a
 * validation-only set (STARS4ALL / TESS, ODbL) — never fitted, never shipped.
 * `--region-polygon <file>` tries a candidate region that is not in the
 * table yet (`{"polygons": [[[lat, lon], …], …]}`, same rings as the table).
 * `--bootstrap <n>` adds, to each region fit, the 95 % interval of its
 * constant (cells resampled, seeded, deterministic), the RMS the global
 * constant gives on the same cells, and the verdict of `assessRegionFit`:
 * a region is shipped only when it has at least 30 cells, its interval
 * excludes the global constant and it beats the global constant's RMS on
 * those cells. None of this changes any existing output: without these
 * flags the script prints exactly what it printed before.
 *
 * ── What is being fitted ─────────────────────────────────────────────────
 * The raster stores, per cell, the upward radiance of everything within
 * 300 km summed with the distance kernel in ./sky-quality-kernel.mjs and
 * divided by that kernel's surface integral — a propagated radiance in
 * nW/cm²/sr. Artificial zenith luminance is linear in the light reaching the
 * observer, so one constant converts it:
 *
 *     B_artificial [mcd/m²] = a × propagated radiance [nW/cm²/sr]
 *
 * `a` is `skyQualityLuminancePerRadiance` in ../src/sky-quality.js. It is
 * applied at read time, so refitting it never requires
 * rebuilding the raster. The fit minimises the RMS residual in magnitudes of
 * TOTAL sky brightness, not in luminance: near the natural floor a tenth of
 * a magnitude is a large fraction of the artificial part, and a luminance
 * fit would let the darkest sites dominate.
 *
 * ── Measurements ─────────────────────────────────────────────────────────
 * Two sources, both redistributable without a non-commercial or share-alike
 * restriction. Neither is committed to this repository: pass the files with
 * --input, or let --download fetch them.
 *
 *   1. National Park Service Night Skies Program, "nsdmap.geojson"
 *      <https://www.nps.gov/subjects/nightskies/nsdmap.geojson> — 656
 *      all-sky V-band CCD measurements, of which 643 carry a numeric
 *      ZENITH_ART, the artificial zenith luminance in µcd/m². A work of the
 *      United States Government: public domain. Almost every site is dark
 *      and in the United States, so this source constrains the faint end.
 *
 *   2. Globe at Night, NSF NOIRLab
 *      <https://globeatnight.org/documents/<year>/GaN<year>.csv> — citizen
 *      science, CC BY 4.0. The `SQMReading` column is a zenith Sky Quality
 *      Meter reading. It is noisy, so it is filtered hard (clear skies, a
 *      plausible magnitude range) and then aggregated: one median per raster
 *      cell, and by default only cells with at least `--min-readings`
 *      independent readings. This source is what covers bright skies and the
 *      world outside the United States.
 *
 * `--from-year` (default 2019) drops older readings: the raster is built
 * from a recent annual composite, and street lighting has changed enough
 * over a decade that a 2013 reading no longer describes the same place.
 *
 * ── A third source, used for Japan's REGIONAL constant only: Japan ───────
 * `--input-japan <file>` reads the 環境省 (Ministry of the Environment) /
 * 星空公団 "デジタルカメラによる夜空の明るさ調査" campaign — twice a year
 * since 2018, a digital camera pointed at the zenith (35–50 mm, 30 s, f/5.6,
 * ISO 800) reduced against standard stars in the frame, reported in
 * mag/arcsec². The two sources above are dominated by dry air; this one is
 * entirely inside a humid, maritime, monsoon climate, which is the blind
 * spot the model documentation admits to.
 *
 * NOT FOLDED INTO THE GLOBAL FIT BY DEFAULT — `--calibrate-with-japan` does
 * that, and still requires saying so in the commit that changes the GLOBAL
 * constant. IS what `--region japan` fits: these are public measurements, and only a fitted constant
 * and its provenance are shipped — never a measurement or a position — which
 * is not what either publication's terms restrict. The campaign is published
 * twice, under two different sets of terms, and only one carries positions:
 *
 *   - 環境省, as per-campaign PDF result tables under <env.go.jp>, whose
 *     terms are the Public Data License 1.0, which is written to be
 *     compatible with CC BY 4.0: 「本サイトで掲載・発信している情報（以下
 *     「コンテンツ」といいます。）の著作権は、特記されていない限り環境省に
 *     帰属し、権利表記の記載がない限り「公共データ利用規約（第1.0版）」
 *     （PDL1.0）が適用されています」 — "copyright in the content published
 *     on this site belongs to the Ministry of the Environment unless
 *     otherwise noted, and unless a rights notice says otherwise the Public
 *     Data License (version 1.0) applies". Those tables carry NO
 *     coordinates: prefecture, municipality and a free-text place name only.
 *     PDL1.0 asks for a 出典 (source) credit, which the interface
 *     both carry next to the National Park Service and Globe at Night ones.
 *
 *   - 国立環境研究所 (National Institute for Environmental Studies), as a
 *     public map layer under 環境展望台 / 環境GIS, WITH coordinates. Its
 *     terms are the institute's own site policy, which reserves reproduction
 *     of the site's content: 「国立環境研究所ホームページの内容の全部又は
 *     一部については、私的使用又は引用等著作権法上認められた行為を除き、
 *     国立環境研究所の許可なく引用、転載、複製等はお断りします」 — "except
 *     for private use and quotation and other acts permitted by copyright
 *     law, quotation, reproduction and copying of all or part of the
 *     institute's website without its permission are declined". A request to
 *     use this layer for calibration is pending with the institute; nothing
 *     here waits on the answer, because no page content, measurement or
 *     position from it is redistributed — only a number this script computes
 *     locally and its provenance.
 *
 * `--calibrate-with-japan` still folds these rows into the GLOBAL fit above,
 * unrelated to `--region`; use it only if the rights holder has agreed to
 * that broader use, and say so in the commit that changes the global
 * constant. No measurement file is committed here either way.
 *
 * BAND CAVEAT, not corrected for: this campaign reduces a camera frame
 * against standard stars, close to the V band; the shipped global constant
 * is fitted mostly on Globe at Night's SQM readings, a much broader band
 * that typically reads a few tenths of a magnitude darker under a light-
 * polluted sky than V does. Globe at Night's own (licence-clean) readings
 * inside Japan alone give an independent, SQM-band regional value of
 * ≈ 0.44 (94 readings, 7 cells) — cited in the docs as the alternative this
 * gap could resolve to, once the V-to-SQM offset is known. No colour
 * correction is applied by this script either way.
 *
 * `--max-variation` (default 0.2) uses the campaign's own precision
 * indicator, ばらつき, the spread of brightness across the frame, where
 * "closer to zero means a more precise measurement".
 *
 * ── What is deliberately NOT used ────────────────────────────────────────
 * The World Atlas measurement supplement (Falchi et al. 2016) is CC BY-NC
 * and not publicly downloadable; the UCM mobile SQM survey of Madrid
 * (doi:10.5281/zenodo.51713) is CC BY-NC; the TESS/STARS4ALL archive is
 * ODbL, i.e. share-alike; MySkyAtNight publishes no licence. None of them is
 * an input to anything here. They can be used to CHECK the result by hand,
 * never to produce a constant this repository ships.
 *
 * ── What this calibration is not ─────────────────────────────────────────
 * It is a single global constant. It cannot know the local aerosol load, the
 * spectrum of the local lamps, the terrain around the site or its altitude,
 * and the two sources are in different photometric bands (V for the NPS
 * camera, the SQM's own broad band for Globe at Night), which differ by
 * roughly 0.5 (B−V) of the sky. The residual scatter this script prints is
 * the honest width of all of that.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import {
  bortleFromSqm,
  nearestSkyQualityRadiance,
  sampleSkyQualityRadiance,
  skyQualityCalibrationAt,
  skyQualityCalibrationRegions,
  skyQualityLuminancePerRadiance,
  skyQualityPointInPolygons,
  sqmFromViirsRadiance,
} from "../src/sky-quality.js";

// Globe at Night's own document ids, one per annual CSV: the URL used to be
// .../documents/{year}/GaN{year}.csv, which now 404s — the site serves
// .../documents/<opaque id>/GaN<year>.csv instead, and the id is not the
// year. There is no known rule for it, so this is a plain lookup table,
// updated by hand from https://globeatnight.org/maps-data/ when a new year
// is added. An unknown year, or an id that itself 404s, is a hard failure
// (see `globeAtNightUrl` and `download` below) — never a silent skip.
export const globeAtNightDocumentIds = {
  2006: 678,
  2007: 677,
  2008: 676,
  2009: 675,
  2010: 674,
  2011: 673,
  2012: 672,
  2013: 671,
  2014: 670,
  2015: 669,
  2016: 668,
  2017: 667,
  2018: 666,
  2019: 665,
  2020: 679,
  2021: 663,
  2022: 662,
  2023: 661,
  2024: 926,
  2025: 1190,
};

export function globeAtNightUrl(year) {
  const id = globeAtNightDocumentIds[year];
  if (!id)
    throw new Error(
      `No known Globe at Night document id for ${year}. Add it to ` +
        "globeAtNightDocumentIds in packages/portal/scripts/calibrate-sky-quality.mjs " +
        "(check https://globeatnight.org/maps-data/ for the current id).",
    );
  return `https://globeatnight.org/documents/${id}/GaN${year}.csv`;
}

const options = new Map();
const inputs = [];
const japanInputs = [];
const regionInputs = [];
const validationInputs = [];
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (!argument.startsWith("--")) continue;
  const [name, ...values] = argument.split("=");
  let value;
  if (values.length) value = values.join("=");
  else {
    const next = process.argv[index + 1];
    if (next && !next.startsWith("--")) {
      value = next;
      index += 1;
    } else value = true;
  }
  if (name === "--input") inputs.push(String(value));
  else if (name === "--input-japan") japanInputs.push(String(value));
  else if (name === "--input-region") regionInputs.push(String(value));
  else if (name === "--validate-region") validationInputs.push(String(value));
  else options.set(name, value);
}
const option = (name, fallback = null) =>
  options.has(name) ? options.get(name) : fallback;

const naturalSkyLuminance = 0.171168465;
const luminanceZeroPoint = 108000000;

export const calibrationSources = {
  globeAtNight: {
    attribution: "Globe at Night, NSF NOIRLab (globeatnight.org), CC BY 4.0.",
    license: "CC BY 4.0",
    // Documentation only: `globeAtNightUrl(year)` (above) builds the real,
    // per-year URL from `globeAtNightDocumentIds`. The old
    // .../documents/{year}/GaN{year}.csv pattern shown here 404s.
    url: "https://globeatnight.org/documents/<id>/GaN<year>.csv",
  },
  japanStarWatching: {
    attribution:
      "星空観察「デジタルカメラによる夜空の明るさ調査」, Ministry of the " +
      "Environment of Japan (環境省) with 星空公団; the copy carrying " +
      "coordinates is published by the National Institute for Environmental " +
      "Studies (国立環境研究所) as the 環境展望台 / 環境GIS star-watching " +
      "map layer.",
    // Two publications, two sets of terms. The env.go.jp result tables are
    // PDL1.0 (CC BY 4.0 compatible) but carry no coordinates; the NIES map
    // layer carries coordinates under the institute's own site policy, which
    // reserves reproduction of ITS content. Neither is redistributed here
    // either way: --region japan --input-japan ships only a fitted constant
    // and its provenance. See this file's header for both quoted in full.
    license:
      "env.go.jp tables: 公共データ利用規約（第1.0版）/ PDL1.0 (CC BY 4.0 " +
      "compatible), attribution required (出典：環境省 星空観察), no " +
      "coordinates. NIES map layer (with coordinates): 国立環境研究所 site " +
      "policy, reproduction reserved for the site's own content — a request to " +
      "use it for calibration is pending with the institute; only a fitted " +
      "constant is shipped, never the underlying measurements or positions.",
    url: "https://tenbou.nies.go.jp/gis/",
  },
  nationalParkService: {
    attribution:
      "National Park Service Night Skies Program, night sky data set " +
      "(nsdmap.geojson). A work of the United States Government: public domain.",
    license: "public domain (US Government work)",
    url: "https://www.nps.gov/subjects/nightskies/nsdmap.geojson",
  },
};

/** mag/arcsec² of total sky brightness from an artificial luminance. */
export const sqmFromArtificial = (artificial) =>
  -2.5 * Math.log10((artificial + naturalSkyLuminance) / luminanceZeroPoint);

/** Artificial luminance in mcd/m² from a total mag/arcsec² reading. */
export const artificialFromSqm = (sqm) =>
  luminanceZeroPoint * 10 ** (-0.4 * sqm) - naturalSkyLuminance;

async function loadRaster(directory) {
  const root = resolve(
    directory ||
      process.env.ASTRO_PORTAL_SKY_QUALITY_RASTER_DIR ||
      join(process.cwd(), "static-data", "sky-quality"),
  );
  const manifest = JSON.parse(
    await readFile(join(root, "manifest.json"), "utf8"),
  );
  return {
    manifest,
    grid: {
      cellSizeDegrees: manifest.grid.cellSizeDegrees,
      data: await readFile(join(root, manifest.file || "raster.bin")),
      height: manifest.grid.height,
      north: manifest.grid.north,
      west: manifest.grid.west,
      width: manifest.grid.width,
    },
  };
}

function propagatedAt(grid, latitude, longitude) {
  const refined = sampleSkyQualityRadiance(grid, latitude, longitude);
  return refined === null
    ? nearestSkyQualityRadiance(grid, latitude, longitude)
    : refined;
}

// ── Readers ──────────────────────────────────────────────────────────────

/** NPS nsdmap.geojson: ZENITH_ART is the artificial zenith luminance, µcd/m². */
export function readNationalParkService(text, fromYear) {
  const collection = JSON.parse(text);
  const rows = [];
  for (const feature of collection?.features || []) {
    const properties = feature?.properties || {};
    const coordinates = feature?.geometry?.coordinates;
    const artificial = properties.ZENITH_ART;
    if (!Array.isArray(coordinates) || typeof artificial !== "number") continue;
    const year = Number(
      String(properties.MID_DATE_LMT || "")
        .split("/")
        .pop(),
    );
    if (Number.isFinite(year) && Number.isFinite(fromYear) && year < fromYear)
      continue;
    rows.push({
      artificial: artificial / 1000,
      latitude: Number(coordinates[1]),
      longitude: Number(coordinates[0]),
      readings: 1,
      source: "nps",
      year: Number.isFinite(year) ? year : null,
    });
  }
  return rows;
}

function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      fields.push(field);
      field = "";
    } else field += character;
  }
  fields.push(field);
  return fields;
}

/** Globe at Night annual CSV: one usable SQM reading per row, or none. */
export function readGlobeAtNight(text, fromYear) {
  const lines = text.split(/\r?\n/);
  const header = parseCsvLine(lines[0] || "").map((name) => name.trim());
  const at = (name) => header.indexOf(name);
  const latitude = at("Latitude");
  const longitude = at("Longitude");
  const sqm = at("SQMReading");
  const cloud = at("CloudCover");
  const date = at("UTDate");
  if (latitude < 0 || longitude < 0 || sqm < 0) return [];
  const rows = [];
  for (let index = 1; index < lines.length; index += 1) {
    if (!lines[index]) continue;
    const fields = parseCsvLine(lines[index]);
    if (cloud >= 0 && (fields[cloud] || "").trim() !== "clear") continue;
    const reading = Number((fields[sqm] || "").trim());
    // A reading outside this window is not a sky. The measured zenith of the
    // worst city cores is around 17, and the raw distribution piles up on
    // 10.0 and on 23.0 — the ends of the form's own range — so anything
    // below 16.0 is a meter pointed at something lit and anything above 22.3
    // is darker than the darkest sky ever measured.
    if (!Number.isFinite(reading) || reading < 16 || reading > 22.3) continue;
    const year = Number(String(fields[date] || "").slice(0, 4));
    if (Number.isFinite(year) && Number.isFinite(fromYear) && year < fromYear)
      continue;
    const latitudeValue = Number(fields[latitude]);
    const longitudeValue = Number(fields[longitude]);
    if (!Number.isFinite(latitudeValue) || !Number.isFinite(longitudeValue))
      continue;
    if (Math.abs(latitudeValue) > 90 || Math.abs(longitudeValue) > 180)
      continue;
    rows.push({
      latitude: latitudeValue,
      longitude: longitudeValue,
      source: "globe-at-night",
      sqm: reading,
      year: Number.isFinite(year) ? year : null,
    });
  }
  return rows;
}

/**
 * 環境省 / 星空公団 star-watching campaign, as exported from the public
 * 環境GIS map layer. Both shapes that one export produces are accepted,
 * because they differ only in where the fields sit:
 *
 *   - Esri JSON:    {features: [{attributes: {...}, geometry: {x, y}}]}
 *   - GeoJSON:      {features: [{properties: {...},
 *                                geometry: {coordinates: [x, y]}}]}
 *
 * A bare array of those features is accepted too, because paging a large
 * export usually ends with the pages concatenated into one array.
 *
 * Fields used: `magnitude` (mag/arcsec² at the zenith), `variation`
 * (ばらつき, the campaign's own precision indicator), `latitude`,
 * `longitude`, `measure_year`, `measure_season` (1 = summer, 2 = winter).
 * Positions are JGD2000, which differs from WGS 84 by far less than one
 * raster cell.
 *
 * Filtering, all of it deliberate:
 *
 *   - `variation` above `maxVariation` is dropped. The campaign publishes it
 *     precisely so a frame with an uneven background can be set aside.
 *   - a magnitude outside 14.0–22.5 is dropped. That window is the range the
 *     published campaign tables actually span, and unlike the Globe at Night
 *     window it is not tightened at the bright end: these are reductions
 *     against standard stars in the same frame, not a hand-held meter that
 *     may be pointed at a lit surface.
 *   - `--from-year` applies to `measure_year` as it does everywhere else.
 *
 * The rows come out in the same shape as `readGlobeAtNight`, so
 * `aggregateByCell` collapses them the same way.
 */
export function readJapanStarWatching(text, fromYear, maxVariation = 0.2) {
  const collection = JSON.parse(text);
  const features = Array.isArray(collection)
    ? collection
    : collection?.features || [];
  // `Number(null)` and `Number("")` are 0, which would silently place a row
  // with a missing coordinate in the Gulf of Guinea. Only a number or a
  // non-empty numeric string counts.
  const number = (value) =>
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  const rows = [];
  for (const feature of features) {
    const properties = feature?.attributes || feature?.properties || {};
    const geometry = feature?.geometry || {};
    const coordinates = Array.isArray(geometry.coordinates)
      ? geometry.coordinates
      : null;
    const position = (name, fromGeometry) => {
      const declared = number(properties[name]);
      return Number.isFinite(declared) ? declared : number(fromGeometry);
    };
    const latitude = position(
      "latitude",
      coordinates ? coordinates[1] : geometry.y,
    );
    const longitude = position(
      "longitude",
      coordinates ? coordinates[0] : geometry.x,
    );
    const reading = number(properties.magnitude);
    if (!Number.isFinite(reading) || reading < 14 || reading > 22.5) continue;
    const variation = number(properties.variation);
    if (
      Number.isFinite(variation) &&
      Number.isFinite(maxVariation) &&
      variation > maxVariation
    )
      continue;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    const year = number(properties.measure_year);
    if (Number.isFinite(year) && Number.isFinite(fromYear) && year < fromYear)
      continue;
    const season = number(properties.measure_season);
    rows.push({
      latitude,
      longitude,
      season: season === 1 ? "summer" : season === 2 ? "winter" : null,
      source: "japan-star-watching",
      sqm: reading,
      year: Number.isFinite(year) ? year : null,
    });
  }
  return rows;
}

/**
 * Licences a measurement file may carry to be an INPUT of a regional fit.
 * What is shipped from it is only a fitted constant and its provenance, so
 * the licence has to allow that: attribution licences, public domain, or an
 * explicit written agreement. Everything else is refused, and so is a
 * STARS4ALL / TESS source whatever it claims: that network is ODbL
 * (share-alike) and validation-only here (`--validate-region`).
 */
const refusedLicense =
  /(\bnc\b|non-?commercial|\bsa\b|share-?alike|odbl|open database|\bgpl|all rights reserved|proprietary|unlicensed|unknown|not specified)/i;
const acceptedLicense =
  /(cc0|\bcc[- ]by\b|public[ -]domain|\bpdl\b|open government licen[cs]e|written agreement)/i;

export function assessRegionCampaignLicense(license, source = "") {
  const declared = String(license || "").trim();
  if (!declared)
    return {
      ok: false,
      reason:
        'no "# license:" line: a campaign without a stated licence is not an input',
    };
  if (/stars4all|\btess\b/i.test(`${source} ${declared}`))
    return {
      ok: false,
      reason:
        "STARS4ALL / TESS is ODbL (share-alike): validation only, use --validate-region",
    };
  if (refusedLicense.test(declared))
    return {
      ok: false,
      reason: `licence "${declared}" is non-commercial, share-alike, ODbL or unknown: never an input`,
    };
  if (!acceptedLicense.test(declared))
    return {
      ok: false,
      reason: `licence "${declared}" is not on the allow-list (CC0, CC BY, public domain, PDL 1.0, Open Government Licence, written agreement)`,
    };
  return { ok: true, reason: null };
}

/**
 * A national campaign in the generic `--input-region` shape: a CSV whose
 * leading `# key: value` lines say where it comes from, then one header and
 * one reading per row.
 *
 *   # source: <who published it, free text>
 *   # license: <CC0 | CC BY 4.0 | public domain | PDL 1.0 | …>
 *   latitude,longitude,magnitude,date,scatter
 *   46.51,8.02,20.31,2023-07-14,0.08
 *
 * `latitude` / `longitude`: WGS 84 decimal degrees. `magnitude`: zenith sky
 * brightness in mag/arcsec². `date`: an ISO date or just a year (the year
 * feeds `--from-year`). `scatter` (optional): the campaign's own precision
 * indicator, dropped above `--max-variation` like the Japanese ばらつき; an
 * empty cell keeps the row. Filters: a magnitude outside 14.0–22.5 (the
 * range of instrument-reduced readings) is dropped, as are rows with a
 * missing or impossible position and rows older than `--from-year`.
 *
 * `requireLicense: false` is for `--validate-region` only: a validation set
 * is compared with the constants, never fitted, so its licence does not gate
 * it. Rows come out in the shape `aggregateByCell` takes.
 */
export function readRegionCampaign(
  text,
  fromYear,
  maxVariation = 0.2,
  { requireLicense = true } = {},
) {
  const meta = {};
  const lines = String(text).split(/\r?\n/);
  let headerIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const found = /^#\s*([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
      if (found) meta[found[1].toLowerCase()] = found[2].trim();
      continue;
    }
    headerIndex = index;
    break;
  }
  if (headerIndex < 0) return { meta, rows: [] };
  if (requireLicense) {
    const verdict = assessRegionCampaignLicense(meta.license, meta.source);
    if (!verdict.ok)
      throw new Error(`--input-region refused: ${verdict.reason}.`);
  }
  const header = parseCsvLine(lines[headerIndex]).map((name) =>
    name.trim().toLowerCase(),
  );
  const column = (...names) => header.findIndex((name) => names.includes(name));
  const latitudeAt = column("latitude", "lat");
  const longitudeAt = column("longitude", "lon", "lng");
  const magnitudeAt = column("magnitude", "mag", "sqm");
  const dateAt = column("date", "year");
  const scatterAt = column("scatter");
  if (latitudeAt < 0 || longitudeAt < 0 || magnitudeAt < 0 || dateAt < 0)
    throw new Error(
      "--input-region: the header needs latitude, longitude, magnitude and date " +
        "(scatter is optional); see docs/SKY_QUALITY_RASTER.md.",
    );
  const number = (value) =>
    typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  const rows = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    if (!lines[index].trim() || lines[index].trim().startsWith("#")) continue;
    const fields = parseCsvLine(lines[index]);
    const latitude = number(fields[latitudeAt]);
    const longitude = number(fields[longitudeAt]);
    const reading = number(fields[magnitudeAt]);
    if (!Number.isFinite(reading) || reading < 14 || reading > 22.5) continue;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    const scatter = scatterAt >= 0 ? number(fields[scatterAt]) : Number.NaN;
    if (
      Number.isFinite(scatter) &&
      Number.isFinite(maxVariation) &&
      scatter > maxVariation
    )
      continue;
    const year = Number(
      String(fields[dateAt] || "")
        .trim()
        .slice(0, 4),
    );
    if (!Number.isFinite(year) || year < 1900) continue;
    if (Number.isFinite(fromYear) && year < fromYear) continue;
    rows.push({
      latitude,
      longitude,
      source: "region-campaign",
      sqm: reading,
      year,
    });
  }
  return { meta, rows };
}

/** Residual statistics of one constant on cells that carry a propagated radiance. */
export function residualStatistics(sites, scale) {
  const usable = sites.filter(
    (site) => site.propagated > 0 && Number.isFinite(site.artificial),
  );
  if (!usable.length) return null;
  const residuals = usable.map(
    (site) =>
      sqmFromArtificial(scale * site.propagated) -
      sqmFromArtificial(site.artificial),
  );
  const mean =
    residuals.reduce((total, value) => total + value, 0) / usable.length;
  return {
    bias: mean,
    rmsMagnitudes: Math.sqrt(
      residuals.reduce((total, value) => total + value * value, 0) /
        usable.length,
    ),
    sites: usable.length,
  };
}

/**
 * The 95 % interval of a fitted constant: the cells are resampled with
 * replacement `draws` times and refitted. The generator is a fixed linear
 * congruential one, so the same cells always give the same interval.
 */
export function bootstrapScaleInterval(sites, draws) {
  const usable = sites.filter(
    (site) => site.propagated > 0 && Number.isFinite(site.artificial),
  );
  if (usable.length < 4 || !(draws > 0)) return null;
  let state = 20260929;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const scales = [];
  for (let draw = 0; draw < draws; draw += 1) {
    const sample = usable.map(() => usable[Math.floor(next() * usable.length)]);
    const fit = fitLuminanceScale(sample);
    if (fit) scales.push(fit.scale);
  }
  if (!scales.length) return null;
  scales.sort((first, second) => first - second);
  const at = (fraction) =>
    scales[Math.min(scales.length - 1, Math.floor(scales.length * fraction))];
  return { draws: scales.length, high: at(0.975), low: at(0.025) };
}

/**
 * The acceptance rule for a region (docs/SKY_QUALITY_RASTER.md, « Adding
 * another region »): at least `minimumCells` cells, an interval that
 * excludes the global constant, and an RMS below the global constant's on
 * the same cells. A region that passes with fewer than `thinCells` cells
 * ships with a note in its provenance saying so.
 */
export const regionAcceptance = { minimumCells: 30, thinCells: 100 };

export function assessRegionFit({
  fit,
  interval,
  rmsAtCompiledIn,
  compiledScale = skyQualityLuminancePerRadiance,
}) {
  if (!fit)
    return {
      credible: false,
      thin: false,
      reasons: ["not enough usable cells to fit"],
    };
  const reasons = [];
  if (fit.sites < regionAcceptance.minimumCells)
    reasons.push(
      `only ${fit.sites} cells (the rule asks for ${regionAcceptance.minimumCells})`,
    );
  if (!interval) reasons.push("no bootstrap interval (--bootstrap not given)");
  else if (compiledScale >= interval.low && compiledScale <= interval.high)
    reasons.push(
      `the 95 % interval ${interval.low.toFixed(3)}–${interval.high.toFixed(3)} contains the global constant ${compiledScale}`,
    );
  if (!(fit.rmsMagnitudes < rmsAtCompiledIn))
    reasons.push(
      "the RMS is no better than the global constant's on the same cells",
    );
  return {
    credible: reasons.length === 0,
    reasons,
    thin: fit.sites < regionAcceptance.thinCells,
  };
}

/**
 * Collapse individual readings onto the raster's own cells, keeping the
 * median. A single citizen-science reading carries the observer's eyesight,
 * the moon, twilight and a possibly miscalibrated meter; the median of
 * several independent readings in one 2' cell carries much less of all that.
 */
export function aggregateByCell(rows, cellSizeDegrees, minimumReadings) {
  const cells = new Map();
  for (const row of rows) {
    const key = `${Math.floor((90 - row.latitude) / cellSizeDegrees)}:${Math.floor(
      (row.longitude + 180) / cellSizeDegrees,
    )}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { latitudes: [], longitudes: [], readings: [], years: [] };
      cells.set(key, cell);
    }
    cell.latitudes.push(row.latitude);
    cell.longitudes.push(row.longitude);
    cell.readings.push(row.sqm);
    if (row.year) cell.years.push(row.year);
  }
  const median = (values) => {
    const sorted = [...values].sort((first, second) => first - second);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const out = [];
  for (const cell of cells.values()) {
    if (cell.readings.length < minimumReadings) continue;
    // Readings in one cell that disagree by more than this are not measuring
    // the same sky — a lit car park and a field on the same night, or a
    // meter that was never calibrated. Drop the cell rather than average it.
    const sorted = [...cell.readings].sort((first, second) => first - second);
    const spread =
      sorted[Math.floor(sorted.length * 0.84)] -
      sorted[Math.floor(sorted.length * 0.16)];
    if (spread > 1.5) continue;
    out.push({
      artificial: artificialFromSqm(median(cell.readings)),
      latitude: median(cell.latitudes),
      longitude: median(cell.longitudes),
      readings: cell.readings.length,
      source: "globe-at-night",
      year: cell.years.length ? Math.round(median(cell.years)) : null,
    });
  }
  return out;
}

// ── Fit ──────────────────────────────────────────────────────────────────

/**
 * The scale minimising the RMS residual in magnitudes. The objective is
 * smooth and has one minimum over any sensible range, so a coarse scan
 * followed by a bisection on the derivative sign is both exact enough and
 * completely deterministic.
 */
export function fitLuminanceScale(sites) {
  const usable = sites.filter(
    (site) => site.propagated > 0 && Number.isFinite(site.artificial),
  );
  if (usable.length < 4) return null;
  const cost = (scale) => {
    let total = 0;
    for (const site of usable)
      total +=
        (sqmFromArtificial(scale * site.propagated) -
          sqmFromArtificial(site.artificial)) **
        2;
    return total / usable.length;
  };
  let low = 1e-4;
  let high = 10;
  for (let step = 0; step < 200; step += 1) {
    const first = low + (high - low) / 3;
    const second = high - (high - low) / 3;
    if (cost(first) < cost(second)) high = second;
    else low = first;
  }
  const scale = (low + high) / 2;
  const residuals = usable.map(
    (site) =>
      sqmFromArtificial(scale * site.propagated) -
      sqmFromArtificial(site.artificial),
  );
  const mean =
    residuals.reduce((total, value) => total + value, 0) / residuals.length;
  return {
    bias: mean,
    rmsMagnitudes: Math.sqrt(cost(scale)),
    scale,
    sites: usable.length,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────

/**
 * Downloads every input into `workDirectory`, one file at a time, and
 * returns their paths. `fetchImpl` defaults to the global `fetch`; tests
 * pass a fake so nothing here ever makes a real network request.
 *
 * A failed download is a THROWN error, not a logged skip: a 404 (Globe at
 * Night moving a document again, an id going stale) used to be silently
 * swallowed, leaving the fit to run on whatever files happened to land —
 * wrong and quiet. Now it stops the whole run with the URL and status.
 */
export async function downloadMeasurementSets({
  workDirectory,
  fromYear,
  // The newest year this script has a document id for: the current year is
  // usually published later, and asking for it would fail every run.
  toYear = Math.max(...Object.keys(globeAtNightDocumentIds).map(Number)),
  fetchImpl = fetch,
  log = (line) => process.stderr.write(line),
} = {}) {
  await mkdir(workDirectory, { recursive: true });
  const fetched = [];
  const download = async (url, name) => {
    const target = join(workDirectory, name);
    const response = await fetchImpl(url);
    if (!response.ok)
      throw new Error(
        `Download failed: ${url} -> HTTP ${response.status}. Check that ` +
          "this script's document-id table (or the NPS URL) is still current.",
      );
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
    fetched.push(target);
    log(`  ${url} -> ${target}\n`);
  };
  log("Downloading measurement sets…\n");
  await download(calibrationSources.nationalParkService.url, "nsdmap.geojson");
  for (let year = fromYear; year <= toYear; year += 1)
    await download(globeAtNightUrl(year), `GaN${year}.csv`);
  return fetched;
}

async function resolveInputs() {
  if (inputs.length) return inputs.map((path) => resolve(path));
  if (!option("--download"))
    return []; /* handled by the caller with a clear message */
  const workDirectory = resolve(
    option("--work-dir") || join(process.cwd(), ".sky-quality-calibration"),
  );
  return downloadMeasurementSets({
    workDirectory,
    fromYear: Number(option("--from-year", 2019)),
  });
}

async function main() {
  const { manifest, grid } = await loadRaster(option("--raster-dir"));
  const fromYear = Number(option("--from-year", 2019));
  const minimumReadings = Number(option("--min-readings", 3));
  const maximumVariation = Number(option("--max-variation", 0.2));
  const calibrateWithJapan = Boolean(option("--calibrate-with-japan", false));
  const paths = await resolveInputs();
  if (!paths.length) {
    process.stderr.write(
      "Pass --input <file> for each measurement set, or --download. " +
        "--input-japan <file> adds the 環境省 star-watching campaign, " +
        "reported-only for the GLOBAL fit but fitted by --region japan. " +
        "See this file's header for every source and its licence.\n",
    );
    process.exit(1);
  }

  const direct = [];
  const readings = [];
  const years = [];
  for (const path of paths) {
    const text = await readFile(path, "utf8");
    if (text.trimStart().startsWith("{")) {
      const rows = readNationalParkService(text, fromYear);
      direct.push(...rows);
      for (const row of rows) if (row.year) years.push(row.year);
      process.stderr.write(`${path}: ${rows.length} NPS sites\n`);
      continue;
    }
    const rows = readGlobeAtNight(text, fromYear);
    readings.push(...rows);
    for (const row of rows) if (row.year) years.push(row.year);
    process.stderr.write(`${path}: ${rows.length} Globe at Night readings\n`);
  }
  const aggregated = aggregateByCell(
    readings,
    grid.cellSizeDegrees,
    minimumReadings,
  );

  // Japan, read separately: see this file's header for why these rows are
  // reported rather than fitted unless the flag says otherwise.
  const japanReadings = [];
  for (const path of japanInputs.map((entry) => resolve(entry))) {
    const rows = readJapanStarWatching(
      await readFile(path, "utf8"),
      fromYear,
      maximumVariation,
    );
    japanReadings.push(...rows);
    for (const row of rows) if (row.year) years.push(row.year);
    process.stderr.write(
      `${path}: ${rows.length} Japan star-watching measurements\n`,
    );
  }
  const japanAggregated = aggregateByCell(
    japanReadings,
    grid.cellSizeDegrees,
    minimumReadings,
  ).map((site) => ({ ...site, source: "japan-star-watching" }));

  // Another country's campaign (`--input-region`), read separately like the
  // Japanese one: it feeds the `--region` fit only, never the global one.
  const regionInputRows = [];
  const regionInputFiles = [];
  for (const path of regionInputs.map((entry) => resolve(entry))) {
    const { meta, rows } = readRegionCampaign(
      await readFile(path, "utf8"),
      fromYear,
      maximumVariation,
    );
    regionInputRows.push(...rows);
    regionInputFiles.push({
      license: meta.license || null,
      measurements: rows.length,
      source: meta.source || null,
    });
    for (const row of rows) if (row.year) years.push(row.year);
    process.stderr.write(
      `${path}: ${rows.length} region campaign measurements\n`,
    );
  }
  const validationFiles = [];
  for (const path of validationInputs.map((entry) => resolve(entry))) {
    const { meta, rows } = readRegionCampaign(
      await readFile(path, "utf8"),
      fromYear,
      maximumVariation,
      { requireLicense: false },
    );
    validationFiles.push({
      license: meta.license || null,
      meta,
      rows,
      source: meta.source || null,
    });
    process.stderr.write(
      `${path}: ${rows.length} validation-only measurements\n`,
    );
  }

  const withPropagated = (rows) =>
    rows
      .map((site) => ({
        ...site,
        propagated: propagatedAt(grid, site.latitude, site.longitude),
      }))
      .filter((site) => site.propagated !== null);

  const sites = withPropagated([
    ...direct,
    ...aggregated,
    ...(calibrateWithJapan ? japanAggregated : []),
  ]);
  const japanSites = calibrateWithJapan
    ? sites.filter((site) => site.source === "japan-star-watching")
    : withPropagated(japanAggregated);

  const fit = fitLuminanceScale(sites);
  const byNps = fitLuminanceScale(
    sites.filter((site) => site.source === "nps"),
  );
  const byGan = fitLuminanceScale(
    sites.filter((site) => site.source === "globe-at-night"),
  );
  const byJapan = fitLuminanceScale(japanSites);
  const japanBySeason = {};
  for (const season of ["summer", "winter"])
    japanBySeason[season] = fitLuminanceScale(
      withPropagated(
        aggregateByCell(
          japanReadings.filter((row) => row.season === season),
          grid.cellSizeDegrees,
          minimumReadings,
        ),
      ),
    );
  if (!fit) {
    process.stderr.write("Not enough usable sites.\n");
    process.exit(1);
  }

  // ── --region: a SEPARATE, spatially restricted fit ──────────────────────
  // Never changes `fit` above. Same filters as the global fit (from-year,
  // ばらつき/quality, aggregation, `--min-readings`) applied earlier when
  // building `readings`/`japanReadings`/`direct`; this only adds the spatial
  // restriction, via the same table `sqmFromViirsRadiance` reads at request
  // time, so the script and the shipped constant can never disagree about
  // which region a position falls in.
  const regionId = option("--region", null);
  // `--region-polygon <file>`: a candidate region that is not in the table
  // yet, with the table's own ring shape. Same point-in-polygon test.
  let candidatePolygons = null;
  if (option("--region-polygon")) {
    if (!regionId)
      throw new Error(
        "--region-polygon needs --region <id> to name the candidate.",
      );
    const parsed = JSON.parse(
      await readFile(resolve(String(option("--region-polygon"))), "utf8"),
    );
    candidatePolygons = Array.isArray(parsed) ? parsed : parsed.polygons;
    if (!Array.isArray(candidatePolygons) || !candidatePolygons.length)
      throw new Error(
        '--region-polygon: expected {"polygons": [[[lat, lon], …], …]}.',
      );
  }
  const inRegion = (row) =>
    candidatePolygons
      ? skyQualityPointInPolygons(
          row.latitude,
          row.longitude,
          candidatePolygons,
        )
      : skyQualityCalibrationAt(row.latitude, row.longitude).id === regionId;

  const regionCampaignReadings = regionId ? japanReadings.filter(inRegion) : [];
  const regionCampaignAggregated = regionId
    ? aggregateByCell(
        regionCampaignReadings,
        grid.cellSizeDegrees,
        minimumReadings,
      )
    : [];
  const regionCampaignSites = regionId
    ? withPropagated(regionCampaignAggregated)
    : [];
  const regionCampaignFit = regionId
    ? fitLuminanceScale(regionCampaignSites)
    : null;

  const regionGanReadings = regionId ? readings.filter(inRegion) : [];
  const regionGanAggregated = regionId
    ? aggregateByCell(regionGanReadings, grid.cellSizeDegrees, minimumReadings)
    : [];
  const regionDirect = regionId ? direct.filter(inRegion) : [];
  const regionGanSites = regionId
    ? withPropagated([...regionDirect, ...regionGanAggregated])
    : [];
  const regionGanFit = regionId ? fitLuminanceScale(regionGanSites) : null;

  const regionInputsInRegion = regionId ? regionInputRows.filter(inRegion) : [];
  const regionInputAggregated = regionInputsInRegion.length
    ? aggregateByCell(
        regionInputsInRegion,
        grid.cellSizeDegrees,
        minimumReadings,
      ).map((site) => ({ ...site, source: "region-campaign" }))
    : [];
  const regionInputSites = withPropagated(regionInputAggregated);
  const regionInputFit = regionInputsInRegion.length
    ? fitLuminanceScale(regionInputSites)
    : null;

  // `--bootstrap <n>`: for each region fit, the 95 % interval of its
  // constant, the RMS the global constant gives on the same cells and the
  // verdict of the acceptance rule. Absent without the flag.
  const bootstrapDraws = Number(option("--bootstrap", 0));
  const checkOf = (sites, fit) => {
    if (!(bootstrapDraws > 0) || !regionId) return null;
    const interval = bootstrapScaleInterval(sites, bootstrapDraws);
    const atCompiledIn = residualStatistics(
      sites,
      skyQualityLuminancePerRadiance,
    );
    return {
      atCompiledIn,
      interval,
      verdict: assessRegionFit({
        fit,
        interval,
        rmsAtCompiledIn: atCompiledIn ? atCompiledIn.rmsMagnitudes : Infinity,
      }),
    };
  };
  const campaignCheck = regionCampaignReadings.length
    ? checkOf(regionCampaignSites, regionCampaignFit)
    : null;
  const ganCheck = checkOf(regionGanSites, regionGanFit);
  const inputCheck = regionInputsInRegion.length
    ? checkOf(regionInputSites, regionInputFit)
    : null;

  // The constant a validation-only set is compared with: the table's, or the
  // candidate's global fallback.
  const validationScale = regionId
    ? (skyQualityCalibrationRegions.find((region) => region.id === regionId)
        ?.luminancePerRadiance ?? null)
    : null;
  const validation = validationFiles.map((file) => {
    const inside = regionId ? file.rows.filter(inRegion) : file.rows;
    const sites = withPropagated(
      aggregateByCell(inside, grid.cellSizeDegrees, minimumReadings),
    );
    return {
      license: file.license,
      measurements: inside.length,
      atCompiledIn: residualStatistics(sites, skyQualityLuminancePerRadiance),
      atRegion:
        validationScale === null
          ? null
          : residualStatistics(sites, validationScale),
      cells: sites.length,
      source: file.source,
    };
  });

  const report = {
    attribution: [
      calibrationSources.nationalParkService.attribution,
      calibrationSources.globeAtNight.attribution,
      ...(japanReadings.length
        ? [calibrationSources.japanStarWatching.attribution]
        : []),
    ],
    compiledIn: skyQualityLuminancePerRadiance,
    fit,
    fromYear,
    globeAtNightCells: aggregated.length,
    globeAtNightReadings: readings.length,
    japan: japanReadings.length
      ? {
          bySeason: japanBySeason,
          calibratedWith: calibrateWithJapan,
          cells: japanAggregated.length,
          fit: byJapan,
          license: calibrationSources.japanStarWatching.license,
          maximumVariation,
          measurements: japanReadings.length,
        }
      : null,
    minimumReadings,
    npsSites: direct.length,
    perSource: { globeAtNight: byGan, nationalParkService: byNps },
    raster: manifest.grid,
    region: regionId
      ? {
          id: regionId,
          campaign: regionCampaignReadings.length
            ? {
                cells: regionCampaignAggregated.length,
                fit: regionCampaignFit,
                measurements: regionCampaignReadings.length,
              }
            : null,
          globeAtNight: {
            cells: regionGanAggregated.length,
            fit: regionGanFit,
            npsSites: regionDirect.length,
            readings: regionGanReadings.length,
          },
          ...(regionInputFiles.length
            ? {
                inputs: {
                  cells: regionInputAggregated.length,
                  fit: regionInputFit,
                  measurements: regionInputsInRegion.length,
                },
              }
            : {}),
          ...(bootstrapDraws > 0
            ? {
                checks: {
                  campaign: campaignCheck,
                  globeAtNight: ganCheck,
                  inputs: inputCheck,
                },
              }
            : {}),
        }
      : null,
    years: years.length
      ? { from: Math.min(...years), to: Math.max(...years) }
      : null,
    ...(regionInputFiles.length ? { regionInputFiles } : {}),
    ...(validationFiles.length ? { validation } : {}),
  };
  if (option("--json")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    `\n${report.attribution.join("\n")}\n\n` +
      `Measurements ${report.years?.from}–${report.years?.to}, raster ` +
      `${manifest.product} ${manifest.year}\n` +
      `  ${direct.length} NPS sites\n` +
      `  ${readings.length} Globe at Night readings -> ${aggregated.length} ` +
      `cells with >= ${minimumReadings} readings\n\n` +
      `skyQualityLuminancePerRadiance = ${fit.scale.toFixed(4)} mcd/m² per nW/cm²/sr\n` +
      `  ${fit.sites} sites, RMS ${fit.rmsMagnitudes.toFixed(3)} mag, ` +
      `bias ${fit.bias >= 0 ? "+" : ""}${fit.bias.toFixed(3)} mag ` +
      "(positive = model reads darker than measured)\n" +
      `  currently compiled in: ${skyQualityLuminancePerRadiance}\n\n` +
      "  per source\n" +
      `    National Park Service  a = ${byNps ? byNps.scale.toFixed(4) : "—"}  ` +
      `n = ${byNps?.sites ?? 0}  RMS = ${byNps ? byNps.rmsMagnitudes.toFixed(3) : "—"} mag\n` +
      `    Globe at Night         a = ${byGan ? byGan.scale.toFixed(4) : "—"}  ` +
      `n = ${byGan?.sites ?? 0}  RMS = ${byGan ? byGan.rmsMagnitudes.toFixed(3) : "—"} mag\n`,
  );

  if (japanReadings.length) {
    const season = (name) =>
      japanBySeason[name]
        ? `a = ${japanBySeason[name].scale.toFixed(4)}  n = ${japanBySeason[name].sites}  ` +
          `RMS = ${japanBySeason[name].rmsMagnitudes.toFixed(3)} mag`
        : "—";
    process.stdout.write(
      `\n  Japan — ${calibrationSources.japanStarWatching.attribution}\n` +
        `    licence: ${calibrationSources.japanStarWatching.license}\n` +
        `    ${japanReadings.length} measurements (ばらつき <= ${maximumVariation}) -> ` +
        `${japanAggregated.length} cells with >= ${minimumReadings} readings\n` +
        `    fitted here          a = ${byJapan ? byJapan.scale.toFixed(4) : "—"}  ` +
        `n = ${byJapan?.sites ?? 0}  RMS = ${byJapan ? byJapan.rmsMagnitudes.toFixed(3) : "—"} mag  ` +
        `bias ${byJapan && byJapan.bias >= 0 ? "+" : ""}${byJapan ? byJapan.bias.toFixed(3) : "—"} mag\n` +
        `    summer (humid)       ${season("summer")}\n` +
        `    winter (dry)         ${season("winter")}\n` +
        `    ${
          calibrateWithJapan
            ? "FOLDED INTO THE FIT ABOVE (--calibrate-with-japan)"
            : "reported only; not part of the fit above"
        }\n`,
    );
  }

  if (regionId) {
    const describe = (fit, count, cells) =>
      fit
        ? `luminancePerRadiance = ${fit.scale.toFixed(4)}  n = ${fit.sites} ` +
          `(${count} readings -> ${cells} cells)  RMS = ${fit.rmsMagnitudes.toFixed(3)} mag  ` +
          `bias ${fit.bias >= 0 ? "+" : ""}${fit.bias.toFixed(3)} mag`
        : "not enough usable sites in this region";
    process.stdout.write(`\n  region ${regionId}\n`);
    if (regionCampaignReadings.length)
      process.stdout.write(
        `    campaign (環境省 星空観察, V-band camera)   ${describe(
          regionCampaignFit,
          regionCampaignReadings.length,
          regionCampaignAggregated.length,
        )}\n`,
      );
    process.stdout.write(
      `    Globe at Night${regionCampaignReadings.length ? " (SQM band, alternative)" : ""}   ${describe(
        regionGanFit,
        regionGanReadings.length,
        regionGanAggregated.length,
      )}\n`,
    );
    if (regionInputFiles.length)
      process.stdout.write(
        `    national campaign (--input-region)   ${describe(
          regionInputFit,
          regionInputsInRegion.length,
          regionInputAggregated.length,
        )}\n`,
      );
    const checkLine = (label, check) => {
      if (!check) return;
      const interval = check.interval
        ? `95 % interval ${check.interval.low.toFixed(3)}–${check.interval.high.toFixed(3)} (${check.interval.draws} draws)`
        : "no interval";
      const global = check.atCompiledIn
        ? `global constant on the same cells: RMS ${check.atCompiledIn.rmsMagnitudes.toFixed(3)} mag, bias ${check.atCompiledIn.bias >= 0 ? "+" : ""}${check.atCompiledIn.bias.toFixed(3)} mag`
        : "no cells";
      process.stdout.write(
        `    check, ${label}: ${interval}; ${global}\n` +
          `      verdict: ${check.verdict.credible ? "credible" : "NOT credible"}` +
          `${check.verdict.thin && check.verdict.credible ? " (thin: say so in the provenance)" : ""}` +
          `${check.verdict.reasons.length ? ` — ${check.verdict.reasons.join("; ")}` : ""}\n`,
      );
    };
    checkLine("campaign", campaignCheck);
    checkLine("Globe at Night", ganCheck);
    checkLine("national campaign", inputCheck);
    if (
      !regionCampaignReadings.length &&
      !regionGanReadings.length &&
      !regionInputsInRegion.length
    )
      process.stdout.write(
        "    no readings fell inside this region — check the polygon in " +
          "skyQualityCalibrationRegions and the input files.\n",
      );
  }

  if (validationFiles.length)
    for (const [index, entry] of validation.entries()) {
      const line = (name, stats) =>
        stats
          ? `${name}: RMS ${stats.rmsMagnitudes.toFixed(3)} mag, bias ${stats.bias >= 0 ? "+" : ""}${stats.bias.toFixed(3)} mag`
          : `${name}: no usable cells`;
      process.stdout.write(
        `\n  validation only #${index + 1} (${entry.license || "no licence stated"}; never fitted, never shipped)\n` +
          `    ${entry.measurements} measurements -> ${entry.cells} cells\n` +
          `    ${line("global constant", entry.atCompiledIn)}\n` +
          (entry.atRegion
            ? `    ${line("region constant", entry.atRegion)}\n`
            : ""),
      );
    }

  // Residual against the compiled-in constant, by brightness decile, so a
  // systematic tilt shows up rather than hiding inside one RMS number.
  const buckets = new Map();
  for (const site of sites) {
    if (!(site.propagated > 0) || !Number.isFinite(site.artificial)) continue;
    const measured = sqmFromArtificial(site.artificial);
    const modelled = sqmFromViirsRadiance(site.propagated);
    if (modelled === null) continue;
    const key = bortleFromSqm(measured);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(modelled - measured);
  }
  process.stdout.write(
    "\n  residual of the compiled-in constant, by measured Bortle class\n",
  );
  for (const key of [...buckets.keys()].sort((a, b) => a - b)) {
    const values = buckets.get(key);
    const mean =
      values.reduce((total, value) => total + value, 0) / values.length;
    process.stdout.write(
      `    Bortle ${key}  n=${String(values.length).padStart(4)}  ` +
        `mean Δ = ${mean >= 0 ? "+" : ""}${mean.toFixed(2)} mag\n`,
    );
  }
}

// The readers and the fit are exported so the tests (and an ad-hoc analysis)
// can import them without the script running. A thrown error (an unknown
// Globe at Night year, a failed download) is an explicit, non-zero exit with
// a clear message — never a silent partial run.
if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1])))
  await main().catch((error) => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
