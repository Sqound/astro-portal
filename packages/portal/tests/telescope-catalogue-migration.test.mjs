import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { migrations, statementsFor } from "../dist/persistence/migrations.js";
import { DEFAULT_EQUIPMENT_SEED } from "../dist/persistence/default-equipment-seed.js";
import { TELESCOPE_CATALOGUE_SEED } from "../dist/persistence/telescope-catalogue-seed.js";
import { TELESCOPE_CATALOGUE_2_SEED } from "../dist/persistence/telescope-catalogue-2-seed.js";
import { TELESCOPE_CATALOGUE_3_SEED } from "../dist/persistence/telescope-catalogue-3-seed.js";
import { EQUIPMENT_CATALOGUE_4_SEED } from "../dist/persistence/equipment-catalogue-4-seed.js";
import { EQUIPMENT_CATALOGUE_5_SEED } from "../dist/persistence/equipment-catalogue-5-seed.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";
import { SqliteDriver } from "../dist/persistence/sqlite-driver.js";

// Migration 71 `telescope-catalogue`
// adds the 39 validated entries to « Matériel par défaut ». The seed module
// is the migration's own history; this test compares it with the profiles file
// of the planner as it is today, and runs the migration on a populated
// database on both dialects.

const profiles = JSON.parse(
  await readFile(
    new URL(
      "../../planner/src/common-equipment-profiles.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
// The file as it is: a database migrated to the end holds all of it.
const wholeProfiles = structuredClone(profiles);
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
const frozen = new Set(DEFAULT_EQUIPMENT_SEED.map((row) => row.id));
// The four smart telescopes of migration 96 are not migration 71's.
const ofMigration96 = new Set(TELESCOPE_CATALOGUE_2_SEED.map((row) => row.id));
const ofMigration107 = new Set(
  TELESCOPE_CATALOGUE_3_SEED.filter((row) => row.type === "telescope").map(
    (row) => row.id,
  ),
);
const heldElsewhere = new Set([...frozen, ...ofMigration96, ...ofMigration107]);
const pages = (keys) =>
  keys.map((key) => ({
    url: profiles.sources[key].url,
    readOn: profiles.sources[key].readOn,
  }));
const timestamp = "2026-10-09T00:00:00.000Z";

/**
 * The rows the profiles file adds to migration 55's (migration 96's four apart),
 * in the order migration 71 inserted them: the file lists the telescopes by
 * maker then model, the seed keeps the order it was written in.
 */
const expectedRows = () => [
  ...TELESCOPE_CATALOGUE_SEED.filter((row) => row.type === "telescope").map(
    (row) => ({
      type: "telescope",
      entry: profiles.telescopes.find((entry) => entry.id === row.id),
    }),
  ),
  ...TELESCOPE_CATALOGUE_SEED.filter((row) => row.type === "camera").map(
    (row) => ({
      type: "camera",
      entry: profiles.cameras.find((entry) => entry.id === row.id),
    }),
  ),
  ...TELESCOPE_CATALOGUE_SEED.filter((row) => row.type === "eyepiece").map(
    (row) => ({
      type: "eyepiece",
      entry: profiles.eyepieces.find((entry) => entry.id === row.id),
    }),
  ),
];

test("the seed module of migration 71 holds the 39 entries of the profiles file, with their own ids, in its order", () => {
  const expected = expectedRows();
  assert.equal(expected.length, 39);
  // Every telescope the file holds is in one of the three seeds.
  assert.deepEqual(
    profiles.telescopes.map((entry) => entry.id).sort(),
    [
      ...frozen,
      ...ofMigration96,
      ...ofMigration107,
      ...TELESCOPE_CATALOGUE_SEED.filter((row) => row.type === "telescope").map(
        (row) => row.id,
      ),
    ]
      .filter((id) => profiles.telescopes.some((entry) => entry.id === id))
      .sort(),
  );
  assert.deepEqual(
    TELESCOPE_CATALOGUE_SEED.map((row) => [row.type, row.id]),
    expected.map(({ type, entry }) => [type, entry.id]),
  );
  for (const [index, { type, entry }] of expected.entries()) {
    const row = TELESCOPE_CATALOGUE_SEED[index];
    assert.equal(row.name, entry.name, entry.id);
    if (type === "telescope") {
      assert.deepEqual(row.specifications, {
        apertureMm: entry.apertureMm,
        focalLengthMm: entry.focalLengthMm,
      });
      assert.equal(row.planner.group, entry.group, entry.id);
      assert.deepEqual(row.planner.makerPages, pages(entry.sources), entry.id);
      assert.equal(
        row.planner.mount?.id,
        entry.mountId,
        `${entry.id}: the mount is the smart telescopes' only`,
      );
      const sensor = profiles.integratedCameras.find(
        (camera) => camera.id === entry.integratedCameraId,
      );
      assert.equal(row.planner.integratedCamera?.id, sensor?.id, entry.id);
      if (sensor) {
        assert.equal(row.planner.integratedCamera.sensor, sensor.sensor);
        assert.equal(
          row.planner.integratedCamera.sensorWidthMm,
          sensor.sensorWidthMm,
        );
        assert.equal(
          row.planner.integratedCamera.calculation,
          sensor.calculation,
        );
      }
    } else if (type === "camera") {
      assert.equal(row.planner.sensor, entry.sensor);
      assert.equal(row.specifications.pixelSizeUm, entry.pixelSizeUm);
    } else {
      assert.equal(
        row.specifications.apparentFieldDegrees,
        entry.apparentFieldDegrees,
      );
    }
  }
  // `preference_order` continues the last value of each kind.
  for (const type of ["telescope", "camera", "eyepiece"]) {
    const last = Math.max(
      ...DEFAULT_EQUIPMENT_SEED.filter((row) => row.type === type).map(
        (row) => row.order,
      ),
    );
    assert.deepEqual(
      TELESCOPE_CATALOGUE_SEED.filter((row) => row.type === type).map(
        (row) => row.order,
      ),
      TELESCOPE_CATALOGUE_SEED.filter((row) => row.type === type).map(
        (_, index) => last + 1 + index,
      ),
      type,
    );
  }
  // No id of migration 55 is taken again.
  for (const row of TELESCOPE_CATALOGUE_SEED)
    assert.equal(frozen.has(row.id), false, row.id);
  const migration = migrations.find(({ version }) => version === 71);
  assert.equal(migration.name, "telescope-catalogue");
  // The migration runner cuts the text at every « ; »: no value of a row may
  // hold one (the calculations of the profiles file avoid it).
  assert.equal(
    statementsFor(migration, "sqlite")[0]
      .split(";")
      .filter((part) => part.trim()).length,
    39,
  );
  for (const dialect of ["sqlite", "postgres"])
    assert.match(
      statementsFor(migration, dialect)[0],
      /ON CONFLICT DO NOTHING/,
    );
});

async function defaultRows(driver, type) {
  return (
    await driver.query(
      "SELECT id, name, preference_order, planner_json FROM equipment WHERE scope = 'default' AND equipment_type = ? ORDER BY preference_order, id",
      [type],
    )
  ).rows.map((row) => ({
    ...row,
    preference_order: Number(row.preference_order),
  }));
}

async function migrateSeventy(driver, dialect) {
  await applyMigrations(
    driver,
    dialect,
    migrations.filter(({ version }) => version <= 69),
  );
  // Before 71 the administration edited a row under one of the new
  // identifiers (and moved it), and archived another one.
  const insert = (id, name, order, archivedAt) =>
    driver.run(
      "INSERT INTO equipment (id, tenant_id, equipment_type, name, specifications_json, planner_json, created_at, updated_at, archived_at, preference_order, scope) VALUES (?, 'platform', 'telescope', ?, ?, ?, ?, ?, ?, ?, 'default')",
      [
        id,
        name,
        JSON.stringify({ apertureMm: 127, focalLengthMm: 1500 }),
        JSON.stringify({ group: "reflectors" }),
        timestamp,
        timestamp,
        archivedAt,
        order,
      ],
    );
  await insert("skywatcher-skymax-127", "Mak 127 de l’équipe", 99, null);
  await insert("skywatcher-skymax-90", "Skymax 90 retiré", 98, timestamp);
  assert.equal((await defaultRows(driver, "telescope")).length, 14);

  const upTo96 = migrations.filter(({ version }) => version <= 96);
  await applyMigrations(driver, dialect, upTo96);
  const telescopes = await defaultRows(driver, "telescope");
  const newTelescopes = profiles.telescopes.filter(
    (entry) => !heldElsewhere.has(entry.id),
  );
  // 12 of migration 55 + 31 of migration 71 (two of them already held by the
  // administration, which are kept, not added twice) + 4 of migration 96.
  assert.equal(telescopes.length, 47);
  const kept = telescopes.find((row) => row.id === "skywatcher-skymax-127");
  assert.equal(kept.name, "Mak 127 de l’équipe");
  assert.equal(kept.preference_order, 99);
  assert.deepEqual(JSON.parse(kept.planner_json), { group: "reflectors" });
  const archived = (
    await driver.query(
      "SELECT name, archived_at, preference_order FROM equipment WHERE id = ?",
      ["skywatcher-skymax-90"],
    )
  ).rows[0];
  assert.equal(archived.name, "Skymax 90 retiré");
  assert.equal(archived.archived_at, timestamp);
  assert.equal(Number(archived.preference_order), 98);
  // The 29 others arrived with the file's names and a continuing order.
  const added = telescopes.filter((row) =>
    newTelescopes.some(
      (entry) =>
        entry.id === row.id &&
        !["skywatcher-skymax-127", "skywatcher-skymax-90"].includes(row.id),
    ),
  );
  assert.equal(added.length, 29);
  for (const row of added)
    assert.equal(
      row.name,
      newTelescopes.find((entry) => entry.id === row.id).name,
    );
  assert.equal((await defaultRows(driver, "camera")).length, 11);
  assert.equal((await defaultRows(driver, "eyepiece")).length, 6);

  // Running the statements again adds nothing and rewrites nothing.
  const before = JSON.stringify([
    await defaultRows(driver, "telescope"),
    await defaultRows(driver, "camera"),
    await defaultRows(driver, "eyepiece"),
  ]);
  const migration = migrations.find(({ version }) => version === 71);
  for (const statement of statementsFor(migration, dialect))
    await driver.run(statement);
  await applyMigrations(driver, dialect, upTo96);
  assert.equal(
    JSON.stringify([
      await defaultRows(driver, "telescope"),
      await defaultRows(driver, "camera"),
      await defaultRows(driver, "eyepiece"),
    ]),
    before,
  );
}

async function freshList(driver, dialect) {
  await applyMigrations(driver, dialect);
  // On a database nobody touched, the default list holds the file's entries,
  // for each kind. The pickers sort the telescopes by maker then model
  // themselves: the order of the rows is the order the migrations wrote them
  // in, not the order of the screen.
  for (const [type, list] of [
    ["telescope", wholeProfiles.telescopes],
    ["camera", wholeProfiles.cameras],
    ["eyepiece", wholeProfiles.eyepieces],
  ])
    assert.deepEqual(
      (await defaultRows(driver, type)).map((row) => row.id).sort(),
      list.map((entry) => entry.id).sort(),
      type,
    );
}

test("migration 71 on SQLite: a row edited or archived before it is kept, the others are added, a second run adds nothing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-migration-71-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await migrateSeventy(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test("migration 71 on a fresh SQLite database: the default list holds the profiles file's entries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-migration-71-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await freshList(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

for (const [label, run] of [
  [
    "migration 71 on PostgreSQL: a row edited or archived before it is kept, the others are added, a second run adds nothing",
    migrateSeventy,
  ],
  [
    "migration 71 on a fresh PostgreSQL database: the default list holds the profiles file's entries",
    freshList,
  ],
])
  test(
    label,
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
        await run(driver, "postgres");
      } finally {
        await driver.run("DROP SCHEMA public CASCADE");
        await driver.run("CREATE SCHEMA public");
        await driver.close();
      }
    },
  );

test("migration 96: the four smart telescopes the first catalogue lacked are added after it, with their maker and driver, an existing row is kept, a second run adds nothing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-migration-96-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    assert.deepEqual(
      TELESCOPE_CATALOGUE_2_SEED.map((row) => [row.id, row.order]),
      [
        ["vaonis-atlas", 43],
        ["vaonis-stellina", 44],
        ["vespera", 45],
        ["vespera-pro", 46],
      ],
    );
    const migration = migrations.find(({ version }) => version === 96);
    assert.equal(migration.name, "telescope-catalogue-2");
    for (const row of TELESCOPE_CATALOGUE_2_SEED) {
      const entry = profiles.telescopes.find((item) => item.id === row.id);
      assert.equal(row.name, entry.name, row.id);
      assert.deepEqual(row.specifications, {
        apertureMm: entry.apertureMm,
        focalLengthMm: entry.focalLengthMm,
      });
      assert.equal(row.planner.group, "connected");
      assert.equal(row.planner.maker, entry.maker, row.id);
      assert.equal(row.planner.driver, entry.driver, row.id);
      assert.equal(row.planner.mount.id, entry.mountId);
      assert.deepEqual(row.planner.makerPages, pages(entry.sources), row.id);
      const camera = profiles.integratedCameras.find(
        (item) => item.id === entry.integratedCameraId,
      );
      assert.equal(row.planner.integratedCamera.id, camera.id);
      assert.equal(row.planner.integratedCamera.sensor, camera.sensor);
      assert.equal(
        row.planner.integratedCamera.pixelSizeUm,
        camera.pixelSizeUm,
      );
    }
    // Run migrations 1 to 95 and let the administration take one identifier.
    await applyMigrations(
      driver,
      "sqlite",
      migrations.filter(({ version }) => version <= 95),
    );
    await driver.run(
      "INSERT INTO equipment (id, tenant_id, equipment_type, name, specifications_json, planner_json, created_at, updated_at, preference_order, scope) VALUES ('vespera', 'platform', 'telescope', 'Vespera de l’équipe', ?, ?, ?, ?, 99, 'default')",
      [
        JSON.stringify({ apertureMm: 50, focalLengthMm: 200 }),
        JSON.stringify({ group: "connected" }),
        timestamp,
        timestamp,
      ],
    );
    assert.equal((await defaultRows(driver, "telescope")).length, 44);
    await applyMigrations(
      driver,
      "sqlite",
      migrations.filter(({ version }) => version <= 96),
    );
    const telescopes = await defaultRows(driver, "telescope");
    assert.equal(telescopes.length, 47);
    assert.equal(
      telescopes.find((row) => row.id === "vespera").name,
      "Vespera de l’équipe",
    );
    assert.equal(
      JSON.parse(
        telescopes.find((row) => row.id === "vaonis-atlas").planner_json,
      ).maker,
      "Vaonis",
    );
    const before = JSON.stringify(telescopes);
    for (const statement of statementsFor(migration, "sqlite"))
      await driver.run(statement);
    assert.equal(
      JSON.stringify(await defaultRows(driver, "telescope")),
      before,
    );
    for (const dialect of ["sqlite", "postgres"])
      assert.match(
        statementsFor(migration, dialect)[0],
        /ON CONFLICT DO NOTHING/,
      );
    // The migration runner cuts the text at every « ; »: none inside a value.
    assert.equal(
      statementsFor(migration, "sqlite")[0]
        .split(";")
        .filter((part) => part.trim()).length,
      4,
    );
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test("migration 107: the third catalogue is the profiles file's other entries, a row the administration holds is kept, a second run adds nothing", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "astro-portal-migration-107-"),
  );
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    const migration = migrations.find(({ version }) => version === 107);
    assert.equal(migration.name, "telescope-catalogue-3");
    const kinds = {
      telescope: "telescopes",
      camera: "cameras",
      eyepiece: "eyepieces",
      lens: "opticalModifiers",
    };
    for (const [type, key] of Object.entries(kinds)) {
      const rows = TELESCOPE_CATALOGUE_3_SEED.filter(
        (row) => row.type === type,
      );
      assert.ok(rows.length > 0, type);
      for (const row of rows) {
        const entry = profiles[key].find((item) => item.id === row.id);
        assert.ok(entry, `${row.id} is in the profiles file`);
        assert.equal(row.name, entry.name, row.id);
        assert.deepEqual(row.planner.makerPages, pages(entry.sources), row.id);
        if (type === "telescope") {
          assert.deepEqual(row.specifications, {
            apertureMm: entry.apertureMm,
            focalLengthMm: entry.focalLengthMm,
          });
          assert.equal(row.planner.group, entry.group, row.id);
          assert.equal(row.planner.maker, entry.maker, row.id);
        } else if (type === "camera") {
          assert.equal(row.planner.sensor, entry.sensor, row.id);
          assert.equal(row.planner.sensorKind, entry.sensorKind, row.id);
          assert.equal(row.specifications.sensorWidthMm, entry.sensorWidthMm);
          assert.equal(row.specifications.sensorHeightMm, entry.sensorHeightMm);
          assert.equal(row.specifications.pixelSizeUm, entry.pixelSizeUm);
        } else if (type === "eyepiece") {
          assert.equal(row.specifications.focalLengthMm, entry.focalLengthMm);
          assert.equal(
            row.specifications.apparentFieldDegrees,
            entry.apparentFieldDegrees,
          );
        } else {
          assert.deepEqual(row.specifications, {
            multiplier: entry.multiplier,
          });
        }
        if (entry.calculation)
          assert.equal(row.planner.calculation, entry.calculation, row.id);
        // The orders continue the last value of the earlier seeds.
        assert.equal(frozen.has(row.id), false, row.id);
      }
      assert.deepEqual(
        rows.map((row) => row.order),
        rows.map((_, index) => rows[0].order + index),
        type,
      );
    }
    // The migration runner cuts the text at every « ; »: none inside a value.
    assert.equal(
      statementsFor(migration, "sqlite")[0]
        .split(";")
        .filter((part) => part.trim()).length,
      TELESCOPE_CATALOGUE_3_SEED.length,
    );
    for (const dialect of ["sqlite", "postgres"])
      assert.match(
        statementsFor(migration, dialect)[0],
        /ON CONFLICT DO NOTHING/,
      );
    // Migrations 1 to 104, then the administration takes one identifier.
    await applyMigrations(
      driver,
      "sqlite",
      migrations.filter(({ version }) => version <= 104),
    );
    await driver.run(
      "INSERT INTO equipment (id, tenant_id, equipment_type, name, specifications_json, planner_json, created_at, updated_at, preference_order, scope) VALUES ('celestron-c14', 'platform', 'telescope', 'C14 de l’équipe', ?, ?, ?, ?, 999, 'default')",
      [
        JSON.stringify({ apertureMm: 355.5, focalLengthMm: 3910 }),
        JSON.stringify({ group: "reflectors" }),
        timestamp,
        timestamp,
      ],
    );
    await applyMigrations(driver, "sqlite");
    const telescopes = await defaultRows(driver, "telescope");
    assert.equal(telescopes.length, wholeProfiles.telescopes.length);
    assert.equal(
      telescopes.find((row) => row.id === "celestron-c14").name,
      "C14 de l’équipe",
    );
    assert.equal(
      (await defaultRows(driver, "camera")).length,
      wholeProfiles.cameras.length,
    );
    assert.equal(
      (await defaultRows(driver, "eyepiece")).length,
      wholeProfiles.eyepieces.length,
    );
    const before = JSON.stringify(telescopes);
    for (const statement of statementsFor(migration, "sqlite"))
      await driver.run(statement);
    assert.equal(
      JSON.stringify(await defaultRows(driver, "telescope")),
      before,
    );
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});
