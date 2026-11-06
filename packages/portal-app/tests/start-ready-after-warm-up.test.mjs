import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Prod, 30/10/2026: after a change of the catalogue's source revision, the
// first read of the catalogue ran 2 minutes and the routes answered in 3 to
// 10 s for five minutes, because the service said it was ready and only then
// warmed itself up. It now warms up first: `/readyz` answers 503 (and every
// other request but the warm-up's own is refused) until the catalogue is
// resynchronized and loaded and the planner's reads asked for; `/healthz`
// answers at once all along; the first request after `/readyz` 200 is a warm
// one; each step's duration is in the log.
//
// Prod, 31/10/2026: the offline pack's first manifest (which waits for the
// import of every stored text) and the catalogue's media check (80 s) were in
// that warm-up too, and the platform gave the revision up before the service
// was ready. They now run after ready, in the background, and say so.
//
// A real start of the service, in a child process, with a stand-in for
// Next.js (tests/helpers/start-server-fixture.mjs).
const fixture = fileURLToPath(
  new URL("./helpers/start-server-fixture.mjs", import.meta.url),
);
const pause = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
const SLOW_READ_MS = 1_500;

async function startService(root, extraEnvironment = {}) {
  const environment = { ...process.env };
  for (const key of Object.keys(environment))
    if (key.startsWith("ASTRO_PORTAL_")) delete environment[key];
  await mkdir(join(root, "static-data"), { recursive: true });
  const child = spawn(process.execPath, [fixture], {
    env: {
      ...environment,
      ASTRO_PORTAL_DATABASE_PATH: join(root, "db", "portal.sqlite"),
      ASTRO_PORTAL_BACKUP_DIR: join(root, "backups"),
      ASTRO_PORTAL_BACKUP_MEDIA_DIR: join(root, "captures"),
      ASTRO_PORTAL_RUNTIME_DIR: join(root, "runtime"),
      ASTRO_PORTAL_STATIC_DATA_DIR: join(root, "static-data"),
      ASTRO_PORTAL_AUTH_MODE: "password",
      ASTRO_PORTAL_SIGN_IN_KEY: randomBytes(32).toString("base64"),
      NODE_ENV: "production",
      WARM_UP_SLOW_FIRST_READ_MS: String(SLOW_READ_MS),
      // Never the 34 MB of the star catalogue from a test.
      ASTRO_PORTAL_HYG_DOWNLOAD: "off",
      ...extraEnvironment,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const exited = new Promise((resolvePromise) =>
    child.on("close", (code) => resolvePromise(code)),
  );
  const port = new Promise((resolvePromise, reject) => {
    const read = (chunk) => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) resolvePromise(Number(match[1]));
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    exited.then((code) =>
      reject(new Error(`the service exited (${code}):\n${output}`)),
    );
  });
  return { child, port, exited, output: () => output };
}

async function ask(origin, path, init) {
  const started = performance.now();
  try {
    const response = await fetch(`${origin}${path}`, init);
    const body = await response.text();
    return {
      status: response.status,
      body,
      headers: response.headers,
      ms: performance.now() - started,
    };
  } catch {
    return null;
  }
}

async function waitFor(condition, what, timeoutMs = 60_000) {
  const started = performance.now();
  for (;;) {
    if (await condition()) return performance.now() - started;
    if (performance.now() - started > timeoutMs)
      throw new Error(`timeout waiting for ${what}`);
    await pause(10);
  }
}

test("ready is true only after the warm-up: probes at once, 503 for the rest meanwhile, a warm first request after, every step timed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "astro-ready-after-warm-up-"));
  const started = await startService(root);
  t.after(async () => {
    started.child.kill("SIGKILL");
    await rm(root, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${await started.port}`;

  // The planner's first read is in flight (the catalogue step is over): the
  // service is mid warm-up.
  await waitFor(
    () => /REQUEST \/api\/planner-targets/.test(started.output()),
    "the warm-up's first planner read",
  );
  const slowReadSeenAt = performance.now();

  // Meanwhile: the process lives and answers at once; it is not ready; the
  // application is not reachable by anyone but the warm-up.
  //
  // The child's log reaches this process through a pipe, read apart from the
  // HTTP answers (and written asynchronously on macOS): under load, `/readyz`
  // can answer 200 before the line that says the warm-up is over has arrived
  // here. A 200 therefore ends the probing, and that line must then arrive (it
  // is written before ready is set, and the order of the log is checked
  // below).
  const healthSamples = [];
  const readySamples = [];
  const warmUpOver = /startup\.warm-up\.done|Warm-up done in/;
  let readyAt = null;
  while (!warmUpOver.test(started.output())) {
    healthSamples.push((await ask(origin, "/healthz")).ms);
    const probe = await ask(origin, "/readyz");
    if (probe.status === 200 && readySamples.length > 0) {
      readyAt = performance.now();
      break;
    }
    readySamples.push(probe.status);
    if (readySamples.length === 1) {
      assert.equal(probe.status, 503, "not ready during the warm-up");
      assert.equal(await probe.body, "starting\n");
      const route = await ask(origin, "/api/planner-targets");
      assert.equal(route.status, 503);
      assert.equal(JSON.parse(route.body).error.code, "service_starting");
      assert.equal(route.headers.get("retry-after"), "5");
      const forged = await ask(origin, "/api/planner-targets", {
        headers: { "x-astro-warm-up": "not-the-secret" },
      });
      assert.equal(forged.status, 503, "the warm-up's header needs its secret");
    }
    await pause(25);
  }
  if (readyAt !== null)
    await waitFor(
      () => warmUpOver.test(started.output()),
      "the end of the warm-up in the log of a service already ready",
      5_000,
    );
  assert.ok(readySamples.length >= 2, "probed while the warm-up ran");
  assert.ok(
    readySamples.every((status) => status === 503),
    `never ready before the warm-up ended: ${readySamples}`,
  );
  assert.ok(
    Math.max(...healthSamples) < 500,
    `/healthz answered within ${Math.round(Math.max(...healthSamples))} ms during the warm-up`,
  );

  // Ready.
  await waitFor(
    async () => (await ask(origin, "/readyz"))?.status === 200,
    "/readyz 200",
  );
  assert.ok(
    (readyAt ?? performance.now()) - slowReadSeenAt >= SLOW_READ_MS * 0.5,
    "ready came after the slow read of the warm-up",
  );
  const first = await ask(origin, "/api/planner-targets");
  assert.equal(first.status, 200);
  assert.equal(first.body, "application\n");
  assert.ok(first.ms < SLOW_READ_MS / 2, `first request ${first.ms} ms`);

  await waitFor(
    () => /startup\.warm-up\.background\.done/.test(started.output()),
    "the background warm-up's end",
  );
  const output = started.output();
  // Order: the catalogue, the planner's reads, the end of the warm-up, ready,
  // then, in the background, the media check and the offline pack.
  const at = (pattern) => {
    const match = pattern.exec(output);
    assert.ok(match, `${pattern} is in the output:\n${output}`);
    return match.index;
  };
  const order = [
    /startup\.warm-up\.start: Warm-up before ready: catalogue, planner-reads\./,
    /startup\.warm-up\.step\.start: Warm-up step catalogue started/,
    /startup\.warm-up\.step\.done: Warm-up step catalogue done in \d+ ms/,
    /startup\.warm-up\.step\.start: Warm-up step planner-reads started/,
    /warm-up\.planner-read: \/api\/planner-targets answered 200 in \d+ ms/,
    /startup\.warm-up\.step\.done: Warm-up step planner-reads done in \d+ ms/,
    /startup\.warm-up\.done: Warm-up done in \d+ ms \(catalogue \d+ ms, planner-reads \d+ ms\)/,
    /server\.ready: Ready: \/readyz answers 200/,
    /startup\.warm-up\.background\.start: Ready; warming up in the background: media, offline-pack, hyg-catalogue\./,
    /startup\.warm-up\.background\.step\.start: Background warm-up step offline-pack started/,
    /warm-up\.done: The offline-pack manifest answered 200 after 1 attempt\(s\), \d+ ms/,
    /startup\.warm-up\.background\.step\.done: Background warm-up step offline-pack done in \d+ ms/,
    /startup\.warm-up\.background\.done: Background warm-up done in \d+ ms/,
  ].map(at);
  // The star catalogue of the sky annotations runs beside the others, in the
  // background: missing, and the download is off here, so the step says so
  // instead of fetching 34 MB.
  assert.match(
    output,
    /Background warm-up step hyg-catalogue done in \d+ ms \(missing, download switched off/,
  );
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
    "the steps ran in this order",
  );
  // The catalogue step's own lines: start, end and duration of each part; the
  // media check starts with the load and is told over in the background.
  for (const pattern of [
    /catalogue\.sync\.start: /,
    /catalogue\.sync\.done: .* \d+ ms/,
    /catalogue\.load\.done: The catalogue was loaded in \d+ ms/,
    /catalogue\.media\.start: /,
    /catalogue\.media\.done: The media check took \d+ ms/,
    /startup\.warm-up\.background\.step\.done: Background warm-up step media done in \d+ ms/,
  ])
    at(pattern);
  assert.ok(
    at(/catalogue\.media\.start: /) <
      at(/startup\.warm-up\.done: Warm-up done/),
    "the media check is begun before ready",
  );
  // The slow read's duration is the one the log shows.
  const readMs = Number(
    /planner-read: \/api\/planner-targets answered 200 in (\d+) ms/.exec(
      output,
    )[1],
  );
  assert.ok(readMs >= SLOW_READ_MS * 0.9, `planner read logged ${readMs} ms`);
  // The application never sees the warm-up's header.
  assert.ok(!/warm-up-header=present/.test(output), output);
  assert.match(output, /REQUEST \/api\/v1\/offline-pack warm-up-header=absent/);

  started.child.kill("SIGTERM");
  assert.equal(await started.exited, 0, output);
});

test("an offline pack still being computed does not hold ready: it is asked for in the background, and the log says so", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "astro-warm-up-pack-"));
  // The pack's route answers 503 + Retry-After for 6 s after the start, as the
  // real one does while it waits for the stored texts' import and computes.
  const started = await startService(root, {
    WARM_UP_PACK_PREPARING_MS: "6000",
    WARM_UP_SLOW_FIRST_READ_MS: "0",
  });
  t.after(async () => {
    started.child.kill("SIGKILL");
    await rm(root, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${await started.port}`;
  await waitFor(
    async () => (await ask(origin, "/readyz"))?.status === 200,
    "/readyz 200",
  );
  // Ready while the pack is still being computed: nothing waited for it.
  let output = started.output();
  assert.match(output, /server\.ready: Ready/);
  assert.doesNotMatch(
    output,
    /Background warm-up step offline-pack done/,
    "the pack is not over yet when the service is ready",
  );
  assert.match(
    output,
    /startup\.warm-up\.done: Warm-up done in \d+ ms \(catalogue \d+ ms, planner-reads \d+ ms\)/,
  );
  // The application serves its routes meanwhile (the pack's own route answers
  // its documented 503 + Retry-After, which a phone waits out).
  const route = await ask(origin, "/api/planner-targets");
  assert.equal(route.status, 200);
  const pack = await ask(origin, "/api/v1/offline-pack");
  assert.equal(pack.status, 503);
  assert.equal(pack.headers.get("retry-after"), "2");
  // Then the background warm-up asks again and says it is over, with its
  // duration and the waits it went through.
  await waitFor(
    () => /startup\.warm-up\.background\.done/.test(started.output()),
    "the background warm-up's end",
    30_000,
  );
  output = started.output();
  assert.match(
    output,
    /warm-up\.waiting: The offline-pack manifest answered 503 \(attempt 1 of 20, \d+ ms\)/,
  );
  assert.match(
    output,
    /Background warm-up step offline-pack done in \d{4,} ms \(answered 200\)/,
  );
  assert.ok(
    output.indexOf("server.ready: Ready") <
      output.indexOf("Background warm-up step offline-pack done"),
    "the pack's end is told after ready",
  );
  started.child.kill("SIGTERM");
  assert.equal(await started.exited, 0, output);
});

test("a warm-up that outlasts its budget lets the service be ready anyway, and says so", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "astro-warm-up-budget-"));
  const started = await startService(root, {
    WARM_UP_SLOW_FIRST_READ_MS: "20000",
    ASTRO_PORTAL_WARMUP_BUDGET_SECONDS: "2",
    ASTRO_PORTAL_OFFLINE_PACK_WARMUP: "off",
  });
  t.after(async () => {
    started.child.kill("SIGKILL");
    await rm(root, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${await started.port}`;
  const waited = await waitFor(
    async () => (await ask(origin, "/readyz"))?.status === 200,
    "/readyz 200 after the budget",
    30_000,
  );
  assert.ok(waited < 15_000, `ready after ${Math.round(waited)} ms`);
  assert.match(
    started.output(),
    /startup\.warm-up\.budget: Warm-up still running after \d+ ms \(budget 2000 ms\): ready anyway/,
  );
  started.child.kill("SIGTERM");
  await started.exited;
});

test("a stop during the warm-up exits at once", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "astro-warm-up-stop-"));
  const started = await startService(root, {
    WARM_UP_SLOW_FIRST_READ_MS: "20000",
  });
  t.after(async () => {
    started.child.kill("SIGKILL");
    await rm(root, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${await started.port}`;
  await waitFor(
    () => /REQUEST \/api\/planner-targets/.test(started.output()),
    "the slow planner read",
  );
  assert.equal((await ask(origin, "/readyz")).status, 503);
  started.child.kill("SIGTERM");
  assert.equal(await started.exited, 0, started.output());
});
