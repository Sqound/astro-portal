import assert from "node:assert/strict";
import test from "node:test";

import { summarizeAstronomyForecast } from "portal/astronomy-forecast.js";
import { nightVerdict } from "portal/night-verdict.js";

// The verdict of the night, beyond the fixtures
// (`packages/astro-contracts/fixtures/spec/night-verdict.json`) — the edges
// of the thresholds, the rounding, and the forecast's own summary in.

const hour = 3600000;
const night = {
  start: "2024-06-01T20:00:00.000Z",
  end: "2024-06-02T04:00:00.000Z",
};
const t0 = Date.parse(night.start);
const rows = (values) =>
  values.map((cloud, index) => ({ time: t0 + index * hour, cloud }));
const down = { illumination: 20, up: [] };

test("the four levels meet at 82, 64 and 42 without a category", () => {
  const level = (score) =>
    nightVerdict({ forecast: { score }, night, moon: down, clouds: [] }).level;
  assert.equal(level(100), "excellent");
  assert.equal(level(82), "excellent");
  assert.equal(level(81), "favourable");
  assert.equal(level(64), "favourable");
  assert.equal(level(63), "variable");
  assert.equal(level(42), "variable");
  assert.equal(level(41), "poor");
  assert.equal(level(0), "poor");
});

test("the score is rounded the way JavaScript rounds, then bounded", () => {
  const score = (value) =>
    nightVerdict({ forecast: { score: value }, night, moon: down }).score;
  assert.equal(score(81.5), 82);
  assert.equal(score(81.49), 81);
  assert.equal(score(63.5), 64);
  assert.equal(score(-4), 0);
  assert.equal(score(130), 100);
  assert.equal(
    nightVerdict({ forecast: { score: 81.5 }, night, moon: down }).level,
    "excellent",
  );
});

test("the forecast's category wins over the score's own threshold", () => {
  const verdict = nightVerdict({
    forecast: { score: 64, category: "variable" },
    night,
    moon: down,
    clouds: rows([10, 10, 50]),
  });
  assert.equal(verdict.level, "variable");
  assert.equal(verdict.kind, "variable-window");
});

test("clouds: 9.4 % reads clear, 9.5 % rounds to 10 and reads the mean", () => {
  const clouds = (values) =>
    nightVerdict({
      forecast: { score: 90 },
      night,
      moon: down,
      clouds: rows(values),
    }).facts.clouds;
  assert.deepEqual(clouds([9.4, 9.4]), { kind: "clear", mean: 9 });
  assert.deepEqual(clouds([9.5, 9.5]), { kind: "mean", mean: 10 });
  assert.deepEqual(clouds([80, 80, 100]), { kind: "covered", mean: 87 });
  assert.deepEqual(clouds([80, 79.9, 100]), { kind: "mean", mean: 87 });
  // Hours outside the dark window are not read.
  assert.deepEqual(
    nightVerdict({
      forecast: { score: 90 },
      night,
      moon: down,
      clouds: [
        { time: t0 - hour, cloud: 100 },
        { time: t0, cloud: 4 },
        { time: Date.parse(night.end) + hour, cloud: 100 },
      ],
    }).facts.clouds,
    { kind: "clear", mean: 4 },
  );
});

test("the Moon is full at 90 % only while it is up", () => {
  const moon = (illumination, up) =>
    nightVerdict({
      forecast: { score: 70 },
      night,
      moon: { illumination, up },
    }).facts.moon;
  const allNight = [
    { start: "2024-06-01T18:00:00.000Z", end: "2024-06-02T06:00:00.000Z" },
  ];
  assert.deepEqual(moon(90, allNight), { kind: "full" });
  assert.deepEqual(moon(89.9, allNight), { kind: "up-all-night" });
  assert.deepEqual(moon(100, []), { kind: "set" });
  // A stretch that only touches the window's edge leaves it dark.
  assert.deepEqual(
    moon(50, [{ start: night.end, end: "2024-06-02T09:00:00.000Z" }]),
    { kind: "set" },
  );
});

test("the clear run of a variable night ends at the window, never beyond", () => {
  const window = nightVerdict({
    forecast: { score: 50 },
    night,
    moon: down,
    clouds: rows([90, 90, 90, 90, 90, 90, 90, 30, 30]),
  }).facts.window;
  assert.deepEqual(window, {
    start: "2024-06-02T03:00:00.000Z",
    end: "2024-06-02T04:00:00.000Z",
    cloudsAfter: false,
  });
  // A favourable night carries no window.
  assert.equal(
    nightVerdict({
      forecast: { score: 70 },
      night,
      moon: down,
      clouds: rows([30, 30]),
    }).facts.window,
    null,
  );
});

test("the forecast's summary goes in as it comes out", () => {
  const time = rows([12, 12, 12, 12, 12, 12, 12, 12, 12]).map(
    (row) => row.time / 1000,
  );
  const forecast = summarizeAstronomyForecast({
    hourly: {
      time,
      cloud_cover: time.map(() => 12),
      visibility: time.map(() => 24000),
      precipitation_probability: time.map(() => 0),
    },
    night,
  });
  const verdict = nightVerdict({
    forecast,
    night,
    moon: down,
    clouds: rows([12, 12, 12, 12, 12, 12, 12, 12, 12]),
  });
  assert.equal(verdict.score, forecast.score);
  assert.equal(verdict.level, forecast.category);
  assert.deepEqual(verdict.facts.clouds, { kind: "mean", mean: 12 });
  assert.equal(verdict.facts.darkness.minutes, 480);
});

test("no forecast, or no night: the line of « Prévision indisponible »", () => {
  const unavailable = {
    level: null,
    score: null,
    kind: "unavailable",
    facts: null,
  };
  assert.deepEqual(nightVerdict(), unavailable);
  assert.deepEqual(nightVerdict({ forecast: null, night }), unavailable);
  assert.deepEqual(
    nightVerdict({ forecast: { score: Number.NaN }, night }),
    unavailable,
  );
  assert.deepEqual(
    nightVerdict({
      forecast: { score: 70 },
      night: { start: night.end, end: night.start },
    }),
    unavailable,
  );
});
