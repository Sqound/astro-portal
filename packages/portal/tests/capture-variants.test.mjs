// The images of a capture — a main one and
// alternative ones, no history —, the check before an upload, the stage of
// a capture, the personal targets, and what a device's gallery reads.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  UploadResourceError,
  createUploadResourceService,
} from "../dist/api/upload-resources.js";
import { createOwnerCaptureService } from "../dist/captures/owner-captures.js";
import { createPublicGalleryService } from "../dist/captures/public-gallery.js";
import { createCaptureRepository } from "../dist/persistence/capture-repository.js";
import {
  captureFileExists,
  capturePathFor,
} from "../dist/uploads/capture-storage.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { OPEN_SOURCE_PROFILE } from "../dist/capabilities/profiles.js";
import { createPrivateGalleryService } from "../dist/private-gallery/private-gallery.js";
import {
  VARIANT_TEXT_LIMITS,
  arrivalRanks,
  storedVariantText,
  variantTextProblem,
} from "../dist/captures/capture-variants.js";

const at = "2026-10-07T09:41:00.000Z";
const boundary = "astro-portal-variant-test-boundary";
const UNLIMITED = Number.MAX_SAFE_INTEGER;
const profile = (changes = {}) => ({
  ...OPEN_SOURCE_PROFILE,
  "storage.max_file_bytes": 1000,
  "storage.quota_bytes": 5000,
  ...changes,
});
const PHONE = { kind: "device", application: "planner" };
const SYNC = { kind: "device", application: "sync" };
const WEB = { kind: "web" };
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

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

async function seedSpace(driver, { targets = [] } = {}) {
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
  for (const [id, type] of targets)
    await driver.run(
      `INSERT INTO target_catalogue_entries (
         id, designation, aliases_json, common_names_json, type_key, ra_hours,
         dec_degrees, catalogues_json, catalogue, source_json, source_revision,
         created_at, updated_at
       ) VALUES (?, ?, '["NGC 224"]', '[]', ?, 0.712, 41.27, '["Messier"]', 'Messier', '{}', 'r1', ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [id, id.toUpperCase(), type, at, at],
    );
  return { tenantId, userId };
}

async function withSpace(capabilities, fn) {
  const directory = await mkdtemp(join(tmpdir(), "astro-capture-variants-"));
  const previous = process.env.ASTRO_PORTAL_CAPTURES_DIR;
  process.env.ASTRO_PORTAL_CAPTURES_DIR = join(directory, "captures");
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  await applyMigrations(driver, "sqlite");
  const uploads = await createUploadResourceService({
    driver,
    dialect: "sqlite",
    capabilities,
  });
  const shared = [];
  const owner = await createOwnerCaptureService({
    driver,
    dialect: "sqlite",
    capabilities,
    // No `sharp` here: the copy a gallery serves is the original itself.
    sharedCopy: async ({ tenantId, sha256 }) => {
      shared.push(sha256);
      return { path: capturePathFor(tenantId, sha256), created: false };
    },
    showable: async () => true,
  });
  const gallery = await createPublicGalleryService({
    driver,
    sharedCopy: async ({ tenantId, sha256 }) => ({
      path: capturePathFor(tenantId, sha256),
    }),
    imageSize: async () => null,
  });
  const store = await createCaptureRepository({
    driver,
    dialect: "sqlite",
    migrate: false,
  });
  const space = await seedSpace(driver, {
    targets: [
      ["m31", "Galaxie"],
      ["ic1396", "Nébuleuse en émission"],
    ],
  });
  const send = async (bytes, metadata = {}, caller = WEB, onto = space) => {
    const result = await uploads.receiveUpload({
      tenantId: onto.tenantId,
      userId: onto.userId,
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
    return result;
  };
  try {
    await fn({ driver, uploads, owner, gallery, store, space, send, shared });
  } finally {
    await uploads.close();
    await driver.close();
    if (previous === undefined) delete process.env.ASTRO_PORTAL_CAPTURES_DIR;
    else process.env.ASTRO_PORTAL_CAPTURES_DIR = previous;
    await rm(directory, { force: true, recursive: true });
  }
}

const image = (label, size = 100) =>
  Buffer.concat([Buffer.from(label), Buffer.alloc(size - label.length, 7)]);

test("an image sent for a capture is an alternative one, private; the image online is kept; every image counts", async () => {
  await withSpace(profile(), async ({ store, space, send }) => {
    const first = await send(image("phone"), { targetIds: ["m31"] }, PHONE);
    assert.equal(first.status, 201);
    const captureId = first.body.capture.id;
    const second = await send(
      image("stack", 400),
      { captureId, originalName: "IMG_2041.tif", source: "stacking" },
      SYNC,
    );
    assert.equal(second.status, 201);
    assert.equal(second.body.capture.id, captureId);
    assert.equal(second.body.variant.main, false);
    assert.equal(second.body.variant.public, false);
    assert.equal(second.body.variant.source, "stacking");
    assert.equal(second.body.storage.variantCount, 1);
    // The capture's image is still its main one, the phone's.
    const capture = await store.getCaptureById(space.tenantId, captureId);
    assert.equal(capture.sha256, digest(image("phone")));
    assert.equal(capture.byteSize, 100);
    const variants = await store.listVariants(space.tenantId, captureId);
    assert.deepEqual(
      variants.map((variant) => [variant.main, variant.source]),
      [
        [true, "phone"],
        [false, "stacking"],
      ],
    );
    // Both originals are stored and counted.
    assert.equal(await store.usedBytes(space.tenantId), 500);
    assert.equal(await store.captureCount(space.tenantId), 1);
    assert.ok(
      await captureFileExists(space.tenantId, digest(image("stack", 400))),
    );
  });
});

test("capture.variant_limit 0 refuses an added image with its code and its numbers, and writes nothing", async () => {
  await withSpace(
    profile({ "capture.variant_limit": 0 }),
    async ({ store, space, send }) => {
      const first = await send(image("phone"), {}, PHONE);
      const bytes = image("stack", 300);
      await assert.rejects(
        send(bytes, { captureId: first.body.capture.id }, SYNC),
        (error) => {
          assert.ok(error instanceof UploadResourceError);
          assert.equal(error.code, "capture_variant_limit_reached");
          assert.equal(error.status, 409);
          assert.equal(error.body.storage.variantLimit, 0);
          assert.equal(error.body.storage.variantCount, 0);
          return true;
        },
      );
      assert.equal(
        await captureFileExists(space.tenantId, digest(bytes)),
        false,
      );
      assert.equal(
        (await store.listVariants(space.tenantId, first.body.capture.id))
          .length,
        1,
      );
      // An unknown capture, or another space's, is not found.
      await assert.rejects(
        send(bytes, { captureId: randomUUID() }, SYNC),
        (error) => error.code === "capture_not_found" && error.status === 404,
      );
    },
  );
});

// The variants are not counted for a subscription.
// A space whose `capture.variant_limit` is the unlimited sentinel (both
// subscriptions, a private server) adds variant after variant: the storage
// quota is the only thing that refuses, and the check says so with its code.
test("capture.variant_limit unlimited adds a variant each time; only the storage quota refuses, never the variants", async () => {
  await withSpace(
    profile({
      "capture.variant_limit": UNLIMITED,
      "capture.count_limit": UNLIMITED,
      "storage.quota_bytes": 600,
    }),
    async ({ uploads, store, space, send }) => {
      const first = await send(image("phone"), {}, PHONE);
      const captureId = first.body.capture.id;
      for (const label of ["stack-a", "stack-b", "stack-c", "stack-d"]) {
        const added = await send(image(label), { captureId }, SYNC);
        assert.equal(added.status, 201, label);
        assert.equal(added.body.variant.main, false, label);
      }
      assert.equal(
        (await store.listVariants(space.tenantId, captureId)).length,
        5,
      );
      const check = (sha256) =>
        uploads.checkUpload({
          tenantId: space.tenantId,
          userId: space.userId,
          caller: SYNC,
          originalName: "x.tif",
          sha256,
          byteSize: 100,
          captureId,
        });
      const roomy = await check("1".repeat(64));
      assert.deepEqual(
        [roomy.result, roomy.adds, roomy.storage.variantLimit],
        ["accepted", "variant", UNLIMITED],
      );
      // 500 bytes stored of 600: one more variant fits, the next is the quota's.
      await send(image("stack-e"), { captureId }, SYNC);
      await assert.rejects(
        send(image("stack-f"), { captureId }, SYNC),
        (error) => error.code === "storage_quota_reached",
      );
    },
  );
});

test("the same bytes as any image of the space are already there: nothing stored, never refused for a limit", async () => {
  await withSpace(
    profile({ "capture.variant_limit": 1, "capture.count_limit": 1 }),
    async ({ store, space, send }) => {
      const first = await send(image("phone"), {}, PHONE);
      const captureId = first.body.capture.id;
      await send(image("stack", 300), { captureId }, SYNC);
      // The alternative image sent again, as a new capture or for the
      // capture: the same capture, deduplicated, at the limits.
      for (const metadata of [{}, { captureId }]) {
        const again = await send(image("stack", 300), metadata, SYNC);
        assert.equal(again.status, 200);
        assert.equal(again.body.deduplicated, true);
        assert.equal(again.body.capture.id, captureId);
      }
      assert.equal(await store.usedBytes(space.tenantId), 400);
      assert.equal(
        (await store.listVariants(space.tenantId, captureId)).length,
        2,
      );
    },
  );
});

test("the check before an upload answers present, accepted or refused with its code and its numbers, before any byte", async () => {
  await withSpace(
    profile({
      "capture.variant_limit": 0,
      "capture.count_limit": 2,
    }),
    async ({ uploads, space, send, driver }) => {
      const first = await send(image("phone"), {}, PHONE);
      const captureId = first.body.capture.id;
      const check = (body) =>
        uploads.checkUpload({
          tenantId: space.tenantId,
          userId: space.userId,
          caller: SYNC,
          originalName: "x.tif",
          ...body,
        });
      const present = await check({
        sha256: digest(image("phone")),
        byteSize: 100,
        captureId,
      });
      assert.equal(present.result, "present");
      assert.equal(present.captureId, captureId);
      assert.equal(present.main, true);
      const accepted = await check({ sha256: "1".repeat(64), byteSize: 10 });
      assert.deepEqual(
        [accepted.result, accepted.adds, accepted.storage.usedBytes],
        ["accepted", "capture", 100],
      );
      const refusedVariant = await check({
        sha256: "2".repeat(64),
        byteSize: 10,
        captureId,
      });
      assert.deepEqual(
        [refusedVariant.result, refusedVariant.code],
        ["refused", "capture_variant_limit_reached"],
      );
      assert.equal(refusedVariant.storage.variantLimit, 0);
      const tooLarge = await check({ sha256: "3".repeat(64), byteSize: 1001 });
      assert.deepEqual(
        [tooLarge.code, tooLarge.storage.maxFileBytes],
        ["file_too_large", 1000],
      );
      const quota = await check({ sha256: "4".repeat(64), byteSize: 999 });
      assert.equal(quota.result, "accepted");
      await send(image("second"), {}, WEB);
      const count = await check({ sha256: "5".repeat(64), byteSize: 10 });
      assert.deepEqual(
        [
          count.code,
          count.storage.captureCount,
          count.storage.captureCountLimit,
        ],
        ["capture_limit_reached", 2, 2],
      );
      // Nothing was written by the checks: two captures, two files.
      assert.equal(
        Number(
          (await driver.query("SELECT COUNT(*) AS n FROM capture_variants"))
            .rows[0].n,
        ),
        2,
      );
      const stored = await readdir(
        join(process.env.ASTRO_PORTAL_CAPTURES_DIR, space.tenantId),
      );
      assert.ok(!stored.includes("uploads"));
    },
  );
  await withSpace(
    profile({ "storage.quota_bytes": 150 }),
    async ({ uploads, space, send }) => {
      await send(image("phone"), {}, PHONE);
      const quota = await uploads.checkUpload({
        tenantId: space.tenantId,
        userId: space.userId,
        originalName: "x.tif",
        sha256: "6".repeat(64),
        byteSize: 60,
      });
      assert.deepEqual(
        [
          quota.result,
          quota.code,
          quota.storage.usedBytes,
          quota.storage.quotaBytes,
        ],
        ["refused", "storage_quota_reached", 100, 150],
      );
    },
  );
});

test("the resumable create answers « present » before its first chunk", async () => {
  await withSpace(profile(), async ({ uploads, space, send }) => {
    const first = await send(image("phone"), {}, PHONE);
    const created = await uploads.createUpload({
      tenantId: space.tenantId,
      userId: space.userId,
      caller: SYNC,
      originalName: "M31_final.jpg",
      sha256: digest(image("phone")),
      byteSize: 100,
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.completed, true);
    assert.equal(created.body.present, true);
    assert.equal(created.body.captureId, first.body.capture.id);
    assert.equal(created.body.offset, 100);
    // A new image for the capture: an upload session that will add it.
    const fresh = await uploads.createUpload({
      tenantId: space.tenantId,
      userId: space.userId,
      caller: SYNC,
      originalName: "IMG_2041.tif",
      sha256: "7".repeat(64),
      byteSize: 50,
      captureId: first.body.capture.id,
    });
    assert.equal(fresh.status, 201);
    assert.equal(fresh.body.completed, false);
    assert.equal(fresh.body.present, undefined);
  });
});

test("the owner chooses the main image: the galleries serve it; the main image is never deleted alone", async () => {
  await withSpace(profile(), async ({ owner, gallery, store, space, send }) => {
    const first = await send(image("phone"), { targetIds: ["m31"] }, WEB);
    const captureId = first.body.capture.id;
    const second = await send(image("stack", 300), { captureId }, SYNC);
    const alternativeId = second.body.variant.id;
    const { tenantId, userId } = space;
    await store.recordAutomaticCheck(tenantId, captureId, {
      result: "sky",
      reason: null,
      at,
    });
    await owner.update({
      tenantId,
      userId,
      captureId,
      changes: { visibility: "public" },
    });
    // The new main image must have passed its own check.
    await assert.rejects(
      owner.setMainImage({
        tenantId,
        userId,
        captureId,
        imageId: alternativeId,
      }),
      (error) => error.code === "variant_check_not_passed",
    );
    await store.recordVariantCheck(tenantId, alternativeId, {
      result: "sky",
      reason: null,
      at,
    });
    const chosen = await owner.setMainImage({
      tenantId,
      userId,
      captureId,
      imageId: alternativeId,
    });
    assert.equal(chosen.sha256, digest(image("stack", 300)));
    assert.deepEqual(
      chosen.variants.map((variant) => [variant.sha256, variant.main]),
      [
        [digest(image("stack", 300)), true],
        [digest(image("phone")), false],
      ],
    );
    // The former main image is a variant that keeps its visibility: it was
    // seen as its public capture, it stays public.
    assert.equal(chosen.variants[1].public, true);
    // The public gallery serves the main image.
    const media = await gallery.media({ captureId });
    assert.equal(media.sha256, digest(image("stack", 300)));
    // The main image is not deleted alone; the other one is.
    await assert.rejects(
      owner.deleteVariant({
        tenantId,
        userId,
        captureId,
        imageId: alternativeId,
      }),
      (error) => error.code === "main_image" && error.status === 409,
    );
    const formerMain = chosen.variants[1].id;
    const after = await owner.deleteVariant({
      tenantId,
      userId,
      captureId,
      imageId: formerMain,
    });
    assert.equal(after.variants.length, 1);
    assert.equal(await store.usedBytes(tenantId), 300);
    assert.equal(
      await captureFileExists(tenantId, digest(image("phone"))),
      false,
    );
    // The last image is the main one: never deleted alone either.
    await assert.rejects(
      owner.deleteVariant({
        tenantId,
        userId,
        captureId,
        imageId: alternativeId,
      }),
      (error) => error.code === "main_image",
    );
  });
});

test("an alternative image is public only while its capture is, after its own check; a visitor sees the main image then the public ones", async () => {
  await withSpace(profile(), async ({ owner, gallery, store, space, send }) => {
    const { tenantId, userId } = space;
    const first = await send(image("phone"), { targetIds: ["m31"] }, WEB);
    const captureId = first.body.capture.id;
    const second = await send(image("stack", 300), { captureId }, SYNC);
    const variantId = second.body.variant.id;
    await store.recordVariantCheck(tenantId, variantId, {
      result: "sky",
      reason: null,
      at,
    });
    await assert.rejects(
      owner.setVariantPublic({
        tenantId,
        userId,
        captureId,
        imageId: variantId,
        shown: true,
      }),
      (error) => error.code === "capture_not_public" && error.status === 409,
    );
    await store.recordAutomaticCheck(tenantId, captureId, {
      result: "sky",
      reason: null,
      at,
    });
    await owner.update({
      tenantId,
      userId,
      captureId,
      changes: { visibility: "public" },
    });
    const shown = await owner.setVariantPublic({
      tenantId,
      userId,
      captureId,
      imageId: variantId,
      shown: true,
    });
    assert.equal(
      shown.variants.find((variant) => variant.id === variantId).public,
      true,
    );
    // The main image follows its capture.
    await assert.rejects(
      owner.setVariantPublic({
        tenantId,
        userId,
        captureId,
        imageId: shown.variants[0].id,
        shown: false,
      }),
      (error) => error.code === "main_image",
    );
    const page = await gallery.get({ captureId, locale: "fr" });
    assert.equal(page.variants.length, 1);
    assert.equal(page.variants[0].id, variantId);
    assert.match(page.variants[0].media.image, /imageId=/);
    const file = await gallery.media({ captureId, imageId: variantId });
    assert.equal(file.sha256, digest(image("stack", 300)));
    // A private capture shows none of its images; the variant keeps its
    // own flag.
    await owner.update({
      tenantId,
      userId,
      captureId,
      changes: { visibility: "private" },
    });
    assert.equal(await gallery.media({ captureId, imageId: variantId }), null);
    const variant = await store.getVariant(tenantId, captureId, variantId);
    assert.equal(variant.public, true);
  });
});

test("a device's upload is a draft, never public until finalized; the web's is finalized", async () => {
  await withSpace(
    profile(),
    async ({ owner, gallery, store, space, send, driver }) => {
      const { tenantId, userId } = space;
      const phone = await send(image("phone"), {}, PHONE);
      const web = await send(image("web"), {}, WEB);
      assert.equal(phone.body.capture.stage, "draft");
      assert.equal(phone.body.capture.visibility, "private");
      assert.equal(web.body.capture.stage, "finalized");
      const captureId = phone.body.capture.id;
      await store.recordAutomaticCheck(tenantId, captureId, {
        result: "sky",
        reason: null,
        at,
      });
      await assert.rejects(
        owner.update({
          tenantId,
          userId,
          captureId,
          changes: { visibility: "public" },
        }),
        (error) => error.code === "capture_draft" && error.status === 409,
      );
      // Even forced public by hand, a draft is in no gallery.
      await driver.run(
        "UPDATE captures SET visibility = 'public' WHERE id = ?",
        [captureId],
      );
      assert.equal(await gallery.get({ captureId }), null);
      await driver.run(
        "UPDATE captures SET visibility = 'private' WHERE id = ?",
        [captureId],
      );
      const finalized = await owner.update({
        tenantId,
        userId,
        captureId,
        changes: { stage: "finalized" },
      });
      assert.equal(finalized.stage, "finalized");
      const published = await owner.update({
        tenantId,
        userId,
        captureId,
        changes: { visibility: "public" },
      });
      assert.equal(published.visibility, "public");
      assert.ok(await gallery.get({ captureId }));
      await assert.rejects(
        owner.update({
          tenantId,
          userId,
          captureId,
          changes: { stage: "draft" },
        }),
        (error) => error.code === "capture_public",
      );
    },
  );
});

test("a personal target is created, attached, listed by its name and label; another space's is not found", async () => {
  await withSpace(profile(), async ({ uploads, space, send, driver }) => {
    const { target } = await uploads.createPersonalTarget({
      tenantId: space.tenantId,
      userId: space.userId,
      name: "  Comète du soir  ",
      label: "Grand champ",
      placeName: "Col des Étoiles",
      date: "2026-10-05",
      note: "Au téléobjectif.",
    });
    assert.equal(target.name, "Comète du soir");
    assert.equal(target.source, "personal");
    const sent = await send(image("comet"), { targetIds: [target.id] }, PHONE);
    assert.deepEqual(sent.body.capture.targetIds, [target.id]);
    const page = await uploads.listCaptures({
      tenantId: space.tenantId,
      userId: space.userId,
      caller: PHONE,
    });
    assert.deepEqual(page.captures[0].targets, [
      {
        id: target.id,
        source: "personal",
        name: "Comète du soir",
        label: "Grand champ",
        raHours: null,
        decDegrees: null,
      },
    ]);
    assert.equal(page.captures[0].galleryLabel, "Grand champ");
    assert.deepEqual(
      (
        await uploads.listPersonalTargets({ tenantId: space.tenantId })
      ).targets.map((entry) => entry.id),
      [target.id],
    );
    // The shared catalogue never shows it.
    assert.equal(
      (
        await driver.query(
          "SELECT COUNT(*) AS n FROM target_catalogue_entries WHERE source_present = 1 AND id = ?",
          [target.id],
        )
      ).rows[0].n,
      0,
    );
    // Another space cannot name it.
    const other = await seedSpace(driver);
    await assert.rejects(
      send(image("other"), { targetIds: [target.id] }, PHONE, other),
      (error) => error.code === "target_not_found" && error.status === 404,
    );
    await assert.rejects(
      uploads.createPersonalTarget({
        tenantId: space.tenantId,
        name: "x".repeat(81),
        label: "Grand champ",
      }),
      (error) => error.code === "invalid_request",
    );
    await assert.rejects(
      uploads.createPersonalTarget({
        tenantId: space.tenantId,
        name: "Libre",
        label: "Voie lactée",
      }),
      (error) => error.code === "invalid_request",
    );
  });
});

test("GET /v1/captures carries what a device's gallery draws", async () => {
  await withSpace(profile(), async ({ uploads, space, send, store }) => {
    const first = await send(
      image("phone"),
      { targetIds: ["m31", "ic1396"] },
      PHONE,
    );
    const captureId = first.body.capture.id;
    await send(image("stack", 300), { captureId }, SYNC);
    await store.recordVariantDimensions(
      space.tenantId,
      digest(image("phone")),
      {
        width: 4096,
        height: 2731,
      },
    );
    const [item] = (
      await uploads.listCaptures({
        tenantId: space.tenantId,
        userId: space.userId,
        caller: PHONE,
      })
    ).captures;
    assert.equal(item.stage, "draft");
    assert.equal(item.visibility, "private");
    assert.equal(item.visibilityEditable, false);
    assert.equal(item.thumbnail, false);
    assert.equal(item.galleryLabel, "Galaxie");
    assert.equal(item.nightDate, null);
    assert.deepEqual([item.width, item.height], [4096, 2731]);
    assert.equal(item.imageCount, 2);
    assert.ok(item.mainImageId);
    assert.deepEqual(item.targets[0], {
      id: "m31",
      source: "catalogue",
      designation: "M31",
      type: "Galaxie",
      aliases: ["NGC 224"],
      raHours: 0.712,
      decDegrees: 41.27,
    });
    assert.equal(item.targets[1].type, "Nébuleuse en émission");
    const web = await uploads.listCaptures({
      tenantId: space.tenantId,
      userId: space.userId,
      caller: WEB,
    });
    assert.equal(web.captures[0].visibilityEditable, false, "a draft");
  });
});

test("the storage of a space in numbers: used, quota, remaining, per file, captures, images per capture, capabilities", async () => {
  await withSpace(profile(), async ({ uploads, space, send }) => {
    await send(image("phone"), {}, PHONE);
    const storage = await uploads.spaceStorage(space);
    assert.deepEqual(
      [
        storage.usedBytes,
        storage.quotaBytes,
        storage.remainingBytes,
        storage.maxFileBytes,
        storage.captureCount,
        storage.captureCountLimit,
        storage.variantLimit,
      ],
      [100, 5000, 4900, 1000, 1, UNLIMITED, UNLIMITED],
    );
    assert.equal(Object.keys(storage.capabilities).length, 14);
    assert.equal(storage.capabilities["analysis.progression"], true);
  });
});

// ---- The title and the
// description of an image, its rank of arrival, and what the two
// galleries read of them.

/** Three images of M31 sent on three days, the phone's first. */
async function threeImages({ owner, store, space, send, driver }) {
  const { tenantId, userId } = space;
  const first = await send(image("phone"), { targetIds: ["m31"] }, WEB);
  const captureId = first.body.capture.id;
  const cropped = await send(
    image("crop", 150),
    { captureId, originalName: "M31_recadree.jpg", source: "web" },
    WEB,
  );
  const stacked = await send(
    image("stack", 300),
    { captureId, originalName: "IMG_2041.tif", source: "stacking" },
    SYNC,
  );
  const ids = {
    main: (await store.listVariants(tenantId, captureId)).find((v) => v.main)
      .id,
    cropped: cropped.body.variant.id,
    stacked: stacked.body.variant.id,
  };
  for (const [id, day] of [
    [ids.main, "2026-10-06T14:02:00.000Z"],
    [ids.cropped, "2026-10-07T05:05:00.000Z"],
    [ids.stacked, "2026-10-08T00:41:00.000Z"],
  ])
    await driver.run(
      "UPDATE capture_variants SET created_at = ? WHERE id = ?",
      [day, id],
    );
  const named = (imageId, field, value) =>
    owner.setVariantText({
      tenantId,
      userId,
      captureId,
      imageId,
      field,
      value,
      locale: "fr",
    });
  return { captureId, ids, named };
}

test("the bounds of a title and a description, the text kept as typed, a blank one back to « by default »", () => {
  assert.deepEqual({ ...VARIANT_TEXT_LIMITS }, { title: 90, description: 280 });
  assert.equal(variantTextProblem("title", "é".repeat(90)), null);
  assert.equal(variantTextProblem("title", "é".repeat(91)), "too_long");
  assert.equal(variantTextProblem("description", "x".repeat(280)), null);
  assert.equal(variantTextProblem("description", "x".repeat(281)), "too_long");
  assert.equal(variantTextProblem("title", null), null);
  assert.equal(variantTextProblem("title", 12), "not_text");
  assert.equal(variantTextProblem("caption", "M31"), "unknown_field");
  // The outer spaces only: never another change of what was typed.
  assert.equal(
    storedVariantText("  Recadrée  sur le noyau "),
    "Recadrée  sur le noyau",
  );
  assert.equal(storedVariantText("   "), null);
  assert.equal(storedVariantText(null), null);
  assert.deepEqual(
    [
      ...arrivalRanks([
        { id: "c", createdAt: "2026-10-08T00:41:00.000Z" },
        { id: "a", createdAt: "2026-10-06T14:02:00.000Z" },
        { id: "b", createdAt: "2026-10-07T05:05:00.000Z" },
      ]),
    ],
    [
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ],
  );
});

test("the owner names an image field by field — 90 and 280 accepted, one more refused, a blank title back to null, the main image and a variant both named", async () => {
  await withSpace(profile(), async (context) => {
    const { store, space } = context;
    const { captureId, ids, named } = await threeImages(context);
    const titled = await named(
      ids.cropped,
      "title",
      "  Recadrée sur le noyau ",
    );
    const cropped = titled.variants.find((v) => v.id === ids.cropped);
    assert.equal(cropped.title, "Recadrée sur le noyau");
    assert.equal(cropped.description, null);
    const ninety = "é".repeat(90);
    assert.equal(
      (await named(ids.main, "title", ninety)).variants[0].title,
      ninety,
    );
    const long = "Recadrage serré. ".repeat(20).slice(0, 280);
    const described = await named(ids.cropped, "description", long);
    assert.equal(
      described.variants.find((v) => v.id === ids.cropped).description,
      long,
    );
    for (const [field, value] of [
      ["title", "é".repeat(91)],
      ["description", "x".repeat(281)],
      ["title", 7],
      ["caption", "M31"],
    ])
      await assert.rejects(
        named(ids.cropped, field, value),
        (error) => error.code === "invalid_request" && error.status === 400,
      );
    // Nothing was written by a refusal.
    assert.equal(
      (await store.getVariant(space.tenantId, captureId, ids.cropped)).title,
      "Recadrée sur le noyau",
    );
    // A blank title gives the image its name by default back.
    const blank = await named(ids.cropped, "title", "   ");
    assert.equal(blank.variants.find((v) => v.id === ids.cropped).title, null);
    // Another space's capture, an unknown image: not found.
    await assert.rejects(
      context.owner.setVariantText({
        tenantId: space.tenantId,
        captureId,
        imageId: "missing",
        field: "title",
        value: "M31",
      }),
      (error) => error.code === "image_not_found" && error.status === 404,
    );
  });
});

test("the rank of arrival names an image by default; a former main image reads its own rank", async () => {
  await withSpace(profile(), async (context) => {
    const { owner, store, space } = context;
    const { tenantId, userId } = space;
    const { captureId, ids } = await threeImages(context);
    const ranks = (variants) =>
      Object.fromEntries(variants.map((v) => [v.id, [v.main, v.arrivalRank]]));
    const before = await owner.get({ tenantId, userId, captureId });
    assert.deepEqual(ranks(before.variants), {
      [ids.main]: [true, 1],
      [ids.cropped]: [false, 2],
      [ids.stacked]: [false, 3],
    });
    // The main image first, then the newest.
    assert.deepEqual(
      before.variants.map((v) => v.id),
      [ids.main, ids.stacked, ids.cropped],
    );
    await store.recordVariantCheck(tenantId, ids.stacked, {
      result: "sky",
      reason: null,
      at,
    });
    const after = await owner.setMainImage({
      tenantId,
      userId,
      captureId,
      imageId: ids.stacked,
    });
    // « Variante 1 »: the former main image keeps its rank of arrival.
    assert.deepEqual(ranks(after.variants), {
      [ids.main]: [false, 1],
      [ids.cropped]: [false, 2],
      [ids.stacked]: [true, 3],
    });
  });
});

test("the public gallery reads the main image's names, then each public variant's — never a private one's; a draft in no gallery, the private one included", async () => {
  await withSpace(profile(), async (context) => {
    const { driver, owner, gallery, store, space } = context;
    const { tenantId, userId } = space;
    const { captureId, ids, named } = await threeImages(context);
    for (const id of [ids.cropped, ids.stacked])
      await store.recordVariantCheck(tenantId, id, {
        result: "sky",
        reason: null,
        at,
      });
    await store.recordAutomaticCheck(tenantId, captureId, {
      result: "sky",
      reason: null,
      at,
    });
    await owner.update({
      tenantId,
      userId,
      captureId,
      changes: { visibility: "public" },
    });
    await owner.setVariantPublic({
      tenantId,
      userId,
      captureId,
      imageId: ids.cropped,
      shown: true,
    });
    await named(ids.cropped, "title", "Recadrée sur le noyau");
    await named(
      ids.cropped,
      "description",
      "Recadrage serré sur le noyau et sur M32, pour mieux voir les nuages de poussière.",
    );
    await named(ids.stacked, "title", "Empilement privé");
    const page = await gallery.get({ captureId, locale: "fr" });
    assert.deepEqual(page.mainImage, {
      id: ids.main,
      title: null,
      description: null,
      arrivalRank: 1,
    });
    assert.deepEqual(
      page.variants.map(({ id, title, description, arrivalRank }) => ({
        id,
        title,
        description,
        arrivalRank,
      })),
      [
        {
          id: ids.cropped,
          title: "Recadrée sur le noyau",
          description:
            "Recadrage serré sur le noyau et sur M32, pour mieux voir les nuages de poussière.",
          arrivalRank: 2,
        },
      ],
    );
    // Nothing else of a variant: no date, file, size on disk nor count.
    for (const key of ["createdAt", "originalName", "byteSize", "source"])
      assert.equal(Object.hasOwn(page.variants[0], key), false, key);

    // The private gallery: the same rule, the same names.
    const privateGallery = await createPrivateGalleryService({ driver });
    const { address } = await privateGallery.settings({
      tenantId,
      userId,
      origin: "",
    });
    const token = address.split("/p/")[1];
    await privateGallery.update({
      tenantId,
      userId,
      changes: { mode: "link", confirmVerifiers: true },
      origin: "",
    });
    const seen = await privateGallery.capture({
      token,
      captureId,
      locale: "fr",
    });
    assert.deepEqual(seen.view.capture.mainImage, page.mainImage);
    assert.deepEqual(
      seen.view.capture.variants.map(({ id, title, arrivalRank }) => [
        id,
        title,
        arrivalRank,
      ]),
      [[ids.cropped, "Recadrée sur le noyau", 2]],
    );

    // A draft appears in no gallery: neither the public one nor the private.
    const draft = await context.send(
      image("draft", 120),
      { targetIds: ["m31"], originalName: "M31_brouillon.jpg" },
      PHONE,
    );
    assert.equal(draft.body.capture.stage, "draft");
    assert.equal(await gallery.get({ captureId: draft.body.capture.id }), null);
    const hidden = await privateGallery.capture({
      token,
      captureId: draft.body.capture.id,
    });
    assert.equal(hidden.view, undefined);
    assert.equal(hidden.access.outcome, "not_found");
  });
});
