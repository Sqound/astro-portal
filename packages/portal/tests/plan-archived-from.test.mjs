import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import {
  createPlannerStateRepository,
  createPlanResourceRepository,
} from "../dist/persistence/planner-state-repository.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";

// The state an archived plan had before its archive (`archivedFrom`): served on
// the plan resource (`/v1/plans`, `null` outside an archive) and on the web
// document (`GET /api/plans`, absent outside an archive), so that a card reads
// « Abandonné » then « Archivé » instead of « Archivé » alone.

const stamp = "2026-09-14T00:00:00.000Z";
const tenantId = "tenant-1";
const userId = "user-1";

async function seedIdentity(driver) {
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, "Test observatory", stamp],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [userId, "planner@example.test", "scrypt$test", stamp],
  );
}

const place = {
  id: "paris",
  version: 1,
  name: "Paris",
  latitude: "48.8566",
  longitude: "2.3522",
  timeZone: "Europe/Paris",
};
const plan = (id, status, extra = {}) => ({
  id,
  date: "2026-09-14",
  name: id,
  nightId: "night-1",
  location: place,
  status,
  items: [{ id: "m31", designation: "M31", durationMinutes: 60 }],
  ...extra,
});
const document = (plans) => ({
  schemaVersion: 2,
  date: "2026-09-14",
  plans,
  nights: [{ id: "night-1", date: "2026-09-14", location: place }],
  activeNightId: "night-1",
  activePlanId: null,
});

async function exercise(driver) {
  await seedIdentity(driver);
  const web = await createPlannerStateRepository({ driver });
  const device = await createPlanResourceRepository({ driver });
  const save = (plans) =>
    web.savePlannerState({ tenantId, userId, state: document(plans) });
  const resources = async () =>
    Object.fromEntries(
      (await device.listPlanResources({ tenantId })).map((resource) => [
        resource.payload.id,
        resource,
      ]),
    );
  const documentPlans = async () =>
    Object.fromEntries(
      (await web.plannerState(tenantId)).plans.map((entry) => [
        entry.id,
        entry,
      ]),
    );

  // The web abandons, marks executed and keeps a plan planned...
  await save([
    plan("gave-up", "abandoned"),
    plan("ran", "executed"),
    plan("partly", "partial"),
    plan("planned", "pending"),
    plan("planned-too", "pending"),
  ]);
  // ... then archives three of them, and a plan still planned.
  await save([
    plan("gave-up", "archived", { archivedAt: stamp }),
    plan("ran", "archived", { archivedAt: stamp }),
    plan("partly", "archived", { archivedAt: stamp }),
    plan("planned", "archived", { archivedAt: stamp }),
    plan("planned-too", "pending"),
  ]);

  const served = await documentPlans();
  assert.equal(served["gave-up"].archivedFrom, "abandoned");
  assert.equal(served.ran.archivedFrom, "executed");
  assert.equal(served.partly.archivedFrom, "partial");
  // Nothing to say: the key is absent, not `null`.
  assert.equal(Object.hasOwn(served.planned, "archivedFrom"), false);
  assert.equal(Object.hasOwn(served["planned-too"], "archivedFrom"), false);

  const listed = await resources();
  assert.equal(listed["gave-up"].status, "archived");
  assert.equal(listed["gave-up"].archivedFrom, "abandoned");
  assert.equal(listed.ran.archivedFrom, "executed");
  assert.equal(listed.partly.archivedFrom, "partial");
  assert.equal(listed.planned.status, "archived");
  assert.equal(listed.planned.archivedFrom, null);
  assert.equal(listed["planned-too"].status, "active");
  assert.equal(listed["planned-too"].archivedFrom, null);
  const one = await device.getPlanResource({
    tenantId,
    planId: listed["gave-up"].id,
  });
  assert.equal(one.archivedFrom, "abandoned");

  // The document read and written back is accepted as it is: no revision moves.
  const revisions = Object.fromEntries(
    Object.entries(listed).map(([id, resource]) => [id, resource.revision]),
  );
  await web.savePlannerState({
    tenantId,
    userId,
    state: { ...document(Object.values(served)) },
  });
  const again = await resources();
  for (const [id, resource] of Object.entries(again))
    assert.equal(resource.revision, revisions[id], id);

  // The service decides it: a copy that claims another state changes nothing.
  await save(
    Object.values(served).map((entry) =>
      entry.id === "gave-up" ? { ...entry, archivedFrom: "executed" } : entry,
    ),
  );
  assert.equal((await documentPlans())["gave-up"].archivedFrom, "abandoned");
  assert.equal((await resources())["gave-up"].archivedFrom, "abandoned");

  // « Rétablir » on the web drops it from both.
  await save(
    Object.values(await documentPlans()).map((entry) =>
      entry.id === "gave-up"
        ? { ...entry, status: "pending", archivedAt: null }
        : entry,
    ),
  );
  assert.equal(
    Object.hasOwn((await documentPlans())["gave-up"], "archivedFrom"),
    false,
  );
  assert.equal((await resources())["gave-up"].archivedFrom, null);
  assert.equal((await resources())["gave-up"].status, "active");

  // A device that archived a plan the service did not freeze (status
  // `active`, `closedAs: "archived"`) says the state it wrote beside it.
  const write = async (payload) => {
    const planId = randomUUID();
    const { resource } = await device.writePlanResource({
      tenantId,
      userId,
      planId,
      expectedRevision: 0,
      payload: {
        id: `device-${planId}`,
        date: "2026-09-15",
        name: "Phone",
        items: [],
        ...payload,
      },
    });
    return resource;
  };
  const archivedOnPhone = await write({
    closedAs: "archived",
    archivedFrom: "abandoned",
  });
  assert.equal(archivedOnPhone.status, "active");
  assert.equal(archivedOnPhone.archivedFrom, "abandoned");
  assert.equal(archivedOnPhone.payload.archivedFrom, "abandoned");
  assert.equal(
    (await device.getPlanResource({ tenantId, planId: archivedOnPhone.id }))
      .archivedFrom,
    "abandoned",
  );
  // The web document reads it too; it keeps it for the phone while the plan
  // is not archived by the service.
  const phoneDocument = (await documentPlans())[archivedOnPhone.payload.id];
  assert.equal(phoneDocument.status, "pending");
  assert.equal(phoneDocument.archivedFrom, "abandoned");
  assert.equal(
    (await write({ closedAs: "archived" })).archivedFrom,
    null,
    "archived while it was still planned",
  );
  assert.equal(
    (await write({ closedAs: "archived", archivedFrom: "pending" }))
      .archivedFrom,
    null,
    "a word that is no state",
  );
  const notArchived = await write({ archivedFrom: "abandoned" });
  assert.equal(notArchived.archivedFrom, null, "not archived");
  assert.equal(
    Object.hasOwn(
      (await documentPlans())[notArchived.payload.id],
      "archivedFrom",
    ),
    false,
  );
  assert.equal(
    (await write({ closedAs: "abandoned", archivedFrom: "abandoned" }))
      .archivedFrom,
    null,
    "cancelled, not archived",
  );
}

test("the plan resource and the web document say the state an archived plan had, on SQLite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-archived-from-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    await exercise(driver);
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "the plan resource and the web document say the state an archived plan had, on PostgreSQL",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const databaseUrl = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(databaseUrl))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const reset = PostgresDriver.open(databaseUrl);
    try {
      await reset.run("DROP SCHEMA public CASCADE");
      await reset.run("CREATE SCHEMA public");
    } finally {
      await reset.close();
    }
    const driver = PostgresDriver.open(databaseUrl);
    try {
      await applyMigrations(driver, "postgres");
      await exercise(driver);
    } finally {
      await driver.close();
    }
  },
);
