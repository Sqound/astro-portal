const cached = new Map();
// What a failed place remembers (the server's `Retry-After`, else a few
// seconds): until then a new request for it fails at once, without a call.
const failures = new Map();

const reuseMs = 60_000;
// A `Retry-After` longer than this is not waited for in the open: the request
// fails and the place rests for the whole delay.
const longestWaitMs = 15_000;
const quietAfterFailureMs = 10_000;

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const headerSeconds = (response) => {
  const seconds = Number(response.headers?.get?.("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
};

/**
 * The forecast of one place, shared by every caller of the page. A failed
 * request honours the server's `Retry-After` once -- it waits for it (up to
 * 15 s) and asks a second time -- and then leaves the place alone until that
 * delay has passed, so that neither a re-render nor another screen asks again
 * in the meantime. `refresh` (the person's own retry) always asks.
 * `fetcher`, `wait` and `now` are the test seams.
 */
export async function requestAstronomyWeather(
  coordinates,
  {
    signal,
    refresh = false,
    fetcher = fetch,
    wait = sleep,
    now = Date.now,
  } = {},
) {
  const params = new URLSearchParams({
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
  });
  const key = params.toString();
  if (refresh) failures.delete(key);
  const resting = failures.get(key);
  if (resting && now() < resting.until) throw resting.error;
  failures.delete(key);

  const existing = cached.get(key);
  if (
    !existing ||
    (existing.settled && (refresh || now() - existing.at > existing.reuseMs))
  ) {
    const entry = { at: now(), settled: false, reuseMs };
    const read = async () => {
      const response = await fetcher(`/api/planner-weather?${params}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok)
        throw Object.assign(new Error("Forecast unavailable"), {
          code: payload.error,
          retryAfterSeconds:
            payload.retryAfterSeconds ?? headerSeconds(response),
        });
      return payload;
    };
    entry.promise = (async () => {
      try {
        let payload;
        try {
          payload = await read();
        } catch (error) {
          const seconds = error.retryAfterSeconds;
          // A malformed position is never worth a second call.
          if (
            error.code === "coordinates" ||
            !(Number.isFinite(seconds) && seconds > 0) ||
            seconds * 1000 > longestWaitMs
          )
            throw error;
          await wait(seconds * 1000);
          payload = await read();
        }
        entry.settled = true;
        // A forecast served stale says when to ask again.
        if (payload?.stale && Number.isFinite(payload.retryAfterSeconds))
          entry.reuseMs = Math.max(reuseMs, payload.retryAfterSeconds * 1000);
        return payload;
      } catch (error) {
        cached.delete(key);
        if (error.code !== "coordinates") {
          const seconds = error.retryAfterSeconds;
          failures.set(key, {
            error,
            until:
              now() +
              (Number.isFinite(seconds) && seconds > 0
                ? seconds * 1000
                : quietAfterFailureMs),
          });
          while (failures.size > 12)
            failures.delete(failures.keys().next().value);
        }
        throw error;
      }
    })();
    cached.set(key, entry);
    if (cached.size > 12) cached.delete(cached.keys().next().value);
  }
  // A component cancelling must not cancel the calendar's shared request.
  const result = await cached.get(key).promise;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return result;
}

const historyCached = new Map();

/**
 * The measured weather of one civil month at a place
 * (`planner-weather-history`, the cache of `GET /v1/weather/history`): one
 * request per place and month for the page's life (a past month does not
 * change; the current one is asked again after an hour); a failure is not
 * kept, so « Réessayer » asks again. `fetcher` and `now` are the test seams.
 */
export async function requestAstronomyWeatherHistory(
  coordinates,
  month,
  { signal, fetcher = fetch, now = Date.now } = {},
) {
  const params = new URLSearchParams({
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
    month: String(month),
  });
  const key = params.toString();
  const existing = historyCached.get(key);
  if (!existing || (existing.settled && now() - existing.at > 3_600_000)) {
    const entry = { at: now(), settled: false };
    entry.promise = (async () => {
      try {
        const response = await fetcher(
          `/api/planner-weather-history?${params}`,
          { cache: "no-store" },
        );
        const payload = await response.json();
        if (!response.ok)
          throw Object.assign(new Error("History unavailable"), {
            code: payload.error,
            retryAfterSeconds:
              payload.retryAfterSeconds ?? headerSeconds(response),
          });
        entry.settled = true;
        return payload;
      } catch (error) {
        historyCached.delete(key);
        throw error;
      }
    })();
    historyCached.set(key, entry);
    if (historyCached.size > 48)
      historyCached.delete(historyCached.keys().next().value);
  }
  const result = await historyCached.get(key).promise;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return result;
}
