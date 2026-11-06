import assert from "node:assert/strict";
import test from "node:test";

import { planItemOverlaps } from "../src/plan-overlap.js";
import {
  itemsWithSpread,
  placeAddedItem,
  spreadNoTimeIds,
  spreadOverlappingItems,
  spreadSlotOf,
} from "../src/spread-targets.js";

// "Répartir les cibles": the targets of a plan that share part of the night are
// put one after the other, each in its window of visibility; one that finds no
// room is "plus le temps ce soir". The `spread-overlapping-items` conformance
// fixture holds the same night to the same slots.

// An eight-hour night, minutes counted from its start.
const start = Date.UTC(2026, 9, 27, 18);
const at = (minute) => new Date(start + minute * 60000).toISOString();
const night = { start: at(0), end: at(480) };

// A target visible from `from` to `to` (minutes), highest in the middle, its
// minimum exposure `minimum`.
function card(id, from, to, { minimum = 30, recommended = 90 } = {}) {
  const mid = Math.floor((from + to) / 2);
  const series = [];
  for (let minute = from; minute <= to; minute += 10)
    series.push({
      time: at(minute),
      altitude: 80 - Math.abs(minute - mid) / 5,
    });
  return {
    target: { id },
    visibilityWindows: [{ start: at(from), end: at(to) }],
    series,
    integration: {
      available: true,
      minimumMinutes: minimum,
      recommendedMinutes: recommended,
    },
  };
}

const item = (id, from, to, more = {}) => ({
  id,
  startMinute: from,
  endMinute: to,
  durationMinutes: to - from,
  target: { id },
  ...more,
});

const overlap = (a, b) => a.start < b.end && b.start < a.end;

// The slots after `result`, for `items`: each item's own, else the written.
const after = (items, result) =>
  Object.fromEntries(
    items.map((entry) => [
      entry.id,
      spreadSlotOf(result, entry.id) ?? {
        id: entry.id,
        start: entry.startMinute,
        end: entry.endMinute,
        noTime: false,
      },
    ]),
  );

test("nothing overlaps: nothing moves", () => {
  const result = spreadOverlappingItems({
    items: [item("a", 0, 90), item("b", 90, 180)],
    cards: { a: card("a", 0, 300), b: card("b", 0, 300) },
    night,
  });
  assert.deepEqual(result.slots, []);
});

test("two targets on the same stretch: one keeps its slot, the other goes into the free time of its window, no overlap left", () => {
  const items = [item("a", 60, 150), item("b", 90, 180)];
  const result = spreadOverlappingItems({
    items,
    cards: { a: card("a", 0, 300), b: card("b", 0, 300) },
    night,
  });
  assert.equal(result.slots.length, 1);
  const slots = after(items, result);
  assert.equal(overlap(slots.a, slots.b), false);
  // The moved one stays whole and inside its window.
  const [moved] = result.slots;
  assert.equal(moved.noTime, false);
  assert.equal(moved.end - moved.start, 90);
  assert.ok(moved.start >= 0 && moved.end <= 300);
});

test("the most constrained target keeps its slot: the one with the narrowest window is placed first", () => {
  const result = spreadOverlappingItems({
    items: [item("wide", 0, 90), item("narrow", 30, 120)],
    cards: { wide: card("wide", 0, 400), narrow: card("narrow", 0, 130) },
    night,
  });
  assert.equal(spreadSlotOf(result, "narrow"), undefined);
  const wide = spreadSlotOf(result, "wide");
  assert.ok(wide.start >= 120);
  assert.equal(wide.noTime, false);
});

test("a target that finds no room is plus le temps ce soir: a zero-length slot where it was, the others whole", () => {
  // Three targets of 90 minutes, all visible 60–240 only: two fit.
  const items = [item("a", 60, 150), item("b", 60, 150), item("c", 60, 150)];
  const result = spreadOverlappingItems({
    items,
    cards: Object.fromEntries(
      ["a", "b", "c"].map((id) => [id, card(id, 60, 240, { minimum: 80 })]),
    ),
    night,
  });
  assert.equal(spreadNoTimeIds(result).length, 1);
  const none = result.slots.find((slot) => slot.noTime);
  assert.equal(none.start, none.end);
  const timed = Object.values(after(items, result)).filter(
    (slot) => !slot.noTime,
  );
  assert.equal(timed.length, 2);
  assert.equal(overlap(timed[0], timed[1]), false);
  for (const slot of timed) {
    assert.ok(slot.end - slot.start >= 80);
    assert.ok(slot.start >= 60 && slot.end <= 240);
  }
});

test("a target that overlaps nothing stays where it is, and the others go round it", () => {
  const items = [item("still", 200, 290), item("a", 0, 90), item("b", 30, 120)];
  const result = spreadOverlappingItems({
    items,
    cards: {
      still: card("still", 100, 350),
      a: card("a", 0, 350),
      b: card("b", 0, 350),
    },
    night,
  });
  assert.equal(spreadSlotOf(result, "still"), undefined);
  const slots = after(items, result);
  for (const id of ["a", "b"])
    assert.equal(overlap(slots[id], slots.still), false, id);
  assert.equal(overlap(slots.a, slots.b), false);
});

test("a target with no window of visibility, or frozen, is not moved: the other one goes round it", () => {
  const items = [item("exception", 0, 90), item("b", 30, 120)];
  const result = spreadOverlappingItems({
    items,
    cards: {
      exception: { target: { id: "exception" }, visibilityWindows: [] },
      b: card("b", 0, 350),
    },
    night,
  });
  assert.equal(spreadSlotOf(result, "exception"), undefined);
  assert.ok(spreadSlotOf(result, "b").start >= 90);

  const frozen = spreadOverlappingItems({
    items,
    cards: { exception: card("exception", 0, 350), b: card("b", 0, 350) },
    night,
    frozenIds: ["b"],
  });
  assert.equal(spreadSlotOf(frozen, "b"), undefined);
  assert.ok(spreadSlotOf(frozen, "exception").start >= 120);
});

test("a second slot of the same target is not hidden from the placement: its id is not the target's", () => {
  const items = [
    item("m31", 0, 90),
    item("m31#2", 30, 120, { targetId: "m31" }),
  ];
  const result = spreadOverlappingItems({
    items,
    cards: { m31: card("m31", 0, 350) },
    night,
  });
  const slots = after(items, result);
  assert.equal(overlap(slots.m31, slots["m31#2"]), false);
});

test("the spread writes into the items: a target with no room gets the marker, one put back on the night loses it", () => {
  const items = [
    item("a", 60, 150),
    item("b", 60, 150, { noTimeTonight: true }),
    item("c", 60, 150),
  ];
  const result = {
    slots: [
      { id: "a", start: 60, end: 60, noTime: true },
      { id: "b", start: 150, end: 240, noTime: false },
    ],
  };
  const next = itemsWithSpread(items, result);
  assert.deepEqual(
    [next[0].noTimeTonight, next[0].startMinute, next[0].durationMinutes],
    [true, 60, 0],
  );
  assert.equal("noTimeTonight" in next[1], false);
  assert.deepEqual(
    [next[1].startMinute, next[1].endMinute, next[1].durationMinutes],
    [150, 240, 90],
  );
  assert.equal(next[2], items[2]);
});

// An add (`placeAddedItem`): a target added to a night that has no room never
// lands on top of another.

// A slot written by hand, on no target of the pool: it holds [from, to] of the
// night whatever happens (nothing can spread it).
const filler = (from, to) => item(`filler-${from}`, from, to);
const newcomer = { id: "m31", target: { id: "m31" } };

test("no room left in the night: the added target is plus le temps ce soir, not a second block on top of the others", () => {
  const items = [filler(0, 480)];
  const added = placeAddedItem({
    card: card("m31", 0, 400),
    item: newcomer,
    items,
    night,
  });
  assert.equal(added.items.length, 2, "it stays in the plan");
  assert.equal(added.reason, "no-time");
  assert.equal(added.item.noTimeTonight, true);
  assert.equal(added.item.startMinute, added.item.endMinute);
  assert.equal(added.spreadCount, 0);
  assert.deepEqual(planItemOverlaps(added.items), []);
});

test("room left: the add is as before, placed in the free time, nothing spread", () => {
  const added = placeAddedItem({
    card: card("m31", 0, 400),
    item: newcomer,
    items: [filler(0, 60)],
    night,
  });
  assert.notEqual(added.reason, "no-time");
  assert.equal(added.spreadCount, 0);
  assert.equal(
    added.items.some((entry) => entry.noTimeTonight),
    false,
  );
  assert.deepEqual(planItemOverlaps(added.items), []);
});

test("the newcomer finds no room, but spreading the others places everyone: the plan is spread and the add says how many moved", () => {
  // The newcomer is visible 0–150 only: the 60 free minutes before the target
  // on the plan are short of its 80-minute minimum.
  const items = [item("a", 60, 150)];
  const added = placeAddedItem({
    card: card("m31", 0, 150, { minimum: 80 }),
    item: newcomer,
    items,
    cards: { a: card("a", 0, 400) },
    night,
  });
  assert.equal(added.reason, "free-slot");
  assert.equal(added.spreadCount, 1);
  assert.equal(
    added.items.some((entry) => entry.noTimeTonight),
    false,
  );
  assert.deepEqual(planItemOverlaps(added.items), []);
  const own = added.items.find((entry) => entry.id === "m31");
  assert.ok(own.endMinute - own.startMinute >= 80);
  assert.ok(own.startMinute >= 0 && own.endMinute <= 150);
});

test("the newcomer yields when spreading would cost another target its time", () => {
  // Two targets already hold 0–240 and 240–480 of the night, each visible only
  // there: the newcomer cannot be placed without one of them losing its slot,
  // so the newcomer is the one that gets no time.
  const items = [item("a", 0, 240), item("b", 240, 480)];
  const added = placeAddedItem({
    card: card("m31", 0, 480, { minimum: 100 }),
    item: newcomer,
    items,
    cards: { a: card("a", 0, 240), b: card("b", 240, 480) },
    night,
  });
  assert.equal(added.reason, "no-time");
  assert.equal(added.item.noTimeTonight, true);
  assert.equal(added.spreadCount, 0);
  assert.deepEqual(added.items.slice(0, 2), items);
});

test("an exception with no window of visibility keeps the cascade's own last resort", () => {
  const added = placeAddedItem({
    card: {
      target: { id: "m31" },
      visibilityWindows: [],
      usableStart: at(0),
      usableEnd: at(480),
      integration: { available: true, recommendedMinutes: 90 },
    },
    item: newcomer,
    items: [filler(0, 480)],
    night,
  });
  assert.equal(added.reason, "overlap-fallback");
  assert.equal(added.spreadCount, 0);
});
