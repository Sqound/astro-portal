import assert from "node:assert/strict";
import test from "node:test";

import {
  skyQualityCalibrationAt,
  skyQualityCalibrationRegions,
  skyQualityCalibrationVersion,
  skyQualityLuminancePerRadiance,
  skyQualityPointInPolygons,
} from "portal/sky-quality.js";

import {
  borderProblems,
  edgesOf,
  ringProblems,
  tableBorderProblems,
} from "./helpers/region-borders.mjs";

// ── The shipped table ───────────────────────────────────────────────────

test("every region carries a provenance with its licence, its counts and its data window", () => {
  const ids = new Set();
  for (const region of skyQualityCalibrationRegions) {
    assert.match(region.id, /^[a-z][a-z0-9-]*$/);
    assert.notEqual(region.id, "global");
    assert.equal(ids.has(region.id), false, `duplicate id ${region.id}`);
    ids.add(region.id);
    const provenance = region.provenance;
    assert.ok(provenance.source?.length > 20, `${region.id}: source`);
    assert.ok(provenance.license?.length > 20, `${region.id}: licence`);
    for (const count of ["measurements", "cells"])
      assert.ok(
        Number.isInteger(provenance[count]) && provenance[count] > 0,
        `${region.id}: ${count}`,
      );
    assert.ok(provenance.cells <= provenance.measurements);
    assert.ok(provenance.rms > 0 && provenance.rms < 2, `${region.id}: rms`);
    assert.ok(Number.isFinite(provenance.bias), `${region.id}: bias`);
    assert.match(provenance.dataThrough, /^\d{4}(-\d{4})?$/);
    // A region fitted on few cells says so wherever it is documented.
    if (provenance.cells < 100)
      assert.match(
        provenance.note || "",
        /few|thin/i,
        `${region.id}: thin fit`,
      );
    // Three decimals, like the global constant, and a different constant.
    assert.equal(
      region.luminancePerRadiance,
      Number(region.luminancePerRadiance.toFixed(3)),
    );
    assert.notEqual(
      region.luminancePerRadiance,
      skyQualityLuminancePerRadiance,
    );
  }
});

test("every ring of the table is simple and closed, and no two regions overlap or leave a gap", () => {
  const { problems, borders } = tableBorderProblems(
    skyQualityCalibrationRegions,
    skyQualityPointInPolygons,
  );
  assert.deepEqual(problems, []);
  // Each shared border resolves to its own region on either side.
  for (const border of borders)
    for (const [start, end] of border.edges) {
      const middle = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
      const normal = [-(end[1] - start[1]), end[0] - start[0]];
      const length = Math.hypot(...normal);
      const owners = [1, -1].map((side) => {
        const at = [
          middle[0] + (side * 1e-6 * normal[0]) / length,
          middle[1] + (side * 1e-6 * normal[1]) / length,
        ];
        return skyQualityCalibrationAt(at[0], at[1]).id;
      });
      assert.deepEqual(
        [...owners].sort(),
        [border.first, border.second].sort(),
      );
    }
});

test("a point in no region keeps the global constant", () => {
  for (const [latitude, longitude] of [
    [0, -140], // open Pacific
    [-80, 0], // Antarctica
    [64.1, -21.9],
    [-33.9, 18.4],
    [51.5, -0.1],
  ])
    assert.deepEqual(skyQualityCalibrationAt(latitude, longitude), {
      id: "global",
      luminancePerRadiance: skyQualityLuminancePerRadiance,
    });
});

test("the calibration version is a year-month stamp, bumped only when the table or a constant changes", () => {
  assert.match(skyQualityCalibrationVersion, /^\d{4}-\d{2}$/);
});

// ── The checks themselves, on small synthetic tables ────────────────────

const lookup = (regions) => (latitude, longitude) =>
  regions.find((region) =>
    skyQualityPointInPolygons(latitude, longitude, region.polygons),
  )?.id ?? "global";

test("two regions that share a border chain have neither a gap nor an overlap, and each side resolves to its own region", () => {
  // `east` walks the same chain in the opposite direction.
  const west = {
    id: "west",
    polygons: [
      [
        [50, 0],
        [50, 10],
        [48, 12],
        [46, 10],
        [44, 12],
        [40, 12],
        [40, 0],
      ],
    ],
  };
  const east = {
    id: "east",
    polygons: [
      [
        [50, 10],
        [50, 20],
        [40, 20],
        [40, 12],
        [44, 12],
        [46, 10],
        [48, 12],
      ],
    ],
  };
  const south = {
    id: "south",
    polygons: [
      [
        [40, 0],
        [40, 12],
        [35, 12],
        [35, 0],
      ],
    ],
  };
  const table = [west, east, south];
  const result = tableBorderProblems(table, skyQualityPointInPolygons);
  assert.deepEqual(result.problems, []);
  const pairs = result.borders.map(
    (border) => `${border.first}/${border.second}`,
  );
  assert.deepEqual(pairs.sort(), ["west/east", "west/south"]);
  assert.equal(
    result.borders.find((b) => b.first === "west" && b.second === "east").edges
      .length,
    4,
  );
  const resolve = lookup(table);
  // One probe on each side of the zigzag, at several heights.
  assert.equal(resolve(49, 9.5), "west");
  assert.equal(resolve(49, 11.5), "east");
  assert.equal(resolve(45.5, 9.5), "west");
  assert.equal(resolve(45.5, 10.5), "east");
  assert.equal(resolve(42, 11.9), "west");
  assert.equal(resolve(42, 12.1), "east");
  assert.equal(resolve(39, 6), "south");
  assert.equal(resolve(41, 6), "west");
  // A point in no region is the global constant.
  assert.equal(resolve(60, 6), "global");
});

test("the checks catch an overlap, a T-junction, a sliver gap, a bowtie and a repeated closing vertex", () => {
  const square = [
    [50, 0],
    [50, 10],
    [40, 10],
    [40, 0],
  ];
  const inside = skyQualityPointInPolygons;
  const kinds = (other) =>
    borderProblems(square, other, inside).problems.join(" | ");
  // Overlap: the second square crosses the first.
  assert.match(
    kinds([
      [45, 5],
      [45, 15],
      [35, 15],
      [35, 5],
    ]),
    /cross/,
  );
  // T-junction: a vertex of the neighbour sits in the middle of an edge.
  assert.match(
    kinds([
      [50, 10],
      [50, 20],
      [40, 20],
      [40, 10],
      [45, 10],
    ]),
    /lies inside an edge/,
  );
  // Sliver: the neighbour is 0.01° off the shared border.
  assert.match(
    kinds([
      [50, 10.01],
      [50, 20],
      [40, 20],
      [40, 10.01],
    ]),
    /sliver/,
  );
  // Containment.
  assert.match(
    kinds([
      [48, 2],
      [48, 8],
      [42, 8],
      [42, 2],
    ]),
    /inside/,
  );
  // A clean neighbour is clean, with its one shared edge found.
  const clean = borderProblems(
    square,
    [
      [50, 10],
      [50, 20],
      [40, 20],
      [40, 10],
    ],
    inside,
  );
  assert.deepEqual(clean.problems, []);
  assert.equal(clean.shared.length, 1);
  // Ring checks.
  assert.deepEqual(ringProblems(square), []);
  assert.match(
    ringProblems([
      [0, 0],
      [10, 10],
      [10, 0],
      [0, 10],
    ]).join(),
    /cross/,
  );
  assert.match(
    ringProblems([...square, square[0]]).join(),
    /repeated at the end/,
  );
  assert.match(
    ringProblems([
      [0, 0],
      [1, 1],
    ]).join(),
    /fewer than 3/,
  );
  assert.match(
    ringProblems([
      [0, 0],
      [1, 1],
      [2, 2],
    ]).join(),
    /zero area/,
  );
  assert.equal(edgesOf(square).length, 4);
});
