// The map controls of stage 4 on the web: the drop-down chips and their menus,
// "Calques" and its dot, the settings icon and its dialog, the order under the
// map and the vertical drag that turns the circular sky.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { message } from "portal/i18n.js";
import {
  horizonRotateBandWidth,
  horizonRotateStartsInCentre,
  horizonRotationForDrag,
} from "../src/horizon-rotate-gesture.js";

await registerJsx();
const { HorizonLayersChip, MapMenuChip, MapSettingsButton } =
  await import("planner/components/MapControlChips.js");

const source = readFileSync(
  new URL("../src/components/PlannerPage.js", import.meta.url),
  "utf8",
);
const projection = source.slice(
  source.indexOf("function PlannerHorizonProjection("),
  source.indexOf("function PrintableHorizonProjection("),
);

test("a chip shows its value, its icon and a chevron, without gold at rest", () => {
  const markup = renderToStaticMarkup(
    createElement(MapMenuChip, {
      className: "planner-map-chip-view",
      label: "Horizon",
      glyph: "horizon",
      menuLabel: "Vue de la carte",
      value: "projection",
      items: [
        { value: "realistic", label: "Absolue", glyph: "absolute" },
        { value: "projection", label: "Horizon", glyph: "horizon" },
      ],
      onSelect() {},
    }),
  );
  assert.match(markup, /class="planner-map-chip planner-map-chip-view"/);
  assert.doesNotMatch(markup, /is-open/);
  assert.match(markup, /aria-haspopup="menu"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /is-horizon/);
  assert.match(markup, /is-chevron/);
  assert.match(markup, />Horizon</);
  // The menu is not in the page until the chip is touched.
  assert.doesNotMatch(markup, /role="menu"/);
});

test("« Calques » carries its dot while a layer is on, its gold only while open", () => {
  const chip = (props) =>
    renderToStaticMarkup(
      createElement(HorizonLayersChip, {
        locale: "fr",
        onOpen() {},
        ...props,
      }),
    );
  const rest = chip({ open: false, active: false });
  assert.doesNotMatch(rest, /is-open|is-active|planner-horizon-layers-active/);
  assert.match(rest, />Calques</);
  const layerOn = chip({ open: false, active: true });
  assert.match(layerOn, /is-active/);
  assert.match(layerOn, /planner-horizon-layers-active/);
  assert.doesNotMatch(layerOn, /is-open/);
  // Open without a layer on: gold, no dot.
  const open = chip({ open: true, active: false });
  assert.match(open, /is-open/);
  assert.doesNotMatch(open, /planner-horizon-layers-active/);
  const settings = renderToStaticMarkup(
    createElement(MapSettingsButton, { locale: "fr", onOpen() {} }),
  );
  assert.match(settings, /aria-label="Réglages de la carte"/);
  assert.doesNotMatch(settings, /is-open|is-active/);
});

test("the row, the menus, the dialogs and the order under the map", () => {
  // The chips of the row, then the map right under it.
  const row = projection.indexOf("<MapControlsRow");
  const canvas = projection.indexOf("<HorizonProjectionCanvas");
  assert.ok(row > 0 && canvas > row);
  for (const part of [
    "{viewChip}",
    'className="planner-map-chip-mode"',
    "<HorizonLayersChip",
    "<MapSettingsButton",
  ])
    assert.ok(projection.indexOf(part) > row, part);
  // Under the map: the list of targets first, then the messages, then the
  // path's legend and card.
  const order = [
    "<HorizonProjectionCanvas",
    "<HorizonPathTargetChips",
    'text={message(locale, "horizonMapHelpLine")}',
    'flow(locale, "horizonTimeHint")',
    'flow(locale, "horizonRotateHint")',
    "<HorizonPathLegend",
  ].map((part) => projection.indexOf(part));
  assert.ok(order.every((at) => at > 0));
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  // "Réglages de la carte" holds the four settings of the old panel.
  assert.match(projection, /title=\{message\(locale, "plannerMapSettings"\)\}/);
  assert.match(projection, /<HorizonProjectionControls/);
  // The vertical drag sets the orientation; the rotation hint only on the
  // circular sky.
  assert.match(projection, /onRotationChange=\{setRotation\}/);
  assert.match(projection, /projection === "circular" && \(/);
  // The view chip of the stage, and no "Absolue | Horizon" left on the
  // heading row.
  assert.match(source, /const skyMapViewChip = \(\s*<MapMenuChip/);
  assert.doesNotMatch(source, /planner-sky-map-view-switch/);
});

test("the vertical drag: about 180° over the map, by 5°, never from the side bands", () => {
  assert.equal(horizonRotateBandWidth, 48);
  assert.equal(horizonRotateStartsInCentre(47, 342), false);
  assert.equal(horizonRotateStartsInCentre(48, 342), true);
  assert.equal(horizonRotateStartsInCentre(294, 342), true);
  assert.equal(horizonRotateStartsInCentre(295, 342), false);
  const turn = (startRotation, dy) =>
    horizonRotationForDrag({ startRotation, dy, height: 342 });
  assert.equal(turn(0, 0), 0);
  assert.equal(turn(0, 171), 90);
  assert.equal(turn(0, -171), -90);
  assert.equal(turn(0, 4), 0);
  assert.equal(turn(0, 6), 5);
  assert.equal(turn(170, 38), -170);
  assert.equal(turn(0, 342), 180);
  for (let dy = -800; dy <= 800; dy += 7) {
    const value = turn(35, dy);
    assert.ok(value >= -180 && value <= 180, `${dy}: ${value}`);
    assert.equal(Math.abs(value % 5), 0);
  }
});

test("the French texts are the specified ones, to the character", () => {
  assert.equal(message("fr", "plannerMapSettings"), "Réglages de la carte");
  assert.equal(
    message("fr", "plannerMapSettingsClose"),
    "Fermer les réglages de la carte",
  );
  assert.equal(
    message("fr", "horizonRotateHintInfoLabel"),
    "Rotation de la carte : en savoir plus",
  );
  for (const locale of ["en", "ja"])
    assert.notEqual(
      message(locale, "plannerMapSettings"),
      message("fr", "plannerMapSettings"),
    );
});
