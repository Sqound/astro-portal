import assert from "node:assert/strict";
import test from "node:test";
import {
  createMapTapCycle,
  horizonTargetCandidatesAtPoint,
  mapMarkerCandidatesAtPoint,
  mapTapCycleTolerancePx,
} from "../src/map-tap-cycle.js";

// The tap cycle and the ranking half of the marker candidates at a point.

const point = { x: 100, y: 100 };
const stack = ["a", "b", "c"];

test("three clicks at the same point walk the stack, and a fourth wraps back", () => {
  const cycle = createMapTapCycle();
  assert.equal(
    cycle.resolve({
      position: point,
      candidates: stack,
      currentSelection: null,
    }),
    "a",
  );
  assert.equal(
    cycle.resolve({
      position: point,
      candidates: stack,
      currentSelection: "a",
    }),
    "b",
  );
  assert.equal(
    cycle.resolve({
      position: point,
      candidates: stack,
      currentSelection: "b",
    }),
    "c",
  );
  assert.equal(
    cycle.resolve({
      position: point,
      candidates: stack,
      currentSelection: "c",
    }),
    "a",
    "the fourth click returns to the first candidate",
  );
});

test("a click within tolerance of the previous one is still the same point", () => {
  const cycle = createMapTapCycle();
  cycle.resolve({ position: point, candidates: stack, currentSelection: null });
  assert.equal(
    cycle.resolve({
      position: { x: point.x + mapTapCycleTolerancePx - 1, y: point.y },
      candidates: stack,
      currentSelection: "a",
    }),
    "b",
  );
});

test("a click past the tolerance starts a fresh cycle", () => {
  const cycle = createMapTapCycle();
  cycle.resolve({ position: point, candidates: stack, currentSelection: null });
  assert.equal(
    cycle.resolve({
      position: { x: point.x + mapTapCycleTolerancePx + 1, y: point.y },
      candidates: stack,
      currentSelection: "a",
    }),
    "a",
    "still the first candidate of the (different) point clicked",
  );
});

test("an empty candidate list clears the memory", () => {
  const cycle = createMapTapCycle();
  cycle.resolve({ position: point, candidates: stack, currentSelection: null });
  assert.equal(cycle.hasMemory(), true);

  assert.equal(
    cycle.resolve({ position: point, candidates: [], currentSelection: "a" }),
    null,
  );
  assert.equal(cycle.hasMemory(), false);

  // The next click, back on the stack, is a fresh one rather than a
  // resumption of whatever the cycle held before the miss.
  assert.equal(
    cycle.resolve({
      position: point,
      candidates: stack,
      currentSelection: null,
    }),
    "a",
  );
});

test("a changed view signature — a pan or a zoom — resets the cycle", () => {
  const cycle = createMapTapCycle();
  cycle.resolve({
    position: point,
    candidates: stack,
    currentSelection: null,
    viewSignature: "framing-1",
  });
  assert.equal(
    cycle.resolve({
      position: point,
      candidates: stack,
      currentSelection: "a",
      viewSignature: "framing-2",
    }),
    "a",
    "the view moved, so this is the first candidate again",
  );
});

test("a selection made elsewhere resets the cycle at the same point", () => {
  const cycle = createMapTapCycle();
  cycle.resolve({ position: point, candidates: stack, currentSelection: null });
  // Something outside this cycle changed the live selection to "c" between
  // the two clicks.
  assert.equal(
    cycle.resolve({
      position: point,
      candidates: stack,
      currentSelection: "c",
    }),
    "a",
    "the externally-made selection is not what this cycle produced, so it " +
      "restarts rather than advancing past c",
  );
});

test("a single candidate cycles back to itself rather than producing null", () => {
  const cycle = createMapTapCycle();
  assert.equal(
    cycle.resolve({
      position: point,
      candidates: ["solo"],
      currentSelection: null,
    }),
    "solo",
  );
  assert.equal(
    cycle.resolve({
      position: point,
      candidates: ["solo"],
      currentSelection: "solo",
    }),
    "solo",
    "the map's own `toggledTargetId` is what turns a repeated identical " +
      "selection into a deselect, not this cycle",
  );
});

// The ranking a fresh click resolves against.

const ring = (id, x, y, radius) => ({
  id,
  centre: { x, y },
  radius: { x: radius, y: radius },
});

test("the smallest ring containing the point wins the first click", () => {
  // A wide nebula with a small cluster drawn inside it: on the running
  // planner the winner was whichever button came later in the DOM.
  const candidates = mapMarkerCandidatesAtPoint({
    point: { x: 100, y: 100 },
    markers: [ring("wide", 100, 100, 40), ring("small", 100, 100, 6)],
  });
  assert.deepEqual(candidates, ["small", "wide"]);
});

test("the DOM order of two identical rings cannot decide it on its own", () => {
  const forward = mapMarkerCandidatesAtPoint({
    point: { x: 100, y: 100 },
    markers: [ring("wide", 100, 100, 40), ring("small", 100, 100, 6)],
  });
  const reversed = mapMarkerCandidatesAtPoint({
    point: { x: 100, y: 100 },
    markers: [ring("small", 100, 100, 6), ring("wide", 100, 100, 40)],
  });
  assert.deepEqual(reversed, forward);
});

test("a large target answers a click anywhere inside its ring", () => {
  // S7: "sometimes when the target is large, I cannot select it" -- a point
  // 30 px from the centre of a 40 px ring is well outside the 22 px
  // proximity tolerance, and only ring containment can reach it.
  assert.deepEqual(
    mapMarkerCandidatesAtPoint({
      point: { x: 130, y: 100 },
      markers: [ring("wide", 100, 100, 40)],
    }),
    ["wide"],
  );
});

test("a click outside every ring and past the tolerance selects nothing", () => {
  assert.deepEqual(
    mapMarkerCandidatesAtPoint({
      point: { x: 300, y: 300 },
      markers: [ring("wide", 100, 100, 40), ring("small", 100, 100, 6)],
    }),
    [],
  );
});

test("a ring too small to aim at is still reachable within the tolerance", () => {
  assert.deepEqual(
    mapMarkerCandidatesAtPoint({
      point: { x: 115, y: 100 },
      markers: [ring("tiny", 100, 100, 5)],
    }),
    ["tiny"],
  );
});

test("equal rings are separated by their distance to the click", () => {
  assert.deepEqual(
    mapMarkerCandidatesAtPoint({
      point: { x: 104, y: 100 },
      markers: [ring("left", 100, 100, 10), ring("right", 108, 100, 10)],
    }),
    ["left", "right"],
  );
});

test("three stacked rings are offered smallest first, and the cycle walks them", () => {
  const markers = [
    ring("wide", 100, 100, 40),
    ring("medium", 100, 100, 18),
    ring("small", 100, 100, 6),
  ];
  const candidates = mapMarkerCandidatesAtPoint({
    point: { x: 100, y: 100 },
    markers,
  });
  assert.deepEqual(candidates, ["small", "medium", "wide"]);
  const cycle = createMapTapCycle();
  const walked = ["small", "medium", "wide", "small"].map((_, index) =>
    cycle.resolve({
      position: { x: 100, y: 100 },
      candidates,
      currentSelection: index === 0 ? null : candidates[(index - 1) % 3],
      viewSignature: "fixed",
    }),
  );
  assert.deepEqual(walked, ["small", "medium", "wide", "small"]);
});

// The horizon plot's own candidate list.

test("every plot target inside the tolerance is offered, nearest first", () => {
  assert.deepEqual(
    horizonTargetCandidatesAtPoint({
      point: { x: 10, y: 10 },
      targets: [
        { id: "far", x: 40, y: 40 },
        { id: "near", x: 11, y: 10 },
        { id: "close", x: 12, y: 11 },
      ],
      tolerance: 4,
    }),
    ["near", "close"],
  );
});

test("with nothing inside the tolerance the nearest is still offered", () => {
  // The plot's own "nearest wins" selection has always done this, and the
  // cycle must not turn it into a deselect.
  assert.deepEqual(
    horizonTargetCandidatesAtPoint({
      point: { x: 0, y: 0 },
      targets: [
        { id: "far", x: 40, y: 40 },
        { id: "less-far", x: 20, y: 20 },
      ],
      tolerance: 2,
    }),
    ["less-far"],
  );
});

test("an empty plot offers nothing at all", () => {
  assert.deepEqual(
    horizonTargetCandidatesAtPoint({ point: { x: 0, y: 0 }, targets: [] }),
    [],
  );
});

test("two plot targets at the same distance keep their given order", () => {
  assert.deepEqual(
    horizonTargetCandidatesAtPoint({
      point: { x: 0, y: 0 },
      targets: [
        { id: "first", x: 1, y: 0 },
        { id: "second", x: 0, y: 1 },
      ],
      tolerance: 4,
    }),
    ["first", "second"],
  );
});
