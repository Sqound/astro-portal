import assert from "node:assert/strict";
import test from "node:test";

import { Body, Illumination } from "astronomy-engine";
import {
  hourlyAstronomyForecast,
  summarizeAstronomyForecast,
} from "portal/astronomy-forecast.js";
import {
  forecastMoonOfNight,
  planNight,
  planNightSpanSky,
} from "../src/planner.js";

// The score counts the Moon; every web caller hands the forecast the
// night's Moon through `forecastMoonOfNight` ("Cette nuit", the planner's
// night and its calendar outlook, the places' tonight words).

const place = { latitude: 45, longitude: -30, name: "Lieu A" };

test("the Moon of a planNightSpanSky night: its series and the disc lit at the start of the dark night", () => {
  const sky = planNightSpanSky(
    { date: "2026-10-26", darkness: "astronomical" },
    place,
  );
  const moon = forecastMoonOfNight(sky);
  assert.equal(moon.series, sky.moonSeries);
  assert.equal(
    moon.illumination,
    Math.round(
      Illumination(Body.Moon, new Date(sky.darkStart)).phase_fraction * 100,
    ),
  );
});

test("the Moon of a planNight night keeps its own illumination; no series, no Moon", () => {
  const night = planNight({
    date: "2026-10-26",
    location: place,
    targets: [],
    profile: null,
    locale: "fr",
    minAltitude: 30,
  });
  assert.deepEqual(forecastMoonOfNight(night), {
    illumination: night.moonIllumination,
    series: night.moonSeries,
  });
  assert.equal(forecastMoonOfNight(null), null);
  assert.equal(forecastMoonOfNight({ start: night.start }), null);
});

test("a clear night under a nearly full Moon scores below 100 once the Moon is given", () => {
  const sky = planNightSpanSky(
    { date: "2026-10-26", darkness: "astronomical" },
    place,
  );
  const start = Math.ceil(Date.parse(sky.darkStart) / 3600000) * 3600;
  const time = Array.from({ length: 8 }, (_, index) => start + index * 3600);
  const hourly = {
    time,
    cloud_cover: time.map(() => 0),
    precipitation_probability: time.map(() => 0),
    visibility: time.map(() => 30000),
    wind_speed_10m: time.map(() => 5),
    relative_humidity_2m: time.map(() => 60),
  };
  const night = { start: sky.darkStart, end: sky.darkEnd };
  const moon = forecastMoonOfNight(sky);
  assert.equal(summarizeAstronomyForecast({ hourly, night }).score, 100);
  const withMoon = summarizeAstronomyForecast({ hourly, night, moon });
  assert.ok(withMoon.score < 100 && withMoon.score >= 80, `${withMoon.score}`);
  const rows = hourlyAstronomyForecast({ hourly, night, moon });
  assert.ok(rows.some((row) => row.moonAltitude > 0));
  assert.ok(
    rows
      .filter((row) => row.moonAltitude <= 0)
      .every((row) => row.score === 100),
  );
});
