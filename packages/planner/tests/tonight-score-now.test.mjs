import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  forecastHourScore,
  forecastLossShares,
  forecastScoreFactors,
  hourlyAstronomyForecast,
  moonWeightMaximum,
} from "portal/astronomy-forecast.js";
import { messagesFr } from "portal/messages/fr.js";
import {
  tonightScoreSheetWords,
  tonightVerdictWords,
} from "planner/tonight-words.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The dot of the tiles on
// the score's curves whose abscissa is the hour — the card's filigree,
// "Heure par heure" and the weights through the night in the sheet — in the
// night, gone outside it, never on the weight-by-value charts. The
// night is 19:00 → 04:00; synthetic values.

await registerJsx();
globalThis.__createElement = createElement;
const DIALOG = `data:text/javascript,${encodeURIComponent(
  'const h = globalThis.__createElement; export const WebDialog = ({ title, children, footer }) => h("div", { className: "web-dialog-panel tonight-verdict-dialog" }, h("header", null, title), h("div", { className: "web-dialog-body" }, children), h("footer", null, footer));',
)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "portal/components/dialog/WebDialog.js")
      return { url: DIALOG, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { ScoreSheet } = await import("planner/components/NightDetailParts.js");

const at = (value) => new Date(value).toISOString().slice(11, 16);
const start = Date.UTC(2026, 9, 14, 19);
const hour = 3600000;
const night = {
  cloud: [8, 10, 12, 15, 18, 22, 20, 28, 35, 30],
  rain: [0, 0, 5, 5, 10, 10, 15, 25, 40, 35],
  moon: [-20, -14, -9, -5, -2, 8, 20, 32, 42, 50],
  visibility: [20, 20, 18, 16, 14, 12, 10, 9, 7, 6],
  wind: [8, 8, 9, 10, 10, 12, 14, 16, 18, 18],
  gust: [14, 15, 18, 20, 22, 26, 30, 34, 38, 40],
  humidity: [78, 80, 83, 86, 89, 91, 93, 95, 96, 97],
};
const forecast = {
  time: night.cloud.map((_, index) => (start + index * hour) / 1000),
  cloud_cover: night.cloud,
  cloud_cover_low: night.cloud.map(() => 0),
  cloud_cover_mid: night.cloud,
  cloud_cover_high: night.cloud.map(() => 0),
  precipitation_probability: night.rain,
  visibility: night.visibility.map((km) => km * 1000),
  wind_speed_10m: night.wind,
  wind_gusts_10m: night.gust,
  relative_humidity_2m: night.humidity,
};
const window = {
  start: new Date(start).toISOString(),
  end: new Date(start + 9 * hour).toISOString(),
};
// The night's Moon phase (an input), in %.
const moonPhase = 78;
const hours = hourlyAstronomyForecast({
  hourly: forecast,
  night: window,
  moon: {
    illumination: moonPhase,
    series: night.moon.map((altitude, index) => ({
      time: start + index * hour,
      altitude,
    })),
  },
});
const moonless = hourlyAstronomyForecast({ hourly: forecast, night: window });
const shares = forecastLossShares(hours);
const verdict = {
  level: "variable",
  score: shares.score,
  kind: "variable",
  facts: { darkness: null, moon: { kind: "set" }, clouds: null },
};
const sheet = tonightScoreSheetWords(verdict, { locale: "fr", at, hours });

const css = readFileSync(
  new URL("../../portal-app/styles/portal.css", import.meta.url),
  "utf8",
);
const inside = start + 2.5 * hour;
const before = start - 2 * hour;
const after = start + 11 * hour;
const sheetAt = (nowMs) =>
  renderToStaticMarkup(
    createElement(ScoreSheet, { sheet, locale: "fr", onClose() {}, nowMs }),
  );
const tag = (markup, testId) =>
  markup.match(
    new RegExp(
      `data-testid="${testId}" style="left:([\\d.]+)%;top:([\\d.]+)%"`,
    ),
  );

test("« Heure par heure »: the dot is on the curve inside the night, between the two hours' points", () => {
  const dot = tag(sheetAt(inside), "tonight-score-hourly-now");
  assert.ok(dot, "a dot at 21:30");
  // Half way between the third and fourth points of 10 over 28..342 of 350.
  const x = 28 + ((342 - 28) * 2.5) / 9;
  assert.ok(Math.abs(Number(dot[1]) - (x / 350) * 100) < 0.05, dot[1]);
});

test("« Heure par heure »: no dot before the night nor after it, nor without a clock", () => {
  for (const nowMs of [before, after, null])
    assert.equal(tag(sheetAt(nowMs), "tonight-score-hourly-now"), null);
});

test("the weights through the night: one dot per factor inside the night, on the straight segment", () => {
  const markup = sheetAt(inside);
  for (const factor of forecastScoreFactors) {
    const dot = tag(markup, `tonight-score-course-now-${factor}`);
    assert.ok(dot, factor);
    const points = sheet.how.factors.find((entry) => entry.key === factor)
      .course.points;
    const x = (index) => 48 + (232 * index) / (points.length - 1);
    const y = (weight) => 112 - (98 * (weight ?? 100)) / 100;
    const weight = (index) => points[index].weight;
    const midX = (x(2) + x(3)) / 2;
    const midY = (y(weight(2)) + y(weight(3))) / 2;
    assert.ok(Math.abs(Number(dot[1]) - (midX / 308) * 100) < 0.05, factor);
    assert.ok(Math.abs(Number(dot[2]) - (midY / 162) * 100) < 0.05, factor);
  }
  for (const nowMs of [before, after])
    assert.equal(
      [...sheetAt(nowMs).matchAll(/tonight-score-course-now-/g)].length,
      0,
    );
});

test("the weight-by-value charts, whose abscissa is a measured quantity, carry no dot", () => {
  const markup = sheetAt(inside);
  const charts = [
    ...markup.matchAll(
      /<svg[^>]*data-chart="value"[\s\S]*?<\/svg>(<div[^>]*now-layer)?/g,
    ),
  ];
  assert.ok(charts.length >= 5, "the value charts are drawn");
  for (const chart of charts) assert.doesNotMatch(chart[0], /now-layer/);
  assert.equal([...markup.matchAll(/tonight-score-now-frame/g)].length, 7);
});

test("the instants are the hours' own, in milliseconds", () => {
  assert.deepEqual(
    sheet.hourly.rows.map((row) => row.ms),
    hours.map((entry) => entry.time),
  );
  const words = tonightVerdictWords(verdict, { locale: "fr", at, hours });
  assert.deepEqual(
    words.times,
    words.scores.map((_, index) => hours[index].time),
  );
});

test("the style sheet gives the layers the chart's own box and keeps one marker", () => {
  assert.match(
    css,
    /\.tonight-verdict-now-layer\s*{[^}]*height:\s*64%;[^}]*pointer-events:\s*none;/,
  );
  assert.match(css, /\.tonight-score-now-layer\s*{[^}]*inset:\s*0;/);
  assert.equal([...css.matchAll(/^\.tonight-tile-now\s*{/gm)].length, 1);
});

const { VerdictSection } =
  await import("planner/components/NightDetailParts.js");
const cardAt = (now) =>
  renderToStaticMarkup(
    createElement(VerdictSection, {
      words: {
        verdict: tonightVerdictWords(verdict, { locale: "fr", at, hours }),
      },
      locale: "fr",
      onRetry() {},
      now,
    }),
  );

test("the card's filigree: the dot is on the curve inside the night, none outside", () => {
  const dot = tag(cardAt(inside), "tonight-verdict-now");
  assert.ok(dot, "a dot at 21:30");
  // Half way between the third and fourth of ten points over the width.
  assert.ok(Math.abs(Number(dot[1]) - (2.5 / 9) * 100) < 0.05, dot[1]);
  assert.match(
    cardAt(inside),
    /<div class="tonight-verdict-now-layer" aria-hidden="true"><span class="tonight-tile-now"/,
  );
  for (const now of [before, after])
    assert.equal(tag(cardAt(now), "tonight-verdict-now"), null);
});
