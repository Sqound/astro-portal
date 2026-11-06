import assert from "node:assert/strict";
import test from "node:test";
import { suggestNight } from "../src/suggest-night.js";
import { autoFillNight } from "../src/auto-fill.js";
import {
  base,
  at,
  candidate,
  suggestionCases,
} from "./helpers/suggestion-cases.mjs";
const run = (id) =>
  suggestNight(suggestionCases.find((c) => c.id === id).args[0]);
const ids = (r) => r.items.map((i) => i.target.id);
for (const count of [2, 3, 4, 6])
  test(`requested ${count} caps the placement`, () => {
    const result = run(`count-${count}`);
    assert.equal(result.requested, count);
    assert.equal(result.placed, count);
    assert.equal(result.shortfall, null);
  });
test("all fills the night beyond six targets", () => {
  const r = run("all-without-six-limit");
  assert.ok(r.placed > 6);
  assert.equal(r.imagingMinutes, 720);
});
test("visual-eight slots each last exactly twenty minutes", () => {
  const r = run("visual-eight");
  assert.equal(r.placed, 8);
  assert.ok(r.items.every((i) => i.durationMinutes === 20));
});
test("a visual slot is never shortened to fit nineteen minutes", () => {
  const r = run("visual-cannot-shorten");
  assert.equal(r.placed, 1);
  assert.equal(r.items[0].durationMinutes, 20);
  assert.equal(r.shortfall.minimumMinutes, 20);
});
test("kept slots and planned obstacles never move during refresh", () => {
  const options = {
    ...suggestionCases.find((c) => c.id === "kept-and-excluded-on-refresh")
      .args[0],
    items: [{ id: "obstacle", startMinute: 300, endMinute: 430 }],
  };
  const before = structuredClone(options);
  const r = suggestNight(options);
  assert.deepEqual(options, before);
  const kept = r.items.find((i) => i.kept);
  assert.equal(kept.startMinute, 100);
  assert.equal(kept.endMinute, 190);
  for (const item of r.items)
    assert.ok(item.endMinute <= 300 || item.startMinute >= 430);
  assert.equal(r.placed, 3);
});
test("excluded ids never return", () => {
  const r = suggestNight({ ...base, count: "all", excluded: ["t00", "t01"] });
  assert.ok(!ids(r).includes("t00") && !ids(r).includes("t01"));
});
test("done is excluded with the latest capture date", () => {
  const r = run("captured-latest-date");
  assert.ok(!ids(r).includes("t00"));
  assert.equal(r.captured[0].date, "2026-10-03");
});
test("by default a done target stays in the pool and pays its malus; excludeCaptured gives back the exclusion", () => {
  const stay = run("captured-stay-in");
  assert.equal(stay.captured.length, 1);
  assert.ok(!ids(stay).includes("t00"), "done in October: sent far down");
  const list = run("malus-done-yesterday-drops-to-the-end");
  assert.equal(list.items.at(-1).target.id, "t00");
  assert.ok(list.items.at(-1).previous.malus > 30);
  const excluded = run("exclude-captured-gives-back-the-exclusion");
  assert.ok(!ids(excluded).includes("t00"), "done: left out");
  assert.ok(ids(excluded).includes("t01"), "partial: stays");
  assert.ok(excluded.items.every((item) => !item.previous));
  assert.equal(excluded.captured.length, 1);
});
test("tonight's better note lifts the malus, an unknown note gives no credit, partial counts at what was done", () => {
  assert.equal(
    run("malus-lifted-by-a-much-better-night").items[0].target.id,
    "t00",
  );
  assert.equal(
    run("malus-lifted-by-a-much-better-night").items[0].previous.malus,
    0,
  );
  const unknown = run("malus-without-a-known-note-gives-no-credit");
  assert.equal(unknown.items.at(-1).previous.noteNow, null);
  assert.equal(unknown.items.at(-1).previous.noteThen, null);
  const partial = run("malus-partial-counts-at-what-was-done");
  assert.equal(partial.items.at(-1).previous.outcome, "partial");
  assert.ok(
    partial.items.at(-1).previous.malus <
      run("malus-done-yesterday-drops-to-the-end").items.at(-1).previous.malus,
  );
  assert.equal(partial.captured.length, 0);
});
test("a visual target forgets faster; a request over the ticked targets and the continuing group are exempt", () => {
  const visual = run("malus-visual-forgets-faster");
  assert.ok(visual.items.find((i) => i.target.id === "t00").previous.malus < 3);
  assert.deepEqual(ids(run("malus-only-request-keeps-the-order")), [
    "t00",
    "t01",
  ]);
  const resumed = run("malus-continuing-group-is-exempt");
  assert.equal(resumed.items[0].target.id, "t00");
  assert.equal(resumed.items[0].group, "continue");
});
test("skipped and partial targets remain eligible", () => {
  const r = run("skipped-and-partial-not-captured");
  assert.ok(ids(r).includes("t00") && ids(r).includes("t01"));
  assert.deepEqual(r.captured, []);
});
test("visual observed is captured", () =>
  assert.ok(!ids(run("visual-observed")).includes("t00")));
test("continuing target is selected before higher scored targets", () => {
  const r = run("continuing-first");
  assert.ok(ids(r).includes("t20"));
  assert.ok(!ids(r).includes("t01"));
  const i = r.items.find((i) => i.target.id === "t20");
  assert.equal(i.group, "continue");
  assert.equal(i.progress.acquiredMinutes, 250);
});
test("list selection has no more than three per type", () => {
  const r = run("variety");
  assert.equal(r.placed, 10);
  for (const type of new Set(r.items.map((i) => i.type)))
    assert.ok(r.items.filter((i) => i.type === type).length <= 3);
});
test("same seed repeats and distinct seeds select different targets", () => {
  assert.deepEqual(run("seed-night-a"), run("seed-night-a"));
  assert.notDeepEqual(ids(run("seed-night-a")), ids(run("seed-night-b")));
});
test("tier two returns its position and lower scores", () => {
  const r = run("tier-two");
  assert.deepEqual(r.position, { from: 11, to: 20 });
  assert.ok(r.items.every((i) => i.lowered && i.score));
});
test("photo estimate uses lower median rounded to fifteen minutes", () => {
  const r = run("estimate-photo-lower-median");
  assert.deepEqual(r.estimate, { count: 9, slotMinutes: 75 });
});
test("visual estimate divides usable free time by twenty", () =>
  assert.deepEqual(run("estimate-visual").estimate, {
    count: 12,
    slotMinutes: 20,
  }));
test("a twenty-five minute gap reports the floor and free time", () => {
  const r = run("nothing-fits-25-minutes");
  assert.equal(r.placed, 0);
  assert.deepEqual(r.shortfall, {
    kind: "short",
    freeMinutes: 25,
    minimumMinutes: 45,
  });
  assert.equal(r.estimate.count, 0);
});
test("all kept targets return unchanged and no other target is added", () => {
  const r = run("everything-kept");
  assert.equal(r.placed, 2);
  assert.ok(r.items.every((i) => i.kept));
  assert.deepEqual(
    r.items.map((i) => [i.target.id, i.startMinute, i.endMinute]),
    [
      ["t00", 0, 90],
      ["t01", 90, 180],
    ],
  );
});
test("apply only recomputes exactly the checked targets from strict ranking", () => {
  const r = run("apply-only");
  assert.deepEqual(new Set(ids(r)), new Set(["t00", "t02"]));
  assert.equal(r.items.find((i) => i.target.id === "t00").placement, "ideal");
  assert.equal(
    r.items.find((i) => i.target.id === "t02").placement,
    "free-slot",
  );
});
test("apply empty selection adds nothing", () =>
  assert.equal(suggestNight({ ...base, only: [], count: 3 }).placed, 0));
test("list ignores the plan's occupancy and places targets independently", () => {
  const r = run("list-independent-and-best-window");
  assert.deepEqual(new Set(ids(r)), new Set(["t01", "t02"]));
  assert.deepEqual(r.items.find((i) => i.target.id === "t01").bestWindow, {
    start: at(55),
    end: at(220),
    startMinute: 55,
    endMinute: 220,
  });
  assert.ok(
    r.items[0].startMinute < r.items[1].endMinute &&
      r.items[1].startMinute < r.items[0].endMinute,
  );
});
test("best window clips to the custom span and chooses earliest on ties", () => {
  const c = candidate("a");
  c.card.visibilityWindows = [
    { start: at(0), end: at(100) },
    { start: at(200), end: at(290) },
  ];
  const r = suggestNight({
    ...base,
    candidates: [c],
    layout: "list",
    span: { start: at(10), end: at(300) },
  });
  assert.equal(r.items[0].bestWindow.startMinute, 10);
  assert.equal(r.items[0].bestWindow.endMinute, 100);
});
test("shortfall names the longest qualifying gap with its start time", () => {
  const r = run("shortfall-dew");
  assert.equal(r.shortfall.kind, "dew");
  assert.equal(
    r.shortfall.start,
    r.free.sort((a, b) => b.minutes - a.minutes)[0].start,
  );
});
test("shortfall uses earlier gap on equal lengths", () => {
  const r = suggestNight({
    ...base,
    candidates: [],
    count: 3,
    items: [{ id: "busy", startMinute: 240, endMinute: 480 }],
  });
  assert.equal(r.shortfall.startMinute, 0);
  assert.equal(r.shortfall.minutes, 240);
});
test("imaging duration is clamped to forty-five through one hundred eighty", () => {
  const r = suggestNight({
    ...base,
    candidates: [
      candidate("a", { minutes: 10 }),
      candidate("b", { minutes: 400 }),
    ],
    count: 2,
  });
  assert.deepEqual(
    r.items.map((i) => i.durationMinutes).sort((a, b) => a - b),
    [45, 180],
  );
});
test("unreadable nights return null", () =>
  assert.equal(run("unreadable-night"), null));
test("autoFillNight's explicit count calls the suggestion extension", () =>
  assert.deepEqual(
    autoFillNight({ ...base, count: 3 }),
    suggestNight({ ...base, count: 3 }),
  ));

test("a sparse pool cannot fill the sheet with more than three of a type", () => {
  const r = suggestNight({
    ...base,
    count: 6,
    candidates: Array.from({ length: 15 }, (_, i) =>
      candidate(`g${i}`, { type: "Galaxie" }),
    ),
  });
  assert.equal(r.placed, 3);
});
test("kept targets count toward the sheet's variety cap", () => {
  const r = suggestNight({
    ...base,
    count: 4,
    kept: [
      { id: "g0", startMinute: 0, endMinute: 90 },
      { id: "g1", startMinute: 90, endMinute: 180 },
    ],
    candidates: Array.from({ length: 8 }, (_, i) =>
      candidate(`g${i}`, { type: "Galaxie" }),
    ),
  });
  assert.equal(r.placed, 3);
});
test("the estimate reads the first ten strict scores before variety deferral", () => {
  const r = suggestNight({
    ...base,
    count: 2,
    candidates: [
      ...Array.from({ length: 10 }, (_, i) =>
        candidate(`g${i}`, { type: "Galaxie", score: 100 - i, minutes: 60 }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        candidate(`n${i}`, {
          type: "Nébuleuse planétaire",
          score: 80 - i,
          minutes: 180,
        }),
      ),
    ],
  });
  assert.equal(r.estimate.slotMinutes, 60);
});
test("only application ignores random offsets and tier deferral when ordering checked targets", () => {
  const r = suggestNight({
    ...base,
    count: 2,
    only: ["t00", "t01"],
    seed: "night-a",
    tier: 3,
  });
  assert.equal(r.items.find((i) => i.target.id === "t00").placement, "ideal");
});

test("kept targets absent from the current catalogue retain supplied data and slots", () => {
  const kept = {
    id: "gone",
    target: { id: "gone", designation: "GONE", title: "Retained" },
    startMinute: 10,
    endMinute: 100,
    score: { total: 70, max: 100 },
    tier: 2,
    lowered: true,
    reason: { kind: "meridian", time: at(55) },
  };
  const r = suggestNight({ ...base, count: 1, candidates: [], kept: [kept] });
  const row = r.items[0];
  for (const [key, value] of Object.entries(kept))
    assert.deepEqual(row[key], value);
  assert.equal(row.kept, true);
  assert.equal(row.group, "night");
});
