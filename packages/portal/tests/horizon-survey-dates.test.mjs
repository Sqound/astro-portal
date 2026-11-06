import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlaceWrite } from "../dist/persistence/place-repository.js";
import {
  steppedHorizonMask,
  withHorizonPointAltitude,
  withHorizonPointAltitudes,
} from "../src/planner/horizon-editor.js";
import {
  horizonSurveyDates,
  normaliseHorizonMask,
} from "../src/planner/horizon-mask.js";

// Each 10° sector of a place's horizon mask may
// carry `surveyedAt`, the instant it was last surveyed — in augmented reality
// on the phone, or moved by hand in an editor. Existing masks have none:
// every sector is « à relever », nothing is migrated. The phone reads and
// writes the same.

const flat = (dates = {}) => ({
  enabled: true,
  points: Array.from({ length: 36 }, (_, index) => ({
    azimuth: index * 10,
    altitude: 5,
    ...(dates[index] ? { surveyedAt: dates[index] } : {}),
  })),
});

const dated = (mask) =>
  horizonSurveyDates(mask).flatMap((at, index) => (at ? [index] : []));

test("a mask on the 10° grid keeps its survey dates; a wrong one is dropped", () => {
  const mask = normaliseHorizonMask(
    flat({ 0: "2026-10-31T01:50:00.000Z", 18: "ce matin" }),
  );
  assert.deepEqual(dated(mask), [0]);
  assert.equal(mask.points[0].surveyedAt, "2026-10-31T01:50:00.000Z");
  assert.equal("surveyedAt" in mask.points[18], false);
});

test("an existing mask, or a coarser grid, is « à relever » everywhere", () => {
  assert.deepEqual(dated(flat()), []);
  assert.deepEqual(dated(null), []);
  assert.deepEqual(
    dated({
      enabled: true,
      points: Array.from({ length: 12 }, (_, index) => ({
        azimuth: index * 30,
        altitude: 6,
        surveyedAt: "2026-10-31T01:50:00.000Z",
      })),
    }),
    [],
  );
});

test("a point moved by hand in the web editor is surveyed then", () => {
  const at = new Date("2026-10-31T02:12:00.000Z");
  const moved = withHorizonPointAltitude(flat(), 9, 14, at);
  assert.deepEqual(dated(moved), [9]);
  assert.equal(moved.points[9].surveyedAt, "2026-10-31T02:12:00.000Z");
  const drawn = withHorizonPointAltitudes(
    flat({ 0: "2026-10-31T01:50:00.000Z" }),
    [
      { index: 20, altitude: 30 },
      { index: 21, altitude: 32 },
    ],
    at,
  );
  assert.deepEqual(dated(drawn), [0, 20, 21]);
  assert.deepEqual(dated(steppedHorizonMask(flat(), 4, 1)), [4]);
});

test("the service keeps a point's survey instant and refuses one that is not", () => {
  const body = {
    name: "Maison",
    latitude: 36.52533,
    longitude: 139.87718,
    timeZone: "Asia/Tokyo",
    editedAt: "2026-10-31T02:13:00.000Z",
    horizonMask: flat({ 18: "2026-10-31T02:12:00Z" }),
  };
  const { details } = normalizePlaceWrite(body, "maison");
  assert.equal(
    details.horizonMask.points[18].surveyedAt,
    "2026-10-31T02:12:00.000Z",
  );
  assert.equal("surveyedAt" in details.horizonMask.points[17], false);
  assert.throws(
    () =>
      normalizePlaceWrite(
        { ...body, horizonMask: flat({ 18: "ce matin" }) },
        "maison",
      ),
    /surveyedAt/,
  );
});
