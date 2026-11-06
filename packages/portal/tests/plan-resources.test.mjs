import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createPlanResourceService,
  PlanResourceError,
} from "../dist/api/plan-resources.js";
import { subscribe } from "../dist/api/change-bus.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { createPlannerStateRepository } from "../dist/persistence/planner-state-repository.js";
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

function payload({
  clientId = `browser-${randomUUID()}`,
  date = "2026-09-14",
  name = "Tonight",
  items = [{ id: "m31", designation: "M31", durationMinutes: 60 }],
} = {}) {
  return {
    id: clientId,
    date,
    name,
    location: { name: "Tokyo", latitude: "35.68", longitude: "139.76" },
    equipment: { mode: "imaging", telescopeId: "scope-1" },
    minAltitude: 30,
    status: "active",
    items,
  };
}

function legacyDocument(plans) {
  return {
    schemaVersion: 2,
    date: "2026-09-14",
    plans: plans.map((plan) => ({
      ...plan,
      nightId: "night-1",
      status: "pending",
    })),
    knownLocations: [],
    horizonProfiles: [],
    activeHorizonProfileId: null,
    nights: [{ id: "night-1", date: "2026-09-14" }],
    activeNightId: "night-1",
    activePlanId: null,
    unassignedHorizonProfiles: [],
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

async function expectError(action, { code, status }) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof PlanResourceError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    assert.deepEqual(error.body.error, { code, message: error.message });
    return true;
  });
}

async function exercisePlanResources(driver) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const otherTenantId = randomUUID();
  const otherUserId = randomUUID();
  await seedIdentity(driver, tenantId, userId);
  await seedIdentity(driver, otherTenantId, otherUserId);

  let currentTime = initialTime;
  const unlimited = await createPlanResourceService({
    driver,
    capabilities: unlimitedCapabilities,
    now: () => currentTime,
  });
  const limited = await createPlanResourceService({
    driver,
    capabilities: {
      ...unlimitedCapabilities,
      "sync.plan_limit": 1,
    },
    now: () => currentTime,
  });

  assert.deepEqual(
    await unlimited.capabilitiesFor(userId),
    unlimitedCapabilities,
  );

  // A validated plan write emits exactly one `plans` change event for its
  // own tenant, carrying the writer's clientInstanceId so the future SSE
  // route (6b.6) can withhold it from that same instance.
  const changeEvents = [];
  const unsubscribeChanges = subscribe(tenantId, (event) =>
    changeEvents.push(event),
  );

  const planId = randomUUID();
  const firstPayload = payload({ clientId: "browser-current" });
  const created = await unlimited.write({
    tenantId,
    userId,
    planId,
    ifMatch: '"0"',
    payload: firstPayload,
    originDeviceId: randomUUID(),
    originClientInstanceId: "instance-writer",
  });
  assert.equal(created.created, true);
  assert.equal(changeEvents.length, 1);
  assert.deepEqual(changeEvents[0].domains, ["plans"]);
  assert.equal(changeEvents[0].originClientInstanceId, "instance-writer");

  // A conflicting write (stale If-Match) is refused and writes nothing: no
  // second event.
  await expectError(
    () =>
      unlimited.write({
        tenantId,
        userId,
        planId,
        ifMatch: '"0"',
        payload: firstPayload,
      }),
    { code: "invalid_creation_revision", status: 409 },
  );
  assert.equal(changeEvents.length, 1);
  unsubscribeChanges();
  assert.equal(created.resource.id, planId);
  assert.equal(created.resource.revision, 1);
  assert.equal(created.resource.status, "active");
  assert.equal(created.resource.payload.status, "active");

  const stored = (
    await driver.query(
      "SELECT status, revision, payload_json, settings_json FROM plans WHERE id = ? AND tenant_id = ?",
      [planId, tenantId],
    )
  ).rows[0];
  assert.equal(stored.status, "pending");
  assert.equal(Number(stored.revision), 1);
  assert.equal(JSON.parse(stored.payload_json).id, "browser-current");
  assert.equal(JSON.parse(stored.settings_json).name, "Tonight");

  const secondPayload = payload({
    clientId: "browser-current",
    name: "Tonight revised",
    items: [
      { id: "m42", designation: "M42", durationMinutes: 45 },
      { id: "m31", designation: "M31", durationMinutes: 90 },
    ],
  });
  const updated = await unlimited.write({
    tenantId,
    userId,
    planId,
    ifMatch: '"1"',
    payload: secondPayload,
  });
  assert.equal(updated.created, false);
  assert.equal(updated.resource.revision, 2);
  assert.equal(updated.resource.payload.name, "Tonight revised");
  assert.deepEqual(updated.resource.payload, secondPayload);
  const items = (
    await driver.query(
      "SELECT client_id FROM plan_items WHERE plan_id = ? ORDER BY created_at, client_id",
      [planId],
    )
  ).rows.map((row) => row.client_id);
  assert.deepEqual(items, ["m42", "m31"]);
  const legacyReader = await createPlannerStateRepository({ driver });
  const legacyPlan = (await legacyReader.plannerState(tenantId)).plans.find(
    (plan) => plan.id === "browser-current",
  );
  assert.equal(legacyPlan.name, "Tonight revised");
  assert.equal(legacyPlan.status, "pending");
  assert.deepEqual(
    legacyPlan.items.map((item) => item.id),
    ["m42", "m31"],
  );

  let conflict;
  await assert.rejects(
    unlimited.write({
      tenantId,
      userId,
      planId,
      ifMatch: '"1"',
      payload: payload({
        clientId: "browser-current",
        name: "Field copy",
      }),
    }),
    (error) => {
      conflict = error;
      assert.ok(error instanceof PlanResourceError);
      assert.equal(error.code, "plan_conflict");
      assert.equal(error.status, 409);
      assert.equal(error.serverRevision, 2);
      assert.equal(error.serverPayload.name, "Tonight revised");
      assert.match(error.versionId, /^[0-9a-f-]{36}$/i);
      // The versionId must reach the serialized 409 body too, not just the
      // in-process error object, so a client can restore it directly.
      assert.equal(error.body.versionId, error.versionId);
      return true;
    },
  );
  assert.ok(conflict);
  const versions = await unlimited.versions({ tenantId, planId });
  assert.deepEqual(
    versions.versions
      .map((version) => [version.revision, version.state])
      .sort((left, right) => left[1].localeCompare(right[1])),
    [
      [1, "history"],
      [1, "set_aside"],
    ],
  );
  assert.equal(
    versions.versions.find(
      (version) => version.versionId === conflict.versionId,
    ).purgeAfter,
    "2026-11-13T20:00:00.000Z",
  );
  assert.deepEqual(
    versions.versions.find((version) => version.state === "history").payload,
    firstPayload,
  );

  const restored = await unlimited.restore({
    tenantId,
    userId,
    planId,
    versionId: conflict.versionId,
  });
  assert.equal(restored.revision, 3);
  assert.equal(restored.payload.name, "Field copy");

  await expectError(() => unlimited.get({ tenantId: otherTenantId, planId }), {
    code: "plan_not_found",
    status: 404,
  });
  await expectError(
    () =>
      limited.write({
        tenantId,
        userId,
        planId: randomUUID(),
        ifMatch: '"0"',
        payload: payload({ clientId: "browser-over-limit" }),
      }),
    { code: "plan_limit_reached", status: 409 },
  );

  const futurePlanId = randomUUID();
  await unlimited.write({
    tenantId,
    userId,
    planId: futurePlanId,
    ifMatch: '"0"',
    payload: payload({
      clientId: "browser-next",
      date: "2026-09-16",
      name: "Next clear night",
      items: [{ id: "m45", designation: "M45", durationMinutes: 75 }],
    }),
  });
  const briefing = await unlimited.briefing({ tenantId });
  assert.equal(briefing.currentPlan.id, planId);
  assert.equal(briefing.currentPlan.nextTarget, "M31");
  assert.equal(briefing.nextPlan.id, futurePlanId);
  assert.equal(briefing.nextPlan.nextTarget, "M45");
  // The fixture's payload() carries a real place (Tokyo), so a v1 write now
  // derives a real nightEndAt for it ("The night boundaries of a plan")
  // instead of the literal null this assertion used to check.
  assert.notEqual(briefing.nextPlan.nightEndAt, null);
  assert.equal(briefing.nextPlan.countdownAt, briefing.nextPlan.nightEndAt);

  await driver.run("UPDATE plans SET status = ? WHERE id = ?", [
    "executed",
    planId,
  ]);
  await expectError(
    () =>
      unlimited.write({
        tenantId,
        userId,
        planId,
        ifMatch: '"3"',
        payload: payload({ clientId: "browser-current", name: "Frozen write" }),
      }),
    { code: "plan_frozen", status: 409 },
  );

  const expiredVersionId = randomUUID();
  await driver.run(
    "INSERT INTO plan_versions (id, tenant_id, plan_id, revision, state, payload_json, created_at, purge_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      expiredVersionId,
      tenantId,
      planId,
      1,
      "set_aside",
      JSON.stringify(firstPayload),
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
    ],
  );
  const afterPurge = await unlimited.versions({ tenantId, planId });
  assert.equal(
    afterPurge.versions.some(
      (version) => version.versionId === expiredVersionId,
    ),
    false,
  );

  await driver.run("DELETE FROM plan_items WHERE plan_id = ?", [planId]);
  await driver.run("DELETE FROM plans WHERE id = ?", [planId]);
  const recreated = await unlimited.restore({
    tenantId,
    userId,
    planId,
    versionId: conflict.versionId,
  });
  assert.equal(recreated.id, planId);
  assert.equal(recreated.status, "active");
  assert.equal(recreated.payload.name, "Field copy");

  await expectError(
    () =>
      unlimited.write({
        tenantId,
        userId,
        planId: randomUUID(),
        ifMatch: null,
        payload: payload({ clientId: "no-precondition" }),
      }),
    { code: "precondition_required", status: 428 },
  );
  await expectError(
    () =>
      unlimited.write({
        tenantId,
        userId,
        planId: randomUUID(),
        ifMatch: '"0"',
        payload: { ...payload(), tenantId },
      }),
    { code: "invalid_payload", status: 400 },
  );
}

async function exercisePlanDeletion(driver) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const otherTenantId = randomUUID();
  const otherUserId = randomUUID();
  await seedIdentity(driver, tenantId, userId);
  await seedIdentity(driver, otherTenantId, otherUserId);

  let currentTime = initialTime;
  const service = await createPlanResourceService({
    driver,
    capabilities: unlimitedCapabilities,
    now: () => currentTime,
  });
  const legacy = await createPlannerStateRepository({ driver });

  const planId = randomUUID();
  const keptPlanId = randomUUID();
  const deletedPayload = payload({
    clientId: "browser-deleted",
    name: "Deleted intention",
  });
  const keptPayload = payload({
    clientId: "browser-kept",
    name: "Kept intention",
  });
  await service.write({
    tenantId,
    userId,
    planId,
    ifMatch: '"0"',
    payload: deletedPayload,
  });
  await service.write({
    tenantId,
    userId,
    planId: keptPlanId,
    ifMatch: '"0"',
    payload: keptPayload,
  });

  await expectError(
    () => service.remove({ tenantId, userId, planId, ifMatch: null }),
    { code: "precondition_required", status: 428 },
  );
  await expectError(
    () => service.remove({ tenantId, userId, planId, ifMatch: '"0"' }),
    { code: "invalid_if_match", status: 400 },
  );
  await expectError(
    () => service.remove({ tenantId, userId, planId, ifMatch: '"7"' }),
    { code: "plan_conflict", status: 409 },
  );
  await expectError(
    () =>
      service.remove({
        tenantId: otherTenantId,
        userId: otherUserId,
        planId,
        ifMatch: '"1"',
      }),
    { code: "plan_not_found", status: 404 },
  );

  assert.equal(
    await service.remove({ tenantId, userId, planId, ifMatch: '"1"' }),
    undefined,
  );
  await expectError(() => service.get({ tenantId, planId }), {
    code: "plan_not_found",
    status: 404,
  });
  await expectError(
    () => service.remove({ tenantId, userId, planId, ifMatch: '"1"' }),
    { code: "plan_not_found", status: 404 },
  );
  assert.deepEqual(
    (await service.list({ tenantId })).plans.map((plan) => plan.id),
    [keptPlanId],
  );
  assert.deepEqual(
    (await legacy.plannerState(tenantId)).plans.map((plan) => plan.id),
    ["browser-kept"],
  );

  // A legacy whole-document save of the document the browser held before the
  // deletion must not resurrect the plan, nor duplicate its client id.
  await legacy.savePlannerState({
    tenantId,
    userId,
    state: legacyDocument([deletedPayload, keptPayload]),
  });
  assert.deepEqual(
    (await legacy.plannerState(tenantId)).plans.map((plan) => plan.id),
    ["browser-kept"],
  );
  assert.deepEqual(
    (await service.list({ tenantId })).plans.map((plan) => plan.id),
    [keptPlanId],
  );
  const deletedRows = (
    await driver.query(
      "SELECT id, deleted_at FROM plans WHERE tenant_id = ? AND client_id = ?",
      [tenantId, "browser-deleted"],
    )
  ).rows;
  assert.equal(deletedRows.length, 1);
  assert.equal(deletedRows[0].id, planId);
  assert.equal(deletedRows[0].deleted_at, initialTime);

  // A device that still holds the plan conflicts against the archived payload
  // and its own submission stays restorable.
  currentTime = "2026-09-14T21:00:00.000Z";
  let conflict;
  await assert.rejects(
    service.write({
      tenantId,
      userId,
      planId,
      ifMatch: '"1"',
      payload: payload({
        clientId: "browser-deleted",
        name: "Field copy of a deleted plan",
      }),
    }),
    (error) => {
      conflict = error;
      assert.ok(error instanceof PlanResourceError);
      assert.equal(error.code, "plan_conflict");
      assert.equal(error.status, 409);
      assert.equal(error.serverRevision, 1);
      assert.equal(error.serverPayload.name, "Deleted intention");
      return true;
    },
  );
  const versions = await service.versions({ tenantId, planId });
  assert.equal(
    versions.versions.filter((version) => version.state === "history").length,
    1,
  );
  const setAside = versions.versions.find(
    (version) => version.state === "set_aside",
  );
  assert.equal(setAside.versionId, conflict.versionId);

  const restored = await service.restore({
    tenantId,
    userId,
    planId,
    versionId: setAside.versionId,
  });
  assert.equal(restored.id, planId);
  assert.equal(restored.revision, 2);
  assert.equal(restored.status, "active");
  assert.equal(restored.payload.name, "Field copy of a deleted plan");
  assert.equal((await service.get({ tenantId, planId })).revision, 2);
  assert.equal(
    (await legacy.plannerState(tenantId)).plans.some(
      (plan) => plan.id === "browser-deleted",
    ),
    true,
  );

  // A plan that is history (executed, archived) is refused while a live
  // session names it, and goes to the trash once that session is there.
  const frozenPlanId = randomUUID();
  await service.write({
    tenantId,
    userId,
    planId: frozenPlanId,
    ifMatch: '"0"',
    payload: payload({ clientId: "browser-frozen", name: "Executed night" }),
  });
  const frozenSessionId = randomUUID();
  await driver.run(
    `INSERT INTO observation_sessions (id, tenant_id, plan_id, started_at, finished_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'finished', ?, ?)`,
    [
      frozenSessionId,
      tenantId,
      frozenPlanId,
      initialTime,
      initialTime,
      initialTime,
      initialTime,
    ],
  );
  for (const status of ["executed", "archived"]) {
    await driver.run("UPDATE plans SET status = ? WHERE id = ?", [
      status,
      frozenPlanId,
    ]);
    await expectError(
      () =>
        service.remove({
          tenantId,
          userId,
          planId: frozenPlanId,
          ifMatch: '"1"',
        }),
      // A refusal of the request, not a conflict, and a code of its own.
      { code: "plan_not_deletable", status: 403 },
    );
  }
  await driver.run(
    "UPDATE observation_sessions SET deleted_at = ? WHERE id = ?",
    [initialTime, frozenSessionId],
  );
  assert.equal(
    await service.remove({
      tenantId,
      userId,
      planId: frozenPlanId,
      ifMatch: '"1"',
    }),
    undefined,
  );
}

// A night stopped on the phone is carried by the plan sync contract
// (`payload.closedAs`), kept by the service and never rewritten as
// « active » by a later write of the plan or by a stale web copy.
async function exercisePlanClosure(driver) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  await seedIdentity(driver, tenantId, userId);
  let currentTime = initialTime;
  const service = await createPlanResourceService({
    driver,
    capabilities: unlimitedCapabilities,
    now: () => currentTime,
  });
  const legacy = await createPlannerStateRepository({
    driver,
    now: () => currentTime,
  });
  const planId = randomUUID();
  await service.write({
    tenantId,
    userId,
    planId,
    ifMatch: '"0"',
    payload: payload({ clientId: "browser-closed", name: "Closed night" }),
  });
  // The web copy read at revision 1 (it will go stale).
  const staleWebPlan = (await legacy.plannerState(tenantId)).plans.find(
    (plan) => plan.id === "browser-closed",
  );
  assert.equal(staleWebPlan.revision, 1);
  assert.equal(staleWebPlan.closedAs, undefined);

  // The phone stops the night: the push carries the closure. (« abandoned »
  // is decided by the write itself: `debrief-queue-abandoned.test.mjs`.)
  currentTime = "2026-09-14T23:41:00.000Z";
  for (const [index, closedAs] of [
    "executed",
    "partial",
    "archived",
  ].entries()) {
    const written = await service.write({
      tenantId,
      userId,
      planId,
      ifMatch: `"${index + 1}"`,
      payload: {
        ...payload({ clientId: "browser-closed", name: "Closed night" }),
        closedAs,
      },
    });
    // The plan stays active and writable: only the debriefing freezes it.
    assert.equal(written.resource.status, "active");
    assert.equal(written.resource.payload.closedAs, closedAs);
    assert.equal(written.resource.frozenAt, null);
    assert.equal(
      (await service.get({ tenantId, planId })).payload.closedAs,
      closedAs,
    );
  }
  const row = (
    await driver.query("SELECT status, frozen_at FROM plans WHERE id = ?", [
      planId,
    ])
  ).rows[0];
  assert.equal(row.status, "pending");
  assert.equal(row.frozen_at ?? null, null);

  // A value outside the closed list is refused, nothing is written.
  await expectError(
    () =>
      service.write({
        tenantId,
        userId,
        planId,
        ifMatch: '"4"',
        payload: {
          ...payload({ clientId: "browser-closed" }),
          closedAs: "done",
        },
      }),
    { code: "invalid_payload", status: 400 },
  );
  assert.equal((await service.get({ tenantId, planId })).revision, 4);

  // « Reprendre la nuit »: a write that no longer carries it clears it.
  const resumed = await service.write({
    tenantId,
    userId,
    planId,
    ifMatch: '"4"',
    payload: payload({ clientId: "browser-closed", name: "Closed night" }),
  });
  assert.equal(resumed.resource.payload.closedAs, undefined);
  const closedAgain = await service.write({
    tenantId,
    userId,
    planId,
    ifMatch: '"5"',
    payload: {
      ...payload({ clientId: "browser-closed", name: "Closed night" }),
      closedAs: "executed",
    },
  });
  assert.equal(closedAgain.resource.revision, 6);

  // A stale web copy (read at revision 1, without the closure) does not
  // restore the plan: the guard of the revision sets it aside.
  const staleSave = await legacy.savePlannerState({
    tenantId,
    userId,
    state: legacyDocument([{ ...staleWebPlan, name: "Stale web rename" }]),
  });
  assert.deepEqual(staleSave.divergentPlanIds, ["browser-closed"]);
  const afterStale = await service.get({ tenantId, planId });
  assert.equal(afterStale.revision, 6);
  assert.equal(afterStale.payload.name, "Closed night");
  assert.equal(afterStale.payload.closedAs, "executed");

  // A web copy at the current revision that does not know the field (an
  // older browser build) keeps the closure it did not write.
  const currentWebPlan = (await legacy.plannerState(tenantId)).plans.find(
    (plan) => plan.id === "browser-closed",
  );
  assert.equal(currentWebPlan.closedAs, "executed");
  const { closedAs: _dropped, ...withoutClosure } = currentWebPlan;
  await legacy.savePlannerState({
    tenantId,
    userId,
    state: legacyDocument([{ ...withoutClosure, name: "Web rename" }]),
  });
  const afterWeb = await service.get({ tenantId, planId });
  assert.equal(afterWeb.payload.name, "Web rename");
  assert.equal(afterWeb.payload.closedAs, "executed");
  assert.equal(afterWeb.status, "active");

  // The debriefing is the authority: once the plan is frozen its resource
  // status is what a reader takes, whatever the payload still says.
  await driver.run("UPDATE plans SET status = ? WHERE id = ?", [
    "executed",
    planId,
  ]);
  assert.equal((await service.get({ tenantId, planId })).status, "executed");
}

// A night that is too far ahead is not marked executed, in part or
// abandoned — by a device (`payload.closedAs`) or by the web planner (its
// `status`) —, with a refusal that has a name and nothing written. The
// deletion of a plan that is history is a refusal of its own too.
async function exerciseFutureNightClosure(driver) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  await seedIdentity(driver, tenantId, userId);
  // 05:00 on the 15th in Tokyo: the night of the 14th is over, the one of the
  // 15th begins in about fourteen hours.
  const currentTime = initialTime;
  const service = await createPlanResourceService({
    driver,
    capabilities: unlimitedCapabilities,
    now: () => currentTime,
  });
  const legacy = await createPlannerStateRepository({
    driver,
    now: () => currentTime,
  });
  // A night far ahead of both clocks: the service runs on `currentTime`, but
  // the whole-document save (`legacy`) reads the wall clock, so a fixed date
  // turns into "tonight" the day it comes (it did on 2026-10-23, the
  // date this test used to name).
  const later = new Date(Date.now() + 60 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  // Creation with the closure: refused, nothing is created.
  const refusedCreation = randomUUID();
  await expectError(
    () =>
      service.write({
        tenantId,
        userId,
        planId: refusedCreation,
        ifMatch: '"0"',
        payload: {
          ...payload({ clientId: "browser-ahead-created", date: later }),
          closedAs: "executed",
        },
      }),
    { code: "plan_night_not_begun", status: 409 },
  );
  await expectError(() => service.get({ tenantId, planId: refusedCreation }), {
    code: "plan_not_found",
    status: 404,
  });

  // A plan still to come: each mark is refused, the plan stays as it was.
  const aheadId = randomUUID();
  await service.write({
    tenantId,
    userId,
    planId: aheadId,
    ifMatch: '"0"',
    payload: payload({ clientId: "browser-ahead", date: later }),
  });
  for (const closedAs of ["executed", "partial", "abandoned"])
    await expectError(
      () =>
        service.write({
          tenantId,
          userId,
          planId: aheadId,
          ifMatch: '"1"',
          payload: {
            ...payload({ clientId: "browser-ahead", date: later }),
            closedAs,
          },
        }),
      { code: "plan_night_not_begun", status: 409 },
    );
  const untouched = await service.get({ tenantId, planId: aheadId });
  assert.equal(untouched.revision, 1);
  assert.equal(untouched.payload.closedAs, undefined);
  // Archiving a plan ahead is not a mark of a night that happened.
  const archivedAhead = await service.write({
    tenantId,
    userId,
    planId: aheadId,
    ifMatch: '"1"',
    payload: {
      ...payload({ clientId: "browser-ahead", date: later }),
      closedAs: "archived",
    },
  });
  assert.equal(archivedAhead.resource.revision, 2);

  // The night that begins in fourteen hours (the 14th's dusk is the 15th at
  // 10:14 UTC for this place) and the night that is over are not too far: a device that launched the execution in the morning of
  // its day finishes it without being refused.
  for (const date of ["2026-09-14", "2026-08-01"]) {
    const written = await service.write({
      tenantId,
      userId,
      planId: randomUUID(),
      ifMatch: '"0"',
      payload: {
        ...payload({ clientId: `browser-near-${date}`, date }),
        closedAs: "executed",
      },
    });
    assert.equal(written.resource.payload.closedAs, "executed");
  }

  // The night that begins in thirty-eight hours is.
  await expectError(
    () =>
      service.write({
        tenantId,
        userId,
        planId: randomUUID(),
        ifMatch: '"0"',
        payload: {
          ...payload({ clientId: "browser-next-day", date: "2026-09-15" }),
          closedAs: "partial",
        },
      }),
    { code: "plan_night_not_begun", status: 409 },
  );

  // A closure the plan already carries is not asked again: its edits pass.
  const carried = randomUUID();
  await service.write({
    tenantId,
    userId,
    planId: carried,
    ifMatch: '"0"',
    payload: {
      ...payload({ clientId: "browser-carried", date: "2026-09-14" }),
      closedAs: "executed",
    },
  });
  await driver.run("UPDATE plans SET plan_date = ? WHERE id = ?", [
    later,
    carried,
  ]);
  const edited = await service.write({
    tenantId,
    userId,
    planId: carried,
    ifMatch: '"1"',
    payload: {
      ...payload({
        clientId: "browser-carried",
        date: "2026-09-14",
        name: "Edited",
      }),
      closedAs: "executed",
    },
  });
  assert.equal(edited.resource.payload.name, "Edited");

  // The web planner's own mark, by the whole-document save: refused for the
  // plan that is ahead, naming it; accepted for a night that has begun.
  const document = (plans) => ({
    ...legacyDocument([]),
    nights: plans.map((plan) => ({ id: `night-${plan.id}`, date: plan.date })),
    activeNightId: plans.length ? `night-${plans[0].id}` : null,
    plans: plans.map((plan) => ({
      ...plan,
      nightId: `night-${plan.id}`,
    })),
  });
  await legacy.savePlannerState({
    tenantId,
    userId,
    state: document([
      {
        ...payload({ clientId: "browser-web-ahead", date: later }),
        status: "pending",
      },
      {
        ...payload({ clientId: "browser-web-past", date: "2026-09-14" }),
        status: "pending",
      },
    ]),
  });
  await assert.rejects(
    () =>
      legacy.savePlannerState({
        tenantId,
        userId,
        state: document([
          {
            ...payload({ clientId: "browser-web-ahead", date: later }),
            status: "executed",
          },
        ]),
      }),
    (error) => {
      assert.equal(error.code, "plan_night_not_begun");
      assert.equal(error.status, 409);
      assert.deepEqual(error.planIds, ["browser-web-ahead"]);
      return true;
    },
  );
  const afterRefusal = (await legacy.plannerState(tenantId)).plans.find(
    (plan) => plan.id === "browser-web-ahead",
  );
  assert.equal(afterRefusal.status, "pending");
  await legacy.savePlannerState({
    tenantId,
    userId,
    state: document([
      {
        ...payload({ clientId: "browser-web-past", date: "2026-09-14" }),
        status: "executed",
      },
    ]),
  });
  assert.equal(
    (await legacy.plannerState(tenantId)).plans.find(
      (plan) => plan.id === "browser-web-past",
    ).status,
    "executed",
  );

  // The deletion of a plan that is history, by the whole-document save: a
  // refusal that names the plan, which is kept.
  await assert.rejects(
    () =>
      legacy.savePlannerState({
        tenantId,
        userId,
        state: { ...document([]), deletedPlanIds: ["browser-web-past"] },
      }),
    (error) => {
      assert.equal(error.code, "plan_not_deletable");
      assert.equal(error.status, 403);
      assert.deepEqual(error.planIds, ["browser-web-past"]);
      return true;
    },
  );
  assert.ok(
    (await legacy.plannerState(tenantId)).plans.some(
      (plan) => plan.id === "browser-web-past",
    ),
  );
}

test("plan resources preserve optimistic revisions on scratch SQLite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-plan-resources-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    await exercisePlanResources(driver);
    await exercisePlanDeletion(driver);
    await exercisePlanClosure(driver);
    await exerciseFutureNightClosure(driver);
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "plan resources preserve optimistic revisions on PostgreSQL",
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
      await exercisePlanResources(driver);
      await exercisePlanDeletion(driver);
      await exercisePlanClosure(driver);
      await exerciseFutureNightClosure(driver);
    } finally {
      if (driver) await driver.close();
      await resetSchema();
    }
  },
);
