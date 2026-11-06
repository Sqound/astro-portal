/**
 * The self-hosted HiPS tile mirror: a disk cache in front of the chosen sky-tile survey's own CDS-hosted
 * tiles, plus pre-aggregated `.tar` archives so a mobile client can fill an
 * offline-pack tier in a handful of requests instead of thousands. The point of
 * this file is that every device
 * downloads from *this* portal, never in bulk from the CDS directly.
 *
 * State that must survive Next's dev-mode hot reload and be shared by every
 * request in one process lives at module scope — the same convention this
 * repository already uses for `portal-app/lib/offline-pack.server.js`'s manifest
 * cache and `packages/portal/src/planner/sky-quality.server.js`'s raster
 * memo (neither attaches to `globalThis`; nothing else in the repository
 * does either, so this does not start).
 */

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  archiveRelativePath as archiveAddressPath,
  healpixTileDir,
  tierArchiveAddresses,
} from "./geometry.js";
import { ustarEndMarker, writeUstarEntry } from "./tar.js";

// ------------------------------------------------------------ configuration
//
// Every knob is an environment variable, resolved the same way
// `sky-quality.server.js` resolves its own directory: this package must not
// import `portal-app/lib/config.server.js` (that module is the application's, above this package),
// so the `ASTRO_PORTAL_SERVICE_DIR` / `ASTRO_PORTAL_RUNTIME_DIR` resolution
// is duplicated rather than shared.

export function skyTileMirrorDirectory() {
  const explicit = process.env.ASTRO_PORTAL_SKY_TILE_MIRROR_DIR;
  if (explicit) return resolve(explicit);
  const serviceDirectory = resolve(
    process.env.ASTRO_PORTAL_SERVICE_DIR || process.cwd(),
  );
  const runtimeDirectory = resolve(
    process.env.ASTRO_PORTAL_RUNTIME_DIR ||
      join(serviceDirectory, ".astro-portal"),
  );
  return join(runtimeDirectory, "sky-tiles");
}

const defaultMaxBytes = 4 * 1024 * 1024 * 1024; // 4 GiB

export function skyTileMirrorMaxBytes() {
  const raw = Number(process.env.ASTRO_PORTAL_SKY_TILE_MIRROR_MAX_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : defaultMaxBytes;
}

const defaultConcurrency = 4;

export function skyTileMirrorConcurrency() {
  const raw = Number(process.env.ASTRO_PORTAL_SKY_TILE_MIRROR_CONCURRENCY);
  return Number.isInteger(raw) && raw > 0 ? raw : defaultConcurrency;
}

// ---------------------------------------------------- upstream-root fallback
//
// 2026-09-20: `alasky.cds.unistra.fr` (the CDS's primary HiPS host) stopped
// accepting connections at all — not a slow or erroring response, a TCP
// connect that never completes — which, before this, meant every tile
// request paid the *old* single, 15 s-per-attempt, 4-attempt retry loop in
// full (`packages/portal/tests/sky-tiles-mirror.test.mjs`'s own worst case)
// before answering `503`. `ASTRO_PORTAL_UPSTREAM_CONNECT_TIMEOUT_MS` is the
// short, distinct budget for "has this host answered at all yet" — deliberately
// separate from `ASTRO_PORTAL_UPSTREAM_TIMEOUT_MS`'s overall per-attempt
// budget (a host that connects but stalls mid-response) — so a survey with
// more than one `upstreamRoots` entry (`packages/portal/src/sky-tiles/surveys.js`)
// fails over to the next one in a few seconds rather than tens of them. See
// docs/SKY_TILES_MIRROR.md#mirrored-upstream-roots for the worked-out worst
// case.
const defaultUpstreamConnectTimeoutMs = 5000;

export function skyTileUpstreamConnectTimeoutMs() {
  const raw = Number(process.env.ASTRO_PORTAL_UPSTREAM_CONNECT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0
    ? raw
    : defaultUpstreamConnectTimeoutMs;
}

const defaultUpstreamTimeoutMs = 20000;

export function skyTileUpstreamTimeoutMs() {
  const raw = Number(process.env.ASTRO_PORTAL_UPSTREAM_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : defaultUpstreamTimeoutMs;
}

/** `ASTRO_PORTAL_SKY_TILE_MIRROR=off` is the lever for an instance that has
 * not settled the DSS licensing question for public distribution. The offline-pack manifest (`portal-app/lib/offline-pack.server.js`)
 * imports this rather than re-reading the environment variable itself, so
 * the two never drift. */
export function skyTileMirrorEnabled() {
  return process.env.ASTRO_PORTAL_SKY_TILE_MIRROR !== "off";
}

// No personal address by default (`npm run audit:public`): the project's own
// public repository, exactly as the weather and elevation proxies already
// identify themselves to their own upstreams
// (`packages/portal/src/planner/location.server.js`,
// `packages/portal/src/astronomy-weather.server.js`).
const upstreamUserAgentFallback =
  "astro-portal/1.0 (self-hosted HiPS mirror; +https://github.com/sqound/astro-portal)";

export function skyTileUpstreamUserAgent() {
  return (
    process.env.ASTRO_PORTAL_UPSTREAM_USER_AGENT || upstreamUserAgentFallback
  );
}

// -------------------------------------------------------------- filesystem

async function statOrNull(path) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

async function touchFile(path) {
  const now = new Date();
  try {
    await utimes(path, now, now);
  } catch {
    // A file that vanished between the caller's own stat and this touch is
    // not this function's problem to raise; the caller already has what it
    // asked for from the stat it just did.
  }
}

/** Writes `data` (a `Buffer`) to `path` through a `.part` sibling, renamed
 * into place only once every byte has landed — so a reader never observes a
 * half-written tile, and a crash mid-write leaves only an orphaned `.part`
 * (cleaned up the next time this exact path is fetched again). */
async function writeAtomically(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const partPath = `${path}.part`;
  await writeFile(partPath, data);
  await rename(partPath, path);
}

/** Any `.part` file found here belongs to no in-flight build in *this*
 * process — the single-flight maps below are always checked first — so it
 * can only be a crash's leftover. Ignored, then removed. */
async function cleanupOrphanPart(path) {
  try {
    await rm(`${path}.part`, { force: true });
  } catch {
    // Nothing to clean up, or a race with another cleanup: either way there
    // is no orphan left, which is the postcondition this function promises.
  }
}

async function walkDirectoryBytes(directory) {
  let total = 0;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await walkDirectoryBytes(path);
      continue;
    }
    if (entry.name.endsWith(".part")) continue; // orphans are never counted
    const info = await statOrNull(path);
    if (info) total += info.size;
  }
  return total;
}

async function collectCacheFiles(directory, out) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectCacheFiles(path, out);
      continue;
    }
    if (entry.name.endsWith(".part")) continue;
    const info = await statOrNull(path);
    if (info) out.push({ path, size: info.size, mtimeMs: info.mtimeMs });
  }
}

async function fileSha256(path) {
  return await new Promise((resolvePromise, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolvePromise(hash.digest("hex")));
    stream.on("error", reject);
  });
}

// ------------------------------------------------------------- concurrency
//
// One counting semaphore, shared by tile fetches and archive builds alike
// — the whole point being that an archive under construction
// never lets the mirror open more than `concurrency` sockets to the CDS at
// once, no matter how many tiles it still needs.

function createSemaphore(limit) {
  let active = 0;
  const queue = [];
  return async function run(task) {
    if (active >= limit)
      await new Promise((resolvePromise) => queue.push(resolvePromise));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      const next = queue.shift();
      if (next) next();
    }
  };
}

function defaultSleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/** A real, bounded wait that never keeps the process alive — distinct from
 * the injectable `sleepImpl`, which tests make instantaneous for the
 * upstream backoff and which must not shorten these waits too. */
function realDelay(ms) {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, ms).unref(),
  );
}

/** The default inventory: every byte under `tiles/` and `archives/`. */
async function cacheDirectoryBytes(directory) {
  return (
    (await walkDirectoryBytes(join(directory, "tiles"))) +
    (await walkDirectoryBytes(join(directory, "archives")))
  );
}

/** A permanent (non-retryable) upstream failure: any status other than 429
 * or 5xx. Every mirror serves the exact same bytes at the exact same path
 * (see docs/SKY_TILES_MIRROR.md, « Integrity »), so a resource one root does not have will
 * not appear at another one either — this is the one failure `fetchFromUpstreamRoots`
 * below does not fail over on. */
function permanentUpstreamError(status, url) {
  return Object.assign(new Error(`Upstream ${status} for ${url}`), {
    permanent: true,
    status,
  });
}

/**
 * One attempt against one URL, classified into exactly the three outcomes
 * the rest of this file needs to distinguish:
 *
 * - resolves with the response body's bytes on success;
 * - throws `{ connectionFailure: true }` when nothing usable came back at
 *   all — the connect phase ran past `connectTimeoutMs`, the whole attempt
 *   (connect *and* body) ran past `totalTimeoutMs`, or `fetchImpl` itself
 *   threw (refused, reset, DNS failure, TLS failure) — never a status the
 *   upstream itself chose to send;
 * - throws `{ permanent: true }` for a real, non-retryable HTTP status
 *   (`permanentUpstreamError`);
 * - throws plain (a retryable `429`/`5xx`) otherwise, for the caller's own
 *   same-host backoff loop.
 *
 * The two timers are deliberately independent: `connectTimeoutMs` is the
 * one this task exists to shorten (2026-09-20: a host that never answers at
 * all used to be indistinguishable from one about to succeed, for a full
 * `totalTimeoutMs`), while `totalTimeoutMs` still bounds a host that
 * *connects* but stalls mid-response — reading the body is covered by the
 * same controller, not a separate window, so a slow body counts against it
 * too.
 */
async function attemptUpstreamFetch({
  fetchImpl,
  url,
  userAgent,
  connectTimeoutMs,
  totalTimeoutMs,
}) {
  const controller = new AbortController();
  let connectTimedOut = false;
  const connectTimer = setTimeout(
    () => {
      connectTimedOut = true;
      controller.abort();
    },
    Math.max(1, Math.min(connectTimeoutMs, totalTimeoutMs)),
  );
  const totalTimer = setTimeout(() => controller.abort(), totalTimeoutMs);
  const connectionFailure = (error) =>
    Object.assign(error, { connectionFailure: true });
  try {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { "User-Agent": userAgent },
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw connectionFailure(
          new Error(
            `Upstream ${connectTimedOut ? "connect" : "response"} timeout for ${url}`,
          ),
        );
      }
      throw connectionFailure(error);
    }
    if (!response.ok) {
      if (response.status !== 429 && response.status < 500)
        throw permanentUpstreamError(response.status, url);
      throw Object.assign(new Error(`Upstream ${response.status} for ${url}`), {
        retryableStatus: response.status,
      });
    }
    try {
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (controller.signal.aborted)
        throw connectionFailure(
          new Error(`Upstream response timeout for ${url}`),
        );
      throw connectionFailure(error);
    }
  } finally {
    clearTimeout(connectTimer);
    clearTimeout(totalTimer);
  }
}

/**
 * Every attempt against **one** host, applying the existing, unchanged
 * same-host policy: bounded exponential backoff on a retryable `429`/`5xx`
 * (the backoff on 429/5xx stays per host: a deliberate requirement, not an
 * oversight). A connection-level failure is different in kind — nothing answered
 * at all, so retrying the same host with a backoff delay would only pay
 * `connectTimeoutMs` again for no new information — and is therefore never
 * retried here: it is thrown straight through for `fetchFromUpstreamRoots`
 * to fail over on immediately.
 */
async function fetchFromHostWithRetry({
  fetchImpl,
  url,
  userAgent,
  retry,
  sleepImpl,
  connectTimeoutMs,
  totalTimeoutMs,
}) {
  let lastError;
  for (let attempt = 0; attempt < retry.attempts; attempt += 1) {
    try {
      return await attemptUpstreamFetch({
        fetchImpl,
        url,
        userAgent,
        connectTimeoutMs,
        totalTimeoutMs,
      });
    } catch (error) {
      if (error.permanent || error.connectionFailure) throw error;
      lastError = error; // a retryable status: keep trying this same host
    }
    // Exponential backoff, bounded — never a tight loop against an upstream
    // that is already struggling.
    if (attempt < retry.attempts - 1) {
      const delay = Math.min(
        retry.maxDelayMs,
        retry.baseDelayMs * 2 ** attempt,
      );
      await sleepImpl(delay);
    }
  }
  throw Object.assign(
    lastError || new Error(`Upstream request failed for ${url}.`),
    {
      exhausted: true,
    },
  );
}

// ------------------------------------------------------------ host breakers
//
// One breaker per upstream *origin* (`https://host:port`), living for as
// long as the mirror instance that owns it does — the same lifetime as the
// semaphore above and the archive/build maps below, all private state of
// one `createSkyTileMirror()` call (the module docblock's "module scope"
// convention: in a live process there is exactly one such instance, created
// once by the `skyTileMirror()` singleton at the bottom of this file, so
// this state is in practice process-wide without literally sitting on
// `globalThis`, on the same footing as `archiveFailures`/`observedStats`
// just below).
//
// A *connection*-level failure counts against a host; a retryable HTTP
// status does not — a host that answers, even with a `503`, has proven
// itself reachable, and `fetchFromHostWithRetry` above already has its own
// policy for that case. After `failureThreshold` consecutive connection
// failures the host is skipped outright (no network attempt at all) for a
// cooldown that starts at `baseCooldownSeconds` and doubles on every further
// failure once reopened, bounded at `maxCooldownSeconds` — "1 → 15 min" for
// the documented defaults. Any success — even the first attempt after a
// cooldown expires — closes the breaker fully and resets the cooldown back
// to its base.
function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function createHostBreakerRegistry({
  failureThreshold,
  baseCooldownSeconds,
  maxCooldownSeconds,
  now,
}) {
  const hosts = new Map();

  function stateFor(origin) {
    let state = hosts.get(origin);
    if (!state) {
      state = {
        failures: 0,
        openUntil: 0,
        cooldownSeconds: baseCooldownSeconds,
      };
      hosts.set(origin, state);
    }
    return state;
  }

  function isOpen(origin) {
    const state = hosts.get(origin);
    return Boolean(state && state.openUntil > now());
  }

  function retryAfterSeconds(origin) {
    const state = hosts.get(origin);
    if (!state) return 0;
    return Math.max(0, Math.ceil((state.openUntil - now()) / 1000));
  }

  function recordFailure(origin) {
    const state = stateFor(origin);
    state.failures += 1;
    if (state.failures >= failureThreshold) {
      const wasEverOpened = state.openUntil > 0;
      state.openUntil = now() + state.cooldownSeconds * 1000;
      state.failures = 0;
      if (wasEverOpened)
        state.cooldownSeconds = Math.min(
          maxCooldownSeconds,
          state.cooldownSeconds * 2,
        );
    }
  }

  function recordSuccess(origin) {
    const state = hosts.get(origin);
    if (!state) return;
    state.failures = 0;
    state.openUntil = 0;
    state.cooldownSeconds = baseCooldownSeconds;
  }

  return { isOpen, retryAfterSeconds, recordFailure, recordSuccess };
}

// ------------------------------------------------------------------- mirror

const defaultRetry = { attempts: 4, baseDelayMs: 300, maxDelayMs: 4000 };

/**
 * Builds one mirror instance. Every dependency the network or the clock
 * touches is injectable — `fetchImpl`, `sleepImpl`, `now` — so tests run
 * against a local fake upstream server with a fast, deterministic backoff
 * and never contact the CDS (the one exception, documented in the task's
 * own session budget, is a handful of real requests run once by hand).
 */
export function createSkyTileMirror({
  directory = skyTileMirrorDirectory(),
  maxBytes = skyTileMirrorMaxBytes(),
  concurrency = skyTileMirrorConcurrency(),
  userAgent = skyTileUpstreamUserAgent(),
  fetchImpl = fetch,
  now = Date.now,
  sleepImpl = defaultSleep,
  retry = defaultRetry,
  upstreamConnectTimeoutMs = skyTileUpstreamConnectTimeoutMs(),
  upstreamTimeoutMs = skyTileUpstreamTimeoutMs(),
  estimatedUpstreamSecondsPerTile = 0.9,
  minimumObservedTilesForMean = 64,
  evictionTargetRatio = 0.9,
  archiveFailureCooldownSeconds = 30,
  upstreamFailureRetryAfterSeconds = 60,
  hostBreakerFailureThreshold = 3,
  hostBreakerBaseCooldownSeconds = 60,
  hostBreakerMaxCooldownSeconds = 900,
  // What reading one tile already on disk and appending it to an archive
  // costs, for the `Retry-After` of an archive whose tiles are (partly)
  // cached — the case of a build resumed after a restart.
  localSecondsPerTile = 0.01,
  // Measured upstream fetches needed before their pace replaces
  // `estimatedUpstreamSecondsPerTile`.
  minimumUpstreamSamples = 8,
  // How long a new archive request waits for the build to know which of its
  // tiles are already on disk (a `stat` each), so that its first
  // `Retry-After` is not the all-upstream estimate.
  archiveCheckWaitMs = 1000,
  // How long a first write waits for the cache inventory before going on.
  inventoryWaitMs = 250,
  measureDirectoryBytes = cacheDirectoryBytes,
  // How many tiles a background build (`buildArchive`, the preparation of a
  // whole tier) keeps requested ahead of the one it is appending to its
  // archive. Small, so that an archive a phone asks for directly — whose
  // tiles are all requested at once — is never queued behind more than a
  // handful of the background task's, in the semaphore's first-come order.
  backgroundBuildWindow = null,
} = {}) {
  const mirror = {
    directory: resolve(directory),
    maxBytes,
    concurrency,
    userAgent,
    fetchImpl,
    now,
    sleepImpl,
    retry,
    upstreamConnectTimeoutMs,
    upstreamTimeoutMs,
    estimatedUpstreamSecondsPerTile,
    minimumObservedTilesForMean,
    evictionTargetRatio,
    archiveFailureCooldownSeconds,
    upstreamFailureRetryAfterSeconds,
    hostBreakerFailureThreshold,
    hostBreakerBaseCooldownSeconds,
    hostBreakerMaxCooldownSeconds,
    localSecondsPerTile,
    minimumUpstreamSamples,
    archiveCheckWaitMs,
    inventoryWaitMs,
    measureDirectoryBytes,
    backgroundBuildWindow: backgroundBuildWindow ?? concurrency * 2,
  };
  const semaphore = createSemaphore(concurrency);
  const hostBreakers = createHostBreakerRegistry({
    failureThreshold: hostBreakerFailureThreshold,
    baseCooldownSeconds: hostBreakerBaseCooldownSeconds,
    maxCooldownSeconds: hostBreakerMaxCooldownSeconds,
    now,
  });
  const tileBuilds = new Map();
  const archiveBuilds = new Map();
  const archiveFailures = new Map();
  // `observedStats`: surveyId -> { mtimeMs, data: { byOrder } }, the
  // per-order tile-size stats read cache, valid only while the on-disk
  // file's own mtime matches — see `currentObservedStats`.
  const observedStats = new Map();
  const observedStatsWriteQueues = new Map();
  // `archiveIndex`: surveyId -> { mtimeMs, data: { [archiveIndexKey]: size } }
  // — the small on-disk index (`archive-index/<surveyId>.json`) `tierState`
  // reads instead of re-`stat`-ing every archive a tier is made of once it
  // is fully built; see `currentArchiveIndex`.
  const archiveIndex = new Map();
  const archiveIndexWriteQueues = new Map();
  const etagCache = new Map();
  // The cache's total size, for the byte budget: `null` until the inventory
  // below has measured it once in this process, with every byte added or
  // removed meanwhile kept in `pendingBytes`.
  let totalBytes = null;
  let pendingBytes = 0;
  let inventory = null;
  let inventoryStartedAt = 0;
  let eviction = null;
  // What the byte budget's eviction must leave alone: the archives a
  // background preparation is making a tier of (`protectArchives`), and the
  // tiles an archive under construction still has to read back into its tar.
  const protectedArchives = new Map(); // token -> Set of absolute paths
  const buildingTiles = new Map(); // archive key -> Set of absolute paths
  const reconciliations = new Map(); // `${surveyId}:${maxOrder}` -> Promise
  // The upstream's own pace, measured (seconds per tile, one request slot):
  // what an archive's `Retry-After` is computed from once enough tiles have
  // been fetched in this process, instead of the fixed estimate.
  let upstreamSecondsPerTile = null;
  let upstreamSamples = 0;

  /**
   * Walks the cache directories once per process, in the background. On
   * a network share this is one network round trip per file —
   * tens of seconds once a backdrop tier is mirrored (measured locally: the
   * first tile after a restart waited 473 ms for 40 000 tiles on an SSD) —
   * and every tile fetched after a restart used to wait for it, which held
   * each archive build back by that much beyond its announced `Retry-After`.
   * The budget is enforced as soon as the total is known.
   */
  function startInventory() {
    if (!inventory) {
      inventoryStartedAt = Date.now();
      inventory = (async () => {
        let measured = 0;
        try {
          measured = await mirror.measureDirectoryBytes(mirror.directory);
        } catch {
          // Unreadable: counted from what this process adds from now on.
        }
        totalBytes = measured + pendingBytes;
        pendingBytes = 0;
        await evictIfNeeded().catch(() => {});
      })();
    }
    return inventory;
  }

  async function recordBytesAdded(delta) {
    if (totalBytes !== null) {
      totalBytes += delta;
      return;
    }
    pendingBytes += delta;
    // A short wait, bounded from the inventory's own start: a local disk
    // answers well within it, so the budget is checked right away there; a
    // slow share never holds a build, nor each of its tiles in turn.
    const known = startInventory();
    const left = mirror.inventoryWaitMs - (Date.now() - inventoryStartedAt);
    if (left > 0) await Promise.race([known, realDelay(left)]);
  }

  /** One eviction pass at a time; concurrent callers share it. */
  function evictIfNeeded() {
    if (!eviction)
      eviction = evictOverBudget().finally(() => {
        eviction = null;
      });
    return eviction;
  }

  async function evictOverBudget() {
    const total = totalBytes;
    if (total === null || total <= mirror.maxBytes) return;
    const collected = [];
    await collectCacheFiles(join(mirror.directory, "tiles"), collected);
    await collectCacheFiles(join(mirror.directory, "archives"), collected);
    // A protected file is never a candidate: if only those are left, the
    // cache stays over its budget rather than losing what a task is making.
    const kept = protectedPaths();
    const files = collected.filter((file) => !kept.has(file.path));
    files.sort((a, b) => a.mtimeMs - b.mtimeMs);
    const target = mirror.maxBytes * mirror.evictionTargetRatio;
    let remaining = total;
    for (const file of files) {
      if (remaining <= target) break;
      try {
        await rm(file.path, { force: true });
        remaining -= file.size;
        etagCache.delete(file.path);
        // An evicted ARCHIVE must also drop out of the archive index —
        // otherwise `tierState`'s fast path would keep reporting a tier
        // `ready`, at a now-nonexistent size, forever (the index is only
        // ever invalidated by a change to the index FILE itself, and
        // eviction does not touch that file on its own).
        const evictedArchive = archiveIndexEntryForEvictedPath(file.path);
        if (evictedArchive)
          await removeArchiveIndexEntry(
            evictedArchive.surveyId,
            evictedArchive.key,
          );
      } catch {
        // Already gone (a concurrent eviction, or a race with a rebuild):
        // its bytes are not in `remaining` twice either way.
      }
    }
    // Bytes added while this pass ran are kept.
    totalBytes -= total - remaining;
  }

  function protectedPaths() {
    const paths = new Set();
    for (const group of protectedArchives.values())
      for (const path of group) paths.add(path);
    for (const group of buildingTiles.values())
      for (const path of group) paths.add(path);
    return paths;
  }

  function tileRelativePath(survey, order, pix, extension) {
    return join(
      "tiles",
      survey.id,
      `Norder${order}`,
      `Dir${healpixTileDir(pix)}`,
      `Npix${pix}.${extension}`,
    );
  }

  function archiveRelativePath(survey, order, chunkOrder, chunkPix) {
    return join(
      "archives",
      survey.id,
      `Norder${order}`,
      `Chunk${chunkOrder}`,
      `${chunkPix}.tar`,
    );
  }

  /** The archive index's own key for one archive address — always
   * forward-slash-joined (never `path.join`, which is platform-dependent),
   * so the on-disk index (`archive-index/<surveyId>.json`) is stable across
   * platforms and matches the tail of `archiveRelativePath` above exactly. */
  function archiveIndexKey(order, chunkOrder, chunkPix) {
    return archiveAddressPath({ order, chunkOrder, chunkPix });
  }

  /**
   * The one place `ensureTileOnDisk` and `ensureProperties` reach the
   * network: tries `survey.upstreamRoots` (falling back to the single
   * `survey.upstreamRoot` for a survey — or a test fixture — that does not
   * declare the array) in order, skipping any host whose breaker is
   * currently open, and returns the first root's bytes. `buildUrl` turns a
   * root into the actual request URL, since a tile's and `properties`'s
   * relative paths differ but the fallback policy is identical for both.
   *
   * A permanent (non-429/5xx) HTTP error stops the search immediately —
   * every mirror serves the same bytes at the same path, so there is
   * nothing another root could answer differently. Anything else (a
   * connection-level failure, or a host's own retries exhausted on a
   * durable `429`/`5xx`) moves on to the next root; once every root has
   * been tried, the last error is thrown for the caller to turn into
   * `sky_tiles_upstream_unavailable`.
   */
  /** One more measured upstream tile fetch, in seconds of one request slot
   * (the semaphore's wait excluded): a moving average that follows the
   * upstream as it speeds up or slows down. */
  function recordUpstreamPace(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    upstreamSecondsPerTile =
      upstreamSecondsPerTile === null
        ? seconds
        : upstreamSecondsPerTile * 0.8 + seconds * 0.2;
    upstreamSamples += 1;
  }

  function currentUpstreamSecondsPerTile() {
    return upstreamSamples >= mirror.minimumUpstreamSamples
      ? upstreamSecondsPerTile
      : mirror.estimatedUpstreamSecondsPerTile;
  }

  async function fetchFromUpstreamRoots({
    survey,
    buildUrl,
    measurePace = false,
  }) {
    const roots =
      Array.isArray(survey.upstreamRoots) && survey.upstreamRoots.length
        ? survey.upstreamRoots
        : [survey.upstreamRoot];
    let lastError;
    for (const root of roots) {
      const origin = originOf(root);
      if (hostBreakers.isOpen(origin)) {
        lastError = Object.assign(
          new Error(
            `Upstream ${origin} is in cooldown after repeated connection failures.`,
          ),
          {
            connectionFailure: true,
            retryAfterSeconds: hostBreakers.retryAfterSeconds(origin),
          },
        );
        continue;
      }
      const url = buildUrl(root);
      try {
        // eslint-disable-next-line no-await-in-loop
        const bytes = await semaphore(async () => {
          const started = mirror.now();
          const fetched = await fetchFromHostWithRetry({
            fetchImpl: mirror.fetchImpl,
            url,
            userAgent: mirror.userAgent,
            retry: mirror.retry,
            sleepImpl: mirror.sleepImpl,
            connectTimeoutMs: mirror.upstreamConnectTimeoutMs,
            totalTimeoutMs: mirror.upstreamTimeoutMs,
          });
          if (measurePace) recordUpstreamPace((mirror.now() - started) / 1000);
          return fetched;
        });
        hostBreakers.recordSuccess(origin);
        return bytes;
      } catch (error) {
        if (error.connectionFailure) hostBreakers.recordFailure(origin);
        lastError = error;
        if (error.permanent) throw error;
      }
    }
    throw lastError || new Error("No upstream root configured.");
  }

  function observedStatsPath(surveyId) {
    return join(mirror.directory, "stats", `${surveyId}.json`);
  }

  /**
   * Parses `stats/<surveyId>.json`'s contents into `{ byOrder }`, tolerating
   * both a corrupt/unreadable file (empty JSON, a half-written `.part`
   * blown away by a crash — treated as "no observations yet") and the
   * OLD, pre-per-order shape (`{ count, totalBytes }`, no `byOrder` at
   * all): that older file is read without error, but its aggregate — with
   * no order breakdown recoverable from it — cannot be attributed to any
   * one order, so it is simply ignored; every order's observed mean starts
   * fresh, exactly as it would for a portal with no stats file at all. Any
   * per-order entry that is not a well-formed `{count, totalBytes}` pair is
   * similarly dropped rather than trusted.
   */
  function parseObservedStatsFile(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { byOrder: {} };
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.byOrder ||
      typeof parsed.byOrder !== "object"
    )
      return { byOrder: {} }; // absent, or the old { count, totalBytes } shape
    const byOrder = {};
    for (const [order, entry] of Object.entries(parsed.byOrder)) {
      if (
        entry &&
        Number.isFinite(entry.count) &&
        entry.count >= 0 &&
        Number.isFinite(entry.totalBytes) &&
        entry.totalBytes >= 0
      )
        byOrder[order] = { count: entry.count, totalBytes: entry.totalBytes };
    }
    return { byOrder };
  }

  async function readObservedStatsFromDisk(path) {
    try {
      return parseObservedStatsFile(await readFile(path, "utf8"));
    } catch {
      return { byOrder: {} }; // no file yet
    }
  }

  async function writeObservedStatsToDisk(path, data) {
    await mkdir(dirname(path), { recursive: true });
    const partPath = `${path}.part`;
    await writeFile(partPath, JSON.stringify({ v: 2, byOrder: data.byOrder }));
    await rename(partPath, path);
  }

  /**
   * The in-memory read cache: valid only as long as the file's own `mtime`
   * has not moved since it was populated. A SEPARATE process (the
   * `prepare:sky-tile-pack` CLI filling the cache while a live server also
   * serves requests, the exact scenario that motivated this) writes this
   * same file independently — this mirror instance has no other way to
   * learn about that than noticing the file changed underneath it.
   */
  async function currentObservedStats(surveyId) {
    const path = observedStatsPath(surveyId);
    const info = await statOrNull(path);
    const mtimeMs = info ? info.mtimeMs : null;
    const cached = observedStats.get(surveyId);
    if (cached && cached.mtimeMs === mtimeMs) return cached.data;
    const data = await readObservedStatsFromDisk(path);
    observedStats.set(surveyId, { mtimeMs, data });
    return data;
  }

  /**
   * Records one more observed tile at `order`, sized `bytes`. Tiles finish
   * fetching concurrently (up to `concurrency` at once), so writes for the
   * same survey are serialized through one promise chain — but, unlike the
   * single global counter this replaces, EVERY write in that chain re-reads
   * the file fresh right before merging its own delta in, rather than
   * persisting whatever this process's own in-memory total happens to be.
   * That distinction is exactly what the incident this fixes came down to:
   * the prep script counted 1,016 tiles, then a live server process (a
   * SEPARATE `recordObservedTile` lineage, with no memory of the script's
   * 1,016) clobbered the file with only the 115 it had itself observed. A
   * fresh read-modify-write per delta, atomic on write, means two processes
   * updating the same survey (even the same order) merge rather than race
   * each other's counts away.
   */
  async function recordObservedTile(surveyId, order, bytes) {
    const path = observedStatsPath(surveyId);
    const orderKey = String(order);
    const queue = observedStatsWriteQueues.get(surveyId) || Promise.resolve();
    const next = queue
      .then(async () => {
        const current = await readObservedStatsFromDisk(path);
        const existing = current.byOrder[orderKey] || {
          count: 0,
          totalBytes: 0,
        };
        current.byOrder[orderKey] = {
          count: existing.count + 1,
          totalBytes: existing.totalBytes + bytes,
        };
        await writeObservedStatsToDisk(path, current);
        const info = await statOrNull(path);
        observedStats.set(surveyId, {
          mtimeMs: info ? info.mtimeMs : null,
          data: current,
        });
      })
      .catch(() => {});
    observedStatsWriteQueues.set(surveyId, next);
    await next;
  }

  // --------------------------------------------------------- archive index
  //
  // `tierState` (below) needs to know, for a tier that is fully built,
  // whether EVERY archive it needs exists — and, once it does, their exact
  // combined size. Doing that with a `stat` per archive is fine for a
  // small, still-`on-demand` tier (the loop below exits at the first
  // missing one), but a `ready` tier pays every single one of those
  // `stat`s, on every manifest request, for as long as it stays ready — up
  // to 253 of them for `quality` today, more for any deeper tier later.
  // This small, shared JSON index (one entry per archive, `{ key: size }`)
  // is what lets a `ready` tier answer from ONE file read instead: it is
  // read fresh, merged and written atomically on the exact same model as
  // `recordObservedTile` above, so a live server and the `prepare:sky-tile-pack`
  // CLI sharing one mirror directory each contribute their own newly-built
  // archives to it rather than clobbering the other's. `tierState` still
  // falls back to a real `stat` sweep — and opportunistically repairs this
  // index from it — whenever the index does not (yet, or never did) cover
  // every archive a tier needs, so a directory of archives built before
  // this index existed is still read correctly, just once more slowly.

  function archiveIndexPath(surveyId) {
    return join(mirror.directory, "archive-index", `${surveyId}.json`);
  }

  /** Tolerates a missing/corrupt file (no index yet) and an unrecognized
   * shape (ignored, exactly like `parseObservedStatsFile` above) the same
   * way: an empty index self-heals the next time `tierState` falls back to
   * a real `stat` sweep. */
  function parseArchiveIndexFile(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.archives !== "object" ||
      !parsed.archives
    )
      return {};
    const archives = {};
    for (const [key, size] of Object.entries(parsed.archives)) {
      if (Number.isFinite(size) && size >= 0) archives[key] = size;
    }
    return archives;
  }

  async function readArchiveIndexFromDisk(path) {
    try {
      return parseArchiveIndexFile(await readFile(path, "utf8"));
    } catch {
      return {};
    }
  }

  async function writeArchiveIndexToDisk(path, archives) {
    await mkdir(dirname(path), { recursive: true });
    const partPath = `${path}.part`;
    await writeFile(partPath, JSON.stringify({ v: 1, archives }));
    await rename(partPath, path);
  }

  /** Cached against the index file's own `mtime`, exactly like
   * `currentObservedStats` — a cross-process write (another archive
   * finished building, in this process or another one sharing the same
   * directory) is only ever detected by the file itself having changed. */
  async function currentArchiveIndex(surveyId) {
    const path = archiveIndexPath(surveyId);
    const info = await statOrNull(path);
    const mtimeMs = info ? info.mtimeMs : null;
    const cached = archiveIndex.get(surveyId);
    if (cached && cached.mtimeMs === mtimeMs) return cached.data;
    const data = await readArchiveIndexFromDisk(path);
    archiveIndex.set(surveyId, { mtimeMs, data });
    return data;
  }

  /** Merges one `{ key: size }` entry into the shared index, read fresh
   * immediately beforehand so a concurrent writer's own entries (this
   * process's other archives, or another process's) are never lost —
   * the same read-modify-write-atomically discipline as
   * `recordObservedTile`, serialized per survey for the same reason. */
  async function recordArchiveIndexEntry(surveyId, key, size) {
    const path = archiveIndexPath(surveyId);
    const queue = archiveIndexWriteQueues.get(surveyId) || Promise.resolve();
    const next = queue
      .then(async () => {
        const current = await readArchiveIndexFromDisk(path);
        current[key] = size;
        await writeArchiveIndexToDisk(path, current);
        const info = await statOrNull(path);
        archiveIndex.set(surveyId, {
          mtimeMs: info ? info.mtimeMs : null,
          data: current,
        });
      })
      .catch(() => {});
    archiveIndexWriteQueues.set(surveyId, next);
    await next;
  }

  /** The inverse of `recordArchiveIndexEntry`, for an archive `evictIfNeeded`
   * has just removed from disk — without this, a stale index entry would
   * keep reporting a tier `ready` at a size that no longer exists on disk. */
  async function removeArchiveIndexEntry(surveyId, key) {
    const path = archiveIndexPath(surveyId);
    const queue = archiveIndexWriteQueues.get(surveyId) || Promise.resolve();
    const next = queue
      .then(async () => {
        const current = await readArchiveIndexFromDisk(path);
        if (!Object.prototype.hasOwnProperty.call(current, key)) return;
        delete current[key];
        await writeArchiveIndexToDisk(path, current);
        const info = await statOrNull(path);
        archiveIndex.set(surveyId, {
          mtimeMs: info ? info.mtimeMs : null,
          data: current,
        });
      })
      .catch(() => {});
    archiveIndexWriteQueues.set(surveyId, next);
    await next;
  }

  /** Given an absolute path `evictIfNeeded` just removed, the
   * `{ surveyId, key }` to drop from the archive index — `null` for
   * anything not under `<mirror dir>/archives/<surveyId>/...` (a tile or a
   * `properties` file, which have no index of their own). */
  function archiveIndexEntryForEvictedPath(path) {
    const archivesRoot = join(mirror.directory, "archives");
    const rel = relative(archivesRoot, path);
    if (rel.startsWith("..") || rel === path) return null;
    const segments = rel.split(sep);
    if (segments.length < 2) return null;
    const [surveyId, ...rest] = segments;
    return { surveyId, key: rest.join("/") };
  }

  /** The one code path that ever asks the upstream survey for a tile,
   * shared by direct tile requests and archive building alike — so "an
   * archive is built from tiles already cached" is not a
   * separate rule, just this function's cache check winning before its
   * fetch. [observer], when given (an archive build), learns whether the
   * tile was found on disk or has to come from the upstream, and when it
   * has — what that archive's `Retry-After` is computed from. */
  async function ensureTileOnDisk(
    survey,
    order,
    pix,
    extension,
    observer = null,
  ) {
    const relPath = tileRelativePath(survey, order, pix, extension);
    const finalPath = join(mirror.directory, relPath);
    const existing = await statOrNull(finalPath);
    if (existing) {
      observer?.present();
      await touchFile(finalPath);
      return { path: finalPath, size: existing.size, fresh: false };
    }
    observer?.missing();
    let promise = tileBuilds.get(relPath);
    if (!promise) {
      const relativeTilePath = `Norder${order}/Dir${healpixTileDir(pix)}/Npix${pix}.${extension}`;
      const build = (async () => {
        await cleanupOrphanPart(finalPath);
        const bytes = await fetchFromUpstreamRoots({
          survey,
          buildUrl: (root) => new URL(relativeTilePath, root).toString(),
          measurePace: true,
        });
        await writeAtomically(finalPath, bytes);
        await recordBytesAdded(bytes.length);
        await recordObservedTile(survey.id, order, bytes.length);
        await evictIfNeeded();
        return { path: finalPath, size: bytes.length, fresh: true };
      })();
      promise = build.finally(() => {
        if (tileBuilds.get(relPath) === promise) tileBuilds.delete(relPath);
      });
      tileBuilds.set(relPath, promise);
    }
    const result = await promise;
    observer?.fetched();
    return result;
  }

  /** `GET /v1/sky-tiles/{survey}/Norder{n}/Dir{d}/Npix{p}.{ext}`. */
  async function ensureTile({ survey, order, pix, extension }) {
    try {
      const result = await ensureTileOnDisk(survey, order, pix, extension);
      return { status: "ready", ...result };
    } catch (error) {
      return {
        status: "unavailable",
        code: "sky_tiles_upstream_unavailable",
        retryAfterSeconds: mirror.upstreamFailureRetryAfterSeconds,
        message: error.message,
      };
    }
  }

  function archiveKey(survey, order, chunkOrder, chunkPix) {
    return `${survey.id}/${order}/${chunkOrder}/${chunkPix}`;
  }

  function startArchiveBuild({
    survey,
    order,
    chunkOrder,
    chunkPix,
    addresses,
    finalPath,
    key,
    window = null,
  }) {
    // `unchecked`: tiles whose presence on disk is not known yet;
    // `upstreamRemaining`: tiles known to be missing and not fetched yet;
    // `fetched`: tiles this build found missing and has since had (from the
    // upstream, or from a concurrent request for the same tile);
    // `window`: for a background build, how many tiles are requested ahead
    // of the one being appended (`null`: all of them at once).
    const state = {
      total: addresses.length,
      done: 0,
      unchecked: addresses.length,
      upstreamRemaining: 0,
      fetched: 0,
      window: window > 0 ? window : null,
      startedAt: mirror.now(),
    };
    buildingTiles.set(
      key,
      new Set(
        addresses.map((address) =>
          join(
            mirror.directory,
            tileRelativePath(survey, address.order, address.pix, survey.format),
          ),
        ),
      ),
    );
    let resolveChecked;
    state.checked = new Promise((resolvePromise) => {
      resolveChecked = resolvePromise;
    });
    const checkedOne = () => {
      state.unchecked -= 1;
      if (state.unchecked <= 0) resolveChecked();
    };
    const observer = {
      present: checkedOne,
      missing: () => {
        state.upstreamRemaining += 1;
        checkedOne();
      },
      fetched: () => {
        state.upstreamRemaining -= 1;
        state.fetched += 1;
      },
    };
    if (!addresses.length) resolveChecked();
    state.promise = (async () => {
      try {
        await cleanupOrphanPart(finalPath);
        await mkdir(dirname(finalPath), { recursive: true });
        const partPath = `${finalPath}.part`;
        const writable = createWriteStream(partPath);
        const writableFailure = new Promise((_resolvePromise, reject) => {
          writable.once("error", reject);
        });
        // Every tile's fetch is started up front (a background build:
        // `window` tiles ahead of the one being appended) so the shared
        // semaphore — not this loop — decides how many run at once; entries
        // are still written to the tar strictly in canonical order as each
        // resolves.
        const ahead = state.window
          ? Math.min(state.window, addresses.length)
          : addresses.length;
        const pending = new Array(addresses.length);
        const request = (position) => {
          if (position >= addresses.length || pending[position]) return;
          const address = addresses[position];
          pending[position] = ensureTileOnDisk(
            survey,
            address.order,
            address.pix,
            survey.format,
            observer,
          );
          // The loop below stops at the first failed tile; the others' own
          // failures must not surface as unhandled rejections meanwhile.
          pending[position].catch(() => {});
        };
        for (let position = 0; position < ahead; position += 1)
          request(position);
        for (let index = 0; index < addresses.length; index += 1) {
          const address = addresses[index];
          const tile = await Promise.race([pending[index], writableFailure]);
          request(index + ahead);
          const name = `Norder${address.order}/Dir${healpixTileDir(address.pix)}/Npix${address.pix}.${survey.format}`;
          await writeUstarEntry(
            writable,
            { name, size: tile.size },
            createReadStream(tile.path),
          );
          state.done += 1;
        }
        await new Promise((resolvePromise, reject) => {
          writable.write(ustarEndMarker(), (error) =>
            error ? reject(error) : resolvePromise(),
          );
        });
        await new Promise((resolvePromise, reject) => {
          writable.end((error) => (error ? reject(error) : resolvePromise()));
        });
        await rename(partPath, finalPath);
        const info = await stat(finalPath);
        await recordBytesAdded(info.size);
        await recordArchiveIndexEntry(
          survey.id,
          archiveIndexKey(order, chunkOrder, chunkPix),
          info.size,
        );
        await evictIfNeeded();
        return { path: finalPath, size: info.size };
      } catch (error) {
        archiveFailures.set(key, {
          retryAt: mirror.now() + mirror.archiveFailureCooldownSeconds * 1000,
          retryAfterSeconds: mirror.archiveFailureCooldownSeconds,
        });
        throw error;
      } finally {
        archiveBuilds.delete(key);
        buildingTiles.delete(key);
      }
    })();
    // Nothing ever awaits `state.promise` itself — `ensureArchive` below
    // only reads `state.total`/`state.done` while it runs, and a later
    // caller re-checks the finished file on disk instead. The failure path
    // above already does everything a caller needs (records the cooldown in
    // `archiveFailures`), so this rejection would otherwise be reported as
    // an unhandled one for no reason.
    state.promise.catch(() => {});
    return state;
  }

  /**
   * The seconds after which [build] should be done, for its `Retry-After`:
   * its tiles still to fetch — those known to be missing, and those not
   * checked yet — queued behind the tiles of every build started before it
   * (they share the upstream's `concurrency` slots), at the upstream's
   * measured pace; plus appending the rest to the archive. `main` counted
   * every tile not yet written as an upstream fetch at a fixed 0.9 s: 58 s
   * for an archive whose tiles were all on disk already (a build resumed
   * after a restart), which takes a few seconds.
   */
  function archiveRetryAfterSeconds(build) {
    let upstreamAhead = 0;
    for (const other of archiveBuilds.values()) {
      const outstanding = other.upstreamRemaining + other.unchecked;
      // A background build only ever has its window's worth of tiles in the
      // queue ahead of another build's; its own remaining time is its all.
      upstreamAhead +=
        other === build || !other.window
          ? outstanding
          : Math.min(outstanding, other.window);
      if (other === build) break;
    }
    const seconds =
      (upstreamAhead * currentUpstreamSecondsPerTile()) / mirror.concurrency +
      Math.max(0, build.total - build.done) * mirror.localSecondsPerTile;
    return Math.max(1, Math.ceil(seconds));
  }

  /** `GET /v1/sky-tiles/{survey}/Norder{n}/Chunk{c}/{pix}.tar`. The first
   * caller for a given archive starts the build in the background and
   * answers `building` as soon as the build knows which of its tiles are
   * already on disk (bounded by `archiveCheckWaitMs`), so that its
   * `Retry-After` is informed; every caller while it runs gets the same
   * live progress; nothing here ever blocks a request on the full build
   * (never a tight loop, on the client side too — a client is expected to poll `Retry-After` later, not spin).
   */
  async function ensureArchive(request, { checked = false } = {}) {
    const { survey, order, chunkOrder, chunkPix, addresses } = request;
    const relPath = archiveRelativePath(survey, order, chunkOrder, chunkPix);
    const finalPath = join(mirror.directory, relPath);
    const existing = await statOrNull(finalPath);
    if (existing) {
      await touchFile(finalPath);
      return { status: "ready", path: finalPath, size: existing.size };
    }

    const key = archiveKey(survey, order, chunkOrder, chunkPix);
    const failure = archiveFailures.get(key);
    const now = mirror.now();
    if (failure && failure.retryAt > now) {
      return {
        status: "unavailable",
        code: "sky_tiles_upstream_unavailable",
        retryAfterSeconds: Math.ceil((failure.retryAt - now) / 1000),
      };
    }
    if (failure) archiveFailures.delete(key);

    let build = archiveBuilds.get(key);
    if (!build) {
      build = startArchiveBuild({
        survey,
        order,
        chunkOrder,
        chunkPix,
        addresses,
        finalPath,
        key,
      });
      archiveBuilds.set(key, build);
      if (!checked) {
        await Promise.race([
          build.checked,
          build.promise.then(
            () => {},
            () => {},
          ),
          realDelay(mirror.archiveCheckWaitMs),
        ]);
        // Finished meanwhile (every tile was on disk), failed, or still
        // building: asked again, the answer is whichever it is now.
        return ensureArchive(request, { checked: true });
      }
    }
    return {
      status: "building",
      code: "sky_tiles_archive_building",
      done: build.done,
      total: build.total,
      upstreamRemaining: build.upstreamRemaining + build.unchecked,
      retryAfterSeconds: archiveRetryAfterSeconds(build),
    };
  }

  /**
   * Starts — or joins — the build of one archive, for a caller that does not
   * answer a request with it: the background preparation of a tier
   * (`prepare.js`). `{ status: "ready", path, size }` when the archive is on
   * disk, otherwise `{ status: "building", build }`: `build.promise` settles
   * with the build, `build.done`/`total`/`fetched` are live.
   *
   * Unlike `ensureArchive`, this ignores the cooldown a failed build leaves
   * for direct requests (a phone asking again at once must not restart it):
   * the caller has its own, longer, waiting between attempts. And the build
   * requests only `backgroundBuildWindow` tiles ahead of the one it is
   * appending — all of them are otherwise requested at once — so that an
   * archive a phone asks for directly is never queued behind the whole of
   * this one: that is the priority direct requests keep over the background.
   * The upstream's connection limit and the host breakers apply exactly as
   * for every other fetch (`ensureTileOnDisk`).
   */
  async function buildArchive(request) {
    const { survey, order, chunkOrder, chunkPix, addresses } = request;
    const relPath = archiveRelativePath(survey, order, chunkOrder, chunkPix);
    const finalPath = join(mirror.directory, relPath);
    const existing = await statOrNull(finalPath);
    if (existing) {
      await touchFile(finalPath);
      // On disk without an index entry (built before the index, or copied
      // in): entered now, so that what is `ready` here is counted as ready.
      const indexKey = archiveIndexKey(order, chunkOrder, chunkPix);
      const indexed = await currentArchiveIndex(survey.id);
      if (indexed[indexKey] !== existing.size)
        await recordArchiveIndexEntry(survey.id, indexKey, existing.size);
      return { status: "ready", path: finalPath, size: existing.size };
    }
    const key = archiveKey(survey, order, chunkOrder, chunkPix);
    let build = archiveBuilds.get(key);
    if (!build) {
      build = startArchiveBuild({
        survey,
        order,
        chunkOrder,
        chunkPix,
        addresses,
        finalPath,
        key,
        window: mirror.backgroundBuildWindow,
      });
      archiveBuilds.set(key, build);
    }
    return { status: "building", build };
  }

  /**
   * How many of a tier's archives exist, and which do not — read from the
   * archive index alone (one small file, cached against its own mtime), never
   * by walking the disk, so the manifest can state it on every request. The
   * index is kept by every build (`recordArchiveIndexEntry`) and by every
   * eviction; archives that sit on disk without an entry (built before the
   * index existed, or copied in) are looked for once per process and tier, in
   * the background (`reconcileArchiveIndex`), and counted from then on.
   * `missing` is in the order a client downloads them.
   */
  async function tierArchiveProgress({ survey, maxOrder, archiveChunkDelta }) {
    const addresses = tierArchiveAddresses(maxOrder, archiveChunkDelta);
    const index = await currentArchiveIndex(survey.id);
    const missing = [];
    let bytes = 0;
    for (const address of addresses) {
      const size =
        index[
          archiveIndexKey(address.order, address.chunkOrder, address.chunkPix)
        ];
      if (typeof size === "number") bytes += size;
      else missing.push(address);
    }
    if (missing.length)
      reconcileArchiveIndex(survey, maxOrder, addresses, index);
    return {
      ready: addresses.length - missing.length,
      total: addresses.length,
      bytes,
      missing,
    };
  }

  function reconcileArchiveIndex(survey, maxOrder, addresses, index) {
    const key = `${survey.id}:${maxOrder}`;
    let reconciled = reconciliations.get(key);
    if (!reconciled) {
      reconciled = (async () => {
        for (const address of addresses) {
          const entry = archiveIndexKey(
            address.order,
            address.chunkOrder,
            address.chunkPix,
          );
          if (typeof index[entry] === "number") continue;
          // eslint-disable-next-line no-await-in-loop
          const info = await statOrNull(
            join(
              mirror.directory,
              archiveRelativePath(
                survey,
                address.order,
                address.chunkOrder,
                address.chunkPix,
              ),
            ),
          );
          // eslint-disable-next-line no-await-in-loop
          if (info) await recordArchiveIndexEntry(survey.id, entry, info.size);
        }
      })().catch(() => {});
      reconciliations.set(key, reconciled);
    }
    return reconciled;
  }

  /** Resolves once every look for unindexed archives started so far is over
   * (a test seam, like `resetSkyTileMirror`). */
  function archiveIndexReconciled() {
    return Promise.all([...reconciliations.values()]);
  }

  /**
   * Keeps `addresses` — archives of `survey` — out of the byte budget's
   * eviction until the returned function is called: a tier being prepared
   * must not lose the archives it has already built to the eviction its own
   * next tiles cause. The budget can then be exceeded, never the tier
   * shortened; `prepare.js` refuses a tier that could not fit to begin with.
   */
  function protectArchives({ survey, addresses }) {
    const token = Symbol("protected-archives");
    protectedArchives.set(
      token,
      new Set(
        addresses.map((address) =>
          join(
            mirror.directory,
            archiveRelativePath(
              survey,
              address.order,
              address.chunkOrder,
              address.chunkPix,
            ),
          ),
        ),
      ),
    );
    return () => {
      protectedArchives.delete(token);
    };
  }

  /** The upstream's pace, in seconds per tile of ONE request slot (divide by
   * the concurrency for the mirror's): measured once enough tiles were
   * fetched in this process, the documented estimate until then. */
  function upstreamPace() {
    return {
      secondsPerTile: currentUpstreamSecondsPerTile(),
      measured: upstreamSamples >= mirror.minimumUpstreamSamples,
    };
  }

  const propertiesStaleMs = 30 * 24 * 60 * 60 * 1000;

  /** `GET /v1/sky-tiles/{survey}/properties` — the one file this mirror
   * revalidates rather than treating as immutable: a
   * survey's `properties` document can legitimately change, unlike a tile.
   * A stale upstream is served its last good copy rather than failing the
   * request outright. */
  async function ensureProperties({ survey }) {
    const relPath = join("properties", survey.id, "properties");
    const finalPath = join(mirror.directory, relPath);
    const info = await statOrNull(finalPath);
    if (info && mirror.now() - info.mtimeMs < propertiesStaleMs) {
      return { status: "ready", path: finalPath, size: info.size };
    }
    const key = `properties:${survey.id}`;
    let promise = tileBuilds.get(key);
    if (!promise) {
      promise = (async () => {
        const bytes = await fetchFromUpstreamRoots({
          survey,
          buildUrl: (root) => new URL("properties", root).toString(),
        });
        await writeAtomically(finalPath, bytes);
        await recordBytesAdded(info ? bytes.length - info.size : bytes.length);
        return { path: finalPath, size: bytes.length };
      })();
      tileBuilds.set(key, promise);
    }
    try {
      const result = await promise;
      return { status: "ready", ...result };
    } catch (error) {
      if (info)
        return {
          status: "ready",
          path: finalPath,
          size: info.size,
          stale: true,
        };
      return {
        status: "unavailable",
        code: "sky_tiles_upstream_unavailable",
        retryAfterSeconds: mirror.upstreamFailureRetryAfterSeconds,
        message: error.message,
      };
    } finally {
      tileBuilds.delete(key);
    }
  }

  /** The sha-256 `ETag` of a file already on disk, cached in memory against
   * its `(mtime, size)` so a hot tile is not re-hashed on every request; the
   * cache is invalidated automatically whenever either changes (an eviction
   * followed by a rebuild always produces a new file, and therefore a new
   * `mtime`). */
  async function fileEtag(path) {
    const info = await stat(path);
    const cached = etagCache.get(path);
    if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size)
      return cached.etag;
    const digest = await fileSha256(path);
    const etag = `"sha256-${digest}"`;
    etagCache.set(path, { mtimeMs: info.mtimeMs, size: info.size, etag });
    while (etagCache.size > 4096)
      etagCache.delete(etagCache.keys().next().value);
    return etag;
  }

  /**
   * Whether every archive `maxOrder` needs is already on disk and, once it is, the EXACT
   * combined size of those real archive files — never an estimate once a
   * tier is actually built. Two paths:
   *
   * - **Fast path**: every address is already in the archive index
   *   (`currentArchiveIndex`) — answers from that one small file, no `stat`
   *   of the archives themselves at all. This is the steady state once a
   *   tier has finished building, so a manifest request never re-`stat`s
   *   the (up to 253, today) archive files that make it up just to answer
   *   the same "still ready" question it already answered a moment ago.
   * - **Fallback**: the index does not (yet, or never did) cover every
   *   address — either the tier genuinely is not ready, or its archives
   *   predate this index (an older mirror version, archives copied in
   *   directly). Falls back to `tierArchiveAddresses` low-order-first, the
   *   same short-circuit-on-first-missing sweep this function always used,
   *   so the common "nothing built yet" case still answers after exactly
   *   one `stat`; it `stat`s only the archives the index does not list (the
   *   ones it lists are taken from it, as above). A tier found fully built
   *   this way self-heals the index from what it just found, so the NEXT
   *   call takes the fast path.
   *
   * `archiveChunkDelta` is explicit for the same reason
   * `parseSkyTileRequestPath` takes it explicitly: it is one mirror-wide
   * constant, never a field a survey object can be expected to carry.
   */
  async function tierState({ survey, maxOrder, archiveChunkDelta }) {
    const addresses = tierArchiveAddresses(maxOrder, archiveChunkDelta);
    const index = await currentArchiveIndex(survey.id);
    let indexedTotal = 0;
    let allIndexed = true;
    for (const address of addresses) {
      const key = archiveIndexKey(
        address.order,
        address.chunkOrder,
        address.chunkPix,
      );
      const size = index[key];
      if (typeof size !== "number") {
        allIndexed = false;
        break;
      }
      indexedTotal += size;
    }
    if (allIndexed) return { state: "ready", exactBytes: indexedTotal };

    let realTotal = 0;
    const repairs = [];
    for (const address of addresses) {
      const key = archiveIndexKey(
        address.order,
        address.chunkOrder,
        address.chunkPix,
      );
      // An archive the index lists is taken from it, exactly as the fast path
      // above takes them all: a `stat` for every archive already known made a
      // manifest request cost more with each archive of a tier being
      // prepared (13 `stat`s at 12 archives of 61), for a tier that is
      // `on-demand` all along.
      if (typeof index[key] === "number") {
        realTotal += index[key];
        continue;
      }
      const relPath = archiveRelativePath(
        survey,
        address.order,
        address.chunkOrder,
        address.chunkPix,
      );
      // eslint-disable-next-line no-await-in-loop
      const info = await statOrNull(join(mirror.directory, relPath));
      if (!info) return { state: "on-demand" };
      realTotal += info.size;
      repairs.push(recordArchiveIndexEntry(survey.id, key, info.size));
    }
    if (repairs.length) await Promise.all(repairs);
    return { state: "ready", exactBytes: realTotal };
  }

  /** The mean tile size the mirror has itself observed for `surveyId` AT
   * `order`, once it has fetched enough of them AT THAT ORDER to be
   * trustworthy (`minimumObservedTilesForMean`); `fallback` otherwise.
   * Persisted across restarts under `<directory>/stats/`, per-order,
   * merged safely across concurrent processes (see `recordObservedTile`). */
  async function observedMeanTileBytes(surveyId, order, fallback) {
    const stats = await currentObservedStats(surveyId);
    const entry = stats.byOrder[String(order)];
    if (
      !entry ||
      entry.count < mirror.minimumObservedTilesForMean ||
      entry.totalBytes <= 0
    )
      return fallback;
    return Math.round(entry.totalBytes / entry.count);
  }

  /** `observedMeanTileBytes` for every order `fallbackByOrder` documents a
   * fallback for, in one call — the shape `meanTileBytesByOrder`
   * (`portal-app/lib/offline-pack.server.js`) needs for the manifest's additive
   * `sky-backdrop.meanTileBytesByOrder` field. */
  async function observedMeanTileBytesByOrder(surveyId, fallbackByOrder) {
    const result = {};
    for (const orderKey of Object.keys(fallbackByOrder)) {
      // eslint-disable-next-line no-await-in-loop
      result[orderKey] = await observedMeanTileBytes(
        surveyId,
        orderKey,
        fallbackByOrder[orderKey],
      );
    }
    return result;
  }

  return Object.assign(mirror, {
    ensureTile,
    ensureArchive,
    buildArchive,
    ensureProperties,
    fileEtag,
    tierState,
    tierArchiveProgress,
    archiveIndexReconciled,
    protectArchives,
    upstreamPace,
    observedMeanTileBytes,
    observedMeanTileBytesByOrder,
  });
}

let defaultMirror = null;

/** The one mirror instance a running portal process uses — the "global to
 * the process" semaphore and single-flight state the task calls for is this
 * instance's closures, created once and reused by every request. */
export function skyTileMirror() {
  if (!defaultMirror) defaultMirror = createSkyTileMirror();
  return defaultMirror;
}

/** Test seam, exactly like `resetSkyQualityRaster` in
 * `sky-quality.server.js`: a suite that changes `ASTRO_PORTAL_SKY_TILE_MIRROR_DIR`
 * (or any other configuration environment variable) between cases has to
 * drop the memoized instance explicitly for the change to take effect. */
export function resetSkyTileMirror() {
  defaultMirror = null;
}
