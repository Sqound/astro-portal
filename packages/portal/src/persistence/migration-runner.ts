import type { DatabaseDriver, SqlRow } from "./driver.js";
import { composedMigrations } from "./migration-registry.js";
import { statementsFor, type Migration } from "./migrations.js";

export type PersistenceDialect = "postgres" | "sqlite";

export function individualStatements(sql: string): string[] {
  // The approved legacy DDL contains no semicolons in quoted values. Keeping
  // splitting here, rather than relying on a driver's multi-statement mode,
  // gives SQLite and PostgreSQL identical transaction/error boundaries.
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

/** `[1, 2, 3, 5, 7, 8]` → `1–3, 5, 7–8`: the versions a code knows, short. */
export function formatMigrationVersions(versions: readonly number[]): string {
  const sorted = [...new Set(versions)].sort((left, right) => left - right);
  const parts: string[] = [];
  for (let index = 0; index < sorted.length;) {
    const start = sorted[index] as number;
    let end = start;
    while (sorted[index + 1] === end + 1) {
      end += 1;
      index += 1;
    }
    parts.push(start === end ? `${start}` : `${start}–${end}`);
    index += 1;
  }
  return parts.length ? parts.join(", ") : "none";
}

/** The versions recorded in a database that `definitions` does not know. */
export function unknownMigrationVersions(
  applied: readonly number[],
  definitions: readonly Migration[] = composedMigrations(),
): number[] {
  const known = new Set(definitions.map((migration) => migration.version));
  return [...new Set(applied)]
    .filter((version) => !known.has(version))
    .sort((left, right) => left - right);
}

/**
 * A database migrated by a newer version of the code: it records migrations
 * this code does not know. Running on it could corrupt what the newer
 * version wrote, so nothing is applied and the caller must not use it.
 */
export class DatabaseAheadOfCodeError extends Error {
  readonly code = "database_ahead_of_code";
  readonly unknownVersions: number[];
  readonly knownVersions: number[];

  constructor(unknownVersions: number[], knownVersions: number[]) {
    super(
      `The database records migration(s) ${unknownVersions.join(", ")} that this code does not know ` +
        `(it knows ${formatMigrationVersions(knownVersions)}): a newer version migrated it, ` +
        "and this code refuses to use it.",
    );
    this.name = "DatabaseAheadOfCodeError";
    this.unknownVersions = unknownVersions;
    this.knownVersions = knownVersions;
  }
}

/**
 * The broken references `PRAGMA foreign_key_check` reports, counted by
 * table, parent table and constraint. Row ids are left out on purpose: a
 * rebuilt table gets new ones, and a row already orphaned before must not
 * look new after.
 */
async function brokenReferences(
  transaction: DatabaseDriver,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const row of (
    await transaction.query<SqlRow>("PRAGMA foreign_key_check")
  ).rows) {
    const key = `${String(row.table)}\u0000${String(row.parent)}\u0000${String(row.fkid)}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/** How many references `after` breaks that `before` did not. */
function newlyBroken(
  before: Map<string, number>,
  after: Map<string, number>,
): number {
  let added = 0;
  for (const [key, total] of after)
    added += Math.max(0, total - (before.get(key) || 0));
  return added;
}

/**
 * The key of the PostgreSQL advisory lock the migrations take (any constant
 * shared by every runner of the code): the repositories migrate lazily, and
 * several of them open at once on a service's first start (the error
 * « duplicate key value violates unique constraint
 * "schema_migrations_pkey" »). SQLite needs none: its writes are serialised
 * and the startup maintenance migrates it before anything else opens it.
 */
const POSTGRES_MIGRATION_LOCK = 4_245_001;

async function lockMigrations(
  transaction: DatabaseDriver,
  dialect: PersistenceDialect,
): Promise<void> {
  if (dialect === "postgres")
    await transaction.run("SELECT pg_advisory_xact_lock(?)", [
      POSTGRES_MIGRATION_LOCK,
    ]);
}

export async function applyMigrations(
  driver: DatabaseDriver,
  dialect: PersistenceDialect,
  definitions: readonly Migration[] = composedMigrations(),
): Promise<void> {
  // SQLite has one driver and one transaction slot per process: a repository
  // opened lazily while another transaction is running (the target catalogue
  // written at start, in slices that hand the event loop back, and the first
  // request that opens another repository) used to fail here with « Nested
  // database transactions are not supported » for a table that already
  // existed. The table is only created, in a transaction, when it is not
  // there.
  const hasMigrationTable =
    dialect === "sqlite" &&
    (
      await driver.query<SqlRow>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
      )
    ).rows.length > 0;
  // Two runners creating the table at once collide on PostgreSQL even with
  // `IF NOT EXISTS`: the creation waits for the lock.
  if (!hasMigrationTable)
    await driver.transaction(async (transaction) => {
      await lockMigrations(transaction, dialect);
      await transaction.run(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
      );
    });
  const recorded = (
    await driver.query<SqlRow>(
      "SELECT version FROM schema_migrations ORDER BY version",
    )
  ).rows.map((row) => Number(row.version));
  // The service refuses such a database at startup already
  // (persistence/backup/startup.js); this check covers every other caller
  // (the repositories migrate lazily, scripts, the entitlements service).
  const unknown = unknownMigrationVersions(recorded, definitions);
  if (unknown.length)
    throw new DatabaseAheadOfCodeError(
      unknown,
      definitions.map((migration) => migration.version),
    );
  const applied = new Set(recorded);
  for (const migration of definitions) {
    if (applied.has(migration.version)) continue;
    // SQLite ignores `PRAGMA foreign_keys` inside a transaction, and with
    // them on, dropping a referenced table fails. Its documented procedure
    // for rebuilding a table: foreign keys off before the transaction,
    // `foreign_key_check` before the commit, foreign keys back on after.
    // The check covers the whole database, so it is taken before and after
    // the rebuild: only a reference the rebuild itself breaks stops it, not
    // a row orphaned long before in some other table.
    const rebuild =
      dialect === "sqlite" && migration.sqliteRebuildsReferencedTable === true;
    if (rebuild) await driver.run("PRAGMA foreign_keys = OFF");
    try {
      await driver.transaction(async (transaction) => {
        // Another runner may have applied it while this one waited for the
        // lock: it is then left as it is.
        if (dialect === "postgres") {
          await lockMigrations(transaction, dialect);
          const done = await transaction.query<SqlRow>(
            "SELECT version FROM schema_migrations WHERE version = ?",
            [migration.version],
          );
          if (done.rows.length) return;
        }
        const before = rebuild ? await brokenReferences(transaction) : null;
        for (const source of statementsFor(migration, dialect))
          for (const statement of individualStatements(source))
            await transaction.run(statement);
        if (before) {
          const broken = newlyBroken(
            before,
            await brokenReferences(transaction),
          );
          if (broken)
            throw new Error(
              `Migration ${migration.version} would break ${broken} foreign key reference(s); nothing was changed.`,
            );
        }
        await transaction.run(
          "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
          [migration.version, migration.name, new Date().toISOString()],
        );
      });
    } finally {
      if (rebuild) await driver.run("PRAGMA foreign_keys = ON");
    }
  }
}
