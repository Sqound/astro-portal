import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import {
  hourlyAstronomyForecast,
  summarizeAstronomyForecast,
} from "portal/astronomy-forecast.js";

// The
// planner's "Prévision astronomique" made of "Cette nuit"'s parts. The
// card "Note de la nuit" and the night (window, tiles) left `TonightPage.js`
// for `NightDetailParts.js`, which both pages import; the planner feeds them
// its plan's night through `tonightOverview` and `tonightWords`. Synthetic
// place (45° N, 30° O) and forecast; nothing leaves the test.
await registerJsx();
const { NightZone, VerdictSection } =
  await import("planner/components/NightDetailParts.js");
const { tonightOverview } = await import("planner/tonight-overview.js");
const { tonightVerdictStatus, tonightWords } =
  await import("planner/tonight-words.js");
const { planNightSpanSky } = await import("planner/planner.js");

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/&#x27;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const render = (component, props, children) =>
  renderToStaticMarkup(createElement(component, props, children));
const at = (text, needle, from = 0) => {
  const index = text.indexOf(needle, from);
  assert.ok(index >= 0, `expected ${needle}`);
  return index;
};

const lac = {
  id: "lac-noir",
  name: "Camping du Lac Noir",
  latitude: 45,
  longitude: -30,
  timeZone: "UTC",
};
const date = "2026-10-14";
const sky = planNightSpanSky({ date, darkness: "astronomical" }, lac);
const start = Date.parse(sky.darkStart);
const hour = 3600000;
const clouds = [0, 2, 4, 8, 16, 24, 30, 34, 32, 30];
const raw = {
  time: clouds.map((_, index) => (start + index * hour) / 1000),
  cloud_cover: clouds,
  cloud_cover_low: clouds.map(() => 0),
  cloud_cover_mid: clouds,
  cloud_cover_high: clouds.map(() => 0),
  wind_speed_10m: clouds.map(() => 9),
  wind_gusts_10m: clouds.map(() => 17),
  relative_humidity_2m: clouds.map(() => 70),
  visibility: clouds.map(() => 24000),
  precipitation_probability: clouds.map(() => 2),
};
const window = { start: sky.darkStart, end: sky.darkEnd };
const hourly = hourlyAstronomyForecast({ hourly: raw, night: window });
const summary = summarizeAstronomyForecast({ hourly: raw, night: window });

// The planner's night, as `PlannerPage.js` builds it.
const plannerNight = (forecastRead, { night = date, past = false } = {}) => {
  const ready = forecastRead.status === "ready";
  const overview = tonightOverview({
    place: lac,
    date: night,
    night: planNightSpanSky({ date: night, darkness: "astronomical" }, lac),
    hourly: ready ? hourly : [],
    moonIllumination: 17,
    skyQuality: { bortleClass: 4, sqm: 21.02 },
    darkness: "astronomical",
    forecast: ready ? summary : null,
  });
  const words = tonightWords(overview, {
    locale: "fr",
    timeZone: "UTC",
    verdictStatus: tonightVerdictStatus(forecastRead, {
      date: night,
      availability: night === date ? "available" : "beyond-range",
      past,
    }),
    verdictHours: ready ? hourly : [],
    loading: { weather: forecastRead.status === "loading" },
  });
  return { overview, words };
};

test("the shared parts are moved, not copied — both pages import them, « Cette nuit » no longer defines them", () => {
  const tonight = read("../src/components/TonightPage.js");
  const planner = read("../src/components/PlannerPage.js");
  for (const source of [tonight, planner])
    assert.match(
      source,
      /import \{ NightZone, VerdictSection \} from "\.\/NightDetailParts\.js";/,
    );
  for (const definition of [
    "function VerdictSection(",
    "function ScoreSheet(",
    "function NightTimeline(",
    "const tileIcons",
  ])
    assert.ok(!tonight.includes(definition), `${definition} left the page`);
  // "Cette nuit" keeps its timeline and its `tune` icon.
  const zone = tonight.slice(at(tonight, "<NightZone"));
  assert.ok(
    zone.indexOf("<DarknessSettingButton") < zone.indexOf("</NightZone>"),
  );
  assert.ok(!zone.slice(0, zone.indexOf("</NightZone>")).includes("timeline="));
});

test("the night renders on both pages — with its timeline on « Cette nuit », in one line on the planner — with the six tiles", () => {
  const { overview, words } = plannerNight({ status: "ready" });
  const tonight = render(NightZone, { words, overview });
  const planner = render(NightZone, { words, overview, timeline: false });
  assert.match(tonight, /class="tonight-timeline-box"/);
  assert.ok(!planner.includes("tonight-timeline"));
  for (const markup of [tonight, planner]) {
    const tiles = [...markup.matchAll(/data-tile="(\w+)"/g)].map((m) => m[1]);
    // Précipitations and Visibilité join the four, curves behind.
    assert.deepEqual(tiles, [
      "clouds",
      "precipitation",
      "wind",
      "dew",
      "visibility",
      "moon",
    ]);
    assert.ok(textOf(markup).includes("Nuit astronomique"));
    assert.match(textOf(markup), /\d{2}:\d{2} → \d{2}:\d{2}/);
    assert.match(textOf(markup), /d’obscurité/);
  }
  // The planner's tune entry is "Durée de la nuit": none here.
  assert.ok(!planner.includes("tonight-night-threshold"));
});

test("the score card for a plan's night — the score in its level's tint, the star while it is computed, the sixteen days' reason with its dates", () => {
  const ready = render(VerdictSection, {
    words: plannerNight({ status: "ready" }).words,
    locale: "fr",
    onRetry: () => {},
  });
  assert.match(ready, /data-state="ready"/);
  assert.match(ready, /data-testid="tonight-verdict-score">\d+</);
  assert.match(ready, /aria-label="Comment la note est calculée"/);
  assert.match(ready, /data-testid="tonight-verdict-filigree"/);

  const waiting = render(VerdictSection, {
    words: plannerNight({ status: "loading" }).words,
    locale: "fr",
    onRetry: () => {},
  });
  assert.match(waiting, /data-state="waiting"/);
  assert.ok(textOf(waiting).includes("Calcul de la note de la nuit…"));

  const beyond = render(VerdictSection, {
    words: plannerNight({ status: "idle" }, { night: "2026-10-30" }).words,
    locale: "fr",
    onRetry: () => {},
  });
  assert.match(beyond, /data-state="unavailable"/);
  assert.ok(
    textOf(beyond).includes(
      "La prévision couvre les seize prochains jours : la note du 30 oct. viendra le 15 oct.",
    ),
  );
  assert.ok(!beyond.includes("Réessayer"));

  const offline = render(VerdictSection, {
    words: plannerNight({ status: "unavailable", failure: "network_error" })
      .words,
    locale: "fr",
    onRetry: () => {},
  });
  assert.ok(
    textOf(offline).includes(
      "Hors ligne ou service injoignable, aucune prévision gardée.",
    ),
  );
  assert.ok(textOf(offline).includes("Réessayer"));
});

test("the score card for a plan whose night is past — the reason alone, no link, the page decides on the plan's night", () => {
  const past = render(VerdictSection, {
    words: plannerNight(
      { status: "unavailable", failure: "forecast_unavailable" },
      { night: "2026-10-02", past: true },
    ).words,
    locale: "fr",
    onRetry: () => {},
    chooseHref: "/fr/space",
  });
  assert.match(past, /data-state="unavailable"/);
  assert.ok(textOf(past).includes("Note de la nuit indisponible"));
  assert.ok(textOf(past).includes("Cette nuit est passée : pas de prévision."));
  assert.ok(!past.includes("Réessayer"));
  assert.ok(!past.includes("Choisir"));
  assert.ok(!past.includes("<a "));
  assert.ok(!past.includes("<button"));
  assert.ok(!past.includes("Le service de prévision ne répond pas."));
  // The planner passes the plan's night against the night in progress (its
  // "il y a 4 jours" rule), "Cette nuit" nothing.
  for (const path of [
    "../src/components/PlannerPage.js",
    "../dist/components/PlannerPage.js",
  ])
    assert.match(read(path), /past:\s*planDaysAgo\(/, path);
  assert.ok(!read("../src/components/TonightPage.js").includes("past:"));
});

test("the planner's block in order — score card, warnings, night and tiles, hourly strip with scores, sky cards, sources — and none of the old summary", () => {
  for (const path of [
    "../src/components/PlannerPage.js",
    "../dist/components/PlannerPage.js",
  ]) {
    const source = read(path);
    const from = at(source, "planner-flow-stage planner-shared-forecast");
    const to = at(source, "planner-forecast-sources", from);
    const block = source.slice(from, to);
    const order = [
      "planner-shared-forecast-title",
      "VerdictSection",
      "planner-weather-fallback",
      "planner-weather-stale",
      "NightZone",
      "HourlyForecast",
      "tonightHourlyForecastTitle",
      "SkyQualityCards",
    ].map((needle) => at(block, needle));
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
      `${path}: the block's order`,
    );
    for (const gone of [
      "planner-night-summary",
      "planner-forecast-metrics",
      "SkyBrightnessInfo",
      "planner-forecast-range-notice",
      "weatherBeyondRangeTitle",
    ])
      assert.ok(!block.includes(gone), `${path}: ${gone} is gone`);
    assert.match(block, /timeline: false|timeline=\{false\}/);
    assert.match(block, /hourScores/);
  }
});
