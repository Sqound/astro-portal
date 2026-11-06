import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultHorizonMask,
  horizonAltitude,
  horizonMaskPointCount,
  horizonMaskStep,
  normaliseHorizonMask,
} from "../src/planner/horizon-mask.js";
import { emptyHorizon } from "../src/planner/state.js";

// The horizon mask on the 10° grid (one point every 10°, thirty-six points).
// A mask stored on the former 30° grid is read onto the new one by linear
// interpolation: that is the whole migration, so its curve must not move.

// The former interpolation, written out: twelve samples, 30° apart.
function formerAltitude(points, azimuth) {
  const a = ((azimuth % 360) + 360) % 360;
  const next = Math.ceil(a / 30) % 12;
  const previous = (next - 1 + 12) % 12;
  const from = previous * 30;
  const to = next > previous ? next * 30 : next * 30 + 360;
  const at = a < from ? a + 360 : a;
  return (
    points[previous].altitude +
    (points[next].altitude - points[previous].altitude) *
      ((at - from) / (to - from))
  );
}

const twelvePoint = (altitudes) => ({
  enabled: true,
  points: altitudes.map((altitude, index) => ({
    azimuth: index * 30,
    altitude,
  })),
});

const close = (actual, expected, message) =>
  assert.ok(
    Math.abs(actual - expected) <= 1e-9,
    `${message}: ${actual} != ${expected}`,
  );

test("the grid is one point every 10°: thirty-six points from 0 to 350", () => {
  assert.equal(horizonMaskStep, 10);
  assert.equal(horizonMaskPointCount, 36);
  const mask = defaultHorizonMask();
  assert.equal(mask.enabled, false);
  assert.deepEqual(
    mask.points.map((point) => point.azimuth),
    Array.from({ length: 36 }, (_, index) => index * 10),
  );
  assert.ok(mask.points.every((point) => point.altitude === 0));
  // The place editor's flat profile is the same grid, switched on.
  assert.deepEqual(emptyHorizon(), { ...defaultHorizonMask(), enabled: true });
});

test("a 12-point mask gives the same altitude at every degree once read onto 36 points", () => {
  const masks = [
    twelvePoint([12, 8, 5, 0, 0, 3, 10, 22, 35, 28, 18, 14]),
    twelvePoint([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 90]),
    twelvePoint([7.3, 41.25, 0.1, 89.9, 15, 15, 15, 2.5, 60, 33.3, 0, 12.7]),
  ];
  for (const mask of masks) {
    const fine = normaliseHorizonMask(mask);
    assert.equal(fine.points.length, 36);
    // The former samples stay, to the bit, at their own azimuths.
    for (const point of mask.points)
      assert.equal(fine.points[point.azimuth / 10].altitude, point.altitude);
    for (let tenth = 0; tenth < 3600; tenth += 1) {
      const azimuth = tenth / 10;
      const expected = formerAltitude(mask.points, azimuth);
      close(
        horizonAltitude(mask, azimuth),
        expected,
        `12 points at ${azimuth}°`,
      );
      close(
        horizonAltitude(fine, azimuth),
        expected,
        `36 points at ${azimuth}°`,
      );
    }
  }
});

test("reading a mask twice changes nothing: 36 points are their own normal form", () => {
  const once = normaliseHorizonMask(
    twelvePoint([12, 8, 5, 0, 0, 3, 10, 22, 35, 28, 18, 14]),
  );
  assert.deepEqual(normaliseHorizonMask(once), once);
  const shuffled = { ...once, points: [...once.points].reverse() };
  assert.deepEqual(normaliseHorizonMask(shuffled), once);
});

test("altitudes are held between 0° and 90°, azimuths wrap round north", () => {
  const mask = normaliseHorizonMask({
    enabled: true,
    points: [
      { azimuth: 360, altitude: 120 },
      { azimuth: -10, altitude: -5 },
      { azimuth: 20, altitude: 45 },
    ],
  });
  assert.equal(mask.points[0].altitude, 90);
  assert.equal(mask.points[35].altitude, 0);
  assert.equal(mask.points[2].altitude, 45);
  assert.ok(
    mask.points.every((point) => point.altitude >= 0 && point.altitude <= 90),
  );
  assert.equal(horizonAltitude(mask, 360), 90);
  assert.equal(horizonAltitude(mask, -340), 45);
});

test("a grid between 10° and 30° is interpolated; anything finer snaps to the nearest 10°", () => {
  // Twenty-four points at 15°, 30° at 15° only: 10° is two thirds of the way
  // up to it, 20° a third of the way down, 30° back on a flat node.
  const fifteen = normaliseHorizonMask({
    enabled: true,
    points: Array.from({ length: 24 }, (_, index) => ({
      azimuth: index * 15,
      altitude: index === 1 ? 30 : 0,
    })),
  });
  close(fifteen.points[1].altitude, 20, "10° on a 15° grid");
  close(fifteen.points[2].altitude, 20, "20° on a 15° grid");
  assert.equal(fifteen.points[3].altitude, 0);
  // Off every grid: 17° goes to 20°, and the closer of two points wins.
  const loose = normaliseHorizonMask({
    enabled: true,
    points: [
      { azimuth: 17, altitude: 12 },
      { azimuth: 21, altitude: 4 },
      { azimuth: 95, altitude: 5 },
    ],
  });
  assert.equal(loose.points[2].altitude, 4);
  assert.equal(loose.points[10].altitude, 5);
  assert.equal(loose.points[1].altitude, 0);
});

test("an absent, empty or malformed mask is the flat default, switched off", () => {
  for (const value of [null, undefined, 3, "mask", {}, { points: "x" }])
    assert.deepEqual(normaliseHorizonMask(value), defaultHorizonMask());
  assert.equal(horizonAltitude(null, 123), 0);
  const kept = normaliseHorizonMask({
    enabled: true,
    points: [{ azimuth: "x", altitude: 10 }, { altitude: 30 }],
  });
  assert.equal(kept.enabled, true);
  assert.ok(kept.points.every((point) => point.altitude === 0));
});

test("every mask the readers produce is the 36-point contract", async () => {
  const { readFile } = await import("node:fs/promises");
  const { assertValid } =
    await import("../../astro-contracts/tests/schema-assert.mjs");
  const schema = JSON.parse(
    await readFile(
      new URL(
        "../../astro-contracts/schemas/planner/horizon-mask.schema.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const value of [
    null,
    twelvePoint([12, 8, 5, 0, 0, 3, 10, 22, 35, 28, 18, 14]),
    { enabled: true, points: [{ azimuth: 17, altitude: 120 }] },
    emptyHorizon(),
  ])
    assertValid(schema, normaliseHorizonMask(value));
});

test("a mask already on the 10° grid is read as stored", () => {
  const fine = normaliseHorizonMask(
    twelvePoint([12, 8, 5, 0, 0, 3, 10, 22, 35, 28, 18, 14]),
  );
  // An extra field on a point leaves the stored grid as it is; a point out
  // of order or out of range sends the mask through the full reading, which
  // gives the same altitudes.
  const tagged = {
    ...fine,
    points: fine.points.map((point) => ({ ...point, source: "editor" })),
  };
  const reordered = { ...fine, points: [...fine.points].reverse() };
  for (let azimuth = 0; azimuth < 360; azimuth += 2.5) {
    const expected = horizonAltitude(fine, azimuth);
    assert.equal(horizonAltitude(tagged, azimuth), expected);
    assert.equal(horizonAltitude(reordered, azimuth), expected);
  }
});
