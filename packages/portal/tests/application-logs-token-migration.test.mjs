import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { migrations } from "../dist/persistence/migrations.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";
import { SqliteDriver } from "../dist/persistence/sqlite-driver.js";

// Migration 73 makes the phone's lines anonymous. The lines
// already held lose their space and device identifiers; what the line says
// (level, event, message, context, time) and the other sources stay.

const at = "2026-10-10T00:00:00.000Z";

async function check(driver, dialect) {
  await applyMigrations(
    driver,
    dialect,
    migrations.filter(({ version }) => version < 73),
  );
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-108", "Synthetic space", at],
  );
  const insert = (id, source, device) =>
    driver.run(
      `INSERT INTO application_logs (id, tenant_id, device_id, level, source, event_type, message, context_json, created_at)
       VALUES (?, 'tenant-108', ?, 'error', ?, 'device.launch', 'A line.', '{"at":"x"}', ?)`,
      [id, device, source, at],
    );
  await insert("mobile-1", "mobile", "device-108");
  await insert("server-1", "server", null);
  await applyMigrations(driver, dialect);
  const rows = (
    await driver.query("SELECT * FROM application_logs ORDER BY id")
  ).rows;
  const mobile = rows.find((row) => row.id === "mobile-1");
  assert.equal(mobile.tenant_id, null);
  assert.equal(mobile.device_id, null);
  assert.equal(mobile.diagnostic_token, null);
  assert.equal(mobile.event_type, "device.launch");
  assert.equal(mobile.message, "A line.");
  assert.equal(mobile.context_json, '{"at":"x"}');
  assert.equal(mobile.created_at, at);
  const server = rows.find((row) => row.id === "server-1");
  assert.equal(
    server.tenant_id,
    "tenant-108",
    "other sources keep their space",
  );
}

test("migration 73 strips the space and the device from the lines of the phone (SQLite)", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-rev-108-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await check(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  "migration 73 strips the space and the device from the lines of the phone (PostgreSQL)",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const url = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(url))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const driver = PostgresDriver.open(url);
    try {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await check(driver, "postgres");
    } finally {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await driver.close();
    }
  },
);
