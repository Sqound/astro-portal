import assert from "node:assert/strict";
import test from "node:test";

import { planNightSpanSky, planNightWindow } from "planner/planner.js";
import {
  moonUpIntervals,
  newPlanPlace,
  tonightCandidateCount,
  tonightCandidateNote,
  tonightMoonEvent,
  tonightOverview,
  tonightPlanCard,
  tonightPlansHavePlacedTarget,
  tonightWeather,
} from "planner/tonight-overview.js";

// "Cette nuit", the night at a glance. One function composes the sources the
// planner already has.

const place = {
  name: "Camping du Lac Noir",
  latitude: "45",
  longitude: "-30",
  elevation: "0",
  timeZone: "Atlantic/Azores",
};
const date = "2026-10-14";
const sky = (darkness) =>
  planNightSpanSky({ date, ...(darkness ? { darkness } : {}) }, place);
const hour = 3600000;
const at = (value) => Date.parse(value);

// Hourly rows over the dark night: clouds 10 % then 25 % at the third hour,
// wind 8 → 10 km/h with gusts to 17, dew rising to moderate from the fourth.
function rows(night) {
  const start = Math.ceil(at(night.darkStart) / hour) * hour;
  return Array.from({ length: 6 }, (_, index) => ({
    time: start + index * hour,
    cloud: index === 2 || index === 4 ? 25 : 10,
    wind: index < 3 ? 8 : 10,
    gust: index === 1 ? 17 : 12,
    temperature: 8,
    dewPoint: index >= 3 ? 5.5 : 2,
    humidity: 80,
  }));
}

const card = (id, extra = {}) => ({
  target: { id, designation: id.toUpperCase(), title: `${id} title` },
  maxAltitude: 60,
  usableStart: "2026-10-14T22:00:00.000Z",
  usableEnd: "2026-10-15T01:00:00.000Z",
  filter: "",
  ...extra,
});
const score = (total, max = 100) => ({ total, max });

test("without a place, only the plans can be said", () => {
  const overview = tonightOverview({
    place: null,
    date,
    night: null,
    plans: [{ id: "p1", name: "Nuit d’octobre au lac", items: [] }],
  });
  assert.equal(overview.state, "no-place");
  assert.equal(overview.place, null);
  assert.equal(overview.night, null);
  assert.equal(overview.weather, null);
  assert.equal(overview.moon, null);
  assert.deepEqual(overview.candidates, []);
  assert.equal(overview.plans.length, 1);
  assert.equal(overview.plans[0].name, "Nuit d’octobre au lac");
});

test("the night is the dark night of the threshold, with its length", () => {
  const night = sky();
  const overview = tonightOverview({ place, date, night });
  assert.equal(overview.state, "ready");
  assert.equal(overview.night.darkness, "astronomical");
  assert.equal(overview.night.start, night.darkStart);
  assert.equal(overview.night.end, night.darkEnd);
  assert.equal(
    overview.night.minutes,
    Math.round((at(night.darkEnd) - at(night.darkStart)) / 60000),
  );
  const nautical = tonightOverview({ place, date, night: sky("nautical") });
  assert.equal(nautical.night.darkness, "nautical");
  assert.ok(nautical.night.minutes > overview.night.minutes);
  assert.equal(overview.timeline.start, night.scaleStart);
  assert.equal(overview.timeline.end, night.scaleEnd);
  assert.equal(overview.timeline.sunset, night.sunset);
});

test("the weather tiles: mean and peak of the clouds, wind and gusts, dew", () => {
  const night = sky();
  const hourly = rows(night);
  const overview = tonightOverview({ place, date, night, hourly });
  assert.deepEqual(overview.weather.cloud, {
    mean: 15,
    max: 25,
    maxAt: new Date(hourly[2].time).toISOString(),
  });
  assert.deepEqual(overview.weather.wind, { mean: 9, gust: 17 });
  assert.deepEqual(overview.weather.dew, {
    level: "moderate",
    from: new Date(hourly[3].time).toISOString(),
  });
});

test("without a forecast the weather is unavailable; an hour outside the night does not count", () => {
  const night = sky();
  assert.equal(
    tonightOverview({ place, date, night, hourly: [] }).weather,
    null,
  );
  const before = { time: at(night.darkStart) - 2 * hour, cloud: 100, wind: 50 };
  const inside = { time: at(night.darkStart) + hour, cloud: 20, wind: 6 };
  const weather = tonightWeather([before, inside], {
    start: night.darkStart,
    end: night.darkEnd,
  });
  assert.deepEqual(weather.cloud, {
    mean: 20,
    max: 20,
    maxAt: new Date(inside.time).toISOString(),
  });
  // No gust series and no temperature: no gust, no dew.
  assert.deepEqual(weather.wind, { mean: 6, gust: null });
  assert.equal(weather.dew, null);
});

test("the Moon's stretches above the horizon, crossings read between samples", () => {
  const base = at("2026-10-14T18:00:00.000Z");
  const series = [10, 5, -5, -10, -5, 5].map((altitude, index) => ({
    time: new Date(base + index * 600000).toISOString(),
    altitude,
  }));
  assert.deepEqual(moonUpIntervals(series), [
    {
      start: "2026-10-14T18:00:00.000Z",
      end: "2026-10-14T18:15:00.000Z",
    },
    {
      start: "2026-10-14T18:45:00.000Z",
      end: "2026-10-14T18:50:00.000Z",
    },
  ]);
  const night = {
    start: "2026-10-14T18:05:00.000Z",
    end: "2026-10-14T18:40:00.000Z",
  };
  const intervals = moonUpIntervals(series);
  assert.deepEqual(tonightMoonEvent(intervals, night), {
    event: "sets",
    at: "2026-10-14T18:15:00.000Z",
  });
  assert.deepEqual(
    tonightMoonEvent(intervals, {
      start: "2026-10-14T18:20:00.000Z",
      end: "2026-10-14T18:50:00.000Z",
    }),
    { event: "rises", at: "2026-10-14T18:45:00.000Z" },
  );
  assert.deepEqual(
    tonightMoonEvent(intervals, {
      start: "2026-10-14T18:20:00.000Z",
      end: "2026-10-14T18:40:00.000Z",
    }),
    { event: "down", at: null },
  );
  assert.deepEqual(
    tonightMoonEvent(intervals, {
      start: "2026-10-14T18:01:00.000Z",
      end: "2026-10-14T18:10:00.000Z",
    }),
    { event: "up", at: null },
  );
});

test("the Moon tile reads the night's own series and illumination", () => {
  const night = sky();
  const overview = tonightOverview({
    place,
    date,
    night,
    moonIllumination: 23.4,
  });
  assert.equal(overview.moon.illumination, 23);
  assert.ok(["sets", "rises", "up", "down"].includes(overview.moon.event));
  assert.deepEqual(overview.timeline.moonUp, moonUpIntervals(night.moonSeries));
  assert.deepEqual(
    { event: overview.moon.event, at: overview.moon.at },
    tonightMoonEvent(overview.timeline.moonUp, {
      start: night.darkStart,
      end: night.darkEnd,
    }),
  );
});

test("sky quality: Bortle, SQM to the tenth, an estimate; none without a class", () => {
  const night = sky();
  assert.deepEqual(
    tonightOverview({
      place,
      date,
      night,
      skyQuality: { bortleClass: 3, sqm: 21.43 },
    }).skyQuality,
    { bortleClass: 3, sqm: 21.4, estimate: true },
  );
  assert.equal(
    tonightOverview({ place, date, night, skyQuality: { sqm: 21 } }).skyQuality,
    null,
  );
});

test("a plan's card: its targets once each, from the first start to the last end", () => {
  const plan = {
    id: "p1",
    name: "  Nuit d’octobre au lac ",
    status: "pending",
    date,
    location: place,
    items: [
      {
        startMinute: 7,
        endMinute: 60,
        target: { id: "ic1396", title: "IC 1396", objects: ["IC 1396"] },
      },
      {
        startMinute: 60,
        endMinute: 200,
        target: { id: "m31", title: "M31 — Andromède", objects: ["M31"] },
      },
      {
        startMinute: 200,
        endMinute: 420,
        target: { id: "m31", title: "M31 — Andromède", objects: ["M31"] },
      },
      {
        startMinute: 30,
        endMinute: 90,
        target: {
          id: "framing-1",
          title: "Cœur et âme",
          plannerSource: "framing",
          objects: ["IC 1805"],
        },
      },
    ],
  };
  const darkStart = at(planNightWindow(plan).darkStart);
  const { items, ...card } = tonightPlanCard(plan);
  assert.deepEqual(card, {
    id: "p1",
    name: "Nuit d’octobre au lac",
    status: "pending",
    targetCount: 3,
    start: new Date(darkStart + 7 * 60000).toISOString(),
    end: new Date(darkStart + 420 * 60000).toISOString(),
    targets: ["IC 1396", "M31", "Cœur et âme"],
  });
  // Each target with its place in the plan,
  // its id, its catalogue card and its slot, in the order of the night.
  assert.deepEqual(
    items.map((item) => [item.key, item.id, item.label, item.minutes]),
    [
      ["item-0", "ic1396", "IC 1396", 53],
      ["item-3", "framing-1", "Cœur et âme", 60],
      ["item-1", "m31", "M31", 140],
      ["item-2", "m31", "M31", 220],
    ],
  );
  assert.equal(items[2].designation, "M31 — Andromède");
  assert.equal(items[2].target, plan.items[1].target);
  assert.equal(items[2].start, new Date(darkStart + 60 * 60000).toISOString());
  assert.equal(items[2].end, new Date(darkStart + 200 * 60000).toISOString());
  const empty = tonightPlanCard({ ...plan, items: [] });
  assert.equal(empty.targetCount, 0);
  assert.equal(empty.start, null);
  assert.equal(empty.end, null);
  assert.deepEqual(empty.items, []);
});

test("« À voir ce soir »: the three best scores, ties in the planner's order, unscored last", () => {
  const night = sky();
  const candidates = [
    { card: card("a"), score: score(50) },
    { card: card("b"), score: null },
    { card: card("c"), score: score(40, 50) },
    { card: card("d"), score: score(70) },
    { card: card("e"), score: score(80, 100) },
  ];
  const overview = tonightOverview({ place, date, night, candidates });
  assert.equal(tonightCandidateCount, 3);
  assert.deepEqual(
    overview.candidates.map((entry) => entry.id),
    ["c", "e", "d"],
  );
  const named = tonightOverview({
    place,
    date,
    night,
    candidates: [
      {
        card: card("m31", {
          target: {
            id: "m31",
            designation: "M31",
            title: "M31 — Galaxie d’Andromède",
          },
          maxAltitude: 85.6,
        }),
        score: score(80),
      },
    ],
  }).candidates[0];
  assert.equal(named.designation, "M31");
  assert.equal(named.name, "Galaxie d’Andromède");
  assert.equal(named.maxAltitude, 86);
  assert.equal(named.windowStart, "2026-10-14T22:00:00.000Z");
  assert.equal(named.windowEnd, "2026-10-15T01:00:00.000Z");
});

test("the note of a candidate: Moon set, else its narrowband filter, else Moon up", () => {
  const window = {
    start: at("2026-10-14T22:00:00.000Z"),
    end: at("2026-10-15T01:00:00.000Z"),
  };
  const earlyMoon = [
    { start: "2026-10-14T19:00:00.000Z", end: "2026-10-14T21:05:00.000Z" },
  ];
  const lateMoon = [
    { start: "2026-10-15T00:30:00.000Z", end: "2026-10-15T06:00:00.000Z" },
  ];
  assert.deepEqual(tonightCandidateNote(card("x"), window, earlyMoon), {
    kind: "moon-down",
  });
  assert.deepEqual(
    tonightCandidateNote(card("x", { filter: "Duo-band" }), window, lateMoon),
    { kind: "filter", family: "dual" },
  );
  assert.deepEqual(tonightCandidateNote(card("x"), window, lateMoon), {
    kind: "moon-up",
  });
  // The window the card shows: the visibility window matching its usable
  // span rather than the first one.
  const shown = tonightOverview({
    place,
    date,
    night: sky(),
    candidates: [
      {
        card: card("y", {
          visibilityWindows: [
            {
              start: "2026-10-14T20:00:00.000Z",
              end: "2026-10-14T21:00:00.000Z",
            },
            {
              start: "2026-10-14T22:00:00.000Z",
              end: "2026-10-15T01:00:00.000Z",
            },
          ],
        }),
        score: score(10),
      },
    ],
  }).candidates[0];
  assert.equal(shown.windowStart, "2026-10-14T22:00:00.000Z");
});

test("the frise icon has something to switch only when a plan has a target placed", () => {
  const item = (designation) => ({ target: { designation } });
  const none = tonightPlanCard({ id: "a", name: "Vide", items: [] });
  const some = tonightPlanCard({
    id: "b",
    name: "Un",
    items: [item("M31")],
  });
  assert.equal(none.targetCount, 0);
  assert.equal(some.targetCount, 1);
  assert.equal(tonightPlansHavePlacedTarget([]), false);
  assert.equal(tonightPlansHavePlacedTarget(undefined), false);
  assert.equal(tonightPlansHavePlacedTarget([none]), false);
  assert.equal(tonightPlansHavePlacedTarget([none, some]), true);
});

// Each tile of the night keeps the hourly strip's own hours as a curve to
// draw behind its text.
test("the weather carries one sample per strip hour for each tile's curve", () => {
  const night = sky();
  const start = Math.ceil(at(night.darkStart) / hour) * hour;
  const hourly = Array.from({ length: 4 }, (_, index) => ({
    time: start + index * hour,
    cloud: 10 * index,
    wind: 5 + index,
    humidity: 60 + 5 * index,
    precipitation: [0, 40, 10, 20][index],
    visibilityKm: [12, 8.04, 9.5, 10][index],
  }));
  const weather = tonightWeather(hourly, {
    start: night.darkStart,
    end: night.darkEnd,
  });
  const times = hourly.map((row) => new Date(row.time).toISOString());
  for (const key of ["cloud", "wind", "humidity", "precipitation"])
    assert.deepEqual(
      weather.series[key].map((sample) => sample.time),
      times,
      key,
    );
  assert.deepEqual(
    weather.series.cloud.map((sample) => sample.value),
    [0, 10, 20, 30],
  );
  assert.deepEqual(
    weather.series.humidity.map((sample) => sample.value),
    [60, 65, 70, 75],
  );
  // "Précipitations": the mean, the strongest probability and its hour.
  assert.deepEqual(weather.precipitation, {
    mean: 18,
    max: 40,
    maxAt: times[1],
  });
  // "Visibilité": the mean and the lowest hour, one decimal.
  assert.deepEqual(weather.visibility, {
    mean: 9.9,
    min: 8,
    minAt: times[1],
  });
  assert.equal(weather.series.visibility.length, 4);
});

test("a tile whose figure the forecast lacks has no curve and no value", () => {
  const night = sky();
  const weather = tonightWeather(
    [{ time: at(night.darkStart) + hour, cloud: 20, wind: 6 }],
    { start: night.darkStart, end: night.darkEnd },
  );
  assert.equal(weather.precipitation, null);
  assert.equal(weather.visibility, null);
  assert.deepEqual(weather.series.precipitation, []);
  assert.deepEqual(weather.series.visibility, []);
  assert.deepEqual(weather.series.humidity, []);
});

test("the Moon's altitude over the dark night is kept for its tile's curve", () => {
  const night = sky();
  const start = at(night.darkStart);
  const moonSeries = [-1, 0, 1, 2, 3].map((index) => ({
    time: new Date(start + index * hour).toISOString(),
    altitude: 20 * index,
  }));
  const overview = tonightOverview({
    place,
    date,
    night,
    moonSeries,
    hourly: rows(night),
  });
  const altitude = overview.moon.altitude;
  assert.ok(altitude.length >= 2 && altitude.length <= 4);
  assert.ok(
    altitude.every(
      (sample) =>
        Date.parse(sample.time) >= start &&
        Date.parse(sample.time) <= at(night.darkEnd),
    ),
  );
  assert.equal(altitude[0].value, 0);
});

// A night made for a new plan starts at the current place of
// "Cette nuit", not at the place of the last plan the planner opened.
test("newPlanPlace is the place of tonight's plan, not the last plan's", () => {
  const lake = {
    id: "lake",
    name: "Lac",
    latitude: 46,
    longitude: -31,
    timeZone: "Atlantic/Azores",
  };
  const home = { ...place, id: "home", name: "Maison", latitude: 45 };
  const now = Date.parse("2026-10-14T23:00:00Z");
  const document = {
    // The planner stands on a past plan at the lake ...
    location: lake,
    plans: [
      { id: "old", status: "pending", date: "2026-09-02", location: lake },
      // ... while tonight's plan is at home.
      { id: "tonight", status: "pending", date, location: home },
    ],
    knownLocations: [home, lake],
  };
  assert.equal(newPlanPlace({ document, now }).name, "Maison");
  // Nothing tonight: the planner's own place, as before.
  const quiet = { ...document, plans: document.plans.slice(0, 1) };
  assert.equal(newPlanPlace({ document: quiet, now }).name, "Lac");
  // No usable place at all: nothing.
  assert.equal(newPlanPlace({ document: { plans: [] }, now }), null);
});
