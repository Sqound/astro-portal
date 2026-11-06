import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { migrations, statementsFor } from "../dist/persistence/migrations.js";
import { DEFAULT_EQUIPMENT_MAKER_KIND } from "../dist/persistence/default-equipment-maker-kind-seed.js";
import { createEquipmentReader } from "../dist/persistence/equipment-reader.js";
import { EQUIPMENT_CATALOGUE_4_SEED } from "../dist/persistence/equipment-catalogue-4-seed.js";
import { EQUIPMENT_CATALOGUE_5_SEED } from "../dist/persistence/equipment-catalogue-5-seed.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";
import { SqliteDriver } from "../dist/persistence/sqlite-driver.js";

// Migration 108 `default-equipment-maker-kind` writes the maker and the kind
// of every row of « Matériel par défaut » into its `planner_json`, merged:
// the pickers' « Marque » and « Type » menus read them. The seed module is the
// migration's own history; this test compares it with the profiles file of
// the planner as it is today, and runs the migration on a populated database
// on both dialects.

const profiles = JSON.parse(
  await readFile(
    new URL(
      "../../planner/src/common-equipment-profiles.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
// Entries of the file that this migration does not seed: the ones migration
// 131 (`equipment-catalogue-4`, EQUIPMENT-CATALOGUE-01) seeds, and the ones
// no migration seeds yet (the fixture, empty since 131): the seeds are
// compared with the file without them.
const awaiting = new Set([
  ...EQUIPMENT_CATALOGUE_4_SEED.map((row) => row.id),
  ...EQUIPMENT_CATALOGUE_5_SEED.map((row) => row.id),
  ...JSON.parse(
    await readFile(
      new URL(
        "./fixtures/catalogue-entries-awaiting-portal-seed.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ).ids,
]);
for (const key of ["telescopes", "cameras", "eyepieces", "opticalModifiers"])
  profiles[key] = profiles[key].filter((entry) => !awaiting.has(entry.id));
const timestamp = "2026-10-29T12:00:00.000Z";
const migration = migrations.find(({ version }) => version === 108);

test("the seed module of migration 108 holds the maker and the kind of every profile of the file", () => {
  assert.equal(migration.name, "default-equipment-maker-kind");
  const expected = [];
  for (const [key, type] of [
    ["telescopes", "telescope"],
    ["cameras", "camera"],
    ["eyepieces", "eyepiece"],
    ["opticalModifiers", "lens"],
  ])
    for (const entry of profiles[key])
      if (entry.maker || entry.kind)
        expected.push({
          id: entry.id,
          type,
          ...(entry.maker ? { maker: entry.maker } : {}),
          ...(entry.kind ? { kind: entry.kind } : {}),
        });
  assert.deepEqual(
    DEFAULT_EQUIPMENT_MAKER_KIND.map((row) => ({ ...row })),
    expected,
  );
  // « Aucun » is no row; the generic entries carry a kind and no maker.
  assert.equal(
    DEFAULT_EQUIPMENT_MAKER_KIND.some((row) => row.id === "none"),
    false,
  );
  assert.deepEqual(
    DEFAULT_EQUIPMENT_MAKER_KIND.find((row) => row.id === "plossl-25"),
    { id: "plossl-25", type: "eyepiece", kind: "plossl" },
  );
  // One statement per row on each dialect, cut by the runner at « ; ».
  for (const dialect of ["sqlite", "postgres"]) {
    const [text] = statementsFor(migration, dialect);
    assert.equal(
      text.split(";").filter((part) => part.trim()).length,
      DEFAULT_EQUIPMENT_MAKER_KIND.length,
      dialect,
    );
  }
  assert.match(statementsFor(migration, "postgres")[0], /::jsonb \|\|/);
  assert.match(statementsFor(migration, "sqlite")[0], /json_patch\(/);
});

const plannerOf = async (driver, id) => {
  const row = (
    await driver.query("SELECT planner_json FROM equipment WHERE id = ?", [id])
  ).rows[0];
  return row ? JSON.parse(row.planner_json) : null;
};

async function migrateOneHundredEight(driver, dialect) {
  await applyMigrations(
    driver,
    dialect,
    migrations.filter(({ version }) => version <= 107),
  );
  // Before 108 the administration edited a default row (a key of its own,
  // another group), and deleted another one; a space holds a telescope of
  // its own.
  await driver.run(
    "UPDATE equipment SET planner_json = ? WHERE id = ? AND tenant_id = 'platform'",
    [
      JSON.stringify({ group: "reflectors", note: "Le Mak du club" }),
      "skywatcher-skymax-127",
    ],
  );
  await driver.run(
    "DELETE FROM equipment WHERE id = ? AND tenant_id = 'platform'",
    ["skywatcher-skymax-90"],
  );
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES ('space-1', 'Club', ?)",
    [timestamp],
  );
  await driver.run(
    "INSERT INTO equipment (id, tenant_id, equipment_type, name, specifications_json, planner_json, created_at, updated_at, preference_order, scope) VALUES ('space-scope', 'space-1', 'telescope', 'Lunette du club', ?, ?, ?, ?, 0, 'private')",
    [
      JSON.stringify({ apertureMm: 80, focalLengthMm: 600 }),
      JSON.stringify({ group: "refractors" }),
      timestamp,
      timestamp,
    ],
  );
  assert.equal((await plannerOf(driver, "seestar-s50")).kind, undefined);

  await applyMigrations(driver, dialect);
  // Each kind of row gets its maker and its kind, its other keys kept.
  const seestar = await plannerOf(driver, "seestar-s50");
  assert.equal(seestar.maker, "ZWO");
  assert.equal(seestar.kind, "smart");
  assert.equal(seestar.group, "connected");
  assert.ok(seestar.integratedCamera);
  const camera = await plannerOf(driver, "zwo-asi585mc-pro");
  assert.equal(camera.maker, "ZWO");
  assert.equal(camera.kind, "colour");
  const plossl = await plannerOf(driver, "plossl-25");
  assert.equal(plossl.maker, undefined);
  assert.equal(plossl.kind, "plossl");
  assert.equal((await plannerOf(driver, "barlow")).kind, "barlow");
  // The row the administration edited keeps its own keys.
  assert.deepEqual(await plannerOf(driver, "skywatcher-skymax-127"), {
    group: "reflectors",
    note: "Le Mak du club",
    maker: "Sky-Watcher",
    kind: "maksutov",
  });
  // A deleted row stays deleted; a space's row is not touched.
  assert.equal(await plannerOf(driver, "skywatcher-skymax-90"), null);
  assert.deepEqual(await plannerOf(driver, "space-scope"), {
    group: "refractors",
  });
  // Every default telescope, camera and eyepiece now has a kind.
  const rows = (
    await driver.query(
      "SELECT id, equipment_type, planner_json FROM equipment WHERE tenant_id = 'platform' AND scope = 'default' AND equipment_type IN ('telescope', 'camera', 'eyepiece')",
    )
  ).rows;
  assert.ok(rows.length > 400);
  for (const row of rows)
    assert.equal(typeof JSON.parse(row.planner_json).kind, "string", row.id);

  // Running the statements again changes nothing.
  const before = JSON.stringify(
    (
      await driver.query(
        "SELECT id, planner_json, updated_at FROM equipment ORDER BY id",
      )
    ).rows,
  );
  for (const statement of statementsFor(migration, dialect)[0].split(";"))
    if (statement.trim()) await driver.run(statement);
  assert.equal(
    JSON.stringify(
      (
        await driver.query(
          "SELECT id, planner_json, updated_at FROM equipment ORDER BY id",
        )
      ).rows,
    ),
    before,
  );

  // The equipment read hands the default rows' maker and kind on.
  const reader = await createEquipmentReader({ driver, dialect });
  const defaults = await reader.listDefaultEquipment();
  const skymax = defaults.find((item) => item.id === "skywatcher-skymax-127");
  assert.equal(skymax.planner.maker, "Sky-Watcher");
  assert.equal(skymax.planner.kind, "maksutov");
}

test("migration 108 on SQLite: maker and kind merged into the default rows, an edited row keeps its keys, a second run changes nothing", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "astro-portal-migration-108-"),
  );
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await migrateOneHundredEight(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "migration 108 on PostgreSQL: maker and kind merged into the default rows, an edited row keeps its keys, a second run changes nothing",
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
      await migrateOneHundredEight(driver, "postgres");
    } finally {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await driver.close();
    }
  },
);
