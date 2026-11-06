import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  timelinePlanSlotLine,
  timelinePlanTargets,
} from "../dist/timeline-column.js";

// With no target open, the plan's targets under the web column's timeline, in
// the order of the night, as the stage-4 cards. The page is read as a source.

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const source = read("../src/components/PlannerPage.js");
const dist = read("../dist/components/PlannerPage.js");
const css = read("../../portal-app/styles/portal.css");
const nbsp = "\u00a0";

const night = {
  start: "2026-10-14T19:49:00.000Z",
  end: "2026-10-15T02:44:00.000Z",
};
const card = (id) => ({
  target: { id },
  usableStart: night.start,
  usableEnd: night.end,
});

test("the plan's targets are sorted by the start of their slot, then its end, then the plan's order; an unresolved card is left out", () => {
  const cards = ["m45", "ngc7000", "m31", "ic1396", "m33"].map(card);
  const items = [
    { id: "m45", startMinute: 266, endMinute: 366 },
    { id: "ngc7000", startMinute: 221, endMinute: 266 },
    { id: "m31", startMinute: 76, endMinute: 221 },
    { id: "ic1396", startMinute: 6, endMinute: 76 },
    // Same start as M31, shorter: before it.
    { id: "m33", startMinute: 76, endMinute: 120 },
    // No card (not resolved yet): not listed, as the timeline does not draw it.
    { id: "ghost", startMinute: 0, endMinute: 30 },
  ];
  const rows = timelinePlanTargets({ cards, items, night });
  assert.deepEqual(
    rows.map((row) => row.itemId),
    ["ic1396", "m33", "m31", "ngc7000", "m45"],
  );
  assert.deepEqual(
    rows.map((row) => [row.start, row.end]),
    [
      [6, 76],
      [76, 120],
      [76, 221],
      [221, 266],
      [266, 366],
    ],
  );
  assert.equal(rows[0].card, cards[3]);
  // Two with the same slot keep the plan's own order.
  const twins = timelinePlanTargets({
    cards: ["b", "a"].map(card),
    items: [
      { id: "b", startMinute: 10, endMinute: 20 },
      { id: "a", startMinute: 10, endMinute: 20 },
    ],
    night,
  });
  assert.deepEqual(
    twins.map((row) => row.itemId),
    ["b", "a"],
  );
  assert.deepEqual(timelinePlanTargets({ cards, items: [], night }), []);
  assert.deepEqual(timelinePlanTargets({ cards, items, night: null }), []);
});

test("« Dans ce plan · 19:55 → 21:05 · 1 h 10 », in French, English and Japanese", () => {
  const clock = (minute) => {
    const at = new Date(Date.parse(night.start) + minute * 60000);
    return `${String(at.getUTCHours()).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")}`;
  };
  const row = { start: 6, end: 76 };
  assert.equal(
    timelinePlanSlotLine("fr", row, clock),
    `Dans ce plan · 19:55 → 21:05 · 1${nbsp}h${nbsp}10`,
  );
  assert.match(
    timelinePlanSlotLine("en", row, clock),
    /^In this plan · 19:55 → 21:05 · /,
  );
  assert.match(
    timelinePlanSlotLine("ja", row, clock),
    /^このプランに含まれる · 19:55 → 21:05 · /,
  );
  assert.equal(
    timelinePlanSlotLine("fr", { start: 221, end: 266 }, clock),
    `Dans ce plan · 23:30 → 00:15 · 45${nbsp}min`,
  );
});

test("the column lists them under the timeline only when no target is open, before « Suggérer les meilleures cibles »; a click opens the slot editing", () => {
  for (const text of [source, dist]) {
    const list = text.indexOf("<PlanTargetList");
    assert.ok(list > 0, "the list is in the page");
    // In the schedule stage, after the timeline, before the tertiary.
    assert.ok(text.indexOf('id="planner-schedule-step"') < list);
    assert.ok(text.lastIndexOf("<PlanSchedule", list) > 0);
    assert.ok(list < text.indexOf('className="planner-autofill-row"', list));
    // Only while no item of the plan is open in the editor.
    assert.match(
      text.slice(Math.max(0, list - 900), list),
      /!activePlan\.items\.some\(\s*\(item\) => item\.id === editingItemId,?\s*\)/,
    );
    // A click on a card opens its editing; ✕ removes it; read-only, inert.
    assert.match(
      text,
      /onOpen=\{editable \? \(\) => onOpen\(row\.itemId\) : null\}/,
    );
    assert.match(text, /onRemove=\{\(\) => onRemove\(row\.itemId\)\}/);
    assert.match(text, /onOpen=\{setEditingItemId\}/);
    assert.match(
      text,
      /aria-label=\{message\(locale, "plannerTimelinePlanTargets"\)\}/,
    );
    assert.match(
      text,
      /planSlot=\{timelinePlanSlotLine\(locale, row, clock\)\}/,
    );
  }
  assert.match(css, /\.planner-timeline-plan-targets \{[^}]*list-style: none;/);
  assert.match(css, /\.planner-target-in-plan \{[^}]*color: var\(--success\);/);
});
