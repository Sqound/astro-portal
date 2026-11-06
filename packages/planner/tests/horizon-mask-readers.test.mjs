import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normaliseHorizonMask } from "portal/planner/horizon-mask.js";
import { horizonProjectionGeometry } from "../src/horizon-projection.js";
import { withHorizonMask } from "../src/recommendations.js";
import { targetNightPath } from "../src/target-path.js";

// The readers of the horizon mask once it holds one point every 10°. A place
// still carrying the former twelve points (one every 30°) must give every
// reader the same answer as the same mask read onto 36 points.

const twelve = {
  enabled: true,
  points: [12, 8, 5, 0, 0, 3, 10, 22, 35, 28, 18, 14].map(
    (altitude, index) => ({ azimuth: index * 30, altitude }),
  ),
};
const fine = normaliseHorizonMask(twelve);

const start = Date.parse("2026-11-14T18:00:00Z");
// A target rising in the east, high in the south, setting in the west
// behind the 240° bump of the mask: every kind of window the mask can make.
const series = Array.from({ length: 67 }, (_, index) => ({
  time: new Date(start + index * 600000).toISOString(),
  altitude: -4 + 70 * Math.sin((Math.PI * index) / 70),
  azimuth: 70 + index * (230 / 66),
  moonSeparation: 110,
}));

test("the projection's mask is drawn through the 36 directions and closes on the whole ring", () => {
  for (const projection of ["circular", "linear"]) {
    const geometry = horizonProjectionGeometry({ projection, mask: fine });
    assert.equal(geometry.mask.profile.length, 37);
    assert.deepEqual(geometry.mask.profile.at(-1), {
      ...geometry.mask.profile[0],
      ...(projection === "linear" ? { x: 360 } : {}),
    });
    // The former 12-point mask draws the very same profile.
    assert.deepEqual(
      horizonProjectionGeometry({ projection, mask: twelve }).mask,
      geometry.mask,
    );
  }
  const ring = horizonProjectionGeometry({ projection: "circular", mask: fine })
    .mask.closure;
  assert.equal(ring.length, 37);
  // Every corner of the closure sits on the altitude-0 ring, all the way
  // round (the former 13-corner ring reached only 120° on a 10° grid).
  const radii = ring.map((point) => Math.hypot(point.x - 100, point.y - 100));
  assert.ok(radii.every((radius) => Math.abs(radius - radii[0]) < 0.01));
  const angles = new Set(
    ring.map(
      (point) =>
        Math.round(
          (Math.atan2(point.y - 100, point.x - 100) * 180) / Math.PI + 360,
        ) % 360,
    ),
  );
  assert.equal(angles.size, 36);
});

test("the visibility of a target is the same through 12 or 36 points", () => {
  const cards = [{ id: "m31", series, retained: true }];
  const [before] = withHorizonMask(cards, twelve, 20);
  const [after] = withHorizonMask(cards, fine, 20);
  assert.deepEqual(after.visibilityWindows, before.visibilityWindows);
  assert.equal(after.usableMinutes, before.usableMinutes);
  assert.deepEqual(
    after.series.map((point) => point.constraint),
    before.series.map((point) => point.constraint),
  );
  assert.ok(before.series.some((point) => point.horizonBlocked));
});

// Equal, numbers within 1e-9: the 36 points are the 12 read by
// interpolation, which may round the last bit of an in-between altitude.
function assertClose(actual, expected, path = "result") {
  if (typeof expected === "number" && typeof actual === "number") {
    assert.ok(Math.abs(actual - expected) < 1e-9, `${path}: ${actual}`);
    return;
  }
  if (expected && typeof expected === "object") {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
    for (const key of Object.keys(expected))
      assertClose(actual[key], expected[key], `${path}.${key}`);
    return;
  }
  assert.equal(actual, expected, path);
}

test("a target's night path is the same through 12 or 36 points", () => {
  const before = targetNightPath({ series, mask: twelve, minAltitude: 20 });
  const after = targetNightPath({ series, mask: fine, minAltitude: 20 });
  assertClose(after, before);
  assert.ok(before.segments.length > 1);
});

test("the web sky map and the place dialog follow the 10° grid", () => {
  const page = readFileSync(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  // The circular plot's ring has one corner per mask direction, plus north.
  assert.match(page, /length: horizonMaskPointCount \+ 1/);
  assert.doesNotMatch(page, /length: 13\b/);
  const dialog = readFileSync(
    new URL(
      "../../portal/src/components/planner/PlannerPlaceDialog.js",
      import.meta.url,
    ),
    "utf8",
  );
  // A saved or picked mask is edited, and saved, on the 10° grid.
  assert.match(
    dialog,
    /\.\.\.normaliseHorizonMask\(place\?\.horizonMask \|\| emptyHorizon\(\)\)/,
  );
  assert.match(dialog, /\.\.\.normaliseHorizonMask\(profile\.mask\)/);
});
