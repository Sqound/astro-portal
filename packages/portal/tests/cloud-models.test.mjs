import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  astronomyForecastModels,
  astronomyForecastRangeUrl,
  cloudDisagreement,
  cloudUncertainNightModelPercent,
  foldDailyModels,
  foldForecastModels,
  hourlyAstronomyForecast,
  nightCloudUncertainty,
  retainedCloudCover,
  summarizeAstronomyForecast,
} from "../dist/astronomy-forecast.js";
import { createWeatherCache } from "../dist/astronomy-weather.server.js";

// The forecast asks several weather models in the same request and keeps the
// median of them. The case is the night of 2026-10-22 at the Kanto plain (36.5
// N, 139.9 E): altocumulus over about half of the sky at 22:20 JST, while JMA,
// ECMWF, GFS and MET Norway saw 1-9 % of cloud and ICON saw 61-74 % (42-53 %
// of it middle cloud). Nothing here reaches the network.

const raw = JSON.parse(
  await readFile(
    new URL(
      "fixtures/weather/open-meteo-models-2026-10-22.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const place = { latitude: 36.5, longitude: 139.9 };
const night = {
  start: Date.parse("2026-10-22T11:00:00Z"),
  end: Date.parse("2026-10-22T16:00:00Z"),
};
const at22Jst = Date.parse("2026-10-22T13:00:00Z");
const models = astronomyForecastModels(place);
const folded = foldForecastModels(raw.hourly, models);
const rows = hourlyAstronomyForecast({ hourly: folded, night });
const row22 = rows.find((row) => row.time === at22Jst);

test("the request names the models, and JMA only where the place is in Japan", () => {
  assert.deepEqual(models, [
    "best_match",
    "ecmwf_ifs025",
    "icon_seamless",
    "gfs_seamless",
    "jma_seamless",
  ]);
  assert.deepEqual(
    astronomyForecastModels({ latitude: 48.8, longitude: 2.3 }),
    ["best_match", "ecmwf_ifs025", "icon_seamless", "gfs_seamless"],
  );
  const url = new URL(
    astronomyForecastRangeUrl({
      ...place,
      startDate: "2026-10-22",
      endDate: "2026-10-22",
      models,
    }),
  );
  assert.equal(url.searchParams.get("models"), models.join(","));
  // The history's fill-in call stays a plain, single-model request.
  assert.equal(
    new URL(
      astronomyForecastRangeUrl({
        ...place,
        startDate: "2026-10-22",
        endDate: "2026-10-22",
      }),
    ).searchParams.has("models"),
    false,
  );
});

test("the multi-model answer folds into the usual series plus each model's cover", () => {
  assert.deepEqual(folded.cloud_cover, raw.hourly.cloud_cover_best_match);
  assert.deepEqual(folded.visibility, raw.hourly.visibility_best_match);
  assert.equal(folded.cloud_cover_best_match, undefined);
  assert.equal(folded.cloud_cover_icon_seamless, undefined);
  // `best_match` is JMA's model in Japan: only JMA votes.
  for (const id of models.filter((id) => id !== "best_match"))
    assert.ok(Array.isArray(folded[`cloud_cover_model_${id}`]), id);
  assert.equal(folded.cloud_cover_model_best_match, undefined);
  // Elsewhere `best_match` votes with the others.
  const abroad = foldForecastModels(raw.hourly, [
    "best_match",
    "ecmwf_ifs025",
    "icon_seamless",
    "gfs_seamless",
  ]);
  assert.ok(Array.isArray(abroad.cloud_cover_model_best_match));
  // ICON at 22:00 JST: total 74 %, low 42 + middle 53 -> capped by the total.
  assert.equal(folded.cloud_cover_model_icon_seamless[2], 74);
  assert.deepEqual(foldDailyModels(raw.daily, models).weather_code, [3]);
});

test("the retained cover at 22:00 JST on 2026-10-22 is the median of the models, with the range and the « incertaine » tag", () => {
  // Four voters in Japan (ECMWF 3, ICON 74, GFS 13, JMA 3; `best_match` is
  // JMA's model there and does not vote twice): median = (3 + 13) / 2 = 8 %.
  assert.equal(folded.cloud_cover_model_best_match, undefined);
  assert.equal(row22.cloud, 8);
  assert.equal(row22.cloudModels.icon_seamless, 74);
  assert.equal(row22.cloudModels.jma_seamless, 3);
  assert.equal(row22.cloudSpread, 71);
  // The range shows ICON's 74 % as its high end, and the tag is ON.
  assert.equal(row22.cloudMin, 3);
  assert.equal(row22.cloudMax, 74);
  assert.equal(row22.cloudUncertain, true);
});

test("that night's score is the median's, not lowered by the tag; the figure follows and carries the range", () => {
  const single = hourlyAstronomyForecast({
    hourly: Object.fromEntries(
      Object.entries(folded).filter(([key]) => !key.includes("_model_")),
    ),
    night,
  });
  // The tag never lowers the score: the hour reads as the median says.
  assert.ok(row22.score >= 85, `hour score ${row22.score}`);
  assert.ok(row22.score <= single.find((row) => row.time === at22Jst).score);
  const summary = summarizeAstronomyForecast({ hourly: folded, night });
  assert.equal(summary.uncertain, true);
  assert.equal(summary.cloudMax, 50);
  assert.ok(
    summary.cloudMin < summary.cloud && summary.cloud < summary.cloudMax,
  );
  const plain = summarizeAstronomyForecast({
    hourly: Object.fromEntries(
      Object.entries(folded).filter(([key]) => !key.includes("_model_")),
    ),
    night,
  });
  assert.equal("uncertain" in plain, false);
});

test("the combination is the median; the tag needs a model at 50 % and a median under 20 %", () => {
  const retained = retainedCloudCover({
    ecmwf_ifs025: 3,
    icon_seamless: 74,
    gfs_seamless: 13,
    jma_seamless: 3,
  });
  assert.equal(retained.cover, 8);
  assert.equal(retained.max, 74);
  assert.equal(retained.min, 3);
  assert.equal(retained.high.model, "icon_seamless");
  assert.equal(retained.low.model, "jma_seamless");
  assert.equal(retained.uncertain, true);
  assert.equal(retainedCloudCover({ a: 60, b: 20, c: 20 }).uncertain, false);
  assert.equal(retainedCloudCover({ a: 49, b: 5, c: 5 }).uncertain, false);
  assert.equal(retainedCloudCover({ a: 90 }).uncertain, false);
  assert.equal(retainedCloudCover({}), null);
  assert.equal(retainedCloudCover({ best_match: null }), null);
});

test("the disagreement is said from 25 points, with the models' names", () => {
  assert.deepEqual(cloudDisagreement(row22.cloudModels), {
    high: { model: "icon_seamless", label: "ICON", cover: 74 },
    low: { model: "jma_seamless", label: "JMA", cover: 3 },
  });
  assert.equal(cloudDisagreement({ best_match: 10, icon_seamless: 34 }), null);
  assert.notEqual(
    cloudDisagreement({ best_match: 10, icon_seamless: 35 }),
    null,
  );
});

test("a single model answering says no disagreement and reads as before", () => {
  const hourly = {
    time: raw.hourly.time,
    cloud_cover: raw.hourly.cloud_cover_best_match,
    cloud_cover_low: raw.hourly.cloud_cover_low_best_match,
    cloud_cover_mid: raw.hourly.cloud_cover_mid_best_match,
    cloud_cover_high: raw.hourly.cloud_cover_high_best_match,
    cloud_cover_model_icon_seamless: folded.cloud_cover_model_icon_seamless,
  };
  const [first] = hourlyAstronomyForecast({ hourly, night });
  assert.equal(first.cloudSpread, null);
  assert.equal(cloudDisagreement(first.cloudModels), null);
  // The one model alone: its own effective cover, no range, no tag.
  assert.equal(first.cloud, folded.cloud_cover_model_icon_seamless[0]);
  assert.equal(first.cloudMin, null);
  assert.equal(first.cloudUncertain, false);
});

test("MET Norway alone (no Open-Meteo answer): one model, no note, no tag", async () => {
  const load = createWeatherCache({
    now: () => Date.parse("2026-10-22T14:00:00Z"),
    fetcher: async (url) => {
      if (new URL(url).hostname === "api.open-meteo.com")
        return new Response("down", { status: 500 });
      return Response.json({
        properties: {
          timeseries: [
            {
              time: "2026-10-22T13:00:00Z",
              data: {
                instant: {
                  details: {
                    cloud_area_fraction: 5,
                    cloud_area_fraction_low: 5,
                    cloud_area_fraction_medium: 0,
                    cloud_area_fraction_high: 0,
                  },
                },
                next_1_hours: { summary: { symbol_code: "fair_night" } },
              },
            },
          ],
        },
      });
    },
  });
  const forecast = await load(place);
  assert.equal(forecast.source, "MET Norway");
  // MET Norway counts as one model, alone: no other model series.
  assert.deepEqual(
    Object.keys(forecast.hourly).filter((key) => key.includes("_model_")),
    ["cloud_cover_model_met_norway"],
  );
  const [row] = hourlyAstronomyForecast({
    hourly: forecast.hourly,
    night: { start: night.start, end: night.end },
  });
  assert.equal(row.cloud, 5);
  assert.equal(row.cloudSpread, null);
  assert.equal(row.cloudMin, null);
  assert.equal(row.cloudUncertain, false);
  assert.equal(cloudDisagreement(row.cloudModels), null);
});

test("one Open-Meteo call per place serves every model; the folded forecast is kept for the offline fallback", async () => {
  const urls = [];
  let clock = Date.parse("2026-10-22T14:00:00Z");
  const kept = new Map();
  const load = createWeatherCache({
    now: () => clock,
    store: {
      read: async (key) => kept.get(key) || null,
      write: async (key, value) => kept.set(key, value),
    },
    fetcher: async (url) => {
      urls.push(new URL(url));
      return Response.json(raw);
    },
  });
  const first = await load(place);
  assert.equal(urls.length, 1);
  assert.equal(urls[0].searchParams.get("models"), models.join(","));
  assert.equal(first.source, "Open-Meteo");
  assert.deepEqual(first.daily.weather_code, [3]);
  assert.equal(first.hourly.cloud_cover_model_icon_seamless[2], 74);
  // A second read inside the fresh window asks nobody.
  await load(place);
  assert.equal(urls.length, 1);
  // Everything is down later: the last retained values are served, stale.
  clock += 3 * 3600_000;
  const outage = createWeatherCache({
    now: () => clock,
    store: {
      read: async (key) => kept.get(key) || null,
      write: async () => {},
    },
    fetcher: async () => new Response("down", { status: 500 }),
  });
  const stale = await outage(place);
  assert.equal(stale.stale, true);
  assert.equal(stale.hourly.cloud_cover_model_icon_seamless[2], 74);
});

test("the night's verdict carries the « incertaine » tag, and keeps the score", async () => {
  const { nightVerdict } = await import("../dist/night-verdict.js");
  const summary = summarizeAstronomyForecast({ hourly: folded, night });
  const verdict = nightVerdict({
    forecast: summary,
    night: { start: night.start, end: night.end },
    clouds: hourlyAstronomyForecast({ hourly: folded, night }),
  });
  assert.equal(verdict.uncertain, true);
  assert.equal(verdict.score, summary.score);
  const calm = nightVerdict({
    forecast: { ...summary, uncertain: false },
    night: { start: night.start, end: night.end },
  });
  assert.equal("uncertain" in calm, false);
});

// The NIGHT is « incertaine » by its own figures: the night's median cover
// under 20 % and some model at 30 % or more as its mean over the night (an
// hour keeps the rule of 50 % against 20 %).
const night2210 = JSON.parse(
  await readFile(
    new URL("fixtures/weather/compare-2026-10-22-night.json", import.meta.url),
    "utf8",
  ),
);
// Rows of the comparison of the models (local ISO times, +9 h) as an hourly
// forecast.
const hourlyOf = (rowsOfNight, coverOf) => ({
  time: rowsOfNight.map((row) => Date.parse(`${row.time}:00+09:00`) / 1000),
  cloud_cover: rowsOfNight.map(() => 0),
  ...Object.fromEntries(
    night2210.models.map((model) => [
      `cloud_cover_model_${model}`,
      rowsOfNight.map((row, index) => coverOf(model, row, index)),
    ]),
  ),
});
const darkNight = {
  start: Date.parse("2026-10-22T19:00:00+09:00"),
  end: Date.parse("2026-10-23T05:00:00+09:00"),
};

test("the night of 2026-10-22 (ICON 49 % as its night mean, the others 2-6 %, median 7 %) is « incertaine » and says by which model", () => {
  assert.equal(cloudUncertainNightModelPercent, 30);
  const summary = summarizeAstronomyForecast({
    hourly: hourlyOf(night2210.rows, (model, row) => row.covers[model]),
    night: darkNight,
  });
  assert.ok(summary.cloud < 20, `median ${summary.cloud}`);
  assert.equal(summary.uncertain, true);
  // Over the dark night (19:00-05:00) ICON means 53 %; the tool's own
  // 18:00-06:00 table gives 49 %.
  assert.deepEqual(summary.uncertainBy, { model: "icon_seamless", cover: 53 });
});

test("a model steady at 45 % all night against a median of 5 % makes the night « incertaine », though no hour reaches 50 %", () => {
  const hourly = hourlyOf(night2210.rows, (model) =>
    model === "icon_seamless" ? 45 : 5,
  );
  const hours = hourlyAstronomyForecast({ hourly, night: darkNight });
  assert.equal(
    hours.some((row) => row.cloudUncertain),
    false,
  );
  const summary = summarizeAstronomyForecast({ hourly, night: darkNight });
  assert.equal(summary.uncertain, true);
  assert.deepEqual(summary.uncertainBy, { model: "icon_seamless", cover: 45 });
});

test("one hour of one model at 100 % in a clear night does not make the night « incertaine »", () => {
  const hourly = hourlyOf(night2210.rows, (model, row, index) =>
    model === "icon_seamless" && index === 8 ? 100 : 4,
  );
  const hours = hourlyAstronomyForecast({ hourly, night: darkNight });
  // The hour itself still carries the tag (its own rule is unchanged).
  assert.equal(
    hours.some((row) => row.cloudUncertain),
    true,
  );
  const summary = summarizeAstronomyForecast({ hourly, night: darkNight });
  assert.equal(summary.uncertain, false);
  assert.equal("uncertainBy" in summary, false);
});

test("the night rule: a median under 20 % and a model at 30 % or more as its night mean", () => {
  assert.equal(nightCloudUncertainty(19.9, { a: 30, b: 4 }).uncertain, true);
  assert.equal(nightCloudUncertainty(19.9, { a: 29.9, b: 4 }).uncertain, false);
  assert.equal(nightCloudUncertainty(20, { a: 90, b: 4 }).uncertain, false);
  assert.equal(nightCloudUncertainty(5, { a: 40 }).uncertain, true);
  assert.deepEqual(nightCloudUncertainty(5, {}), {
    uncertain: false,
    model: null,
    cover: null,
  });
});

test("the night's verdict carries the model that makes it « incertaine »", async () => {
  const { nightVerdict } = await import("../dist/night-verdict.js");
  const hourly = hourlyOf(night2210.rows, (model) =>
    model === "icon_seamless" ? 45 : 5,
  );
  const summary = summarizeAstronomyForecast({ hourly, night: darkNight });
  const verdict = nightVerdict({
    forecast: summary,
    night: { start: darkNight.start, end: darkNight.end },
    clouds: hourlyAstronomyForecast({ hourly, night: darkNight }),
  });
  assert.equal(verdict.uncertain, true);
  assert.deepEqual(verdict.uncertainBy, { model: "icon_seamless", cover: 45 });
});
