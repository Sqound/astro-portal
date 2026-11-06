import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import {
  targetPathGlyph,
  targetPathGlyphShapes,
} from "../src/target-path-glyph.js";

// The "astre sur l'horizon" glyph — a horizon line, a dotted arc above it, a
// dot on the arc — replaces the old arc-and-ring icon of "Déplacement de la
// cible" on the web, from one description.
await registerJsx();
const { TargetPathIcon } =
  await import("planner/components/TargetPathSummary.js");

test("the glyph's shapes: a horizon, a dotted course above it, the body on the course", () => {
  const shapes = targetPathGlyphShapes();
  assert.equal(shapes.horizon, "M2 19H22");
  assert.equal(shapes.arc, "M3 19A9 12 0 0 1 21 19");
  assert.equal(shapes.dash, "0 3.6");
  const { cx, cy, rx, ry } = targetPathGlyph.arc;
  const onEllipse =
    ((shapes.body.cx - cx) / rx) ** 2 + ((shapes.body.cy - cy) / ry) ** 2;
  assert.ok(Math.abs(onEllipse - 1) < 0.005, `body off the arc: ${onEllipse}`);
  assert.ok(shapes.body.cy < targetPathGlyph.horizon.y, "body above horizon");
});

test("the card's path icon renders the shared glyph, dotted, with a filled body", () => {
  const markup = renderToStaticMarkup(createElement(TargetPathIcon));
  const shapes = targetPathGlyphShapes();
  assert.match(markup, /viewBox="0 0 24 24"/);
  assert.ok(markup.includes(`d="${shapes.horizon}"`), markup);
  assert.ok(markup.includes(`d="${shapes.arc}"`), markup);
  assert.ok(markup.includes(`stroke-dasharray="${shapes.dash}"`), markup);
  assert.ok(
    markup.includes(
      `cx="${shapes.body.cx}" cy="${shapes.body.cy}" r="${shapes.body.r / 2}" stroke-width="${shapes.body.r}"`,
    ),
    markup,
  );
});

test("no web icon keeps the old arc: the summary's and the horizon card's culmination use the glyph", () => {
  for (const file of ["TargetPathSummary.js", "HorizonPathLayer.js"]) {
    const source = readFileSync(
      new URL(`../src/components/${file}`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /M3 19 C7 6 17 6 21 19/, file);
    assert.match(source, /TargetPathGlyph/, file);
  }
});
