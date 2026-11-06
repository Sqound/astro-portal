import { placeCoordinates } from "portal/planner/state.js";
import {
  astronomyForecastModels,
  astronomyForecastRangeUrl,
  astronomyHistoryRangeUrl,
  foldDailyModels,
  foldForecastModels,
} from "portal/astronomy-forecast.js";
import {
  metNorwayForecastUrl,
  normalizeMetNorwayForecast,
} from "portal/met-norway-forecast.js";
import { plannerReferenceCacheWindows } from "portal/planner/reference-cache.js";
import { weatherForecastStore } from "portal/persistence/weather-forecast-repository.js";

const fallbackEndpoint =
  "https://api.met.no/weatherapi/locationforecast/2.0/complete";
const fallbackUserAgent =
  "AstroPortal/1.0 (+https://github.com/sqound/astro-portal)";

// A provider's real refusal (429) is honoured for its `Retry-After`, a minute
// when it names none. Everything else -- a timeout, a dropped connection, a
// 5xx, an unreadable body -- says nothing about the provider's limits and is
// only cooled for a few seconds: on a process just started (cold DNS, cold
// TLS) the first call is slow, not refused.
const refusalCooldownSeconds = 60;
const transientCooldownSeconds = 10;

const retryDelay = (response, now, fallback = transientCooldownSeconds) => {
  const retry = response.headers.get("retry-after");
  const seconds = /^\d+$/.test(retry || "")
    ? Number(retry)
    : Math.ceil((Date.parse(retry) - now()) / 1000);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : fallback;
};

const failure = (code, delay = transientCooldownSeconds, provider = null) =>
  Object.assign(new Error("Weather providers temporarily unavailable."), {
    code,
    provider,
    retryAfterSeconds: Math.max(1, delay),
  });

const providerFailure = (cause, provider) =>
  ["provider", "rate_limit"].includes(cause?.code)
    ? cause
    : failure("provider", transientCooldownSeconds, provider);

// One location forecast serves the calendar and every plan in the night.
// Never let a change of optics or constraints create another provider request.
export function createWeatherCache({
  fetcher = fetch,
  now = Date.now,
  freshMs = plannerReferenceCacheWindows.weather.freshMs,
  fallbackFreshMs = plannerReferenceCacheWindows.weather.fallbackFreshMs,
  retainedMs = plannerReferenceCacheWindows.weather.retainedMs,
  metNorwayEndpoint = process.env.ASTRO_PORTAL_MET_NORWAY_ENDPOINT ||
    fallbackEndpoint,
  metNorwayUserAgent = process.env.ASTRO_PORTAL_MET_NORWAY_USER_AGENT ||
    fallbackUserAgent,
  fallbackEnabled = process.env.ASTRO_PORTAL_WEATHER_FALLBACK !== "disabled",
  timeoutMs = 12_000,
  retryTimeoutMs = 8_000,
  // The last forecast of each rounded place, kept beyond the process: `read`
  // and `write` of a store (`persistence/weather-forecast-repository.js`), or
  // a function returning one (or `null` without a database). A store that
  // fails is ignored, never an error of the request.
  store = null,
  // One line per request that was not a plain hit of the fresh cache.
  log = (line) => console.info(line),
} = {}) {
  const entries = new Map();
  const pending = new Map();
  const limitedUntil = new Map();
  // What the log counts (`weather.fetch`): requests answered with a
  // forecast just obtained (ok), with the last known one (stale), not at all
  // (failed), or from a forecast still fresh (fresh, never logged alone).
  const counts = { ok: 0, stale: 0, failed: 0, fresh: 0 };

  const openStore = async () => {
    try {
      return (typeof store === "function" ? await store() : store) || null;
    } catch {
      return null;
    }
  };
  const storedForecast = async (key) => {
    try {
      return (await (await openStore())?.read(key)) || null;
    } catch {
      return null;
    }
  };
  const persistForecast = async (key, result) => {
    try {
      await (await openStore())?.write(key, result);
    } catch {
      // The forecast is served from memory all the same.
    }
  };
  const remember = (key, value) => {
    entries.delete(key);
    entries.set(key, value);
    while (entries.size > 64) entries.delete(entries.keys().next().value);
  };
  const report = (outcome, detail) => {
    counts[outcome]++;
    const fields = Object.entries({ ...detail, ...counts })
      .filter(([, field]) => field !== undefined && field !== null)
      .map(([name, field]) => `${name}=${field}`);
    try {
      log(`[Astro Portal] info weather.fetch: ${outcome} ${fields.join(" ")}`);
    } catch {
      // A log that fails never fails a forecast.
    }
  };

  const providerCooldown = (provider, stamp) => {
    const until = limitedUntil.get(provider) || 0;
    if (stamp >= until) return null;
    return failure("rate_limit", Math.ceil((until - stamp) / 1000), provider);
  };

  // One provider call. A call that throws (timeout, reset connection, DNS) is
  // repeated at once, a single time, with a shorter limit: the second one
  // usually finds the connection warm. Two failures end in a short cooldown,
  // never in the 60 s a refusal earns.
  const callProvider = async (provider, url, headers) => {
    for (const limit of [timeoutMs, retryTimeoutMs]) {
      try {
        return await fetcher(url, {
          signal: AbortSignal.timeout(limit),
          headers,
        });
      } catch {
        // Retried once, then reported below.
      }
    }
    throw failure("provider", transientCooldownSeconds, provider);
  };

  const loadOpenMeteo = async ({ latitude, longitude, stamp }) => {
    const cooldown = providerCooldown("Open-Meteo", stamp);
    if (cooldown) throw cooldown;
    const day = 86400_000;
    // The provider's whole window, sixteen days (today
    // and the fifteen next, the last five only a trend), and the two days
    // before today, whose nights the calendar shows worked out afterwards.
    // Several models in the same call (one request per place and window,
    // as before); the answer is folded into the usual series plus each
    // model's cover.
    const models = astronomyForecastModels({ latitude, longitude });
    const url = astronomyForecastRangeUrl({
      latitude,
      longitude,
      startDate: new Date(stamp - 2 * day).toISOString().slice(0, 10),
      endDate: new Date(stamp + 15 * day).toISOString().slice(0, 10),
      models,
    });
    const response = await callProvider("Open-Meteo", url, {
      accept: "application/json",
    });
    if (!response.ok) {
      const refused = response.status === 429;
      const delay = retryDelay(
        response,
        now,
        refused ? refusalCooldownSeconds : transientCooldownSeconds,
      );
      if (refused) limitedUntil.set("Open-Meteo", now() + delay * 1000);
      throw failure(refused ? "rate_limit" : "provider", delay, "Open-Meteo");
    }
    const data = await response.json().catch(() => null);
    if (!Array.isArray(data?.hourly?.time) || !data.hourly.time.length)
      throw failure("provider", transientCooldownSeconds, "Open-Meteo");
    const fetchedAt = now();
    return {
      payload: {
        hourly: foldForecastModels(data.hourly, models),
        daily: foldDailyModels(data.daily, models),
        source: "Open-Meteo",
        fallback: false,
        missingFields: [],
      },
      fetchedAt,
      freshUntil: fetchedAt + freshMs,
      lastModified: null,
    };
  };

  const loadMetNorway = async ({ latitude, longitude, stamp, entry }) => {
    const provider = "MET Norway";
    const cooldown = providerCooldown(provider, stamp);
    if (cooldown) throw cooldown;
    const url = metNorwayForecastUrl(
      { latitude, longitude },
      { endpoint: metNorwayEndpoint },
    );
    const headers = {
      accept: "application/json",
      "user-agent": metNorwayUserAgent,
      ...(entry?.payload?.source === provider && entry.lastModified
        ? { "if-modified-since": entry.lastModified }
        : {}),
    };
    const response = await callProvider(provider, url, headers);
    const fetchedAt = now();
    const expires = Date.parse(response.headers.get("expires") || "");
    const freshUntil = Math.max(
      fetchedAt + fallbackFreshMs,
      Number.isFinite(expires) ? expires : 0,
    );
    if (response.status === 304 && entry?.payload?.source === provider)
      return {
        payload: entry.payload,
        fetchedAt,
        freshUntil,
        lastModified: entry.lastModified,
      };
    if (!response.ok) {
      const refused = response.status === 429;
      const delay = retryDelay(
        response,
        now,
        refused ? refusalCooldownSeconds : transientCooldownSeconds,
      );
      if (refused) limitedUntil.set(provider, now() + delay * 1000);
      throw failure(refused ? "rate_limit" : "provider", delay, provider);
    }
    const normalized = normalizeMetNorwayForecast(
      await response.json().catch(() => null),
    );
    if (!normalized)
      throw failure("provider", transientCooldownSeconds, provider);
    return {
      payload: {
        ...normalized,
        source: provider,
        fallback: true,
      },
      fetchedAt,
      freshUntil,
      lastModified: response.headers.get("last-modified"),
    };
  };

  const resolve = async (value) => {
    const coordinates = placeCoordinates(value);
    if (!coordinates)
      throw Object.assign(new Error("Invalid coordinates."), {
        code: "coordinates",
      });
    const latitude = Number(coordinates.latitude.toFixed(3));
    const longitude = Number(coordinates.longitude.toFixed(3));
    const key = `${latitude}:${longitude}`;
    let entry = entries.get(key);
    // A process just started knows nothing: the last forecast it (or another
    // one) kept for this place is read back before any provider is asked.
    if (!entry?.payload) {
      const kept = await storedForecast(key);
      if (kept) {
        entry = { ...entry, ...kept };
        remember(key, entry);
      }
    }
    const stamp = now();
    const served = (stale, extra = {}) => ({
      ...entry.payload,
      fetchedAt: new Date(entry.fetchedAt).toISOString(),
      stale,
      ...extra,
    });
    if (entry?.payload && stamp < entry.freshUntil)
      return { forecast: served(false), fresh: true };
    // The last forecast of the place, whatever its age within the retention:
    // a 503 only when none was ever fetched (or kept) for it.
    const cachedOrFail = (
      error,
      retryAfterSeconds = error.retryAfterSeconds,
    ) => {
      if (entry?.payload && now() - entry.fetchedAt < retainedMs)
        return {
          forecast: served(true, { retryAfterSeconds }),
          error,
        };
      throw Object.assign(error, { retryAfterSeconds });
    };
    if (entry?.retryAt > stamp)
      return cachedOrFail(
        entry.error,
        Math.max(1, Math.ceil((entry.retryAt - stamp) / 1000)),
      );
    if (pending.has(key)) return pending.get(key);

    const request = (async () => {
      try {
        let result;
        try {
          result = await loadOpenMeteo({ latitude, longitude, stamp });
        } catch (cause) {
          const primaryError = providerFailure(cause, "Open-Meteo");
          if (!fallbackEnabled) throw primaryError;
          try {
            result = await loadMetNorway({
              latitude,
              longitude,
              stamp,
              entry,
            });
          } catch (fallbackCause) {
            const secondaryError = providerFailure(fallbackCause, "MET Norway");
            throw failure(
              primaryError.code === "rate_limit" &&
                secondaryError.code === "rate_limit"
                ? "rate_limit"
                : "provider",
              Math.min(
                primaryError.retryAfterSeconds,
                secondaryError.retryAfterSeconds,
              ),
              "Open-Meteo + MET Norway",
            );
          }
        }
        remember(key, result);
        await persistForecast(key, result);
        return {
          forecast: {
            ...result.payload,
            fetchedAt: new Date(result.fetchedAt).toISOString(),
            stale: false,
          },
        };
      } catch (cause) {
        const error = providerFailure(cause, "Open-Meteo + MET Norway");
        remember(key, {
          ...entry,
          error,
          retryAt: now() + error.retryAfterSeconds * 1000,
        });
        return cachedOrFail(error);
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, request);
    return request;
  };

  return async function load(value) {
    let answer;
    try {
      answer = await resolve(value);
    } catch (error) {
      // A malformed position is the caller's mistake, not the weather's.
      if (error?.code !== "coordinates")
        report("failed", {
          code: error?.code,
          provider: error?.provider
            ? String(error.provider).replaceAll(" ", "_")
            : undefined,
          retryAfterSeconds: error?.retryAfterSeconds,
        });
      throw error;
    }
    const { forecast, fresh, error } = answer;
    if (fresh) counts.fresh++;
    else if (forecast.stale)
      report("stale", {
        code: error?.code,
        ageSeconds: Math.round((now() - Date.parse(forecast.fetchedAt)) / 1000),
        retryAfterSeconds: forecast.retryAfterSeconds,
      });
    else
      report("ok", {
        source: String(forecast.source).replaceAll(" ", "_"),
      });
    return forecast;
  };
}

// The singleton the routes share keeps its last forecasts in the service's
// database (SQLite or PostgreSQL), when it has one.
export const loadAstronomyWeather = createWeatherCache({
  store: weatherForecastStore,
});

const historyMonthPattern = /^(\d{4})-(\d{2})$/;
const isoDay = (instant) => new Date(instant).toISOString().slice(0, 10);

/**
 * The measured weather of one civil month: `GET
 * /v1/weather/history?latitude&longitude&month=YYYY-MM`, a thin wrapper over
 * the Open-Meteo archive with the forecast's rules — one entry per rounded
 * place and month, one request in flight, a provider's refusal honoured for
 * its `Retry-After`, a failure cooled for a few seconds, the last answer
 * served `stale` rather than a `503` while it is retained. The month comes
 * with one day on each side (a night spans two civil days) and never past
 * today. The days the archive does not hold yet are read from the
 * forecast's recent days, so the two days before today are covered. A
 * month whose days are all settled stays fresh for a month; the current one
 * for three hours.
 */
export function createWeatherHistoryCache({
  fetcher = fetch,
  now = Date.now,
  recentFreshMs = 3 * 60 * 60 * 1000,
  settledFreshMs = 30 * 24 * 60 * 60 * 1000,
  retainedMs = plannerReferenceCacheWindows.weather.retainedMs,
  timeoutMs = 12_000,
  log = (line) => console.info(line),
} = {}) {
  const entries = new Map();
  const pending = new Map();
  let limitedUntil = 0;
  const day = 86400_000;

  const remember = (key, value) => {
    entries.delete(key);
    entries.set(key, value);
    while (entries.size > 128) entries.delete(entries.keys().next().value);
  };
  const call = async (url) => {
    try {
      return await fetcher(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/json" },
      });
    } catch {
      throw failure("provider", transientCooldownSeconds, "Open-Meteo");
    }
  };
  const refused = (response) => {
    const isRefusal = response.status === 429;
    const delay = retryDelay(
      response,
      now,
      isRefusal ? refusalCooldownSeconds : transientCooldownSeconds,
    );
    if (isRefusal) limitedUntil = now() + delay * 1000;
    return failure(isRefusal ? "rate_limit" : "provider", delay, "Open-Meteo");
  };

  // The forecast's recent days fill the hours the archive does not hold
  // yet; a failure there leaves the archive's answer as it is.
  const fillRecent = async (
    hourly,
    daily,
    { latitude, longitude, endDate },
  ) => {
    const times = hourly.time || [];
    const cover = hourly.cloud_cover || [];
    let last = -1;
    cover.forEach((value, index) => {
      if (value !== null && value !== undefined) last = index;
    });
    const lastTime = last >= 0 ? Number(times[last]) * 1000 : null;
    const endOfRange = Date.parse(`${endDate}T23:00:00Z`);
    if (lastTime !== null && lastTime >= endOfRange) return { hourly, daily };
    const from =
      lastTime === null
        ? Date.parse(`${endDate}T00:00:00Z`) - 15 * day
        : lastTime;
    const startDate = isoDay(Math.max(from, now() - 30 * day));
    let response;
    try {
      response = await call(
        astronomyForecastRangeUrl({ latitude, longitude, startDate, endDate }),
      );
    } catch {
      return { hourly, daily };
    }
    if (!response.ok) return { hourly, daily };
    const recent = await response.json().catch(() => null);
    const recentTimes = recent?.hourly?.time;
    if (!Array.isArray(recentTimes)) return { hourly, daily };
    const position = new Map(times.map((time, index) => [Number(time), index]));
    const merged = Object.fromEntries(
      Object.entries(hourly).map(([key, series]) => [key, [...series]]),
    );
    recentTimes.forEach((time, recentIndex) => {
      let index = position.get(Number(time));
      if (index === undefined) {
        index = merged.time.length;
        merged.time.push(Number(time));
        for (const key of Object.keys(merged))
          if (key !== "time") merged[key].push(null);
      }
      if (index <= last) return;
      for (const key of Object.keys(merged)) {
        if (key === "time" || !Array.isArray(recent.hourly[key])) continue;
        merged[key][index] = recent.hourly[key][recentIndex] ?? null;
      }
    });
    const days = new Map(
      (daily?.time || []).map((time, index) => [Number(time), index]),
    );
    const mergedDaily = {
      time: [...(daily?.time || [])],
      weather_code: [...(daily?.weather_code || [])],
    };
    (recent.daily?.time || []).forEach((time, recentIndex) => {
      const code = recent.daily.weather_code?.[recentIndex];
      const index = days.get(Number(time));
      if (index === undefined) {
        mergedDaily.time.push(Number(time));
        mergedDaily.weather_code.push(code ?? null);
      } else if (mergedDaily.weather_code[index] == null)
        mergedDaily.weather_code[index] = code ?? null;
    });
    return { hourly: merged, daily: mergedDaily };
  };

  const resolve = async (value) => {
    const coordinates = placeCoordinates(value);
    if (!coordinates)
      throw Object.assign(new Error("Invalid coordinates."), {
        code: "coordinates",
      });
    const match = historyMonthPattern.exec(String(value?.month || ""));
    const year = Number(match?.[1]);
    const monthIndex = Number(match?.[2]) - 1;
    const stamp = now();
    const first = Date.UTC(year, monthIndex, 1);
    if (
      !match ||
      monthIndex < 0 ||
      monthIndex > 11 ||
      year < 1940 ||
      first > stamp
    )
      throw Object.assign(new Error("Invalid month."), { code: "month" });
    const latitude = Number(coordinates.latitude.toFixed(3));
    const longitude = Number(coordinates.longitude.toFixed(3));
    const month = match[0];
    const key = `${latitude}:${longitude}:${month}`;
    const startDate = isoDay(first - day);
    const endDate = isoDay(
      Math.min(Date.UTC(year, monthIndex + 1, 1), Date.parse(isoDay(stamp))),
    );
    const entry = entries.get(key);
    const served = (stale, extra = {}) => ({
      ...entry.payload,
      fetchedAt: new Date(entry.fetchedAt).toISOString(),
      stale,
      ...extra,
    });
    if (entry?.payload && stamp < entry.freshUntil)
      return { history: served(false), fresh: true };
    const cachedOrFail = (
      error,
      retryAfterSeconds = error.retryAfterSeconds,
    ) => {
      if (entry?.payload && stamp - entry.fetchedAt < retainedMs)
        return { history: served(true, { retryAfterSeconds }), error };
      throw Object.assign(error, { retryAfterSeconds });
    };
    if (entry?.retryAt > stamp)
      return cachedOrFail(
        entry.error,
        Math.max(1, Math.ceil((entry.retryAt - stamp) / 1000)),
      );
    if (limitedUntil > stamp)
      return cachedOrFail(
        failure(
          "rate_limit",
          Math.ceil((limitedUntil - stamp) / 1000),
          "Open-Meteo",
        ),
      );
    if (pending.has(key)) return pending.get(key);
    const request = (async () => {
      try {
        const response = await call(
          astronomyHistoryRangeUrl({ latitude, longitude, startDate, endDate }),
        );
        if (!response.ok) throw refused(response);
        const data = await response.json().catch(() => null);
        if (!Array.isArray(data?.hourly?.time))
          throw failure("provider", transientCooldownSeconds, "Open-Meteo");
        const filled = await fillRecent(data.hourly, data.daily, {
          latitude,
          longitude,
          endDate,
        });
        const fetchedAt = now();
        const settled =
          Date.parse(`${endDate}T00:00:00Z`) < fetchedAt - 7 * day;
        const result = {
          payload: {
            month,
            startDate,
            endDate,
            hourly: filled.hourly,
            daily: filled.daily,
            source: "Open-Meteo",
            measured: true,
          },
          fetchedAt,
          freshUntil: fetchedAt + (settled ? settledFreshMs : recentFreshMs),
        };
        remember(key, result);
        return {
          history: {
            ...result.payload,
            fetchedAt: new Date(fetchedAt).toISOString(),
            stale: false,
          },
        };
      } catch (cause) {
        const error = providerFailure(cause, "Open-Meteo");
        remember(key, {
          ...entry,
          error,
          retryAt: now() + error.retryAfterSeconds * 1000,
        });
        return cachedOrFail(error);
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, request);
    return request;
  };

  return async function loadHistory(value) {
    let answer;
    try {
      answer = await resolve(value);
    } catch (error) {
      if (error?.code !== "coordinates" && error?.code !== "month")
        try {
          log(
            `[Astro Portal] info weather.history: failed code=${error?.code} retryAfterSeconds=${error?.retryAfterSeconds}`,
          );
        } catch {
          // A log that fails never fails a read.
        }
      throw error;
    }
    return answer.history;
  };
}

export const loadAstronomyWeatherHistory = createWeatherHistoryCache();

// What the other weather reads of the service (`place-climate-trend.server.js`)
// share with the forecast and the history: the same error vocabulary, so the
// routes answer a provider's failure in the same way.
export {
  failure as weatherProviderFailure,
  providerFailure as weatherProviderError,
  retryDelay as weatherRetryDelay,
  refusalCooldownSeconds as weatherRefusalCooldownSeconds,
  transientCooldownSeconds as weatherTransientCooldownSeconds,
};
