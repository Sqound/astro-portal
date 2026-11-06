// Read-only access to the database an export reads: a SQLite file, opened
// read-only, or a PostgreSQL database whose connections refuse every write.
// It never migrates and never writes, so the source is exactly as it was
// afterwards; a table or a column an older schema does not have is simply
// absent, never an error.
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { PostgresDriver } from "portal/persistence/postgres-driver.js";

export const isPostgresUrl = (value) =>
  /^postgres(?:ql)?:\/\//i.test(String(value));

function readOnlyPostgresUrl(url) {
  const parsed = new URL(url);
  const existing = parsed.searchParams.get("options");
  parsed.searchParams.set(
    "options",
    `${existing ? `${existing} ` : ""}-c default_transaction_read_only=on`,
  );
  return parsed.toString();
}

const IN_CHUNK = 200;

export async function openSource(database) {
  let query;
  let close;
  let dialect;
  let tableColumns;
  if (isPostgresUrl(database)) {
    dialect = "postgres";
    const driver = PostgresDriver.open(readOnlyPostgresUrl(database));
    query = async (sql, params = []) => (await driver.query(sql, params)).rows;
    close = () => driver.close();
    tableColumns = async (table) =>
      (
        await query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? ORDER BY ordinal_position",
          [table],
        )
      ).map((row) => row.column_name);
  } else {
    dialect = "sqlite";
    if (!existsSync(database))
      throw new Error(`The SQLite database does not exist: ${database}`);
    const db = new DatabaseSync(database, { readOnly: true });
    query = async (sql, params = []) =>
      db
        .prepare(sql)
        .all(...params)
        .map((row) => ({ ...row }));
    close = async () => db.close();
    tableColumns = async (table) =>
      (await query(`PRAGMA table_info("${table.replaceAll('"', "")}")`)).map(
        (row) => row.name,
      );
  }
  const columnCache = new Map();
  const columnsOf = async (table) => {
    if (!/^[a-z_]+$/.test(table)) throw new Error("Unsafe table name.");
    if (!columnCache.has(table))
      columnCache.set(table, await tableColumns(table));
    return columnCache.get(table);
  };
  return {
    dialect,
    close,
    query,
    /** Whether the schema of the source has this table. */
    async has(table) {
      return (await columnsOf(table)).length > 0;
    },
    /** The wanted columns the source has, in the wanted order. */
    async existing(table, wanted) {
      const present = new Set(await columnsOf(table));
      return wanted.filter((column) => present.has(column));
    },
    /** Rows of a table (only the wanted columns that exist), optionally filtered. */
    async select(
      table,
      wanted,
      { where = "", params = [], orderBy = "" } = {},
    ) {
      const columns = await this.existing(table, wanted);
      if (!columns.length) return [];
      return query(
        `SELECT ${columns.join(", ")} FROM ${table}${where ? ` WHERE ${where}` : ""}${orderBy ? ` ORDER BY ${orderBy}` : ""}`,
        params,
      );
    },
    /** Rows whose `column` is one of `values` (in chunks), optionally with more conditions. */
    async selectIn(
      table,
      wanted,
      column,
      values,
      { where = "", params = [] } = {},
    ) {
      const columns = await this.existing(table, wanted);
      if (!columns.length || !values.length) return [];
      const rows = [];
      for (let start = 0; start < values.length; start += IN_CHUNK) {
        const chunk = values.slice(start, start + IN_CHUNK);
        rows.push(
          ...(await query(
            `SELECT ${columns.join(", ")} FROM ${table} WHERE ${column} IN (${chunk.map(() => "?").join(", ")})${where ? ` AND ${where}` : ""}`,
            [...chunk, ...params],
          )),
        );
      }
      return rows;
    },
    async schemaVersion() {
      if (!(await this.has("schema_migrations"))) return null;
      const rows = await query(
        "SELECT MAX(version) AS version FROM schema_migrations",
      );
      return rows[0]?.version === null || rows[0]?.version === undefined
        ? null
        : Number(rows[0].version);
    },
  };
}
