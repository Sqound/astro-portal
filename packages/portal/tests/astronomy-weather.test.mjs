import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createWeatherCache,
  createWeatherHistoryCache,
} from "../dist/astronomy-weather.server.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";
import { SqliteDriver } from "../dist/persistence/sqlite-driver.js";
import { createWeatherForecastRepository } from "../dist/persistence/weather-forecast-repository.js";

// The planner's weather no
// longer answers 503 for a minute after one slow call. The providers are
// always simulated here: nothing in this file reaches the network.

const point = { latitude: 45.1234, longitude: -30.5678 };
const payload = {
  hourly: { time: ["2026-10-08T22:00"], cloud_cover: [20] },
  daily: { time: ["2026-10-08"], weather_code: [2] },
};
const metNorwayPayload = {
  properties: {
    timeseries: [
      {
        time: "2026-10-08T22:00:00Z",
        data: {
          instant: {
            details: {
              cloud_area_fraction: 42,
              relative_humidity: 81,
              wind_speed: 5,
              wind_from_direction: 180,
            },
          },
          next_6_hours: {
            summary: { symbol_code: "fair_night" },
            details: { precipitation_amount: 0 },
          },
        },
      },
    ],
  },
};
const start = Date.parse("2026-10-08T20:00:00Z");
const timeout = () =>
  Object.assign(new Error("timed out"), { name: "TimeoutError" });
const isOpenMeteo = (url) => new URL(url).hostname === "api.open-meteo.com";

test("the forecast is asked from two days before today to fifteen days after it", async () => {
  const urls = [];
  const load = createWeatherCache({
    now: () => start,
    fetcher: async (url) => {
      urls.push(new URL(url));
      return Response.json(payload);
    },
  });
  await load(point);
  assert.equal(urls[0].searchParams.get("start_date"), "2026-10-06");
  assert.equal(urls[0].searchParams.get("end_date"), "2026-10-23");
});

// The measured weather of a month, `/v1/weather/history`.
const hour = (iso) => Date.parse(iso) / 1000;
const archive = (startDate, endDate, lastFilled = endDate) => {
  const time = [];
  const cover = [];
  for (
    let instant = Date.parse(`${startDate}T00:00:00Z`);
    instant <= Date.parse(`${endDate}T23:00:00Z`);
    instant += 3600_000
  ) {
    time.push(instant / 1000);
    cover.push(instant <= Date.parse(`${lastFilled}T23:00:00Z`) ? 10 : null);
  }
  return {
    hourly: { time, cloud_cover: cover, precipitation: cover.map(() => 0) },
    daily: { time: [hour(`${startDate}T00:00:00Z`)], weather_code: [1] },
  };
};
const isArchive = (url) =>
  new URL(url).hostname === "archive-api.open-meteo.com";

test("a past month is the archive's, with a day on each side, then a cache hit", async () => {
  const urls = [];
  const load = createWeatherHistoryCache({
    now: () => start,
    fetcher: async (url) => {
      urls.push(new URL(url));
      return Response.json(archive("2026-07-31", "2026-09-01"));
    },
  });
  const first = await load({ ...point, month: "2026-08" });
  const second = await load({ ...point, month: "2026-08" });
  assert.equal(urls.length, 1);
  assert.equal(urls[0].hostname, "archive-api.open-meteo.com");
  assert.equal(urls[0].searchParams.get("start_date"), "2026-07-31");
  assert.equal(urls[0].searchParams.get("end_date"), "2026-09-01");
  assert.equal(
    urls[0].searchParams.get("hourly").includes("visibility"),
    false,
  );
  assert.equal(first.measured, true);
  assert.equal(first.month, "2026-08");
  assert.equal(first.stale, false);
  assert.deepEqual(second.hourly, first.hourly);
});

test("the current month stops at today and its last days come from the forecast", async () => {
  const urls = [];
  const load = createWeatherHistoryCache({
    now: () => start,
    fetcher: async (url) => {
      urls.push(new URL(url));
      if (isArchive(url))
        return Response.json(archive("2026-09-30", "2026-10-08", "2026-10-05"));
      return Response.json({
        hourly: {
          time: [hour("2026-10-07T22:00:00Z"), hour("2026-10-08T22:00:00Z")],
          cloud_cover: [55, 65],
          precipitation: [0.2, 0],
        },
        daily: { time: [], weather_code: [] },
      });
    },
  });
  const history = await load({ ...point, month: "2026-10" });
  assert.equal(urls[0].searchParams.get("end_date"), "2026-10-08");
  assert.equal(urls[1].hostname, "api.open-meteo.com");
  const index = history.hourly.time.indexOf(hour("2026-10-07T22:00:00Z"));
  assert.equal(history.hourly.cloud_cover[index], 55);
  assert.equal(history.hourly.precipitation[index], 0.2);
  // An hour the archive holds is never overwritten.
  const kept = history.hourly.time.indexOf(hour("2026-10-05T22:00:00Z"));
  assert.equal(history.hourly.cloud_cover[kept], 10);
});

test("a month in the future or a malformed month is refused before any call", async () => {
  let calls = 0;
  const load = createWeatherHistoryCache({
    now: () => start,
    fetcher: async () => {
      calls += 1;
      return Response.json(archive("2026-10-01", "2026-10-02"));
    },
  });
  for (const month of ["2026-11", "2026-13", "août", null])
    await assert.rejects(load({ ...point, month }), { code: "month" });
  await assert.rejects(
    load({ latitude: 999, longitude: 0, month: "2026-08" }),
    {
      code: "coordinates",
    },
  );
  assert.equal(calls, 0);
});

test("a refused archive is honoured for its Retry-After, the last month served stale", async () => {
  let clock = start;
  let refuse = false;
  const load = createWeatherHistoryCache({
    now: () => clock,
    settledFreshMs: 1000,
    fetcher: async () =>
      refuse
        ? new Response("", { status: 429, headers: { "retry-after": "120" } })
        : Response.json(archive("2026-07-31", "2026-09-01")),
  });
  await load({ ...point, month: "2026-08" });
  clock += 5000;
  refuse = true;
  const stale = await load({ ...point, month: "2026-08" });
  assert.equal(stale.stale, true);
  assert.equal(stale.retryAfterSeconds, 120);
  // Another month, never loaded: the refusal is a 503 with its wait.
  await assert.rejects(load({ ...point, month: "2026-07" }), {
    code: "rate_limit",
  });
});

test("a timed out call is repeated at once and the retry's answer is served", async () => {
  const calls = [];
  const load = createWeatherCache({
    now: () => start,
    fetcher: async (url) => {
      calls.push(new URL(url).hostname);
      if (calls.length === 1) throw timeout();
      return Response.json(payload);
    },
  });
  const forecast = await load(point);
  assert.equal(forecast.stale, false);
  assert.equal(forecast.source, "Open-Meteo");
  assert.deepEqual(calls, ["api.open-meteo.com", "api.open-meteo.com"]);
});

test("two failed calls on both providers cool the place for 10 s, not a minute", async () => {
  let stamp = start;
  let calls = 0;
  const load = createWeatherCache({
    now: () => stamp,
    fetcher: async () => {
      calls++;
      throw timeout();
    },
  });
  await assert.rejects(load(point), {
    code: "provider",
    retryAfterSeconds: 10,
  });
  // Open-Meteo twice, MET Norway twice.
  assert.equal(calls, 4);
  stamp += 5_000;
  await assert.rejects(load(point), { code: "provider" });
  assert.equal(calls, 4, "still cooling: nothing is asked");
  stamp += 6_000;
  await assert.rejects(load(point), { code: "provider" });
  assert.equal(calls, 8, "11 s later the providers are asked again");
});

test("a restarted instance that was slow once serves the forecast on the next call", async () => {
  let stamp = start;
  let slow = true;
  const load = createWeatherCache({
    now: () => stamp,
    fetcher: async () => {
      if (slow) throw timeout();
      return Response.json(payload);
    },
  });
  await assert.rejects(load(point), { code: "provider" });
  slow = false;
  stamp += 10_500;
  assert.equal((await load(point)).stale, false);
});

test("a 429 cools only that provider, for its own Retry-After", async () => {
  let stamp = start;
  const calls = [];
  const load = createWeatherCache({
    now: () => stamp,
    fetcher: async (url) => {
      calls.push(new URL(url).hostname);
      return isOpenMeteo(url)
        ? new Response("", { status: 429, headers: { "retry-after": "120" } })
        : Response.json(metNorwayPayload);
    },
  });
  const first = await load(point);
  assert.equal(first.source, "MET Norway");
  assert.deepEqual(calls, ["api.open-meteo.com", "api.met.no"]);
  // Another place a minute on: Open-Meteo's 120 s have not run out, so it is
  // not asked; once they have, it is.
  stamp += 60_000;
  await load({ latitude: 46.1, longitude: -30.1 });
  assert.equal(
    calls.filter((host) => host === "api.open-meteo.com").length,
    1,
    "Open-Meteo is not asked while its refusal runs",
  );
  stamp += 61_000;
  await load({ latitude: 47.1, longitude: -30.1 });
  assert.equal(
    calls.filter((host) => host === "api.open-meteo.com").length,
    2,
    "asked again once the Retry-After has passed",
  );
});

test("a refusal of both providers carries the Retry-After of the shorter one", async () => {
  const load = createWeatherCache({
    now: () => start,
    fetcher: async (url) =>
      new Response("", {
        status: 429,
        headers: { "retry-after": isOpenMeteo(url) ? "120" : "45" },
      }),
  });
  await assert.rejects(load(point), {
    code: "rate_limit",
    retryAfterSeconds: 45,
  });
});

test("a 5xx from a provider is not a refusal: no provider cooldown, 10 s for the place", async () => {
  let stamp = start;
  let calls = 0;
  const load = createWeatherCache({
    now: () => stamp,
    fallbackEnabled: false,
    fetcher: async () => {
      calls++;
      return new Response("", { status: 503 });
    },
  });
  await assert.rejects(load(point), {
    code: "provider",
    retryAfterSeconds: 10,
  });
  assert.equal(calls, 1, "an answer, even a bad one, is not retried at once");
  // Another place is asked straight away: nothing limited the provider.
  await assert.rejects(load({ latitude: 40.1, longitude: -30.1 }), {
    code: "provider",
  });
  assert.equal(calls, 2);
});

// ---------------------------------------------------------------------------
// The last forecast of each place, kept in the database (migration 63).

const withStores = async (body) => {
  const directory = await mkdtemp(join(tmpdir(), "astro-weather-store-"));
  try {
    const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
    try {
      await body(driver, "sqlite");
    } finally {
      await driver.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
const withPostgres = async (body) => {
  const url = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
  if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(url))
    throw new Error(
      "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
    );
  const driver = PostgresDriver.open(url);
  try {
    await applyMigrations(driver, "postgres");
    await driver.run("DELETE FROM weather_forecasts");
    await body(driver, "postgres");
  } finally {
    await driver.run("DELETE FROM weather_forecasts").catch(() => {});
    await driver.close();
  }
};
const dialects = [
  ["SQLite", withStores, false],
  ["PostgreSQL", withPostgres, !process.env.ASTRO_PORTAL_TEST_DATABASE_URL],
];

for (const [name, run, skip] of dialects) {
  test(
    `${name}: a restarted instance serves the persisted forecast stale instead of a 503`,
    { skip },
    async () => {
      await run(async (driver, dialect) => {
        const store = await createWeatherForecastRepository({
          driver,
          dialect,
          // The test clock, not the real one: the retention is counted from it.
          now: () => start,
        });
        let stamp = start;
        const first = createWeatherCache({
          now: () => stamp,
          store,
          fetcher: async () => Response.json(payload),
          log: () => {},
        });
        const fresh = await first(point);
        assert.equal(fresh.stale, false);

        // A new instance (after a restart): empty memory, the
        // providers unreachable, the forecast no longer fresh.
        stamp += 25 * 60_000;
        let calls = 0;
        const woken = createWeatherCache({
          now: () => stamp,
          store,
          fetcher: async () => {
            calls++;
            throw timeout();
          },
          log: () => {},
        });
        const stale = await woken(point);
        assert.equal(stale.stale, true);
        assert.equal(stale.fetchedAt, fresh.fetchedAt);
        assert.equal(stale.retryAfterSeconds, 10);
        assert.deepEqual(stale.hourly, payload.hourly);
        assert.equal(calls, 4, "both providers were tried, twice each");
        // And cooled: the next call asks nothing.
        assert.equal((await woken(point)).stale, true);
        assert.equal(calls, 4);
      });
    },
  );

  test(
    `${name}: a persisted forecast still fresh is served without asking a provider`,
    { skip },
    async () => {
      await run(async (driver, dialect) => {
        const store = await createWeatherForecastRepository({
          driver,
          dialect,
          // The test clock, not the real one: the retention is counted from it.
          now: () => start,
        });
        const first = createWeatherCache({
          now: () => start,
          store,
          fetcher: async () => Response.json(payload),
          log: () => {},
        });
        await first(point);
        let calls = 0;
        const woken = createWeatherCache({
          now: () => start + 60_000,
          store,
          fetcher: async () => {
            calls++;
            throw timeout();
          },
          log: () => {},
        });
        const forecast = await woken(point);
        assert.equal(forecast.stale, false);
        assert.equal(calls, 0);
      });
    },
  );

  test(
    `${name}: 503 only when no forecast was ever kept for the place`,
    { skip },
    async () => {
      await run(async (driver, dialect) => {
        const store = await createWeatherForecastRepository({
          driver,
          dialect,
          // The test clock, not the real one: the retention is counted from it.
          now: () => start,
        });
        const seed = createWeatherCache({
          now: () => start,
          store,
          fetcher: async () => Response.json(payload),
          log: () => {},
        });
        await seed(point);
        const down = createWeatherCache({
          now: () => start + 3 * 86400_000,
          store,
          fetcher: async () => {
            throw timeout();
          },
          log: () => {},
        });
        // Three days later the place with a history is still served...
        assert.equal((await down(point)).stale, true);
        // ... and a place that never had one is the only 503.
        await assert.rejects(down({ latitude: 10.5, longitude: 20.5 }), {
          code: "provider",
        });
      });
    },
  );

  test(
    `${name}: the repository upserts one row a place, drops what is old and keeps the most recent`,
    { skip },
    async () => {
      await run(async (driver, dialect) => {
        let stamp = start;
        const store = await createWeatherForecastRepository({
          driver,
          dialect,
          now: () => stamp,
          retainedMs: 7 * 86400_000,
          maximum: 3,
        });
        const record = (at, extra = {}) => ({
          payload: { hourly: { time: [at] }, source: "Open-Meteo" },
          fetchedAt: at,
          freshUntil: at + 20 * 60_000,
          lastModified: null,
          ...extra,
        });
        await store.write("1:1", record(start));
        await store.write("1:1", record(start + 1000, { lastModified: "lm" }));
        const row = await store.read("1:1");
        assert.equal(row.fetchedAt, start + 1000);
        assert.equal(row.freshUntil, start + 1000 + 20 * 60_000);
        assert.equal(row.lastModified, "lm");
        assert.equal(await store.read("2:2"), null);
        const count = async () =>
          Number(
            (await driver.query("SELECT COUNT(*) AS n FROM weather_forecasts"))
              .rows[0].n,
          );
        assert.equal(await count(), 1);
        // The cap keeps the three most recent places.
        for (const [index, key] of ["2:2", "3:3", "4:4"].entries())
          await store.write(key, record(start + 2000 + index));
        assert.equal(await count(), 3);
        assert.equal(await store.read("1:1"), null, "the oldest is gone");
        assert.ok(await store.read("4:4"));
        // A week and a second on, the next write drops the old ones.
        stamp = start + 7 * 86400_000 + 5000;
        await store.write("5:5", record(stamp));
        assert.equal(await count(), 1);
      });
    },
  );
}

test("a store that fails never fails a forecast", async () => {
  const broken = {
    read: async () => {
      throw new Error("disk");
    },
    write: async () => {
      throw new Error("disk");
    },
  };
  const load = createWeatherCache({
    now: () => start,
    store: broken,
    fetcher: async () => Response.json(payload),
    log: () => {},
  });
  assert.equal((await load(point)).stale, false);
  const absent = createWeatherCache({
    now: () => start,
    store: async () => {
      throw new Error("no database");
    },
    fetcher: async () => Response.json(payload),
    log: () => {},
  });
  assert.equal((await absent(point)).stale, false);
});

test("the log counts the forecasts obtained, served stale and failed", async () => {
  let stamp = start;
  let down = false;
  const lines = [];
  const load = createWeatherCache({
    now: () => stamp,
    fetcher: async () => {
      if (down) throw timeout();
      return Response.json(payload);
    },
    log: (line) => lines.push(line),
  });
  await load(point);
  await load(point); // a plain hit of the fresh cache: counted, not logged
  assert.equal(lines.length, 1);
  assert.equal(
    lines[0],
    "[Astro Portal] info weather.fetch: ok source=Open-Meteo ok=1 stale=0 failed=0 fresh=0",
  );
  down = true;
  stamp += 25 * 60_000;
  await load(point);
  assert.match(
    lines[1],
    /weather\.fetch: stale code=provider ageSeconds=1500 retryAfterSeconds=10 ok=1 stale=1 failed=0 fresh=1/,
  );
  await assert.rejects(load({ latitude: 10.5, longitude: 20.5 }));
  assert.match(
    lines[2],
    /weather\.fetch: failed code=provider provider=Open-Meteo_\+_MET_Norway retryAfterSeconds=10 ok=1 stale=1 failed=1 fresh=1/,
  );
  // A mistaken position is the caller's, not the weather's.
  await assert.rejects(load({ latitude: 100, longitude: 0 }), {
    code: "coordinates",
  });
  assert.equal(lines.length, 3);
});
