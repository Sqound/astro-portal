import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  clampMapFov,
  formatMapFov,
  maximumMapFovDegrees,
  minimumMapFovDegrees,
  pinchedMapFov,
  roundedMapFov,
  zoomedMapFov,
} from "../src/sky-projection.js";

// Rationale: the map may zoom in a bit more as long as it does not cause a
// resolution problem with the background. The narrowest field of the
// detailed map goes from 0.7° to 0.25° (15′), and the pinch gesture, which
// used to carry a copy of the bound of its own, reads the same constant as the
// zoom buttons and the wheel.

test("the narrowest field of the map is 0.25° -- 15 arcminutes", () => {
  assert.equal(minimumMapFovDegrees, 0.25);
  assert.equal(clampMapFov(0.1), 0.25);
  assert.equal(clampMapFov(0), 0.25);
  assert.equal(clampMapFov(-3), 0.25);
  assert.equal(clampMapFov(0.25), 0.25);
  assert.equal(clampMapFov(0.26), 0.26);
});

test("the widest field and the default for an unreadable value are unchanged", () => {
  assert.equal(maximumMapFovDegrees, 170);
  assert.equal(clampMapFov(400), 170);
  assert.equal(clampMapFov("not a number"), 120);
});

test("the zoom buttons and the wheel stop at the same bound", () => {
  // The buttons multiply by 0.68, the wheel by up to 0.78: both reach the
  // bound from a narrow field and neither goes through it.
  assert.equal(zoomedMapFov(0.3, 0.68), 0.25);
  assert.equal(zoomedMapFov(0.3, 0.78), 0.25);
  assert.equal(zoomedMapFov(0.25, 0.68), 0.25);
  // The old bound no longer stops them: 0.7° zooms in to 0.476°.
  assert.ok(Math.abs(zoomedMapFov(0.7, 0.68) - 0.476) < 1e-9);
});

test("a pinch stops at the bound the buttons stop at", () => {
  // Fingers spread to ten times their starting distance: 1° would become
  // 0.1°, and the gate turns that into the bound.
  assert.equal(pinchedMapFov(1, 100, 1000), minimumMapFovDegrees);
  // Well inside the bounds, a pinch is the plain distance ratio.
  assert.ok(Math.abs(pinchedMapFov(45, 100, 125) - 36) < 1e-9);
  assert.ok(Math.abs(pinchedMapFov(4, 200, 100) - 8) < 1e-9);
  // Fingers brought together on a wide field stop at the widest one.
  assert.equal(pinchedMapFov(160, 300, 100), maximumMapFovDegrees);
});

test("a pinch and a button that land on the same field agree", () => {
  const start = 2;
  assert.equal(
    pinchedMapFov(start, 100, 100 / 0.05),
    zoomedMapFov(start, 0.05),
  );
});

test("a degenerate pinch never produces an unreadable field", () => {
  assert.equal(pinchedMapFov(30, 0, 100), 30);
  assert.equal(pinchedMapFov(30, 100, 0), 30);
  assert.equal(pinchedMapFov(Number.NaN, 100, 100), 120);
});

test("the map component carries no copy of the bounds", async () => {
  const source = await readFile(
    new URL("../src/components/PlannerNightSkyMap.js", import.meta.url),
    "utf8",
  );
  // The pinch handler's own `0.7 * stel.D2R` and `170 * stel.D2R` were the
  // second and third copies of the bound.
  assert.doesNotMatch(source, /\b0\.7\b/);
  assert.doesNotMatch(source, /\b170\s*\*\s*stel\.D2R/);
  assert.match(source, /pinchedMapFov/);
});

test("the readout prints arcminutes below one degree", () => {
  assert.equal(formatMapFov(0.25, "en"), "15′");
  assert.equal(formatMapFov(0.25, "fr"), "15′");
  assert.equal(formatMapFov(0.25, "ja"), "15′");
  assert.equal(formatMapFov(0.5, "en"), "30′");
  assert.equal(formatMapFov(0.7, "en"), "42′");
  assert.equal(formatMapFov(0.99, "en"), "59′");
});

test("the readout prints degrees from one degree up", () => {
  assert.equal(formatMapFov(1, "en"), "1°");
  assert.equal(formatMapFov(2.4, "en"), "2.4°");
  assert.equal(formatMapFov(2.4, "fr"), "2,4°");
  assert.equal(formatMapFov(45, "en"), "45°");
  assert.equal(formatMapFov(120, "en"), "120°");
  assert.equal(formatMapFov(170, "fr"), "170°");
});

test("the readout never writes a degree as sixty arcminutes", () => {
  assert.equal(formatMapFov(0.995, "en"), "1°");
  assert.equal(formatMapFov(0.9999, "en"), "1°");
});

test("an unreadable field prints a dash", () => {
  assert.equal(formatMapFov(Number.NaN, "en"), "—");
  assert.equal(formatMapFov(undefined, "fr"), "—");
});

test("the readout keeps a hundredth of a degree below one degree", () => {
  // 0.25° rounded to a tenth would read 0.3° -- a sixth too wide.
  assert.equal(roundedMapFov(0.2504), 0.25);
  assert.equal(roundedMapFov(0.254), 0.25);
  assert.equal(roundedMapFov(0.256), 0.26);
  assert.equal(roundedMapFov(0.25 + 1e-12), 0.25);
  // From a degree up the readout is unchanged: a tenth.
  assert.equal(roundedMapFov(4.44), 4.4);
  assert.equal(roundedMapFov(120.04), 120);
  assert.ok(Number.isNaN(roundedMapFov("nope")));
});

test("what the map stores for the readout prints as the narrowest field", () => {
  // The engine reports the field it was asked for, in radians, after the
  // gate: 0.25° comes back as 0.2500000000000001 or so.
  const reported = (0.25 * Math.PI) / 180;
  const stored = roundedMapFov((reported * 180) / Math.PI);
  assert.equal(formatMapFov(stored, "fr"), "15′");
});
