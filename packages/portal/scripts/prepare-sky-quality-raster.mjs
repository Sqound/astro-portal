#!/usr/bin/env node
/*
 * Build the self-hosted sky-quality raster from a VIIRS Nighttime Lights
 * (VNL) annual composite. Run manually, offline; never at request time.
 *
 * ── Source data ──────────────────────────────────────────────────────────
 * Earth Observation Group (EOG), Payne Institute for Public Policy, Colorado
 * School of Mines — "Annual VNL V2" (V2.2 is the current release), product
 * `average_masked`, 15 arc-second GeoTIFF, EPSG:4326, radiance in
 * nW/cm²/sr, coverage 180W/75N to 180E/65S (https://eogdata.mines.edu/products/vnl/).
 * Licence: Creative Commons Attribution 4.0 International. The attribution
 * notice EOG requires is reproduced verbatim in the generated manifest.
 *
 * ── Authentication (checked against eogdata.mines.edu on 2026-09-20) ──────
 * Downloading from https://eogdata.mines.edu/nighttime_light/annual/… is
 * behind an OpenID Connect (Keycloak, realm `eog`) login: an unauthenticated
 * request is redirected to
 * https://eogauth.mines.edu/realms/eog/protocol/openid-connect/auth.
 *
 * A free account with a verified e-mail gives *browser* access. EOG's
 * registration page states: "Effective June 1 2026 EOG is limiting
 * programmatic access via OpenID Client to paid subscribers." A paid
 * subscriber receives a `client_id`/`client_secret` and obtains a bearer
 * token with an OAuth2 password grant:
 *
 *   POST https://eogauth.mines.edu/realms/eog/protocol/openid-connect/token
 *   client_id, client_secret, username, password, grant_type=password
 *   → { "access_token": "…" }   (valid 5 minutes)
 *   GET  <data url>  with  Authorization: Bearer <access_token>
 *
 * UNVERIFIED: --download implements exactly that documented flow, but it has
 * never been executed — this repository has no EOG account and none was
 * created. Treat it as a starting point, not as a tested path. The supported
 * mode is --input: download the GeoTIFF yourself with a free account in a
 * browser and point this script at the file. Credentials are read only from
 * the environment (ASTRO_PORTAL_EOG_USERNAME / ASTRO_PORTAL_EOG_PASSWORD /
 * ASTRO_PORTAL_EOG_CLIENT_ID / ASTRO_PORTAL_EOG_CLIENT_SECRET, or a
 * ready-made ASTRO_PORTAL_EOG_TOKEN) and are never written anywhere.
 *
 * ── Reading ──────────────────────────────────────────────────────────────
 * The 2025 V2.2 composite is 86401 × 33601 float32 cells (11.6 GB), an
 * uncompressed little-endian BigTIFF with one strip per row and its
 * directory at the end of the file. It is read strip by strip (or tile by
 * tile) through ./sky-quality-geotiff.mjs, a minimal reader limited to what
 * this product needs: classic TIFF and BigTIFF, uncompressed / LZW / Deflate
 * / PackBits, predictors 1-3, strips or tiles, one band. Nothing else is
 * decoded, and no image is ever held in memory whole — the 2' run above
 * peaked at 227 MB RSS. A GeoTIFF this reader rejects can be normalised with
 * GDAL first:
 *
 *   gdal_translate -b 1 -co TILED=NO -co COMPRESS=DEFLATE in.tif out.tif
 *
 * The delivered file is gzipped and random access is required (the directory
 * is at the end), so a .gz input is expanded first. That needs ~11.6 GB of
 * scratch space: put it on a roomy volume with --work-dir; the intermediate
 * is deleted when the run ends.
 *
 * ── Resampling ───────────────────────────────────────────────────────────
 * Area-weighted mean of the source cells falling in each output cell. The
 * weighting is exact rather than a nearest-cell assignment, because the two
 * grids are not nested: the VNL tiepoint ties the *centre* of its first cell
 * to 180W/75N, so its cells sit half a 15" cell off the whole-degree grid and
 * one source cell can straddle an output boundary. Each source cell therefore
 * contributes to the one or two output columns and the one or two output rows
 * it overlaps, weighted by the overlapping longitude fraction and by the
 * latitude-band area sin(φ_north) − sin(φ_south) — the plate-carrée cell area
 * up to a constant longitude factor. Columns wrap, which folds the
 * composite's duplicated 180° column back onto the first.
 *
 * ── What this estimate is, and is not ────────────────────────────────────
 * The stored quantity is upward radiance, and the service converts the cell
 * a place falls in — not a convolution of its surroundings — into zenith sky
 * brightness. That is what the published relation this repository uses was
 * fitted on; see the citation and its limits in
 * packages/portal/src/sky-quality.js and docs/SKY_QUALITY_RASTER.md. Two
 * effects are outside the model entirely: terrain that screens a site from a
 * nearby city, and the observer's altitude (hence air mass and aerosol
 * layer). Both are recorded as future refinements in that document.
 *
 * ── Encoding ─────────────────────────────────────────────────────────────
 * Each output cell is one byte, log-scaled. With offset = 0.01 nW/cm²/sr,
 * maximum = 10000 nW/cm²/sr, levels = 256 and
 * scale = log10(1 + maximum / offset):
 *
 *   encode(R) = round(255 * log10(1 + R / offset) / scale)
 *   decode(L) = offset * (10 ** (L * scale / 255) - 1)
 *
 * decode(0) is exactly 0, decode(255) is exactly `maximum`, and
 * encode(decode(L)) === L for every level. The service
 * (packages/portal/src/planner/sky-quality.server.js) implements the
 * inverse; the single definition lives in
 * packages/portal/src/sky-quality.js and is mirrored into the manifest.
 *
 * ── Output ───────────────────────────────────────────────────────────────
 * <ASTRO_PORTAL_STATIC_DATA_DIR>/sky-quality/raster.bin  (width × height bytes)
 * <ASTRO_PORTAL_STATIC_DATA_DIR>/sky-quality/manifest.json
 * Both are written atomically and are byte-identical across runs against the
 * same input, apart from the manifest's `generatedAt`.
 *
 * ── Offline pack variant ────────────────────────────────────
 * <ASTRO_PORTAL_STATIC_DATA_DIR>/sky-quality/pack/raster.bin (width/factor × height/factor bytes)
 * <ASTRO_PORTAL_STATIC_DATA_DIR>/sky-quality/pack/raster.bin.gz (gzip -9, precomputed)
 * <ASTRO_PORTAL_STATIC_DATA_DIR>/sky-quality/pack/manifest.json `--pack-arcminutes` (default 6, `0`
 * skips it) produces a coarser, block-averaged variant for `GET /v1/offline-pack/sky-quality/*`: an
 * exact integer factor of `--arcminutes` cells are averaged over their DECODED radiance, area-weighted
 * by the same `sin(φ_north) − sin(φ_south)` rule as the resampling above, then re-encoded with this
 * raster's own encoding constants. This is the same `deriveSkyQualityPackGrid` function
 * (packages/portal/src/sky-quality.js) that packages/portal/src/planner/sky-quality.server.js calls
 * lazily at request time when nobody ran this flag; the two produce byte-identical output for the same
 * source raster. See docs/SKY_QUALITY_RASTER.md.
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *   npm run prepare:sky-quality-raster -- --input <VNL.tif[.gz]>
 *     [--year 2025] [--version v2.2] [--product average_masked]
 *     [--arcminutes 2] [--pack-arcminutes 6] [--static-data-dir <dir>]
 *     [--work-dir <dir>] [--fixture-tile <path.json>]
 *     [--fixture-tile-bounds W,S,E,N] [--fixture-tile-note <text>]
 *   npm run prepare:sky-quality-raster -- --download --year 2025
 *     [--url <explicit file url>]            (UNVERIFIED, paid subscribers)
 */
import { createHash } from "node:crypto";
import { createGunzip, gzipSync } from "node:zlib";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import {
  deriveSkyQualityPackGrid,
  encodeSkyQualityRadiance,
  skyQualityPackDefaultArcminutes,
  skyQualityPackManifest,
  skyQualityRadianceLevels,
  skyQualityRadianceMaximum,
  skyQualityRadianceOffset,
} from "../src/sky-quality.js";
import { openGeoTiff } from "./sky-quality-geotiff.mjs";
import {
  skyQualityKernelCellAverage,
  skyQualityKernelFar,
  skyQualityKernelNear,
  skyQualityKernelNormalisation,
  skyQualityKernelParameters,
  skyQualityKernelRadiusKm,
  skyQualityKernelSplit,
} from "./sky-quality-kernel.mjs";

// packages/portal/scripts → the repository root.
const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

// EXHIBIT 1 of https://eogdata.mines.edu/files/EOG_products_CC_License.pdf,
// reproduced verbatim with the product name filled in as that exhibit
// instructs ("name the appropriate EOG data product").
const eogAttribution =
  "This product was made utilizing VIIRS Nighttime Lights (VNL) data " +
  "produced by the Earth Observation Group, Payne Institute for Public " +
  "Policy, Colorado School of Mines.";
const eogShortCredit = "Source: EOG, Colorado School of Mines.";
const eogLicenseUrl =
  "https://eogdata.mines.edu/files/EOG_products_CC_License.pdf";
const eogProductUrl = "https://eogdata.mines.edu/products/vnl/";
const eogCitation =
  "Elvidge, C.D., Zhizhin, M., Ghosh, T., Hsu, F.-C., Taneja, J. " +
  "(2021). Annual time series of global VIIRS nighttime lights derived " +
  "from monthly averages: 2012 to 2019. Remote Sensing 13(5), 922. " +
  "doi:10.3390/rs13050922";
const tokenEndpoint =
  "https://eogauth.mines.edu/realms/eog/protocol/openid-connect/token";

const options = new Map();
for (const argument of process.argv.slice(2)) {
  const [name, ...values] = argument.split("=");
  options.set(name, values.length ? values.join("=") : true);
}
const option = (name, fallback = null) => {
  const value = options.get(name);
  return value === undefined ? fallback : value;
};
const flag = (name) =>
  options.get(name) === true || options.get(name) === "true";

function fail(message) {
  console.error(message);
  process.exit(1);
}

// Values passed as "--name value" rather than "--name=value".
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (!argument.startsWith("--") || argument.includes("=")) continue;
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    options.set(argument, next);
    index += 1;
  }
}

const arcminutes = Number(option("--arcminutes", 2));
if (!Number.isFinite(arcminutes) || arcminutes <= 0 || 60 % arcminutes !== 0)
  fail("--arcminutes must divide 60 (2 and 5 are the documented choices).");
const cellSizeDegrees = arcminutes / 60;
const width = Math.round(360 / cellSizeDegrees);
const height = Math.round(180 / cellSizeDegrees);

// The offline pack's own downloadable variant: produced here, at preparation
// time, with the exact same `deriveSkyQualityPackGrid` function the portal
// calls lazily when an administrator has not run this flag — one derivation,
// two callers, see that function's own comment in ../src/sky-quality.js. `0`
// skips it entirely, e.g. for the small grids
// packages/portal/tests/sky-quality-raster.test.mjs builds at --arcminutes 30,
// where a 6' pack would be coarser than the source itself.
const packArcminutesOption = option(
  "--pack-arcminutes",
  skyQualityPackDefaultArcminutes,
);
const packArcminutes = Number(packArcminutesOption);
if (!Number.isFinite(packArcminutes) || packArcminutes < 0)
  fail(
    "--pack-arcminutes must be 0 (skip) or a positive number of arc-minutes.",
  );
let packFactor = null;
if (packArcminutes > 0) {
  const packCellSizeDegrees = packArcminutes / 60;
  const factor = packCellSizeDegrees / cellSizeDegrees;
  if (
    !Number.isInteger(factor) ||
    factor < 1 ||
    width % factor !== 0 ||
    height % factor !== 0
  )
    fail(
      `--pack-arcminutes (${packArcminutes}') must be an exact integer ` +
        `multiple of --arcminutes (${arcminutes}') that evenly divides the ` +
        `${width}×${height} grid; pass --pack-arcminutes 0 to skip it.`,
    );
  packFactor = factor;
}

const staticDataDirectory = resolve(
  option("--static-data-dir") ||
    process.env.ASTRO_PORTAL_STATIC_DATA_DIR ||
    join(
      process.env.ASTRO_PORTAL_RUNTIME_DIR ||
        join(repositoryRoot, ".astro-portal"),
      "..",
      "static-data",
    ),
);
const outputDirectory = join(staticDataDirectory, "sky-quality");
const rasterName = "raster.bin";
const packDirectory = join(outputDirectory, "pack");
const packRasterName = "raster.bin";
const packManifestName = "manifest.json";
// Expanding the delivered .gz needs ~11.6 GB of scratch space for the current
// global composite, which is usually not where the output belongs. --work-dir
// puts that intermediate on a roomy volume; it is deleted when the run ends.
const workDirectory = resolve(
  option("--work-dir") ||
    process.env.ASTRO_PORTAL_SKY_QUALITY_WORK_DIR ||
    outputDirectory,
);

const product = String(option("--product", "average_masked"));
const productVersion = String(option("--version", "v2.2"));

// IUGG mean Earth radius, the one the resampling's area weights assume.
const earthRadiusKm = 6371.0087714;
const radians = Math.PI / 180;
// The far half of the kernel is evaluated on a grid whose cells nest exactly
// inside the output cells — about 6', ~11 km, whatever the output resolution.
// A grid no coarser than the output means no coarsening at all, which is
// exact and is what the small grids in the test suite get.
const coarseFactor = Math.max(1, Math.round(6 / arcminutes));
const coarseArcminutes = arcminutes * coarseFactor;

async function main() {
  const cached = await readCachedMeanGrid();
  const mean = cached ?? (await buildMeanGridFromInput());
  if (flag("--cache-only")) return;
  const year = resolveYear(mean.sourceName);
  const grid = propagateGrid(mean);
  const manifest = await writeOutputs(grid, {
    year,
    sourceName: mean.sourceName,
  });
  await writeFixtureTile(grid, { year, sourceName: mean.sourceName });
  if (packFactor)
    await writePackOutputs(grid, manifest, { factor: packFactor });
}

// Stage 1 is the only stage that touches the 11.6 GB composite, and it does
// not depend on the kernel: its result is cached in --work-dir so that
// iterating on the propagation never re-reads the GeoTIFF.
async function buildMeanGridFromInput() {
  const { path: inputPath, cleanup, sourceName } = await resolveInput();
  try {
    const mean = await buildMeanGrid(inputPath);
    mean.sourceName = sourceName;
    await writeCachedMeanGrid(mean);
    return mean;
  } finally {
    await cleanup();
  }
}

function resolveYear(sourceName) {
  const explicit = option("--year");
  if (explicit && explicit !== true) {
    const year = Number(explicit);
    if (!Number.isInteger(year) || year < 2012 || year > 2100)
      fail("--year must be a four-digit VNL composite year.");
    return year;
  }
  const match = /(?:^|[^0-9])(20[1-9][0-9])(?:[^0-9]|$)/.exec(sourceName || "");
  if (!match)
    fail(
      "Could not read the composite year from the file name; pass --year explicitly.",
    );
  return Number(match[1]);
}

async function resolveInput() {
  const input = option("--input");
  if (input && input !== true) {
    const path = resolve(String(input));
    await stat(path).catch(() => fail(`No such file: ${path}`));
    if (!path.endsWith(".gz"))
      return { path, cleanup: async () => {}, sourceName: basename(path) };
    const expanded = join(workDirectory, `${basename(path, ".gz")}.tmp`);
    await mkdir(workDirectory, { recursive: true });
    process.stderr.write(`Expanding ${basename(path)}…\n`);
    await pipeline(
      createReadStream(path),
      createGunzip(),
      createWriteStream(expanded),
    );
    return {
      path: expanded,
      cleanup: () => rm(expanded, { force: true }),
      sourceName: basename(path, ".gz"),
    };
  }
  if (!flag("--download"))
    fail(
      "Pass --input <VNL GeoTIFF> (recommended), or --download with EOG " +
        "subscriber credentials in the environment. See this file's header.",
    );
  return downloadComposite();
}

// UNVERIFIED — never executed against the real service; see the header.
async function downloadComposite() {
  const url = option("--url");
  if (!url || url === true)
    fail(
      "--download needs --url <exact EOG file url>. EOG's directory listing " +
        "is itself behind the login, so the file name cannot be discovered " +
        "programmatically without an account.",
    );
  const token = await eogAccessToken();
  const response = await fetch(String(url), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok)
    fail(
      `EOG download failed with HTTP ${response.status}. ${response.statusText}`,
    );
  await mkdir(workDirectory, { recursive: true });
  const name = basename(new URL(String(url)).pathname);
  const target = join(workDirectory, `${name}.tmp`);
  await pipeline(response.body, createWriteStream(target));
  if (!name.endsWith(".gz"))
    return {
      path: target,
      cleanup: () => rm(target, { force: true }),
      sourceName: name,
    };
  const expanded = join(workDirectory, `${basename(name, ".gz")}.tmp`);
  await pipeline(
    createReadStream(target),
    createGunzip(),
    createWriteStream(expanded),
  );
  await rm(target, { force: true });
  return {
    path: expanded,
    cleanup: () => rm(expanded, { force: true }),
    sourceName: basename(name, ".gz"),
  };
}

async function eogAccessToken() {
  const ready = process.env.ASTRO_PORTAL_EOG_TOKEN;
  if (ready) return ready;
  const body = new URLSearchParams({
    client_id: process.env.ASTRO_PORTAL_EOG_CLIENT_ID || "",
    client_secret: process.env.ASTRO_PORTAL_EOG_CLIENT_SECRET || "",
    username: process.env.ASTRO_PORTAL_EOG_USERNAME || "",
    password: process.env.ASTRO_PORTAL_EOG_PASSWORD || "",
    grant_type: "password",
  });
  for (const [key, value] of body)
    if (!value)
      fail(
        `Missing EOG credential for "${key}". Set ASTRO_PORTAL_EOG_* in the ` +
          "environment; never commit them.",
      );
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok)
    fail(
      `EOG token request failed with HTTP ${response.status}. Programmatic ` +
        "access has been limited to paid subscribers since 1 June 2026.",
    );
  const payload = await response.json();
  if (!payload?.access_token)
    fail("EOG token response carried no access_token.");
  return payload.access_token;
}

// How each source column's longitude extent splits across output columns. The
// VNL grid is centred on whole degrees rather than edged on them (its tiepoint
// sits half a 15" cell west of 180W), so a source cell can straddle an output
// boundary; the split is exact, never rounded to the nearest cell. Columns
// wrap: the composite's duplicated 180° column folds back onto the first.
function columnPlan(sourceWidth, sourceCell, originX) {
  const primary = new Int32Array(sourceWidth);
  const secondary = new Int32Array(sourceWidth).fill(-1);
  const primaryWeight = new Float64Array(sourceWidth);
  const wrap = (column) => ((column % width) + width) % width;
  for (let column = 0; column < sourceWidth; column += 1) {
    const start = (originX + column * sourceCell + 180) / cellSizeDegrees;
    const end = start + sourceCell / cellSizeDegrees;
    const first = Math.floor(start);
    const last = Math.floor(end - 1e-9);
    primary[column] = wrap(first);
    if (last <= first) {
      primaryWeight[column] = 1;
      continue;
    }
    primaryWeight[column] = (first + 1 - start) / (end - start);
    secondary[column] = wrap(first + 1);
  }
  return { primary, primaryWeight, secondary };
}

// Output rows of area-weighted sums, kept only until every source row that
// overlaps them has been read.
function createAccumulator(plan) {
  const rows = new Map();
  return {
    rows,
    row(outputRow) {
      let entry = rows.get(outputRow);
      if (!entry) {
        entry = {
          sums: new Float64Array(width),
          weights: new Float64Array(width),
        };
        rows.set(outputRow, entry);
      }
      return entry;
    },
    add(entry, weight, startColumn, values, noData) {
      const { primary, primaryWeight, secondary } = plan;
      for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (!Number.isFinite(value) || (noData !== null && value === noData))
          continue;
        const source = startColumn + index;
        const radiance = value > 0 ? value : 0;
        const share = primaryWeight[source];
        const column = primary[source];
        entry.sums[column] += radiance * weight * share;
        entry.weights[column] += weight * share;
        const spill = secondary[source];
        if (spill < 0) continue;
        entry.sums[spill] += radiance * weight * (1 - share);
        entry.weights[spill] += weight * (1 - share);
      }
    },
  };
}

async function buildMeanGrid(inputPath) {
  const tiff = await openGeoTiff(inputPath);
  try {
    const { origin, scale } = tiff.model;
    const sourceCell = scale.x;
    if (Math.abs(scale.x - scale.y) > 1e-12)
      fail("Only square source cells are supported.");
    if (!(sourceCell > 0) || sourceCell > cellSizeDegrees)
      fail(
        `Source cell (${sourceCell}°) must be finer than the output cell ` +
          `(${cellSizeDegrees}°).`,
      );
    const plan = columnPlan(tiff.width, sourceCell, origin.x);
    const accumulator = createAccumulator(plan);
    const data = new Float32Array(width * height);
    let written = 0;
    let flushed = -1;

    const flushThrough = (outputRow) => {
      for (let row = flushed + 1; row <= outputRow; row += 1) {
        const entry = accumulator.rows.get(row);
        if (entry) {
          for (let column = 0; column < width; column += 1) {
            if (entry.weights[column] <= 0) continue;
            data[row * width + column] =
              entry.sums[column] / entry.weights[column];
            written += 1;
          }
          accumulator.rows.delete(row);
        }
        flushed = row;
      }
    };

    let lastReport = 0;
    const started = Date.now();
    await tiff.readRows(
      (sourceRow, startColumn, values) => {
        const latitudeTop = origin.y - sourceRow * sourceCell;
        const latitudeBottom = latitudeTop - sourceCell;
        const first = Math.floor((90 - latitudeTop) / cellSizeDegrees);
        const last = Math.floor((90 - latitudeBottom - 1e-9) / cellSizeDegrees);
        for (let outputRow = first; outputRow <= last; outputRow += 1) {
          if (outputRow < 0 || outputRow >= height) continue;
          const top = Math.min(latitudeTop, 90 - outputRow * cellSizeDegrees);
          const bottom = Math.max(
            latitudeBottom,
            90 - (outputRow + 1) * cellSizeDegrees,
          );
          const weight = Math.sin(top * radians) - Math.sin(bottom * radians);
          if (!(weight > 0)) continue;
          accumulator.add(
            accumulator.row(outputRow),
            weight,
            startColumn,
            values,
            tiff.noData,
          );
        }
      },
      // Strips arrive in row order and tiles in tile-row order, so an output
      // row is only complete once every source row reaching below it has been
      // read: flushing on this signal, never inside the row callback.
      (lastSourceRow) => {
        const bottom = origin.y - (lastSourceRow + 1) * sourceCell;
        flushThrough(
          Math.min(Math.floor((90 - bottom) / cellSizeDegrees) - 1, height - 1),
        );
        if (lastSourceRow - lastReport >= 2048) {
          lastReport = lastSourceRow;
          process.stderr.write(
            `  row ${lastSourceRow}/${tiff.height} (${Math.round(
              (100 * lastSourceRow) / tiff.height,
            )}%, ${Math.round((Date.now() - started) / 1000)}s, rss ${Math.round(
              process.memoryUsage().rss / 1048576,
            )} MB)\n`,
          );
        }
      },
    );
    flushThrough(height - 1);
    return {
      data,
      width,
      height,
      cellSizeDegrees,
      north: 90,
      west: -180,
      populatedCells: written,
      source: {
        width: tiff.width,
        height: tiff.height,
        cellSizeDegrees: sourceCell,
        north: origin.y,
        west: origin.x,
      },
    };
  } finally {
    await tiff.close();
  }
}

// ── Stage 2: propagation ─────────────────────────────────────────────────
// See packages/portal/src/sky-quality-kernel.js for the model, its citations
// and the parameter values. This file only applies it to the grid.
//
// P(t) = Σ_s L(s) · A(s) · K(d_st) / ∫K dA, with A(s) the source cell's area
// in km². Dividing by the kernel's own integral keeps P in nW/cm²/sr: a
// uniformly lit region propagates to its own radiance, so the field stays on
// the scale the published radiance-to-brightness relations were fitted on,
// and the calibration constant in ../src/sky-quality.js stays a pure
// recalibration rather than a change of unit.
//
// Cost. A direct 2' convolution out to the truncation radius is ~3 × 10¹⁰
// products at this resolution. Instead the kernel is split in two with a
// C¹ ramp (see `skyQualityKernelSplit`): the compact near part is scattered
// from the lit 2' cells only (5.2% of the grid), the smooth far part from a
// coarser flux grid whose cells nest exactly inside the output cells. Because
// the far part is identically zero below the ramp's inner edge and has a zero
// derivative there, quantising a source — or the observer — onto the coarse
// grid cannot move it across a steep part of the kernel.
function propagateGrid(mean) {
  const started = Date.now();
  const near = new Float64Array(width * height);
  const areaKm2 = new Float64Array(height);
  for (let row = 0; row < height; row += 1) {
    const north = 90 - row * cellSizeDegrees;
    const south = north - cellSizeDegrees;
    areaKm2[row] =
      earthRadiusKm *
      earthRadiusKm *
      cellSizeDegrees *
      radians *
      (Math.sin(north * radians) - Math.sin(south * radians));
  }

  const normalisation = skyQualityKernelNormalisation();
  scatter({
    source: mean.data,
    target: near,
    width,
    height,
    cellSizeDegrees,
    areaKm2,
    normalisation,
    weightOf: skyQualityKernelNear,
    radiusKm: skyQualityKernelSplit.outerKm,
    label: "near field",
  });
  process.stderr.write(
    `  near field done (${Math.round((Date.now() - started) / 1000)}s, rss ` +
      `${Math.round(process.memoryUsage().rss / 1048576)} MB)\n`,
  );

  // The coarse grid carries flux (radiance × area), not radiance, so folding
  // it is exact: a coarse cell is a whole number of output cells.
  const factor = coarseFactor;
  const coarseWidth = Math.round(width / factor);
  const coarseHeight = Math.round(height / factor);
  const coarseCell = cellSizeDegrees * factor;
  const coarseFlux = new Float64Array(coarseWidth * coarseHeight);
  for (let row = 0; row < height; row += 1) {
    const area = areaKm2[row];
    const coarseRow = Math.floor(row / factor) * coarseWidth;
    const base = row * width;
    for (let column = 0; column < width; column += 1) {
      const value = mean.data[base + column];
      if (value > 0)
        coarseFlux[coarseRow + Math.floor(column / factor)] += value * area;
    }
  }
  // Scatter reads radiance and multiplies by the cell area itself, so hand it
  // the coarse flux with a unit area.
  const coarseArea = new Float64Array(coarseHeight).fill(1);
  const far = new Float64Array(coarseWidth * coarseHeight);
  scatter({
    source: coarseFlux,
    target: far,
    width: coarseWidth,
    height: coarseHeight,
    cellSizeDegrees: coarseCell,
    areaKm2: coarseArea,
    normalisation,
    weightOf: skyQualityKernelFar,
    radiusKm: skyQualityKernelRadiusKm,
    label: "far field",
  });
  process.stderr.write(
    `  far field done (${Math.round((Date.now() - started) / 1000)}s, rss ` +
      `${Math.round(process.memoryUsage().rss / 1048576)} MB)\n`,
  );

  const data = Buffer.alloc(width * height);
  let populated = 0;
  let maximum = 0;
  let clipped = 0;
  for (let row = 0; row < height; row += 1) {
    const base = row * width;
    for (let column = 0; column < width; column += 1) {
      const value =
        near[base + column] +
        bilinearCoarse(far, coarseWidth, coarseHeight, factor, row, column);
      if (!(value > 0)) continue;
      if (value > maximum) maximum = value;
      if (value > skyQualityRadianceMaximum) clipped += 1;
      const level = encodeSkyQualityRadiance(value);
      if (level > 0) {
        data[base + column] = level;
        populated += 1;
      }
    }
  }
  if (clipped)
    process.stderr.write(
      `WARNING: ${clipped} cells exceeded the encoding maximum ` +
        `(${skyQualityRadianceMaximum}); peak ${maximum.toFixed(1)}.\n`,
    );
  process.stderr.write(
    `Propagated in ${Math.round((Date.now() - started) / 1000)}s, peak ` +
      `${maximum.toFixed(2)} nW/cm²/sr, peak rss ` +
      `${Math.round(process.memoryUsage().rss / 1048576)} MB\n`,
  );
  return {
    data,
    width,
    height,
    cellSizeDegrees,
    north: 90,
    west: -180,
    populatedCells: populated,
    peakRadiance: maximum,
    source: mean.source,
    coarse: {
      arcminutes: coarseArcminutes,
      width: coarseWidth,
      height: coarseHeight,
    },
  };
}

// The far field on the coarse grid, read at an output cell's own centre.
// Coarse cell (R, C) is centred on output cell column C * factor + (factor-1)/2,
// so the output cell's position in coarse units is (column + 0.5) / factor - 0.5.
function bilinearCoarse(far, coarseWidth, coarseHeight, factor, row, column) {
  const y = (row + 0.5) / factor - 0.5;
  const x = (column + 0.5) / factor - 0.5;
  const row0 = Math.floor(y);
  const column0 = Math.floor(x);
  const yFraction = y - row0;
  const xFraction = x - column0;
  const clampRow = (value) =>
    value < 0 ? 0 : value > coarseHeight - 1 ? coarseHeight - 1 : value;
  const wrapColumn = (value) =>
    ((value % coarseWidth) + coarseWidth) % coarseWidth;
  const northRow = clampRow(row0) * coarseWidth;
  const southRow = clampRow(row0 + 1) * coarseWidth;
  const westColumn = wrapColumn(column0);
  const eastColumn = wrapColumn(column0 + 1);
  const north =
    far[northRow + westColumn] +
    (far[northRow + eastColumn] - far[northRow + westColumn]) * xFraction;
  const south =
    far[southRow + westColumn] +
    (far[southRow + eastColumn] - far[southRow + westColumn]) * xFraction;
  return north + (south - north) * yFraction;
}

// One scatter pass: every source cell that carries light adds its weighted
// contribution to the cells around it. Scattering rather than gathering skips
// the 95% of the grid that is dark; iterating rows, then columns, then the
// row's own offset table in a fixed order keeps the sum bit-for-bit
// reproducible.
function scatter({
  source,
  target,
  width: gridWidth,
  height: gridHeight,
  cellSizeDegrees: cell,
  areaKm2,
  normalisation,
  weightOf,
  radiusKm,
  label,
}) {
  const kilometresPerDegree = earthRadiusKm * radians;
  const rowKm = cell * kilometresPerDegree;
  // Out to four cells the kernel is not flat across a cell; beyond that the
  // cell average and the centre value agree to better than a part in 10³.
  const averagingKm = 4 * rowKm;
  const maximumRowOffset = Math.ceil(radiusKm / rowKm);
  const halfWidth = Math.floor((gridWidth - 1) / 2);
  const started = Date.now();
  let scattered = 0;

  // Reused per source row: the offsets are identical for every column of a
  // row, so the table is rebuilt once per row and applied to all of its cells.
  const runRow = new Int32Array(2 * maximumRowOffset + 1);
  const runStart = new Int32Array(2 * maximumRowOffset + 1);
  const runFirst = new Int32Array(2 * maximumRowOffset + 1);
  const runLength = new Int32Array(2 * maximumRowOffset + 1);
  const weights = new Float64Array(
    (2 * maximumRowOffset + 1) * (2 * halfWidth + 1),
  );

  for (let row = 0; row < gridHeight; row += 1) {
    let lit = false;
    const base = row * gridWidth;
    for (let column = 0; column < gridWidth; column += 1)
      if (source[base + column] > 0) {
        lit = true;
        break;
      }
    if (!lit) continue;

    const latitude = 90 - (row + 0.5) * cell;
    const scale = areaKm2[row] / normalisation;
    let runs = 0;
    let cursor = 0;
    for (
      let rowOffset = -maximumRowOffset;
      rowOffset <= maximumRowOffset;
      rowOffset += 1
    ) {
      const targetRow = row + rowOffset;
      if (targetRow < 0 || targetRow >= gridHeight) continue;
      const northSouthKm = rowOffset * rowKm;
      if (Math.abs(northSouthKm) > radiusKm) continue;
      const meanLatitude = latitude - (rowOffset * cell) / 2;
      const columnKm =
        cell * kilometresPerDegree * Math.cos(meanLatitude * radians);
      const span = Math.sqrt(
        Math.max(0, radiusKm * radiusKm - northSouthKm * northSouthKm),
      );
      let columnOffset =
        columnKm > 1e-9 ? Math.ceil(span / columnKm) : halfWidth;
      if (columnOffset > halfWidth) columnOffset = halfWidth;
      const length = 2 * columnOffset + 1;
      if (cursor + length > weights.length) continue;
      let any = false;
      for (let index = 0; index < length; index += 1) {
        const eastWestKm = (index - columnOffset) * columnKm;
        const centreKm = Math.sqrt(
          northSouthKm * northSouthKm + eastWestKm * eastWestKm,
        );
        // Close in, the kernel changes by a factor of two across one cell, so
        // its centre value is the wrong weight: average it over the cell
        // instead. That is also what removes the d → 0 question, and what
        // makes a uniformly lit region propagate to its own radiance.
        const weight =
          centreKm < averagingKm
            ? skyQualityKernelCellAverage(
                weightOf,
                eastWestKm,
                northSouthKm,
                columnKm,
                rowKm,
              )
            : weightOf(centreKm);
        weights[cursor + index] = weight * scale;
        if (weight > 0) any = true;
      }
      if (!any) continue;
      runRow[runs] = targetRow;
      runStart[runs] = cursor;
      runFirst[runs] = -columnOffset;
      runLength[runs] = length;
      runs += 1;
      cursor += length;
    }
    if (!runs) continue;

    for (let column = 0; column < gridWidth; column += 1) {
      const value = source[base + column];
      if (!(value > 0)) continue;
      scattered += 1;
      for (let run = 0; run < runs; run += 1) {
        const targetBase = runRow[run] * gridWidth;
        const start = runStart[run];
        const length = runLength[run];
        const first = column + runFirst[run];
        if (first >= 0 && first + length <= gridWidth) {
          for (let index = 0; index < length; index += 1)
            target[targetBase + first + index] +=
              value * weights[start + index];
        } else {
          for (let index = 0; index < length; index += 1) {
            let targetColumn = (first + index) % gridWidth;
            if (targetColumn < 0) targetColumn += gridWidth;
            target[targetBase + targetColumn] += value * weights[start + index];
          }
        }
      }
    }
    if (row % 512 === 0)
      process.stderr.write(
        `  ${label} row ${row}/${gridHeight} (${Math.round(
          (Date.now() - started) / 1000,
        )}s, ${scattered} lit cells)\n`,
      );
  }
  process.stderr.write(
    `  ${label}: ${scattered} lit cells scattered in ${Math.round(
      (Date.now() - started) / 1000,
    )}s\n`,
  );
}

// ── Stage-1 cache ────────────────────────────────────────────────────────
// The resampled mean-radiance grid is the only product of the 11.6 GB read,
// and it does not depend on the propagation kernel. Caching it as raw float32
// in --work-dir (233 MB at 2') turns a kernel iteration from a 15-minute read
// into a seconds-long load. The sidecar records exactly which composite and
// which geometry produced it, so a cache built from another file or another
// resolution is ignored rather than silently reused. `--mean-cache=off`
// disables both sides.
const meanCacheName = `sky-quality-mean-${arcminutes}min`;
const meanCacheEnabled = option("--mean-cache") !== "off";

function meanCachePaths() {
  return {
    binary: join(workDirectory, `${meanCacheName}.f32`),
    sidecar: join(workDirectory, `${meanCacheName}.json`),
  };
}

async function readCachedMeanGrid() {
  if (!meanCacheEnabled) return null;
  const { binary, sidecar } = meanCachePaths();
  let header;
  try {
    header = JSON.parse(await readFile(sidecar, "utf8"));
  } catch {
    return null;
  }
  const input = option("--input");
  const expected =
    input && input !== true
      ? basename(String(input)).replace(/\.gz$/, "")
      : null;
  if (
    header?.width !== width ||
    header?.height !== height ||
    header?.cellSizeDegrees !== cellSizeDegrees ||
    header?.product !== product ||
    (expected && header?.sourceName !== expected)
  )
    return null;
  let bytes;
  try {
    bytes = await readFile(binary);
  } catch {
    return null;
  }
  if (bytes.length !== width * height * 4) return null;
  process.stderr.write(`Reusing resampled grid from ${binary}\n`);
  return {
    data: new Float32Array(bytes.buffer, bytes.byteOffset, width * height),
    width,
    height,
    cellSizeDegrees,
    north: 90,
    west: -180,
    populatedCells: header.populatedCells,
    source: header.source,
    sourceName: header.sourceName,
  };
}

async function writeCachedMeanGrid(mean) {
  if (!meanCacheEnabled) return;
  const { binary, sidecar } = meanCachePaths();
  await mkdir(workDirectory, { recursive: true });
  await writeFile(
    `${binary}.tmp`,
    Buffer.from(mean.data.buffer, mean.data.byteOffset, mean.data.length * 4),
  );
  await rename(`${binary}.tmp`, binary);
  await writeFile(
    sidecar,
    `${JSON.stringify(
      {
        cellSizeDegrees,
        height,
        note:
          "Area-weighted mean VIIRS radiance per output cell, float32 " +
          "little-endian, row-major from the northern edge. Rebuilt by " +
          "packages/portal/scripts/prepare-sky-quality-raster.mjs; safe to delete.",
        populatedCells: mean.populatedCells,
        product,
        source: mean.source,
        sourceName: mean.sourceName,
        unit: "nW/cm2/sr",
        width,
      },
      null,
      2,
    )}\n`,
  );
  process.stderr.write(`Cached resampled grid in ${binary}\n`);
}

function manifestFor(grid, { year, sourceName, checksum }) {
  return {
    attribution: eogAttribution,
    attributionCredit: eogShortCredit,
    attributionSource: eogLicenseUrl,
    checksum: `sha256:${checksum}`,
    citation: eogCitation,
    encoding: {
      inverse: "radiance = offset * (10 ** (level * scale / (levels - 1)) - 1)",
      kind: "log8",
      levels: skyQualityRadianceLevels,
      maximum: skyQualityRadianceMaximum,
      offset: skyQualityRadianceOffset,
      unit: "nW/cm2/sr",
    },
    file: rasterName,
    generatedAt: new Date().toISOString(),
    grid: {
      bytes: grid.width * grid.height,
      cellSizeDegrees: grid.cellSizeDegrees,
      height: grid.height,
      north: grid.north,
      populatedCells: grid.populatedCells,
      west: grid.west,
      width: grid.width,
    },
    license: "CC BY 4.0",
    product,
    productUrl: eogProductUrl,
    propagation: {
      ...skyQualityKernelParameters,
      coarseArcminutes,
      peakRadiance: grid.peakRadiance,
      split: skyQualityKernelSplit,
      summary:
        "each cell holds the radiance of its surroundings summed with the " +
        "distance kernel below, divided by the kernel's surface integral",
    },
    resampling:
      "area-weighted mean of the source cells falling in each output cell, " +
      "then propagated with the distance kernel recorded under `propagation`",
    source: grid.source,
    sourceFile: sourceName,
    version: productVersion,
    year,
  };
}

async function writeOutputs(grid, { year, sourceName }) {
  await mkdir(outputDirectory, { recursive: true });
  const checksum = createHash("sha256").update(grid.data).digest("hex");
  const rasterPath = join(outputDirectory, rasterName);
  const temporary = `${rasterPath}.tmp`;
  const handle = await open(temporary, "w");
  try {
    await handle.write(grid.data);
  } finally {
    await handle.close();
  }
  await rename(temporary, rasterPath);
  const manifest = manifestFor(grid, { year, sourceName, checksum });
  await writeFile(
    join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  process.stderr.write(
    `Wrote ${rasterPath} (${grid.data.length} bytes, ${grid.populatedCells} ` +
      `populated cells, sha256:${checksum})\n`,
  );
  return manifest;
}

// The offline pack's own downloadable variant: `deriveSkyQualityPackGrid`
// (packages/portal/src/sky-quality.js) is the same function
// packages/portal/src/planner/sky-quality.server.js calls lazily at request
// time, so an administrator who runs this up front and one who never does end
// up with byte-identical `pack/raster.bin` files for the same installed
// source raster. Written atomically in the same order the lazy path uses:
// raster.bin, then its precomputed raster.bin.gz (design doc §1's "raster
// served as Content-Encoding: gzip"), then manifest.json last — a reader that
// sees the manifest can assume both binaries are already in place.
async function writePackOutputs(grid, sourceManifest, { factor }) {
  const derived = deriveSkyQualityPackGrid(
    {
      width: grid.width,
      height: grid.height,
      cellSizeDegrees: grid.cellSizeDegrees,
      north: grid.north,
      west: grid.west,
      data: grid.data,
    },
    {
      offset: skyQualityRadianceOffset,
      maximum: skyQualityRadianceMaximum,
      levels: skyQualityRadianceLevels,
    },
    factor,
  );
  await mkdir(packDirectory, { recursive: true });
  const checksum = createHash("sha256").update(derived.data).digest("hex");

  const rasterPath = join(packDirectory, packRasterName);
  const rasterTemporary = `${rasterPath}.tmp`;
  const handle = await open(rasterTemporary, "w");
  try {
    await handle.write(derived.data);
  } finally {
    await handle.close();
  }
  await rename(rasterTemporary, rasterPath);

  const gzipPath = `${rasterPath}.gz`;
  await writeFile(`${gzipPath}.tmp`, gzipSync(derived.data, { level: 9 }));
  await rename(`${gzipPath}.tmp`, gzipPath);

  const manifest = skyQualityPackManifest(sourceManifest, derived, {
    factor,
    checksum,
  });
  const manifestPath = join(packDirectory, packManifestName);
  await writeFile(
    `${manifestPath}.tmp`,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await rename(`${manifestPath}.tmp`, manifestPath);

  process.stderr.write(
    `Wrote ${rasterPath} (${derived.data.length} bytes, ` +
      `${derived.populatedCells} populated cells, sha256:${checksum}, ` +
      `${factor}×${factor} block mean of the ${grid.width}×` +
      `${grid.height} raster)\n`,
  );
}

// A few-degree cut of the same raster at the same encoding, for the sampling
// tests. `--fixture-tile=off` skips it.
async function writeFixtureTile(grid, { year, sourceName }) {
  const target = option(
    "--fixture-tile",
    join(
      repositoryRoot,
      "packages/astro-contracts/fixtures/sky-quality-tile.json",
    ),
  );
  if (target === "off" || target === true) return;
  const bounds = String(option("--fixture-tile-bounds", "-4,-2,0,2"))
    .split(",")
    .map(Number);
  if (bounds.length !== 4 || bounds.some((value) => !Number.isFinite(value)))
    fail("--fixture-tile-bounds must be W,S,E,N in degrees.");
  const [west, south, east, north] = bounds;
  const column0 = Math.round((west - grid.west) / grid.cellSizeDegrees);
  const row0 = Math.round((grid.north - north) / grid.cellSizeDegrees);
  const tileWidth = Math.round((east - west) / grid.cellSizeDegrees);
  const tileHeight = Math.round((north - south) / grid.cellSizeDegrees);
  if (
    tileWidth < 1 ||
    tileHeight < 1 ||
    column0 < 0 ||
    row0 < 0 ||
    column0 + tileWidth > grid.width ||
    row0 + tileHeight > grid.height
  )
    fail("--fixture-tile-bounds falls outside the raster.");
  const tile = Buffer.alloc(tileWidth * tileHeight);
  for (let row = 0; row < tileHeight; row += 1)
    grid.data.copy(
      tile,
      row * tileWidth,
      (row0 + row) * grid.width + column0,
      (row0 + row) * grid.width + column0 + tileWidth,
    );
  const payload = {
    bounds: { east, north, south, west },
    cellSizeDegrees: grid.cellSizeDegrees,
    data: tile.toString("base64"),
    encoding: {
      kind: "log8",
      levels: skyQualityRadianceLevels,
      maximum: skyQualityRadianceMaximum,
      offset: skyQualityRadianceOffset,
      unit: "nW/cm2/sr",
    },
    height: tileHeight,
    module: "sky-quality-tile",
    north,
    note: String(
      option(
        "--fixture-tile-note",
        "A few-degree cut of the prepared raster, for the sampling tests.",
      ),
    ),
    source: { product, sourceFile: sourceName, version: productVersion, year },
    west,
    width: tileWidth,
  };
  await writeFile(String(target), `${JSON.stringify(payload, null, 2)}\n`);
  process.stderr.write(
    `Wrote ${target} (${tileWidth}×${tileHeight} cells, ${tile.length} bytes)\n`,
  );
}

await main();
