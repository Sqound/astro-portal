import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

import {
  visibleTargetFromLibrary,
  visibleTargetsPool,
  visibleTargetsRows,
  visibleTargetsSpan,
} from "../dist/visible-targets.js";

await registerJsx();
const { NightTargetsPicker, VisibleThatNight } =
  await import("planner/components/NightTargetsPicker.js");

// "Visible that night" of "Add a target" on the web: the pool, the span a
// session is judged over, the rows. The height is `visibleThatNight`; what is
// tested here is what the list adds to it — the pool of the Essentielles and
// the favourites, what the session already holds, the highest first, twenty at
// most, and the session without a place that gets no list.

const place = {
  name: "Col des Étoiles",
  latitude: 45,
  longitude: -30,
  timeZone: "UTC",
};
// At 45° N, 30° W in the October night a target of 23 h, +45° crosses the
// meridian near the zenith; one of 12 h, −50° never leaves the horizon.
const pool = visibleTargetsPool(
  [
    { id: "high", designation: "H", ra: 23, dec: 45 },
    { id: "low", designation: "L", ra: 12, dec: -50 },
    { id: "mid", designation: "M", ra: 1.2, dec: 30 },
  ],
  [
    { id: "high", designation: "H again", ra: 23, dec: 45 },
    { id: "fav", designation: "F", ra: 0.5, dec: 38 },
    { id: "nocoord", designation: "N", ra: null, dec: 10 },
    { designation: "no id", ra: 1, dec: 1 },
  ],
);

test("the pool: one row per identifier, the first list first, rows without an identifier or a coordinate dropped", () => {
  assert.deepEqual(
    pool.map((target) => target.id),
    ["high", "low", "mid", "fav"],
  );
  assert.equal(pool[0].designation, "H");
  // A row of the planner's route is in degrees, one of the library's in hours.
  assert.equal(
    visibleTargetFromLibrary(
      { id: "a", designation: "A", coordinate: { ra: 345, dec: 45 } },
      { degrees: true },
    ).ra,
    23,
  );
  assert.equal(
    visibleTargetFromLibrary({ id: "a", coordinate: { ra: 23, dec: 45 } }).ra,
    23,
  );
});

test("the span: the plan's place with its mask, else the recorded one; the real hours only when both are ordered; none without a place or a night", () => {
  const withMask = { ...place, horizonMask: { enabled: true, points: [] } };
  const span = visibleTargetsSpan({
    planPlace: withMask,
    recordedPlace: { latitude: 10, longitude: 10 },
    date: "2026-10-10",
    start: "2026-10-10T20:00:00.000Z",
    end: "2026-10-11T02:00:00.000Z",
  });
  assert.equal(span.place.horizonMask, withMask.horizonMask);
  assert.equal(span.from, "2026-10-10T20:00:00.000Z");
  assert.equal(
    visibleTargetsSpan({
      planPlace: null,
      recordedPlace: { latitude: "45", longitude: "-30" },
      date: "2026-10-10",
      start: "2026-10-11T02:00:00.000Z",
      end: "2026-10-10T20:00:00.000Z",
    }).from,
    null,
    "hours in the wrong order: the whole night",
  );
  assert.equal(
    visibleTargetsSpan({
      planPlace: null,
      recordedPlace: null,
      date: "2026-10-10",
    }),
    null,
    "no place known: no list",
  );
  assert.equal(
    visibleTargetsSpan({ planPlace: place, date: "not a date" }),
    null,
  );
  assert.equal(
    visibleTargetsSpan({
      planPlace: { latitude: 120, longitude: 0 },
      date: "2026-10-10",
    }),
    null,
  );
});

test("the rows: the highest first above 30°, what the session holds left out, twenty at most, none without a span", () => {
  const span = visibleTargetsSpan({ planPlace: place, date: "2026-10-10" });
  const rows = visibleTargetsRows({ pool, span });
  assert.ok(rows.length >= 2);
  assert.equal(rows[0].id, "high");
  assert.ok(rows[0].maxAltitude > 80);
  assert.ok(!rows.some((row) => row.id === "low"), "never above 30°");
  assert.deepEqual(
    rows.map((row) => row.maxAltitude),
    [...rows.map((row) => row.maxAltitude)].sort((a, b) => b - a),
    "the highest first",
  );
  assert.ok(
    rows.every(
      (row) =>
        row.maxAltitude >= 30 &&
        Number.isFinite(Date.parse(new Date(row.at).toISOString())),
    ),
  );
  assert.ok(
    !visibleTargetsRows({ pool, span, taken: ["high"] }).some(
      (row) => row.id === "high",
    ),
    "a target already in the session",
  );
  assert.ok(
    !visibleTargetsRows({ pool, span, taken: ["H"] }).some(
      (row) => row.id === "high",
    ),
    "named by its designation too",
  );
  const crowd = visibleTargetsPool(
    Array.from({ length: 40 }, (_, index) => ({
      id: `t${index}`,
      designation: `T${index}`,
      ra: (23 + index / 20) % 24,
      dec: 40 + (index % 5),
    })),
  );
  assert.equal(visibleTargetsRows({ pool: crowd, span }).length, 20);
  assert.deepEqual(visibleTargetsRows({ pool, span: null }), []);
  assert.deepEqual(visibleTargetsRows({ pool: [], span }), []);
  // Judged over the hours of the session only: a target that culminates
  // outside them is judged at the nearer end.
  const early = visibleTargetsSpan({
    planPlace: place,
    date: "2026-10-10",
    start: "2026-10-10T20:00:00.000Z",
    end: "2026-10-10T20:30:00.000Z",
  });
  const inHours = visibleTargetsRows({ pool, span: early });
  const whole = visibleTargetsRows({ pool, span });
  assert.ok(inHours.length <= whole.length);
  assert.ok(
    inHours.every(
      (row) =>
        row.at >= Date.parse("2026-10-10T20:00:00.000Z") - 1 &&
        row.at <= Date.parse("2026-10-10T20:30:00.000Z") + 1,
    ),
  );
});

test("the list: the words in each language, a row with its height and its UTC hour, and nothing of it without a place", () => {
  const rows = [
    {
      id: "high",
      designation: "NGC 7000",
      name: "Amérique du Nord",
      typeKey: "nebula",
      photoUrl: null,
      maxAltitude: 62.4,
      at: Date.parse("2026-10-10T23:40:00.000Z"),
    },
  ];
  const draw = (locale) =>
    renderToStaticMarkup(createElement(VisibleThatNight, { locale, rows }))
      .replace(/<[^>]+>/g, " ")
      .replaceAll("\u00a0", " ")
      .replace(/\s+/g, " ");
  assert.ok(draw("fr").includes("Visibles cette nuit-là"));
  assert.ok(draw("fr").includes("NGC 7000 · Amérique du Nord"));
  assert.ok(draw("fr").includes("hauteur max 62° · 23:40"), draw("fr"));
  assert.ok(draw("en").includes("Visible that night"));
  assert.ok(draw("en").includes("max height 62° · 23:40"));
  assert.ok(draw("ja").includes("その夜に見えた対象"));
  assert.ok(draw("ja").includes("最大高度 62° · 23:40"));
  for (const locale of ["de", "es", "it", "pt-BR", "ru", "zh-Hans", "zh-Hant"])
    assert.ok(/62°/.test(draw(locale)) && /23:40/.test(draw(locale)), locale);
  // Without `visibleFor` the picker is the search alone: no section, no message.
  const alone = renderToStaticMarkup(
    createElement(NightTargetsPicker, {
      locale: "fr",
      sessionId: null,
      excludeIds: [],
      onPick() {},
    }),
  );
  assert.ok(!alone.includes("night-targets-visible"));
  assert.ok(alone.includes('role="combobox"'));
  const noPlace = renderToStaticMarkup(
    createElement(NightTargetsPicker, {
      locale: "fr",
      sessionId: null,
      excludeIds: [],
      visibleFor: { planPlace: null, recordedPlace: null, date: "2026-10-10" },
      onPick() {},
    }),
  );
  assert.ok(!noPlace.includes("night-targets-visible"));
});
