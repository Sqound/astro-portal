import assert from "node:assert/strict";
import test from "node:test";
import {
  _deliverResyncForTests,
  _resetForTests,
  publishChange,
  replaySince,
  startPostgresBridge,
  subscribe,
} from "../dist/api/change-bus.js";

test.beforeEach(() => {
  _resetForTests();
});

test("publishChange delivers a change event to a subscriber of the same tenant", () => {
  const received = [];
  const unsubscribe = subscribe("tenant-1", (event) => received.push(event));
  const event = publishChange({ tenantId: "tenant-1", domains: ["plans"] });
  unsubscribe();

  assert.equal(received.length, 1);
  assert.equal(received[0].kind, "change");
  assert.equal(received[0].cursor, event.cursor);
  assert.deepEqual(received[0].domains, ["plans"]);
  assert.equal(received[0].originClientInstanceId, null);
});

test("the cursor is <boot>:<n>, increasing per tenant and starting at 0", () => {
  const first = publishChange({ tenantId: "tenant-1", domains: ["plans"] });
  const second = publishChange({ tenantId: "tenant-1", domains: ["sessions"] });
  const otherTenantFirst = publishChange({
    tenantId: "tenant-2",
    domains: ["plans"],
  });

  const [firstBoot, firstSeq] = first.cursor.split(":");
  const [secondBoot, secondSeq] = second.cursor.split(":");
  const [otherBoot, otherSeq] = otherTenantFirst.cursor.split(":");

  assert.equal(firstBoot, secondBoot);
  assert.equal(firstBoot, otherBoot);
  assert.equal(firstSeq, "0");
  assert.equal(secondSeq, "1");
  // A second tenant has its own sequence, independent of the first.
  assert.equal(otherSeq, "0");
});

test("publishChange rejects an empty or unknown domain, and a missing tenantId", () => {
  assert.throws(() => publishChange({ tenantId: "tenant-1", domains: [] }));
  assert.throws(() =>
    publishChange({ tenantId: "tenant-1", domains: ["catalogue"] }),
  );
  assert.throws(() => publishChange({ domains: ["plans"] }));
});

test("originClientInstanceId rides the in-memory event, defaulting to null", () => {
  const withInstance = publishChange({
    tenantId: "tenant-1",
    domains: ["plans"],
    originClientInstanceId: "instance-a",
  });
  assert.equal(withInstance.originClientInstanceId, "instance-a");

  const withoutInstance = publishChange({
    tenantId: "tenant-1",
    domains: ["plans"],
  });
  assert.equal(withoutInstance.originClientInstanceId, null);
});

test("the buffer retains only the last 256 events per tenant, oldest evicted first", () => {
  let last;
  for (let index = 0; index < 300; index += 1)
    last = publishChange({ tenantId: "tenant-1", domains: ["plans"] });

  // The most recent event is always replayable...
  const replay = replaySince("tenant-1", last.cursor);
  assert.equal(replay.resync, false);
  assert.deepEqual(replay.events, []);

  // ...but a cursor issued before the retained window is unknown: resync.
  const evictedCursor = `${last.cursor.split(":")[0]}:0`;
  const evictedReplay = replaySince("tenant-1", evictedCursor);
  assert.equal(evictedReplay.resync, true);
});

test("replaySince replays every event strictly after the given cursor", () => {
  const first = publishChange({ tenantId: "tenant-1", domains: ["plans"] });
  const second = publishChange({
    tenantId: "tenant-1",
    domains: ["sessions"],
  });
  const third = publishChange({ tenantId: "tenant-1", domains: ["debrief"] });

  const replay = replaySince("tenant-1", first.cursor);
  assert.equal(replay.resync, false);
  assert.deepEqual(replay.events, [
    { cursor: second.cursor, domains: ["sessions"] },
    { cursor: third.cursor, domains: ["debrief"] },
  ]);

  // Replaying from the newest known cursor yields nothing further.
  const noneLeft = replaySince("tenant-1", third.cursor);
  assert.deepEqual(noneLeft.events, []);
});

test("replaySince answers resync for an unknown cursor: another boot, or never issued", () => {
  publishChange({ tenantId: "tenant-1", domains: ["plans"] });

  assert.equal(replaySince("tenant-1", "a-different-boot:0").resync, true);
  assert.equal(replaySince("tenant-1", "malformed").resync, true);
  // A tenant that has never published anything: still resync, not a crash.
  assert.equal(replaySince("tenant-without-events", "boot:0").resync, true);
});

test("replaySince with no cursor at all answers the tenant's current buffer, not a resync", () => {
  const first = publishChange({ tenantId: "tenant-1", domains: ["plans"] });
  const replay = replaySince("tenant-1", null);
  assert.equal(replay.resync, false);
  assert.deepEqual(replay.events, [
    { cursor: first.cursor, domains: ["plans"] },
  ]);
});

test("cloisonnement: an event never reaches a subscriber of a different tenant", () => {
  const receivedByTenant1 = [];
  const receivedByTenant2 = [];
  subscribe("tenant-1", (event) => receivedByTenant1.push(event));
  subscribe("tenant-2", (event) => receivedByTenant2.push(event));

  publishChange({ tenantId: "tenant-1", domains: ["plans"] });
  publishChange({ tenantId: "tenant-2", domains: ["sessions"] });

  assert.equal(receivedByTenant1.length, 1);
  assert.deepEqual(receivedByTenant1[0].domains, ["plans"]);
  assert.equal(receivedByTenant2.length, 1);
  assert.deepEqual(receivedByTenant2[0].domains, ["sessions"]);
});

test("cloisonnement: replaySince for one tenant never surfaces another tenant's events", () => {
  const tenant1First = publishChange({
    tenantId: "tenant-1",
    domains: ["plans"],
  });
  // Interleaved writes for a second tenant must never appear in the first
  // tenant's own replay, even though both tenants' sequences share the same
  // boot id and can coincide numerically.
  publishChange({ tenantId: "tenant-2", domains: ["sessions"] });
  publishChange({ tenantId: "tenant-2", domains: ["debrief"] });
  const tenant1Second = publishChange({
    tenantId: "tenant-1",
    domains: ["favorites"],
  });

  const replay = replaySince("tenant-1", tenant1First.cursor);
  assert.equal(replay.resync, false);
  assert.deepEqual(replay.events, [
    { cursor: tenant1Second.cursor, domains: ["favorites"] },
  ]);
});

test("unsubscribe stops further delivery without affecting other subscribers", () => {
  const receivedA = [];
  const receivedB = [];
  const unsubscribeA = subscribe("tenant-1", (event) => receivedA.push(event));
  subscribe("tenant-1", (event) => receivedB.push(event));

  publishChange({ tenantId: "tenant-1", domains: ["plans"] });
  unsubscribeA();
  publishChange({ tenantId: "tenant-1", domains: ["plans"] });

  assert.equal(receivedA.length, 1);
  assert.equal(receivedB.length, 2);
});

// --- SQLite side (no PostgreSQL bridge ever started) ----------

test("with no PostgreSQL bridge started, publishChange behaves exactly as in a mono-process (SQLite) deployment", () => {
  const received = [];
  subscribe("tenant-1", (event) => received.push(event));
  const event = publishChange({ tenantId: "tenant-1", domains: ["plans"] });
  // No bridge means no attempt at a cross-process relay: the only delivery
  // is the local one, exactly as before the bridge existed.
  assert.equal(received.length, 1);
  assert.equal(received[0].cursor, event.cursor);
});

test("startPostgresBridge requires an explicit databaseUrl — it is never inferred", () => {
  assert.throws(() => startPostgresBridge({}));
  assert.throws(() => startPostgresBridge({ databaseUrl: "" }));
});

test("a resync marker carries no domains, reaches every local subscriber, and is itself replayable by Last-Event-ID", () => {
  const received = [];
  subscribe("tenant-1", (event) => received.push(event));
  const resyncEvent = _deliverResyncForTests("tenant-1");

  assert.equal(received.length, 1);
  assert.deepEqual(received[0], { kind: "resync", cursor: resyncEvent.cursor });

  // Replaying from a cursor issued before a later resync surfaces that
  // resync as a bare `{ cursor }` entry, exactly like every other buffered
  // event — never the fuller `{ cursor, domains }` change shape.
  const priorCursor = publishChange({
    tenantId: "tenant-1",
    domains: ["plans"],
  });
  const laterResync = _deliverResyncForTests("tenant-1");
  const replay = replaySince("tenant-1", priorCursor.cursor);
  assert.equal(replay.resync, false);
  assert.deepEqual(replay.events, [{ cursor: laterResync.cursor }]);
});
