import assert from "node:assert/strict";
import test from "node:test";
import {
  journalStatisticsInstrument,
  journalStatisticsOverview,
  journalStatisticsTarget,
} from "portal/journal/journal-statistics.js";

// The statistics of the gallery, per target, per instrument, per year (an
// instrument is the pair tube · caméra; the hours are those of the nights
// confirmed at the debriefing; best = the longest integration, the sharper
// night on a tie; an unknown filter stays `null`).

const PAIR = "Newton 150/750 · Caméra couleur refroidie";
const target = (targetId, acquiredSeconds, extra = {}) => ({
  targetId,
  label: targetId.toUpperCase(),
  state: "planned",
  acquiredSeconds,
  frameCount: acquiredSeconds / 180,
  filter: null,
  captureId: null,
  ...extra,
});
const line = (id, date, state, acquiredSeconds, targets, extra = {}) => ({
  sessionId: id === null ? null : `s-${id}`,
  planId: `p-${id}`,
  eveningDate: date,
  startedAt: `${date}T19:00:00.000Z`,
  state,
  instrumentLabel: PAIR,
  acquiredSeconds,
  frameCount: acquiredSeconds / 180,
  lostReason: null,
  quality: null,
  targets,
  ...extra,
});

test("only the nights confirmed at the debriefing count", () => {
  const lines = [
    line(1, "2026-10-07", "executed", 3600, [target("m31", 3600)]),
    line(2, "2026-10-10", "to_debrief", 7200, [target("m31", 7200)]),
    line(null, "2026-10-11", "to_debrief", null, []),
  ];
  const detail = journalStatisticsTarget(lines, "m31");
  assert.equal(detail.acquiredSeconds, 3600);
  assert.equal(detail.nights, 1);
  const overview = journalStatisticsOverview(lines);
  assert.deepEqual(
    overview.months.reduce((a, b) => a + b, 0),
    3600,
  );
  assert.equal(overview.nights.executed, 1);
});

test("a target removed at the debriefing, or with no time, is not a night of it", () => {
  const lines = [
    line(1, "2026-10-07", "executed", 3600, [
      target("m31", 3600),
      target("m27", 900, { state: "removed" }),
      target("ic1805", 0),
    ]),
  ];
  assert.equal(journalStatisticsTarget(lines, "m27"), null);
  assert.equal(journalStatisticsTarget(lines, "ic1805"), null);
  assert.deepEqual(
    journalStatisticsOverview(lines).targets.map((row) => row.targetId),
    ["m31"],
  );
});

test("a filter the debriefing did not write stays null, and the filters add up per target", () => {
  const lines = [
    line(1, "2026-10-07", "executed", 3600, [
      target("m31", 3600, { filter: "Ha" }),
    ]),
    line(2, "2026-10-08", "executed", 1800, [target("m31", 1800)]),
    line(3, "2026-10-09", "executed", 1800, [
      target("m31", 1800, { filter: "Ha" }),
    ]),
  ];
  assert.deepEqual(journalStatisticsTarget(lines, "m31").filters, [
    { filter: "Ha", acquiredSeconds: 5400 },
    { filter: null, acquiredSeconds: 1800 },
  ]);
});

test("the best night is the longest, the sharper one on a tie, then the most recent", () => {
  const lines = [
    line(1, "2026-10-01", "executed", 3600, [target("m31", 3600)], {
      quality: { fwhm: 3.1 },
    }),
    line(2, "2026-10-02", "executed", 3600, [target("m31", 3600)], {
      quality: { fwhm: 2.2 },
    }),
    line(3, "2026-10-03", "executed", 3600, [target("m31", 3600)]),
    line(4, "2026-10-04", "executed", 1800, [target("m31", 1800)], {
      quality: { fwhm: 1.0 },
    }),
  ];
  const best = journalStatisticsTarget(lines, "m31");
  assert.equal(best.bestNight.sessionId, "s-2");
  assert.deepEqual(
    best.byNight.filter((night) => night.best).map((night) => night.sessionId),
    ["s-2"],
  );
  // No measure anywhere: the most recent wins.
  const plain = lines.map((entry) => ({ ...entry, quality: null }));
  assert.equal(
    journalStatisticsTarget(plain, "m31").bestNight.sessionId,
    "s-3",
  );
});

test("an instrument is the pair; a night without one belongs to none", () => {
  const lines = [
    line(1, "2026-10-01", "executed", 3600, [target("m31", 3600)]),
    line(2, "2026-10-02", "executed", 3600, [target("m31", 3600)], {
      instrumentLabel: null,
    }),
    line(3, "2026-10-03", "executed", 3600, [target("m31", 3600)], {
      instrumentLabel: "Newton 150/750",
    }),
  ];
  const rows = journalStatisticsOverview(lines).instruments;
  assert.deepEqual(
    rows.map((row) => row.label).sort(),
    [PAIR, "Newton 150/750"].sort(),
  );
  assert.equal(journalStatisticsInstrument(lines, PAIR).nights, 1);
  assert.equal(journalStatisticsInstrument(lines, "Dobson 300"), null);
  assert.equal(journalStatisticsTarget(lines, "m31").nights, 3);
});

test("the months are those of the year asked, the latest by default", () => {
  const lines = [
    line(1, "2026-03-05", "executed", 3600, [target("m31", 3600)]),
    line(2, "2025-03-05", "executed", 1800, [target("m31", 1800)]),
  ];
  assert.equal(journalStatisticsOverview(lines).year, 2026);
  assert.equal(journalStatisticsOverview(lines).months[2], 3600);
  assert.equal(
    journalStatisticsOverview(lines, { year: 2025 }).months[2],
    1800,
  );
  assert.equal(journalStatisticsOverview([]).year, null);
});

test("the nights are counted by outcome, and what an abandoned night lost its time to", () => {
  const lines = [
    line(1, "2026-10-01", "executed", 3600, [target("m31", 3600)]),
    line(2, "2026-10-02", "partial", 1800, [target("m31", 1800)]),
    line(3, "2026-10-03", "abandoned", 0, [], { lostReason: "wind" }),
    line(4, "2026-10-04", "abandoned", 0, [], { lostReason: "wind" }),
    line(5, "2026-10-05", "abandoned", 0, [], { lostReason: "clouds" }),
    line(6, "2026-10-06", "no_plan", 1800, [target("m27", 1800)]),
  ];
  assert.deepEqual(journalStatisticsOverview(lines).nights, {
    executed: 1,
    partial: 1,
    noPlan: 1,
    abandoned: 3,
    lost: [
      { cause: "wind", count: 2 },
      { cause: "clouds", count: 1 },
    ],
  });
});

test("the best captures: at most three, the longest nights that carry one", () => {
  const lines = [1, 2, 3, 4].map((n) =>
    line(n, `2026-10-0${n}`, "executed", 1800 * n, [
      target("m31", 1800 * n, { captureId: n === 2 ? null : `c-${n}` }),
    ]),
  );
  assert.deepEqual(
    journalStatisticsTarget(lines, "m31").bestCaptures.map(
      (capture) => capture.captureId,
    ),
    ["c-4", "c-3", "c-1"],
  );
});
