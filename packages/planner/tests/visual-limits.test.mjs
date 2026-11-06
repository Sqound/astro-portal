import assert from "node:assert/strict";
import test from "node:test";
import {
  instrumentLimitingMagnitude,
  nakedEyeLimitingMagnitude,
  schaeferLimitingMagnitude,
  skySqmOf,
  skySqmOfBortle,
} from "../src/visual-limits.js";

// The one limiting magnitude of the planner (CALIBRATION-SKY-PHOTO-01): the
// same worked examples as the phone applications'.

const round1 = (value) => Math.round(value * 10) / 10;

test("the naked eye: Schaefer on the class's typical SQM (CSP-8)", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((bortle) =>
      round1(nakedEyeLimitingMagnitude({ bortle })),
    ),
    [6.6, 6.6, 6.5, 6.2, 5.5, 4.9, 4.5, 3.7, 2.7],
  );
});

test("a measured SQM wins over the class; neither reads class 4", () => {
  assert.equal(
    nakedEyeLimitingMagnitude({ sqm: 21.5, bortle: 9 }),
    schaeferLimitingMagnitude(21.5),
  );
  assert.equal(
    nakedEyeLimitingMagnitude({}),
    nakedEyeLimitingMagnitude({ bortle: 4 }),
  );
  assert.equal(skySqmOf({ sqm: 0, bortle: 2 }), 21.9);
  assert.equal(skySqmOf({}), null);
  assert.equal(skySqmOfBortle(0), 22);
  assert.equal(skySqmOfBortle(12), 16.5);
});

test("the instrument: the exit pupil darkens the sky (CSP-8, Bortle 4)", () => {
  const cases = [
    // [aperture, telescope focal, eyepiece focal, limit]
    [80, 900, 32, 12.3],
    [80, 900, 10, 12.9],
    [254, 1250, 25, 14.3],
    [203, 2032, 25, 14.4],
    [90, 1250, 32, 12.7],
  ];
  for (const [apertureMm, telescope, eyepiece, limit] of cases) {
    const magnification = telescope / eyepiece;
    assert.equal(
      round1(
        instrumentLimitingMagnitude({
          apertureMm,
          sqm: 21.1,
          exitPupilMm: apertureMm / magnification,
        }),
      ),
      limit,
    );
  }
});

test("the instrument without a sky, without an aperture", () => {
  assert.equal(
    instrumentLimitingMagnitude({ apertureMm: 100 }),
    2.7 + 5 * Math.log10(100),
  );
  assert.ok(Number.isNaN(instrumentLimitingMagnitude({ apertureMm: 0 })));
});
