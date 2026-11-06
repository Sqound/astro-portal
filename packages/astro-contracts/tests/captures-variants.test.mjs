// The contract of the captures' images
// (main and alternative), the personal targets, the check before an upload
// and the storage of a space, and the fourteen capability keys unchanged
// (the stacking follows `analysis.progression`, no new key).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertInvalid,
  assertValid,
  registerExternalSchema,
} from "./schema-assert.mjs";
import { CAPABILITY_NAMES } from "../dist/capabilities.js";

const read = async (name) =>
  JSON.parse(
    await readFile(new URL(`../schemas/api/${name}`, import.meta.url), "utf8"),
  );

async function at(file, pointer) {
  for (const name of [
    "capture.schema.json",
    "capture-variant.schema.json",
    "capabilities.schema.json",
  ])
    registerExternalSchema(name, await read(name));
  const document = await read(file);
  return pointer
    ? { ...document, $ref: `#/$defs/${pointer}`, oneOf: undefined }
    : document;
}

const sha = (letter) => letter.repeat(64);
const variant = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  main: false,
  sha256: sha("b"),
  byteSize: 412_000_000,
  originalName: "IMG_2041.tif",
  width: 6248,
  height: 4176,
  source: "stacking",
  public: false,
  automaticCheck: null,
  createdAt: "2026-10-07T09:41:00.000Z",
};

test("capture-variant.schema.json: an image, its two gestures, its refusals", async () => {
  const image = await at("capture-variant.schema.json", "variant");
  assertValid(image, variant);
  assertValid(image, { ...variant, main: true, source: null });
  assertInvalid(image, { ...variant, source: "camera" });
  assertInvalid(image, { ...variant, number: 2 });
  assertInvalid(image, { ...variant, public: "public" });
  const patch = await at("capture-variant.schema.json", "patch");
  assertValid(patch, { main: true });
  assertValid(patch, { public: true });
  assertInvalid(patch, { main: false });
  assertInvalid(patch, { main: true, public: true });
  const refusal = await at("capture-variant.schema.json", "refusal");
  assertValid(refusal, {
    error: { code: "main_image", message: "Not alone." },
  });
  assertInvalid(refusal, {
    error: { code: "revision_locked", message: "No." },
  });
});

test("capture-variant.schema.json: the owner's hand on the phone writes an image's title and description, with no source", async () => {
  const texts = await at("capture-variant.schema.json", "deviceTexts");
  assertValid(texts, { title: "Cœur de M31" });
  assertValid(texts, { description: "Mon rendu préféré." });
  assertValid(texts, { title: null, description: null });
  assertValid(texts, { title: "é".repeat(90), description: "é".repeat(280) });
  assertInvalid(texts, {});
  assertInvalid(texts, { title: "é".repeat(91) });
  assertInvalid(texts, { description: "é".repeat(281) });
  assertInvalid(texts, { title: 5 });
  assertInvalid(texts, { title: "a", notes: "b" });
  // A body with a source is a producer's proposal, not this gesture.
  assertInvalid(texts, { title: "a", source: "astro-sync" });
  const proposal = await at("capture-variant.schema.json", "proposal");
  assertValid(proposal, { title: "a", source: "astro-sync" });
  assertInvalid(proposal, { title: "a" });
});

test("personal-target.schema.json: created by a device, listed, never a free label", async () => {
  const create = await at("personal-target.schema.json", "create");
  const body = {
    name: "Comète du soir",
    label: "Grand champ",
    raHours: 2.5,
    decDegrees: 45,
    placeName: "Col des Étoiles",
    date: "2026-10-05",
    note: "Prise au téléobjectif.",
  };
  assertValid(create, body);
  assertValid(create, { name: "IC 1396 large", label: "Nébuleuse" });
  assertInvalid(create, { ...body, label: "Voie lactée" });
  assertInvalid(create, { ...body, name: "x".repeat(81) });
  assertInvalid(create, { ...body, spaceId: "another" });
  const target = {
    id: "5d3c2b1a-0f9e-4d8c-8b7a-6f5e4d3c2b1a",
    source: "personal",
    name: body.name,
    label: body.label,
    raHours: 2.5,
    decDegrees: 45,
    placeName: body.placeName,
    date: body.date,
    note: body.note,
    createdAt: "2026-10-08T10:00:00.000Z",
  };
  assertValid(await at("personal-target.schema.json", "created"), { target });
  assertValid(await at("personal-target.schema.json", "list"), {
    targets: [target],
  });
});

test("upload-check.schema.json: present, accepted, refused with its code and its numbers", async () => {
  const check = await at("upload-check.schema.json");
  const storage = {
    usedBytes: 14_000_000,
    quotaBytes: 53_687_091_200,
    maxFileBytes: 104_857_600,
    captureCount: 1,
    captureCountLimit: Number.MAX_SAFE_INTEGER,
    variantLimit: 0,
  };
  assertValid(check, {
    result: "present",
    captureId: "6b2f0c1e-3a4d-4e5f-8a9b-0c1d2e3f4a5b",
    imageId: variant.id,
    main: false,
    storage,
  });
  assertValid(check, { result: "accepted", adds: "variant", storage });
  assertValid(check, {
    result: "refused",
    code: "capture_variant_limit_reached",
    message: "This capture holds as many images as its profile allows.",
    storage: { ...storage, variantCount: 0 },
  });
  assertInvalid(check, {
    result: "refused",
    code: "capture_variant_limit",
    message: "x",
    storage,
  });
  assertInvalid(check, { result: "accepted", adds: "revision", storage });
});

test("space-storage.schema.json: the numbers and the fourteen composed capabilities", async () => {
  const storage = await at("space-storage.schema.json");
  const { properties } = await read("capabilities.schema.json");
  const capabilities = Object.fromEntries(
    Object.entries(properties).map(([name, definition]) => [
      name,
      definition.type === "boolean" ? false : 0,
    ]),
  );
  const answer = {
    usedBytes: 1_200_000_000,
    quotaBytes: 53_687_091_200,
    remainingBytes: 52_487_091_200,
    maxFileBytes: 104_857_600,
    captureCount: 12,
    captureCountLimit: Number.MAX_SAFE_INTEGER,
    variantLimit: 0,
    capabilities,
  };
  assertValid(storage, answer);
  assertInvalid(storage, { ...answer, remainingBytes: undefined });
  assertInvalid(storage, {
    ...answer,
    capabilities: { ...capabilities, "analysis.stacking": true },
  });
});

test("capture.schema.json: an image added to a capture, the stage and the fields of a device's gallery", async () => {
  const capture = await at("capture.schema.json", "capture");
  const item = {
    id: "6b2f0c1e-3a4d-4e5f-8a9b-0c1d2e3f4a5b",
    sessionId: null,
    planId: null,
    targetIds: ["m31", "5d3c2b1a-0f9e-4d8c-8b7a-6f5e4d3c2b1a"],
    originalName: "M31_final.jpg",
    sha256: sha("a"),
    byteSize: 14_000_000,
    status: "uploaded",
    stage: "draft",
    visibility: "private",
    createdAt: "2026-10-05T22:00:00.000Z",
    visibilityEditable: false,
    thumbnail: true,
    galleryLabel: "Galaxie",
    nightDate: "2026-10-05",
    width: 4096,
    height: 2731,
    targets: [
      {
        id: "m31",
        source: "catalogue",
        designation: "M31",
        type: "Galaxie",
        aliases: ["NGC 224"],
        raHours: 0.712,
        decDegrees: 41.27,
      },
      {
        id: "5d3c2b1a-0f9e-4d8c-8b7a-6f5e4d3c2b1a",
        source: "personal",
        name: "Comète du soir",
        label: "Grand champ",
        raHours: null,
        decDegrees: null,
      },
    ],
    mainImageId: variant.id,
    imageCount: 2,
  };
  assertValid(capture, item);
  assertInvalid(capture, { ...item, stage: "published" });
  assertInvalid(capture, { ...item, exposureSeconds: null });
  const metadata = await at("capture.schema.json", "uploadMetadata");
  assertValid(metadata, {
    originalName: "IMG_2041.tif",
    sha256: sha("b"),
    byteSize: 412_000_000,
    captureId: item.id,
    source: "stacking",
  });
  const refusal = await at("capture.schema.json", "refusal");
  assertValid(refusal, {
    error: { code: "capture_variant_limit_reached", message: "No more." },
    storage: {
      usedBytes: 0,
      quotaBytes: 1,
      maxFileBytes: 1,
      variantLimit: 0,
      variantCount: 0,
    },
  });
  const session = await at("capture.schema.json", "uploadSession");
  assertValid(session, {
    uploadId: "1d2c3b4a-5f6e-4a7b-8c9d-0e1f2a3b4c5d",
    offset: 14_000_000,
    byteSize: 14_000_000,
    chunkSize: 8_388_608,
    completed: true,
    expiresAt: null,
    captureId: item.id,
    present: true,
    imageId: variant.id,
  });
});

test("the capabilities stay at fourteen keys: the stacking follows analysis.progression", async () => {
  assert.equal(CAPABILITY_NAMES.length, 14);
  assert.ok(!CAPABILITY_NAMES.includes("analysis.stacking"));
  assert.ok(CAPABILITY_NAMES.includes("analysis.progression"));
  const document = await read("capabilities.schema.json");
  assert.equal(document.required.length, 14);
  assert.equal(Object.keys(document.properties).length, 14);
  assert.equal(document.additionalProperties, false);
});

test("the generated texts of an image: ten languages, English required, apart from the owner's title; at the upload, on the device's proposal and in the galleries", async () => {
  const generatedTitle = {
    en: "Natural render · Contrast 3.6",
    fr: "Rendu naturel · Contraste 3,6",
    de: "Natürliche Darstellung · Kontrast 3,6",
    es: "Render natural · Contraste 3,6",
    it: "Resa naturale · Contrasto 3,6",
    ja: "ナチュラルな仕上がり · コントラスト 3.6",
    "pt-BR": "Renderização natural · Contraste 3,6",
    ru: "Естественный рендер · Контраст 3,6",
    "zh-Hans": "自然渲染 · 对比度 3.6",
    "zh-Hant": "自然渲染 · 對比度 3.6",
  };
  const generatedDescription = { en: "The sensor’s colours." };
  const title = await at("capture-variant.schema.json", "generatedTitle");
  assertValid(title, generatedTitle);
  assertValid(title, { en: "t".repeat(90) });
  assertInvalid(title, { fr: "Rendu naturel" });
  assertInvalid(title, { en: "t".repeat(91) });
  assertInvalid(title, { en: "Natural", ko: "자연" });
  assertInvalid(title, { en: "" });
  const description = await at(
    "capture-variant.schema.json",
    "generatedDescription",
  );
  assertValid(description, { en: "d".repeat(280) });
  assertInvalid(description, { en: "d".repeat(281) });

  const image = await at("capture-variant.schema.json", "variant");
  assertValid(image, {
    ...variant,
    title: null,
    description: null,
    generatedTitle,
    generatedDescription,
  });
  assertValid(image, {
    ...variant,
    title: "Mon choix",
    generatedTitle,
    generatedDescription: null,
  });
  const proposal = await at("capture-variant.schema.json", "proposal");
  assertValid(proposal, { source: "astro-sync", generatedTitle });
  assertValid(proposal, {
    source: "astro-sync",
    generatedTitle,
    generatedDescription,
    imageQuality: null,
  });
  assertInvalid(proposal, { source: "astro-sync", generatedTitle: null });
  assertInvalid(proposal, {
    source: "astro-sync",
    generatedTitle: { fr: "Rendu" },
  });

  const upload = await at("capture.schema.json", "uploadMetadata");
  const body = {
    originalName: "M31_plan-2_raw.tif",
    sha256: "c".repeat(64),
    byteSize: 1024,
  };
  assertValid(upload, {
    ...body,
    variantGeneratedTitle: generatedTitle,
    variantGeneratedDescription: generatedDescription,
  });
  assertInvalid(upload, { ...body, variantGeneratedTitle: { fr: "Rendu" } });

  registerExternalSchema(
    "capture-variant.schema.json",
    await read("capture-variant.schema.json"),
  );
  const gallery = await read("gallery.schema.json");
  const shown = {
    id: "v2",
    media: {
      image: "/api/v1/gallery/c/media?imageId=v2",
      thumbnail: "/api/v1/gallery/c/media?variant=thumbnail&imageId=v2",
    },
    image: null,
    title: null,
    description: null,
    generatedTitle,
    arrivalRank: 2,
  };
  assertValid({ ...gallery, $ref: "#/$defs/variantImage" }, shown);
  assertInvalid(
    { ...gallery, $ref: "#/$defs/variantImage" },
    { ...shown, generatedTitle: { ja: "仕上がり" } },
  );
});
