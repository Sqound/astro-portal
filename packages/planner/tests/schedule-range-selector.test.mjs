import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  scheduleStartUpdate,
  scheduleWindowShift,
  snapToScheduleEdge,
} from "../dist/schedule.js";

// The range selector's rule, its
// conformity fixtures, and the web slot editor without "Valider".

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const source = read("../src/components/PlannerPage.js");
const dist = read("../dist/components/PlannerPage.js");

// M31 until 23:30 overlaps a late NGC 7000 that ends with the night (480).
const late = { start: 420, end: 480 };
const schedule = [
  { item: { id: "m31" }, window: { start: 200, end: 440 } },
  { item: { id: "ngc7000" }, window: late },
];

test("the left handle always changes the start, the right one always the end, overlap or not", () => {
  // Rightwards, up to the end less the 5 min minimum; the end never moves.
  assert.deepEqual(
    scheduleStartUpdate({
      value: 470,
      itemId: "ngc7000",
      schedule,
      window: late,
    }),
    { snapped: false, patch: { startMinute: 470 } },
  );
  assert.deepEqual(
    scheduleStartUpdate({
      value: 600,
      itemId: "ngc7000",
      schedule,
      window: late,
    }).patch,
    { startMinute: 475 },
  );
  // Leftwards, down to the night's start; still the start alone.
  assert.deepEqual(
    scheduleStartUpdate({
      value: 300,
      itemId: "ngc7000",
      schedule,
      window: late,
    }).patch,
    { startMinute: 300 },
  );
  assert.deepEqual(
    scheduleStartUpdate({
      value: -50,
      itemId: "ngc7000",
      schedule,
      window: late,
    }).patch,
    { startMinute: 0 },
  );
  // Snapping to a neighbour's edge stays.
  assert.deepEqual(
    scheduleStartUpdate({
      value: 436,
      itemId: "ngc7000",
      schedule,
      window: late,
    }),
    { snapped: true, patch: { startMinute: 440 } },
  );
  // The end handle: bounded by the start plus 5 min and by the night.
  assert.deepEqual(
    snapToScheduleEdge(400, "ngc7000", schedule, late.start + 5, 480),
    { value: 425, snapped: false },
  );
});

test("moving the whole slot keeps its duration, stays in the night and snaps either edge", () => {
  const ngc7000 = { start: 300, end: 345 };
  const around = [
    { item: { id: "m31" }, window: { start: 76, end: 241 } },
    { item: { id: "m45" }, window: { start: 296, end: 386 } },
    { item: { id: "ngc7000" }, window: ngc7000 },
  ];
  const moved = (value, total = 415) =>
    scheduleWindowShift({
      value,
      itemId: "ngc7000",
      schedule: around,
      window: ngc7000,
      total,
    });
  assert.deepEqual(moved(150).patch, { startMinute: 150, endMinute: 195 });
  assert.deepEqual(moved(900).patch, { startMinute: 370, endMinute: 415 });
  assert.deepEqual(moved(-20).patch, { startMinute: 0, endMinute: 45 });
  // 236 → its start lands on M31's end (241).
  assert.deepEqual(moved(236), {
    snapped: true,
    snappedEdge: "start",
    patch: { startMinute: 241, endMinute: 286 },
  });
  // 254 → its end lands on M45's start (296).
  assert.deepEqual(moved(254), {
    snapped: true,
    snappedEdge: "end",
    patch: { startMinute: 251, endMinute: 296 },
  });
});

test("the conformity fixtures of the rule replay against the planner", () => {
  // The rule is the open planner's, so are its fixtures: the public
  // contracts' fixtures.
  for (const [module, run] of [
    ["schedule-start-update", (input) => scheduleStartUpdate(input)],
    ["schedule-window-shift", (input) => scheduleWindowShift(input)],
  ]) {
    const fixture = read(`../../astro-contracts/fixtures/${module}.json`);
    const spec = JSON.parse(
      read(`../../astro-contracts/fixtures/spec/${module}.json`),
    );
    assert.equal(spec.package, "planner");
    assert.equal(spec.file, "schedule");
    const { cases } = JSON.parse(fixture);
    assert.equal(cases.length, spec.cases.length, module);
    assert.ok(cases.length >= 7, module);
    for (const { id, args, result } of cases)
      assert.deepEqual(run(args[0]), result, `${module} · ${id}`);
  }
  // No case keeps the former "shift the whole window" flag.
  const spec = read(
    "../../astro-contracts/fixtures/spec/schedule-start-update.json",
  );
  assert.ok(!spec.includes("shiftWholeWindow"));
});

test("the web slot editor has no « Valider »: each retouch is written when it is let go, one undoable change per opening", () => {
  for (const text of [source, dist]) {
    const start = text.indexOf("function PlanSchedule(");
    const end = text.indexOf("\nfunction ", start + 10);
    const schedule = text.slice(start, end);
    assert.ok(!schedule.includes('"plannerConfirm"'), "no ✓ « Valider »");
    assert.ok(!schedule.includes("is-confirm"));
    assert.ok(!schedule.includes("onConfirm"));
    // The release, the arrow keys and ↔ write through one function…
    assert.match(
      schedule,
      /releasePointerCapture\(event\.pointerId\);\s*writeScheduleRetouch\(\s*gesture\.itemId,\s*gesture\.patch,\s*gesture\.others,\s*gesture\.preview,?\s*\);/,
    );
    assert.equal(schedule.match(/writeScheduleRetouch\(item\.id,/g)?.length, 3);
    // …which records one step per opening of the editor.
    assert.match(
      schedule,
      /onWindowEditStart\(itemId, editSession\);\s*onWindowChange\(itemId, patch, \{ recordHistory: false \}\);/,
    );
    // The start handle's bound no longer depends on an overlap.
    assert.match(schedule, /aria-valuemax=\{Math\.max\(0, window\.end - 5\)\}/);
  }
  for (const text of [source, dist])
    assert.match(
      text,
      /onWindowEditStart=\{\(itemId, session\) =>\s*rememberScheduleRetouch\(activePlan\.id, session\)\s*\}/,
    );
});

test("pressing and dragging the selected range moves the slot (any pointer, a finger included), the handles keep their keys", () => {
  for (const text of [source, dist]) {
    const start = text.indexOf("function PlanSchedule(");
    const schedule = text.slice(start, text.indexOf("\nfunction ", start + 10));
    assert.match(
      schedule,
      /className=\{`planner-schedule-selection\$\{\s*readOnly \? "" : " is-movable"\s*\}`\}/,
    );
    assert.match(
      schedule,
      /startScheduleDrag\(\s*event,\s*item\.id,\s*window\.start,\s*resolveShift,?\s*\);/,
    );
    assert.doesNotMatch(
      schedule,
      /pointerType === "touch"\)\s*return;\s*startScheduleDrag/,
    );
    assert.match(schedule, /scheduleWindowShift\(\{/);
    assert.equal(schedule.match(/onKeyDown=/g)?.length, 2);
  }
  const css = read("../../portal-app/styles/portal.css");
  assert.match(
    css,
    /\.planner-schedule-selection\.is-movable \{\s*cursor: grab;\s*pointer-events: auto;/,
  );
});
