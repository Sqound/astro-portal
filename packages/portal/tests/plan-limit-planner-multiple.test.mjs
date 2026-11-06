import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPlanResourceService } from "../dist/api/plan-resources.js";
import { activePlanLimit } from "../dist/capabilities/provider.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";

// The web planner holds a second plan back on its screen from the same rule
// the service applies, `planner.multiple` withheld meaning exactly one
// active plan — whatever `sync.plan_limit` says, even when it says "no
// limit" — as the `Capabilities` contract states. The screen is never the
// only barrier.

const at = "2026-09-30T20:00:00.000Z";
const profile = (multiple, limit) => ({
  "planner.multiple": multiple,
  "planner.mosaic": false,
  "pointing.solve": false,
  "sync.plan_limit": limit,
  "gallery.private": false,
  "capture.variant_limit": 0,
  "analysis.logs": false,
  "analysis.progression": false,
  "storage.max_file_bytes": 0,
  "storage.quota_bytes": 0,
  "portal.invitations": false,
  "capture.count_limit": 9007199254740991,
  "capture.public": true,
  "history.retention_days": 7,
});

test("the number of active plans a profile may hold", () => {
  // Withheld: one, whatever the number says.
  assert.equal(activePlanLimit(profile(false, 0)), 0);
  assert.equal(activePlanLimit(profile(false, 1)), 1);
  assert.equal(activePlanLimit(profile(false, 5)), 5);
  assert.equal(activePlanLimit(profile(false, -3)), 0);
  // Granted: the number, and 0 (or nothing usable) means none.
  assert.equal(activePlanLimit(profile(true, 1)), 1);
  assert.equal(activePlanLimit(profile(true, 1000)), 1000);
  assert.equal(activePlanLimit(profile(true, 2.9)), 2);
  assert.equal(activePlanLimit(profile(true, 0)), 0);
  assert.equal(activePlanLimit(profile(true, -1)), 0);
  assert.equal(activePlanLimit({ "planner.multiple": true }), 0);
  // Nothing known: nothing is held back.
  assert.equal(activePlanLimit(null), 0);
  assert.equal(activePlanLimit(undefined), 0);
});

test("the plan service refuses a second active plan when planner.multiple is withheld, even with no numeric limit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-plan-multiple-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    const tenantId = randomUUID();
    const userId = randomUUID();
    await driver.run(
      "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
      [tenantId, "Observatory", at],
    );
    await driver.run(
      "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
      [userId, `${userId}@example.test`, "scrypt$test", at],
    );
    await driver.run(
      "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
      [randomUUID(), tenantId, userId, "owner", at],
    );
    const service = await createPlanResourceService({
      driver,
      capabilities: profile(false, 0),
      now: () => at,
    });
    const write = (clientId, date = "2026-09-30", locationName = "Site A") =>
      service.write({
        tenantId,
        userId,
        planId: randomUUID(),
        ifMatch: '"0"',
        payload: {
          id: clientId,
          date,
          name: clientId,
          location: { name: locationName, latitude: "45", longitude: "-30" },
          equipment: { mode: "imaging" },
          minAltitude: 30,
          status: "active",
          items: [{ id: "m31", designation: "M31", durationMinutes: 60 }],
        },
      });
    assert.equal((await write("first")).created, true);
    await assert.rejects(write("second", "2026-09-30", "Site B"), (error) => {
      assert.equal(error.code, "plan_limit_reached");
      assert.equal(error.status, 409);
      return true;
    });
    assert.equal((await write("tomorrow", "2026-10-01")).created, true);
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

async function withPlanService(capabilities, run) {
  const directory = await mkdtemp(join(tmpdir(), "astro-plan-night-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    const tenantId = randomUUID(),
      userId = randomUUID();
    await driver.run(
      "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
      [tenantId, "Site A", at],
    );
    await driver.run(
      "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
      [userId, `${userId}@example.test`, "test-only", at],
    );
    const service = await createPlanResourceService({
      driver,
      capabilities,
      now: () => at,
    });
    const write = (date, planId = randomUUID(), revision = 0) =>
      service.write({
        tenantId,
        userId,
        planId,
        ifMatch: `"${revision}"`,
        payload: {
          id: planId,
          date,
          name: "Plan",
          status: "active",
          location: { name: "Site A", latitude: "45", longitude: "-30" },
          equipment: { mode: "imaging" },
          minAltitude: 30,
          items: [],
        },
      });
    await run({ driver, service, tenantId, userId, write });
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
}

// « un plan par nuit » counts a plan that was run. After an executed or partial
// night, the free offer does not take a second plan for it.
for (const status of ["executed", "partial"]) {
  test(`an ${status} plan holds its night`, async () => {
    await withPlanService(profile(false, 1000), async ({ driver, write }) => {
      const first = await write("2030-01-01");
      await driver.run("UPDATE plans SET status = ? WHERE id = ?", [
        status,
        first.resource.id,
      ]);
      await assert.rejects(
        write("2030-01-01"),
        (error) => error.code === "plan_limit_reached" && error.status === 409,
      );
      assert.equal((await write("2030-01-02")).created, true);
    });
  });
}
for (const status of ["abandoned", "archived"]) {
  test(`an ${status} plan frees its night`, async () => {
    await withPlanService(profile(false, 1000), async ({ driver, write }) => {
      const first = await write("2030-01-01");
      await driver.run("UPDATE plans SET status = ? WHERE id = ?", [
        status,
        first.resource.id,
      ]);
      assert.equal((await write("2030-01-01")).created, true);
    });
  });
}
test("a plan that was run is not a slot of the numeric guard", async () => {
  await withPlanService(profile(false, 1), async ({ driver, write }) => {
    const first = await write("2030-01-01");
    await driver.run("UPDATE plans SET status = ? WHERE id = ?", [
      "executed",
      first.resource.id,
    ]);
    assert.equal((await write("2030-01-02")).created, true);
  });
});
test("advanced planning permits a second plan on a night that was run", async () => {
  await withPlanService(profile(true, 1000), async ({ driver, write }) => {
    const first = await write("2030-01-01");
    await driver.run("UPDATE plans SET status = ? WHERE id = ?", [
      "executed",
      first.resource.id,
    ]);
    assert.equal((await write("2030-01-01")).created, true);
  });
});
test("the numeric guard counts plans across different nights", async () => {
  await withPlanService(profile(false, 2), async ({ write }) => {
    await write("2030-01-01");
    await write("2030-01-02");
    await assert.rejects(
      write("2030-01-03"),
      (error) => error.code === "plan_limit_reached",
    );
  });
});
test("advanced planning permits two pending plans on one night", async () => {
  await withPlanService(profile(true, 1000), async ({ write }) => {
    await write("2030-01-01");
    assert.equal((await write("2030-01-01")).created, true);
  });
});
