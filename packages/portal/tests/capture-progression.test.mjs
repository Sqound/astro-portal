// The progression images
// Astro Sync makes during a night are the history of their target's
// capture — `role: "progression"` with a `captureId` —, never its main
// image, never a variant: not counted against `capture.variant_limit`, out
// of the list of the images, the galleries and « what is online for a
// night », listed on the capture's page from the first milestone to the
// last.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createUploadResourceService } from "../dist/api/upload-resources.js";
import { createOwnerCaptureService } from "../dist/captures/owner-captures.js";
import { createCaptureRepository } from "../dist/persistence/capture-repository.js";
import {
  captureFileExists,
  capturePathFor,
} from "../dist/uploads/capture-storage.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { OPEN_SOURCE_PROFILE } from "../dist/capabilities/profiles.js";
import { createNightRepository } from "../dist/persistence/night-repository.js";

const at = "2026-10-12T09:41:00.000Z";
const boundary = "astro-portal-progression-test-boundary";
const SYNC = { kind: "device", application: "sync" };
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const image = (label, size = 100) =>
  Buffer.concat([Buffer.from(label), Buffer.alloc(size - label.length, 7)]);
// A space that keeps no variant: the history goes all the same.
const profile = {
  ...OPEN_SOURCE_PROFILE,
  "storage.max_file_bytes": 1000,
  "storage.quota_bytes": 5000,
  "capture.variant_limit": 0,
  "capture.count_limit": 1,
};

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
      'Content-Disposition: form-data; name="file"; filename="m.jpg"\r\nContent-Type: image/jpeg\r\n\r\n',
      "latin1",
    ),
    fileBytes,
    Buffer.from(`\r\n--${boundary}--\r\n`, "latin1"),
  ]);
}

async function* once(buffer) {
  yield buffer;
}

async function withSpace(fn) {
  const directory = await mkdtemp(join(tmpdir(), "astro-capture-progression-"));
  const previous = process.env.ASTRO_PORTAL_CAPTURES_DIR;
  process.env.ASTRO_PORTAL_CAPTURES_DIR = join(directory, "captures");
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  await applyMigrations(driver, "sqlite");
  const uploads = await createUploadResourceService({
    driver,
    dialect: "sqlite",
    capabilities: profile,
  });
  const owner = await createOwnerCaptureService({
    driver,
    dialect: "sqlite",
    capabilities: profile,
    sharedCopy: async ({ tenantId, sha256 }) => ({
      path: capturePathFor(tenantId, sha256),
      created: false,
    }),
    showable: async () => true,
  });
  const store = await createCaptureRepository({
    driver,
    dialect: "sqlite",
    migrate: false,
  });
  const tenantId = randomUUID();
  const userId = randomUUID();
  await driver.run(
    "INSERT INTO organizations (id, name, created_at, public_name) VALUES (?, ?, ?, ?)",
    [tenantId, "Col des Étoiles", at, "Camille"],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [userId, `${userId}@example.test`, "test-only", at],
  );
  await driver.run(
    "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)",
    [randomUUID(), tenantId, userId, at],
  );
  const space = { tenantId, userId };
  const send = (bytes, metadata = {}) =>
    uploads.receiveUpload({
      ...space,
      contentType: `multipart/form-data; boundary=${boundary}`,
      bodyChunks: once(
        multipart(
          {
            originalName: "IC_1805_2026-08-10_raw.png",
            sha256: digest(bytes),
            byteSize: bytes.length,
            source: "stacking",
            ...metadata,
          },
          bytes,
        ),
      ),
      caller: SYNC,
    });
  const milestone = (n, frames, captureId) =>
    send(image(`milestone-${n}`, 60), {
      captureId,
      role: "progression",
      progressionFrames: frames,
      originalName: `milestone_0${n}.jpg`,
      source: "astro-sync",
    });
  try {
    await fn({ driver, uploads, owner, store, space, send, milestone });
  } finally {
    await uploads.close();
    await driver.close();
    if (previous === undefined) delete process.env.ASTRO_PORTAL_CAPTURES_DIR;
    else process.env.ASTRO_PORTAL_CAPTURES_DIR = previous;
    await rm(directory, { force: true, recursive: true });
  }
}

test("the milestones are the capture's history: never a variant, never counted against the variant limit", async () => {
  await withSpace(async ({ owner, store, space, send, milestone }) => {
    const first = await send(image("stacked", 300));
    assert.equal(first.status, 201);
    const captureId = first.body.capture.id;
    // Sent in any order, read from the first milestone to the last.
    for (const [n, frames] of [
      [5, 90],
      [1, 1],
      [3, 45],
      [2, 23],
      [4, 68],
    ]) {
      const sent = await milestone(n, frames, captureId);
      assert.equal(sent.status, 201, JSON.stringify(sent.body));
      assert.equal(sent.body.capture.id, captureId);
      assert.equal(sent.body.variant.main, false);
      assert.equal(sent.body.variant.public, false);
      assert.equal(sent.body.variant.role, "progression");
      assert.equal(sent.body.variant.frameCount, frames);
    }
    const { tenantId } = space;
    assert.equal(await store.alternativeCount(tenantId, captureId), 0);
    assert.equal((await store.alternativeCounts(tenantId)).size, 0);
    assert.equal(await store.captureCount(tenantId), 1);
    // Every image counts in the storage.
    assert.equal(await store.usedBytes(tenantId), 300 + 5 * 60);
    assert.deepEqual(
      (await store.listVariants(tenantId, captureId)).map((v) => v.main),
      [true],
    );
    const detail = await owner.get({ ...space, captureId });
    assert.equal(detail.variants.length, 1);
    assert.deepEqual(
      detail.progression.map((step) => [step.originalName, step.frameCount]),
      [
        ["milestone_01.jpg", 1],
        ["milestone_02.jpg", 23],
        ["milestone_03.jpg", 45],
        ["milestone_04.jpg", 68],
        ["milestone_05.jpg", 90],
      ],
    );
    // The capture's main image is still the stacked one.
    assert.equal(
      (await store.getCaptureById(tenantId, captureId)).sha256,
      digest(image("stacked", 300)),
    );
    // A progression image is never the main one, never public.
    const step = detail.progression[0];
    await assert.rejects(
      owner.setMainImage({ ...space, captureId, imageId: step.id }),
      (error) => error.code === "progression_image",
    );
    await assert.rejects(
      owner.setVariantPublic({
        ...space,
        captureId,
        imageId: step.id,
        shown: true,
      }),
      (error) => error.code === "progression_image",
    );
    // The images of the capture go with it, its progression too.
    await owner.remove({ tenantId, captureId });
    assert.equal(
      await captureFileExists(tenantId, digest(image("milestone-1", 60))),
      false,
    );
    assert.deepEqual(await store.listProgression(tenantId, captureId), []);
  });
});

test("the check says a progression image is accepted as such, at a variant limit of 0", async () => {
  await withSpace(async ({ uploads, space, send }) => {
    const first = await send(image("stacked", 300));
    const captureId = first.body.capture.id;
    const check = (body) =>
      uploads.checkUpload({
        ...space,
        caller: SYNC,
        originalName: "milestone_01.jpg",
        ...body,
      });
    const progression = await check({
      sha256: "1".repeat(64),
      byteSize: 10,
      captureId,
      role: "progression",
      progressionFrames: 1,
    });
    assert.deepEqual(
      [progression.result, progression.adds],
      ["accepted", "progression"],
    );
    const variant = await check({
      sha256: "2".repeat(64),
      byteSize: 10,
      captureId,
    });
    assert.deepEqual(
      [variant.result, variant.code],
      ["refused", "capture_variant_limit_reached"],
    );
  });
});

test("a malformed progression image is refused before any byte", async () => {
  await withSpace(async ({ uploads, space, send }) => {
    const first = await send(image("stacked", 300));
    const captureId = first.body.capture.id;
    const create = (body) =>
      uploads.createUpload({
        ...space,
        caller: SYNC,
        originalName: "milestone_01.jpg",
        sha256: "3".repeat(64),
        byteSize: 10,
        ...body,
      });
    for (const body of [
      { role: "progression" },
      { captureId, role: "history" },
      { captureId, progressionFrames: 4 },
      { captureId, role: "progression", progressionFrames: 0 },
    ])
      await assert.rejects(
        create(body),
        (error) => error.code === "invalid_request" && error.status === 400,
        JSON.stringify(body),
      );
  });
});

test("a resumable upload keeps its role and its frames until it completes", async () => {
  await withSpace(async ({ uploads, store, space, send }) => {
    const first = await send(image("stacked", 300));
    const captureId = first.body.capture.id;
    const bytes = image("milestone-r", 80);
    const created = await uploads.createUpload({
      ...space,
      caller: SYNC,
      originalName: "milestone_05.jpg",
      sha256: digest(bytes),
      byteSize: bytes.length,
      captureId,
      role: "progression",
      progressionFrames: 90,
      source: "astro-sync",
    });
    assert.equal(created.status, 201);
    const uploadId = created.body.uploadId;
    await uploads.putUploadChunk({
      ...space,
      uploadId,
      declaredOffset: 0,
      declaredContentLength: bytes.length,
      bodyChunks: once(bytes),
    });
    const done = await uploads.finalizeUpload({
      ...space,
      uploadId,
      caller: SYNC,
    });
    assert.equal(done.body.captureId, captureId);
    const [step] = await store.listProgression(space.tenantId, captureId);
    assert.deepEqual(
      [step.role, step.frameCount, step.main],
      ["progression", 90, false],
    );
    assert.equal(await store.alternativeCount(space.tenantId, captureId), 0);
  });
});

test("a capture without an image does not take a milestone as its main image", async () => {
  await withSpace(async ({ owner, store, space, milestone }) => {
    const definition = await owner.create({ ...space, targetIds: [] });
    const captureId = definition.id ?? definition.capture?.id;
    assert.ok(captureId, JSON.stringify(definition));
    const sent = await milestone(1, 1, captureId);
    assert.equal(sent.body.variant.main, false);
    const capture = await store.getCaptureById(space.tenantId, captureId);
    assert.equal(capture.sha256, null);
  });
});

test("« what is online for a night » lists no progression image", async () => {
  await withSpace(async ({ driver, space, send, milestone }) => {
    const sessionId = randomUUID();
    await driver.run(
      "INSERT INTO observation_sessions (id, tenant_id, started_at, created_at, status) VALUES (?, ?, ?, ?, ?)",
      [sessionId, space.tenantId, at, at, "finished"],
    );
    const first = await send(image("stacked", 300), { sessionId });
    await milestone(1, 1, first.body.capture.id);
    const nights = await createNightRepository({
      driver,
      dialect: "sqlite",
    });
    const rows = await nights.onlineRows({
      tenantId: space.tenantId,
      sessionId,
    });
    assert.deepEqual(
      rows.images.map((row) => row.sha256),
      [digest(image("stacked", 300))],
    );
  });
});
