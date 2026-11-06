import assert from "node:assert/strict";
import test from "node:test";
import { requestAstronomyWeather } from "../dist/astronomy-weather.js";

// The page honours the server's
// Retry-After once and then leaves the place alone. Nothing here reaches a
// network: the route's answers are simulated and so are the clock and the
// wait. Each test uses its own position, the client's memory being shared.

let counter = 0;
const place = () => ({ latitude: 40 + ++counter / 100, longitude: -30 });
const forecast = { hourly: { time: [] }, stale: false };
const unavailable = (retryAfterSeconds = 10) =>
  new Response(JSON.stringify({ error: "provider", retryAfterSeconds }), {
    status: 503,
    headers: { "retry-after": String(retryAfterSeconds) },
  });
const ok = (body = forecast) => Response.json(body);
const harness = (answers) => {
  const state = { calls: 0, waits: [], clock: 1_000_000 };
  const queue = [...answers];
  return Object.assign(state, {
    options: {
      fetcher: async () => {
        state.calls++;
        return queue.length > 1 ? queue.shift() : queue[0].clone();
      },
      wait: async (milliseconds) => {
        state.waits.push(milliseconds);
        state.clock += milliseconds;
      },
      now: () => state.clock,
    },
  });
};

test("a 503 with Retry-After is waited for once, then the request is made a second time", async () => {
  const run = harness([unavailable(10), ok()]);
  const data = await requestAstronomyWeather(place(), run.options);
  assert.deepEqual(data, forecast);
  assert.equal(run.calls, 2);
  assert.deepEqual(run.waits, [10_000]);
});

test("two refusals end the request, and the place is then left alone until the delay has passed", async () => {
  const run = harness([unavailable(10)]);
  const where = place();
  await assert.rejects(requestAstronomyWeather(where, run.options), {
    code: "provider",
    retryAfterSeconds: 10,
  });
  assert.equal(run.calls, 2, "one request and its single retry");
  // Every re-render and every other screen asks again: nothing is sent.
  for (let render = 0; render < 5; render++)
    await assert.rejects(requestAstronomyWeather(where, run.options), {
      code: "provider",
    });
  assert.equal(run.calls, 2);
  // The delay over, the place may be asked again.
  run.clock += 10_001;
  await assert.rejects(requestAstronomyWeather(where, run.options));
  assert.equal(run.calls, 4);
});

test("the person's own retry always asks, delay or not", async () => {
  const run = harness([unavailable(10), unavailable(10), ok()]);
  const where = place();
  await assert.rejects(requestAstronomyWeather(where, run.options));
  const data = await requestAstronomyWeather(where, {
    ...run.options,
    refresh: true,
  });
  assert.deepEqual(data, forecast);
  assert.equal(run.calls, 3);
});

test("a Retry-After beyond 15 s is not waited for in the open, but the place rests for all of it", async () => {
  const run = harness([unavailable(120)]);
  const where = place();
  await assert.rejects(requestAstronomyWeather(where, run.options), {
    retryAfterSeconds: 120,
  });
  assert.equal(run.calls, 1);
  assert.deepEqual(run.waits, []);
  run.clock += 119_000;
  await assert.rejects(requestAstronomyWeather(where, run.options));
  assert.equal(run.calls, 1, "still resting after 119 s");
  run.clock += 2_000;
  await assert.rejects(requestAstronomyWeather(where, run.options));
  assert.equal(run.calls, 2);
});

test("a failure with no Retry-After (no connection) rests 10 s and is not retried at once", async () => {
  const state = { calls: 0, clock: 5_000_000 };
  const options = {
    fetcher: async () => {
      state.calls++;
      throw new TypeError("Failed to fetch");
    },
    wait: async () => assert.fail("nothing to wait for"),
    now: () => state.clock,
  };
  const where = place();
  await assert.rejects(requestAstronomyWeather(where, options), TypeError);
  await assert.rejects(requestAstronomyWeather(where, options), TypeError);
  assert.equal(state.calls, 1);
  state.clock += 10_001;
  await assert.rejects(requestAstronomyWeather(where, options), TypeError);
  assert.equal(state.calls, 2);
});

test("callers share one request, and a forecast is not asked again within the minute", async () => {
  const run = harness([ok()]);
  const where = place();
  await Promise.all([
    requestAstronomyWeather(where, run.options),
    requestAstronomyWeather(where, run.options),
  ]);
  run.clock += 59_000;
  await requestAstronomyWeather(where, run.options);
  assert.equal(run.calls, 1);
  run.clock += 2_000;
  await requestAstronomyWeather(where, run.options);
  assert.equal(run.calls, 2);
});

test("a forecast served stale is kept for as long as the server asked", async () => {
  const run = harness([
    ok({ ...forecast, stale: true, retryAfterSeconds: 180 }),
  ]);
  const where = place();
  const data = await requestAstronomyWeather(where, run.options);
  assert.equal(data.stale, true);
  run.clock += 170_000;
  await requestAstronomyWeather(where, run.options);
  assert.equal(run.calls, 1);
  run.clock += 11_000;
  await requestAstronomyWeather(where, run.options);
  assert.equal(run.calls, 2);
});

test("an invalid position is neither retried nor remembered", async () => {
  const bad = () =>
    new Response(JSON.stringify({ error: "coordinates" }), { status: 400 });
  const run = harness([bad()]);
  const where = place();
  await assert.rejects(requestAstronomyWeather(where, run.options), {
    code: "coordinates",
  });
  await assert.rejects(requestAstronomyWeather(where, run.options), {
    code: "coordinates",
  });
  assert.equal(run.calls, 2, "each is asked, none is retried");
  assert.deepEqual(run.waits, []);
});
