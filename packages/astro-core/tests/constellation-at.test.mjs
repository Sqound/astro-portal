import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Constellation } from "astronomy-engine";
import {
  constellationAt,
  constellationBoundaryEpochJulianDate,
  precessToBoundaryEpoch,
} from "../dist/constellation-at.js";
import { brightStarTable } from "../dist/bright-star-table.js";
import { constellationBoundaryParallels } from "../dist/constellation-boundaries.js";
import { constellationKeys } from "../dist/constellations.js";

// The IAU constellation that holds a J2000.0 position, from the boundaries of
// the western sky culture (Delporte's, epoch B1875.0).

const skyCulture = JSON.parse(
  readFileSync(
    new URL(
      "../../../public/vendor/stellarium/skydata/skycultures/western/index.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("the table holds the 88 constellations, the Serpent as one", () => {
  assert.deepEqual(
    Object.keys(constellationBoundaryParallels).toSorted(),
    [...constellationKeys].toSorted(),
  );
  assert.equal(constellationKeys.length, 88);
  assert.ok("Ser" in constellationBoundaryParallels);
  assert.ok(!("Se1" in constellationBoundaryParallels));
  // Triples: declination, start and end right ascension.
  for (const [key, list] of Object.entries(constellationBoundaryParallels))
    assert.equal(list.length % 3, 0, key);
  assert.equal(constellationBoundaryEpochJulianDate, 2405889.25855);
});

test("the table is the sky culture's boundaries: 392 parallels, each listed for the two constellations it separates", () => {
  const total = Object.values(constellationBoundaryParallels).reduce(
    (sum, list) => sum + list.length / 3,
    0,
  );
  assert.equal(total, 392 * 2);
  assert.equal(skyCulture.edges.length, 781);
  const parallels = skyCulture.edges.filter((edge) =>
    edge.split(/\s+/)[1].startsWith("P"),
  );
  assert.equal(parallels.length, 392);
});

test("the boundaries tile the sphere: every point has one constellation, and each constellation holds some", () => {
  const found = new Set();
  for (let dec = -89.9; dec < 90; dec += 0.5)
    for (let ra = 0.05; ra < 360; ra += 0.7) {
      const key = constellationAt(ra, dec);
      assert.ok(key, `${ra} ${dec}`);
      found.add(key);
    }
  assert.equal(found.size, 88);
});

test("the poles belong to Ursa Minor and Octans", () => {
  assert.equal(constellationAt(0, 90), "UMi");
  assert.equal(constellationAt(180, 90), "UMi");
  assert.equal(constellationAt(37.95, 89.26), "UMi"); // Polaris
  assert.equal(constellationAt(0, -90), "Oct");
  assert.equal(constellationAt(250, -89.5), "Oct");
});

test("well-known objects are in the constellation everyone knows them in", () => {
  const known = [
    ["Sirius", 101.287, -16.716, "CMa"],
    ["Vega", 279.234, 38.784, "Lyr"],
    ["Betelgeuse", 88.793, 7.407, "Ori"],
    // Their lines are drawn in another constellation than the one that holds
    // them: Alpheratz is Andromeda's, Elnath is the Bull's.
    ["Alpheratz", 2.097, 29.09, "And"],
    ["Elnath", 81.573, 28.608, "Tau"],
    // Rigil Kentaurus, 4.6 degrees from the Compass: read as if the boundaries
    // were J2000.0 it falls in Circinus.
    ["Rigil Kentaurus", 219.9, -60.835, "Cen"],
    ["Rasalhague", 263.736, 12.56, "Oph"],
    ["Unukalhai", 236.067, 6.426, "Ser"],
    ["Alya (Serpens Cauda)", 284.054, 4.204, "Ser"],
    // Barnard's Star, in Ophiuchus a few degrees from the Serpent's tail.
    ["Barnard's Star", 269.452, 4.693, "Oph"],
    ["Crab Nebula", 83.633, 22.015, "Tau"],
    ["Orion Nebula", 83.822, -5.391, "Ori"],
    ["Andromeda Galaxy", 10.685, 41.269, "And"],
    ["Horsehead", 85.25, -2.458, "Ori"],
    ["Omega Centauri", 201.697, -47.48, "Cen"],
    ["Sagittarius A*", 266.417, -29.008, "Sgr"],
  ];
  for (const [name, ra, dec, expected] of known)
    assert.equal(constellationAt(ra, dec), expected, name);
});

test("the Serpent's two parts and Ophiuchus between them", () => {
  // The head (Caput) west of Ophiuchus, the tail (Cauda) east: one key.
  assert.equal(constellationAt(237, 10), "Ser"); // 15h48m +10°
  assert.equal(constellationAt(283, 5), "Ser"); // 18h52m +5°
  assert.equal(constellationAt(260, 0), "Oph"); // 17h20m 0°
  assert.equal(constellationAt(248, 10), "Her"); // 16h32m +10°
});

test("the right ascension wraps around zero", () => {
  assert.equal(constellationAt(359.9, 20), constellationAt(-0.1, 20));
  assert.equal(constellationAt(0.1, 20), constellationAt(360.1, 20));
  assert.equal(constellationAt(1, 25), "Peg");
  assert.equal(constellationAt(359, 25), "Peg");
});

test("neighbours across a boundary are told apart", () => {
  // Alpheratz (Andromeda) and Algenib (Pegasus) are 14° apart on the two
  // sides of their boundary; so are Rasalhague and Rasalgethi.
  assert.equal(constellationAt(2.097, 29.09), "And");
  assert.equal(constellationAt(3.309, 15.184), "Peg");
  assert.equal(constellationAt(263.736, 12.56), "Oph");
  assert.equal(constellationAt(258.662, 14.39), "Her");
});

test("a value that is not a position has no constellation", () => {
  assert.equal(constellationAt(Number.NaN, 10), null);
  assert.equal(constellationAt(10, Number.NaN), null);
  assert.equal(constellationAt(10, 91), null);
  assert.equal(constellationAt(10, -90.5), null);
  assert.equal(constellationAt(Number.POSITIVE_INFINITY, 0), null);
  assert.equal(constellationAt("10", 0), null);
  assert.equal(constellationAt(undefined, undefined), null);
});

test("the boundaries are read at B1875.0: precessing moves a position by about two degrees", () => {
  // 125 years of precession: 3.07 seconds of time a year at the vernal
  // equinox (1.6° of right ascension), the declination moving by 20″ a year
  // there and not at all a quarter turn away.
  const [ra, dec] = precessToBoundaryEpoch(0, 0);
  assert.ok(ra / 240 > 358 && ra / 240 < 359, `${ra / 240}`);
  assert.ok(Math.abs(dec / 3600 + 0.7) < 0.05, `${dec / 3600}`);
  const [raNorth, decNorth] = precessToBoundaryEpoch(90, 0);
  assert.ok(raNorth / 240 > 88 && raNorth / 240 < 89, `${raNorth / 240}`);
  assert.ok(Math.abs(decNorth / 3600) < 0.01, `${decNorth / 3600}`);
});

test("the 92 bright stars are in the constellation astronomy-engine and the star catalogue give them", () => {
  assert.equal(brightStarTable.length, 92);
  for (const star of brightStarTable) {
    assert.equal(
      constellationAt(star.ra, star.dec),
      Constellation(star.ra / 15, star.dec).symbol,
      `HIP ${star.hip}`,
    );
    assert.equal(constellationAt(star.ra, star.dec), star.constellation);
  }
});

test("it agrees with astronomy-engine's Constellation, but within ten seconds of arc of a boundary", () => {
  let seed = 20261030;
  const random = () =>
    (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  let different = 0;
  const points = 40000;
  for (let index = 0; index < points; index += 1) {
    const ra = random() * 360;
    const dec = (Math.asin(2 * random() - 1) * 180) / Math.PI;
    if (constellationAt(ra, dec) !== Constellation(ra / 15, dec).symbol)
      different += 1;
  }
  // 58 in 400 000 when this was written: ten seconds of arc of precession
  // model on a boundary 4 degrees long on average.
  assert.ok(different <= points * 0.0006, `${different} of ${points}`);
});
