import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { migrations, statementsFor } from "../dist/persistence/migrations.js";
import { EQUIPMENT_CATALOGUE_5_SEED } from "../dist/persistence/equipment-catalogue-5-seed.js";
import { SqliteDriver } from "../dist/persistence/sqlite-driver.js";

// Migration 133 `equipment-catalogue-5` (EQUIPMENT-CATALOGUE-02) seeds the
// entries of the profiles file that the earlier catalogues lack. The seed is
// the migration's own history; this test compares it with the file and runs
// the migration on SQLite.

const profiles = JSON.parse(
  await readFile(
    new URL(
      "../../planner/src/common-equipment-profiles.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const fileKeyByType = {
  telescope: "telescopes",
  camera: "cameras",
  eyepiece: "eyepieces",
  lens: "opticalModifiers",
  mount: "mounts",
  filter: "filterProducts",
};

test("the seed of migration 133 holds entries of the profiles file, each with its name, its maker, its pages and a continued order", () => {
  assert.ok(EQUIPMENT_CATALOGUE_5_SEED.length >= 80);
  const seen = new Set();
  for (const row of EQUIPMENT_CATALOGUE_5_SEED) {
    assert.ok(!seen.has(row.id), row.id);
    seen.add(row.id);
    const entry = profiles[fileKeyByType[row.type]].find(
      (candidate) => candidate.id === row.id,
    );
    assert.ok(entry, row.id);
    assert.equal(row.name, entry.name, row.id);
    assert.equal(row.planner.maker, entry.maker, row.id);
    assert.ok(row.planner.makerPages.length > 0, row.id);
    for (const page of row.planner.makerPages)
      assert.match(page.url, /^https:\/\//, row.id);
    if (row.type === "telescope") {
      assert.equal(row.specifications.apertureMm, entry.apertureMm, row.id);
      assert.equal(
        row.specifications.focalLengthMm,
        entry.focalLengthMm,
        row.id,
      );
    }
    if (row.type === "camera")
      assert.equal(row.specifications.pixelSizeUm, entry.pixelSizeUm, row.id);
    if (row.type === "filter")
      assert.equal(row.specifications.forAllEquipment, false, row.id);
    assert.ok(!JSON.stringify(row).includes(";"), row.id);
  }
  // The orders of a kind are consecutive.
  for (const type of new Set(EQUIPMENT_CATALOGUE_5_SEED.map((r) => r.type))) {
    const orders = EQUIPMENT_CATALOGUE_5_SEED.filter(
      (r) => r.type === type,
    ).map((r) => r.order);
    assert.deepEqual(
      orders,
      orders.map((_, index) => orders[0] + index),
      type,
    );
  }
});

test("migration 133 on SQLite: the rows are added to the default list, a second run adds nothing", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "astro-portal-migration-133-"),
  );
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await applyMigrations(driver, "sqlite");
    const count = async () =>
      (
        await driver.query(
          "SELECT id FROM equipment WHERE scope = 'default' ORDER BY id",
        )
      ).rows.map((row) => row.id);
    const first = await count();
    for (const row of EQUIPMENT_CATALOGUE_5_SEED)
      assert.ok(first.includes(row.id), row.id);
    const migration = migrations.find(({ version }) => version === 133);
    assert.equal(migration.name, "equipment-catalogue-5");
    for (const statement of statementsFor(migration, "sqlite"))
      await driver.run(statement);
    assert.deepEqual(await count(), first);
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});
