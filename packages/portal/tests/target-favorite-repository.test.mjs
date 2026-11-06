import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";
import { createTargetFavoriteRepository } from "../dist/persistence/target-favorite-repository.js";
import { subscribe } from "../dist/api/change-bus.js";

async function seed(driver) {
  const timestamp = "2026-09-14T00:00:00.000Z";
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-1", "Test observatory", timestamp],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    ["user-1", "astronomer@example.test", "scrypt$test", timestamp],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    ["user-2", "observer@example.test", "scrypt$test", timestamp],
  );
  for (const [id, designation] of [
    ["openngc-m1", "M1"],
    ["openngc-m31", "M31"],
  ])
    await driver.run(
      `INSERT INTO target_catalogue_entries (
      id, designation, aliases_json, common_names_json, catalogues_json,
      catalogue, source_json, source_revision, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        designation,
        "[]",
        "[]",
        '["Messier"]',
        "Messier",
        "{}",
        "test-v1",
        timestamp,
        timestamp,
      ],
    );
}

async function exercise({ driver, repository }) {
  await seed(driver);
  assert.deepEqual(await repository.favoriteTargetIdsByMode("user-1"), {
    photoTargetIds: [],
    visualTargetIds: [],
  });
  // setTargetFavorite emits `favorites` for the tenant on an actual
  // change, and nothing when the state does not change.
  const changeEvents = [];
  const unsubscribeChanges = subscribe("tenant-1", (event) =>
    changeEvents.push(event),
  );

  await repository.setTargetFavorite({
    tenantId: "tenant-1",
    userId: "user-1",
    targetId: "openngc-m1",
    mode: "photo",
    originClientInstanceId: "instance-writer",
  });
  assert.deepEqual(await repository.favoriteTargetIds("user-1"), [
    "openngc-m1",
  ]);
  assert.equal(changeEvents.length, 1);
  assert.deepEqual(changeEvents[0].domains, ["favorites"]);
  assert.equal(changeEvents[0].originClientInstanceId, "instance-writer");

  // Re-adding the same favorite changes nothing: no second event.
  await repository.setTargetFavorite({
    tenantId: "tenant-1",
    userId: "user-1",
    targetId: "openngc-m1",
    mode: "photo",
  });
  assert.equal(changeEvents.length, 1);
  unsubscribeChanges();
  assert.deepEqual(await repository.favoriteTargetIdsByMode("user-1"), {
    photoTargetIds: ["openngc-m1"],
    visualTargetIds: [],
  });

  // The two modes are independent and a favorite can be taken back.
  assert.deepEqual(
    await repository.setTargetFavorite({
      tenantId: "tenant-1",
      userId: "user-1",
      targetId: "openngc-m31",
      mode: "visual",
      favorite: true,
    }),
    { photoTargetIds: ["openngc-m1"], visualTargetIds: ["openngc-m31"] },
  );
  assert.deepEqual(
    await repository.setTargetFavorite({
      tenantId: "tenant-1",
      userId: "user-1",
      targetId: "openngc-m1",
      mode: "photo",
      favorite: false,
    }),
    { photoTargetIds: [], visualTargetIds: ["openngc-m31"] },
  );

  // Favorites belong to one person, never to the catalogue.
  assert.deepEqual(await repository.favoriteTargetIdsByMode("user-2"), {
    photoTargetIds: [],
    visualTargetIds: [],
  });

  await assert.rejects(
    repository.setTargetFavorite({
      tenantId: "tenant-1",
      userId: "user-1",
      targetId: "openngc-absent",
      mode: "photo",
      favorite: true,
    }),
    /Target was not found\./,
  );
  await assert.rejects(
    repository.setTargetFavorite({
      tenantId: "tenant-1",
      userId: "user-1",
      targetId: "openngc-m1",
      mode: "spectroscopic",
      favorite: true,
    }),
    /A valid favorite mode is required\./,
  );

  const events = (
    await driver.query(
      "SELECT event_type FROM audit_events WHERE user_id = ? AND tenant_id = ?",
      ["user-1", "tenant-1"],
    )
  ).rows
    .map((row) => row.event_type)
    .sort();
  assert.deepEqual(events, [
    "target.favorite.added",
    "target.favorite.added",
    "target.favorite.removed",
  ]);

  // The import of a phone's favorites — added, kept, unknown — one
  // change signal for what it added, none when it adds nothing.
  const importEvents = [];
  const unsubscribeImport = subscribe("tenant-1", (event) =>
    importEvents.push(event),
  );
  const imported = await repository.importTargetFavorites({
    tenantId: "tenant-1",
    userId: "user-1",
    items: [
      { targetId: "openngc-m31", mode: "visual" },
      { targetId: "openngc-m1", mode: "photo" },
      { targetId: "openngc-absent", mode: "photo" },
      { targetId: "openngc-m1", mode: "photo" },
    ],
  });
  assert.deepEqual(imported, {
    photoTargetIds: ["openngc-m1"],
    visualTargetIds: ["openngc-m31"],
    imported: [
      { targetId: "openngc-m31", mode: "visual", status: "kept" },
      { targetId: "openngc-m1", mode: "photo", status: "added" },
      { targetId: "openngc-absent", mode: "photo", status: "unknown_target" },
    ],
  });
  assert.equal(importEvents.length, 1);
  const replayed = await repository.importTargetFavorites({
    tenantId: "tenant-1",
    userId: "user-1",
    items: [{ targetId: "openngc-m1", mode: "photo" }],
  });
  assert.deepEqual(replayed.imported, [
    { targetId: "openngc-m1", mode: "photo", status: "kept" },
  ]);
  assert.equal(importEvents.length, 1);
  unsubscribeImport();
  await assert.rejects(
    repository.importTargetFavorites({
      tenantId: "tenant-1",
      userId: "user-1",
      items: [{ targetId: "openngc-m1", mode: "spectroscopic" }],
    }),
    /A valid favorite mode is required\./,
  );
}

test("target favorites work on a scratch SQLite database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-target-favorites-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  await applyMigrations(driver, "sqlite");
  const repository = await createTargetFavoriteRepository({ driver });
  try {
    await exercise({ driver, repository });
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "target favorites work on the dedicated PostgreSQL test database",
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
    let driver;
    try {
      await resetSchema();
      driver = createDatabaseDriver({ databaseUrl });
      await applyMigrations(driver, "postgres");
      const repository = await createTargetFavoriteRepository({
        driver,
        dialect: "postgres",
      });
      await exercise({ driver, repository });
    } finally {
      if (driver) await driver.close();
      await resetSchema();
    }
  },
);
