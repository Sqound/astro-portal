import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createEquipmentReader } from "../dist/persistence/equipment-reader.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { PLATFORM_ORGANIZATION_ID } from "../dist/persistence/default-equipment-seed.js";

async function seed(driver) {
  const timestamp = "2026-09-14T00:00:00.000Z";
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-1", "Test observatory", timestamp],
  );
  await driver.run(
    `INSERT INTO equipment (
      id, tenant_id, equipment_type, name, specifications_json, planner_json,
      created_at, updated_at, preference_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "scope-1",
      "tenant-1",
      "telescope",
      "Vespera",
      "{}",
      "{}",
      timestamp,
      timestamp,
      0,
    ],
  );
  await driver.run(
    `INSERT INTO capture_equipment (
      id, tenant_id, capture_id, equipment_id, assignment_role, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    ["assignment-1", "tenant-1", "m1-session", "scope-1", "main", timestamp],
  );
}

async function exercise({ driver, reader }) {
  await seed(driver);
  assert.equal(await reader.firstTenantId(), "tenant-1");
  assert.equal((await reader.listEquipment("tenant-1")).at(0).name, "Vespera");
  const saved = await reader.saveEquipment({
    tenantId: "tenant-1",
    equipment: {
      id: "scope-1",
      type: "telescope",
      name: "Vespera II",
      specifications: { apertureMm: 50 },
    },
  });
  assert.equal(saved.name, "Vespera II");
  assert.deepEqual(saved.specifications, { apertureMm: 50 });
  await reader.archiveEquipment({
    tenantId: "tenant-1",
    equipmentId: "scope-1",
  });
  assert.equal((await reader.listEquipment("tenant-1")).length, 0);
  await reader.restoreEquipment({
    tenantId: "tenant-1",
    equipmentId: "scope-1",
  });
  assert.deepEqual(
    await reader.reorderEquipment({
      tenantId: "tenant-1",
      equipmentType: "telescope",
      equipmentIds: ["scope-1"],
    }),
    ["scope-1"],
  );
  await reader.setCaptureEquipment({
    tenantId: "tenant-1",
    captureId: "m1-session",
    assignments: [{ equipmentId: "scope-1", role: "guiding" }],
  });
  assert.deepEqual(await reader.captureEquipmentAssignments("tenant-1"), {
    "m1-session": [{ equipmentId: "scope-1", role: "guiding" }],
  });
  assert.deepEqual(await reader.equipmentAssignments("tenant-1"), {
    "m1-session": ["scope-1"],
  });
}

// The default equipment, held by the platform organisation, beside a
// space's own; the platform organisation is never a space, and a space
// never writes a default row.
async function exerciseDefaults({ driver, reader }) {
  await seed(driver);
  assert.equal(PLATFORM_ORGANIZATION_ID, "platform");
  assert.equal(await reader.firstTenantId(), "tenant-1");
  assert.equal(await reader.spaceExists(PLATFORM_ORGANIZATION_ID), false);
  assert.equal(await reader.spaceExists("tenant-1"), true);
  assert.deepEqual(
    (await reader.listEquipment("tenant-1")).map((item) => item.id),
    ["scope-1"],
  );
  const defaults = await reader.defaultEquipmentForSpaces();
  const seestar = defaults.find((item) => item.id === "seestar-s50");
  assert.equal(seestar.type, "telescope");
  assert.equal(seestar.planner.group, "connected");
  assert.equal(seestar.planner.integratedCamera.id, "seestar-s50-imx462");
  assert.ok(!("tenantId" in seestar) && !("notes" in seestar));
  // A space naming a default row's id gets a new item of its own.
  const own = await reader.saveEquipment({
    tenantId: "tenant-1",
    equipment: { id: "seestar-s50", type: "telescope", name: "Ma Seestar" },
  });
  assert.notEqual(own.id, "seestar-s50");
  assert.equal(
    (await reader.getDefaultEquipment("seestar-s50")).name,
    "Seestar S50",
  );
  assert.equal(await reader.getEquipment("tenant-1", "seestar-s50"), null);
  await assert.rejects(
    reader.archiveEquipment({
      tenantId: "tenant-1",
      equipmentId: "seestar-s50",
    }),
  );
  await assert.rejects(
    reader.saveEquipment({
      tenantId: PLATFORM_ORGANIZATION_ID,
      equipment: { type: "camera", name: "Caméra" },
    }),
  );
  // The administration's list: add, edit, archive, restore, reorder.
  const added = await reader.saveDefaultEquipment({
    equipment: {
      type: "camera",
      name: "ZWO ASI533MC Pro",
      specifications: { sensorWidthMm: 11.3, sensorHeightMm: 11.3 },
    },
  });
  const cameras = (await reader.listDefaultEquipment()).filter(
    (item) => item.type === "camera",
  );
  assert.equal(cameras.at(-1).id, added.id);
  await reader.archiveDefaultEquipment({ equipmentId: "zwo-asi585mc-pro" });
  assert.ok(
    !(await reader.defaultEquipmentForSpaces()).some(
      (item) => item.id === "zwo-asi585mc-pro",
    ),
  );
  assert.ok(
    (await reader.listDefaultEquipment({ includeArchived: true })).some(
      (item) => item.id === "zwo-asi585mc-pro" && item.archivedAt,
    ),
  );
  await reader.restoreDefaultEquipment({ equipmentId: "zwo-asi585mc-pro" });
  const order = (await reader.listDefaultEquipment())
    .filter((item) => item.type === "camera")
    .map((item) => item.id)
    .reverse();
  assert.deepEqual(
    await reader.reorderDefaultEquipment({
      equipmentType: "camera",
      equipmentIds: order,
    }),
    order,
  );
  assert.deepEqual(
    (await reader.listDefaultEquipment())
      .filter((item) => item.type === "camera")
      .map((item) => item.id),
    order,
  );
  // The space's own list never shows a default row.
  assert.ok(
    (await reader.listEquipment("tenant-1", { includeArchived: true })).every(
      (item) => item.tenantId === "tenant-1",
    ),
  );
}

test("the default equipment beside a space's own, on SQLite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-equipment-defaults-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  await applyMigrations(driver, "sqlite");
  const reader = await createEquipmentReader({ driver });
  try {
    await exerciseDefaults({ driver, reader });
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "the default equipment beside a space's own, on PostgreSQL",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const databaseUrl = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(databaseUrl))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const reset = async () => {
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
      await reset();
      driver = createDatabaseDriver({ databaseUrl });
      await applyMigrations(driver, "postgres");
      const reader = await createEquipmentReader({
        driver,
        dialect: "postgres",
      });
      await exerciseDefaults({ driver, reader });
    } finally {
      if (driver) await driver.close();
      await reset();
    }
  },
);

test("equipment reader works on a scratch SQLite database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-equipment-reader-"));
  const databasePath = join(directory, "portal.sqlite");
  const driver = createDatabaseDriver({ databasePath });
  await applyMigrations(driver, "sqlite");
  const reader = await createEquipmentReader({ driver });
  try {
    await exercise({ driver, reader });
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "equipment reader works on the dedicated PostgreSQL test database",
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
      const reader = await createEquipmentReader({
        driver,
        dialect: "postgres",
      });
      await exercise({ driver, reader });
    } finally {
      if (driver) await driver.close();
      await resetSchema();
    }
  },
);
