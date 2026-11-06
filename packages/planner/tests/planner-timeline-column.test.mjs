import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  timelineAddLine,
  timelineColumnMinWidth,
  timelineDurationLabel,
  timelineTotals,
  timelineTotalsLine,
} from "../dist/timeline-column.js";

// On a wide screen the timeline is a column beside the stages, headed by its
// actions; on a narrow one, the stage after the targets stays as it was. The
// page is read as a source and its stylesheet as text;

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const source = read("../src/components/PlannerPage.js");
const dist = read("../dist/components/PlannerPage.js");
const css = read("../../portal-app/styles/portal.css");
const nbsp = " ";

// The body of the `@media (min-width: 761px)` block that holds [needle].
function wideBlockWith(needle) {
  const at = css.indexOf(needle);
  assert.ok(at >= 0, `expected ${needle}`);
  const open = css.lastIndexOf("@media (min-width: 761px)", at);
  assert.ok(open >= 0, `${needle} sits in the wide block`);
  // No block closes between the media query and the rule: it is inside.
  return css.slice(open, at + 400);
}

test("from 761 px the night's panel is two columns, the timeline stage in the second, sticky", () => {
  assert.equal(timelineColumnMinWidth, 761);
  const block = wideBlockWith(
    "#planner-night-panel.has-timeline-column > .planner-schedule-stage",
  );
  assert.match(
    block,
    /#planner-night-panel\.has-timeline-column \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(19rem, 25rem\)/,
  );
  const stage = css.slice(
    css.indexOf(
      "#planner-night-panel.has-timeline-column > .planner-schedule-stage",
    ),
  );
  const rule = stage.slice(0, stage.indexOf("}"));
  assert.match(rule, /grid-column: 2;/);
  assert.match(rule, /position: sticky;/);
  for (const text of [source, dist])
    assert.match(
      text,
      /id="planner-night-panel"\s+className=\{activePlan \? "has-timeline-column" : undefined\}/,
    );
});

test("below 761 px the stage stays as it was: the add card kept, and a one-row header of undo, redo, share -- nothing floats", () => {
  // The column header is hidden outside the wide block as a whole…
  assert.match(
    css,
    /\.planner-timeline-column-header \{\s*display: none;\s*\}\s*@media \(min-width: 761px\)/,
  );
  // …the phone width shows its actions and the display selector only…
  assert.match(
    css,
    /@media \(max-width: 760px\) \{[^@]*\.planner-timeline-column-header \{\s*display: flex;/,
  );
  // (the notice of overlapping targets is an action to take, not a reading:
  // it stays, under the row, at the full width -- WEB-OVERLAP)…
  assert.match(
    css,
    /:not\(\.planner-timeline-totals-row\):not\(\s*\.planner-timeline-column-actions\s*\):not\(\.planner-plan-overlap\) \{\s*display: none;/,
  );
  assert.match(
    css,
    /\.planner-timeline-column-header > \.planner-plan-overlap \{\s*flex: 1 1 100%;/,
  );
  // …and the add card is hidden only inside the wide block.
  const block = wideBlockWith(".planner-target-added-notice {");
  assert.match(
    block,
    /\.planner-target-added-notice \{\s*display: none !important;/,
  );
  // The pair that used to float over the page (portalled to the body, fixed
  // at the bottom left) is gone, with its style and its page padding.
  assert.ok(!css.includes(".planner-plan-history-floating"));
  assert.ok(!css.includes("has-floating-history"));
  for (const text of [source, dist]) {
    assert.ok(!text.includes("planner-plan-history-floating"));
    assert.ok(!text.includes("has-floating-history"));
    assert.ok(
      text.includes(
        'className="planner-add-notice planner-target-added-notice"',
      ),
    );
    // The stage still follows the targets in the page.
    assert.ok(
      text.indexOf('id="planner-target-step"') <
        text.indexOf('id="planner-schedule-step"'),
    );
  }
});

test("the column's header: undo, redo, share (today's export dialog), the totals, then the add line", () => {
  for (const text of [source, dist]) {
    const start = text.indexOf('className="planner-timeline-column-header"');
    assert.ok(start > text.indexOf('id="planner-schedule-step"'));
    const header = text.slice(start, start + 6000);
    const actions = [...header.matchAll(/data-timeline-action="(\w+)"/g)].map(
      (match) => match[1],
    );
    assert.deepEqual(actions, ["undo", "redo", "share"]);
  }
  const header = source.slice(
    source.indexOf('className="planner-timeline-column-header"'),
  );
  assert.match(header, /undoPlan\(activePlan\.id\)/);
  assert.match(header, /redoPlan\(activePlan\.id\)/);
  assert.match(header, /onClick=\{\(\) => setExportPlanId\(activePlan\.id\)\}/);
  assert.match(header, /message\(locale, "plannerTimelineShare"\)/);
  assert.ok(
    header.indexOf("planner-timeline-add-line") <
      header.indexOf("planner-timeline-totals"),
  );
  // The add records its placement for the line.
  assert.match(
    source,
    /placement: \{\s*designation: plannerTimelineLabel\(card\.target\),\s*reason: added\.reason,\s*minutes: added\.item\.durationMinutes,\s*spreadCount: added\.spreadCount,\s*\}/,
  );
});

test("the totals line: the union of the placed intervals, the night minus it, the overlaps", () => {
  const night = {
    start: "2026-10-14T19:49:00.000Z",
    end: "2026-10-15T02:44:00.000Z",
  };
  const card = (id) => ({
    target: { id },
    usableStart: night.start,
    usableEnd: night.end,
  });
  const cards = ["a", "b", "c"].map(card);
  const items = [
    { id: "a", startMinute: 0, endMinute: 70 },
    { id: "b", startMinute: 70, endMinute: 215 },
    { id: "c", startMinute: 300, endMinute: 400 },
  ];
  const totals = timelineTotals({ cards, items, night });
  assert.deepEqual(totals, {
    count: 3,
    placedMinutes: 315,
    freeMinutes: 100,
    overlaps: 0,
  });
  assert.equal(
    timelineTotalsLine("fr", totals),
    `3 cibles · 5${nbsp}h${nbsp}15 placées · 1${nbsp}h${nbsp}40 libre`,
  );
  // Two that overlap count their shared time once.
  const overlapping = timelineTotals({
    cards,
    items: [
      { id: "a", startMinute: 0, endMinute: 100 },
      { id: "b", startMinute: 60, endMinute: 160 },
    ],
    night,
  });
  assert.equal(overlapping.placedMinutes, 160);
  assert.equal(overlapping.overlaps, 1);
  assert.match(timelineTotalsLine("fr", overlapping), / · 1 chevauchement$/);
  // An empty plan says today's invitation.
  assert.equal(
    timelineTotalsLine("fr", timelineTotals({ cards, items: [], night })),
    "Commencez ce plan d’observation",
  );
  assert.equal(timelineDurationLabel(45), `45${nbsp}min`);
  assert.equal(timelineDurationLabel(360), `6${nbsp}h`);
});

test("the add line by placement reason, in the ten languages", () => {
  const added = { designation: "NGC 7000", minutes: 45 };
  assert.equal(
    timelineAddLine("fr", { ...added, reason: "ideal" }),
    "NGC 7000 placée",
  );
  assert.equal(
    timelineAddLine("fr", { ...added, reason: "free-slot" }),
    "NGC 7000 placée",
  );
  assert.equal(
    timelineAddLine("fr", { ...added, reason: "shortened" }),
    `NGC 7000 placée · raccourcie à 45${nbsp}min`,
  );
  assert.equal(
    timelineAddLine("fr", { ...added, reason: "overlap-fallback" }),
    "NGC 7000 placée · 1 chevauchement",
  );
  for (const locale of [
    "en",
    "fr",
    "ja",
    "de",
    "es",
    "it",
    "pt-BR",
    "ru",
    "zh-Hans",
    "zh-Hant",
  ]) {
    for (const reason of [
      "ideal",
      "shortened",
      "overlap-fallback",
      "no-time",
    ]) {
      const line = timelineAddLine(locale, { ...added, reason });
      assert.ok(line.includes("NGC 7000"), `${locale} ${reason}`);
      assert.ok(!/\{\w+\}/.test(line), `${locale} ${reason}: ${line}`);
    }
    const totals = timelineTotalsLine(locale, {
      count: 2,
      placedMinutes: 90,
      freeMinutes: 30,
      overlaps: 2,
    });
    assert.ok(!/\{\w+\}/.test(totals), `${locale}: ${totals}`);
  }
});

test("the add line when the plan was spread, or when there was no room left", () => {
  const added = { designation: "M 31", minutes: 60 };
  // No room even once the plan was spread: it says so first.
  assert.match(
    timelineAddLine("fr", { ...added, reason: "no-time", spreadCount: 2 }),
    /^M 31\s: plus le temps ce soir$/,
  );
  assert.equal(
    timelineAddLine("en", { ...added, reason: "no-time" }),
    "M 31: no time left tonight",
  );
  // What moved matters more than where the new target stands.
  assert.equal(
    timelineAddLine("fr", { ...added, reason: "free-slot", spreadCount: 1 }),
    "1 cible répartie dans la nuit.",
  );
  assert.equal(
    timelineAddLine("fr", { ...added, reason: "free-slot", spreadCount: 3 }),
    "3 cibles réparties dans la nuit.",
  );
  assert.equal(
    timelineAddLine("en", { ...added, reason: "free-slot", spreadCount: 2 }),
    "2 targets spread across the night.",
  );
  assert.equal(
    timelineAddLine("fr", { ...added, reason: "free-slot" }),
    "M 31 placée",
  );
  for (const locale of [
    "de",
    "es",
    "it",
    "ja",
    "pt-BR",
    "ru",
    "zh-Hans",
    "zh-Hant",
  ])
    for (const spreadCount of [1, 5]) {
      const line = timelineAddLine(locale, {
        ...added,
        reason: "free-slot",
        spreadCount,
      });
      assert.ok(line.includes(String(spreadCount)), `${locale}: ${line}`);
      assert.ok(!/\{\w+\}/.test(line), `${locale}: ${line}`);
    }
});
