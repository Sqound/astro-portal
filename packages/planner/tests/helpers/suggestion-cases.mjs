const start = Date.UTC(2026, 9, 14, 19);
export const at = (minute) => new Date(start + minute * 60000).toISOString();
export const night = { start: at(0), end: at(720) };
export function candidate(
  id,
  {
    minutes = 90,
    score = 80,
    type = "",
    from = 0,
    to = 720,
    centre = 360,
  } = {},
) {
  return {
    card: {
      target: {
        id,
        designation: id.toUpperCase(),
        title: "",
        skyTarget: { typeKey: type },
      },
      integration: { available: true, recommendedMinutes: minutes },
      visibilityWindows: [{ start: at(from), end: at(to) }],
      series: [0, 180, 360, 540, 720].map((minute) => ({
        time: at(minute),
        altitude: 80 - Math.abs(minute - centre) / 20,
      })),
    },
    score: { total: score, max: 100 },
  };
}
export const candidates = Array.from({ length: 25 }, (_, i) =>
  candidate(`t${String(i).padStart(2, "0")}`, { score: 95 - i / 2 }),
);
export const base = { night, candidates, mode: "imaging" };
export const suggestionCases = [
  ...[2, 3, 4, 6].map((count) => ({
    id: `count-${count}`,
    args: [{ ...base, count }],
  })),
  { id: "all-without-six-limit", args: [{ ...base, count: "all" }] },
  { id: "visual-eight", args: [{ ...base, mode: "visual", count: 8 }] },
  {
    id: "visual-cannot-shorten",
    args: [
      {
        ...base,
        mode: "visual",
        count: 8,
        span: { start: at(0), end: at(39) },
      },
    ],
  },
  {
    id: "kept-and-excluded-on-refresh",
    args: [
      {
        ...base,
        count: 3,
        tier: 2,
        seed: "refresh",
        kept: [{ id: "t00", startMinute: 100, endMinute: 190 }],
        excluded: ["t01", "t02"],
      },
    ],
  },
  {
    id: "captured-latest-date",
    args: [
      {
        ...base,
        count: 3,
        excludeCaptured: true,
        history: [
          { id: "t00", outcome: "done", date: "2026-10-01" },
          { id: "t00", outcome: "done", date: "2026-10-03" },
        ],
      },
    ],
  },
  {
    id: "captured-stay-in",
    args: [
      {
        ...base,
        count: 3,
        history: [{ id: "t00", outcome: "done", date: "2026-10-03" }],
      },
    ],
  },
  {
    id: "skipped-and-partial-not-captured",
    args: [
      {
        ...base,
        count: 3,
        excludeCaptured: true,
        history: [
          { id: "t00", outcome: "abandoned", date: "2026-10-03" },
          { id: "t01", outcome: "partial", date: "2026-10-03" },
        ],
      },
    ],
  },
  {
    id: "visual-observed",
    args: [
      {
        ...base,
        mode: "visual",
        count: 3,
        excludeCaptured: true,
        history: [{ id: "t00", outcome: "observed", date: "2026-10-03" }],
      },
    ],
  },
  {
    id: "continuing-first",
    args: [
      {
        ...base,
        count: 2,
        continuing: [
          {
            id: "t20",
            acquiredMinutes: 250,
            goalMinutes: 720,
            projectName: "NGC 7000",
          },
        ],
      },
    ],
  },
  {
    id: "variety",
    args: [
      {
        ...base,
        layout: "list",
        candidates: Array.from({ length: 24 }, (_, i) =>
          candidate(`v${i}`, {
            score: 100 - i,
            type: [
              "Galaxie",
              "Amas ouvert",
              "Nébuleuse planétaire",
              "Nébuleuse en émission",
            ][Math.floor(i / 6)],
          }),
        ),
      },
    ],
  },
  ...["night-a", "night-b"].map((seed) => ({
    id: `seed-${seed}`,
    args: [{ ...base, count: 4, seed }],
  })),
  { id: "tier-two", args: [{ ...base, count: 3, tier: 2 }] },
  {
    id: "estimate-photo-lower-median",
    args: [
      {
        ...base,
        count: 2,
        candidates: [45, 80, 100, 180].map((minutes, i) =>
          candidate(`m${i}`, { minutes }),
        ),
      },
    ],
  },
  {
    id: "estimate-visual",
    args: [
      {
        ...base,
        count: 8,
        mode: "visual",
        span: { start: at(0), end: at(240) },
      },
    ],
  },
  {
    id: "nothing-fits-25-minutes",
    args: [
      {
        ...base,
        count: 3,
        items: [{ id: "planned", startMinute: 0, endMinute: 695 }],
      },
    ],
  },
  {
    id: "everything-kept",
    args: [
      {
        ...base,
        count: 2,
        tier: 2,
        kept: [
          { id: "t00", startMinute: 0, endMinute: 90 },
          { id: "t01", startMinute: 90, endMinute: 180 },
        ],
      },
    ],
  },
  {
    id: "apply-only",
    args: [{ ...base, count: 4, tier: 3, only: ["t02", "t00"] }],
  },
  {
    id: "list-independent-and-best-window",
    args: [
      {
        ...base,
        layout: "list",
        items: [{ id: "t00", startMinute: 0, endMinute: 720 }],
        candidates: [
          candidate("t00"),
          candidate("t01", { from: 55, to: 220 }),
          candidate("t02", { from: 70, to: 300 }),
        ],
      },
    ],
  },
  {
    id: "shortfall-dew",
    args: [
      {
        ...base,
        count: 5,
        candidates: [candidate("t00", { from: 0, to: 120 })],
        hourly: [{ time: at(120), dewRisk: "high", cloud: 10 }],
      },
    ],
  },
  {
    id: "unreadable-night",
    args: [{ ...base, night: { start: "bad", end: at(720) } }],
  },
  // A target already done pays a malus, whatever the switch says; the
  // list layout over eight candidates shows where each one stands.
  ...(() => {
    const few = {
      ...base,
      candidates: candidates.slice(0, 6),
      layout: "list",
      count: 10,
    };
    const done = (extra = {}) => ({
      id: "t00",
      outcome: "done",
      date: "2026-10-13",
      acquiredMinutes: 90,
      plannedMinutes: 90,
      ...extra,
    });
    return [
      {
        id: "malus-done-yesterday-drops-to-the-end",
        args: [{ ...few, noteNow: 85, history: [done({ noteThen: 85 })] }],
      },
      {
        id: "malus-lifted-by-a-much-better-night",
        args: [{ ...few, noteNow: 85, history: [done({ noteThen: 40 })] }],
      },
      {
        id: "malus-without-a-known-note-gives-no-credit",
        args: [{ ...few, history: [done()] }],
      },
      {
        id: "malus-partial-counts-at-what-was-done",
        args: [
          {
            ...few,
            noteNow: 70,
            history: [
              done({ outcome: "partial", acquiredMinutes: 30, noteThen: 70 }),
            ],
          },
        ],
      },
      {
        id: "malus-visual-forgets-faster",
        args: [
          {
            ...few,
            mode: "visual",
            noteNow: 70,
            history: [
              done({
                outcome: "observed",
                mode: "visual",
                date: "2026-04-17",
                acquiredMinutes: 25,
                noteThen: 70,
              }),
            ],
          },
        ],
      },
      {
        id: "malus-only-request-keeps-the-order",
        args: [
          {
            ...few,
            count: 2,
            only: ["t00", "t01"],
            noteNow: 85,
            history: [done({ noteThen: 85 })],
          },
        ],
      },
      {
        id: "malus-continuing-group-is-exempt",
        args: [
          {
            ...few,
            noteNow: 85,
            history: [done({ noteThen: 85 })],
            continuing: [
              {
                id: "t00",
                acquiredMinutes: 90,
                goalMinutes: 400,
                projectName: "NGC 7000",
              },
            ],
          },
        ],
      },
      {
        id: "malus-orders-the-seeded-shuffle-too",
        args: [
          {
            ...few,
            seed: "malus",
            noteNow: 85,
            history: [done({ noteThen: 85 })],
          },
        ],
      },
      {
        id: "exclude-captured-gives-back-the-exclusion",
        args: [
          {
            ...few,
            excludeCaptured: true,
            noteNow: 85,
            history: [
              done({ noteThen: 85 }),
              done({ id: "t01", outcome: "partial" }),
            ],
          },
        ],
      },
    ];
  })(),
];
