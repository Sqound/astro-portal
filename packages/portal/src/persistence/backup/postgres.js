// PostgreSQL side of the backup and restore: `pg_dump` and `pg_restore` run
// **inside** the dev container (`docker exec`), so no host installation of
// the PostgreSQL client tools is ever assumed. Only the operator scripts
// use this: the service image has no `pg_dump`, and the service leaves a
// PostgreSQL backup to the database's host (see startup.js).
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";
import { PostgresDriver } from "../postgres-driver.js";
import { REIMPORTED_TABLES } from "../reimported-data.js";

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const containerNamePattern = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

function requireIdentifier(value, label) {
  if (!identifierPattern.test(value))
    throw new Error(`${label} is not a safe identifier: ${value}`);
  return value;
}

export function requireContainerName(value) {
  if (!containerNamePattern.test(value))
    throw new Error(`Not a safe container name: ${value}`);
  return value;
}

export function databaseNameFromUrl(databaseUrl) {
  const name = new URL(databaseUrl).pathname.replace(/^\//, "");
  return requireIdentifier(name, "The database name derived from the URL");
}

export function defaultPostgresContainer(env = process.env) {
  return env.ASTRO_PORTAL_POSTGRES_CONTAINER || "astro-dev-postgres";
}

/**
 * `docker exec astro-dev-postgres` is the right default on a developer's
 * own machine, but a PostgreSQL container started by another tool may have
 * a generated name or id. When the named container is simply missing, say
 * how to name the right one rather than surfacing docker's raw message.
 */
function dockerExecError(container, code, stderr) {
  const trimmed = stderr.trim();
  if (/No such container/i.test(trimmed))
    return new Error(
      `No Docker container named "${container}" was found (docker exec exited ${code}). ` +
        "Set ASTRO_PORTAL_POSTGRES_CONTAINER to the name or id of the PostgreSQL container to use.",
    );
  return new Error(`docker exec ${container} exited ${code}: ${trimmed}`);
}

async function runDockerExecToFile(container, shellCommand, outputPath) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(
      "docker",
      ["exec", container, "sh", "-c", shellCommand],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    // The dump is as private as the database (files.js, restrictToOwner).
    const output = createWriteStream(outputPath, { mode: 0o600 });
    const pipeDone = finished(child.stdout.pipe(output));
    child.on("close", (code) => {
      pipeDone
        .then(() => {
          if (code === 0) resolvePromise();
          else reject(dockerExecError(container, code, stderr));
        })
        .catch(reject);
    });
  });
}

async function pipeFileIntoDockerExec(container, shellCommand, inputPath) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(
      "docker",
      ["exec", "-i", container, "sh", "-c", shellCommand],
      { stdio: ["pipe", "inherit", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    const input = createReadStream(inputPath);
    const pipeDone = finished(input.pipe(child.stdin));
    child.on("close", (code) => {
      pipeDone
        .then(() => {
          if (code === 0) resolvePromise();
          else reject(dockerExecError(container, code, stderr));
        })
        .catch(reject);
    });
  });
}

/** Schema version and row count per table of the `public` schema. */
export async function postgresState(driver) {
  const schemaVersionRow = (
    await driver.query("SELECT MAX(version) AS version FROM schema_migrations")
  ).rows[0];
  const schemaVersion =
    schemaVersionRow?.version === null ||
    schemaVersionRow?.version === undefined
      ? null
      : Number(schemaVersionRow.version);
  const tables = (
    await driver.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    )
  ).rows.map((row) => row.table_name);
  const tableCounts = {};
  for (const table of tables)
    tableCounts[table] = Number(
      (
        await driver.query(
          `SELECT COUNT(*) AS count FROM "${String(table).replaceAll('"', '""')}"`,
        )
      ).rows[0].count,
    );
  return { schemaVersion, tableCounts };
}

/**
 * The `pg_dump` arguments that leave out the rows the service re-imports
 * from the static data (persistence/reimported-data.ts): the tables'
 * definitions stay in the dump, so `pg_restore` into an empty database
 * is unchanged, and the service imports the texts again.
 */
export function pgDumpExclusions(tables = REIMPORTED_TABLES) {
  return tables
    .map(
      (table) =>
        `--exclude-table-data=public.${requireIdentifier(table, "A re-imported table")}`,
    )
    .join(" ");
}

/**
 * The row counts a dump made with pgDumpExclusions holds: the re-imported
 * tables are empty in it, as they are in a database restored from it.
 */
export function dumpedTableCounts(tableCounts, tables = REIMPORTED_TABLES) {
  const counts = { ...tableCounts };
  for (const table of tables) if (table in counts) counts[table] = 0;
  return counts;
}

export async function dumpPostgres({ databaseUrl, artifactPath, container }) {
  const databaseName = databaseNameFromUrl(databaseUrl);
  requireContainerName(container);
  const driver = PostgresDriver.open(databaseUrl);
  try {
    const { schemaVersion, tableCounts } = await postgresState(driver);
    await runDockerExecToFile(
      container,
      `pg_dump -U "\${POSTGRES_USER:-postgres}" -Fc ${pgDumpExclusions()} ${databaseName}`,
      artifactPath,
    );
    return {
      schemaVersion,
      tableCounts: dumpedTableCounts(tableCounts),
      excludedTableData: [...REIMPORTED_TABLES],
      database: { name: databaseName, container },
    };
  } finally {
    await driver.close();
  }
}

async function occupiedTables(driver) {
  return (
    await driver.query(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_type = 'BASE TABLE'
         AND table_schema NOT IN ('pg_catalog', 'information_schema')
         AND table_schema NOT LIKE 'pg_toast%'
       ORDER BY table_schema, table_name`,
    )
  ).rows;
}

/** Restores a dump into an empty database only; refuses anything else. */
export async function restorePostgresDump({
  artifactPath,
  targetDatabaseUrl,
  container,
}) {
  const databaseName = databaseNameFromUrl(targetDatabaseUrl);
  requireContainerName(container);
  const probe = PostgresDriver.open(targetDatabaseUrl);
  try {
    const occupied = await occupiedTables(probe);
    if (occupied.length)
      throw new Error(
        `Refusing PostgreSQL restore: target database already contains user tables (${occupied
          .map((row) => `${row.table_schema}.${row.table_name}`)
          .join(", ")}).`,
      );
  } finally {
    await probe.close();
  }

  await pipeFileIntoDockerExec(
    container,
    `pg_restore -U "\${POSTGRES_USER:-postgres}" -d ${databaseName} --no-owner --single-transaction`,
    artifactPath,
  );

  const driver = PostgresDriver.open(targetDatabaseUrl);
  try {
    return await postgresState(driver);
  } finally {
    await driver.close();
  }
}
