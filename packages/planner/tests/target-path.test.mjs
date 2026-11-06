import assert from "node:assert/strict";
import test from "node:test";
import { targetNightPath } from "../src/target-path.js";

// The one computation behind a target's movement summary, the horizon map's
// path mode and the augmented-reality view. The fixture `target-night-path`
// holds it to fixed answers.

const start = Date.parse("2026-11-14T18:00:00Z");
const step = 10 * 60000;

function at(index) {
  return new Date(start + index * step).toISOString();
}

/** A series of `count` samples ten minutes apart, from two functions of the sample index. */
function series(count, altitude, azimuth, moonSeparation = () => 90) {
  return Array.from({ length: count }, (_, index) => ({
    time: at(index),
    altitude: altitude(index),
    azimuth: azimuth(index),
    moonSeparation: moonSeparation(index),
  }));
}

function flatMask(altitude, overrides = {}) {
  return {
    enabled: true,
    points: Array.from({ length: 12 }, (_, index) => ({
      azimuth: index * 30,
      altitude: overrides[index * 30] ?? altitude,
    })),
  };
}

const states = (path) => path.segments.map((segment) => segment.state);

test("an empty series gives an empty path, never a crash", () => {
  const path = targetNightPath({ series: [], mask: flatMask(10) });
  assert.deepEqual(path, {
    start: null,
    end: null,
    maskEnabled: true,
    segments: [],
    clearsMaskAt: [],
    backBehindMaskAt: [],
    culmination: null,
    bestWindow: null,
    hourTicks: [],
    moonSeparationAtCulmination: null,
    noWindowReason: null,
  });
  assert.deepEqual(targetNightPath().segments, []);
});

test("a rising target passes through every state, in order, with interpolated boundaries", () => {
  // −10° then +5° a sample; mask 15°, minimum 30°.
  const path = targetNightPath({
    series: series(
      10,
      (index) => -10 + 5 * index,
      () => 90,
    ),
    mask: flatMask(15),
    minAltitude: 30,
  });
  assert.deepEqual(states(path), [
    "below-horizon",
    "masked",
    "below-minimum",
    "visible",
  ]);
  // 0° is reached at sample 2 exactly, 15° at 5, 30° at 8.
  assert.equal(path.segments[1].start, at(2));
  assert.equal(path.segments[2].start, at(5));
  assert.equal(path.segments[3].start, at(8));
  assert.equal(path.segments[3].end, at(9));
  assert.deepEqual(path.clearsMaskAt, [at(5)]);
  assert.deepEqual(path.backBehindMaskAt, []);
});

test("a crossing between two samples is placed by linear interpolation of the margin to the mask", () => {
  // 10° → 22° across a 15° mask: 5/12 of the way, 250 s after the first sample.
  const path = targetNightPath({
    series: series(
      2,
      (index) => (index ? 22 : 10),
      () => 180,
    ),
    mask: flatMask(15),
  });
  const crossing = new Date(start + 250000).toISOString();
  assert.deepEqual(path.clearsMaskAt, [crossing]);
  assert.deepEqual(states(path), ["masked", "visible"]);
  const boundary = path.segments[1].points[0];
  assert.equal(boundary.time, crossing);
  assert.equal(boundary.altitude, 15);
  assert.equal(path.segments[0].points.at(-1).time, crossing);
});

test("a notch in the mask gives several crossings, in order", () => {
  // A target at 20° sweeping the south: the mask is 30° except a notch at 180°.
  const path = targetNightPath({
    series: series(
      13,
      () => 20,
      (index) => 120 + index * 10,
    ),
    mask: flatMask(30, { 180: 5 }),
  });
  assert.deepEqual(states(path), ["masked", "visible", "masked"]);
  assert.equal(path.clearsMaskAt.length, 1);
  assert.equal(path.backBehindMaskAt.length, 1);
  assert.ok(path.clearsMaskAt[0] < path.backBehindMaskAt[0]);
  // The mask falls from 30° at 150° to 5° at 180°: 20° is met a fifth of the
  // way down, at 162°, i.e. sample 4.2.
  assert.equal(
    path.clearsMaskAt[0],
    new Date(start + 4.2 * step).toISOString(),
  );
});

test("setting behind the mask then reappearing in a notch gives two clearings and two returns", () => {
  const path = targetNightPath({
    series: series(
      19,
      () => 20,
      (index) => 60 + index * 10,
    ),
    mask: flatMask(30, { 90: 5, 210: 5 }),
  });
  assert.equal(path.clearsMaskAt.length, 2);
  assert.equal(path.backBehindMaskAt.length, 2);
  const events = [
    ...path.clearsMaskAt.map((time) => [time, "clears"]),
    ...path.backBehindMaskAt.map((time) => [time, "back"]),
  ].sort(([left], [right]) => left.localeCompare(right));
  assert.deepEqual(
    events.map(([, kind]) => kind),
    ["clears", "back", "clears", "back"],
  );
});

test("the culmination is refined by a parabola through the highest sample and its neighbours", () => {
  // Samples of 60 − (i − 3.4)²: the true top is at sample 3.4, 60°.
  const path = targetNightPath({
    series: series(
      7,
      (index) => 60 - (index - 3.4) ** 2,
      (index) => 150 + index * 10,
    ),
  });
  assert.equal(
    path.culmination.time,
    new Date(start + 3.4 * step).toISOString(),
  );
  assert.ok(Math.abs(path.culmination.altitude - 60) < 1e-9);
  assert.ok(Math.abs(path.culmination.azimuth - 184) < 1e-9);
  assert.equal(path.culmination.masked, false);
});

test("a culmination at the edge of the night is the edge sample, unrefined", () => {
  const path = targetNightPath({
    series: series(
      4,
      (index) => 50 - index * 5,
      () => 350,
    ),
  });
  assert.deepEqual(path.culmination, {
    time: at(0),
    altitude: 50,
    azimuth: 350,
    masked: false,
  });
});

test("a culmination behind the mask is flagged masked", () => {
  const path = targetNightPath({
    series: series(
      5,
      (index) => 20 - Math.abs(index - 2) * 3,
      () => 0,
    ),
    mask: flatMask(25),
    minAltitude: 10,
  });
  assert.equal(path.culmination.masked, true);
  assert.equal(path.bestWindow, null);
  assert.equal(path.noWindowReason, "masked");
});

test("the best window is the one holding the culmination, else the longest, else none", () => {
  // Two windows, cut by a mask at 90°–120°: the first short and highest.
  const holding = targetNightPath({
    series: series(
      12,
      (index) => (index < 3 ? 60 : 40),
      (index) => 60 + index * 10,
    ),
    mask: flatMask(0, { 90: 50, 120: 50 }),
    minAltitude: 30,
  });
  assert.equal(holding.segments.filter((s) => s.state === "visible").length, 2);
  assert.ok(holding.bestWindow.start <= holding.culmination.time);
  assert.ok(holding.culmination.time <= holding.bestWindow.end);
  assert.equal(holding.bestWindow.start, at(0));

  // The culmination behind the mask: the longest window wins.
  const longest = targetNightPath({
    series: series(
      14,
      (index) => (index === 4 ? 70 : 40),
      (index) => 50 + index * 10,
    ),
    mask: flatMask(0, { 90: 80, 120: 80 }),
    minAltitude: 30,
  });
  assert.equal(longest.culmination.masked, true);
  assert.equal(longest.bestWindow.end, at(13));
  assert.equal(longest.bestWindow.exitReason, null);
});

test("a target that never clears the minimum altitude has no window and says so", () => {
  const path = targetNightPath({
    series: series(
      6,
      (index) => 10 + index,
      () => 200,
    ),
    mask: flatMask(5),
    minAltitude: 30,
  });
  assert.deepEqual(states(path), ["below-minimum"]);
  assert.equal(path.bestWindow, null);
  assert.equal(path.noWindowReason, "below-minimum");
});

test("a target under the horizon all night is below-horizon and has no window", () => {
  const path = targetNightPath({
    series: series(
      4,
      () => -5,
      () => 10,
    ),
    minAltitude: 30,
  });
  assert.deepEqual(states(path), ["below-horizon"]);
  assert.equal(path.noWindowReason, "below-horizon");
});

test("a clear sky closed by the Moon gives the Moon as the reason", () => {
  const path = targetNightPath({
    series: series(
      4,
      () => 50,
      () => 10,
      () => 10,
    ),
    minAltitude: 30,
    moonSeparationMinimum: 25,
  });
  assert.deepEqual(states(path), ["visible"]);
  assert.equal(path.bestWindow, null);
  assert.equal(path.noWindowReason, "moon");
});

test("without a mask, nothing is masked and no mask crossing is reported", () => {
  const path = targetNightPath({
    series: series(
      8,
      (index) => -10 + index * 10,
      () => 90,
    ),
    mask: { ...flatMask(20), enabled: false },
  });
  assert.equal(path.maskEnabled, false);
  assert.deepEqual(states(path), ["below-horizon", "visible"]);
  assert.deepEqual(path.clearsMaskAt, []);
  assert.deepEqual(path.backBehindMaskAt, []);
});

test("hour ticks fall on the full hours of the night, shifted by the place's offset", () => {
  const input = series(
    19,
    (index) => index * 2,
    () => 100,
  );
  const utc = targetNightPath({ series: input });
  assert.deepEqual(
    utc.hourTicks.map((tick) => tick.time),
    [at(0), at(6), at(12), at(18)],
  );
  assert.equal(utc.hourTicks[1].altitude, 12);
  // A place half an hour ahead of UTC sees its full hours at hh:30 UTC.
  const shifted = targetNightPath({ series: input, tickOffsetMinutes: 30 });
  assert.deepEqual(
    shifted.hourTicks.map((tick) => tick.time),
    [at(3), at(9), at(15)],
  );
});

test("a night across midnight UTC keeps its ticks and wraps its azimuth the short way", () => {
  const night = Array.from({ length: 13 }, (_, index) => ({
    time: new Date(
      Date.parse("2026-11-14T23:00:00Z") + index * step,
    ).toISOString(),
    altitude: 40,
    azimuth: (340 + index * 5) % 360,
  }));
  const path = targetNightPath({ series: night });
  assert.deepEqual(
    path.hourTicks.map((tick) => tick.time),
    [
      "2026-11-14T23:00:00.000Z",
      "2026-11-15T00:00:00.000Z",
      "2026-11-15T01:00:00.000Z",
    ],
  );
  assert.equal(path.hourTicks[1].azimuth, 10);
  const between = targetNightPath({
    series: [
      { time: at(0), altitude: 10, azimuth: 350 },
      { time: at(1), altitude: 30, azimuth: 10 },
    ],
    mask: flatMask(20),
  });
  assert.equal(between.segments[1].points[0].azimuth, 0);
});

test("the Moon's separation at the culmination is rounded to the degree, from moonSeries when given", () => {
  const input = series(
    5,
    (index) => 40 - Math.abs(index - 2) * 5,
    () => 180,
    (index) => 100 + index * 3.3,
  );
  assert.equal(
    targetNightPath({ series: input }).moonSeparationAtCulmination,
    107,
  );
  assert.equal(
    targetNightPath({
      series: input,
      moonSeries: [
        { time: at(0), moonSeparation: 20 },
        { time: at(4), moonSeparation: 40 },
      ],
    }).moonSeparationAtCulmination,
    30,
  );
  const without = series(
    3,
    () => 40,
    () => 0,
  ).map(({ moonSeparation, ...point }) => point);
  assert.equal(
    targetNightPath({ series: without }).moonSeparationAtCulmination,
    null,
  );
});
