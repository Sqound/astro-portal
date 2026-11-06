import assert from "node:assert/strict";
import test from "node:test";
import {
  bortleClassOrNull,
  bortleClasses,
  bortleLimitingMagnitude,
  defaultBortleClass,
  defaultStarLinearScale,
  engineSkyBrightness,
  mapBortleClass,
  maximumBortleClass,
  minimumBortleClass,
  surveyBortleIndex,
} from "../src/bortle.js";

// The sky map used to hard-code class 4. These pin the resolution rule (manual
// > place > 4) and the limit of each class: Schaefer's formula on the
// class's typical SQM (`visual-limits.js`, CALIBRATION-SKY-PHOTO-01).

const round2 = (value) => Math.round(value * 100) / 100;

test("the scale runs from 1 to 9", () => {
  assert.equal(minimumBortleClass, 1);
  assert.equal(maximumBortleClass, 9);
  assert.deepEqual(bortleClasses(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("every class carries Schaefer's limit of its typical SQM", () => {
  assert.deepEqual(
    bortleClasses().map((bortle) => round2(bortleLimitingMagnitude(bortle))),
    [6.62, 6.58, 6.53, 6.17, 5.49, 4.92, 4.54, 3.71, 2.65],
  );
});

test("a class outside the scale is clamped rather than refused", () => {
  // A modelled estimate can reach this: a sky is never darker than class 1
  // nor brighter than class 9.
  assert.equal(bortleLimitingMagnitude(0), bortleLimitingMagnitude(1));
  assert.equal(bortleLimitingMagnitude(-3), bortleLimitingMagnitude(1));
  assert.equal(bortleLimitingMagnitude(12), bortleLimitingMagnitude(9));
  assert.equal(bortleLimitingMagnitude(4.4), bortleLimitingMagnitude(4));
});

test("an unusable class falls back to the default's magnitude", () => {
  const fallback = bortleLimitingMagnitude(defaultBortleClass);
  assert.equal(bortleLimitingMagnitude(null), fallback);
  assert.equal(bortleLimitingMagnitude("abc"), fallback);
  assert.equal(bortleLimitingMagnitude(undefined), fallback);
});

test("bortleClassOrNull accepts only an integer of the scale", () => {
  assert.equal(bortleClassOrNull(1), 1);
  assert.equal(bortleClassOrNull(9), 9);
  assert.equal(bortleClassOrNull("5"), 5);
  assert.equal(bortleClassOrNull(0), null);
  assert.equal(bortleClassOrNull(10), null);
  assert.equal(bortleClassOrNull(4.5), null);
  assert.equal(bortleClassOrNull(null), null);
  assert.equal(bortleClassOrNull(undefined), null);
  assert.equal(bortleClassOrNull("dark"), null);
});

test("the map draws at the place's own class when nothing is chosen", () => {
  assert.equal(mapBortleClass({ manual: null, place: 7 }), 7);
});

test("an explicit choice from the control bar wins over the place", () => {
  assert.equal(mapBortleClass({ manual: 2, place: 7 }), 2);
});

test("clearing the choice returns the map to the place's class", () => {
  // The picker's "the place's own class" entry is `null`, not an absent
  // value: it must fall through to `place` rather than to the default.
  assert.equal(mapBortleClass({ manual: null, place: 8 }), 8);
});

test("a place with no estimate falls back to class 4", () => {
  assert.equal(
    mapBortleClass({ manual: null, place: null }),
    defaultBortleClass,
  );
  assert.equal(mapBortleClass({}), defaultBortleClass);
  assert.equal(mapBortleClass(), defaultBortleClass);
});

test("a malformed estimate falls through to the default, not to a clamp", () => {
  assert.equal(mapBortleClass({ place: 0 }), defaultBortleClass);
  assert.equal(mapBortleClass({ place: 42 }), defaultBortleClass);
  assert.equal(mapBortleClass({ place: "rural" }), defaultBortleClass);
});

// The survey backdrop went black under a city sky because the class was
// written straight into `core.bortle_index`, whose `dss.c` term
// `(9 - bortle_index) / 6` reaches zero at class 9. These pin the two
// properties the engine is driven with instead.

test("the engine always sees the class the survey layer is calibrated for", () => {
  // Anything else dims (class 8) or deletes (class 9) the DSS backdrop.
  for (const bortleClass of bortleClasses()) {
    assert.equal(engineSkyBrightness(bortleClass).bortleIndex, 4);
  }
  assert.equal(surveyBortleIndex, 4);
});

test("the star scale carries the class the engine no longer sees", () => {
  // `core.c` sizes a star point with `star_linear_scale + 3/11 -
  // bortle_index/11`. With the index pinned, the scale must move by exactly
  // the term the real class would have contributed.
  const pointTerm = ({ bortleIndex, starLinearScale }) =>
    starLinearScale + 3 / 11 - bortleIndex / 11;
  for (const bortleClass of bortleClasses()) {
    assert.ok(
      Math.abs(
        pointTerm(engineSkyBrightness(bortleClass)) -
          (defaultStarLinearScale + 3 / 11 - bortleClass / 11),
      ) < 1e-12,
      `class ${bortleClass} must keep its own star field`,
    );
  }
});

test("the class the map used to hard-code changes nothing", () => {
  assert.deepEqual(engineSkyBrightness(4), {
    bortleIndex: 4,
    starLinearScale: defaultStarLinearScale,
  });
});

test("a darker sky widens the star points and a brighter one shrinks them", () => {
  assert.ok(
    engineSkyBrightness(1).starLinearScale > defaultStarLinearScale,
    "class 1 must draw more star than class 4",
  );
  assert.ok(
    engineSkyBrightness(9).starLinearScale < defaultStarLinearScale,
    "class 9 must draw less star than class 4",
  );
  // A scale of zero or less would erase the star field altogether.
  assert.ok(engineSkyBrightness(9).starLinearScale > 0);
});

test("an unusable class drives the engine at the default's sky", () => {
  const expected = engineSkyBrightness(defaultBortleClass);
  assert.deepEqual(engineSkyBrightness(null), expected);
  assert.deepEqual(engineSkyBrightness(undefined), expected);
  assert.deepEqual(engineSkyBrightness("abc"), expected);
});

test("a class outside the scale is clamped, as the magnitude table is", () => {
  assert.deepEqual(engineSkyBrightness(0), engineSkyBrightness(1));
  assert.deepEqual(engineSkyBrightness(12), engineSkyBrightness(9));
});
