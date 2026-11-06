import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { scheduleExtendBounds, scheduleExtendPatch } from "../dist/schedule.js";

// The extend button of the web slot editor (↔) fills the room between the
// neighbouring targets, or up to the night's bounds -- the plan's chosen span
// when it has one. The web editor has no ✕ and no keep / discard dialogue (a
// block touched again closes it, and every release is written).

const entry = (id, start, end) => ({
  item: { id },
  window: { start, end },
});
const schedule = [
  entry("a", 10, 50),
  entry("b", 100, 160),
  entry("c", 220, 280),
];
const night = { start: 0, end: 480 };

test("between the end of the previous target and the start of the next", () => {
  assert.deepEqual(
    scheduleExtendPatch({
      itemId: "b",
      window: { start: 100, end: 160 },
      schedule,
      bounds: night,
    }),
    { startMinute: 50, endMinute: 220, durationMinutes: 170 },
  );
});

test("to the start of the night with no previous target, to its end with no next one", () => {
  assert.deepEqual(
    scheduleExtendPatch({
      itemId: "a",
      window: { start: 10, end: 50 },
      schedule,
      bounds: night,
    }),
    { startMinute: 0, endMinute: 100, durationMinutes: 100 },
  );
  assert.deepEqual(
    scheduleExtendPatch({
      itemId: "c",
      window: { start: 220, end: 280 },
      schedule,
      bounds: night,
    }),
    { startMinute: 160, endMinute: 480, durationMinutes: 320 },
  );
});

test("the chosen span is the bound of the night, else the whole night", () => {
  const nightStart = "2026-09-16T01:00:00.000Z";
  const span = {
    start: "2026-09-16T02:00:00.000Z",
    end: "2026-09-16T05:00:00.000Z",
  };
  const bounds = scheduleExtendBounds({ nightStart, total: 480, span });
  assert.deepEqual(bounds, { start: 60, end: 240 });
  assert.deepEqual(
    scheduleExtendPatch({
      itemId: "m31",
      window: { start: 100, end: 120 },
      schedule: [entry("m31", 100, 120)],
      bounds,
    }),
    { startMinute: 60, endMinute: 240, durationMinutes: 180 },
  );
  assert.deepEqual(scheduleExtendBounds({ nightStart, total: 480 }), night);
  assert.deepEqual(
    scheduleExtendBounds({
      nightStart,
      total: 480,
      span: { start: "x", end: "y" },
    }),
    night,
  );
  // A span reaching past the night is brought into it.
  assert.deepEqual(
    scheduleExtendBounds({
      nightStart,
      total: 480,
      span: {
        start: "2026-09-15T23:00:00.000Z",
        end: "2026-09-16T05:00:00.000Z",
      },
    }),
    { start: 0, end: 240 },
  );
});

test("a slot never shrinks, and the web button uses the rule", () => {
  assert.deepEqual(
    scheduleExtendPatch({
      itemId: "m31",
      window: { start: 30, end: 300 },
      schedule: [entry("m31", 30, 300)],
      bounds: { start: 60, end: 240 },
    }),
    { startMinute: 30, endMinute: 300, durationMinutes: 270 },
  );
  const source = readFileSync(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /scheduleExtendPatch\(/);
  assert.doesNotMatch(source, /startMinute: window\.availability\.start/);
});
