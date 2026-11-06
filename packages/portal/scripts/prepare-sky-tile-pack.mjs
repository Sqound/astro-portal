#!/usr/bin/env node
/*
 * Fills the self-hosted HiPS tile mirror's disk cache for one survey up to
 * a chosen order, and builds every archive an offline-pack tier needs — so
 * the first mobile device to ask for that tier gets an immediate `200`
 * instead of paying for the CDS latency itself ("an administrator fills
 * the mirror overnight").
 *
 * Run manually, offline, by a portal administrator. It uses the exact same
 * mirror (`packages/portal/src/sky-tiles/mirror.js`) a live request would:
 * the same process-wide semaphore, the same bounded exponential backoff, the
 * same `User-Agent` — so this script is no less polite to the CDS than the
 * mirror already is, just run ahead of any device asking.
 *
 * Resumable: every tile and every archive this script asks the mirror for
 * is checked on disk first, exactly as a live request would be, so
 * re-running the same command after an interruption (Ctrl-C, a network
 * outage) picks up wherever it left off rather than re-fetching from order 0.
 *
 * Usage:
 *   npm run prepare:sky-tile-pack -- --survey dss-colour --max-order 3
 *     [--mirror-dir <dir>] [--concurrency <n>] [--sample <n>]
 *
 * `--sample <n>`: for every order STRICTLY ABOVE `--max-order` (up to the
 * survey's own `maxOrder`), fetches `n` tiles picked with a fixed seed
 * (reproducible across runs) to measure their mean size WITHOUT building an
 * archive for that order — this is exactly how orders 4-6's own
 * `dssColourMeanTileBytesByOrder` entries were measured by hand, 2026-09-20,
 * before this option existed. The sampled tiles are still written through
 * the ordinary mirror cache (and so still count towards
 * `observedMeanTileBytes`'s own per-order threshold) — sampling is only
 * "no archive", never "no disk cache".
 */
import { resolve } from "node:path";

import {
  archiveTileAddresses,
  healpixPixelCount,
  tierArchiveAddresses,
} from "../src/sky-tiles/geometry.js";
import {
  createSkyTileMirror,
  skyTileMirrorConcurrency,
  skyTileMirrorDirectory,
} from "../src/sky-tiles/mirror.js";
import {
  archiveCumulativeCount,
  dssColourMeanTileBytesByOrder,
  dssColourMeanTileBytesForOrder,
  skyBackdropArchiveChunkDelta,
  skyBackdropSurveys,
  skyBackdropTierDefinitions,
  skyBackdropTiers,
} from "../src/sky-tiles/surveys.js";

const options = new Map();
for (const argument of process.argv.slice(2)) {
  const [name, ...values] = argument.split("=");
  options.set(name, values.length ? values.join("=") : true);
}
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (!argument.startsWith("--") || argument.includes("=")) continue;
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    options.set(argument, next);
    index += 1;
  }
}
const option = (name, fallback = null) => {
  const value = options.get(name);
  return value === undefined || value === true ? fallback : value;
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

const surveyId = String(option("--survey", "dss-colour"));
const survey = skyBackdropSurveys[surveyId];
if (!survey) {
  fail(
    `Unknown survey "${surveyId}". Known surveys: ${Object.keys(skyBackdropSurveys).join(", ")}.`,
  );
}

const maxOrder = Number(option("--max-order"));
if (!Number.isInteger(maxOrder) || maxOrder < 0)
  fail("--max-order is required and must be a non-negative integer.");
if (maxOrder > survey.maxOrder)
  fail(
    `--max-order ${maxOrder} exceeds survey "${surveyId}"'s own maxOrder ${survey.maxOrder}.`,
  );
// The fixed low-order archive always covers every order from 0 through
// archiveChunkDelta - 1 as one indivisible unit (design doc §2) — asking
// for less than that would silently fetch more than requested, which is
// worse than simply refusing.
if (maxOrder < skyBackdropArchiveChunkDelta - 1)
  fail(
    `--max-order must be at least ${skyBackdropArchiveChunkDelta - 1} ` +
      `(the fixed low-order archive covers orders 0..${skyBackdropArchiveChunkDelta - 1} as one unit).`,
  );

const mirrorDirectoryOption = option("--mirror-dir");
const concurrencyOption = option("--concurrency");

const sampleOption = option("--sample");
let sampleCount = null;
if (sampleOption !== null) {
  sampleCount = Number(sampleOption);
  if (!Number.isInteger(sampleCount) || sampleCount <= 0)
    fail("--sample must be a positive integer.");
}

const mirror = createSkyTileMirror({
  directory: mirrorDirectoryOption
    ? resolve(mirrorDirectoryOption)
    : skyTileMirrorDirectory(),
  concurrency: concurrencyOption
    ? Number(concurrencyOption)
    : skyTileMirrorConcurrency(),
});

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB"];
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDuration(ms) {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${Math.round(seconds - minutes * 60)}s`;
}

// A FIXED seed (an arbitrary constant, never the clock or any other varying
// input) — the whole point of `--sample`'s reproducibility is that the same
// `(order, tileCount, count)` triple always samples the exact same pixels,
// run after run, host after host, so a re-measurement is directly
// comparable to an earlier one rather than noise from a different draw.
const sampleFixedSeed = 0x5a4d_5031; // "ZMP1" as ASCII bytes — arbitrary, fixed.

/** A tiny, dependency-free seeded PRNG (mulberry32) — deterministic given
 * `seed`, which is all `--sample`'s reproducibility needs; not intended for
 * anything security-sensitive. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` distinct NESTED pixels at `order` (out of `tileCount` total),
 * chosen deterministically from `sampleFixedSeed` combined with `order` —
 * so different orders draw different, but each individually reproducible,
 * samples. Sorted ascending purely so the fetch log reads in a sane order;
 * the mirror does not care. */
function seededSamplePixels(order, tileCount, count) {
  const random = mulberry32(sampleFixedSeed ^ order);
  const n = Math.min(count, tileCount);
  const chosen = new Set();
  while (chosen.size < n) chosen.add(Math.floor(random() * tileCount));
  return [...chosen].sort((a, b) => a - b);
}

/** Waits for one archive to finish building, printing its live progress at
 * a fixed cadence rather than flooding stderr with one line per tile. */
async function waitForArchive(address) {
  let lastReportedDone = -1;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const result = await mirror.ensureArchive({
      survey,
      order: address.order,
      chunkOrder: address.chunkOrder,
      chunkPix: address.chunkPix,
      addresses: address.addresses,
    });
    if (result.status === "ready") return result;
    if (result.status === "unavailable")
      fail(
        `Archive Norder${address.order}/Chunk${address.chunkOrder}/${address.chunkPix}.tar ` +
          `is unavailable: upstream keeps failing (retry in ${result.retryAfterSeconds}s). Aborting.`,
      );
    if (result.done !== lastReportedDone) {
      lastReportedDone = result.done;
      process.stderr.write(
        `\r  Norder${address.order}/Chunk${address.chunkOrder}/${address.chunkPix}.tar: ` +
          `${result.done}/${result.total} tiles`,
      );
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
}

async function main() {
  const startedAt = Date.now();
  console.log(
    `Preparing the "${surveyId}" sky-tile pack up to order ${maxOrder} ` +
      `in ${mirror.directory} (concurrency ${mirror.concurrency}).`,
  );

  // Fill the tile cache order by order. Every tile already on disk (from a
  // previous, interrupted run) is a no-op — ensureTile checks the cache
  // before ever touching the network — so this loop is what makes the whole
  // script resumable for free.
  const perOrder = [];
  for (let order = 0; order <= maxOrder; order += 1) {
    const tileCount = healpixPixelCount(order);
    const orderStartedAt = Date.now();
    let fetched = 0;
    let cached = 0;
    let bytes = 0;
    const pending = [];
    for (let pix = 0; pix < tileCount; pix += 1) {
      pending.push(
        mirror
          .ensureTile({ survey, order, pix, extension: survey.format })
          .then((result) => {
            if (result.status !== "ready")
              fail(
                `Tile Norder${order}/Npix${pix}.${survey.format} is unavailable: ` +
                  `upstream keeps failing (retry in ${result.retryAfterSeconds}s). Aborting.`,
              );
            if (result.fresh) fetched += 1;
            else cached += 1;
            bytes += result.size;
          }),
      );
    }
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(pending);
    const elapsedMs = Date.now() - orderStartedAt;
    perOrder.push({ order, tileCount, fetched, cached, bytes, elapsedMs });
    console.log(
      `  order ${order}: ${tileCount} tiles (${fetched} fetched, ${cached} already cached), ` +
        `${formatBytes(bytes)}, ${formatDuration(elapsedMs)}` +
        (fetched > 0
          ? ` (mean ${formatBytes(Math.round(bytes / tileCount))}/tile)`
          : ""),
    );
  }

  // Assemble the archives every offline-pack tier up to maxOrder is made of.
  // Every tile they need is already cached by the step above, so this step
  // costs disk I/O only, never another upstream request (an archive is built
  // from tiles already cached, when they are).
  const archiveAddresses = tierArchiveAddresses(
    maxOrder,
    skyBackdropArchiveChunkDelta,
  ).map((address) => ({
    ...address,
    addresses: archiveTileAddresses(address, {
      maxOrder: survey.maxOrder,
      archiveChunkDelta: skyBackdropArchiveChunkDelta,
    }),
  }));
  console.log(`Building ${archiveAddresses.length} archive(s)...`);
  let archivesBuilt = 0;
  let totalArchiveBytes = 0;
  // Real size, per archive, keyed exactly like the mirror's own archive
  // index (`Norder{order}/Chunk{chunkOrder}/{chunkPix}.tar`) — what the
  // per-tier EXACT totals in the summary below are computed from, rather
  // than re-deriving an estimate for a tier that is, in fact, fully built.
  const archiveSizeByKey = new Map();
  for (const address of archiveAddresses) {
    // eslint-disable-next-line no-await-in-loop
    const result = await waitForArchive(address);
    archivesBuilt += 1;
    totalArchiveBytes += result.size;
    archiveSizeByKey.set(
      `Norder${address.order}/Chunk${address.chunkOrder}/${address.chunkPix}.tar`,
      result.size,
    );
    process.stderr.write("\r");
    console.log(
      `  [${archivesBuilt}/${archiveAddresses.length}] ` +
        `Norder${address.order}/Chunk${address.chunkOrder}/${address.chunkPix}.tar ` +
        `ready (${formatBytes(result.size)})`,
    );
  }

  // Last step (optional, `--sample <n>`): for every order past `maxOrder`,
  // measure a fixed-seed sample's mean size WITHOUT building an archive —
  // exactly how orders 4-6's own documented means were first measured, by
  // hand, before this option existed.
  const sampled = [];
  if (sampleCount && maxOrder < survey.maxOrder) {
    console.log("");
    console.log(
      `Sampling ${sampleCount} tile(s) per order from ${maxOrder + 1} to ` +
        `${survey.maxOrder} (fixed seed, no archive built)...`,
    );
    for (let order = maxOrder + 1; order <= survey.maxOrder; order += 1) {
      const tileCount = healpixPixelCount(order);
      const pixels = seededSamplePixels(order, tileCount, sampleCount);
      let bytes = 0;
      let fetched = 0;
      for (const pix of pixels) {
        // eslint-disable-next-line no-await-in-loop
        const result = await mirror.ensureTile({
          survey,
          order,
          pix,
          extension: survey.format,
        });
        if (result.status !== "ready")
          fail(
            `Sample tile Norder${order}/Npix${pix}.${survey.format} is unavailable: ` +
              `upstream keeps failing (retry in ${result.retryAfterSeconds}s). Aborting.`,
          );
        bytes += result.size;
        if (result.fresh) fetched += 1;
      }
      const mean = Math.round(bytes / pixels.length);
      sampled.push({ order, sampleSize: pixels.length, bytes, mean });
      console.log(
        `  order ${order}: sampled ${pixels.length}/${tileCount} tiles ` +
          `(${fetched} fetched from upstream), mean ${formatBytes(mean)}/tile ` +
          `(documented: ${formatBytes(dssColourMeanTileBytesForOrder(order))}/tile)`,
      );
    }
  }

  const totalTiles = perOrder.reduce((sum, entry) => sum + entry.tileCount, 0);
  const totalFetched = perOrder.reduce((sum, entry) => sum + entry.fetched, 0);
  const totalBytes = perOrder.reduce((sum, entry) => sum + entry.bytes, 0);
  const durationMs = Date.now() - startedAt;

  console.log("");
  console.log("=== Summary ===");
  console.log(`Survey: ${surveyId}`);
  console.log(`Max order: ${maxOrder}`);
  console.log(
    `Tiles: ${totalTiles} (${totalFetched} fetched from upstream, ` +
      `${totalTiles - totalFetched} already cached)`,
  );
  console.log(
    `Bytes: ${totalBytes.toLocaleString("en-US")} (${formatBytes(totalBytes)})`,
  );
  console.log(`Archives built: ${archivesBuilt}`);
  console.log(
    `Archive bytes (exact, sum of the ${archivesBuilt} archive file(s) on disk): ` +
      `${totalArchiveBytes.toLocaleString("en-US")} (${formatBytes(totalArchiveBytes)})`,
  );
  console.log(`Duration: ${formatDuration(durationMs)}`);
  console.log("Mean bytes/tile by order:");
  for (const entry of perOrder) {
    const mean = entry.tileCount
      ? Math.round(entry.bytes / entry.tileCount)
      : 0;
    console.log(
      `  order ${entry.order}: ${mean.toLocaleString("en-US")} B ` +
        `(documented: ${dssColourMeanTileBytesForOrder(entry.order)} B)`,
    );
  }

  // The per-tier size this run's own measurements imply: EXACT (the real
  // archive files just built, summed) for every tier at or below `maxOrder`,
  // an ESTIMATE — from this run's own observed means, and `--sample`'s if
  // any, falling back to the documented table beyond that — otherwise. This
  // is `skyBackdropTiers` (`packages/portal-app/src/lib/offline-pack.server.js`'s own formula),
  // run here so an administrator sees exactly what the offline-pack
  // manifest is about to advertise, without starting the portal.
  const measuredMeanByOrder = { ...dssColourMeanTileBytesByOrder };
  for (const entry of perOrder)
    if (entry.tileCount)
      measuredMeanByOrder[entry.order] = Math.round(
        entry.bytes / entry.tileCount,
      );
  for (const entry of sampled) measuredMeanByOrder[entry.order] = entry.mean;
  const derivedTiers = skyBackdropTiers(
    measuredMeanByOrder,
    skyBackdropArchiveChunkDelta,
  );
  console.log("Per-tier size this run implies:");
  for (const tier of derivedTiers) {
    if (tier.maxOrder <= maxOrder) {
      const addresses = tierArchiveAddresses(
        tier.maxOrder,
        skyBackdropArchiveChunkDelta,
      );
      const exactBytes = addresses.reduce((sum, address) => {
        const key = `Norder${address.order}/Chunk${address.chunkOrder}/${address.chunkPix}.tar`;
        return sum + (archiveSizeByKey.get(key) ?? 0);
      }, 0);
      console.log(
        `  ${tier.id} (max order ${tier.maxOrder}, ${tier.tiles} tiles, ` +
          `${archiveCumulativeCount(tier.maxOrder, skyBackdropArchiveChunkDelta)} archive(s)): ` +
          `EXACT ${exactBytes.toLocaleString("en-US")} B (${formatBytes(exactBytes)})`,
      );
    } else {
      console.log(
        `  ${tier.id} (max order ${tier.maxOrder}, ${tier.tiles} tiles, ` +
          `${archiveCumulativeCount(tier.maxOrder, skyBackdropArchiveChunkDelta)} archive(s)): ` +
          `estimated ${tier.estimatedBytes.toLocaleString("en-US")} B (${formatBytes(tier.estimatedBytes)})` +
          (tier.maxOrder >
          (sampled.length ? sampled[sampled.length - 1].order : maxOrder)
            ? " — beyond any order measured this run, partly or fully extrapolated"
            : ""),
      );
    }
  }
  console.log(
    `(${skyBackdropTierDefinitions.length} tiers defined: ` +
      `${skyBackdropTierDefinitions.map((tier) => tier.id).join(", ")})`,
  );
}

await main();
