// The calendar with the
// forecast band on the web — its model (`conditions-calendar.js`), the
// component the date popover and "Conditions à {lieu}" share, the page,
// the best part of the night (`night-best-part.js`) and its button.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { message } from "portal/i18n.js";
import { shippedLocales } from "portal/locales.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import {
  conditionsCalendar,
  conditionsDayKind,
  conditionsPastAllowed,
  conditionsPastChoosableNights,
} from "planner/conditions-calendar.js";
import { nightBestPart } from "planner/night-best-part.js";

await registerJsx();
const { ConditionsCalendar } =
  await import("planner/components/ConditionsCalendar.js");
const { ConditionsNightDetail } =
  await import("planner/components/ConditionsPage.js");
const { BestPartButton } =
  await import("planner/components/TonightSlotDialog.js");

const css = readFileSync(
  new URL("../../portal-app/styles/portal.css", import.meta.url),
  "utf8",
);
const place = { name: "Col des Mélèzes", latitude: "45", longitude: "-30" };
const hour = 3600000;
// A forecast from two days before 14 October 2026 to fifteen after it.
const forecastPayload = () => {
  const start = Date.UTC(2026, 9, 12);
  const time = Array.from(
    { length: 19 * 24 },
    (_, index) => (start + index * hour) / 1000,
  );
  const cover = time.map(
    (_, index) => [2, 6, 40, 0, 12][Math.floor(index / 24) % 5],
  );
  return {
    hourly: {
      time,
      cloud_cover: cover,
      cloud_cover_low: cover,
      cloud_cover_mid: cover.map(() => 0),
      cloud_cover_high: cover.map(() => 0),
      precipitation_probability: cover.map(() => 5),
      visibility: cover.map(() => 24000),
      wind_speed_10m: cover.map(() => 8),
      relative_humidity_2m: cover.map(() => 70),
    },
    daily: {
      time: Array.from(
        { length: 19 },
        (_, day) => (start + day * 24 * hour) / 1000,
      ),
      weather_code: Array.from({ length: 19 }, () => 1),
    },
  };
};
const ready = (pastAllowed = true, offset = 0) =>
  conditionsCalendar({
    today: "2026-10-14",
    offset,
    place,
    forecast: { status: "ready", payload: forecastPayload() },
    history: {},
    pastAllowed,
  });
const render = (props) =>
  renderToStaticMarkup(
    createElement(ConditionsCalendar, { locale: "fr", ...props }),
  );

test("the window starts two days before today; the band is 16 days, a trend from the 11th", () => {
  const calendar = ready();
  assert.equal(calendar.window.firstDate, "2026-10-12");
  assert.equal(calendar.cells["2026-10-14"].kind, "forecast");
  assert.equal(calendar.cells["2026-10-24"].kind, "forecast");
  assert.equal(calendar.cells["2026-10-25"].kind, "trend");
  assert.equal(calendar.cells["2026-10-29"].kind, "trend");
  assert.equal(calendar.cells["2026-10-30"].kind, "beyond");
  assert.equal(conditionsDayKind("2026-10-12", "2026-10-14"), "past");
  assert.ok(Number.isFinite(calendar.cells["2026-10-25"].score));
  // The past months the window needs, one: October.
  assert.deepEqual(calendar.pastMonths, ["2026-10"]);
  assert.equal(calendar.loadingMonth, "2026-10");
});

test("a provider that answers fewer days (MET Norway): the band stops where it does", () => {
  const short = forecastPayload();
  const keep = short.hourly.time.filter(
    (time) => time * 1000 < Date.UTC(2026, 9, 20, 12),
  );
  short.hourly = Object.fromEntries(
    Object.entries(short.hourly).map(([key, values]) => [
      key,
      values.slice(0, keep.length),
    ]),
  );
  const calendar = conditionsCalendar({
    today: "2026-10-14",
    place,
    forecast: { status: "ready", payload: short },
    pastAllowed: false,
  });
  assert.equal(calendar.cells["2026-10-18"].kind, "forecast");
  assert.equal(calendar.cells["2026-10-22"].kind, "beyond");
  assert.ok(calendar.bandEnd < "2026-10-29");
});

test("without « Planification avancée » the past keeps the Moon alone and asks for no history", () => {
  const calendar = ready(false, -1);
  assert.deepEqual(calendar.pastMonths, []);
  assert.equal(calendar.cells["2026-09-20"].locked, true);
  assert.equal(calendar.cells["2026-09-20"].score, null);
  assert.equal(
    conditionsPastAllowed({ hosted: true, capabilities: null }),
    false,
  );
  assert.equal(
    conditionsPastAllowed({
      hosted: true,
      capabilities: { "planner.mosaic": true },
    }),
    true,
  );
  assert.equal(conditionsPastAllowed({ hosted: false }), true);
});

test("the cells: the band's classes, the trend's « ~ », the marker, « 1 nov. », a past night chosen in one-date mode", () => {
  const markup = render({ calendar: ready(), mode: "single", onDate() {} });
  assert.match(
    markup,
    /class="conditions-calendar-day is-band is-band-start[^"]*is-today/,
  );
  assert.match(markup, /is-band is-band-end is-trend/);
  assert.match(markup, /conditions-calendar-digit">~\d+</);
  assert.match(markup, /conditions-calendar-marker[^>]*>10 jours</);
  assert.match(markup, />1 nov\.</);
  // The two past days keep their dotted edge and are buttons now: a night
  // already done is declared by choosing it.
  assert.match(
    markup,
    /<button[^>]*class="conditions-calendar-day is-past[^"]*"[^>]*data-date="2026-10-12"|<button[^>]*data-date="2026-10-12"[^>]*class="conditions-calendar-day is-past/,
  );
  assert.match(markup, /<button[^>]*data-date="2026-10-26"/);
});

test("a past night is chosen up to 60 nights back, the 61st is seen only; the conditions page and the several-dates mode are unchanged", () => {
  assert.equal(conditionsPastChoosableNights, 60);
  // today = 2026-10-14: the 60th night back is 2026-08-15, the 61st 2026-08-14.
  const back = ready(true, -2);
  const markup = render({ calendar: back, mode: "single", onDate() {} });
  assert.match(markup, /<button[^>]*data-date="2026-08-15"/);
  assert.doesNotMatch(markup, /<button[^>]*data-date="2026-08-14"/);
  assert.match(
    markup,
    /<span class="conditions-calendar-day is-past[^"]*" data-date="2026-08-14" role="img"/,
  );
  // Without "Planification avancée" the day is chosen, its note stays locked.
  const locked = ready(false, -1);
  assert.equal(locked.cells["2026-09-20"].locked, true);
  const lockedMarkup = render({
    calendar: locked,
    mode: "single",
    onDate() {},
  });
  assert.match(lockedMarkup, /<button[^>]*data-date="2026-09-20"/);
  // "Nuits à venir": the past is still not a button.
  assert.doesNotMatch(
    render({ calendar: ready(), mode: "multiple", onDate() {} }),
    /<button[^>]*data-date="2026-10-12"/,
  );
});

test("several dates (« Nuits à venir »): a declared night wears the gold tick and says it is pressed; the past is not a button", () => {
  const markup = render({
    calendar: ready(),
    mode: "multiple",
    ticked: ["2026-10-20"],
    onDate() {},
  });
  assert.match(
    markup,
    /<button[^>]*class="[^"]*is-ticked[^"]*"[^>]*data-date="2026-10-20"[^>]*aria-pressed="true"/,
  );
  assert.match(
    markup,
    /<button[^>]*data-date="2026-10-21"[^>]*aria-pressed="false"/,
  );
  assert.doesNotMatch(markup, /<button[^>]*data-date="2026-10-13"/);
  assert.match(css, /\.conditions-calendar-day\.is-ticked::after \{/);
});

test("the slot of the back-to-today icon is there with and without it", () => {
  const without = render({ calendar: ready(), showTodayIcon: false });
  const with_ = render({ calendar: ready(), showTodayIcon: true });
  assert.match(
    without,
    /<span class="conditions-calendar-today-slot"><\/span>/,
  );
  assert.match(
    with_,
    /conditions-calendar-today-slot"><button[^>]*aria-label="Revenir à aujourd’hui"/,
  );
  assert.match(
    css,
    /\.conditions-calendar-today-slot \{[^}]*width: 2\.75rem;[^}]*height: 2\.75rem;/,
  );
});

test("offline: no band, a dash in each cell, the « Hors ligne » box once", () => {
  const calendar = conditionsCalendar({
    today: "2026-10-14",
    place,
    forecast: { status: "offline" },
    pastAllowed: false,
  });
  const markup = render({ calendar });
  assert.doesNotMatch(markup, /is-band/);
  assert.equal((markup.match(/conditions-calendar-offline/g) || []).length, 1);
  assert.match(markup, />—</);
  assert.match(markup, /La Lune et le ciel sont calculés sur cet appareil\./);
});

test("red mode: the band and the past keep a 2 px edge, today an inner 2 px ring", () => {
  assert.match(
    css,
    /html\[data-night-mode="on"\] \.conditions-calendar-day\.is-band,\s*html\[data-night-mode="on"\] \.conditions-calendar-day\.is-past \{\s*border-width: 2px;/,
  );
  assert.match(
    css,
    /\.conditions-calendar-day\.is-past \{[^}]*border: 1px dotted #4a4466;/,
  );
  assert.match(
    css,
    /\.conditions-pinned-holder \{[^}]*position: sticky;[^}]*height: 0;/,
  );
});

test("a past night without the right says so in neutral words, and sells nothing without registered offers", () => {
  const calendar = ready(false, -1);
  const markup = renderToStaticMarkup(
    createElement(ConditionsNightDetail, {
      date: "2026-09-20",
      place,
      locale: "fr",
      calendar,
      forecast: { status: "ready" },
      history: {},
      offersHref: "/fr/offers",
    }),
  );
  assert.match(
    markup,
    /Le calcul d’une nuit passée n’est pas disponible avec ce profil de service\./,
  );
  assert.doesNotMatch(markup, /btn-secondary|offre|abonnement/i);
});

test("a trend date opens its note under the blue box", () => {
  const markup = renderToStaticMarkup(
    createElement(ConditionsNightDetail, {
      date: "2026-10-26",
      place,
      locale: "fr",
      calendar: ready(),
      forecast: { status: "ready", payload: forecastPayload() },
      history: {},
    }),
  );
  assert.match(markup, /conditions-trend-notice/);
  assert.match(markup, /tonight-score-sheet/);
});

test("the best part, and the three reasons it can be missing", () => {
  const start = Date.UTC(2026, 9, 14, 19);
  const hours = (scores) =>
    scores.map((score, index) => ({ time: start + index * hour, score }));
  const night = {
    darkStart: new Date(start).toISOString(),
    darkEnd: new Date(start + 10 * hour).toISOString(),
  };
  const found = nightBestPart({
    hours: hours([30, 70, 72, 75, 80, 40, 30, 20, 20, 20]),
    ...night,
  });
  assert.ok(found.start && found.end);
  assert.equal(
    nightBestPart({ hours: hours(Array(10).fill(80)), ...night }).block,
    "whole",
  );
  assert.equal(
    nightBestPart({
      hours: hours([70, 30, 70, 30, 70, 30, 30, 30, 30, 30]),
      ...night,
    }).block,
    "none",
  );
  assert.equal(nightBestPart({ hours: [], ...night }).block, "noForecast");
  const blocked = renderToStaticMarkup(
    createElement(BestPartButton, {
      locale: "fr",
      block: "none",
      disabled: true,
    }),
  );
  assert.match(blocked, /is-blocked/);
  assert.match(
    blocked,
    /Aucune partie de la nuit n’atteint 64 sur 100 pendant 2 heures de suite\./,
  );
  const open = renderToStaticMarkup(
    createElement(BestPartButton, {
      locale: "fr",
      range: "19:00–01:00 · 6 h",
      disabled: false,
    }),
  );
  assert.match(open, /class="btn-tertiary tonight-slot-best-part"/);
  assert.match(open, /19:00–01:00 · 6 h/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.tonight-slot-chart\.is-gliding \.planner-night-span-handle \{\s*transition: none;/,
  );
});

test("the words exist in the ten languages", () => {
  const keys = [
    "conditionsTitle",
    "conditionsOpen",
    "conditionsTrendNotice",
    "conditionsLegendPast",
    "conditionsLegendMoonOnly",
    "conditionsBackToToday",
    "conditionsPastLocked",
    "tonightSlotBestPart",
    "tonightSlotBestPartPlaced",
  ];
  for (const locale of shippedLocales())
    for (const key of keys)
      assert.notEqual(message(locale, key), key, `${locale} ${key}`);
  assert.equal(message("fr", "conditionsTitle"), "Conditions à {place}");
  assert.match(
    message("fr", "plannerCalendarOutlook"),
    /seize jours, fiable sur dix/,
  );
});

// The best period and
// the period to avoid at the top of the page, its states, the locked inset.
const trendModule = await import("planner/conditions-trend.js");
const { ConditionsTrendView, TrendBand } =
  await import("planner/components/ConditionsTrendCard.js");
const { registerPlannerExtension } =
  await import("portal/planner/extensions.js");
const plainText = (markup) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "’")
    .replace(/[  ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const flatSpaces = (markup) => markup.replace(/[\u00a0\u202f]/g, " ");
const trendMonths = (shares) =>
  shares.map((share, index) => ({
    month: index + 1,
    nightHours: share === null ? 0 : 1000,
    clearHours: share === null ? 0 : share * 10,
    clearShare: share,
    goodNights: 0,
    nights: 0,
  }));
// Paris-like: clear in summer (May to August), covered from November to
// January.
const DISTINCT = {
  status: "ready",
  trend: "distinct",
  best: { from: 5, to: 8, clearShare: 62 },
  worst: { from: 11, to: 1, clearShare: 18 },
  months: trendMonths([18, 27, 34, 45, 58, 64, 66, 60, 47, 35, 20, 16]),
};
const trendView = (state, locale = "fr") =>
  renderToStaticMarkup(createElement(ConditionsTrendView, { locale, state }));

test("two lines — the best period and the one to avoid, each with its share — and the band of twelve months", () => {
  const markup = trendView({ status: "ready", trend: DISTINCT });
  const text = plainText(markup);
  assert.match(text, /Meilleure période : de mai à août 62 %/);
  assert.match(text, /À éviter : de novembre à janvier 18 %/);
  // The range is bold; the lines carry the tones of the design.
  assert.match(
    flatSpaces(markup),
    /Meilleure période : <strong>de mai à août<\/strong>/,
  );
  assert.match(markup, /data-testid="conditions-trend-best"/);
  assert.match(markup, /data-testid="conditions-trend-worst"/);
  assert.match(markup, /data-trend-state="distinct"/);
  // The mini-band: twelve bars, the best months green, the worst salmon, the
  // initials of the best and worst in bold (the form carries the meaning).
  const bars = [...markup.matchAll(/<li class="is-(\w+)" data-month="(\d+)"/g)];
  assert.equal(bars.length, 12);
  const tone = (month) => bars.find((bar) => bar[2] === String(month))[1];
  for (const month of [5, 6, 7, 8]) assert.equal(tone(month), "best");
  for (const month of [11, 12, 1]) assert.equal(tone(month), "worst");
  for (const month of [2, 3, 4, 9, 10]) assert.equal(tone(month), "rest");
  assert.match(markup, /style="height:64%"/);
  assert.match(
    css,
    /\.conditions-trend-band \.is-best \.conditions-trend-initial,\s*\.conditions-trend-band \.is-worst \.conditions-trend-initial \{\s*color: #eef0ee;\s*font-weight: 800;/,
  );
  // The caption and the ⓘ, whose dialog is the web's one (WebDialog, three
  // sentences, "Fermer" a link: `InfoButton`).
  assert.match(
    text,
    /Part des heures de nuit noire au ciel dégagé, sur dix ans\./,
  );
  assert.match(
    markup,
    /class="info-button"[^>]*aria-label="Comment la meilleure période est calculée"/,
  );
  // Not a button of the four levels: no level class in the card.
  assert.doesNotMatch(markup, /btn-primary|btn-secondary|btn-tertiary/);
  assert.equal(
    message("fr", "conditionsTrendInfoBody").split("\n\n").length,
    3,
  );
});

test("the months and the shares are the locale's: French elides, Japanese counts, percentages follow the language", () => {
  const { trendRangeWords, trendMonthInitial, trendPercent, noDarkPeriod } =
    trendModule;
  assert.equal(trendRangeWords("fr", 5, 8), "de mai à août");
  assert.equal(trendRangeWords("fr", 4, 8), "d’avril à août");
  assert.equal(trendRangeWords("fr", 10, 2), "d’octobre à février");
  assert.equal(trendRangeWords("en", 5, 8), "May to August");
  assert.equal(trendRangeWords("de", 5, 8), "von Mai bis August");
  assert.equal(trendRangeWords("ja", 5, 8), "5月〜8月");
  assert.equal(trendRangeWords("ru", 5, 8), "с май по август");
  assert.equal(trendMonthInitial("fr", 6), "J");
  assert.equal(trendMonthInitial("ja", 6), "6");
  assert.equal(plainText(trendPercent("fr", 62.4)), "62 %");
  assert.equal(trendPercent("en", 62.4), "62%");
  // A polar summer: the months without a dark night are one run, even over
  // the year-end.
  assert.deepEqual(
    noDarkPeriod(
      trendMonths([20, 30, 40, 50, null, null, null, 50, 40, 30, 20, 10]),
    ),
    { from: 5, to: 7 },
  );
  assert.deepEqual(
    noDarkPeriod(
      trendMonths([null, 30, 40, 50, 60, 60, 50, 40, 30, 20, 10, null]),
    ),
    { from: 12, to: 1 },
  );
  assert.equal(noDarkPeriod(trendMonths(Array(12).fill(40))), null);
});

test("no clear season, no history, high latitude: a sentence each, never « à éviter »", () => {
  const flat = trendView({
    status: "ready",
    trend: {
      ...DISTINCT,
      trend: "flat",
      worst: null,
      months: trendMonths([31, 33, 35, 36, 38, 40, 41, 39, 37, 35, 33, 32]),
    },
  });
  assert.match(flat, /data-trend-state="flat"/);
  assert.match(
    plainText(flat),
    /Pas de saison nette : ciel dégagé 31 à 41 % des heures de nuit, toute l’année\./,
  );
  assert.doesNotMatch(flat, /conditions-trend-worst|À éviter/);
  assert.equal((flat.match(/class="is-rest"/g) || []).length, 12);
  const none = trendView({
    status: "ready",
    trend: { ...DISTINCT, trend: "insufficient", best: null, worst: null },
  });
  assert.match(none, /data-trend-state="none"/);
  assert.match(
    plainText(none),
    /Pas d’historique pour ce lieu : la meilleure période ne peut pas être estimée\./,
  );
  assert.doesNotMatch(none, /conditions-trend-band/);
  const polar = trendView({
    status: "ready",
    trend: {
      ...DISTINCT,
      best: { from: 10, to: 12, clearShare: 55 },
      worst: { from: 1, to: 3, clearShare: 30 },
      months: trendMonths([
        30,
        31,
        32,
        45,
        null,
        null,
        null,
        46,
        50,
        55,
        56,
        54,
      ]),
    },
  });
  assert.match(plainText(polar), /Pas de nuit noire : de mai à juillet/);
  assert.equal((polar.match(/class="is-empty"/g) || []).length, 3);
  assert.doesNotMatch(polar, /<li class="is-worst" data-month="(5|6|7)"/);
});

test("computing, reading and refused answers: the star and the note, nothing yet, nothing", () => {
  const computing = trendView({ status: "computing" });
  assert.match(computing, /data-trend-state="computing"/);
  assert.match(computing, /role="status"/);
  assert.match(computing, /data-brand-loader/);
  assert.match(
    plainText(computing),
    /Calcul de la meilleure période du lieu… .* Première fois pour ce lieu : quelques secondes\./,
  );
  assert.equal((computing.match(/class="is-resting"/g) || []).length, 12);
  for (const status of ["loading", "absent"])
    assert.equal(trendView({ status }), "", status);
});

test("unreachable: the sentence and « Réessayer », a link that goes to the next line on the right, never cut", () => {
  const failed = trendView({ status: "unreachable" });
  assert.match(failed, /data-trend-state="unreachable"/);
  assert.match(
    plainText(failed),
    /Meilleure période indisponible pour l’instant\. Réessayer/,
  );
  assert.match(
    failed,
    /<button[^>]*class="btn-link"[^>]*data-testid="conditions-trend-retry"/,
  );
  assert.doesNotMatch(failed, /btn-primary|btn-secondary/);
  const rule = (selector) =>
    new RegExp(
      `${selector.replaceAll(".", "\\.").replaceAll(" ", "\\s+")} \\{([^}]*)\\}`,
    ).exec(css)?.[1] ?? "";
  assert.match(rule(".conditions-trend-failed"), /display: flex;/);
  assert.match(rule(".conditions-trend-failed"), /flex-wrap: wrap;/);
  assert.match(rule(".conditions-trend-failed > .btn-link"), /flex: none;/);
  assert.match(
    rule(".conditions-trend-failed > .btn-link"),
    /margin-left: auto;/,
  );
});

test("without the right, nothing where nothing is sold; where a shell sells, the card draws the shell's locked inset", () => {
  // A private server sells nothing: nothing at all, not even a sentence.
  assert.equal(trendView({ status: "locked" }), "");
  // A shell sells: its inset is drawn.
  registerPlannerExtension("planner.offers", {
    gateCopy: () => ({}),
    href: () => "/fr/offers",
    price: () => "34,99 €",
    components: {
      TrendLocked: ({ locale }) =>
        createElement("div", {
          "data-testid": "conditions-trend-locked",
          lang: locale,
        }),
    },
  });
  const markup = trendView({ status: "locked" });
  assert.match(markup, /data-testid="conditions-trend-locked"/);
  assert.match(markup, /lang="fr"/);
  assert.equal(typeof TrendBand, "function");
});

test("the trend's words are in the ten catalogues, with their placeholders", () => {
  const keys = [
    "conditionsTrendBest",
    "conditionsTrendWorst",
    "conditionsTrendRange",
    "conditionsTrendRangeElided",
    "conditionsTrendNoDark",
    "conditionsTrendCaption",
    "conditionsTrendInfoTitle",
    "conditionsTrendInfoBody",
    "conditionsTrendComputing",
    "conditionsTrendComputingNote",
    "conditionsTrendFlat",
    "conditionsTrendNone",
    "conditionsTrendFailed",
  ];
  for (const locale of shippedLocales())
    for (const key of keys) {
      const text = message(locale, key);
      assert.ok(text && text !== key, `${locale}.${key}`);
      if (/Best|Worst|NoDark/.test(key))
        assert.match(text, /\{range\}/, `${locale}.${key}`);
      if (/Range/.test(key))
        assert.match(text, /\{from\}.*\{to\}/, `${locale}.${key}`);
      if (key === "conditionsTrendFlat")
        assert.match(text, /\{low\}.*\{high\}/, `${locale}.${key}`);
      if (key === "conditionsTrendInfoBody")
        assert.equal(text.split("\n\n").length, 3, `${locale}.${key}`);
    }
  assert.equal(
    plainText(message("fr", "conditionsTrendBest")),
    "Meilleure période : {range}",
  );
  assert.equal(
    plainText(message("fr", "conditionsTrendWorst")),
    "À éviter : {range}",
  );
  // "Tendance" stays the calendar legend's word: the card does not use it.
  for (const locale of ["fr", "en"])
    assert.doesNotMatch(
      message(locale, "conditionsTrendBest") +
        message(locale, "conditionsTrendWorst"),
      /Tendance|Trend/,
    );
});
