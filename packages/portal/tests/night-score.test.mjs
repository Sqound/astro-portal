import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  moonWeightMaximum,
  cloudCoverScore,
  cloudScoreCurve,
  forecastHourScore,
  forecastLossShares,
  forecastScoreCurves,
  forecastScoreFactors,
  hourlyAstronomyForecast,
  moonWeight,
  summarizeAstronomyForecast,
} from "portal/astronomy-forecast.js";

// A score per hour
// of the dark night, 100 × the product of six weights (clouds, rain, Moon,
// haze, wind and gusts, humidity), no cap; the night's score the mean of its
// hours; the points lost split by −ln(weight); level bounds unchanged.

const spec = (module) =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../astro-contracts/fixtures/spec/${module}.json`,
        import.meta.url,
      ),
    ),
  );
const nightCase = (id) =>
  spec("forecast-score").cases.find((entry) => entry.id === id).args[0];

// The shared fixture of a module (`astro-contracts/fixtures/<module>.json`,
// generated from the shared specification, never edited by hand) is the one
// source of the notes:
// a note is never typed in this file; a test reads it from the case, or
// checks a level, an order, a bound.
const generated = (module, id) =>
  JSON.parse(
    readFileSync(
      new URL(`../../astro-contracts/fixtures/${module}.json`, import.meta.url),
    ),
  ).cases.find((entry) => entry.id === id);
// The top of the 0–100 scale: a night with nothing against it.
const perfectScore = 100;

const calm = {
  cloud: 0,
  cloudLow: 0,
  cloudMid: 0,
  cloudHigh: 0,
  wind: 5,
  gust: 7,
  humidity: 60,
  visibility: 30000,
  precipitation: 0,
};
const hour = (fields) => forecastHourScore({ ...calm, ...fields });

test("six factors, in a fixed order, and their curves", () => {
  assert.deepEqual(forecastScoreFactors, [
    "cloud",
    "rain",
    "moon",
    "visibility",
    "wind",
    "humidity",
  ]);
  assert.equal(forecastScoreCurves.cloud, cloudScoreCurve);
  assert.deepEqual(forecastScoreCurves.rain, [
    [0, 100],
    [10, 92],
    [20, 75],
    [30, 52],
    [40, 32],
    [60, 10],
    [80, 0],
  ]);
  assert.deepEqual(forecastScoreCurves.visibility, [
    [0, 5],
    [1, 20],
    [2, 45],
    [5, 80],
    [10, 100],
  ]);
  assert.deepEqual(forecastScoreCurves.wind, [
    [0, 100],
    [25, 100],
    [35, 92],
    [45, 75],
    [60, 40],
    [75, 10],
    [90, 0],
  ]);
  assert.deepEqual(forecastScoreCurves.humidity, [
    [0, 100],
    [90, 100],
    [95, 96],
    [100, 92],
  ]);
});

test("the cloud curve passes through its reference points and never rises", () => {
  for (const [cover, score] of [
    [0, 100],
    [10, 82],
    [30, 35],
    [34, 29],
    [60, 0],
    [100, 0],
  ])
    assert.equal(Math.round(cloudCoverScore(cover)), score, `${cover} %`);
  assert.equal(cloudCoverScore(null), null);
  let previous = Infinity;
  for (let cover = 0; cover <= 100; cover += 0.5) {
    const score = cloudCoverScore(cover);
    assert.ok(score <= previous, `${cover} %`);
    previous = score;
  }
  assert.deepEqual(cloudScoreCurve.at(-1), [60, 0]);
});

test("each curve at its break points and between them", () => {
  for (const [fields, factor, weight] of [
    [{ precipitation: 10 }, "rain", 92],
    [{ precipitation: 25 }, "rain", 64],
    [{ precipitation: 40 }, "rain", 32],
    [{ precipitation: 80 }, "rain", 0],
    [{ visibility: 10000 }, "visibility", 100],
    [{ visibility: 30000 }, "visibility", 100],
    [{ visibility: 5000 }, "visibility", 80],
    [{ visibility: 1500 }, "visibility", 33],
    [{ visibility: 0 }, "visibility", 5],
    [{ wind: 25, gust: null }, "wind", 100],
    [{ wind: 35, gust: null }, "wind", 92],
    [{ wind: 52, gust: null }, "wind", 59],
    [{ wind: 90, gust: null }, "wind", 0],
    [{ humidity: 90 }, "humidity", 100],
    [{ humidity: 95 }, "humidity", 96],
    [{ humidity: 100 }, "humidity", 92],
  ])
    assert.equal(hour(fields).factors[factor], weight, JSON.stringify(fields));
  // A gust counts at 70 % of its speed: 5 km/h and gusts of 50 weigh as a
  // wind of 35, and more than gusts of 10 do.
  assert.equal(
    hour({ wind: 5, gust: 50 }).factors.wind,
    hour({ wind: 35, gust: null }).factors.wind,
  );
  assert.ok(
    hour({ wind: 5, gust: 50 }).factors.wind <
      hour({ wind: 5, gust: 10 }).factors.wind,
  );
  // High clouds count at half, low and middle whole, never above the total.
  assert.equal(hour({ cloud: 40, cloudHigh: 40 }).cover, 20);
  assert.equal(hour({ cloud: 20, cloudLow: 10, cloudMid: 10 }).cover, 20);
  assert.equal(hour({ cloud: 50, cloudLow: 40, cloudMid: 40 }).cover, 50);
  assert.equal(hour({ cloud: null, cloudLow: null }), null);
});

test("the hour is the product of the weights, with no cap", () => {
  const clear = hour({}).score;
  const rain = hour({ precipitation: 40 });
  // Rain only lowers the hour, and no longer by an old cap.
  assert.ok(rain.score < clear);
  assert.equal("cap" in rain, false);
  assert.ok(rain.score < hour({ precipitation: 10 }).score);
  assert.ok(
    hour({ visibility: 4000 }).score < hour({ visibility: 24000 }).score,
  );
  // Two nuisances multiply: worse than either alone, and the hour is the
  // product of its rounded factors, one point apart at most.
  const both = hour({ cloud: 30, cloudLow: 30, precipitation: 40 });
  assert.ok(both.score < rain.score);
  const product = Object.values(both.factors)
    .filter((weight) => weight !== null)
    .reduce((total, weight) => (total * weight) / 100, perfectScore);
  assert.ok(Math.abs(both.score - product) <= 1);
});

test("the Moon weighs at most 20 %: heavier as it fills and rises, none set", () => {
  let previous = 1;
  for (let phase = 0; phase <= 100; phase += 10) {
    const weight = moonWeight(45, phase);
    assert.ok(weight <= previous, `${phase} %`);
    previous = weight;
  }
  previous = 1;
  for (let altitude = 0; altitude <= 60; altitude += 5) {
    const weight = moonWeight(altitude, 80);
    assert.ok(weight <= previous, `${altitude}°`);
    previous = weight;
  }
  // The rule: a full Moon at 30° or higher costs moonWeightMaximum, no more.
  assert.ok(Math.abs(moonWeight(30, 100) - (1 - moonWeightMaximum)) < 1e-12);
  assert.equal(moonWeight(80, 100), moonWeight(30, 100));
  assert.equal(moonWeight(0, 100), 1);
  assert.equal(moonWeight(-12, 100), 1);
  assert.equal(moonWeight(40, null), null);
  // The hour carries the same weight; the numbers are pinned by the
  // `moon-*` cases of `forecast-hour-score.json`.
  const full = hour({ moonAltitude: 45, moonIllumination: 100 });
  assert.ok(full.score < perfectScore);
  assert.equal(full.factors.moon, Math.round(moonWeight(45, 100) * 100));
});

test("a missing metric is neutral, never a zero", () => {
  const scored = hour({
    wind: null,
    gust: null,
    humidity: null,
    visibility: null,
    precipitation: null,
  });
  assert.equal(scored.score, perfectScore);
  for (const factor of ["rain", "moon", "visibility", "wind", "humidity"])
    assert.equal(scored.factors[factor], null, factor);
  assert.deepEqual(Object.values(scored.losses), [0, 0, 0, 0, 0, 0]);
});

test("the points lost split by −ln(weight): they add up to the loss, a weight of 1 takes nothing", () => {
  const scored = forecastHourScore({
    cloud: 28,
    cloudLow: 28,
    cloudMid: 0,
    cloudHigh: 0,
    precipitation: 25,
    moonAltitude: 32,
    moonIllumination: 78,
    visibility: 9000,
    wind: 16,
    gust: 34,
    humidity: 95,
  });
  // A loaded night: every loss at once, a poor hour, below a variable night.
  assert.equal(scored.category, "poor");
  assert.ok(
    scored.score <
      generated("forecast-score", "board-m17b-invented-night").result.score,
  );
  assert.equal(scored.losses.wind, 0);
  const total = Object.values(scored.losses).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - (perfectScore - scored.score)) <= 1, `${total}`);
  assert.ok(scored.losses.cloud > scored.losses.rain);
  assert.ok(scored.losses.rain > scored.losses.moon);
  // A nil weight takes the whole loss; two nil weights share it.
  const nil = hour({ cloud: 60, cloudLow: 60, precipitation: 20 });
  assert.deepEqual([nil.score, nil.losses.cloud, nil.losses.rain], [0, 100, 0]);
  const both = hour({ cloud: 70, cloudLow: 70, precipitation: 90 });
  assert.deepEqual([both.losses.cloud, both.losses.rain], [50, 50]);
});

test("the night's shares: the mean of the hours' points, adding up to 100 %", () => {
  const shared = generated("forecast-loss-shares", "board-m17b-invented-night");
  const board = shared.args[0];
  const shares = forecastLossShares(board);
  // The shared fixture holds this result.
  assert.deepEqual(shares, shared.result);
  assert.equal(shares.hours, board.length);
  assert.equal(shares.score + shares.lost, perfectScore);
  const total = Object.values(shares.factors).reduce(
    (sum, part) => sum + part.share,
    0,
  );
  assert.ok(Math.abs(total - 100) < 0.5, `${total}`);
  // The order of the factors: clouds, then rain, then the Moon.
  assert.ok(shares.factors.cloud.share > shares.factors.rain.share);
  assert.ok(shares.factors.rain.share > shares.factors.moon.share);
  assert.ok(shares.factors.moon.share > 0);
  assert.equal(forecastLossShares([calm]).factors.cloud.share, 0);
  assert.equal(forecastLossShares([]), null);
  assert.equal(forecastLossShares(null), null);
});

test("the three reference nights and an invented night, by level, with the Moon at 0.20", () => {
  for (const [id, category] of [
    ["night-a-humid-spring-no-cloud", "excellent"],
    ["night-a-humidity-100", "excellent"],
    ["night-b-clear-full-moon-high", "excellent"],
    ["night-b-without-the-moon-is-100", "excellent"],
    ["night-c-clouds-30-rain-40", "poor"],
    ["board-m17b-invented-night", "variable"],
  ]) {
    const night = summarizeAstronomyForecast(nightCase(id));
    // The level the night is named for; its note is the shared fixture's.
    assert.equal(night.category, category, id);
    assert.equal(night.score, generated("forecast-score", id).result.score, id);
  }
});

test("the rows carry the Moon, interpolated between its samples, and score with it", () => {
  const args = nightCase("board-m17b-invented-night");
  const rows = hourlyAstronomyForecast(args);
  assert.deepEqual(
    rows.map((row) => row.moonAltitude),
    [-30, -22, -14, -6, -1, 8, 20, 32, 42, 50],
  );
  assert.ok(rows.every((row) => row.moonIllumination === 78));
  // The night opens at its best and its worst hour comes late, as the Moon
  // climbs: the first hour is the highest, every note is on the scale.
  const scores = rows.map((row) => row.score);
  assert.equal(scores[0], Math.max(...scores));
  assert.ok(scores.indexOf(Math.min(...scores)) > scores.length / 2);
  assert.ok(scores.every((score) => score >= 0 && score <= perfectScore));
  for (const row of rows) assert.equal(row.score, forecastHourScore(row).score);
  // Halfway between two samples, the altitude is their mean.
  const half = hourlyAstronomyForecast({
    ...args,
    moon: {
      illumination: 100,
      series: [
        { time: "2026-03-20T18:30:00.000Z", altitude: 10 },
        { time: "2026-03-20T19:30:00.000Z", altitude: 20 },
      ],
    },
  });
  assert.equal(half[0].moonAltitude, 15);
  assert.equal("moonAltitude" in half[1], false);
  assert.equal(
    "moonAltitude" in hourlyAstronomyForecast({ ...args, moon: null })[0],
    false,
  );
});

test("three real nights at « Lieu A », after the recalibration", () => {
  const scores = [];
  for (const [id, category] of [
    ["lieu-a-night-seen-at-84-fairly-cloudy", "variable"],
    ["lieu-a-clearest-night-of-the-month", "variable"],
    ["lieu-a-night-of-high-cirrus", "poor"],
  ]) {
    const night = summarizeAstronomyForecast(nightCase(id));
    assert.equal(night.category, category, id);
    assert.equal(night.score, generated("forecast-score", id).result.score, id);
    scores.push(night.score);
  }
  // The cirrus night is the worst of the three.
  assert.ok(scores[2] < scores[0] && scores[2] < scores[1]);
});

test("the night is the mean of its hours, each hour from the unrounded forecast", () => {
  const args = nightCase("lieu-a-night-of-high-cirrus");
  const rows = hourlyAstronomyForecast(args);
  assert.ok(rows.every((row) => Number.isInteger(row.score)));
  assert.ok(
    rows.every(
      (row) => "cloudLow" in row && "cloudMid" in row && "cloudHigh" in row,
    ),
  );
  const mean = rows.reduce((sum, row) => sum + row.score, 0) / rows.length;
  assert.ok(
    Math.abs(summarizeAstronomyForecast(args).score - mean) <= 0.5 + 1e-9,
  );
});

test("a forecast without the cloud layers keeps its rows' shape and scores on the total", () => {
  const rows = hourlyAstronomyForecast({
    hourly: {
      time: [1789502400],
      cloud_cover: [10],
      wind_speed_10m: [5],
      relative_humidity_2m: [60],
      visibility: [30000],
      precipitation_probability: [0],
    },
    night: { start: "2026-09-15T19:00:00Z", end: "2026-09-15T21:00:00Z" },
  });
  assert.equal(rows.length, 1);
  assert.equal("cloudLow" in rows[0], false);
  // 10 % of clouds on an otherwise perfect hour: an excellent hour, a little
  // below the perfect one.
  assert.equal(forecastHourScore(rows[0]).category, "excellent");
  assert.ok(rows[0].score < perfectScore);
});

test("the sweep of dates and coordinates: the night is the mean of its hours, each the product", () => {
  const sweep = spec("forecast-score").cases.filter((entry) =>
    entry.id.startsWith("sweep-"),
  );
  assert.equal(sweep.length, 24);
  for (const entry of sweep) {
    const args = entry.args[0];
    const rows = hourlyAstronomyForecast(args);
    assert.ok(rows.length > 0, entry.id);
    assert.ok(
      rows.some((row) => Number.isFinite(row.moonAltitude)),
      entry.id,
    );
    for (const row of rows) {
      const scored = forecastHourScore(row);
      const product = Object.values(scored.factors)
        .filter((weight) => weight !== null)
        .reduce((total, weight) => total * (weight / 100), 100);
      // The weights are rounded to whole percents: a few points apart at most.
      assert.ok(Math.abs(product - scored.score) <= 4, entry.id);
    }
    const mean = rows.reduce((sum, row) => sum + row.score, 0) / rows.length;
    assert.ok(
      // Each row is rounded, then the night: one point apart at most.
      Math.abs(summarizeAstronomyForecast(args).score - mean) <= 1,
      entry.id,
    );
  }
});
