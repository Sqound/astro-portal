// Restoring the service without a shell: the operator drops
// `restore-request.json` into the backup directory, naming the
// backup to restore, and restarts the service. At startup, before any
// migration, the service:
//   1. claims the request by renaming it `restore-request.<time>.processing.json`
//      (a request is therefore never seen twice, even if the process dies);
//   2. verifies the backup: identifier, backup-info.json, snapshot size and
//      checksum, SQLite's full integrity check, row counts and schema version,
//      and that this code knows every migration the snapshot records (a
//      backup taken by a newer version is refused: this code would not
//      start on it);
//   3. backs up the current state first (a `pre-restore` backup, always kept);
//   4. writes the snapshot over the live database through SQLite's backup
//      API, then verifies the result (and puts the previous state back if it
//      does not verify);
//   5. renames the request `….done.json` or `….refused.json`, with the
//      outcome written inside.
// A refused request leaves the database exactly as it was.
import { mkdir, readdir, readFile, rename, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  formatMigrationVersions,
  unknownMigrationVersions,
} from "../migration-runner.js";
import { composedMigrations } from "../migration-registry.js";
import {
  pathExists,
  sha256File,
  timestampForName,
  writeJsonDurably,
} from "./files.js";
import { takeServiceBackup } from "./service.js";
import {
  compareTableCounts,
  inspectSqlite,
  restoreSqliteInto,
} from "./sqlite.js";

export const RESTORE_REQUEST_FILE = "restore-request.json";
const backupIdPattern = /^[0-9A-Za-z][0-9A-Za-z._+-]*$/;
const recordPattern = /^restore-request\.(.+)\.(done|refused)\.json$/;

class Refusal extends Error {}

/**
 * A `….processing.json` file at startup means the process stopped in the
 * middle of a restore. SQLite's backup API writes the target in one
 * transaction, so the database is either the old one or the restored one;
 * the request is renamed `….interrupted.json` and never replayed: the
 * operator looks at the database and decides.
 */
export async function reportInterruptedRestores({ backupDirectory, log }) {
  let names;
  try {
    names = await readdir(backupDirectory);
  } catch {
    return [];
  }
  const interrupted = [];
  for (const name of names) {
    if (!/^restore-request\..+\.processing\.json$/.test(name)) continue;
    const renamed = name.replace(/\.processing\.json$/, ".interrupted.json");
    await rename(join(backupDirectory, name), join(backupDirectory, renamed));
    interrupted.push(renamed);
    log.error(
      "restore.request",
      `A previous restore was interrupted before it finished (${renamed}); it is not replayed. Check the database, then deposit a new request if needed.`,
    );
  }
  return interrupted;
}

async function alreadyProcessed(backupDirectory, requestId) {
  for (const name of await readdir(backupDirectory)) {
    const match = recordPattern.exec(name);
    if (!match || match[2] !== "done") continue;
    try {
      const record = JSON.parse(
        await readFile(join(backupDirectory, name), "utf8"),
      );
      if (record.requestId === requestId) return record;
    } catch {
      // An unreadable record cannot match.
    }
  }
  return null;
}

async function verifiedBackup(settings, request) {
  const backupId = request?.backupId;
  if (
    typeof backupId !== "string" ||
    !backupIdPattern.test(backupId) ||
    backupId.includes("..")
  )
    throw new Refusal(
      `"${String(backupId)}" is not a backup identifier (a directory name of the backup directory)`,
    );
  const directory = join(settings.backupDirectory, backupId);
  if (!(await stat(directory).catch(() => null))?.isDirectory())
    throw new Refusal(`backup not found: ${backupId}`);
  let info;
  try {
    info = JSON.parse(
      await readFile(join(directory, "backup-info.json"), "utf8"),
    );
  } catch {
    throw new Refusal(
      `backup ${backupId}: backup-info.json is missing or unreadable`,
    );
  }
  if (info.backend !== "sqlite")
    throw new Refusal(
      `backup ${backupId} is a ${info.backend} backup, not a SQLite one`,
    );
  const artifact = String(info.artifact || "");
  if (!/^[^/\\]+$/.test(artifact) || artifact.startsWith("."))
    throw new Refusal(`backup ${backupId}: backup-info.json names no snapshot`);
  const artifactPath = join(directory, artifact);
  const artifactStat = await stat(artifactPath).catch(() => null);
  if (!artifactStat?.isFile())
    throw new Refusal(`backup ${backupId}: the database snapshot is missing`);
  if (
    typeof info.artifactBytes === "number" &&
    artifactStat.size !== info.artifactBytes
  )
    throw new Refusal(
      `backup ${backupId}: the snapshot has ${artifactStat.size} bytes, backup-info.json records ${info.artifactBytes}`,
    );
  if (
    typeof info.artifactSha256 === "string" &&
    (await sha256File(artifactPath)) !== info.artifactSha256
  )
    throw new Refusal(
      `backup ${backupId}: the snapshot's checksum differs from backup-info.json`,
    );
  const inspected = await inspectSqlite(artifactPath, { integrity: "full" });
  if (inspected.integrity !== "ok")
    throw new Refusal(
      `backup ${backupId}: the snapshot fails SQLite's integrity check (${inspected.integrity})`,
    );
  const differences = compareTableCounts(
    info.tableCounts,
    inspected.tableCounts,
  );
  if (inspected.schemaVersion !== (info.schemaVersion ?? null))
    differences.push(
      `schema version ${inspected.schemaVersion}, backup-info.json records ${info.schemaVersion}`,
    );
  if (differences.length)
    throw new Refusal(
      `backup ${backupId} does not match its backup-info.json: ${differences.join("; ")}`,
    );
  // A backup taken by a newer version: once restored, this code would
  // refuse to start on it (startup.js), so it is refused here, before
  // anything is written.
  const unknown = unknownMigrationVersions(inspected.appliedVersions ?? []);
  if (unknown.length)
    throw new Refusal(
      `backup ${backupId} records migration(s) ${unknown.join(", ")} that this code does not know ` +
        `(it knows ${formatMigrationVersions(composedMigrations().map((migration) => migration.version))}): ` +
        "restore it with the image that took it, or choose an older backup",
    );
  return { backupId, artifactPath, info };
}

async function verifyLiveDatabase(databasePath, info) {
  const inspected = await inspectSqlite(databasePath, { integrity: "full" });
  const problems =
    inspected.integrity === "ok"
      ? compareTableCounts(info.tableCounts, inspected.tableCounts)
      : [`integrity check: ${inspected.integrity}`];
  if (inspected.schemaVersion !== (info.schemaVersion ?? null))
    problems.push(`schema version ${inspected.schemaVersion}`);
  return problems;
}

/**
 * Processes `restore-request.json` if there is one. Returns null without a
 * request, `{ status: "done", … }` or `{ status: "refused", reason }`.
 */
export async function processRestoreRequest({
  settings,
  appVersion,
  appBuild = null,
  log,
  now = new Date(),
}) {
  const directory = settings.backupDirectory;
  const requestPath = join(directory, RESTORE_REQUEST_FILE);
  if (!(await pathExists(requestPath))) return null;
  const stamp = timestampForName(now);
  const processingPath = join(
    directory,
    `restore-request.${stamp}.processing.json`,
  );
  try {
    await rename(requestPath, processingPath);
  } catch (error) {
    const reason = `the request could not be claimed (${error.message}); it was not applied`;
    log.error("restore.request", `Restore request refused: ${reason}.`);
    return { status: "refused", reason };
  }

  let request = null;
  const settle = async (status, fields) => {
    const record = {
      ...(request && typeof request === "object" ? request : {}),
      status,
      processedAt: new Date().toISOString(),
      ...fields,
    };
    await writeJsonDurably(processingPath, record);
    await rename(
      processingPath,
      join(directory, `restore-request.${stamp}.${status}.json`),
    );
    return record;
  };

  let preRestore = null;
  let restoredOver = false;
  try {
    try {
      request = JSON.parse(await readFile(processingPath, "utf8"));
    } catch {
      throw new Refusal("the request is not valid JSON");
    }
    if (!request || typeof request !== "object" || Array.isArray(request))
      throw new Refusal('the request must be a JSON object: {"backupId": "…"}');
    if (
      request.requestId !== undefined &&
      (typeof request.requestId !== "string" || request.requestId.length > 200)
    )
      throw new Refusal("requestId must be a short string");
    if (typeof request.requestId === "string") {
      const earlier = await alreadyProcessed(directory, request.requestId);
      if (earlier)
        throw new Refusal(
          `request "${request.requestId}" was already processed on ${earlier.processedAt}`,
        );
    }
    const backup = await verifiedBackup(settings, request);

    const liveStat = await stat(settings.databasePath).catch(() => null);
    if (liveStat?.size) {
      try {
        preRestore = await takeServiceBackup({
          settings,
          kind: "pre-restore",
          appVersion,
          appBuild,
        });
      } catch (error) {
        throw new Refusal(
          `the current state could not be backed up first (${error.message})`,
        );
      }
    }

    await mkdir(dirname(settings.databasePath), { recursive: true });
    restoredOver = true;
    await restoreSqliteInto({
      sourcePath: backup.artifactPath,
      targetPath: settings.databasePath,
    });
    const problems = await verifyLiveDatabase(
      settings.databasePath,
      backup.info,
    );
    if (problems.length) {
      throw new Refusal(
        `the restored database did not verify (${problems.join("; ")})`,
      );
    }

    const record = await settle("done", {
      result: {
        restoredBackupId: backup.backupId,
        preRestoreBackupId: preRestore?.id ?? null,
        schemaVersion: backup.info.schemaVersion ?? null,
        tableCounts: backup.info.tableCounts ?? null,
      },
    });
    log.info(
      "restore.request",
      `Restored backup ${backup.backupId} (schema ${backup.info.schemaVersion}); ` +
        (preRestore
          ? `the state it replaced is kept as backup ${preRestore.id}.`
          : "there was no previous database."),
    );
    return {
      status: "done",
      backupId: backup.backupId,
      preRestoreBackupId: preRestore?.id ?? null,
      record,
    };
  } catch (error) {
    let reason =
      error instanceof Refusal
        ? error.message
        : `unexpected error: ${error.message}`;
    if (restoredOver && preRestore) {
      try {
        await restoreSqliteInto({
          sourcePath: join(preRestore.directory, "portal.sqlite"),
          targetPath: settings.databasePath,
        });
        reason += `; the previous state was put back from backup ${preRestore.id}`;
      } catch (rollbackError) {
        reason += `; putting the previous state back from backup ${preRestore.id} failed too (${rollbackError.message})`;
      }
    }
    log.error(
      "restore.request",
      `Restore request refused: ${reason}. The service starts on its unchanged database.`,
    );
    try {
      await settle("refused", { reason });
    } catch (settleError) {
      log.error(
        "restore.request",
        `The refused request could not be renamed (${settleError.message}).`,
      );
    }
    return { status: "refused", reason };
  }
}
