// One process at a time on the service's SQLite data.
//
// Why. When the SQLite database sits on a network file system whose
// byte-range locks stay local to each container, two containers on the share
// are two writers with no common lock, and a platform may start a second
// container outside any rollout (a replaced replica, a restart, an
// activation by hand). A byte-range lock of our own would stay local for the
// same reason. The lease therefore
// rests only on what the file server itself arbitrates: the exclusive
// creation of a file, and the modification times it stamps.
//
// Protocol. Directory `<database file>.lease/`, next to the database (on the
// same share, whatever the other directories are set to):
//   - the lease is a file `lease-<generation>.json` (generation 1, 2, 3…);
//     the current lease is the highest generation present. It names its
//     holder — image, host name, process, time taken, time of the last
//     heartbeat — and carries no secret;
//   - to take it, a process reads the directory. With no lease file, or when
//     the highest one is marked released or is dead, it creates the next
//     generation with O_CREAT|O_EXCL: the file server lets exactly one
//     creator succeed, the others get EEXIST and read the directory again,
//     where they find the winner's live lease. Two processes taking over the
//     same dead lease at the same time end with one holder;
//   - the winner reads the directory once more: a higher generation means
//     its view was outdated, and it withdraws. Otherwise it removes the older
//     generations and starts its heartbeat;
//   - heartbeat: every 5 s, from a worker thread (a long synchronous SQLite
//     statement on the main thread does not delay it), the holder checks
//     that its file still exists, still names it, and that no higher
//     generation exists — otherwise the lease is lost and the process stops
//     — then rewrites its file, which makes the file server stamp a new
//     modification time. A holder that cannot renew for 13 s stops too;
//   - dead: the lease file's modification time is more than 15 s older than
//     the modification time of a witness file the reader has just written in
//     the same directory. Both times are stamped by the file server: no
//     clock is compared with another machine's (the `heartbeatAt` inside the
//     file is the holder's own clock, for people to read, and never judged);
//   - clean stop (SIGTERM, SIGINT, any normal exit): the holder marks its
//     file released and the next process takes the next generation at once.
//
// Cost at startup: a directory read and one exclusive creation when there is
// no lease or the previous one was released; after a holder was killed, the
// wait until its last heartbeat is 15 s old (at most 15 s, plus one 0.5 s
// poll); while a live holder keeps beating, up to 40 s, then the service
// does not start.
//
// PostgreSQL: no lease. The database server arbitrates its own writers
// (transactions, row locks), and several processes on one PostgreSQL
// database is a supported setup (the change bus relays between them).
//
// `ASTRO_PORTAL_SQLITE_LEASE=off` disables the lease.
import { randomBytes } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  ftruncateSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { mkdir, open, readdir, readFile, rm, stat } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, join, resolve } from "node:path";
import { Worker } from "node:worker_threads";

export const SQLITE_LEASE_TIMING = Object.freeze({
  /** How often the holder renews its lease. */
  heartbeatMs: 5_000,
  /** A lease not renewed for this long (by the share's clock) is dead. */
  staleMs: 15_000,
  /** How long a starting process waits for a live lease to be released. */
  waitMs: 40_000,
  /** How often a waiting process looks again. */
  pollMs: 500,
});

const LEASE_FILE = /^lease-(\d+)\.json$/;
const WITNESS_PREFIX = "witness-";
const MUTEX = 0;
const STOPPED = 1;

const defaultLog = {
  info: (event, message) =>
    console.info(`[Astro Portal] info ${event}: ${message}`),
  warn: (event, message) =>
    console.warn(`[Astro Portal] warning ${event}: ${message}`),
  error: (event, message) =>
    console.error(`[Astro Portal] error ${event}: ${message}`),
};

/**
 * Whether this process needs the lease, from the environment:
 * `postgres` (none needed), `none` (no database configured), `disabled`
 * (`ASTRO_PORTAL_SQLITE_LEASE=off`) or `sqlite`, with the lease directory.
 */
export function sqliteLeaseSettings(env = process.env) {
  if (env.ASTRO_PORTAL_DATABASE_URL) return { mode: "postgres" };
  if (!env.ASTRO_PORTAL_DATABASE_PATH) return { mode: "none" };
  const databasePath = resolve(
    /* turbopackIgnore: true */ env.ASTRO_PORTAL_DATABASE_PATH,
  );
  if (
    String(env.ASTRO_PORTAL_SQLITE_LEASE || "")
      .trim()
      .toLowerCase() === "off"
  )
    return { mode: "disabled", databasePath };
  return { mode: "sqlite", databasePath, directory: `${databasePath}.lease` };
}

const leaseName = (generation) =>
  `lease-${String(generation).padStart(6, "0")}.json`;

function generationOf(name) {
  const match = LEASE_FILE.exec(name);
  return match ? Number(match[1]) : null;
}

function highestGeneration(names) {
  let highest = 0;
  for (const name of names) {
    const generation = generationOf(name);
    if (generation !== null && generation > highest) highest = generation;
  }
  return highest;
}

const serialize = (record) => `${JSON.stringify(record, null, 2)}\n`;

function parse(raw) {
  try {
    const record = JSON.parse(raw);
    return record && typeof record === "object" ? record : null;
  } catch {
    return null;
  }
}

/** Who holds a lease, for a log line: never the token. */
export function describeHolder(record) {
  if (!record) return "holder unknown: the lease file is empty or unreadable";
  const holder = record.holder || {};
  return (
    `image ${holder.image || "unknown"}, host ${holder.hostname || "unknown"}, ` +
    `process ${holder.pid ?? "unknown"}, taken at ${record.acquiredAt || "unknown"}`
  );
}

const seconds = (milliseconds) =>
  `${(Math.max(0, milliseconds) / 1000).toFixed(1)} s`;

function pause(milliseconds, signal) {
  return new Promise((resolvePromise) => {
    if (signal?.aborted) return resolvePromise();
    const timer = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolvePromise();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** The highest lease file with its content; null content when unreadable. */
async function currentLease(directory) {
  const names = await readdir(directory);
  const generation = highestGeneration(names);
  if (!generation) return { generation: 0, file: null, record: null };
  const file = join(directory, leaseName(generation));
  try {
    return { generation, file, record: parse(await readFile(file, "utf8")) };
  } catch (error) {
    if (error?.code === "ENOENT") return null; // replaced meanwhile: read again
    throw error;
  }
}

/**
 * How old the lease file's last write is, by the share's clock: its
 * modification time against the one of a witness file written just now in
 * the same directory. The witness is written first, so a heartbeat landing
 * in between can only make the lease look younger, never older. Null when
 * the lease file or the witness vanished meanwhile.
 */
async function ageByShareClock(file, witness) {
  const handle = await open(witness, "w", 0o600);
  try {
    await handle.writeFile(`${new Date().toISOString()}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    const witnessStat = await stat(witness);
    const leaseStat = await stat(file);
    return witnessStat.mtimeMs - leaseStat.mtimeMs;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function createExclusively(file, record) {
  let handle;
  try {
    handle = await open(file, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  }
  try {
    await handle.writeFile(serialize(record));
    await handle.sync();
  } finally {
    await handle.close();
  }
  return true;
}

// The heartbeat, on its own thread: evaluated source, as in
// persistence/backup/sqlite.js, so no file needs resolving. Every write to
// the lease file, the worker's and the main thread's release, happens under
// one mutex in shared memory: a heartbeat never lands after the release.
const heartbeatWorkerSource = `
const { parentPort, workerData } = process.getBuiltinModule("node:worker_threads");
const fs = process.getBuiltinModule("node:fs");
const path = process.getBuiltinModule("node:path");
const { file, directory, token, generation, heartbeatMs, fenceMs, retryMs, shared } = workerData;
const state = new Int32Array(shared);
const pattern = /^lease-(\\d+)\\.json$/;
let lastRenewal = performance.now();
let warned = false;
let finished = false;
let timer = null;
const lock = () => {
  while (Atomics.compareExchange(state, 0, 0, 1) !== 0) Atomics.wait(state, 0, 1, 10);
};
const unlock = () => {
  Atomics.store(state, 0, 0);
  Atomics.notify(state, 0, 1);
};
const finish = () => {
  finished = true;
  if (timer) clearTimeout(timer);
  timer = null;
};
const describe = (record) => {
  const holder = (record && record.holder) || {};
  return "image " + (holder.image || "unknown") + ", host " + (holder.hostname || "unknown") +
    ", process " + (holder.pid == null ? "unknown" : holder.pid);
};
function beat() {
  timer = null;
  if (finished) return;
  let lost = null;
  let failure = null;
  lock();
  try {
    if (Atomics.load(state, 1) === 1) {
      finish();
      return;
    }
    let raw = null;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    let record = null;
    try {
      record = raw === null ? null : JSON.parse(raw);
    } catch {}
    if (raw === null) lost = "its file " + path.basename(file) + " disappeared";
    else if (!record || record.token !== token)
      lost = "its file " + path.basename(file) + " no longer names this process" + (record ? " (" + describe(record) + ")" : "");
    else {
      let higher = 0;
      for (const name of fs.readdirSync(directory)) {
        const match = pattern.exec(name);
        if (match && Number(match[1]) > higher) higher = Number(match[1]);
      }
      if (higher > generation) {
        let other = null;
        try {
          other = JSON.parse(fs.readFileSync(path.join(directory, "lease-" + String(higher).padStart(6, "0") + ".json"), "utf8"));
        } catch {}
        lost = "another process took generation " + higher + (other ? " (" + describe(other) + ")" : "");
      } else {
        const buffer = Buffer.from(JSON.stringify({ ...record, heartbeatAt: new Date().toISOString(), heartbeats: (record.heartbeats || 0) + 1 }, null, 2) + "\\n");
        const fd = fs.openSync(file, "r+");
        try {
          fs.writeSync(fd, buffer, 0, buffer.length, 0);
          fs.ftruncateSync(fd, buffer.length);
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        lastRenewal = performance.now();
        warned = false;
      }
    }
  } catch (error) {
    failure = error;
  } finally {
    unlock();
  }
  if (finished) return;
  if (lost) {
    finish();
    parentPort.postMessage({ type: "lost", reason: lost });
    return;
  }
  if (failure) {
    const silent = performance.now() - lastRenewal;
    if (silent >= fenceMs) {
      finish();
      parentPort.postMessage({
        type: "lost",
        reason: "it could not be renewed for " + Math.round(silent / 1000) + " s (" + failure.message +
          "), and another process may already consider it abandoned",
      });
      return;
    }
    if (!warned) {
      warned = true;
      parentPort.postMessage({ type: "warning", message: failure.message });
    }
    timer = setTimeout(beat, retryMs);
    return;
  }
  timer = setTimeout(beat, heartbeatMs);
}
parentPort.on("message", (message) => {
  if (message === "stop") finish();
});
timer = setTimeout(beat, heartbeatMs);
`;

function lock(state) {
  while (Atomics.compareExchange(state, MUTEX, 0, 1) !== 0)
    Atomics.wait(state, MUTEX, 1, 10);
}

function unlock(state) {
  Atomics.store(state, MUTEX, 0);
  Atomics.notify(state, MUTEX, 1);
}

/** A lease this process holds. */
class SqliteLease {
  #file;
  #token;
  #state;
  #worker;
  #lost = false;
  #released = false;

  constructor({ directory, generation, file, token, timing, log, onLost }) {
    this.directory = directory;
    this.generation = generation;
    this.#file = file;
    this.#token = token;
    this.#state = new Int32Array(new SharedArrayBuffer(8));
    this.#worker = new Worker(heartbeatWorkerSource, {
      eval: true,
      workerData: {
        file,
        directory,
        token,
        generation,
        heartbeatMs: timing.heartbeatMs,
        fenceMs:
          timing.staleMs - Math.min(2_000, Math.max(1, timing.heartbeatMs)),
        retryMs: Math.min(1_000, timing.heartbeatMs),
        shared: this.#state.buffer,
      },
    });
    this.#worker.unref();
    const lose = (reason) => {
      if (this.#lost || this.#released) return;
      this.#lost = true;
      void this.#worker.terminate();
      onLost(reason);
    };
    this.#worker.on("message", (message) => {
      if (message?.type === "lost") lose(message.reason);
      else if (message?.type === "warning")
        log.warn(
          "lease.heartbeat",
          `The SQLite lease could not be renewed (${message.message}); trying again every second.`,
        );
    });
    this.#worker.on("error", (error) =>
      lose(`its heartbeat stopped (${error.message})`),
    );
    this.#worker.on("exit", () =>
      lose("its heartbeat stopped (the worker thread exited)"),
    );
  }

  get file() {
    return this.#file;
  }

  get lost() {
    return this.#lost;
  }

  get released() {
    return this.#released;
  }

  /**
   * Marks the lease released, synchronously: safe in an `exit` listener,
   * and never followed by a heartbeat. Returns true when this process still
   * held it; a lost lease is not touched (it belongs to another process).
   */
  release() {
    if (this.#released || this.#lost) return false;
    this.#released = true;
    lock(this.#state);
    try {
      Atomics.store(this.#state, STOPPED, 1);
      const record = parse(readFileSync(this.#file, "utf8"));
      if (record?.token !== this.#token) return false;
      rewriteSync(this.#file, {
        ...record,
        state: "released",
        releasedAt: new Date().toISOString(),
      });
      return true;
    } catch {
      return false;
    } finally {
      unlock(this.#state);
      void this.#worker.terminate();
    }
  }
}

function rewriteSync(file, record) {
  const buffer = Buffer.from(serialize(record));
  const fd = openSync(file, "r+");
  try {
    writeSync(fd, buffer, 0, buffer.length, 0);
    ftruncateSync(fd, buffer.length);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function defaultOnLost(log) {
  return (reason) => {
    log.error(
      "lease.lost",
      `The SQLite lease was lost: ${reason}. The service stops now, so as never to write next to another process.`,
    );
    process.exit(1);
  };
}

/**
 * Takes the SQLite lease before anything opens the database (server.mjs,
 * before the startup backup and the migrations). Resolves with
 * - `{ ok: true, lease: null, status }` when no lease applies: `postgres`,
 *   `none` (no database configured) or `disabled`;
 * - `{ ok: true, lease, status }` once held: `taken` (no previous lease),
 *   `after-release` or `taken-over` (the previous holder died);
 * - `{ ok: false, status, message }` when it cannot be taken: `held` (a
 *   live holder kept it for `timing.waitMs`), `aborted` (`signal`) or
 *   `error`. The caller must not open the database.
 * `onLost(reason)` runs if the lease is lost later; by default it logs and
 * exits the process with code 1.
 */
export async function acquireSqliteLease({
  env = process.env,
  appVersion = null,
  appBuild = null,
  log = defaultLog,
  timing = SQLITE_LEASE_TIMING,
  signal = null,
  onLost = null,
  hooks = {},
} = {}) {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const settings = sqliteLeaseSettings(env);
  if (settings.mode === "disabled")
    log.warn(
      "lease.startup",
      `ASTRO_PORTAL_SQLITE_LEASE=off: no lease is taken, and nothing keeps a second process from writing to ${settings.databasePath}.`,
    );
  if (settings.mode !== "sqlite")
    return {
      ok: true,
      status: settings.mode,
      lease: null,
      durationMs: elapsed(),
    };

  const { directory, databasePath } = settings;
  const token = randomBytes(12).toString("hex");
  const witness = join(directory, `${WITNESS_PREFIX}${token}`);
  const deadline = started + timing.waitMs;
  let announced = false;
  let lastSeen = null;
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    for (;;) {
      if (signal?.aborted)
        return {
          ok: false,
          status: "aborted",
          message:
            "the service was asked to stop while it waited for the SQLite lease",
          durationMs: elapsed(),
        };
      const current = await currentLease(directory);
      if (!current) {
        await pause(10, signal); // replaced while we read it: read again
        continue;
      }
      let previous = null;
      if (current.file) {
        if (current.record?.state === "released")
          previous = { how: "released", record: current.record };
        else {
          const age = await ageByShareClock(current.file, witness);
          if (age === null) {
            await pause(10, signal);
            continue;
          }
          if (age > timing.staleMs)
            previous = { how: "dead", record: current.record, age };
          else lastSeen = { record: current.record, age };
        }
      }

      if (!current.file || previous) {
        const generation = current.generation + 1;
        await hooks.beforeCreate?.({ generation, previous });
        const file = join(directory, leaseName(generation));
        const now = new Date().toISOString();
        const created = await createExclusively(file, {
          service: "astro-portal",
          generation,
          state: "held",
          holder: {
            image: appBuild || null,
            version: appVersion || null,
            hostname: hostname(),
            pid: process.pid,
          },
          acquiredAt: now,
          heartbeatAt: now,
          heartbeats: 0,
          // Not a secret: it only tells this process's lease from another's.
          token,
        });
        if (!created) continue; // another process took this generation
        const names = await readdir(directory);
        if (highestGeneration(names) > generation) {
          await rm(file, { force: true });
          continue; // our view was outdated: someone is already further on
        }
        for (const name of names) {
          const older = generationOf(name);
          if (
            (older !== null && older < generation) ||
            (name.startsWith(WITNESS_PREFIX) && name !== basename(witness))
          )
            await rm(join(directory, name), { force: true });
        }
        const lease = new SqliteLease({
          directory,
          generation,
          file,
          token,
          timing,
          log,
          onLost: onLost || defaultOnLost(log),
        });
        const waited =
          announced && lastSeen ? ` after waiting ${seconds(elapsed())}` : "";
        if (!previous)
          log.info(
            "lease.startup",
            `SQLite lease taken in ${elapsed()} ms (generation ${generation}, ${directory}); no previous holder.`,
          );
        else if (previous.how === "released")
          log.info(
            "lease.startup",
            `SQLite lease taken in ${elapsed()} ms (generation ${generation})${waited}; the previous holder (${describeHolder(previous.record)}) released it at ${previous.record.releasedAt || "an unknown time"}.`,
          );
        else
          log.warn(
            "lease.startup",
            `SQLite lease taken over in ${elapsed()} ms (generation ${generation})${waited}: the previous holder (${describeHolder(previous.record)}) stopped without releasing it; its last heartbeat was ${seconds(previous.age)} old by the share's clock.`,
          );
        return {
          ok: true,
          status: !previous
            ? "taken"
            : previous.how === "released"
              ? "after-release"
              : "taken-over",
          lease,
          previous: previous
            ? { how: previous.how, holder: previous.record?.holder ?? null }
            : null,
          durationMs: elapsed(),
        };
      }

      if (!announced) {
        announced = true;
        log.warn(
          "lease.startup",
          `Another process holds the SQLite lease (${describeHolder(lastSeen.record)}; last heartbeat ${seconds(lastSeen.age)} ago by the share's clock): ` +
            `waiting up to ${seconds(timing.waitMs)} for it to be released, or to go ${seconds(timing.staleMs)} without a heartbeat.`,
        );
      }
      if (performance.now() >= deadline) {
        const message =
          `Another process still holds the SQLite lease after ${seconds(elapsed())} ` +
          `(${describeHolder(lastSeen.record)}; last heartbeat ${seconds(lastSeen.age)} ago by the share's clock). ` +
          `The service does not start: two processes must never write to ${databasePath} at the same time. ` +
          "Stop the other process, or wait for it to stop, then start this one again.";
        log.error("lease.startup", message);
        return { ok: false, status: "held", message, durationMs: elapsed() };
      }
      await pause(timing.pollMs, signal);
    }
  } catch (error) {
    const message =
      `The SQLite lease cannot be taken in ${directory} (${error.message}): the service does not start. ` +
      "The directory of the database must be writable; ASTRO_PORTAL_SQLITE_LEASE=off disables the lease " +
      "for an installation that is sure to run a single process.";
    log.error("lease.startup", message);
    return { ok: false, status: "error", message, durationMs: elapsed() };
  } finally {
    await rm(witness, { force: true }).catch(() => {});
  }
}

/** For tests and diagnostics: the lease files of a directory, parsed. */
export async function readSqliteLeases(directory) {
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const leases = [];
  for (const name of names) {
    const generation = generationOf(name);
    if (generation === null) continue;
    let record = null;
    try {
      record = parse(await readFile(join(directory, name), "utf8"));
    } catch {
      record = null;
    }
    leases.push({ generation, name, record });
  }
  return leases.sort((left, right) => left.generation - right.generation);
}
