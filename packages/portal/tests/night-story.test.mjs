import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { forecastHourScore } from "portal/astronomy-forecast.js";
import {
  nightStory,
  nightStoryIdealHiddenShare,
  nightStoryIdealMinimumHours,
  nightStorySteadyGap,
} from "portal/night-story.js";

// The story of the night in
// thirds — the shared fixture (`night-story.json`), the 27
// triplets of the specified table, the thresholds (12 points, two hours,
// 90 %) on a sweep of nights.

const fixture = JSON.parse(
  await readFile(
    new URL("../../astro-contracts/fixtures/night-story.json", import.meta.url),
    "utf8",
  ),
);
const hour = 3600000;
const night = {
  start: "2026-10-14T18:54:00.000Z",
  end: "2026-10-15T04:38:00.000Z",
};
const first = Date.parse("2026-10-14T19:00:00.000Z");
const scored = (scores) =>
  scores.map((score, index) => ({ time: first + index * hour, score }));
const thirds = (a, b, c) => [a, a, a, b, b, b, c, c, c, c];

test("the JS function matches every case of night-story.json", () => {
  assert.ok(fixture.cases.length >= 18);
  for (const entry of fixture.cases)
    assert.deepEqual(nightStory(...entry.args), entry.result, entry.id);
});

test("the fixture holds each of the six reasons and steady, good and mixed shapes", () => {
  const reasons = new Set(fixture.cases.map((entry) => entry.result.reason));
  for (const reason of ["clouds", "rain", "mist", "wind", "dew", "moon"])
    assert.ok(reasons.has(reason), reason);
  const shapes = new Set(fixture.cases.map((entry) => entry.result.shape));
  for (const shape of [
    "steadyGood",
    "steadyMixed",
    "steadyPoor",
    "goodStart",
    "goodEnd",
    "goodEdges",
  ])
    assert.ok(shapes.has(shape), shape);
});

test("the 27 G/M/P triplets fall each in one of the 15 shapes", () => {
  const value = { G: 85, M: 55, P: 20 };
  const seen = new Map();
  for (const a of "GMP")
    for (const b of "GMP")
      for (const c of "GMP") {
        const { shape } = nightStory({
          hours: scored(thirds(value[a], value[b], value[c])),
          night,
        });
        assert.ok(shape, `${a}${b}${c}`);
        seen.set(`${a}${b}${c}`, shape);
      }
  assert.equal(seen.size, 27);
  assert.equal(new Set(seen.values()).size, 15);
  assert.equal(seen.get("GPP"), "goodStart");
  assert.equal(seen.get("PGG"), "goodMiddleEnd");
  assert.equal(seen.get("MPM"), "mixedEdges");
});

test("the thresholds: a gap under 12 is steady, a run of one hour is no slot, 90 % hides it", () => {
  assert.equal(nightStorySteadyGap, 12);
  assert.equal(nightStoryIdealMinimumHours, 2);
  assert.equal(nightStoryIdealHiddenShare, 0.9);
  assert.equal(
    nightStory({ hours: scored(thirds(66, 60, 56)), night }).shape,
    "steadyMixed",
  );
  assert.equal(
    nightStory({ hours: scored(thirds(76, 63, 63)), night }).shape,
    "goodStart",
  );
  assert.equal(
    nightStory({
      hours: scored([30, 30, 30, 70, 30, 30, 30, 30, 30, 30]),
      night,
    }).ideal,
    null,
  );
  assert.deepEqual(
    nightStory({
      hours: scored([30, 30, 30, 70, 70, 30, 30, 30, 30, 30]),
      night,
    }).ideal,
    { start: "2026-10-14T22:00:00.000Z", end: "2026-10-15T00:00:00.000Z" },
  );
  assert.equal(
    nightStory({ hours: scored(Array(10).fill(70)), night }).ideal,
    null,
  );
});

test("a sweep of nights: the ideal slot is always good hours, at least two, and never 90 % of the night", () => {
  // Synthetic nights: clouds rising, falling, a hole, rain, haze, the Moon.
  let checked = 0;
  for (let seed = 0; seed < 400; seed += 1) {
    const hours = Array.from({ length: 10 }, (_, index) => {
      const wave = Math.sin((seed + 1) * (index + 1) * 0.7) * 0.5 + 0.5;
      const row = {
        time: first + index * hour,
        cloud: Math.round(wave * (seed % 5) * 20),
        precipitation: seed % 7 === 0 ? Math.round(wave * 60) : 0,
        visibility: seed % 11 === 0 ? 3000 + wave * 9000 : 20000,
        wind: 8 + (seed % 9) * 4 * wave,
        humidity: 70 + (seed % 4) * 8,
        moonAltitude: seed % 3 === 0 ? index * 6 - 10 : -10,
        moonIllumination: 90,
      };
      return { ...row, score: forecastHourScore(row).score };
    });
    const story = nightStory({ hours, night });
    assert.ok(story.shape, String(seed));
    if (story.shape !== "steadyGood") assert.ok(story.reason, String(seed));
    if (!story.ideal) continue;
    const from = Date.parse(story.ideal.start);
    const to = Date.parse(story.ideal.end);
    const inside = hours.filter((row) => row.time >= from && row.time < to);
    assert.ok(inside.length >= 2, String(seed));
    assert.ok(
      inside.every((row) => row.score >= 64),
      String(seed),
    );
    assert.ok(
      to - from < 0.9 * (Date.parse(night.end) - Date.parse(night.start)),
      String(seed),
    );
    checked += 1;
  }
  assert.ok(checked > 40);
});
