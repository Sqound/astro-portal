import assert from "node:assert/strict";
import test from "node:test";
import {
  compareCandidates,
  previousSky,
  rankSuggestionCandidates,
  suggestionMalus,
  suggestionMalusRule,
} from "../src/suggestion-ranking.js";
import {
  hashSuggestionSeed,
  suggestionRandomValues,
  suggestionSeed,
} from "../src/suggestion-seed.js";
const candidate = (id, total = 80, type = "", max = 100) => ({
  id,
  culmination: 100,
  score: total === null ? null : { total, max },
  card: {
    target: { id, designation: id, title: "", skyTarget: { typeKey: type } },
  },
});
const ids = (result) => result.pool.map((item) => item.id);
const pool = Array.from({ length: 30 }, (_, i) =>
  candidate(`t${String(i).padStart(2, "0")}`, 90 - i / 10),
);

test("score shares compare without rounding and unscored candidates come last", () => {
  assert.ok(
    compareCandidates(candidate("a", 74, "", 90), candidate("b", 82)) < 0,
  );
  assert.ok(compareCandidates(candidate("a", 0), candidate("b", null)) < 0);
});
test("score ties use culmination then identifier", () => {
  assert.ok(
    compareCandidates({ ...candidate("b"), culmination: 10 }, candidate("a")) <
      0,
  );
  assert.ok(compareCandidates(candidate("a"), candidate("b")) < 0);
});
test("the unseeded first list is strict", () =>
  assert.deepEqual(
    ids(rankSuggestionCandidates(pool)),
    pool.map((c) => c.id),
  ));
test("plan, kept and previously proposed ids leave the pool", () => {
  assert.deepEqual(
    ids(
      rankSuggestionCandidates(pool.slice(0, 4), {
        items: [{ id: "t00" }],
        kept: [{ id: "t01" }],
        excluded: ["t02"],
      }),
    ),
    ["t03"],
  );
});
test("excludeCaptured leaves the done targets out with their latest date (today's exclusion); partial and abandoned stay", () => {
  const result = rankSuggestionCandidates(pool.slice(0, 3), {
    excludeCaptured: true,
    history: [
      { id: "t00", outcome: "done", date: "2026-10-01" },
      { id: "t00", outcome: "done", date: "2026-10-03" },
      { id: "t00", outcome: "partial", date: "2026-10-04" },
      { id: "t01", outcome: "abandoned", date: "2026-10-03" },
    ],
  });
  assert.deepEqual(ids(result), ["t01", "t02"]);
  assert.equal(result.captured[0].date, "2026-10-03");
  // The exclusion is the old one: no malus, no last time on the others.
  assert.ok(result.pool.every((item) => !item.previous && !item.malus));
});
test("by default a done target stays in the pool and reports its last time", () => {
  const result = rankSuggestionCandidates(pool.slice(0, 3), {
    date: "2026-10-12",
    noteNow: 80,
    history: [
      {
        id: "t00",
        outcome: "done",
        date: "2026-10-03",
        acquiredMinutes: 60,
        noteThen: 70,
      },
      { id: "t00", outcome: "done", date: "2026-10-01", noteThen: 20 },
    ],
  });
  assert.equal(result.pool.length, 3);
  assert.equal(result.captured.length, 1);
  const previous = result.pool.find((item) => item.id === "t00").previous;
  assert.deepEqual(Object.keys(previous), [
    "date",
    "outcome",
    "noteThen",
    "noteNow",
    "malus",
  ]);
  assert.equal(previous.date, "2026-10-03");
  assert.equal(previous.noteThen, 70);
  assert.equal(previous.noteNow, 80);
  assert.ok(previous.malus > 0 && previous.malus <= 40);
  assert.equal(result.pool.find((item) => item.id === "t01").previous, null);
});
test("a partial row pays a malus in photo; an abandoned one never does", () => {
  const result = rankSuggestionCandidates(pool.slice(0, 3), {
    date: "2026-10-12",
    history: [
      { id: "t00", outcome: "partial", date: "2026-10-11" },
      { id: "t01", outcome: "abandoned", date: "2026-10-11" },
    ],
  });
  assert.ok(result.pool.find((item) => item.id === "t00").previous.malus > 30);
  assert.equal(result.pool.find((item) => item.id === "t01").previous, null);
  assert.deepEqual(result.captured, []);
});
test("observed pays a malus in visual only", () => {
  const history = [{ id: "t00", outcome: "observed", date: "2026-10-11" }];
  assert.ok(
    rankSuggestionCandidates(pool.slice(0, 1), {
      mode: "visual",
      date: "2026-10-12",
      history,
    }).pool[0].previous.malus > 30,
  );
  assert.equal(
    rankSuggestionCandidates(pool.slice(0, 1), {
      mode: "imaging",
      date: "2026-10-12",
      history,
    }).pool[0].previous,
    null,
  );
  assert.equal(
    rankSuggestionCandidates(pool.slice(0, 1), {
      mode: "visual",
      excludeCaptured: true,
      history,
    }).pool.length,
    0,
  );
});
// Ten targets from 95 down to 86 and four of them done: the malus orders the
// percentage minus the malus, the cross-product as long as it is 0.
const table = Array.from({ length: 10 }, (_, i) => candidate(`d${i}`, 95 - i));
const tableHistory = [
  // done yesterday, as good a night as tonight: 40 × 0.9975 → 39.9
  { id: "d0", outcome: "done", date: "2026-10-11", noteThen: 80 },
  // done yesterday under a much worse sky: the malus is lifted altogether
  { id: "d1", outcome: "done", date: "2026-10-11", noteThen: 40 },
  // done a year ago: 40 × 0.5^(365/270) = 15.7
  { id: "d2", outcome: "done", date: "2025-10-12", noteThen: 80 },
  // abandoned: nothing
  { id: "d3", outcome: "abandoned", date: "2026-10-11" },
];
test("a table of ten targets is ordered by the percentage minus the malus", () => {
  const result = rankSuggestionCandidates(table, {
    date: "2026-10-12",
    noteNow: 80,
    history: tableHistory,
  });
  const percentage = (item) =>
    (100 * item.score.total) / item.score.max - item.malus;
  assert.deepEqual(ids(result), [
    "d1", // 94, malus 0
    "d3", // 92
    "d4", // 91
    "d5", // 90
    "d6", // 89
    "d7", // 88
    "d8", // 87
    "d9", // 86
    "d2", // 93 − 15.7 = 77.3
    "d0", // 95 − 39.9 = 55.1
  ]);
  assert.equal(result.pool.find((item) => item.id === "d1").malus, 0);
  assert.ok(
    result.pool
      .slice(1)
      .every((item, i) => percentage(result.pool[i]) >= percentage(item)),
  );
});
test("a done target with a high malus drops out of the first decade, one with malus 0 keeps its place", () => {
  const history = [
    { id: "t00", outcome: "done", date: "2026-10-11", noteThen: 80 },
    { id: "t01", outcome: "done", date: "2026-10-11", noteThen: 30 },
  ];
  const result = rankSuggestionCandidates(pool, {
    date: "2026-10-12",
    noteNow: 80,
    history,
  });
  const first = result.pool.filter((item) => item.tier === 1).map((c) => c.id);
  assert.ok(!first.includes("t00"));
  assert.equal(result.pool.find((item) => item.id === "t00").tier, 3);
  assert.equal(first[0], "t01");
  assert.deepEqual(first.slice(0, 3), ["t01", "t02", "t03"]);
});
test("the continuing group and a request over the ticked targets are exempt", () => {
  const history = [{ id: "t00", outcome: "done", date: "2026-10-11" }];
  const continuing = [
    { id: "t00", acquiredMinutes: 10, goalMinutes: 100, projectName: "P" },
  ];
  const resumed = rankSuggestionCandidates(pool.slice(0, 3), {
    date: "2026-10-12",
    history,
    continuing,
  });
  assert.equal(resumed.pool[0].id, "t00");
  assert.equal(resumed.pool[0].group, "continue");
  const ticked = rankSuggestionCandidates(pool.slice(0, 3), {
    date: "2026-10-12",
    history,
    penalise: false,
  });
  assert.deepEqual(ids(ticked), ["t00", "t01", "t02"]);
  // The last time is still reported, so a re-request keeps the line.
  assert.ok(ticked.pool[0].previous.malus > 30);
});
test("the seeded shuffle stays inside the decade and counts the malus", () => {
  const history = [{ id: "t00", outcome: "done", date: "2026-10-11" }];
  for (const seed of ["a", "b", "c", "d"]) {
    const result = rankSuggestionCandidates(pool, {
      date: "2026-10-12",
      history,
      seed,
    });
    assert.ok(
      !result.pool
        .filter((item) => item.tier === 1)
        .map((c) => c.id)
        .includes("t00"),
      seed,
    );
  }
});
test("the malus rule is one table and the bounds hold", () => {
  assert.equal(suggestionMalusRule.maximum, 40);
  assert.ok(Object.isFrozen(suggestionMalusRule));
  const row = { date: "2026-10-12", outcome: "done", acquiredMinutes: 120 };
  const malus = (extra, options = {}) =>
    suggestionMalus({
      row: { ...row, ...extra },
      date: "2026-10-12",
      recommendedMinutes: 120,
      ...options,
    }).malus;
  assert.equal(malus({}), 40);
  assert.equal(malus({ acquiredMinutes: 0 }), 0);
  // More days, less malus; more done, more malus; better tonight, less.
  assert.ok(malus({ date: "2026-09-12" }) < malus({ date: "2026-10-11" }));
  assert.ok(malus({ acquiredMinutes: 60 }) < malus({ acquiredMinutes: 90 }));
  assert.ok(
    malus({ noteThen: 40 }, { noteNow: 60 }) <
      malus({ noteThen: 40 }, { noteNow: 50 }),
  );
  assert.equal(previousSky({ noteThen: 60, noteNow: 68 }), "worse");
  assert.equal(previousSky({ noteThen: 60, noteNow: 67 }), "same");
  assert.equal(previousSky({ noteThen: 75, noteNow: 67 }), "better");
  assert.equal(previousSky({ noteThen: null, noteNow: 67 }), null);
});
test("unfinished multi-night targets lead by score with progress", () => {
  const result = rankSuggestionCandidates(pool.slice(0, 4), {
    continuing: [
      {
        id: "t02",
        acquiredMinutes: 250,
        goalMinutes: 720,
        projectName: "NGC 7000",
      },
      { id: "t03", acquiredMinutes: 20, goalMinutes: 100, projectName: "More" },
      {
        id: "t00",
        acquiredMinutes: 100,
        goalMinutes: 100,
        projectName: "Finished",
      },
    ],
  });
  assert.deepEqual(ids(result), ["t02", "t03", "t00", "t01"]);
  assert.deepEqual(result.pool[0].progress, {
    acquiredMinutes: 250,
    goalMinutes: 720,
    projectName: "NGC 7000",
  });
});
test("each logical decade caps every known type at three", () => {
  const result = rankSuggestionCandidates(
    Array.from({ length: 35 }, (_, i) =>
      candidate(
        `v${i}`,
        100 - i,
        ["Galaxie", "Amas ouvert", "Nébuleuse planétaire"][i % 3],
      ),
    ),
  );
  for (const tier of new Set(result.pool.map((c) => c.tier))) {
    const batch = result.pool.filter((c) => c.tier === tier);
    assert.ok(batch.length <= 10);
    for (const type of new Set(batch.map((c) => c.type)))
      assert.ok(batch.filter((c) => c.type === type).length <= 3);
  }
});
test("unknown object types are not capped", () =>
  assert.equal(
    rankSuggestionCandidates(pool).pool.filter((c) => c.tier === 1).length,
    10,
  ));
test("same seed repeats and distinct seeds reorder near equal scores", () => {
  const a = rankSuggestionCandidates(pool, { seed: "night-a" }),
    b = rankSuggestionCandidates(pool, { seed: "night-b" });
  assert.deepEqual(a, rankSuggestionCandidates(pool, { seed: "night-a" }));
  assert.notDeepEqual(ids(a), ids(b));
  assert.deepEqual(
    a.pool
      .slice(0, 10)
      .map((c) => c.id)
      .sort(),
    pool
      .slice(0, 10)
      .map((c) => c.id)
      .sort(),
  );
});
test("offsets cannot reverse candidates separated by more than six points", () => {
  const result = rankSuggestionCandidates(
    [candidate("a", 90), candidate("b", 83)],
    { seed: "night-a" },
  );
  assert.deepEqual(ids(result), ["a", "b"]);
  for (const n of suggestionRandomValues("night-a", 100))
    assert.ok(n >= 0 && n < 1 && (n * 2 - 1) * 3 >= -3 && (n * 2 - 1) * 3 <= 3);
});
test("second tier exposes the position and lowered rows", () => {
  const result = rankSuggestionCandidates(pool, { tier: 2 });
  assert.deepEqual(result.position, { from: 11, to: 20 });
  assert.equal(result.pool[0].id, "t10");
  assert.ok(result.pool.every((c) => c.lowered));
});
test("seed hash and stream pin integer portability including Unicode", () => {
  assert.equal(hashSuggestionSeed(""), 2166136261);
  assert.equal(hashSuggestionSeed("hello"), 1335831723);
  assert.deepEqual(
    suggestionRandomValues("星🌙", 3),
    suggestionRandomValues("星🌙", 3),
  );
});
test("place/date seed rounds coordinates and appends refresh tier", () => {
  assert.equal(
    suggestionSeed({
      date: "2026-10-14",
      latitude: 45.123,
      longitude: -30.456,
    }),
    "2026-10-14|45.12|-30.46",
  );
  assert.equal(
    suggestionSeed({
      date: "2026-10-14",
      latitude: 45,
      longitude: -30,
      tier: 2,
    }),
    "2026-10-14|45.00|-30.00|2",
  );
});
