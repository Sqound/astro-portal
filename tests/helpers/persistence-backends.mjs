import { rm } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDatabaseDriver } from "portal/persistence/database.js";
import { applyMigrations } from "portal/persistence/migration-runner.js";
import { PostgresDriver } from "portal/persistence/postgres-driver.js";

const postgresTestDatabaseUrl =
  process.env.ASTRO_PORTAL_TEST_DATABASE_URL || null;

function requirePostgresTestDatabaseUrl() {
  if (!postgresTestDatabaseUrl)
    throw new Error("ASTRO_PORTAL_TEST_DATABASE_URL is required.");
  if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(postgresTestDatabaseUrl))
    throw new Error(
      "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
    );
  return postgresTestDatabaseUrl;
}

async function resetPostgresSchema(databaseUrl) {
  const driver = PostgresDriver.open(databaseUrl);
  try {
    await driver.run("DROP SCHEMA public CASCADE");
    await driver.run("CREATE SCHEMA public");
  } finally {
    await driver.close();
  }
}

async function openSqliteBackend() {
  const directory = mkdtempSync(join(tmpdir(), "astro-portal-test-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
  } catch (error) {
    await driver.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    dialect: "sqlite",
    driver,
    async close() {
      await driver.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

async function openPostgresBackend() {
  const databaseUrl = requirePostgresTestDatabaseUrl();
  await resetPostgresSchema(databaseUrl);
  let driver = null;
  try {
    driver = createDatabaseDriver({ databaseUrl });
    await applyMigrations(driver, "postgres");
  } catch (error) {
    if (driver) await driver.close();
    await resetPostgresSchema(databaseUrl);
    throw error;
  }
  return {
    dialect: "postgres",
    driver,
    async close() {
      try {
        await driver.close();
      } finally {
        await resetPostgresSchema(databaseUrl);
      }
    },
  };
}

/** Runs the same persistence scenario on SQLite and, when configured, PostgreSQL. */
export function persistenceTest(name, action) {
  const backends = [
    { label: "SQLite", open: openSqliteBackend, skip: false },
    {
      label: "PostgreSQL",
      open: openPostgresBackend,
      skip: postgresTestDatabaseUrl
        ? false
        : "ASTRO_PORTAL_TEST_DATABASE_URL is not set",
    },
  ];
  for (const backend of backends)
    test(`${name} [${backend.label}]`, { skip: backend.skip }, async () => {
      await action(backend);
    });
}
