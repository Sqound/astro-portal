import assert from "node:assert/strict";
import test from "node:test";
import {
  driveFarthestMinutes,
  driveMinutesFor,
  driveTimeEstimate,
  placeNightRank,
  placeRankWeights,
} from "planner/places-rank.js";
import { placesRadiiKm } from "planner/places-rules.js";

// The drive-time estimate and "Meilleur cette nuit". Pure rules, synthetic
// places; nothing reaches the network.

const night = {
  start: "2026-10-14T19:20:00.000Z",
  end: "2026-10-15T05:40:00.000Z",
};

const place = (id, distanceKm, sqm) => ({ id, distanceKm, sqm });

test("the estimate is the straight line times 1.3 at 50 km/h, to five minutes", () => {
  assert.equal(driveMinutesFor(50), 78);
  assert.deepEqual(driveTimeEstimate(18), { minutes: 30 });
  assert.deepEqual(driveTimeEstimate(40), { minutes: 60 });
  assert.deepEqual(driveTimeEstimate(55), { minutes: 85 });
  assert.deepEqual(driveTimeEstimate(100), { minutes: 155 });
});

test("a short or null distance is under five minutes, never a negative time", () => {
  assert.deepEqual(driveTimeEstimate(0), { minutes: 0 });
  assert.deepEqual(driveTimeEstimate(3.2), { minutes: 0 });
  assert.deepEqual(driveTimeEstimate(3.3), { minutes: 5 });
  for (const km of [0, 0.4, 2, 7, 18, 63, 100, 400])
    assert.ok(driveTimeEstimate(km).minutes >= 0);
});

test("a distance that is not a number, or is negative, has no estimate", () => {
  for (const value of [-1, -0.001, Number.NaN, Infinity, null, undefined, "9"])
    assert.deepEqual(
      driveTimeEstimate(value),
      { minutes: null },
      String(value),
    );
});

test("the estimate grows with the distance and is a multiple of five", () => {
  let before = -1;
  for (let km = 0; km <= 120; km += 0.5) {
    const { minutes } = driveTimeEstimate(km);
    assert.equal(minutes % 5, 0);
    assert.ok(minutes >= before);
    before = minutes;
  }
});

test("the drive scale ends at the estimate of the largest radius", () => {
  const farthest = Math.max(...placesRadiiKm);
  assert.equal(
    Math.round(driveMinutesFor(farthest)),
    driveFarthestMinutes,
    "156 minutes is the 100 km estimate",
  );
  assert.equal(
    Object.values(placeRankWeights).reduce((sum, weight) => sum + weight, 0),
    100,
  );
});

test("a clear dark far place beats a cloudy near one", () => {
  const result = placeNightRank({
    places: [place("near", 10, 21.4), place("far", 29, 21.4)],
    forecasts: { near: { cloud: 70 }, far: { cloud: 12 } },
    referenceNight: night,
  });
  assert.deepEqual(
    result.ranked.map((entry) => entry.id),
    ["far", "near"],
  );
  assert.deepEqual(
    result.ranked.map((entry) => entry.rank),
    [1, 2],
  );
  assert.equal(result.anyForecast, true);
});

test("each component stays within its weight", () => {
  const result = placeNightRank({
    places: [
      place("best", 0, 22),
      place("worst", 400, 15),
      place("middle", 30, 20),
    ],
    forecasts: {
      best: { cloud: -20 },
      worst: { cloud: 180 },
      middle: { cloud: 50 },
    },
    referenceNight: night,
  });
  for (const entry of result.ranked) {
    assert.ok(entry.weatherPoints >= 0 && entry.weatherPoints <= 50);
    assert.ok(entry.skyPoints >= 0 && entry.skyPoints <= 30);
    assert.ok(entry.drivePoints >= 0 && entry.drivePoints <= 20);
    assert.ok(entry.total >= 0 && entry.total <= 100);
  }
  const best = result.ranked.find((entry) => entry.id === "best");
  assert.equal(best.total, 100);
  assert.equal(best.cloud, 0, "a cover below 0 reads 0");
  assert.equal(result.ranked.find((entry) => entry.id === "worst").total, 0);
});

test("a weather fact outweighs a good sky, a sky outweighs a short drive", () => {
  const byWeather = placeNightRank({
    places: [place("dark", 20, 22), place("clear", 20, 20)],
    forecasts: { dark: { cloud: 80 }, clear: { cloud: 10 } },
    referenceNight: night,
  });
  assert.equal(byWeather.ranked[0].id, "clear");
  const bySky = placeNightRank({
    places: [place("near", 5, 19), place("dark", 60, 22)],
    forecasts: { near: { cloud: 20 }, dark: { cloud: 20 } },
    referenceNight: night,
  });
  assert.equal(bySky.ranked[0].id, "dark");
});

test("a place without a forecast is listed after the ranked ones and hides none", () => {
  const result = placeNightRank({
    places: [
      place("unknown", 5, 21.9),
      place("cloudy", 60, 20.1),
      place("fair", 30, 21),
    ],
    forecasts: { unknown: null, cloudy: { cloud: 95 }, fair: { cloud: 40 } },
    referenceNight: night,
  });
  assert.deepEqual(
    result.ranked.map((entry) => entry.id),
    ["fair", "cloudy", "unknown"],
  );
  const unknown = result.ranked[2];
  assert.equal(unknown.hasForecast, false);
  assert.equal(unknown.weatherPoints, null);
  assert.equal(unknown.cloud, null);
  assert.equal(result.ranked.length, 3);
});

test("without a readable night, or any forecast, nothing is ranked by weather", () => {
  for (const referenceNight of [
    null,
    undefined,
    {},
    { start: "x", end: "y" },
  ]) {
    const result = placeNightRank({
      places: [place("a", 50, 21.7), place("b", 20, 21.7)],
      forecasts: { a: { cloud: 5 }, b: { cloud: 5 } },
      referenceNight,
    });
    assert.equal(result.anyForecast, false);
    assert.equal(result.night, null);
    assert.deepEqual(
      result.ranked.map((entry) => entry.id),
      ["b", "a"],
      "by sky and drive alone: the nearer one",
    );
  }
  assert.equal(
    placeNightRank({
      places: [place("a", 5, 21)],
      forecasts: {},
      referenceNight: night,
    }).anyForecast,
    false,
  );
});

test("equal facts put the nearer place first, then the smaller id", () => {
  const result = placeNightRank({
    places: [place("c", 30, 21), place("a", 30, 21), place("b", 30, 21)],
    forecasts: { a: { cloud: 20 }, b: { cloud: 20 }, c: { cloud: 20 } },
    referenceNight: night,
  });
  assert.deepEqual(
    result.ranked.map((entry) => entry.id),
    ["a", "b", "c"],
  );
});

test("a missing sky and a missing distance weigh nothing, never an error", () => {
  const result = placeNightRank({
    places: [place("blank", null, null), place("known", 40, 18)],
    forecasts: { blank: { cloud: 0 }, known: { cloud: 100 } },
    referenceNight: night,
  });
  const blank = result.ranked.find((entry) => entry.id === "blank");
  assert.equal(blank.skyPoints, 0);
  assert.equal(blank.drivePoints, 0);
  assert.equal(blank.minutes, null);
  assert.equal(blank.total, 50);
});

test("the ranking is deterministic and does not touch its input", () => {
  const input = {
    places: [place("a", 12, 21.1), place("b", 33, 21.8), place("c", 71, 21.9)],
    forecasts: { a: { cloud: 30 }, b: { cloud: 25 }, c: null },
    referenceNight: night,
  };
  const copy = JSON.parse(JSON.stringify(input));
  const first = placeNightRank(input);
  assert.deepEqual(placeNightRank(input), first);
  assert.deepEqual(input, copy);
  assert.deepEqual(placeNightRank(), {
    night: null,
    anyForecast: false,
    ranked: [],
  });
});

test("the entries carry the three facts the rows show, and the rounded drive", () => {
  const [entry] = placeNightRank({
    places: [place("a", 18, 21.7)],
    forecasts: { a: { cloud: 12 } },
    referenceNight: night,
  }).ranked;
  assert.equal(entry.cloud, 12);
  assert.equal(entry.minutes, 30);
  assert.equal(entry.weatherPoints, 44);
  assert.ok(Math.abs(entry.skyPoints - 27.75) < 1e-9);
});
