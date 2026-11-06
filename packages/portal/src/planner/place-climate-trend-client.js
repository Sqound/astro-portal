// The browser's read of the weather trend of a place: one
// function that asks `GET /api/planner-place-climate-trend`, understands each
// answer the service gives, and keeps the last good read for a year so that
// the card still shows when the network is away.
//
// The service answers:
//
//  - `401 { error: "authentication_required" }`: no session. The trend is a
//    signed-in addition: nothing is drawn (`absent`).
//  - `403 { error: "capability_required", capability: "planner.mosaic" }`:
//    the profile lacks the capability. The card is its locked
//    inset (`locked`), never an error.
//  - `200 { status: "ready", … }`: the trend (`stale` is a service detail:
//    a ten-year average does not age by a week, so it is shown without a
//    notice).
//  - `202 { status: "computing" }` + `Retry-After`: the first reading of a
//    place is still going on. Asked again after the delay, three times at
//    most, then `computing` stays.
//  - `503` + `Retry-After` (or any other failure with an answer): the service
//    is unreachable (`unreachable`).
//
// A read that fails for lack of a network (or while the browser says it is
// offline) falls back on the browser's copy, kept a year; with none, nothing
// is drawn (`absent`): the page's own « Hors ligne » notice says enough.
//
// Nothing here draws or words anything; the card is
// `planner/components/ConditionsTrendCard.js`.

export const CLIMATE_TREND_ENDPOINT = "/api/planner-place-climate-trend";
/** The browser keeps the last read of a place this long. */
export const CLIMATE_TREND_KEPT_MS = 365 * 86400_000;
/** The asks that follow a `202`, at most. */
export const CLIMATE_TREND_MAX_RETRIES = 3;
const STORAGE_PREFIX = "astro-portal:planner:place-climate-trend:v1:";
const DEFAULT_RETRY_SECONDS = 5;
// A delay out of this range is a service mistake, not a wish.
const MIN_RETRY_SECONDS = 1;
const MAX_RETRY_SECONDS = 30;
// The browser keeps this many places, the oldest read going first.
const MAX_KEPT_PLACES = 24;

// The key of a place, as the service rounds it (`climatePlaceKey` of
// `place-climate-trend.js`, which a test holds equal; written here so that the
// browser does not carry the reducer and its ephemeris).
const STEP_DEGREES = 0.05;
const rounded = (value) =>
  (
    Number((Math.round(value / STEP_DEGREES) * STEP_DEGREES).toFixed(2)) + 0
  ).toFixed(2);

/** The cache key of a place, `lat:lon` rounded to 0.05 degree. */
export const climateTrendKey = ({ latitude, longitude }) =>
  `${rounded(latitude)}:${rounded(longitude)}`;

const coordinate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/** `{ latitude, longitude }` as numbers, or `null` for a place without them. */
export function climateTrendCoordinates(place) {
  const latitude = coordinate(place?.latitude);
  const longitude = coordinate(place?.longitude);
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/** The seconds to wait for a `Retry-After` header (a number, else 5). */
export function climateTrendRetryDelay(header) {
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_RETRY_SECONDS;
  return Math.min(MAX_RETRY_SECONDS, Math.max(MIN_RETRY_SECONDS, seconds));
}

/** Is `value` a trend the card can draw (twelve months, a known kind)? */
export function isClimateTrend(value) {
  return (
    Boolean(value) &&
    value.status === "ready" &&
    Array.isArray(value.months) &&
    value.months.length === 12 &&
    (value.trend === "distinct" ||
      value.trend === "flat" ||
      value.trend === "insufficient")
  );
}

function defaultStorage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The read kept for `key`, or `null` (absent, damaged, past its year). */
export function readKeptClimateTrend(storage, key, now) {
  try {
    const kept = JSON.parse(storage?.getItem(`${STORAGE_PREFIX}${key}`));
    if (!isClimateTrend(kept?.trend) || !Number.isFinite(kept.readAt))
      return null;
    if (now - kept.readAt > CLIMATE_TREND_KEPT_MS) return null;
    return kept.trend;
  } catch {
    return null;
  }
}

function keepClimateTrend(storage, key, trend, now) {
  if (!storage) return;
  try {
    storage.setItem(
      `${STORAGE_PREFIX}${key}`,
      JSON.stringify({ trend, readAt: now }),
    );
    // A bounded shelf: the oldest reads leave first.
    const kept = [];
    for (let index = 0; index < storage.length; index += 1) {
      const name = storage.key(index);
      if (!name?.startsWith(STORAGE_PREFIX)) continue;
      try {
        kept.push([name, JSON.parse(storage.getItem(name)).readAt || 0]);
      } catch {
        kept.push([name, 0]);
      }
    }
    kept
      .sort((first, second) => first[1] - second[1])
      .slice(0, Math.max(0, kept.length - MAX_KEPT_PLACES))
      .forEach(([name]) => storage.removeItem(name));
  } catch {
    // A full or blocked storage only costs the offline copy.
  }
}

const sleepFor = (milliseconds, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

/**
 * Reads the trend of `place`. Resolves one of:
 * `{ status: "ready", trend, kept }` (`kept`: the browser's copy),
 * `{ status: "computing" }`, `{ status: "locked" }`, `{ status: "absent" }`,
 * `{ status: "unreachable" }`. Rejects only when `signal` aborts.
 * `onComputing` is called once, when the service says the first reading of
 * the place is still going on.
 */
export async function readPlaceClimateTrend(
  place,
  {
    fetchImpl = globalThis.fetch,
    storage = defaultStorage(),
    now = () => Date.now(),
    sleep = sleepFor,
    online = () =>
      typeof navigator === "undefined" || navigator.onLine !== false,
    onComputing = null,
    signal,
  } = {},
) {
  const at = climateTrendCoordinates(place);
  if (!at) return { status: "absent" };
  const key = climateTrendKey(at);
  const keptRead = () => readKeptClimateTrend(storage, key, now());
  const offlineAnswer = () => {
    const trend = keptRead();
    return trend
      ? { status: "ready", trend, kept: true }
      : { status: "absent" };
  };
  if (!online()) return offlineAnswer();
  const params = new URLSearchParams({
    latitude: String(at.latitude),
    longitude: String(at.longitude),
  });
  for (let asked = 0; ; asked += 1) {
    let response;
    try {
      response = await fetchImpl(`${CLIMATE_TREND_ENDPOINT}?${params}`, {
        cache: "no-store",
        signal,
      });
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError") throw error;
      return offlineAnswer();
    }
    const body = await response.json().catch(() => null);
    if (response.status === 401) return { status: "absent" };
    if (response.status === 403)
      return body?.error === "capability_required"
        ? { status: "locked" }
        : { status: "unreachable" };
    if (response.status === 202) {
      // The first `202` is told at once (the card says « calcul en cours »
      // while the delay runs); the read goes on.
      if (asked === 0) onComputing?.();
      if (asked >= CLIMATE_TREND_MAX_RETRIES) return { status: "computing" };
      await sleep(
        climateTrendRetryDelay(response.headers?.get?.("Retry-After")) * 1000,
        signal,
      );
      continue;
    }
    if (response.ok && isClimateTrend(body)) {
      keepClimateTrend(storage, key, body, now());
      return { status: "ready", trend: body, kept: false };
    }
    // An invalid place is not the service's fault, and nothing can be drawn
    // for it; every other failure keeps the browser's copy on screen.
    if (response.status === 400) return { status: "absent" };
    const trend = keptRead();
    return trend
      ? { status: "ready", trend, kept: true }
      : { status: "unreachable" };
  }
}
