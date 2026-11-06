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
import { createFramingResourceRepository } from "../dist/persistence/framing-repository.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";
import { subscribe } from "../dist/api/change-bus.js";

const timestamp = "2026-09-14T00:00:00.000Z";

function horizon() {
  return {
    enabled: true,
    points: Array.from({ length: 12 }, (_, index) => ({
      azimuth: index * 30,
      altitude: index === 3 ? 12 : 0,
    })),
  };
}

function plannerDocument() {
  const location = {
    id: "paris",
    version: 1,
    name: "Paris",
    latitude: "48.8566",
    longitude: "2.3522",
    timeZone: "Europe/Paris",
    horizonMask: horizon(),
  };
  return {
    schemaVersion: 2,
    date: "2026-09-14",
    sync: {
      version: 1,
      deviceId: "field-phone",
      updatedAt: timestamp,
    },
    plans: [
      {
        id: "plan-1",
        date: "2026-09-14",
        name: "Early targets",
        nightId: "night-1",
        location,
        equipment: { mode: "imaging", telescopeId: "scope-1" },
        minAltitude: 28,
        moonSeparationMinimum: 30,
        status: "pending",
        items: [
          { id: "m31", designation: "M31", durationMinutes: 90 },
          { id: "m42", designation: "M42", durationMinutes: 60 },
        ],
      },
      {
        id: "plan-2",
        date: "2026-09-14",
        name: "Later targets",
        nightId: "night-1",
        location,
        equipment: { mode: "visual" },
        minAltitude: 35,
        status: "executed",
        items: [{ id: "m1", designation: "M1", durationMinutes: 45 }],
      },
      {
        id: "plan-3",
        date: "2026-09-14",
        name: "Archived",
        nightId: "night-1",
        location,
        equipment: { mode: "imaging" },
        minAltitude: 20,
        status: "archived",
        archivedAt: timestamp,
        items: [{ id: "m13", designation: "M13", durationMinutes: 30 }],
      },
    ],
    knownLocations: [location],
    horizonProfiles: [
      { id: "paris-horizon", name: "Paris roof", location, mask: horizon() },
    ],
    activeHorizonProfileId: "paris-horizon",
    nights: [{ id: "night-1", date: "2026-09-14", location }],
    activeNightId: "night-1",
    activePlanId: "plan-2",
    unassignedHorizonProfiles: [],
  };
}

async function seedIdentity(driver) {
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    ["tenant-1", "Test observatory", timestamp],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    ["user-1", "planner@example.test", "scrypt$test", timestamp],
  );
}

function countedDriver(driver, counters) {
  return {
    // The repository reads the dialect from its driver: a wrapper that drops
    // it makes a PostgreSQL driver look like SQLite.
    dialect: driver.dialect,
    async query(sql, params) {
      if (/FROM\s+plan_items\b/i.test(sql)) counters.planItemReads += 1;
      return await driver.query(sql, params);
    },
    async run(sql, params) {
      return await driver.run(sql, params);
    },
    async transaction(action) {
      return await driver.transaction(action);
    },
    async close() {
      await driver.close();
    },
  };
}

async function exercise(driver) {
  await seedIdentity(driver);
  const counters = { planItemReads: 0 };
  const repository = await createPlannerStateRepository({
    driver: countedDriver(driver, counters),
  });
  // savePlannerState emits `plans`; never `places` since the places of a
  // space are written by `/v1/places` alone.
  const changeEvents = [];
  const unsubscribeChanges = subscribe("tenant-1", (event) =>
    changeEvents.push(event),
  );

  const document = plannerDocument();
  const saved = await repository.savePlannerState({
    tenantId: "tenant-1",
    userId: "user-1",
    state: document,
    originClientInstanceId: "instance-writer",
  });
  assert.equal(saved.state.plans.length, 3);
  assert.equal(changeEvents.length, 1);
  assert.deepEqual(changeEvents[0].domains, ["plans"]);
  assert.equal(changeEvents[0].originClientInstanceId, "instance-writer");
  assert.equal(
    saved.state.plans.find((plan) => plan.id === "plan-2").items[0].designation,
    "M1",
  );
  assert.equal(saved.state.activeHorizonProfileId, "paris-horizon");

  // The same document written again — a page writing back what it read,
  // with a stamp of its own — changes nothing and signals nothing: another
  // page open on the space would read it again and write in turn
  // (PORTAL-SYNC-LOOP-01).
  const restamped = {
    ...document,
    sync: {
      version: 1,
      deviceId: "another-browser",
      updatedAt: "2026-11-05T09:00:00.000Z",
    },
  };
  await repository.savePlannerState({
    tenantId: "tenant-1",
    userId: "user-1",
    state: restamped,
    originClientInstanceId: "instance-other",
  });
  assert.equal(changeEvents.length, 1, "a save that changes nothing");
  // A change of the context alone (the night shown) is still one.
  await repository.savePlannerState({
    tenantId: "tenant-1",
    userId: "user-1",
    state: { ...restamped, activePlanId: "plan-1" },
    originClientInstanceId: "instance-other",
  });
  assert.equal(changeEvents.length, 2, "the context changed");
  await repository.savePlannerState({
    tenantId: "tenant-1",
    userId: "user-1",
    state: restamped,
    originClientInstanceId: "instance-writer",
  });
  changeEvents.length = 1;

  counters.planItemReads = 0;
  const loaded = await repository.plannerState("tenant-1");
  assert.equal(counters.planItemReads, 1);
  assert.deepEqual(
    Object.fromEntries(
      loaded.plans.map((plan) => [plan.id, plan.items.map((item) => item.id)]),
    ),
    {
      "plan-1": ["m31", "m42"],
      "plan-2": ["m1"],
      "plan-3": ["m13"],
    },
  );
  assert.equal(
    loaded.plans.find((plan) => plan.id === "plan-3").status,
    "archived",
  );
  // The document's `knownLocations` are the visitor's store in the browser:
  // the whole-document save of a space neither writes them nor reads them
  // back (`/v1/places`).
  assert.equal("knownLocations" in loaded, false);
  assert.equal(
    Number(
      (
        await driver.query(
          "SELECT COUNT(*) AS count FROM known_locations WHERE tenant_id = ?",
          ["tenant-1"],
        )
      ).rows[0].count,
    ),
    0,
  );
  // A plan keeps its own copy of the place.
  assert.equal(
    loaded.plans.find((plan) => plan.id === "plan-1").location.name,
    document.knownLocations[0].name,
  );

  const firstImport = await repository.savePlannerState({
    tenantId: "tenant-1",
    userId: "user-1",
    state: document,
    sourceHash: "planner-export-v1",
    importOnly: true,
  });
  const repeatedImport = await repository.savePlannerState({
    tenantId: "tenant-1",
    userId: "user-1",
    state: document,
    sourceHash: "planner-export-v1",
    importOnly: true,
  });
  assert.equal(firstImport.imported, true);
  assert.equal(repeatedImport.imported, false);
  // The first import: `plans` only, never `places`. The repeated import is
  // a dedup no-op (same sourceHash): no event at all.
  assert.equal(changeEvents.length, 2);
  assert.deepEqual(changeEvents[1].domains, ["plans"]);
  unsubscribeChanges();

  await assert.rejects(
    repository.savePlannerState({
      tenantId: "tenant-1",
      userId: "user-1",
      state: { plans: null },
    }),
    /plans array/,
  );
  assert.equal((await repository.plannerState("tenant-1")).plans.length, 3);
}

async function exercisePayloadBridge(driver) {
  const tenantId = "tenant-payload";
  const userId = "user-payload";
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, "Payload observatory", timestamp],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [userId, "payload@example.test", "scrypt$test", timestamp],
  );
  let repository = await createPlannerStateRepository({ driver });
  const document = plannerDocument();
  await repository.savePlannerState({ tenantId, userId, state: document });
  const readRows = async () =>
    (
      await driver.query(
        // The live plans: a deleted one stays in the trash (30 days).
        "SELECT id, client_id, revision, payload_json FROM plans WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY client_id",
        [tenantId],
      )
    ).rows;

  // A save that explicitly names a pre-existing plan as deleted must
  // materialize that NULL payload before preserving it as a history row and
  // applying the browser's deletion semantics (a plan merely absent from
  // the document, with no explicit deletedPlanIds entry, must survive
  // instead — asserted separately below).
  const archivedPlan = (await readRows()).find(
    (row) => row.client_id === "plan-3",
  );
  assert.ok(archivedPlan);
  await driver.run(
    "UPDATE plans SET payload_json = NULL, revision = 1 WHERE id = ?",
    [archivedPlan.id],
  );
  const withoutArchived = structuredClone(document);
  withoutArchived.plans = withoutArchived.plans.filter(
    (plan) => plan.id !== "plan-3",
  );
  withoutArchived.deletedPlanIds = ["plan-3"];
  await repository.savePlannerState({
    tenantId,
    userId,
    state: withoutArchived,
  });
  // SPACE-DATA-MANAGE-01: the deletion goes to the trash (30 days), it no
  // longer removes the row.
  assert.equal(
    Number(
      (
        await driver.query(
          "SELECT COUNT(*) AS count FROM plans WHERE id = ? AND deleted_at IS NOT NULL AND purge_at IS NOT NULL",
          [archivedPlan.id],
        )
      ).rows[0]?.count,
    ),
    1,
  );
  const migratedDeletionHistory = (
    await driver.query(
      "SELECT revision, state, payload_json FROM plan_versions WHERE tenant_id = ? AND plan_id = ?",
      [tenantId, archivedPlan.id],
    )
  ).rows;
  assert.equal(migratedDeletionHistory.length, 1);
  assert.deepEqual(
    [
      Number(migratedDeletionHistory[0].revision),
      migratedDeletionHistory[0].state,
      JSON.parse(migratedDeletionHistory[0].payload_json).id,
    ],
    [1, "history", "plan-3"],
  );

  // Simulate two tenants with normalized plans that existed before migration
  // 15 added its nullable representation column. Recreating the repository
  // performs the one-time all-tenant startup backfill without an API read.
  const startupTenantId = "tenant-startup";
  const startupUserId = "user-startup";
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [startupTenantId, "Startup observatory", timestamp],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [startupUserId, "startup@example.test", "scrypt$test", timestamp],
  );
  await repository.savePlannerState({
    tenantId: startupTenantId,
    userId: startupUserId,
    state: plannerDocument(),
  });
  await driver.run(
    "UPDATE plans SET payload_json = NULL, revision = 1 WHERE tenant_id = ?",
    [tenantId],
  );
  await driver.run(
    "UPDATE plans SET payload_json = NULL, revision = 1 WHERE tenant_id = ?",
    [startupTenantId],
  );
  repository = await createPlannerStateRepository({ driver });
  const backfilled = await readRows();
  assert.deepEqual(
    backfilled.map((row) => Number(row.revision)),
    [1, 1],
  );
  const loaded = await repository.plannerState(tenantId);
  for (const row of backfilled)
    assert.deepEqual(
      JSON.parse(row.payload_json),
      loaded.plans.find((plan) => plan.id === row.client_id),
    );
  const startupRows = (
    await driver.query(
      "SELECT revision, payload_json FROM plans WHERE tenant_id = ? ORDER BY client_id",
      [startupTenantId],
    )
  ).rows;
  assert.equal(startupRows.length, 3);
  assert.ok(
    startupRows.every(
      (row) => Number(row.revision) === 1 && row.payload_json !== null,
    ),
  );
  const originalPlan = backfilled.find((row) => row.client_id === "plan-1");
  assert.ok(originalPlan);
  assert.equal(await repository.backfillPlanPayloads(tenantId), 0);

  // Reordering JSON object keys in an otherwise identical browser document
  // must not create a mobile resource revision.
  const reordered = structuredClone(withoutArchived);
  const firstPlan = reordered.plans[0];
  reordered.plans[0] = {
    items: firstPlan.items.map((item) => ({
      durationMinutes: item.durationMinutes,
      designation: item.designation,
      id: item.id,
    })),
    status: firstPlan.status,
    moonSeparationMinimum: firstPlan.moonSeparationMinimum,
    minAltitude: firstPlan.minAltitude,
    equipment: {
      telescopeId: firstPlan.equipment.telescopeId,
      mode: firstPlan.equipment.mode,
    },
    location: {
      horizonMask: firstPlan.location.horizonMask,
      timeZone: firstPlan.location.timeZone,
      longitude: firstPlan.location.longitude,
      latitude: firstPlan.location.latitude,
      name: firstPlan.location.name,
      version: firstPlan.location.version,
      id: firstPlan.location.id,
    },
    nightId: firstPlan.nightId,
    name: firstPlan.name,
    date: firstPlan.date,
    id: firstPlan.id,
  };
  await repository.savePlannerState({ tenantId, userId, state: reordered });
  assert.deepEqual(
    (await readRows()).map((row) => Number(row.revision)),
    [1, 1],
  );
  assert.equal(
    Number(
      (
        await driver.query(
          "SELECT COUNT(*) AS count FROM plan_versions WHERE tenant_id = ? AND plan_id = ?",
          [tenantId, originalPlan.id],
        )
      ).rows[0]?.count,
    ),
    0,
  );

  const changed = structuredClone(reordered);
  const changedPlan = changed.plans.find((plan) => plan.id === "plan-1");
  changedPlan.name = "Early targets revised";
  changedPlan.items[0].durationMinutes = 91;
  await repository.savePlannerState({ tenantId, userId, state: changed });
  const afterChange = (await readRows()).find(
    (row) => row.client_id === "plan-1",
  );
  assert.ok(afterChange);
  assert.equal(afterChange.id, originalPlan.id);
  assert.equal(Number(afterChange.revision), 2);
  assert.equal(
    JSON.parse(afterChange.payload_json).items[0].durationMinutes,
    91,
  );
  const beforeDeletion = (
    await driver.query(
      "SELECT revision, state, payload_json FROM plan_versions WHERE tenant_id = ? AND plan_id = ? ORDER BY revision",
      [tenantId, originalPlan.id],
    )
  ).rows;
  assert.equal(beforeDeletion.length, 1);
  assert.deepEqual(
    {
      revision: Number(beforeDeletion[0].revision),
      state: beforeDeletion[0].state,
      payload: JSON.parse(beforeDeletion[0].payload_json),
    },
    {
      revision: 1,
      state: "history",
      payload: JSON.parse(originalPlan.payload_json),
    },
  );

  const deleting = structuredClone(changed);
  deleting.plans = deleting.plans.filter((plan) => plan.id !== "plan-1");
  deleting.deletedPlanIds = [...(deleting.deletedPlanIds || []), "plan-1"];
  await repository.savePlannerState({ tenantId, userId, state: deleting });
  // To the trash: hidden, kept 30 days.
  assert.equal(
    Number(
      (
        await driver.query(
          "SELECT COUNT(*) AS count FROM plans WHERE id = ? AND deleted_at IS NULL",
          [originalPlan.id],
        )
      ).rows[0]?.count,
    ),
    0,
  );
  const preserved = (
    await driver.query(
      "SELECT revision, state, payload_json FROM plan_versions WHERE tenant_id = ? AND plan_id = ? ORDER BY revision",
      [tenantId, originalPlan.id],
    )
  ).rows;
  assert.deepEqual(
    preserved.map((row) => [Number(row.revision), row.state]),
    [
      [1, "history"],
      [2, "history"],
    ],
  );
  assert.deepEqual(
    JSON.parse(preserved[1].payload_json),
    JSON.parse(afterChange.payload_json),
  );

  // The positive half of the same fix: a plan a device wrote directly
  // through the /v1/plans/{planId} resource route (never through this
  // full-document save) is not an implicit deletion candidate just because
  // this browser document has never carried it.
  const deviceRepository = await createPlanResourceRepository({ driver });
  const devicePlanId = randomUUID();
  const created = await deviceRepository.writePlanResource({
    tenantId,
    userId,
    planId: devicePlanId,
    expectedRevision: 0,
    payload: {
      id: "device-only-plan",
      date: "2026-09-20",
      name: "Created on a phone",
      items: [],
    },
  });
  assert.equal(created.created, true);
  const untouched = structuredClone(deleting);
  await repository.savePlannerState({ tenantId, userId, state: untouched });
  assert.equal(
    Number(
      (
        await driver.query("SELECT COUNT(*) AS count FROM plans WHERE id = ?", [
          devicePlanId,
        ])
      ).rows[0]?.count,
    ),
    1,
  );
  const stillListed = await deviceRepository.getPlanResource({
    tenantId,
    planId: devicePlanId,
  });
  assert.equal(stillListed?.payload?.id, "device-only-plan");
}

test("planner state repository preserves a complete document on SQLite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-planner-repository-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    await exercise(driver);
    await exercisePayloadBridge(driver);
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "planner state repository preserves a complete document on PostgreSQL",
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
      await exercise(driver);
      await exercisePayloadBridge(driver);
    } finally {
      if (driver) await driver.close();
      await resetSchema();
    }
  },
);

// Regression coverage for the non-deterministic tiebreak fixed by migration
// 21 (plan-versions-monotonic-tiebreak). `latestPreservedPlanVersion`
// (planner-state-repository.js) answers a write conflict against a deleted/
// missing plan with "the most recent preserved plan_versions row". Before
// the fix its query was `ORDER BY created_at DESC, id DESC`: `id` is a
// randomUUID(), so whenever two rows shared `created_at` (routine — it is
// an ISO-8601 string with millisecond resolution, and a history row
// archived by the write that *won* a conflict and a set-aside row archived
// by the write that *lost* the very same conflict share both `created_at`
// and `revision`) the selection depended on which random id
// happened to sort higher — a coin flip, confirmed empirically at ~50/50
// against the pre-fix query. This test forces that exact tie (same
// created_at, same revision, two fresh random ids) many times and asserts
// the row actually written last is always the one returned.
async function exerciseLatestPreservedVersionTiebreak(driver, dialect) {
  const tenantId = "tenant-tiebreak";
  const userId = "user-tiebreak";
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, "Tiebreak observatory", timestamp],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [userId, "tiebreak@example.test", "scrypt$test", timestamp],
  );
  const repository = await createPlanResourceRepository({ driver, dialect });

  for (let trial = 0; trial < 20; trial += 1) {
    const planId = `plan-tiebreak-${trial}`;
    // Same created_at, same revision, distinct random ids — inserted in a
    // known order so the test can tell whether the query honored it.
    await driver.run(
      "INSERT INTO plan_versions (id, tenant_id, plan_id, revision, state, origin_device_id, payload_json, created_at, purge_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        randomUUID(),
        tenantId,
        planId,
        1,
        "history",
        null,
        JSON.stringify({ marker: "written-first" }),
        timestamp,
        null,
      ],
    );
    await driver.run(
      "INSERT INTO plan_versions (id, tenant_id, plan_id, revision, state, origin_device_id, payload_json, created_at, purge_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        randomUUID(),
        tenantId,
        planId,
        1,
        "set_aside",
        null,
        JSON.stringify({ marker: "written-second" }),
        timestamp,
        null,
      ],
    );

    // No live `plans` row for planId, so writePlanResource takes its
    // "!current" branch and answers via latestPreservedPlanVersion.
    const result = await repository.writePlanResource({
      tenantId,
      userId,
      planId,
      expectedRevision: 1,
      payload: {
        date: "2026-09-14",
        id: planId,
        items: [],
        name: "Tiebreak plan",
        status: "active",
      },
      timestamp,
    });
    assert.equal(result.kind, "conflict");
    assert.equal(
      result.serverPayload?.marker,
      "written-second",
      `trial ${trial}: expected the version written last, not the one whose random id happened to sort highest`,
    );
  }
}

test("latestPreservedPlanVersion picks the version written last, never the one with the larger random id, on SQLite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-planner-tiebreak-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    await exerciseLatestPreservedVersionTiebreak(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "latestPreservedPlanVersion picks the version written last, never the one with the larger random id, on PostgreSQL",
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
      await exerciseLatestPreservedVersionTiebreak(driver, "postgres");
    } finally {
      if (driver) await driver.close();
      await resetSchema();
    }
  },
);

// `PUT /api/plans` (the web planner's full-document save,
// `savePlannerState`) must follow exactly the same framing-integrity path
// as `PUT /v1/plans/{id}` (`writePlanResource`) — dehydrate an item's
// `target` before it is ever stored, keep `plan_framings` in step in the
// same transaction, and refuse only the one plan naming a `framingId` this
// tenant's framing library does not have. `savePlannerState` once skipped
// all three: `plan_framings` stayed empty for a web-only plan forever, so a
// framing it referenced never locked or shared.
async function exercisePlannerStateFramings(driver, dialect) {
  const tenantId = "tenant-framings-web";
  const userId = "user-framings-web";
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, "Web framings observatory", timestamp],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [userId, "web-framings@example.test", "scrypt$test", timestamp],
  );

  const framingRepository = await createFramingResourceRepository({
    driver,
    dialect,
  });
  const framingId = randomUUID();
  const createdFraming = await framingRepository.write({
    tenantId,
    userId,
    framingId,
    expectedRevision: 0,
    name: "Web framing",
    payload: { target: { center: { ra: 10.5, dec: 41.2 } } },
  });
  assert.equal(createdFraming.created, true);

  const changeEvents = [];
  const unsubscribeChanges = subscribe(tenantId, (event) =>
    changeEvents.push(event),
  );

  const plannerRepository = await createPlannerStateRepository({
    driver,
    dialect,
  });

  const documentWith = (planAStatus) => ({
    plans: [
      {
        id: "plan-a",
        date: "2026-09-24",
        name: "Web plan with a framing",
        status: planAStatus,
        items: [
          {
            id: "item-a1",
            framingId,
            // A plan write is never a backdoor to edit a framing: this
            // stale/foreign content must be discarded on write, never
            // stored, regardless of what the browser sends alongside the
            // bare `framingId` reference.
            target: {
              id: framingId,
              plannerSource: "framing",
              framingId,
              framing: { center: { ra: 999, dec: -999 } },
              title: "Client-side stale copy",
            },
          },
        ],
      },
      {
        id: "plan-b",
        date: "2026-09-24",
        name: "Web plan with an unknown framing",
        status: "pending",
        items: [{ id: "item-b1", framingId: "framing-does-not-exist" }],
      },
    ],
  });

  const saved = await plannerRepository.savePlannerState({
    tenantId,
    userId,
    state: documentWith("pending"),
  });
  // plan-b's unknown framingId refuses plan-b only; plan-a is saved.
  assert.deepEqual(saved.framingMissingPlanIds, ["plan-b"]);
  assert.deepEqual(
    saved.state.plans.map((plan) => plan.id),
    ["plan-a"],
  );
  assert.equal(changeEvents.length, 1);
  assert.deepEqual(changeEvents[0].domains, ["plans", "framings"]);

  const planARow = (
    await driver.query(
      "SELECT id FROM plans WHERE tenant_id = ? AND client_id = ?",
      [tenantId, "plan-a"],
    )
  ).rows[0];
  assert.ok(planARow, "plan-a must have been written");

  const planBRow = (
    await driver.query(
      "SELECT id FROM plans WHERE tenant_id = ? AND client_id = ?",
      [tenantId, "plan-b"],
    )
  ).rows[0];
  assert.equal(planBRow, undefined, "plan-b must not have been written");

  // `plan_framings` is populated for the web-saved plan (it never was
  // before).
  const planFramingRows = (
    await driver.query(
      "SELECT framing_id FROM plan_framings WHERE tenant_id = ? AND plan_id = ?",
      [tenantId, planARow.id],
    )
  ).rows;
  assert.deepEqual(
    planFramingRows.map((row) => row.framing_id),
    [framingId],
  );

  // The stored item is dehydrated: whatever `target`/`target.framing`
  // content the browser sent is discarded, only the bare reference remains.
  const storedItem = JSON.parse(
    (
      await driver.query(
        "SELECT details_json FROM plan_items WHERE plan_id = ?",
        [planARow.id],
      )
    ).rows[0].details_json,
  );
  assert.deepEqual(storedItem.target, {
    id: framingId,
    plannerSource: "framing",
    framingId,
  });

  // Referenced by one pending plan only: "shared".
  const usageAfterFirstSave = await framingRepository.get({
    tenantId,
    framingId,
  });
  assert.equal(usageAfterFirstSave.state, "shared");

  // Re-saving with plan-a marked executed must lock the framing — it never
  // did before, because `plan_framings` stayed empty for a web-only plan.
  const savedExecuted = await plannerRepository.savePlannerState({
    tenantId,
    userId,
    state: documentWith("executed"),
  });
  assert.deepEqual(savedExecuted.framingMissingPlanIds, ["plan-b"]);
  const usageAfterExecuted = await framingRepository.get({
    tenantId,
    framingId,
  });
  assert.equal(usageAfterExecuted.state, "locked");

  unsubscribeChanges();

  // Parity with the v1 single-plan route (writePlanResource): a plan
  // created there referencing the SAME framing is counted by the exact same
  // usage computation as the plan the web full-document save wrote above,
  // and an unknown framingId is refused there the same way.
  const planResourceRepository = await createPlanResourceRepository({
    driver,
    dialect,
  });
  const v1PlanId = randomUUID();
  const v1Written = await planResourceRepository.writePlanResource({
    tenantId,
    userId,
    planId: v1PlanId,
    expectedRevision: 0,
    payload: {
      id: "v1-plan-with-framing",
      date: "2026-09-24",
      name: "v1 plan with the same framing",
      items: [{ id: "item-v1", framingId }],
    },
  });
  assert.equal(v1Written.created, true);
  const usageWithBoth = await framingRepository.get({ tenantId, framingId });
  assert.equal(usageWithBoth.state, "locked");
  assert.ok(
    usageWithBoth.usage.pendingPlans.some((plan) => plan.planId === v1PlanId),
  );
  assert.ok(
    usageWithBoth.usage.executedPlans.some(
      (plan) => plan.planId === planARow.id,
    ),
  );

  const v1Missing = await planResourceRepository.writePlanResource({
    tenantId,
    userId,
    planId: randomUUID(),
    expectedRevision: 0,
    payload: {
      id: "v1-plan-missing-framing",
      date: "2026-09-24",
      name: "v1 plan with an unknown framing",
      items: [{ id: "item-v1-missing", framingId: "framing-does-not-exist" }],
    },
  });
  assert.equal(v1Missing.kind, "framing_missing");
  assert.deepEqual(v1Missing.missingFramingIds, ["framing-does-not-exist"]);
}

test("savePlannerState (the web full-document save) applies the same framing-write path as writePlanResource on SQLite", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "astro-planner-framings-web-"),
  );
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    await exercisePlannerStateFramings(driver, "sqlite");
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "savePlannerState (the web full-document save) applies the same framing-write path as writePlanResource on PostgreSQL",
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
      await exercisePlannerStateFramings(driver, "postgres");
    } finally {
      if (driver) await driver.close();
      await resetSchema();
    }
  },
);

// The settings of a diverged plan. The browser changed the name and the
// minimum altitude, a phone changed the mount and the same minimum
// altitude; the merge composes each setting from its side.
async function withFieldDivergence(action) {
  const directory = await mkdtemp(join(tmpdir(), "astro-plan-fields-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    await seedIdentity(driver);
    const repository = await createPlannerStateRepository({ driver });
    const resources = await createPlanResourceRepository({ driver });
    const tenantId = "tenant-1";
    const userId = "user-1";
    const document = plannerDocument();
    document.plans = [
      {
        ...document.plans[0],
        equipment: {
          mode: "imaging",
          telescopeId: "scope-1",
          mountId: "az-gti",
        },
      },
    ];
    await repository.savePlannerState({ tenantId, userId, state: document });
    const browserState = await repository.plannerState(tenantId);
    const browserPlan = browserState.plans[0];
    const row = (
      await driver.query(
        "SELECT id, payload_json FROM plans WHERE client_id = ?",
        ["plan-1"],
      )
    ).rows[0];
    const stored = JSON.parse(row.payload_json);
    const device = await resources.writePlanResource({
      tenantId,
      userId,
      planId: row.id,
      expectedRevision: 1,
      payload: {
        ...stored,
        minAltitude: 35,
        equipment: { ...stored.equipment, mountId: "eq6-r-pro" },
      },
    });
    assert.equal(device.resource.revision, 2);
    const stale = await repository.savePlannerState({
      tenantId,
      userId,
      state: {
        ...browserState,
        plans: [{ ...browserPlan, name: "Web draft", minAltitude: 20 }],
      },
    });
    assert.deepEqual(stale.divergentPlanIds, ["plan-1"]);
    await action({ repository, tenantId, userId });
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
}

test("a divergence keeps its base revision: the modal reads the common base and the newer side", async () => {
  await withFieldDivergence(async ({ repository, tenantId }) => {
    const versions = await repository.planVersions({
      tenantId,
      clientId: "plan-1",
    });
    assert.equal(versions.setAside.revision, 1);
    assert.equal(versions.base.minAltitude, 28);
    assert.equal(versions.base.equipment.mountId, "az-gti");
    assert.ok(["local", "other"].includes(versions.newer));
  });
});

test("a merge with fields takes each setting from its side", async () => {
  await withFieldDivergence(async ({ repository, tenantId, userId }) => {
    await assert.rejects(
      repository.resolvePlanDivergence({
        tenantId,
        userId,
        clientId: "plan-1",
        choice: "merged",
        items: [],
        fields: {},
      }),
      (error) =>
        error.code === "plan_field_choice_required" &&
        error.fields.join() === "minAltitude",
    );
    await assert.rejects(
      repository.resolvePlanDivergence({
        tenantId,
        userId,
        clientId: "plan-1",
        choice: "merged",
        items: [],
        fields: { minAltitude: "local", colour: "other" },
      }),
      (error) => error.code === "invalid_plan_field",
    );
    const resolved = await repository.resolvePlanDivergence({
      tenantId,
      userId,
      clientId: "plan-1",
      choice: "merged",
      items: [{ id: "m31", designation: "M31", durationMinutes: 90 }],
      fields: { minAltitude: "local" },
    });
    assert.equal(resolved.revision, 3);
    assert.equal(resolved.payload.name, "Web draft");
    assert.equal(resolved.payload.minAltitude, 20);
    assert.equal(resolved.payload.equipment.mountId, "eq6-r-pro");
    assert.deepEqual(
      resolved.payload.items.map((item) => item.id),
      ["m31"],
    );
  });
});

test("an older browser sending no fields keeps the live plan's settings (compatibility rule)", async () => {
  await withFieldDivergence(async ({ repository, tenantId, userId }) => {
    const resolved = await repository.resolvePlanDivergence({
      tenantId,
      userId,
      clientId: "plan-1",
      choice: "merged",
      items: [],
    });
    assert.equal(resolved.payload.name, "Early targets");
    assert.equal(resolved.payload.minAltitude, 35);
    assert.equal(resolved.payload.equipment.mountId, "eq6-r-pro");
  });
});
