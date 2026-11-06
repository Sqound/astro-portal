// The web catalogue's three counters: the figure centred and bigger (1.5 rem),
// the label centred at the bottom of the box, one common shrink for the three
// figures with a 14 px floor ("14386/14386" stays whole in a 100 px box).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(
  new URL("../../portal-app/styles/portal.css", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../src/components/PlannerPage.js", import.meta.url),
  "utf8",
);

const rule = (selector) => {
  const start = css.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, `${selector} has a rule`);
  return css.slice(start, css.indexOf("\n}", start));
};

test("a counter box centres its figure and sets its label at the bottom", () => {
  const box = rule(".planner-target-catalogue-summary article");
  assert.match(box, /text-align:\s*center/);
  assert.match(box, /justify-items:\s*center/);
  assert.match(box, /align-content:\s*space-between/);
  assert.match(box, /padding:\s*0\.5rem 0\.4rem/, "8 px above and below");
  assert.match(box, /container-type:\s*inline-size/);
});

test("the figure is 1.5 rem, tabular, and shrinks in common down to 14 px", () => {
  const figure = rule(".planner-target-catalogue-summary strong");
  assert.match(figure, /font-size:\s*1\.5rem/);
  assert.match(figure, /font-variant-numeric:\s*tabular-nums/);
  assert.match(figure, /clamp\(\s*0\.875rem,/);
  assert.match(figure, /var\(--catalogue-figure-chars/);
  assert.match(figure, /1\.5rem\s*\)/);
});

test("the page hands the three figures' longest length to the stylesheet", () => {
  assert.match(page, /"--catalogue-figure-chars":\s*summaryFigureChars/);
  assert.match(
    page,
    /summaryFigureChars = Math\.max\(\s*3,\s*\.\.\.summaryFigures\.map/,
  );
  // The three boxes read the same array, so they cannot drift apart.
  for (const index of [0, 1, 2]) {
    assert.match(
      page,
      new RegExp(`<strong>\\{summaryFigures\\[${index}\\]\\}</strong>`),
    );
  }
});
