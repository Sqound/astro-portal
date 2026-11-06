import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { message } from "portal/i18n.js";
import {
  normalizePlanHorizonView,
  planViewForTargetSelection,
} from "portal/planner/state.js";
import { targetNightPath } from "../src/target-path.js";
import {
  horizonPathLayer,
  horizonPathPolylines,
  horizonPathSummary,
  horizonPathTargetId,
  zoneOffsetMinutes,
} from "../src/horizon-path-mode.js";

// The horizon map's path mode on the web: which target it draws, what its
// card says, how the path is drawn in each projection, and the wiring of the
// page (read in its source, as the other page tests of this package do).

const start = Date.parse("2026-11-14T18:00:00Z");
const at = (index) => new Date(start + index * 600000).toISOString();

// The sample night: a target rising in the east, culminating high in the
// south, going behind a notch of the mask in the west, clearing it again and
// sinking under the minimum altitude before the end of the night.
const night = Array.from({ length: 67 }, (_, index) => ({
  time: at(index),
  altitude: -4 + 90 * Math.sin((Math.PI * index) / 70),
  azimuth: 70 + index * (230 / 66),
  moonSeparation: 110,
}));
const mask = {
  enabled: true,
  points: Array.from({ length: 12 }, (_, index) => ({
    azimuth: index * 30,
    altitude: index === 9 ? 50 : 12,
  })),
};
const path = targetNightPath({
  series: night,
  mask,
  minAltitude: 20,
  tickOffsetMinutes: 60,
});

test("the path mode draws the chosen target, else the selected one, else the plan's first", () => {
  const targetIds = ["m31", "m33", "m45", "m74", "ic-1396"];
  assert.equal(
    horizonPathTargetId({ targetIds, pathTargetId: "m45" }),
    "m45",
    "the chosen target",
  );
  assert.equal(
    horizonPathTargetId({ targetIds, selectedTargetId: "m74" }),
    "m74",
    "by default, the target selected on the map",
  );
  assert.equal(
    horizonPathTargetId({ targetIds, selectedTargetId: "ngc-253" }),
    "m31",
    "a selected target outside the plan gives the plan's first",
  );
  assert.equal(horizonPathTargetId({ targetIds }), "m31");
});

test("a chosen target removed from the plan falls back, and a plan without target has none", () => {
  assert.equal(
    horizonPathTargetId({
      targetIds: ["m31", "m45"],
      pathTargetId: "m33",
      selectedTargetId: "m45",
    }),
    "m45",
  );
  assert.equal(
    horizonPathTargetId({ targetIds: ["m31", "m45"], pathTargetId: "m33" }),
    "m31",
  );
  assert.equal(
    horizonPathTargetId({ targetIds: [], pathTargetId: "m33" }),
    null,
  );
  assert.equal(horizonPathTargetId(), null);
});

test("the plan view keeps the mode and its target, and reads anything else as positions", () => {
  assert.deepEqual(normalizePlanHorizonView(undefined), {
    projection: "circular",
    rotation: 0,
    showLabels: false,
    sampleIndex: null,
    mode: "positions",
    pathTargetId: null,
    layers: { mask: true, lightPollution: false },
  });
  const path = normalizePlanHorizonView({
    projection: "linear",
    mode: "path",
    pathTargetId: "m31",
  });
  assert.equal(path.mode, "path");
  assert.equal(path.pathTargetId, "m31");
  assert.equal(path.projection, "linear");
  const unknown = normalizePlanHorizonView({ mode: "trail", pathTargetId: 7 });
  assert.equal(unknown.mode, "positions");
  assert.equal(unknown.pathTargetId, null);
  // Adding a target to the plan keeps the map in the mode it was in.
  assert.equal(
    planViewForTargetSelection({ horizon: { mode: "path" } }).horizon.mode,
    "path",
  );
});

test("the masked stretches of the night are dashed strokes, the stretch under the minimum has its own", () => {
  for (const projection of ["linear", "circular"]) {
    const layer = horizonPathLayer(path, { projection });
    const kinds = layer.strokes.map((stroke) => stroke.kind);
    const masked = path.segments.filter(
      (segment) => segment.state === "masked",
    );
    assert.ok(masked.length >= 2, "the notch and the rising behind the mask");
    assert.equal(
      kinds.filter((kind) => kind === "masked").length,
      masked.length,
      `one dashed stroke per masked stretch (${projection})`,
    );
    assert.ok(kinds.includes("visible"));
    assert.ok(kinds.includes("below-minimum"));
    assert.ok(layer.strokes.every((stroke) => stroke.d.startsWith("M")));
    assert.ok(layer.window.length >= 1, "the best window is drawn");
    assert.deepEqual(
      layer.crossings.map((crossing) => crossing.kind).sort(),
      [
        ...path.clearsMaskAt.map(() => "clears"),
        ...path.backBehindMaskAt.map(() => "back"),
      ].sort(),
    );
  }
});

test("the hour ticks are the place's full hours, inside the night and above the horizon", () => {
  const layer = horizonPathLayer(path, { projection: "linear" });
  assert.ok(layer.ticks.length >= 8);
  for (const tick of layer.ticks) {
    const ms = Date.parse(tick.time);
    assert.ok(ms >= Date.parse(path.start) && ms <= Date.parse(path.end));
    // The place is at UTC+1: its full hours fall on the hour in UTC too.
    assert.equal(new Date(ms).getUTCMinutes(), 0);
    assert.ok(tick.y <= 90 && tick.y >= 0);
  }
  // 18:00 UTC: the target is under the horizon, no tick is drawn for it.
  assert.ok(!layer.ticks.some((tick) => tick.time === at(0)));
  // A half-hour zone gets its own full hours.
  const india = targetNightPath({
    series: night,
    mask,
    minAltitude: 20,
    tickOffsetMinutes: zoneOffsetMinutes(night[0].time, "Asia/Kolkata"),
  });
  assert.equal(zoneOffsetMinutes(night[0].time, "Asia/Kolkata"), 330);
  assert.equal(zoneOffsetMinutes(night[0].time, undefined), 0);
  assert.ok(
    india.hourTicks.every(
      (tick) => new Date(Date.parse(tick.time)).getUTCMinutes() === 30,
    ),
  );
});

test("an hour label never sits on the current marker or a crossing", () => {
  const sampleTime = at(24);
  const layer = horizonPathLayer(path, {
    projection: "linear",
    sampleTime,
    scale: { x: 0.95, y: 2.27 },
  });
  assert.equal(layer.current.time, sampleTime);
  const tickAtCurrent = layer.ticks.find((tick) => tick.time === sampleTime);
  assert.ok(tickAtCurrent, "a full hour is on the current instant");
  assert.equal(tickAtCurrent.labelled, false);
  assert.ok(layer.ticks.some((tick) => tick.labelled));
  const beforeRise = horizonPathLayer(path, { sampleTime: at(0) });
  assert.equal(beforeRise.current, null, "no marker under the horizon");
});

test("one hour in two is labelled, counted from the path's first full hour", () => {
  for (const projection of ["linear", "circular"]) {
    // A plot large enough for the hours to have room.
    const layer = horizonPathLayer(path, {
      projection,
      scale:
        projection === "circular" ? { x: 1.7, y: 1.7 } : { x: 0.95, y: 2.27 },
    });
    assert.ok(layer.ticks.length >= 8);
    layer.ticks.forEach((tick, index) => {
      if (index % 2 === 1)
        assert.equal(
          tick.labelled,
          false,
          `the ${index + 1}th hour is not written (${projection})`,
        );
    });
    const labelled = layer.ticks.filter((tick) => tick.labelled);
    assert.ok(labelled.length >= 2, "the even hours that have room");
    // Two written hours are never two consecutive hours.
    for (const tick of labelled) assert.equal(layer.ticks.indexOf(tick) % 2, 0);
  }
  // The set does not change when the time slider moves, but for the one
  // label the current marker covers: counted from the path, not the clock.
  const early = horizonPathLayer(path, { sampleTime: at(20) });
  const late = horizonPathLayer(path, { sampleTime: at(60) });
  const written = (layer) =>
    layer.ticks
      .filter((tick) => tick.labelled)
      .map((tick) => layer.ticks.indexOf(tick) % 2);
  assert.ok(written(early).every((parity) => parity === 0));
  assert.ok(written(late).every((parity) => parity === 0));
});

test("an hour label sits beside its dot, off the stroke, inside the plot (H2)", () => {
  const scale = { x: 1.7, y: 1.7 };
  const size = { width: 34, height: 13 };
  for (const projection of ["linear", "circular"]) {
    const layer = horizonPathLayer(path, {
      projection,
      scale: projection === "circular" ? scale : { x: 0.95, y: 2.27 },
      labelSize: size,
    });
    const pixel = projection === "circular" ? scale : { x: 0.95, y: 2.27 };
    const width = (projection === "circular" ? 200 : 360) * pixel.x;
    const height = (projection === "circular" ? 200 : 90) * pixel.y;
    for (const tick of layer.ticks.filter((candidate) => candidate.labelled)) {
      assert.ok(tick.label, "a written hour carries its offset");
      const centre = {
        x: tick.x * pixel.x + tick.label.x,
        y: tick.y * pixel.y + tick.label.y,
      };
      assert.ok(centre.x - size.width / 2 >= 1.9, `inside on the left`);
      assert.ok(
        centre.x + size.width / 2 <= width - 1.9,
        `inside on the right`,
      );
      assert.ok(centre.y - size.height / 2 >= 1.9, `inside at the top`);
      assert.ok(
        centre.y + size.height / 2 <= height - 1.9,
        `inside at the bottom`,
      );
      // Off the stroke: the label's box is clear of every vertex of the path.
      for (const stroke of layer.strokes)
        for (const point of stroke.points) {
          const x = point.x * pixel.x;
          const y = point.y * pixel.y;
          const inside =
            Math.abs(x - centre.x) < size.width / 2 - 1 &&
            Math.abs(y - centre.y) < size.height / 2 - 1;
          assert.equal(inside, false, `${tick.time} sits on the stroke`);
        }
    }
    assert.ok(
      layer.ticks.some((tick) => !tick.labelled && tick.label === null),
    );
  }
});

test("a masked stretch that runs to the end of the night says « dès »", () => {
  const summary = horizonPathSummary(path, { minAltitude: 20 });
  const last = summary.masked.at(-1);
  assert.ok(last, "the night ends behind the mask in the notch");
  const runsToTheEnd = summary.masked.filter(
    (stretch) => stretch.end === path.end,
  );
  const closed = summary.masked.filter((stretch) => stretch.end !== path.end);
  // The test night ends in the open, so every stretch is closed ...
  assert.equal(runsToTheEnd.length + closed.length, summary.masked.length);
  // ... and a night that ends behind the mask has one stretch that runs to
  // the end of it.
  const behind = targetNightPath({
    series: night.map((point) => ({ ...point, altitude: 8, azimuth: 270 })),
    mask,
    minAltitude: 0,
    tickOffsetMinutes: 60,
  });
  const behindSummary = horizonPathSummary(behind, { minAltitude: 0 });
  assert.ok(behindSummary.masked.length >= 1);
  assert.equal(behindSummary.masked.at(-1).end, behind.end);
  // The words, in the ten languages: a time and nothing else to fill.
  for (const locale of [
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
  ]) {
    assert.match(message(locale, "horizonPathMaskedFrom"), /\{time\}/u, locale);
    assert.doesNotMatch(
      message(locale, "horizonPathMaskedFrom"),
      /\{start\}|\{end\}/u,
      locale,
    );
  }
  assert.equal(
    message("fr", "horizonPathMaskedFrom"),
    "Derrière le masque dès {time}",
  );
});

test("the new words of the horizon map, in French and in the ten languages", () => {
  assert.equal(
    message("fr", "horizonMapHelpLine"),
    "L’horizon tel que vous le voyez auprès de la monture.",
  );
  assert.equal(
    message("fr", "horizonPathLegendPathNote"),
    "un point par heure",
  );
  assert.equal(
    message("fr", "horizonPathPlotCircular").replace("{target}", "M31"),
    "Carte circulaire du trajet de M31 : fenêtre en trait épais, trajet en trait fin gradué, derrière le masque en tirets, hauteur minimale en pointillés, masque hachuré",
  );
  assert.equal(
    message("fr", "horizonPathPlot").replace("{target}", "M31"),
    "Carte linéaire du trajet de M31 : fenêtre en trait épais, trajet en trait fin gradué, derrière le masque en tirets, hauteur minimale en pointillés, masque hachuré",
  );
  for (const locale of [
    "en",
    "ja",
    "de",
    "es",
    "it",
    "pt-BR",
    "ru",
    "zh-Hans",
    "zh-Hant",
  ])
    for (const key of [
      "horizonMapHelpLine",
      "horizonPathLegendPathNote",
      "horizonPathPlot",
      "horizonPathPlotCircular",
    ]) {
      assert.notEqual(
        message(locale, key),
        message("fr", key),
        `${locale} ${key}`,
      );
      assert.ok(message(locale, key).length > 3, `${locale} ${key}`);
    }
});

test("the linear plot breaks the path where the target crosses north", () => {
  const lines = horizonPathPolylines(
    [
      { azimuth: 350, altitude: 40 },
      { azimuth: 356, altitude: 42 },
      { azimuth: 4, altitude: 44 },
      { azimuth: 10, altitude: 46 },
    ],
    { projection: "linear" },
  );
  assert.equal(lines.length, 2);
  assert.equal(lines[0].at(-1).x, 360);
  assert.equal(lines[1][0].x, 0);
  assert.equal(lines[0].at(-1).y, lines[1][0].y);
  assert.equal(
    horizonPathPolylines([{ azimuth: 350, altitude: 40 }], {
      projection: "circular",
    }).length,
    1,
  );
});

test("the card says when the target culminates, hides behind the mask and sinks under the minimum", () => {
  const summary = horizonPathSummary(path, { minAltitude: 20 });
  assert.equal(summary.state, "normal");
  assert.equal(
    summary.culmination.altitude,
    Math.round(path.culmination.altitude),
  );
  assert.equal(
    summary.masked.length,
    path.segments.filter((segment) => segment.state === "masked").length,
  );
  assert.ok(summary.belowMinimumFrom);
  assert.ok(
    Date.parse(summary.belowMinimumFrom) > Date.parse(summary.culmination.time),
  );
  const down = targetNightPath({
    series: night.map((point) => ({ ...point, altitude: -12 })),
    mask,
  });
  assert.deepEqual(horizonPathSummary(down), {
    state: "never-up",
    culmination: null,
    masked: [],
    belowMinimumFrom: null,
  });
  assert.deepEqual(horizonPathLayer(down).strokes, []);
});

test("the French texts are the specified wording, to the character", () => {
  const fr = (key) => message("fr", key);
  assert.equal(fr("horizonMapMode"), "Mode de la carte");
  assert.equal(fr("horizonMapModePositions"), "Positions");
  assert.equal(fr("horizonMapModePath"), "Trajet");
  assert.equal(fr("horizonPathTarget"), "Cible du trajet");
  assert.equal(fr("horizonPathLegendWindow"), "Meilleure fenêtre");
  assert.equal(fr("horizonPathLegendPath"), "Trajet");
  assert.equal(fr("horizonPathLegendMasked"), "Derrière le masque");
  assert.equal(fr("horizonPathLegendMinimum"), "Hauteur minimale");
  assert.equal(fr("horizonPathLegendMask"), "Masque d’horizon");
  assert.equal(fr("horizonPathCard"), "Trajet de {target}");
  assert.equal(fr("horizonPathCulminates"), "Culmine à {time}, {altitude}");
  assert.equal(
    fr("horizonPathMaskedBetween"),
    "Derrière le masque de {start} à {end}",
  );
  assert.equal(
    fr("horizonPathBelowMinimumFrom"),
    "Sous la hauteur minimale dès {time}",
  );
  assert.equal(
    fr("horizonPathPlot").replace("{target}", "M31"),
    "Carte linéaire du trajet de M31 : fenêtre en trait épais, trajet en trait fin gradué, derrière le masque en tirets, hauteur minimale en pointillés, masque hachuré",
  );
  for (const locale of ["en", "ja"])
    assert.notEqual(
      message(locale, "horizonPathTarget"),
      fr("horizonPathTarget"),
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

test("the page draws no path in positions mode, and disables the switch without a target", () => {
  const section = source.slice(
    source.indexOf("function PlannerHorizonProjection("),
    source.indexOf("function PrintableHorizonProjection("),
  );
  assert.match(
    section,
    /const mode =\s*values\.mode === "path" && !pathModeReason \? "path" : "positions";/,
  );
  assert.match(section, /const pathCard =\s*mode === "path"/);
  assert.match(section, /path=\{path\}/);
  assert.match(
    section,
    /const pathModeReason = planCards\.length\s*\? null\s*: message\(locale, "horizonMapModeNoTarget"\);/,
  );
  // The printable map and the night in progress keep positions only.
  const printable = source.slice(
    source.indexOf("function PrintableHorizonProjection("),
    source.indexOf("function PlannerCalendarMonth("),
  );
  assert.ok(!printable.includes("path="));
  assert.match(source, /planCards=\{horizonPathCards\}/);
  assert.ok(dist.includes("HorizonPathMarkers"), "dist is rebuilt");
});
