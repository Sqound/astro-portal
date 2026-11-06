import assert from "node:assert/strict";
import test from "node:test";

import {
  filterAdviceForNight,
  filterAdviceMinimumMinutes,
  filterMoonIlluminationPercent,
  narrowbandFilterFamilies,
} from "planner/filters.js";

// The advice on filters for a night, from the Moon. It returns keys and
// instants; the sentences are words of each platform.

const iso = (hour, minute = 0) =>
  new Date(Date.UTC(2026, 9, 14, hour, minute)).toISOString();
const series = (altitudes, startHour = 20) =>
  altitudes.map((altitude, index) => ({
    time: iso(startHour + index),
    altitude,
  }));
const night = (moonIllumination) => ({
  start: iso(20),
  end: iso(29),
  moonIllumination,
});
const dual = { id: "f-1", name: "Double bande Hα/OIII 7 nm" };
const broadband = { id: "f-2", name: "UV/IR cut" };
const uhc = { id: "f-3", name: "Anti-pollution", family: "uhc" };
// The Moon sets at 21:05 (1° at 21:00, −11° at 22:00).
const sets = series([10, 1, -11, -25, -38, -48, -50, -44, -33, -20]);
const up = series([20, 33, 44, 52, 55, 52, 44, 33, 20, 8]);
const shape = (advice) =>
  advice.map((item) => [item.key, item.span, item.from, item.to]);

test("the sample evening: dual-band until the Moon sets at 21:05, broadband after", () => {
  const advice = filterAdviceForNight({
    ownedFilters: [dual, broadband, uhc],
    moonSeries: sets,
    night: night(55),
  });
  assert.deepEqual(advice, [
    {
      key: "moon-up-narrowband",
      from: iso(20),
      to: iso(21, 5),
      span: "start",
      filterFamily: "dual",
      targetKind: "emission",
    },
    {
      key: "moon-down-broadband",
      from: iso(21, 5),
      to: iso(29),
      span: "end",
      filterFamily: "broadband",
      targetKind: "galaxy",
    },
  ]);
});

test("the threshold is 30 % lit: at it the Moon is dim, above it the narrowband counts", () => {
  assert.equal(filterMoonIlluminationPercent, 30);
  const owned = [dual, broadband];
  assert.deepEqual(
    shape(
      filterAdviceForNight({
        ownedFilters: owned,
        moonSeries: up,
        night: night(30),
      }),
    ),
    [["moon-dim-broadband", "whole", iso(20), iso(29)]],
  );
  assert.deepEqual(
    shape(
      filterAdviceForNight({
        ownedFilters: owned,
        moonSeries: up,
        night: night(31),
      }),
    ),
    [["moon-up-narrowband", "whole", iso(20), iso(29)]],
  );
});

test("a Moon that rises later puts the broadband first, the narrowband after", () => {
  const advice = filterAdviceForNight({
    ownedFilters: [dual, broadband],
    moonSeries: series([-40, -30, -18, -6, 6, 20, 33, 44, 52, 55]),
    night: night(70),
  });
  assert.deepEqual(
    advice.map((item) => [item.key, item.span]),
    [
      ["moon-down-broadband", "start"],
      ["moon-up-narrowband", "end"],
    ],
  );
  assert.equal(advice[0].to, advice[1].from);
});

test("a Moon that rises and sets inside the night gives three stretches", () => {
  const advice = filterAdviceForNight({
    ownedFilters: [dual, broadband],
    moonSeries: series([-30, -18, -6, 8, 20, 12, -2, -14, -26, -38]),
    night: night(65),
  });
  assert.deepEqual(
    advice.map((item) => [item.key, item.span]),
    [
      ["moon-down-broadband", "start"],
      ["moon-up-narrowband", "middle"],
      ["moon-down-broadband", "end"],
    ],
  );
});

test("without an owned narrowband filter the advice names the family that would help", () => {
  const advice = filterAdviceForNight({
    ownedFilters: [broadband, uhc],
    moonSeries: sets,
    night: night(55),
  });
  assert.deepEqual(
    advice.map((item) => [item.key, item.filterFamily]),
    [
      ["moon-up-narrowband-missing", "dual"],
      ["moon-down-broadband", "broadband"],
    ],
  );
  // A light-pollution filter is not narrowband.
  assert.equal(narrowbandFilterFamilies.includes("uhc"), false);
  const bare = filterAdviceForNight({
    ownedFilters: [],
    moonSeries: sets,
    night: night(55),
  });
  assert.deepEqual(
    bare.map((item) => item.key),
    ["moon-up-narrowband-missing", "moon-down-broadband-missing"],
  );
});

test("the owned narrowband family comes in the order dual, Hα, O III, S II, Hβ", () => {
  const family = (...families) =>
    filterAdviceForNight({
      ownedFilters: families.map((name, index) => ({
        id: `f-${index}`,
        name,
        family: name,
      })),
      moonSeries: sets,
      night: night(55),
    })[0].filterFamily;
  assert.equal(family("hb", "sii", "oiii", "ha", "dual"), "dual");
  assert.equal(family("hb", "sii", "oiii", "ha"), "ha");
  assert.equal(family("hb", "sii", "oiii"), "oiii");
  assert.equal(family("hb", "sii"), "sii");
  assert.equal(family("hb"), "hb");
});

test("a filter that names no family is read from its name", () => {
  const advice = filterAdviceForNight({
    ownedFilters: [{ name: "L-eXtreme" }, { name: "Clear" }],
    moonSeries: sets,
    night: night(55),
  });
  assert.deepEqual(
    advice.map((item) => [item.key, item.filterFamily]),
    [
      ["moon-up-narrowband", "dual"],
      ["moon-down-broadband", "broadband"],
    ],
  );
});

test("a dim Moon needs no series; a bright one cannot be told without it", () => {
  assert.deepEqual(
    filterAdviceForNight({
      ownedFilters: [broadband],
      moonSeries: [],
      night: night(5),
    }).map((item) => item.key),
    ["moon-dim-broadband"],
  );
  assert.deepEqual(
    filterAdviceForNight({
      ownedFilters: [dual],
      moonSeries: [],
      night: night(55),
    }),
    [],
  );
  assert.deepEqual(filterAdviceForNight({ ownedFilters: [dual] }), []);
  assert.deepEqual(filterAdviceForNight(), []);
  assert.deepEqual(
    filterAdviceForNight({
      ownedFilters: [dual],
      moonSeries: sets,
      night: { start: iso(20), end: iso(29) },
    }),
    [],
  );
});

test("a stretch shorter than a quarter of an hour is absorbed by its neighbour", () => {
  assert.equal(filterAdviceMinimumMinutes, 15);
  // Above the horizon for five minutes at the start of the night.
  const brief = filterAdviceForNight({
    ownedFilters: [dual, broadband],
    moonSeries: [
      { time: iso(20), altitude: 0.5 },
      { time: iso(20, 10), altitude: -0.5 },
      ...series([-10, -22, -35, -44, -50, -48, -40, -30], 21),
    ],
    night: night(60),
  });
  assert.deepEqual(shape(brief), [
    ["moon-down-broadband", "whole", iso(20), iso(29)],
  ]);
});

test("the window defaults to the series, and instants may be milliseconds", () => {
  const fromSeries = filterAdviceForNight({
    ownedFilters: [dual, broadband],
    moonSeries: sets,
    night: { moonIllumination: 55 },
  });
  const milliseconds = filterAdviceForNight({
    ownedFilters: [dual, broadband],
    moonSeries: sets.map((point) => ({
      ...point,
      time: Date.parse(point.time),
    })),
    night: {
      start: Date.parse(iso(20)),
      end: Date.parse(iso(29)),
      moonIllumination: 55,
    },
  });
  assert.deepEqual(shape(fromSeries), shape(milliseconds));
  assert.deepEqual(shape(fromSeries)[0], [
    "moon-up-narrowband",
    "start",
    iso(20),
    iso(21, 5),
  ]);
});

test("the advice carries keys and families, never a sentence or a brand", () => {
  const advice = filterAdviceForNight({
    ownedFilters: [{ id: "f-1", name: "Marque X Duo-band", family: "dual" }],
    moonSeries: sets,
    night: night(55),
  });
  assert.equal(JSON.stringify(advice).includes("Marque"), false);
  for (const item of advice)
    assert.deepEqual(Object.keys(item).sort(), [
      "filterFamily",
      "from",
      "key",
      "span",
      "targetKind",
      "to",
    ]);
});
