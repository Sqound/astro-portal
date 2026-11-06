import assert from "node:assert/strict";
import test from "node:test";

import { planItemOverlaps } from "../src/plan-overlap.js";

const item = (id, startMinute, endMinute) => ({ id, startMinute, endMinute });

test("two slots that intersect overlap; touching slots do not", () => {
  assert.deepEqual(
    planItemOverlaps([
      item("a", 0, 60),
      item("b", 60, 120),
      item("c", 120, 180),
    ]),
    [],
  );
  assert.deepEqual(planItemOverlaps([item("b", 59, 120), item("a", 0, 60)]), [
    { firstId: "a", secondId: "b", start: 59, end: 60 },
  ]);
});

test("every intersecting pair is named, whatever the order", () => {
  const pairs = planItemOverlaps([
    item("c", 100, 160),
    item("a", 0, 120),
    item("b", 50, 110),
    item("d", 300, 360),
  ]).map((overlap) => `${overlap.firstId}|${overlap.secondId}`);
  assert.deepEqual(pairs.sort(), ["a|b", "a|c", "b|c"]);
});

test("no slot, a zero-length slot or « plus le temps ce soir » overlaps nothing", () => {
  assert.deepEqual(
    planItemOverlaps([
      item("a", 0, 120),
      { id: "none" },
      item("zero", 30, 30),
      {
        id: "late",
        startMinute: 40,
        endMinute: 40,
        durationMinutes: 0,
        noTimeTonight: true,
      },
    ]),
    [],
  );
});

test("the end falls back on the duration", () => {
  assert.equal(
    planItemOverlaps([
      { id: "a", startMinute: 0, durationMinutes: 90 },
      item("b", 60, 120),
    ]).length,
    1,
  );
});
