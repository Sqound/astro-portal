import { renameSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

// What the service re-imports from the static-data package does not belong
// in its backups. The catalogue texts (`target_texts`, most of the database's
// weight) and the record of the shards they came from
// (`target_text_shards`) are rebuilt from `target-library/texts/` whenever
// they are missing; a backup that copied them could outlast a platform's
// startup probe.
//
// Under SQLite they live in a second database file next to the main one,
// attached to every connection of the driver under the schema name `texts`.
// SQLite resolves an unqualified table name in `main` first, then in the
// attached databases, so no query names the schema. The service's backups
// copy the main file only (SQLite's backup API copies one database); a
// missing or unreadable texts file is created again, empty, and the import
// of the shards fills it (`target_text_shards` empty: every shard is read).
//
// Under PostgreSQL the tables stay in the one database; a dump made by the
// backup scripts leaves their rows out (`pg_dump --exclude-table-data`,
// backup/postgres.js) and keeps their definition, so a restore is unchanged
// and the service imports the texts again.

/** The schema name of the attached texts database (SQLite only). */
export const TEXTS_SCHEMA = "texts";

/** The tables whose rows the service re-imports from the static data. */
export const REIMPORTED_TABLES: readonly string[] = Object.freeze([
  "target_texts",
  "target_text_shards",
]);

/**
 * The texts database of a SQLite database: `<dir>/<name>.texts.sqlite` for
 * `<dir>/<name>.sqlite` (also for `.sqlite3` and `.db`), `<path>.texts.sqlite`
 * otherwise; `:memory:` for an in-memory database.
 */
export function textsDatabasePath(databasePath: string): string {
  if (databasePath === ":memory:") return ":memory:";
  const name = basename(databasePath).replace(/\.(sqlite3?|db)$/i, "");
  return join(dirname(databasePath), `${name}.texts.sqlite`);
}

// The definitions of migration 92 (`target-texts`), in the attached schema.
// A later migration that changes one of these tables changes it here too
// (and in the attached database of an existing service, explicitly:
// `ALTER TABLE texts.target_texts …`).
const TEXTS_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS ${TEXTS_SCHEMA}.target_texts (
    target_id TEXT NOT NULL,
    locale TEXT NOT NULL,
    shard TEXT NOT NULL,
    tier TEXT NOT NULL,
    revision TEXT NOT NULL,
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (target_id, locale)
  )`,
  `CREATE INDEX IF NOT EXISTS ${TEXTS_SCHEMA}.target_texts_shard_idx
    ON target_texts(locale, shard)`,
  `CREATE INDEX IF NOT EXISTS ${TEXTS_SCHEMA}.target_texts_tier_idx
    ON target_texts(locale, tier)`,
  `CREATE TABLE IF NOT EXISTS ${TEXTS_SCHEMA}.target_text_shards (
    locale TEXT NOT NULL,
    shard TEXT NOT NULL,
    revision TEXT NOT NULL,
    targets INTEGER NOT NULL,
    imported_at TEXT NOT NULL,
    PRIMARY KEY (locale, shard)
  )`,
];

function attachAndDefine(database: DatabaseSync, path: string): void {
  database.prepare(`ATTACH DATABASE ? AS ${TEXTS_SCHEMA}`).run(path);
  try {
    for (const statement of TEXTS_SCHEMA_STATEMENTS) database.exec(statement);
  } catch (error) {
    database.exec(`DETACH DATABASE ${TEXTS_SCHEMA}`);
    throw error;
  }
}

const SQLITE_CORRUPT = 11;
const SQLITE_NOTADB = 26;

/** A file SQLite cannot read as a database; never a lock or a permission. */
function unusableFile(error: unknown): boolean {
  const code = (error as { errcode?: unknown } | null)?.errcode;
  return (
    typeof code === "number" &&
    [SQLITE_CORRUPT, SQLITE_NOTADB].includes(code & 0xff)
  );
}

/**
 * Attaches the texts database of `databasePath` to `database` and creates its
 * tables when they are missing. A file SQLite cannot use (damaged, not a
 * database) is moved aside as `<file>.unreadable-<time>` and a new one is
 * created: its rows are re-imported, never lost. Returns what was done, for
 * the caller's log.
 */
export function attachTextsDatabase(
  database: DatabaseSync,
  databasePath: string,
  now: () => Date = () => new Date(),
): { path: string; replaced: string | null } {
  const path = textsDatabasePath(databasePath);
  try {
    attachAndDefine(database, path);
    return { path, replaced: null };
  } catch (error) {
    if (path === ":memory:" || !unusableFile(error)) throw error;
    const aside = `${path}.unreadable-${now().toISOString().replace(/[:.]/g, "-")}`;
    try {
      renameSync(path, aside);
    } catch {
      throw error;
    }
    attachAndDefine(database, path);
    return { path, replaced: aside };
  }
}
