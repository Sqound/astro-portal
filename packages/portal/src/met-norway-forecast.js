import { effectiveCloudCover } from "./astronomy-forecast.js";

const defaultEndpoint =
  "https://api.met.no/weatherapi/locationforecast/2.0/complete";

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function metNorwayForecastUrl(
  { latitude, longitude },
  { endpoint = defaultEndpoint } = {},
) {
  const lat =
    latitude === null || latitude === undefined || latitude === ""
      ? NaN
      : Number(latitude);
  const lon =
    longitude === null || longitude === undefined || longitude === ""
      ? NaN
      : Number(longitude);
  if (
    !Number.isFinite(lat) ||
    Math.abs(lat) > 90 ||
    !Number.isFinite(lon) ||
    Math.abs(lon) > 180
  )
    throw new Error("Invalid MET Norway coordinates.");
  const url = new URL(endpoint);
  // MET Norway rejects coordinates with more than four decimals and asks
  // clients to round them so its shared cache remains effective.
  url.searchParams.set("lat", lat.toFixed(3));
  url.searchParams.set("lon", lon.toFixed(3));
  return url;
}

export function metNorwayWeatherCode(symbol) {
  const value = String(symbol || "")
    .toLowerCase()
    .replace(/_(day|night|polartwilight)$/, "");
  if (!value) return null;
  if (value.includes("thunder")) return 95;
  if (value.includes("fog")) return 45;
  if (value.includes("heavysnowshowers")) return 86;
  if (value.includes("snowshowers")) return 85;
  if (value.includes("heavysnow")) return 75;
  if (value.includes("snow")) return 73;
  if (value.includes("sleetshowers")) return 85;
  if (value.includes("sleet")) return 68;
  if (value.includes("heavyrainshowers")) return 82;
  if (value.includes("rainshowers")) return 80;
  if (value.includes("heavyrain")) return 65;
  if (value.includes("lightrain")) return 61;
  if (value.includes("rain")) return 63;
  if (value.includes("partlycloudy")) return 2;
  if (value.includes("cloudy")) return 3;
  if (value.includes("fair")) return 1;
  if (value.includes("clear")) return 0;
  return null;
}

function rowFromSeries(entry) {
  const time = Date.parse(entry?.time || "");
  if (!Number.isFinite(time)) return null;
  const instant = entry?.data?.instant?.details || {};
  const nextHour = entry?.data?.next_1_hours || {};
  const cloud = finite(instant.cloud_area_fraction);
  const wind = finite(instant.wind_speed);
  const gust = finite(instant.wind_speed_of_gust);
  return {
    time: new Date(time).toISOString(),
    cloud,
    cloudLow: finite(instant.cloud_area_fraction_low),
    cloudMid: finite(instant.cloud_area_fraction_medium),
    cloudHigh: finite(instant.cloud_area_fraction_high),
    precipitation: finite(nextHour.details?.probability_of_precipitation),
    humidity: finite(instant.relative_humidity),
    wind: wind === null ? null : Number((wind * 3.6).toFixed(2)),
    windDirection: finite(instant.wind_from_direction),
    temperature: finite(instant.air_temperature),
    dewPoint: finite(instant.dew_point_temperature),
    gust: gust === null ? null : Number((gust * 3.6).toFixed(2)),
    precipitationAmount: finite(nextHour.details?.precipitation_amount),
    symbol:
      nextHour.summary?.symbol_code ||
      entry?.data?.next_6_hours?.summary?.symbol_code ||
      entry?.data?.next_12_hours?.summary?.symbol_code ||
      null,
  };
}

export function normalizeMetNorwayForecast(value) {
  const rows = (value?.properties?.timeseries || [])
    .map(rowFromSeries)
    .filter(Boolean);
  if (!rows.length || !rows.some((row) => row.cloud !== null)) return null;

  const hourly = {
    time: rows.map((row) => row.time),
    cloud_cover: rows.map((row) => row.cloud),
    cloud_cover_low: rows.map((row) => row.cloudLow),
    cloud_cover_mid: rows.map((row) => row.cloudMid),
    cloud_cover_high: rows.map((row) => row.cloudHigh),
    precipitation_probability: rows.map((row) => row.precipitation),
    // Locationforecast does not publish a visibility distance. Keep the
    // absence explicit instead of deriving a misleading value from fog cover.
    visibility: rows.map(() => null),
    wind_speed_10m: rows.map((row) => row.wind),
    wind_direction_10m: rows.map((row) => row.windDirection),
    relative_humidity_2m: rows.map((row) => row.humidity),
    // MET Norway counts as one weather model among those whose median
    // is the retained cover (alone when it is the fallback): its
    // effective cover, under the same key the Open-Meteo models use.
    cloud_cover_model_met_norway: rows.map((row) => {
      const cover = effectiveCloudCover({
        cloud: row.cloud === null ? NaN : row.cloud,
        cloudLow: row.cloudLow === null ? NaN : row.cloudLow,
        cloudMid: row.cloudMid === null ? NaN : row.cloudMid,
        cloudHigh: row.cloudHigh === null ? NaN : row.cloudHigh,
      });
      return Number.isFinite(cover) ? Math.round(cover * 10) / 10 : null;
    }),
  };
  // The night's own data, under the Open-Meteo keys. A series is added only
  // when at least one hour carries it, so a response without any of them
  // normalizes exactly as before; an hour that lacks it reads `null`.
  for (const [field, key] of [
    ["temperature", "temperature_2m"],
    ["dewPoint", "dew_point_2m"],
    ["gust", "wind_gusts_10m"],
    ["precipitationAmount", "precipitation"],
  ])
    if (rows.some((row) => row[field] !== null))
      hourly[key] = rows.map((row) => row[field]);

  const dailyByDate = new Map();
  rows.forEach((row) => {
    const weatherCode = metNorwayWeatherCode(row.symbol);
    if (weatherCode === null) return;
    const date = row.time.slice(0, 10);
    const hour = new Date(row.time).getUTCHours();
    const distanceFromNoon = Math.abs(hour - 12);
    const current = dailyByDate.get(date);
    if (!current || distanceFromNoon < current.distanceFromNoon)
      dailyByDate.set(date, { weatherCode, distanceFromNoon });
  });
  const dates = [...dailyByDate.keys()].sort();
  const missingFields = [];
  if (!hourly.precipitation_probability.some(Number.isFinite))
    missingFields.push("precipitation_probability");
  if (!hourly.visibility.some(Number.isFinite))
    missingFields.push("visibility");

  return {
    hourly,
    daily: {
      time: dates,
      weather_code: dates.map((date) => dailyByDate.get(date).weatherCode),
    },
    missingFields,
  };
}
