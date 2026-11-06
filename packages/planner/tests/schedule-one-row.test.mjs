import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { message } from "portal/i18n.js";
import { createScheduleBlockMeasure } from "planner/schedule-block-measure.js";
import {
  scheduleBlockCarriesContent,
  scheduleBlockMark,
  scheduleOrderNumbers,
  scheduleRowOrder,
} from "planner/schedule.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The web's stage-5 frise puts every slot of the
// plan on one row of today's blocks, with the edit line under it (the page's
// editor opens there), the small intervals | numbers selector and no clock
// under the blocks.

await registerJsx();
const { ScheduleDisplaySwitch } =
  await import("planner/components/ScheduleDisplaySwitch.js");

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const source = read("../src/components/PlannerPage.js");
const dist = read("../dist/components/PlannerPage.js");
const css = read("../../portal-app/styles/portal.css");
const planSchedule = (text) =>
  text.slice(
    text.indexOf("function PlanSchedule("),
    text.indexOf("function PlanMergeVersionRail("),
  );

const entry = (id, start, end) => ({
  item: { id },
  window: { start, end },
});

test("the one row paints the slots by start, then end, then list order: the later lies over the earlier", () => {
  const entries = [
    entry("c", 200, 260),
    entry("a", 100, 220),
    entry("b", 100, 160),
    entry("d", 100, 160),
  ];
  assert.deepEqual(
    scheduleRowOrder(entries).map(({ item }) => item.id),
    ["b", "d", "a", "c"],
  );
  // The order does not touch the list it is given.
  assert.deepEqual(
    entries.map(({ item }) => item.id),
    ["c", "a", "b", "d"],
  );
});

test("the numbers of the night follow the row, one for each slot, from the plan as written", () => {
  const written = [
    entry("late", 300, 360),
    entry("early", 0, 60),
    entry("middle", 120, 180),
  ];
  assert.deepEqual(
    [...scheduleOrderNumbers(written)],
    [
      ["early", 1],
      ["middle", 2],
      ["late", 3],
    ],
  );
  // A slot being dragged past another does not renumber: the numbers are read
  // from the written plan, not from the draft.
  const dragged = [
    entry("late", 300, 360),
    entry("early", 320, 380),
    entry("middle", 120, 180),
  ];
  assert.equal(scheduleOrderNumbers(written).get("early"), 1);
  assert.equal(scheduleOrderNumbers(dragged).get("early"), 3);
});

test("a block carries its name and duration when it is wide enough: a 20 minute block of a long night is a block", () => {
  // 720 px for a 9 h 44 night: 20 minutes are about 25 px, 2 h 5 are 154 px.
  const pixels = (minutes) => (minutes / 584) * 720;
  assert.equal(scheduleBlockCarriesContent(pixels(20)), false);
  assert.equal(scheduleBlockCarriesContent(pixels(125)), true);
  // At a narrow width the rule is the same: 12 pt is a block.
  assert.equal(scheduleBlockCarriesContent((20 / 584) * 342), false);
});

// "Laissé": same rule.
test("a block writes its name when it fits, otherwise its number, never a cut name", () => {
  // A fixed-pitch font: 6 px a character.
  const measure = (text) => String(text).length * 6;
  const mark = (name, number, widthPixels) =>
    scheduleBlockMark({ name, number, widthPixels, measure });
  // "NGC 7000" is 48 px; the block less its frame (2) and padding (12.16).
  const exact = 48 + 2 + 12.16;
  assert.equal(mark("NGC 7000", 3, exact), "name");
  assert.equal(mark("NGC 7000", 3, exact - 1), "number");
  // A 25 px block: the number.
  assert.equal(mark("NGC 7000", 3, 25), "number");
  // A wide block: the name.
  assert.equal(mark("M31", 1, 125), "name");
  // Not even the number fits (6 px in 4 px): nothing.
  assert.equal(mark("NGC 7000", 3, 9), "none");
  // The number of two digits needs two characters.
  assert.equal(mark("NGC 7000", 12, 14), "none");
  assert.equal(mark("NGC 7000", 12, 16.1), "number");
});

test("without a canvas the older rule stands: the name when the block carries content, else nothing", () => {
  assert.equal(
    scheduleBlockMark({ name: "M31", number: 1, widthPixels: 125 }),
    "name",
  );
  assert.equal(
    scheduleBlockMark({ name: "M31", number: 1, widthPixels: 20 }),
    "none",
  );
  assert.equal(createScheduleBlockMeasure(null), null);
});

test("the page draws the number in a block whose name does not fit, as the numbers display does", () => {
  for (const text of [source, dist]) {
    const body = planSchedule(text);
    assert.match(body, /scheduleBlockMark\(/);
    assert.match(body, /blockMark === "number"/);
    assert.match(body, /showsNumber\s*\?\s*" is-numbered"/);
  }
});

test("PlanSchedule draws one row, at the exact extent, with no clock under the blocks", () => {
  for (const text of [source, dist]) {
    const body = planSchedule(text);
    // One row element for the whole plan, its blocks inside.
    assert.equal(
      (body.match(/className="planner-schedule-row"/g) ?? []).length,
      1,
    );
    assert.match(body, /scheduleRowOrder\(schedule\)/);
    // No floor on the drawn width, no clock under a block.
    assert.doesNotMatch(body, /Math\.max\(\s*5,/);
    assert.doesNotMatch(body, /planner-schedule-tick/);
    assert.doesNotMatch(body, /stackedTimelineTicks/);
    // The overlap of two slots is drawn on the row, for every caller.
    assert.doesNotMatch(body, /markOverlaps/);
    assert.match(body, /planner-schedule-row-overlap/);
  }
  assert.doesNotMatch(css, /\.planner-schedule-tick/);
  assert.match(
    css,
    /\.planner-schedule-row \{\s*position: relative;\s*height: 3\.25rem;/,
  );
});

test("under the row, the edit line: its help at rest, the page's editor in its host, the tick that closes, no ✕", () => {
  for (const text of [source, dist]) {
    const body = planSchedule(text);
    assert.match(body, /className="planner-schedule-edit-line"/);
    assert.match(body, /hidden=\{hasEditingItem\}/);
    assert.match(body, /message\(locale, "plannerScheduleEditLineHelp"\)/);
    assert.match(body, /className="planner-schedule-editor-host"/);
    // The tick closes: no ✕ in the web's editor, every release has written.
    assert.match(body, /className="is-validate"/);
    assert.match(body, /message\(locale, "plannerSlotValidate"\)/);
    assert.match(body, /onEdit\(null\)/);
    assert.doesNotMatch(body, /plannerScheduleEditorClose/);
    // The block that went down leaves its hole.
    assert.match(body, /\$\{isEditing \? " is-editing" : ""\}/);
  }
  assert.match(css, /\.planner-schedule-edit-line \{[^}]*height: 3\.5rem;/);
  assert.match(
    css,
    /\.planner-schedule-block\.is-editing,\s*\.planner-schedule-block\.is-editing:hover \{\s*border: 1\.2px dashed/,
  );
  assert.match(
    css,
    /prefers-reduced-motion: reduce\) \{\s*\.planner-schedule-block\.is-landing,\s*\.planner-schedule-editor \{\s*animation: none;/,
  );
});

test("the display selector: two icons, intervals by default, the specified names, numbers on request", () => {
  const render = (value) =>
    renderToStaticMarkup(
      createElement(ScheduleDisplaySwitch, {
        locale: "fr",
        value,
        onChange: () => {},
      }),
    );
  const intervals = render("intervals");
  assert.match(intervals, /role="radiogroup"/);
  assert.match(intervals, /aria-label="Affichage de la frise"/);
  assert.match(
    intervals,
    /aria-label="Afficher les créneaux en intervalles"[^>]*data-display="intervals"|aria-checked="true"[^>]*aria-label="Afficher les créneaux en intervalles"/,
  );
  assert.match(intervals, /aria-label="Afficher les cibles en chiffres"/);
  assert.equal((intervals.match(/role="radio"/g) ?? []).length, 2);
  assert.equal((intervals.match(/is-active/g) ?? []).length, 1);
  assert.match(
    intervals,
    /aria-checked="true"[^>]*data-display="intervals"[^>]*class="is-active"/,
  );
  const numbers = render("numbers");
  assert.match(
    numbers,
    /aria-checked="true"[^>]*data-display="numbers"[^>]*class="is-active"/,
  );
  // No text: the icons are drawn, the names are the accessible ones.
  assert.doesNotMatch(numbers.replace(/<svg.*?<\/svg>/g, ""), />[^<]+</);
  // It ends the totals line, and the page keeps the choice in its state only.
  for (const text of [source, dist]) {
    assert.match(text, /planner-timeline-totals-row/);
    assert.match(text, /display: scheduleDisplay|display=\{scheduleDisplay\}/);
  }
  assert.match(source, /useState\("intervals"\)/);
  assert.doesNotMatch(
    read("../src/components/ScheduleDisplaySwitch.js"),
    /localStorage|sessionStorage/,
  );
});

const locales = [
  "fr",
  "en",
  "ja",
  "de",
  "es",
  "it",
  "pt-BR",
  "ru",
  "zh-Hans",
  "zh-Hant",
];
const keys = [
  "plannerScheduleEditLineHelp",
  "plannerScheduleDisplayLabel",
  "plannerScheduleDisplayIntervals",
  "plannerScheduleDisplayNumbers",
  "plannerSlotValidate",
];

test("the new words are in the ten catalogues, and the web's help says « Cliquez »", () => {
  for (const locale of locales)
    for (const key of keys) {
      const text = message(locale, key);
      assert.ok(
        typeof text === "string" && text.length > 3 && text !== key,
        `${locale}.${key}`,
      );
    }
  assert.equal(
    message("fr", "plannerScheduleEditLineHelp"),
    "Cliquez sur une cible pour ajuster son créneau",
  );
  assert.equal(
    message("fr", "plannerScheduleDisplayLabel"),
    "Affichage de la frise",
  );
  assert.equal(
    message("fr", "plannerScheduleDisplayIntervals"),
    "Afficher les créneaux en intervalles",
  );
  assert.equal(
    message("fr", "plannerScheduleDisplayNumbers"),
    "Afficher les cibles en chiffres",
  );
});
