#!/usr/bin/env node
// A rehearsed, scripted backup for both persistence backends. SQLite is
// snapshotted through node:sqlite's own backup API (never a file copy of a
// live database); PostgreSQL is dumped with `pg_dump` run **inside** the
// PostgreSQL container, so no host installation of the PostgreSQL client tools
// is ever assumed. Media bytes are never copied by default -- only manifested
// by relative path, size and SHA-256 -- so an ordinary backup stays small
// and fast; `--with-media` copies the tree alongside the database artifact.
//
// The backup itself lives in the portal package
// (packages/portal/src/persistence/backup/runtime.js), shared with the
// service's own startup and on-demand backups: this file only reads the
// command line.
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntimeBackup } from "portal/persistence/backup/runtime.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function nextValue(argv, index, flag) {
  const value = argv[index];
  if (value === undefined) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseArguments(argv) {
  const args = {
    out: resolve(repositoryRoot, "backups"),
    withMedia: false,
    databaseUrl: process.env.ASTRO_PORTAL_DATABASE_URL || null,
    databasePath: process.env.ASTRO_PORTAL_DATABASE_PATH || null,
    mediaDir: process.env.ASTRO_PORTAL_IMAGES_DIR || null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--out") args.out = resolve(nextValue(argv, ++index, flag));
    else if (flag === "--with-media") args.withMedia = true;
    else if (flag === "--database-url")
      args.databaseUrl = nextValue(argv, ++index, flag);
    else if (flag === "--database-path")
      args.databasePath = nextValue(argv, ++index, flag);
    else if (flag === "--media-dir")
      args.mediaDir = nextValue(argv, ++index, flag);
    else throw new Error(`Unknown or incomplete argument: ${flag}`);
  }
  if (Boolean(args.databaseUrl) === Boolean(args.databasePath))
    throw new Error(
      "Exactly one of --database-url/ASTRO_PORTAL_DATABASE_URL or --database-path/ASTRO_PORTAL_DATABASE_PATH is required.",
    );
  return args;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const packageJson = JSON.parse(
    await readFile(join(repositoryRoot, "package.json"), "utf8"),
  );
  const info = await createRuntimeBackup({
    out: args.out,
    databasePath: args.databasePath,
    databaseUrl: args.databaseUrl,
    mediaDir: args.mediaDir,
    withMedia: args.withMedia,
    appVersion: packageJson.version,
    container:
      process.env.ASTRO_PORTAL_POSTGRES_CONTAINER || "astro-dev-postgres",
  });
  process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
