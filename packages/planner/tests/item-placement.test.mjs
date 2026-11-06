import assert from "node:assert/strict";
import test from "node:test";
import {
  placementMinimumMinutes,
  plannedItemPlacement,
} from "../src/item-placement.js";

const nightStart = Date.UTC(2026, 8, 19, 20, 0, 0);
const nightLength = 480;
const night = {
  start: new Date(nightStart).toISOString(),
  end: new Date(nightStart + nightLength * 60000).toISOString(),
};

const at = (minute) => new Date(nightStart + minute * 60000).toISOString();

// A single-peaked altitude curve: zero at both ends of the night, 60 degrees
// at minute 240. Sampled every ten minutes, exactly like planNight samples.
const domeAltitude = (minute) => 60 - ((minute - 240) ** 2 * 60) / 240 ** 2;

function card({
  id = "target",
  windows = [],
  altitude = domeAltitude,
  recommendedMinutes = 120,
  usableStart = 0,
  usableEnd = nightLength,
} = {}) {
  const series = [];
  for (let minute = 0; minute <= nightLength; minute += 10)
    series.push({ time: at(minute), altitude: altitude(minute) });
  return {
    target: { id },
    series,
    visibilityWindows: windows.map(([start, end]) => ({
      start: at(start),
      end: at(end),
    })),
    usableStart: at(usableStart),
    usableEnd: at(usableEnd),
    integration: { available: true, recommendedMinutes },
  };
}

const item = (id, start, end) => ({
  id,
  startMinute: start,
  endMinute: end,
  durationMinutes: end - start,
});

// The dome curve clears 20 degrees between minute 44.04 and minute 435.96;
// the planner interpolates those crossings, so the window edges are not on a
// sample boundary and the module has to round them inwards itself.
const domeWindow = [44.04, 435.96];

test("an empty night takes the ideal position, centred on culmination", () => {
  const placement = plannedItemPlacement({
    card: card({ windows: [domeWindow] }),
    night,
  });
  assert.deepEqual(placement, {
    startMinute: 180,
    endMinute: 300,
    durationMinutes: 120,
    reason: "ideal",
  });
});

test("the quality window is rounded inwards, never outwards", () => {
  // A window of 45.6 -> 165.2 minutes can only host 119 whole minutes.
  const placement = plannedItemPlacement({
    card: card({ windows: [[45.6, 165.2]] }),
    night,
  });
  assert.equal(placement.reason, "shortened");
  assert.equal(placement.startMinute, 46);
  assert.equal(placement.endMinute, 165);
});

test("the ideal position stays clear of what is already planned", () => {
  const placement = plannedItemPlacement({
    card: card({ windows: [domeWindow] }),
    night,
    items: [item("other", 60, 90)],
  });
  assert.deepEqual(placement, {
    startMinute: 180,
    endMinute: 300,
    durationMinutes: 120,
    reason: "ideal",
  });
});

test("a collision falls back to the free gap closest to the ideal", () => {
  const placement = plannedItemPlacement({
    card: card({ windows: [domeWindow] }),
    night,
    // Culmination is taken; 305..425 and 45..215 are both free and both hold
    // the full two hours, but 215 ends closer to the ideal centre of 240.
    items: [item("other", 215, 305)],
  });
  assert.deepEqual(placement, {
    startMinute: 95,
    endMinute: 215,
    durationMinutes: 120,
    reason: "free-slot",
  });
});

test("a plan with no room for the full duration shortens it", () => {
  const placement = plannedItemPlacement({
    card: card({ windows: [domeWindow] }),
    night,
    // Leaves 200..260 (60 min) and 45..100 (55 min) free inside the window.
    items: [item("early", 100, 200), item("late", 260, 436)],
  });
  assert.deepEqual(placement, {
    startMinute: 200,
    endMinute: 260,
    durationMinutes: 60,
    reason: "shortened",
  });
});

test("a gap shorter than the editor's own floor is not used", () => {
  const placement = plannedItemPlacement({
    card: card({ windows: [domeWindow] }),
    night,
    // Only a four-minute gap is left inside the quality window.
    items: [item("early", 45, 200), item("late", 204, 436)],
  });
  assert.equal(placement.reason, "overlap-fallback");
  assert.deepEqual(
    [placement.startMinute, placement.endMinute, placement.durationMinutes],
    [180, 300, 120],
  );
});

test("a gap exactly at the editor's floor is used and shortened to it", () => {
  const placement = plannedItemPlacement({
    card: card({ windows: [domeWindow] }),
    night,
    items: [
      item("early", 45, 200),
      item("late", 200 + placementMinimumMinutes, 436),
    ],
  });
  assert.deepEqual(placement, {
    startMinute: 200,
    endMinute: 205,
    durationMinutes: 5,
    reason: "shortened",
  });
});

test("a full plan overlaps on purpose at the ideal position", () => {
  const placement = plannedItemPlacement({
    card: card({ windows: [domeWindow] }),
    night,
    items: [item("all-night", 0, nightLength)],
  });
  assert.deepEqual(placement, {
    startMinute: 180,
    endMinute: 300,
    durationMinutes: 120,
    reason: "overlap-fallback",
  });
});

test("a circumpolar target still prefers its culmination", () => {
  // Never sets, never blocked: the quality window is the whole night.
  const placement = plannedItemPlacement({
    card: card({
      windows: [[0, nightLength]],
      altitude: (minute) =>
        45 + 10 * Math.cos(((minute - 150) / 480) * Math.PI),
    }),
    night,
  });
  assert.equal(placement.reason, "ideal");
  assert.deepEqual(
    [placement.startMinute, placement.endMinute],
    [90, 210],
    "the interval centred on the peak at minute 150",
  );
});

test("a target visible only at the end of the night is placed there", () => {
  const placement = plannedItemPlacement({
    card: card({
      windows: [[360, nightLength]],
      altitude: (minute) => minute / 8,
    }),
    night,
  });
  assert.deepEqual(placement, {
    startMinute: 360,
    endMinute: 480,
    durationMinutes: 120,
    reason: "ideal",
  });
});

test("a target visible only at the start of the night is placed there", () => {
  const placement = plannedItemPlacement({
    card: card({
      windows: [[0, 120]],
      altitude: (minute) => 60 - minute / 8,
    }),
    night,
  });
  assert.deepEqual(placement, {
    startMinute: 0,
    endMinute: 120,
    durationMinutes: 120,
    reason: "ideal",
  });
});

// The dome peaks at minute 240, but a mount cable sector blanks 210..330
// out, leaving two halves. The earlier half reaches closer to culmination,
// so a 60-minute interval scores higher there.
const splitWindows = [
  [44.04, 210],
  [330, 435.96],
];

test("a quality window split in two picks the higher half", () => {
  const placement = plannedItemPlacement({
    card: card({ windows: splitWindows, recommendedMinutes: 60 }),
    night,
  });
  assert.deepEqual(placement, {
    startMinute: 150,
    endMinute: 210,
    durationMinutes: 60,
    reason: "ideal",
  });
});

test("a split quality window still uses its second half when the first is taken", () => {
  const placement = plannedItemPlacement({
    card: card({ windows: splitWindows, recommendedMinutes: 60 }),
    night,
    items: [item("other", 0, 250)],
  });
  assert.deepEqual(placement, {
    startMinute: 330,
    endMinute: 390,
    durationMinutes: 60,
    reason: "free-slot",
  });
});

test("a recommended duration longer than the night is capped to the night", () => {
  const placement = plannedItemPlacement({
    card: card({ windows: [[0, nightLength]], recommendedMinutes: 900 }),
    night,
  });
  assert.deepEqual(placement, {
    startMinute: 0,
    endMinute: 480,
    durationMinutes: 480,
    reason: "ideal",
  });
});

test("a recommended duration longer than the quality window shortens to it", () => {
  const placement = plannedItemPlacement({
    card: card({ windows: [[100, 160]], recommendedMinutes: 240 }),
    night,
  });
  assert.deepEqual(placement, {
    startMinute: 100,
    endMinute: 160,
    durationMinutes: 60,
    reason: "shortened",
  });
});

test("a coarse grid only offers grid-aligned starts and the window ends", () => {
  const placement = plannedItemPlacement({
    card: card({ windows: [domeWindow] }),
    night,
    gridMinutes: 25,
  });
  // 175 and 200 are the grid steps either side of the ideal 180; 175 is the
  // closer of the two to culmination, so it scores higher.
  assert.deepEqual(placement, {
    startMinute: 175,
    endMinute: 295,
    durationMinutes: 120,
    reason: "ideal",
  });
});

test("no grid means every whole minute is a candidate", () => {
  const withoutGrid = plannedItemPlacement({
    card: card({ windows: [domeWindow] }),
    night,
    gridMinutes: 0,
  });
  assert.deepEqual(withoutGrid, {
    startMinute: 180,
    endMinute: 300,
    durationMinutes: 120,
    reason: "ideal",
  });
});

test("a target with no quality window keeps the planner's old placement", () => {
  const placement = plannedItemPlacement({
    card: card({ windows: [], usableStart: 30, usableEnd: 300 }),
    night,
  });
  assert.deepEqual(placement, {
    startMinute: 30,
    endMinute: 90,
    durationMinutes: 60,
    reason: "overlap-fallback",
  });
});

test("a card with no integration advice falls back to one hour", () => {
  const source = card({ windows: [domeWindow] });
  delete source.integration;
  const placement = plannedItemPlacement({ card: source, night });
  assert.deepEqual(placement, {
    startMinute: 210,
    endMinute: 270,
    durationMinutes: 60,
    reason: "ideal",
  });
});

test("the target's own current item never counts as an obstacle", () => {
  const placement = plannedItemPlacement({
    card: card({ windows: [domeWindow] }),
    night,
    items: [item("target", 0, nightLength)],
  });
  assert.equal(placement.reason, "ideal");
});

test("an item stored without an end minute occupies its duration", () => {
  const placement = plannedItemPlacement({
    card: card({ windows: [domeWindow] }),
    night,
    // No endMinute: the obstacle still runs 150..300, leaving 45..150 (too
    // short for two hours) and 300..435 (long enough).
    items: [{ id: "other", startMinute: 150, durationMinutes: 150 }],
  });
  assert.deepEqual(placement, {
    startMinute: 300,
    endMinute: 420,
    durationMinutes: 120,
    reason: "free-slot",
  });
});

test("a quality window shorter than the recommended duration falls back inside it, not at the start of the night", () => {
  const placement = plannedItemPlacement({
    card: card({ windows: [[10, 50]], recommendedMinutes: 200 }),
    night,
    // The window is fully occupied, so steps 2 and 3 both find no free
    // space and step 4 fires. Before the fix, step 4 centred the untouched
    // 200-minute duration on the window's own centre (30) and clamped the
    // result to the night, landing on 0..200 -- spilling 160 of those
    // minutes outside the 40-minute window in which the target was actually
    // observed.
    items: [item("other", 10, 50)],
  });
  assert.deepEqual(placement, {
    startMinute: 10,
    endMinute: 50,
    durationMinutes: 40,
    reason: "overlap-fallback",
  });
});

test("a quality window that still holds the duration keeps centring on culmination, not the window's edge", () => {
  const placement = plannedItemPlacement({
    card: card({ windows: [[180, 300]], recommendedMinutes: 40 }),
    night,
    // The 120-minute window holds the 40-minute duration in full, so this
    // exercises the unmodified hostable branch (step 1's own `ideal`
    // computation): even fully occupied, the fallback still centres on the
    // peak at minute 240, confirming the fix above only changes the
    // too-short-for-D branch.
    items: [item("other", 180, 300)],
  });
  assert.deepEqual(placement, {
    startMinute: 220,
    endMinute: 260,
    durationMinutes: 40,
    reason: "overlap-fallback",
  });
});

test("touching intervals leave no phantom gap", () => {
  const placement = plannedItemPlacement({
    card: card({ windows: [domeWindow] }),
    night,
    items: [item("a", 45, 240), item("b", 240, 436)],
  });
  assert.equal(placement.reason, "overlap-fallback");
});
