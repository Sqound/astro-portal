import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPlanResourceService } from "../dist/api/plan-resources.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import {
  createPlannerStateRepository,
  nightPlaceConflictsOf,
} from "../dist/persistence/planner-state-repository.js";

// The rule « une nuit = un lieu ». The service never stores a night with two
// places: the plans still to plan of a date share the place
// (`409 plan_night_place_conflict`, nothing written). The places and the plan
// names are fictional.

const at = "2026-10-20T12:00:00.000Z";
const lacNoir = { name: "Lac Noir", latitude: "46.5", longitude: "6.6" };
const chezMoi = { name: "Chez moi", latitude: "35.68", longitude: "139.69" };
const unlimited = {
  "planner.multiple": true,
  "planner.mosaic": false,
  "pointing.solve": false,
  "sync.plan_limit": 50,
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
};

async function withSpace(run, capabilities = unlimited) {
  const directory = await mkdtemp(join(tmpdir(), "astro-night-place-"));
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
      capabilities,
      now: () => at,
    });
    const write = ({
      name,
      date = "2026-10-20",
      location = lacNoir,
      planId = randomUUID(),
      revision = 0,
      movingPlanIds = [],
      extra = {},
    }) =>
      service.write({
        tenantId,
        userId,
        planId,
        ifMatch: `"${revision}"`,
        movingPlanIds,
        payload: {
          id: name,
          date,
          name,
          location,
          equipment: { mode: "imaging" },
          status: "active",
          items: [],
          ...extra,
        },
      });
    const count = async () =>
      (
        await driver.query(
          "SELECT COUNT(*) AS n FROM plans WHERE tenant_id = ?",
          [tenantId],
        )
      ).rows[0].n;
    await run({ driver, tenantId, userId, service, write, count });
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
}

test("a plan of another place on the date of a night is refused, with the place the night holds", async () => {
  await withSpace(async ({ write, count }) => {
    await write({ name: "Plan 1", location: lacNoir });
    await assert.rejects(
      write({ name: "Plan 2", location: chezMoi }),
      (error) => {
        assert.equal(error.code, "plan_night_place_conflict");
        assert.equal(error.status, 409);
        assert.deepEqual(error.planIds, ["Plan 2"]);
        assert.equal(error.body.date, "2026-10-20");
        assert.equal(error.body.nightPlace.location.name, "Lac Noir");
        assert.deepEqual(error.body.nightPlace.plans, [
          { id: "Plan 1", name: "Plan 1" },
        ]);
        assert.equal(error.body.error.code, "plan_night_place_conflict");
        return true;
      },
    );
    assert.equal(await count(), 1, "nothing was written");
  });
});

test("the same place, another date, and a name for the place are never conflicts", async () => {
  await withSpace(async ({ write, count }) => {
    await write({ name: "Plan 1", location: lacNoir });
    await write({
      name: "Plan 2",
      location: { ...lacNoir, name: "The black lake" },
    });
    await write({ name: "Plan 3", date: "2026-10-21", location: chezMoi });
    assert.equal(await count(), 3);
  });
});

test("moving a plan to another place is refused while another plan of the date stays, allowed when it is moving too", async () => {
  await withSpace(async ({ write, service, tenantId }) => {
    const first = randomUUID();
    const second = randomUUID();
    await write({ name: "Plan 1", planId: first });
    await write({ name: "Plan 2", planId: second });
    await assert.rejects(
      write({ name: "Plan 1", planId: first, revision: 1, location: chezMoi }),
      (error) => error.code === "plan_night_place_conflict",
    );
    // A device that moves the night plan by plan names the plans that follow.
    await write({
      name: "Plan 1",
      planId: first,
      revision: 1,
      location: chezMoi,
      movingPlanIds: [second],
    });
    await write({
      name: "Plan 2",
      planId: second,
      revision: 1,
      location: chezMoi,
      movingPlanIds: [first],
    });
    const stored = await service.get({ tenantId, planId: second });
    assert.equal(stored.payload.location.name, "Chez moi");
  });
});

test("a plan that ran, was abandoned or archived keeps its place and takes no part", async () => {
  await withSpace(async ({ write, driver, count }) => {
    const ran = randomUUID();
    await write({ name: "Ran", planId: ran, location: chezMoi });
    await driver.run("UPDATE plans SET status = ? WHERE id = ?", [
      "executed",
      ran,
    ]);
    await write({ name: "New", location: lacNoir });
    // A plan the device closed (`closedAs`) while it stays pending for the
    // service is a night that happened: no part either.
    await write({
      name: "Closed on the phone",
      location: chezMoi,
      extra: { closedAs: "abandoned" },
    });
    assert.equal(await count(), 3);
    // ... and a plan to plan is held to the one the night to come has.
    await assert.rejects(
      write({ name: "Other", location: chezMoi }),
      (error) => error.code === "plan_night_place_conflict",
    );
  });
});

test("data stored before the rule is not locked by it: a plan that keeps its date and place is still written", async () => {
  await withSpace(async ({ write, driver }) => {
    const first = randomUUID();
    const second = randomUUID();
    await write({ name: "Plan 1", planId: first, location: lacNoir });
    await write({ name: "Plan 2", planId: second, location: lacNoir });
    // Plan 2 was stored at another place before the rule existed.
    await driver.run("UPDATE plans SET location_json = ? WHERE id = ?", [
      JSON.stringify(chezMoi),
      second,
    ]);
    await write({
      name: "Plan 2",
      planId: second,
      revision: 1,
      location: chezMoi,
      extra: { minAltitude: 35 },
    });
  });
});

test("an unusable place has no conflict to make", async () => {
  await withSpace(async ({ write, count }) => {
    await write({ name: "Plan 1", location: lacNoir });
    await write({ name: "Without place", location: null });
    await write({ name: "Blank place", location: { name: "" } });
    // The legacy 0,0 null-island placeholder is « no place » (the service
    // already reads it so for the night boundaries): it neither conflicts
    // with the place of the date nor counts.
    await write({
      name: "Placeholder",
      location: { name: "Placeholder", latitude: 0, longitude: 0 },
    });
    assert.equal(await count(), 4);
  });
});

function document(plans) {
  return {
    schemaVersion: 2,
    date: "2026-10-20",
    nights: plans.map(({ id, location, date }) => ({
      id: `night-${id}`,
      date: date ?? "2026-10-20",
      location,
    })),
    activeNightId: `night-${plans[0].id}`,
    plans: plans.map(({ id, location, status = "pending", date }) => ({
      id,
      name: id,
      date: date ?? "2026-10-20",
      nightId: `night-${id}`,
      location,
      status,
      equipment: { mode: "imaging" },
      items: [],
    })),
  };
}

test("the whole-document save refuses a night with two places, and accepts a whole night moved", async () => {
  await withSpace(async ({ driver, tenantId, userId }) => {
    const repository = await createPlannerStateRepository({ driver });
    const save = (state) =>
      repository.savePlannerState({ tenantId, userId, state });
    await save(
      document([
        { id: "Plan 1", location: lacNoir },
        { id: "Plan 2", location: lacNoir },
      ]),
    );
    await assert.rejects(
      save(
        document([
          { id: "Plan 1", location: lacNoir },
          { id: "Plan 2", location: chezMoi },
        ]),
      ),
      (error) => {
        assert.equal(error.code, "plan_night_place_conflict");
        assert.equal(error.status, 409);
        assert.deepEqual(error.planIds, ["Plan 2"]);
        assert.equal(error.date, "2026-10-20");
        return true;
      },
    );
    const stored = await repository.plannerState(tenantId);
    assert.deepEqual(
      stored.plans.map((plan) => plan.location.name),
      ["Lac Noir", "Lac Noir"],
      "nothing of the refused save was stored",
    );
    // Every plan of the night moves in one save: never refused halfway.
    await save(
      document([
        { id: "Plan 1", location: chezMoi },
        { id: "Plan 2", location: chezMoi },
      ]),
    );
    const moved = await repository.plannerState(tenantId);
    assert.deepEqual(
      moved.plans.map((plan) => plan.location.name),
      ["Chez moi", "Chez moi"],
    );
  });
});

test("the whole-document save counts the stored plans it does not carry, and not the plans that ran", async () => {
  await withSpace(async ({ driver, tenantId, userId, write }) => {
    await write({ name: "Phone plan", location: lacNoir });
    const repository = await createPlannerStateRepository({ driver });
    // A plan of the phone the browser has not learned about yet counts.
    await assert.rejects(
      repository.savePlannerState({
        tenantId,
        userId,
        state: document([{ id: "Web plan", location: chezMoi }]),
      }),
      (error) => error.code === "plan_night_place_conflict",
    );
    // A plan that ran, in the document, is history.
    await repository.savePlannerState({
      tenantId,
      userId,
      state: document([
        { id: "Phone plan", location: lacNoir },
        { id: "Ran", location: chezMoi, status: "executed" },
      ]),
    });
  });
});

test("a free space: a second plan on the date at another place makes no second night (rule 3)", async () => {
  await withSpace(
    async ({ write, count }) => {
      await write({ name: "Plan 1", location: lacNoir });
      await assert.rejects(
        write({ name: "Plan 2", location: chezMoi }),
        (error) =>
          ["plan_limit_reached", "plan_night_place_conflict"].includes(
            error.code,
          ) && error.status === 409,
      );
      assert.equal(await count(), 1, "never two nights, never two plans");
    },
    { ...unlimited, "planner.multiple": false },
  );
});

test("the pure rule: the plans that disagree on a date, the written ones only", () => {
  const plan = (clientId, date, location, counts = true) => ({
    clientId,
    name: clientId,
    date,
    location,
    counts,
  });
  const plans = [
    plan("a", "2026-10-20", lacNoir),
    plan("b", "2026-10-20", chezMoi),
    plan("c", "2026-10-21", chezMoi),
    plan("d", "2026-10-20", chezMoi, false),
  ];
  assert.deepEqual(
    nightPlaceConflictsOf(plans, ["a"]).map((entry) => [
      entry.plan.clientId,
      entry.others.map((other) => other.clientId),
    ]),
    [["a", ["b"]]],
  );
  assert.deepEqual(nightPlaceConflictsOf(plans, ["c"]), []);
  assert.deepEqual(nightPlaceConflictsOf(plans, ["d"]), []);
});
