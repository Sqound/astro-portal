import assert from "node:assert/strict";
import test from "node:test";

import { nightAltitudeCrossings } from "astro-core/night-window.js";
import { observerAt, sunAltitudeAt } from "astro-core/sun-altitude.js";

// The Sun's altitude at one instant, read from the ephemeris the
// night window searches its twilights with.

test("the Sun is overhead at the equinox noon on the equator and far under the horizon at midnight", () => {
  const observer = observerAt(0, 0);
  assert.ok(sunAltitudeAt(Date.UTC(2025, 2, 20, 12, 7), observer) > 88);
  assert.ok(sunAltitudeAt(Date.UTC(2025, 2, 21, 0, 7), observer) < -88);
});

test("it reads -12° at the nautical dusk the night window finds", () => {
  const observer = observerAt(45, 10);
  const { dusk, dawn } = nightAltitudeCrossings({
    latitude: 45,
    longitude: 10,
    elevation: 0,
    anchor: new Date("2025-01-10T11:00:00Z"),
    sunAltitudeDegrees: -12,
  });
  assert.ok(Math.abs(sunAltitudeAt(dusk, observer) + 12) < 0.05);
  assert.ok(Math.abs(sunAltitudeAt(dawn, observer) + 12) < 0.05);
});

test("a Date and a number of milliseconds are the same instant; a broken one is NaN", () => {
  const observer = observerAt(48.85, 2.35);
  const stamp = Date.UTC(2025, 5, 21, 22);
  assert.equal(
    sunAltitudeAt(stamp, observer),
    sunAltitudeAt(new Date(stamp), observer),
  );
  assert.ok(Number.isNaN(sunAltitudeAt(Number.NaN, observer)));
  assert.ok(Number.isNaN(sunAltitudeAt(new Date("nope"), observer)));
});

test("at 70° N the Sun stays above -12° at midnight in June", () => {
  const observer = observerAt(70, 25);
  assert.ok(sunAltitudeAt(Date.UTC(2025, 5, 21, 22, 20), observer) > -12);
  assert.ok(sunAltitudeAt(Date.UTC(2025, 11, 21, 22, 20), observer) < -12);
});
