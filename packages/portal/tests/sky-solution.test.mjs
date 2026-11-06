// The sky solution of an image of a capture — its validation, its
// repository on both backends (one row per image, idempotent by digest,
// gone with its image), the service Astro Sync writes through (409 when
// the capture changed, 422 on other proportions, another space's capture
// absent), the owner's view and switch, the « missing » list on the main
// image, and the gallery's view, conditional on the image shown and the
// switch.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createUploadResourceService } from "../dist/api/upload-resources.js";
import { createCaptureSkySolutionService } from "../dist/captures/capture-sky-solutions.js";
import { createOwnerCaptureService } from "../dist/captures/owner-captures.js";
import { createPublicGalleryService } from "../dist/captures/public-gallery.js";
import {
  SkySolutionError,
  aspectMatches,
  validateSkySolution,
} from "../dist/captures/sky-solution.js";
import { createSkySolutionRepository } from "../dist/persistence/sky-solution-repository.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { OPEN_SOURCE_PROFILE } from "../dist/capabilities/profiles.js";
import { capturePathFor } from "../dist/uploads/capture-storage.js";
import { onBothBackends } from "./helpers/both-backends.mjs";

const at = "2026-10-07T09:41:00.000Z";
const sha = (letter) => letter.repeat(64);
const solution = (changes = {}) => ({
  schemaVersion: 1,
  source: "astap",
  solverVersion: "ASTAP 2026.10",
  raDeg: 10.6847,
  decDeg: 41.2688,
  pixelScaleArcsec: 2.06,
  rotationDeg: 30,
  fieldWidthDeg: 3.575,
  fieldHeightDeg: 2.39,
  parity: "normal",
  width: 6248,
  height: 4176,
  solvedAt: "2026-10-07T22:10:00Z",
  ...changes,
});

/** A space, a capture with its main image and one variant, the M31 target. */
async function seed(driver, { width = 6248, height = 4176 } = {}) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const captureId = randomUUID();
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
  const main = createHash("sha256").update(captureId).digest("hex");
  const other = createHash("sha256").update(`${captureId}-b`).digest("hex");
  await driver.run(
    "INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, status, stage, visibility, created_at) VALUES (?, ?, ?, ?, ?, 'uploaded', 'finalized', 'private', ?)",
    [captureId, tenantId, "M31_final.jpg", main, 100, at],
  );
  for (const [id, digest, isMain, source] of [
    [captureId, main, 1, "phone"],
    [`${captureId}-b`, other, 0, "stacking"],
  ])
    await driver.run(
      "INSERT INTO capture_variants (id, capture_id, tenant_id, sha256, byte_size, original_name, width, height, source, is_main, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        captureId,
        tenantId,
        digest,
        100,
        isMain ? "M31_final.jpg" : "IMG_2041.tif",
        width,
        height,
        source,
        isMain,
        at,
      ],
    );
  return {
    tenantId,
    userId,
    captureId,
    mainId: captureId,
    variantId: `${captureId}-b`,
    main,
    other,
  };
}

test("a solution is validated field by field; the owner's switch is never a device's field", () => {
  const valid = validateSkySolution(
    solution({ solvedAt: "2026-10-07T23:10:00+01:00" }),
  );
  assert.equal(valid.solvedAt, "2026-10-07T22:10:00.000Z");
  assert.equal(valid.source, "astap");
  assert.equal(
    validateSkySolution(solution({ solverVersion: undefined })).solverVersion,
    null,
  );
  for (const wrong of [
    solution({ annotationsEnabled: true }),
    solution({ source: "solve-field" }),
    solution({ schemaVersion: 2 }),
    solution({ raDeg: 360 }),
    solution({ decDeg: -91 }),
    solution({ pixelScaleArcsec: 0 }),
    solution({ rotationDeg: -1 }),
    solution({ parity: "flipped" }),
    solution({ width: 0 }),
    solution({ height: 1.5 }),
    solution({ solvedAt: "yesterday" }),
    null,
    [],
  ])
    assert.throws(
      () => validateSkySolution(wrong),
      (error) =>
        error instanceof SkySolutionError && error.code === "invalid_request",
    );
});

test("the proportions: a reduced copy fits, a cropped or turned image does not, an unknown size is not checked", () => {
  const solved = solution();
  assert.equal(aspectMatches(solved, { width: 4096, height: 2738 }), true);
  assert.equal(aspectMatches(solved, { width: 6248, height: 3500 }), false);
  assert.equal(aspectMatches(solved, { width: 4176, height: 6248 }), false);
  assert.equal(aspectMatches(solved, { width: null, height: null }), true);
});

onBothBackends(
  "the repository: one solution per image, idempotent by digest, never for an image that left",
  async (driver) => {
    const space = await seed(driver);
    const store = await createSkySolutionRepository({ driver });
    const put = (changes = {}, imageId = space.mainId, digest = space.main) =>
      store.put({
        tenantId: space.tenantId,
        captureId: space.captureId,
        imageId,
        sha256: digest,
        solution: validateSkySolution(solution(changes)),
        at,
      });
    assert.deepEqual(await put(), { created: true, changed: true });
    assert.deepEqual(await put(), { created: false, changed: false });
    assert.deepEqual(await put({ rotationDeg: 31 }), {
      created: false,
      changed: true,
    });
    // The digest must still be the image's.
    assert.equal(await put({}, space.mainId, space.other), null);
    assert.deepEqual(
      await put({ source: "header" }, space.variantId, space.other),
      {
        created: true,
        changed: true,
      },
    );
    const both = await store.forCapture(space.tenantId, space.captureId);
    assert.deepEqual(
      [...both.keys()].sort(),
      [space.mainId, space.variantId].sort(),
    );
    assert.equal(both.get(space.mainId).solution.rotationDeg, 31);
    assert.equal(both.get(space.variantId).source, "header");
    // Another space reads nothing.
    assert.equal(
      (await store.forCapture(randomUUID(), space.captureId)).size,
      0,
    );
    // The gallery reads the solutions while the switch is on only.
    assert.equal((await store.galleryOf(space.captureId)).solutions.size, 2);
    assert.equal(
      await store.setAnnotationsEnabled(space.tenantId, space.captureId, false),
      true,
    );
    const off = await store.galleryOf(space.captureId);
    assert.equal(off.mainImageId, space.mainId);
    assert.equal(off.solutions.size, 0);
    assert.equal(
      await store.remove(space.tenantId, space.captureId, space.variantId),
      true,
    );
    assert.equal(
      await store.remove(space.tenantId, space.captureId, space.variantId),
      false,
    );
  },
);

onBothBackends(
  "the service Astro Sync writes through: idempotent, 409 when the capture changed, 422 on other proportions, 404 for another space",
  async (driver) => {
    const space = await seed(driver);
    const stranger = await seed(driver);
    const service = await createCaptureSkySolutionService({
      driver,
      now: () => at,
    });
    const put = (
      body,
      tenantId = space.tenantId,
      captureId = space.captureId,
    ) => service.put({ tenantId, captureId, body });
    const refused = async (promise, code, status) =>
      assert.rejects(promise, (error) => {
        assert.equal(error.code, code);
        assert.equal(error.status, status);
        return true;
      });
    const first = await put({ sha256: space.main, solution: solution() });
    assert.equal(first.created, true);
    assert.equal(first.skySolution.imageId, space.mainId);
    assert.equal(first.skySolution.sha256, space.main);
    assert.equal(first.skySolution.annotationsEnabled, true);
    assert.equal(first.skySolution.pixelScaleArcsec, 2.06);
    const again = await put({
      sha256: space.main.toUpperCase(),
      solution: solution(),
    });
    assert.deepEqual([again.created, again.changed], [false, false]);
    // A digest of no image of the capture: the capture changed.
    await refused(
      put({ sha256: sha("f"), solution: solution() }),
      "image_changed",
      409,
    );
    // A digest of another capture's image is not this capture's.
    await refused(
      put({ sha256: stranger.main, solution: solution() }),
      "image_changed",
      409,
    );
    // Another space's capture does not exist for this one.
    await refused(
      put(
        { sha256: stranger.main, solution: solution() },
        space.tenantId,
        stranger.captureId,
      ),
      "capture_not_found",
      404,
    );
    await refused(
      put({
        sha256: space.main,
        solution: solution({ width: 6248, height: 3000 }),
      }),
      "sky_solution_aspect_mismatch",
      422,
    );
    // A solution of a reduced copy of the same proportions is accepted.
    const reduced = await put({
      sha256: space.other,
      solution: solution({ width: 1562, height: 1044, pixelScaleArcsec: 8.24 }),
    });
    assert.equal(reduced.skySolution.imageId, space.variantId);
    await refused(put({ sha256: space.main }), "invalid_request", 400);
    await refused(
      put({ sha256: "abc", solution: solution() }),
      "invalid_request",
      400,
    );
    await refused(
      put({
        sha256: space.main,
        solution: solution(),
        annotationsEnabled: false,
      }),
      "invalid_request",
      400,
    );
    // Read back; deleted; the original of each image is named.
    assert.equal(
      (
        await service.get({
          tenantId: space.tenantId,
          captureId: space.captureId,
          imageId: space.variantId,
        })
      ).skySolution.width,
      1562,
    );
    assert.deepEqual(
      await service.remove({
        tenantId: space.tenantId,
        captureId: space.captureId,
        imageId: space.variantId,
      }),
      { deleted: true, imageId: space.variantId },
    );
    await refused(
      service.get({
        tenantId: space.tenantId,
        captureId: space.captureId,
        imageId: space.variantId,
      }),
      "sky_solution_not_found",
      404,
    );
    const original = await service.original({
      tenantId: space.tenantId,
      captureId: space.captureId,
    });
    assert.deepEqual(
      [
        original.imageId,
        original.sha256,
        original.originalName,
        original.source,
      ],
      [space.mainId, space.main, "M31_final.jpg", "phone"],
    );
    assert.equal(original.path, capturePathFor(space.tenantId, space.main));
    await refused(
      service.original({
        tenantId: space.tenantId,
        captureId: space.captureId,
        imageId: "nope",
      }),
      "image_not_found",
      404,
    );
    await refused(
      service.original({
        tenantId: stranger.tenantId,
        captureId: space.captureId,
      }),
      "capture_not_found",
      404,
    );
  },
);

/** A scratch SQLite database with the owner's, the gallery's and the uploads' services. */
async function withServices(fn) {
  const directory = await mkdtemp(join(tmpdir(), "astro-sky-solution-"));
  const previous = process.env.ASTRO_PORTAL_CAPTURES_DIR;
  process.env.ASTRO_PORTAL_CAPTURES_DIR = join(directory, "captures");
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  await applyMigrations(driver, "sqlite");
  const owner = await createOwnerCaptureService({
    driver,
    dialect: "sqlite",
    capabilities: OPEN_SOURCE_PROFILE,
    sharedCopy: async ({ tenantId, sha256 }) => ({
      path: capturePathFor(tenantId, sha256),
    }),
    showable: async () => true,
  });
  const gallery = await createPublicGalleryService({
    driver,
    sharedCopy: async ({ tenantId, sha256 }) => ({
      path: capturePathFor(tenantId, sha256),
    }),
    imageSize: async () => null,
  });
  const uploads = await createUploadResourceService({
    driver,
    dialect: "sqlite",
    capabilities: OPEN_SOURCE_PROFILE,
  });
  const skies = await createCaptureSkySolutionService({
    driver,
    now: () => at,
  });
  try {
    await fn({ driver, owner, gallery, uploads, skies });
  } finally {
    await uploads.close();
    await driver.close();
    if (previous === undefined) delete process.env.ASTRO_PORTAL_CAPTURES_DIR;
    else process.env.ASTRO_PORTAL_CAPTURES_DIR = previous;
    await rm(directory, { force: true, recursive: true });
  }
}

test("the owner's view carries the main image's solution and the switch; the switch needs a solution; the solutions go with their image and their capture", async () => {
  await withServices(async ({ driver, owner, skies }) => {
    const space = await seed(driver);
    const ids = { tenantId: space.tenantId, captureId: space.captureId };
    const before = await owner.get(ids);
    assert.equal("skySolution" in before, false);
    assert.deepEqual(
      before.variants.map((image) => image.skySolved),
      [false, false],
    );
    await assert.rejects(
      owner.update({ ...ids, changes: { skyAnnotations: false } }),
      (error) =>
        error.code === "sky_solution_not_found" && error.status === 409,
    );
    // A variant's solution alone: the switch exists, the main image has none.
    await skies.put({
      ...ids,
      body: { sha256: space.other, solution: solution() },
    });
    const variantOnly = await owner.get(ids);
    assert.equal("skySolution" in variantOnly, false);
    assert.deepEqual(
      variantOnly.variants.map((image) => image.skySolved),
      [false, true],
    );
    await skies.put({
      ...ids,
      body: { sha256: space.main, solution: solution() },
    });
    const solved = await owner.get(ids);
    assert.equal(solved.skySolution.imageId, space.mainId);
    assert.equal(solved.skySolution.annotationsEnabled, true);
    await assert.rejects(
      owner.update({ ...ids, changes: { skyAnnotations: "off" } }),
      (error) => error.code === "invalid_request",
    );
    const off = await owner.update({
      ...ids,
      changes: { skyAnnotations: false },
    });
    assert.equal(off.skySolution.annotationsEnabled, false);
    assert.equal(off.state.state, solved.state.state);
    // Deleting the variant deletes its solution; deleting the capture, all.
    await owner.deleteVariant({ ...ids, imageId: space.variantId });
    const count = async () =>
      Number(
        (
          await driver.query(
            "SELECT COUNT(*) AS count FROM capture_sky_solutions WHERE capture_id = ?",
            [space.captureId],
          )
        ).rows[0].count,
      );
    assert.equal(await count(), 1);
    await owner.remove(ids);
    assert.equal(await count(), 0);
  });
});

test("« missing »: the captures whose main image has no solution, the phone's included; each says where its main image came from", async () => {
  await withServices(async ({ driver, uploads, skies }) => {
    const solvedMain = await seed(driver);
    const list = (tenantId, skySolution) =>
      uploads.listCaptures({
        tenantId,
        skySolution,
        caller: { kind: "device", application: "sync" },
      });
    // Another capture of the same space, its variant solved only.
    const variantOnly = await seed(driver);
    await driver.run("UPDATE captures SET tenant_id = ? WHERE id = ?", [
      solvedMain.tenantId,
      variantOnly.captureId,
    ]);
    await driver.run(
      "UPDATE capture_variants SET tenant_id = ? WHERE capture_id = ?",
      [solvedMain.tenantId, variantOnly.captureId],
    );
    await skies.put({
      tenantId: solvedMain.tenantId,
      captureId: solvedMain.captureId,
      body: { sha256: solvedMain.main, solution: solution() },
    });
    await skies.put({
      tenantId: solvedMain.tenantId,
      captureId: variantOnly.captureId,
      body: { sha256: variantOnly.other, solution: solution() },
    });
    const all = await list(solvedMain.tenantId);
    assert.deepEqual(
      all.captures
        .map((capture) => [
          capture.id === solvedMain.captureId,
          capture.skySolved,
          capture.mainImageSource,
        ])
        .sort(),
      [
        [false, false, "phone"],
        [true, true, "phone"],
      ],
    );
    const missing = await list(solvedMain.tenantId, "missing");
    assert.deepEqual(
      missing.captures.map((capture) => capture.id),
      [variantOnly.captureId],
    );
    await assert.rejects(
      list(solvedMain.tenantId, "present"),
      (error) => error.code === "invalid_request",
    );
  });
});

test("the gallery carries the solution of the image shown, only while it exists and the switch is on; a variant without one hides nothing", async () => {
  await withServices(async ({ driver, gallery, skies, owner }) => {
    const space = await seed(driver);
    const ids = { tenantId: space.tenantId, captureId: space.captureId };
    await driver.run("UPDATE captures SET visibility = 'public' WHERE id = ?", [
      space.captureId,
    ]);
    await driver.run("UPDATE capture_variants SET is_public = 1 WHERE id = ?", [
      space.variantId,
    ]);
    const view = () => gallery.get({ captureId: space.captureId });
    const plain = await view();
    assert.equal("skySolution" in plain, false);
    assert.equal("skySolution" in plain.variants[0], false);
    await skies.put({
      ...ids,
      body: { sha256: space.main, solution: solution() },
    });
    const shown = await view();
    assert.deepEqual(Object.keys(shown.skySolution).sort(), [
      "annotations",
      "decDeg",
      "fieldHeightDeg",
      "fieldWidthDeg",
      "height",
      "parity",
      "pixelScaleArcsec",
      "raDeg",
      "rotationDeg",
      "width",
    ]);
    assert.equal(
      shown.skySolution.annotations,
      `/api/v1/gallery/${space.captureId}/annotations`,
    );
    // The variant, without a solution, shows none; the main image keeps its own.
    assert.equal("skySolution" in shown.variants[0], false);
    await skies.put({
      ...ids,
      body: { sha256: space.other, solution: solution() },
    });
    assert.equal(
      (await view()).variants[0].skySolution.annotations,
      `/api/v1/gallery/${space.captureId}/annotations?imageId=${encodeURIComponent(space.variantId)}`,
    );
    // The switch off: no solution anywhere, the page of before.
    await owner.update({ ...ids, changes: { skyAnnotations: false } });
    const off = await view();
    assert.equal("skySolution" in off, false);
    assert.equal("skySolution" in off.variants[0], false);
  });
});
