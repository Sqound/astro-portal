import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { createPlaceRepository } from "../dist/persistence/place-repository.js";
import { normalizePlace } from "../dist/planner/state.js";
import {
  normalizeSkyEntered,
  parseSkyEnteredInput,
  placeSkyMeasures,
  skyBrightnessSource,
  skyEnteredRange,
} from "../dist/sky-brightness-source.js";

// The sky background a place shows is the one measured on the
// observer's own poses, else the one they typed, else the model's
// estimate — and the two others are kept for the information sheet.
// Synthetic values, no place of anyone.

const model = { bortleClass: 3, sqm: 21.4 };
const entered = { sqm: 20.85, enteredAt: "2026-09-28T21:30:00.000Z" };
const measure = (
  night,
  sqm,
  poseCount = 9,
  observedAt = `${night}T22:10:00.000Z`,
) => ({
  night,
  sqm,
  poseCount,
  methodVersion: "astro-sync-sky/1",
  observedAt,
  sessionId: null,
  updatedAt: observedAt,
});

test("the model alone is shown, with nothing measured or typed", () => {
  const choice = skyBrightnessSource({ measures: [], entered: null, model });
  assert.equal(choice.source, "model");
  assert.deepEqual(choice.shown, { sqm: 21.4, bortleClass: 3 });
  assert.equal(choice.measured, null);
  assert.equal(choice.entered, null);
});

test("a typed value wins over the model, which is still answered", () => {
  const choice = skyBrightnessSource({ measures: [], entered, model });
  assert.equal(choice.source, "entered");
  assert.deepEqual(choice.shown, { sqm: 20.85, bortleClass: 4 });
  assert.deepEqual(choice.model, model);
  assert.equal(choice.entered.enteredAt, entered.enteredAt);
});

test("a measured value wins over both, and the sheet keeps the three", () => {
  const choice = skyBrightnessSource({
    measures: [measure("2026-09-20", 21.12, 14)],
    entered,
    model,
  });
  assert.equal(choice.source, "measured");
  assert.deepEqual(choice.shown, { sqm: 21.12, bortleClass: 4 });
  assert.equal(choice.measured.poseCount, 14);
  assert.equal(choice.measured.night, "2026-09-20");
  assert.equal(choice.entered.sqm, 20.85);
  assert.equal(choice.model.sqm, 21.4);
});

test("the latest night is the one shown, whatever the order received", () => {
  const choice = skyBrightnessSource({
    measures: [measure("2026-09-20", 21.12), measure("2026-10-01", 21.04)],
    model,
  });
  assert.equal(choice.measured.night, "2026-10-01");
  assert.equal(choice.measured.sqm, 21.04);
  assert.equal(choice.measured.nightCount, 2);
});

test("unusable measures never win: a bad night, no pose, a value out of range, text", () => {
  const choice = skyBrightnessSource({
    measures: [
      measure("2026-10-0", 21),
      measure("2026-10-02", 21, 0),
      measure("2026-10-03", 9.5),
      { night: "2026-10-04", sqm: "21.0", poseCount: 4 },
    ],
    entered,
    model,
  });
  assert.equal(choice.source, "entered");
  assert.equal(choice.measured, null);
});

test("nothing known answers no source and no value", () => {
  assert.deepEqual(skyBrightnessSource({}), {
    source: null,
    shown: null,
    measured: null,
    entered: null,
    model: null,
  });
  assert.equal(skyBrightnessSource().source, null);
});

test("offline with a cached measure and no estimate, the measure is shown", () => {
  const choice = skyBrightnessSource({
    measures: [measure("2026-10-01", 21.04)],
    model: null,
  });
  assert.equal(choice.source, "measured");
  assert.equal(choice.model, null);
});

test("a typed value is kept to the hundredth, inside its range, with its instant", () => {
  assert.deepEqual(
    normalizeSkyEntered({ sqm: 21.356, enteredAt: entered.enteredAt, x: 1 }),
    { sqm: 21.36, enteredAt: entered.enteredAt },
  );
  assert.equal(
    normalizeSkyEntered({ sqm: 13.99, enteredAt: entered.enteredAt }),
    null,
  );
  assert.equal(
    normalizeSkyEntered({ sqm: 22.51, enteredAt: entered.enteredAt }),
    null,
  );
  assert.equal(
    normalizeSkyEntered({ sqm: "21", enteredAt: entered.enteredAt }),
    null,
  );
  assert.equal(normalizeSkyEntered({ sqm: 21, enteredAt: "2026-09-28" }), null);
  assert.equal(normalizeSkyEntered(null), null);
  assert.deepEqual(skyEnteredRange, { min: 14, max: 22.5, step: 0.01 });
});

test("a typed value dated by a phone's clock is kept", async () => {
  // A client may write the microseconds of its native clock rather than the
  // milliseconds. A pattern that took only the second dropped every such
  // value.
  for (const enteredAt of [
    "2026-10-18T11:34:12.405229Z",
    "2026-10-18T11:34:12.4Z",
    "2026-10-18T11:34:12.405229123Z",
    "2026-10-18T20:34:12.405229+09:00",
    new Date().toISOString(),
  ])
    assert.deepEqual(
      normalizeSkyEntered({ sqm: 21.2, enteredAt }),
      { sqm: 21.2, enteredAt },
      enteredAt,
    );
  assert.equal(
    normalizeSkyEntered({ sqm: 21.2, enteredAt: "2026-10-18T11:34:12.Z" }),
    null,
  );
  const phone = skyBrightnessSource({
    measures: [],
    entered: { sqm: 21.2, enteredAt: "2026-10-18T11:34:12.405229Z" },
    model: { bortleClass: 9, sqm: 16.7 },
  });
  assert.equal(phone.source, "entered");
  assert.deepEqual(phone.shown, { sqm: 21.2, bortleClass: 4 });
  const place = normalizePlace({
    name: "Col",
    latitude: 45.02,
    longitude: -30.04,
    skyEntered: { sqm: 21.2, enteredAt: "2026-10-18T11:34:12.405229Z" },
  });
  assert.equal(place.skyEntered.sqm, 21.2);
});

test("the form field reads a comma or a point and checks the range", () => {
  assert.deepEqual(parseSkyEnteredInput(""), { sqm: null });
  assert.deepEqual(parseSkyEnteredInput("21,35"), { sqm: 21.35 });
  assert.deepEqual(parseSkyEnteredInput(" 21.35 "), { sqm: 21.35 });
  assert.deepEqual(parseSkyEnteredInput("22.5"), { sqm: 22.5 });
  assert.deepEqual(parseSkyEnteredInput("22.6"), { error: "range" });
  assert.deepEqual(parseSkyEnteredInput("13,9"), { error: "range" });
  assert.deepEqual(parseSkyEnteredInput("21.355"), { error: "range" });
  assert.deepEqual(parseSkyEnteredInput("vingt"), { error: "range" });
});

test("a place's measured nights are read from the route's answer by its id", () => {
  const list = {
    places: [
      { placeId: "place-a", measures: [measure("2026-10-01", 21.04)] },
      { placeId: "place-b", measures: [] },
    ],
  };
  assert.equal(placeSkyMeasures(list, "place-a").length, 1);
  assert.deepEqual(placeSkyMeasures(list, "place-b"), []);
  assert.deepEqual(placeSkyMeasures(list, "place-c"), []);
  assert.deepEqual(placeSkyMeasures(null, "place-a"), []);
});

test("the place document keeps a typed value through normalisation, and drops a bad one", () => {
  const place = {
    name: "Col des Mélèzes",
    latitude: 45.02,
    longitude: -30.04,
  };
  assert.deepEqual(
    normalizePlace({ ...place, skyEntered: entered }).skyEntered,
    entered,
  );
  assert.equal(
    "skyEntered" in normalizePlace({ ...place, skyEntered: { sqm: 30 } }),
    false,
  );
  assert.equal("skyEntered" in normalizePlace(place), false);
});

test("a model value without a class takes the class of its sqm; one without sqm keeps its class", () => {
  assert.deepEqual(skyBrightnessSource({ model: { sqm: 19.2 } }).shown, {
    sqm: 19.2,
    bortleClass: 6,
  });
  assert.deepEqual(
    skyBrightnessSource({ model: { bortleClass: 5, sqm: null } }).shown,
    { sqm: null, bortleClass: 5 },
  );
});

test("a place of the space keeps a typed value, normalised; a value out of range is refused", async () => {
  // The places of a space are written
  // by `/v1/places` (`place-repository.js`), no longer by the planner's
  // whole document.
  const directory = await mkdtemp(join(tmpdir(), "astro-sky-entered-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  const timestamp = "2026-10-01T20:15:00.000Z";
  try {
    await applyMigrations(driver, "sqlite");
    await driver.run(
      "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
      ["tenant-1", "Test observatory", timestamp],
    );
    const repository = await createPlaceRepository({ driver });
    const place = (skyEntered) => ({
      name: "Col",
      latitude: 45.02,
      longitude: -30.04,
      skyEntered,
      editedAt: timestamp,
    });
    await repository.write({
      tenantId: "tenant-1",
      placeId: "place-typed",
      body: place({ ...entered, meter: "x" }),
      timestamp,
    });
    await assert.rejects(
      repository.write({
        tenantId: "tenant-1",
        placeId: "place-slip",
        body: place({ sqm: 2135, enteredAt: entered.enteredAt }),
        timestamp,
      }),
      (error) => error.code === "invalid_request",
    );
    const loaded = await repository.list({ tenantId: "tenant-1", timestamp });
    assert.deepEqual(
      loaded.places.map((entry) => entry.id),
      ["place-typed"],
    );
    assert.deepEqual(loaded.places[0].skyEntered, entered);
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});
