import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CaptureRepositoryError,
  createCaptureRepository,
} from "../dist/persistence/capture-repository.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";
import { subscribe } from "../dist/api/change-bus.js";
import { onBothBackends } from "./helpers/both-backends.mjs";

const initialTime = "2026-09-20T20:00:00.000Z";

async function seedCatalogueTarget(driver, targetId) {
  await driver.run(
    `INSERT INTO target_catalogue_entries (
       id, designation, aliases_json, common_names_json, catalogues_json,
       catalogue, source_json, source_revision, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      targetId,
      targetId,
      "[]",
      "[]",
      '["OpenNGC"]',
      "OpenNGC",
      "{}",
      "test-v1",
      initialTime,
      initialTime,
    ],
  );
}

async function seedTenant(
  driver,
  tenantId,
  { withCatalogueTargets = [] } = {},
) {
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, `Observatory ${tenantId}`, initialTime],
  );
  for (const targetId of withCatalogueTargets)
    await seedCatalogueTarget(driver, targetId);
}

async function seedPlan(driver, { planId, tenantId, userId }) {
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [userId, `${userId}@example.test`, "scrypt$test", initialTime],
  );
  await driver.run(
    "INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, plan_date, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      planId,
      tenantId,
      userId,
      `client-${planId}`,
      "2026-09-20",
      "Test plan",
      initialTime,
      initialTime,
    ],
  );
}

async function exerciseCaptureRepository(driver) {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const userId = randomUUID();
  const planId = randomUUID();
  await seedTenant(driver, tenantId, {
    withCatalogueTargets: ["m31", "ngc224", "m45"],
  });
  await seedTenant(driver, otherTenantId);
  await seedPlan(driver, { planId, tenantId, userId });

  const repository = await createCaptureRepository({ driver });

  assert.equal(await repository.usedBytes(tenantId), 0);
  assert.deepEqual(await repository.findPlan(tenantId, null), null);
  assert.equal((await repository.findPlan(tenantId, planId)).id, planId);
  assert.equal(await repository.findPlan(otherTenantId, planId), null);

  assert.deepEqual(
    await repository.existingTargetIds(["m31", "does-not-exist", "ngc224"]),
    ["m31", "ngc224"],
  );
  assert.deepEqual(await repository.existingTargetIds([]), []);

  // insertCaptureWithTargets emits `captures` for the tenant whenever
  // it creates a row or adds a target, and nothing on a fully
  // deduplicated resend.
  const changeEvents = [];
  const unsubscribeChanges = subscribe(tenantId, (event) =>
    changeEvents.push(event),
  );

  const sha256 = "a".repeat(64);
  const firstId = randomUUID();
  const first = await repository.insertCaptureWithTargets({
    id: firstId,
    tenantId,
    planId,
    targetIds: ["m31"],
    originalName: "m31-final.jpg",
    sha256,
    byteSize: 4194304,
    createdAt: initialTime,
    originClientInstanceId: "instance-writer",
  });
  assert.equal(first.created, true);
  assert.equal(first.deduplicated, false);
  assert.equal(first.targetsAdded, 1);
  assert.equal(changeEvents.length, 1);
  assert.deepEqual(changeEvents[0].domains, ["captures"]);
  assert.equal(changeEvents[0].originClientInstanceId, "instance-writer");
  assert.equal(first.capture.id, firstId);
  assert.deepEqual(first.capture.targetIds, ["m31"]);
  assert.equal(first.capture.planId, planId);
  assert.equal(first.capture.status, "uploaded");
  assert.equal(first.capture.visibility, "private");

  assert.equal(await repository.usedBytes(tenantId), 4194304);

  // Same bytes again, one more target: one row, two targets, one added.
  const secondId = randomUUID();
  const second = await repository.insertCaptureWithTargets({
    id: secondId,
    tenantId,
    planId: randomUUID(), // must NOT override the stored planId
    targetIds: ["m31", "ngc224"],
    originalName: "renamed.jpg", // must NOT override the stored name
    sha256,
    byteSize: 999, // must NOT override the stored byte size
    createdAt: "2026-09-20T21:00:00.000Z",
  });
  assert.equal(second.created, false);
  assert.equal(second.deduplicated, true);
  assert.equal(second.targetsAdded, 1);
  // A new target was added to the existing capture: a second event.
  assert.equal(changeEvents.length, 2);
  assert.deepEqual(changeEvents[1].domains, ["captures"]);
  assert.equal(second.capture.id, firstId, "the original row, not a new one");
  assert.deepEqual(second.capture.targetIds, ["m31", "ngc224"]);
  assert.equal(second.capture.planId, planId, "first association stands");
  assert.equal(second.capture.originalName, "m31-final.jpg");
  assert.equal(second.capture.byteSize, 4194304);

  // Used bytes are unaffected: still one stored file.
  assert.equal(await repository.usedBytes(tenantId), 4194304);

  // Sent again, unchanged: nothing added.
  const third = await repository.insertCaptureWithTargets({
    id: randomUUID(),
    tenantId,
    targetIds: ["m31", "ngc224"],
    originalName: "m31-final.jpg",
    sha256,
    byteSize: 4194304,
    createdAt: "2026-09-20T22:00:00.000Z",
  });
  assert.equal(third.targetsAdded, 0);
  assert.deepEqual(third.capture.targetIds, ["m31", "ngc224"]);
  // Fully deduplicated, nothing new: no third event.
  assert.equal(changeEvents.length, 2);
  unsubscribeChanges();

  // The same bytes for a different tenant are a distinct capture.
  const otherTenantSha = "b".repeat(64);
  const otherTenantCapture = await repository.insertCaptureWithTargets({
    id: randomUUID(),
    tenantId: otherTenantId,
    originalName: "m31-final.jpg",
    sha256: otherTenantSha,
    byteSize: 1024,
    createdAt: initialTime,
  });
  assert.equal(otherTenantCapture.created, true);
  assert.equal(await repository.usedBytes(otherTenantId), 1024);
  assert.equal(await repository.usedBytes(tenantId), 4194304);

  // More than 16 targets in one request: refused, nothing written.
  await assert.rejects(
    repository.insertCaptureWithTargets({
      id: randomUUID(),
      tenantId,
      originalName: "too-many.jpg",
      sha256: "c".repeat(64),
      byteSize: 10,
      targetIds: Array.from({ length: 17 }, (_, index) => `t${index}`),
      createdAt: initialTime,
    }),
    (error) => {
      assert.ok(error instanceof CaptureRepositoryError);
      assert.equal(error.code, "invalid_request");
      assert.equal(error.status, 400);
      return true;
    },
  );
  // COUNT(*) comes back as a number from SQLite and as a bigint string from
  // PostgreSQL: compare the value, not its representation.
  assert.equal(
    Number(
      (
        await driver.query(
          "SELECT COUNT(*) AS count FROM captures WHERE sha256 = ?",
          ["c".repeat(64)],
        )
      ).rows[0].count,
    ),
    0,
  );

  // Unioning onto an existing capture past the 16-target cap is refused too,
  // and adds nothing (not even a partial union).
  const manyTargets = Array.from({ length: 16 }, (_, index) => `t${index}`);
  for (const targetId of manyTargets)
    await seedCatalogueTarget(driver, targetId);
  const fullSha = "d".repeat(64);
  await repository.insertCaptureWithTargets({
    id: randomUUID(),
    tenantId,
    originalName: "full.jpg",
    sha256: fullSha,
    byteSize: 10,
    targetIds: manyTargets,
    createdAt: "2026-09-20T20:30:00.000Z",
  });
  await assert.rejects(
    repository.insertCaptureWithTargets({
      id: randomUUID(),
      tenantId,
      originalName: "full-again.jpg",
      sha256: fullSha,
      byteSize: 10,
      targetIds: ["m31"], // one more than the 16 already stored
      createdAt: initialTime,
    }),
    (error) => {
      assert.ok(error instanceof CaptureRepositoryError);
      assert.equal(error.code, "invalid_request");
      return true;
    },
  );
  const stillSixteen = (
    await driver.query(
      "SELECT COUNT(*) AS count FROM capture_targets WHERE capture_id = (SELECT id FROM captures WHERE sha256 = ?)",
      [fullSha],
    )
  ).rows[0].count;
  assert.equal(Number(stillSixteen), 16);

  // A dangling session id (the observation-session repository's extension
  // point, not yet implemented) is refused as session_not_found rather than
  // silently inserting a bad reference.
  await assert.rejects(
    repository.insertCaptureWithTargets({
      id: randomUUID(),
      tenantId,
      sessionId: randomUUID(),
      originalName: "orphan-session.jpg",
      sha256: "e".repeat(64),
      byteSize: 10,
      createdAt: initialTime,
    }),
    (error) => {
      assert.ok(error instanceof CaptureRepositoryError);
      assert.equal(error.code, "session_not_found");
      assert.equal(error.status, 404);
      return true;
    },
  );

  // A third, distinct capture so pagination has something to cut.
  await repository.insertCaptureWithTargets({
    id: randomUUID(),
    tenantId,
    originalName: "third.jpg",
    sha256: "f".repeat(64),
    byteSize: 10,
    createdAt: "2026-09-20T23:00:00.000Z",
  });

  // Pagination: ascending, inclusive `since`, capped limit, hasMore flag.
  const page1 = await repository.listCaptures({ tenantId, limit: 2 });
  assert.equal(page1.captures.length, 2);
  assert.equal(page1.hasMore, true);
  assert.equal(page1.captures[0].id, firstId);
  const lastOfPage1 = page1.captures[page1.captures.length - 1].id;
  const page2 = await repository.listCaptures({
    tenantId,
    since: page1.nextSince,
    limit: 2,
  });
  // `since` is inclusive: the boundary row is seen again, never skipped.
  assert.ok(page2.captures.some((capture) => capture.id === lastOfPage1));
  assert.equal(page2.hasMore, false);

  const targetFiltered = await repository.listCaptures({
    tenantId,
    targetId: "ngc224",
  });
  assert.deepEqual(
    targetFiltered.captures.map((capture) => capture.id),
    [firstId],
  );

  const emptyFilter = await repository.listCaptures({
    tenantId,
    targetId: "does-not-exist",
  });
  assert.deepEqual(emptyFilter.captures, []);

  await repository.close();
}

test("capture repository preserves idempotent target unions on scratch SQLite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-capture-repository-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    await exerciseCaptureRepository(driver);
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "capture repository preserves idempotent target unions on PostgreSQL",
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
      await exerciseCaptureRepository(driver);
    } finally {
      if (driver) await driver.close();
      await resetSchema();
    }
  },
);

// ---- The visibility and the two checks of a capture.

async function sentCapture(repository, tenantId, { name, createdAt }) {
  const { capture } = await repository.insertCaptureWithTargets({
    id: randomUUID(),
    tenantId,
    originalName: name,
    sha256: createHashOf(name),
    byteSize: 1000,
    createdAt,
  });
  return capture;
}

const createHashOf = (text) =>
  Buffer.from(text.padEnd(32, "-").slice(0, 32)).toString("hex");

async function stateColumns(driver, captureId) {
  return (
    await driver.query(
      `SELECT visibility, auto_check, auto_check_reason, auto_check_at,
              admin_check, admin_check_at, admin_check_reason, admin_check_note,
              review_requested_at, protection_notice_at, protection_lifted_at,
              removed_from_gallery_at
       FROM captures WHERE id = ?`,
      [captureId],
    )
  ).rows[0];
}

onBothBackends(
  "a capture is born private and the resource reads its visibility from the row",
  async (driver) => {
    const tenantId = randomUUID();
    await seedTenant(driver, tenantId);
    const repository = await createCaptureRepository({ driver });
    const capture = await sentCapture(repository, tenantId, {
      name: "M31_LRGB_final.tif",
      createdAt: initialTime,
    });
    assert.equal(capture.visibility, "private");
    assert.equal(
      (await stateColumns(driver, capture.id)).visibility,
      "private",
    );
    // Written behind the repository's back: the resource reads the row.
    await driver.run("UPDATE captures SET visibility = 'public' WHERE id = ?", [
      capture.id,
    ]);
    assert.equal(
      (await repository.getCaptureById(tenantId, capture.id)).visibility,
      "public",
    );
    const listed = await repository.listCaptures({ tenantId });
    assert.equal(listed.captures[0].visibility, "public");
    await repository.close();
  },
);

onBothBackends(
  "the visibility, the automatic result, the team's flag and the dates are written for one space only",
  async (driver) => {
    const tenantId = randomUUID();
    const otherTenantId = randomUUID();
    await seedTenant(driver, tenantId);
    await seedTenant(driver, otherTenantId);
    const repository = await createCaptureRepository({ driver });
    const capture = await sentCapture(repository, tenantId, {
      name: "IMG_2041.jpg",
      createdAt: initialTime,
    });

    assert.equal(
      await repository.setVisibility(tenantId, capture.id, "public"),
      true,
    );
    assert.equal(
      await repository.recordAutomaticCheck(tenantId, capture.id, {
        result: "other",
        reason: "person_detected",
        at: "2026-10-01T10:00:00.000Z",
      }),
      true,
    );
    await repository.recordProtectionNotice(
      tenantId,
      capture.id,
      "2026-10-01T10:00:01.000Z",
    );
    await repository.requestReview(
      tenantId,
      capture.id,
      "2026-10-02T09:00:00.000Z",
    );
    await repository.liftProtection(
      tenantId,
      capture.id,
      "2026-10-03T09:00:00.000Z",
    );
    await repository.recordTeamCheck(tenantId, capture.id, {
      result: "refused",
      reason: "identifiable",
      note: "Un visage au premier plan",
      at: "2026-10-04T09:00:00.000Z",
    });
    assert.deepEqual(await stateColumns(driver, capture.id), {
      visibility: "public",
      auto_check: "other",
      auto_check_reason: "person_detected",
      auto_check_at: "2026-10-01T10:00:00.000Z",
      admin_check: "refused",
      admin_check_at: "2026-10-04T09:00:00.000Z",
      admin_check_reason: "identifiable",
      admin_check_note: "Un visage au premier plan",
      review_requested_at: "2026-10-02T09:00:00.000Z",
      protection_notice_at: "2026-10-01T10:00:01.000Z",
      protection_lifted_at: "2026-10-03T09:00:00.000Z",
      removed_from_gallery_at: null,
    });

    // The owner's resource carries the checks, never the machine reason.
    const resource = await repository.getCaptureById(tenantId, capture.id);
    assert.deepEqual(resource.checks, {
      automatic: "other",
      automaticAt: "2026-10-01T10:00:00.000Z",
      team: "refused",
      teamAt: "2026-10-04T09:00:00.000Z",
      teamReason: "identifiable",
      reviewRequestedAt: "2026-10-02T09:00:00.000Z",
      protectionNoticeAt: "2026-10-01T10:00:01.000Z",
      protectionLiftedAt: "2026-10-03T09:00:00.000Z",
      removedFromGalleryAt: null,
    });
    assert.ok(!JSON.stringify(resource).includes("person_detected"));

    // Another space writes nothing on it.
    assert.equal(
      await repository.setVisibility(otherTenantId, capture.id, "private"),
      false,
    );
    assert.equal(
      await repository.removeFromGallery(otherTenantId, capture.id),
      false,
    );
    assert.equal((await stateColumns(driver, capture.id)).visibility, "public");

    // Values outside the enumerations are refused before any write.
    for (const write of [
      () => repository.setVisibility(tenantId, capture.id, "unlisted"),
      () =>
        repository.recordAutomaticCheck(tenantId, capture.id, {
          result: "maybe",
        }),
      () =>
        repository.recordTeamCheck(tenantId, capture.id, {
          result: "pending",
        }),
      () =>
        repository.recordTeamCheck(tenantId, capture.id, {
          result: "refused",
          reason: "ugly",
        }),
    ])
      await assert.rejects(write(), (error) => {
        assert.ok(error instanceof CaptureRepositoryError);
        assert.equal(error.code, "invalid_request");
        return true;
      });
    await repository.close();
  },
);

onBothBackends(
  "a removal from the gallery lasts until the team approves",
  async (driver) => {
    const tenantId = randomUUID();
    await seedTenant(driver, tenantId);
    const repository = await createCaptureRepository({ driver });
    const capture = await sentCapture(repository, tenantId, {
      name: "voie-lactee-crete.jpg",
      createdAt: initialTime,
    });
    await repository.setVisibility(tenantId, capture.id, "public");
    await repository.removeFromGallery(
      tenantId,
      capture.id,
      "2026-10-05T00:00:00.000Z",
    );
    assert.equal(
      (await stateColumns(driver, capture.id)).removed_from_gallery_at,
      "2026-10-05T00:00:00.000Z",
    );
    await repository.recordTeamCheck(tenantId, capture.id, {
      result: "approved",
      at: "2026-10-06T00:00:00.000Z",
    });
    const after = await stateColumns(driver, capture.id);
    assert.equal(after.removed_from_gallery_at, null);
    assert.equal(after.admin_check, "approved");
    assert.equal(after.admin_check_reason, null);
    await repository.close();
  },
);

onBothBackends(
  "the public list spans the spaces, newest first, without removed or refused captures",
  async (driver) => {
    const spaceA = randomUUID();
    const spaceB = randomUUID();
    await seedTenant(driver, spaceA);
    await seedTenant(driver, spaceB);
    const repository = await createCaptureRepository({ driver });
    const at = (day) => `2026-10-0${day}T20:00:00.000Z`;
    const shown1 = await sentCapture(repository, spaceA, {
      name: "a-1",
      createdAt: at(1),
    });
    const shown2 = await sentCapture(repository, spaceB, {
      name: "b-2",
      createdAt: at(2),
    });
    const approved = await sentCapture(repository, spaceA, {
      name: "a-3",
      createdAt: at(3),
    });
    const removed = await sentCapture(repository, spaceB, {
      name: "b-4",
      createdAt: at(4),
    });
    const refused = await sentCapture(repository, spaceA, {
      name: "a-5",
      createdAt: at(5),
    });
    const privateOne = await sentCapture(repository, spaceB, {
      name: "b-6",
      createdAt: at(6),
    });
    for (const [tenantId, capture] of [
      [spaceA, shown1],
      [spaceB, shown2],
      [spaceA, approved],
      [spaceB, removed],
      [spaceA, refused],
    ])
      await repository.setVisibility(tenantId, capture.id, "public");
    await repository.recordTeamCheck(spaceA, approved.id, {
      result: "approved",
    });
    await repository.removeFromGallery(spaceB, removed.id);
    await repository.recordTeamCheck(spaceA, refused.id, {
      result: "refused",
      reason: "not_sky",
    });
    assert.equal(privateOne.visibility, "private");

    const all = await repository.listPublicCaptures();
    assert.deepEqual(
      all.items.map((item) => item.capture.id),
      [approved.id, shown2.id, shown1.id],
    );
    assert.deepEqual(
      all.items.map((item) => item.tenantId),
      [spaceA, spaceB, spaceA],
    );
    assert.equal(all.hasMore, false);

    const first = await repository.listPublicCaptures({ limit: 2 });
    assert.equal(first.hasMore, true);
    const last = first.items.at(-1).capture;
    const second = await repository.listPublicCaptures({
      limit: 2,
      before: { createdAt: last.createdAt, id: last.id },
    });
    assert.deepEqual(
      second.items.map((item) => item.capture.id),
      [shown1.id],
    );
    assert.equal(second.hasMore, false);
    await repository.close();
  },
);

onBothBackends(
  "the pending checks are the captures of every space not checked yet, oldest first",
  async (driver) => {
    const spaceA = randomUUID();
    const spaceB = randomUUID();
    await seedTenant(driver, spaceA);
    await seedTenant(driver, spaceB);
    const repository = await createCaptureRepository({ driver });
    const older = await sentCapture(repository, spaceB, {
      name: "dark_300s_-10C.fits",
      createdAt: "2026-09-27T20:00:00.000Z",
    });
    const checked = await sentCapture(repository, spaceA, {
      name: "NGC7000_HOO.jpg",
      createdAt: "2026-09-28T20:00:00.000Z",
    });
    const newer = await sentCapture(repository, spaceA, {
      name: "M45_RGB.png",
      createdAt: "2026-09-29T20:00:00.000Z",
    });
    await repository.recordAutomaticCheck(spaceA, checked.id, {
      result: "sky",
    });
    const pending = await repository.listPendingChecks();
    assert.deepEqual(
      pending.map((item) => [item.tenantId, item.capture.id]),
      [
        [spaceB, older.id],
        [spaceA, newer.id],
      ],
    );
    assert.equal(pending[0].capture.sha256, older.sha256);
    assert.equal((await repository.listPendingChecks({ limit: 1 })).length, 1);
    await repository.close();
  },
);
