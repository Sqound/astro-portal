import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The
// framing settings button of the web editor shows that a mosaic exists. Off,
// the plain tertiary; on, the secondary look of a chosen segment (the class
// `is-active` had no rule at all, so the state was invisible), said to a
// screen reader as pressed.

await registerJsx();
const { FrameSettingsTool } =
  await import("planner/components/PlannerNightSkyMap.js");

const render = (props) =>
  renderToStaticMarkup(
    createElement(FrameSettingsTool, {
      locale: "fr",
      disabled: false,
      onConfigure: () => {},
      ...props,
    }),
  );

test("off, « Paramètres » is a tertiary, not pressed", () => {
  const markup = render({ active: false });
  assert.match(markup, /class="btn-tertiary planner-plan-tool"/);
  assert.doesNotMatch(markup, /btn-secondary|is-active|aria-pressed/);
  assert.match(markup, /Paramètres/);
});

test("with a mosaic it takes the secondary look and is pressed", () => {
  const markup = render({ active: true });
  assert.match(markup, /class="btn-secondary is-active planner-plan-tool"/);
  assert.match(markup, /aria-pressed="true"/);
  assert.doesNotMatch(markup, /btn-tertiary/);
});
