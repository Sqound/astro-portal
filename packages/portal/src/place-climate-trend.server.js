import { placeCoordinates } from "portal/planner/state.js";
import {
  weatherProviderError,
  weatherProviderFailure,
  weatherRetryDelay,
} from "portal/astronomy-weather.server.js";
import {
  climatePlaceKey,
  climateTrendYears,
  placeClimateArchiveUrl,
  reducePlaceClimateTrend,
  roundClimateCoordinate,
} from "portal/place-climate-trend.js";
import { placeClimateTrendStore } from "portal/persistence/place-climate-trend-repository.js";

/**
 * The weather trend of a place:
 * `GET /v1/places/climate-trend?latitude&longitude`. The archive is read
 * once for the ten years of a place (one request, about 1.7 MB or 300 KB
 * compressed, two to four seconds), reduced by `reducePlaceClimateTrend` to
 * twelve monthly shares and two periods, kept in memory and in the database,
 * and worked out again at most once a year.
 *
 * The rules, next to those of the forecast and of the history (the same
 * provider errors, the same stale answer rather than a refusal):
 * - one entry per place rounded to 0.05 degree, shared by every caller;
 * - one reading in flight per place, and at most `maxStartsPerHour` readings
 *   in the process (a ten-year hourly reading weighs a few hundred calls of
 *   the provider's allowance: a crowd of new places must not spend it);
 * - a request waits `waitMs` for a reading in progress and then answers
 *   "computing" while it goes on; the next call finds it done;
 * - a trend past its year is served at once, `stale`, and worked out again
 *   behind it; a failed reading cools the place (a refusal cools the
 *   provider) and the last trend, however old, is still served `stale`;
 * - there is no second provider: the fallback of the forecast has no past.
 */

const day = 86400_000;
const failedPlaceCooldownSeconds = 60;
// A 429 on a request this heavy is the hourly or the daily allowance.
const refusedProviderCooldownSeconds = 600;

export function createPlaceClimateTrendCache({
  // Looked up at each call, so that a test (or a proxy) may replace `fetch`.
  fetcher = (...parameters) => fetch(...parameters),
  now = Date.now,
  freshMs = 365 * day,
  retainedMs = 3 * 365 * day,
  waitMs = 8_000,
  timeoutMs = 45_000,
  maxStartsPerHour = 8,
  reduce = reducePlaceClimateTrend,
  store = null,
  log = (line) => console.info(line),
} = {}) {
  const entries = new Map();
  const pending = new Map();
  const starts = [];
  let limitedUntil = 0;
  const counts = { computed: 0, failed: 0, stale: 0, computing: 0 };

  const report = (outcome, detail = {}) => {
    counts[outcome]++;
    const fields = Object.entries({ ...detail, ...counts })
      .filter(([, field]) => field !== undefined && field !== null)
      .map(([name, field]) => `${name}=${field}`);
    try {
      log(
        `[Astro Portal] info place.climate-trend: ${outcome} ${fields.join(" ")}`,
      );
    } catch {
      // A log that fails never fails a read.
    }
  };
  const openStore = async () => {
    try {
      return (typeof store === "function" ? await store() : store) || null;
    } catch {
      return null;
    }
  };
  const storedTrend = async (key) => {
    try {
      return (await (await openStore())?.read(key)) || null;
    } catch {
      return null;
    }
  };
  const persistTrend = async (key, result) => {
    try {
      await (await openStore())?.write(key, result);
    } catch {
      // The trend is served from memory all the same.
    }
  };
  const remember = (key, value) => {
    entries.delete(key);
    entries.set(key, value);
    while (entries.size > 256) entries.delete(entries.keys().next().value);
  };

  // The process-wide budget of readings: false, with the seconds to wait,
  // when this hour's readings are all spent.
  const startBudget = (stamp) => {
    while (starts.length && starts[0] <= stamp - 3600_000) starts.shift();
    if (starts.length < maxStartsPerHour) return null;
    return Math.max(1, Math.ceil((starts[0] + 3600_000 - stamp) / 1000));
  };

  const read = async ({ latitude, longitude, key }) => {
    const stamp = now();
    const years = climateTrendYears(new Date(stamp));
    let response;
    try {
      response = await fetcher(
        placeClimateArchiveUrl({ latitude, longitude, years }),
        {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { accept: "application/json" },
        },
      );
    } catch {
      throw weatherProviderFailure(
        "provider",
        failedPlaceCooldownSeconds,
        "Open-Meteo",
      );
    }
    if (!response.ok) {
      const refused = response.status === 429;
      const delay = weatherRetryDelay(
        response,
        now,
        refused ? refusedProviderCooldownSeconds : failedPlaceCooldownSeconds,
      );
      if (refused) limitedUntil = now() + delay * 1000;
      throw weatherProviderFailure(
        refused ? "rate_limit" : "provider",
        delay,
        "Open-Meteo",
      );
    }
    const data = await response.json().catch(() => null);
    if (
      !Array.isArray(data?.hourly?.time) ||
      !data.hourly.time.length ||
      !Array.isArray(data.hourly.cloud_cover)
    )
      throw weatherProviderFailure(
        "provider",
        failedPlaceCooldownSeconds,
        "Open-Meteo",
      );
    const started = Date.now();
    const trend = reduce({
      hourly: data.hourly,
      latitude,
      longitude,
      years,
      computedAt: new Date(now()),
    });
    const computedAt = now();
    const result = {
      payload: {
        place: { latitude, longitude },
        source: "Open-Meteo",
        ...trend,
      },
      computedAt,
      freshUntil: computedAt + freshMs,
    };
    remember(key, result);
    await persistTrend(key, result);
    report("computed", {
      hours: data.hourly.time.length,
      reduceMs: Date.now() - started,
    });
    return result;
  };

  // Starts (or joins) the reading of a place. The returned promise settles
  // with the entry, or rejects with the provider error once the place is
  // cooled; a caller that does not wait for it must still catch it.
  const compute = (key, coordinates, entry) => {
    if (pending.has(key)) return pending.get(key);
    const stamp = now();
    const wait = startBudget(stamp);
    if (limitedUntil > stamp || wait) {
      const delay = Math.max(
        wait || 0,
        Math.ceil((limitedUntil - stamp) / 1000),
      );
      return Promise.reject(
        weatherProviderFailure("rate_limit", delay, "Open-Meteo"),
      );
    }
    starts.push(stamp);
    const request = (async () => {
      try {
        return await read({ ...coordinates, key });
      } catch (cause) {
        const error = weatherProviderError(cause, "Open-Meteo");
        const current = entries.get(key) || entry;
        remember(key, {
          ...current,
          error,
          retryAt: now() + error.retryAfterSeconds * 1000,
        });
        throw error;
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, request);
    return request;
  };

  const served = (entry, stale) => ({
    status: "ready",
    trend: { ...entry.payload, stale },
  });

  const resolve = async (value) => {
    const coordinates = placeCoordinates(value);
    if (!coordinates)
      throw Object.assign(new Error("Invalid coordinates."), {
        code: "coordinates",
      });
    const latitude = roundClimateCoordinate(coordinates.latitude);
    const longitude = roundClimateCoordinate(coordinates.longitude);
    const key = climatePlaceKey({ latitude, longitude });
    let entry = entries.get(key);
    // A process just started knows nothing: the trend it (or another one)
    // kept for this place is read back before the archive is asked.
    if (!entry?.payload) {
      const kept = await storedTrend(key);
      if (kept) {
        entry = { ...entry, ...kept };
        remember(key, entry);
      }
    }
    const stamp = now();
    if (entry?.payload && stamp < entry.freshUntil) return served(entry, false);
    const keep = entry?.payload && stamp - entry.computedAt < retainedMs;
    const cooling = entry?.retryAt > stamp;
    if (keep) {
      // The old trend answers now; a new reading goes on behind it, unless
      // the place or the provider is cooling.
      if (!cooling && !pending.has(key))
        compute(key, { latitude, longitude }, entry).catch(() => {});
      report("stale", {
        ageDays: Math.round((stamp - entry.computedAt) / day),
      });
      return served(entry, true);
    }
    if (cooling)
      throw Object.assign(entry.error, {
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((entry.retryAt - stamp) / 1000),
        ),
      });
    const reading = compute(key, { latitude, longitude }, entry);
    let timer;
    const outcome = await Promise.race([
      reading.then((result) => ({ result })),
      new Promise((resolveWait) => {
        timer = setTimeout(() => resolveWait({ waited: true }), waitMs);
      }),
    ]).finally(() => clearTimeout(timer));
    // A reading that ends after the wait is not an error of this request.
    reading.catch(() => {});
    if (outcome.result) return served(outcome.result, false);
    report("computing");
    return { status: "computing", retryAfterSeconds: 5 };
  };

  return async function load(value) {
    try {
      return await resolve(value);
    } catch (error) {
      if (error?.code !== "coordinates")
        report("failed", {
          code: error?.code,
          retryAfterSeconds: error?.retryAfterSeconds,
        });
      throw error;
    }
  };
}

// The singleton the routes share keeps its trends in the service's database
// (SQLite or PostgreSQL), when it has one.
// The wait for a reading in progress can be shortened by the route tests
// (`ASTRO_PORTAL_TEST_CLIMATE_TREND_WAIT_MS`), which would otherwise wait the
// eight seconds to see the "computing" answer.
export const loadPlaceClimateTrend = createPlaceClimateTrendCache({
  store: placeClimateTrendStore,
  ...(Number(process.env.ASTRO_PORTAL_TEST_CLIMATE_TREND_WAIT_MS) > 0
    ? { waitMs: Number(process.env.ASTRO_PORTAL_TEST_CLIMATE_TREND_WAIT_MS) }
    : {}),
});
