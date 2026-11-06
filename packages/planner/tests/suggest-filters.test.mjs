import assert from "node:assert/strict";
import test from "node:test";
import { autoFillNight } from "../src/auto-fill.js";
import {
  cardWithinSpans,
  filterSuggestionPool,
  maskHiddenWindows,
  nightPeriods,
  normalizeSuggestFilters,
  suggestFiltersActiveCount,
  suggestionFilteredCount,
  suggestionPeriodSpans,
  suggestionTargetFamily,
  suggestionTargetMatches,
} from "../src/suggest-filters.js";
import { targetWindowsScore } from "../src/target-score.js";

// The night of 03/11 at « Maison »,
// 18:09 → 04:38 in the place's time, here in UTC (UTC+1).
const darkStart = Date.UTC(2026, 10, 3, 17, 9);
const darkEnd = Date.UTC(2026, 10, 4, 3, 38);
const night = {
  start: new Date(darkStart).toISOString(),
  end: new Date(darkEnd).toISOString(),
};
const length = Math.round((darkEnd - darkStart) / 60000);
const at = (minute) => new Date(darkStart + minute * 60000).toISOString();

const target = (id, catalogues, type) => ({
  id,
  designation: id,
  catalogues,
  skyTarget: { typeKey: type },
});

const m31 = target("M31", ["Messier", "NGC"], "Galaxie");
const m57 = target("M57", ["Messier"], "Nébuleuse planétaire");
const ic1848 = target("IC 1848", ["IC"], "Nébuleuse en émission");
const sh2 = target(
  "Sh2-155",
  ["Sharpless"],
  "Complexe de nébuleuses en émission",
);
const m13 = target("M13", ["Messier"], "Amas globulaire");

test("the filters are made whole: known values in the sheet's order, the rest dropped", () => {
  assert.deepEqual(
    normalizeSuggestFilters({
      catalogues: ["NGC", "LDN", "Messier"],
      families: ["galaxies", "planets"],
      periods: ["end", "start"],
      ignoreMask: "yes",
    }),
    {
      catalogues: ["Messier", "NGC"],
      families: ["galaxies"],
      periods: ["start", "end"],
      ignoreMask: false,
    },
  );
  assert.equal(suggestFiltersActiveCount(null), 0);
  assert.equal(
    suggestFiltersActiveCount({
      catalogues: ["Messier", "NGC"],
      periods: ["middle"],
      ignoreMask: true,
    }),
    3,
  );
});

test("a target passes when one ticked catalogue holds it, and its family is ticked", () => {
  // M31 = Messier + NGC 224: « NGC » alone keeps it.
  assert.equal(suggestionTargetMatches(m31, { catalogues: ["NGC"] }), true);
  assert.equal(suggestionTargetMatches(m57, { catalogues: ["NGC"] }), false);
  assert.equal(suggestionTargetFamily(sh2), "nebulae");
  assert.equal(suggestionTargetFamily(m13), "clusters");
  assert.equal(
    suggestionTargetMatches(m57, {
      catalogues: ["Messier"],
      families: ["nebulae"],
    }),
    true,
  );
  assert.equal(
    suggestionTargetMatches(m13, {
      catalogues: ["Messier"],
      families: ["nebulae"],
    }),
    false,
  );
  // Nothing chosen: everything passes.
  assert.equal(suggestionTargetMatches(m13, {}), true);
});

test("the catalogue filter is laid before the cut of the pool, never after", () => {
  const pool = [
    m31,
    m57,
    m13,
    ...Array.from({ length: 60 }, (_, index) =>
      target(`NGC ${index}`, ["NGC"], "Galaxie"),
    ),
    sh2,
  ];
  // Cut first, the Sharpless target (the 64th) would be gone.
  assert.deepEqual(
    filterSuggestionPool(pool, { catalogues: ["Sharpless"] }, 48).map(
      (entry) => entry.id,
    ),
    ["Sh2-155"],
  );
  assert.equal(filterSuggestionPool(pool, {}, 48).length, 48);
});

test("the periods are the thirds of the dark night, the touching ones joined", () => {
  const thirds = nightPeriods(night);
  assert.deepEqual(
    thirds.map((third) => [third.key, third.start, third.end]),
    [
      ["start", "2026-11-03T17:09:00.000Z", "2026-11-03T20:39:00.000Z"],
      ["middle", "2026-11-03T20:39:00.000Z", "2026-11-04T00:08:00.000Z"],
      ["end", "2026-11-04T00:08:00.000Z", "2026-11-04T03:38:00.000Z"],
    ],
  );
  assert.equal(suggestionPeriodSpans(night, []), null);
  assert.deepEqual(suggestionPeriodSpans(night, ["start", "middle"]), [
    { start: "2026-11-03T17:09:00.000Z", end: "2026-11-04T00:08:00.000Z" },
  ]);
  assert.deepEqual(suggestionPeriodSpans(night, ["end", "start"]), [
    { start: "2026-11-03T17:09:00.000Z", end: "2026-11-03T20:39:00.000Z" },
    { start: "2026-11-04T00:08:00.000Z", end: "2026-11-04T03:38:00.000Z" },
  ]);
  // A night that cannot be read is the whole night, never nothing.
  assert.equal(suggestionPeriodSpans({ start: "x" }, ["start"]), null);
});

test("the time behind the mask is what the unmasked windows hold and the masked ones do not", () => {
  assert.deepEqual(
    maskHiddenWindows(
      [{ start: at(0), end: at(154) }],
      [
        { start: at(0), end: at(61) },
        { start: at(136), end: at(154) },
      ],
    ),
    [{ start: at(61), end: at(136) }],
  );
  assert.deepEqual(maskHiddenWindows([{ start: at(0), end: at(60) }], []), [
    { start: at(0), end: at(60) },
  ]);
  assert.deepEqual(
    maskHiddenWindows(
      [{ start: at(0), end: at(60) }],
      [{ start: at(0), end: at(60) }],
    ),
    [],
  );
});

// A dome of altitude peaking at minute `centre`, usable above 30°.
function card(id, centre, { peak = 70, width = 260, hidden = null } = {}) {
  const altitude = (minute) =>
    peak - ((minute - centre) ** 2 * peak) / width ** 2;
  const series = [];
  for (let minute = 0; minute <= length; minute += 10)
    series.push({ time: at(minute), altitude: altitude(minute) });
  const half = width * Math.sqrt(1 - 30 / peak);
  const from = Math.max(0, Math.round(centre - half));
  const to = Math.min(length, Math.round(centre + half));
  return {
    target: target(id, ["Messier"], "Galaxie"),
    series,
    visibilityWindows: [{ start: at(from), end: at(to) }],
    usableStart: at(from),
    usableEnd: at(to),
    integration: { available: true, recommendedMinutes: 60 },
    ...(hidden ? { maskHidden: hidden } : {}),
  };
}

// A score with its « Hauteur et durée » criterion, as `targetTonightScore`
// writes it.
const scored = (total, usableMinutes, points = 26) => ({
  total,
  max: 100,
  criteria: [
    {
      key: "altitude-window",
      available: true,
      points,
      facts: { usableMinutes, fullMinutes: 240 },
    },
  ],
});

const list = (candidates, spans) =>
  autoFillNight({
    candidates,
    night,
    span: null,
    items: [],
    hourly: [],
    moonSeries: [],
    ownedFilters: [],
    mode: "imaging",
    count: 10,
    layout: "list",
    history: [],
    ...(spans === undefined ? {} : { spans }),
  });

test("a list over « Début + Fin » never places in the middle, and says the two stretches", () => {
  const spans = suggestionPeriodSpans(night, ["start", "end"]);
  const early = card("early", 60);
  const middle = card("middle", 315, { width: 120 });
  const late = card("late", 560);
  const proposal = list(
    [
      { card: early, score: scored(70, 300) },
      { card: middle, score: scored(90, 200) },
      { card: late, score: scored(60, 300) },
    ],
    spans,
  );
  const ids = proposal.items.map((entry) => entry.target.id).sort();
  // The middle one is up only between the two stretches.
  assert.deepEqual(ids, ["early", "late"]);
  assert.deepEqual(
    proposal.spans.map((entry) => [entry.startMinute, entry.endMinute]),
    [
      [0, 210],
      [419, 629],
    ],
  );
  for (const entry of proposal.items) {
    const { startMinute, endMinute } = entry.bestWindow;
    assert.ok(
      (startMinute >= 0 && endMinute <= 210) ||
        (startMinute >= 419 && endMinute <= 629),
    );
  }
  // Without spans the list is the one of before.
  assert.equal(
    list([{ card: middle, score: scored(90, 200) }]).spans,
    undefined,
  );
});

test("a period that is over leaves an empty list, and no stretch", () => {
  const spans = [{ start: at(0), end: at(210) }];
  const proposal = autoFillNight({
    candidates: [{ card: card("early", 60), score: scored(70, 300) }],
    night,
    span: { start: at(333), end: at(length) },
    items: [],
    hourly: [],
    moonSeries: [],
    ownedFilters: [],
    mode: "imaging",
    count: 10,
    layout: "list",
    history: [],
    spans,
  });
  assert.equal(proposal.items.length, 0);
  assert.deepEqual(proposal.spans, []);
});

test("the score is the one over the periods: a target high only a little of it is worth less", () => {
  const high = card("high", 315);
  const night30 = scored(80, 300);
  const middle = suggestionPeriodSpans(night, ["start"]);
  const proposal = list([{ card: high, score: night30 }], middle);
  const [only] = proposal.items;
  assert.ok(only.score.total < 80);
  assert.equal(
    only.score.total,
    targetWindowsScore({
      score: night30,
      card: high,
      windows: cardWithinSpans(high, middle).visibilityWindows,
    }).total,
  );
  // The same request without periods keeps the night's score.
  assert.equal(list([{ card: high, score: night30 }]).items[0].score.total, 80);
});

test("the window score: never above the night's, capped under the short window", () => {
  const high = card("high", 315);
  const night30 = scored(80, 300);
  assert.deepEqual(
    targetWindowsScore({
      score: night30,
      card: high,
      windows: [{ start: at(300), end: at(330) }],
    }),
    // 30 minutes: under 45, the cap (49/100) applies.
    { total: 49, max: 100 },
  );
  assert.deepEqual(
    targetWindowsScore({ score: night30, card: high, windows: [] }),
    { total: 80, max: 100 },
  );
  assert.equal(
    targetWindowsScore({ score: null, card: high, windows: [] }),
    null,
  );
});

test("the mask ignored: the list says the stretch behind it inside the best window", () => {
  const hidden = [{ start: at(61), end: at(136) }];
  const behind = card("behind", 60, { hidden });
  const clear = card("clear", 400, { hidden: [] });
  const proposal = list([
    { card: behind, score: scored(70, 300) },
    { card: clear, score: scored(60, 300) },
  ]);
  const byId = Object.fromEntries(
    proposal.items.map((entry) => [entry.target.id, entry]),
  );
  assert.deepEqual(byId.behind.maskHidden, hidden[0]);
  assert.equal(byId.clear.maskHidden, null);
  // A card without the field: nothing is said (the mask was not ignored).
  assert.equal(
    "maskHidden" in
      list([{ card: card("plain", 60), score: scored(70, 300) }]).items[0],
    false,
  );
});

test("« Voir N cibles » counts the targets with a long enough window in the periods", () => {
  const candidates = [
    { card: card("early", 60) },
    { card: card("middle", 315, { width: 120 }) },
    { card: card("late", 560) },
  ];
  assert.equal(suggestionFilteredCount({ candidates }), 3);
  assert.equal(
    suggestionFilteredCount({
      candidates,
      spans: suggestionPeriodSpans(night, ["start", "end"]),
    }),
    2,
  );
  assert.equal(
    suggestionFilteredCount({
      candidates,
      spans: suggestionPeriodSpans(night, ["middle"]),
      minimumMinutes: 20,
    }),
    3,
  );
});
