// Isolation between spaces, at the service and repository level, on SQLite
// always and on the throwaway PostgreSQL test database when
// ASTRO_PORTAL_TEST_DATABASE_URL names one. Space A is the attacker, space B
// the victim: what A does never reaches B's rows, never tells A whether one
// of B's identifiers exists, and never lets A take more than its share.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createUploadResourceService } from "../dist/api/upload-resources.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";

const timestamp = "2026-09-30T20:00:00.000Z";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const storageCapabilities = (quota, maxFile) => ({
  "planner.multiple": true,
  "planner.mosaic": true,
  "pointing.solve": true,
  "sync.plan_limit": 0,
  "gallery.private": true,
  "capture.variant_limit": 0,
  "analysis.logs": false,
  "analysis.progression": false,
  "storage.max_file_bytes": maxFile,
  "storage.quota_bytes": quota,
  "portal.invitations": false,
  "capture.count_limit": 9007199254740991,
  "capture.public": true,
  "history.retention_days": 90,
});

async function seedSpace(driver) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, `Space ${tenantId}`, timestamp],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [userId, `${userId}@example.test`, "x", timestamp],
  );
  await driver.run(
    "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
    [randomUUID(), tenantId, userId, "owner", timestamp],
  );
  return { tenantId, userId };
}

async function* once(buffer) {
  yield buffer;
}

async function withCapturesDirectory(action) {
  const directory = await mkdtemp(join(tmpdir(), "astro-isolation-captures-"));
  const previous = process.env.ASTRO_PORTAL_CAPTURES_DIR;
  process.env.ASTRO_PORTAL_CAPTURES_DIR = directory;
  try {
    return await action();
  } finally {
    if (previous === undefined) delete process.env.ASTRO_PORTAL_CAPTURES_DIR;
    else process.env.ASTRO_PORTAL_CAPTURES_DIR = previous;
    await rm(directory, { force: true, recursive: true });
  }
}

/** Runs one scenario on SQLite and, when configured, PostgreSQL. */
function bothBackends(name, scenario) {
  test(`${name} [SQLite]`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "astro-isolation-db-"));
    const driver = createDatabaseDriver({
      databasePath: join(directory, "portal.sqlite"),
    });
    try {
      await applyMigrations(driver, "sqlite");
      await withCapturesDirectory(() => scenario(driver));
    } finally {
      await driver.close();
      await rm(directory, { force: true, recursive: true });
    }
  });
  const databaseUrl = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
  test(
    `${name} [PostgreSQL]`,
    { skip: databaseUrl ? false : "ASTRO_PORTAL_TEST_DATABASE_URL is not set" },
    async () => {
      if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(databaseUrl))
        throw new Error(
          "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
        );
      const resetSchema = async () => {
        const admin = PostgresDriver.open(databaseUrl);
        try {
          await admin.run("DROP SCHEMA public CASCADE");
          await admin.run("CREATE SCHEMA public");
        } finally {
          await admin.close();
        }
      };
      let driver;
      try {
        await resetSchema();
        driver = createDatabaseDriver({ databaseUrl });
        await applyMigrations(driver, "postgres");
        await withCapturesDirectory(() => scenario(driver));
      } finally {
        if (driver) await driver.close();
        await resetSchema();
      }
    },
  );
}

bothBackends(
  "C2: unfinished uploads count in their own space's quota, and their number is bounded",
  async (driver) => {
    const attacker = await seedSpace(driver);
    const victim = await seedSpace(driver);
    const service = await createUploadResourceService({
      driver,
      capabilities: storageCapabilities(5000, 2000),
      maxOpenUploadSessions: 3,
    });
    const files = ["a", "b", "c"].map((seed) => Buffer.alloc(2000, seed));
    const ids = [];
    for (const bytes of files) {
      const created = await service.createUpload({
        ...attacker,
        originalName: "light.fits",
        sha256: sha(bytes),
        byteSize: bytes.length,
      });
      assert.equal(created.status, 201);
      ids.push(created.body.uploadId);
    }
    const put = (space, uploadId, bytes) =>
      service.putUploadChunk({
        ...space,
        uploadId,
        declaredOffset: 0,
        declaredContentLength: bytes.length,
        bodyChunks: once(bytes),
      });
    // The chunk size defaults to 8 MB: each file goes in one chunk.
    await put(attacker, ids[0], files[0]);
    await put(attacker, ids[1], files[1]);
    await assert.rejects(put(attacker, ids[2], files[2]), (error) => {
      assert.equal(error.code, "storage_quota_reached");
      assert.equal(error.body.storage.usedBytes, 4000);
      return true;
    });
    await assert.rejects(
      service.createUpload({
        ...attacker,
        originalName: "d.fits",
        sha256: sha(Buffer.from("d")),
        byteSize: 1,
      }),
      (error) => error.code === "upload_sessions_limit_reached",
    );
    // Resuming an upload already open is never refused by the cap.
    // (its own held bytes are not counted twice).
    const resumed = await service.createUpload({
      ...attacker,
      originalName: "light.fits",
      sha256: sha(files[0]),
      byteSize: files[0].length,
    });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.uploadId, ids[0]);
    assert.equal(resumed.body.offset, 2000);

    // B's quota and cap are its own.
    const victimFile = Buffer.alloc(2000, "v");
    const created = await service.createUpload({
      ...victim,
      originalName: "m31.fits",
      sha256: sha(victimFile),
      byteSize: victimFile.length,
    });
    assert.equal(created.status, 201);
    await put(victim, created.body.uploadId, victimFile);
    const done = await service.finalizeUpload({
      ...victim,
      uploadId: created.body.uploadId,
    });
    assert.equal(done.body.storage.usedBytes, 2000);
  },
);

bothBackends(
  "C7: another space's session, framing or equipment identifier answers like an unknown one",
  async (driver) => {
    const { createObservationSessionRepository } =
      await import("../dist/persistence/observation-session-repository.js");
    const { createFramingResourceRepository } =
      await import("../dist/persistence/framing-repository.js");
    const { createEquipmentReader } =
      await import("../dist/persistence/equipment-reader.js");
    const attacker = await seedSpace(driver);
    const victim = await seedSpace(driver);
    const sessions = await createObservationSessionRepository({ driver });
    const victimSession = (
      await sessions.createSession({
        tenantId: victim.tenantId,
        startedAt: timestamp,
      })
    ).resource.id;

    const uploads = await createUploadResourceService({
      driver,
      capabilities: storageCapabilities(1_000_000, 100_000),
    });
    const refusal = async (sessionId, seed) => {
      const bytes = Buffer.from(`bytes ${seed}`);
      try {
        await uploads.createUpload({
          ...attacker,
          originalName: "x.fits",
          sha256: sha(bytes),
          byteSize: bytes.length,
          sessionId,
        });
      } catch (error) {
        return { status: error.status, body: error.body };
      }
      return null;
    };
    const foreign = await refusal(victimSession, "foreign");
    const unknown = await refusal(randomUUID(), "unknown");
    assert.deepEqual(foreign, unknown);
    assert.equal(foreign.body.error.code, "session_not_found");

    const framings = await createFramingResourceRepository({ driver });
    const framingPayload = {
      target: {
        id: "t",
        plannerSource: "framing",
        objects: ["M31"],
        matchedTargets: [],
        center: { ra: 10, dec: 41 },
        field: { width: 1, height: 1, shape: "rectangle" },
        savedAt: timestamp,
      },
      catalogueTargetId: null,
      angleDegrees: 0,
    };
    const write = (space, framingId) =>
      framings.write({
        ...space,
        framingId,
        expectedRevision: 0,
        name: "Wide",
        payload: framingPayload,
      });
    const victimFraming = randomUUID();
    const ownFraming = randomUUID();
    await write(victim, victimFraming);
    await write(attacker, ownFraming);
    const failure = async (framingId) =>
      write(attacker, framingId).then(
        () => null,
        (error) => ({
          code: error.code,
          status: error.status,
          message: error.message,
        }),
      );
    assert.deepEqual(await failure(victimFraming), await failure(ownFraming));
    assert.equal(
      (await failure(victimFraming)).code,
      "invalid_creation_revision",
    );

    const equipment = await createEquipmentReader({ driver });
    const victimItem = await equipment.saveEquipment({
      tenantId: victim.tenantId,
      equipment: { type: "telescope", name: "Victim scope" },
    });
    const attackerItem = await equipment.saveEquipment({
      tenantId: attacker.tenantId,
      equipment: { id: victimItem.id, type: "telescope", name: "Mine" },
    });
    assert.notEqual(attackerItem.id, victimItem.id);
    assert.equal(attackerItem.name, "Mine");
    const victimList = await equipment.listEquipment(victim.tenantId, {
      includeArchived: true,
    });
    assert.deepEqual(
      victimList.map((item) => [item.id, item.name]),
      [[victimItem.id, "Victim scope"]],
    );
  },
);

bothBackends(
  "C3: the web planner's full save applies the plan limit and the read-only window",
  async (driver) => {
    const { createPlannerStateRepository } =
      await import("../dist/persistence/planner-state-repository.js");
    const repository = await createPlannerStateRepository({ driver });
    const attacker = await seedSpace(driver);
    const victim = await seedSpace(driver);
    const location = {
      id: "paris",
      version: 1,
      name: "Paris",
      latitude: "48.8566",
      longitude: "2.3522",
      timeZone: "Europe/Paris",
    };
    const plan = (id, status = "pending") => ({
      id,
      date: "2026-09-30",
      name: `Plan ${id}`,
      nightId: "night-1",
      location,
      equipment: { mode: "imaging" },
      minAltitude: 30,
      status,
      items: [{ id: `${id}-m31`, designation: "M31", durationMinutes: 60 }],
    });
    const documentWith = (plans) => ({
      schemaVersion: 2,
      date: "2026-09-30",
      plans,
      knownLocations: [location],
      horizonProfiles: [],
      nights: [{ id: "night-1", date: "2026-09-30", location }],
      activeNightId: "night-1",
      unassignedHorizonProfiles: [],
    });
    const save = (space, plans, rights = {}) =>
      repository.savePlannerState({
        ...space,
        state: documentWith(plans),
        ...rights,
      });

    await save(attacker, [plan("a-1")], { planLimit: 1 });
    await assert.rejects(
      save(attacker, [plan("a-1"), plan("a-2")], { planLimit: 1 }),
      (error) => error.code === "plan_limit_reached" && error.status === 409,
    );
    const stored = await repository.plannerState(attacker.tenantId);
    assert.deepEqual(
      stored.plans.map((entry) => entry.id),
      ["a-1"],
    );
    // B's own plans do not count against A, nor A's against B.
    await save(victim, [plan("b-1"), plan("b-2")], { planLimit: 2 });

    // Read-only: an unchanged document saves, a changed or new plan does not.
    await save(attacker, stored.plans, { planLimit: 1, readOnly: true });
    await assert.rejects(
      save(attacker, [{ ...stored.plans[0], name: "Renamed" }], {
        readOnly: true,
      }),
      (error) => error.code === "entitlement_read_only" && error.status === 403,
    );
    await assert.rejects(
      save(attacker, [...stored.plans, plan("a-3")], { readOnly: true }),
      (error) => error.code === "entitlement_read_only",
    );
    assert.equal(
      (await repository.plannerState(attacker.tenantId)).plans[0].name,
      "Plan a-1",
    );
  },
);

bothBackends(
  "C3: technical ceilings per space on sessions, events and devices",
  async (driver) => {
    const settings = {
      ASTRO_PORTAL_MAX_SESSIONS_PER_SPACE: "1",
      ASTRO_PORTAL_MAX_EVENTS_PER_SESSION: "2",
      ASTRO_PORTAL_MAX_DEVICES_PER_SPACE: "1",
    };
    const previous = Object.fromEntries(
      Object.keys(settings).map((name) => [name, process.env[name]]),
    );
    Object.assign(process.env, settings);
    try {
      const { createObservationSessionRepository } =
        await import("../dist/persistence/observation-session-repository.js");
      const { createAuthenticationRepository } =
        await import("../dist/persistence/authentication-repository.js");
      const attacker = await seedSpace(driver);
      const victim = await seedSpace(driver);
      const refusedWith = (code) => (error) => {
        assert.equal(error.code, code);
        assert.equal(error.status, 409);
        return true;
      };

      const sessions = await createObservationSessionRepository({ driver });
      const open = (space) =>
        sessions.createSession({
          tenantId: space.tenantId,
          startedAt: timestamp,
        });
      const own = (await open(attacker)).resource.id;
      await assert.rejects(
        open(attacker),
        refusedWith("session_limit_reached"),
      );
      await open(victim);
      const events = (ids) =>
        ids.map((eventId) => ({
          eventId,
          type: "note",
          payload: { text: "note" },
          recordedAt: timestamp,
        }));
      await sessions.ingestEvents({
        tenantId: attacker.tenantId,
        sessionId: own,
        events: events([
          "01JAAAAAAAAAAAAAAAAAAAAAA1",
          "01JAAAAAAAAAAAAAAAAAAAAAA2",
        ]),
      });
      await assert.rejects(
        sessions.ingestEvents({
          tenantId: attacker.tenantId,
          sessionId: own,
          events: events(["01JAAAAAAAAAAAAAAAAAAAAAA3"]),
        }),
        refusedWith("session_event_limit_reached"),
      );
      // A replayed event is not a new one.
      const replay = await sessions.ingestEvents({
        tenantId: attacker.tenantId,
        sessionId: own,
        events: events(["01JAAAAAAAAAAAAAAAAAAAAAA1"]),
      });
      assert.deepEqual(replay.duplicate, ["01JAAAAAAAAAAAAAAAAAAAAAA1"]);

      const auth = await createAuthenticationRepository({ driver });
      const device = (space) =>
        auth.createDeviceToken({
          tenantId: space.tenantId,
          userId: space.userId,
          label: "Phone",
          tokenHash: randomUUID(),
        });
      await device(attacker);
      await assert.rejects(
        device(attacker),
        refusedWith("device_limit_reached"),
      );
      await device(victim);
    } finally {
      for (const [name, value] of Object.entries(previous))
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
  },
);
