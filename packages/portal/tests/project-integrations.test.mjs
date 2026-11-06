// The integrations of
// a multi-night plan — one line per night, target and family of frames,
// never a file — added idempotently by Astro Sync, listed with their totals
// by filter, refused without the multi-night plans of Astro Sync and when a
// line is not dated by its night; and the image of the plan, an upload of
// role `plan`: a capture of the space attached to its plan, in no night's
// captures and no variant of one. On SQLite and on PostgreSQL.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectIntegrationService } from "../dist/api/project-integrations.js";
import { createUploadResourceService } from "../dist/api/upload-resources.js";
import { OPEN_SOURCE_PROFILE } from "../dist/capabilities/profiles.js";
import { createCaptureRepository } from "../dist/persistence/capture-repository.js";
import { onBothBackends, seedSpace } from "./helpers/both-backends.mjs";

const at = "2026-08-13T09:00:00.000Z";
const SYNC = { kind: "device", application: "sync" };
const boundary = "astro-portal-integrations-test-boundary";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * The Heart (IC 1805), three nights at a place 2° E: the 9 August night
 * with its plan, the 10 August night run without a plan (dated by its
 * start: 11 August 00:40 UTC, the evening of the 10th at that longitude),
 * the 12 August night with its plan.
 */
async function seedHeart(driver) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  await seedSpace(driver, tenantId, userId, at);
  const projectId = randomUUID();
  await driver.run(
    "INSERT INTO projects (id, tenant_id, revision, status, payload_json, created_at, updated_at) VALUES (?, ?, 1, 'active', ?, ?, ?)",
    [
      projectId,
      tenantId,
      JSON.stringify({
        target: { targetId: "ic1805", name: "IC 1805" },
        goalMinutes: 720,
        place: { name: "Col des Mélèzes", latitude: 45, longitude: 2 },
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
  const night = async (planDate, startedAt) => {
    const id = randomUUID();
    let planId = null;
    if (planDate) {
      planId = randomUUID();
      await driver.run(
        "INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, plan_date, name, created_at, updated_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}')",
        [
          planId,
          tenantId,
          userId,
          `plan-${planDate}`,
          planDate,
          "IC 1805",
          at,
          at,
        ],
      );
    }
    // Attached to the multi-night plan: Astro Sync writes its own nights only.
    await driver.run(
      "INSERT INTO observation_sessions (id, tenant_id, plan_id, started_at, status, created_at, project_id) VALUES (?, ?, ?, ?, 'finished', ?, ?)",
      [id, tenantId, planId, startedAt, at, projectId],
    );
    return id;
  };
  return {
    tenantId,
    userId,
    projectId,
    nights: {
      aug9: await night("2026-08-09", "2026-08-09T20:30:00.000Z"),
      aug10: await night(null, "2026-08-11T00:40:00.000Z"),
      aug12: await night("2026-08-12", "2026-08-12T20:10:00.000Z"),
    },
  };
}

const line = (nightId, overrides = {}) => ({
  nightId,
  targetId: "ic1805",
  filter: "Bibande (Hα + OIII)",
  exposureSeconds: 180,
  gain: 100,
  binning: 1,
  temperatureC: -10,
  frameCount: 98,
  eveningDate: "2026-08-09",
  sensor: "IMX571",
  computerLabel: "iMac du bureau",
  installationId: "install-imac",
  ...overrides,
});

async function refusal(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected a refusal");
}

onBothBackends(
  "integrations: added idempotently, listed with their totals by filter, the earliest night first",
  async (driver) => {
    const heart = await seedHeart(driver);
    const service = await createProjectIntegrationService({
      driver,
      multiNightActive: async (userId) => userId === heart.userId,
    });
    const { tenantId, userId, projectId, nights } = heart;
    const put = (lines) =>
      service.put({
        tenantId,
        userId,
        projectId,
        body: { integrations: lines },
      });
    // 12 August first: the list is ordered by night all the same.
    await put([
      line(nights.aug12, {
        filter: "UV/IR-cut",
        exposureSeconds: 120,
        frameCount: 120,
        eveningDate: "2026-08-12",
      }),
    ]);
    const answer = await put([
      line(nights.aug9),
      line(nights.aug10, {
        filter: "RGB",
        exposureSeconds: 90,
        frameCount: 89,
        eveningDate: "2026-08-10",
        sensor: null,
      }),
    ]);
    assert.deepEqual(
      answer.integrations.map((entry) => [
        entry.eveningDate,
        entry.filter,
        entry.frameCount,
        entry.totalSeconds,
      ]),
      [
        ["2026-08-09", "Bibande (Hα + OIII)", 98, 17640],
        ["2026-08-10", "RGB", 89, 8010],
        ["2026-08-12", "UV/IR-cut", 120, 14400],
      ],
    );
    assert.deepEqual(answer.totalsByFilter, [
      {
        filter: "Bibande (Hα + OIII)",
        frameCount: 98,
        totalSeconds: 17640,
        declaredSeconds: 0,
        measuredSeconds: 17640,
        nightCount: 1,
      },
      {
        filter: "RGB",
        frameCount: 89,
        totalSeconds: 8010,
        declaredSeconds: 0,
        measuredSeconds: 8010,
        nightCount: 1,
      },
      {
        filter: "UV/IR-cut",
        frameCount: 120,
        totalSeconds: 14400,
        declaredSeconds: 0,
        measuredSeconds: 14400,
        nightCount: 1,
      },
    ]);
    assert.equal(answer.totalSeconds, 40050, "11 h 08");
    assert.equal(answer.nightCount, 3);
    const first = answer.integrations[0];
    assert.equal(first.projectId, projectId);
    assert.equal(first.computerLabel, "iMac du bureau");
    assert.equal(first.installationId, "install-imac");
    assert.equal(first.gain, 100);
    assert.equal(first.temperatureC, -10);

    // The same night, target and family again: replaced, never doubled.
    const again = await put([line(nights.aug9, { frameCount: 100 })]);
    assert.equal(again.integrations.length, 3);
    assert.equal(again.integrations[0].frameCount, 100);
    assert.equal(again.integrations[0].totalSeconds, 18000);
    assert.equal(again.integrations[0].id, first.id, "the same line");
    // Another family of the same night is a line of its own.
    const other = await put([line(nights.aug9, { exposureSeconds: 300 })]);
    assert.equal(other.integrations.length, 4);
    assert.equal(other.totalsByFilter[0].nightCount, 1);
    assert.equal(other.totalsByFilter[0].frameCount, 198);

    // The list is the same, and never needs the capability.
    const listed = await service.list({ tenantId, projectId });
    assert.deepEqual(listed, other);
    const extras = await service.projectExtras({ tenantId, projectId });
    assert.equal(extras.integrations.length, 4);
    assert.deepEqual(extras.totalsByFilter, other.totalsByFilter);
    assert.equal(extras.planCapture, null);
    assert.equal(extras.planCaptureCount, 0);
  },
);

onBothBackends(
  "integrations: a night sent complete (replace) drops the line it no longer carries; the totals follow; the earlier form removes none",
  async (driver) => {
    const heart = await seedHeart(driver);
    const service = await createProjectIntegrationService({
      driver,
      multiNightActive: async () => true,
    });
    const { tenantId, userId, projectId, nights } = heart;
    const put = (lines, replace) =>
      service.put({
        tenantId,
        userId,
        projectId,
        body: replace
          ? { integrations: lines, replace }
          : { integrations: lines },
      });
    const set = (nightId, targetId = "ic1805") => ({ nightId, targetId });
    const dual = line(nights.aug9);
    const rgb = line(nights.aug9, {
      filter: "RGB",
      exposureSeconds: 90,
      frameCount: 89,
    });
    const other = line(nights.aug12, {
      filter: "UV/IR-cut",
      exposureSeconds: 120,
      frameCount: 120,
      eveningDate: "2026-08-12",
    });
    // A night stacked under two filters, as the earlier clients left it.
    await put([dual, rgb, other]);
    const before = await service.list({ tenantId, projectId });
    assert.equal(before.integrations.length, 3);
    assert.deepEqual(
      before.totalsByFilter.map((total) => total.filter),
      ["Bibande (Hα + OIII)", "RGB", "UV/IR-cut"],
    );

    // The earlier form, one line alone: nothing else is removed.
    const earlier = await put([rgb]);
    assert.equal(earlier.integrations.length, 3, "an older client erases none");

    // The night stacked again under another filter: its set is sent complete
    // with the one active line; the line of the other filter goes, the other
    // night's line stays.
    const complete = await put([rgb], [set(nights.aug9)]);
    assert.deepEqual(
      complete.integrations.map((entry) => [entry.eveningDate, entry.filter]),
      [
        ["2026-08-09", "RGB"],
        ["2026-08-12", "UV/IR-cut"],
      ],
    );
    assert.deepEqual(
      complete.totalsByFilter.map((total) => [
        total.filter,
        total.totalSeconds,
      ]),
      [
        ["RGB", 8010],
        ["UV/IR-cut", 14400],
      ],
    );
    assert.equal(complete.totalSeconds, 22410);
    assert.equal(complete.nightCount, 2);
    // The plan read alone (its page) counts the same.
    const extras = await service.projectExtras({ tenantId, projectId });
    assert.deepEqual(extras.integrations, complete.integrations);
    assert.deepEqual(extras.totalsByFilter, complete.totalsByFilter);
    const kept = complete.integrations[0];
    assert.equal(
      kept.id,
      before.integrations.find((e) => e.filter === "RGB").id,
    );

    // Idempotent; and a set of another target is another set.
    const repeated = await put([rgb], [set(nights.aug9)]);
    assert.deepEqual(
      repeated.integrations.map((entry) => entry.id),
      complete.integrations.map((entry) => entry.id),
    );
    assert.deepEqual(repeated.totalsByFilter, complete.totalsByFilter);
    const otherTarget = await put(
      [line(nights.aug9, { targetId: "ngc7000", filter: "Ha" })],
      [set(nights.aug9, "ngc7000")],
    );
    assert.equal(otherTarget.integrations.length, 3, "ic1805 is not touched");
    const gone = await put([], [set(nights.aug9, "ngc7000")]);
    assert.equal(gone.integrations.length, 2, "an empty set empties the set");

    // An empty set takes the night's measured lines and no other night's.
    const emptied = await put([], [set(nights.aug9)]);
    assert.deepEqual(
      emptied.integrations.map((entry) => entry.eveningDate),
      ["2026-08-12"],
    );

    // Refusals: a line outside the sets, a set twice, a night that is not
    // the plan's, an unknown night, a body with nothing at all. Nothing is
    // removed by a refused body.
    await put([dual, rgb], [set(nights.aug9)]);
    const invalid = async (lines, replace) => {
      const error = await refusal(put(lines, replace));
      assert.equal(error.status, 400, JSON.stringify(replace));
      assert.equal(error.body.error.code, "invalid_request");
    };
    await invalid([dual], [set(nights.aug12)]);
    await invalid([dual], [set(nights.aug9), set(nights.aug9)]);
    await invalid([dual], []);
    await invalid([], undefined);
    await invalid([dual], [{ ...set(nights.aug9), filter: "RGB" }]);
    const stranger = randomUUID();
    await driver.run(
      "INSERT INTO observation_sessions (id, tenant_id, started_at, status, created_at) VALUES (?, ?, '2026-08-20T20:00:00.000Z', 'finished', ?)",
      [stranger, tenantId, at],
    );
    const outside = await refusal(put([], [set(stranger)]));
    assert.equal(outside.status, 409);
    assert.equal(outside.body.error.code, "integration_night_not_in_project");
    const unknown = await refusal(put([], [set(randomUUID())]));
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error.code, "session_not_found");
    const after = await service.list({ tenantId, projectId });
    assert.equal(after.integrations.length, 3, "a refused body removes none");

    // Without the multi-night plans nothing is removed either.
    const closed = await createProjectIntegrationService({ driver });
    const notActive = await refusal(
      closed.put({
        tenantId,
        userId,
        projectId,
        body: { integrations: [], replace: [set(nights.aug9)] },
      }),
    );
    assert.equal(notActive.body.error.code, "multi_night_not_active");
    assert.equal(
      (await service.list({ tenantId, projectId })).integrations.length,
      3,
    );
  },
);

onBothBackends(
  "integrations: refused without the multi-night plans, outside their night, for an unknown night or plan; nothing written",
  async (driver) => {
    const heart = await seedHeart(driver);
    const { tenantId, userId, projectId, nights } = heart;
    const closed = await createProjectIntegrationService({ driver });
    const notActive = await refusal(
      closed.put({
        tenantId,
        userId,
        projectId,
        body: { integrations: [line(nights.aug9)] },
      }),
    );
    assert.equal(notActive.status, 403);
    assert.equal(notActive.body.error.code, "multi_night_not_active");
    assert.equal(notActive.body.capability, "analysis.progression");

    const open = await createProjectIntegrationService({
      driver,
      multiNightActive: async () => true,
    });
    const put = (lines, project = projectId) =>
      open.put({
        tenantId,
        userId,
        projectId: project,
        body: { integrations: lines },
      });
    // A line dated by the next evening: not of that night. The 10 August
    // night has no plan: its date comes from its start at 2° E.
    for (const [nightId, dated, expected] of [
      [nights.aug9, "2026-08-10", "2026-08-09"],
      [nights.aug10, "2026-08-11", "2026-08-10"],
    ]) {
      const outside = await refusal(
        put([line(nights.aug9), line(nightId, { eveningDate: dated })]),
      );
      assert.equal(outside.status, 409);
      assert.equal(outside.body.error.code, "integration_outside_night");
      assert.equal(outside.body.nightId, nightId);
      assert.equal(outside.body.eveningDate, expected);
    }
    const unknownNight = await refusal(put([line(randomUUID())]));
    assert.equal(unknownNight.status, 404);
    assert.equal(unknownNight.body.error.code, "session_not_found");
    const unknownPlan = await refusal(put([line(nights.aug9)], randomUUID()));
    assert.equal(unknownPlan.body.error.code, "project_not_found");
    for (const body of [
      [],
      [{ ...line(nights.aug9), totalSeconds: 1 }],
      [{ ...line(nights.aug9), master: "a.fit" }],
      [line(nights.aug9, { frameCount: 0 })],
      [line(nights.aug9, { eveningDate: "9 août" })],
    ]) {
      const invalid = await refusal(put(body));
      assert.equal(invalid.status, 400, JSON.stringify(body));
      assert.equal(invalid.body.error.code, "invalid_request");
    }
    // Another space reads none of it and writes nothing to it.
    const stranger = randomUUID();
    await seedSpace(driver, stranger, null, at);
    const foreign = await refusal(open.list({ tenantId: stranger, projectId }));
    assert.equal(foreign.body.error.code, "project_not_found");
    const { rows } = await driver.query(
      "SELECT COUNT(*) AS n FROM project_integrations",
    );
    assert.equal(
      Number(rows[0].n),
      0,
      "every line checked before one is written",
    );
  },
);

function multipart(metadata, fileBytes) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\n`, "latin1"),
    Buffer.from(
      'Content-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n',
      "latin1",
    ),
    Buffer.from(JSON.stringify(metadata), "utf8"),
    Buffer.from(`\r\n--${boundary}\r\n`, "latin1"),
    Buffer.from(
      'Content-Disposition: form-data; name="file"; filename="plan.jpg"\r\nContent-Type: image/jpeg\r\n\r\n',
      "latin1",
    ),
    fileBytes,
    Buffer.from(`\r\n--${boundary}--\r\n`, "latin1"),
  ]);
}

async function* once(buffer) {
  yield buffer;
}

onBothBackends(
  "the image of the plan: a capture attached to its plan, in no night and no variant; refused without the multi-night plans",
  async (driver) => {
    const directory = await mkdtemp(join(tmpdir(), "astro-plan-image-"));
    const previous = process.env.ASTRO_PORTAL_CAPTURES_DIR;
    process.env.ASTRO_PORTAL_CAPTURES_DIR = join(directory, "captures");
    try {
      const heart = await seedHeart(driver);
      const { tenantId, userId, projectId, nights } = heart;
      let active = false;
      const profile = {
        ...OPEN_SOURCE_PROFILE,
        "storage.max_file_bytes": 1000,
        "storage.quota_bytes": 5000,
      };
      const uploads = await createUploadResourceService({
        driver,
        capabilities: profile,
        multiNightActive: async (who) => active && who === userId,
      });
      const bytes = Buffer.concat([
        Buffer.from("plan image"),
        Buffer.alloc(200, 3),
      ]);
      const metadata = {
        originalName: "ic1805-plan.jpg",
        sha256: digest(bytes),
        byteSize: bytes.length,
        targetIds: [],
        role: "plan",
        projectId,
        combinedNightIds: [nights.aug9, nights.aug10],
        totalsByFilter: [
          {
            filter: "Bibande (Hα + OIII)",
            frameCount: 98,
            totalSeconds: 17640,
          },
          { filter: "RGB", frameCount: 89, totalSeconds: 8010 },
        ],
        planRender: "dualband",
      };
      const send = (declared) =>
        uploads.receiveUpload({
          tenantId,
          userId,
          contentType: `multipart/form-data; boundary=${boundary}`,
          bodyChunks: once(multipart(declared, bytes)),
          caller: SYNC,
        });

      // Without the multi-night plans (a private server, or no avancée+).
      const closed = await refusal(send(metadata));
      assert.equal(closed.status, 403);
      assert.equal(closed.body.error.code, "multi_night_not_active");
      assert.equal(closed.body.capability, "analysis.progression");
      const checked = await refusal(
        uploads.checkUpload({ tenantId, userId, caller: SYNC, ...metadata }),
      );
      assert.equal(checked.body.error.code, "multi_night_not_active");

      active = true;
      // A plan image names its plan and belongs to no night.
      for (const declared of [
        { ...metadata, projectId: undefined },
        { ...metadata, sessionId: nights.aug9 },
        { ...metadata, captureId: randomUUID() },
        { ...metadata, role: undefined },
        { ...metadata, planRender: "pretty" },
      ]) {
        const invalid = await refusal(send(declared));
        assert.equal(invalid.status, 400, JSON.stringify(declared));
      }
      const unknown = await refusal(
        send({ ...metadata, projectId: randomUUID() }),
      );
      assert.equal(unknown.body.error.code, "project_not_found");

      const received = await send(metadata);
      assert.equal(received.status, 201);
      const capture = received.body.capture;
      assert.equal(capture.projectId, projectId);
      assert.equal(capture.sessionId, null);
      assert.equal(capture.planId, null);
      assert.deepEqual(capture.plan, {
        combinedNightIds: [nights.aug9, nights.aug10],
        totalsByFilter: metadata.totalsByFilter,
        render: "dualband",
      });

      // The plan answers it; it is in no night's captures and no variant.
      const service = await createProjectIntegrationService({ driver });
      const extras = await service.projectExtras({ tenantId, projectId });
      assert.equal(extras.planCaptureCount, 1);
      assert.deepEqual(extras.planCapture, {
        id: capture.id,
        createdAt: capture.createdAt,
        combinedNightIds: [nights.aug9, nights.aug10],
        totalsByFilter: metadata.totalsByFilter,
        render: "dualband",
      });
      const { rows } = await driver.query(
        "SELECT COUNT(*) AS n FROM captures WHERE session_id IS NOT NULL OR plan_id IS NOT NULL",
      );
      assert.equal(Number(rows[0].n), 0, "no night's capture");
      const store = await createCaptureRepository({ driver, migrate: false });
      assert.equal(await store.alternativeCount(tenantId, capture.id), 0);
      // An ordinary capture carries neither projectId nor plan.
      const night = Buffer.concat([Buffer.from("night"), Buffer.alloc(100, 5)]);
      const ordinary = await uploads.receiveUpload({
        tenantId,
        userId,
        contentType: `multipart/form-data; boundary=${boundary}`,
        bodyChunks: once(
          multipart(
            {
              originalName: "night.jpg",
              sha256: digest(night),
              byteSize: night.length,
              sessionId: nights.aug9,
            },
            night,
          ),
        ),
        caller: SYNC,
      });
      assert.equal("projectId" in ordinary.body.capture, false);
      assert.equal("plan" in ordinary.body.capture, false);
    } finally {
      if (previous === undefined) delete process.env.ASTRO_PORTAL_CAPTURES_DIR;
      else process.env.ASTRO_PORTAL_CAPTURES_DIR = previous;
      await rm(directory, { force: true, recursive: true });
    }
  },
);
