// The declared integration lines of a night attached to a multi-night plan
// (written at the debriefing or when the night is attached, replaced by Astro
// Sync's measured lines, readable without a capability), the state of each
// night of the plan and `allSessionsDone`, the intermediate capture, the plan's
// own nights only for the `PUT`, and migration 81 on a base at 79 and at 80. On
// SQLite and PostgreSQL; every name and date is invented.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createProjectIntegrationService } from "../dist/api/project-integrations.js";
import { createProjectNightService } from "../dist/api/project-nights.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { migrations } from "../dist/persistence/migrations.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";
import { writeDeclaredIntegrationsForSession } from "../dist/persistence/project-integration-repository.js";
import { onBothBackends } from "./helpers/both-backends.mjs";
import {
  refusal,
  seedDebriefedNight,
  withServices,
} from "./helpers/journal-space.mjs";
import { image } from "./helpers/metadata-space.mjs";

const at = "2026-10-01T00:00:00.000Z";

/** A multi-night plan of M31 in the space. */
async function seedProject(driver, space, { status = "active" } = {}) {
  const projectId = randomUUID();
  await driver.run(
    "INSERT INTO projects (id, tenant_id, revision, status, payload_json, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?, ?)",
    [
      projectId,
      space.tenantId,
      status,
      JSON.stringify({
        target: { targetId: "m31", name: "M31" },
        goalMinutes: 600,
        place: { name: "Col des Étoiles", latitude: 45, longitude: -30 },
        equipment: {},
        constraints: {
          minAltitude: 30,
          moonSeparationMinimum: 30,
          moonSeparationMinimumByFilter: {},
        },
      }),
      at,
      at,
    ],
  );
  return projectId;
}

const attachBySession = (driver, sessionId, projectId) =>
  driver.run("UPDATE observation_sessions SET project_id = ? WHERE id = ?", [
    projectId,
    sessionId,
  ]);

const measuredLine = (nightId, overrides = {}) => ({
  nightId,
  targetId: "m31",
  filter: "Dual-band",
  exposureSeconds: 180,
  gain: 100,
  binning: 1,
  temperatureC: -10,
  frameCount: 30,
  eveningDate: "2026-10-09",
  sensor: "IMX533",
  computerLabel: "Ordinateur du bureau",
  installationId: "install-bureau",
  ...overrides,
});

onBothBackends(
  "a debriefed night attached to a plan gets one declared line per target, readable without a capability; the measured lines of Astro Sync replace it for good",
  async (driver) => {
    await withServices(driver, {}, async ({ space }) => {
      const projectId = await seedProject(driver, space);
      const night = await seedDebriefedNight(driver, space);
      await attachBySession(driver, night.sessionId, projectId);
      const unlocked = await createProjectIntegrationService({
        driver,
        multiNightActive: async () => false,
      });
      const params = { tenantId: space.tenantId, projectId };

      const first = await writeDeclaredIntegrationsForSession(
        driver,
        space.tenantId,
        night.sessionId,
      );
      assert.deepEqual([first.written, first.removed], [1, 0]);
      // Read without a capability (the lock stays on the measured lines).
      const listed = await unlocked.list(params);
      assert.equal(listed.integrations.length, 1);
      const [line] = listed.integrations;
      assert.equal(line.source, "declared");
      assert.equal(line.sessionId, night.sessionId);
      assert.equal(line.nightId, night.sessionId);
      assert.equal(line.targetId, "m31");
      assert.equal(line.filter, null);
      assert.deepEqual([line.frameCount, line.exposureSeconds], [0, 0]);
      assert.equal(line.totalSeconds, 5400);
      assert.equal(line.eveningDate, "2026-10-09");
      // A declared line names no computer; a measured one names Astro Sync's.
      assert.equal(line.computerLabel, null);
      assert.deepEqual(
        [listed.declaredSeconds, listed.measuredSeconds, listed.totalSeconds],
        [5400, 0, 5400],
      );
      const locked = await refusal(
        unlocked.put({
          ...params,
          userId: space.userId,
          body: { integrations: [measuredLine(night.sessionId)] },
        }),
      );
      assert.deepEqual(
        [locked.code, locked.status],
        ["multi_night_not_active", 403],
      );
      // The same debriefing again changes nothing.
      const same = await writeDeclaredIntegrationsForSession(
        driver,
        space.tenantId,
        night.sessionId,
      );
      assert.deepEqual([same.written, same.removed], [0, 0]);

      // Astro Sync's measured lines for the night and target replace it.
      const unlockedSync = await createProjectIntegrationService({
        driver,
        multiNightActive: async () => true,
      });
      const measured = await unlockedSync.put({
        ...params,
        userId: space.userId,
        body: { integrations: [measuredLine(night.sessionId)] },
      });
      assert.equal(measured.integrations.length, 1);
      assert.equal(measured.integrations[0].source, "measured");
      assert.equal(
        measured.integrations[0].computerLabel,
        "Ordinateur du bureau",
      );
      assert.deepEqual(
        [measured.declaredSeconds, measured.measuredSeconds],
        [0, 5400],
      );
      const back = await writeDeclaredIntegrationsForSession(
        driver,
        space.tenantId,
        night.sessionId,
      );
      assert.deepEqual([back.written, back.removed], [0, 0]);
      assert.equal((await unlocked.list(params)).integrations.length, 1);
    });
  },
);

onBothBackends(
  "a night sent with no measured line any more (replace, empty set) declares again what its debriefing says",
  async (driver) => {
    await withServices(driver, {}, async ({ space }) => {
      const projectId = await seedProject(driver, space);
      const night = await seedDebriefedNight(driver, space);
      await attachBySession(driver, night.sessionId, projectId);
      const sync = await createProjectIntegrationService({
        driver,
        multiNightActive: async () => true,
      });
      const params = {
        tenantId: space.tenantId,
        userId: space.userId,
        projectId,
      };
      await writeDeclaredIntegrationsForSession(
        driver,
        space.tenantId,
        night.sessionId,
      );
      const measured = await sync.put({
        ...params,
        body: { integrations: [measuredLine(night.sessionId)] },
      });
      assert.deepEqual(
        measured.integrations.map((line) => line.source),
        ["measured"],
      );
      const retired = await sync.put({
        ...params,
        body: {
          integrations: [],
          replace: [{ nightId: night.sessionId, targetId: "m31" }],
        },
      });
      assert.deepEqual(
        retired.integrations.map((line) => [line.source, line.totalSeconds]),
        [["declared", 5400]],
      );
      assert.deepEqual(
        [retired.declaredSeconds, retired.measuredSeconds],
        [5400, 0],
      );
    });
  },
);

onBothBackends(
  "the lines are recomputed — new figures rewritten, a night no longer carried out loses them, a night attached to no plan is left alone",
  async (driver) => {
    await withServices(driver, {}, async ({ space }) => {
      const projectId = await seedProject(driver, space);
      const night = await seedDebriefedNight(driver, space);
      await attachBySession(driver, night.sessionId, projectId);
      const integrations = await createProjectIntegrationService({
        driver,
        multiNightActive: async () => false,
      });
      const write = () =>
        writeDeclaredIntegrationsForSession(
          driver,
          space.tenantId,
          night.sessionId,
        );
      const total = async () =>
        (await integrations.list({ tenantId: space.tenantId, projectId }))
          .integrations;
      await write();
      // The debriefing now says an hour, in 20 frames.
      await driver.run(
        "UPDATE plans SET debrief_targets_json = ? WHERE id = ?",
        [
          JSON.stringify([
            {
              targetId: "item-m31",
              state: "done",
              acquiredMinutes: 60,
              frameCount: 20,
            },
          ]),
          night.planId,
        ],
      );
      const changed = await write();
      assert.deepEqual([changed.written, changed.removed], [1, 0]);
      const [line] = await total();
      assert.deepEqual(
        [line.frameCount, line.exposureSeconds, line.totalSeconds],
        [20, 180, 3600],
      );
      // A night attached to no plan is left alone (detaching it, by the
      // plan's nights, takes its lines out of the plan).
      await attachBySession(driver, night.sessionId, null);
      const alone = await write();
      assert.deepEqual(
        [alone.written, alone.removed, alone.projectIds],
        [0, 0, []],
      );
      assert.equal(
        Number(
          (await driver.query("SELECT COUNT(*) AS n FROM project_integrations"))
            .rows[0].n,
        ),
        1,
        "untouched",
      );
      await attachBySession(driver, night.sessionId, projectId);
      // The night is given up: nothing is declared any more.
      await driver.run("UPDATE plans SET status = 'abandoned' WHERE id = ?", [
        night.planId,
      ]);
      const gone = await write();
      assert.deepEqual([gone.written, gone.removed], [0, 1]);
      assert.equal((await total()).length, 0);
    });
  },
);

onBothBackends(
  "a night attached afterwards gets its declared lines, and takes them with it when detached",
  async (driver) => {
    await withServices(driver, {}, async ({ space }) => {
      const projectId = await seedProject(driver, space);
      const night = await seedDebriefedNight(driver, space);
      const nights = await createProjectNightService({
        driver,
        multiNightActive: async () => true,
      });
      const integrations = await createProjectIntegrationService({
        driver,
        multiNightActive: async () => false,
      });
      const params = { tenantId: space.tenantId, projectId };
      assert.equal((await integrations.list(params)).integrations.length, 0);
      await nights.attach({
        ...params,
        userId: space.userId,
        body: { sessionIds: [night.sessionId] },
      });
      const [line] = (await integrations.list(params)).integrations;
      assert.equal(line.source, "declared");
      assert.equal(line.totalSeconds, 5400);
      await nights.detach({
        ...params,
        userId: space.userId,
        nightId: night.sessionId,
      });
      assert.equal(
        (await integrations.list(params)).integrations.length,
        0,
        "the line left the plan with its night",
      );
    });
  },
);

onBothBackends(
  "the PUT writes the plan's own nights only — after the capability, a missing night is 404, before the date of the night",
  async (driver) => {
    await withServices(driver, {}, async ({ space }) => {
      const projectId = await seedProject(driver, space);
      const inside = await seedDebriefedNight(driver, space);
      const outside = await seedDebriefedNight(driver, space, {
        date: "2026-10-12",
      });
      await attachBySession(driver, inside.sessionId, projectId);
      const lock = (open) =>
        createProjectIntegrationService({
          driver,
          multiNightActive: async () => open,
        });
      const put = async (open, line) =>
        (await lock(open)).put({
          tenantId: space.tenantId,
          userId: space.userId,
          projectId,
          body: { integrations: [line] },
        });
      // The capability first, even for a night outside the plan.
      const closed = await refusal(put(false, measuredLine(outside.sessionId)));
      assert.equal(closed.code, "multi_night_not_active");
      const missing = await refusal(put(true, measuredLine(randomUUID())));
      assert.deepEqual(
        [missing.code, missing.status],
        ["session_not_found", 404],
      );
      // A night of the space that is not the plan's: refused, with its id,
      // whatever its date says.
      const foreign = await refusal(
        put(
          true,
          measuredLine(outside.sessionId, { eveningDate: "2026-01-01" }),
        ),
      );
      assert.deepEqual(
        [foreign.code, foreign.status, foreign.body.nightId],
        ["integration_night_not_in_project", 409, outside.sessionId],
      );
      // The plan's own night: its date is then checked.
      const dated = await refusal(
        put(
          true,
          measuredLine(inside.sessionId, { eveningDate: "2026-01-01" }),
        ),
      );
      assert.equal(dated.code, "integration_outside_night");
      const written = await put(true, measuredLine(inside.sessionId));
      assert.equal(written.integrations.length, 1);
      const rows = await driver.query(
        "SELECT COUNT(*) AS n FROM project_integrations",
      );
      assert.equal(
        Number(rows.rows[0].n),
        1,
        "nothing written for the refused ones",
      );
    });
  },
);

onBothBackends(
  "each night of a plan says where it stands, and allSessionsDone is true only when none is upcoming or to debrief",
  async (driver) => {
    await withServices(driver, {}, async ({ space }) => {
      const projectId = await seedProject(driver, space);
      const nights = await createProjectNightService({
        driver,
        multiNightActive: async () => true,
      });
      const plan = async (
        date,
        { status = "pending", frozen = false, withSession = null },
      ) => {
        const planId = randomUUID();
        await driver.run(
          `INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, name, plan_date, status, frozen_at, payload_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'Nuit', ?, ?, ?, ?, ?, ?)`,
          [
            planId,
            space.tenantId,
            space.userId,
            `client-${planId}`,
            date,
            status,
            frozen ? at : null,
            JSON.stringify({
              items: [{ id: randomUUID(), targetId: "m31", projectId }],
            }),
            at,
            at,
          ],
        );
        if (withSession) {
          const sessionId = randomUUID();
          await driver.run(
            "INSERT INTO observation_sessions (id, tenant_id, plan_id, started_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
              sessionId,
              space.tenantId,
              planId,
              `${date}T21:00:00.000Z`,
              withSession,
              at,
              at,
            ],
          );
          return { planId, sessionId };
        }
        return { planId, sessionId: null };
      };
      const done = await plan("2026-09-01", {
        status: "executed",
        frozen: true,
        withSession: "finished",
      });
      const undebriefed = await plan("2026-09-02", { withSession: "finished" });
      const pastNotRun = await plan("2026-09-03", {});
      const future = await plan("2099-01-01", {});
      const open = await plan("2026-09-05", { withSession: "open" });
      // The Journal's rule — a plan archived after its debriefing
      // keeps its outcome; one given up in the field, never debriefed, is
      // still to debrief.
      const archived = await plan("2026-09-07", {
        status: "archived",
        frozen: true,
        withSession: "finished",
      });
      await driver.run("UPDATE plans SET archived_from = ? WHERE id = ?", [
        "executed",
        archived.planId,
      ]);
      const givenUp = await plan("2026-09-08", {
        status: "abandoned",
        withSession: "finished",
      });
      const free = randomUUID();
      await driver.run(
        "INSERT INTO observation_sessions (id, tenant_id, plan_id, started_at, status, project_id, created_at, updated_at) VALUES (?, ?, NULL, ?, 'finished', ?, ?, ?)",
        [free, space.tenantId, "2026-09-06T21:00:00.000Z", projectId, at, at],
      );
      const read = async () => {
        const list = await nights.list({ tenantId: space.tenantId, projectId });
        return Object.fromEntries(
          list.nights.map((night) => [
            night.sessionId ?? night.planId,
            night.state,
          ]),
        );
      };
      assert.deepEqual(await read(), {
        [done.sessionId]: "done",
        [undebriefed.sessionId]: "to_debrief",
        [pastNotRun.planId]: "to_debrief",
        [future.planId]: "upcoming",
        [open.sessionId]: "upcoming",
        [archived.sessionId]: "done",
        [givenUp.sessionId]: "to_debrief",
        [free]: "done",
      });
      assert.equal(
        (await nights.projectNights({ tenantId: space.tenantId, projectId }))
          .allSessionsDone,
        false,
      );
      // Everything behind the plan: only then is it true.
      await driver.run("DELETE FROM plans WHERE id IN (?, ?)", [
        future.planId,
        pastNotRun.planId,
      ]);
      await driver.run(
        "UPDATE observation_sessions SET status = 'finished' WHERE id = ?",
        [open.sessionId],
      );
      await driver.run(
        "UPDATE plans SET status = 'executed', frozen_at = ? WHERE id IN (?, ?, ?)",
        [at, undebriefed.planId, open.planId, givenUp.planId],
      );
      assert.equal(
        (await nights.projectNights({ tenantId: space.tenantId, projectId }))
          .allSessionsDone,
        true,
      );
      const empty = await seedProject(driver, space);
      assert.equal(
        (
          await nights.projectNights({
            tenantId: space.tenantId,
            projectId: empty,
          })
        ).allSessionsDone,
        false,
        "a plan without a night is not done",
      );
    });
  },
);

onBothBackends(
  "the detail of a capture says it is an intermediate capture of a multi-night plan that is not finished — and nothing otherwise",
  async (driver) => {
    await withServices(driver, {}, async ({ owner, space, send }) => {
      const projectId = await seedProject(driver, space);
      const night = await seedDebriefedNight(driver, space);
      await attachBySession(driver, night.sessionId, projectId);
      const future = randomUUID();
      await driver.run(
        `INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, name, plan_date, payload_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'À venir', '2099-01-01', ?, ?, ?)`,
        [
          future,
          space.tenantId,
          space.userId,
          `client-${future}`,
          JSON.stringify({
            items: [{ id: randomUUID(), targetId: "m31", projectId }],
          }),
          at,
          at,
        ],
      );
      const { body } = await send(image("intermediate"), {
        sessionId: night.sessionId,
        targetId: "m31",
      });
      const intermediate = async (captureId = body.capture.id) =>
        (
          await owner.get({
            tenantId: space.tenantId,
            userId: space.userId,
            captureId,
          })
        ).detail.intermediate;
      assert.deepEqual(await intermediate(), {
        projectId,
        projectName: "M31",
        sessionsDone: [
          {
            eveningDate: "2026-10-09",
            sessionId: night.sessionId,
            planId: night.planId,
            acquiredSeconds: null,
          },
        ],
        sessionsPlanned: [
          {
            eveningDate: "2099-01-01",
            sessionId: null,
            planId: future,
            acquiredSeconds: null,
          },
        ],
      });
      // A capture of a session of no multi-night plan.
      const bare = await send(image("bare"), {
        sessionId: space.sessionId,
        targetId: "m31",
      });
      assert.equal(await intermediate(bare.body.capture.id), null);
      // The plan is finished: the capture is no longer an intermediate one.
      await driver.run("UPDATE projects SET status = 'finished' WHERE id = ?", [
        projectId,
      ]);
      assert.equal(await intermediate(), null);
    });
  },
);

// ——— Migration 81 on a base at 79 and at 80 ———

async function onEmptyBackends(name, exercise) {
  test(`${name} [SQLite]`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "astro-migration-81-"));
    const driver = createDatabaseDriver({
      databasePath: join(directory, "portal.sqlite"),
    });
    try {
      await exercise(driver, "sqlite");
    } finally {
      await driver.close();
      await rm(directory, { force: true, recursive: true });
    }
  });
  test(
    `${name} [PostgreSQL]`,
    { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
    async () => {
      const databaseUrl = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
      const reset = async () => {
        const admin = PostgresDriver.open(databaseUrl);
        try {
          await admin.run("DROP SCHEMA public CASCADE");
          await admin.run("CREATE SCHEMA public");
        } finally {
          await admin.close();
        }
      };
      await reset();
      const driver = createDatabaseDriver({ databaseUrl });
      try {
        await exercise(driver, "postgres");
      } finally {
        await driver.close();
        await reset();
      }
    },
  );
}

const upToSeventyNine = migrations.filter(({ version }) => version <= 79);
// The migration number 80 of a parallel change, as it will be.
const parallelEighty = {
  version: 80,
  name: "parallel-change",
  statements: {
    common: "CREATE TABLE IF NOT EXISTS parallel_change (id TEXT PRIMARY KEY)",
  },
};
const eightyOne = migrations.find(({ version }) => version === 81);

async function seedOldLine(driver) {
  const tenantId = randomUUID();
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, 'Espace', ?)",
    [tenantId, at],
  );
  await driver.run(
    `INSERT INTO project_integrations (id, tenant_id, project_id, night_id, target_id, family_key, filter, exposure_seconds, frame_count, total_seconds, evening_date, created_at, updated_at)
     VALUES (?, ?, NULL, ?, 'm31', 'k', NULL, 180, 10, 1800, '2026-10-09', ?, ?)`,
    [randomUUID(), tenantId, randomUUID(), at, at],
  );
  return tenantId;
}

async function checkNew(driver, tenantId) {
  const old = (await driver.query("SELECT * FROM project_integrations")).rows;
  assert.equal(old.length, 1, "the measured line is kept");
  assert.equal(old[0].source, "measured");
  assert.equal(Number(old[0].frame_count), 10);
  // A declared line without frames is now accepted.
  await driver.run(
    `INSERT INTO project_integrations (id, tenant_id, night_id, target_id, family_key, exposure_seconds, frame_count, total_seconds, evening_date, source, created_at, updated_at)
     VALUES (?, ?, ?, 'm31', 'declared', 0, 0, 5400, '2026-10-09', 'declared', ?, ?)`,
    [randomUUID(), tenantId, randomUUID(), at, at],
  );
  await assert.rejects(
    driver.run(
      `INSERT INTO project_integrations (id, tenant_id, night_id, target_id, family_key, exposure_seconds, frame_count, total_seconds, evening_date, source, created_at, updated_at)
       VALUES (?, ?, ?, 'm31', 'x', 1, -1, 1, '2026-10-09', 'measured', ?, ?)`,
      [randomUUID(), tenantId, randomUUID(), at, at],
    ),
  );
  const captures = await driver.query(
    "SELECT replaced_at, replaced_source FROM captures",
  );
  assert.deepEqual(captures.rows, []);
}

onEmptyBackends(
  "migration 81 on a base at 79 (a parallel migration 80 not merged yet)",
  async (driver, dialect) => {
    await applyMigrations(driver, dialect, upToSeventyNine);
    const tenantId = await seedOldLine(driver);
    await applyMigrations(driver, dialect, [...upToSeventyNine, eightyOne]);
    await checkNew(driver, tenantId);
    // The parallel change merges afterwards: its 80 fills the gap.
    await applyMigrations(driver, dialect, [
      ...upToSeventyNine,
      parallelEighty,
      eightyOne,
    ]);
    const versions = (
      await driver.query(
        "SELECT version FROM schema_migrations WHERE version >= 80 ORDER BY version",
      )
    ).rows.map((row) => Number(row.version));
    // The core's chain has no 79: a composition's migration holds that number.
    assert.deepEqual(versions, [80, 81]);
  },
);

onEmptyBackends(
  "migration 81 on a base at 80 (a parallel migration 80 merged first)",
  async (driver, dialect) => {
    await applyMigrations(driver, dialect, [
      ...upToSeventyNine,
      parallelEighty,
    ]);
    const tenantId = await seedOldLine(driver);
    await applyMigrations(driver, dialect, [
      ...upToSeventyNine,
      parallelEighty,
      eightyOne,
    ]);
    await checkNew(driver, tenantId);
  },
);
