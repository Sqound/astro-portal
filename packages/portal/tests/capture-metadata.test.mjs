// The limits of each value, the reading merged
// plan → night → capture with the origin of each value, the night's steps
// read until a line is corrected, and the values computed at reading and
// never stored (the integration, the total, the sky quality, the Moon).
import assert from "node:assert/strict";
import test from "node:test";
import {
  METADATA_LIMITS,
  MetadataError,
  applyOwnerChange,
  applyProposals,
  metadataColumns,
  ownerChangeInput,
  proposalsInput,
  storedMetadata,
} from "../dist/captures/capture-metadata.js";
import { captureMetadata } from "../dist/captures/capture-metadata-reading.js";
import {
  WEB,
  contractErrors,
  image,
  withMetadataSpace,
} from "./helpers/metadata-space.mjs";

const refusedAt = (fn, field, limit) =>
  assert.throws(fn, (error) => {
    assert.ok(error instanceof MetadataError, String(error));
    assert.equal(error.code, "invalid_metadata");
    assert.equal(error.status, 400);
    assert.equal(error.field, field);
    if (limit !== undefined) assert.equal(error.limit, limit);
    return true;
  });

test("the limits of the sheet: 80, 2 000, 4 000, 120 accepted at the bound, one more refused naming the field and its limit", () => {
  for (const [field, limit] of [
    ["title", 80],
    ["description", 2000],
    ["notes", 4000],
    ["calibration", 120],
    ["processing.software", 120],
    ["processing.steps", 500],
  ]) {
    assert.equal(
      ownerChangeInput({ [field]: "é".repeat(limit) }).value.length,
      limit,
    );
    refusedAt(
      () => ownerChangeInput({ [field]: "é".repeat(limit + 1) }),
      field,
      limit,
    );
  }
  assert.deepEqual(METADATA_LIMITS, {
    title: 80,
    description: 2000,
    notes: 4000,
    calibration: 120,
    filter: 40,
    software: 120,
    steps: 500,
    variantTitle: 90,
    variantDescription: 280,
  });
});

test("an acquisition line: filter 40, frames ≥ 1, exposure > 0, gain an integer; a blank text is null, the typed text kept", () => {
  const line = (changes) => ({
    filter: "Dual-band",
    frameCount: 38,
    exposureSeconds: 180,
    gain: 100,
    ...changes,
  });
  assert.equal(
    ownerChangeInput({ acquisition: { add: line({ filter: "x".repeat(40) }) } })
      .value.line.filter.length,
    40,
  );
  refusedAt(
    () =>
      ownerChangeInput({
        acquisition: { add: line({ filter: "x".repeat(41) }) },
      }),
    "acquisition.filter",
    40,
  );
  refusedAt(
    () => ownerChangeInput({ acquisition: { add: line({ frameCount: 0 }) } }),
    "acquisition.frameCount",
  );
  refusedAt(
    () =>
      ownerChangeInput({ acquisition: { add: line({ exposureSeconds: 0 }) } }),
    "acquisition.exposureSeconds",
    0,
  );
  refusedAt(
    () => ownerChangeInput({ acquisition: { add: line({ gain: 1.5 }) } }),
    "acquisition.gain",
  );
  assert.equal(
    ownerChangeInput({ title: "  M31 — première nuit  " }).value,
    "M31 — première nuit",
  );
  assert.equal(ownerChangeInput({ title: "   " }).value, null);
  assert.equal(
    ownerChangeInput({ acquisition: { add: line({ filter: "  " }) } }).value
      .line.filter,
    null,
  );
});

test("the sensor and the processing: a temperature, a binning from 1 to 8; one field per request, never two", () => {
  assert.deepEqual(
    ownerChangeInput({ sensor: { temperatureC: -10, binning: 1 } }).value,
    { temperatureC: -10, binning: 1 },
  );
  refusedAt(
    () => ownerChangeInput({ sensor: { temperatureC: -10, binning: 9 } }),
    "sensor.binning",
  );
  refusedAt(
    () => ownerChangeInput({ sensor: { temperatureC: "froid" } }),
    "sensor.temperatureC",
  );
  refusedAt(() => ownerChangeInput({ title: "a", notes: "b" }), "metadata");
  refusedAt(() => ownerChangeInput({}), "metadata");
  refusedAt(() => ownerChangeInput({ place: "Col" }), "place");
  refusedAt(
    () =>
      proposalsInput({ source: "astro-sync", calibration: "c".repeat(121) }),
    "calibration",
    120,
  );
  refusedAt(
    () => proposalsInput({ source: "owner", title: "x" }),
    "proposed.source",
  );
});

const STEPS = [
  {
    id: "step-1",
    targetId: "m31",
    filter: "Dual-band",
    frameCount: 38,
    exposureSeconds: 180,
    gain: 100,
    editedAt: null,
  },
  {
    id: "step-2",
    targetId: "m31",
    filter: null,
    frameCount: 20,
    exposureSeconds: 120,
    gain: 100,
    editedAt: null,
  },
];
const inputs = (row = {}, extra = {}) => ({
  session: {
    id: "night-1",
    started_at: "2026-10-05T21:40:00.000Z",
    finished_at: "2026-10-06T04:50:00.000Z",
  },
  plan: {
    name: "Nuit d’octobre au col",
    plan_date: "2026-10-05",
    location_json: JSON.stringify({
      name: "Col des Étoiles",
      latitude: 45,
      longitude: -30,
      bortle: 4,
    }),
    equipment_json: JSON.stringify({ telescopeId: "scope", cameraId: "cam" }),
  },
  night: {
    title: { value: "Nuit d’octobre au col", source: "plan" },
    place: { value: { name: "Col des Étoiles" }, source: "plan" },
    equipment: {
      value: { telescopeId: "scope", cameraId: "cam", filterIds: [] },
      source: "plan",
    },
  },
  steps: STEPS,
  stored: storedMetadata(row),
  equipmentNames: new Map([
    ["scope", "Askar 50P"],
    ["cam", "ZWO ASI533MC Pro"],
    ["filter", "Dual-band"],
  ]),
  ...extra,
});

test("the merge: nothing of its own, a capture reads its night's steps, its plan's equipment and place, each with its source", () => {
  const read = captureMetadata(inputs());
  assert.equal(read.title.value, null);
  assert.equal(read.title.source, null);
  assert.equal(read.acquisition.own, false);
  assert.equal(read.acquisition.source, "night");
  assert.deepEqual(
    read.acquisition.lines.map((line) => [
      line.filter,
      line.integrationSeconds,
      line.origin,
      line.edited,
    ]),
    [
      ["Dual-band", 6840, "night", false],
      [null, 2400, "night", false],
    ],
  );
  assert.equal(read.acquisition.totalSeconds, 9240);
  assert.equal(read.acquisition.totalFrames, 58);
  assert.deepEqual(read.equipment.telescope, {
    value: { id: "scope", name: "Askar 50P" },
    source: "plan",
    at: null,
    edited: false,
  });
  assert.equal(read.equipment.mount.value, null);
  assert.equal(read.equipment.mount.source, null);
  assert.deepEqual(read.place, {
    value: { name: "Col des Étoiles" },
    source: "plan",
  });
  assert.equal(read.night.planName, "Nuit d’octobre au col");
  assert.equal(read.night.value.date, "2026-10-05");
});

test("the merge: a corrected line makes the capture keep its own lines, only that one « · modifié »; a deleted line is gone; null gives the night back", () => {
  const at = "2026-10-08T09:41:00.000Z";
  const corrected = applyOwnerChange(
    storedMetadata({}),
    {
      field: "acquisition",
      value: {
        op: "set",
        lineId: "step-1",
        line: {
          filter: "Dual-band",
          frameCount: 36,
          exposureSeconds: 180,
          gain: 100,
        },
      },
    },
    { at, nightSteps: STEPS },
  );
  const read = captureMetadata(inputs(metadataColumns(corrected)));
  assert.equal(read.acquisition.own, true);
  assert.deepEqual(
    read.acquisition.lines.map((line) => [line.frameCount, line.edited]),
    [
      [36, true],
      [20, false],
    ],
  );
  const deleted = applyOwnerChange(
    corrected,
    { field: "acquisition", value: { op: "delete", lineId: "step-2" } },
    { at },
  );
  assert.equal(
    captureMetadata(inputs(metadataColumns(deleted))).acquisition.lines.length,
    1,
  );
  const back = applyOwnerChange(
    deleted,
    { field: "acquisition", value: null },
    { at },
  );
  const reread = captureMetadata(inputs(metadataColumns(back)));
  assert.equal(reread.acquisition.own, false);
  assert.equal(reread.acquisition.lines.length, 2);
});

test("the merge: a value of the capture wins over its night's; null gives the level above back, a proposed value comes back under its source", () => {
  const at = "2026-10-08T09:41:00.000Z";
  const camera = applyOwnerChange(
    storedMetadata({}),
    { field: "equipment.cameraId", value: "filter" },
    { at },
  );
  const read = captureMetadata(inputs(metadataColumns(camera)));
  assert.equal(read.equipment.camera.source, "owner");
  assert.equal(read.equipment.camera.edited, true);
  assert.equal(read.equipment.telescope.source, "plan");
  const proposed = applyProposals(
    storedMetadata({}),
    { source: "astro-sync", fields: { calibration: "30 darks · 30 flats" } },
    { at },
  ).state;
  const typed = applyOwnerChange(
    proposed,
    { field: "calibration", value: "30 darks · 30 flats · 30 dark-flats" },
    { at },
  );
  assert.equal(
    captureMetadata(inputs(metadataColumns(typed))).calibration.source,
    "owner",
  );
  const cleared = applyOwnerChange(
    typed,
    { field: "calibration", value: null },
    { at },
  );
  assert.deepEqual(
    captureMetadata(inputs(metadataColumns(cleared))).calibration,
    {
      value: "30 darks · 30 flats",
      source: "astro-sync",
      at,
      edited: false,
    },
  );
  const titled = applyOwnerChange(
    storedMetadata({}),
    { field: "title", value: "M31 — première nuit d’automne" },
    { at },
  );
  const untitled = applyOwnerChange(
    titled,
    { field: "title", value: null },
    { at },
  );
  assert.equal(
    captureMetadata(inputs(metadataColumns(untitled))).title.value,
    null,
  );
  assert.equal(metadataColumns(untitled).field_origins_json, null);
});

test("computed at reading, never stored: the integration, the total, the sky quality and the Moon; the visitor reads no place, no origin, no notes", () => {
  const read = captureMetadata(inputs({ notes: "Rosée vers 2 h." }));
  assert.deepEqual(read.computed.skyQuality, { bortle: 4 });
  assert.equal(typeof read.computed.moon.illumination, "number");
  assert.ok(read.computed.moon.illumination >= 0);
  const columns = metadataColumns(storedMetadata({ notes: "Rosée vers 2 h." }));
  for (const value of Object.values(columns))
    assert.ok(
      !/integration|bortle|illumination/i.test(String(value ?? "")),
      "nothing computed is stored",
    );
  const visitor = captureMetadata(inputs({ notes: "Rosée vers 2 h." }), {
    audience: "visitor",
  });
  const text = JSON.stringify(visitor);
  for (const word of [
    "Col des Étoiles",
    "Rosée",
    "source",
    "edited",
    "origin",
    "latitude",
  ])
    assert.ok(!text.includes(word), `${word} never reaches a visitor`);
  assert.equal(visitor.totalIntegrationSeconds, 9240);
  assert.equal(visitor.moonIllumination, read.computed.moon.illumination);
});

test("the owner's resource carries metadata: the night's steps on M31, the plan's equipment by name, the place, the Moon; a capture without a night reads nothing", async () => {
  await withMetadataSpace(async ({ owner, space, send }) => {
    const sent = await send(
      image("m31-night"),
      { sessionId: space.sessionId, targetIds: ["m31"] },
      WEB,
    );
    const read = await owner.get({
      tenantId: space.tenantId,
      captureId: sent.body.capture.id,
    });
    const { metadata } = read;
    assert.equal(metadata.sessionId, space.sessionId);
    assert.equal(metadata.acquisition.lines.length, 2);
    assert.equal(metadata.acquisition.totalSeconds, 9240);
    assert.equal(metadata.equipment.telescope.value.name, "Askar 50P");
    assert.equal(metadata.equipment.telescope.source, "plan");
    assert.equal(metadata.equipment.mount.value.name, "ZWO AM5N");
    assert.deepEqual(metadata.place.value, { name: "Col des Étoiles" });
    assert.deepEqual(metadata.computed.skyQuality, { bortle: 4 });
    assert.equal(metadata.night.value.startedAt, "2026-10-05T21:40:00.000Z");
    assert.ok(read.variants.every((variant) => variant.edited === false));
    assert.deepEqual(
      await contractErrors("manage-captures.schema.json", "capture", read),
      [],
    );

    const alone = await send(image("no-night"), {}, WEB);
    const bare = (
      await owner.get({
        tenantId: space.tenantId,
        captureId: alone.body.capture.id,
      })
    ).metadata;
    assert.equal(bare.acquisition.lines.length, 0);
    assert.equal(bare.acquisition.totalSeconds, null);
    assert.equal(bare.night.value, null);
    assert.equal(bare.place.value, null);
  });
});

test("the night carries the zone its hours are read in — the place's, as the session's page reads it; none when none can be read", async () => {
  await withMetadataSpace(async ({ owner, space, send, driver }) => {
    const sent = await send(
      image("m31-zone"),
      { sessionId: space.sessionId, targetIds: ["m31"] },
      WEB,
    );
    const read = () =>
      owner.get({
        tenantId: space.tenantId,
        captureId: sent.body.capture.id,
      });
    // The plan's place names its zone (Namibia, UTC+2): the hours follow it.
    await driver.run("UPDATE plans SET location_json = ? WHERE id = ?", [
      JSON.stringify({
        name: "Gamsberg Research Station",
        latitude: -23.34,
        longitude: 16.23,
        timeZone: "Africa/Windhoek",
      }),
      space.planId,
    ]);
    const zoned = await read();
    assert.equal(zoned.metadata.night.placeTimeZone, "Africa/Windhoek");
    assert.deepEqual(
      await contractErrors("manage-captures.schema.json", "capture", zoned),
      [],
    );
    // No place at all: no zone, the hours stay UTC.
    await driver.run("UPDATE plans SET location_json = NULL WHERE id = ?", [
      space.planId,
    ]);
    assert.equal((await read()).metadata.night.placeTimeZone, null);
    const alone = await send(image("no-night-zone"), {}, WEB);
    assert.equal(
      (
        await owner.get({
          tenantId: space.tenantId,
          captureId: alone.body.capture.id,
        })
      ).metadata.night.placeTimeZone,
      null,
    );
  });
});

test("the planner's `null` and « none » are not equipment — both read as nothing chosen", async () => {
  await withMetadataSpace(async ({ owner, space, send, driver }) => {
    const sent = await send(
      image("m31-custom"),
      { sessionId: space.sessionId, targetIds: ["m31"] },
      WEB,
    );
    await driver.run("UPDATE plans SET equipment_json = ? WHERE id = ?", [
      JSON.stringify({
        telescopeId: null,
        cameraId: null,
        mountId: "none",
        filterIds: [],
      }),
      space.planId,
    ]);
    const { metadata } = await owner.get({
      tenantId: space.tenantId,
      captureId: sent.body.capture.id,
    });
    assert.equal(metadata.equipment.telescope.value, null);
    assert.equal(metadata.equipment.camera.value, null);
    assert.equal(metadata.equipment.mount.value, null);
    assert.equal(metadata.equipment.mount.source, null);
  });
});

test("behind a smart telescope the camera is the one built into it, from the profile, whatever the plan's camera; a camera the capture names itself stays its own", async () => {
  await withMetadataSpace(async ({ owner, space, send, driver }) => {
    const sent = await send(
      image("m31-seestar"),
      { sessionId: space.sessionId, targetIds: ["m31"] },
      WEB,
    );
    await driver.run("UPDATE plans SET equipment_json = ? WHERE id = ?", [
      JSON.stringify({
        telescopeId: "seestar-s50",
        cameraId: null,
        mountId: "none",
        filterIds: [],
      }),
      space.planId,
    ]);
    const read = async () =>
      (
        await owner.get({
          tenantId: space.tenantId,
          captureId: sent.body.capture.id,
        })
      ).metadata.equipment;
    let equipment = await read();
    assert.deepEqual(equipment.telescope.value, {
      id: "seestar-s50",
      name: "Seestar S50",
    });
    assert.deepEqual(equipment.camera.value, {
      id: "integrated",
      name: "IMX462",
    });
    assert.equal(equipment.camera.source, "plan");
    // A telescope with no camera of its own: the plan's camera, here none.
    await driver.run("UPDATE plans SET equipment_json = ? WHERE id = ?", [
      JSON.stringify({ telescopeId: "skywatcher-skymax-127", cameraId: null }),
      space.planId,
    ]);
    equipment = await read();
    assert.equal(equipment.camera.value, null);
  });
});

test("TD-I1: a capture reads the steps that name its target by their hint, even when the hint resolved to another row of the catalogue; the steps of other targets stay out", async () => {
  await withMetadataSpace(async ({ driver, owner, space, send }) => {
    const insertStep = async (targetId, hint, frames) =>
      await driver.run(
        `INSERT INTO acquisition_steps (id, tenant_id, session_id, target_id, target_hint, filter, frame_count, exposure_seconds, gain, origin, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'Dual-band', ?, 60, 100, 'import', ?, ?, ?)`,
        [
          `step-${frames}`,
          space.tenantId,
          space.otherSessionId,
          targetId,
          hint,
          frames,
          frames,
          "2026-10-06T09:41:00.000Z",
          "2026-10-06T09:41:00.000Z",
        ],
      );
    // Another row of the catalogue with the same designation as M31.
    await driver.run(
      `INSERT INTO target_catalogue_entries (
         id, designation, aliases_json, common_names_json, catalogues_json,
         catalogue, source_json, source_revision, created_at, updated_at
       ) VALUES ('curated-m31', 'M31', '[]', '[]', '[]', 'Messier', '{}', 'r0', ?, ?)`,
      ["2026-10-06T09:41:00.000Z", "2026-10-06T09:41:00.000Z"],
    );
    await insertStep("curated-m31", "M 31", 5); // resolved to the other row
    await insertStep(null, "NGC 224", 6); // an alias, unresolved
    await insertStep("ic1396", "IC 1396", 7); // another target
    const sent = await send(
      image("m31-other-night"),
      { sessionId: space.otherSessionId, targetIds: ["m31"] },
      WEB,
    );
    const read = await owner.get({
      tenantId: space.tenantId,
      captureId: sent.body.capture.id,
    });
    assert.deepEqual(
      read.metadata.acquisition.lines.map((line) => line.frameCount).sort(),
      [5, 6],
    );
  });
});
