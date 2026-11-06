import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  brightZoneCrossing,
  brightZoneScale,
  brightZoneWeight,
} from "../src/bright-zone.js";
import { targetNightPath } from "../src/target-path.js";
import {
  compareTonightScores,
  targetTonightScore,
} from "../src/target-score.js";
import {
  horizonLightBrightSqm,
  horizonLightColor,
  horizonLightDarkSqm,
} from "../src/horizon-light-layer.js";

// The light layer read along the path of a target. The rule
// (`bright-zone.js`); the score that composes it is tested with the score
// (`target-score.js`, below).

// A grid like the service's, every 45° of azimuth and four altitudes, with a
// town glow towards the west and the north-west: the low sky is 19.0 at 315°.
const glowGrid = {
  model: "line-of-sight-v1",
  estimate: true,
  azimuthStepDegrees: 45,
  altitudes: [0, 15, 45, 90],
  sqm: [
    [21.9, 21.9, 21.9, 21.8, 21.6, 21.0, 19.8, 19.0],
    [21.9, 21.9, 21.9, 21.9, 21.8, 21.5, 20.6, 19.9],
    [21.9, 21.9, 21.9, 21.9, 21.9, 21.8, 21.7, 21.6],
    [21.9, 21.9, 21.9, 21.9, 21.9, 21.9, 21.9, 21.9],
  ],
  zenithSqm: 21.9,
};

const uniformGrid = (sqm) => ({
  azimuthStepDegrees: 90,
  altitudes: [0, 90],
  sqm: [
    [sqm, sqm, sqm, sqm],
    [sqm, sqm, sqm, sqm],
  ],
});

const start = Date.parse("2026-10-14T20:00:00.000Z");
// Ten-minute samples from `startMs`, one per entry of `directions`.
const pathOf = (directions, startMs = start) =>
  directions.map(([altitude, azimuth], index) => ({
    time: new Date(startMs + index * 600000).toISOString(),
    altitude,
    azimuth,
  }));
const whole = {
  start: new Date(start).toISOString(),
  end: new Date(start + 24 * 3600000).toISOString(),
};

test("the weight follows the layer's ramp: nothing at 21.6, everything at 18.0", () => {
  // The same two thresholds as the layer, never a copy.
  assert.equal(brightZoneWeight(horizonLightDarkSqm), 0);
  assert.equal(brightZoneWeight(horizonLightBrightSqm), 1);
  for (const dark of [22, 21.9, 21.6]) assert.equal(brightZoneWeight(dark), 0);
  for (const bright of [18, 17.2, 12])
    assert.equal(brightZoneWeight(bright), 1);
  assert.equal(brightZoneWeight(19.8), 0.5);
  for (const unusable of [null, undefined, "19", Number.NaN])
    assert.equal(brightZoneWeight(unusable), 0);
  // Brighter always weighs more, and a sample weighs something exactly when
  // the layer would tint it.
  let previous = 0;
  for (let sqm = 21.55; sqm >= 17.5; sqm -= 0.05) {
    const weight = brightZoneWeight(sqm);
    assert.ok(weight >= previous, `${sqm}`);
    assert.equal(weight > 0, horizonLightColor(sqm) !== null, `${sqm}`);
    previous = weight;
  }
});

test("a path inside a dark sky deducts nothing and reports no zone", () => {
  // Over the east, high: every reading is 21.9.
  const result = brightZoneCrossing({
    path: pathOf([
      [40, 90],
      [50, 100],
      [60, 110],
      [60, 120],
    ]),
    grid: glowGrid,
    window: whole,
  });
  assert.deepEqual(result, {
    available: true,
    worstSqm: null,
    share: 0,
    from: null,
    to: null,
    azimuth: null,
    compass: null,
    deduction: 0,
  });
});

test("a path wholly in the brightest part deducts all the criterion's points, never more", () => {
  const path = pathOf(Array.from({ length: 12 }, () => [35, 200]));
  const bright = uniformGrid(17.2);
  const result = brightZoneCrossing({ path, grid: bright, window: whole });
  assert.equal(result.share, 1);
  assert.equal(result.deduction, brightZoneScale);
  // The criterion gave 9 points for the zenith: the deduction is 9, so the
  // criterion lands on 0 and not below.
  assert.equal(
    brightZoneCrossing({ path, grid: bright, window: whole, points: 9 })
      .deduction,
    9,
  );
  assert.equal(
    brightZoneCrossing({ path, grid: bright, window: whole, points: 0 })
      .deduction,
    0,
  );
  assert.equal(
    brightZoneCrossing({ path, grid: bright, window: whole, points: 3 })
      .deduction,
    3,
  );
});

test("a path crossing the glow for half of its window has a share of about one half", () => {
  // Six samples towards the south-east (dark), six towards 315° at the
  // horizon, where the grid says 19.0 (weight 0.72): about a third of the
  // window's weight; with a grid that is 18.0 on the west half, exactly half.
  const half = {
    azimuthStepDegrees: 90,
    altitudes: [0, 90],
    sqm: [
      [21.9, 21.9, 18, 18],
      [21.9, 21.9, 18, 18],
    ],
  };
  const path = pathOf([
    ...Array.from({ length: 6 }, () => [35, 45]),
    ...Array.from({ length: 6 }, () => [35, 270]),
  ]);
  const result = brightZoneCrossing({ path, grid: half, window: whole });
  assert.equal(result.share, 0.5);
  // round(10 × 0.5) = 5; round(9 × 0.5) = round(4.5) = 5 (half up).
  assert.equal(result.deduction, 5);
  assert.equal(
    brightZoneCrossing({ path, grid: half, window: whole, points: 9 })
      .deduction,
    5,
  );
  const partial = brightZoneCrossing({
    path: pathOf([
      ...Array.from({ length: 6 }, () => [0, 90]),
      ...Array.from({ length: 6 }, () => [0, 315]),
    ]),
    grid: glowGrid,
    window: whole,
  });
  assert.ok(partial.share > 0.3 && partial.share < 0.4, `${partial.share}`);
});

test("from, to, azimuth, compass and worstSqm describe the tinted samples", () => {
  const path = pathOf([
    [50, 120],
    [45, 150],
    [30, 250],
    [20, 295],
    [10, 312],
    [2, 316],
    [1, 330],
    [10, 20],
  ]);
  const result = brightZoneCrossing({ path, grid: glowGrid, window: whole });
  assert.equal(result.available, true);
  assert.equal(result.compass, "NW");
  assert.equal(result.azimuth, 316);
  // 316° at 2°: the bilinear reading near the 315° / 0° columns of the low rows.
  assert.ok(
    result.worstSqm >= 19 && result.worstSqm <= 19.3,
    `${result.worstSqm}`,
  );
  assert.equal(result.worstSqm, Math.round(result.worstSqm * 10) / 10);
  // The first tinted sample is the third (south-west glow, 250°), the last is
  // the seventh (330°, still bright); the last sample, towards the north, is
  // dark again.
  assert.equal(result.from, new Date(start + 2 * 600000).toISOString());
  assert.equal(result.to, new Date(start + 6 * 600000).toISOString());
  assert.ok(result.deduction > 0 && result.deduction <= brightZoneScale);
});

test("without a usable grid nothing is deducted and the crossing is unavailable", () => {
  const path = pathOf([[10, 315]]);
  for (const grid of [null, undefined, {}, { sqm: [] }, "grid"]) {
    const result = brightZoneCrossing({ path, grid, window: whole });
    assert.equal(result.available, false);
    assert.equal(result.deduction, 0);
    assert.equal(result.share, 0);
    assert.equal(result.worstSqm, null);
  }
  assert.equal(brightZoneCrossing().available, false);
  assert.equal(
    brightZoneCrossing({ path: [], grid: glowGrid, window: whole }).available,
    false,
  );
});

test("a sample the grid cannot read is ignored, in the share and in the count", () => {
  const holey = {
    azimuthStepDegrees: 90,
    altitudes: [0, 90],
    sqm: [
      [18, 18, null, null],
      [18, 18, null, null],
    ],
  };
  // Four samples read (the first column), four fall between a cell and a
  // missing one: the share is of the four read, not of the eight.
  const path = pathOf([
    [20, 10],
    [20, 20],
    [20, 30],
    [20, 40],
    [20, 200],
    [20, 220],
    [20, 280],
    [20, 300],
  ]);
  const result = brightZoneCrossing({ path, grid: holey, window: whole });
  assert.equal(result.available, true);
  assert.equal(result.share, 1);
  assert.equal(result.deduction, brightZoneScale);
});

test("only the samples inside the window count, in one window or in several", () => {
  const path = pathOf([
    [30, 90],
    [30, 90],
    [30, 270],
    [30, 270],
    [30, 90],
    [30, 90],
  ]);
  const grid = {
    azimuthStepDegrees: 90,
    altitudes: [0, 90],
    sqm: [
      [21.9, 21.9, 21.9, 18],
      [21.9, 21.9, 21.9, 18],
    ],
  };
  const at = (index) => new Date(start + index * 600000).toISOString();
  // The whole path: two samples of six are bright.
  assert.equal(brightZoneCrossing({ path, grid, window: whole }).share, 0.333);
  // Only the middle: all bright.
  const middle = brightZoneCrossing({
    path,
    grid,
    window: { start: at(2), end: at(3) },
  });
  assert.equal(middle.share, 1);
  assert.equal(middle.from, at(2));
  assert.equal(middle.to, at(3));
  // Two stretches (clear of the mask on either side of a notch), epoch
  // milliseconds accepted: the bright samples are in neither.
  const apart = brightZoneCrossing({
    path,
    grid,
    window: [
      { start: start, end: start + 600000 },
      { start: start + 4 * 600000, end: start + 5 * 600000 },
    ],
  });
  assert.equal(apart.share, 0);
  assert.equal(apart.deduction, 0);
  // A window the path never enters has nothing to read.
  assert.equal(
    brightZoneCrossing({
      path,
      grid,
      window: { start: at(30), end: at(40) },
    }).available,
    false,
  );
});

test("the azimuth wraps through north and the brightest sample wins", () => {
  const north = {
    azimuthStepDegrees: 90,
    altitudes: [0, 90],
    sqm: [
      [19, 21.9, 21.9, 20],
      [19, 21.9, 21.9, 20],
    ],
  };
  const result = brightZoneCrossing({
    path: pathOf([
      [20, 359],
      [20, 360],
      [20, 1],
      [20, -90],
    ]),
    grid: north,
    window: whole,
  });
  assert.equal(result.compass, "N");
  assert.equal(result.azimuth, 0);
  assert.equal(result.worstSqm, 19);
});

// ---- The score that composes the rule (`target-score.js`) ----

const scoreSource = readFileSync(
  new URL("../src/components/PlannerPage.js", import.meta.url),
  "utf8",
);
const tonightSource = readFileSync(
  new URL("../src/components/TonightPage.js", import.meta.url),
  "utf8",
);

// A window of the night, 19:00 to 05:00, and a target that stays in one part
// of the sky at 35 degrees, a sample every ten minutes: all else equal, only
// its azimuth tells two cards apart.
const nightStart = Date.parse("2026-10-14T19:00:00.000Z");
const night = {
  start: new Date(nightStart).toISOString(),
  end: new Date(nightStart + 10 * 3600000).toISOString(),
  moonIllumination: 10,
};
function cardAt(id, azimuth, altitude = 35) {
  const series = Array.from({ length: 61 }, (_, index) => ({
    time: new Date(nightStart + index * 600000).toISOString(),
    altitude,
    azimuth,
  }));
  return { target: { id, designation: id }, series, minAltitude: 10 };
}
function scoreOf(card, extra = {}) {
  return targetTonightScore({
    card,
    window: night,
    moonSeries: [],
    skyQuality: { bortleClass: 3, sqm: 21.4 },
    maskPath: targetNightPath({ series: card.series, minAltitude: 10 }),
    minAltitude: 10,
    ...extra,
  });
}
const skyRow = (score) => score.criteria.find((c) => c.key === "sky-quality");

test("without a grid the score is exactly the zenith's, whatever 'no grid' looks like", () => {
  const card = cardAt("west", 280);
  const reference = scoreOf(card);
  // The zenith alone: some points, on the criterion's own scale.
  assert.ok(skyRow(reference).points > 0);
  assert.ok(skyRow(reference).points <= skyRow(reference).max);
  assert.equal(skyRow(reference).facts.brightZone, null);
  for (const skyDirection of [undefined, null, {}, { sqm: [] }, "grid"])
    assert.deepEqual(scoreOf(card, { skyDirection }), reference);
  // A grid the path never reads (an empty window) changes nothing either.
  assert.deepEqual(
    scoreOf(cardAt("under", 280, -20), { skyDirection: glowGrid }),
    scoreOf(cardAt("under", 280, -20)),
  );
});

test("a target crossing a bright zone pays in the sky quality row, never more than that row", () => {
  const card = cardAt("west", 280, 12);
  const plain = scoreOf(card);
  const crossing = scoreOf(card, { skyDirection: glowGrid });
  const row = skyRow(crossing);
  assert.equal(row.available, true);
  assert.ok(row.points < skyRow(plain).points, `${row.points}`);
  assert.ok(row.points >= 0);
  assert.equal(row.facts.brightZone.compass, "W");
  assert.ok(row.facts.brightZone.worstSqm < horizonLightDarkSqm);
  assert.ok(row.facts.brightZone.share > 0 && row.facts.brightZone.share <= 1);
  assert.ok(row.facts.brightZone.from <= row.facts.brightZone.to);
  assert.equal(
    row.points,
    skyRow(plain).points - row.facts.brightZone.deduction,
  );
  // Nothing else moves: the same six other rows, the same maximum, and the
  // total is the sum of the rows.
  assert.equal(crossing.max, plain.max);
  assert.equal(
    crossing.total,
    crossing.criteria.reduce((sum, c) => sum + (c.available ? c.points : 0), 0),
  );
  assert.equal(
    crossing.total,
    plain.total - (skyRow(plain).points - row.points),
  );
  for (const [index, entry] of crossing.criteria.entries())
    if (entry.key !== "sky-quality")
      assert.deepEqual(entry, plain.criteria[index]);
});

test("the strongest glow takes the whole row and the criterion stops at 0, the maximum stays", () => {
  const score = scoreOf(cardAt("south", 200), {
    skyDirection: uniformGrid(17),
  });
  assert.equal(skyRow(score).points, 0);
  assert.equal(skyRow(score).facts.brightZone.share, 1);
  assert.equal(skyRow(score).max, skyRow(scoreOf(cardAt("south", 200))).max);
  const { max } = scoreOf(cardAt("south", 200));
  assert.equal(score.max, max);
  // The score of a Bortle-class-only place is capped by its own points.
  const bortleOnly = scoreOf(cardAt("south", 200), {
    skyQuality: { bortleClass: 5 },
    skyDirection: uniformGrid(17),
  });
  assert.equal(skyRow(bortleOnly).points, 0);
});

test("a dark sky along the whole path leaves the row and the zone fact untouched", () => {
  const score = scoreOf(cardAt("east", 90), { skyDirection: glowGrid });
  // The same points as the zenith alone, no zone fact.
  assert.equal(
    skyRow(score).points,
    skyRow(scoreOf(cardAt("east", 90))).points,
  );
  assert.equal(skyRow(score).facts.brightZone, null);
});

test("a place without sky quality keeps the criterion unavailable, the grid is not read", () => {
  const score = scoreOf(cardAt("west", 280, 12), {
    skyQuality: null,
    skyDirection: glowGrid,
  });
  assert.equal(skyRow(score).available, false);
  assert.equal(skyRow(score).reason, "no-sky-quality");
  // The maximum falls by the scale of the criterion that left.
  const rated = scoreOf(cardAt("west", 280, 12));
  assert.equal(score.max, rated.max - skyRow(rated).max);
});

test("ranking: two cards identical but for their azimuth rank in the expected order", () => {
  const dark = scoreOf(cardAt("east-target", 90, 12), {
    skyDirection: glowGrid,
  });
  const glowing = scoreOf(cardAt("west-target", 280, 12), {
    skyDirection: glowGrid,
  });
  assert.ok(dark.total > glowing.total);
  assert.ok(compareTonightScores(dark, glowing) < 0, "the dark one first");
  assert.ok(compareTonightScores(glowing, dark) > 0);
  const sorted = [
    { id: "west-target", score: glowing },
    { id: "east-target", score: dark },
  ].sort((a, b) => compareTonightScores(a.score, b.score));
  assert.deepEqual(
    sorted.map((entry) => entry.id),
    ["east-target", "west-target"],
  );
  // Without the grid the two tie: the grid is what orders them.
  assert.equal(
    compareTonightScores(
      scoreOf(cardAt("east-target", 90, 12)),
      scoreOf(cardAt("west-target", 280, 12)),
    ),
    0,
  );
});

test("the layer's switch does not change the score: the ranking asks for the grid on its own", () => {
  // The planner's request for the ranking is its own effect, keyed on the
  // place only, apart from the layer's (`wantsLight`, `layers.lightPollution`).
  const rankingEffect = scoreSource.slice(
    scoreSource.indexOf("setSkyDirection(null);"),
    scoreSource.indexOf("setSkyDirection(null);") + 600,
  );
  assert.match(rankingEffect, /requestPlannerSkyDirection\(/);
  assert.doesNotMatch(rankingEffect, /wantsLight|lightPollution|layers/);
  assert.match(
    scoreSource,
    /skyDirection,\n\s+maskPath: targetNightPath\(\{/,
    "the page passes the grid to targetTonightScore",
  );
  const scoresBlock = scoreSource.slice(
    scoreSource.indexOf("const tonightScores = useMemo"),
    scoreSource.indexOf("const activePlanCards"),
  );
  assert.doesNotMatch(scoresBlock, /lightPollution|layers\./);
  // "À voir ce soir" reads it the same way.
  assert.match(tonightSource, /requestPlannerSkyDirection\(/);
  assert.match(
    tonightSource,
    /skyDirection,\n\s+maskPath: targetNightPath\(\{/,
  );
});
