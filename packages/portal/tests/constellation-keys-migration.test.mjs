import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { constellationByKey } from "astro-core/constellations.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { migrations, statementsFor } from "../dist/persistence/migrations.js";
import { CONSTELLATION_KEY_RENAMES } from "../dist/persistence/constellation-key-seed.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";
import { SqliteDriver } from "../dist/persistence/sqlite-driver.js";

// Migration 109 `constellation-keys-iau` keys every constellation of the
// shared catalogue by its IAU abbreviation (`Lyr`): the French names the rows
// carried, the Serpent's two parts, the English labels that had slipped in.
// The seed module is the migration's own history; this test checks that it is
// complete and sound, then runs the migration on a populated database on both
// dialects.

const timestamp = "2026-10-30T12:00:00.000Z";
const migration = migrations.find(({ version }) => version === 109);
const renames = new Map(CONSTELLATION_KEY_RENAMES);

test("the seed of migration 109 renames every key the catalogue carried to a constellation of the table", () => {
  assert.equal(migration.name, "constellation-keys-iau");
  // Every old key names one constellation; all of them are keys of the table.
  for (const [from, to] of CONSTELLATION_KEY_RENAMES) {
    assert.notEqual(from, to);
    assert.ok(constellationByKey(to), `${from} → ${to}`);
    // An old key is never also the key of another constellation.
    assert.equal(constellationByKey(from), undefined, `${from} is a new key`);
  }
  assert.equal(
    renames.size,
    CONSTELLATION_KEY_RENAMES.length,
    "one rename each",
  );
  // The 87 French names of the old catalogue, the Serpent's parts, the English
  // labels: « Car » was already the Carina's abbreviation and stays.
  assert.equal(renames.get("Lyre"), "Lyr");
  assert.equal(renames.get("Serpent"), "Ser");
  assert.equal(renames.get("Se1"), "Ser");
  assert.equal(renames.get("Se2"), "Ser");
  assert.equal(renames.get("Air Pump"), "Ant");
  assert.equal(renames.get("Bird of Paradise"), "Aps");
  assert.equal(renames.get("Boötes"), "Boo");
  assert.equal(renames.get("Bootes"), "Boo");
  assert.equal(renames.has("Car"), false);
  assert.equal(renames.has("Système solaire"), false);
  // Every constellation but the Carina (already its abbreviation) is the target
  // of at least one rename.
  const targets = new Set(renames.values());
  const withoutRename = [
    ...new Set(CONSTELLATION_KEY_RENAMES.map(([, to]) => to)),
  ];
  assert.equal(targets.size, withoutRename.length);
  assert.equal(targets.size, 87);
  assert.equal(targets.has("Car"), false);
  // Two statements on each dialect: the column and the overrides.
  for (const dialect of ["sqlite", "postgres"]) {
    const [text] = statementsFor(migration, dialect);
    assert.equal(
      text.split(";").filter((part) => part.trim()).length,
      2,
      dialect,
    );
  }
  assert.match(statementsFor(migration, "postgres")[0], /jsonb_set\(/);
  assert.match(statementsFor(migration, "sqlite")[0], /json_set\(/);
});

async function insertEntry(driver, id, constellation, overrides = "{}") {
  await driver.run(
    `INSERT INTO target_catalogue_entries (
       id, designation, aliases_json, common_names_json, type_key, constellation_key,
       catalogues_json, catalogue, overrides_json, source_json, source_revision,
       created_at, updated_at)
     VALUES (?, ?, '[]', '[]', 'Galaxie', ?, '["NGC"]', 'NGC', ?, '{}', 'r1', ?, ?)`,
    [id, id, constellation, overrides, timestamp, timestamp],
  );
}

const keyOf = async (driver, id) =>
  (
    await driver.query(
      "SELECT constellation_key, overrides_json FROM target_catalogue_entries WHERE id = ?",
      [id],
    )
  ).rows[0];

async function migrateOneHundredNine(driver, dialect) {
  await applyMigrations(
    driver,
    dialect,
    migrations.filter(({ version }) => version <= 108),
  );
  await insertEntry(driver, "lyre", "Lyre");
  await insertEntry(driver, "serpent", "Serpent");
  await insertEntry(driver, "se1", "Se1");
  await insertEntry(driver, "se2", "Se2");
  await insertEntry(driver, "carina", "Car");
  await insertEntry(driver, "ecu", "Écu de Sobieski");
  await insertEntry(driver, "english", "Air Pump");
  await insertEntry(driver, "solar", "Système solaire");
  await insertEntry(driver, "none", null);
  await insertEntry(driver, "already", "Cyg");
  // An administrator moved a target to the Swan in its overrides, another
  // edited something else, a third has no constellation of its own.
  await insertEntry(
    driver,
    "override",
    "Lyre",
    JSON.stringify({ constellationKey: "Cygne", magnitude: 4.5 }),
  );
  await insertEntry(driver, "other", "Orion", JSON.stringify({ magnitude: 1 }));

  await applyMigrations(driver, dialect);
  const expected = {
    lyre: "Lyr",
    serpent: "Ser",
    se1: "Ser",
    se2: "Ser",
    carina: "Car",
    ecu: "Sct",
    english: "Ant",
    solar: "Système solaire",
    none: null,
    already: "Cyg",
    override: "Lyr",
    other: "Ori",
  };
  for (const [id, key] of Object.entries(expected))
    assert.equal((await keyOf(driver, id)).constellation_key, key, id);
  assert.deepEqual(
    JSON.parse((await keyOf(driver, "override")).overrides_json),
    {
      constellationKey: "Cyg",
      magnitude: 4.5,
    },
  );
  assert.deepEqual(JSON.parse((await keyOf(driver, "other")).overrides_json), {
    magnitude: 1,
  });
  assert.equal((await keyOf(driver, "lyre")).overrides_json, "{}");

  // Running the statements again changes nothing.
  const snapshot = async () =>
    JSON.stringify(
      (
        await driver.query(
          "SELECT id, constellation_key, overrides_json FROM target_catalogue_entries ORDER BY id",
        )
      ).rows,
    );
  const before = await snapshot();
  for (const statement of statementsFor(migration, dialect)[0].split(";"))
    if (statement.trim()) await driver.run(statement);
  assert.equal(await snapshot(), before);
}

test("migration 109 on SQLite: every constellation keyed by its abbreviation, the overrides too, a second run changes nothing", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "astro-portal-migration-109-"),
  );
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await migrateOneHundredNine(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "migration 109 on PostgreSQL: every constellation keyed by its abbreviation, the overrides too, a second run changes nothing",
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
      await migrateOneHundredNine(driver, "postgres");
    } finally {
      await driver.run("DROP SCHEMA public CASCADE");
      await driver.run("CREATE SCHEMA public");
      await driver.close();
    }
  },
);
