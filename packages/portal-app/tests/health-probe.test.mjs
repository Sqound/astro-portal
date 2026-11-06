import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  answerHealthProbe,
  answerReadinessProbe,
  healthProbePath,
  heapPressure,
  readinessProbePath,
  refuseUntilReady,
  startingRetryAfterSeconds,
} from "../dist/server/start.js";

// The platform's probes: a probe that went through the application could be
// too late for the second a platform allows on a busy process. The light path
// answers before routing, sign-in and database.

async function withServer(run) {
  let reachedTheApplication = 0;
  const server = createServer((request, response) => {
    if (answerHealthProbe(request, response)) return;
    reachedTheApplication += 1;
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(origin, () => reachedTheApplication);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("the probe path answers 200 ok to GET and HEAD, never cached", async () => {
  assert.equal(healthProbePath, "/healthz");
  await withServer(async (origin, reached) => {
    const get = await fetch(`${origin}/healthz`);
    assert.equal(get.status, 200);
    assert.equal(await get.text(), "ok\n");
    assert.equal(get.headers.get("cache-control"), "no-store");
    const head = await fetch(`${origin}/healthz?from=probe`, {
      method: "HEAD",
    });
    assert.equal(head.status, 200);
    assert.equal(reached(), 0, "nothing reached the application");
  });
});

test("any other path or method goes on to the application", async () => {
  await withServer(async (origin, reached) => {
    for (const [method, path] of [
      ["GET", "/api/v1/service"],
      ["GET", "/healthz/extra"],
      ["GET", "/healthzz"],
      ["POST", "/healthz"],
    ]) {
      const response = await fetch(`${origin}${path}`, { method });
      assert.equal(response.status, 404, `${method} ${path}`);
    }
    assert.equal(reached(), 4);
  });
});

// `/healthz` says the process is alive (startup and liveness probes),
// `/readyz` whether it serves (readiness probe): 503 with Retry-After
// until the startup maintenance and Next.js are done. Nothing but a probe
// reaches the server before that.
async function withGate(ready, run) {
  let reachedTheApplication = 0;
  const server = createServer((request, response) => {
    if (answerHealthProbe(request, response)) return;
    if (answerReadinessProbe(request, response, ready.value)) return;
    if (!ready.value) return refuseUntilReady(response);
    reachedTheApplication += 1;
    response.writeHead(200).end("application");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(origin, () => reachedTheApplication);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("before readiness: /healthz 200, /readyz 503, every other request 503 with Retry-After", async () => {
  assert.equal(readinessProbePath, "/readyz");
  const ready = { value: false };
  await withGate(ready, async (origin, reached) => {
    assert.equal((await fetch(`${origin}/healthz`)).status, 200);
    const probe = await fetch(`${origin}/readyz`);
    assert.equal(probe.status, 503);
    assert.equal(await probe.text(), "starting\n");
    assert.equal(
      probe.headers.get("retry-after"),
      String(startingRetryAfterSeconds),
    );
    assert.equal(probe.headers.get("cache-control"), "no-store");
    for (const [method, path] of [
      ["GET", "/fr/planner"],
      ["GET", "/api/v1/service"],
      ["POST", "/api/v1/plans"],
      ["POST", "/readyz"],
      ["GET", "/readyz/extra"],
    ]) {
      const response = await fetch(`${origin}${path}`, { method });
      assert.equal(response.status, 503, `${method} ${path}`);
      assert.equal(
        response.headers.get("retry-after"),
        String(startingRetryAfterSeconds),
      );
      assert.deepEqual(await response.json(), {
        error: {
          code: "service_starting",
          message: "The service is starting; try again in a few seconds.",
        },
      });
    }
    assert.equal(reached(), 0, "nothing reached the application");

    ready.value = true;
    const readyProbe = await fetch(`${origin}/readyz?from=probe`);
    assert.equal(readyProbe.status, 200);
    assert.equal(await readyProbe.text(), "ready\n");
    assert.equal(readyProbe.headers.get("retry-after"), null);
    const head = await fetch(`${origin}/readyz`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal((await fetch(`${origin}/fr/planner`)).status, 200);
    assert.equal(reached(), 1);
  });
});

// The heap's watch: said once when it passes 80 % of its limit, once when it
// is back well under, never in between.
test("the heap's watch speaks once going up and once coming down", () => {
  const limit = 512;
  const at = (used, warned) =>
    heapPressure({ heapUsed: used, heapLimit: limit, warned });
  assert.equal(at(100, false), null);
  assert.equal(at(420, false), "high");
  assert.equal(at(500, true), null, "already said");
  assert.equal(at(320, true), null, "not yet back under 60 %");
  assert.equal(at(250, true), "recovered");
  assert.equal(at(250, false), null);
});
