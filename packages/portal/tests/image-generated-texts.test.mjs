// The texts a producer generates for an image (Astro Sync's name of the
// processing and its settings, the pipeline's description) travel in the ten
// languages, kept apart from the owner's own title and description: a reader
// sees the owner's text, else the generated one in its language, else
// English, else the name by default. The owner's edit never erases them:
// clearing his title gives the generated one back.
import assert from "node:assert/strict";
import test from "node:test";
import {
  generatedTextFor,
  generatedTextProblem,
  imageDescriptionText,
} from "../dist/captures/image-texts.js";
import { imageName, shownImages } from "../dist/captures/image-names.js";
import {
  SYNC,
  contractErrors,
  image,
  withMetadataSpace,
} from "./helpers/metadata-space.mjs";

const TITLE = {
  en: "Natural render · Contrast 3.6 · Colours +20%",
  fr: "Rendu naturel · Contraste 3,6 · Couleurs +20 %",
  de: "Natürliche Darstellung · Kontrast 3,6 · Farben +20 %",
  es: "Render natural · Contraste 3,6 · Colores +20 %",
  it: "Resa naturale · Contrasto 3,6 · Colori +20%",
  ja: "ナチュラルな仕上がり · コントラスト 3.6 · 色の強さ +20%",
  "pt-BR": "Renderização natural · Contraste 3,6 · Cores +20%",
  ru: "Естественный рендер · Контраст 3,6 · Цвета +20 %",
  "zh-Hans": "自然渲染 · 对比度 3.6 · 色彩 +20%",
  "zh-Hant": "自然渲染 · 對比度 3.6 · 色彩 +20%",
};
const DESCRIPTION = {
  en: "The sensor’s colours, stretched and cleaned up.",
  fr: "Les couleurs du capteur, étirées et nettoyées.",
  ja: "センサーが捉えた色のまま。",
};

test("the generated text a reader reads: its language by the registry's rule, else English", () => {
  assert.equal(generatedTextFor(TITLE, "fr"), TITLE.fr);
  assert.equal(generatedTextFor(TITLE, "fr-CA"), TITLE.fr);
  assert.equal(generatedTextFor(TITLE, "pt"), TITLE["pt-BR"]);
  assert.equal(generatedTextFor(TITLE, "zh-TW"), TITLE["zh-Hant"]);
  assert.equal(generatedTextFor(TITLE, "zh"), TITLE["zh-Hans"]);
  assert.equal(generatedTextFor(TITLE, "ko"), TITLE.en);
  assert.equal(generatedTextFor(DESCRIPTION, "de"), DESCRIPTION.en);
  assert.equal(generatedTextFor(null, "fr"), null);

  const variant = { main: false, arrivalRank: 3, generatedTitle: TITLE };
  assert.equal(imageName(variant, "ja"), TITLE.ja);
  assert.equal(
    imageName({ ...variant, title: "  Mon choix " }, "ja"),
    "Mon choix",
  );
  assert.equal(
    imageName({ ...variant, generatedTitle: null }, "fr"),
    "Variante 3",
  );
  assert.equal(
    imageDescriptionText({ generatedDescription: DESCRIPTION }, "ja"),
    DESCRIPTION.ja,
  );
  assert.equal(
    imageDescriptionText(
      { description: "La mienne.", generatedDescription: DESCRIPTION },
      "ja",
    ),
    "La mienne.",
  );
  const { images } = shownImages(
    {
      mainImage: {
        id: "main",
        title: null,
        description: null,
        generatedTitle: TITLE,
        generatedDescription: DESCRIPTION,
        arrivalRank: 1,
      },
      variants: [{ id: "v2", title: null, arrivalRank: 2 }],
    },
    "en",
  );
  assert.deepEqual(
    images.map((shown) => [shown.name, shown.description]),
    [
      [TITLE.en, DESCRIPTION.en],
      ["Variant 2", null],
    ],
  );

  assert.equal(generatedTextProblem(TITLE, 90), null);
  assert.equal(generatedTextProblem({ fr: "Rendu" }, 90), "english_missing");
  assert.equal(
    generatedTextProblem({ en: "Render", ko: "렌더" }, 90),
    "unknown_locale",
  );
  assert.equal(generatedTextProblem({ en: "r".repeat(91) }, 90), "too_long");
  assert.equal(generatedTextProblem({ en: "" }, 90), "not_text");
  assert.equal(generatedTextProblem(["en"], 90), "not_object");
});

test("Astro Sync's generated texts at the upload: kept apart, the owner's title stays null, his own title wins and clearing it gives them back", async () => {
  await withMetadataSpace(async ({ owner, space, send }) => {
    const { tenantId, userId } = space;
    const sent = await send(
      image("generated-main"),
      {
        sessionId: space.sessionId,
        targetIds: ["m31"],
        source: "stacking",
        variantGeneratedTitle: TITLE,
        variantGeneratedDescription: DESCRIPTION,
      },
      SYNC,
    );
    assert.equal(sent.status, 201);
    const captureId = sent.body.capture.id;
    let [main] = (await owner.get({ tenantId, captureId })).variants;
    assert.equal(main.title, null);
    assert.equal(main.description, null);
    assert.equal(main.titleSource, null);
    assert.deepEqual(main.generatedTitle, TITLE);
    assert.deepEqual(main.generatedDescription, DESCRIPTION);
    assert.deepEqual(
      await contractErrors("capture-variant.schema.json", "variant", main),
      [],
    );

    await owner.setVariantText({
      tenantId,
      userId,
      captureId,
      imageId: main.id,
      texts: { title: "Mon Andromède", description: null },
    });
    [main] = (await owner.get({ tenantId, captureId })).variants;
    assert.equal(main.title, "Mon Andromède");
    assert.deepEqual(main.generatedTitle, TITLE, "the owner's edit keeps them");
    assert.equal(imageName(main, "en"), "Mon Andromède");

    // A later proposal replaces the generated texts whatever the owner
    // wrote, and leaves his title.
    const renamed = { ...TITLE, en: "Natural render · Contrast 2.0" };
    const proposed = await owner.proposeVariantText({
      tenantId,
      userId,
      captureId,
      imageId: main.id,
      source: "astro-sync",
      generatedTitle: renamed,
    });
    assert.deepEqual(proposed.skipped, []);
    [main] = proposed.capture.variants;
    assert.equal(main.title, "Mon Andromède");
    assert.equal(main.generatedTitle.en, "Natural render · Contrast 2.0");

    await owner.setVariantText({
      tenantId,
      userId,
      captureId,
      imageId: main.id,
      field: "title",
      value: "  ",
    });
    [main] = (await owner.get({ tenantId, captureId })).variants;
    assert.equal(main.title, null);
    assert.equal(imageName(main, "en"), "Natural render · Contrast 2.0");
    assert.equal(imageName(main, "fr"), TITLE.fr);

    await assert.rejects(
      send(
        image("generated-refused"),
        { captureId, variantGeneratedTitle: { fr: "Rendu" } },
        SYNC,
      ),
      (error) =>
        error.code === "invalid_metadata" &&
        error.body.error.field === "variantGeneratedTitle",
    );
    await assert.rejects(
      owner.proposeVariantText({
        tenantId,
        userId,
        captureId,
        imageId: main.id,
        source: "astro-sync",
        generatedDescription: { en: "d".repeat(281) },
      }),
      (error) => error.code === "invalid_metadata",
    );
  });
});

test("the generated texts of an image Astro Sync named before replace its one-language title and description; the owner's are never cleared", async () => {
  await withMetadataSpace(async ({ owner, space, send }) => {
    const { tenantId, userId } = space;
    const captureId = (
      await send(
        image("legacy-main"),
        {
          sessionId: space.sessionId,
          targetIds: ["m31"],
          variantTitle: "Rendu naturel · Contraste 3,6 · Couleurs +20 %",
          variantDescription: "Les couleurs du capteur.",
        },
        SYNC,
      )
    ).body.capture.id;
    await send(
      image("legacy-variant"),
      { captureId, variantTitle: "Palette HOO" },
      SYNC,
    );
    let read = await owner.get({ tenantId, captureId });
    const main = read.variants.find((variant) => variant.main);
    const variantId = read.variants.find((variant) => !variant.main).id;
    assert.equal(main.titleSource, "astro-sync");
    await owner.setVariantText({
      tenantId,
      userId,
      captureId,
      imageId: variantId,
      texts: { title: "Ma palette", description: "Écrite par moi." },
    });

    for (const imageId of [main.id, variantId])
      await owner.proposeVariantText({
        tenantId,
        userId,
        captureId,
        imageId,
        source: "astro-sync",
        generatedTitle: TITLE,
        generatedDescription: DESCRIPTION,
      });
    read = await owner.get({ tenantId, captureId });
    const after = new Map(
      read.variants.map((variant) => [variant.id, variant]),
    );
    assert.deepEqual(
      [
        after.get(main.id).title,
        after.get(main.id).titleSource,
        after.get(main.id).description,
      ],
      [null, null, null],
    );
    assert.deepEqual(after.get(main.id).generatedTitle, TITLE);
    assert.deepEqual(
      [after.get(variantId).title, after.get(variantId).description],
      ["Ma palette", "Écrite par moi."],
    );
    assert.deepEqual(after.get(variantId).generatedTitle, TITLE);
    assert.equal(imageName(after.get(variantId), "fr"), "Ma palette");
  });
});

test("a visitor's gallery carries the generated texts of the images shown, in the contract", async () => {
  await withMetadataSpace(async ({ owner, store, space, send, gallery }) => {
    const { tenantId, userId } = space;
    const captureId = (
      await send(
        image("gallery-generated"),
        {
          sessionId: space.sessionId,
          targetIds: ["m31"],
          variantGeneratedTitle: TITLE,
          variantGeneratedDescription: DESCRIPTION,
        },
        SYNC,
      )
    ).body.capture.id;
    await owner.update({
      tenantId,
      userId,
      captureId,
      changes: { stage: "finalized" },
    });
    await store.recordAutomaticCheck(tenantId, captureId, {
      result: "sky",
      reason: null,
      at: "2026-10-06T22:00:00.000Z",
    });
    await owner.update({
      tenantId,
      userId,
      captureId,
      changes: { visibility: "public" },
    });
    const page = await gallery.get({ captureId, locale: "ja" });
    assert.equal(page.mainImage.title, null);
    assert.deepEqual(page.mainImage.generatedTitle, TITLE);
    assert.deepEqual(page.mainImage.generatedDescription, DESCRIPTION);
    assert.equal(shownImages(page, "ja").images[0].name, TITLE.ja);
    assert.deepEqual(
      await contractErrors("gallery.schema.json", "capture", page),
      [],
    );
  });
});
