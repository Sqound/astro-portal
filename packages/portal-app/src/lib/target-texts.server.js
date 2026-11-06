import { readFile as readFileOf, stat } from "node:fs/promises";
import { join } from "node:path";
import { staticDataDir } from "./config.server.js";
import { yieldToEventLoop } from "./cooperative.server.js";
import {
  assertTargetTextShard,
  assertTargetTextsIndex,
  targetTextSha256,
  targetTextsFolder,
  targetTextsIndexShards,
} from "./target-text-shards.js";

// The published pages of tier C live in the static-data package as shards
// (`target-library/texts/`, `target-text-shards.js`) and in the
// `target_texts` table of the database. This is the import from the one to
// the other, and the bookkeeping that keeps it from running more than needed.
//
// The memory bound: a shard file is about a megabyte; the import reads one,
// writes its rows, lets it go and hands the event loop back before the next.
// Nothing here ever holds two shards, and a shard whose digest the database
// already records is not read at all.

/** The folder of the shards of a static-data package. */
export const targetTextsDirectory = (directory = staticDataDir) =>
  join(directory, "target-library", targetTextsFolder);

/**
 * The import's lines, in the app's log format on stderr: one per shard
 * imported (language, shard, rows written, kept and retired, milliseconds),
 * one at the end (shards and rows, duration), one per failure (the next try
 * comes after `retryAfterMs`), one when another process imports.
 */
export const targetTextsLog = {
  info: (line) =>
    console.error(`[Astro Portal] info target-library.texts: ${line}`),
  warn: (line) =>
    console.error(`[Astro Portal] warning target-library.texts: ${line}`),
};

/**
 * Brings the database's `target_texts` in step with the shards of
 * `directory`: reads the index, imports every shard whose digest differs from
 * the recorded one (one at a time), forgets the shards the index no longer
 * lists. `readFile` is the seam the tests count reads through, `log` the one
 * they read the lines through.
 *
 * Returns `{ imported, unchanged, retired, failed, rows, skipped }`: counts of
 * shards, `failed` the `{ shard, reason }` of those that could not be
 * imported (the next run tries them again), `skipped` true when another
 * process sharing the database (on PostgreSQL) holds the import:
 * this one reads what that one writes. A package without an index has no
 * shards: nothing is imported and nothing retired. `tiers` (an array) keeps
 * the rows of those tiers only.
 */
export async function importTargetTexts({
  repository,
  directory = targetTextsDirectory(),
  readFile = readFileOf,
  tiers = null,
  log = targetTextsLog,
} = {}) {
  const result = {
    imported: 0,
    unchanged: 0,
    retired: 0,
    failed: [],
    rows: { written: 0, kept: 0, retired: 0 },
    skipped: false,
  };
  let index;
  try {
    index = assertTargetTextsIndex(
      JSON.parse(await readFile(join(directory, "index.json"), "utf8")),
    );
  } catch (error) {
    if (error.code === "ENOENT") return result;
    result.failed.push({ shard: "index", reason: error.message });
    return result;
  }
  const started = Date.now();
  const run = async () => {
    const recorded = await repository.textShardRevisions();
    for (const item of targetTextsIndexShards(index)) {
      const key = `${item.locale}/${item.shard}`;
      if (recorded.get(key) === item.revision) {
        result.unchanged += 1;
        continue;
      }
      const shardStarted = Date.now();
      try {
        const bytes = await readFile(join(directory, item.path));
        // The index and the file are written one after the other: a shard
        // that is not the one the index describes (its SHA-256) is left for
        // the next run.
        if (targetTextSha256(bytes) !== item.sha256)
          throw new Error("the file is not the one the index describes");
        const shard = assertTargetTextShard(
          JSON.parse(bytes.toString("utf8")),
          { locale: item.locale, shard: item.shard },
        );
        const counts = await repository.importTextShard({
          locale: item.locale,
          shard: item.shard,
          revision: item.revision,
          // A tool that needs some tiers only (the offline-pack builder:
          // A and B) keeps the others out of its database.
          entries: tiers
            ? shard.entries.filter((entry) => tiers.includes(entry.tier))
            : shard.entries,
        });
        for (const [name, count] of Object.entries(counts))
          result.rows[name] += count;
        result.imported += 1;
        log.info(
          `shard ${key}: ${counts.written} rows written, ${counts.kept} kept, ${counts.retired} retired in ${Date.now() - shardStarted} ms`,
        );
      } catch (error) {
        result.failed.push({ shard: key, reason: error.message });
        log.warn(`shard ${key} not imported: ${error.message}`);
      }
      await yieldToEventLoop();
    }
    result.retired = await repository.retireTextShards(
      new Set(
        targetTextsIndexShards(index).map(
          (item) => `${item.locale}/${item.shard}`,
        ),
      ),
    );
  };
  const locked = repository.withTextsImportLock
    ? await repository.withTextsImportLock(run)
    : { skipped: false, value: await run() };
  if (locked.skipped) {
    result.skipped = true;
    log.info(
      "another process sharing the database imports the shards; this one reads its rows",
    );
    return result;
  }
  if (result.imported || result.retired || result.failed.length)
    log[result.failed.length ? "warn" : "info"](
      `${result.imported} shards imported (${result.rows.written} rows written, ${result.rows.kept} kept, ${result.rows.retired} retired), ${result.unchanged} unchanged, ${result.retired} retired, ${result.failed.length} failed, in ${Date.now() - started} ms`,
    );
  return result;
}

// What the service remembers between two catalogue reads: the identity of the
// index it last imported (path, size, modification time, inode: the index is
// only ever replaced by an atomic rename, like the seed), the import in
// progress, and when the last one failed, so that a broken package is not read
// again by every request.
let imported = null;
let importing = null;
let failedAt = 0;
const retryAfterMs = 60_000;

async function indexIdentity(directory) {
  try {
    const metadata = await stat(join(directory, "index.json"));
    return [directory, metadata.size, metadata.mtimeMs, metadata.ino].join(":");
  } catch {
    return null;
  }
}

/**
 * Imports the shards when the package's index is not the one last imported
 * (a new process, or a loader that ran). Does nothing, cheaply (one `stat`),
 * otherwise. Returns the import in progress, or `null` when there is nothing
 * to do; the catalogue reads do not wait for it, the tests and the
 * administration do. Failures are recorded in the result, never thrown, and
 * tried again after `retryAfterMs`; so is an import another process holds.
 */
export function synchronizeTargetTexts({
  repository,
  directory = targetTextsDirectory(),
  readFile,
  force = false,
  tiers = null,
  log = targetTextsLog,
} = {}) {
  if (!repository) return null;
  if (importing) return importing;
  importing = (async () => {
    const identity = await indexIdentity(directory);
    if (!force && identity === imported) return null;
    if (!force && Date.now() - failedAt < retryAfterMs) return null;
    let result;
    try {
      result = await importTargetTexts({
        repository,
        directory,
        readFile,
        tiers,
        log,
      });
    } catch (error) {
      result = {
        imported: 0,
        unchanged: 0,
        retired: 0,
        failed: [{ shard: "import", reason: error.message }],
      };
    }
    if (result.failed.length) {
      failedAt = Date.now();
      log.warn(
        `${result.failed.length} shard(s) not imported; next try in ${retryAfterMs / 1000} s`,
      );
    } else if (result.skipped)
      // The process that imports may stop halfway: looked at again later.
      failedAt = Date.now();
    else {
      failedAt = 0;
      imported = identity;
    }
    return result;
  })().finally(() => {
    importing = null;
  });
  return importing;
}

/** Forgets what was imported (a test seam). */
export function forgetImportedTargetTexts() {
  imported = null;
  failedAt = 0;
}
