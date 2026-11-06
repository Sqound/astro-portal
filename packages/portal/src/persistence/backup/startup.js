// What the service does with its SQLite database at every start, before it
// serves anything and before any migration (server.mjs calls this before
// Next.js is prepared, once it holds the SQLite lease: ../sqlite-lease.js):
//   0. refuses a database migrated by a newer version — one that records a
//      migration this code does not know — before writing anything: no
//      backup, no migration, no restore bookkeeping (the result says
//      `ok: false`, the caller exits). With a restore request pending, the
//      request is processed first and the restored database is checked:
//      restoring an older backup with the older image is the way back;
//   1. processes a restore request left in the backup directory (restore-request.js);
//   2. takes a `startup` backup when the application version, its build or
//      the schema version differs from the latest backup, or when there is
//      no backup yet: the database is then exactly as the previous version
//      left it; with a maximum backup age (ASTRO_PORTAL_BACKUP_MAX_AGE_DAYS)
//      also when the latest backup is a day old;
//   3. applies the pending migrations, and refuses to (the result says
//      `ok: false`, the caller exits) when step 2 failed with migrations
//      pending: without a backup, a migration could not be undone;
//   4. gives the main file back its free pages (VACUUM) when most of it is
//      free: migration 94 moved the catalogue texts to their own file
//      (persistence/reimported-data.ts), and SQLite's backup API copies the
//      free pages too;
//   5. applies the retention policy.
// The server runs it on a worker thread (runStartupMaintenanceOffThread):
// node:sqlite is synchronous, and the process answers the platform's probes
// while a restore, a migration or a VACUUM runs.
// Under PostgreSQL only step 0 runs, in a read-only transaction: the image
// has no `pg_dump`, that backup belongs to the database's host, and the
// repositories apply the migrations themselves.
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SHARE_ENV, Worker } from "node:worker_threads";
import pg from "pg";
import { createDatabaseDriver } from "../database.js";
import {
  applyMigrations,
  formatMigrationVersions,
  unknownMigrationVersions,
} from "../migration-runner.js";
import { composedMigrations } from "../migration-registry.js";
import { pathExists } from "./files.js";
import {
  processRestoreRequest,
  RESTORE_REQUEST_FILE,
  reportInterruptedRestores,
} from "./restore-request.js";
import {
  backupRefreshReason,
  latestValidBackup,
  listServiceBackups,
  pruneServiceBackups,
  serviceBackupSettings,
  takeServiceBackup,
} from "./service.js";
import { appliedMigrationVersions } from "./sqlite.js";

/** Same line format as portal-app/lib/app-log.server.js's console output. */
export const consoleLog = {
  info: (event, message) =>
    console.info(`[Astro Portal] info ${event}: ${message}`),
  warn: (event, message) =>
    console.warn(`[Astro Portal] warning ${event}: ${message}`),
  error: (event, message) =>
    console.error(`[Astro Portal] error ${event}: ${message}`),
};

function whyBackup(
  latest,
  { appVersion, appBuild, schemaVersion, settings, now },
) {
  if (!latest) return "no backup yet";
  const info = latest.info;
  if (info.appVersion !== appVersion)
    return `version ${info.appVersion} → ${appVersion}`;
  if ((info.appBuild ?? null) !== (appBuild ?? null))
    return `build ${info.appBuild ?? "unknown"} → ${appBuild ?? "unknown"}`;
  if ((info.schemaVersion ?? null) !== schemaVersion)
    return `schema ${info.schemaVersion} → ${schemaVersion}`;
  // With a maximum age, old backups leave: the newest is kept fresh.
  return backupRefreshReason(latest, settings, now);
}

const megabytes = (bytes) => (bytes / 1024 / 1024).toFixed(1);

const fileSize = async (path) =>
  (await stat(path).catch(() => null))?.size ?? 0;

/** Free pages above which the main file is compacted at startup. */
export const COMPACT_MIN_FREE_BYTES = 64 * 1024 * 1024;

/**
 * VACUUM of the main database file when at least half of it, and at least
 * COMPACT_MIN_FREE_BYTES, is free pages: the first start after migration 94
 * (the catalogue texts left the main file), or after a
 * large deletion. SQLite's backup API copies free pages as well, so without
 * it every later backup would still copy the whole file. Runs before the
 * service opens the database (nothing else holds it); a failure is logged
 * and the service starts on its unchanged database.
 */
export function compactMostlyFreeDatabase(databasePath, log = consoleLog) {
  let database;
  try {
    database = new DatabaseSync(databasePath);
    const pragma = (name) =>
      Number(Object.values(database.prepare(`PRAGMA ${name}`).get())[0]);
    const pageSize = pragma("page_size");
    const pages = pragma("page_count");
    const free = pragma("freelist_count");
    const freeBytes = free * pageSize;
    if (freeBytes < COMPACT_MIN_FREE_BYTES || free * 2 < pages) return null;
    const started = performance.now();
    database.exec("VACUUM");
    const after = pragma("page_count") * pageSize;
    const result = {
      beforeBytes: pages * pageSize,
      afterBytes: after,
      durationMs: Math.round(performance.now() - started),
    };
    log.info(
      "database.compact",
      `Main database compacted from ${megabytes(result.beforeBytes)} MB to ${megabytes(after)} MB in ${result.durationMs} ms (${megabytes(freeBytes)} MB were free pages).`,
    );
    return result;
  } catch (error) {
    log.warn(
      "database.compact",
      `The main database could not be compacted (${error.message}); the service starts on it as it is.`,
    );
    return null;
  } finally {
    database?.close();
  }
}

const describeError = (error) =>
  error?.message ||
  (Array.isArray(error?.errors)
    ? error.errors.map((inner) => inner?.message || String(inner)).join("; ")
    : "") ||
  error?.code ||
  String(error);

/**
 * The line the service writes when it refuses a database migrated by a
 * newer version: the versions this code knows, the ones it found in
 * excess, and which image refused.
 */
export function databaseAheadMessage({
  backend,
  unknown,
  appVersion = null,
  appBuild = null,
}) {
  return (
    `The ${backend === "postgres" ? "PostgreSQL" : "SQLite"} database records migration(s) ${unknown.join(", ")} ` +
    `that this code does not know (this code knows ${formatMigrationVersions(composedMigrations().map((migration) => migration.version))}; ` +
    `version ${appVersion ?? "unknown"}, image ${appBuild || "unknown"}): a newer version migrated it. ` +
    "The service refuses to start and wrote nothing (no backup, no migration). " +
    "Start the image that migrated it, or restore a backup taken before that migration."
  );
}

/**
 * The migrations recorded in a PostgreSQL database, read in a read-only
 * transaction. A database that cannot be reached is tried again, once a
 * second, for `waitMs` (a database server starting at the same time as
 * the service, at boot); an error once connected is not retried.
 */
export async function postgresAppliedMigrationVersions(
  databaseUrl,
  { waitMs = 30_000 } = {},
) {
  const deadline = performance.now() + waitMs;
  for (;;) {
    const client = new pg.Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5_000,
    });
    // An unreachable server also reports through the client's `error`
    // event; the rejected connect below carries the same error.
    client.on("error", () => {});
    let connected = false;
    try {
      await client.connect();
      connected = true;
      await client.query("BEGIN TRANSACTION READ ONLY");
      const { rows } = await client.query(
        "SELECT to_regclass('schema_migrations') IS NOT NULL AS present",
      );
      const versions = rows[0]?.present
        ? (
            await client.query(
              "SELECT version FROM schema_migrations ORDER BY version",
            )
          ).rows.map((row) => Number(row.version))
        : [];
      await client.query("COMMIT");
      return versions;
    } catch (error) {
      if (connected || performance.now() >= deadline) throw error;
    } finally {
      await client.end().catch(() => {});
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }
}

export async function runStartupMaintenance({
  env = process.env,
  appVersion,
  appBuild = null,
  log = consoleLog,
  now = () => new Date(),
  postgresConnectWaitMs = 30_000,
}) {
  const started = performance.now();
  const settings = serviceBackupSettings(env);
  const outcome = (fields) => ({
    ok: true,
    backend: settings.backend,
    backup: null,
    restore: null,
    migrations: { applied: [] },
    durationMs: Math.round(performance.now() - started),
    ...fields,
  });
  const refuseIfAhead = (applied, fields = {}) => {
    const unknown = unknownMigrationVersions(applied);
    if (!unknown.length) return null;
    const message = databaseAheadMessage({
      backend: settings.backend,
      unknown,
      appVersion,
      appBuild,
    });
    log.error("migrations.startup", message);
    return outcome({ ok: false, message, aheadOfCode: unknown, ...fields });
  };
  if (settings.backend === "postgres") {
    log.info(
      "backup.startup",
      "PostgreSQL database: backups are managed outside the service; nothing is attempted at startup.",
    );
    let applied;
    try {
      applied = await postgresAppliedMigrationVersions(
        env.ASTRO_PORTAL_DATABASE_URL,
        { waitMs: postgresConnectWaitMs },
      );
    } catch (error) {
      const message = `The PostgreSQL database cannot be read (${describeError(error)}): the service does not start.`;
      log.error("migrations.startup", message);
      return outcome({ ok: false, message });
    }
    return refuseIfAhead(applied) || outcome({});
  }
  if (settings.backend !== "sqlite") return outcome({});

  const { backupDirectory, databasePath } = settings;
  const readApplied = async () => {
    const existing = (await stat(databasePath).catch(() => null))?.size > 0;
    if (!existing) return { existing, applied: [] };
    try {
      return { existing, applied: appliedMigrationVersions(databasePath) };
    } catch (error) {
      return { existing, error };
    }
  };
  const unreadable = (error, fields = {}) => {
    const message = `The database cannot be read (${error.message}): the service does not start.`;
    log.error("backup.startup", message);
    return outcome({ ok: false, message, ...fields });
  };

  // Step 0, before anything is written: not even the backup directory.
  let current = await readApplied();
  if (current.error) return unreadable(current.error);
  const restorePending = await pathExists(
    join(backupDirectory, RESTORE_REQUEST_FILE),
  );
  if (!restorePending) {
    const refusal = refuseIfAhead(current.applied);
    if (refusal) return refusal;
  }

  let directoryError = null;
  try {
    await mkdir(backupDirectory, { recursive: true });
  } catch (error) {
    directoryError = error;
  }

  let restore = null;
  if (!directoryError) {
    try {
      await reportInterruptedRestores({ backupDirectory, log });
    } catch (error) {
      log.error(
        "restore.request",
        `An interrupted restore could not be marked as such (${error.message}).`,
      );
    }
    restore = await processRestoreRequest({
      settings,
      appVersion,
      appBuild,
      log,
      now: now(),
    });
  }

  if (restorePending) {
    // The restore replaced the database, or was refused and left it as it
    // was: either way, step 0 now judges the database the service would run on.
    current = await readApplied();
    if (current.error) return unreadable(current.error, { restore });
    const refusal = refuseIfAhead(current.applied, { restore });
    if (refusal) return refusal;
  }
  const { existing, applied } = current;
  const pending = composedMigrations()
    .map((migration) => migration.version)
    .filter((version) => !applied.includes(version));
  const schemaVersion = applied.length ? Math.max(...applied) : null;

  let backup = null;
  if (existing) {
    let latest = null;
    try {
      latest = directoryError
        ? null
        : latestValidBackup(await listServiceBackups(backupDirectory));
    } catch (error) {
      log.warn(
        "backup.startup",
        `The existing backups could not be listed (${error.message}).`,
      );
    }
    const reason = whyBackup(latest, {
      appVersion,
      appBuild,
      schemaVersion,
      settings,
      now: now(),
    });
    if (reason) {
      try {
        if (directoryError) throw directoryError;
        log.info(
          "backup.startup",
          `Startup backup starting (${reason}; database ${megabytes(await fileSize(databasePath))} MB).`,
        );
        const taken = await takeServiceBackup({
          settings,
          kind: "startup",
          appVersion,
          appBuild,
          now: now(),
        });
        backup = {
          id: taken.id,
          kind: "startup",
          reason,
          durationMs: taken.info.durationMs,
          artifactBytes: taken.info.artifactBytes,
          schemaVersion: taken.info.schemaVersion,
        };
        log.info(
          "backup.startup",
          `Startup backup ${taken.id} taken in ${taken.info.durationMs} ms ` +
            `(${megabytes(taken.info.artifactBytes)} MB, ${taken.info.media.fileCount} media files manifested; ${reason}).`,
        );
      } catch (error) {
        if (pending.length) {
          const message =
            `Startup backup failed (${error.message}) while ${pending.length} migration(s) are pending (${pending.join(", ")}): ` +
            "refusing to migrate without a backup. The database is left as the previous version wrote it; " +
            "fix the cause (space, permissions of the backup directory) and restart.";
          log.error("backup.startup", message);
          return outcome({ ok: false, message, restore });
        }
        log.error(
          "backup.startup",
          `Startup backup failed (${error.message}); no migration is pending, so the service starts on its unchanged database.`,
        );
      }
    } else {
      log.info(
        "backup.startup",
        `No startup backup needed: backup ${latest.id} already covers version ${appVersion}` +
          `${appBuild ? ` (${appBuild})` : ""}, schema ${schemaVersion}.`,
      );
    }
  }

  if (pending.length) {
    const migrationsStarted = performance.now();
    const driver = createDatabaseDriver({ databasePath });
    try {
      await applyMigrations(driver, "sqlite");
    } catch (error) {
      const message = `Migrations failed (${error.message}): the service does not start.`;
      log.error("migrations.startup", message);
      return outcome({ ok: false, message, backup, restore });
    } finally {
      await driver.close();
    }
    log.info(
      "migrations.startup",
      `Applied migration(s) ${pending.join(", ")} in ${Math.round(performance.now() - migrationsStarted)} ms.`,
    );
  }

  if (existing || pending.length) compactMostlyFreeDatabase(databasePath, log);

  if (!directoryError) {
    try {
      const pruned = await pruneServiceBackups({ settings, now: now() });
      if (pruned.removed.length)
        log.info(
          "backup.retention",
          `Removed ${pruned.removed.length} old backup(s): ${pruned.removed.join(", ")}.`,
        );
    } catch (error) {
      log.warn(
        "backup.retention",
        `Old backups could not be cleaned up (${error.message}).`,
      );
    }
  }

  return outcome({ backup, restore, migrations: { applied: pending } });
}

/**
 * runStartupMaintenance on a worker thread, its log lines relayed to `log`
 * as they come: the server listens before it runs and answers the
 * platform's probes meanwhile (`/healthz` 200, `/readyz` 503), which a
 * synchronous restore, migration or VACUUM on the main thread would keep
 * waiting. `env` is shared with the worker when it is `process.env`.
 * Resolves with the same outcome; rejects only when the worker itself
 * fails.
 *
 * A worker has its own globals, so the migrations a composition registered
 * (`migration-registry.ts`) are not its own: `migrationModules` are the
 * modules (absolute `file:` URLs) that register them, imported by the worker
 * before it reads the database. Without them a database that ran a
 * composition's migrations would be refused as migrated by a newer version.
 */
export function runStartupMaintenanceOffThread({
  env = process.env,
  appVersion,
  appBuild = null,
  log = consoleLog,
  migrationModules = [],
}) {
  return new Promise((resolvePromise, reject) => {
    const worker = new Worker(new URL("./startup-worker.js", import.meta.url), {
      workerData: { appVersion, appBuild, migrationModules },
      env: env === process.env ? SHARE_ENV : { ...env },
    });
    let settled = false;
    worker.on("message", (message) => {
      if (message?.type === "log")
        log[message.level]?.(message.event, message.message);
      else if (message?.type === "result") {
        settled = true;
        resolvePromise(message.outcome);
      } else if (message?.type === "error") {
        settled = true;
        reject(new Error(message.message));
      }
    });
    worker.once("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    worker.once("exit", (code) => {
      if (settled) return;
      settled = true;
      reject(
        new Error(`The startup maintenance worker exited with code ${code}.`),
      );
    });
  });
}
