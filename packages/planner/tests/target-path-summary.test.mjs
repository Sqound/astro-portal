import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { message } from "portal/i18n.js";
import { targetNightMoon } from "../src/target-night-moon.js";
import { targetNightPath } from "../src/target-path.js";
import {
  targetPathDrawing,
  targetPathSummaryRows,
  targetPathSummaryState,
} from "../src/target-path-summary.js";

// The web's "Déplacement de la cible": what the dialog shows (its state, its
// four lines, its drawing) read from the pure module it is built from, and
// the wiring of the page — the card's icon opens the dialog — read in the
// page's source, as the other page tests of this package do.

const start = Date.parse("2026-11-14T18:00:00Z");
const at = (index) => new Date(start + index * 600000).toISOString();

// A target that rises behind a 20° mask in the east, culminates at 69° in the
// south and sets behind the mask in the west — the sample night.
const night = Array.from({ length: 73 }, (_, index) => ({
  time: at(index),
  altitude: -5 + 74 * Math.sin((Math.PI * index) / 72),
  azimuth: 60 + index * (240 / 72),
  moonSeparation: 120 + index * 0.2,
}));
const mask = {
  enabled: true,
  points: Array.from({ length: 12 }, (_, index) => ({
    azimuth: index * 30,
    altitude: 20,
  })),
};
const path = targetNightPath({ series: night, mask, minAltitude: 30 });
// The Moon is up all night, high in the south-west.
const moonTrack = night.map((point, index) => ({
  time: point.time,
  altitude: 40 - index * 0.2,
  azimuth: 200 + index,
}));
const moonOf = (series) => targetNightMoon({ series, track: moonTrack });

test("a night with a window is « normal » and lists the four lines, in its order", () => {
  assert.equal(targetPathSummaryState(path), "normal");
  const rows = targetPathSummaryRows(path, { moon: moonOf(night) });
  assert.deepEqual(
    rows.map((row) => row.kind),
    ["clears", "culmination", "back", "moon"],
  );
  assert.equal(rows[1].altitude, 69);
  assert.equal(rows[0].times.length, 1);
  // The Moon's two extreme separations, not one angle.
  assert.deepEqual([rows[3].min, rows[3].max], [120, 134]);
});

test("the French lines are the specified wording, to the character", () => {
  assert.equal(message("fr", "targetPathOpen"), "Déplacement de la cible");
  assert.equal(message("fr", "targetPathClearsMask"), "Sort du masque à");
  assert.equal(message("fr", "targetPathCulminates"), "Culmine à");
  assert.equal(
    message("fr", "targetPathBackBehindMask"),
    "Repasse derrière le masque à",
  );
  assert.equal(
    message("fr", "targetPathMoonSeparation"),
    "Écart avec la Lune :",
  );
  assert.equal(message("fr", "targetPathSummary"), "Résumé du trajet");
  assert.equal(
    message("fr", "targetPathShowOnMap"),
    "Voir sur la carte d’horizon",
  );
  assert.equal(message("fr", "targetPathMask"), "Masque d’horizon");
  for (const locale of ["en", "ja"])
    assert.notEqual(
      message(locale, "targetPathOpen"),
      message("fr", "targetPathOpen"),
    );
});

test("no window tonight, no mask, never above the horizon: the three other states", () => {
  const low = targetNightPath({
    series: night.map((point) => ({
      ...point,
      altitude: point.altitude / 2.5,
    })),
    mask,
    minAltitude: 30,
  });
  assert.equal(targetPathSummaryState(low), "no-window");
  assert.equal(low.noWindowReason, "below-minimum");

  const open = targetNightPath({
    series: night,
    mask: { ...mask, enabled: false },
    minAltitude: 30,
  });
  assert.deepEqual(
    targetPathSummaryRows(open, { moon: moonOf(night) }).map((row) => row.kind),
    ["no-mask", "culmination", "moon"],
  );
  assert.equal(targetPathDrawing(open).mask, null);

  const down = targetNightPath({
    series: night.map((point) => ({ ...point, altitude: -10 })),
    mask,
  });
  assert.equal(targetPathSummaryState(down), "never-up");
  assert.deepEqual(targetPathSummaryRows(down), []);
  assert.deepEqual(targetPathDrawing(down, { mask }).strokes, []);
});

test("the drawing splits the path into solid and dashed stretches, with the window, the crossings and the culmination", () => {
  const drawing = targetPathDrawing(path, { mask });
  assert.deepEqual(
    drawing.strokes.map((stroke) => stroke.kind),
    ["masked", "visible", "visible", "visible", "masked"],
  );
  assert.ok(drawing.window.startsWith("M"));
  assert.ok(drawing.mask.area.endsWith("Z"));
  assert.deepEqual(
    drawing.crossings.map((crossing) => crossing.kind),
    ["clears", "back"],
  );
  // East is on the right of the plot, west on the left (north up).
  assert.ok(drawing.crossings[0].x > 100);
  assert.equal(drawing.crossings[0].anchor, "end");
  assert.ok(drawing.crossings[1].x < 100);
  // The culmination, in the south, is below the zenith.
  assert.ok(drawing.culmination.y > 100);
  assert.equal(drawing.culmination.altitude, 69);
  assert.ok(drawing.arrow.d.startsWith("M"));
  assert.deepEqual(
    drawing.cardinals.map((cardinal) => cardinal.label),
    ["N", "E", "S", "O"],
  );
});

const source = readFileSync(
  new URL("../src/components/PlannerPage.js", import.meta.url),
  "utf8",
);
const dist = readFileSync(
  new URL("../dist/components/PlannerPage.js", import.meta.url),
  "utf8",
);
const dialog = readFileSync(
  new URL("../src/components/TargetPathSummary.js", import.meta.url),
  "utf8",
);

const facts = readFileSync(
  new URL("../src/components/TargetFactsBlocks.js", import.meta.url),
  "utf8",
);

test("the planner's cards no longer open the dialog; « Statistiques de la cible » carries the card under the curve", () => {
  // No button, no state, no dialog on the planner page.
  assert.doesNotMatch(source, /planner-target-path-trigger/);
  assert.doesNotMatch(source, /onShowPath|setPathCard|TargetPathSummary/);
  assert.doesNotMatch(dist, /planner-target-path-trigger|setPathCard/);
  // The card is the second thing of "Cette nuit", after its panel, and its
  // glyph is the icon of "Saison": same button class, same head row.
  assert.match(facts, /night\.state === "ready" &&[\s\S]*?<TargetPathCard/);
  assert.match(facts, /className="multi-night-season-head"/);
  assert.match(
    facts,
    /className="multi-night-season-toggle planner-target-path-enlarge"/,
  );
  // The dialog is the enlarged view; the card leaves the culmination out
  // (the curve's text above says it once).
  assert.match(facts, /culminationRow=\{false\}/);
  for (const key of [
    "targetPathClearsMask",
    "targetPathCulminates",
    "targetPathBackBehindMask",
    "targetPathMoonSeparation",
  ])
    assert.ok(dialog.includes(`"${key}"`), `the content writes ${key}`);
  assert.match(dialog, /aria-label=\{message\(locale, "targetPathSummary"\)\}/);
  assert.ok(
    readFileSync(
      new URL("../dist/components/TargetFactsBlocks.js", import.meta.url),
      "utf8",
    ).includes("TargetPathCard"),
    "dist is rebuilt",
  );
});
