import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApplicationLogRepository } from "../dist/persistence/application-log-repository.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";

async function exercise(repository) {
  const server = await repository.recordAppLog({
    level: "warning",
    source: "server",
    event: "planner.forecast_unavailable",
    message: "Open-Meteo forecast unavailable",
    context: { service: "Open-Meteo" },
  });
  await repository.recordAppLog({
    level: "info",
    source: "client",
    event: "planner.ready",
    message: "Planner ready",
  });
  const warnings = await repository.listAppLogs({
    level: "warning",
    source: "server",
  });
  assert.deepEqual(warnings, [server]);
}

test("application log repository works on a scratch SQLite database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-application-logs-"));
  const repository = await createApplicationLogRepository({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await exercise(repository);
  } finally {
    await repository.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "application log repository works on the dedicated PostgreSQL test database",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const databaseUrl = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(databaseUrl))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const resetSchema = async () => {
      const driver = PostgresDriver.open(databaseUrl);
      try {
        await driver.run("DROP SCHEMA public CASCADE");
        await driver.run("CREATE SCHEMA public");
      } finally {
        await driver.close();
      }
    };
    let repository;
    try {
      await resetSchema();
      repository = await createApplicationLogRepository({ databaseUrl });
      await exercise(repository);
    } finally {
      if (repository) await repository.close();
      await resetSchema();
    }
  },
);
