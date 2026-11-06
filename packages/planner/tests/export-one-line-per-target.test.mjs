import assert from "node:assert/strict";
import test from "node:test";
import { planAsiairCsv, planNinaCsv } from "planner/export.js";

// A target planned in two slots was written
// twice in the ASIAIR list. ASIAIR and N.I.N.A. read a list of targets, not of
// slots: each target is written once, at the first of its slots.

const plan = {
  name: "Two slots",
  date: "2026-10-18",
  items: [
    { id: "m33", startMinute: 300 },
    { id: "ngc7822", startMinute: 120 },
    { id: "m33", startMinute: 60 },
  ],
};
const targets = [
  {
    target: {
      id: "m33",
      designation: "M33",
      coordinate: { ra: 23.4621, dec: 30.66 },
    },
  },
  {
    target: {
      id: "ngc7822",
      designation: "NGC 7822",
      coordinate: { ra: 0.8, dec: 67.2 },
    },
  },
];

test("ASIAIR: a target in two slots is one line, at the first of its slots", () => {
  const { content, exportedCount } = planAsiairCsv({ plan, targets });
  const lines = content.trim().split("\r\n").slice(1);
  assert.equal(exportedCount, 2);
  assert.deepEqual(
    lines.map((line) => line.split(",")[0]),
    ["M33", "NGC 7822"],
  );
});

test("N.I.N.A.: a target in two slots is one line too", () => {
  const { exportedCount } = planNinaCsv({ plan, targets });
  assert.equal(exportedCount, 2);
});
