// The statistics are shown on the private and the public gallery, each under its own switch:
// the quality Astro Sync measured on
// an image is shown in the capture's page of the private gallery while the
// owner's switch « Afficher la qualité en privé » is on (on by default) and in
// the public gallery's while « Afficher la qualité en public » is on (on for a
// new capture, off for the older ones until their owner turns it on). The owner's service keeps both switches; each gallery's view
// carries `quality` only under its own; the page that draws the capture — one
// component for both routes — has a « Qualité » section after « Traitement »,
// for the image shown.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { schemaErrors } from "../../astro-contracts/tests/schema-assert.mjs";
import { createPublicGalleryService } from "../dist/captures/public-gallery.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { createPrivateGalleryService } from "../dist/private-gallery/private-gallery.js";
import { capturePathFor } from "../dist/uploads/capture-storage.js";
import { onBothBackends } from "./helpers/both-backends.mjs";
import { refusal, withServices } from "./helpers/journal-space.mjs";
import { SYNC, image } from "./helpers/metadata-space.mjs";

await registerJsx();
const { PublicCapturePage, publicCaptureRows } =
  await import("portal/components/detail/PublicCapturePage.js");
const { privateCapturePageProps } =
  await import("portal/components/gallery/PrivateGallery.js");
const { publicQualityRows } =
  await import("portal/captures/public-capture-quality.js");
const { messages } = await import("portal/i18n.js");
const { metadataCopyFor } =
  await import("portal/components/manage/capture-metadata-copy.js");

const gallerySchema = JSON.parse(
  await readFile(
    new URL(
      "../../astro-contracts/schemas/api/gallery.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const galleryErrors = (pointer, value) =>
  schemaErrors({ ...gallerySchema, $ref: `#/$defs/${pointer}` }, value);

const at = "2026-10-14T09:00:00.000Z";
const QUALITY = {
  fwhmPixels: 2.6,
  fwhmArcsec: 2.1,
  eccentricity: 0.38,
  starCount: 1840,
  measuredOn: "linear",
  measuredAt: "2026-10-14T08:00:00.000Z",
  tool: { name: "Astro Sync", version: "1.4.0" },
};
const VARIANT_QUALITY = {
  ...QUALITY,
  fwhmPixels: 3.1,
  fwhmArcsec: null,
  eccentricity: null,
  starCount: 912,
};

// ——— the owner's service ———

onBothBackends(
  "the owner's two switches are both on for a new capture, are written by the web and by a device, persist, and move the revision once",
  async (driver) => {
    await withServices(driver, {}, async ({ owner, space, send }) => {
      const created = (await send(image(`q-${randomUUID()}`), {}, SYNC)).body
        .capture;
      const common = {
        tenantId: space.tenantId,
        userId: space.userId,
        captureId: created.id,
      };
      const read = async () => await owner.get(common);
      const first = await read();
      assert.deepEqual(first.qualityShown, { private: true, public: true });
      // The list says it too.
      const listed = (await owner.list({ ...common })).captures.find(
        (item) => item.id === created.id,
      );
      assert.deepEqual(listed.qualityShown, { private: true, public: true });
      // A capture created before the rule keeps its switch off until its
      // owner turns it on (the column's default).
      const publicOff = await owner.update({
        ...common,
        changes: { qualityPublic: false },
      });
      assert.deepEqual(publicOff.qualityShown, {
        private: true,
        public: false,
      });
      assert.equal(publicOff.revision, first.revision + 1);
      const publicOn = await owner.update({
        ...common,
        changes: { qualityPublic: true },
      });
      assert.deepEqual(publicOn.qualityShown, { private: true, public: true });
      assert.equal(publicOn.revision, publicOff.revision + 1);
      // A device writes them too, against the revision it read.
      const privateOff = await owner.update({
        ...common,
        changes: { qualityPrivate: false },
        by: "device",
        ifMatch: publicOn.revision,
      });
      assert.deepEqual(privateOff.qualityShown, {
        private: false,
        public: true,
      });
      assert.equal(privateOff.revision, publicOn.revision + 1);
      // The same value again changes nothing and does not move the revision.
      const same = await owner.update({
        ...common,
        changes: { qualityPrivate: false },
      });
      assert.equal(same.revision, privateOff.revision);
      // Persisted: another read gives the same switches.
      assert.deepEqual((await read()).qualityShown, {
        private: false,
        public: true,
      });
      assert.deepEqual(
        (
          await driver.query(
            "SELECT quality_private, quality_public FROM captures WHERE id = ?",
            [created.id],
          )
        ).rows.map((row) => [
          Number(row.quality_private),
          Number(row.quality_public),
        ]),
        [[0, 1]],
      );
      // Back to the defaults.
      await owner.update({ ...common, changes: { qualityPrivate: true } });
      const back = await owner.update({
        ...common,
        changes: { qualityPublic: false },
      });
      assert.deepEqual(back.qualityShown, { private: true, public: false });
      // A boolean, and one change per call.
      for (const changes of [
        { qualityPublic: "yes" },
        { qualityPrivate: 1 },
        { qualityPublic: true, qualityPrivate: false },
        { qualityPublic: true, stage: "finalized" },
      ]) {
        const refused = await refusal(owner.update({ ...common, changes }));
        assert.equal(refused.code, "invalid_request", JSON.stringify(changes));
      }
      // Another space's capture is not found.
      const other = await refusal(
        owner.update({
          tenantId: randomUUID(),
          userId: space.userId,
          captureId: created.id,
          changes: { qualityPublic: true },
        }),
      );
      assert.equal(other.code, "capture_not_found");
    });
  },
);

// ——— the galleries' views ———

async function withGalleries(exercise) {
  const directory = await mkdtemp(join(tmpdir(), "astro-quality-switches-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  await applyMigrations(driver, "sqlite");
  const files = {
    sharedCopy: async ({ tenantId, sha256 }) => ({
      path: capturePathFor(tenantId, sha256),
    }),
  };
  const gallery = await createPublicGalleryService({
    driver,
    ...files,
    imageSize: async () => null,
  });
  const privateGallery = await createPrivateGalleryService({
    driver,
    ...files,
  });
  try {
    await exercise({ driver, gallery, privateGallery });
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
}

async function seed(driver) {
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
  const digest = (suffix) =>
    createHash("sha256").update(`${captureId}${suffix}`).digest("hex");
  await driver.run(
    "INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, status, stage, visibility, created_at) VALUES (?, ?, ?, ?, ?, 'uploaded', 'finalized', 'public', ?)",
    [captureId, tenantId, "M31_final.jpg", digest(""), 100, at],
  );
  const variants = [
    [captureId, "", 1, 1, QUALITY],
    [`${captureId}-shown`, "-shown", 0, 1, VARIANT_QUALITY],
    [`${captureId}-hidden`, "-hidden", 0, 0, QUALITY],
  ];
  for (const [id, suffix, isMain, isPublic, quality] of variants)
    await driver.run(
      "INSERT INTO capture_variants (id, capture_id, tenant_id, sha256, byte_size, original_name, width, height, source, is_main, is_public, quality_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'astro-sync', ?, ?, ?, ?)",
      [
        id,
        captureId,
        tenantId,
        digest(suffix),
        100,
        `${id}.jpg`,
        4096,
        2738,
        isMain,
        isPublic,
        JSON.stringify(quality),
        at,
      ],
    );
  return { tenantId, userId, captureId };
}

const setSwitches = (driver, captureId, { priv, pub }) =>
  driver.run(
    "UPDATE captures SET quality_private = ?, quality_public = ? WHERE id = ?",
    [priv, pub, captureId],
  );

test("the public gallery's JSON carries quality only under « Afficher la qualité en public » (off by default), for the main image and each public variant, in the contract", async () => {
  await withGalleries(async ({ driver, gallery }) => {
    const space = await seed(driver);
    const get = async () =>
      await gallery.get({ captureId: space.captureId, locale: "fr" });
    // By default: public off, private on — a visitor reads nothing.
    const off = await get();
    assert.equal("quality" in off, false);
    assert.equal(
      off.variants.some((variant) => "quality" in variant),
      false,
    );
    assert.doesNotMatch(JSON.stringify(off), /fwhm|starCount|Astro Sync/);
    // The public switch on.
    await setSwitches(driver, space.captureId, { priv: 0, pub: 1 });
    const on = await get();
    assert.deepEqual(on.quality, QUALITY);
    assert.deepEqual(galleryErrors("imageQuality", on.quality), []);
    assert.equal(on.variants.length, 1, "only the public variant is shown");
    assert.deepEqual(on.variants[0].quality, VARIANT_QUALITY);
    assert.deepEqual(galleryErrors("imageQuality", on.variants[0].quality), []);
    assert.equal(on.variants[0].id, `${space.captureId}-shown`);
    // The private switch has nothing to do with it.
    await setSwitches(driver, space.captureId, { priv: 1, pub: 1 });
    assert.deepEqual((await get()).quality, QUALITY);
    // Off again: gone from every level.
    await setSwitches(driver, space.captureId, { priv: 1, pub: 0 });
    const again = await get();
    assert.equal("quality" in again, false);
    assert.equal("quality" in again.variants[0], false);
    // An image without a measure has no quality, switch on or not.
    await setSwitches(driver, space.captureId, { priv: 1, pub: 1 });
    await driver.run(
      "UPDATE capture_variants SET quality_json = NULL WHERE id = ?",
      [`${space.captureId}-shown`],
    );
    const partial = await get();
    assert.deepEqual(partial.quality, QUALITY);
    assert.equal("quality" in partial.variants[0], false);
    // A stored value that does not read is not carried.
    await driver.run(
      "UPDATE capture_variants SET quality_json = ? WHERE id = ?",
      ["not json", space.captureId],
    );
    assert.equal("quality" in (await get()), false);
  });
});

test("the private gallery's view carries quality only under « Afficher la qualité en privé » (on by default), independently of the public switch", async () => {
  await withGalleries(async ({ driver, privateGallery }) => {
    const space = await seed(driver);
    const owner = { tenantId: space.tenantId, userId: space.userId };
    const set = await privateGallery.update({
      ...owner,
      changes: { mode: "link", confirmVerifiers: true },
      origin: "https://p.test",
    });
    const token = new URL(set.address).pathname.split("/").pop();
    const view = async () =>
      (await privateGallery.capture({ token, captureId: space.captureId })).view
        .capture;
    // By default: private on, public off.
    const byDefault = await view();
    assert.deepEqual(byDefault.quality, QUALITY);
    assert.deepEqual(
      byDefault.variants.map((variant) => [variant.id, variant.quality]),
      [[`${space.captureId}-shown`, VARIANT_QUALITY]],
    );
    // The private switch off, the public one on: nothing in the private view.
    await setSwitches(driver, space.captureId, { priv: 0, pub: 1 });
    const off = await view();
    assert.equal("quality" in off, false);
    assert.equal(
      off.variants.some((variant) => "quality" in variant),
      false,
    );
    // And back.
    await setSwitches(driver, space.captureId, { priv: 1, pub: 0 });
    assert.deepEqual((await view()).quality, QUALITY);
  });
});

// ——— the page ———

const target = {
  id: "m31",
  designation: "M31",
  name: "Galaxie d’Andromède",
  aliases: ["NGC 224"],
  type: "Galaxie",
  constellation: "Andromède",
  ra: 10.6847,
  dec: 41.2688,
};
const metadata = {
  title: null,
  description: null,
  acquisition: [],
  totalIntegrationSeconds: null,
  calibration: null,
  sensor: null,
  processing: { software: "Siril 1.4.4", steps: null },
  filters: [],
};
const knowledge = {
  story: "La galaxie d’Andromède est la plus proche grande voisine.",
  storyParagraphs: [],
  researchSources: [],
};
const TOKEN = "A".repeat(32);
const ID = "c-m31";
const mainImage = {
  id: "main",
  title: null,
  description: null,
  arrivalRank: 1,
};
const variantView = {
  id: "crop",
  image: { width: 1800, height: 1200 },
  title: "Recadrée",
  description: null,
  arrivalRank: 2,
};

const publicShape = (quality) => ({
  id: ID,
  targets: [target],
  nightMonth: "2026-10",
  signature: "Camille",
  equipment: [],
  skyQuality: null,
  image: { width: 2922, height: 1948 },
  media: {
    image: `/api/v1/gallery/${ID}/media`,
    thumbnail: `/api/v1/gallery/${ID}/media?variant=thumbnail`,
  },
  mainImage,
  variants: [
    {
      ...variantView,
      ...(quality ? { quality: VARIANT_QUALITY } : {}),
      media: {
        image: `/api/v1/gallery/${ID}/media?imageId=crop`,
        thumbnail: `/api/v1/gallery/${ID}/media?variant=thumbnail&imageId=crop`,
      },
    },
  ],
  metadata,
  ...(quality ? { quality } : {}),
});
const privateView = (quality) => ({
  portalName: "Ciel du Lac Noir",
  publicName: "Camille",
  canReport: true,
  capture: {
    id: ID,
    targets: [target],
    night: "2026-10-05",
    nightMonth: "2026-10",
    addedAt: "2026-10-06T09:41:00.000Z",
    fileName: "M31_final.jpg",
    byteSize: 1000,
    equipment: [],
    skyQuality: null,
    image: { width: 2922, height: 1948 },
    thumbnail: true,
    mainImage,
    variants: [
      {
        ...variantView,
        thumbnail: true,
        ...(quality ? { quality: VARIANT_QUALITY } : {}),
      },
    ],
    metadata,
    ...(quality ? { quality } : {}),
  },
});
const publicPage = (quality, locale = "fr") =>
  renderToStaticMarkup(
    createElement(PublicCapturePage, {
      capture: publicShape(quality),
      knowledge,
      noTarget: "Sans cible",
      locale,
      reportable: true,
    }),
  );
const privatePage = (quality, locale = "fr") =>
  renderToStaticMarkup(
    createElement(
      PublicCapturePage,
      privateCapturePageProps({
        locale,
        token: TOKEN,
        view: privateView(quality),
        knowledge,
      }),
    ),
  );
const plain = (markup) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/[  ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const withoutAddresses = (markup) =>
  markup
    .replaceAll(`/api/v1/gallery/${ID}/media`, "MEDIA")
    .replaceAll(`/api/v1/portals/${TOKEN}/media/${ID}`, "MEDIA")
    .replace(/href="\/fr"/, 'href="BACK"')
    .replace(`href="/fr/p/${TOKEN}"`, 'href="BACK"')
    .replace(/(aria-label|title)="Retour à la galerie[^"]*"/g, '$1="BACK"')
    // The tooltips of the viewer's bar: their words, and their ids (which
    // follow the place of the page in the tree of each route).
    .replace(/(viewer-tooltip">)Retour à la galerie[^<]*/, "$1BACK")
    .replace(/_R_[a-z0-9_]+_/gi, "ID");

test("both routes draw a « Qualité » section after « Traitement » when the view carries quality, and nothing when it does not", () => {
  for (const [name, page] of [
    ["public", publicPage],
    ["private", privatePage],
  ]) {
    const without = plain(page(null));
    assert.ok(!without.includes("Qualité"), `${name}: no section`);
    assert.ok(!without.includes("FWHM"), `${name}: no figure`);
    assert.ok(!without.includes("Astro Sync"), `${name}: no tool`);
    const markup = page(QUALITY);
    const text = plain(markup);
    for (const sentence of [
      "Traitement Logiciels Siril 1.4.4",
      "Qualité FWHM des étoiles 2,10″ · 2,6 px",
      "Excentricité 0,38",
      "Étoiles mesurées 1 840",
      "Mesurée sur Image empilée, avant étirement",
      "Outil Astro Sync 1.4.0",
      "Date de la mesure 14 oct. 2026",
    ])
      assert.ok(text.includes(sentence), `${name}: « ${sentence} »`);
    // After « Traitement », before « À propos de la cible ».
    assert.ok(text.indexOf("Traitement") < text.indexOf("Qualité"));
    assert.ok(text.indexOf("Qualité") < text.indexOf("À propos de la cible"));
    assert.match(markup, /<section data-section="quality">/);
  }
  // The same page on both routes, but for the addresses.
  assert.equal(
    withoutAddresses(privatePage(QUALITY)),
    withoutAddresses(publicPage(QUALITY)),
  );
});

test("the rows follow the image shown: a variant's own quality (pixels alone when the scale is unknown), none for a variant without", () => {
  const capture = publicShape(QUALITY);
  const rows = (shown) =>
    publicCaptureRows(capture, "fr", shown).find(
      (entry) => entry.section === "quality",
    ).rows;
  assert.deepEqual(rows(null)[0], ["FWHM des étoiles", "2,10″ · 2,6 px"]);
  assert.deepEqual(rows(capture.variants[0]), [
    ["FWHM des étoiles", "3,1 px"],
    ["Étoiles mesurées", "912"],
    ["Mesurée sur", "Image empilée, avant étirement"],
    ["Outil", "Astro Sync 1.4.0"],
    ["Date de la mesure", "14 oct. 2026"],
  ]);
  assert.deepEqual(rows({ ...capture.variants[0], quality: undefined }), []);
  assert.deepEqual(publicQualityRows(null, "fr"), []);
  assert.deepEqual(publicQualityRows({ junk: true }, "fr"), []);
  // A measure on a stretched image says so.
  assert.equal(
    publicQualityRows({ ...QUALITY, measuredOn: "stretched" }, "en")[3][1],
    "Stretched image",
  );
});

test("the words are in the ten languages: the section, its rows, and the owner's two switches with the default said", () => {
  assert.equal(Object.keys(messages).length, 10);
  for (const [locale, catalogue] of Object.entries(messages)) {
    for (const key of [
      "publicQualityTitle",
      "qualityStarsMeasured",
      "qualityMeasuredOn",
      "qualityMeasuredOnLinear",
      "qualityMeasuredOnStretched",
      "qualityTool",
      "qualityMeasuredAt",
    ]) {
      assert.equal(typeof catalogue[key], "string", `${locale} ${key}`);
      assert.ok(catalogue[key].length > 1, `${locale} ${key}`);
      if (locale !== "en")
        assert.notEqual(catalogue[key], messages.en[key], `${locale} ${key}`);
    }
    const meta = metadataCopyFor(locale);
    for (const key of [
      "qualityShowPrivate",
      "qualityShowPublic",
      "qualityShowDefault",
    ]) {
      assert.ok(meta[key]?.length > 8, `${locale} ${key}`);
      if (locale !== "en")
        assert.notEqual(meta[key], metadataCopyFor("en")[key], `${locale}`);
    }
    // The page renders in every language with a section.
    assert.ok(publicPage(QUALITY, locale).includes('data-section="quality"'));
  }
  const fr = metadataCopyFor("fr");
  assert.equal(fr.qualityShowPrivate, "Afficher la qualité en privé");
  assert.equal(fr.qualityShowPublic, "Afficher la qualité en public");
  assert.match(fr.qualityShowDefault, /deux galeries.*nuit.*guidage/);
});

// ——— Mon espace › Captures ———

test("Mon espace: the two switches stand under « Cette image » in the quality zone, both on by default, the default said; none in the read-only window", async () => {
  const { CaptureQualityZone } =
    await import("portal/components/manage/CaptureSessionQuality.js");
  const { QualityShowControls } =
    await import("portal/components/manage/CapturesTab.js");
  const meta = metadataCopyFor("fr");
  const calls = [];
  const actions = {
    setQualityShown: (capture, audience, shown) =>
      calls.push([capture.id, audience, shown]),
  };
  const zone = (capture, readOnly = false) =>
    renderToStaticMarkup(
      createElement(CaptureQualityZone, {
        capture,
        meta,
        locale: "fr",
        href: null,
        controls: createElement(QualityShowControls, {
          capture,
          meta,
          busy: false,
          readOnly,
          actions,
        }),
      }),
    );
  const base = { id: "cap-1", quality: QUALITY, detail: {} };
  const byDefault = zone(base);
  assert.match(byDefault, /data-quality="image"/);
  const switches = [
    ...byDefault.matchAll(
      /<input id="(capture-quality-(?:private|public)-cap-1)"[^>]*?aria-checked="(true|false)"/g,
    ),
  ].map((match) => [match[1], match[2] === "true"]);
  assert.deepEqual(switches, [
    ["capture-quality-private-cap-1", true],
    ["capture-quality-public-cap-1", true],
  ]);
  const words = plain(byDefault);
  assert.ok(words.includes("Afficher la qualité en privé"));
  assert.ok(words.includes("Afficher la qualité en public"));
  assert.ok(
    words.includes(
      "Par défaut, les deux galeries montrent la qualité de l’image, les médianes de la nuit et le guidage.",
    ),
  );
  // After the owner's choice: public on, private off.
  const chosen = zone({
    ...base,
    qualityShown: { private: false, public: true },
  });
  assert.deepEqual(
    [
      ...chosen.matchAll(
        /<input id="(capture-quality-(?:private|public)-cap-1)"[^>]*?aria-checked="(true|false)"/g,
      ),
    ].map((match) => [match[1], match[2] === "true"]),
    [
      ["capture-quality-private-cap-1", false],
      ["capture-quality-public-cap-1", true],
    ],
  );
  // No switch in the read-only window of an ended subscription.
  assert.doesNotMatch(zone(base, true), /role="switch"/);
  // No quality measured: no zone, no switch.
  assert.equal(
    zone({ id: "cap-2", quality: null, detail: {} }),
    "",
    "nothing to switch",
  );
  // The handler is the tab's action, with the audience and the value.
  const element = QualityShowControls({
    capture: base,
    meta,
    busy: false,
    readOnly: false,
    actions,
  });
  const [privateSwitch, publicSwitch] = element.props.children;
  privateSwitch.props.onChange(false);
  publicSwitch.props.onChange(true);
  assert.deepEqual(calls, [
    ["cap-1", "private", false],
    ["cap-1", "public", true],
  ]);
});
