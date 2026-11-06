/**
 * The background preparation of a sky-backdrop tier: a task that builds, one
 * after the other, every archive of a tier the mirror does not have yet, in
 * the order the mobile application downloads them — the low-order archive,
 * then order by order, pixel by pixel (`tierArchiveAddresses`) — and reports
 * its progress. A service whose mirror is empty otherwise builds an archive
 * only when somebody asks for it, about one a minute from the CDS, and stops
 * building as soon as nobody asks: the phone waited on a `503` for each
 * archive in turn, unable to say why.
 *
 * What it is, and is not:
 *
 * - One task at a time for the whole service (`active`). A request for a tier
 *   it already covers — tiers are cumulative: comfort holds everything
 *   standard does — joins it; a larger one waits in `queued` and starts by
 *   itself, skipping every archive already there.
 * - Nothing here is persisted. After a restart, or a wake-up of a service that
 *   scales to zero, `status` reads what is on disk (the mirror's archive
 *   index, and the tiles an interrupted archive left behind, which the next
 *   build finds and does not fetch again) and says `idle`; the task resumes
 *   at the next `prepare`.
 * - It never fetches faster than a client could. It builds through
 *   `mirror.buildArchive`, that is through the mirror's own connection limit
 *   and host breakers, with a small window of tiles requested ahead, so an
 *   archive asked for directly is built ahead of it (`mirror.js`).
 * - It never loops on a failure. A CDS that does not answer puts it in
 *   `waiting` with the cause and the time of the next attempt (30 s, doubling
 *   up to 5 min, and at least as long as the breaker's cooldown); a tile the
 *   CDS refuses for good ends it in `failed`, until asked again.
 * - The archives of a tier being prepared are protected from the byte
 *   budget's eviction (`mirror.protectArchives`), and a tier that could not
 *   fit in the configured budget is refused up front
 *   (`sky_backdrop_tier_exceeds_mirror_limit`), never started and evicted
 *   from under itself.
 *
 * Time, the timer and the mirror are injected, so that the tests drive them.
 */

import {
  archiveRelativePath,
  archiveTileAddresses,
  archiveTileCount,
  tierArchiveAddresses,
} from "./geometry.js";
import { skyTileMirror } from "./mirror.js";
import {
  defaultSkyBackdropSurveyId,
  dssColourMeanTileBytesByOrder,
  skyBackdropArchiveChunkDelta,
  skyBackdropSurveys,
  skyBackdropTierDefinitions,
} from "./surveys.js";
import { skyBackdropTierFit } from "./tier-fit.js";

/** What the routes answer, as `{ code, status, details }`. */
export class SkyBackdropPrepareError extends Error {
  constructor(code, message, status, details = {}) {
    super(message);
    this.name = "SkyBackdropPrepareError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// ---------------------------------------------------------------- the limiter

/**
 * A sliding window per client: `limit` requests in `periodMs`. Same model as
 * `portal-app/routes/api/logs/route.js`'s, with its memory bounded (`maximumClients`).
 * `take` says whether one more request is allowed and, if not, in how many
 * seconds the oldest one ages out.
 */
export function createTriggerLimiter({
  limit = 10,
  periodMs = 60_000,
  now = Date.now,
  maximumClients = 500,
} = {}) {
  const attempts = new Map();
  return {
    get size() {
      return attempts.size;
    },
    take(key) {
      const timestamp = now();
      const recent = (attempts.get(key) || []).filter(
        (entry) => entry > timestamp - periodMs,
      );
      if (recent.length >= limit) {
        attempts.set(key, recent);
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((recent[0] + periodMs - timestamp) / 1000),
          ),
        };
      }
      recent.push(timestamp);
      attempts.set(key, recent);
      if (attempts.size > maximumClients) {
        for (const [candidate, entries] of attempts) {
          if (!entries.some((entry) => entry > timestamp - periodMs))
            attempts.delete(candidate);
        }
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

let sharedLimiter = null;

/** The one limiter of a running process: every client may start ten
 * preparations a minute (`POST .../prepare`); reading is never limited. */
export function skyBackdropPrepareLimiter() {
  if (!sharedLimiter) sharedLimiter = createTriggerLimiter();
  return sharedLimiter;
}

// ------------------------------------------------------------------- the task

/** How long, in seconds, a client is advised to wait before reading the state
 * again. Never more than a minute: a platform may put an idle service to sleep,
 * and a preparation in progress does not count as a request — a client that
 * reads at this pace keeps it awake. */
const runningPollSeconds = 15;
const queuedPollSeconds = 30;
const waitingPollBounds = { min: 15, max: 60 };

/** Fetched tiles needed before the task's own pace replaces the mirror's. */
const minimumFetchedTilesForPace = 8;

function defaultSchedule(callback, milliseconds) {
  const timer = setTimeout(callback, milliseconds);
  timer.unref?.();
  return () => clearTimeout(timer);
}

const iso = (milliseconds) => new Date(milliseconds).toISOString();

/** Why a build failed, as the task reports it. */
function classify(error) {
  if (error?.permanent) return { reason: "upstream_rejected", permanent: true };
  if (
    error?.connectionFailure ||
    error?.retryableStatus !== undefined ||
    error?.exhausted
  )
    return {
      reason: "upstream_unavailable",
      retryAfterSeconds: Number(error.retryAfterSeconds) || 0,
    };
  // A file-system error (a full disk, a share that went away).
  if (error?.syscall) return { reason: "storage_error" };
  return { reason: "internal_error" };
}

/**
 * @param {object} [options]
 * @param {object} [options.mirror] a `createSkyTileMirror()` instance.
 * @param {() => object} [options.survey] the survey to prepare — resolved at
 *   each use, since the table can be patched (tests) or reloaded.
 * @param {{ id: string, maxOrder: number }[]} [options.tiers] the tiers a
 *   client may ask for, by id.
 * @param {number} [options.archiveChunkDelta]
 * @param {object} [options.meanTileBytesByOrder] the tile sizes the size
 *   check uses; the mirror's observed means by default.
 * @param {() => number} [options.now] milliseconds since the epoch.
 * @param {(callback: () => void, milliseconds: number) => () => void} [options.schedule]
 *   arms a timer, returns what cancels it.
 * @param {{ base: number, max: number }} [options.retryBackoffSeconds]
 */
export function createSkyBackdropPreparer({
  mirror = skyTileMirror(),
  survey: surveyOf = () => skyBackdropSurveys[defaultSkyBackdropSurveyId],
  tiers = skyBackdropTierDefinitions,
  archiveChunkDelta = skyBackdropArchiveChunkDelta,
  meanTileBytesByOrder = null,
  now = () => mirror.now(),
  schedule = defaultSchedule,
  retryBackoffSeconds = { base: 30, max: 300 },
} = {}) {
  const definitions = [...tiers].sort((a, b) => a.maxOrder - b.maxOrder);
  // Accepted tasks: queued, the one running or waiting, and failed ones (kept
  // so that reading says why, until the tier is asked for again).
  const jobs = [];
  let active = null;
  let disposed = false;
  let cancelWait = null;

  function tierNamed(id) {
    const tier = definitions.find((entry) => entry.id === id);
    if (!tier)
      throw new SkyBackdropPrepareError(
        "sky_backdrop_tier_unknown",
        `Unknown sky-backdrop tier "${id}".`,
        404,
      );
    return tier;
  }

  const covers = (larger, smaller) => larger.maxOrder >= smaller.maxOrder;

  function progressOf(tier) {
    return mirror.tierArchiveProgress({
      survey: surveyOf(),
      maxOrder: tier.maxOrder,
      archiveChunkDelta,
    });
  }

  // ------------------------------------------------------------- size check

  /**
   * Whether [tier] can fit in the mirror's byte budget, by `tier-fit.js` — the
   * rule the manifest announces a tier `unavailable` by, so that what it
   * announces is what is refused here.
   */
  async function assertFits(tier) {
    const means =
      meanTileBytesByOrder ??
      (await mirror.observedMeanTileBytesByOrder(
        surveyOf().id,
        dssColourMeanTileBytesByOrder,
      ));
    const fit = skyBackdropTierFit({
      tier,
      meanTileBytesByOrder: means,
      archiveChunkDelta,
      maxBytes: mirror.maxBytes,
      evictionTargetRatio: mirror.evictionTargetRatio,
    });
    if (fit.fits) return;
    throw new SkyBackdropPrepareError(
      "sky_backdrop_tier_exceeds_mirror_limit",
      `The "${tier.id}" tier needs about ${fit.requiredBytes} bytes of this ` +
        `portal's sky-tile mirror, whose limit is ${mirror.maxBytes} bytes ` +
        `(${fit.usableBytes} usable). Raise ` +
        `ASTRO_PORTAL_SKY_TILE_MIRROR_MAX_BYTES to at least ` +
        `${fit.minimumLimitBytes} to prepare it.`,
      409,
      {
        tier: tier.id,
        requiredBytes: fit.requiredBytes,
        limitBytes: mirror.maxBytes,
        minimumLimitBytes: fit.minimumLimitBytes,
      },
    );
  }

  // ----------------------------------------------------------------- status

  /** The task that answers for [tier]: the running one when it covers it,
   * else the queued one that does (with its place in the queue), else a
   * failed one that did. */
  function handlerOf(tier) {
    if (active && covers(active.tier, tier)) return { job: active };
    const queued = jobs.filter((job) => job.state === "queued");
    const position = queued.findIndex((job) => covers(job.tier, tier));
    if (position >= 0) return { job: queued[position], position: position + 1 };
    const failed = jobs.find(
      (job) => job.state === "failed" && covers(job.tier, tier),
    );
    return failed ? { job: failed } : null;
  }

  /** Seconds per tile: what this task measured of its own builds once it
   * fetched enough tiles, the mirror's measured (or assumed) pace before. */
  function paceOf(job) {
    const build = job?.current?.build ?? null;
    const fetched = (job?.fetchedTiles ?? 0) + (build?.fetched ?? 0);
    const elapsedMs =
      (job?.buildingMs ?? 0) +
      (build && job.state === "running" ? now() - job.current.startedAt : 0);
    if (fetched >= minimumFetchedTilesForPace && elapsedMs > 0)
      return { secondsPerTile: elapsedMs / 1000 / fetched, basis: "measured" };
    const upstream = mirror.upstreamPace();
    return {
      secondsPerTile: upstream.secondsPerTile / mirror.concurrency,
      basis: upstream.measured ? "measured" : "assumed",
    };
  }

  function currentOf(job) {
    if (!job?.current) return null;
    const { address, build, completed } = job.current;
    const total = archiveTileCount(address, archiveChunkDelta);
    return {
      path: `/v1/sky-tiles/${surveyOf().id}/${archiveRelativePath(address)}`,
      order: address.order,
      chunkOrder: address.chunkOrder,
      chunkPix: address.chunkPix,
      tiles: { done: completed ? total : (build?.done ?? 0), total },
    };
  }

  /** The state of [tier] as of this instant; `progress` is what the mirror's
   * archive index said a moment ago. */
  function describe(tier, progress) {
    const complete = progress.ready >= progress.total;
    const handler = complete ? null : handlerOf(tier);
    const job = handler?.job ?? null;
    const state = complete ? "complete" : (job?.state ?? "idle");
    const inProgress = state === "running" || state === "waiting";

    let remainingSeconds = null;
    let remainingBasis = null;
    if (complete) remainingSeconds = 0;
    else if (inProgress || state === "queued") {
      const pace = paceOf(active);
      const current = active?.current;
      const currentKey = current ? archiveRelativePath(current.address) : null;
      let tiles = 0;
      for (const address of progress.missing) {
        tiles += archiveTileCount(address, archiveChunkDelta);
        if (currentKey && archiveRelativePath(address) === currentKey)
          tiles -= current.build?.done ?? 0;
      }
      remainingSeconds = Math.max(0, Math.ceil(tiles * pace.secondsPerTile));
      remainingBasis = pace.basis;
    }

    let retryAfterSeconds = null;
    if (state === "running") retryAfterSeconds = runningPollSeconds;
    else if (state === "queued") retryAfterSeconds = queuedPollSeconds;
    else if (state === "waiting")
      retryAfterSeconds = Math.min(
        waitingPollBounds.max,
        Math.max(
          waitingPollBounds.min,
          Math.ceil((job.nextAttemptAt - now()) / 1000),
        ),
      );

    return {
      tier: tier.id,
      state,
      archives: { ready: progress.ready, total: progress.total },
      current:
        inProgress || state === "failed"
          ? currentOf(state === "failed" ? job : active)
          : null,
      remainingSeconds,
      remainingBasis,
      reason: state === "waiting" || state === "failed" ? job.reason : null,
      nextAttemptAt: state === "waiting" ? iso(job.nextAttemptAt) : null,
      runningTier: active ? active.tier.id : null,
      queuePosition: state === "queued" ? handler.position : null,
      retryAfterSeconds,
      startedAt: job?.startedAt != null ? iso(job.startedAt) : null,
      serverTime: iso(now()),
    };
  }

  async function status(tierId) {
    const tier = tierNamed(tierId);
    return describe(tier, await progressOf(tier));
  }

  // ---------------------------------------------------------------- the task

  function sleep(milliseconds) {
    return new Promise((resolvePromise) => {
      const cancel = schedule(() => {
        cancelWait = null;
        resolvePromise();
      }, milliseconds);
      cancelWait = () => {
        cancelWait = null;
        cancel();
        resolvePromise();
      };
    });
  }

  /** Adds what a finished (or failed) build cost to the task's own pace. */
  function settleBuild(job) {
    const { build, startedAt } = job.current;
    if (!build) return;
    job.fetchedTiles += build.fetched;
    job.buildingMs += Math.max(0, now() - startedAt);
    job.current.build = null;
  }

  /**
   * Waits before the next attempt, and says why: 30 s after a first failure,
   * doubling up to 5 min, and never less than the breaker's own cooldown when
   * the CDS host is in it. Nothing is tried meanwhile. Resolves `"stopped"`
   * if the preparer was disposed of in the meantime.
   */
  async function holdOn(job, cause) {
    job.reason = cause.reason;
    job.attempts += 1;
    const backoff = Math.min(
      retryBackoffSeconds.max,
      retryBackoffSeconds.base * 2 ** (job.attempts - 1),
    );
    const seconds = Math.max(backoff, cause.retryAfterSeconds ?? 0);
    job.state = "waiting";
    job.nextAttemptAt = now() + seconds * 1000;
    await sleep(seconds * 1000);
    if (disposed) return "stopped";
    job.state = "running";
    job.reason = null;
    job.nextAttemptAt = null;
    return "resumed";
  }

  /** One archive, until it is built: a failure waits (or ends the task, when
   * the CDS refuses for good) and asks again. */
  async function buildOne(job, address) {
    const survey = surveyOf();
    const request = {
      survey,
      ...address,
      addresses: archiveTileAddresses(address, {
        maxOrder: survey.maxOrder,
        archiveChunkDelta,
      }),
    };
    job.current = {
      address,
      build: null,
      startedAt: now(),
      completed: false,
    };
    for (;;) {
      if (disposed) return "stopped";
      let failure = null;
      try {
        const begun = await mirror.buildArchive(request);
        if (begun.status === "building") {
          job.current.build = begun.build;
          job.current.startedAt = begun.build.startedAt ?? now();
          try {
            await begun.build.promise;
          } catch (error) {
            failure = error;
          }
          settleBuild(job);
        }
      } catch (error) {
        failure = error;
      }
      if (!failure) {
        job.attempts = 0;
        job.current.completed = true;
        return "built";
      }

      const cause = classify(failure);
      if (cause.permanent) {
        job.reason = cause.reason;
        job.state = "failed";
        return "failed";
      }
      // eslint-disable-next-line no-await-in-loop
      if ((await holdOn(job, cause)) === "stopped") return "stopped";
      job.current.startedAt = now();
    }
  }

  async function run(job) {
    try {
      for (;;) {
        if (disposed) return;
        // eslint-disable-next-line no-await-in-loop
        const progress = await progressOf(job.tier);
        // Always the first archive still missing: what a client asked for
        // directly meanwhile is skipped, what was evicted is built again.
        const next = progress.missing[0];
        if (!next) {
          job.state = "complete";
          return;
        }
        const name = archiveRelativePath(next);
        if (name === job.lastBuilt) {
          // Built a moment ago, and the index still lacks it: it could not
          // be written (a full disk, a share that went away). Asking again
          // at once would spin; wait, like for any other failure.
          job.lastBuilt = null;
          // eslint-disable-next-line no-await-in-loop
          if ((await holdOn(job, { reason: "storage_error" })) === "stopped")
            return;
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const outcome = await buildOne(job, next);
        if (outcome !== "built") return;
        job.lastBuilt = name;
      }
    } catch (error) {
      // Not a build failure: a bug. Ended, and said so, not lost.
      job.state = "failed";
      job.reason = "internal_error";
      console.warn(
        `The sky-backdrop preparation of "${job.tier.id}" stopped: ${error?.message}`,
      );
    } finally {
      job.release?.();
      job.release = null;
      if (active === job) active = null;
      if (job.state === "complete") {
        const position = jobs.indexOf(job);
        if (position >= 0) jobs.splice(position, 1);
      }
      startNext();
    }
  }

  function launch(job) {
    active = job;
    job.state = "running";
    job.startedAt = now();
    run(job);
  }

  function startNext() {
    if (disposed || active) return;
    const next = jobs.find((job) => job.state === "queued");
    if (next) launch(next);
  }

  /**
   * Accepts a task for [tier] — synchronously, so that concurrent requests
   * cannot both create one — and protects the tier's archives from eviction
   * for as long as it lives.
   */
  function accept(tier, progress) {
    for (let index = jobs.length - 1; index >= 0; index -= 1)
      if (jobs[index].state === "failed" && covers(tier, jobs[index].tier))
        jobs.splice(index, 1);
    const job = {
      tier,
      state: "queued",
      startedAt: null,
      current: null,
      attempts: 0,
      reason: null,
      nextAttemptAt: null,
      fetchedTiles: 0,
      buildingMs: 0,
      lastBuilt: null,
      release: mirror.protectArchives({
        survey: surveyOf(),
        addresses: tierArchiveAddresses(tier.maxOrder, archiveChunkDelta),
      }),
    };
    jobs.push(job);
    if (!active) {
      launch(job);
      // Said from the first answer on, before the task has read the index.
      job.current = {
        address: progress.missing[0],
        build: null,
        startedAt: now(),
        completed: false,
      };
    }
  }

  async function prepare(tierId) {
    const tier = tierNamed(tierId);
    const progress = await progressOf(tier);
    const complete = progress.ready >= progress.total;
    const covered = () => {
      const held = handlerOf(tier);
      return Boolean(held && held.job.state !== "failed");
    };
    if (!complete && !covered()) await assertFits(tier);
    // From here to the answer nothing waits: two requests arriving together
    // find one task, not two.
    if (!complete && !covered()) accept(tier, progress);
    return describe(tier, progress);
  }

  function dispose() {
    disposed = true;
    cancelWait?.();
    for (const job of jobs) {
      job.release?.();
      job.release = null;
    }
    jobs.length = 0;
    active = null;
  }

  return { mirror, prepare, status, dispose };
}

let sharedPreparer = null;

/**
 * The one preparer of a running process, over the process's own mirror. It
 * follows the mirror: a mirror that was reset (tests) gets a new preparer, the
 * old one stopped.
 */
export function skyBackdropPreparer() {
  const mirror = skyTileMirror();
  if (!sharedPreparer || sharedPreparer.mirror !== mirror) {
    sharedPreparer?.dispose();
    sharedPreparer = createSkyBackdropPreparer({ mirror });
  }
  return sharedPreparer;
}

/** Test seam, like `resetSkyTileMirror`. */
export function resetSkyBackdropPreparer() {
  sharedPreparer?.dispose();
  sharedPreparer = null;
}
