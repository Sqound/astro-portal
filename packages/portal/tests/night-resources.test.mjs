// The night's service on both dialects — the fields read through the
// plan until set (the place without its time zone), the edition bounded by
// the space, the steps, and « what is online » built from the night's
// captures, their images and their sky solutions.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createNightService,
  nightChangesInput,
  nightOf,
  stepInput,
} from "../dist/api/night-resources.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";

const at = "2026-10-07T21:05:00.000Z";
const sha = (letter) => letter.repeat(64);

async function seed(driver) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const sessionId = randomUUID();
  const planId = randomUUID();
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, "Col des Étoiles", at],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [userId, `${userId}@example.test`, "test-only", at],
  );
  await driver.run(
    `INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, plan_date, name, location_json, equipment_json, created_at, updated_at, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      planId,
      tenantId,
      userId,
      `browser-${planId}`,
      "2026-10-07",
      "Nuit de la Lunette",
      null,
      null,
      at,
      at,
      JSON.stringify({
        id: `browser-${planId}`,
        name: "Nuit de la Lunette",
        location: {
          locality: "Col des Étoiles",
          latitude: "45",
          longitude: "-30",
          timeZone: "Europe/Paris",
        },
        equipment: { telescopeId: "telescope-1", mode: "imaging" },
        items: [
          { id: "a", targetId: "m31" },
          { id: "b", target: { id: "ngc7000" } },
        ],
      }),
    ],
  );
  await driver.run(
    "INSERT INTO observation_sessions (id, tenant_id, plan_id, started_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'finished', ?, ?)",
    [sessionId, tenantId, planId, at, at, at],
  );
  return { tenantId, userId, sessionId, planId };
}

async function insertCapture(
  driver,
  tenantId,
  sessionId,
  { id, targets, images },
) {
  await driver.run(
    "INSERT INTO captures (id, tenant_id, session_id, original_name, sha256, byte_size, status, stage, created_at) VALUES (?, ?, ?, ?, ?, ?, 'uploaded', 'draft', ?)",
    [id, tenantId, sessionId, images[0].name, images[0].sha, 14, at],
  );
  for (const [position, target] of targets.entries())
    await driver.run(
      "INSERT INTO capture_targets (capture_id, target_id, position) VALUES (?, ?, ?)",
      [id, target, position],
    );
  for (const [index, image] of images.entries()) {
    await driver.run(
      "INSERT INTO capture_variants (id, capture_id, tenant_id, sha256, byte_size, original_name, source, is_main, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        image.id,
        id,
        tenantId,
        image.sha,
        14 + index,
        image.name,
        image.source,
        index === 0 ? 1 : 0,
        at,
      ],
    );
    if (image.solved)
      await driver.run(
        "INSERT INTO capture_sky_solutions (image_id, capture_id, tenant_id, sha256, solution_json, source, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', 'astap', ?, ?)",
        [image.id, id, tenantId, image.sha, at, at],
      );
  }
}

async function expectError(action, { code, status }) {
  await assert.rejects(action, (error) => {
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });
}

async function exerciseNight(driver) {
  for (const [id, designation] of [
    ["m31", "M31"],
    ["ngc7000", "NGC 7000"],
  ])
    await driver.run(
      `INSERT INTO target_catalogue_entries (id, designation, aliases_json, common_names_json, catalogues_json, catalogue, source_json, source_revision, created_at, updated_at)
       VALUES (?, ?, '[]', '[]', '[]', 'NGC', '{}', 'r1', ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [id, designation, at, at],
    );
  const camille = await seed(driver);
  const other = await seed(driver);
  const nights = await createNightService({ driver });
  const { tenantId, sessionId } = camille;

  // Read through the plan: the place's locality and coordinates (numbers),
  // never its time zone.
  let read = await nights.read({ tenantId, sessionId });
  assert.deepEqual(read.night.place, {
    value: { name: "Col des Étoiles", latitude: 45, longitude: -30 },
    source: "plan",
  });
  assert.deepEqual(read.night.targetIds.value, ["m31", "ngc7000"]);
  assert.equal(read.night.equipment.value.telescopeId, "telescope-1");

  // The owner sets the night's own; another space never finds it.
  const patched = await nights.patchNight({
    tenantId,
    sessionId,
    changes: { title: "  Nuit du mer. 7 oct.  ", notes: "" },
  });
  assert.equal(patched.night.title.value, "Nuit du mer. 7 oct.");
  assert.equal(patched.night.notes.value, null);
  assert.ok(patched.session.updatedAt > at);
  await expectError(
    () =>
      nights.patchNight({
        tenantId: other.tenantId,
        sessionId,
        changes: { title: "Autre" },
      }),
    { code: "session_not_found", status: 404 },
  );
  await expectError(
    () => nights.read({ tenantId: other.tenantId, sessionId }),
    { code: "session_not_found", status: 404 },
  );

  // Steps: one of the other space's never moves.
  const step = await nights.createStep({
    tenantId,
    sessionId,
    step: {
      targetId: "ngc7000",
      filter: "Ha ",
      frameCount: 40,
      exposureSeconds: 180.5,
    },
  });
  assert.equal(step.filter, "Ha ", "the person's text is never normalized");
  assert.equal(step.integrationSeconds, 7220);
  await expectError(
    () =>
      nights.patchStep({
        tenantId: other.tenantId,
        sessionId,
        stepId: step.id,
        changes: { frameCount: 1 },
      }),
    { code: "session_not_found", status: 404 },
  );
  await expectError(
    () => nights.deleteStep({ tenantId, sessionId, stepId: randomUUID() }),
    { code: "step_not_found", status: 404 },
  );
  await expectError(
    () =>
      nights.createStep({
        tenantId,
        sessionId,
        step: { targetId: "nowhere", frameCount: 1, exposureSeconds: 1 },
      }),
    { code: "target_not_found", status: 422 },
  );

  // What is online: the phone's M31 with an Astro Sync variant, its main
  // image solved; the web's NGC 7000, not solved.
  await insertCapture(driver, tenantId, sessionId, {
    id: randomUUID(),
    targets: ["m31"],
    images: [
      {
        id: randomUUID(),
        sha: sha("a"),
        name: "M31_final.jpg",
        source: "phone",
        solved: true,
      },
      {
        id: randomUUID(),
        sha: sha("b"),
        name: "M31_final_v2.jpg",
        source: "astro-sync",
      },
    ],
  });
  await insertCapture(driver, tenantId, sessionId, {
    id: randomUUID(),
    targets: ["ngc7000"],
    images: [
      {
        id: randomUUID(),
        sha: sha("c"),
        name: "NGC7000_final.tif",
        source: "web",
      },
    ],
  });
  const online = await nights.online({ tenantId, sessionId });
  assert.deepEqual(
    online.targets.map((target) => [
      target.targetId,
      target.name,
      target.captures.map((capture) => [
        capture.source,
        capture.imageCount,
        capture.images.map((image) => [image.sha256, image.skySolution]),
      ]),
    ]),
    [
      [
        "m31",
        "M31",
        [
          [
            "phone",
            2,
            [
              [sha("a"), "present"],
              [sha("b"), "missing"],
            ],
          ],
        ],
      ],
      ["ngc7000", "NGC 7000", [["web", 1, [[sha("c"), "missing"]]]]],
    ],
  );
  assert.equal(online.analysis.present, false);
  await expectError(
    () => nights.online({ tenantId: other.tenantId, sessionId }),
    { code: "session_not_found", status: 404 },
  );

  read = await nights.read({ tenantId, sessionId });
  assert.equal(read.steps.length, 1);
  await nights.close();
}

test("nightOf: a night's own field wins; null reads the plan's; no plan reads none", () => {
  const plan = {
    name: "Nuit de la Lunette",
    payload_json: JSON.stringify({
      location: { name: "Col des Étoiles", timeZone: "Europe/Paris" },
      items: [],
    }),
  };
  const night = nightOf(
    {
      title: null,
      started_at: at,
      place_json: '{"name":"Plateau","latitude":null,"longitude":null}',
    },
    plan,
  );
  assert.deepEqual(night.title, {
    value: "Nuit de la Lunette",
    source: "plan",
  });
  assert.deepEqual(night.place.value, {
    name: "Plateau",
    latitude: null,
    longitude: null,
  });
  assert.deepEqual(night.targetIds, { value: [], source: "plan" });
  const alone = nightOf({ started_at: at }, null);
  assert.deepEqual(alone.title, { value: null, source: "night" });
  assert.deepEqual(alone.place, { value: null, source: "night" });
});

test("nightChangesInput: the place without a time zone, null back to the plan, the person's notes kept as typed", () => {
  assert.deepEqual(
    nightChangesInput({
      place: { name: " Col des Étoiles ", latitude: 45 },
      targetIds: ["m31", "m31", "ngc7000"],
      notes: "  Rosée vers 02:00. ",
      equipment: null,
    }),
    {
      place: { name: "Col des Étoiles", latitude: 45, longitude: null },
      targetIds: ["m31", "ngc7000"],
      notes: "  Rosée vers 02:00. ",
      equipment: null,
    },
  );
  for (const body of [
    { place: { name: "Col des Étoiles", timeZone: "Europe/Paris" } },
    { place: { name: "Col des Étoiles", latitude: 91 } },
    { place: { name: "  " } },
    { startedAt: "hier" },
    { targetIds: "m31" },
    {},
    null,
  ])
    assert.throws(
      () => nightChangesInput(body),
      (error) => error.code === "invalid_request" && error.status === 400,
      JSON.stringify(body),
    );
});

test("stepInput: frames and exposure required to add, the filter never normalized, nothing computed accepted", () => {
  assert.deepEqual(
    stepInput(
      { filter: "L-Pro ", frameCount: 40, exposureSeconds: 180 },
      { create: true },
    ),
    { filter: "L-Pro ", frameCount: 40, exposureSeconds: 180 },
  );
  assert.deepEqual(stepInput({ filter: "" }), { filter: null });
  for (const [body, create] of [
    [{ frameCount: 40 }, true],
    [{ frameCount: 1.5, exposureSeconds: 60 }, true],
    [{ frameCount: 1, exposureSeconds: 0 }, true],
    [{ gain: -1 }, false],
    [{ integrationSeconds: 7200 }, false],
    [{}, false],
  ])
    assert.throws(
      () => stepInput(body, { create }),
      (error) => error.code === "invalid_request",
      JSON.stringify(body),
    );
});

test("the night's service on scratch SQLite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-night-service-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    await exerciseNight(driver);
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "the night's service on PostgreSQL",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const databaseUrl = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(databaseUrl))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const reset = async () => {
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
      await reset();
      driver = createDatabaseDriver({ databaseUrl });
      await applyMigrations(driver, "postgres");
      await exerciseNight(driver);
    } finally {
      if (driver) await driver.close();
      await reset();
    }
  },
);
