import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The timeline panel is stage 5 of the planner; its title "Organiser la nuit"
// carries the numbered gold badge of the other stages, the stages' own
// `.planner-step-number`. The page is read as a source and its stylesheet as
// text.

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const source = read("../src/components/PlannerPage.js");
const dist = read("../dist/components/PlannerPage.js");
const css = read("../../portal-app/styles/portal.css");

test("the title of the timeline stage carries the badge « 5 », in front of « schedule »", () => {
  for (const text of [source, dist]) {
    const heading = text.match(
      /<h2[^>]*id="planner-schedule-step"[^>]*>([\s\S]*?)<\/h2>/,
    );
    assert.ok(heading, "the timeline stage has its heading");
    assert.match(
      heading[1],
      /^\s*<span className="planner-step-number">5<\/span>\s*\{flow\(locale, "schedule"\)\}\s*$/,
      "the badge, then the title",
    );
  }
});

test("the badge is the stages' own class, one rule for all five, and the timeline stage never folds into the outline", () => {
  // The same class and markup as stage 4's heading.
  for (const text of [source, dist])
    assert.match(
      text,
      /<span className="planner-step-number">4<\/span>\s*\{flow\(locale, "targets"\)\}/,
    );
  // One open look for every `.planner-flow-stage`: solid accent, dark digit.
  const rule = css.match(
    /\.planner-flow-stage \.planner-step-number \{([^}]*)\}/,
  );
  assert.ok(rule, "the stages' badge rule");
  assert.match(rule[1], /background: var\(--accent\)/);
  assert.match(rule[1], /color: var\(--stage-badge-text\)/);
  // The folded outline only applies to a closed <details>: the timeline stage
  // is a <section>, so it always wears the solid badge.
  assert.match(
    css,
    /details\.planner-flow-stage:not\(\[open\]\) \.planner-step-number \{/,
  );
  assert.match(
    source,
    /<section\s+className="planner-flow-stage planner-schedule-stage"/,
  );
  // No rule of its own for the timeline stage's badge.
  assert.doesNotMatch(css, /planner-schedule-stage[^{]*\.planner-step-number/);
});

test("the sticky stage band still lists the five stages, stage 5 included, and is not changed", () => {
  for (const text of [source, dist])
    assert.match(
      text,
      /\{ step: 5, title: flow\(locale, "schedule"\) \}/,
      "the band keeps its fifth crumb",
    );
});
