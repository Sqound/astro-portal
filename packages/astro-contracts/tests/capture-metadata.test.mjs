// The contract of a capture's metadata
// — additive and nullable: the proposals of
// an upload, the owner's one-field change, a producer's `proposed` and its
// answer, an image's title and description together and as a producer's
// proposal, the refusal `invalid_metadata` with its field and limit, and
// what a visitor reads (never a place, a note, an origin).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertInvalid,
  assertValid,
  registerExternalSchema,
} from "./schema-assert.mjs";

const read = async (name) =>
  JSON.parse(
    await readFile(new URL(`../schemas/api/${name}`, import.meta.url), "utf8"),
  );

async function at(file, pointer) {
  for (const name of [
    "capture.schema.json",
    "capture-variant.schema.json",
    "sky-solution.schema.json",
    "manage-captures.schema.json",
  ])
    registerExternalSchema(name, await read(name));
  const document = await read(file);
  return { ...document, $ref: `#/$defs/${pointer}`, oneOf: undefined };
}

const upload = {
  originalName: "IMG_2041.tif",
  sha256: "a".repeat(64),
  byteSize: 412,
};

test("uploadMetadata: every proposal optional, the limits of the sheet; an earlier body still valid", async () => {
  const schema = await at("capture.schema.json", "uploadMetadata");
  assertValid(schema, upload);
  assertValid(schema, {
    ...upload,
    source: "stacking",
    metadataSource: "astro-sync",
    title: "M31 — Galaxie d’Andromède",
    description: "Première nuit d’automne au col.",
    acquisition: [
      { filter: "Dual-band", frameCount: 38, exposureSeconds: 180, gain: 100 },
      { filter: null, frameCount: 20, exposureSeconds: 120, gain: null },
    ],
    calibration: "c".repeat(120),
    sensor: { temperatureC: -10, binning: 1 },
    processing: { software: "Siril 1.4.4", steps: "Empilement" },
    variantTitle: "Rendu brut",
    variantDescription: "Les couleurs du capteur, sans retouche de teinte.",
  });
  assertInvalid(schema, { ...upload, calibration: "c".repeat(121) });
  assertInvalid(schema, { ...upload, variantTitle: "t".repeat(91) });
  assertInvalid(schema, { ...upload, metadataSource: "owner" });
  assertInvalid(schema, {
    ...upload,
    acquisition: [{ frameCount: 1, exposureSeconds: 0 }],
  });
  assertInvalid(schema, { ...upload, place: "Col des Étoiles" });
});

test("the owner's change: one field, the acquisition's three operations, never a place", async () => {
  const change = await at("manage-captures.schema.json", "metadataChange");
  for (const body of [
    { title: "M31 — première nuit d’automne" },
    { title: null },
    { notes: "n".repeat(4000) },
    { "equipment.filterIds": ["filter-1"] },
    { sessionId: "night-2" },
    { acquisition: null },
    {
      acquisition: {
        add: { filter: "Ha", frameCount: 10, exposureSeconds: 300 },
      },
    },
    {
      acquisition: {
        line: "line-1",
        set: { filter: "Dual-band", frameCount: 36, exposureSeconds: 180 },
      },
    },
    { acquisition: { line: "line-1", delete: true } },
  ])
    assertValid(change, body);
  assertInvalid(change, { title: "a", notes: "b" });
  assertInvalid(change, {});
  assertInvalid(change, { place: "Col des Étoiles" });
  assertInvalid(change, { title: "t".repeat(81) });
  const patch = await at("manage-captures.schema.json", "patch");
  assertValid(
    { ...patch, $ref: undefined, oneOf: patch.$defs.patch.oneOf },
    { metadata: { calibration: "30 darks" } },
  );
});

test("a producer's `proposed`, its answer with `skipped`; an image's texts together and as a proposal", async () => {
  const proposed = await at("manage-captures.schema.json", "proposed");
  assertValid(proposed, {
    source: "import",
    title: "Nébuleuse du Cœur",
    acquisition: [
      { filter: "Dual-band", frameCount: 98, exposureSeconds: 180 },
      { filter: "RGB", frameCount: 89, exposureSeconds: 90 },
    ],
  });
  assertInvalid(proposed, { title: "sans source" });
  assertInvalid(proposed, { source: "photo", title: "x" });
  const skipped = await at("capture.schema.json", "skipped");
  assertValid(skipped, [
    { field: "title", reason: "edited" },
    { field: "acquisition[2]", reason: "deleted" },
  ]);
  assertInvalid(skipped, [{ field: "title", reason: "other" }]);
  const variantPatch = await at("capture-variant.schema.json", "patch");
  const texts = { ...variantPatch, $ref: undefined };
  texts.oneOf = (await read("capture-variant.schema.json")).$defs.patch.oneOf;
  assertValid(texts, { title: "Rendu brut", description: "Sans retouche." });
  const proposal = await at("capture-variant.schema.json", "proposal");
  assertValid(proposal, { title: "Rendu brut", source: "astro-sync" });
  assertInvalid(proposal, { title: "Rendu brut" });
  assertInvalid(proposal, { source: "astro-sync" });
  assertInvalid(proposal, { main: true, source: "astro-sync" });
});

test("the refusals: invalid_metadata with its field and limit, on the uploads and on the owner's routes", async () => {
  const manage = await at("manage-captures.schema.json", "refusal");
  assertValid(manage, {
    error: {
      code: "invalid_metadata",
      message: "calibration holds 120 characters at most.",
      field: "calibration",
      limit: 120,
    },
  });
  for (const code of [
    "entitlement_read_only",
    "session_not_found",
    "equipment_not_found",
    "acquisition_line_not_found",
    "device_required",
  ])
    assertValid(manage, { error: { code, message: "Refused." } });
  const uploads = await at("capture.schema.json", "refusal");
  assertValid(uploads, {
    error: {
      code: "invalid_metadata",
      message: "Refused.",
      field: "metadataSource",
      limit: null,
    },
  });
});

test("the owner's metadata: every value with its origin; an image's titleSource and edited; finalizedAt nullable", async () => {
  const metadata = await at("manage-captures.schema.json", "metadata");
  const origin = (value, source = null) => ({
    value,
    source,
    at: null,
    edited: false,
  });
  const value = {
    title: origin(null),
    description: origin("Première nuit d’automne au col.", "owner"),
    notes: origin(null),
    calibration: origin("30 darks", "astro-sync"),
    sensor: origin({ temperatureC: -10, binning: 1 }, "astro-sync"),
    acquisition: {
      source: "night",
      at: null,
      edited: false,
      own: false,
      lines: [
        {
          id: "step-1",
          filter: "Dual-band",
          frameCount: 38,
          exposureSeconds: 180,
          gain: 100,
          integrationSeconds: 6840,
          origin: "night",
          editedAt: null,
          edited: false,
        },
      ],
      totalFrames: 38,
      totalSeconds: 6840,
    },
    equipment: {
      telescope: origin({ id: "scope", name: "Askar 50P" }, "plan"),
      camera: origin(null),
      mount: origin(null),
      filters: origin([], null),
    },
    processing: { software: origin(null), steps: origin(null) },
    sessionId: "night-1",
    night: {
      value: {
        title: "Nuit d’octobre au col",
        date: "2026-10-05",
        startedAt: "2026-10-05T21:40:00.000Z",
        finishedAt: "2026-10-06T04:50:00.000Z",
      },
      source: "plan",
      planName: "Nuit d’octobre au col",
    },
    place: { value: { name: "Col des Étoiles" }, source: "plan" },
    computed: {
      skyQuality: { bortle: 4 },
      moon: { illumination: 12, setsAt: "2026-10-05T23:10:00.000Z" },
    },
  };
  assertValid(metadata, value);
  assertInvalid(metadata, {
    ...value,
    acquisition: { ...value.acquisition, lines: [{ id: "x" }] },
  });
  const capture = await at("manage-captures.schema.json", "capture");
  assert.ok(capture.$defs.capture.properties.finalizedAt);
  assert.ok(!capture.$defs.capture.required.includes("finalizedAt"));
  assert.ok(!capture.$defs.capture.required.includes("metadata"));
  const variant = (await read("capture-variant.schema.json")).$defs.variant;
  assert.ok(variant.properties.titleSource && variant.properties.edited);
  assert.ok(!variant.required.includes("titleSource"));
});
