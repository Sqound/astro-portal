import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// When the weather does not answer,
// every box that depends on it stays and carries the badge "Service
// indisponible" (one line, ⓘ: reason, last good time, "Réessayer") instead
// of vanishing — the five tiles, the hourly strip, the card "Note de la
// nuit" — and no badge shows when the forecast answered, when no service is
// chosen, or when the service answered with nothing for the night. Synthetic
// place and forecast; nothing leaves the test.
await registerJsx();
const { NightZone, VerdictSection } =
  await import("planner/components/NightDetailParts.js");
const { tonightOverview } = await import("planner/tonight-overview.js");
const { tonightWords, tonightVerdictStatus } =
  await import("planner/tonight-words.js");
const { planNightSpanSky } = await import("planner/planner.js");
const { message } = await import("portal/i18n.js");

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
  cloud: 10 * index,
  wind: 6 + 2 * index,
  gust: 20,
  temperature: 8,
  dewPoint: 5.5,
  humidity: 70 + 3 * index,
  precipitation: 10,
  visibilityKm: 10,
}));
const overview = (withForecast) =>
  tonightOverview({
    place,
    date,
    night,
    hourly: withForecast ? hourly : [],
    moonSeries: [],
    moonIllumination: 35,
  });
const status = (forecast) =>
  tonightVerdictStatus(forecast, { date, availability: "available" });
const wordsFor = (withForecast, forecast, extra = {}, locale = "fr") =>
  tonightWords(overview(withForecast), {
    locale,
    timeZone: place.timeZone,
    verdictStatus: status(forecast),
    ...extra,
  });
const renderNight = (words, value) =>
  renderToStaticMarkup(
    createElement(NightZone, { words, overview: value, timeline: false }),
  );
const renderCard = (words) =>
  renderToStaticMarkup(
    createElement(VerdictSection, {
      words,
      locale: "fr",
      onRetry: () => {},
    }),
  );
const badges = (markup) =>
  markup.match(/data-testid="weather-unavailable-badge"/g)?.length ?? 0;

const down = { status: "unavailable", failure: "service_error" };
const offline = { status: "unavailable", failure: "network_error" };

test("nothing answers — the five tiles and the hourly strip stay, each with the badge", () => {
  const value = overview(false);
  const words = wordsFor(false, down);
  assert.ok(words.weatherDown, "the page is told the service is down");
  const markup = renderNight(words, value);
  for (const tile of ["clouds", "precipitation", "wind", "dew", "visibility"])
    assert.match(markup, new RegExp(`data-tile="${tile}"`), tile);
  // Five tiles and the strip's box: six badges, one line each.
  assert.equal(badges(markup), 6);
  assert.match(markup, /data-testid="tonight-hourly-unavailable"/);
  assert.match(markup, /Service indisponible/);
  // The Moon needs no forecast: it stays, without a badge.
  const moon = markup.slice(
    markup.indexOf('data-tile="moon"'),
    markup.indexOf('data-testid="tonight-hourly-unavailable"'),
  );
  assert.ok(moon.length > 0);
  assert.equal(badges(moon), 0);
});

test("the card keeps its reason and « Réessayer » and carries the badge too", () => {
  const markup = renderCard(wordsFor(false, offline));
  assert.match(markup, /data-state="unavailable"/);
  assert.match(markup, /Hors ligne ou service injoignable/);
  assert.match(markup, /Réessayer/);
  assert.equal(badges(markup), 1);
});

test("no badge when the forecast answered", () => {
  const value = overview(true);
  const words = wordsFor(true, { status: "ready" });
  assert.equal(words.weatherDown, null);
  assert.equal(badges(renderNight(words, value)), 0);
  assert.doesNotMatch(renderNight(words, value), /Service indisponible/);
});

test("no badge when no service is chosen, or when the service answered with nothing for the night", () => {
  for (const forecast of [
    { status: "unavailable", failure: "no_service" },
    { status: "ready" },
  ]) {
    const words = wordsFor(false, forecast);
    assert.equal(words.weatherDown, null, JSON.stringify(forecast));
    assert.equal(badges(renderNight(words, overview(false))), 0);
    assert.equal(badges(renderCard(words)), 0);
  }
  // A night out of the forecast's reach has its own reason, not the badge.
  const far = tonightWords(overview(false), {
    locale: "fr",
    timeZone: place.timeZone,
    verdictStatus: tonightVerdictStatus(
      { status: "unavailable", failure: "service_error" },
      { date, availability: "beyond-range" },
    ),
  });
  assert.equal(far.weatherDown, null);
});

test("the dialog's words — the reason, the last good time when the page has it, « Réessayer »", () => {
  const withTime = wordsFor(false, down, {
    lastGoodAt: "2026-10-14T19:13:00.000Z",
  });
  assert.match(
    withTime.weatherDown.lastGood,
    /^Dernière bonne prévision reçue à /,
  );
  assert.match(withTime.weatherDown.lastGood, /:13/);
  assert.equal(
    withTime.weatherDown.reason,
    "Le service de prévision ne répond pas.",
  );
  assert.equal(withTime.weatherDown.retry, "Réessayer");
  // A page that does not keep the last good answer says nothing of it, rather
  // than saying that none ever came.
  assert.equal(wordsFor(false, down).weatherDown.lastGood, null);
  assert.match(
    wordsFor(false, offline).weatherDown.reason,
    /^Hors ligne ou service injoignable/,
  );
});

test("the badge is worded in the ten languages", () => {
  const locales = [
    "en",
    "fr",
    "ja",
    "de",
    "es",
    "it",
    "pt-BR",
    "ru",
    "zh-Hans",
    "zh-Hant",
  ];
  const seen = new Set();
  for (const locale of locales) {
    const badge = message(locale, "tonightWeatherUnavailable");
    assert.ok(badge && badge !== "tonightWeatherUnavailable", locale);
    seen.add(badge);
    assert.match(message(locale, "tonightWeatherLastGood"), /\{time\}/, locale);
    assert.ok(wordsFor(false, down, {}, locale).weatherDown.badge === badge);
  }
  assert.ok(seen.size >= 9, "translated, not copied");
});
