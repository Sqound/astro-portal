import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { moonHorizontalTrack } from "../src/planner.js";
import { factsNight } from "../src/target-facts-model.js";
import { targetNightFactsAndSamples } from "../src/target-night-facts.js";
import { targetNightMoon } from "../src/target-night-moon.js";
import { targetNightPath, targetPathKeyHours } from "../src/target-path.js";
import {
  targetPathDrawing,
  targetPathTickLabels,
  tickLabelSize,
} from "../src/target-path-summary.js";
import { targetScoreSentence } from "../src/target-score-sheet.js";
import { clock } from "../src/wind-section.js";

// The target's night on the polar map of "Statistiques de la cible" — the
// whole night, an hour mark on every full hour, the Moon's track and its two
// extreme separations, one culmination everywhere.

const fixture = JSON.parse(
  await readFile(
    new URL(
      "../../astro-contracts/fixtures/target-night-facts.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const args = fixture.cases.find(
  (entry) => entry.id === "western-mask-cuts-the-window",
).args[0];
const night = targetNightFactsAndSamples(args);
const zone = args.place.timeZone;

test("the Moon's track comes with the night's samples, at the same instants", () => {
  assert.equal(night.moon.length, night.samples.length);
  night.moon.forEach((point, index) => {
    assert.equal(point.time, night.samples[index].time);
    assert.ok(Number.isFinite(point.altitude));
    assert.ok(point.azimuth >= 0 && point.azimuth < 360);
  });
  assert.deepEqual(
    moonHorizontalTrack({ location: args.place, times: ["not a date"] }),
    [],
  );
});

test("the path covers the whole night: its first and last points are the night's bounds", () => {
  const path = targetNightPath({ series: night.samples });
  assert.equal(path.start, night.facts.night.from);
  assert.equal(path.end, night.facts.night.to);
  assert.equal(path.segments[0].start, night.facts.night.from);
  assert.equal(path.segments.at(-1).end, night.facts.night.to);
});

test("the Moon: its two extreme separations while it and the target are up, its track above the horizon only", () => {
  const moon = targetNightMoon({ series: night.samples, track: night.moon });
  const both = night.samples.filter(
    (sample, index) => night.moon[index].altitude > 0 && sample.altitude > 0,
  );
  if (both.length) {
    const values = both.map((sample) => sample.moonSeparation);
    assert.equal(moon.separation.min, Math.floor(Math.min(...values) + 0.5));
    assert.equal(moon.separation.max, Math.floor(Math.max(...values) + 0.5));
  } else assert.equal(moon.separation, null);
  for (const run of moon.runs)
    for (const point of run) assert.ok(point.altitude >= 0);

  // A Moon down all night: no figure, no track.
  const down = night.moon.map((point) => ({ ...point, altitude: -20 }));
  assert.deepEqual(targetNightMoon({ series: night.samples, track: down }), {
    separation: null,
    runs: [],
  });
  // A Moon that rises mid-night: one run, cut at the horizon.
  const rising = night.moon.map((point, index) => ({
    ...point,
    altitude: index - 10.5,
  }));
  const rises = targetNightMoon({ series: night.samples, track: rising });
  assert.equal(rises.runs.length, 1);
  assert.equal(rises.runs[0][0].altitude, 0);
  assert.ok(
    Date.parse(rises.runs[0][0].time) > Date.parse(rising[10].time) &&
      Date.parse(rises.runs[0][0].time) < Date.parse(rising[11].time),
  );
  // Equal extremes: the same figure twice.
  const flat = night.samples.map((sample) => ({
    ...sample,
    moonSeparation: 90,
  }));
  const up = night.moon.map((point) => ({ ...point, altitude: 30 }));
  assert.deepEqual(
    targetNightMoon({ series: flat, track: up }).separation,
    flat.some((sample) => sample.altitude > 0) ? { min: 90, max: 90 } : null,
  );
});

// A hand-made path: a visible stretch from hour `from`, the culmination at
// `peak`, the end at `to` (hours after 2026-10-14T00:00Z), a full hour tick
// each hour.
const at = (hour) => new Date(Date.UTC(2026, 9, 14, hour)).toISOString();
function madePath({ from, peak, to }) {
  const point = (hour, altitude) => ({
    time: at(hour),
    altitude,
    azimuth: 90 + hour * 5,
  });
  return {
    start: at(from),
    end: at(to),
    maskEnabled: false,
    segments: [
      {
        state: "visible",
        start: at(from),
        end: at(to),
        points: [point(from, 0), point(peak, 70), point(to, 20)],
      },
    ],
    culmination: { ...point(peak, 70), masked: false },
    hourTicks: Array.from({ length: to - from + 1 }, (_, index) =>
      point(from + index, 10 + index),
    ),
  };
}
const hoursOf = (path) =>
  targetPathKeyHours(path).hours.map((tick) => tick.time);

test("key hours: one full hour in the middle of each stretch of 3 h or more, the nearest full hour to the middle", () => {
  const keys = targetPathKeyHours(madePath({ from: 18, peak: 23, to: 29 }));
  assert.equal(keys.horizon.time, at(18));
  // 18:00 → 23:00, the middle 20:30 (the earlier hour on a tie); 23:00 →
  // 05:00, the middle 02:00.
  assert.deepEqual(
    keys.hours.map((tick) => tick.time),
    [at(20), at(26)],
  );
  // 18:20 → 22:00, the middle 20:10 → 20:00; 22:00 → 02:00, the middle 00:00.
  const odd = madePath({ from: 18, peak: 22, to: 26 });
  odd.segments[0].points[0].time = "2026-10-14T18:20:00.000Z";
  assert.deepEqual(hoursOf(odd), [at(20), at(24)]);
});

test("key hours: none for stretches under 3 h, one for a stretch of exactly 3 h", () => {
  assert.deepEqual(hoursOf(madePath({ from: 20, peak: 22, to: 24 })), []);
  assert.deepEqual(hoursOf(madePath({ from: 20, peak: 23, to: 24 })), [at(21)]);
  assert.deepEqual(hoursOf(madePath({ from: 20, peak: 21, to: 24 })), [at(22)]);
  // A target that never rises above the horizon: nothing.
  assert.deepEqual(targetPathKeyHours({ segments: [] }), {
    horizon: null,
    hours: [],
  });
});

test("the horizon hour is written once: on its own without a mask, by the mask crossing when it falls at that very instant", () => {
  const plain = targetPathDrawing(madePath({ from: 18, peak: 23, to: 29 }));
  assert.equal(plain.horizon.time, at(18));
  assert.equal(plain.ticks.length, 2);
  const masked = {
    ...madePath({ from: 18, peak: 23, to: 29 }),
    maskEnabled: true,
    clearsMaskAt: [at(18)],
    backBehindMaskAt: [],
  };
  const drawing = targetPathDrawing(masked);
  assert.equal(drawing.horizon, null);
  assert.equal(drawing.crossings.length, 1);
});

test("the drawing writes three hours always (horizon, culmination, end) and no longer a mark on every full hour", () => {
  const path = targetNightPath({
    series: night.samples,
    tickOffsetMinutes: 0,
  });
  const drawing = targetPathDrawing(path, {
    moon: targetNightMoon({ series: night.samples, track: night.moon }),
  });
  assert.ok(drawing.horizon || drawing.crossings.length, "the horizon hour");
  assert.ok(drawing.culmination, "the culmination");
  assert.ok(drawing.end, "the end");
  const hourly = path.hourTicks.filter((tick) => tick.altitude >= 0).length;
  assert.ok(drawing.ticks.length <= 2);
  assert.ok(drawing.ticks.length < hourly);
  for (const tick of drawing.ticks) {
    assert.equal(new Date(tick.time).getUTCMinutes(), 0);
    assert.equal(Math.hypot(tick.dx, tick.dy).toFixed(1), "1.0");
  }
  // The Moon's track is drawn only when it is up.
  assert.equal(
    targetPathDrawing(path, {
      moon: { separation: null, runs: [] },
    }).moon,
    null,
  );
});

test("the intermediate hour labels are whole or absent, never over another label, a marker or the path", () => {
  const path = targetNightPath({ series: night.samples });
  const drawing = targetPathDrawing(path, {
    moon: targetNightMoon({ series: night.samples, track: night.moon }),
  });
  const words = {
    time: (instant) => clock(instant, "fr", zone),
    end: (instant) => `Fin ${clock(instant, "fr", zone)}`,
    zenith: "Zénith",
  };
  const ticks = targetPathTickLabels(drawing, words);
  assert.equal(ticks.length, drawing.ticks.length);
  const labelled = ticks.filter((tick) => tick.label);
  const width = (label) => label.text.length * tickLabelSize * 0.62;
  const box = ({ label }) => ({
    left: label.x - width(label) / 2,
    right: label.x + width(label) / 2,
    top: label.y - tickLabelSize * 0.82,
    bottom: label.y + tickLabelSize * 0.28,
  });
  labelled.forEach((tick) => {
    const rect = box(tick);
    assert.ok(rect.left >= -14 && rect.right <= 214, "inside the plot");
    assert.ok(rect.top >= -14 && rect.bottom <= 214, "inside the plot");
    assert.match(tick.label.text, /^\d{2}:00$/);
    for (const point of drawing.vertices)
      assert.ok(
        !(
          point.x >= rect.left &&
          point.x <= rect.right &&
          point.y >= rect.top &&
          point.y <= rect.bottom
        ),
        "no label sits on the path",
      );
  });
  for (let i = 0; i < labelled.length; i += 1)
    for (let j = i + 1; j < labelled.length; j += 1) {
      const a = box(labelled[i]);
      const b = box(labelled[j]);
      assert.ok(
        a.right <= b.left ||
          b.right <= a.left ||
          a.bottom <= b.top ||
          b.bottom <= a.top,
        "two hour labels never overlap",
      );
    }
});

test("one culmination everywhere: « Cette nuit » writes the path's interpolated one, as the polar map does", () => {
  const card = {
    target: {
      id: "m31",
      designation: "M31",
      coordinate: args.target.coordinate,
    },
  };
  const context = {
    place: args.place,
    date: args.date,
    constraints: { minAltitude: 30 },
  };
  const night = factsNight({ card, context, locale: "fr" });
  assert.equal(night.state, "ready");
  const { culmination } = night.path;
  const text = night.culminates;
  assert.ok(text.includes(clock(culmination.time, "fr", zone)));
  assert.ok(text.includes(String(Math.round(culmination.altitude))));
  assert.ok(night.moon && Array.isArray(night.moon.runs));
  // The hour marks fall on the place's full hours.
  for (const tick of night.path.hourTicks)
    assert.match(clock(tick.time, "fr", zone), /^\d{2}:00$/);
});

test("the note's Moon sentence carries the line's two figures, « 120°–168° », and no angle when the Moon is down", () => {
  const criterion = {
    key: "moon",
    available: true,
    facts: {
      illumination: 62,
      separation: 124,
      targetName: "M38",
      state: "up",
      narrowbandFilter: null,
    },
  };
  const own = targetScoreSentence(criterion, { locale: "fr", timeZone: zone });
  assert.ok(own.includes("124°"));
  const range = targetScoreSentence(criterion, {
    locale: "fr",
    timeZone: zone,
    moonSeparation: { min: 120, max: 168 },
  });
  assert.ok(range.includes("120°–168°"), range);
  assert.ok(!range.includes("124"));
  const single = targetScoreSentence(criterion, {
    locale: "fr",
    timeZone: zone,
    moonSeparation: { min: 131, max: 131 },
  });
  assert.ok(single.includes("131°") && !single.includes("–"));
  const down = targetScoreSentence(criterion, {
    locale: "fr",
    timeZone: zone,
    moonSeparation: null,
  });
  assert.ok(!/\d+°/.test(down), down);
});
