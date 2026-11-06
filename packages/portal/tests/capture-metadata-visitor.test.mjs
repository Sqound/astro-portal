// What a visitor reads of a
// capture's metadata — on the public page and on the private gallery's
// capture page: the title and the description, the acquisition, the
// calibration, the sensor, the processing, the filters and the Moon, and
// never the place, the notes, an origin, `edited`, `finalizedAt`, the file
// name or the fingerprint; a draft is in no gallery.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { createPrivateGalleryService } from "../dist/private-gallery/private-gallery.js";
import { privateCaptureAsPublic } from "../dist/private-gallery/public-shape.js";
import {
  PHONE,
  SYNC,
  image,
  withMetadataSpace,
} from "./helpers/metadata-space.mjs";

await registerJsx();
const { PublicCapturePage } =
  await import("portal/components/detail/PublicCapturePage.js");
const { privateCapturePageProps } =
  await import("portal/components/gallery/PrivateGallery.js");

const NEVER = [
  "Col des Étoiles",
  "Rosée",
  "fieldOrigins",
  '"source"',
  '"edited"',
  "finalizedAt",
  "M31_final.jpg",
  "latitude",
  "editedAt",
];

async function publicM31({ owner, store, space, send }) {
  const { tenantId, userId } = space;
  const sent = await send(
    image("visitor-m31"),
    {
      sessionId: space.sessionId,
      targetIds: ["m31"],
      calibration: "30 darks · 30 flats · 30 dark-flats",
      sensor: { temperatureC: -10, binning: 1 },
      processing: { software: "Siril 1.4.4 · Adobe Photoshop" },
      acquisition: [
        {
          filter: "Dual-band",
          frameCount: 38,
          exposureSeconds: 180,
          gain: 100,
        },
        { filter: null, frameCount: 20, exposureSeconds: 120, gain: 100 },
      ],
    },
    SYNC,
  );
  const captureId = sent.body.capture.id;
  const write = (metadata) =>
    owner.updateMetadata({ tenantId, userId, captureId, metadata });
  await write({
    description:
      "Première nuit d’automne au col : M31 haute dès 22 h, un léger voile vers 1 h.",
  });
  await write({ notes: "Rosée sur la lunette vers 2 h." });
  await write({
    "processing.steps":
      "Calibration, alignement, empilement, étirement, réduction du bruit",
  });
  await write({ "equipment.filterIds": [space.equipment.filter] });
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
  return captureId;
}

test("the public gallery's JSON carries the metadata a visitor reads, in the contract, and never the place, the notes nor an origin", async () => {
  await withMetadataSpace(async (context) => {
    const captureId = await publicM31(context);
    const page = await context.gallery.get({ captureId, locale: "fr" });
    const { metadata } = page;
    assert.equal(
      metadata.description,
      "Première nuit d’automne au col : M31 haute dès 22 h, un léger voile vers 1 h.",
    );
    assert.deepEqual(
      metadata.acquisition.map((line) => [
        line.filter,
        line.integrationSeconds,
      ]),
      [
        ["Dual-band", 6840],
        [null, 2400],
      ],
    );
    assert.equal(metadata.totalIntegrationSeconds, 9240);
    assert.equal(metadata.calibration, "30 darks · 30 flats · 30 dark-flats");
    assert.deepEqual(metadata.sensor, { temperatureC: -10, binning: 1 });
    assert.deepEqual(metadata.processing, {
      software: "Siril 1.4.4 · Adobe Photoshop",
      steps:
        "Calibration, alignement, empilement, étirement, réduction du bruit",
    });
    assert.deepEqual(metadata.filters, ["Dual-band"]);
    assert.equal(typeof metadata.moonIllumination, "number");
    // `skyQuality.source` (the model, measured, entered) is the page's own.
    const text = JSON.stringify({ ...page, skyQuality: null });
    for (const word of NEVER)
      assert.ok(!text.includes(word), `${word} never published`);
    const { schemaErrors, registerExternalSchema } =
      await import("../../astro-contracts/tests/schema-assert.mjs");
    const { readFile } = await import("node:fs/promises");
    const read = async (name) =>
      JSON.parse(
        await readFile(
          new URL(`../../astro-contracts/schemas/api/${name}`, import.meta.url),
          "utf8",
        ),
      );
    registerExternalSchema(
      "sky-solution.schema.json",
      await read("sky-solution.schema.json"),
    );
    const gallerySchema = await read("gallery.schema.json");
    assert.deepEqual(
      schemaErrors({ ...gallerySchema, $ref: "#/$defs/capture" }, page),
      [],
    );
  });
});

test("the private gallery's capture page carries the same metadata, never the place nor the notes; a draft is in no gallery", async () => {
  await withMetadataSpace(async (context) => {
    const { driver, space, send, gallery } = context;
    const captureId = await publicM31(context);
    const privateGallery = await createPrivateGalleryService({ driver });
    const { address } = await privateGallery.settings({
      tenantId: space.tenantId,
      userId: space.userId,
      origin: "",
    });
    const token = address.split("/p/")[1];
    await privateGallery.update({
      tenantId: space.tenantId,
      userId: space.userId,
      changes: { mode: "link", confirmVerifiers: true },
      origin: "",
    });
    const seen = await privateGallery.capture({
      token,
      captureId,
      locale: "fr",
    });
    // The page is the public one, so the view says what the public gallery
    // says of the same capture, field by field (the files differ: they go
    // through the gallery's gate).
    const published = await gallery.get({ captureId, locale: "fr" });
    const adapted = privateCaptureAsPublic({ token, view: seen.view });
    for (const field of [
      "id",
      "targets",
      "equipment",
      "nightMonth",
      "signature",
      "mainImage",
      "variants",
      "metadata",
    ])
      assert.deepEqual(adapted[field], published[field], field);
    assert.equal(adapted.targets[0].aliases[0], "NGC 224");
    assert.deepEqual(
      adapted.equipment.map((item) => item.kind),
      ["telescope", "camera", "mount"],
    );
    assert.equal(adapted.skyQuality.bortle, published.skyQuality.bortle);
    // No thumbnail made for this fake file: the page draws its placeholder.
    assert.equal(adapted.media.image, null);
    const { metadata } = seen.view.capture;
    assert.equal(metadata.calibration, "30 darks · 30 flats · 30 dark-flats");
    assert.equal(metadata.acquisition.length, 2);
    const text = JSON.stringify(metadata);
    for (const word of NEVER)
      assert.ok(!text.includes(word), `${word} never in the private gallery`);
    // A draft with metadata is in no gallery.
    const draft = await send(
      image("visitor-draft"),
      { targetIds: ["m31"], calibration: "10 darks", metadataSource: "import" },
      PHONE,
    );
    assert.equal(draft.body.capture.stage, "draft");
    assert.equal(await gallery.get({ captureId: draft.body.capture.id }), null);
    const hidden = await privateGallery.capture({
      token,
      captureId: draft.body.capture.id,
    });
    assert.equal(hidden.access.outcome, "not_found");
  });
});

const visitorMetadata = {
  title: null,
  description:
    "Première nuit d’automne au col : M31 haute dès 22 h, un léger voile vers 1 h.",
  acquisition: [
    {
      filter: "Dual-band",
      frameCount: 38,
      exposureSeconds: 180,
      gain: 100,
      integrationSeconds: 6840,
    },
    {
      filter: null,
      frameCount: 20,
      exposureSeconds: 120,
      gain: 100,
      integrationSeconds: 2400,
    },
  ],
  totalIntegrationSeconds: 9240,
  calibration: "30 darks · 30 flats · 30 dark-flats",
  sensor: { temperatureC: -10, binning: 1 },
  processing: {
    software: "Siril 1.4.4 · Adobe Photoshop",
    steps: "Calibration, alignement, empilement, étirement, réduction du bruit",
  },
  filters: ["Dual-band"],
  moonIllumination: 12,
};
const plain = (markup) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/[  ]/g, " ")
    .replace(/\s+/g, " ");

test("state 7: the public page reads the description under the author, the acquisition per filter and its total, the calibration, the sensor, the month, the Moon, the filter and « Traitement »; no empty exposure slot", () => {
  const capture = {
    id: "00000000-0000-4000-8000-000000000031",
    targets: [
      {
        id: "m31",
        designation: "M31",
        name: "Galaxie d’Andromède",
        aliases: ["NGC 224"],
        type: "Galaxie",
        constellation: "Andromède",
        ra: 0.712,
        dec: 41.27,
      },
    ],
    tag: "Galaxie",
    tags: ["Galaxie", "Messier"],
    telescope: "Askar 50P",
    exposure: null,
    nightMonth: "2026-10",
    signature: "Camille",
    media: { image: "/m", thumbnail: "/t" },
    equipment: [
      { kind: "telescope", name: "Askar 50P" },
      { kind: "camera", name: "ZWO ASI533MC Pro" },
      { kind: "mount", name: "ZWO AM5N" },
    ],
    skyQuality: { bortle: 4, source: "model" },
    image: { width: 4000, height: 2670 },
    variants: [],
    metadata: visitorMetadata,
  };
  const markup = renderToStaticMarkup(
    createElement(PublicCapturePage, { capture, locale: "fr" }),
  );
  const text = plain(markup);
  for (const sentence of [
    "M31 — Galaxie d’Andromède Camille Première nuit d’automne au col : M31 haute dès 22 h, un léger voile vers 1 h.",
    "Acquisition Filtre Poses Intégration Dual-band 38 × 180 s 1 h 54 Sans filtre 20 × 120 s 40 min Total 2 h 34",
    "Calibration 30 darks · 30 flats · 30 dark-flats",
    "Capteur −10 °C · binning 1 × 1",
    "Mois de la nuit Octobre 2026",
    "Lune Illuminée à 12 %",
    "Filtre Dual-band",
    "Traitement Logiciels Siril 1.4.4 · Adobe Photoshop Étapes Calibration, alignement, empilement, étirement, réduction du bruit",
  ])
    assert.ok(
      text.includes(sentence),
      `« ${sentence} » missing from ${text.slice(0, 1500)}`,
    );
  assert.doesNotMatch(markup, /class="subtitle"/);
  for (const word of ["Col des Étoiles", "modifié", "Saisi"])
    assert.ok(!text.includes(word), word);
});

test("the private gallery's capture page draws the same metadata, with the public page's words", () => {
  const markup = renderToStaticMarkup(
    createElement(
      PublicCapturePage,
      privateCapturePageProps({
        locale: "fr",
        token: "token",
        view: {
          portalName: "Ciel de Camille",
          publicName: "Camille",
          canReport: false,
          capture: {
            id: "c1",
            targets: [
              {
                id: "m31",
                designation: "M31",
                name: "Galaxie d’Andromède",
                aliases: [],
              },
            ],
            nightMonth: "2026-10",
            addedAt: null,
            fileName: "M31_final.jpg",
            byteSize: 1,
            equipment: [{ kind: "telescope", name: "Askar 50P" }],
            skyQuality: { bortle: 4 },
            thumbnail: true,
            mainImage: {
              id: "main",
              title: null,
              description: null,
              arrivalRank: 1,
            },
            variants: [],
            metadata: visitorMetadata,
          },
        },
      }),
    ),
  );
  const text = plain(markup);
  for (const sentence of [
    "Première nuit d’automne au col",
    "Dual-band 38 × 180 s 1 h 54",
    "Total 2 h 34",
    "Calibration 30 darks · 30 flats · 30 dark-flats",
    "Capteur −10 °C · binning 1 × 1",
    "Mois de la nuit Octobre 2026",
    "Lune Illuminée à 12 %",
    "Filtre Dual-band",
    "Traitement Logiciels Siril 1.4.4 · Adobe Photoshop",
  ])
    assert.ok(
      text.includes(sentence),
      `« ${sentence} » missing from ${text.slice(0, 1200)}`,
    );
  assert.ok(!text.includes("M31_final.jpg"));
});
