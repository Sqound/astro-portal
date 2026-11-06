import assert from "node:assert/strict";
import test from "node:test";

import { planNightSpanSky } from "planner/planner.js";
import { tonightOverview } from "planner/tonight-overview.js";
import {
  tonightLevelOfScore,
  tonightStorySentence,
  tonightStoryThirds,
  tonightVerdictWords,
  tonightWords,
} from "planner/tonight-words.js";

// "Verdict de la nuit" on the web — the rule of `portal/night-verdict.js`, the
// words of `VerdictLevels`, and the card without a forecast and its reason, the
// waiting card and the sheet behind ⓘ.

const place = {
  id: "lac-noir",
  name: "Camping du Lac Noir",
  latitude: "45",
  longitude: "-30",
  timeZone: "UTC",
};
const date = "2026-10-14";
const night = planNightSpanSky({ date }, place);
const hour = 3600000;
const start = Math.ceil(Date.parse(night.darkStart) / hour) * hour;
const hourly = Array.from({ length: 8 }, (_, index) => ({
  time: start + index * hour,
  cloud: 12,
}));
const at = (value) => new Date(value).toISOString().slice(11, 16);

const verdictOf = (forecast, extra = {}) =>
  tonightOverview({
    place,
    date,
    night,
    hourly,
    moonIllumination: 17,
    moonSeries: [],
    forecast,
    ...extra,
  }).verdict;

// A forecast in the middle of its level (favourable: 64 to 81).
const favourableForecast = { score: 72, category: "favourable" };

test("a favourable night reads « Nuit favorable · n/100 » and its sentence", () => {
  const verdict = verdictOf(favourableForecast);
  const words = tonightVerdictWords(verdict, { locale: "fr", at });
  assert.equal(words.title, "Verdict de la nuit");
  assert.equal(words.word, "Nuit favorable");
  assert.equal(words.score, favourableForecast.score);
  assert.equal(tonightLevelOfScore(words.score), "favourable");
  assert.match(
    `${words.word} · ${words.score}/100`,
    /^Nuit favorable · \d+\/100$/,
  );
  assert.equal(words.info, "Comment la note est calculée");
  assert.equal(words.state, "ready");
  // The hours' story, not the facts — every hour good.
  const scored = tonightVerdictWords(verdict, {
    locale: "fr",
    at,
    hours: hourly.map((row) => ({ ...row, score: 88 })),
  });
  assert.equal(scored.sentence, "Bonne d’un bout à l’autre de la nuit.");
});

test("the four levels have their word, and the sheet their ranges; the sentence « Chaque niveau est une forme… » is gone", () => {
  const words = tonightVerdictWords(null, { locale: "fr", at });
  assert.deepEqual(
    words.dialog.levels.list.map((entry) => `${entry.word} ${entry.range}`),
    [
      "Nuit excellente 82 à 100",
      "Nuit favorable 64 à 81",
      "Nuit variable 42 à 63",
      "Nuit défavorable 0 à 41",
    ],
  );
  assert.equal(words.dialog.title, "Note de la nuit");
  assert.equal(words.dialog.levels.title, "Les quatre niveaux");
  assert.equal(words.dialog.body, undefined);
  assert.doesNotMatch(
    JSON.stringify(words.dialog),
    /Chaque niveau est une forme/,
  );
});

test("the sentence is the catalogue's sentence of the story's shape, its reason another message", () => {
  assert.equal(
    tonightStorySentence({ shape: "goodStart", reason: "rain" }, "fr"),
    "Bon début de nuit, puis elle se dégrade à cause du risque de pluie.",
  );
  assert.equal(
    tonightStorySentence({ shape: "steadyGood", reason: null }, "fr"),
    "Bonne d’un bout à l’autre de la nuit.",
  );
  assert.equal(
    tonightStorySentence({ shape: "goodMiddle", reason: "clouds" }, "fr"),
    "Seul le milieu de la nuit est bon\u00a0; le début et la fin se dégradent à cause des nuages.",
  );
  assert.equal(
    tonightStorySentence({ shape: "goodStartMiddle", reason: "moon" }, "en"),
    "Good until the last hours, then the end of the night worsens because of the Moon.",
  );
  assert.equal(
    tonightStorySentence({ shape: "goodStart", reason: "rain" }, "ja"),
    "夜の前半は良好ですが、雨の可能性があるため、その後は下り坂です。",
  );
  // A shape without the reason it needs, or no shape: no sentence.
  assert.equal(tonightStorySentence({ shape: "goodEdges" }, "fr"), null);
  assert.equal(tonightStorySentence({ shape: null }, "fr"), null);
});

test("every shape and every reason has its sentence in the ten languages, never the old template", () => {
  const shapes = [
    "steadyGood",
    "steadyMixed",
    "steadyPoor",
    "goodStart",
    "goodMiddle",
    "goodEnd",
    "goodStartMiddle",
    "goodMiddleEnd",
    "goodEdges",
    "mixedStart",
    "mixedMiddle",
    "mixedEnd",
    "mixedStartMiddle",
    "mixedMiddleEnd",
    "mixedEdges",
  ];
  const reasons = ["clouds", "rain", "mist", "wind", "dew", "moon"];
  for (const locale of [
    "fr",
    "en",
    "de",
    "es",
    "it",
    "ja",
    "pt-BR",
    "ru",
    "zh-Hans",
    "zh-Hant",
  ]) {
    const seen = new Set();
    for (const shape of shapes)
      for (const reason of reasons) {
        const sentence = tonightStorySentence({ shape, reason }, locale);
        assert.ok(sentence, `${locale} ${shape} ${reason}`);
        assert.doesNotMatch(sentence, /[{}]|tonightStory/u);
        seen.add(sentence);
      }
    assert.equal(seen.size, 1 + 14 * 6, locale);
  }
});

test("the sheet's « Par tiers de nuit » gives the three thirds, their hours, scores and reasons in two words", () => {
  const thirds = tonightStoryThirds(
    {
      thirds: [
        {
          part: "start",
          start: "2026-10-14T18:54:00.000Z",
          end: "2026-10-14T22:08:40.000Z",
          score: 86,
          quality: "good",
          reason: null,
        },
        {
          part: "middle",
          start: "2026-10-14T22:08:40.000Z",
          end: "2026-10-15T01:23:20.000Z",
          score: 62,
          quality: "mixed",
          reason: "rain",
        },
        {
          part: "end",
          start: "2026-10-15T01:23:20.000Z",
          end: "2026-10-15T04:38:00.000Z",
          score: 20,
          quality: "poor",
          reason: "rain",
        },
      ],
    },
    { locale: "fr", at },
  );
  assert.equal(thirds.title, "Par tiers de nuit");
  assert.deepEqual(
    thirds.parts.map((third) => [
      third.name,
      third.hours,
      third.score,
      third.reason,
    ]),
    [
      ["Début", "18:54–22:08", 86, "Rien à signaler"],
      ["Milieu", "22:08–01:23", 62, "Un peu de pluie"],
      ["Fin", "01:23–04:38", 20, "Risque de pluie"],
    ],
  );
  assert.equal(tonightStoryThirds({ thirds: [] }, { locale: "fr", at }), null);
});

test("without a forecast: « Note de la nuit indisponible », the reason and « Réessayer »", () => {
  const verdict = verdictOf(null);
  assert.equal(verdict.kind, "unavailable");
  const words = tonightVerdictWords(verdict, { locale: "fr", at });
  assert.equal(words.level, null);
  assert.equal(words.state, "unavailable");
  assert.equal(words.unavailable.title, "Note de la nuit indisponible");
  assert.equal(
    words.unavailable.reason,
    "Le service de prévision ne répond pas.",
  );
  assert.equal(words.unavailable.retry, "Réessayer");
  // While the forecast is asked for: the waiting card, no retry.
  const loading = tonightVerdictWords(verdict, {
    locale: "fr",
    at,
    loading: true,
    placeName: "Camping du Lac Noir",
  });
  assert.equal(loading.state, "waiting");
  assert.equal(loading.waiting.title, "Calcul de la note de la nuit…");
  assert.equal(
    loading.waiting.line,
    "Prévision heure par heure pour Camping du Lac Noir.",
  );
});

test("the page's words carry the verdict only once the night is known", () => {
  const ready = tonightWords(
    tonightOverview({
      place,
      date,
      night,
      hourly,
      forecast: { score: 90, category: "excellent" },
    }),
    {
      locale: "ja",
      timeZone: "UTC",
      verdictHours: hourly.map((row) => ({ ...row, score: 90 })),
    },
  );
  assert.equal(ready.verdict.word, "最高の夜");
  assert.equal(ready.verdict.sentence, "夜どおし良好です。");
  const none = tonightWords(tonightOverview({ date }), {
    locale: "fr",
    timeZone: "UTC",
  });
  assert.equal(none.verdict, null);
});
