import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The tiles of "La nuit" on the web
// draw their quantity over the night as a watermark curve, in the colour of
// the hourly strip, the Moon in blue, one red tint in red mode; "Précipitations"
// and "Visibilité" join them. Synthetic place and forecast; nothing leaves
// the test.
await registerJsx();
const { NightZone } = await import("planner/components/NightDetailParts.js");
const { tonightOverview } = await import("planner/tonight-overview.js");
const {
  tonightWords,
  tileCurveIndexAt,
  tileCurvePath,
  tileCurvePoint,
  tileCurveValues,
} = await import("planner/tonight-words.js");
const { planNightSpanSky } = await import("planner/planner.js");

const css = readFileSync(
  new URL("../../portal-app/styles/portal.css", import.meta.url),
  "utf8",
);

const place = {
  id: "lac-noir",
  name: "Camping du Lac Noir",
  latitude: "45",
  longitude: "-30",
  timeZone: "Atlantic/Azores",
};
const date = "2026-10-14";
const night = planNightSpanSky({ date }, place);
const hour = 3600000;
const start = Math.ceil(Date.parse(night.darkStart) / hour) * hour;
const hourly = Array.from({ length: 6 }, (_, index) => ({
  time: start + index * hour,
  cloud: 10 * index,
  wind: 6 + 2 * index,
  gust: 20,
  temperature: 8,
  dewPoint: 5.5,
  humidity: 70 + 3 * index,
  precipitation: [0, 40, 10, 20, 5, 0][index],
  visibilityKm: [12, 8, 9.5, 10, 11, 12][index],
}));
const moonSeries = Array.from({ length: 11 }, (_, index) => ({
  time: new Date(Date.parse(night.darkStart) + (index - 2) * (hour / 2)),
  altitude: 10 * (index - 2),
})).map((point) => ({ ...point, time: point.time.toISOString() }));
const overview = (extra = {}) =>
  tonightOverview({
    place,
    date,
    night,
    hourly,
    moonSeries,
    moonIllumination: 35,
    ...extra,
  });
const words = (value, locale = "fr") =>
  tonightWords(value, { locale, timeZone: place.timeZone });
const render = (value, locale = "fr") =>
  renderToStaticMarkup(
    createElement(NightZone, {
      words: words(value, locale),
      overview: value,
      timeline: false,
    }),
  );

// The colour a rule gives a selector in the style sheet: the first
// declaration of `property` in the rule whose selector is `selector`.
const ruleColour = (selector, property) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `${escaped}\\s*{[^}]*?${property}:\\s*([^;]+);`,
  ).exec(css);
  assert.ok(match, `${selector} sets ${property}`);
  return match[1].trim();
};

test("six tiles in order, each with its curve behind the text", () => {
  const markup = render(overview());
  const tiles = [...markup.matchAll(/data-tile="([a-z]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(tiles, [
    "clouds",
    "precipitation",
    "wind",
    "dew",
    "visibility",
    "moon",
  ]);
  for (const key of tiles)
    assert.match(
      markup,
      new RegExp(
        `data-tile="${key}"[^>]*><svg class="tonight-tile-curve"[^>]*data-testid="tonight-tile-curve-${key}"`,
      ),
      `a curve opens the ${key} tile`,
    );
  // The curve is hidden from assistive technology and takes no touch.
  assert.match(markup, /class="tonight-tile-curve"[^>]*aria-hidden="true"/);
  assert.match(
    css,
    /\.tonight-tile-curve\s*{[^}]*pointer-events:\s*none;/,
    "never touchable",
  );
});

test("the curves run through the strip's own hours inside their range", () => {
  const fr = words(overview());
  const curve = (key) => fr.tiles.find((tile) => tile.key === key).curve;
  // One point per hour of the strip, a percentage on 0..100.
  assert.deepEqual(
    curve("clouds"),
    [0, 0.1, 0.2, 0.3, 0.4, 0.5],
    "clouds 0 → 50 %",
  );
  assert.equal(curve("precipitation").length, 6);
  assert.equal(curve("precipitation")[1], 0.4);
  assert.equal(curve("dew").length, 6, "the dew tile draws the humidity");
  assert.ok(Math.abs(curve("dew")[0] - 0.7) < 1e-9);
  // Wind from 0 to at least 30 km/h: 6 km/h stays low, not stretched.
  assert.ok(Math.abs(curve("wind")[0] - 0.2) < 1e-9);
  // Visibility from 0 to at least 10 km.
  assert.equal(curve("visibility")[0], 1);
  // The Moon's altitude between the night's ends, horizon inside the box.
  assert.ok(curve("moon").length >= 2);
  assert.ok(curve("moon").every((value) => value >= 0 && value <= 1));
  assert.ok(curve("moon").at(-1) > curve("moon")[0]);
});

test("« Précipitations » and « Visibilité » have a value, a sub-line and a curve; a dry night says so", () => {
  const fr = words(overview());
  const tile = (key) => fr.tiles.find((entry) => entry.key === key);
  assert.equal(tile("precipitation").label, "Précipitations");
  assert.equal(tile("precipitation").value, "13\u00a0%");
  assert.match(
    tile("precipitation").detail,
    /^Au plus 40\u00a0% vers \d\d:\d\d$/,
  );
  assert.equal(tile("visibility").label, "Visibilité");
  assert.equal(tile("visibility").value, "10,4\u00a0km");
  assert.match(
    tile("visibility").detail,
    /^Au plus bas 8,0\u00a0km vers \d\d:\d\d$/,
  );
  const dry = words(
    overview({ hourly: hourly.map((row) => ({ ...row, precipitation: 0 })) }),
  );
  assert.equal(
    dry.tiles.find((entry) => entry.key === "precipitation").detail,
    "Aucune pluie annoncée",
  );
  const en = words(overview(), "en");
  assert.equal(
    en.tiles.find((entry) => entry.key === "visibility").value,
    "10.4 km",
  );
});

test("a figure the forecast lacks draws no curve; one hour is not a curve", () => {
  const bare = overview({
    hourly: hourly.map(({ precipitation, visibilityKm, ...row }) => row),
  });
  const markup = render(bare);
  assert.ok(!markup.includes("tonight-tile-curve-precipitation"));
  assert.ok(!markup.includes("tonight-tile-curve-visibility"));
  assert.ok(markup.includes("tonight-tile-curve-clouds"));
  assert.equal(
    tileCurveValues([{ time: "x", value: 1 }], { lo: 0, hi: 1 }),
    null,
  );
  assert.equal(tileCurvePath([0.5]), null);
  const path = tileCurvePath([0, 1, 0.5], 160, 80);
  assert.match(path.line, /^M0 \d+(\.\d)? C/);
  assert.match(path.area, / L160 80 L0 80 Z$/);
});

test("the curves take the hourly strip's colours, the Moon's blue, one red tint in red mode", () => {
  const strip = {
    clouds: ruleColour(".planner-hourly-weather-metric.is-cloud", "color"),
    precipitation: ruleColour(
      ".planner-hourly-weather-metric.is-precipitation",
      "color",
    ),
    wind: ruleColour(".planner-hourly-weather-metric.is-wind", "color"),
    dew: ruleColour(".planner-hourly-weather-metric.is-humidity", "color"),
    visibility: ruleColour(
      ".planner-hourly-weather-metric.is-visibility",
      "color",
    ),
  };
  for (const [key, colour] of Object.entries(strip))
    assert.equal(
      ruleColour(
        `.tonight-tiles > .tonight-tile[data-tile="${key}"]`,
        "--tile-curve",
      ),
      colour,
      `${key}: the strip's colour`,
    );
  const moon = ruleColour(
    '.tonight-tiles > .tonight-tile[data-tile="moon"]',
    "--tile-curve",
  );
  const [red, , blue] = [1, 3, 5].map((at) =>
    parseInt(moon.slice(at, at + 2), 16),
  );
  assert.ok(blue > red + 80, `the Moon's ${moon} is blue`);
  assert.equal(
    ruleColour(
      'html[data-night-mode="on"] .tonight-tiles > .tonight-tile',
      "--tile-curve",
    ),
    "var(--ink)",
    "red mode: every curve in the one tint",
  );
});

test("the text keeps its contrast over the strongest part of every curve", () => {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]) =>
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const hex = (value) =>
    [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16));
  const contrast = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  };
  const panel = hex(ruleColour(":root", "--panel"));
  const ink = hex(ruleColour(":root", "--ink"));
  const muted = hex(
    ruleColour(".tonight-tiles > .tonight-tile .tonight-tile-detail", "color"),
  );
  const alpha = Number(
    /\.tonight-tile-curve-line\s*{[^}]*stroke-opacity:\s*([\d.]+);/.exec(
      css,
    )[1],
  );
  for (const colour of [
    "#d9b16d",
    "#b8a8dc",
    "#b8cfdb",
    "#9bc9c4",
    "#b7d39f",
    "#78d3f1",
    "#eef0ee",
  ]) {
    const under = hex(colour).map(
      (value, i) => alpha * value + (1 - alpha) * panel[i],
    );
    assert.ok(contrast(ink, under) >= 7, `value over ${colour}`);
    assert.ok(contrast(muted, under) >= 4.5, `sub-line over ${colour}`);
  }
});

// A small dot on each tile's curve at the present instant of
// the night, only inside the hours the curve covers.
const withNow = (value, nowMs) =>
  renderToStaticMarkup(
    createElement(NightZone, {
      words: words(value),
      overview: value,
      timeline: false,
      now: nowMs,
    }),
  );
const dots = (markup) =>
  [...markup.matchAll(/data-testid="tonight-tile-now-([a-z]+)"/g)].map(
    (match) => match[1],
  );
const position = (markup, tile) => {
  const match = new RegExp(
    `data-testid="tonight-tile-now-${tile}" style="left:([\\d.]+)%;top:([\\d.]+)%"`,
  ).exec(markup);
  assert.ok(match, `the ${tile} dot has a position`);
  return { left: Number(match[1]), top: Number(match[2]) };
};

test("a dot sits on each curve at the interpolated value of the present hour", () => {
  const value = overview();
  // Half way between the third and the fourth hour of the strip.
  const markup = withNow(value, start + 2.5 * hour);
  assert.deepEqual(dots(markup).sort(), [
    "clouds",
    "dew",
    "moon",
    "precipitation",
    "visibility",
    "wind",
  ]);
  // Clouds 0, 10 ... 50 %: five steps, so half way between hours 3 and 4 is
  // the middle of the box, and 25 % a quarter of the way up the curve's
  // drawn height (6 % margins of the 80-high box).
  const clouds = position(markup, "clouds");
  assert.equal(clouds.left, 50);
  const topAt = (cover) => ((80 * 0.06 + 80 * 0.88 * (1 - cover)) / 80) * 100;
  assert.ok(Math.abs(clouds.top - topAt(0.25)) < 0.01, `${clouds.top}`);
  // The dot is on the cubic of the curve, not on the chord: at a quarter of
  // a step it is closer to the hour's own value than the chord's point.
  const values = words(value).tiles.find((tile) => tile.key === "clouds").curve;
  const times = words(value).tiles.find(
    (tile) => tile.key === "clouds",
  ).curveTimes;
  assert.equal(times.length, values.length);
  const [quarterX, quarterY] = tileCurvePoint(values, 1.25);
  const [fromX, fromY] = tileCurvePoint(values, 1);
  const [toX, toY] = tileCurvePoint(values, 2);
  assert.ok(quarterX > fromX && quarterX < toX);
  const chord = fromY + (toY - fromY) * 0.25;
  assert.ok(Math.abs(quarterY - fromY) < Math.abs(chord - fromY));
  // On the hours the point is the curve's own point.
  for (let index = 0; index < values.length; index += 1) {
    const [x, y] = tileCurvePoint(values, index);
    assert.ok(Math.abs(x - (160 * index) / (values.length - 1)) < 1e-6);
    assert.ok(Math.abs(y - (4.8 + 70.4 * (1 - values[index]))) < 1e-6);
  }
});

test("no dot before, at the edges of or after the hours the curve covers", () => {
  const value = overview();
  const strip = ["clouds", "dew", "precipitation", "visibility", "wind"];
  for (const [label, nowMs] of [
    ["before the night", start - hour],
    ["at the first hour", start],
    ["at the last hour", start + 5 * hour],
    ["after the night", start + 8 * hour],
  ]) {
    const markup = withNow(value, nowMs);
    for (const tile of strip)
      assert.ok(!dots(markup).includes(tile), `${tile}: none ${label}`);
    // The curves are drawn all the same.
    assert.match(markup, /data-testid="tonight-tile-curve-clouds"/);
  }
  assert.equal(tileCurveIndexAt([1, 2, 3], 1), null);
  assert.equal(tileCurveIndexAt([1, 2, 3], 3), null);
  assert.equal(tileCurveIndexAt([1, 2, 3], 2.5), 1.5);
  assert.equal(tileCurveIndexAt([1], 1), null);
  assert.equal(tileCurveIndexAt(null, 1), null);
  assert.equal(tileCurveIndexAt([1, 2], Number.NaN), null);
});

test("a tile without a curve has no dot; the dot is a layer of the curve's box, 4 px disc in red mode", () => {
  // Without a forecast: only the Moon's tile (with its own series) remains.
  const markup = withNow(overview({ hourly: [] }), start + 2.5 * hour);
  assert.deepEqual(dots(markup), ["moon"]);
  // Decorative: hidden from assistive technology, no touch.
  assert.match(
    markup,
    /<div class="tonight-tile-now-layer" aria-hidden="true"><span class="tonight-tile-now"/,
  );
  assert.match(
    css,
    /\.tonight-tile-now-layer\s*{[^}]*height:\s*70%;[^}]*pointer-events:\s*none;/,
  );
  // A 12 px box holding a 3 px disc (25 % of the 6 px radius) of the
  // marker's red in a radial halo, 4 px in red mode (33.33 %), no outline.
  assert.match(
    css,
    /\.tonight-tile-now\s*{[^}]*--now-marker:\s*#ff3b30;[^}]*width:\s*12px;[^}]*height:\s*12px;/,
  );
  assert.match(css, /\.tonight-tile-now\s*{[^}]*--now-disc:\s*25%;/);
  assert.doesNotMatch(css, /\.tonight-tile-now\s*{[^}]*box-shadow/);
  assert.match(
    css,
    /html\[data-night-mode="on"\] \.tonight-tile-now\s*{[^}]*--now-disc:\s*33\.33%;/,
  );
  assert.doesNotMatch(
    css,
    /html\[data-night-mode="on"\] \.tonight-tile-now\s*{[^}]*border:/,
  );
});
