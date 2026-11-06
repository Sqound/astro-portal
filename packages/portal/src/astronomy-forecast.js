import { dewRiskLevel, nightDewRisk } from "./dew-risk.js";

const dayMs = 24 * 60 * 60 * 1000;

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const average = (values, fallback = 0) => {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return fallback;
  return valid.reduce((total, value) => total + value, 0) / valid.length;
};

const measured = (value) =>
  value === null || value === undefined || value === "" ? NaN : Number(value);

// The night's own data: temperature and dew point (°C), gusts (km/h) and the
// rain amount (mm over the hour). They are additive: a row or a summary
// carries one of them only when the forecast it was built from carries the
// series at all (`hourly.temperature_2m` is an array), so a forecast without
// them — an older cached payload, a fixture — reads exactly as before. A
// series that is present but has a gap gives `null` for that hour, never a
// false zero.
export const nightForecastSeries = {
  temperature: "temperature_2m",
  dewPoint: "dew_point_2m",
  gust: "wind_gusts_10m",
  precipitationAmount: "precipitation",
};

const hasSeries = (hourly, key) => Array.isArray(hourly?.[key]);
const tenths = (value) =>
  Number.isFinite(value) ? Math.round(value * 10) / 10 : null;

function nightFields(hourly, index) {
  const fields = {};
  for (const [field, key] of Object.entries(nightForecastSeries))
    if (hasSeries(hourly, key)) fields[field] = measured(hourly[key][index]);
  return fields;
}

function timestamp(value) {
  if (typeof value === "number") return value * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// The forecast's reach: the provider is asked for sixteen
// days (today and the fifteen next); the first eleven (0-10 days out) are
// the reliable part, the five after it only a trend.
export const forecastReliableDays = 10;
export const forecastTrendDays = 15;

/**
 * `available` (0-10 days out), `trend` (11-15 days out: the forecast exists
 * but is only a trend), `past`, `beyond-range` (> 15) or `invalid`.
 *
 * The day the distance is counted from is the UTC date of `now`, unless
 * `currentNight` (`YYYY-MM-DD`) says which night the place is in: the night
 * being lived at the place (`tonightDate`), whose date is not the UTC date
 * from the place's evening to the next dawn — west of Greenwich the evening
 * is already the next UTC day (REV.simfixa.3).
 */
export function forecastDateAvailability(
  date,
  now = new Date(),
  currentNight = null,
) {
  const requested = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(requested)) return "invalid";
  // Accept a Date, an ISO instant or epoch milliseconds so the rule is
  // reproducible from a fixture without a live clock.
  const instant = new Date(now);
  const night =
    typeof currentNight === "string"
      ? Date.parse(`${currentNight}T12:00:00Z`)
      : Number.NaN;
  const current = Number.isFinite(night)
    ? night
    : Date.UTC(
        instant.getUTCFullYear(),
        instant.getUTCMonth(),
        instant.getUTCDate(),
        12,
      );
  const distance = Math.round((requested - current) / dayMs);
  if (distance < 0) return "past";
  if (distance > forecastTrendDays) return "beyond-range";
  if (distance > forecastReliableDays) return "trend";
  return "available";
}

/** Whether a forecast exists for the night: `available` or `trend`. */
export function forecastDateIsNear(
  date,
  now = new Date(),
  currentNight = null,
) {
  const availability = forecastDateAvailability(date, now, currentNight);
  return availability === "available" || availability === "trend";
}

export function astronomyForecastUrl({ latitude, longitude, night }) {
  const startDate = new Date(night.start).toISOString().slice(0, 10);
  const endDate = new Date(night.end).toISOString().slice(0, 10);
  return astronomyForecastRangeUrl({
    latitude,
    longitude,
    startDate,
    endDate,
  });
}

// The weather models asked together. On one night a single model
// (ICON) saw 61-74 % of cloud, 42-53 % of it middle cloud (altocumulus), where
// JMA, ECMWF, GFS and MET Norway saw 1-9 %: the photographs of the sky agreed
// with ICON. One model can miss a whole layer, so the forecast asks several in
// the same call (Open-Meteo answers one series per model, suffixed with the
// model's identifier) and keeps the most pessimistic cover. `best_match` is
// Open-Meteo's own choice (the model of the place's country: JMA MSM in Japan);
// it also supplies every non-cloud series, as before.
export const forecastCloudModels = Object.freeze([
  "best_match",
  "ecmwf_ifs025",
  "icon_seamless",
  "gfs_seamless",
]);
export const forecastJapanModel = "jma_seamless";

/**
 * The names the models are shown under: proper names, never translated.
 * `best_match` reads « Open-Meteo » (it is Open-Meteo's own pick).
 */
export const forecastModelLabels = Object.freeze({
  best_match: "Open-Meteo",
  ecmwf_ifs025: "ECMWF",
  icon_seamless: "ICON",
  gfs_seamless: "GFS",
  jma_seamless: "JMA",
  met_norway: "MET Norway",
});

// A coarse box around the Japanese islands (JMA's models are the local ones).
// Asking JMA somewhere else is harmless, so the box need not be exact.
const japanBox = { south: 24, north: 46, west: 122, east: 154 };

/** The models to ask for a place: the common four, plus JMA in Japan. */
export function astronomyForecastModels({ latitude, longitude } = {}) {
  const lat = measured(latitude);
  const lon = measured(longitude);
  const inJapan =
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= japanBox.south &&
    lat <= japanBox.north &&
    lon >= japanBox.west &&
    lon <= japanBox.east;
  return inJapan
    ? [...forecastCloudModels, forecastJapanModel]
    : [...forecastCloudModels];
}

export function astronomyForecastRangeUrl({
  latitude,
  longitude,
  startDate,
  endDate,
  models = null,
}) {
  const parameters = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    start_date: startDate,
    end_date: endDate,
    timezone: "GMT",
    timeformat: "unixtime",
    wind_speed_unit: "kmh",
    hourly:
      "cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation_probability,visibility,wind_speed_10m,wind_direction_10m,relative_humidity_2m,temperature_2m,dew_point_2m,wind_gusts_10m,precipitation",
    daily: "weather_code",
    ...(Array.isArray(models) && models.length
      ? { models: models.join(",") }
      : {}),
  });
  return `https://api.open-meteo.com/v1/forecast?${parameters}`;
}

// The hourly series the archive has (measured on
// 2026-10-12): neither a rain probability nor a visibility — the rain is
// the amount that fell (`measuredRainProbability`), the haze stays neutral.
export const astronomyHistoryHourly =
  "cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation,wind_speed_10m,wind_direction_10m,relative_humidity_2m,temperature_2m,dew_point_2m,wind_gusts_10m";

/** The measured weather of past days: the Open-Meteo archive. */
export function astronomyHistoryRangeUrl({
  latitude,
  longitude,
  startDate,
  endDate,
}) {
  const parameters = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    start_date: startDate,
    end_date: endDate,
    timezone: "GMT",
    timeformat: "unixtime",
    wind_speed_unit: "kmh",
    hourly: astronomyHistoryHourly,
    daily: "weather_code",
  });
  return `https://archive-api.open-meteo.com/v1/archive?${parameters}`;
}

export function weatherCodeForDate(daily, date) {
  const target = Date.parse(`${date}T00:00:00Z`);
  const index = (daily?.time || []).findIndex((value) => {
    if (typeof value === "string") return value.slice(0, 10) === date;
    const instant = timestamp(value);
    return instant !== null && instant === target;
  });
  return index >= 0 ? Number(daily.weather_code?.[index]) : null;
}

// The night's score:
// every hour of the dark night gets a score out of 100 from that hour's own
// forecast, and the night's score is the mean of those hours. Each of six
// factors turns its value into a weight between 0 and 1 by a piecewise-linear
// curve; the hour is 100 × the product of the weights. No cap: rain and haze
// are factors like the others. A missing metric is a neutral weight (1).
// The seeing does not count (the forecast does not give it).

// The cloud weight (×100) against the cover (%): gentle for a few wisps,
// steep from 5 % (a few clouds already spoil a photograph), nil from 60 %.
export const cloudScoreCurve = Object.freeze(
  [
    [0, 100],
    [5, 95],
    [10, 82],
    [15, 70],
    [20, 58],
    [25, 46],
    [30, 35],
    [40, 20],
    [60, 0],
  ].map((point) => Object.freeze(point)),
);

const frozenCurve = (points) =>
  Object.freeze(points.map((point) => Object.freeze(point)));

// The six factors' curves, value → weight ×100 (`moon` is a rule, not a
// curve: `moonWeightMaximum`). Rain: the probability (%), harsh from 10 %;
// haze: the visibility (km), no effect beyond 10 km; wind: the retained
// wind (`max(wind, 0.7 × gust)`, km/h), full up to 25; humidity (%), 92 at
// worst.
export const forecastScoreCurves = Object.freeze({
  cloud: cloudScoreCurve,
  rain: frozenCurve([
    [0, 100],
    [10, 92],
    [20, 75],
    [30, 52],
    [40, 32],
    [60, 10],
    [80, 0],
  ]),
  visibility: frozenCurve([
    [0, 5],
    [1, 20],
    [2, 45],
    [5, 80],
    [10, 100],
  ]),
  wind: frozenCurve([
    [0, 100],
    [25, 100],
    [35, 92],
    [45, 75],
    [60, 40],
    [75, 10],
    [90, 0],
  ]),
  humidity: frozenCurve([
    [0, 100],
    [90, 100],
    [95, 96],
    [100, 92],
  ]),
});

// The six factors, in the order of the sheet's columns.
export const forecastScoreFactors = Object.freeze([
  "cloud",
  "rain",
  "moon",
  "visibility",
  "wind",
  "humidity",
]);

// The Moon takes at most 20 % of the hour: a full Moon at 30° or higher.
export const moonWeightMaximum = 0.2;

function curveValue(curve, value) {
  const first = curve[0];
  if (value <= first[0]) return first[1];
  for (let index = 1; index < curve.length; index += 1) {
    const [x1, y1] = curve[index];
    if (value <= x1) {
      const [x0, y0] = curve[index - 1];
      return y0 + ((y1 - y0) * (value - x0)) / (x1 - x0);
    }
  }
  return curve[curve.length - 1][1];
}

// The levels' lower bounds, unchanged: excellent, favourable, variable.
const levelOf = (score) =>
  score >= 82
    ? "excellent"
    : score >= 64
      ? "favourable"
      : score >= 42
        ? "variable"
        : "poor";

/** The cloud score (0–100) for a cover in %, or `null` without a cover. */
export function cloudCoverScore(cover) {
  const value = measured(cover);
  if (!Number.isFinite(value)) return null;
  return curveValue(cloudScoreCurve, value);
}

/**
 * The Moon's weight (0.8–1) for its altitude (degrees) and the share of its
 * disc lit (percent): `1 − 0.20 × illumination × min(1, altitude ÷ 30°)`, 1
 * when it is set; `null` when either is unknown.
 */
export function moonWeight(altitude, illumination) {
  const height = measured(altitude);
  const lit = measured(illumination);
  if (!Number.isFinite(height) || !Number.isFinite(lit)) return null;
  if (height <= 0) return 1;
  return (
    1 - moonWeightMaximum * clamp(lit / 100, 0, 1) * Math.min(1, height / 30)
  );
}

// The cover that counts: low and middle clouds whole, high clouds at half,
// never more than the total cover (the layers overlap); the total alone when
// a layer is missing.
export function effectiveCloudCover({ cloud, cloudLow, cloudMid, cloudHigh }) {
  const total = measured(cloud);
  const low = measured(cloudLow);
  const mid = measured(cloudMid);
  const high = measured(cloudHigh);
  if (!Number.isFinite(low) || !Number.isFinite(mid) || !Number.isFinite(high))
    return total;
  const layered = low + mid + high / 2;
  return clamp(
    Number.isFinite(total) ? Math.min(total, layered) : layered,
    0,
    100,
  );
}

// The series each model's effective cover is carried in, once folded
// (`foldForecastModels`): `cloud_cover_model_<identifier>`.
export const forecastModelSeriesPrefix = "cloud_cover_model_";

// Two models further apart than this (points of cover) are said to disagree.
export const cloudDisagreementPoints = 25;

// A night score is said « incertaine » when some model sees a covered sky
// (this cover or more) while the median of the models sees a clear one (under
// the second figure). The tag never lowers the score.
export const cloudUncertainHighPercent = 50;
export const cloudUncertainMedianPercent = 20;
// A NIGHT is said « incertaine » when its median cover (the mean of the
// hours' medians) is under `cloudUncertainMedianPercent` while some model
// gives this cover or more as its mean over the night. (An hour keeps the
// rule above.)
export const cloudUncertainNightModelPercent = 30;

/**
 * The night's « incertaine » tag: `{ uncertain, model, cover }`. `cover` is
 * the night's retained (median) cover, `means` the mean cover of each model
 * over the night (`{ <identifier>: % }`). `model` and `cover` (whole) name
 * the model with the highest night mean, the first on a tie.
 */
export function nightCloudUncertainty(cover, means) {
  const entries = Object.entries(means || {}).filter(([, value]) =>
    Number.isFinite(value),
  );
  let top = null;
  for (const [model, value] of entries)
    if (!top || value > top.cover) top = { model, cover: value };
  const uncertain =
    top !== null &&
    Number.isFinite(cover) &&
    cover < cloudUncertainMedianPercent &&
    top.cover >= cloudUncertainNightModelPercent;
  return {
    uncertain,
    model: top ? top.model : null,
    cover: top ? Math.round(top.cover) : null,
  };
}

/**
 * The cover that counts when several models answer: the MEDIAN of their
 * effective covers (the mean of the two middle ones for an even count).
 * `models` is `{ <identifier>: cover % }`; a model without a finite value is
 * ignored. Returns `{ cover, min, max, spread, count, uncertain, high, low }`
 * (`cover` the median; `high` and `low`: `{ model, cover }`, a tie going to
 * the local model JMA, then to a named model, `best_match` last; `spread` =
 * `max − min`, 0 for one model; `uncertain`: some model gives
 * `cloudUncertainHighPercent` or more while the median gives under
 * `cloudUncertainMedianPercent`), or `null` when none answers.
 *
 * Why the median: the maximum of the models was tried
 * first — one night ICON saw 74 % where four others saw 3-13 % and the
 * photographs sided with ICON — but ICON runs cloudier than the others
 * evening after evening (over the 40 evenings before, its mean cover is 84 %
 * against 54 % for JMA, and the maximum reached 50 % or more on 38 of them),
 * which would have made nearly every night « poor ». The median follows the
 * crowd; the range and the « incertaine » tag say when one model disagrees.
 */
export function retainedCloudCover(models) {
  const entries = Object.entries(
    models && typeof models === "object" ? models : {},
  )
    .map(([model, value]) => ({ model, cover: measured(value) }))
    .filter((entry) => Number.isFinite(entry.cover));
  if (!entries.length) return null;
  // Ties are settled the same way on every runtime (the phone's sort is not
  // stable): the local model (JMA, asked in Japan only) first, then the other
  // named models, `best_match` last (it only repeats one of them), then the
  // identifier's order.
  const rank = (entry) =>
    entry.model === forecastJapanModel
      ? 0
      : entry.model === "best_match"
        ? 2
        : 1;
  const tie = (a, b) =>
    rank(a) - rank(b) || (a.model < b.model ? -1 : a.model > b.model ? 1 : 0);
  const byHigh = [...entries].sort((a, b) => b.cover - a.cover || tie(a, b));
  const byLow = [...entries].sort((a, b) => a.cover - b.cover || tie(a, b));
  const high = byHigh[0];
  const low = byLow[0];
  const sorted = entries.map((entry) => entry.cover).sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  const median =
    sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  const cover = clamp(median, 0, 100);
  return {
    cover,
    min: low.cover,
    max: high.cover,
    spread: high.cover - low.cover,
    count: entries.length,
    uncertain:
      high.cover >= cloudUncertainHighPercent &&
      cover < cloudUncertainMedianPercent,
    high: { model: high.model, cover: high.cover },
    low: { model: low.model, cover: low.cover },
  };
}

/**
 * The disagreement between the models, to be said: `{ high, low }` (each
 * `{ model, label, cover }`, the cover whole) when the highest and the lowest
 * cover are at least `cloudDisagreementPoints` apart, `null` otherwise
 * (including a single model).
 */
export function cloudDisagreement(models) {
  const retained = retainedCloudCover(models);
  if (!retained || retained.count < 2) return null;
  if (retained.spread < cloudDisagreementPoints) return null;
  const named = (entry) => ({
    model: entry.model,
    label: forecastModelLabels[entry.model] || entry.model,
    cover: Math.round(entry.cover),
  });
  return { high: named(retained.high), low: named(retained.low) };
}

/**
 * Open-Meteo's multi-model answer folded into the single-series shape every
 * reader knows. The answer carries each variable once per model
 * (`cloud_cover_icon_seamless`, `wind_speed_10m_best_match`…): the series of
 * the base model (`best_match`, else the first one) take the plain names, and
 * each model's effective cover (low + middle + high ÷ 2, never above its
 * total) is added as `cloud_cover_model_<identifier>`. An answer without any
 * model suffix (a single-model answer) is returned as it is.
 */
export function foldForecastModels(hourly, models = forecastCloudModels) {
  if (!hourly || !Array.isArray(hourly.time)) return hourly;
  const present = models.filter((id) =>
    Array.isArray(hourly[`cloud_cover_${id}`]),
  );
  if (!present.length) return hourly;
  const base = present.includes("best_match") ? "best_match" : present[0];
  const folded = { time: hourly.time };
  for (const [key, series] of Object.entries(hourly)) {
    if (key !== "time" && key.endsWith(`_${base}`))
      folded[key.slice(0, -(base.length + 1))] = series;
  }
  // In Japan `best_match` IS JMA's model: counting both would give it two
  // votes in the median, so only JMA's own series is kept as a model.
  const voters = present.filter(
    (id) => !(id === "best_match" && present.includes(forecastJapanModel)),
  );
  for (const id of voters) {
    const at = (name, index) => measured(hourly[`${name}_${id}`]?.[index]);
    folded[`${forecastModelSeriesPrefix}${id}`] = hourly.time.map(
      (_, index) => {
        const cover = effectiveCloudCover({
          cloud: at("cloud_cover", index),
          cloudLow: at("cloud_cover_low", index),
          cloudMid: at("cloud_cover_mid", index),
          cloudHigh: at("cloud_cover_high", index),
        });
        return Number.isFinite(cover) ? tenths(cover) : null;
      },
    );
  }
  return folded;
}

/**
 * The same fold for the daily series (`weather_code_best_match` →
 * `weather_code`): the base model's series take the plain names.
 */
export function foldDailyModels(daily, models = forecastCloudModels) {
  if (!daily || !Array.isArray(daily.time)) return daily;
  const present = models.filter((id) =>
    Array.isArray(daily[`weather_code_${id}`]),
  );
  if (!present.length) return daily;
  const base = present.includes("best_match") ? "best_match" : present[0];
  const folded = { time: daily.time };
  for (const [key, series] of Object.entries(daily))
    if (key !== "time" && key.endsWith(`_${base}`))
      folded[key.slice(0, -(base.length + 1))] = series;
  return folded;
}

// The covers of the models at one index of the hourly series.
function modelCoversAt(hourly, index) {
  const covers = {};
  for (const [key, series] of Object.entries(hourly || {})) {
    if (!key.startsWith(forecastModelSeriesPrefix) || !Array.isArray(series))
      continue;
    const value = measured(series[index]);
    if (Number.isFinite(value))
      covers[key.slice(forecastModelSeriesPrefix.length)] = value;
  }
  return covers;
}

const hasModelSeries = (hourly) =>
  Object.keys(hourly || {}).some(
    (key) =>
      key.startsWith(forecastModelSeriesPrefix) && Array.isArray(hourly[key]),
  );

// The wind that counts: the stronger of the wind and 70 % of the gusts.
function retainedWind(hour) {
  const wind = measured(hour.wind);
  const gust = measured(hour.gust);
  if (!Number.isFinite(gust)) return wind;
  return Number.isFinite(wind) ? Math.max(wind, gust * 0.7) : gust * 0.7;
}

// The points lost by an hour scored `value`, split between the factors in
// proportion to −ln(weight): the parts add up to the loss, a weight of 1
// takes nothing; when weights are nil, they share the whole loss.
function splitLoss(value, weights) {
  const lost = 100 - value;
  const parts = Object.fromEntries(forecastScoreFactors.map((key) => [key, 0]));
  if (lost <= 0) return parts;
  const nil = forecastScoreFactors.filter((key) => weights[key] === 0);
  if (nil.length) {
    for (const key of nil) parts[key] = lost / nil.length;
    return parts;
  }
  const logs = forecastScoreFactors.map((key) =>
    weights[key] === null ? 0 : Math.max(0, -Math.log(weights[key])),
  );
  const total = logs.reduce((sum, part) => sum + part, 0);
  if (total <= 0) return parts;
  forecastScoreFactors.forEach((key, index) => {
    parts[key] = (lost * logs[index]) / total;
  });
  return parts;
}

// One hour's score, unrounded, with its weights and the points each factor
// takes; `null` without a cloud cover.
function scoreHour(hour) {
  // Several models answered: the retained cover (their maximum), else the
  // one model's effective cover as always.
  const retained = retainedCloudCover(hour.cloudModels);
  const cover = retained ? retained.cover : effectiveCloudCover(hour);
  if (!Number.isFinite(cover)) return null;
  const precipitation = measured(hour.precipitation);
  const visibility = measured(hour.visibility);
  const wind = retainedWind(hour);
  const humidity = measured(hour.humidity);
  const weightOf = (key, value) =>
    Number.isFinite(value)
      ? curveValue(forecastScoreCurves[key], value) / 100
      : null;
  const weights = {
    cloud: weightOf("cloud", cover),
    rain: weightOf("rain", precipitation),
    moon: moonWeight(hour.moonAltitude, hour.moonIllumination),
    visibility: weightOf("visibility", visibility / 1000),
    wind: weightOf("wind", wind),
    humidity: weightOf("humidity", humidity),
  };
  const product = forecastScoreFactors.reduce(
    (total, key) => (weights[key] === null ? total : total * weights[key]),
    1,
  );
  const value = clamp(100 * product, 0, 100);
  return { value, cover, weights, losses: splitLoss(value, weights) };
}

/**
 * One hour's score from that hour's forecast: `hour` is a row of
 * `hourlyAstronomyForecast` (`cloud`, `cloudLow`, `cloudMid`, `cloudHigh`,
 * `precipitation` (probability, %), `visibility` in metres, `wind`, `gust`,
 * `humidity`, `cloudModels` (`{ <model>: cover % }`: with several models the
 * retained cover is their maximum, `cloud` and the layers then being
 * ignored), and `moonAltitude` (°) with `moonIllumination` (%) when the Moon
 * is known). Returns `{ score, category, cover, factors, losses }` —
 * `factors` the six weights ×100, whole (`cloud`, `rain`, `moon`,
 * `visibility`, `wind`, `humidity`; `null` when the forecast lacks one: it is
 * then neutral), `losses` the points each factor takes from the hour (tenths,
 * they add up to `100 − score` before rounding) — or `null` without a cloud
 * cover.
 */
export function forecastHourScore(hour) {
  const scored = hour && typeof hour === "object" ? scoreHour(hour) : null;
  if (!scored) return null;
  const score = Math.round(scored.value);
  return {
    score,
    category: levelOf(score),
    cover: tenths(scored.cover),
    factors: Object.fromEntries(
      forecastScoreFactors.map((key) => [
        key,
        scored.weights[key] === null
          ? null
          : Math.round(scored.weights[key] * 100),
      ]),
    ),
    losses: Object.fromEntries(
      forecastScoreFactors.map((key) => [key, tenths(scored.losses[key])]),
    ),
  };
}

/**
 * The share of the loss over a stretch of the night (the reason of the
 * night's sentence): `hours` are rows `forecastHourScore` reads. Each
 * hour's lost points are split between the factors in proportion to
 * −ln(weight); a factor's points are the mean of its points over the scored
 * hours, its share those points over the mean loss. Returns `{ hours,
 * score, lost, factors: { <factor>: { points, share } } }` (`score` and
 * `lost` whole, `points` in tenths, `share` a percentage in tenths, the
 * shares adding up to 100 when something is lost, all 0 otherwise), or
 * `null` when no hour is scored.
 */
export function forecastLossShares(hours) {
  const scored = (Array.isArray(hours) ? hours : [])
    .map((hour) => (hour && typeof hour === "object" ? scoreHour(hour) : null))
    .filter((entry) => entry !== null);
  if (!scored.length) return null;
  const mean = (read) =>
    scored.reduce((total, entry) => total + read(entry), 0) / scored.length;
  const score = mean((entry) => entry.value);
  const lost = 100 - score;
  return {
    hours: scored.length,
    score: Math.round(score),
    lost: Math.round(lost),
    factors: Object.fromEntries(
      forecastScoreFactors.map((key) => {
        const points = mean((entry) => entry.losses[key]);
        return [
          key,
          {
            points: tenths(points),
            share: lost > 0 ? tenths((points / lost) * 100) : 0,
          },
        ];
      }),
    ),
  };
}

// The Moon of the night (`{ illumination, series }`: the share of the disc
// lit, percent, and `moonSeries`' `[{ time, altitude }]`), read at an
// instant: the altitude interpolated between the two samples around it,
// `null` outside the series or without a Moon.
function moonAt(moon, time) {
  const illumination = measured(moon?.illumination);
  const points = (Array.isArray(moon?.series) ? moon.series : [])
    .map((point) => ({
      time:
        typeof point?.time === "number" ? point.time : Date.parse(point?.time),
      altitude: measured(point?.altitude),
    }))
    .filter(
      (point) => Number.isFinite(point.time) && Number.isFinite(point.altitude),
    );
  if (!Number.isFinite(illumination) || !points.length) return null;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[index];
    if (next.time === time)
      return { moonAltitude: next.altitude, moonIllumination: illumination };
    if (next.time > time) {
      if (index === 0) return null;
      const previous = points[index - 1];
      const share = (time - previous.time) / (next.time - previous.time);
      return {
        moonAltitude:
          previous.altitude + (next.altitude - previous.altitude) * share,
        moonIllumination: illumination,
      };
    }
  }
  return null;
}

/**
 * The night's note on measured weather: the archive has no
 * rain probability, only the amount that fell in the hour. An hour with at
 * least 0.1 mm counts as a certain rain (100 %, the rain weight at its
 * floor), a dry hour as none (0 %, full weight); `NaN` without an amount, so
 * the factor stays neutral as a missing forecast field does.
 */
export const measuredRainThresholdMm = 0.1;

export function measuredRainProbability(amount) {
  const value = measured(amount);
  if (!Number.isFinite(value)) return NaN;
  return value >= measuredRainThresholdMm ? 100 : 0;
}

// The weather factors a measured night can carry (the Moon is computed).
// A technical list of factor identifiers, not copy: it is the second entry of
// this file in the positional-copy inventory, like the provider's variables.
const measuredWeatherFactors = [
  "cloud",
  "rain",
  "visibility",
  "wind",
  "humidity",
];

// The weather factors at least one row of the night has a value for.
function factorsPresent(rows) {
  const has = (read) => rows.some((row) => Number.isFinite(read(row)));
  const present = {
    cloud: has((row) => row.cloud),
    rain: has((row) => row.precipitation),
    visibility: has((row) => row.visibility),
    wind: has((row) => row.wind) || has((row) => row.gust),
    humidity: has((row) => row.humidity),
  };
  return measuredWeatherFactors.filter((factor) => present[factor]);
}

// The rows of the dark night; with the night's Moon, each row carries its
// `moonAltitude` (°) and `moonIllumination` (%) when the series covers it.
// `measured` reads the archive's rows (`/v1/weather/history`): the rain is
// the amount mapped by `measuredRainProbability`.
function forecastRows(hourly, start, end, moon = null, isMeasured = false) {
  const withModels = hasModelSeries(hourly);
  return (
    hourly.time
      .map((value, index) => ({
        time: timestamp(value),
        cloud: measured(hourly.cloud_cover?.[index]),
        cloudLow: measured(hourly.cloud_cover_low?.[index]),
        cloudMid: measured(hourly.cloud_cover_mid?.[index]),
        cloudHigh: measured(hourly.cloud_cover_high?.[index]),
        precipitation: isMeasured
          ? measuredRainProbability(hourly.precipitation?.[index])
          : measured(hourly.precipitation_probability?.[index]),
        visibility: measured(hourly.visibility?.[index]),
        wind: measured(hourly.wind_speed_10m?.[index]),
        windDirection: measured(hourly.wind_direction_10m?.[index]),
        humidity: measured(hourly.relative_humidity_2m?.[index]),
        ...nightFields(hourly, index),
        ...(withModels ? { cloudModels: modelCoversAt(hourly, index) } : {}),
      }))
      // The cover shown, averaged and scored is the retained one.
      .map((row) => {
        const retained = retainedCloudCover(row.cloudModels);
        return retained ? { ...row, cloud: retained.cover } : row;
      })
      .filter(
        (row) => row.time !== null && row.time >= start && row.time <= end,
      )
      .map((row) => (moon ? { ...row, ...moonAt(moon, row.time) } : row))
  );
}

/**
 * The night's summary over its dark night: `moon` (optional, `{
 * illumination, series }`, the share of the disc lit in percent and
 * `moonSeries`' `[{ time, altitude }]`) brings the Moon into the hours'
 * scores; without it the Moon is neutral.
 */
export function summarizeAstronomyForecast({
  hourly,
  night,
  moon = null,
  measured: isMeasured = false,
}) {
  if (!hourly?.time?.length || !night?.start || !night?.end) return null;
  const start = new Date(night.start).getTime();
  const end = new Date(night.end).getTime();
  const rows = forecastRows(hourly, start, end, moon, isMeasured === true);
  if (!rows.length || !rows.some((row) => Number.isFinite(row.cloud)))
    return null;

  const measure = (key, fallback = null) =>
    average(
      rows.map((row) => row[key]),
      fallback,
    );
  const cloud = measure("cloud", 100);
  const precipitation = measure("precipitation");
  const visibility = measure("visibility");
  const visibilityKm = visibility === null ? null : visibility / 1000;
  const wind = measure("wind");
  // The night's score: the mean of its hours' unrounded scores.
  const hourScores = rows
    .map((row) => scoreHour(row))
    .filter((scored) => scored !== null)
    .map((scored) => scored.value);
  const score = clamp(Math.round(average(hourScores, 0)), 0, 100);
  const additions = {};
  // The weather models' range over the night and the « incertaine » tag,
  // present only when the forecast carries the models' series.
  if (rows.some((row) => row.cloudModels)) {
    const perModel = {};
    for (const row of rows)
      for (const [model, cover] of Object.entries(row.cloudModels || {}))
        (perModel[model] ||= []).push(cover);
    const means = Object.values(perModel).map((covers) => average(covers));
    if (means.length > 1) {
      additions.cloudMin = Math.round(Math.min(...means));
      additions.cloudMax = Math.round(Math.max(...means));
    }
    // The night's tag, by the night's own figures (not by one hour).
    const night = nightCloudUncertainty(
      cloud,
      Object.fromEntries(
        Object.entries(perModel).map(([model, covers]) => [
          model,
          average(covers),
        ]),
      ),
    );
    additions.uncertain = night.uncertain;
    if (night.uncertain)
      additions.uncertainBy = { model: night.model, cover: night.cover };
  }
  if (hasSeries(hourly, nightForecastSeries.gust)) {
    // The strongest gust of the night and the hour it is forecast for
    // (« Rafales jusqu'à 27 km/h vers 00:00 »); the first hour wins a tie.
    const peak = rows.reduce(
      (best, row) =>
        Number.isFinite(row.gust) && (!best || row.gust > best.gust)
          ? row
          : best,
      null,
    );
    additions.gustMax = peak ? Math.round(peak.gust) : null;
    additions.gustMaxAt = peak ? peak.time : null;
  }
  // The night's dew risk (dew-risk.js), an estimate: the highest level and
  // the first hour it is reached. Present whenever the forecast has a
  // temperature series; `null` when no hour says enough.
  if (hasSeries(hourly, nightForecastSeries.temperature))
    additions.dewRisk = nightDewRisk(rows);
  return {
    score,
    category: levelOf(score),
    cloud: Math.round(cloud),
    visibilityKm:
      visibilityKm === null ? null : Math.round(visibilityKm * 10) / 10,
    wind: wind === null ? null : Math.round(wind),
    precipitation: precipitation === null ? null : Math.round(precipitation),
    samples: rows.length,
    ...additions,
    // A night worked out afterwards says so, and which weather factors the
    // record had (the others stayed neutral).
    ...(isMeasured === true
      ? { measured: true, measuredFactors: factorsPresent(rows) }
      : {}),
  };
}

// Keep the hourly rows alongside the night aggregate. The planner uses them
// on the same temporal axis as its acquisition blocks, rather than asking an
// observer to translate a whole-night average back onto a schedule. With the
// night's `moon` (as `summarizeAstronomyForecast`), each row carries its
// `moonAltitude` (°, tenths) and `moonIllumination` (%), and its score
// counts the Moon.
export function hourlyAstronomyForecast({
  hourly,
  night,
  moon = null,
  measured: isMeasured = false,
}) {
  if (!hourly?.time?.length || !night?.start || !night?.end) return [];
  const start = new Date(night.start).getTime();
  const end = new Date(night.end).getTime();
  const whole = (value) => (Number.isFinite(value) ? Math.round(value) : null);
  // The cloud layers are additive, like the
  // night's own series: present only when the forecast carries them.
  const layers = (row) => ({
    ...(hasSeries(hourly, "cloud_cover_low")
      ? { cloudLow: whole(row.cloudLow) }
      : {}),
    ...(hasSeries(hourly, "cloud_cover_mid")
      ? { cloudMid: whole(row.cloudMid) }
      : {}),
    ...(hasSeries(hourly, "cloud_cover_high")
      ? { cloudHigh: whole(row.cloudHigh) }
      : {}),
  });
  return forecastRows(hourly, start, end, moon, isMeasured === true).map(
    (measuredRow) => {
      const { cloudLow, cloudMid, cloudHigh, cloudModels, ...row } =
        measuredRow;
      // The hour's score, from the unrounded values (`forecastHourScore`).
      const scored = scoreHour(measuredRow);
      return {
        ...row,
        ...layers({ cloudLow, cloudMid, cloudHigh }),
        score: scored === null ? null : Math.round(scored.value),
        // The models' covers and their spread, additive: present only when
        // the forecast carries the models' series.
        ...(cloudModels
          ? {
              cloudModels: Object.fromEntries(
                Object.entries(cloudModels).map(([model, cover]) => [
                  model,
                  Math.round(cover),
                ]),
              ),
              ...(() => {
                const retained = retainedCloudCover(cloudModels);
                const several = retained && retained.count > 1;
                return {
                  cloudSpread: several ? Math.round(retained.spread) : null,
                  // The range of the models next to the retained cover
                  // (« 4–74 % »), and the « incertaine » tag.
                  cloudMin: several ? Math.round(retained.min) : null,
                  cloudMax: several ? Math.round(retained.max) : null,
                  cloudUncertain: retained?.uncertain === true,
                };
              })(),
            }
          : {}),
        visibilityKm: Number.isFinite(row.visibility)
          ? Math.round((row.visibility / 1000) * 10) / 10
          : null,
        cloud: Number.isFinite(row.cloud) ? Math.round(row.cloud) : null,
        wind: Number.isFinite(row.wind) ? Math.round(row.wind) : null,
        windDirection: Number.isFinite(row.windDirection)
          ? Math.round(row.windDirection)
          : null,
        humidity: Number.isFinite(row.humidity)
          ? Math.round(row.humidity)
          : null,
        precipitation: Number.isFinite(row.precipitation)
          ? Math.round(row.precipitation)
          : null,
        ...("temperature" in row
          ? {
              temperature: tenths(row.temperature),
              // The hour's dew-risk level, from the unrounded values.
              dewRisk: dewRiskLevel(row),
            }
          : {}),
        ...("dewPoint" in row ? { dewPoint: tenths(row.dewPoint) } : {}),
        ...("gust" in row
          ? { gust: Number.isFinite(row.gust) ? Math.round(row.gust) : null }
          : {}),
        ...("precipitationAmount" in row
          ? { precipitationAmount: tenths(row.precipitationAmount) }
          : {}),
        ...("moonAltitude" in row
          ? { moonAltitude: tenths(row.moonAltitude) }
          : {}),
      };
    },
  );
}
