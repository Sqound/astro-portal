#!/usr/bin/env node
// The counterpart of scripts/backup-runtime.mjs. Restores **only** into an
// explicitly provided, empty target -- a directory for SQLite, an empty
// database for PostgreSQL via `pg_restore` run inside the PostgreSQL container --
// and refuses anything else, so this script can never overwrite a live data
// directory or database. After restoring it verifies row counts per table
// against backup-info.json and, when media was restored, every file's
// SHA-256 against media-manifest.json; any discrepancy exits non-zero.
//
// The restore itself lives in the portal package
// (packages/portal/src/persistence/backup/runtime.js), shared with the
// service's own backups: this file only reads the command line and reports.
import { resolve } from "node:path";
import { restoreRuntimeBackup } from "portal/persistence/backup/runtime.js";

const containerNamePattern = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

function nextValue(argv, index, flag) {
  const value = argv[index];
  if (value === undefined) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseArguments(argv) {
  const args = {
    backup: null,
    targetPath: null,
    targetDatabaseUrl: null,
    withMedia: false,
    mediaDir: null,
    container:
      process.env.ASTRO_PORTAL_POSTGRES_CONTAINER || "astro-dev-postgres",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--backup")
      args.backup = resolve(nextValue(argv, ++index, flag));
    else if (flag === "--target-path")
      args.targetPath = resolve(nextValue(argv, ++index, flag));
    else if (flag === "--target-database-url")
      args.targetDatabaseUrl = nextValue(argv, ++index, flag);
    else if (flag === "--with-media") args.withMedia = true;
    else if (flag === "--media-dir")
      args.mediaDir = resolve(nextValue(argv, ++index, flag));
    else if (flag === "--container")
      args.container = nextValue(argv, ++index, flag);
    else throw new Error(`Unknown or incomplete argument: ${flag}`);
  }
  if (!args.backup) throw new Error("--backup <directory> is required.");
  if (Boolean(args.targetPath) === Boolean(args.targetDatabaseUrl))
    throw new Error(
      "Exactly one of --target-path (SQLite) or --target-database-url (PostgreSQL) is required.",
    );
  if (args.withMedia && !args.mediaDir)
    throw new Error("--with-media requires --media-dir <directory>.");
  if (!containerNamePattern.test(args.container))
    throw new Error(`Not a safe container name: ${args.container}`);
  return args;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const { report, failures } = await restoreRuntimeBackup({
    backupDirectory: args.backup,
    targetPath: args.targetPath,
    targetDatabaseUrl: args.targetDatabaseUrl,
    withMedia: args.withMedia,
    mediaDir: args.mediaDir,
    container: args.container,
  });
  if (failures.length) {
    console.error("Restore verification failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
