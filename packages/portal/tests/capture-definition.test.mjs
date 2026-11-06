// A capture created
// without an image (its definition alone), the images sent to it later —
// Astro Sync's, by the capture's id or by its night and target — and the
// owner's change of its targets; what the lists and the checks read of a
// capture that has no image.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createUploadResourceService } from "../dist/api/upload-resources.js";
import {
  OwnerCaptureError,
  createOwnerCaptureService,
} from "../dist/captures/owner-captures.js";
import { createCaptureRepository } from "../dist/persistence/capture-repository.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { OPEN_SOURCE_PROFILE } from "../dist/capabilities/profiles.js";
import { staticProfile } from "../dist/capabilities/provider.js";
import { onBothBackends } from "./helpers/both-backends.mjs";

const at = "2026-10-09T09:41:00.000Z";
const boundary = "astro-portal-definition-boundary";
const profile = (changes = {}) => ({
  ...OPEN_SOURCE_PROFILE,
  "storage.max_file_bytes": 1000,
  "storage.quota_bytes": 5000,
  ...changes,
});
const SYNC = { kind: "device", application: "sync" };
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const image = (label, size = 100) =>
  Buffer.concat([Buffer.from(label), Buffer.alloc(size - label.length, 7)]);

function multipart({ metadata, fileBytes }) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\n`, "latin1"),
    Buffer.from(
      'Content-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n',
      "latin1",
    ),
    Buffer.from(JSON.stringify(metadata), "utf8"),
    Buffer.from(`\r\n--${boundary}\r\n`, "latin1"),
    Buffer.from(
      'Content-Disposition: form-data; name="file"; filename="m31.jpg"\r\nContent-Type: image/jpeg\r\n\r\n',
      "latin1",
    ),
    fileBytes,
    Buffer.from(`\r\n--${boundary}--\r\n`, "latin1"),
  ]);
}
async function* once(buffer) {
  yield buffer;
}

async function seedSpace(driver) {
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
  for (const [id, type] of [
    ["m31", "Galaxie"],
    ["ic1396", "Nébuleuse en émission"],
    ["ngc7000", "Nébuleuse en émission"],
  ])
    await driver.run(
      `INSERT INTO target_catalogue_entries (
         id, designation, aliases_json, common_names_json, type_key, ra_hours,
         dec_degrees, catalogues_json, catalogue, source_json, source_revision,
         created_at, updated_at
       ) VALUES (?, ?, '[]', '[]', ?, 0.712, 41.27, '["Messier"]', 'Messier', '{}', 'r1', ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [id, id.toUpperCase(), type, at, at],
    );
  return { tenantId, userId };
}

async function withSpace(capabilities, fn) {
  const directory = await mkdtemp(join(tmpdir(), "astro-capture-definition-"));
  const previous = process.env.ASTRO_PORTAL_CAPTURES_DIR;
  process.env.ASTRO_PORTAL_CAPTURES_DIR = join(directory, "captures");
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  await applyMigrations(driver, "sqlite");
  const created = [];
  const uploads = await createUploadResourceService({
    driver,
    dialect: "sqlite",
    capabilities,
    onCaptureCreated: (tenantId, capture) => created.push(capture),
  });
  const owner = await createOwnerCaptureService({
    driver,
    dialect: "sqlite",
    capabilities,
    sharedCopy: async () => ({ created: false }),
    showable: async () => true,
  });
  const store = await createCaptureRepository({
    driver,
    dialect: "sqlite",
    migrate: false,
  });
  const space = await seedSpace(driver);
  const send = async (bytes, metadata = {}, caller = SYNC) =>
    await uploads.receiveUpload({
      tenantId: space.tenantId,
      userId: space.userId,
      contentType: `multipart/form-data; boundary=${boundary}`,
      bodyChunks: once(
        multipart({
          metadata: {
            originalName: "M31_final.jpg",
            sha256: digest(bytes),
            byteSize: bytes.length,
            ...metadata,
          },
          fileBytes: bytes,
        }),
      ),
      caller,
    });
  const own = { tenantId: space.tenantId, userId: space.userId, locale: "fr" };
  try {
    await fn({ driver, uploads, owner, store, space, send, own, created });
  } finally {
    await uploads.close();
    await driver.close();
    if (previous === undefined) delete process.env.ASTRO_PORTAL_CAPTURES_DIR;
    else process.env.ASTRO_PORTAL_CAPTURES_DIR = previous;
    await rm(directory, { force: true, recursive: true });
  }
}

const refusal = (code, status) => (error) => {
  assert.ok(error instanceof OwnerCaptureError, String(error));
  assert.equal(error.code, code);
  assert.equal(error.status, status);
  return true;
};

test("a definition is a private draft with no image: no file, no variant, never public, and it says so", async () => {
  await withSpace(profile(), async ({ owner, own, store, space, driver }) => {
    const capture = await owner.create({ ...own, targetIds: ["m31"] });
    assert.equal(capture.hasImage, false);
    assert.equal(capture.sha256, null);
    assert.equal(capture.originalName, null);
    assert.equal(capture.byteSize, null);
    // Migration 72: its image columns are NULL, never a placeholder.
    assert.deepEqual(
      {
        ...(
          await driver.query(
            "SELECT sha256, byte_size, original_name FROM captures WHERE id = ?",
            [capture.id],
          )
        ).rows[0],
      },
      { sha256: null, byte_size: null, original_name: null },
    );
    assert.deepEqual(capture.variants, []);
    assert.equal(capture.stage, "draft");
    assert.equal(capture.visibility, "private");
    assert.deepEqual(capture.targetIds, ["m31"]);
    assert.equal(capture.state.state, "no_image");
    assert.equal(capture.state.publishAllowed, false);
    assert.equal(capture.state.publishRefusal, "no_image");
    assert.equal(capture.preview, false);
    assert.equal(capture.thumbnail, false);
    assert.equal(capture.showable, false);
    assert.equal(capture.detail.targets[0].designation, "M31");
    // It is in the owner's list, counted, and holds no byte.
    const page = await owner.list(own);
    assert.deepEqual(
      page.captures.map((entry) => entry.id),
      [capture.id],
    );
    assert.equal(await store.captureCount(space.tenantId), 1);
    assert.equal(await store.usedBytes(space.tenantId), 0);
    // « Publique » is refused with its own code, finalized or not.
    await assert.rejects(
      owner.update({
        ...own,
        captureId: capture.id,
        changes: { visibility: "public" },
      }),
      refusal("no_image", 409),
    );
    await owner.update({
      ...own,
      captureId: capture.id,
      changes: { stage: "finalized" },
    });
    await assert.rejects(
      owner.update({
        ...own,
        captureId: capture.id,
        changes: { visibility: "public" },
      }),
      refusal("no_image", 409),
    );
    // No file to serve; nothing to check.
    assert.equal(await owner.media({ ...own, captureId: capture.id }), null);
    assert.deepEqual(await store.listPendingChecks({ limit: 10 }), []);
    // Deleting it frees nothing and fails on nothing.
    assert.deepEqual(await owner.remove({ ...own, captureId: capture.id }), {
      deleted: true,
      id: capture.id,
    });
    assert.equal(await store.captureCount(space.tenantId), 0);
  });
});

test("a definition names its night and targets (checked), counts against capture.count_limit, ", async () => {
  await withSpace(
    profile({ "capture.count_limit": 1 }),
    async ({ owner, own, driver, space }) => {
      await assert.rejects(
        owner.create({ ...own, targetIds: ["nowhere"] }),
        refusal("target_not_found", 404),
      );
      await assert.rejects(
        owner.create({ ...own, sessionId: randomUUID() }),
        refusal("session_not_found", 404),
      );
      await assert.rejects(
        owner.create({ ...own, targetIds: "m31" }),
        refusal("invalid_request", 400),
      );
      const first = await owner.create({ ...own });
      assert.deepEqual(first.targetIds, []);
      await assert.rejects(
        owner.create({ ...own }),
        refusal("capture_limit_reached", 409),
      );
      assert.equal(
        (await driver.query("SELECT COUNT(*) AS n FROM captures")).rows[0].n,
        1,
      );
      assert.ok(space.tenantId);
    },
  );
});

test("the archived captures are outside the free space — the count against capture.count_limit, in the list's storage line and for a new capture, leaves them out", async () => {
  await withSpace(
    profile({ "capture.count_limit": 3 }),
    async ({ owner, own, driver, store, space }) => {
      const made = [];
      for (let n = 0; n < 3; n += 1) made.push(await owner.create({ ...own }));
      await assert.rejects(
        owner.create({ ...own }),
        refusal("capture_limit_reached", 409),
        "three live captures fill the free space",
      );
      // The end of a subscription archives two of them.
      await driver.run(
        "UPDATE captures SET archived_at = ? WHERE id IN (?, ?)",
        [at, made[0].id, made[1].id],
      );
      assert.equal(await store.captureCount(space.tenantId), 1);
      const listed = await owner.list({ ...own });
      assert.equal(listed.captures.length, 3, "the management lists them all");
      assert.equal(listed.storage.captureCount, 1, "« 1 capture sur 3 »");
      assert.equal(listed.storage.captureCountLimit, 3);
      await owner.create({ ...own });
      await owner.create({ ...own });
      await assert.rejects(
        owner.create({ ...own }),
        refusal("capture_limit_reached", 409),
        "full again with three live captures, the archived ones aside",
      );
    },
  );
});

test("the first image sent to a definition becomes its main image — even with capture.variant_limit 0 — and is processed like any new one; the next is a variant", async () => {
  await withSpace(
    profile({ "capture.variant_limit": 0 }),
    async ({ owner, own, store, space, send, created }) => {
      const definition = await owner.create({ ...own, targetIds: ["m31"] });
      const first = image("sync-1");
      const sent = await send(first, { captureId: definition.id });
      assert.equal(sent.status, 201);
      assert.equal(sent.body.capture.id, definition.id);
      assert.equal(sent.body.variant.main, true);
      const now = await owner.get({ ...own, captureId: definition.id });
      assert.equal(now.hasImage, true);
      assert.equal(now.sha256, digest(first));
      assert.equal(now.byteSize, first.length);
      assert.equal(now.originalName, "M31_final.jpg");
      assert.equal(now.variants.length, 1);
      assert.equal(now.variants[0].main, true);
      assert.equal(now.status, "uploaded");
      assert.equal(now.state.state, "check_pending");
      assert.equal(await store.usedBytes(space.tenantId), 100);
      // Queued for its thumbnail and its check, as a new capture's main image.
      assert.equal(created.length, 1);
      assert.equal(created[0].id, definition.id);
      assert.equal(created[0].sha256, digest(first));
      assert.equal(
        (await store.listPendingChecks({ limit: 10 })).length,
        1,
        "its check is now due",
      );
      // The limit 0 now applies to the second one.
      await assert.rejects(
        send(image("sync-2"), { captureId: definition.id }),
        (error) => error.code === "capture_variant_limit_reached",
      );
    },
  );
});

test("Astro Sync's upload for the night and the target of a definition fills it instead of creating a second capture; another target creates its own", async () => {
  await withSpace(profile(), async ({ owner, own, store, space, send }) => {
    const definition = await owner.create({
      ...own,
      targetIds: ["m31", "ic1396"],
    });
    const other = await owner.create({ ...own, targetIds: ["ngc7000"] });
    const sent = await send(image("stack-m31"), { targetIds: ["ic1396"] });
    assert.equal(sent.status, 201);
    assert.equal(sent.body.capture.id, definition.id);
    assert.equal(sent.body.variant.main, true);
    assert.equal(await store.captureCount(space.tenantId), 2);
    // The one without an image stays as it was.
    assert.equal(
      (await owner.get({ ...own, captureId: other.id })).hasImage,
      false,
    );
    // A target no definition names makes a capture of its own.
    const fresh = await send(image("stack-ngc"), {
      targetIds: ["ic1396x"],
    }).catch((error) => error);
    assert.equal(fresh.code, "target_not_found");
    // The definition is filled: the next upload for it is a new capture.
    const again = await send(image("stack-2"), { targetIds: ["m31"] });
    assert.equal(again.status, 201);
    assert.notEqual(again.body.capture.id, definition.id);
    assert.equal(await store.captureCount(space.tenantId), 3);
  });
});

test("the devices' list leaves out a capture without an image until its first image arrives", async () => {
  await withSpace(profile(), async ({ owner, own, uploads, space, send }) => {
    const definition = await owner.create({ ...own, targetIds: ["m31"] });
    const listed = async () =>
      (
        await uploads.listCaptures({
          tenantId: space.tenantId,
          userId: space.userId,
          limit: 50,
        })
      ).captures.map((capture) => capture.id);
    assert.deepEqual(await listed(), []);
    await send(image("sync-1"), { captureId: definition.id });
    assert.deepEqual(await listed(), [definition.id]);
  });
});

test("the owner changes the targets of a capture — add, replace, remove — in order; another space's, an unknown one, a device are refused", async () => {
  await withSpace(profile(), async ({ owner, own, store, send }) => {
    const sent = await send(image("phone"), { targetIds: ["m31"] });
    const captureId = sent.body.capture.id;
    const change = (targetIds, extra = {}) =>
      owner.update({
        ...own,
        captureId,
        changes: { metadata: { targetIds } },
        ...extra,
      });
    let capture = await change(["m31", "ic1396"]);
    assert.deepEqual(capture.targetIds, ["m31", "ic1396"]);
    assert.deepEqual(
      capture.detail.targets.map((target) => target.designation),
      ["M31", "IC 1396"],
    );
    capture = await change(["ngc7000", "ic1396"]);
    assert.deepEqual(capture.targetIds, ["ngc7000", "ic1396"]);
    assert.equal(
      (await store.getCaptureById(own.tenantId, captureId)).targetIds[0],
      "ngc7000",
    );
    capture = await change([]);
    assert.deepEqual(capture.targetIds, []);
    assert.equal(capture.detail.targets.length, 0);
    await assert.rejects(change(["nowhere"]), refusal("target_not_found", 404));
    await assert.rejects(
      change(Array.from({ length: 17 }, (_, i) => `t${i}`)),
      refusal("invalid_metadata", 400),
    );
    await assert.rejects(change("m31"), refusal("invalid_metadata", 400));
    // The owner's phone changes the targets too (`device`); it is the
    // capture's session that stays the web's gesture.
    assert.deepEqual((await change(["m31"], { by: "device" })).targetIds, [
      "m31",
    ]);
    // Another space's capture is as absent as an unknown one.
    await assert.rejects(
      owner.update({
        tenantId: randomUUID(),
        userId: own.userId,
        captureId,
        changes: { metadata: { targetIds: ["m31"] } },
      }),
      refusal("capture_not_found", 404),
    );
  });
});

test("a personal target of the space can be chosen; another space's cannot", async () => {
  await withSpace(profile(), async ({ owner, own, store, driver }) => {
    const personal = await store.createPersonalTarget({
      tenantId: own.tenantId,
      name: "Grand champ du Cygne",
      label: "Grand champ",
    });
    const definition = await owner.create({ ...own });
    const chosen = await owner.update({
      ...own,
      captureId: definition.id,
      changes: { metadata: { targetIds: [personal.id] } },
    });
    assert.deepEqual(chosen.targetIds, [personal.id]);
    const stranger = randomUUID();
    await driver.run(
      "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
      [stranger, "Autre", at],
    );
    const foreign = await store.createPersonalTarget({
      tenantId: stranger,
      name: "Cible d’un autre",
      label: "Grand champ",
    });
    await assert.rejects(
      owner.update({
        ...own,
        captureId: definition.id,
        changes: { metadata: { targetIds: [foreign.id] } },
      }),
      refusal("target_not_found", 404),
    );
  });
});

test("in the read-only window of an ended subscription, neither a definition nor a change of targets is written", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-capture-readonly-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    const space = await seedSpace(driver);
    const owner = await createOwnerCaptureService({
      driver,
      dialect: "sqlite",
      entitlementProvider: {
        ...staticProfile(profile()),
        writeAccessFor: async () => ({ readOnly: true }),
      },
    });
    await assert.rejects(
      owner.create({ ...space, targetIds: ["m31"] }),
      refusal("entitlement_read_only", 403),
    );
    assert.equal(
      (await driver.query("SELECT COUNT(*) AS n FROM captures")).rows[0].n,
      0,
    );
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

onBothBackends(
  "the repository writes a definition, finds it for a night and a target, fills it with its first image, and replaces its targets (SQL of both dialects)",
  async (driver) => {
    const { tenantId } = await seedSpace(driver);
    const store = await createCaptureRepository({ driver, migrate: false });
    const definition = await store.createDefinition({
      tenantId,
      targetIds: ["m31", "ic1396"],
      createdAt: at,
    });
    assert.equal(definition.sha256, null);
    assert.equal(definition.byteSize, null);
    assert.equal(definition.originalName, null);
    const stored = (
      await driver.query(
        "SELECT sha256, byte_size, original_name FROM captures WHERE id = ?",
        [definition.id],
      )
    ).rows[0];
    assert.deepEqual(
      { ...stored },
      { sha256: null, byte_size: null, original_name: null },
      "no placeholder digest (migration 72)",
    );
    assert.deepEqual(definition.targetIds, ["m31", "ic1396"]);
    assert.equal(
      (await store.findDefinitionFor(tenantId, { targetIds: ["ic1396"] })).id,
      definition.id,
    );
    assert.equal(
      await store.findDefinitionFor(tenantId, { targetIds: ["ngc7000"] }),
      null,
    );
    assert.equal(
      await store.findDefinitionFor(tenantId, {
        sessionId: randomUUID(),
        targetIds: ["m31"],
      }),
      null,
    );
    assert.equal(
      (await store.listCaptures({ tenantId })).captures.length,
      0,
      "the devices' list",
    );
    assert.deepEqual(await store.listPendingChecks({ limit: 5 }), []);
    const sha256 = digest(image("first"));
    const added = await store.addVariant({
      tenantId,
      captureId: definition.id,
      sha256,
      byteSize: 100,
      originalName: "M31.jpg",
      source: "astro-sync",
      createdAt: at,
    });
    assert.equal(added.created, true);
    assert.equal(added.variant.main, true);
    assert.equal(added.capture.sha256, sha256);
    assert.equal(
      await store.findDefinitionFor(tenantId, { targetIds: ["m31"] }),
      null,
      "filled",
    );
    assert.equal((await store.listCaptures({ tenantId })).captures.length, 1);
    assert.equal((await store.listPendingChecks({ limit: 5 })).length, 1);
    assert.equal(
      await store.setCaptureTargets(tenantId, definition.id, ["ngc7000"]),
      true,
    );
    assert.deepEqual(
      (await store.getCaptureById(tenantId, definition.id)).targetIds,
      ["ngc7000"],
    );
    assert.equal(
      await store.setCaptureTargets(tenantId, randomUUID(), ["m31"]),
      false,
    );
    // Several definitions of one space: the unique (tenant_id, sha256)
    // index lets their NULLs through on both dialects.
    const second = await store.createDefinition({
      tenantId,
      targetIds: ["ngc7000"],
      createdAt: at,
    });
    const third = await store.createDefinition({ tenantId, createdAt: at });
    assert.equal(second.sha256, null);
    assert.equal(third.sha256, null);
    assert.equal(await store.captureCount(tenantId), 3);
  },
);
