import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPlaceClimateTrendCache } from "../dist/place-climate-trend.server.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";
import { SqliteDriver } from "../dist/persistence/sqlite-driver.js";
import { createPlaceClimateTrendRepository } from "../dist/persistence/place-climate-trend-repository.js";

// The service keeps the trend of a
// place for a year and asks the archive once. The provider is always
// simulated here: nothing in this file reaches the network.

const day = 86400_000;
const start = Date.parse("2026-10-13T12:00:00Z");
const paris = { latitude: 48.8566, longitude: 2.3522 };
const archivePayload = {
  hourly: { time: [1_451_606_400], cloud_cover: [10], precipitation: [0] },
};
// The reducer is its own tests' business: a stub marks what it was given.
const reduce = ({ latitude, longitude, years, computedAt }) => ({
  years: [years.from, years.to],
  yearsWithData: 10,
  months: [],
  trend: "distinct",
  best: { from: 6, to: 8, clearShare: 70 },
  worst: { from: 12, to: 1, clearShare: 30 },
  computedAt: computedAt.toISOString(),
  seen: { latitude, longitude },
});

function setup(options = {}) {
  const state = { now: start, calls: [], program: null };
  const load = createPlaceClimateTrendCache({
    now: () => state.now,
    reduce,
    log: () => {},
    fetcher: async (url) => {
      state.calls.push(new URL(url));
      if (state.program) return state.program(url);
      return Response.json(archivePayload);
    },
    ...options,
  });
  return { state, load };
}

test("the archive is read once for ten years, at the rounded place, and a second call is served from memory", async () => {
  const { state, load } = setup();
  const first = await load(paris);
  assert.equal(first.status, "ready");
  assert.equal(first.trend.stale, false);
  assert.equal(first.trend.source, "Open-Meteo");
  assert.deepEqual(first.trend.place, { latitude: 48.85, longitude: 2.35 });
  assert.deepEqual(first.trend.years, [2016, 2025]);
  assert.deepEqual(first.trend.seen, { latitude: 48.85, longitude: 2.35 });
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].searchParams.get("start_date"), "2016-01-01");
  assert.equal(state.calls[0].searchParams.get("end_date"), "2025-12-31");
  assert.equal(state.calls[0].searchParams.get("latitude"), "48.85");

  state.now += 200 * day;
  const second = await load(paris);
  assert.equal(second.trend.stale, false);
  assert.equal(second.trend.computedAt, first.trend.computedAt);
  // Another point of the same 0.05° cell is the same entry.
  await load({ latitude: 48.8501, longitude: 2.3499 });
  assert.equal(state.calls.length, 1, "no second request");
  // Another cell is another reading.
  await load({ latitude: 48.9166, longitude: 2.3522 });
  assert.equal(state.calls.length, 2);
});

test("calls at the same time for a place share a single reading", async () => {
  const { state, load } = setup();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  state.program = async () => {
    await gate;
    return Response.json(archivePayload);
  };
  const answers = [load(paris), load(paris), load(paris)];
  release();
  const results = await Promise.all(answers);
  assert.equal(state.calls.length, 1);
  assert.deepEqual(
    results.map((answer) => answer.status),
    ["ready", "ready", "ready"],
  );
});

test("a reading that outlasts the wait answers computing, and the next call finds it done", async () => {
  const { state, load } = setup({ waitMs: 20 });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  state.program = async () => {
    await gate;
    return Response.json(archivePayload);
  };
  const first = await load(paris);
  assert.deepEqual(first, { status: "computing", retryAfterSeconds: 5 });
  const again = await load(paris);
  assert.equal(again.status, "computing", "still one reading");
  assert.equal(state.calls.length, 1);
  release();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const done = await load(paris);
  assert.equal(done.status, "ready");
  assert.equal(state.calls.length, 1);
});

test("a reading that fails after the wait is a 503 on the next call, not an unhandled rejection", async () => {
  const { state, load } = setup({ waitMs: 10 });
  state.program = async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
    return new Response("", { status: 500 });
  };
  assert.equal((await load(paris)).status, "computing");
  await new Promise((resolve) => setTimeout(resolve, 80));
  await assert.rejects(load(paris), (error) => {
    assert.equal(error.code, "provider");
    assert.ok(error.retryAfterSeconds >= 1 && error.retryAfterSeconds <= 60);
    return true;
  });
});

test("an archive that fails is a provider error with its retry delay, and the place is not asked again at once", async () => {
  const { state, load } = setup();
  state.program = async () => new Response("", { status: 500 });
  await assert.rejects(load(paris), { code: "provider" });
  assert.equal(state.calls.length, 1);
  await assert.rejects(load(paris), { code: "provider" });
  assert.equal(state.calls.length, 1, "cooled");
  // A minute on the place is asked again.
  state.now += 61_000;
  state.program = null;
  assert.equal((await load(paris)).status, "ready");
  assert.equal(state.calls.length, 2);
});

test("a timeout, an unreadable body and a series without cloud cover are provider errors", async () => {
  for (const program of [
    async () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    },
    async () => new Response("not json", { status: 200 }),
    async () => Response.json({ hourly: { time: [1] } }),
    async () => Response.json({}),
  ]) {
    const { state, load } = setup();
    state.program = program;
    await assert.rejects(load(paris), { code: "provider" });
  }
});

test("a refusal of the archive is honoured for its Retry-After, for every place", async () => {
  const { state, load } = setup();
  state.program = async () =>
    new Response("", { status: 429, headers: { "retry-after": "120" } });
  await assert.rejects(load(paris), {
    code: "rate_limit",
    retryAfterSeconds: 120,
  });
  state.program = null;
  state.now += 30_000;
  await assert.rejects(load({ latitude: 10, longitude: 20 }), {
    code: "rate_limit",
    retryAfterSeconds: 90,
  });
  assert.equal(state.calls.length, 1, "nothing asked during the cooldown");
  state.now += 91_000;
  assert.equal((await load({ latitude: 10, longitude: 20 })).status, "ready");
});

test("a refusal without a Retry-After cools the provider for ten minutes", async () => {
  const { state, load } = setup();
  state.program = async () => new Response("", { status: 429 });
  await assert.rejects(load(paris), {
    code: "rate_limit",
    retryAfterSeconds: 600,
  });
});

test("the readings of an hour are capped, the next ones wait for a slot", async () => {
  const { state, load } = setup({ maxStartsPerHour: 2 });
  await load({ latitude: 1, longitude: 1 });
  state.now += 10 * 60_000;
  await load({ latitude: 2, longitude: 2 });
  state.now += 10 * 60_000;
  await assert.rejects(load({ latitude: 3, longitude: 3 }), {
    code: "rate_limit",
    retryAfterSeconds: 2400,
  });
  assert.equal(state.calls.length, 2);
  // A place already known is not a reading.
  assert.equal((await load({ latitude: 1, longitude: 1 })).status, "ready");
  state.now += 41 * 60_000;
  assert.equal((await load({ latitude: 3, longitude: 3 })).status, "ready");
});

test("a trend past its year is served stale at once and worked out again behind", async () => {
  const { state, load } = setup();
  const first = await load(paris);
  state.now += 366 * day;
  const served = await load(paris);
  assert.equal(served.trend.stale, true);
  assert.equal(served.trend.computedAt, first.trend.computedAt);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(state.calls.length, 2, "the new reading was started");
  // A year on, the span has moved: 2017 to 2026.
  assert.equal(state.calls[1].searchParams.get("start_date"), "2017-01-01");
  const fresh = await load(paris);
  assert.equal(fresh.trend.stale, false);
  assert.notEqual(fresh.trend.computedAt, first.trend.computedAt);
  assert.equal(state.calls.length, 2);
});

test("the ten years follow the calendar: a year on, the span moved by one", async () => {
  const { state, load } = setup();
  await load(paris);
  state.now = Date.parse("2027-10-13T12:00:00Z");
  await load(paris);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(state.calls[1].searchParams.get("start_date"), "2017-01-01");
  assert.equal(state.calls[1].searchParams.get("end_date"), "2026-12-31");
});

test("when the archive is down the old trend stays served, stale, and the archive is left alone for a minute", async () => {
  const { state, load } = setup();
  await load(paris);
  state.now += 400 * day;
  state.program = async () => new Response("", { status: 503 });
  assert.equal((await load(paris)).trend.stale, true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(state.calls.length, 2);
  assert.equal((await load(paris)).trend.stale, true);
  assert.equal(state.calls.length, 2, "cooling");
  state.now += 61_000;
  state.program = null;
  assert.equal((await load(paris)).trend.stale, true, "served while it works");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal((await load(paris)).trend.stale, false);
});

test("a trend kept beyond three years is no longer served", async () => {
  const { state, load } = setup({ waitMs: 5 });
  await load(paris);
  state.now += 3 * 365 * day + day;
  state.program = async () => new Response("", { status: 503 });
  await assert.rejects(load(paris), { code: "provider" });
});

test("a malformed position is the caller's mistake and reaches no provider", async () => {
  const { state, load } = setup();
  for (const bad of [
    {},
    { latitude: "x", longitude: 1 },
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: 181 },
    { latitude: "", longitude: "" },
  ])
    await assert.rejects(load(bad), { code: "coordinates" });
  assert.equal(state.calls.length, 0);
});

test("a store that fails never fails a read", async () => {
  const broken = {
    read: async () => {
      throw new Error("disk");
    },
    write: async () => {
      throw new Error("disk");
    },
  };
  assert.equal((await setup({ store: broken }).load(paris)).status, "ready");
  const absent = setup({
    store: async () => {
      throw new Error("no database");
    },
  });
  assert.equal((await absent.load(paris)).status, "ready");
});

test("the log counts the trends worked out, served stale and failed", async () => {
  const lines = [];
  const { state, load } = setup({ log: (line) => lines.push(line) });
  await load(paris);
  state.now += 400 * day;
  state.program = async () => new Response("", { status: 503 });
  await load(paris);
  await new Promise((resolve) => setTimeout(resolve, 20));
  await assert.rejects(load({ latitude: 5, longitude: 5 }));
  assert.match(lines[0], /place\.climate-trend: computed .*computed=1/);
  assert.ok(lines.some((line) => /: stale ageDays=400/.test(line)));
  assert.ok(lines.some((line) => /: failed code=provider/.test(line)));
});

test("the real reducer runs on a real archive shape", async () => {
  const time = [];
  const cloud_cover = [];
  for (
    let stamp = Date.UTC(2016, 0, 1);
    stamp < Date.UTC(2026, 0, 1);
    stamp += 3600_000
  ) {
    time.push(stamp / 1000);
    cloud_cover.push(new Date(stamp).getUTCMonth() === 6 ? 0 : 100);
  }
  const load = createPlaceClimateTrendCache({
    now: () => start,
    log: () => {},
    fetcher: async () => Response.json({ hourly: { time, cloud_cover } }),
  });
  const { trend } = await load(paris);
  assert.equal(trend.trend, "distinct");
  assert.ok(trend.best.from <= 7 && trend.best.to >= 7);
  assert.equal(trend.months.length, 12);
});

// ---------------------------------------------------------------------------
// The trend of each place, kept in the database (migration 78).

const withSqlite = async (body) => {
  const directory = await mkdtemp(join(tmpdir(), "astro-climate-store-"));
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
    await driver.run("DELETE FROM place_climate_trends");
    await body(driver, "postgres");
  } finally {
    await driver.run("DELETE FROM place_climate_trends").catch(() => {});
    await driver.close();
  }
};

for (const [name, run, skip] of [
  ["SQLite", withSqlite, false],
  ["PostgreSQL", withPostgres, !process.env.ASTRO_PORTAL_TEST_DATABASE_URL],
]) {
  test(
    `${name}: a restarted instance serves the stored trend without asking the archive`,
    { skip },
    async () => {
      await run(async (driver, dialect) => {
        const store = await createPlaceClimateTrendRepository({
          driver,
          dialect,
          now: () => start,
        });
        const first = setup({ store });
        await first.load(paris);
        assert.equal(first.state.calls.length, 1);
        // Another process: an empty memory, the same database.
        const second = setup({ store });
        const answer = await second.load(paris);
        assert.equal(answer.status, "ready");
        assert.equal(answer.trend.stale, false);
        assert.equal(second.state.calls.length, 0, "no request");
        assert.deepEqual(answer.trend.best, { from: 6, to: 8, clearShare: 70 });
        // A year later it is served stale and worked out again.
        second.state.now += 400 * day;
        assert.equal((await second.load(paris)).trend.stale, true);
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(second.state.calls.length, 1);
        const row = await store.read("48.85:2.35");
        assert.equal(row.computedAt, start + 400 * day);
        assert.equal(row.freshUntil, start + 400 * day + 365 * day);
      });
    },
  );

  test(
    `${name}: the repository upserts one row a place, drops what is old and keeps the most recent`,
    { skip },
    async () => {
      await run(async (driver, dialect) => {
        let stamp = start;
        const store = await createPlaceClimateTrendRepository({
          driver,
          dialect,
          now: () => stamp,
          retainedMs: 10 * day,
          maximum: 3,
        });
        const record = (at) => ({
          payload: { months: [], computedAt: new Date(at).toISOString() },
          computedAt: at,
          freshUntil: at + 365 * day,
        });
        await store.write("1.00:1.00", record(start));
        await store.write("1.00:1.00", record(start + 1000));
        assert.equal((await store.read("1.00:1.00")).computedAt, start + 1000);
        assert.equal(await store.read("2.00:2.00"), null);
        const count = async () =>
          Number(
            (
              await driver.query(
                "SELECT COUNT(*) AS n FROM place_climate_trends",
              )
            ).rows[0].n,
          );
        assert.equal(await count(), 1);
        for (const [index, key] of [
          "2.00:2.00",
          "3.00:3.00",
          "4.00:4.00",
        ].entries())
          await store.write(key, record(start + 2000 + index));
        assert.equal(await count(), 3);
        assert.equal(await store.read("1.00:1.00"), null, "the oldest is gone");
        assert.ok(await store.read("4.00:4.00"));
        stamp = start + 10 * day + 5000;
        await store.write("5.00:5.00", record(stamp));
        assert.equal(await count(), 1);
        // A row that is not JSON reads as absent.
        await driver.run(
          "UPDATE place_climate_trends SET payload = ? WHERE place_key = ?",
          ["{broken", "5.00:5.00"],
        );
        assert.equal(await store.read("5.00:5.00"), null);
      });
    },
  );
}
