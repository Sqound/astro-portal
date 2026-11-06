import assert from "node:assert/strict";
import test from "node:test";
import {
  PLACE_SKY_MEASURE_SAME_PLACE_KM,
  nearestPlace,
  nightOfInstant,
  validatePlaceSkyMeasureUpload,
} from "../dist/persistence/place-sky-measure-repository.js";

// The rules the service applies to the night's measured sky background
// before it stores it.

const valid = {
  sessionId: "0B9F3C1E-6D0A-4F5E-9A3B-2C1D0E9F8A7B",
  site: { latitude: 45.0, longitude: -30.0 },
  observedAt: "2026-10-11T07:11:00+02:00",
  sqm: 21.0449,
  poseCount: 14,
  methodVersion: "astro-sync-sky/1",
};

const refusal = (body) => {
  try {
    validatePlaceSkyMeasureUpload(body);
  } catch (error) {
    return error;
  }
  assert.fail(`accepted: ${JSON.stringify(body)}`);
};

test("an upload is the night's one number and its evidence, normalised", () => {
  assert.deepEqual(validatePlaceSkyMeasureUpload(valid), {
    sessionId: "0b9f3c1e-6d0a-4f5e-9a3b-2c1d0e9f8a7b",
    site: { latitude: 45, longitude: -30 },
    observedAt: "2026-10-11T05:11:00.000Z",
    sqm: 21.04,
    poseCount: 14,
    methodVersion: "astro-sync-sky/1",
  });
  const { sessionId: _session, ...siteOnly } = valid;
  assert.equal(validatePlaceSkyMeasureUpload(siteOnly).sessionId, null);
});

test("anything else, or a value out of range, is invalid_request", () => {
  for (const body of [
    null,
    [],
    { ...valid, frames: [] },
    { ...valid, sqm: 9.9 },
    { ...valid, sqm: Number.NaN },
    { ...valid, poseCount: 2.5 },
    { ...valid, methodVersion: "astro-sync-sky/0" },
    { ...valid, observedAt: "2026-10-11" },
    { ...valid, site: { latitude: 91, longitude: 0 } },
    { ...valid, site: { latitude: "45", longitude: "-30" } },
    { ...valid, sessionId: 42 },
    {
      observedAt: valid.observedAt,
      sqm: 21,
      poseCount: 3,
      methodVersion: "astro-sync-sky/1",
    },
  ]) {
    const error = refusal(body);
    assert.equal(error.code, "invalid_request", JSON.stringify(body));
    assert.equal(error.status, 400);
  }
});

test("the night of an instant is the date at the place's longitude, noon to noon (Astro Sync's night_of)", () => {
  // The cases of astro-sync-core's sky_night tests.
  assert.equal(nightOfInstant("2026-10-11T02:00:00Z", -30), "2026-10-10");
  assert.equal(nightOfInstant("2026-10-11T14:00:00Z", 30), "2026-10-11");
  assert.equal(nightOfInstant("2026-01-01T14:00:00Z", 139.7), "2026-01-01");
  assert.equal(nightOfInstant("2026-10-11T05:11:00.000Z", -30), "2026-10-10");
});

test("a position belongs to the nearest of the account's places within 500 m, or to none", () => {
  const places = [
    {
      clientId: "col",
      details: { latitude: "45.00000", longitude: "-30.00000" },
    },
    {
      clientId: "lac",
      details: { latitude: "45.00800", longitude: "-30.00000" },
    },
  ];
  assert.equal(PLACE_SKY_MEASURE_SAME_PLACE_KM, 0.5);
  assert.equal(
    nearestPlace(places, { latitude: 45.003, longitude: -30 })?.clientId,
    "col",
  );
  assert.equal(
    nearestPlace(places, { latitude: 45.005, longitude: -30 })?.clientId,
    "lac",
  );
  assert.equal(nearestPlace(places, { latitude: 44.99, longitude: -30 }), null);
  assert.equal(nearestPlace([], { latitude: 45, longitude: -30 }), null);
});
