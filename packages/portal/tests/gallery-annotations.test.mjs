// The galleries' viewer button « Afficher les annotations du
// ciel » — drawn only for an image whose view carries `skySolution` (the
// service writes it only while the image has a sky solution and the owner's
// switch is on), with no word of a solution, a plate solving or Astro Sync
// for a visitor — on the public page and on the private gallery's page; and
// the private gallery's own route of the annotations, behind its gate.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { createCaptureSkySolutionService } from "../dist/captures/capture-sky-solutions.js";
import { createPublicGalleryService } from "../dist/captures/public-gallery.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { createPrivateGalleryService } from "../dist/private-gallery/private-gallery.js";
import { capturePathFor } from "../dist/uploads/capture-storage.js";

await registerJsx();
const { PublicCapturePage } =
  await import("portal/components/detail/PublicCapturePage.js");
const { privateCapturePageProps } =
  await import("portal/components/gallery/PrivateGallery.js");
const { shownImages } = await import("portal/captures/image-names.js");
const { messages, message } = await import("portal/i18n.js");
const { annotationTarget, MagnitudeSelect } =
  await import("portal/components/plate-solving/SkyAnnotationControls.js");

const plain = (text) => String(text).replace(/[  ]/g, " ");
const textOf = (markup) =>
  plain(
    markup
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/\s+/g, " "),
  );
// What a visitor must never read (the management's and Astro Sync's words).
const MANAGEMENT_WORDS =
  /plate solving|solution de ciel|Astro Sync|sky solution|Résoudre/i;

const PUBLIC_ANNOTATIONS = "/api/v1/gallery/c1/annotations";
const skySolution = (annotations) => ({
  raDeg: 10.68,
  decDeg: 41.27,
  pixelScaleArcsec: 1.9,
  rotationDeg: 0,
  fieldWidthDeg: 3.3,
  fieldHeightDeg: 2.2,
  parity: "normal",
  width: 4096,
  height: 2738,
  annotations,
});

function publicCapture(changes = {}) {
  return {
    id: "c1",
    media: { image: "/api/v1/gallery/c1/media", thumbnail: "/t" },
    image: { width: 4096, height: 2738 },
    nightMonth: "2026-10",
    signature: "Camille",
    targets: [
      {
        id: "m31",
        designation: "M31",
        aliases: ["NGC 224"],
        type: "Galaxie",
        constellation: "Andromède",
        ra: 0.712,
        dec: 41.27,
      },
    ],
    equipment: [],
    skyQuality: { bortle: 4 },
    mainImage: { id: "main", title: null, description: null, arrivalRank: 1 },
    variants: [],
    ...changes,
  };
}
const page = (capture) =>
  renderToStaticMarkup(
    createElement(PublicCapturePage, {
      capture,
      noTarget: "Capture sans cible",
      locale: "fr",
    }),
  );

test("the public page: the viewer's round button « Afficher les annotations du ciel » only when the view carries skySolution", () => {
  const without = page(publicCapture());
  assert.doesNotMatch(without, /class="plate-solve/);
  assert.doesNotMatch(without, /Afficher les annotations du ciel/);
  const withSolution = page(
    publicCapture({ skySolution: skySolution(PUBLIC_ANNOTATIONS) }),
  );
  assert.match(
    withSolution,
    /<button type="button" class="plate-solve " aria-label="Afficher les annotations du ciel" aria-describedby="[^"]+" title="Afficher les annotations du ciel">/,
  );
  // In its slot: after « ✕ », before the viewfinder of Stellarium Web.
  assert.ok(
    withSolution.indexOf('class="close"') <
      withSolution.indexOf('class="plate-solve'),
  );
  assert.ok(
    withSolution.indexOf('class="plate-solve') <
      withSolution.indexOf('class="stellarium-link"'),
  );
  // Off at first: no overlay, no selector.
  assert.doesNotMatch(withSolution, /plate-annotations|plate-magnitude/);
  assert.doesNotMatch(withSolution, /is-plate-solving/);
});

test("a visitor never reads a management word: no solution, plate solving, Astro Sync or « Résoudre », with or without annotations", () => {
  for (const capture of [
    publicCapture(),
    publicCapture({ skySolution: skySolution(PUBLIC_ANNOTATIONS) }),
  ]) {
    const markup = page(capture);
    assert.doesNotMatch(textOf(markup), MANAGEMENT_WORDS);
    assert.doesNotMatch(markup, /aria-label="[^"]*(plate solving|solution)/i);
  }
});

test("the image shown decides: a variant's own solution, and a variant without one hides nothing of the main image's", () => {
  const variants = [
    {
      id: "crop",
      title: "Recadrée",
      description: null,
      arrivalRank: 2,
      media: { image: "/m?imageId=crop", thumbnail: "/t" },
      image: { width: 2000, height: 1337 },
      skySolution: skySolution(`${PUBLIC_ANNOTATIONS}?imageId=crop`),
    },
    {
      id: "plain",
      title: null,
      description: null,
      arrivalRank: 3,
      media: { image: "/m?imageId=plain", thumbnail: "/t" },
      image: { width: 2000, height: 1337 },
    },
  ];
  const capture = publicCapture({
    variants,
    skySolution: skySolution(PUBLIC_ANNOTATIONS),
  });
  const { images, several } = shownImages(capture, "fr");
  assert.equal(several, true);
  assert.deepEqual(
    images.map((image) => [image.id, image.skySolution?.annotations ?? null]),
    [
      ["main", PUBLIC_ANNOTATIONS],
      ["crop", `${PUBLIC_ANNOTATIONS}?imageId=crop`],
      ["plain", null],
    ],
  );
  // The main image shown first carries the button even with variants.
  assert.match(page(capture), /class="plate-solve/);
  // No solution on the main image: none for it, whatever a variant has.
  const variantOnly = publicCapture({ variants });
  assert.equal(shownImages(variantOnly, "fr").images[0].skySolution, null);
  assert.doesNotMatch(page(variantOnly), /class="plate-solve/);
});

test("the overlay finds the capture's own target by its designations", () => {
  assert.deepEqual(annotationTarget(publicCapture(), "M31"), {
    title: "M31",
    objects: ["M31", "NGC 224"],
    localizedAliases: [],
  });
  assert.deepEqual(annotationTarget({ targets: [] }, "Sans cible").objects, []);
});

test("the button's title is « Afficher les annotations du ciel », in the ten catalogues; the old key and its words are gone", () => {
  assert.equal(
    message("fr", "toggleSkyAnnotations"),
    "Afficher les annotations du ciel",
  );
  assert.equal(message("en", "toggleSkyAnnotations"), "Show sky annotations");
  const english = messages.en.toggleSkyAnnotations;
  for (const [locale, catalogue] of Object.entries(messages)) {
    assert.equal(typeof catalogue.toggleSkyAnnotations, "string", locale);
    assert.ok(catalogue.toggleSkyAnnotations.length > 4, locale);
    assert.equal("togglePlateSolving" in catalogue, false, locale);
    if (locale !== "en")
      assert.notEqual(catalogue.toggleSkyAnnotations, english, locale);
    // A visitor's word is never the management's.
    assert.doesNotMatch(
      catalogue.toggleSkyAnnotations,
      /plate solving|Plate Solving|プレートソルビング|星图解算|星場解析|плейт/i,
      locale,
    );
  }
  assert.equal(Object.keys(messages).length, 10);
});

// ——— The private gallery ———

const at = "2026-10-07T09:41:00.000Z";
const PRIVATE_ANNOTATIONS = "/api/v1/portals/tok/annotations/c1";
const privateView = (capture) =>
  renderToStaticMarkup(
    createElement(
      PublicCapturePage,
      privateCapturePageProps({
        locale: "fr",
        token: "tok",
        view: {
          portalName: "Galerie de Camille",
          publicName: "Camille",
          canReport: false,
          capture: {
            id: "c1",
            thumbnail: true,
            targets: [{ id: "m31", designation: "M31", aliases: [] }],
            equipment: [],
            nightMonth: "2026-10",
            skyQuality: null,
            mainImage: {
              id: "main",
              title: null,
              description: null,
              arrivalRank: 1,
            },
            variants: [],
            ...capture,
          },
        },
      }),
    ),
  );

test("the private gallery's page is the public page: the same button on the image, only with skySolution; the page of before without", () => {
  const without = privateView({});
  assert.doesNotMatch(without, /plate-solve/);
  assert.match(without, /<main id="viewer" data-public-capture="">/);
  assert.match(without, /<img src="\/api\/v1\/portals\/tok\/media\/c1"/);
  const withSolution = privateView({
    skySolution: skySolution(PRIVATE_ANNOTATIONS),
  });
  assert.match(
    withSolution,
    /<button type="button" class="plate-solve " aria-label="Afficher les annotations du ciel" aria-describedby="[^"]+" title="Afficher les annotations du ciel">/,
  );
  assert.match(withSolution, /<img src="\/api\/v1\/portals\/tok\/media\/c1"/);
  assert.doesNotMatch(textOf(withSolution), MANAGEMENT_WORDS);
  assert.doesNotMatch(textOf(without), MANAGEMENT_WORDS);
});

async function withGallery(fn, { stars } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "astro-gallery-annotations-"));
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
  const skies = await createCaptureSkySolutionService({
    driver,
    now: () => at,
    imageSize: async () => ({ width: 4096, height: 2738 }),
    ...(stars ? { stars } : {}),
    ...files,
  });
  try {
    await fn({ driver, gallery, privateGallery, skies });
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
  const main = digest("");
  const shown = digest("-shown");
  const hidden = digest("-hidden");
  await driver.run(
    "INSERT INTO captures (id, tenant_id, original_name, sha256, byte_size, status, stage, visibility, created_at) VALUES (?, ?, ?, ?, ?, 'uploaded', 'finalized', 'private', ?)",
    [captureId, tenantId, "M31_final.jpg", main, 100, at],
  );
  for (const [id, sha256, isMain, isPublic] of [
    [captureId, main, 1, 0],
    [`${captureId}-shown`, shown, 0, 1],
    [`${captureId}-hidden`, hidden, 0, 0],
  ])
    await driver.run(
      "INSERT INTO capture_variants (id, capture_id, tenant_id, sha256, byte_size, original_name, width, height, source, is_main, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'astro-sync', ?, ?, ?)",
      [
        id,
        captureId,
        tenantId,
        sha256,
        100,
        `${id}.jpg`,
        4096,
        2738,
        isMain,
        isPublic,
        at,
      ],
    );
  return { tenantId, userId, captureId, main, shown, hidden };
}

const solution = {
  schemaVersion: 1,
  source: "astap",
  solverVersion: "ASTAP 2026.10",
  raDeg: 10.6847,
  decDeg: 41.2688,
  pixelScaleArcsec: 2.06,
  rotationDeg: 0,
  fieldWidthDeg: 3.575,
  fieldHeightDeg: 2.39,
  parity: "normal",
  width: 4096,
  height: 2738,
  solvedAt: "2026-10-07T22:10:00Z",
};

test("the private gallery service: solutions in the view under the switch, the annotations behind the gate, a private capture reachable there and not in the public gallery", async () => {
  await withGallery(async ({ driver, gallery, privateGallery, skies }) => {
    const space = await seed(driver);
    const ids = { tenantId: space.tenantId, captureId: space.captureId };
    const owner = { tenantId: space.tenantId, userId: space.userId };
    await privateGallery.settings({ ...owner, origin: "https://p.test" });
    const set = await privateGallery.update({
      ...owner,
      changes: { mode: "link", confirmVerifiers: true },
      origin: "https://p.test",
    });
    const token = new URL(set.address).pathname.split("/").pop();
    const stranger = { tenantId: randomUUID(), userId: randomUUID() };

    const view = async (viewer = null) =>
      (
        await privateGallery.capture({
          token,
          captureId: space.captureId,
          viewer,
        })
      ).view?.capture;
    // No solution: the page of before.
    assert.equal("skySolution" in (await view()), false);

    await skies.put({
      ...ids,
      body: { sha256: space.main, solution },
    });
    await skies.put({
      ...ids,
      body: { sha256: space.shown, solution },
    });
    await skies.put({
      ...ids,
      body: { sha256: space.hidden, solution },
    });
    const one = await view();
    assert.equal(
      one.skySolution.annotations,
      `/api/v1/portals/${token}/annotations/${space.captureId}`,
    );
    assert.equal(one.skySolution.width, 4096);
    assert.equal("sha256" in one.skySolution, false, "no digest for a visitor");
    assert.equal("solverVersion" in one.skySolution, false);
    assert.equal(one.variants.length, 0, "a private capture shows no variant");

    // The annotations: behind the gate, for the main image.
    const main = await privateGallery.shownImage({
      token,
      captureId: space.captureId,
    });
    assert.equal(main.image.id, space.captureId);
    const annotated = await skies.privateGalleryAnnotations({
      ...main,
      magnitude: null,
    });
    assert.deepEqual(annotated.image, { width: 4096, height: 2738 });
    assert.ok(Array.isArray(annotated.annotations));
    // The public gallery's route is no way in for a private capture.
    assert.equal(
      await skies.galleryAnnotations({ captureId: space.captureId }),
      null,
    );

    // A variant the owner kept private is not shown: no image, no annotations.
    assert.equal(
      await privateGallery.shownImage({
        token,
        captureId: space.captureId,
        imageId: `${space.captureId}-hidden`,
      }),
      null,
    );
    // The gate: an unknown address, a stranger on a gallery shared with
    // nobody, an unknown capture.
    assert.equal(
      await privateGallery.shownImage({
        token: "x".repeat(24),
        captureId: space.captureId,
      }),
      null,
    );
    assert.equal(
      await privateGallery.shownImage({ token, captureId: randomUUID() }),
      null,
    );
    await privateGallery.update({
      ...owner,
      changes: { mode: "none" },
      origin: "https://p.test",
    });
    assert.equal(
      await privateGallery.shownImage({
        token,
        captureId: space.captureId,
        viewer: stranger,
      }),
      null,
    );
    assert.ok(
      await privateGallery.shownImage({
        token,
        captureId: space.captureId,
        viewer: owner,
      }),
      "the owner always passes the gate",
    );
    await privateGallery.update({
      ...owner,
      changes: { mode: "link", confirmVerifiers: true },
      origin: "https://p.test",
    });

    // A capture the owner makes public: its variant shown has its own entry.
    await driver.run("UPDATE captures SET visibility = 'public' WHERE id = ?", [
      space.captureId,
    ]);
    const shown = await view();
    assert.deepEqual(
      shown.variants.map((variant) => [
        variant.id,
        variant.skySolution?.annotations,
      ]),
      [
        [
          `${space.captureId}-shown`,
          `/api/v1/portals/${token}/annotations/${space.captureId}?imageId=${space.captureId}-shown`,
        ],
      ],
    );
    const variantShown = await privateGallery.shownImage({
      token,
      captureId: space.captureId,
      imageId: `${space.captureId}-shown`,
    });
    assert.ok(
      await skies.privateGalleryAnnotations({ ...variantShown, magnitude: 5 }),
    );

    // The owner's switch off: no solution in the view, no annotations.
    await driver.run("UPDATE captures SET sky_annotations = 0 WHERE id = ?", [
      space.captureId,
    ]);
    const off = await view();
    assert.equal("skySolution" in off, false);
    assert.equal(
      off.variants.some((variant) => "skySolution" in variant),
      false,
    );
    assert.equal(
      await skies.privateGalleryAnnotations({ ...main, magnitude: null }),
      null,
    );
    assert.ok(gallery, "the public gallery is built beside");
  });
});

// The stars of the annotations: the catalogue the server has, or has not, and
// the batch of each threshold of the selector.
const M31 = { raDeg: 10.6847, decDeg: 41.2688 };

/** A synthetic catalogue over the field of `solution`, magnitudes 1 to 14. */
function syntheticStars(count) {
  let state = 987654321;
  const next = () =>
    (state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296;
  return Array.from({ length: count }, (_, index) => {
    const vmag = 1 + (13 * index) / count;
    return {
      raDeg: M31.raDeg + (next() - 0.5) * 3.2,
      decDeg: M31.decDeg + (next() - 0.5) * 2.1,
      vmag,
      named: index % 50 === 1,
      label:
        index % 50 === 1
          ? `Name ${index}`
          : index % 7 === 0
            ? ""
            : `HD ${100000 + index}`,
    };
  });
}

test("without the star catalogue: starsAvailable is false, the objects stay, the magnitude changes nothing", async () => {
  await withGallery(async ({ driver, skies }) => {
    const space = await seed(driver);
    const ids = { tenantId: space.tenantId, captureId: space.captureId };
    await skies.put({ ...ids, body: { sha256: space.main, solution } });
    for (const magnitude of [3.5, 10, 99, null]) {
      const found = await skies.ownerAnnotations({ ...ids, magnitude });
      assert.equal(found.starsAvailable, false);
      assert.ok(found.annotations.every((item) => item.type === "ngc"));
    }
  });
});

test("with the catalogue: starsAvailable is true and each threshold of the selector has its own batch, « all » beyond 10 mag", async () => {
  const catalogue = syntheticStars(6000);
  await withGallery(
    async ({ driver, skies }) => {
      const space = await seed(driver);
      const ids = { tenantId: space.tenantId, captureId: space.captureId };
      await skies.put({ ...ids, body: { sha256: space.main, solution } });
      const batch = async (magnitude) => {
        const found = await skies.ownerAnnotations({ ...ids, magnitude });
        assert.equal(found.starsAvailable, true);
        return found.annotations.filter((item) => item.type === "bright");
      };
      const counts = [];
      for (const magnitude of [3.5, 5.5, 8.5, 10, 99]) {
        const stars = await batch(magnitude);
        counts.push(stars.length);
        assert.ok(stars.every((item) => item.vmag <= magnitude));
        // Brightest first.
        assert.deepEqual(
          stars.map((item) => item.vmag),
          stars.map((item) => item.vmag).sort((left, right) => left - right),
        );
      }
      // A real selector: every threshold holds more than the one before, 10
      // holds a lot more than 400 stars, « all » goes past magnitude 10.
      assert.ok(
        counts.every((count, index) => !index || count > counts[index - 1]),
        String(counts),
      );
      assert.ok(counts[3] > 400, `${counts[3]} stars at 10`);
      assert.ok(counts[4] > counts[3]);
      const all = await batch(99);
      assert.ok(all.some((item) => item.vmag > 10));
      // The labels: a catalogue number alone is written to 8.5 and a point
      // beyond; a name is written wherever the star is.
      const labelled = (item) => item.names.length === 1;
      assert.ok(all.filter((item) => item.vmag <= 8.5).some(labelled));
      assert.ok(
        all
          .filter((item) => item.vmag > 8.5 && labelled(item))
          .every((item) => item.names[0].startsWith("Name ")),
        "a number alone is no label beyond 8.5",
      );
      assert.ok(
        all.some(
          (item) => item.vmag > 8.5 && item.names[0]?.startsWith("Name "),
        ),
      );
      assert.ok(all.some((item) => item.vmag > 8.5 && item.names.length === 0));
      // No magnitude asked: 10, what the phone gets.
      const asked = await batch(null);
      assert.equal(asked.length, counts[3]);
      // A magnitude given as text (the query string) is the same threshold.
      assert.equal((await batch("5.5")).length, counts[1]);
    },
    { stars: async () => catalogue },
  );
});

// The selector of the viewer: a real select while the server has its star
// catalogue, a sentence instead when it has not.
test("the magnitude selector offers the nine thresholds; without the star catalogue it says so in the ten languages instead of offering a selector that changes nothing", () => {
  const selector = (props) =>
    renderToStaticMarkup(
      createElement(MagnitudeSelect, {
        value: 5.5,
        onChange: () => {},
        ...props,
      }),
    );
  const available = selector({ locale: "fr" });
  assert.match(available, /^<select class="plate-magnitude"/);
  assert.equal(available.match(/<option /g).length, 9);
  assert.match(available, /Toutes les étoiles du catalogue/);
  assert.doesNotMatch(available, /indisponibles/);
  const said = new Map();
  for (const locale of [
    "en",
    "fr",
    "de",
    "es",
    "it",
    "pt-BR",
    "ru",
    "ja",
    "zh-Hans",
    "zh-Hant",
  ]) {
    const markup = selector({ locale, unavailable: true });
    assert.doesNotMatch(markup, /<select|<option/, locale);
    const sentence = message(locale, "starsUnavailable");
    assert.ok(sentence && sentence !== "starsUnavailable", locale);
    assert.ok(markup.includes(plain(sentence).replace(/'/g, "&#x27;")), locale);
    assert.match(markup, /class="plate-magnitude is-unavailable"/);
    said.set(locale, sentence);
  }
  assert.equal(said.get("fr"), "Étoiles indisponibles sur ce serveur");
  assert.equal(said.get("en"), "Stars unavailable on this server");
  assert.equal(new Set(said.values()).size, 10, "ten different sentences");
});
