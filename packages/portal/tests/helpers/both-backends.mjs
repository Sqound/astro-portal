// Runs one exercise on a scratch SQLite database and, when
// ASTRO_PORTAL_TEST_DATABASE_URL names a throwaway PostgreSQL test database,
// on PostgreSQL too: two tests, the backend in brackets.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDatabaseDriver } from "../../dist/persistence/database.js";
import { applyMigrations } from "../../dist/persistence/migration-runner.js";
import { PostgresDriver } from "../../dist/persistence/postgres-driver.js";

export function onBothBackends(name, exercise) {
  test(`${name} [SQLite]`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "astro-both-backends-"));
    const driver = createDatabaseDriver({
      databasePath: join(directory, "portal.sqlite"),
    });
    try {
      await applyMigrations(driver, "sqlite");
      await exercise(driver);
    } finally {
      await driver.close();
      await rm(directory, { force: true, recursive: true });
    }
  });
  test(
    `${name} [PostgreSQL]`,
    { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
    async () => {
      const databaseUrl = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
      if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(databaseUrl))
        throw new Error(
          "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
        );
      const resetSchema = async () => {
        const reset = PostgresDriver.open(databaseUrl);
        try {
          await reset.run("DROP SCHEMA public CASCADE");
          await reset.run("CREATE SCHEMA public");
        } finally {
          await reset.close();
        }
      };
      let driver;
      try {
        await resetSchema();
        driver = createDatabaseDriver({ databaseUrl });
        await applyMigrations(driver, "postgres");
        await exercise(driver);
      } finally {
        if (driver) await driver.close();
        await resetSchema();
      }
    },
  );
}

/** A space and its person, as the sign-in leaves them. */
export async function seedSpace(driver, tenantId, userId, at) {
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, `Space ${tenantId.slice(0, 8)}`, at],
  );
  if (userId)
    await driver.run(
      "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
      [userId, `${userId.slice(0, 8)}@exemple.test`, "scrypt$test", at],
    );
}
