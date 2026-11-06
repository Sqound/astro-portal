import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { hourlyAstronomyForecast } from "portal/astronomy-forecast.js";
import {
  tonightLevelOfScore,
  tonightScoreSheetWords,
  tonightVerdictReason,
  tonightVerdictStatus,
  tonightVerdictWords,
  tonightWorkedHour,
  verdictFiligreePath,
} from "planner/tonight-words.js";

// The card "Note de la nuit" on the web — its states
// and their reasons, the hours' filigree, the sheet in its order.

const at = (value) => new Date(value).toISOString().slice(11, 16);
const start = Date.UTC(2026, 9, 14, 19);
const hour = 3600000;
// The reference night (`TonightScoreSheet`): ten hours, 19:00 → 04:00.
const board = [
  [0, 6, 11, 62, 24],
  [2, 7, 12, 64, 24],
  [4, 8, 13, 67, 24],
  [8, 9, 14, 70, 24],
  [16, 9, 15, 74, 24],
  [24, 10, 15, 79, 22],
  [30, 11, 16, 84, 20],
  [34, 12, 17, 88, 18],
  [32, 10, 15, 90, 18],
  [30, 9, 14, 91, 20],
];
const forecast = {
  time: board.map((_, index) => (start + index * hour) / 1000),
  cloud_cover: board.map((row) => row[0]),
  cloud_cover_low: board.map(() => 0),
  cloud_cover_mid: board.map((row) => row[0]),
  cloud_cover_high: board.map(() => 0),
  wind_speed_10m: board.map((row) => row[1]),
  wind_gusts_10m: board.map((row) => row[2]),
  relative_humidity_2m: board.map((row) => row[3]),
  visibility: board.map((row) => row[4] * 1000),
  precipitation_probability: board.map(() => 0),
};
const hours = hourlyAstronomyForecast({
  hourly: forecast,
  night: {
    start: new Date(start).toISOString(),
    end: new Date(start + 9 * hour).toISOString(),
  },
});
const verdict = {
  level: "favourable",
  score: 72,
  kind: "favourable",
  facts: { darkness: null, moon: { kind: "set" }, clouds: null },
};

test("each reason has its line, and only offline and unreachable retry; « Choisir » without a service; nothing beyond the forecast's days", () => {
  const words = (status) =>
    tonightVerdictWords(null, { locale: "fr", at, status }).unavailable;
  assert.deepEqual(words({ reason: "offline" }), {
    title: "Note de la nuit indisponible",
    reason: "Hors ligne ou service injoignable, aucune prévision gardée.",
    retry: "Réessayer",
    choose: null,
  });
  assert.equal(
    words({ reason: "unreachable" }).reason,
    "Le service de prévision ne répond pas.",
  );
  assert.equal(words({ reason: "unreachable" }).retry, "Réessayer");
  const none = words({ reason: "noService" });
  assert.equal(
    none.reason,
    "Aucun service choisi sur cet appareil pour la prévision.",
  );
  assert.equal(none.retry, null);
  assert.equal(none.choose, "Choisir");
  const far = words(
    tonightVerdictStatus(null, {
      date: "2026-10-24",
      availability: "beyond-range",
    }),
  );
  assert.equal(
    far.reason,
    "La prévision couvre les seize prochains jours : la note du 24 oct. viendra le 9 oct.",
  );
  assert.equal(far.retry, null);
  assert.equal(far.choose, null);
});

test("a plan whose night is past has its reason alone — no « Réessayer », no « Choisir » — and « Cette nuit » never gets it", () => {
  const words = (status) =>
    tonightVerdictWords(null, { locale: "fr", at, status }).unavailable;
  const status = tonightVerdictStatus(
    { status: "unavailable", failure: "network_error" },
    { date: "2026-10-02", availability: "past", past: true },
  );
  assert.deepEqual(status, { reason: "pastNight" });
  assert.deepEqual(words(status), {
    title: "Note de la nuit indisponible",
    reason: "Cette nuit est passée\u00a0: pas de prévision.",
    retry: null,
    choose: null,
  });
  assert.equal(
    tonightVerdictReason(status, "en"),
    "This night has passed: no forecast.",
  );
  // Without the planner's flag ("Cette nuit") the read decides, as before.
  assert.deepEqual(
    tonightVerdictStatus(
      { status: "unavailable", failure: "network_error" },
      { date: "2026-10-02", availability: "past" },
    ),
    { reason: "offline" },
  );
  assert.deepEqual(
    tonightVerdictStatus({ status: "loading" }, { date: "2026-10-14" }),
    { waiting: true },
  );
});

test("the status comes up from the forecast's read", () => {
  const status = (read) =>
    tonightVerdictStatus(read, {
      date: "2026-10-14",
      availability: "available",
    });
  assert.deepEqual(status({ status: "loading" }), { waiting: true });
  assert.deepEqual(
    status({ status: "unavailable", failure: "network_error" }),
    { reason: "offline" },
  );
  assert.deepEqual(
    status({ status: "unavailable", failure: "forecast_unavailable" }),
    { reason: "unreachable" },
  );
  assert.deepEqual(status({ status: "unavailable", failure: "no_service" }), {
    reason: "noService",
  });
  assert.equal(
    tonightVerdictReason({ reason: "offline" }, "en"),
    "Offline or service unreachable, no forecast kept.",
  );
});

test("the filigree is drawn from the hours' scores: the best hour near the top, the worst near the bottom", () => {
  const scores = hours.map((row) => row.score);
  // Ten hours on the scale; the night opens at its best, falls to its worst
  // hour, then rises again (the notes themselves are the portal's, never
  // typed here).
  assert.equal(scores.length, 10);
  assert.ok(scores.every((score) => score >= 0 && score <= 100));
  assert.equal(scores[0], Math.max(...scores));
  const worst = scores.indexOf(Math.min(...scores));
  assert.ok(worst > 0 && worst < scores.length - 1);
  for (let index = 1; index <= worst; index += 1)
    assert.ok(scores[index] <= scores[index - 1], `hour ${index} falls`);
  assert.ok(scores.at(-1) > scores[worst]);
  const words = tonightVerdictWords(verdict, { locale: "fr", at, hours });
  assert.deepEqual(words.scores, scores);
  const path = verdictFiligreePath(words.scores);
  assert.match(path.line, /^M0 4 C/);
  // Ten points: ten cubic segments' worth of curve, ending on the last score.
  assert.equal((path.line.match(/C/g) || []).length, 9);
  assert.equal(verdictFiligreePath([72]), null);
  assert.equal(tonightLevelOfScore(82), "excellent");
  assert.equal(tonightLevelOfScore(81), "favourable");
  assert.equal(tonightLevelOfScore(42), "variable");
  assert.equal(tonightLevelOfScore(41), "poor");
});

test("the sheet: hour by hour, the calculation with the lowest hour, the four levels, the sources", () => {
  const sheet = tonightScoreSheetWords(verdict, { locale: "fr", at, hours });
  assert.deepEqual(Object.keys(sheet).slice(0, 5), [
    "title",
    "level",
    "word",
    "score",
    "sentence",
  ]);
  assert.equal(sheet.hourly.title, "Heure par heure");
  // Six factors, in the order of the columns; this night has no Moon given.
  assert.deepEqual(
    sheet.hourly.columns.factors.map((column) => column.name),
    ["Nuages", "Pluie", "Lune", "Brume", "Vent · rafales", "Humidité"],
  );
  const row = sheet.hourly.rows[7];
  assert.equal(row.time, "02:00");
  assert.equal(row.score, hours[7].score);
  assert.deepEqual(
    row.cells.map((cell) => [cell.key, cell.text]),
    [
      ["cloud", "34\u00a0%"],
      ["rain", "0\u00a0%"],
      ["moon", "—"],
      ["visibility", "18 km"],
      ["wind", "12 · 17"],
      ["humidity", "88\u00a0%"],
    ],
  );
  assert.equal(
    sheet.hourly.mean,
    "Chaque case\u00a0: la valeur prévue\u00a0; en ambre, les points retirés à l’heure. Moyenne des 10 heures\u00a0: 72.",
  );
  assert.equal(
    tonightWorkedHour(hours).score,
    Math.min(...hours.map((h) => h.score)),
  );
  assert.match(sheet.how.worked.at, /^À \d\d:00$/);
  assert.match(sheet.how.worked.body, /nuages \d+\u00a0% → ×\d,\d\d/);
  assert.equal(sheet.levels.title, "Les quatre niveaux");
  assert.deepEqual(sheet.sources, [
    "Prévision heure par heure : Open-Meteo.",
    "MET Norway en secours · données CC BY 4.0 adaptées.",
  ]);
  assert.equal(sheet.close, "Fermer");
});

test("ten languages carry every key of the card and of its sheet, and none keeps the removed sentence", () => {
  const folder = fileURLToPath(
    new URL("../../portal/src/messages/", import.meta.url),
  );
  const files = readdirSync(folder).filter((name) => name.endsWith(".js"));
  assert.equal(files.length, 10);
  const keys = [
    "tonightVerdictLoading",
    "tonightVerdictLoadingDetail",
    "tonightVerdictUnavailable",
    "tonightVerdictReasonOffline",
    "tonightVerdictReasonUnreachable",
    "tonightVerdictReasonNoService",
    "tonightVerdictReasonBeyondRange",
    "tonightVerdictReasonPastNight",
    "tonightVerdictChooseService",
    "tonightScoreHourly",
    "tonightScoreHowIntro",
    "tonightScoreColumnRain",
    "tonightScoreLossTitle",
    "tonightScoreLegendLinear",
    "tonightScoreWorkedResult",
    "tonightScoreLevels",
    "tonightScoreSourceFallback",
  ];
  for (const file of files) {
    const source = readFileSync(`${folder}${file}`, "utf8");
    for (const key of keys)
      assert.match(source, new RegExp(`\\n  ${key}:`), `${file} ${key}`);
    assert.doesNotMatch(source, /tonightVerdictSheetBody/, file);
  }
});
