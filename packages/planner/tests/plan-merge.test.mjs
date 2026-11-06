import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeOverlaps,
  mergeRailLanes,
  mergeResultItems,
  mergeSideBrowser,
  mergeSideOther,
  mergeSlotState,
  mergeTotalMinutes,
  mergeWindows,
  removeMergeEntry,
  toggleMergeEntry,
  updateMergeEntryWindow,
  wholeVersionEntries,
} from "../src/plan-merge.js";
import {
  overlapSegments,
  scheduleStartUpdate,
  scheduleWindowShift,
  snapToScheduleEdge,
} from "../src/schedule.js";

// A 600-minute night; every target is usable all night long.
const nightStart = Date.UTC(2026, 8, 25, 18, 0, 0);
const at = (minute) => new Date(nightStart + minute * 60000).toISOString();
const card = (id) => ({
  target: { id },
  usableStart: at(0),
  usableEnd: at(600),
});
const night = {
  start: at(0),
  end: at(600),
  cards: [card("m31"), card("m42"), card("ngc7000")],
};
const item = (id, startMinute, endMinute) => ({
  id,
  startMinute,
  endMinute,
  durationMinutes: endMinute - startMinute,
  filter: "",
});

// The two versions being compared: both hold M31, each at its own times.
const browser = [item("m31", 60, 200), item("m42", 126, 240)];
const other = [item("m31", 0, 120), item("ngc7000", 400, 520)];

test("a second click on a selected target removes it from the result", () => {
  let entries = [];
  entries = toggleMergeEntry(entries, mergeSideBrowser, browser[1]);
  assert.equal(mergeSlotState(entries, mergeSideBrowser, "m42"), "selected");
  assert.deepEqual(mergeResultItems(entries), [browser[1]]);

  entries = toggleMergeEntry(entries, mergeSideBrowser, browser[1]);
  assert.deepEqual(entries, []);
  assert.equal(mergeSlotState(entries, mergeSideBrowser, "m42"), "available");
});

test("the other version's copy of a target swaps in place instead of duplicating it", () => {
  let entries = toggleMergeEntry([], mergeSideBrowser, browser[0]);
  entries = toggleMergeEntry(entries, mergeSideOther, other[1]);
  assert.equal(mergeSlotState(entries, mergeSideOther, "m31"), "replaced");

  entries = toggleMergeEntry(entries, mergeSideOther, other[0]);
  assert.equal(entries.length, 2, "a plan holds a target only once");
  assert.equal(mergeSlotState(entries, mergeSideOther, "m31"), "selected");
  assert.equal(mergeSlotState(entries, mergeSideBrowser, "m31"), "replaced");
  assert.deepEqual(
    mergeResultItems(entries).map((entry) => [entry.id, entry.startMinute]),
    [
      ["m31", 0],
      ["ngc7000", 400],
    ],
    "the swapped entry keeps its place in the result",
  );

  // And clicking that same copy again takes it out altogether.
  entries = toggleMergeEntry(entries, mergeSideOther, other[0]);
  assert.equal(mergeSlotState(entries, mergeSideBrowser, "m31"), "available");
  assert.equal(mergeSlotState(entries, mergeSideOther, "m31"), "available");
});

test("the result holds copies: editing it never touches either version", () => {
  const source = item("m42", 126, 240);
  let entries = toggleMergeEntry([], mergeSideBrowser, source);
  entries = updateMergeEntryWindow(entries, "m42", { endMinute: 180 });
  assert.equal(source.endMinute, 240);
  const whole = wholeVersionEntries(other, mergeSideOther);
  whole[0].item.startMinute = 30;
  assert.equal(other[0].startMinute, 0);
  assert.deepEqual(
    whole.map((entry) => entry.side),
    [mergeSideOther, mergeSideOther],
  );
});

test("the small cross removes a target from the result", () => {
  const entries = wholeVersionEntries(browser, mergeSideBrowser);
  assert.deepEqual(
    mergeResultItems(removeMergeEntry(entries, "m31")).map((entry) => entry.id),
    ["m42"],
  );
});

test("resizing a result target moves its window and updates the total", () => {
  let entries = wholeVersionEntries(browser, mergeSideBrowser);
  const before = mergeWindows(mergeResultItems(entries), night);
  assert.deepEqual(before, [
    { id: "m31", start: 60, end: 200 },
    { id: "m42", start: 126, end: 240 },
  ]);
  assert.equal(mergeTotalMinutes(before), 140 + 114);

  // The end handle of M31, pulled back to where M42 starts.
  entries = updateMergeEntryWindow(entries, "m31", { endMinute: 126 });
  // The start handle of M42 on its own (no overlap left): resize only.
  entries = updateMergeEntryWindow(entries, "m42", { startMinute: 130 });
  const after = mergeWindows(mergeResultItems(entries), night);
  assert.deepEqual(after, [
    { id: "m31", start: 60, end: 126 },
    { id: "m42", start: 130, end: 240 },
  ]);
  assert.equal(mergeTotalMinutes(after), 66 + 110);
  assert.deepEqual(mergeOverlaps(after), []);
});

test("an overlap is accepted and reported, never refused", () => {
  // Everything added at once: M31 from both versions cannot coexist (one
  // target, one entry) but M42 and NGC 7000 join the browser's M31.
  let entries = wholeVersionEntries(browser, mergeSideBrowser);
  entries = toggleMergeEntry(entries, mergeSideOther, other[1]);
  let windows = mergeWindows(mergeResultItems(entries), night);
  assert.deepEqual(mergeOverlaps(windows), [
    { firstId: "m31", secondId: "m42", start: 126, end: 200 },
  ]);

  // The planner's own end-handle rule, dragged deep into NGC 7000's window:
  // bounded by the night, snapped only near an edge, never stopped by it.
  const schedule = windows.map((window) => ({
    item: { id: window.id },
    window,
  }));
  const m42 = schedule.find((entry) => entry.item.id === "m42");
  const end = snapToScheduleEdge(
    460,
    "m42",
    schedule,
    m42.window.start + 5,
    600,
  );
  assert.deepEqual(end, { value: 460, snapped: false });
  entries = updateMergeEntryWindow(entries, "m42", { endMinute: end.value });
  windows = mergeWindows(mergeResultItems(entries), night);
  assert.deepEqual(
    mergeResultItems(entries).map((entry) => entry.id),
    ["m31", "m42", "ngc7000"],
    "every target stays in the result",
  );
  assert.deepEqual(mergeOverlaps(windows), [
    { firstId: "m31", secondId: "m42", start: 126, end: 200 },
    { firstId: "m42", secondId: "ngc7000", start: 400, end: 460 },
  ]);
  assert.equal(mergeTotalMinutes(windows), 140 + 334 + 120);

  // While a target overlaps, the planner's start handle still changes only
  // its start; moving the whole window is its own
  // gesture, `scheduleWindowShift`, which keeps the duration.
  const overlapped = windows.map((window) => ({
    item: { id: window.id },
    window,
  }));
  const m31 = overlapped.find((entry) => entry.item.id === "m31");
  assert.ok(overlapSegments(m31, overlapped).length > 0);
  const started = scheduleStartUpdate({
    value: 100,
    itemId: "m31",
    schedule: overlapped,
    window: m31.window,
  });
  assert.deepEqual(started.patch, { startMinute: 100 });
  const moved = scheduleWindowShift({
    value: 100,
    itemId: "m31",
    schedule: overlapped,
    window: m31.window,
    total: 600,
  });
  assert.deepEqual(moved.patch, { startMinute: 100, endMinute: 240 });
  entries = updateMergeEntryWindow(entries, "m31", moved.patch);
  assert.deepEqual(
    mergeWindows(mergeResultItems(entries), night).find(
      (window) => window.id === "m31",
    ),
    { id: "m31", start: 100, end: 240 },
  );
});

test("a version's overlapping targets get their own lanes on its timeline", () => {
  const { lanes, count } = mergeRailLanes(mergeWindows(browser, night));
  assert.equal(count, 2);
  assert.notEqual(lanes.get("m31"), lanes.get("m42"));
  const apart = mergeRailLanes(mergeWindows(other, night));
  assert.equal(apart.count, 1);
  assert.equal(apart.lanes.get("m31"), 0);
  assert.equal(apart.lanes.get("ngc7000"), 0);
});

test("targets without a card tonight are left off the timelines", () => {
  assert.deepEqual(
    mergeWindows([item("m31", 590, 700), item("unknown", 0, 60)], night),
    [{ id: "m31", start: 590, end: 600 }],
  );
  assert.deepEqual(mergeWindows(browser, null), []);
});
