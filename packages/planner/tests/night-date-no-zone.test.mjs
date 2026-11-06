import assert from "node:assert/strict";
import test from "node:test";

import { planTimeLeft } from "planner/plan-time-left.js";
import { tonightDate } from "planner/tonight-overview.js";

// The date of the night a place is in is read from its longitude when it has no
// time zone, never from the UTC date.
const west = { latitude: "45", longitude: "-30" };
const east = { latitude: "45", longitude: "179" };
const azores = { ...west, timeZone: "Atlantic/Azores" };
const at = (iso) => Date.parse(iso);
const left = (date, location, iso) =>
  planTimeLeft({ date, location, now: at(iso) });
// `planDaysAgo` (plan-sheet-words.js) counts from this date; the module
// imports JSX components and cannot be loaded by plain node.
const lived = (location, iso) => tonightDate({ now: at(iso), place: location });

test("30° W: the night of the 9th is tonight on both sides of midnight UTC", () => {
  for (const iso of [
    "2026-10-09T21:30:00Z",
    "2026-10-09T23:59:00Z",
    "2026-10-10T00:01:00Z",
    "2026-10-10T01:00:00Z",
  ]) {
    assert.notEqual(left("2026-10-09", west, iso)?.kind, "inDays", iso);
    assert.deepEqual(
      left("2026-10-11", west, iso),
      { kind: "inDays", days: 2 },
      iso,
    );
  }
});

test("30° W: days counted from the night the place is in", () => {
  assert.deepEqual(left("2026-10-12", west, "2026-10-09T21:30:00Z"), {
    kind: "inDays",
    days: 3,
  });
  assert.deepEqual(left("2026-10-12", west, "2026-10-10T00:01:00Z"), {
    kind: "inDays",
    days: 3,
  });
  assert.deepEqual(left("2026-10-12", west, "2026-10-10T13:00:00Z"), {
    kind: "inDays",
    days: 2,
  });
});

test("30° W: the night lived, from which days ago are counted", () => {
  assert.equal(lived(west, "2026-10-10T13:00:00Z"), "2026-10-10");
  assert.equal(lived(west, "2026-10-10T01:00:00Z"), "2026-10-09");
  assert.equal(lived(west, "2026-10-09T21:30:00Z"), "2026-10-09");
});

test("179° E: the date of the night is the place's, not the UTC date", () => {
  assert.equal(lived(east, "2026-10-09T20:00:00Z"), "2026-10-10");
  assert.equal(lived(east, "2026-10-09T13:00:00Z"), "2026-10-09");
  assert.deepEqual(left("2026-10-12", east, "2026-10-09T20:00:00Z"), {
    kind: "inDays",
    days: 2,
  });
  assert.deepEqual(left("2026-10-12", east, "2026-10-09T13:00:00Z"), {
    kind: "inDays",
    days: 3,
  });
  assert.deepEqual(left("2026-10-12", east, "2026-10-09T23:59:00Z"), {
    kind: "inDays",
    days: 2,
  });
  assert.deepEqual(left("2026-10-12", east, "2026-10-10T00:01:00Z"), {
    kind: "inDays",
    days: 2,
  });
});

test("a place with a time zone reads the same nights as its longitude", () => {
  assert.deepEqual(left("2026-10-12", azores, "2026-10-10T00:01:00Z"), {
    kind: "inDays",
    days: 3,
  });
});
