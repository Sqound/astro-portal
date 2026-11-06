import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

/**
 * `LISTEN`/`NOTIFY` between processes sharing one PostgreSQL database.
 * Each process owns exactly one module-level bus (`tenants` map,
 * `postgresBridge` singleton) by design (`change-bus.js`'s own module
 * note) — to exercise "two processes" from a single Node test process,
 * this file imports the compiled module twice under two distinct
 * specifiers (a `?instance=` query string), which Node's ESM loader always
 * treats as two separate module instances, each with its own module-level
 * state. That is the whole reason this lives in its own file rather than
 * `change-bus.test.mjs`: importing the module twice there would also give
 * the ordinary in-process tests two independent copies of `_resetForTests`
 * et al., which is not what they want.
 */

const databaseUrl = process.env.ASTRO_PORTAL_TEST_DATABASE_URL || null;

function requireTestDatabaseUrl() {
  if (!databaseUrl)
    throw new Error("ASTRO_PORTAL_TEST_DATABASE_URL is required.");
  if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(databaseUrl))
    throw new Error(
      "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
    );
  return databaseUrl;
}

const moduleUrl = new URL("../dist/api/change-bus.js", import.meta.url);

async function importIndependentBus(instanceLabel) {
  const specifier = `${moduleUrl.href}?instance=${instanceLabel}`;
  return await import(specifier);
}

async function waitUntil(predicate, { timeoutMs = 10_000, stepMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await delay(stepMs);
  }
  return false;
}

const skip = databaseUrl ? false : "ASTRO_PORTAL_TEST_DATABASE_URL is not set";

test(
  "two bus instances sharing one PostgreSQL database relay each other's publishChange calls",
  { skip, timeout: 30_000 },
  async () => {
    const url = requireTestDatabaseUrl();
    const busA = await importIndependentBus("relay-a");
    const busB = await importIndependentBus("relay-b");
    try {
      await Promise.all([
        busA.startPostgresBridge({ databaseUrl: url }),
        busB.startPostgresBridge({ databaseUrl: url }),
      ]);
      assert.equal(
        await waitUntil(() => busA._postgresBridgeConnectedForTests()),
        true,
        "bus A should be LISTENing",
      );
      assert.equal(
        await waitUntil(() => busB._postgresBridgeConnectedForTests()),
        true,
        "bus B should be LISTENing",
      );

      const tenantId = "relay-tenant-1";
      const receivedByB = [];
      busB.subscribe(tenantId, (event) => receivedByB.push(event));

      const published = busA.publishChange({
        tenantId,
        domains: ["plans"],
      });

      await waitUntil(() => receivedByB.length > 0);
      assert.equal(receivedByB.length, 1);
      assert.equal(receivedByB[0].kind, "change");
      assert.deepEqual(receivedByB[0].domains, ["plans"]);
      // B mints its OWN cursor for a relayed event — it never reuses A's
      // boot-scoped cursor, which would be meaningless in B's own sequence
      // space.
      assert.notEqual(receivedByB[0].cursor, published.cursor);

      // A must never receive its own emission back from PostgreSQL: each
      // NOTIFY payload carries the emitting bridge's own id, and a bridge
      // ignores a notification carrying its own id.
      const receivedByA = [];
      busA.subscribe(tenantId, (event) => receivedByA.push(event));
      busA.publishChange({ tenantId, domains: ["sessions"] });
      await waitUntil(() => receivedByA.length > 0);
      assert.equal(
        receivedByA.length,
        1,
        "only the local delivery, never an echo",
      );
    } finally {
      await busA.stopPostgresBridge();
      await busB.stopPostgresBridge();
    }
  },
);

test(
  "a simulated LISTEN disconnect reconnects and resyncs every locally subscribed tenant",
  { skip, timeout: 30_000 },
  async () => {
    const url = requireTestDatabaseUrl();
    const bus = await importIndependentBus("reconnect");
    try {
      await bus.startPostgresBridge({ databaseUrl: url });
      assert.equal(
        await waitUntil(() => bus._postgresBridgeConnectedForTests()),
        true,
        "bridge should be LISTENing before the simulated cut",
      );

      const tenantId = "reconnect-tenant-1";
      const received = [];
      bus.subscribe(tenantId, (event) => received.push(event));

      bus._simulateDisconnectForTests();
      assert.equal(
        await waitUntil(() => !bus._postgresBridgeConnectedForTests()),
        true,
        "bridge should observe the cut",
      );
      assert.equal(
        await waitUntil(() => bus._postgresBridgeConnectedForTests(), {
          timeoutMs: 20_000,
        }),
        true,
        "bridge should reconnect on its own bounded backoff",
      );

      await waitUntil(() => received.some((event) => event.kind === "resync"));
      const resyncEvent = received.find((event) => event.kind === "resync");
      assert.ok(
        resyncEvent,
        "reconnecting must resync every subscribed tenant",
      );
      assert.equal(Object.hasOwn(resyncEvent, "domains"), false);
    } finally {
      await bus.stopPostgresBridge();
    }
  },
);
