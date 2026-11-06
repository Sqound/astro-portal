import assert from "node:assert/strict";
import test from "node:test";

import { planNight, planNightSpanSky } from "../src/planner.js";
import { withHorizonMask } from "../src/recommendations.js";
import { targetNightPath } from "../src/target-path.js";
import {
  compareTonightScores,
  targetSlotScore,
  targetTonightScore,
} from "../src/target-score.js";
import { tonightSuggestions } from "../src/tonight-suggestions.js";
import { scoreOn100 } from "portal/written-forms.js";

// The night of Tuesday 3 November 2026, rebuilt at a fictitious place
// (36.5° N, 138° E): the six cards of the list « 11 à 20 », planned by the
// real planNight in visual (114/900, 1.5° of field), a sky of 18.1
// mag/arcsec², a mask enabled at 0°, and a forecast whose clouds, gusts and
// dew give the notes of the captures (54, 54, 59, 65, 62, 59).

const place = {
  latitude: 36.5,
  longitude: 138,
  elevation: 0,
  timeZone: "Asia/Tokyo",
};
const date = "2026-11-03";
const target = (id, designation, ra, dec, size, magnitude, typeKey) => ({
  id,
  designation,
  title: designation,
  apparentSizeArcmin: size,
  integratedMagnitude: magnitude,
  skyTarget: { typeKey },
  coordinate: { ra: ra * 15, dec },
  source: designation,
  tags: [],
});
// The catalogue's values (the device's index, `target_index/en.json.gz`).
const targets = [
  target("m13", "M13", 16.6949, 36.4613, [16.5, 16.5], 5.8, "Amas globulaire"),
  target(
    "m57",
    "M57",
    18.8931,
    33.0286,
    [1.3, 1.3],
    8.8,
    "Nébuleuse planétaire",
  ),
  target(
    "m27",
    "M27",
    19.9934,
    22.721,
    [6.7, 6.7],
    7.4,
    "Nébuleuse planétaire",
  ),
  target(
    "ic5146",
    "IC 5146",
    21.8913,
    47.2669,
    [10, 10],
    7.2,
    "Nébuleuse en émission",
  ),
  target(
    "ic1848",
    "IC 1848",
    2.8529,
    60.4025,
    [40, 10],
    6.5,
    "Nébuleuse en émission",
  ),
  target("m45", "M45", 3.7913, 24.1053, [150, 150], 1.2, "Amas ouvert"),
];
const visualProfile = {
  mode: "visual",
  apertureMm: 114,
  focalLengthMm: 900,
  magnification: 36,
  exitPupilMm: 114 / 36,
  visualFieldDiameterDegrees: 1.5,
  filters: [],
};
const mask = {
  enabled: true,
  points: Array.from({ length: 12 }, (_, index) => ({
    azimuth: index * 30,
    altitude: 0,
  })),
};
// Hour by hour (UTC): clear at 10:00 and 11:00, thicker from 13:00, overcast
// with dew from 16:00; gusts of 17 km/h at 09:00, over the mount's limit at
// 10:00, near it at 14:00.
const clouds = { 9: 50, 10: 0, 11: 0, 12: 10, 13: 32, 14: 32, 15: 33 };
const gusts = { 9: 17, 10: 35, 14: 26 };
const hourly = Array.from({ length: 11 }, (_, index) => {
  const hour = 9 + index;
  return {
    time: Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`),
    cloud: clouds[hour] ?? 100,
    humidity: 80,
    wind: 5,
    gust: gusts[hour] ?? 12,
    dewRisk: hour >= 16 ? "high" : "low",
  };
});
const skyQuality = { sqm: 18.1, bortleClass: 8 };

function nightOfNovember3(profile = visualProfile) {
  const sky = planNightSpanSky({ date, darkness: "astronomical" }, place);
  const night = planNight({
    date,
    location: place,
    targets,
    profile,
    locale: "fr",
    minAltitude: 30,
    moonSeparationMinimum: 25,
    planetReferences: { planets: [] },
    darkness: "astronomical",
    skyQuality,
  });
  const cards = withHorizonMask(night.cards, mask, 30, 25, {});
  const scored = new Map(
    cards.map((card) => [
      card.target.designation,
      {
        card,
        score: targetTonightScore({
          card,
          window: {
            start: sky.start,
            end: sky.end,
            darkStart: sky.darkStart,
            darkEnd: sky.darkEnd,
            moonIllumination: night.moonIllumination,
          },
          hourly,
          moonSeries: sky.moonSeries,
          skyQuality,
          skyDirection: null,
          maskPath: targetNightPath({
            series: card.series,
            mask,
            minAltitude: 30,
            moonSeparationMinimum: card.constraints?.moonSeparationMinimum ?? 0,
          }),
          equipment: { field: night.field, mode: profile.mode, filters: [] },
          ownedFilters: [],
          windTolerance: { preset: "standard" },
          minAltitude: 30,
        }),
      },
    ]),
  );
  return { sky, scored };
}

const six = ["M13", "M57", "M27", "IC 5146", "IC 1848", "M45"];

// Before this lot (commit « pin the six notes … (characterization) »): 54,
// 54, 59, 65, 62, 59, « Hauteur et durée » 4, 12, 15, 21, 22, 24 / 25 (the
// minutes above 40° over the whole night), the order IC 5146 > IC 1848 >
// M27 = M45 > M13 = M57.
test("the night of 3 November: the useful window, the evening and the short window", () => {
  const { scored } = nightOfNovember3();
  const read = (key) => six.map((name) => key(scored.get(name).score));
  assert.deepEqual(
    read((score) => score.criteria[0].facts.usableMinutes),
    [30, 154, 195, 368, 629, 518],
  );
  // 15 × a / 60 + 15 × min(D, 120) / 120, in visual.
  assert.deepEqual(
    read((score) => score.criteria[0].points),
    [8, 25, 27, 30, 27, 30],
  );
  assert.deepEqual(
    read((score) => score.criteria[0].max),
    [30, 30, 30, 30, 30, 30],
  );
  // The evening (19:17 to 23:31 at the place): M13 is gone by 18:47.
  assert.deepEqual(
    read((score) => score.bonus),
    [0, 2, 3, 5, 5, 4],
  );
  assert.deepEqual(
    read((score) => score.total),
    [49, 64, 69, 74, 67, 64],
  );
  // M13: 31 min of window, capped at 49 (it would score 53).
  const m13 = scored.get("M13").score;
  assert.deepEqual(m13.cap, {
    minutes: 30,
    limit: 45,
    ceiling: 49,
    uncapped: 53,
  });
  assert.equal(m13.verdict, "difficult");
  for (const name of six.slice(1))
    assert.equal(scored.get(name).score.cap, null);
  // The new order: IC 5146 > M27 > IC 1848 > M57 = M45 > M13.
  const order = [...six].sort(
    (left, right) =>
      compareTonightScores(scored.get(left).score, scored.get(right).score) ||
      six.indexOf(left) - six.indexOf(right),
  );
  assert.deepEqual(order, ["IC 5146", "M27", "IC 1848", "M57", "M45", "M13"]);
});

test("the night of 3 November in photo: no evening bonus, full window from 4 h", () => {
  const { scored } = nightOfNovember3({
    mode: "imaging",
    focalLengthMm: 400,
    sensorWidthMm: 23.5,
    sensorHeightMm: 15.7,
    apertureMm: 80,
    filters: [],
  });
  for (const name of six) {
    const { score } = scored.get(name);
    assert.equal(score.bonus, 0, name);
    assert.equal(score.criteria[0].facts.eveningBonus, null, name);
    assert.equal(score.criteria[0].facts.fullMinutes, 240, name);
    assert.equal(score.criteria[0].facts.mode, "photo", name);
  }
  // M57 (2 h 34) is not full in photo; IC 5146 (6 h 08) is.
  assert.equal(scored.get("M57").score.criteria[0].points, 20);
  assert.equal(scored.get("IC 5146").score.criteria[0].points, 30);
  assert.equal(scored.get("M13").score.cap?.minutes, 30);
});

// A target at 60° all night long, observed in the windows given: the rule
// alone (no Moon, forecast, sky, mask or field: only « Hauteur et durée »
// is counted, out of 30).
const night = {
  start: "2026-11-03T09:00:00.000Z",
  end: "2026-11-03T19:00:00.000Z",
};
const at = (minute) =>
  new Date(Date.parse(night.start) + minute * 60000).toISOString();
const flat = Array.from({ length: 61 }, (_, index) => ({
  time: at(index * 10),
  altitude: 60,
  azimuth: 180,
  moonSeparation: 120,
}));
function windowScore(windows, { mode = "imaging", ...rest } = {}) {
  return targetTonightScore({
    card: {
      target: { id: "t", designation: "T" },
      series: flat,
      visibilityWindows: windows.map(([from, to]) => ({
        start: at(from),
        end: at(to),
      })),
      minAltitude: 30,
    },
    window: night,
    equipment: { mode },
    minAltitude: 30,
    ...rest,
  });
}

test("the cap: 44 min is a short window, 45 and 46 are not", () => {
  const short = windowScore([[60, 104]]);
  assert.equal(short.criteria[0].facts.usableMinutes, 44);
  assert.equal(short.max, 30);
  // 49 % of 30.
  assert.deepEqual(short.cap, {
    minutes: 44,
    limit: 45,
    ceiling: 14,
    uncapped: 13,
  });
  assert.equal(short.total, 13);
  assert.equal(short.verdict, "difficult");
  for (const minutes of [45, 46]) {
    const score = windowScore([[60, 60 + minutes]]);
    assert.equal(score.criteria[0].facts.usableMinutes, minutes);
    assert.equal(score.cap, null, `${minutes} min`);
  }
  // Two windows add up: 20 + 25 min is not short.
  assert.equal(
    windowScore([
      [0, 20],
      [300, 325],
    ]).cap,
    null,
  );
  // No window at all: 0 min, capped.
  assert.equal(windowScore([]).cap?.minutes, 0);
});

test("the cap on a reduced maximum: 44 on 90; no cap without the criterion", () => {
  const hourly = Array.from({ length: 10 }, (_, index) => ({
    time: Date.parse(night.start) + index * 3600000,
    cloud: 0,
    humidity: 60,
    wind: 2,
    gust: 4,
  }));
  const full = {
    hourly,
    moonSeries: flat.map((point) => ({ time: point.time, altitude: -10 })),
    window: { ...night, moonIllumination: 0 },
    skyQuality: { sqm: 22 },
    maskPath: {
      maskEnabled: true,
      segments: [{ state: "visible", start: at(60), end: at(90) }],
    },
  };
  const score = windowScore([[60, 90]], full);
  // Altitude 30, Moon 15, weather 20, sky 10, mask 5, wind 10: 90 (no size).
  assert.equal(score.max, 90);
  assert.equal(score.cap.ceiling, 44);
  assert.equal(score.total, 44);
  // Without a mask: 85, capped at 42, which still reads 49 on 100.
  const { maskPath, ...withoutMask } = full;
  const reduced = windowScore([[60, 90]], withoutMask);
  assert.ok(maskPath);
  assert.equal(reduced.max, 85);
  assert.equal(reduced.cap.ceiling, 42);
  assert.equal(scoreOn100(reduced), 49);
  const unscored = targetTonightScore({
    card: { target: { id: "t" }, series: [] },
    window: night,
    hourly,
    skyQuality: { sqm: 22 },
  });
  assert.equal(unscored.criteria[0].available, false);
  assert.equal(unscored.cap, null);
});

test("the useful window grows the note up to 4 h in photo, 2 h in visual", () => {
  for (const [mode, full] of [
    ["imaging", 240],
    ["visual", 120],
  ]) {
    let previous = -1;
    for (let minutes = 0; minutes <= 300; minutes += 15) {
      const score = windowScore([[0, minutes]], { mode });
      const points = score.criteria[0].points;
      assert.ok(points >= previous, `${mode} ${minutes} min`);
      // 10 points for 60°, 15 for the window once full.
      if (minutes >= full) assert.equal(points, 25, `${mode} ${minutes} min`);
      else assert.ok(points < 25, `${mode} ${minutes} min`);
      previous = points;
    }
  }
  // 15 × 40 / 60 + 15 × 60 / 240 = 13.75.
  assert.equal(windowScore([[0, 60]]).criteria[0].points, 14);
  // In visual the same hour is half of the full window: 10 + 7.5.
  assert.equal(
    windowScore([[0, 60]], { mode: "visual" }).criteria[0].points,
    18,
  );
});

test("visual evening: a bonus for the evening, nothing lost after midnight, nothing in photo", () => {
  // The night 09:00–19:00: the evening runs 10:00–14:00 (240 min).
  const evening = windowScore([[60, 300]], { mode: "visual" });
  assert.deepEqual(evening.criteria[0].facts.eveningBonus, {
    points: 5,
    minutes: 240,
    from: at(60),
    to: at(300),
  });
  assert.equal(evening.bonus, 5);
  assert.equal(evening.total, 30); // 25 + 5, never above the maximum
  const half = windowScore([[180, 300]], { mode: "visual" });
  assert.equal(half.bonus, 3); // 120 of 240 min: 2.5 → 3
  assert.equal(half.total, Math.min(30, half.criteria[0].points + 3));
  const late = windowScore([[300, 600]], { mode: "visual" });
  assert.equal(late.bonus, 0);
  assert.equal(late.criteria[0].facts.eveningBonus, null);
  assert.equal(late.total, late.criteria[0].points);
  // The first hour of the dark night does not count.
  assert.equal(windowScore([[0, 60]], { mode: "visual" }).bonus, 0);
  // The dark night given apart from the night scored (a custom span).
  const span = windowScore([[60, 300]], {
    mode: "visual",
    window: { ...night, darkStart: at(120), darkEnd: night.end },
  });
  assert.equal(span.criteria[0].facts.eveningBonus.from, at(180));
  assert.equal(windowScore([[60, 300]]).bonus, 0); // photo
});

test("a slot never scores above the night, cap included", () => {
  const capped = nightOfNovember3().scored.get("M13");
  const slot = targetSlotScore({
    score: capped.score,
    card: capped.card,
    start: capped.card.visibilityWindows[0].start,
    end: capped.card.visibilityWindows[0].end,
  });
  assert.ok(slot.total <= capped.score.total);
  assert.equal(slot.max, capped.score.max);
  const long = nightOfNovember3().scored.get("IC 5146");
  // At its culmination the slot keeps the night's note.
  assert.equal(
    targetSlotScore({
      score: long.score,
      card: long.card,
      start: long.card.visibilityWindows[0].start,
      end: long.card.visibilityWindows[0].end,
    }).total,
    long.score.total,
  );
});

test("the list's pages: chronological, each target with its rank", () => {
  const { sky, scored } = nightOfNovember3();
  const candidates = [...scored.values()];
  const proposal = tonightSuggestions({
    candidates,
    plans: [],
    place: { ...place, id: "reference" },
    date,
    night: sky,
    tier: 1,
    hourly: [],
    mode: "visual",
    ownedFilters: [],
    history: [],
    continuing: [],
  });
  const items = proposal.items;
  assert.equal(items.length, 6);
  // Laid out by start …
  const starts = items.map((item) => item.startMinute);
  assert.deepEqual(
    starts,
    [...starts].sort((a, b) => a - b),
  );
  // … each with its rank: 1 to 6, M13 (capped) last.
  assert.deepEqual(
    [...items.map((item) => item.rank)].sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(items.find((item) => item.target.id === "m13").rank, 6);
});

test("the second page: ranks 11 and on, laid out by start", () => {
  const { sky, scored } = nightOfNovember3();
  // Twelve candidates: the six and a copy of each.
  const candidates = [...scored.values()].flatMap(({ card, score }) => [
    { card, score },
    {
      card: { ...card, target: { ...card.target, id: `${card.target.id}-b` } },
      score,
    },
  ]);
  const page = (tier) =>
    tonightSuggestions({
      candidates,
      plans: [],
      place: { ...place, id: "reference" },
      date,
      night: sky,
      tier,
      hourly: [],
      mode: "visual",
      ownedFilters: [],
      history: [],
      continuing: [],
    }).items;
  const second = page(2);
  assert.ok(second.length > 0);
  for (const item of second) assert.ok(item.rank >= 11, `${item.rank}`);
  const starts = second.map((item) => item.startMinute);
  assert.deepEqual(
    starts,
    [...starts].sort((a, b) => a - b),
  );
  assert.deepEqual(
    page(1)
      .map((item) => item.rank)
      .sort((a, b) => a - b),
    page(1).map((_, index) => index + 1),
  );
});
