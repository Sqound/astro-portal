import assert from "node:assert/strict";
import test from "node:test";

import { planFrise, planFriseScale } from "planner/plan-frise.js";
import {
  afterMidnightPlan,
  atlanticPlan,
  boardPlan,
  clampedPlan,
  edgeTrendPlan,
  indiaPlan,
  interpolatedPlan,
  item,
  messySeriesPlan,
  nightEnd,
  nightOf,
  nightStart,
  planWith,
  polarPlan,
  series,
  slotOfHundred,
  tokyoPlan,
  wavePlan,
} from "./helpers/plan-frise-cases.mjs";

// The rule of the plan frise written in JavaScript. The worked example is the
// first case. The fixtures `plan-frise.json` and `plan-frise-scale.json` hold
// the same cases.

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`,
  );
const block = (frise, key) => frise.blocks.find((entry) => entry.key === key);
const altitudes = (entry) => entry.curve.map((point) => point.altitude);

test("the worked example: the scale is 18:30 → 05:00 in clock minutes (1110 → 1740)", () => {
  const plan = boardPlan();
  assert.deepEqual(planFriseScale([plan]), {
    startClock: 1110,
    endClock: 1740,
  });
  const { scale } = planFrise(plan);
  assert.equal(scale.startClock, 1110);
  assert.equal(scale.endClock, 1740);
  assert.equal(scale.start, "2026-10-14T18:30:00.000Z");
  assert.equal(scale.end, "2026-10-15T05:00:00.000Z");
});

test("the worked example: the night and the first block sit where the specification draws them", () => {
  const frise = planFrise(boardPlan());
  assert.equal(frise.night.start, "2026-10-14T18:54:00.000Z");
  assert.equal(frise.night.end, "2026-10-15T04:38:00.000Z");
  close(frise.night.x0, 0.0381, 0.00005);
  close(frise.night.x1, 0.9651, 0.00005);
  const m31 = block(frise, "m31");
  close(m31.x0, 0.1254, 0.00005);
  close(m31.x1, 0.3159, 0.00005);
  assert.equal(m31.start, "2026-10-14T19:49:00.000Z");
  assert.equal(m31.end, "2026-10-14T21:49:00.000Z");
});

test("the worked example: the reference heights are 30° and 60° at a third and two thirds", () => {
  const { heights } = planFrise(boardPlan());
  assert.deepEqual(
    heights.map((height) => height.degrees),
    [30, 60],
  );
  close(heights[0].y, 0.3333, 0.00005);
  close(heights[1].y, 0.6667, 0.00005);
});

test("the worked example: ticks at every whole hour from 19 to 04, the even ones labelled, none on the scale's edges", () => {
  const { ticks } = planFrise(boardPlan());
  assert.deepEqual(
    ticks.map((tick) => tick.hour),
    [19, 20, 21, 22, 23, 0, 1, 2, 3, 4],
  );
  assert.deepEqual(
    ticks.filter((tick) => tick.labelled).map((tick) => tick.hour),
    [20, 22, 0, 2, 4],
  );
  // 20:00 is 90 minutes into a 630-minute scale; 05:00 is the scale's end.
  close(ticks[1].at, 90 / 630);
  assert.ok(ticks.every((tick) => tick.at > 0 && tick.at < 1));
});

test("the worked example: the five trends and the whole-degree heights of the sentence", () => {
  const frise = planFrise(boardPlan());
  const read = (key) => {
    const { from, to, trend } = block(frise, key);
    return { from, to, trend };
  };
  assert.deepEqual(read("m31"), { from: 48, to: 68, trend: "rises" });
  assert.deepEqual(read("ngc7000"), { from: 63, to: 42, trend: "falls" });
  // M33 climbs to a peak inside the slot: none, whatever the ends say.
  assert.deepEqual(read("m33"), { from: 75, to: 54, trend: "none" });
  // M45 moves by less than 10°: none.
  assert.deepEqual(read("m45"), { from: 68, to: 61, trend: "none" });
});

test("a curve starts and ends exactly on the slot, inside the scale", () => {
  const m31 = block(planFrise(boardPlan()), "m31");
  assert.equal(m31.curve[0].x, m31.x0);
  assert.equal(m31.curve.at(-1).x, m31.x1);
  close(m31.curve[0].altitude, 48, 0.01);
  close(m31.curve.at(-1).altitude, 68, 0.01);
  // One sample every ten minutes: 12 samples strictly inside a 120-min slot.
  assert.equal(m31.curve.length, 2 + 12);
});

test("a slot that starts before the night widens the scale outward to the half hour", () => {
  const plan = boardPlan();
  // 25 minutes before the night start: 18:29 → 1109 → down to 18:00.
  plan.items.push(item("early", -25, 30));
  assert.deepEqual(planFriseScale([plan]), {
    startClock: 1080,
    endClock: 1740,
  });
  const frise = planFrise(plan);
  close(block(frise, "early").x0, 29 / 660);
  // The start of the night is still where it was, in the wider scale.
  close(frise.night.x0, 54 / 660);
});

test("the end heights are interpolated between the two samples around them", () => {
  const entry = block(planFrise(interpolatedPlan()), "a");
  const heights = altitudes(entry);
  assert.equal(heights.length, 4);
  [15, 20, 30, 35].forEach((expected, index) =>
    close(heights[index], expected),
  );
});

test("a part of the slot under the horizon is drawn at 0°, and nothing goes over the zenith", () => {
  const frise = planFrise(clampedPlan());
  const low = altitudes(block(frise, "low"));
  assert.equal(low[0], 0);
  assert.ok(low.every((altitude) => altitude >= 0));
  close(low.at(-1), 30);
  assert.equal(block(frise, "low").from, 0);
  const high = altitudes(block(frise, "high"));
  assert.ok(high.every((altitude) => altitude <= 90));
  assert.equal(high.at(-1), 90);
});

test("a series that covers a part of the slot gives the curve of that part; none, an empty one or one that ends before the slot gives no curve", () => {
  const partial = block(
    planFrise(
      slotOfHundred(
        series(
          nightStart,
          [
            [0, 20],
            [100, 60],
          ],
          { from: 40, to: 70 },
        ),
      ),
    ),
    "a",
  );
  close(partial.curve[0].altitude, 36);
  close(partial.curve.at(-1).altitude, 48);
  // The block itself spans the whole slot.
  close(partial.x1 - partial.x0, 100 / 630);
  const before = block(
    planFrise(
      slotOfHundred(
        series(
          nightStart,
          [
            [0, 20],
            [400, 60],
          ],
          { from: 200, to: 300 },
        ),
      ),
    ),
    "a",
  );
  assert.equal(before.curve, null);
  for (const given of [null, []]) {
    const bare = block(planFrise(slotOfHundred(given)), "a");
    assert.equal(bare.curve, null);
    assert.equal(bare.from, null);
    assert.equal(bare.to, null);
    assert.equal(bare.trend, "none");
  }
});

test("an item with no slot or a slot of no length is skipped; none left gives null", () => {
  const frise = planFrise(
    planWith([
      { key: "none", label: "No slot" },
      item("flat", 40, 40),
      item("back", 90, 60),
      item("ok", 60, 90),
    ]),
  );
  assert.deepEqual(
    frise.blocks.map((entry) => entry.key),
    ["ok"],
  );
  assert.equal(
    planFrise(
      planWith([{ key: "none", label: "No slot" }, item("flat", 40, 40)]),
    ),
    null,
  );
  assert.equal(planFrise(planWith([])), null);
});

test("an unusable night gives null, and a scale without a night is null", () => {
  const plan = boardPlan();
  assert.equal(planFrise({ ...plan, night: null }), null);
  assert.equal(
    planFrise({ ...plan, night: nightOf(nightEnd, nightStart) }),
    null,
  );
  assert.equal(
    planFrise({ ...plan, night: { start: "soon", end: "later" } }),
    null,
  );
  assert.equal(planFriseScale([]), null);
  assert.equal(planFriseScale([{ ...plan, night: null }]), null);
});

test("a scale over two plans of different dates and offsets is the union in clock minutes", () => {
  const tokyo = tokyoPlan();
  const atlantic = atlanticPlan();
  // Tokyo 1140 → 1710; Atlantic 1095 → 1670: union 1095 → 1710 → 18:00 → 28:30.
  assert.deepEqual(planFriseScale([tokyo]), {
    startClock: 1140,
    endClock: 1710,
  });
  assert.deepEqual(planFriseScale([atlantic]), {
    startClock: 1080,
    endClock: 1680,
  });
  const shared = planFriseScale([tokyo, atlantic]);
  assert.deepEqual(shared, { startClock: 1080, endClock: 1710 });
  // Each plan is drawn on it, at the clock of its own place.
  const frise = planFrise({ ...tokyo, scale: shared });
  close(frise.night.x0, 60 / 630);
  assert.equal(frise.scale.start, "2026-11-03T09:00:00.000Z");
});

test("a night that starts after midnight counts from the noon before it", () => {
  // 01:10 is 1440 + 70 = 1510 → 25:00; 05:40 is 1780 → 30:00.
  assert.deepEqual(planFriseScale([afterMidnightPlan()]), {
    startClock: 1500,
    endClock: 1800,
  });
});

test("a place at +5:30 draws its ticks on whole local hours", () => {
  const plan = indiaPlan();
  assert.deepEqual(planFriseScale([plan]), {
    startClock: 1110,
    endClock: 1710,
  });
  const { ticks } = planFrise(plan);
  assert.equal(ticks[0].hour, 19);
  close(ticks[0].at, 30 / 600);
  assert.equal(ticks.at(-1).hour, 4);
});

test("a 24 h polar night does not throw", () => {
  const frise = planFrise(polarPlan());
  assert.equal(frise.scale.endClock - frise.scale.startClock, 1440);
  assert.ok(frise.ticks.length >= 23 && frise.ticks.length <= 24);
  assert.ok(block(frise, "a").curve);
});

test("reference heights other than 30° and 60° are honoured", () => {
  const { heights } = planFrise(boardPlan({ heights: [45] }));
  assert.equal(heights.length, 1);
  assert.equal(heights[0].degrees, 45);
  close(heights[0].y, 0.5, 1e-12);
  assert.deepEqual(planFrise(boardPlan({ heights: [] })).heights, []);
});

test("a given scale replaces the plan's own", () => {
  const frise = planFrise(
    boardPlan({ scale: { startClock: 1080, endClock: 1740 } }),
  );
  close(frise.night.x0, 54 / 660);
  assert.equal(frise.scale.start, "2026-10-14T18:00:00.000Z");
  // A scale that is not a window gives nothing.
  assert.equal(
    planFrise(boardPlan({ scale: { startClock: 1740, endClock: 1740 } })),
    null,
  );
});

test("a rising target that dips on the way has no trend", () => {
  const entry = block(planFrise(wavePlan()), "wave");
  assert.equal(entry.from, 20);
  assert.equal(entry.to, 70);
  assert.equal(entry.trend, "none");
});

test("a change of exactly 10° and a stall on the way keep the trend; 9° is none", () => {
  const frise = planFrise(edgeTrendPlan());
  assert.equal(block(frise, "ten").trend, "rises");
  assert.equal(block(frise, "plateau").trend, "rises");
  assert.equal(block(frise, "nine").trend, "none");
});

test("samples out of order are sorted and the unusable ones ignored", () => {
  const entry = block(planFrise(messySeriesPlan()), "a");
  assert.equal(entry.from, 20);
  assert.equal(entry.to, 50);
  assert.equal(entry.trend, "rises");
  assert.equal(entry.curve.length, 7);
  const xs = entry.curve.map((point) => point.x);
  assert.deepEqual(
    xs,
    [...xs].sort((left, right) => left - right),
  );
});

test("a plan counts in the scale with a usable night even without a block, and a block widens it", () => {
  const night = nightOf();
  assert.deepEqual(planFriseScale([{ night, utcOffsetMinutes: 0 }]), {
    startClock: 1110,
    endClock: 1740,
  });
  // A custom span: a block lying in the twilight, after the dawn.
  const late = planWith([item("late", 560, 640)]);
  assert.deepEqual(planFriseScale([late]), {
    startClock: 1110,
    endClock: 1800,
  });
});
