import assert from "node:assert/strict";
import test from "node:test";
import {
  tonightSuggestions,
  tonightVisibleSuggestions,
  tonightSuggestionPosition,
} from "../src/tonight-suggestions.js";
import { tonightWords } from "../src/tonight-words.js";
import { message } from "portal/i18n.js";
import { shippedLocales } from "astro-contracts/locales";
import { base } from "./helpers/suggestion-cases.mjs";
const options = {
  ...base,
  place: { id: "test", latitude: 45, longitude: -30 },
  date: "2026-10-14",
  night: {
    darkStart: base.night.start,
    darkEnd: base.night.end,
    moonSeries: [],
  },
};
const ids = (r) => r.candidates.map((c) => c.id);
test("three rows with a plan, four without, and ten expanded", () => {
  const p = tonightSuggestions(options);
  assert.equal(p.candidates.length, 10);
  assert.equal(tonightVisibleSuggestions(p, true).length, 3);
  assert.equal(tonightVisibleSuggestions(p, false).length, 4);
  assert.equal(tonightVisibleSuggestions(p, true, true).length, 10);
});
test("all plans of the night exclude their targets before ranking", () => {
  const first = tonightSuggestions(options);
  const excluded = ids(first).slice(0, 3);
  const p = tonightSuggestions({
    ...options,
    plans: [
      { items: [{ id: excluded[0] }] },
      { items: excluded.slice(1).map((id) => ({ id })) },
    ],
  });
  assert.equal(p.items.length, 10);
  assert.ok(ids(p).every((id) => !excluded.includes(id)));
});
test("seeded tiers repeat and refresh shows the next ten with no overlap", () => {
  const a = tonightSuggestions(options),
    b = tonightSuggestions({ ...options, tier: 2 });
  assert.deepEqual(tonightSuggestions(options), a);
  assert.deepEqual(b.position, { from: 11, to: 20 });
  assert.ok(ids(b).every((id) => !ids(a).includes(id)));
});
test("projection keeps each target own best window, score and engine order", () => {
  const p = tonightSuggestions(options);
  assert.deepEqual(
    ids(p),
    p.items.map((i) => i.target.id),
  );
  for (let i = 0; i < p.items.length; i++) {
    assert.equal(p.candidates[i].windowStart, p.items[i].bestWindow.start);
    assert.equal(p.candidates[i].windowEnd, p.items[i].bestWindow.end);
    assert.equal(
      p.candidates[i].score,
      options.candidates.find((c) => c.card.target.id === p.items[i].target.id)
        .score,
    );
  }
});
test("position persists in memory and resets on a different place or date", () => {
  assert.deepEqual(tonightSuggestionPosition("date/place", { tier: 2 }), {
    key: "date/place",
    tier: 2,
    exhausted: false,
  });
  assert.equal(tonightSuggestionPosition("date/place").tier, 2);
  assert.equal(tonightSuggestionPosition("date/otherplace").tier, 1);
  assert.equal(tonightSuggestionPosition("otherdate/otherplace").tier, 1);
});
test("all ten languages carry every new word and French matches the drawing", () => {
  for (const locale of shippedLocales())
    for (const key of [
      "tonightSeeMore",
      "tonightSeeLess",
      "tonightRefreshSuggestions",
      "tonightRefreshTargets",
      "tonightCreateSuggestions",
      "tonightSuggestionsNoPlace",
      "tonightCreatePlanWithTargets",
      "tonightCandidateWindow",
      "tonightCulminates",
    ]) {
      assert.notEqual(message(locale, key), key, `${locale}/${key}`);
      assert.ok(message(locale, key).trim());
    }
  // The words of the list's "see more" and "see less" controls.
  assert.equal(message("fr", "tonightSeeMore"), "Voir plus");
  assert.equal(message("fr", "tonightSeeLess"), "Voir moins");
  assert.equal(message("fr", "tonightSeeTen"), "tonightSeeTen");
  assert.equal(
    message("fr", "tonightCreateSuggestions"),
    "Créer un plan avec ces cibles",
  );
  // The footer of the one-step dialog.
  assert.equal(
    message("fr", "tonightCreatePlanWithTargets"),
    "Créer le plan avec ces cibles",
  );
  assert.equal(
    message("fr", "tonightRefreshTargets"),
    "Proposer d’autres cibles",
  );
});
test("web row states its own clock range, culmination and normalized score", () => {
  const candidate = {
    id: "m31",
    designation: "M31",
    name: "Galaxie d’Andromède",
    windowStart: "2026-10-14T21:05:00Z",
    windowEnd: "2026-10-15T01:20:00Z",
    maxAltitude: 86,
    note: { kind: "moon-down" },
    score: { total: 43, max: 50 },
  };
  const words = tonightWords(
    {
      state: "ready",
      place: { name: "Test" },
      date: options.date,
      night: {
        darkness: "astronomical",
        start: options.night.darkStart,
        end: options.night.darkEnd,
        minutes: 720,
      },
      timeline: {
        start: options.night.darkStart,
        end: options.night.darkEnd,
        darkStart: options.night.darkStart,
        darkEnd: options.night.darkEnd,
        moonUp: [],
      },
      moon: { event: "down", illumination: 17 },
      plans: [],
      candidates: [candidate],
    },
    { locale: "fr", timeZone: "UTC" },
  );
  assert.equal(words.candidates[0].window, "21:05 → 01:20");
  assert.equal(words.candidates[0].altitude, "Culmine à 86° · Lune couchée");
  // "total/100": a score out of 50 is brought to 100, not typed here.
  assert.match(words.candidates[0].score, /^\d{1,3}\/100$/);
  assert.equal(
    words.candidates[0].score,
    `${Math.round((candidate.score.total / candidate.score.max) * 100)}/100`,
  );
});

test("every web suggestion keeps the engine's order and its Moon note", () => {
  const candidate = (id, maxAltitude) => ({
    id,
    designation: id.toUpperCase(),
    name: null,
    windowStart: "2026-10-14T21:05:00Z",
    windowEnd: "2026-10-15T01:20:00Z",
    maxAltitude,
    note: { kind: "moon-down" },
    score: { total: 43, max: 50 },
  });
  const words = tonightWords(
    {
      state: "ready",
      place: { name: "Test" },
      date: options.date,
      night: {
        darkness: "astronomical",
        start: options.night.darkStart,
        end: options.night.darkEnd,
        minutes: 720,
      },
      timeline: {
        start: options.night.darkStart,
        end: options.night.darkEnd,
        darkStart: options.night.darkStart,
        darkEnd: options.night.darkEnd,
        moonUp: [],
      },
      moon: { event: "down", illumination: 17 },
      plans: [],
      candidates: [
        candidate("m31", 86),
        candidate("m33", 74),
        candidate("m13", 61),
      ],
    },
    { locale: "fr", timeZone: "UTC" },
  );
  assert.deepEqual(
    words.candidates.map((row) => row.designation),
    ["M31", "M33", "M13"],
  );
  assert.deepEqual(
    words.candidates.map((row) => row.altitude),
    [
      "Culmine à 86° · Lune couchée",
      "Culmine à 74° · Lune couchée",
      "Culmine à 61° · Lune couchée",
    ],
  );
});

test("overview passes captured history and continuing goals to the shared engine", () => {
  const p = tonightSuggestions({
    ...options,
    history: [{ id: "t00", date: "2026-10-03", outcome: "done" }],
    continuing: [
      {
        id: "t20",
        acquiredMinutes: 250,
        goalMinutes: 720,
        projectName: "NGC 7000",
      },
    ],
  });
  assert.ok(!ids(p).includes("t00"));
  assert.equal(p.items[0].target.id, "t20");
  assert.equal(p.items[0].group, "continue");
  assert.equal(p.captured[0].target.id, "t00");
});
