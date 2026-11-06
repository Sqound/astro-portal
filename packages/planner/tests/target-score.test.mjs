import assert from "node:assert/strict";
import test from "node:test";

import { sortSuggestedCards } from "planner/planner.js";
import { targetNightPath } from "planner/target-path.js";
import {
  compareTonightScores,
  targetScoreCriteria,
  targetScoreVerdict,
  targetTonightScore,
} from "planner/target-score.js";

// The score of a target for one night, criterion by criterion, every
// rule written in docs/PLANNER_SCORE.md.

const start = Date.parse("2026-10-14T19:00:00Z");
const tenMinutes = 600000;
const iso = (ms) => new Date(ms).toISOString();

// A target culminating at `peak`° at 22:40, over ten hours of night.
function series({ peak = 86, fall = 7.5, separation = 124 } = {}) {
  return Array.from({ length: 61 }, (_, index) => {
    const hours = (index - 22) / 6;
    return {
      time: iso(start + index * tenMinutes),
      altitude: peak - fall * hours * hours,
      azimuth: (180 + hours * 30 + 360) % 360,
      moonSeparation: separation,
    };
  });
}

const night = {
  start: iso(start),
  end: iso(start + 600 * 60000),
  moonIllumination: 23,
};
// The Moon sets at 19:50.
const moonSetting = Array.from({ length: 61 }, (_, index) => ({
  time: iso(start + index * tenMinutes),
  altitude: 15 - index * 3,
}));
const hourly = Array.from({ length: 11 }, (_, index) => ({
  time: start + index * 3600000,
  cloud: 12,
  humidity: index < 6 ? 70 : 82,
  wind: 10,
  gust: index === 5 ? 27 : 18,
}));
const flatMask = (altitude) => ({
  enabled: true,
  points: Array.from({ length: 12 }, (_, index) => ({
    azimuth: index * 30,
    altitude,
  })),
});

function card(overrides = {}) {
  return {
    target: {
      id: "m31",
      designation: "M31",
      title: "Galaxie d’Andromède",
      apparentSizeArcmin: [190, 60],
      skyTarget: { typeKey: "Galaxie" },
    },
    series: series(),
    minAltitude: 30,
    ...overrides,
  };
}

function score(overrides = {}) {
  const { card: cardOverrides, ...rest } = overrides;
  const base = card(cardOverrides);
  return targetTonightScore({
    window: night,
    hourly,
    moonSeries: moonSetting,
    skyQuality: { bortleClass: 3, sqm: 21.4 },
    maskPath: targetNightPath({
      series: base.series,
      mask: flatMask(15),
      minAltitude: 30,
    }),
    equipment: { field: { width: 4, height: 2.7 } },
    windTolerance: { preset: "standard" },
    ...rest,
    card: base,
  });
}

const criterionOf = (result, key) =>
  result.criteria.find((entry) => entry.key === key);

test("seven criteria in the order of the sheet, 100 points in all", () => {
  const result = score();
  assert.deepEqual(
    result.criteria.map((entry) => [entry.key, entry.max]),
    targetScoreCriteria.map((entry) => [entry.key, entry.max]),
  );
  assert.equal(result.max, 100);
  assert.equal(
    result.total,
    result.criteria.reduce((sum, entry) => sum + entry.points, 0),
  );
  assert.equal(result.estimate, true);
});

test("altitude and window: high and long scores 30, low and short near 0", () => {
  const high = criterionOf(score(), "altitude-window");
  assert.equal(high.facts.culminationAltitude, 86);
  assert.equal(high.facts.culminationAt, "2026-10-14T22:40:00.000Z");
  // 15 × a / 60 + 15 × min(D, 240) / 240, D the useful window (photo).
  assert.equal(high.facts.fullMinutes, 240);
  assert.ok(high.facts.usableMinutes > 240);
  assert.equal(high.facts.minAltitude, 30);
  assert.equal(high.points, 30);
  const low = score({ card: { series: series({ peak: 20, fall: 2 }) } });
  const window = criterionOf(low, "altitude-window");
  assert.equal(window.facts.usableMinutes, 0);
  assert.equal(window.points, 0);
  // « Fenêtre courte »: never above 49 % of the maximum.
  assert.equal(low.cap.minutes, 0);
  assert.ok(low.total * 100 <= low.max * 49);
});

test("Moon: a Moon down all night costs nothing, a bright one up all night next to the target costs all", () => {
  const down = criterionOf(
    score({
      moonSeries: moonSetting.map((point) => ({ ...point, altitude: -20 })),
    }),
    "moon",
  );
  assert.equal(down.points, 15);
  assert.equal(down.facts.state, "down");
  const full = criterionOf(
    score({
      card: { series: series({ separation: 20 }) },
      window: { ...night, moonIllumination: 100 },
      moonSeries: moonSetting.map((point) => ({ ...point, altitude: 40 })),
    }),
    "moon",
  );
  assert.equal(full.facts.state, "up");
  assert.equal(full.points, 0);
});

test("Moon: the setting time is given to the minute, with illumination and separation", () => {
  const moon = criterionOf(score(), "moon");
  assert.deepEqual(
    {
      illumination: moon.facts.illumination,
      separation: moon.facts.separation,
      state: moon.facts.state,
      setAt: moon.facts.setAt,
      targetName: moon.facts.targetName,
    },
    {
      illumination: 23,
      separation: 124,
      state: "sets",
      setAt: "2026-10-14T19:50:00.000Z",
      targetName: "M31",
    },
  );
  assert.equal(moon.points, 15);
});

test("Moon: an owned narrowband filter halves the harm on an emission nebula, the device's filters included", () => {
  const nebula = {
    target: {
      id: "ngc7000",
      designation: "NGC 7000",
      skyTarget: { typeKey: "Nébuleuse en émission" },
      apparentSizeArcmin: [120, 100],
    },
    series: series({ separation: 60 }),
  };
  const brightMoon = {
    card: nebula,
    window: { ...night, moonIllumination: 80 },
    moonSeries: moonSetting.map((point) => ({ ...point, altitude: 30 })),
  };
  const without = criterionOf(score(brightMoon), "moon");
  const withFilter = criterionOf(
    score({ ...brightMoon, ownedFilters: [{ name: "Duo-band" }] }),
    "moon",
  );
  assert.equal(without.facts.narrowbandFilter, null);
  assert.equal(withFilter.facts.narrowbandFilter, "dual");
  assert.ok(withFilter.points > without.points);
  // A galaxy is not helped by a narrowband filter.
  const galaxy = criterionOf(
    score({
      ...brightMoon,
      card: undefined,
      ownedFilters: [{ name: "Duo-band" }],
    }),
    "moon",
  );
  assert.equal(galaxy.facts.narrowbandFilter, null);
});

test("weather: cloud cover and rising humidity give 17 / 20", () => {
  const weather = criterionOf(score(), "weather");
  assert.equal(weather.facts.cloudMean, 12);
  assert.equal(weather.facts.humidity, "rising");
  assert.equal(weather.facts.humidityRiseAt, "2026-10-15T01:00:00.000Z");
  assert.equal(weather.points, 17);
  const overcast = criterionOf(
    score({
      hourly: hourly.map((row) => ({ ...row, cloud: 100, dewRisk: "high" })),
    }),
    "weather",
  );
  assert.equal(overcast.points, 0);
  assert.equal(overcast.facts.dewRisk, "high");
});

test("weather: a high dew risk costs 4, a moderate one 2, from the first hour at that level", () => {
  const rows = (level) =>
    hourly.map((row, index) => ({
      ...row,
      cloud: 0,
      humidity: 70,
      dewRisk: index >= 4 ? level : "low",
    }));
  const high = criterionOf(score({ hourly: rows("high") }), "weather");
  const moderate = criterionOf(score({ hourly: rows("moderate") }), "weather");
  assert.equal(high.points, 16);
  assert.equal(moderate.points, 18);
  assert.equal(high.facts.dewRiskFrom, iso(start + 4 * 3600000));
});

test("sky quality: 18.0 scores nothing, 22.0 everything, 21.4 is 9", () => {
  const points = (skyQuality) =>
    criterionOf(score({ skyQuality }), "sky-quality").points;
  assert.equal(points({ bortleClass: 3, sqm: 21.4 }), 9);
  assert.equal(points({ bortleClass: 9, sqm: 17.5 }), 0);
  assert.equal(points({ bortleClass: 1, sqm: 22.3 }), 10);
  // A Bortle class alone: 10 × (9 − B) / 8.
  assert.equal(points({ bortleClass: 5 }), 5);
});

test("horizon mask: the share of the time above the minimum that is clear", () => {
  const clear = criterionOf(score(), "horizon-mask");
  assert.equal(clear.facts.state, "clear");
  assert.equal(clear.facts.maskedMinutes, 0);
  assert.equal(clear.points, 5);
  const base = card();
  const walled = criterionOf(
    score({
      maskPath: targetNightPath({
        series: base.series,
        mask: flatMask(60),
        minAltitude: 30,
      }),
    }),
    "horizon-mask",
  );
  assert.ok(walled.facts.maskedMinutes > 0);
  assert.equal(
    walled.points,
    Math.floor(
      (5 * walled.facts.clearMinutes) /
        (walled.facts.clearMinutes + walled.facts.maskedMinutes) +
        0.5,
    ),
  );
  assert.ok(walled.points < 5);
});

test("field fit: comfortable 10, small less, tight 6, mosaic 2", () => {
  const fit = (field) =>
    criterionOf(score({ equipment: { field } }), "field-fit");
  assert.deepEqual(
    [
      fit({ width: 6, height: 4 }).facts.fit,
      fit({ width: 6, height: 4 }).points,
    ],
    ["comfortable", 10],
  );
  const tight = fit({ width: 3.4, height: 2.1 });
  assert.deepEqual(
    [tight.facts.fit, tight.points, tight.facts.dimension],
    ["tight", 6, "width"],
  );
  assert.deepEqual(
    [
      fit({ width: 2, height: 1.3 }).facts.fit,
      fit({ width: 2, height: 1.3 }).points,
    ],
    ["mosaic", 2],
  );
  const small = fit({ width: 32, height: 21 });
  assert.equal(small.facts.fit, "small");
  assert.equal(
    small.points,
    Math.max(1, Math.floor(small.facts.occupancy * 0.4 + 0.5)),
  );
});

test("wind: gusts at 90 % of the limit give 3, beyond the limit 0, calm 10", () => {
  const near = criterionOf(score(), "wind");
  assert.deepEqual(
    [near.facts.level, near.facts.subject, near.facts.value, near.points],
    ["near", "gust", 27, 3],
  );
  assert.equal(near.facts.at, "2026-10-15T00:00:00.000Z");
  assert.equal(near.facts.limit, 30);
  const over = criterionOf(
    score({ hourly: hourly.map((row) => ({ ...row, gust: 35 })) }),
    "wind",
  );
  assert.equal(over.facts.level, "over");
  assert.equal(over.points, 0);
  const calm = criterionOf(
    score({ hourly: hourly.map((row) => ({ ...row, gust: 12, wind: 5 })) }),
    "wind",
  );
  assert.equal(calm.points, 10);
});

test("a criterion without data scores nothing and the maximum drops by its scale", () => {
  const result = score({ hourly: [] });
  const weather = criterionOf(result, "weather");
  const wind = criterionOf(result, "wind");
  assert.deepEqual(
    [weather.available, weather.points, weather.reason],
    [false, 0, "no-forecast"],
  );
  assert.deepEqual([wind.available, wind.reason], [false, "no-forecast"]);
  assert.equal(result.max, 70);
  const bare = score({
    hourly: [],
    skyQuality: null,
    maskPath: targetNightPath({ series: card().series, minAltitude: 30 }),
    equipment: {},
  });
  assert.equal(bare.max, 45);
  assert.deepEqual(
    bare.criteria
      .filter((entry) => !entry.available)
      .map((entry) => entry.reason),
    ["no-forecast", "no-sky-quality", "no-mask", "no-field", "no-forecast"],
  );
});

test("verdict bands: 75 % and more good, 50 % to 74 % possible, under 50 % difficult", () => {
  assert.equal(targetScoreVerdict(75, 100), "good");
  assert.equal(targetScoreVerdict(74, 100), "possible");
  assert.equal(targetScoreVerdict(50, 100), "possible");
  assert.equal(targetScoreVerdict(49, 100), "difficult");
  // Against a reduced maximum: 53 / 70 is 75.7 %.
  assert.equal(targetScoreVerdict(53, 70), "good");
  assert.equal(targetScoreVerdict(52, 70), "possible");
  assert.equal(targetScoreVerdict(0, 0), "difficult");
});

test("the sample night is a good target", () => {
  const result = score({ equipment: { field: { width: 3.2, height: 2.1 } } });
  assert.equal(result.verdict, "good");
  assert.ok(result.total >= 75);
});

test("the score is deterministic and leaves its inputs untouched", () => {
  const input = {
    card: card(),
    window: night,
    hourly,
    moonSeries: moonSetting,
    skyQuality: { bortleClass: 3, sqm: 21.4 },
    equipment: { field: { width: 4, height: 2.7 } },
  };
  const snapshot = JSON.stringify(input);
  const first = targetTonightScore(input);
  const second = targetTonightScore(structuredClone(input));
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});

test("sort « Score de ce soir »: the higher share of its own maximum first, unscored last", () => {
  const entry = (id, total, max, maxAltitude = 50) => ({
    id,
    maxAltitude,
    usableStart: night.start,
    usableEnd: night.end,
    best: { moonSeparation: 90 },
    ...(max === null ? {} : { tonightScore: { total, max } }),
  });
  const cards = [
    entry("a", 60, 100),
    entry("b", 56, 70),
    entry("c", 0, null),
    entry("d", 60, 100, 70),
  ];
  assert.deepEqual(
    sortSuggestedCards(cards, "score").map((card) => card.id),
    ["b", "d", "a", "c"],
  );
  // The default order is unchanged.
  assert.deepEqual(
    sortSuggestedCards(cards).map((card) => card.id),
    ["d", "a", "b", "c"],
  );
  assert.ok(
    compareTonightScores({ total: 56, max: 70 }, { total: 60, max: 100 }) < 0,
  );
  assert.equal(compareTonightScores(null, null), 0);
});

test("the sky criterion says where a value a person gave comes from, and says nothing of the model's (TARGET-STATS-SKY-PLACE-01)", () => {
  for (const source of ["measured", "entered"])
    assert.equal(
      criterionOf(
        score({ skyQuality: { bortleClass: 4, sqm: 21.4, source } }),
        "sky-quality",
      ).facts.source,
      source,
    );
  for (const skyQuality of [
    { bortleClass: 3, sqm: 21.4 },
    { bortleClass: 3, sqm: 21.4, source: "model" },
  ])
    assert.equal(
      Object.hasOwn(
        criterionOf(score({ skyQuality }), "sky-quality").facts,
        "source",
      ),
      false,
    );
  // The points follow the value, not where it comes from.
  assert.equal(
    criterionOf(
      score({ skyQuality: { bortleClass: 3, sqm: 21.4, source: "entered" } }),
      "sky-quality",
    ).points,
    criterionOf(score(), "sky-quality").points,
  );
});
