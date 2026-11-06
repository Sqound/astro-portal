import assert from "node:assert/strict";
import test from "node:test";

import { shippedLocales } from "astro-contracts/locales";
import { planNightSpanSky, planNightWindow } from "planner/planner.js";
import {
  tonightDate,
  tonightOverview,
  tonightSubject,
} from "planner/tonight-overview.js";
import { tonightDateLabel, tonightWords } from "planner/tonight-words.js";

// The words of "Cette nuit" on the web, and the subject of the page (its
// place, date and plans) read from a planner document.

const place = {
  id: "lac-noir",
  name: "Camping du Lac Noir",
  latitude: "45",
  longitude: "-30",
  timeZone: "Atlantic/Azores",
};
const date = "2026-10-14";
const night = planNightSpanSky({ date }, place);
const hour = 3600000;
const start = Math.ceil(Date.parse(night.darkStart) / hour) * hour;
const hourly = Array.from({ length: 6 }, (_, index) => ({
  time: start + index * hour,
  cloud: index === 2 ? 22 : 10,
  wind: 9,
  gust: index === 1 ? 17 : 12,
  temperature: 8,
  dewPoint: index >= 3 ? 5.5 : 2,
  humidity: 80,
  precipitation: [0, 40, 10, 20, 5, 0][index],
  visibilityKm: [12, 8, 9.5, 10, 11, 12][index],
}));
const overview = (extra = {}) =>
  tonightOverview({
    place,
    date,
    night,
    hourly,
    moonIllumination: 23,
    skyQuality: { bortleClass: 3, sqm: 21.43 },
    plans: [
      {
        id: "p1",
        name: "Nuit d’octobre au lac",
        date,
        location: place,
        items: [
          {
            startMinute: 7,
            endMinute: 422,
            target: { id: "m31", title: "M31", objects: ["M31"] },
          },
        ],
      },
    ],
    candidates: [
      {
        card: {
          target: {
            id: "m31",
            designation: "M31",
            title: "M31 — Galaxie d’Andromède",
          },
          maxAltitude: 86,
          usableStart: new Date(start).toISOString(),
          usableEnd: new Date(start + 3 * hour).toISOString(),
        },
        score: { total: 80, max: 100 },
      },
    ],
    ...extra,
  });
const words = (value, locale = "fr", loading = {}) =>
  tonightWords(value, { locale, timeZone: place.timeZone, loading });

test("the French words follow the specified wording", () => {
  const fr = words(overview());
  assert.equal(fr.title, "Cette nuit");
  assert.equal(fr.placeName, "Camping du Lac Noir");
  assert.equal(fr.date, "Mer. 14 oct.");
  assert.equal(fr.change, "Changer");
  assert.equal(fr.night.label, "Nuit astronomique");
  assert.match(fr.night.window, /^\d\d:\d\d → \d\d:\d\d$/);
  assert.match(fr.night.duration, /^\d+\u00a0h\u00a0\d\d d’obscurité$/);
  assert.match(
    fr.night.description,
    /^Frise de la nuit : crépuscule jusqu’à \d\d:\d\d, nuit astronomique de \d\d:\d\d à \d\d:\d\d, puis aube\./,
  );
  assert.deepEqual(
    fr.tiles.map((tile) => [tile.label, tile.value]),
    [
      ["Nuages", "12\u00a0%"],
      ["Précipitations", "13\u00a0%"],
      ["Vent", "9\u00a0km/h"],
      ["Rosée", "Risque modéré"],
      ["Visibilité", "10,4\u00a0km"],
      ["Lune", "23\u00a0%"],
    ],
  );
  assert.match(fr.tiles[0].detail, /^Au plus 22\u00a0% vers \d\d:\d\d$/);
  assert.match(fr.tiles[1].detail, /^Au plus 40\u00a0% vers \d\d:\d\d$/);
  assert.equal(fr.tiles[2].detail, "Rafales 17\u00a0km/h");
  assert.match(fr.tiles[3].detail, /^À partir de \d\d:\d\d$/);
  assert.match(fr.tiles[4].detail, /^Au plus bas 8,0\u00a0km vers \d\d:\d\d$/);
  assert.equal(fr.weatherNote, "Estimations météo sur la nuit astronomique.");
  // Two cards, the provenance as the sky
  // background's subtitle, the short sky type as the Bortle class's.
  assert.equal(fr.skyQuality.title, "Qualité du ciel");
  assert.deepEqual(
    [
      fr.skyQuality.sqm.label,
      fr.skyQuality.sqm.value,
      fr.skyQuality.sqm.unit,
      fr.skyQuality.sqm.detail,
    ],
    ["Fond de ciel", "21,4", "mag/arcsec²", "estimé"],
  );
  assert.deepEqual(
    [
      fr.skyQuality.bortle.label,
      fr.skyQuality.bortle.value,
      fr.skyQuality.bortle.detail,
    ],
    ["Bortle", "3", "Ciel rural"],
  );
  assert.equal(fr.skyQuality.sqm.about, "À propos du fond de ciel");
  assert.equal(fr.plansTitle, "Votre plan de ce soir");
  assert.match(fr.plans[0].summary, /^1 cible planifiée · \d\d:\d\d → /);
  assert.equal(fr.plans[0].targetCount, 1, "the count the frise icon reads");
  assert.equal(fr.toSee, "À voir ce soir");
  assert.equal(fr.candidates[0].designation, "M31");
  assert.equal(fr.candidates[0].name, "Galaxie d’Andromède");
  assert.equal(fr.candidates[0].window, "21:00 → 00:00");
  assert.equal(fr.candidates[0].altitude, "Culmine à 86° · Lune couchée");
});

// The plan born of a free run places its only target on an empty slot; the card
// says the count, never "20:40 → 20:40".
test("a plan whose only slot is empty writes no span", () => {
  const free = overview({
    plans: [
      {
        id: "p3",
        name: "Nuit du 14 octobre",
        date,
        location: place,
        items: [
          {
            startMinute: 0,
            endMinute: 0,
            target: { id: "m33", title: "M33", objects: ["M33"] },
          },
        ],
      },
    ],
  });
  assert.equal(words(free).plans[0].summary, "1 cible planifiée");
});

// A plan with no target says why it stays a draft; the web has no execution to
// take away.
test("a plan without a target reads the draft sentence, in every language", () => {
  const empty = overview({
    plans: [{ id: "p2", name: "Plan 1", date, location: place, items: [] }],
  });
  assert.equal(
    words(empty).plans[0].summary,
    "Votre plan reste en brouillon car vous n’avez encore aucune cible dessus.",
  );
  assert.equal(words(empty).plans[0].targetCount, 0);
  assert.equal(
    words(empty, "en").plans[0].summary,
    "Your plan stays a draft because you have not put any target on it yet.",
  );
  for (const locale of shippedLocales()) {
    const summary = words(empty, locale).plans[0].summary;
    assert.ok(summary.length > 10, locale);
    if (locale === "en" || locale === "fr") continue;
    assert.notEqual(summary, words(empty, "en").plans[0].summary, locale);
  }
});

test("without a forecast the five forecast tiles are not drawn, only the Moon stays, and no tile says the score is unavailable", () => {
  const fr = words(overview({ hourly: [] }));
  assert.deepEqual(
    fr.tiles.map((tile) => tile.key),
    ["moon"],
  );
  assert.equal(fr.weatherNote, "", "no note about weather estimates");
  for (const unavailable of [
    "Prévision indisponible",
    "Note de la nuit indisponible",
  ])
    assert.ok(
      !JSON.stringify(fr.tiles).includes(unavailable),
      "the unavailability stands once, in the card « Note de la nuit »",
    );
  // "Prévision indisponible" became the card's "Note de la nuit
  // indisponible" and its one line of reason.
  assert.equal(fr.verdict.state, "unavailable");
  assert.equal(fr.verdict.unavailable.title, "Note de la nuit indisponible");
  assert.equal(
    fr.verdict.unavailable.reason,
    "Le service de prévision ne répond pas.",
  );
  assert.equal(fr.verdict.unavailable.retry, "Réessayer");
  // While the forecast loads, the tiles wait the same way.
  const loading = words(overview({ hourly: [] }), "fr", { weather: true });
  assert.deepEqual(
    loading.tiles.map((tile) => tile.key),
    ["moon"],
  );
  const nautical = words(
    overview({
      night: planNightSpanSky({ date, darkness: "nautical" }, place),
    }),
  );
  assert.equal(
    nautical.weatherNote,
    "Estimations météo sur la nuit, au crépuscule nautique.",
  );
});

test("English and Japanese have every word (no key shown)", () => {
  for (const locale of ["en", "ja"]) {
    const all = JSON.stringify(words(overview(), locale));
    assert.ok(!/"tonight[A-Z]\w*"/.test(all), `${locale}: ${all}`);
    assert.ok(!/plannerSky|tonightBortle/.test(all), locale);
  }
  assert.equal(tonightDateLabel(date, "en"), "Wed, Oct 14");
});

test("the night lasts until its dawn: before, it is still last evening's", () => {
  const window = planNightWindow({ date }, place);
  const before = Date.parse(window.darkEnd) - 600000;
  const after = Date.parse(window.darkEnd) + 600000;
  assert.equal(tonightDate({ now: before, place }), date);
  assert.equal(tonightDate({ now: after, place }), "2026-10-15");
  // Without a place, the civil date in UTC.
  assert.equal(
    tonightDate({ now: Date.parse("2026-10-14T23:30:00Z") }),
    "2026-10-14",
  );
});

test("the subject: tonight's plans only (put-away ones aside), a pending one first, its place before the planner's", () => {
  const now = Date.parse(planNightWindow({ date }, place).darkStart);
  const elsewhere = { ...place, id: "col", name: "Col des Mélèzes" };
  const subject = tonightSubject({
    now,
    darkness: "civil",
    document: {
      location: elsewhere,
      knownLocations: [elsewhere],
      plans: [
        {
          id: "done",
          name: "Faite",
          date,
          status: "executed",
          location: place,
        },
        {
          id: "next",
          name: "Ce soir",
          date,
          status: "pending",
          location: place,
          darkness: "nautical",
        },
        { id: "old", name: "Hier", date: "2026-10-13", location: place },
        { id: "gone", name: "Abandonnée", date, status: "abandoned" },
        { id: "away", name: "Archivée", date, status: "archived" },
      ],
    },
  });
  // A cancelled plan stays (to be launched again), an archived one is put away.
  assert.deepEqual(
    subject.plans.map((plan) => plan.id),
    ["next", "done", "gone"],
  );
  assert.equal(subject.place.name, "Camping du Lac Noir");
  assert.equal(subject.date, date);
  assert.equal(subject.darkness, "nautical");
  assert.equal(subject.settings.id, "next");
  const chosen = tonightSubject({
    now,
    document: { location: elsewhere, plans: [] },
    chosen: place,
  });
  assert.equal(chosen.place.name, "Camping du Lac Noir");
  assert.equal(chosen.darkness, "astronomical");
  const fallback = tonightSubject({ now, document: { location: elsewhere } });
  assert.equal(fallback.place.name, "Col des Mélèzes");
  assert.equal(tonightSubject({ now, document: null }).place, null);
});

test("the sky tiles and the list of targets say that they wait, so that the page draws the loading star", () => {
  const waiting = words(overview({ skyQuality: null }), "fr", {
    skyQuality: true,
    candidates: true,
  });
  assert.equal(waiting.skyQuality.sqm.waiting, true);
  assert.equal(waiting.skyQuality.bortle.waiting, true);
  assert.equal(waiting.skyQuality.sqm.detail, "Estimation en cours…");
  assert.equal(waiting.toSeeLoading, true);
  assert.equal(waiting.toSeeEmpty, "Recherche des cibles de ce soir…");

  // Once the answer is there, or when it is not coming, nothing waits.
  const done = words(overview(), "fr", { skyQuality: true });
  assert.equal(done.skyQuality.sqm.waiting, false);
  assert.equal(done.toSeeLoading, false);
  const missing = words(overview({ skyQuality: null }), "fr", {});
  assert.equal(missing.skyQuality.sqm.waiting, false);
  assert.equal(missing.skyQuality.bortle.waiting, false);
});
