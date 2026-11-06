// The service's own backups (a service running SQLite on a single replica
// can back itself up before every rollout). The service takes
// them in its own process, with SQLite's backup API, into
//
//   <backup directory>/<UTC timestamp>-v<app version>-s<schema version>/
//     portal.sqlite        the snapshot
//     backup-info.json     backend, versions, row counts, checksum, kind
//     media-manifest.json  relative path, size and SHA-256 of every media
//                          file (the media themselves are not copied)
//
// A backup is assembled in a hidden `.partial-…` directory and renamed into
// place once complete: a backup interrupted at any point never passes for a
// valid one. PostgreSQL is out of scope here (the service image has no
// `pg_dump`): see startup.js.
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  pathExists,
  sha256File,
  timestampForName,
  writeJsonDurably,
} from "./files.js";
import { mediaManifest } from "./media-manifest.js";
import { inspectSqlite, snapshotSqlite } from "./sqlite.js";

export const SERVICE_BACKUP_KINDS = [
  "startup",
  "on-demand",
  "pre-restore",
  "scheduled",
];
/** Kinds the retention policy may remove; pre-restore backups are kept. */
const PRUNABLE_KINDS = ["startup", "on-demand", "scheduled"];
const WORK_PREFIX = ".partial-";
const ARTIFACT = "portal.sqlite";
/** An empty file of this name in a backup directory keeps it forever. */
export const KEEP_MARKER = "keep";
/** A working directory older than this belongs to an interrupted backup. */
const STALE_WORK_MS = 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

function nonNegativeInteger(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function positiveNumber(value) {
  if (value === undefined || value === null || String(value).trim() === "")
    return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * With a maximum age, the newest backup is refreshed once it is this old:
 * the service is then never left without a recent backup by the removal of
 * the old ones.
 */
export const BACKUP_REFRESH_MS = DAY_MS;

const ageOf = (entry, now) => now.getTime() - Date.parse(entry.createdAt);

/**
 * Where the service keeps its backups and what it keeps, from the
 * environment:
 * - `ASTRO_PORTAL_BACKUP_DIR` (default `<runtime directory>/backups`, the
 *   runtime directory being `ASTRO_PORTAL_RUNTIME_DIR`);
 * - `ASTRO_PORTAL_BACKUP_MEDIA_DIR`, the tree the media manifest describes
 *   (default: the captures directory the service writes uploads to;
 *   `none` for no manifest);
 * - `ASTRO_PORTAL_BACKUP_KEEP_LATEST` (10) and `ASTRO_PORTAL_BACKUP_KEEP_DAILY`
 *   (7): see pruneServiceBackups;
 * - `ASTRO_PORTAL_BACKUP_MAX_AGE_DAYS` (none): the age, in days, past which
 *   no backup is kept at all, whatever its kind or its mark. A service that
 *   promises to erase what it is asked to erase within a delay, backups
 *   included, sets it.
 */
// Every path below comes from the environment at run time, never from the
// build: `turbopackIgnore` keeps Next.js from tracing the whole project into
// the image because of them (as in portal-app/lib/config.server.js).
export function serviceBackupSettings(env = process.env) {
  const databaseUrl = env.ASTRO_PORTAL_DATABASE_URL || null;
  const databasePath = env.ASTRO_PORTAL_DATABASE_PATH || null;
  const serviceDirectory = resolve(
    /* turbopackIgnore: true */ env.ASTRO_PORTAL_SERVICE_DIR || process.cwd(),
  );
  const runtimeDirectory = resolve(
    /* turbopackIgnore: true */ env.ASTRO_PORTAL_RUNTIME_DIR ||
      join(/* turbopackIgnore: true */ serviceDirectory, ".astro-portal"),
  );
  const media = env.ASTRO_PORTAL_BACKUP_MEDIA_DIR;
  return {
    backend: databaseUrl ? "postgres" : databasePath ? "sqlite" : null,
    databasePath:
      !databaseUrl && databasePath
        ? resolve(/* turbopackIgnore: true */ databasePath)
        : null,
    backupDirectory: resolve(
      /* turbopackIgnore: true */ env.ASTRO_PORTAL_BACKUP_DIR ||
        join(/* turbopackIgnore: true */ runtimeDirectory, "backups"),
    ),
    mediaDirectory:
      media === "none"
        ? null
        : resolve(
            /* turbopackIgnore: true */ media ||
              env.ASTRO_PORTAL_CAPTURES_DIR ||
              join(/* turbopackIgnore: true */ runtimeDirectory, "captures"),
          ),
    keepLatest: nonNegativeInteger(env.ASTRO_PORTAL_BACKUP_KEEP_LATEST, 10),
    keepDaily: nonNegativeInteger(env.ASTRO_PORTAL_BACKUP_KEEP_DAILY, 7),
    maxAgeDays: positiveNumber(env.ASTRO_PORTAL_BACKUP_MAX_AGE_DAYS),
  };
}

/**
 * Whether the newest valid backup must be refreshed now: only with a
 * maximum age, when there is none or it is older than a day. The reason,
 * or `null`.
 */
export function backupRefreshReason(latest, settings, now = new Date()) {
  if (!settings.maxAgeDays) return null;
  if (!latest) return "no backup yet";
  const age = ageOf(latest, now);
  return age >= BACKUP_REFRESH_MS
    ? `the newest backup is ${Math.floor(age / 3_600_000)} hours old and none may be kept past ${settings.maxAgeDays} days`
    : null;
}

export class BackupInProgressError extends Error {
  constructor() {
    super("A backup is already in progress.");
    this.name = "BackupInProgressError";
    this.code = "backup_in_progress";
  }
}

// One backup (or clean-up) at a time per process. The flag lives on
// globalThis: server.mjs and the Next.js bundle load their own copies of
// this module in the same process.
const inProgress = Symbol.for("astro-portal.service-backup.in-progress");

async function exclusively(work) {
  if (globalThis[inProgress]) throw new BackupInProgressError();
  globalThis[inProgress] = true;
  try {
    return await work();
  } finally {
    globalThis[inProgress] = false;
  }
}

const nameSafe = (value) =>
  String(value ?? "unknown").replace(/[^0-9A-Za-z.+_-]/g, "_") || "unknown";

async function freeBackupId(directory, base) {
  for (let attempt = 1; ; attempt += 1) {
    const id = attempt === 1 ? base : `${base}-${attempt}`;
    if (!(await pathExists(join(directory, id)))) return id;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

/**
 * Every backup directory with its state, newest first:
 * - `valid`: complete, its `backup-info.json` readable and its snapshot of
 *   the recorded size;
 * - `invalid`: a final name whose content does not add up (never produced
 *   by the service itself: a hand copy cut short, a file edited…);
 * - `incomplete`: a `.partial-…` working directory, in progress or left by
 *   an interrupted backup.
 * A backup made by scripts/backup-runtime.mjs has the kind `script`.
 */
export async function listServiceBackups(backupDirectory) {
  let dirents;
  try {
    dirents = await readdir(backupDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const entries = [];
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue;
    const directory = join(backupDirectory, dirent.name);
    const modifiedMs = (await stat(directory)).mtimeMs;
    if (dirent.name.startsWith(WORK_PREFIX)) {
      entries.push({
        id: dirent.name,
        directory,
        state: "incomplete",
        reason: "working directory of an unfinished backup",
        kind: null,
        keep: false,
        createdAt: new Date(modifiedMs).toISOString(),
        modifiedMs,
        info: null,
      });
      continue;
    }
    if (dirent.name.startsWith(".")) continue;
    let info = null;
    let reason = null;
    try {
      info = await readJson(join(directory, "backup-info.json"));
    } catch {
      reason = "backup-info.json is missing or unreadable";
    }
    if (info && !reason) {
      const artifact = String(info.artifact || "");
      if (info.backupId !== dirent.name)
        reason = "backup-info.json names another backup";
      else if (!/^[^/\\]+$/.test(artifact) || artifact.startsWith("."))
        reason = "backup-info.json names no database snapshot";
      else {
        const artifactStat = await stat(join(directory, artifact)).catch(
          () => null,
        );
        if (!artifactStat?.isFile())
          reason = "the database snapshot is missing";
        else if (
          typeof info.artifactBytes === "number" &&
          artifactStat.size !== info.artifactBytes
        )
          reason = `the database snapshot has ${artifactStat.size} bytes, backup-info.json records ${info.artifactBytes}`;
        else if (!(await pathExists(join(directory, "media-manifest.json"))))
          reason = "media-manifest.json is missing";
      }
    }
    const kind = info?.kind || (info ? "script" : null);
    entries.push({
      id: dirent.name,
      directory,
      state: reason ? "invalid" : "valid",
      reason,
      kind,
      keep:
        info?.keep === true ||
        kind === "pre-restore" ||
        (await pathExists(join(directory, KEEP_MARKER))),
      createdAt:
        typeof info?.createdAt === "string"
          ? info.createdAt
          : new Date(modifiedMs).toISOString(),
      modifiedMs,
      info,
    });
  }
  entries.sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) ||
      right.id.localeCompare(left.id),
  );
  return entries;
}

/** The newest valid backup the service made itself, or null. */
export function latestValidBackup(entries) {
  return (
    entries.find(
      (entry) =>
        entry.state === "valid" && SERVICE_BACKUP_KINDS.includes(entry.kind),
    ) || null
  );
}

async function previousMediaEntries(backupDirectory) {
  try {
    const latest = latestValidBackup(await listServiceBackups(backupDirectory));
    if (!latest) return null;
    const entries = await readJson(
      join(latest.directory, "media-manifest.json"),
    );
    return Array.isArray(entries) ? entries : null;
  } catch {
    return null;
  }
}

/**
 * Takes one backup of the service's SQLite database now. `kind` is
 * `startup`, `on-demand`, `scheduled` (maintainServiceBackups) or
 * `pre-restore` (the latter is always kept, up to a maximum age).
 * Resolves with `{ id, directory, info }` once the backup is complete and in
 * place; rejects, leaving no valid-looking backup behind, otherwise.
 * Rejects with BackupInProgressError while another backup runs.
 */
export async function takeServiceBackup({
  settings,
  kind,
  keep = false,
  appVersion,
  appBuild = null,
  now = new Date(),
  hooks = {},
}) {
  if (settings.backend !== "sqlite" || !settings.databasePath)
    throw new Error(
      "The service backs up its SQLite database only; a PostgreSQL database is backed up outside the service.",
    );
  if (!SERVICE_BACKUP_KINDS.includes(kind))
    throw new Error(`Unknown backup kind: ${kind}`);
  return exclusively(async () => {
    const started = performance.now();
    const { backupDirectory, databasePath } = settings;
    await mkdir(backupDirectory, { recursive: true });
    if (!(await pathExists(databasePath)))
      throw new Error(`SQLite database does not exist: ${databasePath}`);
    const stamp = timestampForName(now);
    const work = join(
      backupDirectory,
      `${WORK_PREFIX}${stamp}-${randomBytes(3).toString("hex")}`,
    );
    await mkdir(work);
    try {
      const artifactPath = join(work, ARTIFACT);
      await snapshotSqlite({ databasePath, artifactPath, readOnly: false });
      await hooks.afterSnapshot?.();
      const inspected = await inspectSqlite(artifactPath, {
        integrity: "quick",
      });
      if (inspected.integrity !== "ok")
        throw new Error(
          `The snapshot failed SQLite's integrity check: ${inspected.integrity}`,
        );
      const artifactBytes = (await stat(artifactPath)).size;
      const artifactSha256 = await sha256File(artifactPath);
      const manifest = await mediaManifest(settings.mediaDirectory, {
        previous: await previousMediaEntries(backupDirectory),
        recordModifiedTime: true,
        skipVanished: true,
      });
      await writeJsonDurably(
        join(work, "media-manifest.json"),
        manifest.entries,
      );
      const id = await freeBackupId(
        backupDirectory,
        `${stamp}-v${nameSafe(appVersion)}-s${inspected.schemaVersion ?? 0}`,
      );
      const info = {
        backupId: id,
        createdAt: now.toISOString(),
        backend: "sqlite",
        artifact: ARTIFACT,
        database: { path: databasePath },
        appVersion: appVersion ?? null,
        appBuild: appBuild || null,
        schemaVersion: inspected.schemaVersion,
        tableCounts: inspected.tableCounts,
        media: {
          dir: settings.mediaDirectory,
          missing: manifest.missing,
          copied: false,
          fileCount: manifest.entries.length,
          totalBytes: manifest.entries.reduce(
            (sum, entry) => sum + entry.bytes,
            0,
          ),
        },
        kind,
        keep: kind === "pre-restore" || keep === true,
        artifactBytes,
        artifactSha256,
        integrity: inspected.integrity,
        durationMs: Math.round(performance.now() - started),
      };
      await writeJsonDurably(join(work, "backup-info.json"), info);
      const directory = join(/* turbopackIgnore: true */ backupDirectory, id);
      await rename(work, directory);
      return { id, directory, info };
    } catch (error) {
      await rm(work, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  });
}

/**
 * Removes old service backups. Kept, whatever their age:
 * - the `keepLatest` newest backups of each kind `startup`, `on-demand` and
 *   `scheduled`;
 * - the newest backup of each of the last `keepDaily` days (UTC);
 * - the newest valid backup, always;
 * - every backup marked to keep (`keep: true`, a `keep` file, pre-restore);
 * - anything the service did not make itself (script backups, invalid
 *   directories): it is not the service's to judge.
 * A `.partial-…` working directory is removed once it is an hour old.
 *
 * With a maximum age (`maxAgeDays`), none of the above outlives it: every
 * directory of the backup directory older than that is removed, marked or
 * not, made by the service or not, valid or not — the newest valid backup
 * too. Keep the newest one fresh with maintainServiceBackups.
 */
export async function pruneServiceBackups({ settings, now = new Date() }) {
  return exclusively(async () => {
    const entries = await listServiceBackups(settings.backupDirectory);
    const maxAgeMs = settings.maxAgeDays
      ? settings.maxAgeDays * DAY_MS
      : Infinity;
    // `createdAt` is the time a backup records, or the time its directory
    // was last written when it records none (see listServiceBackups).
    const tooOld = (entry) => ageOf(entry, now) > maxAgeMs;
    const service = entries.filter(
      (entry) =>
        entry.state === "valid" && SERVICE_BACKUP_KINDS.includes(entry.kind),
    );
    const kept = new Set();
    if (service[0]) kept.add(service[0].id);
    for (const kind of PRUNABLE_KINDS)
      for (const entry of service
        .filter((candidate) => candidate.kind === kind)
        .slice(0, settings.keepLatest))
        kept.add(entry.id);
    for (let day = 0; day < settings.keepDaily; day += 1) {
      const date = new Date(now.getTime() - day * DAY_MS)
        .toISOString()
        .slice(0, 10);
      const newest = service.find(
        (entry) => entry.createdAt.slice(0, 10) === date,
      );
      if (newest) kept.add(newest.id);
    }
    const removed = [];
    for (const entry of entries) {
      const removable =
        tooOld(entry) ||
        (entry.state === "incomplete"
          ? now.getTime() - entry.modifiedMs > STALE_WORK_MS
          : entry.state === "valid" &&
            PRUNABLE_KINDS.includes(entry.kind) &&
            !entry.keep &&
            !kept.has(entry.id));
      if (!removable) continue;
      await rm(entry.directory, { recursive: true, force: true });
      removed.push(entry.id);
    }
    return {
      removed,
      kept: entries
        .map((entry) => entry.id)
        .filter((id) => !removed.includes(id)),
    };
  });
}

/**
 * The periodic work of a service with a maximum backup age (server.mjs runs
 * it every hour): a `scheduled` backup when the newest valid one is a day
 * old, then the retention policy, so that old backups leave on time even
 * when the service is never restarted. Does nothing without a maximum age
 * or off SQLite. Rejects with BackupInProgressError while another backup
 * runs; the next run tries again.
 */
export async function maintainServiceBackups({
  settings,
  appVersion,
  appBuild = null,
  now = new Date(),
}) {
  if (
    !settings.maxAgeDays ||
    settings.backend !== "sqlite" ||
    !settings.databasePath
  )
    return { backup: null, removed: [] };
  let backup = null;
  const reason = backupRefreshReason(
    latestValidBackup(await listServiceBackups(settings.backupDirectory)),
    settings,
    now,
  );
  if (reason) {
    const taken = await takeServiceBackup({
      settings,
      kind: "scheduled",
      appVersion,
      appBuild,
      now,
    });
    backup = { id: taken.id, reason };
  }
  const pruned = await pruneServiceBackups({ settings, now });
  return { backup, removed: pruned.removed };
}

/** What the administration route shows of a backup: metadata, no path. */
export function publicBackupSummary(entry) {
  const info = entry.info || {};
  return {
    id: entry.id,
    state: entry.state,
    reason: entry.reason ?? null,
    kind: entry.kind,
    keep: entry.keep,
    createdAt: entry.createdAt,
    appVersion: info.appVersion ?? null,
    appBuild: info.appBuild ?? null,
    schemaVersion: info.schemaVersion ?? null,
    artifactBytes: info.artifactBytes ?? null,
    integrity: info.integrity ?? null,
    durationMs: info.durationMs ?? null,
    tableCounts: info.tableCounts ?? null,
    media: info.media
      ? {
          fileCount: info.media.fileCount ?? 0,
          totalBytes: info.media.totalBytes ?? 0,
        }
      : null,
  };
}

const restoreRecordPattern =
  /^restore-request\.(.+)\.(processing|done|refused|interrupted)\.json$/;

/** The restore requests in the backup directory, pending or processed, newest first. */
export async function listRestoreRequests(backupDirectory) {
  let names;
  try {
    names = await readdir(backupDirectory);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const records = [];
  for (const name of names) {
    const match = restoreRecordPattern.exec(name);
    if (name !== "restore-request.json" && !match) continue;
    let record = {};
    try {
      record = await readJson(join(backupDirectory, name));
    } catch {
      record = {};
    }
    records.push({
      file: name,
      status: match ? match[2] : "pending",
      backupId: typeof record.backupId === "string" ? record.backupId : null,
      requestId: typeof record.requestId === "string" ? record.requestId : null,
      processedAt:
        typeof record.processedAt === "string" ? record.processedAt : null,
      reason: typeof record.reason === "string" ? record.reason : null,
      preRestoreBackupId:
        typeof record.result?.preRestoreBackupId === "string"
          ? record.result.preRestoreBackupId
          : null,
    });
  }
  return records.sort((left, right) => right.file.localeCompare(left.file));
}
