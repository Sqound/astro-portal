import assert from "node:assert/strict";
import test from "node:test";
import { climatePlaceKey } from "portal/place-climate-trend.js";
import {
  CLIMATE_TREND_ENDPOINT,
  CLIMATE_TREND_KEPT_MS,
  CLIMATE_TREND_MAX_RETRIES,
  climateTrendCoordinates,
  climateTrendKey,
  climateTrendRetryDelay,
  readKeptClimateTrend,
  readPlaceClimateTrend,
} from "portal/planner/place-climate-trend-client.js";

// The browser's read of the weather trend of a place: each answer of
// `GET /api/planner-place-climate-trend`, the retry after a `202`, and the
// copy the browser keeps for a year. Fake responses and a fake storage:
// nothing leaves the test.

const PARIS = { latitude: "48.8566", longitude: "2.3522" };
const month = (number, share) => ({
  month: number,
  nightHours: 1000,
  clearHours: share * 10,
  clearShare: share,
  goodNights: 10,
  nights: 30,
});
const ready = (extra = {}) => ({
  status: "ready",
  place: { latitude: 48.85, longitude: 2.35 },
  source: "Open-Meteo",
  years: [2016, 2025],
  yearsWithData: 10,
  months: Array.from({ length: 12 }, (_, index) =>
    month(index + 1, index >= 5 && index <= 7 ? 60 : 20),
  ),
  trend: "distinct",
  best: { from: 6, to: 8, clearShare: 60 },
  worst: { from: 11, to: 2, clearShare: 20 },
  computedAt: "2026-10-13T08:00:00.000Z",
  stale: false,
  ...extra,
});
const answer = (status, body, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: new Headers(headers),
  json: async () => {
    if (body === undefined) throw new SyntaxError("no body");
    return body;
  },
});
class Storage {
  items = new Map();
  get length() {
    return this.items.size;
  }
  key = (index) => [...this.items.keys()][index] ?? null;
  getItem = (name) => this.items.get(name) ?? null;
  setItem = (name, value) => this.items.set(name, String(value));
  removeItem = (name) => this.items.delete(name);
}
// A fetch that answers, in order, what it is given (an `Error` is thrown).
const sequence = (...answers) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetchImpl, calls };
};
const options = (fetchImpl, extra = {}) => ({
  fetchImpl,
  storage: new Storage(),
  now: () => Date.parse("2026-10-13T12:00:00Z"),
  online: () => true,
  sleep: async () => {},
  ...extra,
});

test("the key and the coordinates are the service's: 0.05 degree, no negative zero, invalid places absent", () => {
  for (const at of [
    { latitude: 48.8566, longitude: 2.3522 },
    { latitude: -33.8688, longitude: 151.2093 },
    { latitude: -0.01, longitude: -0.02 },
    { latitude: 69.6492, longitude: 18.9553 },
    { latitude: 90, longitude: -180 },
  ])
    assert.equal(climateTrendKey(at), climatePlaceKey(at), JSON.stringify(at));
  assert.equal(
    climateTrendKey({ latitude: -0.01, longitude: -0.02 }),
    "0.00:0.00",
  );
  assert.deepEqual(climateTrendCoordinates(PARIS), {
    latitude: 48.8566,
    longitude: 2.3522,
  });
  for (const place of [
    null,
    {},
    { latitude: "", longitude: "2" },
    { latitude: "x", longitude: "2" },
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: 181 },
  ])
    assert.equal(climateTrendCoordinates(place), null);
});

test("200 is the trend, kept for the next time; the request names the route and the place", async () => {
  const { fetchImpl, calls } = sequence(answer(200, ready()));
  const read = options(fetchImpl);
  const result = await readPlaceClimateTrend(PARIS, read);
  assert.equal(result.status, "ready");
  assert.equal(result.kept, false);
  assert.equal(result.trend.best.from, 6);
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url, "https://portal.example.test");
  assert.equal(url.pathname, CLIMATE_TREND_ENDPOINT);
  assert.equal(url.searchParams.get("latitude"), "48.8566");
  assert.equal(url.searchParams.get("longitude"), "2.3522");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(
    readKeptClimateTrend(read.storage, "48.85:2.35", read.now()).best.to,
    8,
  );
  // `stale` is the service's detail: the card shows it all the same.
  const old = await readPlaceClimateTrend(
    PARIS,
    options(sequence(answer(200, ready({ stale: true }))).fetchImpl),
  );
  assert.equal(old.status, "ready");
});

test("401 is absent, 403 capability_required is locked (any other 403 is unreachable), 400 is absent", async () => {
  const run = async (reply) =>
    (await readPlaceClimateTrend(PARIS, options(sequence(reply).fetchImpl)))
      .status;
  assert.equal(
    await run(answer(401, { error: "authentication_required" })),
    "absent",
  );
  assert.equal(
    await run(
      answer(403, {
        error: "capability_required",
        capability: "planner.mosaic",
      }),
    ),
    "locked",
  );
  assert.equal(await run(answer(403, { error: "forbidden" })), "unreachable");
  assert.equal(await run(answer(403)), "unreachable");
  assert.equal(await run(answer(400, { error: "coordinates" })), "absent");
  // A refused read never draws the copy the browser may hold.
  const kept = options(
    sequence(
      answer(200, ready()),
      answer(403, { error: "capability_required" }),
    ).fetchImpl,
  );
  await readPlaceClimateTrend(PARIS, kept);
  assert.equal((await readPlaceClimateTrend(PARIS, kept)).status, "locked");
});

test("202 is asked again after Retry-After, three times at most; the first one is told at once", async () => {
  const waits = [];
  let told = 0;
  const computing = () =>
    answer(202, { status: "computing" }, { "Retry-After": "5" });
  const first = sequence(computing(), computing(), answer(200, ready()));
  const done = await readPlaceClimateTrend(PARIS, {
    ...options(first.fetchImpl),
    sleep: async (ms) => waits.push(ms),
    onComputing: () => (told += 1),
  });
  assert.equal(done.status, "ready");
  assert.equal(first.calls.length, 3);
  assert.deepEqual(waits, [5000, 5000]);
  assert.equal(told, 1);
  // Never ready: the first ask and three more, then « computing » stays.
  const endless = sequence(...Array.from({ length: 6 }, computing));
  const stuck = await readPlaceClimateTrend(PARIS, {
    ...options(endless.fetchImpl),
    sleep: async (ms) => waits.push(ms),
  });
  assert.equal(stuck.status, "computing");
  assert.equal(endless.calls.length, 1 + CLIMATE_TREND_MAX_RETRIES);
  assert.equal(CLIMATE_TREND_MAX_RETRIES, 3);
  // The header is a number of seconds, kept in a sane range, else 5.
  assert.equal(climateTrendRetryDelay("7"), 7);
  assert.equal(climateTrendRetryDelay("0"), 5);
  assert.equal(climateTrendRetryDelay(null), 5);
  assert.equal(climateTrendRetryDelay("soon"), 5);
  assert.equal(climateTrendRetryDelay("600"), 30);
});

test("an abort stops the wait and the read", async () => {
  const controller = new AbortController();
  const { fetchImpl } = sequence(
    answer(202, { status: "computing" }, { "Retry-After": "5" }),
  );
  await assert.rejects(
    readPlaceClimateTrend(PARIS, {
      ...options(fetchImpl),
      signal: controller.signal,
      sleep: async () => {
        controller.abort();
        throw new DOMException("Aborted", "AbortError");
      },
    }),
    { name: "AbortError" },
  );
});

test("503 is unreachable, unless the browser holds a read: it is drawn as any other", async () => {
  const bare = await readPlaceClimateTrend(
    PARIS,
    options(
      sequence(answer(503, { error: "provider" }, { "Retry-After": "60" }))
        .fetchImpl,
    ),
  );
  assert.deepEqual(bare, { status: "unreachable" });
  const read = options(
    sequence(answer(200, ready()), answer(503, { error: "provider" }))
      .fetchImpl,
  );
  await readPlaceClimateTrend(PARIS, read);
  const again = await readPlaceClimateTrend(PARIS, read);
  assert.equal(again.status, "ready");
  assert.equal(again.kept, true);
});

test("a read that fails for lack of a network, or offline, falls back on the browser's copy; with none, nothing is drawn", async () => {
  const none = await readPlaceClimateTrend(
    PARIS,
    options(sequence(new TypeError("Failed to fetch")).fetchImpl),
  );
  assert.deepEqual(none, { status: "absent" });
  const read = options(
    sequence(answer(200, ready()), new TypeError("Failed to fetch")).fetchImpl,
  );
  await readPlaceClimateTrend(PARIS, read);
  const lost = await readPlaceClimateTrend(PARIS, read);
  assert.equal(lost.status, "ready");
  assert.equal(lost.kept, true);
  // Offline: no request at all.
  const offline = sequence();
  const quiet = await readPlaceClimateTrend(PARIS, {
    ...read,
    fetchImpl: offline.fetchImpl,
    online: () => false,
  });
  assert.equal(quiet.status, "ready");
  assert.equal(offline.calls.length, 0);
  assert.deepEqual(
    await readPlaceClimateTrend(PARIS, {
      ...options(offline.fetchImpl),
      online: () => false,
    }),
    { status: "absent" },
  );
});

test("the browser's copy lives a year, a damaged one is ignored, the shelf is bounded", async () => {
  const storage = new Storage();
  const at = Date.parse("2026-10-13T12:00:00Z");
  const read = (now) => ({
    ...options(sequence(answer(200, ready())).fetchImpl),
    storage,
    now: () => now,
  });
  await readPlaceClimateTrend(PARIS, read(at));
  assert.ok(
    readKeptClimateTrend(storage, "48.85:2.35", at + CLIMATE_TREND_KEPT_MS),
  );
  assert.equal(
    readKeptClimateTrend(storage, "48.85:2.35", at + CLIMATE_TREND_KEPT_MS + 1),
    null,
  );
  const [name] = [...storage.items.keys()];
  storage.setItem(name, "{not json");
  assert.equal(readKeptClimateTrend(storage, "48.85:2.35", at), null);
  storage.setItem(
    name,
    JSON.stringify({ trend: { status: "ready" }, readAt: at }),
  );
  assert.equal(readKeptClimateTrend(storage, "48.85:2.35", at), null);
  // Thirty places: the oldest read leave first, the newest stay.
  for (let index = 0; index < 30; index += 1)
    await readPlaceClimateTrend(
      { latitude: 10 + index, longitude: 20 },
      {
        ...options(sequence(answer(200, ready())).fetchImpl),
        storage,
        now: () => at + index * 1000,
      },
    );
  assert.ok(storage.length <= 24);
  assert.ok(
    readKeptClimateTrend(
      storage,
      climateTrendKey({ latitude: 39, longitude: 20 }),
      at + 29_000,
    ),
  );
  assert.equal(
    readKeptClimateTrend(
      storage,
      climateTrendKey({ latitude: 10, longitude: 20 }),
      at + 29_000,
    ),
    null,
  );
});

test("a storage that refuses, or none at all, only costs the offline copy", async () => {
  const refusing = {
    length: 0,
    key: () => null,
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("full");
    },
    removeItem: () => {},
  };
  const result = await readPlaceClimateTrend(PARIS, {
    ...options(sequence(answer(200, ready())).fetchImpl),
    storage: refusing,
  });
  assert.equal(result.status, "ready");
  const without = await readPlaceClimateTrend(PARIS, {
    ...options(sequence(answer(200, ready())).fetchImpl),
    storage: null,
  });
  assert.equal(without.status, "ready");
});
