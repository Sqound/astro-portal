import { Pool, type PoolClient, type PoolConfig } from "pg";
import type {
  DatabaseDriver,
  QueryResult,
  RunResult,
  SqlRow,
  SqlValue,
} from "./driver.js";

type PostgresExecutor = Pool | PoolClient;

/**
 * Rewrites only real `?` placeholders. SQL strings, quoted identifiers,
 * comments and dollar-quoted bodies are copied exactly, which keeps the
 * repository SQL portable while avoiding positional-parameter ambiguity.
 */
export function postgresPlaceholders(sql: string): string {
  let output = "";
  let index = 0;
  let parameter = 0;
  let state: "normal" | "single" | "double" | "line" | "block" | "dollar" =
    "normal";
  let dollarTag = "";

  while (index < sql.length) {
    const character = sql[index] || "";
    const next = sql[index + 1] || "";

    if (state === "normal") {
      if (character === "?") {
        output += `$${++parameter}`;
        index += 1;
      } else if (character === "'") {
        state = "single";
        output += character;
        index += 1;
      } else if (character === '"') {
        state = "double";
        output += character;
        index += 1;
      } else if (character === "-" && next === "-") {
        state = "line";
        output += "--";
        index += 2;
      } else if (character === "/" && next === "*") {
        state = "block";
        output += "/*";
        index += 2;
      } else if (character === "$") {
        const match = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(index));
        if (match) {
          dollarTag = match[0];
          state = "dollar";
          output += dollarTag;
          index += dollarTag.length;
        } else {
          output += character;
          index += 1;
        }
      } else {
        output += character;
        index += 1;
      }
      continue;
    }

    if (state === "single") {
      output += character;
      index += 1;
      if (character === "'" && sql[index] === "'") {
        output += "'";
        index += 1;
      } else if (character === "'") state = "normal";
      continue;
    }

    if (state === "double") {
      output += character;
      index += 1;
      if (character === '"' && sql[index] === '"') {
        output += '"';
        index += 1;
      } else if (character === '"') state = "normal";
      continue;
    }

    if (state === "line") {
      output += character;
      index += 1;
      if (character === "\n") state = "normal";
      continue;
    }

    if (state === "block") {
      output += character;
      index += 1;
      if (character === "*" && sql[index] === "/") {
        output += "/";
        index += 1;
        state = "normal";
      }
      continue;
    }

    if (sql.startsWith(dollarTag, index)) {
      output += dollarTag;
      index += dollarTag.length;
      state = "normal";
    } else {
      output += character;
      index += 1;
    }
  }
  return output;
}

/**
 * The pool's settings. Several processes may share one server (which accepts a limited number
 * of connections), so each process keeps a small pool:
 * ASTRO_PORTAL_DATABASE_POOL_MAX connections (default 10), plus the one the
 * change bus listens on. A request waits at most
 * ASTRO_PORTAL_DATABASE_CONNECT_TIMEOUT_MS (default 10 s) for a connection
 * instead of forever.
 */
export function postgresPoolOptions(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env,
): PoolConfig {
  const integer = (
    value: string | undefined,
    fallback: number,
    min: number,
  ) => {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
  };
  return {
    connectionString,
    max: integer(env.ASTRO_PORTAL_DATABASE_POOL_MAX, 10, 1),
    connectionTimeoutMillis: integer(
      env.ASTRO_PORTAL_DATABASE_CONNECT_TIMEOUT_MS,
      10_000,
      0,
    ),
    idleTimeoutMillis: 30_000,
  };
}

export class PostgresDriver implements DatabaseDriver {
  readonly dialect = "postgres" as const;
  readonly #executor: PostgresExecutor;
  readonly #pool: Pool | null;
  #inTransaction = false;

  private constructor(executor: PostgresExecutor, pool: Pool | null) {
    this.#executor = executor;
    this.#pool = pool;
  }

  static open(
    databaseUrl: string,
    env: NodeJS.ProcessEnv = process.env,
  ): PostgresDriver {
    if (!databaseUrl) throw new Error("ASTRO_PORTAL_DATABASE_URL is required.");
    const pool = new Pool(postgresPoolOptions(databaseUrl, env));
    // An idle client that loses its connection (a maintenance restart of the
    // server, a failover, a network cut) emits "error" on the pool; without a
    // listener Node turns it into an uncaught exception and the process dies.
    // The client is already removed from the pool: say it, and go on.
    pool.on("error", (error) => {
      console.warn(
        `database.pool: an idle connection was lost (${error.message}); the pool opens a new one when needed`,
      );
    });
    return new PostgresDriver(pool, pool);
  }

  async query<Row extends SqlRow = SqlRow>(
    sql: string,
    params: readonly SqlValue[] = [],
  ): Promise<QueryResult<Row>> {
    const result = await this.#executor.query(postgresPlaceholders(sql), [
      ...params,
    ]);
    const rows = (result.rows as SqlRow[]).map((row) => ({ ...row }) as Row);
    return { rows, rowCount: result.rowCount ?? rows.length };
  }

  async run(sql: string, params: readonly SqlValue[] = []): Promise<RunResult> {
    const result = await this.#executor.query(postgresPlaceholders(sql), [
      ...params,
    ]);
    return { rowCount: result.rowCount ?? 0 };
  }

  async transaction<T>(
    fn: (transaction: DatabaseDriver) => Promise<T>,
  ): Promise<T> {
    if (this.#inTransaction || !this.#pool)
      throw new Error("Nested database transactions are not supported.");
    const client = await this.#pool.connect();
    const transaction = new PostgresDriver(client, null);
    transaction.#inTransaction = true;
    try {
      await client.query("BEGIN");
      const result = await fn(transaction);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      transaction.#inTransaction = false;
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.#pool) await this.#pool.end();
  }
}
