import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { placeCoordinates } from "./state.js";
import {
  bortleFromSqm,
  deriveSkyQualityPackGrid,
  nearestSkyQualityRadiance,
  sampleSkyQualityRadiance,
  skyQualityCalibrationAt,
  skyQualityCalibrationVersion,
  skyQualityEstimateMethod,
  skyQualityPackDefaultArcminutes,
  skyQualityPackManifest,
  sqmFromViirsRadiance,
} from "../sky-quality.js";
import {
  skyBrightnessByDirection,
  skyQualityWindowFromGrid,
} from "../sky-quality-direction.js";
import { plannerReferenceCacheWindows } from "./reference-cache.js";

const providerError = (code = "provider", retryAfterSeconds = 300) =>
  Object.assign(new Error("Sky-quality estimate temporarily unavailable."), {
    code,
    retryAfterSeconds,
  });

// The raster is private initialization data, not application code: it lives
// beside the rest of the static-data package. The resolution order mirrors
// portal-app/lib/config.server.js, which packages/portal must not import.
export function skyQualityRasterDirectory() {
  const explicit = process.env.ASTRO_PORTAL_SKY_QUALITY_RASTER_DIR;
  if (explicit) return resolve(explicit);
  const serviceDirectory = resolve(
    process.env.ASTRO_PORTAL_SERVICE_DIR || process.cwd(),
  );
  const runtimeDirectory = resolve(
    process.env.ASTRO_PORTAL_RUNTIME_DIR ||
      join(serviceDirectory, ".astro-portal"),
  );
  const staticDataDirectory = resolve(
    process.env.ASTRO_PORTAL_STATIC_DATA_DIR ||
      join(runtimeDirectory, "..", "static-data"),
  );
  return join(staticDataDirectory, "sky-quality");
}

let rasterPromise = null;
let rasterWarned = false;

// Test seam: the raster is read once per process, so a suite that installs or
// removes one has to drop the memo explicitly. Also drops the offline pack's
// own warn-once flag and in-flight derivation below, for the same reason.
export function resetSkyQualityRaster() {
  rasterPromise = null;
  rasterWarned = false;
  packWarned = false;
  packInFlight = null;
}

/**
 * Read `manifest.json` and the encoded byte grid once, then keep both in
 * memory: a 2' global grid is 10800 × 5400 = 58 320 000 bytes, a 5' one
 * 4320 × 2160 = 9 331 200. Every later request samples the buffer, so the
 * hot path never touches the filesystem. A missing or malformed raster is a
 * warning logged once and a null result — never a throw, and never an
 * outbound request.
 */
export function loadSkyQualityRaster(directory) {
  if (!rasterPromise) rasterPromise = readSkyQualityRaster(directory);
  return rasterPromise;
}

async function readSkyQualityRaster(directory) {
  const root = directory ? resolve(directory) : skyQualityRasterDirectory();
  try {
    const manifest = JSON.parse(
      await readFile(join(root, "manifest.json"), "utf8"),
    );
    const name =
      typeof manifest?.file === "string" ? manifest.file : "raster.bin";
    if (!/^[\w.-]+$/.test(name))
      throw new Error(`Unsafe raster file name "${name}".`);
    const year = Number(manifest?.year);
    if (!Number.isInteger(year) || year < 2012 || year > 2999)
      throw new Error(`Unusable composite year "${manifest?.year}".`);
    const grid = {
      cellSizeDegrees: Number(manifest?.grid?.cellSizeDegrees),
      data: await readFile(join(root, name)),
      height: Number(manifest?.grid?.height),
      north: Number(manifest?.grid?.north ?? 90),
      west: Number(manifest?.grid?.west ?? -180),
      width: Number(manifest?.grid?.width),
    };
    if (grid.data.length !== grid.width * grid.height)
      throw new Error(
        `Raster is ${grid.data.length} bytes, manifest declares ` +
          `${grid.width} × ${grid.height}.`,
      );
    // The raster's identity, for the caches of what is derived from it (the
    // brightness by direction): the manifest's own checksum, else the bytes'.
    const checksum =
      typeof manifest?.checksum === "string" && manifest.checksum
        ? manifest.checksum
        : `sha256:${createHash("sha256").update(grid.data).digest("hex")}`;
    // Whether the cells carry the glow of the cities around them
    // (`propagation` in the manifest): a raster made without it reads zero
    // light in a mountain valley next to a city.
    return {
      attribution: manifest?.attribution || null,
      checksum,
      grid,
      propagated: Boolean(manifest?.propagation),
      year,
    };
  } catch (cause) {
    if (!rasterWarned) {
      rasterWarned = true;
      console.warn(
        `Sky-quality raster unavailable in ${root}: ${cause?.message}. ` +
          "Run packages/portal/scripts/prepare-sky-quality-raster.mjs; see docs/SKY_QUALITY_RASTER.md.",
      );
    }
    return null;
  }
}

/**
 * The part of the installed raster around a place that
 * `skyBrightnessByDirection` (packages/portal/src/sky-quality-direction.js)
 * needs: the raster's own cells within `radiusKm`, decoded. `null` when no
 * raster is installed or the coordinates are unusable — never a throw, never
 * an outbound request. `raster` is the loader, injectable for tests.
 */
export async function loadSkyQualityWindow({
  latitude,
  longitude,
  radiusKm,
  raster = loadSkyQualityRaster,
} = {}) {
  const installed = await raster();
  if (!installed?.grid) return null;
  return skyQualityWindowFromGrid(
    installed.grid,
    latitude,
    longitude,
    radiusKm,
  );
}

// ── Offline pack: the downloadable 6' raster ─────────
//
// A separate memo from `rasterPromise` above on purpose: that one is read
// once per process and kept forever (by design — a test has to call
// `resetSkyQualityRaster()` to force a reload), which is wrong for this
// freshness check, which must notice a source raster the ADMINISTRATOR
// replaces WHILE the server keeps running. So this reads the small
// `manifest.json` fresh on every call — cheap, a few hundred bytes — and
// only reads the multi-megabyte `raster.bin` when it actually has to derive.
let packWarned = false;
let packInFlight = null;

const packFileName = "raster.bin";
const packManifestFileName = "manifest.json";

/** The installed SOURCE raster's own manifest, read fresh (never from the
 * `rasterPromise` memo above), reduced to exactly what deriving a pack
 * variant needs. `null` for anything that makes deriving unsafe: an unsafe
 * file name, a missing/non-log8 encoding, or a missing `checksum` — the pack
 * derivation's only way to detect that the source later changed. */
async function readInstalledSourceDescriptor(root) {
  try {
    const manifest = JSON.parse(
      await readFile(join(root, "manifest.json"), "utf8"),
    );
    const name =
      typeof manifest?.file === "string" ? manifest.file : "raster.bin";
    if (!/^[\w.-]+$/.test(name)) return null;
    const width = Number(manifest?.grid?.width);
    const height = Number(manifest?.grid?.height);
    const cellSizeDegrees = Number(manifest?.grid?.cellSizeDegrees);
    const offset = Number(manifest?.encoding?.offset);
    const maximum = Number(manifest?.encoding?.maximum);
    const levels = Number(manifest?.encoding?.levels);
    const checksum =
      typeof manifest?.checksum === "string" ? manifest.checksum : null;
    if (
      !Number.isInteger(width) ||
      width < 1 ||
      !Number.isInteger(height) ||
      height < 1 ||
      !Number.isFinite(cellSizeDegrees) ||
      cellSizeDegrees <= 0 ||
      manifest?.encoding?.kind !== "log8" ||
      !Number.isFinite(offset) ||
      !Number.isFinite(maximum) ||
      !Number.isInteger(levels) ||
      !checksum
    )
      return null;
    return {
      manifest,
      name,
      width,
      height,
      cellSizeDegrees,
      north: Number(manifest?.grid?.north ?? 90),
      west: Number(manifest?.grid?.west ?? -180),
      encoding: { offset, maximum, levels },
      checksum,
    };
  } catch {
    return null;
  }
}

/** Whatever pack files are already on disk, verbatim — used both as the
 * up-to-date fast path and as the fallback when deriving fails or there is
 * no source raster to derive from at all. */
async function readExistingPack(packDirectory) {
  try {
    const manifest = JSON.parse(
      await readFile(join(packDirectory, packManifestFileName), "utf8"),
    );
    const raster = await readFile(join(packDirectory, packFileName));
    return { manifest, raster };
  } catch {
    return null;
  }
}

/** `raster.bin`, then its precomputed `raster.bin.gz` (for
 * `GET /v1/offline-pack/sky-quality/raster.bin`'s gzip negotiation), then
 * `manifest.json` last — a reader that observes the manifest can assume
 * both binaries are already fully in place. Each file is written to a
 * `.tmp` sibling and renamed into place, so a reader never observes a
 * partially written file. */
async function writePackFilesAtomically(packDirectory, data, manifest) {
  await mkdir(packDirectory, { recursive: true });

  const rasterPath = join(packDirectory, packFileName);
  await writeFile(`${rasterPath}.tmp`, data);
  await rename(`${rasterPath}.tmp`, rasterPath);

  const gzipPath = `${rasterPath}.gz`;
  await writeFile(`${gzipPath}.tmp`, gzipSync(data, { level: 9 }));
  await rename(`${gzipPath}.tmp`, gzipPath);

  const manifestPath = join(packDirectory, packManifestFileName);
  await writeFile(
    `${manifestPath}.tmp`,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await rename(`${manifestPath}.tmp`, manifestPath);
}

async function deriveAndWritePack(root, packDirectory, source, arcminutes) {
  const targetCellSizeDegrees = arcminutes / 60;
  const factor = Math.round(targetCellSizeDegrees / source.cellSizeDegrees);
  const isExactMultiple =
    factor >= 1 &&
    Math.abs(factor * source.cellSizeDegrees - targetCellSizeDegrees) < 1e-9 &&
    source.width % factor === 0 &&
    source.height % factor === 0;
  if (!isExactMultiple)
    throw new Error(
      `cannot derive a ${arcminutes}' offline-pack raster from a ` +
        `${source.cellSizeDegrees * 60}' source (not an exact block factor)`,
    );
  const sourceRaster = await readFile(join(root, source.name));
  if (sourceRaster.length !== source.width * source.height)
    throw new Error("installed raster size does not match its manifest");
  const grid = deriveSkyQualityPackGrid(
    {
      width: source.width,
      height: source.height,
      cellSizeDegrees: source.cellSizeDegrees,
      north: source.north,
      west: source.west,
      data: sourceRaster,
    },
    source.encoding,
    factor,
  );
  const checksum = createHash("sha256").update(grid.data).digest("hex");
  const manifest = skyQualityPackManifest(source.manifest, grid, {
    factor,
    checksum,
  });
  await writePackFilesAtomically(packDirectory, grid.data, manifest);
  return { manifest, raster: grid.data };
}

/**
 * Ensures the offline pack's own downloadable raster is present and up to
 * date under `<static-data>/sky-quality/pack/`, deriving it from the
 * installed source raster with `deriveSkyQualityPackGrid`
 * (packages/portal/src/sky-quality.js) the first time it is needed, and
 * again whenever the source raster's own `checksum` changes — recorded in
 * the pack manifest's `derivedFrom.checksum`, so a request that changes
 * nothing never re-derives.
 *
 * Never throws.
 * - No source raster installed: nothing to derive from or validate against,
 *   so whatever is already on disk under `pack/` is served as is (built
 *   earlier by this function, or by
 *   `packages/portal/scripts/prepare-sky-quality-raster.mjs --pack-arcminutes`),
 *   or `null` if there is nothing there either.
 * - A source raster IS installed but deriving or writing fails (read-only
 *   `<static-data>`, a corrupt source): a warning is logged once and
 *   whatever pack was already on disk is served instead — `null` if there
 *   was none. `GET /v1/offline-pack` then simply omits the `sky-quality`
 *   component; it never turns this into a `500`.
 */
export async function ensureSkyQualityPackRaster({
  arcminutes = skyQualityPackDefaultArcminutes,
} = {}) {
  if (packInFlight) return packInFlight;
  packInFlight = (async () => {
    const root = skyQualityRasterDirectory();
    const packDirectory = join(root, "pack");
    const existing = await readExistingPack(packDirectory);
    const source = await readInstalledSourceDescriptor(root);
    if (!source) return existing;
    if (existing?.manifest?.derivedFrom?.checksum === source.checksum)
      return existing;
    try {
      return await deriveAndWritePack(root, packDirectory, source, arcminutes);
    } catch (cause) {
      if (!packWarned) {
        packWarned = true;
        console.warn(
          `Offline-pack sky-quality raster derivation failed in ${packDirectory}: ` +
            `${cause?.message}. Serving the previous pack raster if one exists; ` +
            "the sky-quality component will be absent from GET /v1/offline-pack otherwise.",
        );
      }
      return existing;
    }
  })();
  try {
    return await packInFlight;
  } finally {
    packInFlight = null;
  }
}

// Whether a cached payload is stale by version. A cached
// payload is stale-by-version — regardless of how recently it was fetched —
// when its own `method` disagrees with the current `skyQualityEstimateMethod`,
// or its own `calibration` disagrees with the calibration label the CURRENT
// table resolves for `latitude`/`longitude`. A payload that predates the
// `calibration` field entirely reads as `undefined`, which never equals a
// real label, so it is stale too.
//
// Deliberately separate from `plannerReferenceCacheState`
// (packages/portal/src/planner/reference-cache.js): that function's output is
// pinned by the `reference-cache-state` conformance fixture, and only ever answers "how old is this". Whether a payload still
// describes what the CURRENT code would compute is a different question,
// decided here, at the point that already knows both the payload and the
// place it was computed for.
export function isSkyQualityEstimateStale(payload, latitude, longitude) {
  if (payload?.method !== skyQualityEstimateMethod) return true;
  const calibration = skyQualityCalibrationAt(latitude, longitude);
  return (
    payload?.calibration !== `${skyQualityCalibrationVersion}/${calibration.id}`
  );
}

// The annual VIIRS composite changes far less often than a weather forecast.
// Keep one rounded-location estimate for a month, retain it as a fallback for
// a year, and never return the queried coordinates to the client. Sampling a
// local raster is cheap, but the cache still holds the freshness contract the
// clients already implement.
export function createPlannerSkyQualityCache({
  raster = loadSkyQualityRaster,
  now = Date.now,
  freshMs = plannerReferenceCacheWindows.skyQuality.freshMs,
  staleMs = plannerReferenceCacheWindows.skyQuality.staleMs,
  retryMs = plannerReferenceCacheWindows.skyQuality.retryMs,
} = {}) {
  const entries = new Map();
  const pending = new Map();

  return async function load(value) {
    const coordinates = placeCoordinates(value);
    if (!coordinates)
      throw Object.assign(new Error("Invalid coordinates."), {
        code: "coordinates",
      });
    const latitude = Number(coordinates.latitude.toFixed(3));
    const longitude = Number(coordinates.longitude.toFixed(3));
    // Prefixed with the calibration-set version so a deploy that changes a
    // regional constant (packages/portal/src/sky-quality.js) never serves an
    // estimate memoized under the OLD calibration: the key simply stops
    // matching, and the position is recomputed from scratch.
    const key = `${skyQualityCalibrationVersion}:${latitude}:${longitude}`;
    const stamp = now();
    const entry = entries.get(key);
    // A payload computed by an earlier method or calibration is refreshed
    // the moment it is asked for, however recently it was fetched — it still
    // falls through to the stale-on-failure fallback below like any other
    // cache miss, so it stays displayable (marked `stale: true`) if the
    // refresh itself fails.
    const versionStale =
      entry?.payload &&
      isSkyQualityEstimateStale(entry.payload, latitude, longitude);
    if (entry?.payload && !versionStale && stamp - entry.fetchedAt < freshMs)
      return { ...entry.payload, stale: false };
    if (entry?.retryAt > stamp) {
      if (entry.payload && stamp - entry.fetchedAt < staleMs)
        return { ...entry.payload, stale: true };
      throw entry.error;
    }
    if (pending.has(key)) return pending.get(key);

    const request = (async () => {
      try {
        const installed = await raster();
        if (!installed)
          throw providerError("provider", Math.ceil(retryMs / 1000));
        // Nearest neighbour is the raw cell the place falls in; the bilinear
        // pass refines it across the four surrounding cells and degenerates
        // to the nearest value at the grid's latitude edges.
        //
        // The cell does not hold the radiance the satellite measured there:
        // the preparation script has already summed the radiance of
        // everything within 300 km with a distance kernel, so a dark valley
        // downwind of a city carries that city's glow rather than the zero
        // the `average_masked` product gives it. Propagating at preparation
        // time is what keeps this path a plain array lookup, and what lets
        // a future light-pollution map read the same field.
        // Two limits the response still cannot express, hence
        // `estimated: true`: terrain screening a site from a nearby city is
        // not modelled, and neither is the observer's altitude.
        // docs/SKY_QUALITY_RASTER.md carries the measurements and sources.
        const nearest = nearestSkyQualityRadiance(
          installed.grid,
          latitude,
          longitude,
        );
        const refined = sampleSkyQualityRadiance(
          installed.grid,
          latitude,
          longitude,
        );
        const radiance = refined === null ? nearest : refined;
        const sqm = sqmFromViirsRadiance(radiance, latitude, longitude);
        const bortleClass = bortleFromSqm(sqm);
        if (sqm === null || bortleClass === null) throw providerError();
        const fetchedAt = now();
        const calibration = skyQualityCalibrationAt(latitude, longitude);
        const payload = {
          bortleClass,
          sqm,
          source: `viirs-vnl-${installed.year}`,
          method: skyQualityEstimateMethod,
          estimated: true,
          calculatedAt: new Date(fetchedAt).toISOString(),
          // Additive, optional (packages/astro-contracts/schemas/api/sky-quality.schema.json):
          // `<calibration-set version>/<region id>`, e.g. "2026-09/japan" or
          // "2026-09/global". A client may treat a cached estimate whose
          // `calibration` differs from the current one as stale.
          calibration: `${skyQualityCalibrationVersion}/${calibration.id}`,
        };
        entries.delete(key);
        entries.set(key, { payload, fetchedAt });
        while (entries.size > 128) entries.delete(entries.keys().next().value);
        return { ...payload, stale: false };
      } catch (cause) {
        const error = ["provider", "rate_limit"].includes(cause?.code)
          ? cause
          : providerError();
        entries.set(key, {
          ...entry,
          error,
          retryAt: now() + error.retryAfterSeconds * 1000,
        });
        while (entries.size > 128) entries.delete(entries.keys().next().value);
        if (entry?.payload && now() - entry.fetchedAt < staleMs)
          return { ...entry.payload, stale: true };
        throw error;
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, request);
    return request;
  };
}

export const loadPlannerSkyQuality = createPlannerSkyQualityCache();

// The brightness by direction (`GET /v1/sky-quality/direction`): the grid
// `skyBrightnessByDirection` estimates around a place, from the installed
// raster. A derived value: computed once per place (coordinates rounded to
// 0.01°, about a kilometre, far finer than the raster) and per raster
// checksum, kept in memory, never stored. Without a raster it fails
// exactly like the zenith estimate, with the same retry.
export function createPlannerSkyDirectionCache({
  raster = loadSkyQualityRaster,
  now = Date.now,
  retryMs = plannerReferenceCacheWindows.skyQuality.retryMs,
  limit = 64,
} = {}) {
  const entries = new Map();
  return async function load(value) {
    const coordinates = placeCoordinates(value);
    if (!coordinates)
      throw Object.assign(new Error("Invalid coordinates."), {
        code: "coordinates",
      });
    const latitude = Number(coordinates.latitude.toFixed(2));
    const longitude = Number(coordinates.longitude.toFixed(2));
    const installed = await raster();
    if (!installed?.grid)
      throw providerError("provider", Math.ceil(retryMs / 1000));
    const calibration = `${skyQualityCalibrationVersion}/${
      skyQualityCalibrationAt(latitude, longitude).id
    }`;
    const key = `${calibration}:${installed.checksum}:${latitude}:${longitude}`;
    const cached = entries.get(key);
    if (cached) return cached;
    const window = skyQualityWindowFromGrid(
      installed.grid,
      latitude,
      longitude,
    );
    const estimate = window
      ? skyBrightnessByDirection({ latitude, longitude, window })
      : null;
    if (!estimate) throw providerError();
    const payload = {
      model: estimate.model,
      estimate: true,
      azimuthStepDegrees: estimate.azimuthStepDegrees,
      altitudes: estimate.altitudes,
      sqm: estimate.sqm,
      zenithSqm: estimate.zenithSqm,
      source: `viirs-vnl-${installed.year}`,
      rasterChecksum: installed.checksum ?? null,
      calibration,
      calculatedAt: new Date(now()).toISOString(),
    };
    entries.set(key, payload);
    while (entries.size > limit) entries.delete(entries.keys().next().value);
    return payload;
  };
}

export const loadPlannerSkyDirection = createPlannerSkyDirectionCache();
