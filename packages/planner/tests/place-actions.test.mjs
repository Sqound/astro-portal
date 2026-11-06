// At stage 1 of the
// web planner the place's actions stand right under the place field, the
// Bortle line has no counterpart on the web and the horizon state is no longer
// written after the coordinates; a place with no horizon drawn shows the inert
// badge "Horizon à relever" where the link to see it would be.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { shippedLocales } from "portal/locales.js";
import { plannerFlowMessage as flow } from "portal/planner/flow-messages.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { PlannerHorizonBadge, HorizonGlyph } =
  await import("planner/components/PlannerHorizonBadge.js");

const page = await readFile(
  new URL("../src/components/PlannerPage.js", import.meta.url),
  "utf8",
);
const stage = page.slice(
  page.indexOf('id="planner-place-label"') - 400,
  page.indexOf("<NightSpanTimeline"),
);

test("the row of actions is inside the place field's cell, before the date", () => {
  const cell = stage.indexOf("planner-place-picker");
  const actions = stage.indexOf('className="planner-place-actions"');
  const date = stage.indexOf("<PlannerDatePicker");
  assert.ok(cell > 0 && actions > cell, "the actions follow the place field");
  assert.ok(date > actions, "the date comes after the actions");
  assert.equal(
    stage.split('className="planner-place-actions"').length,
    2,
    "one row of actions, no second one under the date",
  );
});

test("the link carries the horizon glyph and is a link; « Éditer ce lieu » a tertiary; the badge replaces the link without a horizon", () => {
  const row = stage.slice(stage.indexOf('className="planner-place-actions"'));
  const link = row.indexOf('className="btn-link"');
  const glyph = row.indexOf("<HorizonGlyph />");
  const badge = row.indexOf("<PlannerHorizonBadge");
  const edit = row.indexOf('className="btn-tertiary"');
  assert.ok(
    link > 0 && glyph > link,
    "the glyph is in the link, before its words",
  );
  assert.ok(badge > glyph, "the badge stands in the other branch");
  assert.ok(edit > badge, "« Éditer ce lieu » comes last, on the right");
  assert.match(row.slice(0, badge), /placeHorizonDrawn \?/);
  assert.match(row.slice(badge, edit), /horizonNone/);
});

test("the coordinates line no longer carries the horizon state", () => {
  const summary = page.slice(
    page.indexOf('className="planner-location-summary"'),
    page.indexOf('className="planner-location-summary"') + 1200,
  );
  assert.match(summary, /state\.location\.timeZone/);
  assert.doesNotMatch(summary, /horizon/i);
});

test("the badge is a status, not a button, with the glyph, in the ten languages", () => {
  for (const locale of shippedLocales()) {
    for (const key of ["horizonNone", "horizonUnknown"]) {
      const label = flow(locale, key);
      assert.ok(label, `${locale} has ${key}`);
      const markup = renderToStaticMarkup(
        createElement(PlannerHorizonBadge, { label }),
      );
      assert.match(markup, /class="planner-horizon-badge"/);
      assert.match(markup, /role="status"/);
      assert.match(markup, /<svg[^>]*aria-hidden="true"/);
      assert.ok(
        markup.includes(label.replaceAll("'", "&#x27;")),
        `${locale} writes ${key}`,
      );
      for (const touchable of ["<button", "<a ", "onclick", "tabindex"]) {
        assert.ok(!markup.toLowerCase().includes(touchable), touchable);
      }
    }
  }
  assert.equal(flow("fr", "horizonNone"), "Horizon à relever");
  assert.equal(flow("fr", "viewHorizon"), "Voir l’horizon de ce lieu");
  assert.match(renderToStaticMarkup(createElement(HorizonGlyph)), /M3 19l6-10/);
});

test("the badge is grey and framed in the stylesheet, never gold", async () => {
  const css = await readFile(
    new URL("../../portal-app/styles/portal.css", import.meta.url),
    "utf8",
  );
  const rule = css.slice(
    css.indexOf(".planner-horizon-badge {"),
    css.indexOf("}", css.indexOf(".planner-horizon-badge {")),
  );
  assert.match(rule, /border: 1px solid #465247/);
  assert.match(rule, /color: var\(--muted\)/);
  assert.match(rule, /background: var\(--panel\)/);
  assert.doesNotMatch(rule, /accent|e0a85e|gold/i);
});
