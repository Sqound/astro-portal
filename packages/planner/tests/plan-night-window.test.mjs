import assert from "node:assert/strict";
import test from "node:test";

import { planNightGeometry, planNightWindow } from "planner/planner.js";

// One function gives the night of a plan, and without the two new
// properties it is exactly the night the planner already draws.

const azores = {
  latitude: "45",
  longitude: "-30",
  elevation: "0",
  timeZone: "Atlantic/Azores",
};
const plan = (extra = {}) => ({
  id: "plan-1",
  date: "2026-10-14",
  location: azores,
  items: [],
  ...extra,
});
const geometry = (date, location) =>
  planNightGeometry({
    date,
    location,
    targets: [],
    planetReferences: { planets: [] },
  });

test("without darkness or nightSpan, the window is planNightGeometry's night", () => {
  for (const [date, location] of [
    ["2026-10-14", azores],
    ["2025-01-10", { latitude: 45, longitude: 10, timeZone: "UTC" }],
    ["2026-10-14", { latitude: 45, longitude: 170 }],
    [
      "2026-06-21",
      { latitude: 69.6, longitude: 19, timeZone: "Europe/Berlin" },
    ],
  ]) {
    const window = planNightWindow({ date, location, items: [] });
    const night = geometry(date, location);
    assert.equal(window.start, night.start, `${date} start`);
    assert.equal(window.end, night.end, `${date} end`);
    assert.equal(window.darkness, "astronomical");
    assert.equal(window.span, "astronomical");
  }
});

test("each darkness widens the night, inside sunset and sunrise", () => {
  const [astronomical, nautical, civil] = [
    "astronomical",
    "nautical",
    "civil",
  ].map((darkness) => planNightWindow(plan({ darkness })));
  const at = (value) => Date.parse(value);
  assert.ok(at(civil.sunset) < at(civil.start));
  assert.ok(at(civil.start) < at(nautical.start));
  assert.ok(at(nautical.start) < at(astronomical.start));
  assert.ok(at(astronomical.end) < at(nautical.end));
  assert.ok(at(nautical.end) < at(civil.end));
  assert.ok(at(civil.end) < at(civil.sunrise));
  assert.equal(civil.darkness, "civil");
  assert.equal(
    planNightWindow(plan({ darkness: "dusk" })).darkness,
    "astronomical",
  );
});

test("a custom span becomes the window; the dark night stays readable beside it", () => {
  const window = planNightWindow(
    plan({
      darkness: "nautical",
      nightSpan: {
        mode: "custom",
        start: "2026-10-14T20:27:00Z",
        end: "2026-10-15T02:16:00Z",
      },
    }),
  );
  assert.equal(window.span, "custom");
  assert.equal(window.start, "2026-10-14T20:30:00.000Z");
  assert.equal(window.end, "2026-10-15T02:20:00.000Z");
  assert.equal(
    window.darkStart,
    planNightWindow(plan({ darkness: "nautical" })).start,
  );
});

test("a span beyond the Sun is clamped to sunset and sunrise, a too-short one ignored", () => {
  const window = planNightWindow(
    plan({
      nightSpan: {
        mode: "custom",
        start: "2026-10-14T12:00:00Z",
        end: "2026-10-15T12:00:00Z",
      },
    }),
  );
  assert.ok(Date.parse(window.start) >= Date.parse(window.sunset));
  assert.ok(Date.parse(window.end) <= Date.parse(window.sunrise));
  const short = planNightWindow(
    plan({
      nightSpan: {
        mode: "custom",
        start: "2026-10-14T23:00:00Z",
        end: "2026-10-14T23:10:00Z",
      },
    }),
  );
  assert.equal(short.span, "astronomical");
  assert.equal(short.start, short.darkStart);
});

test("the place argument wins over the plan's location; no place or date, no night", () => {
  const utc = { latitude: 45, longitude: 10, timeZone: "UTC" };
  assert.equal(
    planNightWindow({ date: "2025-01-10", items: [] }, utc).start,
    "2025-01-10T17:43:46.146Z",
  );
  assert.equal(planNightWindow({ date: "2026-10-14", items: [] }), null);
  assert.equal(planNightWindow({ location: azores, items: [] }), null);
  assert.equal(
    planNightWindow(plan(), { latitude: "", longitude: "-30" }),
    null,
  );
});
