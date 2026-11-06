// The operator's backup and restore, for both persistence backends.
// scripts/backup-runtime.mjs and scripts/restore-runtime.mjs are thin
// command-line wrappers around these two functions; the service's own
// backups (service.js) share the same snapshot, inspection and manifest
// code, so there is one implementation of each.
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import {
  copyFile,
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  pathExists,
  restrictToOwner,
  timestampForName,
  writeJsonDurably,
} from "./files.js";
import { compareMediaManifests, mediaManifest } from "./media-manifest.js";
import { dumpPostgres, restorePostgresDump } from "./postgres.js";
import { compareTableCounts, inspectSqlite, snapshotSqlite } from "./sqlite.js";

function scriptBackupId(date = new Date()) {
  return `${timestampForName(date)}-${randomBytes(3).toString("hex")}`;
}

/**
 * Backs up the database (SQLite path or PostgreSQL URL) into
 * `<out>/<id>/`: the database artifact, `media-manifest.json` and
 * `backup-info.json`, plus a copy of the media with `withMedia`. The
 * directory is assembled under a hidden working name and renamed into place
 * only once complete, so an interrupted run never leaves a directory that
 * looks like a finished backup.
 */
export async function createRuntimeBackup({
  out,
  databasePath = null,
  databaseUrl = null,
  mediaDir = null,
  withMedia = false,
  appVersion = null,
  container,
}) {
  const id = scriptBackupId();
  const backupDirectory = join(out, id);
  if (await pathExists(backupDirectory))
    throw new Error(`Backup directory already exists: ${backupDirectory}`);
  const workDirectory = join(out, `.partial-${id}`);
  mkdirSync(workDirectory, { recursive: true });
  try {
    const backend = databaseUrl ? "postgres" : "sqlite";
    const artifactName = backend === "sqlite" ? "portal.sqlite" : "portal.dump";
    const artifactPath = join(workDirectory, artifactName);

    let result;
    if (backend === "sqlite") {
      const path = resolve(databasePath);
      if (!(await pathExists(path)))
        throw new Error(`SQLite database does not exist: ${path}`);
      await snapshotSqlite({ databasePath: path, artifactPath });
      const inspected = await inspectSqlite(artifactPath);
      result = {
        schemaVersion: inspected.schemaVersion,
        tableCounts: inspected.tableCounts,
        database: { path },
      };
    } else {
      result = await dumpPostgres({ databaseUrl, artifactPath, container });
    }

    const resolvedMediaDir = mediaDir ? resolve(mediaDir) : null;
    const manifest = await mediaManifest(resolvedMediaDir);
    await writeJsonDurably(
      join(workDirectory, "media-manifest.json"),
      manifest.entries,
    );

    const copied = Boolean(withMedia && resolvedMediaDir && !manifest.missing);
    if (copied) {
      const mediaDestination = join(workDirectory, "media");
      await mkdir(mediaDestination, { recursive: true });
      await cp(resolvedMediaDir, mediaDestination, {
        recursive: true,
        dereference: true,
      });
    }

    const info = {
      backupId: id,
      createdAt: new Date().toISOString(),
      backend,
      artifact: artifactName,
      database: result.database,
      appVersion,
      schemaVersion: result.schemaVersion,
      tableCounts: result.tableCounts,
      // PostgreSQL: the tables whose rows the dump leaves out (the service
      // re-imports them from the static data; postgres.js).
      ...(result.excludedTableData
        ? { excludedTableData: result.excludedTableData }
        : {}),
      media: {
        dir: resolvedMediaDir,
        missing: manifest.missing,
        copied,
        fileCount: manifest.entries.length,
        totalBytes: manifest.entries.reduce(
          (sum, entry) => sum + entry.bytes,
          0,
        ),
      },
    };
    await writeJsonDurably(join(workDirectory, "backup-info.json"), info);
    await rename(workDirectory, backupDirectory);
    return info;
  } catch (error) {
    await rm(workDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function requireEmptyDirectoryTarget(path, label, mode = undefined) {
  if (await pathExists(path)) {
    const entries = await readdir(path);
    if (entries.length)
      throw new Error(`Refusing a non-empty ${label} target: ${path}`);
  } else {
    mkdirSync(path, { recursive: true, mode });
  }
}

async function restoreSqliteIntoEmptyDirectory({
  backupInfo,
  backupDirectory,
  targetPath,
}) {
  // The restored database is the live one of the next service: a directory
  // it creates and the file itself are its user's alone (files.js).
  await requireEmptyDirectoryTarget(targetPath, "SQLite directory", 0o700);
  const databaseDestination = join(targetPath, "portal.sqlite");
  await copyFile(
    join(backupDirectory, backupInfo.artifact),
    databaseDestination,
  );
  await restrictToOwner(databaseDestination);
  const inspected = await inspectSqlite(databaseDestination, {
    integrity: "full",
  });
  if (inspected.integrity !== "ok")
    throw new Error(
      `Restored SQLite database failed integrity check: ${inspected.integrity}`,
    );
  return {
    tableCounts: inspected.tableCounts,
    schemaVersion: inspected.schemaVersion,
  };
}

/**
 * Restores a backup **only** into an explicitly provided, empty target:
 * a directory for SQLite, an empty database for PostgreSQL. Then
 * verifies row counts per table and the schema version against
 * `backup-info.json` and, when media is restored, every file's SHA-256
 * against `media-manifest.json`. Returns the report and the list of
 * discrepancies (empty when the restore is verified).
 */
export async function restoreRuntimeBackup({
  backupDirectory,
  targetPath = null,
  targetDatabaseUrl = null,
  withMedia = false,
  mediaDir = null,
  container,
}) {
  const backupInfo = JSON.parse(
    await readFile(join(backupDirectory, "backup-info.json"), "utf8"),
  );
  const expectedMedia = JSON.parse(
    await readFile(join(backupDirectory, "media-manifest.json"), "utf8"),
  );

  if (backupInfo.backend === "sqlite" && !targetPath)
    throw new Error("This backup is SQLite; use --target-path.");
  if (backupInfo.backend === "postgres" && !targetDatabaseUrl)
    throw new Error("This backup is PostgreSQL; use --target-database-url.");

  const { tableCounts, schemaVersion } =
    backupInfo.backend === "sqlite"
      ? await restoreSqliteIntoEmptyDirectory({
          backupInfo,
          backupDirectory,
          targetPath,
        })
      : await restorePostgresDump({
          artifactPath: join(backupDirectory, backupInfo.artifact),
          targetDatabaseUrl,
          container,
        });

  const failures = compareTableCounts(backupInfo.tableCounts, tableCounts);
  if (schemaVersion !== backupInfo.schemaVersion)
    failures.push(
      `schema version mismatch: expected ${backupInfo.schemaVersion}, got ${schemaVersion}`,
    );

  let restoredMedia = null;
  if (withMedia) {
    if (!backupInfo.media?.copied)
      throw new Error(
        "This backup did not copy media (re-run backup-runtime.mjs with --with-media).",
      );
    await requireEmptyDirectoryTarget(mediaDir, "media");
    await cp(join(backupDirectory, "media"), mediaDir, {
      recursive: true,
      dereference: true,
    });
    restoredMedia = (await mediaManifest(mediaDir)).entries;
    failures.push(...compareMediaManifests(expectedMedia, restoredMedia));
  }

  const report = {
    backupId: backupInfo.backupId,
    backend: backupInfo.backend,
    restoredAt: new Date().toISOString(),
    tableCounts,
    schemaVersion,
    media: withMedia
      ? { restored: true, fileCount: restoredMedia.length }
      : { restored: false },
    verified: failures.length === 0,
  };
  return { report, failures };
}
