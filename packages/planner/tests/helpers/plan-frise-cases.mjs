// The inputs of the plan frise: the plans of the worked example and the
// variations the rule is tested on. Used by `plan-frise.test.mjs` and by
// `plan-frise-input.test.mjs`; the fixtures `plan-frise` and `plan-frise-scale`
// hold the same cases written out (arguments only: their results are
// generated).

/** The worked-example night: 18:54 → 04:38 on the UTC clock (offset 0). */
export const nightStart = new Date(Date.UTC(2026, 9, 14, 18, 54));
export const nightEnd = new Date(Date.UTC(2026, 9, 15, 4, 38));

const round = (value) => Math.round(value * 1e10) / 1e10;

/**
 * `keys` is `[[minute from the night start, altitude]]`, joined linearly and
 * sampled every ten minutes over `[from, to]` (the planner's own step).
 */
export function series(start, keys, { from = 0, to = 590 } = {}) {
  const at = (minute) => {
    for (let index = 1; index < keys.length; index += 1)
      if (minute <= keys[index][0]) {
        const [m0, a0] = keys[index - 1];
        const [m1, a1] = keys[index];
        return a0 + ((a1 - a0) * (minute - m0)) / (m1 - m0);
      }
    return keys.at(-1)[1];
  };
  const points = [];
  for (let minute = from; minute <= to; minute += 10)
    points.push({
      time: new Date(start.getTime() + minute * 60000).toISOString(),
      altitude: round(at(minute)),
      azimuth: 120,
      moonSeparation: 90,
    });
  return points;
}

export const item = (
  key,
  startMinute,
  endMinute,
  itemSeries = null,
  label = key,
) => ({
  key,
  label,
  startMinute,
  endMinute,
  series: itemSeries,
});

export const nightOf = (start = nightStart, end = nightEnd) => ({
  start: start.toISOString(),
  end: end.toISOString(),
});

/**
 * The four targets of the worked example: M31 19:49 → 21:49 rising 48° → 68°,
 * NGC 7000 22:19 → 00:19 falling 63° → 42°, M33 00:19 → 02:49 75° → 54° with a
 * peak at 80°, M45 02:49 → 03:49 68° → 61°.
 */
export function boardPlan({
  start = nightStart,
  end = nightEnd,
  offset = 0,
  heights,
  scale,
} = {}) {
  const labels = { m31: "M31", ngc7000: "NGC 7000", m33: "M33", m45: "M45" };
  const named = (entry) => ({ ...entry, label: labels[entry.key] });
  return {
    night: nightOf(start, end),
    utcOffsetMinutes: offset,
    items: [
      item(
        "m31",
        55,
        175,
        series(start, [
          [0, 38.8333333333],
          [590, 137.1666666667],
        ]),
      ),
      item(
        "ngc7000",
        205,
        325,
        series(
          start,
          [
            [200, 63.875],
            [330, 41.125],
          ],
          { from: 190, to: 340 },
        ),
      ),
      item(
        "m33",
        325,
        475,
        series(
          start,
          [
            [320, 74.6666666667],
            [400, 80],
            [480, 52.2666666667],
          ],
          { from: 310, to: 490 },
        ),
      ),
      item(
        "m45",
        475,
        535,
        series(
          start,
          [
            [470, 68.5833333333],
            [540, 60.4166666667],
          ],
          { from: 460, to: 550 },
        ),
      ),
    ].map(named),
    ...(heights ? { heights } : {}),
    ...(scale ? { scale } : {}),
  };
}

/** A plan on the worked-example night with the given items. */
export const planWith = (
  items,
  { start = nightStart, end = nightEnd } = {},
) => ({
  night: nightOf(start, end),
  utcOffsetMinutes: 0,
  items,
});

/** Tokyo (+9 h): 19:00 → 04:30 local, i.e. 10:00 → 19:30 UTC. */
export const tokyoPlan = () => ({
  night: nightOf(
    new Date(Date.UTC(2026, 10, 3, 10)),
    new Date(Date.UTC(2026, 10, 3, 19, 30)),
  ),
  utcOffsetMinutes: 540,
  items: [item("a", 30, 100)],
});

/** Azores-like (−4 h): 18:15 → 03:50 local, i.e. 22:15 → 07:50 UTC. */
export const atlanticPlan = () => ({
  night: nightOf(
    new Date(Date.UTC(2026, 6, 9, 22, 15)),
    new Date(Date.UTC(2026, 6, 10, 7, 50)),
  ),
  utcOffsetMinutes: -240,
  items: [item("b", 0, 60)],
});

/** 01:10 → 05:40 local: the noon that precedes is the day before's. */
export const afterMidnightPlan = () => ({
  night: nightOf(
    new Date(Date.UTC(2026, 5, 21, 1, 10)),
    new Date(Date.UTC(2026, 5, 21, 5, 40)),
  ),
  utcOffsetMinutes: 0,
  items: [item("a", 0, 60)],
});

/** 18:45 → 04:15 local at +5:30 = 13:15 → 22:45 UTC. */
export const indiaPlan = () => ({
  night: nightOf(
    new Date(Date.UTC(2026, 0, 10, 13, 15)),
    new Date(Date.UTC(2026, 0, 10, 22, 45)),
  ),
  utcOffsetMinutes: 330,
  items: [item("a", 30, 90)],
});

/** A 24 h polar night at +1 h with one target. */
export const polarPlan = () => {
  const start = new Date(Date.UTC(2026, 11, 21, 12));
  return {
    night: nightOf(start, new Date(Date.UTC(2026, 11, 22, 12))),
    utcOffsetMinutes: 60,
    items: [
      item(
        "a",
        100,
        400,
        series(
          start,
          [
            [0, 20],
            [700, 60],
          ],
          { to: 1440 },
        ),
      ),
    ],
  };
};

/** A slot 05 → 25 sampled at 0, 10, 20, 30 (10° per step). */
export const interpolatedPlan = () =>
  planWith([
    item(
      "a",
      5,
      25,
      series(
        nightStart,
        [
          [0, 10],
          [30, 40],
        ],
        { to: 30 },
      ),
    ),
  ]);

/** One target half under the horizon, one half over the zenith. */
export const clampedPlan = () =>
  planWith([
    item(
      "low",
      0,
      60,
      series(
        nightStart,
        [
          [0, -30],
          [60, 30],
        ],
        { to: 60 },
      ),
    ),
    item(
      "high",
      60,
      120,
      series(
        nightStart,
        [
          [60, 80],
          [120, 100],
        ],
        { from: 60, to: 120 },
      ),
    ),
  ]);

/** A slot of 100 minutes whose series is given (or `null`). */
export const slotOfHundred = (itemSeries) =>
  planWith([item("a", 0, 100, itemSeries)]);

/** A rising target that dips on the way. */
export const wavePlan = () =>
  planWith([
    item(
      "wave",
      0,
      60,
      series(
        nightStart,
        [
          [0, 20],
          [20, 50],
          [30, 40],
          [60, 70],
        ],
        { to: 60 },
      ),
    ),
  ]);

/** A target that rises by exactly 10°, one that stalls then rises. */
export const edgeTrendPlan = () =>
  planWith([
    item(
      "ten",
      0,
      60,
      series(
        nightStart,
        [
          [0, 30],
          [60, 40],
        ],
        { to: 60 },
      ),
    ),
    item(
      "plateau",
      60,
      120,
      series(
        nightStart,
        [
          [60, 20],
          [80, 20],
          [120, 50],
        ],
        { from: 60, to: 120 },
      ),
    ),
    item(
      "nine",
      120,
      180,
      series(
        nightStart,
        [
          [120, 60],
          [180, 51],
        ],
        { from: 120, to: 180 },
      ),
    ),
  ]);

/** Samples out of order and a few unusable ones around the good ones. */
export const messySeriesPlan = () => {
  const good = series(
    nightStart,
    [
      [0, 20],
      [60, 50],
    ],
    { to: 60 },
  );
  return planWith([
    item("a", 0, 60, [
      good[3],
      { time: "not a time", altitude: 12 },
      good[0],
      { time: good[1].time, altitude: null },
      good[5],
      good[1],
      good[2],
      good[6],
      good[4],
      "nothing",
    ]),
  ]);
};
