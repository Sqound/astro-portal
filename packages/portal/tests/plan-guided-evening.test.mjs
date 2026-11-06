import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJournalService } from "../dist/api/journal.js";
import { createObservationSessionService } from "../dist/api/observation-sessions.js";
import { createPlanResourceService } from "../dist/api/plan-resources.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { createDebriefRepository } from "../dist/persistence/debrief-repository.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { migrations } from "../dist/persistence/migrations.js";
import { SqliteDriver } from "../dist/persistence/sqlite-driver.js";

// The internal plan of a guided evening (`payload.guidedEvening: true`, made by
// the phone for the sake of the data model) is outside « un plan par nuit »,
// « une nuit = un lieu » and the numeric guard; it is never debriefed and its
// session is not a night to debrief in the Journal. Migration 113 gives the
// service the column it filters on, and catches up the plans already written.

const at = "2026-09-30T20:00:00.000Z";
// The night of 2026-09-20 is past at this instant.
const later = "2026-09-22T12:00:00.000Z";

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

async function withSpace(capabilities, run) {
  const directory = await mkdtemp(join(tmpdir(), "astro-guided-evening-"));
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
    const write = (
      name,
      {
        date = "2026-09-20",
        place = "Site A",
        guided = false,
        planId = randomUUID(),
        revision = 0,
      } = {},
    ) =>
      service.write({
        tenantId,
        userId,
        planId,
        ifMatch: `"${revision}"`,
        payload: {
          id: `browser-${planId}`,
          date,
          name,
          status: "active",
          location: { name: place, latitude: "45", longitude: "-30" },
          equipment: { mode: "imaging" },
          minAltitude: 30,
          ...(guided ? { guidedEvening: true, blankExecution: true } : {}),
          items: guided
            ? []
            : [{ id: "m31", designation: "M31", durationMinutes: 60 }],
        },
      });
    await run({ driver, service, tenantId, userId, write });
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
}

const refusedNight = (error) =>
  error.code === "plan_limit_reached" &&
  error.status === 409 &&
  error.reason === "night";

test("a guided evening lives the same night as the ordinary plan, without planner.multiple, in either order", async () => {
  await withSpace(profile(false, 0), async ({ driver, write }) => {
    const guidedFirst = await write("Les dix étoiles les plus brillantes", {
      guided: true,
    });
    assert.equal(guidedFirst.created, true);
    assert.equal(guidedFirst.resource.payload.guidedEvening, true);
    // The night's ordinary plan is not refused by the guided one…
    assert.equal((await write("Plan de la nuit")).created, true);
    // …and a guided evening is not refused by the ordinary one, at another
    // place either (« une nuit = un lieu » is not its rule).
    assert.equal(
      (await write("Soirée au jardin", { guided: true, place: "Site B" }))
        .created,
      true,
    );
    const rows = (
      await driver.query("SELECT name, guided_evening FROM plans ORDER BY name")
    ).rows;
    assert.deepEqual(
      rows.map((row) => [row.name, Number(row.guided_evening)]),
      [
        ["Les dix étoiles les plus brillantes", 1],
        ["Plan de la nuit", 0],
        ["Soirée au jardin", 1],
      ],
    );
  });
});

test("two ordinary plans on one night are still refused, and the guided plan is not named among the holders", async () => {
  await withSpace(profile(false, 0), async ({ write }) => {
    await write("Soirée guidée du jour", { guided: true });
    const first = await write("Premier plan");
    assert.equal(first.created, true);
    await assert.rejects(write("Second plan"), (error) => {
      assert.ok(refusedNight(error));
      assert.equal(error.date, "2026-09-20");
      assert.deepEqual(
        error.otherPlans.map((plan) => plan.name),
        ["Premier plan"],
      );
      return true;
    });
    // The second plan is refused with the guided one alone on the night, too.
  });
  await withSpace(profile(false, 0), async ({ write }) => {
    await write("Soirée guidée seule", { guided: true });
    assert.equal((await write("Le plan")).created, true);
  });
});

test("a guided evening is never refused: it is outside the night and the numeric guard", async () => {
  // One slot of the numeric guard, taken by an ordinary plan on another night.
  await withSpace(profile(false, 1), async ({ write }) => {
    await write("Plan ordinaire", { date: "2026-09-21" });
    await assert.rejects(
      write("Un autre plan", { date: "2026-09-22" }),
      (error) =>
        error.code === "plan_limit_reached" && error.reason === "guard",
    );
    // The guided evenings take no slot, on a held night or on a free one.
    assert.equal(
      (await write("Soirée A", { date: "2026-09-21", guided: true })).created,
      true,
    );
    assert.equal(
      (await write("Soirée B", { date: "2026-09-23", guided: true })).created,
      true,
    );
    assert.equal(
      (await write("Soirée C", { date: "2026-09-23", guided: true })).created,
      true,
    );
    // And the ordinary plan of a night where evenings were guided is still
    // the only one the guard counts.
    await assert.rejects(
      write("Encore un plan", { date: "2026-09-24" }),
      (error) => error.reason === "guard",
    );
  });
});

test("a guided evening moves to the night of an ordinary plan without a refusal", async () => {
  await withSpace(profile(false, 0), async ({ write }) => {
    await write("Plan de la nuit", { date: "2026-09-20" });
    const planId = randomUUID();
    await write("Soirée guidée", {
      date: "2026-09-19",
      guided: true,
      planId,
      place: "Ailleurs",
    });
    const moved = await write("Soirée guidée", {
      date: "2026-09-20",
      guided: true,
      planId,
      place: "Ailleurs",
      revision: 1,
    });
    assert.equal(moved.resource.revision, 2);
    assert.equal(moved.resource.payload.date, "2026-09-20");
  });
});

test("the guided flag follows the payload on every write", async () => {
  await withSpace(profile(true, 0), async ({ driver, write }) => {
    const planId = randomUUID();
    await write("Soirée", { guided: true, planId });
    const flag = async () =>
      Number(
        (
          await driver.query("SELECT guided_evening FROM plans WHERE id = ?", [
            planId,
          ])
        ).rows[0].guided_evening,
      );
    assert.equal(await flag(), 1);
    await write("Soirée", { guided: false, planId, revision: 1 });
    assert.equal(await flag(), 0);
    await write("Soirée", { guided: true, planId, revision: 2 });
    assert.equal(await flag(), 1);
  });
});

test("migration 113 adds the column and catches up the plans that carry the flag", async () => {
  const migration = migrations.find(({ version }) => version === 113);
  assert.equal(migration.name, "plans-guided-evening");
  const directory = await mkdtemp(join(tmpdir(), "astro-guided-migration-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await applyMigrations(
      driver,
      "sqlite",
      migrations.filter(({ version }) => version <= 112),
    );
    const tenantId = randomUUID();
    await driver.run(
      "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
      [tenantId, "Observatory", at],
    );
    const userId = randomUUID();
    await driver.run(
      "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
      [userId, `${userId}@example.test`, "scrypt$test", at],
    );
    const insert = (id, settings) =>
      driver.run(
        `INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, plan_date, name, status, settings_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, '2026-09-20', ?, 'pending', ?, ?, ?)`,
        [id, tenantId, userId, `browser-${id}`, id, settings, at, at],
      );
    await insert(
      "guided",
      '{"blankExecution":true,"guidedEvening":true,"id":"x"}',
    );
    await insert("false", '{"guidedEvening":false}');
    await insert("ordinary", '{"id":"y"}');
    await insert("empty", null);
    await applyMigrations(driver, "sqlite");
    const flags = Object.fromEntries(
      (
        await driver.query(
          "SELECT name, guided_evening FROM plans ORDER BY name",
        )
      ).rows.map((row) => [row.name, Number(row.guided_evening)]),
    );
    assert.deepEqual(flags, { empty: 0, false: 0, guided: 1, ordinary: 0 });
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test("a guided evening is never in the debrief queue, and its session is no night to debrief in the Journal", async () => {
  await withSpace(profile(true, 0), async ({ driver, tenantId, write }) => {
    const ordinary = await write("Plan de la nuit");
    const guided = await write("Les dix étoiles les plus brillantes", {
      guided: true,
    });
    const debrief = await createDebriefRepository({
      driver,
      dialect: "sqlite",
    });
    const queued = (
      await debrief.queue({ tenantId, timestamp: later })
    ).entries.map((entry) => entry.planId);
    assert.deepEqual(queued, [ordinary.resource.id]);

    // The guided evening ran: a finished session under its plan.
    const sessions = await createObservationSessionService({
      driver,
      dialect: "sqlite",
    });
    const startedAt = "2026-09-20T19:10:00.000Z";
    const { resource } = await sessions.create({
      tenantId,
      planId: guided.resource.id,
      startedAt,
    });
    await sessions.ingestEvents({
      tenantId,
      sessionId: resource.id,
      events: [
        {
          eventId: "01J8Z3K9QZ6N3S6R3E6G8H0010",
          type: "guided_evening",
          payload: { mode: "binoculars", stepsDone: 4 },
          recordedAt: startedAt,
        },
      ],
    });
    await sessions.finish({
      tenantId,
      sessionId: resource.id,
      finishedAt: "2026-09-20T21:00:00.000Z",
    });
    // Finished, the session does not queue its guided plan either.
    assert.deepEqual(
      (await debrief.queue({ tenantId, timestamp: later })).entries.map(
        (entry) => entry.planId,
      ),
      [ordinary.resource.id],
    );

    const journal = await createJournalService({
      driver,
      dialect: "sqlite",
      now: () => later,
    });
    const page = await journal.read({ tenantId, query: {} });
    const lines = page.sessions;
    // The ordinary plan, its night past and carried out without the
    // application, is the one night to debrief; the guided session is a line
    // of its own.
    const guidedLine = lines.find((line) => line.sessionId === resource.id);
    assert.equal(guidedLine.guidedEvening, true);
    assert.equal(guidedLine.state, "no_plan");
    assert.equal(guidedLine.planId, guided.resource.id);
    assert.equal(guidedLine.planName, "Les dix étoiles les plus brillantes");
    assert.equal(guidedLine.plannedSeconds, null);
    assert.deepEqual(guidedLine.targets, []);
    assert.deepEqual(
      lines.filter((line) => line.state === "to_debrief").map((l) => l.planId),
      [ordinary.resource.id],
    );
    assert.equal(page.toDebriefCount, 1);
    for (const line of lines)
      if (line.sessionId !== resource.id)
        assert.equal("guidedEvening" in line, false);
  });
});

test("a guided evening with no session is not a night waiting in the Journal", async () => {
  await withSpace(profile(true, 0), async ({ driver, tenantId, write }) => {
    await write("Soirée jamais lancée", { guided: true });
    const journal = await createJournalService({
      driver,
      dialect: "sqlite",
      now: () => later,
    });
    const page = await journal.read({ tenantId, query: {} });
    assert.deepEqual(page.sessions, []);
    assert.equal(page.toDebriefCount, 0);
  });
});

test("the planner document leaves the guided plan out, and a save keeps it", async () => {
  await withSpace(
    profile(true, 0),
    async ({ driver, tenantId, userId, write }) => {
      const { createPlannerStateRepository } =
        await import("../dist/persistence/planner-state-repository.js");
      const repository = await createPlannerStateRepository({
        driver,
        dialect: "sqlite",
      });
      await write("Soirée", { guided: true });
      await write("Plan de la nuit");
      const document = await repository.plannerState(tenantId);
      assert.deepEqual(
        document.plans.map((plan) => plan.name),
        ["Plan de la nuit"],
      );
      // A save of that document, which does not carry the guided plan, leaves it
      // stored.
      await repository.savePlannerState({
        tenantId,
        userId,
        state: document,
        planLimit: 0,
        plannerMultiple: false,
      });
      const rows = (
        await driver.query(
          "SELECT name, guided_evening FROM plans WHERE deleted_at IS NULL ORDER BY name",
        )
      ).rows;
      assert.deepEqual(
        rows.map((row) => [row.name, Number(row.guided_evening)]),
        [
          ["Plan de la nuit", 0],
          ["Soirée", 1],
        ],
      );
    },
  );
});

test("the whole-document save applies the same exemption to a guided plan, and keeps its flag when a copy omits it", async () => {
  await withSpace(
    profile(false, 0),
    async ({ driver, tenantId, userId, write }) => {
      const { createPlannerStateRepository } =
        await import("../dist/persistence/planner-state-repository.js");
      const repository = await createPlannerStateRepository({
        driver,
        dialect: "sqlite",
      });
      await write("Plan de la nuit");
      const document = await repository.plannerState(tenantId);
      const [ordinary] = document.plans;
      const another = (extra) => ({
        ...ordinary,
        id: `browser-${randomUUID()}`,
        name: "Autre",
        location: { name: "Site B", latitude: 10, longitude: 10 },
        items: [],
        ...extra,
      });
      const save = (plans) =>
        repository.savePlannerState({
          tenantId,
          userId,
          state: { ...document, plans },
          planLimit: 0,
          plannerMultiple: false,
        });
      // An ordinary second plan of the night, at another place: refused.
      await assert.rejects(save([ordinary, another({})]), (error) =>
        ["plan_limit_reached", "plan_night_place_conflict"].includes(
          error.code,
        ),
      );
      // The same plan as a guided evening: accepted and flagged.
      const guided = another({ guidedEvening: true, blankExecution: true });
      await save([ordinary, guided]);
      const flag = async () =>
        Number(
          (
            await driver.query(
              "SELECT guided_evening FROM plans WHERE client_id = ?",
              [guided.id],
            )
          ).rows[0].guided_evening,
        );
      assert.equal(await flag(), 1);
      // A copy of that plan that does not carry the flag (an older build)
      // does not take it away.
      const { guidedEvening: _flag, ...bare } = guided;
      await save([ordinary, { ...bare, name: "Autre renommée" }]);
      assert.equal(await flag(), 1);
    },
  );
});
