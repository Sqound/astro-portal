import assert from "node:assert/strict";
import test from "node:test";
import {
  warmMaximumPauseMs,
  warmMinimumPauseMs,
  warmOfflinePack,
} from "../dist/server/warm-offline-pack.js";

// A service that has just started asks itself for its offline-pack
// manifest, so that the first phone does not meet the 503 of a service
// computing its first manifest. The route answers 503 + Retry-After while it
// computes, 200 (fresh or stale) once it has one.

function scripted(...answers) {
  const requests = [];
  const sleeps = [];
  return {
    requests,
    sleeps,
    options: {
      origin: "http://127.0.0.1:9",
      fetchImplementation: async (url) => {
        requests.push(String(url));
        const answer = answers[Math.min(requests.length, answers.length) - 1];
        if (answer instanceof Error) throw answer;
        return new Response(null, {
          status: answer.status,
          headers: answer.retryAfter
            ? { "Retry-After": String(answer.retryAfter) }
            : {},
        });
      },
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    },
  };
}

test("the warm-up asks again after the service's own Retry-After until the manifest is served", async () => {
  const run = scripted(
    { status: 503, retryAfter: 30 },
    { status: 503, retryAfter: 7 },
    { status: 200 },
  );
  const outcome = await warmOfflinePack(run.options);
  assert.deepEqual(outcome, { status: 200, attempts: 3 });
  assert.deepEqual(run.sleeps, [30_000, 7_000]);
  assert.deepEqual(
    run.requests,
    Array(3).fill("http://127.0.0.1:9/api/v1/offline-pack"),
  );
});

test("a stale 200 and a 304 end the warm-up as a fresh one does", async () => {
  for (const status of [200, 304]) {
    const run = scripted({ status });
    assert.deepEqual(await warmOfflinePack(run.options), {
      status,
      attempts: 1,
    });
    assert.deepEqual(run.sleeps, []);
  }
});

test("the pause is clamped, a missing Retry-After included, and the attempts are bounded", async () => {
  const run = scripted(
    { status: 503 },
    { status: 503, retryAfter: 100_000 },
    { status: 503, retryAfter: 1 },
  );
  const outcome = await warmOfflinePack({ ...run.options, attempts: 3 });
  assert.deepEqual(outcome, { status: 503, attempts: 3 });
  assert.deepEqual(run.sleeps, [warmMinimumPauseMs, warmMaximumPauseMs]);
});

test("an unreachable service ends the warm-up without throwing", async () => {
  const messages = [];
  const run = scripted(new Error("refused"));
  const outcome = await warmOfflinePack({
    ...run.options,
    log: (event, message) => messages.push([event, message]),
  });
  assert.equal(outcome.status, null);
  assert.equal(outcome.attempts, 1);
  assert.deepEqual(messages, [["warm-up.unreachable", "refused"]]);
});

test("every wait is told: the attempt, the answer and the pause that follows", async () => {
  const messages = [];
  const run = scripted(
    { status: 503, retryAfter: 30 },
    { status: 503, retryAfter: 7 },
    { status: 200 },
  );
  await warmOfflinePack({
    ...run.options,
    log: (event, message) => messages.push([event, message]),
  });
  assert.deepEqual(
    messages.map(([event]) => event),
    ["warm-up.waiting", "warm-up.waiting", "warm-up.done"],
  );
  assert.match(
    messages[0][1],
    /^The offline-pack manifest answered 503 \(attempt 1 of 20, \d+ ms\): the service is computing it, asking again in 30 s\.$/,
  );
  assert.match(messages[1][1], /attempt 2 of 20, \d+ ms\).*in 7 s\.$/);
});
