// The image of a multi-night plan belongs to no night, so its « Équipement »
// was empty although the nights it combines name their equipment (what Astro
// Sync read in the FITS headers and the person chose in « Mon matériel »).
// The capture now reads the equipment of the nights it combines: a role they
// agree on is shown, a role they disagree on is left empty, the filters are
// the union.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { at, withMetadataSpace } from "./helpers/metadata-space.mjs";
import {
  captureMetadata,
  combinedNightsEquipment,
  readMetadataInputs,
} from "../dist/captures/capture-metadata-reading.js";

async function planCapture(driver, space, nightIds) {
  // A capture of no night, with the plan fields Astro Sync declared.
  const id = randomUUID();
  await driver.run(
    `INSERT INTO captures (id, tenant_id, session_id, plan_id, target_id, original_name, sha256, byte_size, status, stage, created_at, project_id, plan_json)
     VALUES (?, ?, NULL, NULL, 'm31', 'IC_1805_plan_raw.tif', ?, 100, 'uploaded', 'finalized', ?, 'project-ic1805', ?)`,
    [
      id,
      space.tenantId,
      id.replaceAll("-", "").repeat(2),
      at,
      JSON.stringify({
        combinedNightIds: nightIds,
        totalsByFilter: [],
        render: "natural",
      }),
    ],
  );
  return (await driver.query("SELECT * FROM captures WHERE id = ?", [id]))
    .rows[0];
}

test("the equipment of a plan image is the one its nights agree on, filters united", async () => {
  await withMetadataSpace(async ({ driver, space }) => {
    // A second night, of a plan with the same equipment.
    const second = randomUUID();
    const secondPlan = randomUUID();
    await driver.run(
      `INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, name, plan_date, location_json, equipment_json, created_at, updated_at)
       SELECT ?, tenant_id, created_by_user_id, ?, name, '2026-10-06', location_json, equipment_json, created_at, updated_at
       FROM plans WHERE id = ?`,
      [secondPlan, `client-${secondPlan}`, space.planId],
    );
    await driver.run(
      "INSERT INTO observation_sessions (id, tenant_id, plan_id, started_at, finished_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'finished', ?, ?)",
      [
        second,
        space.tenantId,
        secondPlan,
        "2026-10-06T21:00:00.000Z",
        "2026-10-07T04:00:00.000Z",
        at,
        at,
      ],
    );
    const agreed = await planCapture(driver, space, [space.sessionId, second]);
    assert.deepEqual(
      await combinedNightsEquipment(driver, space.tenantId, agreed),
      {
        telescopeId: space.equipment.telescope,
        cameraId: space.equipment.camera,
        mountId: space.equipment.mount,
      },
    );
    // ... and the page reads their names.
    const inputs = await readMetadataInputs(driver, space.tenantId, agreed, []);
    const { equipment } = captureMetadata(inputs, { audience: "owner" });
    assert.equal(equipment.telescope.value.name, "Askar 50P");
    assert.equal(equipment.camera.value.name, "ZWO ASI533MC Pro");
    assert.equal(equipment.mount.value.name, "ZWO AM5N");
    assert.equal(equipment.telescope.source, "night");

    // A night that names no equipment does not disagree with the others.
    const silent = await planCapture(driver, space, [
      space.sessionId,
      space.otherSessionId,
    ]);
    assert.equal(
      (await combinedNightsEquipment(driver, space.tenantId, silent))
        .telescopeId,
      space.equipment.telescope,
    );
    // A night with another camera: that role is left empty, the others stay.
    await driver.run("UPDATE plans SET equipment_json = ? WHERE id = ?", [
      JSON.stringify({
        telescopeId: space.equipment.telescope,
        cameraId: space.equipment.otherCamera,
        mountId: space.equipment.mount,
        filterIds: [space.equipment.filter],
      }),
      secondPlan,
    ]);
    assert.deepEqual(
      await combinedNightsEquipment(driver, space.tenantId, agreed),
      {
        telescopeId: space.equipment.telescope,
        mountId: space.equipment.mount,
        filterIds: [space.equipment.filter],
      },
    );
    // A capture of a night, or of a plan that combines nothing, is not touched.
    assert.equal(
      await combinedNightsEquipment(driver, space.tenantId, {
        ...agreed,
        session_id: space.sessionId,
      }),
      null,
    );
    assert.equal(
      await combinedNightsEquipment(driver, space.tenantId, {
        ...agreed,
        plan_json: null,
      }),
      null,
    );
  });
});
