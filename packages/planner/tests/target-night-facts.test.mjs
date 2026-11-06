import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { planNight } from "../src/planner.js";
import { withHorizonMask } from "../src/recommendations.js";
import {
  targetIsSolarSystem,
  targetNightFacts,
  targetNightFactsAndSamples,
  visibleThatNight,
} from "../src/target-night-facts.js";
import {
  seasonDefaultMinimumMinutes,
  seasonWindow,
  targetSeason,
  targetSeasonNights,
} from "../src/season-window.js";

// The night of one target and the targets high that night, the season of one
// target without a plan. The fixtures `target-night-facts` and
// `visible-that-night` pin the numbers; these tests pin the rules.

const fixture = async (name) =>
  JSON.parse(
    await readFile(
      new URL(`../../astro-contracts/fixtures/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
const night = await fixture("target-night-facts");
const visible = await fixture("visible-that-night");
const input = (id) => night.cases.find((entry) => entry.id === id).args[0];

test("the samples of the night come with the facts, the very ones the series is made of (the movement over the mask reads them)", () => {
  const args = input("western-mask-cuts-the-window");
  const both = targetNightFactsAndSamples(args);
  assert.deepEqual(both.facts, targetNightFacts(args));
  assert.equal(both.samples.length, both.facts.series.length);
  both.samples.forEach((sample, index) => {
    assert.equal(sample.time, both.facts.series[index].time);
    assert.equal(sample.altitude, both.facts.series[index].altitude);
    assert.equal(sample.azimuth, both.facts.series[index].azimuth);
    assert.equal(typeof sample.moonSeparation, "number");
  });
  assert.equal(targetNightFactsAndSamples({}), null);
});

test("a target's night: ten-minute samples with their state, the best window and the culmination", () => {
  const facts = targetNightFacts(input("western-mask-cuts-the-window"));
  assert.equal(facts.series[0].time, facts.night.from);
  assert.equal(facts.series.at(-1).time, facts.night.to);
  assert.deepEqual(
    [...new Set(facts.series.map((point) => point.state))].sort(),
    ["above", "masked"],
  );
  const highest = Math.max(...facts.series.map((point) => point.altitude));
  assert.equal(facts.culmination.altitude, highest);
  assert.ok(facts.bestWindow.from >= facts.night.from);
  assert.ok(facts.bestWindow.to <= facts.night.to);
  assert.equal(facts.noWindow, null);
  assert.equal(targetNightFacts({}), null);
});

test("the best window is the one « À voir ce soir » writes for the same target, place and date", () => {
  for (const { id, args } of night.cases) {
    const [{ target, place, date, constraints = {}, darkness }] = args;
    const facts = targetNightFacts(args[0]);
    if (!facts) continue;
    const minAltitude = constraints.minAltitude ?? 30;
    const moonSeparationMinimum = constraints.moonSeparationMinimum ?? 25;
    const geometry = planNight({
      date,
      location: place,
      targets: [
        { id: "night", source: "night", coordinate: target.coordinate },
      ],
      profile: {},
      planetReferences: { planets: [] },
      minAltitude,
      moonSeparationMinimum,
      retainedTargetIds: ["night"],
      darkness,
    });
    const [card] = withHorizonMask(
      geometry.cards,
      place.horizonMask,
      minAltitude,
      moonSeparationMinimum,
    );
    const windows = card?.visibilityWindows ?? [];
    const longest = windows.reduce(
      (best, window) =>
        Date.parse(window.end) - Date.parse(window.start) >
        Date.parse(best.end) - Date.parse(best.start)
          ? window
          : best,
      windows[0],
    );
    assert.deepEqual(
      facts.bestWindow,
      longest ? { from: longest.start, to: longest.end } : null,
      id,
    );
  }
});

test("a target that never clears the threshold says why; the Moon alone is no reason", () => {
  assert.equal(
    targetNightFacts(input("never-reaches-thirty")).noWindow,
    "below-minimum",
  );
  assert.equal(
    targetNightFacts(input("hidden-by-the-mask-all-night")).noWindow,
    "masked",
  );
  const moonOnly = targetNightFacts({
    ...input("culminates-high-in-the-evening"),
    constraints: { moonSeparationMinimum: 180 },
  });
  assert.equal(moonOnly.bestWindow, null);
  assert.equal(moonOnly.noWindow, null);
  assert.ok(moonOnly.series.some((point) => point.state === "above"));
});

test("a body of the Solar System is judged from the coordinate of the day; the Sun and the Moon have no season", () => {
  const planet = input("planet-from-the-coordinate-of-the-day");
  assert.equal(targetIsSolarSystem(planet.target), true);
  assert.equal(targetIsSolarSystem({ id: "m31", coordinate: {} }), false);
  assert.ok(targetNightFacts(planet).series.length > 0);
  for (const id of ["solar-system-sun", "solar-system-moon"])
    assert.equal(
      targetSeason({
        target: { ...planet.target, id },
        place: planet.place,
        from: "2026-10-14",
      }),
      null,
    );
});

test("the targets high that night, the highest first, from the exact samples", () => {
  const cases = Object.fromEntries(
    visible.cases.map((entry) => [entry.id, entry.args[0]]),
  );
  const high = visibleThatNight(cases["the-highest-first"]);
  const heights = high.map((entry) => entry.maxAltitude);
  assert.deepEqual(
    heights,
    [...heights].sort((a, b) => b - a),
  );
  assert.ok(high.every((entry) => entry.maxAltitude >= 30));
  assert.ok(!high.some((entry) => entry.targetId === "ngc5139"));
  // Without a mask, the highest sample above the minimum is the night's own.
  const m31 = high.find((entry) => entry.targetId === "m31");
  const own = targetNightFacts({
    target: { coordinate: { ra: 0.7123 * 15, dec: 41.2688 } },
    place: cases["the-highest-first"].place,
    date: cases["the-highest-first"].date,
  });
  assert.equal(m31.maxAltitude, own.culmination.altitude);
  assert.equal(m31.at, own.culmination.time);
  // A high mask keeps only what clears it, sample by sample.
  const masked = visibleThatNight(cases["a-high-mask-keeps-the-highest"]);
  assert.ok(masked.length < high.length);
  assert.ok(masked.every((entry) => entry.maxAltitude >= 70));
  // The session's hours, the limit and the minimum are honoured.
  const hours = cases["only-the-session-hours"];
  for (const entry of visibleThatNight(hours)) {
    assert.ok(entry.at >= hours.from && entry.at <= hours.to);
  }
  assert.equal(
    visibleThatNight(cases["three-at-most-and-a-higher-minimum"]).length,
    3,
  );
  assert.deepEqual(visibleThatNight(cases["place-without-coordinates"]), []);
});

test("the whole offline index is judged in the order of a tenth of a second, not a minute", () => {
  const rows = Array.from({ length: 14400 }, (_, index) => ({
    id: `row-${index}`,
    ra: (index * 7.13) % 24,
    dec: ((index * 13.7) % 180) - 90,
  }));
  const started = performance.now();
  const result = visibleThatNight({
    targets: rows,
    place: input("culminates-high-in-the-evening").place,
    date: "2026-10-14",
  });
  const elapsed = performance.now() - started;
  assert.equal(result.length, 20);
  // An order-of-magnitude bound only; the measure goes to the report.
  assert.ok(elapsed < 5000, `${elapsed} ms`);
});

test("the season of one target without a plan takes the planner's defaults and reads no capability", async () => {
  const { target, place } = input("western-mask-cuts-the-window");
  const own = targetSeason({ target, place, from: "2026-10-14" });
  assert.deepEqual(
    own,
    seasonWindow({
      target,
      place,
      from: "2026-10-14",
      nights: targetSeasonNights,
      minimumMinutes: seasonDefaultMinimumMinutes,
    }),
  );
  assert.equal(own.nights.length, 120);
  assert.equal(targetSeason({ target, place }), null);
  for (const file of [
    "season-window.js",
    "target-night-facts.js",
    "project-night.js",
  ]) {
    const source = await readFile(
      new URL(`../src/${file}`, import.meta.url),
      "utf8",
    );
    for (const [, specifier] of source.matchAll(/from "([^"]+)"/g))
      assert.doesNotMatch(
        specifier,
        new RegExp("capabilit|entitlement", "i"),
        file,
      );
  }
});
