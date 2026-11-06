// The contract of the sky solution of
// a capture's image (`sky-solution.schema.json`), the additive fields it
// brings to the captures, the owner's captures and the gallery, and the
// server's own features kept outside the fourteen capability keys.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertInvalid,
  assertValid,
  registerExternalSchema,
} from "./schema-assert.mjs";
import {
  CAPABILITY_NAMES,
  SERVER_FEATURE_NAMES,
} from "../dist/capabilities.js";

const read = async (name) =>
  JSON.parse(
    await readFile(new URL(`../schemas/api/${name}`, import.meta.url), "utf8"),
  );

async function at(file, pointer) {
  for (const name of [
    "capture.schema.json",
    "capture-variant.schema.json",
    "sky-solution.schema.json",
  ])
    registerExternalSchema(name, await read(name));
  const document = await read(file);
  return pointer
    ? { ...document, $ref: `#/$defs/${pointer}`, oneOf: undefined }
    : document;
}

const solution = {
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
  solvedAt: "2026-10-07T22:10:00.000Z",
};
const stored = {
  ...solution,
  imageId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  sha256: "a".repeat(64),
  annotationsEnabled: true,
  createdAt: "2026-10-07T22:11:00.000Z",
  updatedAt: "2026-10-07T22:11:00.000Z",
};
const shown = {
  raDeg: 10.6847,
  decDeg: 41.2688,
  pixelScaleArcsec: 2.06,
  rotationDeg: 30,
  fieldWidthDeg: 3.575,
  fieldHeightDeg: 2.39,
  parity: "normal",
  width: 6248,
  height: 4176,
  annotations: "/api/v1/gallery/c1/annotations?imageId=v2",
};

test("sky-solution.schema.json: what a device sends — a digest and the solution, never the owner's switch", async () => {
  const put = await at("sky-solution.schema.json", "put");
  assertValid(put, { sha256: "a".repeat(64), solution });
  assertValid(put, {
    sha256: "b".repeat(64),
    solution: { ...solution, source: "header", solverVersion: null },
  });
  assertInvalid(put, { solution });
  assertInvalid(put, { sha256: "A".repeat(64), solution });
  assertInvalid(put, {
    sha256: "a".repeat(64),
    solution: { ...solution, annotationsEnabled: true },
  });
  for (const wrong of [
    { source: "solve-field" },
    { raDeg: 360 },
    { decDeg: 91 },
    { rotationDeg: 360 },
    { pixelScaleArcsec: 0 },
    { parity: "flipped" },
    { width: 0 },
    { schemaVersion: 2 },
  ])
    assertInvalid(put, {
      sha256: "a".repeat(64),
      solution: { ...solution, ...wrong },
    });
});

test("sky-solution.schema.json: the stored solution, the visitor's, the annotations, the server's features and the refusals", async () => {
  assertValid(await at("sky-solution.schema.json", "one"), {
    skySolution: stored,
  });
  assertValid(await at("sky-solution.schema.json", "written"), {
    skySolution: stored,
    created: true,
    changed: true,
  });
  assertInvalid(await at("sky-solution.schema.json", "stored"), {
    ...stored,
    annotationsEnabled: undefined,
  });
  const visitor = await at("sky-solution.schema.json", "public");
  assertValid(visitor, shown);
  assertValid(visitor, {
    ...shown,
    annotations: "/api/v1/gallery/c1/annotations",
  });
  // A visitor never reads the digest nor the solver.
  assertInvalid(visitor, { ...shown, sha256: "a".repeat(64) });
  assertInvalid(visitor, { ...shown, source: "astap" });
  const annotations = await at("sky-solution.schema.json", "annotations");
  assertValid(annotations, {
    image: { width: 4096, height: 2738 },
    annotations: [
      {
        type: "ngc",
        names: ["M31", "NGC 224"],
        name: "M31",
        pixelx: 2048,
        pixely: 1369,
        radius: 1800,
        target: true,
      },
      {
        type: "ngc",
        names: ["M110"],
        name: "M110",
        pixelx: 1200,
        pixely: 600,
        radius: 210,
      },
      {
        type: "bright",
        names: ["Nu And"],
        pixelx: 3000,
        pixely: 2400,
        radius: 0,
        vmag: 4.4,
      },
    ],
  });
  assertInvalid(annotations, {
    image: { width: 4096, height: 2738 },
    annotations: [{ type: "bright", names: ["Nu And"], pixelx: 1, pixely: 1 }],
  });
  const features = await at("sky-solution.schema.json", "serverFeatures");
  assertValid(features, { "sky.solve_on_server": false });
  assertInvalid(features, { "sky.solve_on_server": "no" });
  assertInvalid(features, {});
  assertValid(await at("sky-solution.schema.json", "solveState"), {
    state: "failed",
    reason: "not_solved",
  });
  const refusal = await at("sky-solution.schema.json", "refusal");
  for (const code of [
    "image_changed",
    "sky_solution_aspect_mismatch",
    "original_not_found",
    "device_authentication_required",
  ])
    assertValid(refusal, { error: { code, message: "No." } });
  assertInvalid(refusal, { error: { code: "solve_failed", message: "No." } });
});

test("the additive fields: GET /v1/captures, the images, the owner's capture and switch, the gallery", async () => {
  const listed = (await read("capture.schema.json")).$defs.capture.properties;
  assert.ok("mainImageSource" in listed && "skySolved" in listed);
  const capture = await at("capture.schema.json", "capture");
  assertValid(capture, {
    id: "c1",
    sessionId: null,
    planId: null,
    targetIds: [],
    originalName: "M31.jpg",
    sha256: "a".repeat(64),
    byteSize: 14,
    status: "uploaded",
    stage: "draft",
    visibility: "private",
    createdAt: "2026-10-07T09:41:00.000Z",
    mainImageSource: "phone",
    skySolved: false,
  });
  const variant = await at("capture-variant.schema.json", "variant");
  assertValid(variant, {
    id: "v2",
    main: false,
    sha256: "b".repeat(64),
    byteSize: 412,
    originalName: "IMG_2041.tif",
    width: 6248,
    height: 4176,
    source: "stacking",
    public: false,
    automaticCheck: null,
    createdAt: "2026-10-07T09:41:00.000Z",
    skySolved: true,
  });
  const manage = await read("manage-captures.schema.json");
  registerExternalSchema("manage-captures.schema.json", manage);
  assert.deepEqual(manage.$defs.capture.properties.skySolution, {
    description: manage.$defs.capture.properties.skySolution.description,
    $ref: "sky-solution.schema.json#/$defs/stored",
  });
  assert.equal(
    manage.$defs.capture.required.includes("skySolution"),
    false,
    "absent while no solution exists",
  );
  const patch = await at("manage-captures.schema.json", "patch");
  assertValid(patch, { skyAnnotations: false });
  assertInvalid(patch, { skyAnnotations: "off" });
  assertInvalid(patch, { skyAnnotations: true, stage: "finalized" });
  for (const name of ["list", "one"])
    assert.equal(
      manage.$defs[name].properties.serverFeatures.$ref,
      "sky-solution.schema.json#/$defs/serverFeatures",
    );
  assert.ok(
    manage.$defs.refusal.properties.error.properties.code.enum.includes(
      "sky_solution_not_found",
    ),
  );
  const gallery = await read("gallery.schema.json");
  for (const name of ["capture", "variantImage"]) {
    assert.equal(
      gallery.$defs[name].properties.skySolution.$ref,
      "sky-solution.schema.json#/$defs/public",
    );
    assert.equal(gallery.$defs[name].required.includes("skySolution"), false);
  }
});

test("sky.solve_on_server is a server feature, not a fifteenth capability key", () => {
  assert.deepEqual([...SERVER_FEATURE_NAMES], ["sky.solve_on_server"]);
  assert.equal(CAPABILITY_NAMES.length, 14);
  for (const name of SERVER_FEATURE_NAMES)
    assert.equal(CAPABILITY_NAMES.includes(name), false);
});
