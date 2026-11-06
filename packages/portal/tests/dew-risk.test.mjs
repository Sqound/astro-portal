import assert from "node:assert/strict";
import test from "node:test";

import {
  dewPointFromHumidity,
  dewRiskLevel,
  dewRiskRule,
  nightDewRisk,
} from "portal/dew-risk.js";
import {
  hourlyAstronomyForecast,
  summarizeAstronomyForecast,
} from "portal/astronomy-forecast.js";

// The initial dew rule, written in dew-risk.js.

test("the rule's thresholds are the phase's defaults", () => {
  assert.deepEqual(dewRiskRule, {
    highSpreadCelsius: 1,
    moderateSpreadCelsius: 3,
    calmingWindKmh: 15,
  });
});

test("a spread of 1 °C or less is high, 3 °C or less moderate, more is low", () => {
  assert.equal(dewRiskLevel({ temperature: 8, dewPoint: 7 }), "high");
  assert.equal(dewRiskLevel({ temperature: 8, dewPoint: 8.4 }), "high");
  assert.equal(dewRiskLevel({ temperature: 8, dewPoint: 6.9 }), "moderate");
  assert.equal(dewRiskLevel({ temperature: 8, dewPoint: 5 }), "moderate");
  assert.equal(dewRiskLevel({ temperature: 8, dewPoint: 4.9 }), "low");
});

test("the spread is read to a tenth of a degree, never through binary noise", () => {
  // 12.3 − 11.3 is 1.0000000000000018 in binary floating point.
  assert.equal(dewRiskLevel({ temperature: 12.3, dewPoint: 11.3 }), "high");
  assert.equal(dewRiskLevel({ temperature: 12.3, dewPoint: 9.3 }), "moderate");
});

test("a wind of 15 km/h or more lowers the level by one, never below low", () => {
  assert.equal(
    dewRiskLevel({ temperature: 8, dewPoint: 7.5, wind: 15 }),
    "moderate",
  );
  assert.equal(dewRiskLevel({ temperature: 8, dewPoint: 6, wind: 20 }), "low");
  assert.equal(dewRiskLevel({ temperature: 8, dewPoint: 2, wind: 30 }), "low");
  assert.equal(
    dewRiskLevel({ temperature: 8, dewPoint: 7.5, wind: 14.9 }),
    "high",
  );
});

test("without a dew point, the humidity gives one (Magnus); without either, no level", () => {
  assert.equal(dewPointFromHumidity(10, 100), 10);
  assert.equal(dewPointFromHumidity(10, 80), 6.7);
  assert.equal(dewPointFromHumidity(10, 0), null);
  assert.equal(dewPointFromHumidity(null, 80), null);
  assert.equal(dewRiskLevel({ temperature: 10, humidity: 95 }), "high");
  assert.equal(dewRiskLevel({ temperature: 10, humidity: 60 }), "low");
  assert.equal(dewRiskLevel({ temperature: 10 }), null);
  assert.equal(dewRiskLevel({ dewPoint: 5, humidity: 90 }), null);
  assert.equal(dewRiskLevel(null), null);
});

test("the night takes the highest level and the first hour it is reached", () => {
  const rows = [
    { time: 1, temperature: 12, dewPoint: 6 },
    { time: 2, temperature: 10, dewPoint: 7.5 },
    { time: 3, temperature: 9, dewPoint: 7 },
    { time: 4, temperature: 8, dewPoint: 7.6 },
    { time: 5, temperature: 7, dewPoint: 6.8 },
  ];
  assert.deepEqual(nightDewRisk(rows), {
    level: "high",
    from: 4,
    estimate: true,
  });
  assert.deepEqual(nightDewRisk(rows.slice(0, 3)), {
    level: "moderate",
    from: 2,
    estimate: true,
  });
  assert.deepEqual(nightDewRisk(rows.slice(0, 1)), {
    level: "low",
    from: 1,
    estimate: true,
  });
  assert.equal(nightDewRisk([{ time: 1 }]), null);
  assert.equal(nightDewRisk([]), null);
  assert.equal(nightDewRisk(undefined), null);
});

test("the forecast carries the dew risk per hour and for the night", () => {
  const hourly = {
    time: [
      "2026-10-14T20:00:00Z",
      "2026-10-14T23:00:00Z",
      "2026-10-15T01:00:00Z",
    ],
    cloud_cover: [10, 10, 10],
    wind_speed_10m: [6, 6, 6],
    temperature_2m: [11, 8, 6],
    dew_point_2m: [5, 5.5, 4],
  };
  const night = {
    start: "2026-10-14T19:30:00.000Z",
    end: "2026-10-15T02:30:00.000Z",
  };
  assert.deepEqual(
    hourlyAstronomyForecast({ hourly, night }).map((row) => row.dewRisk),
    ["low", "moderate", "moderate"],
  );
  assert.deepEqual(summarizeAstronomyForecast({ hourly, night }).dewRisk, {
    level: "moderate",
    from: Date.parse("2026-10-14T23:00:00Z"),
    estimate: true,
  });
  const withoutTemperature = { time: hourly.time, cloud_cover: [10, 10, 10] };
  assert.equal(
    "dewRisk" in
      summarizeAstronomyForecast({ hourly: withoutTemperature, night }),
    false,
  );
});
