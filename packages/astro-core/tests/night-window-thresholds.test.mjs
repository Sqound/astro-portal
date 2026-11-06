import assert from "node:assert/strict";
import test from "node:test";

import {
  SUNRISE_SUNSET_ALTITUDE,
  astronomicalNightWindow,
  darknessAltitude,
  darknessThresholds,
  nightAltitudeCrossings,
  twilightWindows,
  zonedDate,
} from "astro-core/night-window.js";

// The twilight threshold is a parameter of the night window. Without it
// every result is exactly what it was (the first case is the same literal
// night-window.test.mjs pins).

const MID_LATITUDE = {
  date: "2025-01-10",
  latitude: 45,
  longitude: 10,
  elevation: 0,
  timeZone: "UTC",
};
const MID_LATITUDE_WINDOW = {
  start: "2025-01-10T17:43:46.146Z",
  end: "2025-01-11T05:11:33.384Z",
};

test("the three thresholds are named once", () => {
  assert.deepEqual(darknessThresholds, {
    astronomical: -18,
    nautical: -12,
    civil: -6,
  });
  assert.equal(Object.isFrozen(darknessThresholds), true);
  assert.equal(SUNRISE_SUNSET_ALTITUDE, -0.8333);
  assert.equal(darknessAltitude("nautical"), -12);
  assert.equal(darknessAltitude("civil"), -6);
  assert.equal(darknessAltitude("astronomical"), -18);
  for (const unknown of [undefined, null, "", "twilight", "toString", -12])
    assert.equal(darknessAltitude(unknown), -18);
});

test("without a threshold, or with -18, the night is exactly the old one", () => {
  assert.deepEqual(astronomicalNightWindow(MID_LATITUDE), MID_LATITUDE_WINDOW);
  assert.deepEqual(
    astronomicalNightWindow({ ...MID_LATITUDE, sunAltitudeDegrees: -18 }),
    MID_LATITUDE_WINDOW,
  );
  for (const unusable of [null, "abc", "-12", Number.NaN, Infinity])
    assert.deepEqual(
      astronomicalNightWindow({
        ...MID_LATITUDE,
        sunAltitudeDegrees: unusable,
      }),
      MID_LATITUDE_WINDOW,
    );
  const anchor = zonedDate("2025-01-10", 12, "UTC");
  const crossings = nightAltitudeCrossings({
    latitude: 45,
    longitude: 10,
    elevation: 0,
    anchor,
  });
  assert.equal(crossings.dusk.toISOString(), MID_LATITUDE_WINDOW.start);
  assert.equal(crossings.dawn.toISOString(), MID_LATITUDE_WINDOW.end);
});

test("a wider threshold nests the stricter night inside it, sunset to sunrise outermost", () => {
  const windows = twilightWindows(MID_LATITUDE);
  const order = [
    windows.sun.sunset,
    windows.civil.start,
    windows.nautical.start,
    windows.astronomical.start,
    windows.astronomical.end,
    windows.nautical.end,
    windows.civil.end,
    windows.sun.sunrise,
  ].map((value) => Date.parse(value));
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  assert.deepEqual(windows.astronomical, MID_LATITUDE_WINDOW);
  assert.deepEqual(
    windows.nautical,
    astronomicalNightWindow({ ...MID_LATITUDE, sunAltitudeDegrees: -12 }),
  );
  // Each twilight band lasts roughly half an hour at 45° in January.
  const minutes = (a, b) => (Date.parse(b) - Date.parse(a)) / 60000;
  const civilBand = minutes(windows.sun.sunset, windows.civil.start);
  assert.ok(civilBand > 25 && civilBand < 40, String(civilBand));
});

test("a short summer night has a civil darkness but no astronomical one", () => {
  const windows = twilightWindows({
    date: "2026-06-21",
    latitude: 60,
    longitude: 10,
    timeZone: "Europe/Berlin",
  });
  assert.ok(windows.sun);
  assert.ok(windows.civil);
  assert.equal(windows.nautical, null);
  assert.equal(windows.astronomical, null);
  const midnightSun = twilightWindows({
    date: "2026-06-21",
    latitude: 69.6,
    longitude: 19,
    timeZone: "Europe/Berlin",
  });
  assert.deepEqual(midnightSun, {
    sun: null,
    civil: null,
    nautical: null,
    astronomical: null,
  });
});

test("an unusable place gives no window at any threshold", () => {
  assert.deepEqual(twilightWindows({ date: "2026-10-14", latitude: 95 }), {
    sun: null,
    civil: null,
    nautical: null,
    astronomical: null,
  });
  assert.equal(
    astronomicalNightWindow({
      date: "",
      latitude: 45,
      longitude: 0,
      sunAltitudeDegrees: -6,
    }),
    null,
  );
});
