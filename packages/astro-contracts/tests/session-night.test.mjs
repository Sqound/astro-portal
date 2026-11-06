// The structured
// night in session.schema.json (`night`, `step`, the requests, the
// summaries) and what is online for a night (session-online.schema.json).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { registerExternalSchema, schemaErrors } from "./schema-assert.mjs";

const read = async (name) =>
  JSON.parse(
    await readFile(
      new URL(`../schemas/api/${name}.schema.json`, import.meta.url),
      "utf8",
    ),
  );
for (const name of ["session", "session-analysis", "debrief", "plan"])
  registerExternalSchema(`${name}.schema.json`, await read(name));
const online = await read("session-online");

const valid = (reference, value, root) =>
  assert.deepEqual(schemaErrors({ $ref: reference }, value, root), []);
const invalid = (reference, value, root) =>
  assert.notDeepEqual(
    schemaErrors({ $ref: reference }, value, root),
    [],
    JSON.stringify(value).slice(0, 80),
  );

const sessionId = "1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b";
const night = () => ({
  title: { value: "Nuit du mer. 7 oct.", source: "night" },
  startedAt: { value: "2026-10-07T21:05:00Z", source: "night" },
  finishedAt: { value: "2026-10-08T04:40:00Z", source: "night" },
  place: {
    value: { name: "Col des Étoiles", latitude: 45, longitude: -30 },
    source: "plan",
  },
  equipment: {
    value: {
      telescopeId: "telescope-1",
      cameraId: null,
      mountId: null,
      filterIds: [],
    },
    source: "plan",
  },
  targetIds: { value: ["m31", "ngc7000"], source: "plan" },
  notes: { value: null, source: "night" },
});
const step = () => ({
  id: "6f5ad3b2-4c1d-4a8e-9b7f-2d3c4e5f6a7b",
  sessionId,
  targetId: "ngc7000",
  targetHint: "NGC 7000",
  filter: "Ha",
  frameCount: 38,
  exposureSeconds: 180,
  gain: 100,
  integrationSeconds: 6840,
  origin: "analysis",
  stepKey: "ngc7000-ha-180",
  edited: true,
  editedAt: "2026-10-08T10:00:00Z",
  position: 1,
  createdAt: "2026-10-08T09:12:00Z",
  updatedAt: "2026-10-08T10:00:00Z",
});

test("night: each field with its value and its source; the place never has a time zone", () => {
  valid("session.schema.json#/$defs/night", night());
  const zoned = night();
  zoned.place.value.timeZone = "Europe/Paris";
  invalid("session.schema.json#/$defs/night", zoned);
  const unsourced = night();
  unsourced.title.source = "guess";
  invalid("session.schema.json#/$defs/night", unsourced);
});

test("PATCH …/night: the fields named, null back to the plan; no time zone, no unknown field, a title of 80 characters at most", () => {
  const ref = "session.schema.json#/$defs/nightPatchRequest";
  valid(ref, { title: "Nuit du mer. 7 oct.", place: null, targetIds: null });
  valid(ref, { place: { name: "Col des Étoiles", latitude: 45 } });
  invalid(ref, { place: { name: "Col des Étoiles", timeZone: "UTC" } });
  invalid(ref, { colour: "red" });
  invalid(ref, { title: "x".repeat(81) });
  invalid(ref, { notes: "x".repeat(4001) });
});

test("step: the integration computed, the origin, the « modifié » mark; requests to add and correct one", () => {
  valid("session.schema.json#/$defs/step", step());
  invalid("session.schema.json#/$defs/step", { ...step(), origin: "guess" });
  invalid("session.schema.json#/$defs/step", { ...step(), score: 1 });
  valid("session.schema.json#/$defs/stepCreateRequest", {
    filter: null,
    frameCount: 10,
    exposureSeconds: 60,
  });
  invalid("session.schema.json#/$defs/stepCreateRequest", { frameCount: 10 });
  invalid("session.schema.json#/$defs/stepPatchRequest", {
    integrationSeconds: 600,
  });
});

test("detail: the night, its steps and the summaries are additive (an older detail still validates)", () => {
  const detail = {
    session: {
      id: sessionId,
      planId: null,
      status: "finished",
      startedAt: "2026-10-07T21:05:00Z",
      finishedAt: "2026-10-08T04:40:00Z",
      createdAt: "2026-10-07T21:05:00Z",
      updatedAt: "2026-10-08T10:00:00Z",
    },
    supplements: [],
  };
  valid("session.schema.json#/$defs/detail", detail);
  const figures = {
    fwhmPixels: 2.6,
    fwhmArcsec: 8.06,
    eccentricity: 0.42,
    skyBackgroundAdu: 1010,
    skyBackgroundNoiseAdu: null,
    starCount: null,
    measuredFrames: 38,
  };
  valid("session.schema.json#/$defs/detail", {
    ...detail,
    night: night(),
    steps: [step()],
    qualitySummary: {
      pixelScaleArcsec: 3.1,
      night: figures,
      byStep: [
        {
          stepKey: "ngc7000-ha-180",
          stepId: step().id,
          filter: "Ha",
          exposureSeconds: 180,
          ...figures,
        },
      ],
    },
    guidingSummary: {
      rmsRaArcsec: 0.5,
      rmsDecArcsec: 0.4,
      rmsTotalArcsec: 0.64,
      guidedSeconds: 25200,
      samples: 12000,
      dithers: 40,
      settleTimeouts: 1,
      autofocusRuns: 3,
      autofocusSucceeded: 3,
      meridianFlips: 1,
    },
    guidingSeries: [
      {
        start: "2026-10-07T21:10:00Z",
        end: "2026-10-07T21:12:00Z",
        rmsRa: 0.5,
        rmsDec: 0.4,
        rmsTotal: 0.64,
        samples: 60,
      },
    ],
    guidingLosses: null,
    guidingLossesReason: "no_analysis",
  });
  // Reading is never gated: `not_entitled` is no longer a reason.
  invalid("session.schema.json#/$defs/detail", {
    ...detail,
    guidingLosses: null,
    guidingLossesReason: "not_entitled",
  });
});

const image = (main, solved, source = "phone") => ({
  id: main
    ? "2a3b4c5d-6e7f-4801-9a2b-3c4d5e6f7a8b"
    : "3b4c5d6e-7f80-4912-8b3c-4d5e6f7a8b9c",
  main,
  sha256: (main ? "a" : "b").repeat(64),
  byteSize: 14_000_000,
  originalName: main ? "M31_final.jpg" : "M31_final_v2.jpg",
  source,
  createdAt: "2026-10-08T09:15:00Z",
  skySolution: solved ? "present" : "missing",
});
const onlineAnswer = () => ({
  sessionId,
  targets: [
    {
      targetId: "m31",
      name: "M31",
      planned: true,
      captures: [
        {
          id: "4c5d6e7f-8091-4a23-9c4d-5e6f7a8b9c0d",
          targetIds: ["m31"],
          source: "phone",
          stage: "finalized",
          visibility: "public",
          uploaded: true,
          createdAt: "2026-10-08T09:15:00Z",
          mainImage: image(true, true),
          imageCount: 2,
          images: [image(true, true), image(false, false, "astro-sync")],
        },
      ],
    },
    { targetId: null, name: null, planned: false, captures: [] },
  ],
  analysis: {
    present: true,
    sentAt: "2026-10-08T09:12:00Z",
    originDeviceId: null,
    deviceName: "Astro Sync",
    reportVersion: 2,
    producer: "astro-sync",
    stepCount: 3,
    editedStepCount: 1,
  },
});

test("online: per target the captures, the main image and every image with its digest and its sky solution, the analysis in place", () => {
  assert.deepEqual(schemaErrors(online, onlineAnswer(), online), []);
  const absent = onlineAnswer();
  absent.analysis = {
    present: false,
    sentAt: null,
    originDeviceId: null,
    deviceName: null,
    reportVersion: null,
    producer: null,
    stepCount: 0,
    editedStepCount: 0,
  };
  assert.deepEqual(schemaErrors(online, absent, online), []);
});

test("online refuses a digest that is not SHA-256, a solution state other than present or missing, a version word", () => {
  const badDigest = onlineAnswer();
  badDigest.targets[0].captures[0].images[0].sha256 = "abc";
  assert.notDeepEqual(schemaErrors(online, badDigest, online), []);
  const badState = onlineAnswer();
  badState.targets[0].captures[0].mainImage.skySolution = "pending";
  assert.notDeepEqual(schemaErrors(online, badState, online), []);
  const revision = onlineAnswer();
  revision.targets[0].captures[0].revisionCount = 2;
  assert.notDeepEqual(schemaErrors(online, revision, online), []);
});

test("session-online.schema.json declares a 2020-12 $schema and a stable $id", () => {
  assert.equal(online.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.ok(online.$id.startsWith("https://astroportal.invalid/schemas/"));
});
