import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// A plan opened to be edited arrives with stage 1 "Lieu et date" folded and the
// page scrolled to the plan tabs; adding a plan from the tabs of the editor
// leaves stage 1 as it was. Read as a source, as `planner-stage-order.test.mjs`
// does.

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const source = read("../src/components/PlannerPage.js");
const dist = read("../dist/components/PlannerPage.js");
const css = read("../../portal-app/styles/portal.css");

const between = (text, from, to) => {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `expected ${from}`);
  const end = text.indexOf(to, start);
  assert.ok(end > start, `expected ${to}`);
  return text.slice(start, end);
};

test("opening a plan to edit it folds stage 1 and lands on the plan tabs, smoothly unless motion is reduced", () => {
  const select = between(
    source,
    "const selectPlan = (id, { openEditor = false } = {}) => {",
    '// "Nouveau plan"',
  );
  assert.match(select, /if \(openEditor\) \{/);
  assert.match(select, /placeCollapsed: true/);
  assert.match(select, /plan\.id === id/);
  assert.match(select, /planTabsHeadingRef\.current/);
  assert.match(select, /prefers-reduced-motion: reduce/);
  assert.match(select, /behavior: reduce \? "auto" : "smooth"/);
  assert.match(select, /block: "start"/);
  // Choosing a tab (no `openEditor`) moves nothing.
  assert.doesNotMatch(
    select.slice(0, select.indexOf("if (openEditor)")),
    /scrollIntoView|placeCollapsed/,
  );
  assert.match(
    source,
    /className="planner-night-tabs-heading"\s+ref=\{planTabsHeadingRef\}/,
  );
  // It lands under the site header and the page's sticky bar.
  assert.match(
    css,
    /\.planner-flow \.planner-night-tabs-heading,\s*\.planner-flow \.planner-target-list \{\s*scroll-margin-top/,
  );
  assert.match(dist, /planTabsHeadingRef/);
});

test("a plan added from the editor's tabs keeps stage 1 as it was; one added from the library keeps it open", () => {
  const add = between(
    source,
    "const addPlan = () => {",
    "const commitPlaceChange",
  );
  assert.match(add, /const keepPlaceFold = plannerView === "editor"/);
  assert.match(add, /\?\.placeCollapsed/);
  assert.match(add, /if \(!keepPlaceFold \|\| !folded\) return next/);
  assert.match(add, /placeCollapsed: true/);
});
