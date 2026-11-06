import assert from "node:assert/strict";
import test from "node:test";
import {
  horizontalWheelScrollDelta,
  hourlyForecastConfidence,
} from "../src/hourly-forecast.js";

test("a vertical wheel gesture over an overflowing track scrolls it sideways", () => {
  assert.equal(
    horizontalWheelScrollDelta({
      scrollWidth: 2000,
      clientWidth: 800,
      deltaX: 0,
      deltaY: 40,
    }),
    40,
  );
});

test("a track that fits its container is left to the page's own scroll", () => {
  assert.equal(
    horizontalWheelScrollDelta({
      scrollWidth: 800,
      clientWidth: 800,
      deltaX: 0,
      deltaY: 40,
    }),
    null,
  );
});

test("an already-horizontal gesture (a trackpad) is left alone", () => {
  assert.equal(
    horizontalWheelScrollDelta({
      scrollWidth: 2000,
      clientWidth: 800,
      deltaX: 40,
      deltaY: 10,
    }),
    null,
  );
});

test("an exactly-diagonal gesture is not redirected (ties favour the page)", () => {
  assert.equal(
    horizontalWheelScrollDelta({
      scrollWidth: 2000,
      clientWidth: 800,
      deltaX: 20,
      deltaY: 20,
    }),
    null,
  );
});

const hoursFromNow = (hours) => new Date(Date.now() + hours * 3600000);

test("a night inside 36 hours reads High confidence", () => {
  assert.equal(
    hourlyForecastConfidence({ start: hoursFromNow(10).toISOString() }),
    "High",
  );
  assert.equal(
    hourlyForecastConfidence({ start: hoursFromNow(36).toISOString() }),
    "High",
  );
});

test("a night between 36 and 96 hours out reads Medium confidence", () => {
  assert.equal(
    hourlyForecastConfidence({ start: hoursFromNow(37).toISOString() }),
    "Medium",
  );
  assert.equal(
    hourlyForecastConfidence({ start: hoursFromNow(96).toISOString() }),
    "Medium",
  );
});

test("a night more than 96 hours out reads Low confidence", () => {
  assert.equal(
    hourlyForecastConfidence({ start: hoursFromNow(97).toISOString() }),
    "Low",
  );
  assert.equal(
    hourlyForecastConfidence({ start: hoursFromNow(240).toISOString() }),
    "Low",
  );
});

test("a night already under way still reads High confidence", () => {
  assert.equal(
    hourlyForecastConfidence({ start: hoursFromNow(-2).toISOString() }),
    "High",
  );
});

test("`now` is an explicit parameter, not a hidden clock read", () => {
  const start = "2026-09-20T22:00:00.000Z";
  const justInside =
    new Date("2026-09-20T22:00:00.000Z").getTime() - 36 * 3600000;
  const justOutside = justInside - 1;
  assert.equal(hourlyForecastConfidence({ start }, justInside), "High");
  assert.equal(hourlyForecastConfidence({ start }, justOutside), "Medium");
});
