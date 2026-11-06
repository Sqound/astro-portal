import assert from "node:assert/strict";
import test from "node:test";

import {
  astronomyForecastRangeUrl,
  hourlyAstronomyForecast,
  summarizeAstronomyForecast,
} from "portal/astronomy-forecast.js";
import { normalizeMetNorwayForecast } from "portal/met-norway-forecast.js";

// Temperature, dew point, gusts and rain amount, from both providers,
// under the same keys, and never a false zero.

const night = {
  start: "2026-10-14T19:30:00.000Z",
  end: "2026-10-15T02:30:00.000Z",
};

const openMeteo = {
  time: [
    "2026-10-14T20:00:00Z",
    "2026-10-14T23:00:00Z",
    "2026-10-15T00:00:00Z",
    "2026-10-15T01:00:00Z",
  ],
  cloud_cover: [10, 12, 15, 20],
  temperature_2m: [9.84, 7.25, 6.5, -0.35],
  dew_point_2m: [4.1, 5.06, 5.8, -1.2],
  wind_gusts_10m: [12.4, 27.2, 27.2, null],
  precipitation: [0, 0.04, 0.3, null],
};

test("the Open-Meteo request asks for temperature, dew point, gusts and rain amount", () => {
  const url = new URL(
    astronomyForecastRangeUrl({
      latitude: 45,
      longitude: -30,
      startDate: "2026-10-14",
      endDate: "2026-10-15",
    }),
  );
  const hourly = url.searchParams.get("hourly").split(",");
  for (const key of [
    "temperature_2m",
    "dew_point_2m",
    "wind_gusts_10m",
    "precipitation",
  ])
    assert.ok(hourly.includes(key), key);
  // The existing series are all still requested.
  for (const key of [
    "cloud_cover",
    "precipitation_probability",
    "wind_speed_10m",
    "relative_humidity_2m",
  ])
    assert.ok(hourly.includes(key), key);
});

test("hourly rows expose the new fields, rounded, with a gap read as null", () => {
  const rows = hourlyAstronomyForecast({ hourly: openMeteo, night });
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map(({ temperature, dewPoint, gust, precipitationAmount }) => ({
      temperature,
      dewPoint,
      gust,
      precipitationAmount,
    })),
    [
      { temperature: 9.8, dewPoint: 4.1, gust: 12, precipitationAmount: 0 },
      { temperature: 7.3, dewPoint: 5.1, gust: 27, precipitationAmount: 0 },
      { temperature: 6.5, dewPoint: 5.8, gust: 27, precipitationAmount: 0.3 },
      {
        temperature: -0.3,
        dewPoint: -1.2,
        gust: null,
        precipitationAmount: null,
      },
    ],
  );
});

test("a forecast without the new series gives rows and a summary exactly as before", () => {
  const hourly = { time: openMeteo.time, cloud_cover: openMeteo.cloud_cover };
  const rows = hourlyAstronomyForecast({ hourly, night });
  for (const row of rows)
    for (const key of [
      "temperature",
      "dewPoint",
      "gust",
      "precipitationAmount",
    ])
      assert.equal(key in row, false, key);
  const summary = summarizeAstronomyForecast({ hourly, night });
  assert.equal("gustMax" in summary, false);
  assert.equal("gustMaxAt" in summary, false);
});

test("the night summary names the strongest gust and the first hour it is reached", () => {
  const summary = summarizeAstronomyForecast({ hourly: openMeteo, night });
  assert.equal(summary.gustMax, 27);
  assert.equal(summary.gustMaxAt, Date.parse("2026-10-14T23:00:00Z"));
  const calm = summarizeAstronomyForecast({
    hourly: { ...openMeteo, wind_gusts_10m: [null, null, null, null] },
    night,
  });
  assert.equal(calm.gustMax, null);
  assert.equal(calm.gustMaxAt, null);
});

function metSeries(time, details, nextHour = {}) {
  return {
    time,
    data: {
      instant: { details: { cloud_area_fraction: 20, ...details } },
      next_1_hours: {
        summary: { symbol_code: "clearsky_night" },
        details: nextHour,
      },
    },
  };
}

test("MET Norway maps temperature, dew point, gusts and rain amount to the same keys", () => {
  const normalized = normalizeMetNorwayForecast({
    properties: {
      timeseries: [
        metSeries(
          "2026-10-14T20:00:00Z",
          {
            air_temperature: 8.2,
            dew_point_temperature: 6.9,
            wind_speed_of_gust: 5,
          },
          { precipitation_amount: 0.2 },
        ),
        metSeries("2026-10-14T21:00:00Z", { air_temperature: 7.6 }),
      ],
    },
  });
  assert.deepEqual(normalized.hourly.temperature_2m, [8.2, 7.6]);
  assert.deepEqual(normalized.hourly.dew_point_2m, [6.9, null]);
  assert.deepEqual(normalized.hourly.wind_gusts_10m, [18, null]);
  assert.deepEqual(normalized.hourly.precipitation, [0.2, null]);
  const rows = hourlyAstronomyForecast({
    hourly: normalized.hourly,
    night: { start: "2026-10-14T19:00:00Z", end: "2026-10-14T22:00:00Z" },
  });
  assert.equal(rows[0].gust, 18);
  assert.equal(rows[1].dewPoint, null);
});

test("a MET Norway response without the new fields normalizes exactly as before", () => {
  const normalized = normalizeMetNorwayForecast({
    properties: {
      timeseries: [metSeries("2026-10-14T20:00:00Z", { wind_speed: 3 })],
    },
  });
  for (const key of [
    "temperature_2m",
    "dew_point_2m",
    "wind_gusts_10m",
    "precipitation",
  ])
    assert.equal(key in normalized.hourly, false, key);
  assert.deepEqual(normalized.missingFields, [
    "precipitation_probability",
    "visibility",
  ]);
});
