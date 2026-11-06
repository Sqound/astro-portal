import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type {
  DatabaseDriver,
  QueryResult,
  RunResult,
  SqlRow,
  SqlValue,
} from "./driver.js";
import { attachTextsDatabase } from "./reimported-data.js";

type SQLiteRunResult = { changes?: number | bigint };

export interface SqliteDriverOptions {
  /**
   * How long a statement waits, asynchronously, for a lock held by another
   * connection before it fails with "database is locked".
   */
  lockWaitMs?: number;
}

/** Default wait for a lock held by another connection. A service backup
 * (persistence/backup/) copies the whole database in one step on the thread
 * pool; a write that arrives meanwhile waits for it here. */
const DEFAULT_LOCK_WAIT_MS = 15_000;

const SQLITE_BUSY = 5;

function lockedByAnotherConnection(error: unknown): boolean {
  const code = (error as { errcode?: unknown } | null)?.errcode;
  // Extended result codes (SQLITE_BUSY_RECOVERY, ...) keep SQLITE_BUSY in
  // their low byte.
  return typeof code === "number" && (code & 0xff) === SQLITE_BUSY;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );

/** SQLite's zero-config adapter. It is synchronous underneath but exposes the
 * same async boundary as PostgreSQL, so repositories never choose a backend. */
export class SqliteDriver implements DatabaseDriver {
  readonly dialect = "sqlite" as const;
  readonly #database: DatabaseSync;
  readonly #lockWaitMs: number;
  #inTransaction = false;
  // The prepared statements of the most recent SQL texts: a repository runs
  // the same few statements thousands of times (an import, a page of the
  // catalogue), and preparing each again cost more than running it.
  readonly #statements = new Map<string, StatementSync>();

  constructor(database: DatabaseSync, options: SqliteDriverOptions = {}) {
    this.#database = database;
    this.#lockWaitMs = options.lockWaitMs ?? DEFAULT_LOCK_WAIT_MS;
    this.#database.exec("PRAGMA foreign_keys = ON");
  }

  static open(
    databasePath: string,
    options: SqliteDriverOptions = {},
  ): SqliteDriver {
    if (!databasePath)
      throw new Error("ASTRO_PORTAL_DATABASE_PATH is required.");
    mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
    const database = new DatabaseSync(databasePath);
    // The catalogue texts live in a second file, attached here so that no
    // query names it (reimported-data.ts): the service's backups copy the
    // main file only.
    try {
      const attached = attachTextsDatabase(database, databasePath);
      if (attached.replaced)
        console.warn(
          `[Astro Portal] warning database.texts: the texts database could not be read; it was moved aside (${attached.replaced}) and is rebuilt from the static data.`,
        );
    } catch (error) {
      database.close();
      throw error;
    }
    return new SqliteDriver(database, options);
  }

  /**
   * Runs one synchronous statement, retrying it while another connection
   * holds the lock it needs. SQLite's own busy timeout would sleep on the
   * main thread; this waits between attempts on timers instead, so the event
   * loop keeps serving requests. A statement that fails with SQLITE_BUSY has
   * had no effect (an autocommit write is rolled back, a COMMIT leaves the
   * transaction open), so running it again is safe.
   */
  async #waitingForLocks<T>(statement: () => T): Promise<T> {
    const deadline = Date.now() + this.#lockWaitMs;
    let delay = 2;
    for (;;) {
      try {
        return statement();
      } catch (error) {
        if (!lockedByAnotherConnection(error) || Date.now() >= deadline)
          throw error;
        await pause(delay);
        delay = Math.min(delay * 2, 50);
      }
    }
  }

  /** The statement of `sql`, prepared once and kept among the last 256. */
  #prepared(sql: string): StatementSync {
    let statement = this.#statements.get(sql);
    if (statement) {
      this.#statements.delete(sql);
    } else {
      statement = this.#database.prepare(sql);
      if (this.#statements.size >= 256)
        this.#statements.delete(this.#statements.keys().next().value as string);
    }
    this.#statements.set(sql, statement);
    return statement;
  }

  async query<Row extends SqlRow = SqlRow>(
    sql: string,
    params: readonly SqlValue[] = [],
  ): Promise<QueryResult<Row>> {
    // node:sqlite returns null-prototype records. Normalising at the adapter
    // boundary keeps row semantics identical to pg and ordinary objects. The
    // records are the driver's own: they take the ordinary prototype in
    // place (copying them cost twice the query on a page of the catalogue).
    const rows = await this.#waitingForLocks(() =>
      (this.#prepared(sql).all(...params) as SqlRow[]).map(
        (row) => Object.setPrototypeOf(row, Object.prototype) as Row,
      ),
    );
    return { rows, rowCount: rows.length };
  }

  async run(sql: string, params: readonly SqlValue[] = []): Promise<RunResult> {
    const result = await this.#waitingForLocks(
      () => this.#prepared(sql).run(...params) as SQLiteRunResult,
    );
    return { rowCount: Number(result.changes || 0) };
  }

  async transaction<T>(
    fn: (transaction: DatabaseDriver) => Promise<T>,
  ): Promise<T> {
    if (this.#inTransaction)
      throw new Error("Nested database transactions are not supported.");
    this.#inTransaction = true;
    this.#database.exec("BEGIN");
    try {
      const result = await fn(this);
      await this.#waitingForLocks(() => this.#database.exec("COMMIT"));
      return result;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    } finally {
      this.#inTransaction = false;
    }
  }

  async close(): Promise<void> {
    this.#database.close();
  }
}
