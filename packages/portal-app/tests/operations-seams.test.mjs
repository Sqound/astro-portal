import assert from "node:assert/strict";
import test from "node:test";
import {
  createRequestTimings,
  routeTemplate,
  statusClass,
} from "../dist/server/request-timings.js";
import { countOf, createTaskTracker } from "../dist/server/task-runs.js";

// The two generic seams of the service's start (server/start.js) that a
// composition may keep: the duration of each request by route, five minutes
// at a time, and each run of a task. Neither names anything of a person.

test("a route template keeps the words of the path and replaces what identifies", () => {
  assert.equal(routeTemplate("/api/v1/plans"), "/api/v1/plans");
  assert.equal(
    routeTemplate("/api/v1/plans/3f2b9c1e-1111-4a6b-9c1e-0123456789ab?x=1"),
    "/api/v1/plans/:id",
  );
  assert.equal(
    routeTemplate("/fr/p/Zx8_aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV3wX4yZ5/abc"),
    "/fr/p/:id/abc",
  );
  assert.equal(
    routeTemplate("/api/v1/sky-quality/map/7/12/34.png"),
    "/api/v1/sky-quality/map/:id/:id/:id",
  );
  assert.equal(routeTemplate("/_next/static/chunks/a1b2.js"), "/_next/*");
  assert.equal(
    routeTemplate("/api/users/someone%40example.test"),
    "/api/users/:id",
  );
  assert.equal(routeTemplate("/"), "/");
  assert.equal(statusClass(204), "2xx");
  assert.equal(statusClass(499), "4xx");
  assert.equal(statusClass(undefined), "5xx");
});

test("a window of timings gives one row per method, route and class of status, with its percentiles", () => {
  let clock = Date.parse("2026-11-03T10:00:00.000Z");
  const timings = createRequestTimings({ now: () => clock });
  for (let index = 1; index <= 100; index += 1)
    timings.record({
      method: "get",
      url: `/api/v1/plans/${index}`,
      status: 200,
      durationMs: index,
    });
  timings.record({
    method: "POST",
    url: "/api/v1/plans",
    status: 503,
    durationMs: 7,
  });
  clock += 5 * 60_000;
  const rows = timings.drain();
  assert.equal(rows.length, 2);
  const plans = rows.find((row) => row.method === "GET");
  assert.deepEqual(plans, {
    windowStart: "2026-11-03T10:00:00.000Z",
    windowEnd: "2026-11-03T10:05:00.000Z",
    method: "GET",
    route: "/api/v1/plans/:id",
    statusClass: "2xx",
    count: 100,
    p50Ms: 50,
    p95Ms: 95,
    maxMs: 100,
  });
  assert.equal(rows.find((row) => row.method === "POST").statusClass, "5xx");
  // The next window starts empty, where the last one ended.
  assert.deepEqual(timings.drain(), []);
});

test("the routes of a window are bounded: the rest count under (other)", () => {
  const timings = createRequestTimings();
  for (let index = 0; index < 600; index += 1)
    timings.record({
      method: "GET",
      url: `/page-${String.fromCharCode(97 + (index % 26))}${"x".repeat(Math.floor(index / 26))}`,
      status: 200,
      durationMs: 1,
    });
  const rows = timings.drain();
  assert.ok(rows.length <= 501);
  assert.ok(rows.some((row) => row.route === "(other)"));
  assert.equal(
    rows.reduce((sum, row) => sum + row.count, 0),
    600,
  );
});

test("a tracked task is measured and recorded, its failure too, and never thrown unless asked", async () => {
  const runs = [];
  let elapsed = 0;
  const track = createTaskTracker({
    record: async (run) => runs.push(run),
    now: () => new Date("2026-11-03T10:00:00.000Z"),
    elapsed: () => (elapsed += 25),
  });
  assert.equal(await track("trash", async () => 3), 3);
  assert.equal(
    await track("broken", async () => {
      throw new Error("no database");
    }),
    undefined,
  );
  await assert.rejects(
    track(
      "vital",
      async () => {
        throw new Error("refused");
      },
      { phase: "startup", rethrow: true },
    ),
    /refused/,
  );
  assert.deepEqual(runs, [
    {
      name: "trash",
      phase: "periodic",
      startedAt: "2026-11-03T10:00:00.000Z",
      durationMs: 25,
      outcome: "ok",
      count: 3,
      message: null,
    },
    {
      name: "broken",
      phase: "periodic",
      startedAt: "2026-11-03T10:00:00.000Z",
      durationMs: 25,
      outcome: "failed",
      count: null,
      message: "no database",
    },
    {
      name: "vital",
      phase: "startup",
      startedAt: "2026-11-03T10:00:00.000Z",
      durationMs: 25,
      outcome: "failed",
      count: null,
      message: "refused",
    },
  ]);
  // A record that fails costs the task nothing.
  const quiet = createTaskTracker({
    record: async () => {
      throw new Error("full");
    },
  });
  assert.deepEqual(await quiet("still", async () => [1, 2]), [1, 2]);
  assert.equal(countOf([1, 2]), 2);
  assert.equal(countOf({ count: 4.2 }), 4);
  assert.equal(countOf({ removed: [] }), null);
});
