// CAMUI-1: a guide scope made on the phone, as the service keeps it and the
// web reads it (« Mon espace » → « Matériel »): the kind is the contract's
// `guide-scope`, and everything the phone writes in `planner.guideScope`
// comes back untouched; the web form only edits the name and the optics.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createEquipmentReader } from "../dist/persistence/equipment-reader.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { equipmentInput } from "../dist/equipment/manage-equipment.js";

const guideScope = {
  type: "guide-scope",
  name: "Lunette guide 50/200",
  specifications: { apertureMm: 50, focalLengthMm: 200 },
  planner: {
    guideScope: {
      telescopeId: "newton",
      placement: "guide",
      camera: {
        name: "ZWO ASI120MM Mini",
        pixelSizeUm: 3.75,
        widthPx: 1280,
        heightPx: 960,
        sensor: "mono",
      },
      protocol: "alpaca",
      method: "softwareOffset",
      lastAdjustment: {
        at: "2026-11-04T21:30:00.000Z",
        star: "Véga",
        errorArcmin: 3,
        offset: { xDegrees: 0.31, yDegrees: -0.12 },
      },
      exposureSeconds: 3,
      binning: 2,
      gain: 120,
    },
  },
};

test("the contract takes a guide scope as the phone writes it", () => {
  const input = equipmentInput(guideScope);
  assert.equal(input.type, "guide-scope");
  assert.deepEqual(input.planner, guideScope.planner);
});

test("the service keeps a guide scope's planner fields, and lists it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "camui-1-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  await applyMigrations(driver, "sqlite");
  const reader = await createEquipmentReader({ driver });
  try {
    await driver.run(
      "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
      ["tenant-1", "Test", "2026-11-04T00:00:00.000Z"],
    );
    const saved = await reader.saveEquipment({
      tenantId: "tenant-1",
      equipment: guideScope,
    });
    assert.equal(saved.type, "guide-scope");
    assert.deepEqual(saved.planner, guideScope.planner);
    const listed = await reader.listEquipment("tenant-1");
    assert.deepEqual(
      listed.map((item) => [item.type, item.name]),
      [["guide-scope", "Lunette guide 50/200"]],
    );
    assert.deepEqual(listed[0].specifications, guideScope.specifications);
  } finally {
    await driver.close();
    await rm(directory, { recursive: true, force: true });
  }
});
