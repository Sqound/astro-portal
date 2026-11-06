import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createFramingResourceService,
  FramingResourceError,
} from "../dist/api/framing-resources.js";
import { createPlanResourceService } from "../dist/api/plan-resources.js";
import { subscribe } from "../dist/api/change-bus.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";

const initialTime = "2026-09-14T20:00:00.000Z";
const unlimitedCapabilities = {
  "planner.multiple": true,
  "planner.mosaic": true,
  "pointing.solve": true,
  "sync.plan_limit": 0,
  "gallery.private": true,
  "capture.variant_limit": 0,
  "analysis.logs": false,
  "analysis.progression": false,
  "storage.max_file_bytes": 0,
  "storage.quota_bytes": 0,
  "portal.invitations": false,
  "capture.count_limit": 9007199254740991,
  "capture.public": true,
  "history.retention_days": 90,
};
const noMosaicCapabilities = {
  ...unlimitedCapabilities,
  "planner.mosaic": false,
};

function framingPayload({
  ra = 10.5,
  dec = 41.2,
  catalogueTargetId = null,
} = {}) {
  return {
    target: {
      id: `framing-target-${randomUUID()}`,
      plannerSource: "framing",
      objects: ["M31"],
      matchedTargets: [],
      center: { ra, dec },
      field: { width: 1.5, height: 1, shape: "rectangle" },
      savedAt: initialTime,
    },
    catalogueTargetId,
    angleDegrees: 0,
  };
}

// A framing that stores a sky surface to cover with several panels: what
// `planner.mosaic` holds back.
function mosaicFramingPayload(options) {
  const payload = framingPayload(options);
  payload.target.framing = {
    mosaic: { widthDegrees: 3, heightDegrees: 2, overlapPercent: 15 },
  };
  return payload;
}

function planPayload({
  clientId = `browser-${randomUUID()}`,
  name = "Tonight",
  items = [],
} = {}) {
  return {
    id: clientId,
    date: "2026-09-14",
    name,
    location: { name: "Tokyo", latitude: "35.68", longitude: "139.76" },
    equipment: { mode: "imaging", telescopeId: "scope-1" },
    items,
  };
}

function framingReferenceItem(framingId, itemId = `item-${randomUUID()}`) {
  return {
    id: itemId,
    framingId,
    target: {
      id: framingId,
      plannerSource: "framing",
      framingId,
      // A client is allowed to send other target content alongside
      // `framingId`; the server must discard it rather than store it.
      title: "Whatever the client still had cached",
    },
  };
}

async function seedIdentity(driver, tenantId, userId) {
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, `Observatory ${tenantId}`, initialTime],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [userId, `${userId}@example.test`, "scrypt$test", initialTime],
  );
  await driver.run(
    "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
    [randomUUID(), tenantId, userId, "owner", initialTime],
  );
}

async function insertSessionFor(driver, tenantId, planId) {
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, plan_id, started_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), tenantId, planId, initialTime, "open", initialTime],
  );
}

// Used both for a framing write/read (FramingResourceError) and for a plan
// write refused because it references an unknown framing (PlanResourceError,
// `framing_missing` — thrown by `plan-resources.js`, not this module's own
// service): both share the same `code`/`status`/`body` contract.
async function expectError(action, { code, status }) {
  await assert.rejects(action, (error) => {
    assert.equal(typeof error.code, "string");
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });
}

async function exerciseFramingResources(driver) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const otherTenantId = randomUUID();
  const otherUserId = randomUUID();
  await seedIdentity(driver, tenantId, userId);
  await seedIdentity(driver, otherTenantId, otherUserId);

  const framings = await createFramingResourceService({
    driver,
    capabilities: unlimitedCapabilities,
  });
  const readOnlyProfile = await createFramingResourceService({
    driver,
    capabilities: noMosaicCapabilities,
  });
  const plans = await createPlanResourceService({
    driver,
    capabilities: unlimitedCapabilities,
  });

  // --- creation, and capability gating (reading never needs the
  // capability: a single-field framing never does either, a mosaic does --
  // `exerciseMosaicGate` below) ------------------------------------
  await expectError(
    () =>
      readOnlyProfile.write({
        tenantId,
        userId,
        framingId: randomUUID(),
        ifMatch: '"0"',
        name: "Andromeda mosaic",
        payload: mosaicFramingPayload(),
      }),
    { code: "capability_required", status: 403 },
  );

  const changeEvents = [];
  const unsubscribe = subscribe(tenantId, (event) => changeEvents.push(event));

  const framingId = randomUUID();
  const created = await framings.write({
    tenantId,
    userId,
    framingId,
    ifMatch: '"0"',
    name: "Andromeda wide field",
    payload: framingPayload(),
    originClientInstanceId: "instance-writer",
  });
  assert.equal(created.created, true);
  assert.equal(created.resource.revision, 1);
  assert.equal(created.resource.name, "Andromeda wide field");
  assert.equal(created.resource.state, "free");
  assert.deepEqual(created.resource.usage, {
    executedPlans: [],
    pendingPlans: [],
  });
  assert.equal(created.resource.payload.angleDegrees, 0);
  assert.equal(changeEvents.length, 1);
  assert.deepEqual(changeEvents[0].domains, ["framings"]);
  assert.equal(changeEvents[0].originClientInstanceId, "instance-writer");

  // Reading never needs the capability.
  const readBack = await readOnlyProfile.get({ tenantId, framingId });
  assert.equal(readBack.name, "Andromeda wide field");

  // --- tenant isolation ---------------------------------------------------
  await expectError(
    () => framings.get({ tenantId: otherTenantId, framingId }),
    { code: "framing_not_found", status: 404 },
  );

  // --- update, and a stale write becomes a `409` naming the current
  // resource (never overwritten, never silently discarded) -----------
  // The exact same payload object is reused for the "rename-only" write
  // further down: `framingPayload()` mints a fresh random target id on
  // every call, which would make even an unchanged geometry look edited.
  const stableGeometryPayload = framingPayload({ ra: 11 });
  const updated = await framings.write({
    tenantId,
    userId,
    framingId,
    ifMatch: '"1"',
    name: "Andromeda wide field (v2)",
    payload: stableGeometryPayload,
  });
  assert.equal(updated.created, false);
  assert.equal(updated.resource.revision, 2);
  assert.equal(changeEvents.length, 2);

  await expectError(
    () =>
      framings.write({
        tenantId,
        userId,
        framingId,
        ifMatch: '"1"',
        name: "Stale write",
        payload: framingPayload(),
      }),
    { code: "framing_conflict", status: 409 },
  );
  assert.equal(changeEvents.length, 2); // a refusal writes nothing

  // --- referencing this framing from a plan: `shared`, hydration, and the
  // `plans` + `framings` signal pairing -----------------
  const planId = randomUUID();
  const planCreated = await plans.write({
    tenantId,
    userId,
    planId,
    ifMatch: '"0"',
    payload: planPayload({
      items: [framingReferenceItem(framingId, "item-1")],
    }),
  });
  assert.equal(changeEvents.length, 3);
  const planFramingsEvent = changeEvents.at(-1);
  assert.deepEqual([...planFramingsEvent.domains].sort(), [
    "framings",
    "plans",
  ]);

  // The served plan item is HYDRATED: the client's own stray `target.title`
  // is gone, replaced by the framing's own target, its current name, its
  // revision and its usage state.
  const servedItem = planCreated.resource.payload.items[0];
  assert.equal(servedItem.framingId, framingId);
  assert.equal(servedItem.target.framingId, framingId);
  assert.equal(servedItem.target.title, "Andromeda wide field (v2)");
  assert.equal(servedItem.target.designation, "Andromeda wide field (v2)");
  assert.equal(servedItem.target.framingRevision, 2);
  assert.equal(servedItem.target.framingState, "shared");

  const gotPlan = await plans.get({ tenantId, planId });
  assert.equal(gotPlan.payload.items[0].target.framingState, "shared");

  const sharedFraming = await framings.get({ tenantId, framingId });
  assert.equal(sharedFraming.state, "shared");
  assert.equal(sharedFraming.usage.pendingPlans.length, 1);
  assert.equal(sharedFraming.usage.pendingPlans[0].planId, planId);

  // A DEHYDRATED write: what the server actually stored has target reduced
  // to the bare reference, regardless of what the client sent.
  const storedItem = (
    await driver.query(
      "SELECT details_json FROM plan_items WHERE plan_id = ?",
      [planId],
    )
  ).rows[0];
  const storedTarget = JSON.parse(storedItem.details_json).target;
  assert.deepEqual(storedTarget, {
    id: framingId,
    plannerSource: "framing",
    framingId,
  });

  // Renaming a `shared` framing is an ordinary write (only `locked`
  // restricts to a rename).
  await framings.write({
    tenantId,
    userId,
    framingId,
    ifMatch: '"2"',
    name: "Andromeda wide field (v3)",
    payload: stableGeometryPayload,
  });

  // --- locking: a session on the referencing plan makes the framing
  // `locked`, even before any debriefing --------------------------
  await insertSessionFor(driver, tenantId, planId);
  const lockedFraming = await framings.get({ tenantId, framingId });
  assert.equal(lockedFraming.state, "locked");
  assert.equal(lockedFraming.usage.executedPlans.length, 1);

  // Renaming a locked framing is allowed, directly, no copy.
  const renamed = await framings.write({
    tenantId,
    userId,
    framingId,
    ifMatch: '"3"',
    name: "Andromeda wide field (final name)",
    payload: stableGeometryPayload, // same geometry: rename-only diff
  });
  assert.equal(renamed.resource.name, "Andromeda wide field (final name)");
  assert.equal(renamed.resource.revision, 4);

  // Anything beyond the name is refused while locked.
  await expectError(
    () =>
      framings.write({
        tenantId,
        userId,
        framingId,
        ifMatch: '"4"',
        name: "Andromeda wide field (final name)",
        payload: framingPayload({ ra: 12 }), // geometry changed too
      }),
    { code: "framing_locked", status: 409 },
  );

  // `DELETE` on a `locked` framing archives instead of deleting.
  const archived = await framings.remove({
    tenantId,
    userId,
    framingId,
    ifMatch: '"4"',
  });
  assert.deepEqual(Object.keys(archived).sort(), ["archived", "framing"]);
  assert.equal(archived.archived, true);
  assert.ok(archived.framing.archivedAt);

  // An archived framing refuses every write except restore.
  await expectError(
    () =>
      framings.write({
        tenantId,
        userId,
        framingId,
        ifMatch: `"${archived.framing.revision}"`,
        name: "Anything",
        payload: framingPayload(),
      }),
    { code: "framing_archived", status: 409 },
  );
  await expectError(
    () =>
      framings.remove({
        tenantId,
        userId,
        framingId,
        ifMatch: `"${archived.framing.revision}"`,
      }),
    { code: "framing_archived", status: 409 },
  );

  // The plan referencing it still reads it just fine, archived ("an
  // archived framing stays readable wherever a plan references it").
  const stillHydrated = await plans.get({ tenantId, planId });
  assert.equal(stillHydrated.payload.items[0].target.framingState, "archived");

  // Restore brings it back to the library.
  const restored = await framings.restore({ tenantId, userId, framingId });
  assert.equal(restored.archivedAt, null);
  assert.equal(restored.revision, archived.framing.revision + 1);

  // `framing_not_archived`.
  await expectError(() => framings.restore({ tenantId, userId, framingId }), {
    code: "framing_not_archived",
    status: 409,
  });

  // --- a SECOND, unlocked framing exercises the `shared` -> retire ->
  // delete lifecycle and the `409 framing_in_use` refusal ------------------
  const freeFramingId = randomUUID();
  await framings.write({
    tenantId,
    userId,
    framingId: freeFramingId,
    ifMatch: '"0"',
    name: "Orion nebula",
    payload: framingPayload({ ra: 83.8, dec: -5.4 }),
  });
  const secondPlanId = randomUUID();
  await plans.write({
    tenantId,
    userId,
    planId: secondPlanId,
    ifMatch: '"0"',
    payload: planPayload({
      items: [framingReferenceItem(freeFramingId, "item-1")],
    }),
  });
  await expectError(
    () =>
      framings.remove({
        tenantId,
        userId,
        framingId: freeFramingId,
        ifMatch: '"1"',
      }),
    { code: "framing_in_use", status: 409 },
  );
  // The client retires the reference from the pending plan, then replays.
  await plans.write({
    tenantId,
    userId,
    planId: secondPlanId,
    ifMatch: '"1"',
    payload: planPayload({ clientId: `browser-${secondPlanId}`, items: [] }),
  });
  const nowFree = await framings.remove({
    tenantId,
    userId,
    framingId: freeFramingId,
    ifMatch: '"1"',
  });
  assert.equal(nowFree, undefined); // 204-equivalent: deleted outright
  await expectError(
    () => framings.get({ tenantId, framingId: freeFramingId }),
    { code: "framing_not_found", status: 404 },
  );

  // --- a plan referencing an unknown framing is refused, never silently
  // dropped (`409 framing_missing`) -------------------------------
  await expectError(
    () =>
      plans.write({
        tenantId,
        userId,
        planId: randomUUID(),
        ifMatch: '"0"',
        payload: planPayload({
          items: [framingReferenceItem(randomUUID())],
        }),
      }),
    { code: "framing_missing", status: 409 },
  );

  // --- listing: archived included, deleted excluded -----------------------
  const listed = await framings.list({ tenantId });
  const listedIds = listed.framings.map((framing) => framing.id).sort();
  assert.deepEqual(listedIds, [framingId].sort()); // only the restored one remains
  unsubscribe();
}

// A framing of a single field is the planner's own and is written, renamed,
// archived and restored without `planner.mosaic`; a mosaic is refused
// `capability_required`, written or restored, and a profile that lost the
// capability still reads and clears it up.
async function exerciseMosaicGate(driver) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  await seedIdentity(driver, tenantId, userId);
  const withMosaics = await createFramingResourceService({
    driver,
    capabilities: unlimitedCapabilities,
  });
  const withoutMosaics = await createFramingResourceService({
    driver,
    capabilities: noMosaicCapabilities,
  });
  const plans = await createPlanResourceService({
    driver,
    capabilities: unlimitedCapabilities,
  });

  // A single field: created, renamed, archived (locked by an executed
  // plan) and restored with no `planner.mosaic` at all.
  const singleId = randomUUID();
  const single = framingPayload();
  const created = await withoutMosaics.write({
    tenantId,
    userId,
    framingId: singleId,
    ifMatch: '"0"',
    name: "Andromeda wide field",
    payload: single,
  });
  assert.equal(created.created, true);
  const renamed = await withoutMosaics.write({
    tenantId,
    userId,
    framingId: singleId,
    ifMatch: '"1"',
    name: "Andromeda, renamed",
    payload: single,
  });
  assert.equal(renamed.resource.name, "Andromeda, renamed");

  // A mosaic: refused without the capability, written with it.
  await expectError(
    () =>
      withoutMosaics.write({
        tenantId,
        userId,
        framingId: randomUUID(),
        ifMatch: '"0"',
        name: "Andromeda mosaic",
        payload: mosaicFramingPayload(),
      }),
    { code: "capability_required", status: 403 },
  );
  // Turning a single field into a mosaic is a mosaic write.
  await expectError(
    () =>
      withoutMosaics.write({
        tenantId,
        userId,
        framingId: singleId,
        ifMatch: '"2"',
        name: "Andromeda, renamed",
        payload: mosaicFramingPayload(),
      }),
    { code: "capability_required", status: 403 },
  );
  const mosaicId = randomUUID();
  const mosaic = mosaicFramingPayload({ ra: 83.8, dec: -5.4 });
  await withMosaics.write({
    tenantId,
    userId,
    framingId: mosaicId,
    ifMatch: '"0"',
    name: "Orion mosaic",
    payload: mosaic,
  });
  // …and a profile without it renames nothing of it, but reads it.
  await expectError(
    () =>
      withoutMosaics.write({
        tenantId,
        userId,
        framingId: mosaicId,
        ifMatch: '"1"',
        name: "Orion, renamed",
        payload: mosaic,
      }),
    { code: "capability_required", status: 403 },
  );
  assert.equal(
    (await withoutMosaics.get({ tenantId, framingId: mosaicId })).name,
    "Orion mosaic",
  );

  // Both used on a night that was observed (locked), then archived by
  // `DELETE`.
  const planId = randomUUID();
  await plans.write({
    tenantId,
    userId,
    planId,
    ifMatch: '"0"',
    payload: planPayload({
      items: [
        framingReferenceItem(singleId, "item-single"),
        framingReferenceItem(mosaicId, "item-mosaic"),
      ],
    }),
  });
  await insertSessionFor(driver, tenantId, planId);
  const archivedSingle = await withoutMosaics.remove({
    tenantId,
    userId,
    framingId: singleId,
    ifMatch: '"2"',
  });
  assert.equal(archivedSingle?.archived, true);
  const archivedMosaic = await withoutMosaics.remove({
    tenantId,
    userId,
    framingId: mosaicId,
    ifMatch: '"1"',
  });
  assert.equal(archivedMosaic?.archived, true);

  // Restoring: the single field comes back, the mosaic needs the capability.
  const restored = await withoutMosaics.restore({
    tenantId,
    userId,
    framingId: singleId,
  });
  assert.equal(restored.archivedAt, null);
  await expectError(
    () => withoutMosaics.restore({ tenantId, userId, framingId: mosaicId }),
    { code: "capability_required", status: 403 },
  );
  const restoredMosaic = await withMosaics.restore({
    tenantId,
    userId,
    framingId: mosaicId,
  });
  assert.equal(restoredMosaic.archivedAt, null);
}

test("framing resources enforce the locking, archiving, hydration and stale-write rules, and hold back only mosaics, on scratch SQLite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-framing-resources-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    await exerciseFramingResources(driver);
    await exerciseMosaicGate(driver);
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "framing resources enforce the locking, archiving, hydration and stale-write rules, and hold back only mosaics, on PostgreSQL",
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
      await exerciseFramingResources(driver);
      await exerciseMosaicGate(driver);
    } finally {
      if (driver) await driver.close();
      await resetSchema();
    }
  },
);
