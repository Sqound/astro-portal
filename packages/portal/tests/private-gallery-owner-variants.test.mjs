// The owner's carousel (PORTAL-VIEWER-VARIANTS-01, remark of 03/11/2026):
// the owner of a private gallery reads every image of a capture — public or
// not, the capture a draft or not — each private one with the badge
// « privée »; a visitor of the gallery link (and the public gallery) reads
// the main image and the public variants only.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { createPrivateGalleryService } from "../dist/private-gallery/private-gallery.js";
import { capturePathFor } from "../dist/uploads/capture-storage.js";

await registerJsx();
const { PublicCapturePage } =
  await import("portal/components/detail/PublicCapturePage.js");
const { CaptureImageBand } =
  await import("portal/components/detail/CaptureImageCarousel.js");
const { privateCapturePageProps } =
  await import("portal/components/gallery/PrivateGallery.js");
const { shownImages } = await import("portal/captures/image-names.js");
const { messages, message } = await import("portal/i18n.js");
const { capturesCopyFor } =
  await import("portal/components/manage/captures-copy.js");

const at = "2026-11-03T17:58:00.000Z";
const text = (markup) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[  ]/g, " ");

async function withGallery(fn) {
  const directory = await mkdtemp(join(tmpdir(), "astro-owner-variants-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  await applyMigrations(driver, "sqlite");
  const privateGallery = await createPrivateGalleryService({
    driver,
    sharedCopy: async ({ tenantId, sha256 }) => ({
      path: capturePathFor(tenantId, sha256),
    }),
  });
  try {
    await fn({ driver, privateGallery });
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
}

/**
 * A space with one capture of 8 images, as the remark: the main image and
 * seven variants, only `Rendu soigné` public (made public, and retired in
 * one test).
 */
async function seed(
  driver,
  { stage = "finalized", visibility = "public" } = {},
) {
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
  const sha = (suffix) =>
    createHash("sha256").update(`${captureId}${suffix}`).digest("hex");
  await driver.run(
    "INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, status, stage, visibility, created_at) VALUES (?, ?, ?, ?, ?, 'uploaded', ?, ?, ?)",
    [
      captureId,
      tenantId,
      "Sh2-103_plan_raw.tif",
      sha(""),
      100,
      stage,
      visibility,
      at,
    ],
  );
  const images = [
    [captureId, sha(""), 1, 0, "00"],
    [`${captureId}-v1`, sha("-v1"), 0, 1, "01"],
    [`${captureId}-v2`, sha("-v2"), 0, 0, "02"],
    [`${captureId}-v3`, sha("-v3"), 0, 0, "03"],
    [`${captureId}-v4`, sha("-v4"), 0, 0, "04"],
    [`${captureId}-v5`, sha("-v5"), 0, 0, "05"],
    [`${captureId}-v6`, sha("-v6"), 0, 0, "06"],
    [`${captureId}-v7`, sha("-v7"), 0, 0, "07"],
  ];
  for (const [id, sha256, isMain, isPublic, minute] of images)
    await driver.run(
      "INSERT INTO capture_variants (id, capture_id, tenant_id, sha256, byte_size, original_name, width, height, source, is_main, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'astro-sync', ?, ?, ?)",
      [
        id,
        captureId,
        tenantId,
        sha256,
        100,
        `${id}.tif`,
        2995,
        2977,
        isMain,
        isPublic,
        `2026-11-03T18:${minute}:00.000Z`,
      ],
    );
  return { tenantId, userId, captureId };
}

async function openLink(privateGallery, owner) {
  await privateGallery.settings({ ...owner, origin: "https://p.test" });
  const set = await privateGallery.update({
    ...owner,
    changes: { mode: "link", confirmVerifiers: true },
    origin: "https://p.test",
  });
  return new URL(set.address).pathname.split("/").pop();
}

const idsOf = (view) => view.capture.variants.map((variant) => variant.id);

test("the owner reads the 8 images of a public capture, the private variants flagged; a visitor of the link reads the main image and the public variant", async () => {
  await withGallery(async ({ driver, privateGallery }) => {
    const space = await seed(driver);
    const owner = { tenantId: space.tenantId, userId: space.userId };
    const token = await openLink(privateGallery, owner);
    const read = async (viewer) =>
      (
        await privateGallery.capture({
          token,
          captureId: space.captureId,
          viewer,
        })
      ).view;

    const mine = await read(owner);
    assert.equal(
      mine.capture.variants.length,
      7,
      "main image + 7 variants = 8",
    );
    assert.deepEqual(
      mine.capture.variants.map((variant) => [
        variant.id.slice(-2),
        variant.private,
      ]),
      [
        ["v7", true],
        ["v6", true],
        ["v5", true],
        ["v4", true],
        ["v3", true],
        ["v2", true],
        ["v1", undefined],
      ],
      "newest first; only the public one carries no flag",
    );

    const visitor = await read(null);
    assert.deepEqual(idsOf(visitor), [`${space.captureId}-v1`]);
    assert.equal(
      JSON.stringify(visitor).includes('"private"'),
      false,
      "nothing of the owner's flag leaves for a visitor",
    );
    // A stranger signed in elsewhere is a visitor.
    const stranger = { tenantId: randomUUID(), userId: randomUUID() };
    assert.deepEqual(idsOf(await read(stranger)), [`${space.captureId}-v1`]);

    // The files: the owner is given a private variant, a visitor is not.
    const hidden = `${space.captureId}-v3`;
    assert.ok(
      await privateGallery.shownImage({
        token,
        captureId: space.captureId,
        viewer: owner,
        imageId: hidden,
      }),
    );
    assert.equal(
      await privateGallery.shownImage({
        token,
        captureId: space.captureId,
        imageId: hidden,
      }),
      null,
    );
    assert.equal(
      await privateGallery.media({
        token,
        captureId: space.captureId,
        imageId: hidden,
        variant: "thumbnail",
      }),
      null,
      "a visitor reaches no private variant",
    );
  });
});

test("a draft: the owner opens it by its address and reads its 8 images; it is not in the gallery's list and a visitor gets nothing", async () => {
  await withGallery(async ({ driver, privateGallery }) => {
    const space = await seed(driver, { stage: "draft", visibility: "private" });
    const owner = { tenantId: space.tenantId, userId: space.userId };
    const token = await openLink(privateGallery, owner);
    const mine = await privateGallery.capture({
      token,
      captureId: space.captureId,
      viewer: owner,
    });
    assert.equal(mine.access.outcome, "open");
    assert.equal(mine.view.capture.variants.length, 7);
    assert.ok(mine.view.capture.variants.every((variant) => variant.private));
    assert.equal(
      (await privateGallery.capture({ token, captureId: space.captureId }))
        .access.outcome,
      "not_found",
    );
    const list = await privateGallery.gallery({ token, viewer: owner });
    assert.equal(list.view.captures.length, 0, "a draft is in no list");
    assert.ok(
      await privateGallery.shownImage({
        token,
        captureId: space.captureId,
        viewer: owner,
        imageId: `${space.captureId}-v2`,
      }),
    );
    assert.equal(
      await privateGallery.shownImage({ token, captureId: space.captureId }),
      null,
    );
  });
});

test("a variant made public then withdrawn: flagged private for the owner, gone for the visitor; a private capture flags every variant", async () => {
  await withGallery(async ({ driver, privateGallery }) => {
    const space = await seed(driver);
    const owner = { tenantId: space.tenantId, userId: space.userId };
    const token = await openLink(privateGallery, owner);
    const read = async (viewer) =>
      (
        await privateGallery.capture({
          token,
          captureId: space.captureId,
          viewer,
        })
      ).view.capture.variants;
    const retired = `${space.captureId}-v1`;
    assert.equal((await read(null)).length, 1);
    await driver.run("UPDATE capture_variants SET is_public = 0 WHERE id = ?", [
      retired,
    ]);
    assert.equal((await read(null)).length, 0);
    const mine = await read(owner);
    assert.equal(mine.length, 7);
    assert.equal(mine.find((variant) => variant.id === retired).private, true);
    // The capture goes private again: its public variant is no longer shown to
    // a visitor, and is flagged for the owner.
    await driver.run("UPDATE capture_variants SET is_public = 1 WHERE id = ?", [
      retired,
    ]);
    await driver.run(
      "UPDATE captures SET visibility = 'private' WHERE id = ?",
      [space.captureId],
    );
    assert.equal((await read(null)).length, 0);
    assert.ok((await read(owner)).every((variant) => variant.private));
    // An archived variant (a space past its subscription) stays out for all.
    await driver.run(
      "UPDATE capture_variants SET archived_at = ? WHERE id = ?",
      [at, `${space.captureId}-v7`],
    );
    assert.equal((await read(owner)).length, 6);
  });
});

const pageOf = (view, locale = "fr") =>
  renderToStaticMarkup(
    createElement(
      PublicCapturePage,
      privateCapturePageProps({ locale, token: "tok", view }),
    ),
  );

const viewOf = (variants) => ({
  portalName: "Galerie de Camille",
  publicName: "Camille",
  canReport: false,
  capture: {
    id: "c1",
    thumbnail: true,
    targets: [{ id: "sh2-103", designation: "Sh2-103", aliases: [] }],
    equipment: [],
    nightMonth: "2026-08",
    skyQuality: null,
    mainImage: {
      id: "c1",
      title: "Rendu naturel",
      description: null,
      arrivalRank: 1,
    },
    variants,
  },
});
const variant = (rank, extra = {}) => ({
  id: `v${rank}`,
  thumbnail: true,
  image: { width: 2995, height: 2977 },
  title: `Variante ${rank}`,
  description: null,
  arrivalRank: rank,
  ...extra,
});

test("the carousel of the owner's page: 8 dots, arrows, and the badge « privée » on a private variant; a visitor's page carries one public variant and no badge", () => {
  const owner = viewOf(
    [2, 3, 4, 5, 6, 7, 8].map((rank) => variant(rank, { private: rank !== 2 })),
  );
  const mine = pageOf(owner);
  assert.equal((mine.match(/asset-pagination-dot/g) ?? []).length, 8);
  assert.match(mine, /aria-label="Image 1 sur 8"/);
  assert.match(mine, /asset-nav-next/);
  // The main image is shown first: no badge on it.
  assert.doesNotMatch(mine, /capture-image-private/);

  const visitor = pageOf(viewOf([variant(2)]));
  assert.equal((visitor.match(/asset-pagination-dot/g) ?? []).length, 2);
  assert.doesNotMatch(visitor, /capture-image-private/);

  // The images the carousel is made of keep the flag.
  const { images } = shownImages(owner.capture, "fr");
  assert.equal(images.length, 8);
  assert.deepEqual(
    images.map((image) => Boolean(image.private)),
    [false, false, true, true, true, true, true, true],
  );

  // The band names the image and carries the badge, in each language.
  for (const locale of Object.keys(messages)) {
    const label = message(locale, "imagePrivate");
    assert.ok(label && label !== "imagePrivate", locale);
    const band = renderToStaticMarkup(
      createElement(CaptureImageBand, {
        name: "Rendu soigné",
        caption: "Août 2026",
        privateLabel: label,
      }),
    );
    assert.match(band, /<strong[^>]*>Rendu soigné<\/strong>/);
    assert.match(band, /data-testid="image-private"/);
    assert.ok(text(band).includes(label), locale);
  }
  assert.doesNotMatch(
    renderToStaticMarkup(
      createElement(CaptureImageBand, { name: "x", caption: "y" }),
    ),
    /capture-image-private/,
  );
});

test("the sheet's sentence says the private gallery shows every image and the public one the main image then the public variants, in ten languages", () => {
  const sentences = new Set();
  for (const locale of Object.keys(messages)) {
    const sentence = capturesCopyFor(locale).variantsCount(8);
    assert.ok(sentence.includes("8"), locale);
    sentences.add(sentence);
  }
  assert.equal(sentences.size, 10);
  assert.equal(
    capturesCopyFor("fr").variantsCount(8),
    "8 images. La galerie privée montre toutes les images\u00a0; la galerie publique, l’image principale puis les variantes publiques.",
  );
});
