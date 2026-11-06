import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  archiveRelativePath,
  archiveTileAddresses,
  archiveTileCount,
  tierArchiveAddresses,
} from "portal/sky-tiles/geometry.js";
import { createSkyTileMirror } from "portal/sky-tiles/mirror.js";
import { skyBackdropTierFit } from "portal/sky-tiles/tier-fit.js";
import {
  SkyBackdropPrepareError,
  createSkyBackdropPreparer,
  createTriggerLimiter,
} from "portal/sky-tiles/prepare.js";

import { createFakeHipsUpstream } from "./helpers/fake-hips-upstream.mjs";

// The background preparation of a sky-backdrop tier, on a small pyramid so a
// whole "comfort" tier is a thousand tiny requests to a local fake CDS: with
// `archiveChunkDelta = 2` an archive holds 16 tiles (the low-order archive,
// orders 0..1, holds 60), and the three tiers below have 1, 13 and 61
// archives — the very archive counts of the real essential, standard and
// comfort tiers at delta 4 ("12 parties prêtes sur 61" is comfort). Nothing
// here reaches the real CDS: the upstream is a local server, its clock is
// the tests' own, and the retry timer is driven by hand.

const delta = 2;
const tiers = [
  { id: "essential", maxOrder: 1 },
  { id: "standard", maxOrder: 2 },
  { id: "comfort", maxOrder: 3 },
];
const tileBytes = 512;
const meanTileBytes = Object.fromEntries(
  [0, 1, 2, 3, 4, 5, 6].map((order) => [order, 2000]),
);

const fastSleep = () => Promise.resolve();

function tempDirectory(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

function removeTempDirectory(directory) {
  return rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 50,
  });
}

function fakeClock(start = Date.parse("2026-09-29T10:00:00.000Z")) {
  let current = start;
  return {
    now: () => current,
    advance(milliseconds) {
      current += milliseconds;
    },
  };
}

/** The retry timer, by hand: nothing fires until the test says so. */
function manualScheduler() {
  const timers = new Set();
  return {
    schedule(callback, milliseconds) {
      const timer = { callback, milliseconds };
      timers.add(timer);
      return () => timers.delete(timer);
    },
    get pending() {
      return [...timers];
    },
    fire() {
      const due = [...timers];
      timers.clear();
      for (const timer of due) timer.callback();
      return due.length;
    },
  };
}

async function until(check, { timeoutMs = 30_000, what = "a condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
  }
}

const iso = (milliseconds) => new Date(milliseconds).toISOString();

/**
 * A mirror, a preparer and a fake CDS sharing one clock. `control` steers
 * what the mirror's `fetch` sees: `down` (connection refused), `reject` (an
 * HTTP status the upstream answers), `holdAfter` (let that many tiles
 * through, then hold every further one until `control.open()`), `fetchMs`
 * (how long, on the shared clock, each tile takes).
 */
async function scenario({
  directory = null,
  concurrency = 4,
  maxBytes = null,
  latencyMs = 0,
  bytes = tileBytes,
  clock = fakeClock(),
} = {}) {
  const upstream = await createFakeHipsUpstream({
    tileBytes: bytes,
    latencyMs,
  });
  const owned = !directory;
  const dir = directory ?? (await tempDirectory("astro-prepare-"));
  const timers = manualScheduler();
  const control = {
    down: false,
    reject: null,
    attempts: 0,
    passed: 0,
    holdAfter: Infinity,
    release: null,
    open: null,
    fetchMs: 0,
    hold(after) {
      control.holdAfter = after;
      control.release = new Promise((resolvePromise) => {
        control.open = () => {
          control.holdAfter = Infinity;
          resolvePromise();
        };
      });
    },
  };
  const fetchImpl = async (url, init) => {
    control.attempts += 1;
    // Held tiles decide what they see once let go: a "killed" service is one
    // whose held tiles are let go into a CDS that is down.
    if (control.passed >= control.holdAfter) await control.release;
    if (control.down)
      throw Object.assign(new TypeError("fetch failed"), {
        cause: { code: "ECONNREFUSED" },
      });
    if (control.reject)
      return new Response("nothing here", { status: control.reject });
    control.passed += 1;
    clock.advance(control.fetchMs);
    return fetch(url, init);
  };
  const survey = {
    id: "dss-colour",
    format: "jpg",
    maxOrder: 9,
    upstreamRoot: upstream.url,
    upstreamRoots: [upstream.url],
  };
  const mirror = createSkyTileMirror({
    directory: dir,
    concurrency,
    fetchImpl,
    now: clock.now,
    sleepImpl: fastSleep,
    retry: { attempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
    ...(maxBytes ? { maxBytes } : {}),
  });
  const built = [];
  // The preparer sees the mirror through a spy that records which archive
  // the background task asks for, and in which order.
  const spied = Object.assign(Object.create(mirror), {
    buildArchive(request) {
      built.push(archiveRelativePath(request));
      return mirror.buildArchive(request);
    },
  });
  const preparer = createSkyBackdropPreparer({
    mirror: spied,
    survey: () => survey,
    tiers,
    archiveChunkDelta: delta,
    now: clock.now,
    schedule: timers.schedule,
    meanTileBytesByOrder: meanTileBytes,
  });
  return {
    upstream,
    dir,
    clock,
    timers,
    control,
    mirror,
    preparer,
    survey,
    built,
    async close() {
      preparer.dispose();
      control.open?.();
      await upstream.close();
      if (owned) await removeTempDirectory(dir);
    },
  };
}

function archiveRequest(survey, address) {
  return {
    survey,
    ...address,
    addresses: archiveTileAddresses(address, {
      maxOrder: survey.maxOrder,
      archiveChunkDelta: delta,
    }),
  };
}

async function buildDirectly(context, address) {
  const begun = await context.mirror.buildArchive(
    archiveRequest(context.survey, address),
  );
  if (begun.status === "building") await begun.build.promise;
  return begun;
}

async function countFiles(directory) {
  let total = 0;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (entry.isDirectory())
      total += await countFiles(join(directory, entry.name));
    else if (!entry.name.endsWith(".part")) total += 1;
  }
  return total;
}

const allAddresses = (maxOrder) => tierArchiveAddresses(maxOrder, delta);

// ------------------------------------------------------------------ geometry

test("an archive's own path and tile count come from its address, the low-order one holding every tile of orders 0..delta-1", () => {
  assert.equal(
    archiveRelativePath({ order: 5, chunkOrder: 1, chunkPix: 3 }),
    "Norder5/Chunk1/3.tar",
  );
  // delta 4: the fixed low-order archive (1,020 tiles) and 256 tiles per
  // per-order chunk — the real archives a client downloads.
  assert.equal(
    archiveTileCount({ order: 3, chunkOrder: 3, chunkPix: 0 }, 4),
    1020,
  );
  assert.equal(
    archiveTileCount({ order: 5, chunkOrder: 1, chunkPix: 3 }, 4),
    256,
  );
  assert.equal(
    archiveTileCount({ order: 1, chunkOrder: 1, chunkPix: 0 }, delta),
    60,
  );
  assert.equal(
    archiveTileCount({ order: 3, chunkOrder: 1, chunkPix: 9 }, delta),
    16,
  );
});

// ---------------------------------------------------- mirror: archive index

test("the archives a tier has ready are counted from the archive index, never by walking the disk", async () => {
  const context = await scenario();
  try {
    const addresses = allAddresses(3);
    assert.equal(addresses.length, 61);
    for (const address of addresses.slice(0, 3))
      await buildDirectly(context, address);
    const progress = await context.mirror.tierArchiveProgress({
      survey: context.survey,
      maxOrder: 3,
      archiveChunkDelta: delta,
    });
    assert.equal(progress.ready, 3);
    assert.equal(progress.total, 61);
    assert.equal(progress.missing.length, 58);
    assert.deepEqual(progress.missing[0], addresses[3]);
    assert.ok(progress.bytes > 0);

    // Removed behind the mirror's back: only the index is trusted, exactly
    // as `tierState`'s fast path is — a count that walked the disk would
    // now say 2.
    await rm(
      join(
        context.dir,
        "archives",
        "dss-colour",
        archiveRelativePath(addresses[1]),
      ),
    );
    const again = await context.mirror.tierArchiveProgress({
      survey: context.survey,
      maxOrder: 3,
      archiveChunkDelta: delta,
    });
    assert.equal(again.ready, 3);
    assert.equal(again.bytes, progress.bytes);

    const essential = await context.mirror.tierArchiveProgress({
      survey: context.survey,
      maxOrder: 1,
      archiveChunkDelta: delta,
    });
    assert.deepEqual(
      { ready: essential.ready, total: essential.total },
      { ready: 1, total: 1 },
    );
  } finally {
    await context.close();
  }
});

test("archives that sit on disk without an index entry are found once, in the background, and counted from then on", async () => {
  const context = await scenario();
  try {
    const addresses = allAddresses(3);
    for (const address of addresses.slice(0, 4)) {
      const directory = join(
        context.dir,
        "archives",
        "dss-colour",
        `Norder${address.order}`,
        `Chunk${address.chunkOrder}`,
      );
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, `${address.chunkPix}.tar`),
        Buffer.alloc(1000 + address.chunkPix, 7),
      );
    }
    const options = {
      survey: context.survey,
      maxOrder: 3,
      archiveChunkDelta: delta,
    };
    await context.mirror.tierArchiveProgress(options);
    await context.mirror.archiveIndexReconciled();
    const progress = await context.mirror.tierArchiveProgress(options);
    assert.equal(progress.ready, 4);
    assert.equal(progress.total, 61);
    assert.equal(context.upstream.requests.length, 0);
  } finally {
    await context.close();
  }
});

test("the state of a tier being prepared is not re-derived from the disk archive by archive: the index is trusted for what it lists", async () => {
  const context = await scenario();
  try {
    const addresses = allAddresses(2);
    // Two archives built the ordinary way, then removed behind the mirror's
    // back: only the index still knows them.
    for (const address of addresses.slice(0, 2))
      await buildDirectly(context, address);
    for (const address of addresses.slice(0, 2))
      await rm(
        join(
          context.dir,
          "archives",
          "dss-colour",
          archiveRelativePath(address),
        ),
      );
    // The rest of the standard tier sits on disk, unindexed.
    for (const address of addresses.slice(2)) {
      const directory = join(
        context.dir,
        "archives",
        "dss-colour",
        `Norder${address.order}`,
        `Chunk${address.chunkOrder}`,
      );
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, `${address.chunkPix}.tar`),
        Buffer.alloc(100),
      );
    }
    const state = await context.mirror.tierState({
      survey: context.survey,
      maxOrder: 2,
      archiveChunkDelta: delta,
    });
    // A `stat` of each archive would have found the first two missing.
    assert.equal(state.state, "ready");
    const indexed = (
      await context.mirror.tierArchiveProgress({
        survey: context.survey,
        maxOrder: 2,
        archiveChunkDelta: delta,
      })
    ).ready;
    assert.equal(indexed, 13, "the ones found on disk were entered too");
  } finally {
    await context.close();
  }
});

test("an archive found on disk without an index entry is entered in the index when the task asks for it, so it counts as ready", async () => {
  const context = await scenario();
  try {
    const address = allAddresses(1)[0];
    const directory = join(
      context.dir,
      "archives",
      "dss-colour",
      `Norder${address.order}`,
      `Chunk${address.chunkOrder}`,
    );
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "0.tar"), Buffer.alloc(4321, 1));
    const answer = await context.mirror.buildArchive(
      archiveRequest(context.survey, address),
    );
    assert.equal(answer.status, "ready");
    const progress = await context.mirror.tierArchiveProgress({
      survey: context.survey,
      maxOrder: 1,
      archiveChunkDelta: delta,
    });
    assert.deepEqual(
      { ready: progress.ready, bytes: progress.bytes },
      { ready: 1, bytes: 4321 },
    );
    assert.equal(context.upstream.requests.length, 0);
  } finally {
    await context.close();
  }
});

test("an archive that is built but cannot be entered in the index puts the task on hold instead of making it spin", async () => {
  const context = await scenario();
  try {
    // A directory where the index file belongs: every write of the index
    // fails, as it would on a full disk.
    const obstacle = join(
      context.dir,
      "archive-index",
      "dss-colour.json",
      "in-the-way",
    );
    await mkdir(join(obstacle, ".."), { recursive: true });
    await writeFile(obstacle, "x");

    await context.preparer.prepare("essential");
    const waiting = await until(
      async () => {
        const status = await context.preparer.status("essential");
        return status.state === "waiting" ? status : null;
      },
      { what: "the task to wait for its index" },
    );
    assert.equal(waiting.reason, "storage_error");
    assert.equal(waiting.nextAttemptAt, iso(context.clock.now() + 30_000));
    const builds = context.built.length;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
    assert.equal(context.built.length, builds, "nothing is asked meanwhile");

    await rm(join(context.dir, "archive-index"), { recursive: true });
    context.clock.advance(30_000);
    context.timers.fire();
    await until(
      async () =>
        (await context.preparer.status("essential")).state === "complete",
      { what: "the tier, once the index can be written" },
    );
  } finally {
    await context.close();
  }
});

// ------------------------------------------------------- the preparation job

test("prepare builds every missing archive of a tier, one after the other, in the order the phone downloads them", async () => {
  const context = await scenario();
  try {
    const first = await context.preparer.prepare("comfort");
    assert.equal(first.state, "running");
    assert.deepEqual(first.archives, { ready: 0, total: 61 });
    assert.equal(first.tier, "comfort");
    assert.equal(first.runningTier, "comfort");
    assert.equal(first.current.order, 1, "the low-order archive comes first");
    assert.equal(first.current.tiles.total, 60);
    assert.equal(first.retryAfterSeconds, 15);

    await until(
      async () =>
        (await context.preparer.status("comfort")).state === "complete",
      { what: "the comfort tier" },
    );
    const done = await context.preparer.status("comfort");
    assert.deepEqual(done.archives, { ready: 61, total: 61 });
    assert.equal(done.current, null);
    assert.equal(done.retryAfterSeconds, null);
    assert.equal(done.remainingSeconds, 0);
    assert.deepEqual(
      context.built,
      allAddresses(3).map(archiveRelativePath),
      "ascending order, then chunk by chunk",
    );
    const paths = context.upstream.requests.map((entry) => entry.path);
    assert.equal(paths.length, 60 + 12 * 16 + 48 * 16);
    assert.equal(new Set(paths).size, paths.length, "no tile fetched twice");
  } finally {
    await context.close();
  }
});

test("a second request for a tier already being prepared joins the same task instead of starting another", async () => {
  const context = await scenario();
  try {
    context.control.hold(10);
    const [one, two] = await Promise.all([
      context.preparer.prepare("standard"),
      context.preparer.prepare("standard"),
    ]);
    assert.equal(one.state, "running");
    assert.equal(two.state, "running");
    assert.equal(two.startedAt, one.startedAt);
    context.control.open();
    await until(
      async () =>
        (await context.preparer.status("standard")).state === "complete",
      { what: "the standard tier" },
    );
    assert.equal(
      context.built.length,
      13,
      "one task: each archive asked for exactly once",
    );
    const paths = context.upstream.requests.map((entry) => entry.path);
    assert.equal(new Set(paths).size, paths.length);

    const requestsBefore = context.upstream.requests.length;
    const again = await context.preparer.prepare("standard");
    assert.equal(again.state, "complete");
    assert.deepEqual(again.archives, { ready: 13, total: 13 });
    assert.equal(context.upstream.requests.length, requestsBefore);
    assert.equal(context.built.length, 13);
  } finally {
    await context.close();
  }
});

test("a tier the running task already covers is joined; a larger one waits its turn and starts by itself", async () => {
  const context = await scenario();
  try {
    context.control.hold(20);
    const running = await context.preparer.prepare("standard");
    assert.equal(running.state, "running");

    const comfort = await context.preparer.prepare("comfort");
    assert.equal(comfort.state, "queued");
    assert.equal(comfort.queuePosition, 1);
    assert.equal(comfort.runningTier, "standard");
    assert.equal(comfort.current, null);
    assert.ok(comfort.retryAfterSeconds > 0);
    assert.deepEqual(comfort.archives, { ready: 0, total: 61 });

    const essential = await context.preparer.prepare("essential");
    assert.equal(
      essential.runningTier,
      "standard",
      "covered by the task in progress",
    );
    assert.notEqual(essential.state, "queued");

    context.control.open();
    await until(
      async () =>
        (await context.preparer.status("comfort")).state === "complete",
      { what: "the queued comfort tier" },
    );
    assert.equal((await context.preparer.status("standard")).state, "complete");
    assert.equal(context.built.length, 61, "every archive once, none twice");
  } finally {
    await context.close();
  }
});

test("the status gives the archives ready, the archive in progress with its tiles, and an estimate from the pace really measured", async () => {
  const context = await scenario({ concurrency: 1 });
  try {
    // Each tile takes half a second of the shared clock: 60 + 1 * 16 = 76
    // tiles make the low-order archive and the first chunk, the next tile
    // is held.
    context.control.fetchMs = 500;
    context.control.hold(76);
    const started = await context.preparer.prepare("standard");
    assert.equal(started.remainingBasis, "assumed", "nothing measured yet");
    assert.equal(started.remainingSeconds, Math.ceil(252 * 0.9));

    const status = await until(
      async () => {
        const current = await context.preparer.status("standard");
        return current.archives.ready === 2 && current.current?.chunkPix === 1
          ? current
          : null;
      },
      { what: "two archives ready, the third one in progress" },
    );
    assert.equal(status.state, "running");
    assert.deepEqual(status.archives, { ready: 2, total: 13 });
    assert.equal(status.current.tiles.total, 16);
    assert.equal(status.current.tiles.done, 0);
    assert.equal(
      status.current.path,
      "/v1/sky-tiles/dss-colour/Norder2/Chunk0/1.tar",
    );
    assert.equal(status.remainingBasis, "measured");
    // 11 archives of 16 tiles at 0.5 s each.
    assert.equal(status.remainingSeconds, 88);
    assert.equal(status.retryAfterSeconds, 15);
    assert.equal(status.serverTime, iso(context.clock.now()));
  } finally {
    await context.close();
  }
});

test("an archive asked for directly is built ahead of the background task's tiles", async () => {
  const context = await scenario({ concurrency: 2, latencyMs: 15 });
  try {
    const job = await context.preparer.prepare("comfort");
    assert.equal(job.state, "running");
    await until(() => context.upstream.requests.length >= 6, {
      what: "the task to be fetching",
    });

    // The last archive of comfort: none of its 16 tiles is anywhere yet.
    const last = allAddresses(3).at(-1);
    const request = archiveRequest(context.survey, last);
    const asked = context.upstream.requests.length;
    let answer = await context.mirror.ensureArchive(request);
    assert.equal(answer.status, "building");
    answer = await until(
      async () => {
        const next = await context.mirror.ensureArchive(request);
        return next.status === "ready" ? next : null;
      },
      { what: "the archive asked for directly" },
    );
    assert.equal(answer.status, "ready");

    const tileOfLast = (path) => {
      const match = /Norder3\/Dir\d+\/Npix(\d+)\.jpg$/.exec(path);
      if (!match) return false;
      const pix = Number(match[1]);
      return pix >= last.chunkPix * 16 && pix < last.chunkPix * 16 + 16;
    };
    const after = context.upstream.requests
      .slice(asked)
      .map((entry, index) => ({ path: entry.path, index }));
    const lastOfMine = after.filter((entry) => tileOfLast(entry.path)).at(-1);
    assert.ok(lastOfMine, "its tiles were fetched");
    // Its 16 tiles, behind at most the few the task had queued: never behind
    // the rest of the low-order archive's 60.
    assert.ok(
      lastOfMine.index < 16 + 16,
      `its last tile was the ${lastOfMine.index + 1}th request after it was asked for`,
    );
  } finally {
    await context.close();
  }
});

test("after a restart the state is what is on disk, and the next prepare resumes from the tiles already fetched", async () => {
  const directory = await tempDirectory("astro-prepare-restart-");
  const first = await scenario({ directory, concurrency: 1 });
  let second;
  try {
    // A hundred tiles, then the service dies: what is on disk is all that
    // is left of it.
    first.control.hold(100);
    await first.preparer.prepare("standard");
    await until(
      async () =>
        first.control.attempts >= 101 &&
        (await countFiles(join(directory, "tiles"))) === 100 &&
        (await first.preparer.status("standard")).archives.ready === 3,
      { what: "three archives and a partial fourth" },
    );
    first.preparer.dispose();
    first.control.down = true;
    first.control.open();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    const tilesOnDisk = await countFiles(join(directory, "tiles"));
    assert.equal(tilesOnDisk, 100);

    // The service starts again: a new mirror and a new task list over the
    // same directory.
    second = await scenario({ directory, concurrency: 1 });
    const idle = await second.preparer.status("standard");
    assert.equal(idle.state, "idle", "nothing runs until asked again");
    assert.deepEqual(idle.archives, { ready: 3, total: 13 });
    assert.equal(idle.current, null);
    assert.equal(second.upstream.requests.length, 0, "reading builds nothing");

    const resumed = await second.preparer.prepare("standard");
    assert.equal(resumed.state, "running");
    await until(
      async () =>
        (await second.preparer.status("standard")).state === "complete",
      { what: "the resumed tier" },
    );
    assert.equal(
      second.upstream.requests.length,
      252 - tilesOnDisk,
      "only the tiles that were not fetched before",
    );
    assert.deepEqual(second.built[0], "Norder2/Chunk0/2.tar");
  } finally {
    await first.close();
    await second?.close();
    await removeTempDirectory(directory);
  }
});

test("a CDS that does not answer puts the task on hold with its cause and next attempt, never in a tight loop, and it resumes when the CDS is back", async () => {
  const context = await scenario();
  try {
    context.control.down = true;
    const started = await context.preparer.prepare("standard");
    assert.equal(started.state, "running");

    const waiting = await until(
      async () => {
        const status = await context.preparer.status("standard");
        return status.state === "waiting" ? status : null;
      },
      { what: "the task to wait for the CDS" },
    );
    assert.equal(waiting.reason, "upstream_unavailable");
    assert.equal(waiting.nextAttemptAt, iso(context.clock.now() + 30_000));
    assert.ok(
      waiting.retryAfterSeconds >= 15 && waiting.retryAfterSeconds <= 60,
    );
    assert.deepEqual(waiting.archives, { ready: 0, total: 13 });
    assert.equal(waiting.current.order, 1, "the archive it is stuck on");
    assert.equal(context.timers.pending.length, 1);
    assert.equal(context.timers.pending[0].milliseconds, 30_000);

    const attempts = context.control.attempts;
    assert.ok(attempts >= 1 && attempts <= 16, `${attempts} attempts`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
    assert.equal(
      context.control.attempts,
      attempts,
      "nothing tries again until the next attempt is due",
    );

    // Due, but the breaker on the CDS host is still open (a minute): the task
    // tries no connection at all and waits again, longer.
    context.clock.advance(30_000);
    context.timers.fire();
    const again = await until(
      async () => {
        const status = await context.preparer.status("standard");
        return status.state === "waiting" &&
          status.nextAttemptAt === iso(context.clock.now() + 60_000)
          ? status
          : null;
      },
      { what: "a second wait" },
    );
    assert.equal(again.reason, "upstream_unavailable");
    assert.equal(
      context.control.attempts,
      attempts,
      "the open breaker was respected: no connection was attempted",
    );

    context.control.down = false;
    context.clock.advance(60_000);
    context.timers.fire();
    await until(
      async () =>
        (await context.preparer.status("standard")).state === "complete",
      { what: "the tier, once the CDS is back" },
    );
    assert.equal(context.built.at(-1), "Norder2/Chunk0/11.tar");
  } finally {
    await context.close();
  }
});

test("the task never opens more connections than the mirror's limit, background window included", async () => {
  const context = await scenario({ concurrency: 3, latencyMs: 10 });
  try {
    await context.preparer.prepare("standard");
    await until(
      async () =>
        (await context.preparer.status("standard")).state === "complete",
      { what: "the standard tier" },
    );
    assert.ok(
      context.upstream.maxConcurrent <= 3,
      `${context.upstream.maxConcurrent} concurrent requests`,
    );
  } finally {
    await context.close();
  }
});

test("a CDS that refuses a tile for good fails the task with its cause, and a new prepare starts it again", async () => {
  const context = await scenario();
  try {
    context.control.reject = 404;
    await context.preparer.prepare("essential");
    const failed = await until(
      async () => {
        const status = await context.preparer.status("essential");
        return status.state === "failed" ? status : null;
      },
      { what: "the task to fail" },
    );
    assert.equal(failed.reason, "upstream_rejected");
    assert.equal(failed.retryAfterSeconds, null);
    assert.equal(
      context.timers.pending.length,
      0,
      "no retry timer for a refusal",
    );

    context.control.reject = null;
    const restarted = await context.preparer.prepare("essential");
    assert.equal(restarted.state, "running");
    await until(
      async () =>
        (await context.preparer.status("essential")).state === "complete",
      { what: "the tier after the restart" },
    );
  } finally {
    await context.close();
  }
});

test("a tier that cannot fit in the mirror's size limit is refused up front, with the numbers, and nothing is fetched", async () => {
  const context = await scenario({ maxBytes: 1_000_000 });
  try {
    await assert.rejects(context.preparer.prepare("comfort"), (error) => {
      assert.ok(error instanceof SkyBackdropPrepareError);
      assert.equal(error.code, "sky_backdrop_tier_exceeds_mirror_limit");
      assert.equal(error.status, 409);
      assert.equal(error.details.tier, "comfort");
      assert.equal(error.details.limitBytes, 1_000_000);
      assert.ok(error.details.requiredBytes > 900_000);
      assert.equal(
        error.details.minimumLimitBytes,
        Math.ceil(error.details.requiredBytes / 0.9),
      );
      return true;
    });
    assert.equal(context.control.attempts, 0);
    assert.equal((await context.preparer.status("comfort")).state, "idle");

    // A tier that fits is accepted on the very same mirror.
    const standard = await context.preparer.prepare("standard");
    assert.equal(standard.state, "running");
  } finally {
    await context.close();
  }
});

// The manifest announces a tier the service cannot provide, by
// `skyBackdropTierFit`, and the refusal below is decided by the very same
// function — so what is announced is refused, and what is not is accepted,
// on the same mirror, with the same numbers.
test("the refusal is decided by the rule the manifest announces with: every tier the rule says does not fit is refused, every tier it says fits is accepted", async () => {
  const context = await scenario({ maxBytes: 1_000_000 });
  try {
    const verdicts = tiers.map((tier) => ({
      tier,
      fit: skyBackdropTierFit({
        tier,
        meanTileBytesByOrder: meanTileBytes,
        archiveChunkDelta: delta,
        maxBytes: context.mirror.maxBytes,
        evictionTargetRatio: context.mirror.evictionTargetRatio,
      }),
    }));
    assert.deepEqual(
      verdicts.map(({ tier, fit }) => [tier.id, fit.fits]),
      [
        ["essential", true],
        ["standard", true],
        ["comfort", false],
      ],
      "the scenario has tiers on both sides of the limit",
    );
    for (const { tier, fit } of verdicts) {
      if (fit.fits) {
        const accepted = await context.preparer.prepare(tier.id);
        assert.notEqual(accepted.state, "idle", tier.id);
      } else {
        await assert.rejects(context.preparer.prepare(tier.id), (error) => {
          assert.equal(error.code, "sky_backdrop_tier_exceeds_mirror_limit");
          assert.equal(error.details.requiredBytes, fit.requiredBytes);
          assert.equal(error.details.minimumLimitBytes, fit.minimumLimitBytes);
          assert.equal(error.details.limitBytes, context.mirror.maxBytes);
          return true;
        });
      }
    }
  } finally {
    await context.close();
  }
});

test("skyBackdropTierFit: the requirement grows with the tier, the smallest sufficient limit is exact, and tile sizes read from JSON (string keys) count the same", () => {
  const tiersAtDelta4 = [
    { id: "essential", maxOrder: 3 },
    { id: "standard", maxOrder: 4 },
    { id: "comfort", maxOrder: 5 },
    { id: "quality", maxOrder: 6 },
  ];
  const means = {
    0: 48467,
    1: 43093,
    2: 41740,
    3: 43507,
    4: 54519,
    5: 75403,
    6: 92750,
  };
  const asJson = JSON.parse(JSON.stringify(means));
  const fits = tiersAtDelta4.map((tier) =>
    skyBackdropTierFit({
      tier,
      meanTileBytesByOrder: means,
      archiveChunkDelta: 4,
      maxBytes: 4 * 1024 ** 3,
      evictionTargetRatio: 0.9,
    }),
  );
  assert.deepEqual(
    fits.map((fit) => fit.fits),
    [true, true, true, false],
    "the default 4 GiB refuses only the fourth tier",
  );
  const required = fits.map((fit) => fit.requiredBytes);
  assert.deepEqual(
    required,
    [...required].sort((a, b) => a - b),
    "a higher tier needs more",
  );
  for (const [index, tier] of tiersAtDelta4.entries()) {
    const again = skyBackdropTierFit({
      tier,
      meanTileBytesByOrder: asJson,
      archiveChunkDelta: 4,
      maxBytes: 4 * 1024 ** 3,
      evictionTargetRatio: 0.9,
    });
    assert.deepEqual(again, fits[index], tier.id);
    // The smallest limit that lets the tier in is exact.
    const { minimumLimitBytes } = fits[index];
    const atMinimum = skyBackdropTierFit({
      tier,
      meanTileBytesByOrder: means,
      archiveChunkDelta: 4,
      maxBytes: minimumLimitBytes,
      evictionTargetRatio: 0.9,
    });
    assert.equal(atMinimum.fits, true, `${tier.id} at its minimum`);
    const below = skyBackdropTierFit({
      tier,
      meanTileBytesByOrder: means,
      archiveChunkDelta: 4,
      maxBytes: minimumLimitBytes - 2,
      evictionTargetRatio: 0.9,
    });
    assert.equal(below.fits, false, `${tier.id} just under its minimum`);
  }
});

test("an unknown tier is refused as such", async () => {
  const context = await scenario();
  try {
    await assert.rejects(context.preparer.prepare("ultra"), (error) => {
      assert.equal(error.code, "sky_backdrop_tier_unknown");
      assert.equal(error.status, 404);
      return true;
    });
    await assert.rejects(context.preparer.status("ultra"), (error) => {
      assert.equal(error.code, "sky_backdrop_tier_unknown");
      return true;
    });
  } finally {
    await context.close();
  }
});

test("the size limit never evicts an archive of the tier being prepared, however tight the cache", async () => {
  // 2,000-byte tiles: the 252 tiles of "standard" are 504 kB and its 13
  // archives 658 kB. With room for 950 kB, the tiles and the archives cannot
  // both stay: every finished archive's tiles have to go, but no archive.
  const context = await scenario({
    maxBytes: 950_000,
    bytes: 2000,
  });
  try {
    await context.preparer.prepare("standard");
    await until(
      async () => {
        const status = await context.preparer.status("standard");
        if (status.state === "waiting" || status.state === "failed")
          throw new Error(`the task stopped: ${status.state} ${status.reason}`);
        return status.state === "complete";
      },
      { what: "the tier under a tight limit" },
    );
    const progress = await context.mirror.tierArchiveProgress({
      survey: context.survey,
      maxOrder: 2,
      archiveChunkDelta: delta,
    });
    assert.equal(progress.ready, 13);
    for (const address of allAddresses(2))
      assert.equal(
        (
          await context.mirror.buildArchive(
            archiveRequest(context.survey, address),
          )
        ).status,
        "ready",
        archiveRelativePath(address),
      );
    const tilesLeft = await countFiles(join(context.dir, "tiles"));
    assert.ok(tilesLeft < 252, `${tilesLeft} tiles left: the cache did evict`);
    // The tier's archives are released for the usual eviction once done.
    assert.equal(context.upstream.requests.length, 252);
  } finally {
    await context.close();
  }
});

test("a build in progress keeps its own tiles, and the archives it needs are protected only while a task holds them", async () => {
  const context = await scenario({ maxBytes: 4_000, bytes: 600 });
  try {
    const release = context.mirror.protectArchives({
      survey: context.survey,
      addresses: allAddresses(1),
    });
    await buildDirectly(context, allAddresses(1)[0]);
    // A tile fetched afterwards pushes the cache over its budget: the
    // protected archive stays, the unprotected tiles go.
    await context.mirror.ensureTile({
      survey: context.survey,
      order: 5,
      pix: 7,
      extension: "jpg",
    });
    await context.mirror.ensureTile({
      survey: context.survey,
      order: 5,
      pix: 8,
      extension: "jpg",
    });
    const archivePath = join(
      context.dir,
      "archives",
      "dss-colour",
      archiveRelativePath(allAddresses(1)[0]),
    );
    await stat(archivePath);
    release();
    await context.mirror.ensureTile({
      survey: context.survey,
      order: 5,
      pix: 9,
      extension: "jpg",
    });
    await assert.rejects(
      stat(archivePath),
      "once released, the archive is an ordinary cache entry again",
    );
  } finally {
    await context.close();
  }
});

// ------------------------------------------------------------ the limiter

test("the trigger limiter lets a client start a few tasks a minute, and says when to come back", () => {
  const clock = fakeClock();
  const limiter = createTriggerLimiter({
    limit: 3,
    periodMs: 60_000,
    now: clock.now,
  });
  assert.equal(limiter.take("a").allowed, true);
  clock.advance(10_000);
  assert.equal(limiter.take("a").allowed, true);
  assert.equal(limiter.take("a").allowed, true);
  const refused = limiter.take("a");
  assert.equal(refused.allowed, false);
  assert.equal(refused.retryAfterSeconds, 50);
  assert.equal(limiter.take("b").allowed, true, "another client is unaffected");
  clock.advance(50_000);
  assert.equal(limiter.take("a").allowed, true, "the first request aged out");
  assert.equal(limiter.take("a").allowed, false);
});

test("the trigger limiter forgets clients that stopped asking, so its memory stays bounded", () => {
  const clock = fakeClock();
  const limiter = createTriggerLimiter({
    limit: 1,
    periodMs: 1000,
    now: clock.now,
    maximumClients: 50,
  });
  for (let index = 0; index < 200; index += 1) {
    limiter.take(`client-${index}`);
    clock.advance(2000);
  }
  assert.ok(limiter.size <= 51, `${limiter.size} clients remembered`);
});
