// The "Placement" of the suggested
// targets — "Idéal" (the cascade of today) and "Rapproché" (one after the
// other from the first slot; the best-ranked visible target
// at each step, never more than 10 min of wait).
import assert from "node:assert/strict";
import test from "node:test";
import { autoFillNight } from "../src/auto-fill.js";
import { suggestNight } from "../src/suggest-night.js";
import { targetSlotScore } from "../src/target-score.js";
import { autoFillItemReason } from "../src/auto-fill-copy.js";
import {
  at,
  base,
  night,
  suggestionCases,
} from "./helpers/suggestion-cases.mjs";

const start = Date.UTC(2026, 9, 14, 19);
const total = 720;

// A target whose altitude is a triangle (`peak` at `centre`, losing `slope`
// degrees a minute, one sample every 30 minutes), visible in `from`–`to`; with
// `criteria`, its night score carries the altitude criterion the way
// `targetTonightScore` writes it.
function target(
  id,
  {
    centre,
    from = 0,
    to = total,
    minutes = 60,
    peak = 80,
    slope = 0.12,
    score = 80,
    criteria = false,
    windows,
  },
) {
  const series = [];
  for (let minute = 0; minute <= total; minute += 30)
    series.push({
      time: at(minute),
      altitude: peak - Math.abs(minute - centre) * slope,
    });
  const card = {
    target: { id, designation: id.toUpperCase(), title: "" },
    integration: { available: true, recommendedMinutes: minutes },
    visibilityWindows: (windows ?? [[from, to]]).map(([a, b]) => ({
      start: at(a),
      end: at(b),
    })),
    series,
  };
  if (!criteria) return { card, score: { total: score, max: 100 } };
  // The useful window: the card's visibility windows (photo, full at 4 h).
  const usableMinutes = (windows ?? [[from, to]]).reduce(
    (sum, [a, b]) => sum + (b - a),
    0,
  );
  const altitude = Math.round(peak);
  const points = Math.round(
    (15 * Math.min(60, Math.max(0, altitude - 20)) * 240 +
      15 * 60 * Math.min(240, usableMinutes)) /
      (60 * 240),
  );
  return {
    card,
    score: {
      total: score,
      max: 100,
      criteria: [
        {
          key: "altitude-window",
          points,
          max: 30,
          available: true,
          reason: null,
          facts: {
            culminationAltitude: altitude,
            culminationAt: at(centre),
            minAltitude: 30,
            usableMinutes,
            fullMinutes: 240,
            mode: "photo",
            eveningBonus: null,
          },
        },
      ],
    },
  };
}

const run = (candidates, extra = {}) =>
  suggestNight({
    night,
    mode: "imaging",
    count: candidates.length,
    candidates,
    ...extra,
  });
const chain = (candidates, extra = {}) =>
  run(candidates, { placement: "chained", ...extra });
const slots = (result) =>
  result.items.map((item) => [
    item.target.id,
    item.startMinute,
    item.endMinute,
  ]);

test("placement absent, « ideal » or unknown is the output of today, byte for byte", () => {
  for (const { id, args } of suggestionCases) {
    const today = JSON.stringify(suggestNight(args[0]));
    for (const placement of ["ideal", "anything-else", undefined])
      assert.equal(
        JSON.stringify(suggestNight({ ...args[0], placement })),
        today,
        `${id} with ${placement}`,
      );
  }
});

test("a call without a suggestion option keeps the cascade, whatever the placement", () => {
  const input = {
    night,
    mode: "imaging",
    candidates: [
      target("a", { centre: 120 }),
      target("b", { centre: 300 }),
      target("c", { centre: 480 }),
    ],
  };
  assert.deepEqual(
    autoFillNight({ ...input, placement: "chained" }),
    autoFillNight(input),
  );
});

test("« Rapproché » never chains the independent list", () => {
  const list = suggestionCases.find(
    (entry) => entry.id === "list-independent-and-best-window",
  ).args[0];
  assert.deepEqual(
    suggestNight({ ...list, placement: "chained" }),
    suggestNight(list),
  );
});

test("when every target is visible, the chain takes the best-ranked ones without a gap", () => {
  const candidates = [
    target("c1", { centre: 300, minutes: 90, score: 95 }),
    target("c2", { centre: 120, minutes: 60, score: 90 }),
    target("c3", { centre: 480, minutes: 75, score: 85 }),
    target("c4", { centre: 210, minutes: 60, score: 80 }),
    target("c5", { centre: 600, minutes: 60, score: 70 }),
  ];
  for (const count of [2, 3, 4, 5]) {
    const ideal = run(candidates, { count });
    const chained = chain(candidates, { count });
    assert.deepEqual(
      new Set(chained.items.map((item) => item.target.id)),
      new Set(ideal.items.map((item) => item.target.id)),
      `${count} targets`,
    );
    assert.equal(chained.items[0].startMinute, 0);
    chained.items.forEach((item, index) => {
      if (index)
        assert.equal(item.startMinute, chained.items[index - 1].endMinute);
    });
  }
});

test("at each step the chain takes the best-ranked target visible there", () => {
  const result = chain([
    target("late", { centre: 540, score: 95 }),
    target("early", { centre: 90, score: 60 }),
    target("middle", { centre: 300, score: 80 }),
  ]);
  assert.deepEqual(slots(result), [
    ["late", 0, 60],
    ["middle", 60, 120],
    ["early", 120, 180],
  ]);
});

test("a target visible now goes before a better-ranked one rising within 10 min", () => {
  const result = chain([
    target("a", { centre: 90, score: 95, from: 0, to: 300 }),
    target("b", { centre: 200, score: 90, from: 67, to: 720 }),
    target("c", { centre: 300, score: 85, from: 0, to: 720 }),
  ]);
  assert.deepEqual(slots(result), [
    ["a", 0, 60],
    ["c", 60, 120],
    ["b", 120, 180],
  ]);
  assert.deepEqual(
    result.free.map((slot) => [slot.startMinute, slot.endMinute]),
    [[180, 720]],
  );
});

test("a target never visible after the cursor is skipped and the shortfall says so", () => {
  const result = chain(
    [
      target("a", { centre: 90, score: 95, from: 0, to: 300 }),
      target("gone", { centre: 100, score: 90, from: 0, to: 70 }),
      target("b", { centre: 400, score: 85, from: 0, to: 720 }),
    ],
    { count: 3 },
  );
  assert.deepEqual(
    result.items.map((item) => item.target.id),
    ["a", "b"],
  );
  assert.equal(result.placed, 2);
  assert.equal(result.requested, 3);
  assert.ok(result.shortfall);
  assert.equal(result.shortfall.kind, "nothing");
});

test("a slot is cut at the end of its window down to the minimum, never under; a window 150 min away stops the chain", () => {
  const result = chain(
    [
      target("a", { centre: 60, score: 95, minutes: 90, to: 120 }),
      target("b", { centre: 150, score: 90, minutes: 90, to: 150 }),
      target("c", {
        centre: 300,
        score: 85,
        minutes: 60,
        windows: [
          [0, 160],
          [300, 600],
        ],
      }),
    ],
    { count: 3 },
  );
  assert.deepEqual(slots(result), [
    ["a", 0, 90],
    ["b", 90, 150],
  ]);
  assert.deepEqual(
    result.items.map((item) => item.placement),
    ["chained", "shortened"],
  );
  assert.equal(result.shortfall.kind, "no-follower");
  assert.equal(result.shortfall.startMinute, 150);
  assert.ok(result.items.every((item) => item.durationMinutes >= 45));
});

test("visual: every chained slot lasts twenty minutes", () => {
  const result = chain(
    Array.from({ length: 8 }, (_, index) =>
      target(`v${index}`, { centre: 60 + index * 60, score: 90 - index }),
    ),
    { mode: "visual", count: 8 },
  );
  assert.equal(result.placed, 8);
  assert.ok(result.items.every((item) => item.durationMinutes === 20));
  assert.equal(result.items.at(-1).endMinute, 160);
});

test("the targets « À poursuivre » come first, then the culminations", () => {
  const result = chain(
    [
      target("e1", { centre: 120, score: 95 }),
      target("e2", { centre: 200, score: 90 }),
      target("p1", { centre: 600, score: 60 }),
    ],
    {
      count: 3,
      continuing: [
        { id: "p1", acquiredMinutes: 250, goalMinutes: 720, projectName: "N" },
      ],
    },
  );
  assert.deepEqual(
    result.items.map((item) => [item.target.id, item.group]),
    [
      ["p1", "continue"],
      ["e1", "night"],
      ["e2", "night"],
    ],
  );
  assert.equal(result.items[0].startMinute, 0);
});

test("the plan's items and the kept targets stay where they are; the chain steps around them", () => {
  const result = chain(
    [
      target("k1", { centre: 200, score: 99 }),
      target("a1", { centre: 100, score: 95 }),
      target("a2", { centre: 260, score: 90 }),
      target("a3", { centre: 420, score: 85 }),
    ],
    {
      count: 4,
      items: [{ id: "planned", startMinute: 30, endMinute: 150 }],
      kept: [{ id: "k1", startMinute: 240, endMinute: 330 }],
    },
  );
  const kept = result.items.find((item) => item.kept);
  assert.deepEqual([kept.startMinute, kept.endMinute], [240, 330]);
  const others = result.items.filter((item) => !item.kept);
  for (const item of others) {
    assert.ok(item.endMinute <= 30 || item.startMinute >= 150, "the plan");
    assert.ok(item.endMinute <= 240 || item.startMinute >= 330, "the kept");
  }
  assert.deepEqual(
    others.map((item) => item.target.id),
    ["a1", "a2", "a3"],
  );
});

test("the apply recomputes the chain over exactly the ticked targets, the slots the sheet drew", () => {
  const candidates = [
    target("d1", { centre: 300, score: 95 }),
    target("d2", { centre: 120, score: 90 }),
    target("d3", { centre: 480, score: 85 }),
  ];
  const shown = chain(candidates, { count: 3 });
  const ticked = shown.items
    .filter((item) => item.target.id !== "d2")
    .map((item) => item.target.id);
  const applied = chain(candidates, {
    count: ticked.length,
    only: ticked,
  });
  assert.deepEqual(
    applied.items.map((item) => item.target.id),
    ["d1", "d3"],
  );
  // What the sheet shows for the ticked targets is what the apply adds.
  assert.deepEqual(
    slots(applied),
    slots(
      chain(
        candidates.filter((c) => c.card.target.id !== "d2"),
        { count: 2 },
      ),
    ),
  );
  assert.equal(applied.items[0].startMinute, 0);
});

test("the score at the real slot is lower than the night's, never higher", () => {
  const candidates = [
    target("q1", { centre: 360, score: 90, criteria: true }),
    target("q2", { centre: 120, score: 85, criteria: true }),
  ];
  const nights = new Map(
    candidates.map((entry) => [entry.card.target.id, entry.score.total]),
  );
  const ideal = run(candidates);
  const chained = chain(candidates);
  for (const item of ideal.items)
    assert.equal(item.score.total, nights.get(item.target.id), "Idéal");
  for (const item of chained.items)
    assert.ok(item.score.total <= nights.get(item.target.id), item.target.id);
  const q1 = chained.items.find((item) => item.target.id === "q1");
  assert.ok(q1.score.total < nights.get("q1"));
  assert.equal(q1.score.max, 100);
});

test("targetSlotScore reads the highest altitude of the slot, the useful window unchanged", () => {
  const entry = target("g", { centre: 360, score: 77, criteria: true });
  const night30 = entry.score.criteria[0].points;
  assert.equal(night30, 30);
  const early = targetSlotScore({
    score: entry.score,
    card: entry.card,
    start: at(0),
    end: at(60),
  });
  // 80 − 300 × 0.12 = 44° at the end of the slot: a = 24 (6 points), the
  // window full (15).
  assert.deepEqual(early, { total: 77 - 30 + 21, max: 100 });
  const culmination = targetSlotScore({
    score: entry.score,
    card: entry.card,
    start: at(330),
    end: at(390),
  });
  assert.deepEqual(culmination, { total: 77, max: 100 });
  // Instants given as milliseconds read the same.
  assert.deepEqual(
    targetSlotScore({
      score: entry.score,
      card: entry.card,
      start: start,
      end: start + 60 * 60000,
    }),
    early,
  );
});

test("targetSlotScore never goes above the night's score and keeps it without data", () => {
  const entry = target("g", { centre: 360, score: 62, criteria: true });
  // The night's criterion read a lower culmination than the curve reaches.
  const lower = structuredClone(entry.score);
  lower.criteria[0].points = 10;
  assert.deepEqual(
    targetSlotScore({
      score: lower,
      card: entry.card,
      start: at(330),
      end: at(390),
    }),
    { total: 62, max: 100 },
  );
  const slot = { card: entry.card, start: at(0), end: at(60) };
  assert.deepEqual(
    targetSlotScore({ score: { total: 60, max: 100 }, ...slot }),
    { total: 60, max: 100 },
  );
  assert.deepEqual(
    targetSlotScore({
      score: entry.score,
      card: { target: entry.card.target },
      start: at(0),
      end: at(60),
    }),
    { total: 62, max: 100 },
  );
  assert.deepEqual(
    targetSlotScore({
      score: entry.score,
      card: entry.card,
      start: "bad",
      end: at(60),
    }),
    { total: 62, max: 100 },
  );
  // A short window's night is capped (49, 56 without the cap): the slot
  // never goes above it.
  const capped = structuredClone(entry.score);
  capped.total = 49;
  capped.cap = { minutes: 31, limit: 45, ceiling: 49, uncapped: 56 };
  assert.deepEqual(
    targetSlotScore({
      score: capped,
      card: entry.card,
      start: at(330),
      end: at(390),
    }),
    { total: 49, max: 100 },
  );
  assert.equal(targetSlotScore({ score: null, ...slot }), null);
  assert.equal(targetSlotScore(), null);
});

test("the reason: the culmination sentences stay when the slot holds it; a target placed after another reads « À la suite »", () => {
  const result = chain([
    target("a", { centre: 150, score: 95 }),
    target("b", { centre: 240, score: 90 }),
    target("c", { centre: 330, score: 85 }),
    target("d", { centre: 600, score: 80 }),
  ]);
  const kinds = Object.fromEntries(
    result.items.map((item) => [item.target.id, item.reason.kind]),
  );
  // a: 0–60 holds nothing but is "haute dès la nuit"; b: 60–120 does not
  // hold its culmination (240); c and d too.
  assert.equal(kinds.a, "high-from-dusk");
  assert.deepEqual(
    [kinds.b, kinds.c, kinds.d],
    ["follows", "follows", "follows"],
  );
  const follows = result.items.find((item) => item.target.id === "b");
  assert.equal(follows.reason.altitude, follows.maxAltitude);
  // A slot that holds the culmination keeps its sentence.
  const meridian = chain([
    target("m1", { centre: 30, score: 95 }),
    target("m2", { centre: 90, score: 90 }),
  ]);
  assert.equal(
    meridian.items.find((item) => item.target.id === "m2").reason.kind,
    "meridian",
  );
  assert.match(
    autoFillItemReason({ kind: "follows", altitude: 61 }, { locale: "fr" }),
    /^À la suite, jusqu’à 61°$/,
  );
  assert.equal(
    autoFillItemReason({ kind: "follows", altitude: 61 }, { locale: "en" }),
    "Next in line, up to 61°",
  );
});

test("« Rapproché » is deterministic and leaves its inputs untouched", () => {
  const input = {
    night,
    mode: "imaging",
    count: 3,
    placement: "chained",
    candidates: [
      target("a", { centre: 120, criteria: true }),
      target("b", { centre: 300, criteria: true }),
      target("c", { centre: 480, criteria: true }),
    ],
  };
  const before = structuredClone(input);
  assert.deepEqual(suggestNight(input), suggestNight(input));
  assert.deepEqual(input, before);
  assert.ok(base.night);
});
