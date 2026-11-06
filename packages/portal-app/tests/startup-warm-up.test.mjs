import assert from "node:assert/strict";
import test from "node:test";
import {
  runBackgroundWarmUp,
  runStartupWarmUp,
  warmUpBudgetMilliseconds,
  warmUpHeader,
} from "../dist/server/startup-warm-up.js";
import { warmOfflinePack } from "../dist/server/warm-offline-pack.js";
import { warmPlannerCatalogue } from "../dist/server/warm-planner-catalogue.js";

// The warm-up before readiness tells each step's start, end and duration in
// the server's own log format (`recordBackendLog`: level, event, message,
// context), and never stops the start.

const clock = () => {
  let now = 0;
  return { now: () => now, advance: (milliseconds) => (now += milliseconds) };
};

test("each step is told when it starts and ends, with its duration, then the total", async () => {
  const time = clock();
  const lines = [];
  const outcome = await runStartupWarmUp({
    steps: [
      {
        name: "resync",
        run: async () => {
          time.advance(41_000);
          return "resynchronized";
        },
      },
      {
        name: "planner-reads",
        run: async () => {
          time.advance(120);
        },
      },
    ],
    log: (line) => lines.push(line),
    now: time.now,
  });
  assert.deepEqual(
    lines.map(({ level = "info", event, message }) => [level, event, message]),
    [
      [
        "info",
        "startup.warm-up.start",
        "Warm-up before ready: resync, planner-reads.",
      ],
      ["info", "startup.warm-up.step.start", "Warm-up step resync started."],
      [
        "info",
        "startup.warm-up.step.done",
        "Warm-up step resync done in 41000 ms (resynchronized).",
      ],
      [
        "info",
        "startup.warm-up.step.start",
        "Warm-up step planner-reads started.",
      ],
      [
        "info",
        "startup.warm-up.step.done",
        "Warm-up step planner-reads done in 120 ms.",
      ],
      [
        "info",
        "startup.warm-up.done",
        "Warm-up done in 41120 ms (resync 41000 ms, planner-reads 120 ms).",
      ],
    ],
  );
  assert.deepEqual(lines[2].context, {
    step: "resync",
    durationMs: 41_000,
    ok: true,
  });
  assert.equal(outcome.totalMs, 41_120);
  assert.equal(outcome.timedOut, false);
  assert.deepEqual(outcome.steps, [
    { name: "resync", durationMs: 41_000, ok: true },
    { name: "planner-reads", durationMs: 120, ok: true },
  ]);
});

test("a step that throws is told as a warning and the next one runs", async () => {
  const lines = [];
  const outcome = await runStartupWarmUp({
    steps: [
      {
        name: "catalogue",
        run: async () => {
          throw new Error("the database is unreachable");
        },
      },
      { name: "offline-pack", run: async () => "answered 200" },
    ],
    log: (line) => lines.push(line),
  });
  const failed = lines.find(
    ({ event }) => event === "startup.warm-up.step.failed",
  );
  assert.equal(failed.level, "warning");
  assert.match(
    failed.message,
    /Warm-up step catalogue failed in \d+ ms \(the database is unreachable\)\./,
  );
  assert.deepEqual(
    outcome.steps.map(({ name, ok }) => [name, ok]),
    [
      ["catalogue", false],
      ["offline-pack", true],
    ],
  );
});

test("past its budget the warm-up stops waiting, says so and starts no further step", async () => {
  const lines = [];
  let secondRan = false;
  const outcome = await runStartupWarmUp({
    steps: [
      {
        name: "slow",
        run: () => new Promise((resolve) => setTimeout(resolve, 300)),
      },
      {
        name: "never",
        run: async () => {
          secondRan = true;
        },
      },
    ],
    budgetMs: 50,
    log: (line) => lines.push(line),
  });
  assert.equal(outcome.timedOut, true);
  const budget = lines.find(({ event }) => event === "startup.warm-up.budget");
  assert.equal(budget.level, "warning");
  assert.match(
    budget.message,
    /ready anyway, the rest finishes in the background/,
  );
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(secondRan, false);
});

test("no step, no line", async () => {
  const lines = [];
  const outcome = await runStartupWarmUp({
    steps: [],
    log: (line) => lines.push(line),
  });
  assert.deepEqual(lines, []);
  assert.equal(outcome.timedOut, false);
});

test("the planner's reads tell their duration and carry the warm-up's header", async () => {
  const lines = [];
  const seen = [];
  await warmPlannerCatalogue({
    origin: "http://127.0.0.1:9",
    headers: { [warmUpHeader]: "secret" },
    fetchImplementation: async (url, init) => {
      seen.push(init.headers[warmUpHeader]);
      await new Promise((resolve) => setTimeout(resolve, 20));
      return new Response("{}", { status: 200 });
    },
    log: (event, message) => lines.push([event, message]),
  });
  assert.deepEqual(seen, ["secret", "secret", "secret"]);
  const reads = lines.filter(([event]) => event === "warm-up.planner-read");
  assert.equal(reads.length, 3);
  assert.match(
    reads[0][1],
    /^\/api\/planner-targets answered 200 in \d+ ms\.$/,
  );
  assert.match(reads[1][1], /^\/api\/catalog answered 200 in \d+ ms\.$/);
  assert.match(reads[2][1], /^\/api\/target-library answered 200 in \d+ ms\.$/);
});

test("the offline pack's request carries the header and its line tells the duration", async () => {
  const lines = [];
  let header;
  await warmOfflinePack({
    origin: "http://127.0.0.1:9",
    headers: { [warmUpHeader]: "secret" },
    fetchImplementation: async (url, init) => {
      header = init.headers[warmUpHeader];
      return new Response("{}", { status: 200 });
    },
    log: (event, message) => lines.push([event, message]),
  });
  assert.equal(header, "secret");
  assert.match(
    lines.at(-1)[1],
    /^The offline-pack manifest answered 200 after 1 attempt\(s\), \d+ ms\.$/,
  );
});

test("the background warm-up runs its steps at once, tells each one's start, end and duration, and never throws", async () => {
  const time = clock();
  const lines = [];
  const started = [];
  const outcome = await runBackgroundWarmUp({
    steps: [
      {
        name: "media",
        run: async () => {
          started.push("media");
          time.advance(80_000);
          return "80271 ms since the catalogue was loaded";
        },
      },
      {
        name: "offline-pack",
        run: async () => {
          started.push("offline-pack");
          throw new Error("the pack could not be computed");
        },
      },
    ],
    log: (line) => lines.push(line),
    now: time.now,
  });
  assert.deepEqual(started, ["media", "offline-pack"]);
  assert.deepEqual(
    lines.map(({ level = "info", event }) => [level, event]),
    [
      ["info", "startup.warm-up.background.start"],
      ["info", "startup.warm-up.background.step.start"],
      ["info", "startup.warm-up.background.step.start"],
      ["info", "startup.warm-up.background.step.done"],
      ["warning", "startup.warm-up.background.step.failed"],
      ["info", "startup.warm-up.background.done"],
    ],
  );
  assert.equal(
    lines[0].message,
    "Ready; warming up in the background: media, offline-pack.",
  );
  assert.match(
    lines.find(({ event }) => event.endsWith("step.done")).message,
    /^Background warm-up step media done in 80000 ms \(80271 ms since/,
  );
  assert.match(
    lines.find(({ event }) => event.endsWith("step.failed")).message,
    /^Background warm-up step offline-pack failed in 0 ms \(the pack could not be computed\)\.$/,
  );
  assert.deepEqual(outcome.steps.map(({ name, ok }) => [name, ok]).sort(), [
    ["media", true],
    ["offline-pack", false],
  ]);
  assert.equal(outcome.totalMs, 80_000);
  assert.deepEqual(
    await runBackgroundWarmUp({ steps: [], log: () => assert.fail("a line") }),
    { steps: [], totalMs: 0 },
  );
});

test("the default budget is a few tens of seconds, not minutes", () => {
  assert.ok(warmUpBudgetMilliseconds <= 60_000);
});
