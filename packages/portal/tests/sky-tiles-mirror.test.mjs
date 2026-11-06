import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readUstarEntries } from "portal/sky-tiles/tar.js";
import {
  createSkyTileMirror,
  resetSkyTileMirror,
  skyTileMirrorConcurrency,
  skyTileMirrorDirectory,
  skyTileMirrorEnabled,
  skyTileMirrorMaxBytes,
  skyTileUpstreamUserAgent,
} from "portal/sky-tiles/mirror.js";

import {
  createFakeHipsUpstream,
  unreachableUpstreamUrl,
} from "./helpers/fake-hips-upstream.mjs";

const survey = {
  id: "dss-colour",
  format: "jpg",
  maxOrder: 9,
  archiveChunkDelta: 4,
};

/** No delay in tests: the mirror's own backoff would otherwise make an
 * "upstream keeps failing" test take several real seconds. */
const fastSleep = () => Promise.resolve();

async function tempDirectory(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

/**
 * The mirror persists its usage and archive indexes in background `.then`
 * chains (a `.part` file renamed into place) that may still be running when
 * a test reaches its `finally`. A plain recursive `rm` then races with those
 * writes and fails with ENOTEMPTY on a slow CI runner; the linear-backoff
 * retries built into `fs.rm` absorb that window.
 */
function removeTempDirectory(directory) {
  return rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 50,
  });
}

test("environment resolution: directory, concurrency, max bytes and user agent all have safe, documented defaults", async () => {
  const had = { ...process.env };
  try {
    delete process.env.ASTRO_PORTAL_SKY_TILE_MIRROR_DIR;
    delete process.env.ASTRO_PORTAL_SKY_TILE_MIRROR_CONCURRENCY;
    delete process.env.ASTRO_PORTAL_SKY_TILE_MIRROR_MAX_BYTES;
    delete process.env.ASTRO_PORTAL_UPSTREAM_USER_AGENT;
    delete process.env.ASTRO_PORTAL_SKY_TILE_MIRROR;
    process.env.ASTRO_PORTAL_SERVICE_DIR = "/tmp/astro-portal-fixture-service";
    assert.ok(skyTileMirrorDirectory().endsWith("sky-tiles"));
    assert.equal(skyTileMirrorConcurrency(), 4);
    assert.equal(skyTileMirrorMaxBytes(), 4 * 1024 * 1024 * 1024);
    assert.ok(skyTileUpstreamUserAgent().startsWith("astro-portal/"));
    assert.ok(
      !skyTileUpstreamUserAgent().includes(["", "Users", ""].join("/")),
    );
    assert.equal(skyTileMirrorEnabled(), true);

    process.env.ASTRO_PORTAL_SKY_TILE_MIRROR_DIR =
      "/tmp/astro-portal-fixture-mirror";
    process.env.ASTRO_PORTAL_SKY_TILE_MIRROR_CONCURRENCY = "7";
    process.env.ASTRO_PORTAL_SKY_TILE_MIRROR_MAX_BYTES = "12345";
    process.env.ASTRO_PORTAL_UPSTREAM_USER_AGENT = "custom-agent/1.0";
    process.env.ASTRO_PORTAL_SKY_TILE_MIRROR = "off";
    assert.equal(skyTileMirrorDirectory(), "/tmp/astro-portal-fixture-mirror");
    assert.equal(skyTileMirrorConcurrency(), 7);
    assert.equal(skyTileMirrorMaxBytes(), 12345);
    assert.equal(skyTileUpstreamUserAgent(), "custom-agent/1.0");
    assert.equal(skyTileMirrorEnabled(), false);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in had)) delete process.env[key];
    }
    Object.assign(process.env, had);
  }
});

test("a tile is fetched once from upstream, written atomically, and served with a sha-256 ETag", async () => {
  const upstream = await createFakeHipsUpstream({ tileBytes: 2048 });
  const directory = await tempDirectory("astro-mirror-tile-");
  try {
    const mirror = createSkyTileMirror({ directory, sleepImpl: fastSleep });
    const testSurvey = { ...survey, upstreamRoot: upstream.url };

    const result = await mirror.ensureTile({
      survey: testSurvey,
      order: 3,
      pix: 17,
      extension: "jpg",
    });
    assert.equal(result.status, "ready");
    assert.equal(result.fresh, true);
    assert.equal(upstream.requestCount, 1);
    assert.equal(upstream.requests[0].path, "/Norder3/Dir0/Npix17.jpg");
    assert.match(upstream.requests[0].headers["user-agent"], /^astro-portal\//);

    const bytes = await readFile(result.path);
    assert.equal(bytes.length, 2048);
    const etag = await mirror.fileEtag(result.path);
    assert.equal(
      etag,
      `"sha256-${createHash("sha256").update(bytes).digest("hex")}"`,
    );

    // No `.part` sibling survives a successful write.
    await assert.rejects(readFile(`${result.path}.part`));

    // A second request for the exact same tile costs zero upstream calls.
    const second = await mirror.ensureTile({
      survey: testSurvey,
      order: 3,
      pix: 17,
      extension: "jpg",
    });
    assert.equal(second.status, "ready");
    assert.equal(second.fresh, false);
    assert.equal(upstream.requestCount, 1);
  } finally {
    await upstream.close();
    await removeTempDirectory(directory);
  }
});

test("concurrent upstream fetches never exceed the configured concurrency", async () => {
  const upstream = await createFakeHipsUpstream({
    tileBytes: 512,
    latencyMs: 30,
  });
  const directory = await tempDirectory("astro-mirror-concurrency-");
  try {
    const mirror = createSkyTileMirror({
      directory,
      concurrency: 4,
      sleepImpl: fastSleep,
    });
    const testSurvey = { ...survey, upstreamRoot: upstream.url };
    const pixels = Array.from({ length: 24 }, (unused, index) => index);
    await Promise.all(
      pixels.map((pix) =>
        mirror.ensureTile({
          survey: testSurvey,
          order: 3,
          pix,
          extension: "jpg",
        }),
      ),
    );
    assert.equal(upstream.requestCount, 24);
    assert.ok(
      upstream.maxConcurrent <= 4,
      `observed ${upstream.maxConcurrent} concurrent upstream requests`,
    );
    assert.ok(
      upstream.maxConcurrent >= 2,
      "the test is meaningless if nothing ran concurrently at all",
    );
  } finally {
    await upstream.close();
    await removeTempDirectory(directory);
  }
});

test("a durably failing upstream answers sky_tiles_upstream_unavailable with a Retry-After estimate, never looping tightly", async () => {
  const upstream = await createFakeHipsUpstream({
    tileBytes: 512,
    failuresBeforeSuccess: 1000,
    failureStatus: 503,
  });
  const directory = await tempDirectory("astro-mirror-tile-failure-");
  try {
    const mirror = createSkyTileMirror({
      directory,
      sleepImpl: fastSleep,
      retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
    });
    const testSurvey = { ...survey, upstreamRoot: upstream.url };
    const result = await mirror.ensureTile({
      survey: testSurvey,
      order: 3,
      pix: 5,
      extension: "jpg",
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.code, "sky_tiles_upstream_unavailable");
    assert.ok(result.retryAfterSeconds > 0);
    // Exactly `attempts` upstream attempts were made, not an unbounded loop.
    assert.equal(upstream.requestCount, 3);
  } finally {
    await upstream.close();
    await removeTempDirectory(directory);
  }
});

test("an order-5 archive builds from 256 tiles, answering `building` immediately and `ready` once complete, with correct entries", async () => {
  const upstream = await createFakeHipsUpstream({ tileBytes: 300 });
  const directory = await tempDirectory("astro-mirror-archive-");
  try {
    const mirror = createSkyTileMirror({
      directory,
      concurrency: 4,
      sleepImpl: fastSleep,
    });
    const testSurvey = { ...survey, upstreamRoot: upstream.url };
    const addresses = Array.from({ length: 256 }, (unused, index) => ({
      order: 5,
      pix: 512 + index,
    }));

    const first = await mirror.ensureArchive({
      survey: testSurvey,
      order: 5,
      chunkOrder: 1,
      chunkPix: 2,
      addresses,
    });
    assert.equal(first.status, "building");
    assert.equal(first.code, "sky_tiles_archive_building");
    assert.equal(first.total, 256);
    assert.ok(first.retryAfterSeconds > 0);

    // A second call while it is still building must not start a second
    // build: same shape, and it never re-requests tiles already in flight.
    const second = await mirror.ensureArchive({
      survey: testSurvey,
      order: 5,
      chunkOrder: 1,
      chunkPix: 2,
      addresses,
    });
    assert.equal(second.status, "building");

    let ready;
    for (let attempt = 0; attempt < 3000; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      ready = await mirror.ensureArchive({
        survey: testSurvey,
        order: 5,
        chunkOrder: 1,
        chunkPix: 2,
        addresses,
      });
      if (ready.status === "ready") break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
    }
    assert.equal(ready.status, "ready");
    assert.equal(upstream.requestCount, 256);

    const archiveBytes = await readFile(ready.path);
    const entries = readUstarEntries(archiveBytes);
    assert.equal(entries.length, 256);
    entries.forEach((entry, index) => {
      assert.equal(entry.name, `Norder5/Dir0/Npix${512 + index}.jpg`);
      assert.equal(entry.size, 300);
    });

    const etag = await mirror.fileEtag(ready.path);
    assert.equal(
      etag,
      `"sha256-${createHash("sha256").update(archiveBytes).digest("hex")}"`,
    );

    // A brand-new request for the same archive now costs zero more upstream
    // calls: it is simply served from disk.
    const cached = await mirror.ensureArchive({
      survey: testSurvey,
      order: 5,
      chunkOrder: 1,
      chunkPix: 2,
      addresses,
    });
    assert.equal(cached.status, "ready");
    assert.equal(upstream.requestCount, 256);
  } finally {
    await upstream.close();
    await removeTempDirectory(directory);
  }
});

test("an archive is built from tiles already in the cache, without re-fetching them", async () => {
  const upstream = await createFakeHipsUpstream({ tileBytes: 200 });
  const directory = await tempDirectory("astro-mirror-archive-reuse-");
  try {
    const mirror = createSkyTileMirror({
      directory,
      concurrency: 4,
      sleepImpl: fastSleep,
    });
    const testSurvey = { ...survey, upstreamRoot: upstream.url };
    const addresses = Array.from({ length: 256 }, (unused, index) => ({
      order: 5,
      pix: 0 + index,
    }));

    // Pre-fetch the first 10 tiles individually, exactly as a client
    // browsing the map before downloading an archive might.
    for (let index = 0; index < 10; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await mirror.ensureTile({
        survey: testSurvey,
        order: 5,
        pix: index,
        extension: "jpg",
      });
    }
    assert.equal(upstream.requestCount, 10);

    let ready;
    for (let attempt = 0; attempt < 3000; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      ready = await mirror.ensureArchive({
        survey: testSurvey,
        order: 5,
        chunkOrder: 0,
        chunkPix: 0,
        addresses,
      });
      if (ready.status === "ready") break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
    }
    assert.equal(ready.status, "ready");
    // Only the 246 tiles that were not already cached were fetched.
    assert.equal(upstream.requestCount, 256);
  } finally {
    await upstream.close();
    await removeTempDirectory(directory);
  }
});

test("a durably failing archive build answers unavailable with a cooldown, and does not restart on the very next call", async () => {
  const upstream = await createFakeHipsUpstream({
    tileBytes: 200,
    failuresBeforeSuccess: 1000,
  });
  const directory = await tempDirectory("astro-mirror-archive-failure-");
  try {
    const mirror = createSkyTileMirror({
      directory,
      sleepImpl: fastSleep,
      retry: { attempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
      archiveFailureCooldownSeconds: 30,
    });
    const testSurvey = { ...survey, upstreamRoot: upstream.url };
    const addresses = [{ order: 5, pix: 512 }];

    let outcome;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      outcome = await mirror.ensureArchive({
        survey: testSurvey,
        order: 5,
        chunkOrder: 1,
        chunkPix: 2,
        addresses,
      });
      if (outcome.status === "unavailable") break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
    }
    assert.equal(outcome.status, "unavailable");
    assert.equal(outcome.code, "sky_tiles_upstream_unavailable");
    assert.ok(outcome.retryAfterSeconds > 0);

    const requestsAfterFailure = upstream.requestCount;
    const immediateRetry = await mirror.ensureArchive({
      survey: testSurvey,
      order: 5,
      chunkOrder: 1,
      chunkPix: 2,
      addresses,
    });
    assert.equal(immediateRetry.status, "unavailable");
    // Still within the cooldown: no new build was started.
    assert.equal(upstream.requestCount, requestsAfterFailure);
  } finally {
    await upstream.close();
    await removeTempDirectory(directory);
  }
});

test("an orphaned .part file from a previous crash is ignored and cleaned up, not served", async () => {
  const upstream = await createFakeHipsUpstream({ tileBytes: 128 });
  const directory = await tempDirectory("astro-mirror-orphan-part-");
  try {
    const mirror = createSkyTileMirror({ directory, sleepImpl: fastSleep });
    const testSurvey = { ...survey, upstreamRoot: upstream.url };
    const finalPath = join(
      directory,
      "tiles",
      survey.id,
      "Norder3",
      "Dir0",
      "Npix9.jpg",
    );
    await mkdir(join(directory, "tiles", survey.id, "Norder3", "Dir0"), {
      recursive: true,
    });
    await writeFile(
      `${finalPath}.part`,
      Buffer.from("stale half-written garbage"),
    );

    const result = await mirror.ensureTile({
      survey: testSurvey,
      order: 3,
      pix: 9,
      extension: "jpg",
    });
    assert.equal(result.status, "ready");
    const bytes = await readFile(result.path);
    assert.equal(bytes.length, 128);
    await assert.rejects(readFile(`${finalPath}.part`));
    assert.equal(upstream.requestCount, 1);
  } finally {
    await upstream.close();
    await removeTempDirectory(directory);
  }
});

test("the disk cache evicts least-recently-used tiles once over its byte budget", async () => {
  const upstream = await createFakeHipsUpstream({ tileBytes: 1000 });
  const directory = await tempDirectory("astro-mirror-eviction-");
  try {
    // Room for about 3 tiles; fetching 6 must evict the oldest.
    const mirror = createSkyTileMirror({
      directory,
      maxBytes: 3200,
      evictionTargetRatio: 0.9,
      sleepImpl: fastSleep,
    });
    const testSurvey = { ...survey, upstreamRoot: upstream.url };
    for (let pix = 0; pix < 6; pix += 1) {
      // eslint-disable-next-line no-await-in-loop
      await mirror.ensureTile({
        survey: testSurvey,
        order: 3,
        pix,
        extension: "jpg",
      });
    }
    const oldest = join(
      directory,
      "tiles",
      survey.id,
      "Norder3",
      "Dir0",
      "Npix0.jpg",
    );
    const newest = join(
      directory,
      "tiles",
      survey.id,
      "Norder3",
      "Dir0",
      "Npix5.jpg",
    );
    await assert.rejects(
      readFile(oldest),
      "the least-recently-used tile must have been evicted",
    );
    await readFile(newest); // must still exist
  } finally {
    await upstream.close();
    await removeTempDirectory(directory);
  }
});

test("evicting an archive from disk also drops it from the archive index, so a stale ready never lingers", async () => {
  const upstream = await createFakeHipsUpstream({ tileBytes: 64 });
  const directory = await tempDirectory("astro-mirror-archive-eviction-");
  try {
    const mirror = createSkyTileMirror({ directory, sleepImpl: fastSleep });
    const testSurvey = { ...survey, upstreamRoot: upstream.url };
    const lowAddresses = [];
    for (let order = 0; order <= 3; order += 1) {
      for (let pix = 0; pix < 12 * 4 ** order; pix += 1)
        lowAddresses.push({ order, pix });
    }
    const built = await waitForArchive(mirror, {
      survey: testSurvey,
      order: 3,
      chunkOrder: 3,
      chunkPix: 0,
      addresses: lowAddresses,
    });
    assert.equal(built.status, "ready");
    const readyBefore = await mirror.tierState({
      survey: testSurvey,
      maxOrder: 3,
      archiveChunkDelta: 4,
    });
    assert.equal(readyBefore.state, "ready");

    // A real (not `fastSleep`-scaled) gap, so the next tile is unambiguously
    // newer on disk than everything the first mirror already built —
    // eviction below must remove the OLDER archive and its component
    // tiles, never the brand-new one.
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));

    // A fresh mirror instance over the SAME directory (an eviction budget
    // this tight can only ever be hit by a later process, or a later
    // config change — never mid-build by the instance that just finished),
    // with a byte budget far below what the archive and its component
    // tiles already occupy on disk.
    const tightMirror = createSkyTileMirror({
      directory,
      maxBytes: 2000,
      evictionTargetRatio: 0.5,
      sleepImpl: fastSleep,
    });
    await tightMirror.ensureTile({
      survey: testSurvey,
      order: 5,
      pix: 12000,
      extension: "jpg",
    });

    await assert.rejects(
      readFile(built.path),
      "the archive itself must have been evicted",
    );
    const afterEviction = await tightMirror.tierState({
      survey: testSurvey,
      maxOrder: 3,
      archiveChunkDelta: 4,
    });
    assert.deepEqual(
      afterEviction,
      { state: "on-demand" },
      "a removed archive must not still report ready from a stale index entry",
    );
  } finally {
    await upstream.close();
    await removeTempDirectory(directory);
  }
});

test("tierState reports ready with the EXACT combined archive size only once every archive a tier needs exists on disk", async () => {
  const upstream = await createFakeHipsUpstream({ tileBytes: 64 });
  const directory = await tempDirectory("astro-mirror-tier-state-");
  try {
    const mirror = createSkyTileMirror({ directory, sleepImpl: fastSleep });
    const testSurvey = { ...survey, upstreamRoot: upstream.url };

    assert.deepEqual(
      await mirror.tierState({
        survey: testSurvey,
        maxOrder: 3,
        archiveChunkDelta: 4,
      }),
      { state: "on-demand" },
    );

    const lowAddresses = [];
    for (let order = 0; order <= 3; order += 1) {
      for (let pix = 0; pix < 12 * 4 ** order; pix += 1)
        lowAddresses.push({ order, pix });
    }
    const ready = await waitForArchive(mirror, {
      survey: testSurvey,
      order: 3,
      chunkOrder: 3,
      chunkPix: 0,
      addresses: lowAddresses,
    });
    assert.equal(ready.status, "ready");
    const essentialState = await mirror.tierState({
      survey: testSurvey,
      maxOrder: 3,
      archiveChunkDelta: 4,
    });
    assert.equal(essentialState.state, "ready");
    assert.equal(essentialState.exactBytes, ready.size);
    // The comfort tier additionally needs the order-4/5 archives, which do
    // not exist yet.
    assert.deepEqual(
      await mirror.tierState({
        survey: testSurvey,
        maxOrder: 5,
        archiveChunkDelta: 4,
      }),
      { state: "on-demand" },
    );
  } finally {
    await upstream.close();
    await removeTempDirectory(directory);
  }
});

test("tierState's ready/exactBytes is served from the small on-disk archive index once populated, not re-stat'd on every call", async () => {
  const upstream = await createFakeHipsUpstream({ tileBytes: 64 });
  const directory = await tempDirectory("astro-mirror-tier-index-fast-path-");
  try {
    const mirror = createSkyTileMirror({ directory, sleepImpl: fastSleep });
    const testSurvey = { ...survey, upstreamRoot: upstream.url };
    const lowAddresses = [];
    for (let order = 0; order <= 3; order += 1) {
      for (let pix = 0; pix < 12 * 4 ** order; pix += 1)
        lowAddresses.push({ order, pix });
    }
    const built = await waitForArchive(mirror, {
      survey: testSurvey,
      order: 3,
      chunkOrder: 3,
      chunkPix: 0,
      addresses: lowAddresses,
    });
    assert.equal(built.status, "ready");
    const archivePath = built.path;

    const firstCheck = await mirror.tierState({
      survey: testSurvey,
      maxOrder: 3,
      archiveChunkDelta: 4,
    });
    assert.equal(firstCheck.state, "ready");

    // Remove the archive file directly, bypassing the mirror's own eviction
    // (which would also clear the index) — the only way to prove the FAST
    // path really trusts the index rather than re-`stat`-ing the file on
    // every call: if it had re-`stat`-ed, this would now answer `on-demand`.
    await rm(archivePath, { force: true });
    const stillReady = await mirror.tierState({
      survey: testSurvey,
      maxOrder: 3,
      archiveChunkDelta: 4,
    });
    assert.equal(
      stillReady.state,
      "ready",
      "the fast index path must not have re-stat'd the now-missing file",
    );
    assert.equal(stillReady.exactBytes, firstCheck.exactBytes);
  } finally {
    await upstream.close();
    await removeTempDirectory(directory);
  }
});

test("tierState self-heals its archive index for an archive that already existed on disk before the index did", async () => {
  const directory = await tempDirectory("astro-mirror-tier-index-heal-");
  try {
    const mirror = createSkyTileMirror({ directory, sleepImpl: fastSleep });
    const testSurvey = { ...survey, upstreamRoot: "http://127.0.0.1:1/" };
    // Placed directly, as if built by an older mirror version that never
    // wrote an archive index, or copied in from another instance's cache.
    const archivePath = join(
      directory,
      "archives",
      survey.id,
      "Norder3",
      "Chunk3",
      "0.tar",
    );
    await mkdir(join(directory, "archives", survey.id, "Norder3", "Chunk3"), {
      recursive: true,
    });
    await writeFile(archivePath, Buffer.alloc(12345, 7));

    const result = await mirror.tierState({
      survey: testSurvey,
      maxOrder: 3,
      archiveChunkDelta: 4,
    });
    assert.equal(result.state, "ready");
    assert.equal(result.exactBytes, 12345);

    const index = JSON.parse(
      await readFile(
        join(directory, "archive-index", `${testSurvey.id}.json`),
        "utf8",
      ),
    );
    assert.equal(index.archives["Norder3/Chunk3/0.tar"], 12345);
  } finally {
    await removeTempDirectory(directory);
  }
});

test("observedMeanTileBytes is PER ORDER: falls back to the documented constant per order until enough tiles at THAT order have been seen", async () => {
  const upstream = await createFakeHipsUpstream({ tileBytes: 500 });
  const directory = await tempDirectory("astro-mirror-observed-mean-");
  try {
    const mirror = createSkyTileMirror({
      directory,
      minimumObservedTilesForMean: 3,
      sleepImpl: fastSleep,
    });
    const testSurvey = { ...survey, upstreamRoot: upstream.url };
    assert.equal(
      await mirror.observedMeanTileBytes(testSurvey.id, 3, 37683),
      37683,
    );
    await mirror.ensureTile({
      survey: testSurvey,
      order: 3,
      pix: 1,
      extension: "jpg",
    });
    await mirror.ensureTile({
      survey: testSurvey,
      order: 3,
      pix: 2,
      extension: "jpg",
    });
    assert.equal(
      await mirror.observedMeanTileBytes(testSurvey.id, 3, 37683),
      37683,
      "still below the threshold",
    );
    await mirror.ensureTile({
      survey: testSurvey,
      order: 3,
      pix: 3,
      extension: "jpg",
    });
    assert.equal(
      await mirror.observedMeanTileBytes(testSurvey.id, 3, 37683),
      500,
    );
    // A DIFFERENT order's own threshold is entirely independent: nothing
    // has been observed at order 4 yet, so it still falls back.
    assert.equal(
      await mirror.observedMeanTileBytes(testSurvey.id, 4, 92750),
      92750,
    );

    // Persisted across a fresh mirror instance over the same directory.
    const reopened = createSkyTileMirror({
      directory,
      minimumObservedTilesForMean: 3,
      sleepImpl: fastSleep,
    });
    assert.equal(
      await reopened.observedMeanTileBytes(testSurvey.id, 3, 37683),
      500,
    );

    const byOrder = await reopened.observedMeanTileBytesByOrder(testSurvey.id, {
      3: 37683,
      4: 92750,
    });
    assert.deepEqual(byOrder, { 3: 500, 4: 92750 });
  } finally {
    await upstream.close();
    await removeTempDirectory(directory);
  }
});

test("two mirror instances sharing one directory (the prepare:sky-tile-pack CLI and a live server, concretely) merge observed per-order stats instead of clobbering each other", async () => {
  const upstream = await createFakeHipsUpstream({ tileBytes: 400 });
  const directory = await tempDirectory("astro-mirror-observed-cross-process-");
  try {
    const mirrorA = createSkyTileMirror({
      directory,
      minimumObservedTilesForMean: 1,
      sleepImpl: fastSleep,
    });
    const mirrorB = createSkyTileMirror({
      directory,
      minimumObservedTilesForMean: 1,
      sleepImpl: fastSleep,
    });
    const testSurvey = { ...survey, upstreamRoot: upstream.url };

    // "Process A" (e.g. the prep script) fetches 3 tiles at order 3 first,
    // finishing — and writing its own accumulated total to disk — well
    // before "process B" ever runs.
    for (let pix = 0; pix < 3; pix += 1) {
      // eslint-disable-next-line no-await-in-loop
      await mirrorA.ensureTile({
        survey: testSurvey,
        order: 3,
        pix,
        extension: "jpg",
      });
    }
    // "Process B" (the live server) fetches 2 DIFFERENT tiles at the same
    // order, from an instance that never saw A's own in-memory state.
    for (let pix = 3; pix < 5; pix += 1) {
      // eslint-disable-next-line no-await-in-loop
      await mirrorB.ensureTile({
        survey: testSurvey,
        order: 3,
        pix,
        extension: "jpg",
      });
    }

    // Either instance, asked fresh, must see the FULL 5-tile total — not
    // just the 3 (or 2) it fetched itself: a naive write would have had
    // B's own total overwrite A's outright.
    assert.equal(await mirrorA.observedMeanTileBytes(testSurvey.id, 3, 0), 400);
    assert.equal(await mirrorB.observedMeanTileBytes(testSurvey.id, 3, 0), 400);
    const raw = JSON.parse(
      await readFile(join(directory, "stats", `${testSurvey.id}.json`), "utf8"),
    );
    assert.equal(raw.byOrder["3"].count, 5);
    assert.equal(raw.byOrder["3"].totalBytes, 2000);
  } finally {
    await upstream.close();
    await removeTempDirectory(directory);
  }
});

test("an old, pre-per-order stats file ({ count, totalBytes }) is read without error and simply ignored, never crashing the mean lookup", async () => {
  const directory = await tempDirectory("astro-mirror-observed-old-format-");
  try {
    await mkdir(join(directory, "stats"), { recursive: true });
    await writeFile(
      join(directory, "stats", `${survey.id}.json`),
      JSON.stringify({ count: 9001, totalBytes: 123456789 }),
    );
    const mirror = createSkyTileMirror({
      directory,
      minimumObservedTilesForMean: 1,
      sleepImpl: fastSleep,
    });
    assert.equal(
      await mirror.observedMeanTileBytes(survey.id, 3, 43507),
      43507,
      "the old aggregate has no per-order breakdown, so it must be ignored",
    );
  } finally {
    await removeTempDirectory(directory);
  }
});

// ------------------------------------------------ upstream-root fallback
//
// 2026-09-20: the CDS's primary HiPS host stopped accepting connections
// entirely, which — before `upstreamRoots` and the connect/total timeout
// split below — meant every tile request paid this file's *old* single-host
// retry loop in full (four attempts at the old 15 s timeout, plus backoff)
// before answering `503`. These tests exercise the fallback and the
// per-host breaker against real local sockets (an actually-refused
// connection, and a host that accepts but never answers), never the CDS,
// with every delay small and injected so the whole block runs in
// milliseconds.

test("a primary root that refuses the connection outright fails over to a healthy secondary immediately", async () => {
  const deadRoot = await unreachableUpstreamUrl();
  const secondary = await createFakeHipsUpstream({ tileBytes: 777 });
  const directory = await tempDirectory("astro-mirror-fallback-refused-");
  try {
    const mirror = createSkyTileMirror({
      directory,
      sleepImpl: fastSleep,
      upstreamConnectTimeoutMs: 200,
      upstreamTimeoutMs: 500,
    });
    const testSurvey = {
      ...survey,
      upstreamRoot: deadRoot,
      upstreamRoots: [deadRoot, secondary.url],
    };
    const started = Date.now();
    const result = await mirror.ensureTile({
      survey: testSurvey,
      order: 3,
      pix: 1,
      extension: "jpg",
    });
    const elapsedMs = Date.now() - started;
    assert.equal(result.status, "ready");
    assert.equal(secondary.requestCount, 1);
    assert.ok(
      elapsedMs < 200,
      `a refused connection should fail over near-instantly, took ${elapsedMs}ms`,
    );
  } finally {
    await secondary.close();
    await removeTempDirectory(directory);
  }
});

test("a primary root that connects but never answers fails over once its connect timeout elapses, well under the full response timeout", async () => {
  const hangingRoot = await createFakeHipsUpstream({ latencyMs: 60000 });
  const secondary = await createFakeHipsUpstream({ tileBytes: 321 });
  const directory = await tempDirectory("astro-mirror-fallback-hang-");
  try {
    const connectTimeoutMs = 40;
    const mirror = createSkyTileMirror({
      directory,
      sleepImpl: fastSleep,
      upstreamConnectTimeoutMs: connectTimeoutMs,
      upstreamTimeoutMs: 60000,
    });
    const testSurvey = {
      ...survey,
      upstreamRoot: hangingRoot.url,
      upstreamRoots: [hangingRoot.url, secondary.url],
    };
    const started = Date.now();
    const result = await mirror.ensureTile({
      survey: testSurvey,
      order: 3,
      pix: 2,
      extension: "jpg",
    });
    const elapsedMs = Date.now() - started;
    assert.equal(result.status, "ready");
    assert.equal(hangingRoot.requestCount, 1, "the primary was tried once");
    assert.equal(secondary.requestCount, 1);
    // "moins de délai de connexion + marge": the fallback must not wait
    // anywhere near `upstreamTimeoutMs` (60 s) — only the short connect
    // timeout plus a generous margin for the test machine itself.
    assert.ok(
      elapsedMs < connectTimeoutMs + 2000,
      `expected well under ${connectTimeoutMs + 2000}ms, took ${elapsedMs}ms`,
    );
  } finally {
    await hangingRoot.close();
    await secondary.close();
    await removeTempDirectory(directory);
  }
});

test("properties falls over to a secondary root exactly like a tile does", async () => {
  const deadRoot = await unreachableUpstreamUrl();
  const secondary = await createFakeHipsUpstream({});
  const directory = await tempDirectory("astro-mirror-fallback-properties-");
  try {
    const mirror = createSkyTileMirror({
      directory,
      sleepImpl: fastSleep,
      upstreamConnectTimeoutMs: 200,
    });
    const testSurvey = {
      ...survey,
      upstreamRoot: deadRoot,
      upstreamRoots: [deadRoot, secondary.url],
    };
    const result = await mirror.ensureProperties({ survey: testSurvey });
    assert.equal(result.status, "ready");
    const text = await readFile(result.path, "utf8");
    assert.match(text, /hips_version/);
    assert.equal(secondary.requestCount, 1);
  } finally {
    await secondary.close();
    await removeTempDirectory(directory);
  }
});

test("after the configured number of consecutive connection failures, the primary is skipped outright — no further attempt reaches it", async () => {
  // A host that *accepts* every connection but never answers, so its own
  // `requestCount` proves whether it was contacted at all — a refused
  // connection never reaches this file's request handler, so it cannot
  // tell "skipped by the breaker" apart from "attempted and refused".
  const primary = await createFakeHipsUpstream({ latencyMs: 60000 });
  const secondary = await createFakeHipsUpstream({ tileBytes: 111 });
  const directory = await tempDirectory("astro-mirror-breaker-opens-");
  try {
    const mirror = createSkyTileMirror({
      directory,
      sleepImpl: fastSleep,
      upstreamConnectTimeoutMs: 20,
      upstreamTimeoutMs: 60000,
      hostBreakerFailureThreshold: 2,
      hostBreakerBaseCooldownSeconds: 60,
    });
    const testSurvey = {
      ...survey,
      upstreamRoot: primary.url,
      upstreamRoots: [primary.url, secondary.url],
    };
    // Two different tiles, each paying the primary's connect timeout once —
    // the breaker's own failure count is per host, across requests, not per
    // retry inside one request.
    await mirror.ensureTile({
      survey: testSurvey,
      order: 3,
      pix: 10,
      extension: "jpg",
    });
    await mirror.ensureTile({
      survey: testSurvey,
      order: 3,
      pix: 11,
      extension: "jpg",
    });
    assert.equal(primary.requestCount, 2, "both failures reached the host");
    assert.equal(secondary.requestCount, 2);

    // The third, distinct tile must not pay the primary's connect timeout
    // again: the breaker is open, so the mirror goes straight to the
    // secondary.
    const started = Date.now();
    const third = await mirror.ensureTile({
      survey: testSurvey,
      order: 3,
      pix: 12,
      extension: "jpg",
    });
    const elapsedMs = Date.now() - started;
    assert.equal(third.status, "ready");
    assert.equal(
      primary.requestCount,
      2,
      "the breaker must skip the primary outright once open",
    );
    assert.equal(secondary.requestCount, 3);
    assert.ok(
      elapsedMs < 20,
      `skipping an open breaker should cost no time, took ${elapsedMs}ms`,
    );
  } finally {
    await primary.close();
    await secondary.close();
    await removeTempDirectory(directory);
  }
});

test("a host breaker closes once a probe against it succeeds, after its cooldown elapses", async () => {
  const deadRoot = await unreachableUpstreamUrl();
  const deadRootPort = Number(new URL(deadRoot).port);
  const secondary = await createFakeHipsUpstream({ tileBytes: 222 });
  const directory = await tempDirectory("astro-mirror-breaker-closes-");
  let recovered;
  try {
    let clockMs = 1_000_000;
    const mirror = createSkyTileMirror({
      directory,
      sleepImpl: fastSleep,
      now: () => clockMs,
      upstreamConnectTimeoutMs: 200,
      hostBreakerFailureThreshold: 1,
      hostBreakerBaseCooldownSeconds: 60,
    });
    const testSurvey = {
      ...survey,
      upstreamRoot: deadRoot,
      upstreamRoots: [deadRoot, secondary.url],
    };

    // Opens the breaker on the very first (refused) attempt.
    await mirror.ensureTile({
      survey: testSurvey,
      order: 3,
      pix: 20,
      extension: "jpg",
    });
    assert.equal(secondary.requestCount, 1);

    // Still within the cooldown: the (still-dead) primary is skipped.
    await mirror.ensureTile({
      survey: testSurvey,
      order: 3,
      pix: 21,
      extension: "jpg",
    });
    assert.equal(secondary.requestCount, 2);

    // The cooldown elapses, and the host actually recovers — a fresh fake
    // upstream bound to the exact port nothing was listening on before.
    clockMs += 61_000;
    recovered = await createFakeHipsUpstream({
      tileBytes: 333,
      port: deadRootPort,
    });

    const afterRecovery = await mirror.ensureTile({
      survey: testSurvey,
      order: 3,
      pix: 22,
      extension: "jpg",
    });
    assert.equal(afterRecovery.status, "ready");
    assert.equal(
      recovered.requestCount,
      1,
      "the cooldown having elapsed, the primary must be tried again",
    );
    assert.equal(
      secondary.requestCount,
      2,
      "a successful primary must not fall over to the secondary",
    );

    // The breaker is now fully closed: a later tile keeps using the primary
    // without paying for another cooldown.
    const again = await mirror.ensureTile({
      survey: testSurvey,
      order: 3,
      pix: 23,
      extension: "jpg",
    });
    assert.equal(again.status, "ready");
    assert.equal(recovered.requestCount, 2);
    assert.equal(secondary.requestCount, 2);
  } finally {
    await secondary.close();
    if (recovered) await recovered.close();
    await removeTempDirectory(directory);
  }
});

test("when every configured root is down, the mirror answers unavailable in a bounded time — not the old single-host retry storm", async () => {
  const deadRootA = await unreachableUpstreamUrl();
  const deadRootB = await unreachableUpstreamUrl();
  const directory = await tempDirectory("astro-mirror-all-down-");
  try {
    const connectTimeoutMs = 30;
    const mirror = createSkyTileMirror({
      directory,
      sleepImpl: fastSleep,
      upstreamConnectTimeoutMs: connectTimeoutMs,
      upstreamTimeoutMs: 60000,
    });
    const testSurvey = {
      ...survey,
      upstreamRoot: deadRootA,
      upstreamRoots: [deadRootA, deadRootB],
    };
    const started = Date.now();
    const result = await mirror.ensureTile({
      survey: testSurvey,
      order: 3,
      pix: 30,
      extension: "jpg",
    });
    const elapsedMs = Date.now() - started;
    assert.equal(result.status, "unavailable");
    assert.equal(result.code, "sky_tiles_upstream_unavailable");
    assert.ok(result.retryAfterSeconds > 0);
    // Two dead roots, refused near-instantly: nowhere close to the four
    // attempts times the old 15 s timeout (see
    // docs/SKY_TILES_MIRROR.md#mirrored-upstream-roots).
    assert.ok(
      elapsedMs < connectTimeoutMs + 2000,
      `expected a bounded failure, took ${elapsedMs}ms`,
    );
  } finally {
    await removeTempDirectory(directory);
  }
});

test("dss-colour walks CDS, then CDS-bis, then the ESASky root last, the breakers skipping the two dead hosts once open", async () => {
  // The real table's order first: both CDS hosts, then ESASky, last.
  const { skyBackdropSurveys } = await import("portal/sky-tiles/surveys.js");
  assert.deepEqual(skyBackdropSurveys["dss-colour"].upstreamRoots, [
    "https://alasky.cds.unistra.fr/DSS/DSSColor/",
    "https://alaskybis.cds.unistra.fr/DSS/DSSColor/",
    "https://skies.esac.esa.int/DSSColor/",
  ]);
  // Two hosts that accept and never answer (their `requestCount` tells
  // whether the breaker let a request through), then the healthy last root.
  const cds = await createFakeHipsUpstream({ latencyMs: 60000 });
  const cdsBis = await createFakeHipsUpstream({ latencyMs: 60000 });
  const esac = await createFakeHipsUpstream({ tileBytes: 555 });
  const directory = await tempDirectory("astro-mirror-three-roots-");
  try {
    const mirror = createSkyTileMirror({
      directory,
      sleepImpl: fastSleep,
      upstreamConnectTimeoutMs: 20,
      upstreamTimeoutMs: 60000,
      hostBreakerFailureThreshold: 2,
    });
    const testSurvey = {
      ...survey,
      upstreamRoot: cds.url,
      upstreamRoots: [cds.url, cdsBis.url, esac.url],
    };
    for (const pix of [50, 51, 52, 53]) {
      // eslint-disable-next-line no-await-in-loop
      const result = await mirror.ensureTile({
        survey: testSurvey,
        order: 3,
        pix,
        extension: "jpg",
      });
      assert.equal(result.status, "ready");
      assert.equal(result.size, 555);
    }
    // Two failures each open both breakers: the last two tiles went
    // straight to ESASky.
    assert.equal(cds.requestCount, 2);
    assert.equal(cdsBis.requestCount, 2);
    assert.equal(esac.requestCount, 4);
    // The order is kept: CDS first, CDS-bis second, ESASky last.
    assert.deepEqual(
      [cds, cdsBis, esac].map((host) => host.requests[0].path),
      [
        "/Norder3/Dir0/Npix50.jpg",
        "/Norder3/Dir0/Npix50.jpg",
        "/Norder3/Dir0/Npix50.jpg",
      ],
    );
  } finally {
    await cds.close();
    await cdsBis.close();
    await esac.close();
    await removeTempDirectory(directory);
  }
});

test("dss2-red is mirrored from the two CDS hosts only, and never named by the offline pack", async () => {
  const { defaultSkyBackdropSurveyId, skyBackdropSurveys } =
    await import("portal/sky-tiles/surveys.js");
  const red = skyBackdropSurveys["dss2-red"];
  assert.equal(red.id, "dss2-red");
  assert.equal(red.hipsId, "CDS/P/DSS2/red");
  assert.equal(red.format, "jpg");
  assert.equal(red.maxOrder, 9);
  assert.equal(red.tileWidth, 512);
  assert.equal(red.upstreamRoot, red.upstreamRoots[0]);
  assert.deepEqual(red.upstreamRoots, [
    "https://alasky.cds.unistra.fr/DSS/DSS2Merged/",
    "https://alaskybis.cds.unistra.fr/DSS/DSS2Merged/",
  ]);
  assert.ok(!red.upstreamRoots.some((root) => root.includes("esac")));
  assert.equal(red.license, skyBackdropSurveys["dss-colour"].license);
  assert.equal(
    red.imageryCopyright,
    skyBackdropSurveys["dss-colour"].imageryCopyright,
  );
  assert.equal(defaultSkyBackdropSurveyId, "dss-colour");
  // No wide-field survey in the mirror.
  assert.deepEqual(Object.keys(skyBackdropSurveys).sort(), [
    "dss-colour",
    "dss2-red",
  ]);
});

test("a survey without upstreamRoots keeps working from its single upstreamRoot alone (backward compatibility)", async () => {
  const upstream = await createFakeHipsUpstream({ tileBytes: 999 });
  const directory = await tempDirectory("astro-mirror-single-root-");
  try {
    const mirror = createSkyTileMirror({ directory, sleepImpl: fastSleep });
    const testSurvey = { ...survey, upstreamRoot: upstream.url };
    assert.equal(testSurvey.upstreamRoots, undefined);
    const result = await mirror.ensureTile({
      survey: testSurvey,
      order: 3,
      pix: 40,
      extension: "jpg",
    });
    assert.equal(result.status, "ready");
    assert.equal(upstream.requestCount, 1);
  } finally {
    await upstream.close();
    await removeTempDirectory(directory);
  }
});

test("total upstream concurrency stays within the configured limit even when every tile also pays a refused primary", async () => {
  const deadRoot = await unreachableUpstreamUrl();
  const secondary = await createFakeHipsUpstream({
    tileBytes: 256,
    latencyMs: 15,
  });
  const directory = await tempDirectory("astro-mirror-fallback-concurrency-");
  try {
    const mirror = createSkyTileMirror({
      directory,
      concurrency: 4,
      sleepImpl: fastSleep,
      upstreamConnectTimeoutMs: 200,
    });
    const testSurvey = {
      ...survey,
      upstreamRoot: deadRoot,
      upstreamRoots: [deadRoot, secondary.url],
    };
    const pixels = Array.from({ length: 16 }, (unused, index) => index);
    await Promise.all(
      pixels.map((pix) =>
        mirror.ensureTile({
          survey: testSurvey,
          order: 3,
          pix,
          extension: "jpg",
        }),
      ),
    );
    assert.equal(secondary.requestCount, 16);
    assert.ok(
      secondary.maxConcurrent <= 4,
      `observed ${secondary.maxConcurrent} concurrent upstream requests, expected ≤ 4`,
    );
  } finally {
    await secondary.close();
    await removeTempDirectory(directory);
  }
});

test("the default (process-wide) mirror singleton is memoized and can be reset for tests", async () => {
  const directory = await tempDirectory("astro-mirror-singleton-");
  const had = process.env.ASTRO_PORTAL_SKY_TILE_MIRROR_DIR;
  try {
    process.env.ASTRO_PORTAL_SKY_TILE_MIRROR_DIR = directory;
    resetSkyTileMirror();
    const { skyTileMirror } = await import("portal/sky-tiles/mirror.js");
    const first = skyTileMirror();
    const second = skyTileMirror();
    assert.equal(first, second);
    resetSkyTileMirror();
    const third = skyTileMirror();
    assert.notEqual(first, third);
  } finally {
    if (had === undefined) delete process.env.ASTRO_PORTAL_SKY_TILE_MIRROR_DIR;
    else process.env.ASTRO_PORTAL_SKY_TILE_MIRROR_DIR = had;
    resetSkyTileMirror();
    await removeTempDirectory(directory);
  }
});

// ── Interrupted builds and what the portal announces ─────────────────────────
//
// When the mirror is cold, every archive of a backdrop tier is built on
// demand from the CDS, and a process that restarts loses the build in
// progress. What remains on disk is whatever tiles were already fetched, and
// possibly a `.part` file.

// Bounded by wall-clock time, not by a count of polls: a slow host builds
// the same archive in more polls, and the assertion on `ready` stays whole.
async function waitForArchive(mirror, request, { timeoutMs = 60_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let outcome;
  do {
    // eslint-disable-next-line no-await-in-loop
    outcome = await mirror.ensureArchive(request);
    if (outcome.status === "ready") return outcome;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
  } while (Date.now() < deadline);
  return outcome;
}

function order5Archive(testSurvey) {
  return {
    survey: testSurvey,
    order: 5,
    chunkOrder: 1,
    chunkPix: 0,
    addresses: Array.from({ length: 256 }, (unused, index) => ({
      order: 5,
      pix: index,
    })),
  };
}

test("a build interrupted by a restart resumes from the tiles already fetched, past an empty leftover .part", async () => {
  const upstream = await createFakeHipsUpstream({ tileBytes: 200 });
  const directory = await tempDirectory("astro-mirror-resume-");
  try {
    const testSurvey = { ...survey, upstreamRoot: upstream.url };
    // The process that was building: 100 of the 256 tiles made it to disk.
    const before = createSkyTileMirror({ directory, sleepImpl: fastSleep });
    for (let pix = 0; pix < 100; pix += 1)
      // eslint-disable-next-line no-await-in-loop
      await before.ensureTile({
        survey: testSurvey,
        order: 5,
        pix,
        extension: "jpg",
      });
    assert.equal(upstream.requestCount, 100);
    // Killed mid-write: an empty archive `.part` and an empty tile `.part`.
    const archiveDirectory = join(
      directory,
      "archives",
      survey.id,
      "Norder5",
      "Chunk1",
    );
    await mkdir(archiveDirectory, { recursive: true });
    await writeFile(join(archiveDirectory, "0.tar.part"), Buffer.alloc(0));
    const tileDirectory = join(
      directory,
      "tiles",
      survey.id,
      "Norder5",
      "Dir0",
    );
    await writeFile(join(tileDirectory, "Npix150.jpg.part"), Buffer.alloc(0));

    // The restarted process.
    const after = createSkyTileMirror({ directory, sleepImpl: fastSleep });
    const ready = await waitForArchive(after, order5Archive(testSurvey));
    assert.equal(
      upstream.requestCount,
      256,
      "only the 156 missing tiles were fetched again",
    );
    const entries = readUstarEntries(await readFile(ready.path));
    assert.equal(entries.length, 256);
    assert.ok(entries.every((entry) => entry.size === 200));
    await assert.rejects(readFile(join(archiveDirectory, "0.tar.part")));
    await assert.rejects(readFile(join(tileDirectory, "Npix150.jpg.part")));
  } finally {
    await upstream.close();
    await removeTempDirectory(directory);
  }
});

test("an archive whose tiles are all on disk announces a Retry-After of seconds, not the upstream estimate", async () => {
  const upstream = await createFakeHipsUpstream({ tileBytes: 200 });
  const directory = await tempDirectory("astro-mirror-retry-local-");
  try {
    const testSurvey = { ...survey, upstreamRoot: upstream.url };
    const before = createSkyTileMirror({ directory, sleepImpl: fastSleep });
    for (let pix = 0; pix < 256; pix += 1)
      // eslint-disable-next-line no-await-in-loop
      await before.ensureTile({
        survey: testSurvey,
        order: 5,
        pix,
        extension: "jpg",
      });

    const after = createSkyTileMirror({
      directory,
      concurrency: 4,
      sleepImpl: fastSleep,
    });
    const first = await after.ensureArchive(order5Archive(testSurvey));
    await waitForArchive(after, order5Archive(testSurvey));
    assert.equal(upstream.requestCount, 256);
    if (first.status === "building") {
      // `main` announced 256 × 0.9 s / 4 = 58 s here, for a build that
      // needs no upstream request at all.
      assert.ok(
        first.retryAfterSeconds <= 5,
        `Retry-After ${first.retryAfterSeconds} s for an archive built from disk`,
      );
      assert.equal(first.upstreamRemaining, 0);
    }
  } finally {
    await upstream.close();
    await removeTempDirectory(directory);
  }
});

test("the Retry-After of a cold archive follows the pace the upstream really has", async () => {
  const directory = await tempDirectory("astro-mirror-retry-pace-");
  try {
    // A deterministic upstream: each tile "takes" three seconds on the
    // mirror's own clock.
    let clock = 1_000_000;
    const fetchImpl = async () => {
      clock += 3000;
      return new Response(Buffer.alloc(100, 1));
    };
    const testSurvey = {
      ...survey,
      upstreamRoot: "https://upstream.invalid/",
    };
    const mirror = createSkyTileMirror({
      directory,
      concurrency: 1,
      fetchImpl,
      now: () => clock,
      sleepImpl: fastSleep,
    });
    // Sixteen tiles observed at that pace.
    for (let pix = 1000; pix < 1016; pix += 1)
      // eslint-disable-next-line no-await-in-loop
      await mirror.ensureTile({
        survey: testSurvey,
        order: 5,
        pix,
        extension: "jpg",
      });
    const first = await mirror.ensureArchive(order5Archive(testSurvey));
    await waitForArchive(mirror, order5Archive(testSurvey));
    assert.equal(first.status, "building");
    // 256 tiles to fetch, one at a time, three seconds each: about 768 s,
    // where `main` still announced its fixed 0.9 s per tile (230 s).
    assert.ok(
      first.retryAfterSeconds >= 600 && first.retryAfterSeconds <= 900,
      `Retry-After ${first.retryAfterSeconds} s`,
    );
  } finally {
    await removeTempDirectory(directory);
  }
});

test("after a restart, a build never waits for the inventory of the whole cache", async () => {
  const upstream = await createFakeHipsUpstream({ tileBytes: 200 });
  const directory = await tempDirectory("astro-mirror-inventory-");
  try {
    const testSurvey = { ...survey, upstreamRoot: upstream.url };
    // An inventory as slow as a network file system is for tens of thousands
    // of tiles.
    let inventories = 0;
    const mirror = createSkyTileMirror({
      directory,
      sleepImpl: fastSleep,
      measureDirectoryBytes: async () => {
        inventories += 1;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 3000));
        return 0;
      },
    });
    const started = Date.now();
    const tile = await mirror.ensureTile({
      survey: testSurvey,
      order: 5,
      pix: 7,
      extension: "jpg",
    });
    assert.equal(tile.status, "ready");
    assert.ok(
      Date.now() - started < 1000,
      `the first tile waited ${Date.now() - started} ms for the inventory`,
    );
    assert.ok(
      inventories <= 2,
      "the inventory is walked once, in the background",
    );
  } finally {
    await upstream.close();
    await removeTempDirectory(directory);
  }
});

test("a tier is ready as soon as every archive it needs exists, whoever built them", async () => {
  const directory = await tempDirectory("astro-mirror-tier-ready-");
  try {
    const mirror = createSkyTileMirror({ directory, sleepImpl: fastSleep });
    const testSurvey = { ...survey, upstreamRoot: "http://127.0.0.1:1/" };
    // The standard tier (orders 0..4): the low-order archive plus the twelve
    // order-4 archives.
    const archives = [
      ["Norder3", "Chunk3", "0.tar"],
      ...Array.from({ length: 12 }, (unused, chunkPix) => [
        "Norder4",
        "Chunk0",
        `${chunkPix}.tar`,
      ]),
    ];
    let total = 0;
    for (const [index, [order, chunk, name]] of archives.entries()) {
      const archiveDirectory = join(
        directory,
        "archives",
        survey.id,
        order,
        chunk,
      );
      // eslint-disable-next-line no-await-in-loop
      await mkdir(archiveDirectory, { recursive: true });
      const size = 1000 + index;
      // eslint-disable-next-line no-await-in-loop
      await writeFile(join(archiveDirectory, name), Buffer.alloc(size));
      total += size;
      // eslint-disable-next-line no-await-in-loop
      const state = await mirror.tierState({
        survey: testSurvey,
        maxOrder: 4,
        archiveChunkDelta: 4,
      });
      if (index < archives.length - 1)
        assert.deepEqual(state, { state: "on-demand" }, `${index + 1} of 13`);
      else assert.deepEqual(state, { state: "ready", exactBytes: total });
    }
  } finally {
    await removeTempDirectory(directory);
  }
});
