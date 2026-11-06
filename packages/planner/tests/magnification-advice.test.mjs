import assert from "node:assert/strict";
import test from "node:test";
import {
  magnificationAdvice,
  magnificationAdviceConstants,
} from "../src/magnification-advice.js";
import {
  resolveEquipment,
  telescopeProfiles,
  eyepieceProfiles,
} from "../src/planner.js";

// The advice on a magnification: from the aperture alone, the resolution, the
// useful maximum, and a level (ok, near-limit, beyond, far-beyond, low-power).

const levelOf = (aperture, magnification) =>
  magnificationAdvice(aperture, magnification).level;

test("the levels follow 1.5, 2 and 2.5 times the aperture, and a 7 mm exit pupil", () => {
  assert.deepEqual(magnificationAdviceConstants, {
    usefulPerMm: 2,
    nearLimitPerMm: 1.5,
    farBeyondPerMm: 2.5,
    resolvingPerMm: 0.5,
    lowPowerPupilMm: 7,
    dawesArcsec: 116,
  });
  assert.equal(levelOf(100, 150), "ok");
  assert.equal(levelOf(100, 150.5), "near-limit");
  assert.equal(levelOf(100, 200), "near-limit");
  assert.equal(levelOf(100, 200.5), "beyond");
  assert.equal(levelOf(100, 250), "beyond");
  assert.equal(levelOf(100, 250.5), "far-beyond");
  assert.equal(levelOf(70, 10), "ok");
  assert.equal(levelOf(70, 9.9), "low-power");
});

test("the figures: Dawes limit, useful maximum, magnification that shows the resolution", () => {
  const advice = magnificationAdvice(203.2, 300);
  assert.equal(advice.dawesArcsec, 0.57);
  assert.equal(advice.usefulMaxMagnification, 400);
  assert.equal(advice.resolvingMagnification, 101);
  assert.ok(Math.abs(advice.exitPupilMm - 0.6773) < 1e-3);
  assert.equal(magnificationAdvice(null, 100), null);
  assert.equal(magnificationAdvice(100, 0), null);
});

test("the cases of the catalogue: an 8-inch Dobson at 300x is within, with a 3x Barlow at 900x it is far beyond, an 80 mm refractor at 10x loses light", () => {
  const profileOf = (telescopeId, eyepieceId, modifierId = "none") =>
    resolveEquipment({
      telescopeId,
      eyepieceId,
      modifierId,
      cameraId: null,
      mode: "visual",
    });
  const dobson = telescopeProfiles.find(
    (profile) => profile.id === "skywatcher-dobson-200-1200",
  );
  assert.ok(dobson);
  assert.ok(eyepieceProfiles.some((profile) => profile.id));
  const within = profileOf("skywatcher-dobson-200-1200", "baader-hyperion-5");
  // 1 200 / 5 = 240x: within.
  assert.equal(
    magnificationAdvice(within.apertureMm, within.magnification).level,
    "ok",
  );
  const barlow3 = profileOf(
    "skywatcher-dobson-200-1200",
    "baader-morpheus-4-5",
    "svbony-sv216-barlow-3x",
  );
  // 1 200 x 3 / 4.5 = 800x: far beyond.
  assert.equal(
    magnificationAdvice(barlow3.apertureMm, barlow3.magnification).level,
    "far-beyond",
  );
  const refractor = profileOf("skywatcher-startravel-80", "plossl-40");
  assert.equal(
    magnificationAdvice(refractor.apertureMm, refractor.magnification).level,
    "low-power",
  );
});
