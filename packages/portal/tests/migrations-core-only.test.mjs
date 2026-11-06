// A database the core migrates alone, with no composition registered, holds
// the core's tables and no other: nothing a composition adds (its own
// migrations are registered by it, `migration-registry.ts`) is created for a
// server that has none. The list below is the core's: a migration of the core
// that adds a table adds it here too.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  composedMigrations,
  registeredMigrationSources,
} from "../dist/persistence/migration-registry.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { migrations } from "../dist/persistence/migrations.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";
import { SqliteDriver } from "../dist/persistence/sqlite-driver.js";

const CORE_TABLES = [
  "acquisition_steps",
  "admin_access_log",
  "application_logs",
  "audit_events",
  "bootstrap_enrollments",
  "calibration_contributions",
  "calibration_ledger",
  "capture_equipment",
  "capture_field_revisions",
  "capture_file_deletions",
  "capture_sky_solutions",
  "capture_tags",
  "capture_targets",
  "capture_variants",
  "captures",
  "default_configurations",
  "device_pairings",
  "device_tokens",
  "equipment",
  "framings",
  "horizon_profiles",
  "known_locations",
  "login_attempts",
  "memberships",
  "observation_sessions",
  "organizations",
  "place_climate_trends",
  "place_preferences",
  "place_sky_measures",
  "plan_framings",
  "plan_items",
  "plan_versions",
  "planner_contexts",
  "planner_imports",
  "plans",
  "portal_access",
  "portal_mail_budget",
  "project_integrations",
  "projects",
  "recovery_codes",
  "schema_migrations",
  "session_analyses",
  "session_events",
  "session_package_imports",
  "session_supplements",
  "sessions",
  "sign_in_codes",
  "sign_in_send_guard",
  "sign_in_throttles",
  "static_data_documents",
  "static_data_exports",
  "target_catalogue_entries",
  "target_catalogue_lookup_keys",
  "target_catalogue_names",
  "target_catalogue_relation_state",
  "target_catalogue_search",
  "target_catalogue_search_state",
  "target_catalogue_state",
  "target_collection_memberships",
  "target_collections",
  "target_media",
  "totp_credentials",
  "upload_sessions",
  "user_target_favorite_modes",
  "user_target_favorites",
  "users",
  "weather_forecasts",
];

// PostgreSQL keeps the catalogue texts in the database; SQLite keeps them in a
// file of their own.
const POSTGRES_TABLES = [
  ...CORE_TABLES,
  "target_text_shards",
  "target_texts",
].sort();

test("nothing is registered: the chain is the core's own", () => {
  assert.deepEqual(registeredMigrationSources(), []);
  assert.equal(composedMigrations(), migrations);
});

test("a fresh SQLite database holds the core's tables and no other", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-core-only-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await applyMigrations(driver, "sqlite");
    const tables = (
      await driver.query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
    ).rows.map((row) => row.name);
    assert.deepEqual(tables.sort(), CORE_TABLES);
    const versions = (
      await driver.query("SELECT version FROM schema_migrations")
    ).rows.map((row) => Number(row.version));
    assert.deepEqual(
      versions.sort((left, right) => left - right),
      migrations.map(({ version }) => version),
    );
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "a fresh PostgreSQL database holds the core's tables and no other",
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
      await applyMigrations(driver, "postgres");
      const tables = (
        await driver.query(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
        )
      ).rows.map((row) => row.table_name);
      assert.deepEqual(tables.sort(), POSTGRES_TABLES);
    } finally {
      await driver.close();
    }
  },
);
