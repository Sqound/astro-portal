import assert from "node:assert/strict";
import test from "node:test";
import { createPairingPoller } from "../src/components/account/pairing-poll.js";

/** A fake clock plus a fake `setTimeout`/`clearTimeout` pair: `scheduled`
 * records every pending call so a test can fire it manually with `fire()`,
 * and `advance(ms)` moves the fake clock without touching real timers. */
function fakeClock(startMs = 0) {
  let currentMs = startMs;
  let nextHandle = 1;
  const scheduled = new Map();
  return {
    now: () => currentMs,
    advance(ms) {
      currentMs += ms;
    },
    scheduleTick: (fn, ms) => {
      const handle = nextHandle++;
      scheduled.set(handle, { fn, ms });
      return handle;
    },
    cancelTick: (handle) => {
      scheduled.delete(handle);
    },
    pendingCount: () => scheduled.size,
    /** Fires the single pending call, if there is exactly one. */
    async fire() {
      assert.equal(scheduled.size, 1, "expected exactly one pending tick");
      const [[handle, { fn }]] = scheduled;
      scheduled.delete(handle);
      await fn();
    },
  };
}

test("start schedules exactly one tick, at the configured interval", () => {
  const clock = fakeClock();
  const poller = createPairingPoller({
    intervalMs: 2500,
    now: clock.now,
    scheduleTick: clock.scheduleTick,
    cancelTick: clock.cancelTick,
    checkClaimed: async () => false,
  });

  poller.start(new Date(1_000_000).toISOString());

  assert.equal(clock.pendingCount(), 1);
  assert.equal(poller.isRunning, true);
});

test("calling start twice never schedules a second timer", () => {
  const clock = fakeClock();
  const poller = createPairingPoller({
    now: clock.now,
    scheduleTick: clock.scheduleTick,
    cancelTick: clock.cancelTick,
    checkClaimed: async () => false,
  });

  poller.start(new Date(1_000_000).toISOString());
  poller.start(new Date(1_000_000).toISOString());
  poller.start(new Date(1_000_000).toISOString());

  assert.equal(clock.pendingCount(), 1);
});

test("each unclaimed, unexpired tick reschedules exactly one further tick", async () => {
  const clock = fakeClock(0);
  let checks = 0;
  const poller = createPairingPoller({
    intervalMs: 2500,
    now: clock.now,
    scheduleTick: clock.scheduleTick,
    cancelTick: clock.cancelTick,
    checkClaimed: async () => {
      checks += 1;
      return false;
    },
  });

  poller.start(new Date(300_000).toISOString());
  await clock.fire();
  assert.equal(checks, 1);
  assert.equal(
    clock.pendingCount(),
    1,
    "exactly one tick pending, not zero or two",
  );

  await clock.fire();
  assert.equal(checks, 2);
  assert.equal(clock.pendingCount(), 1);
});

test("stops and calls onClaimed the moment checkClaimed reports success, scheduling nothing further", async () => {
  const clock = fakeClock(0);
  let claimed = false;
  let expired = false;
  const poller = createPairingPoller({
    now: clock.now,
    scheduleTick: clock.scheduleTick,
    cancelTick: clock.cancelTick,
    checkClaimed: async () => true,
    onClaimed: () => {
      claimed = true;
    },
    onExpired: () => {
      expired = true;
    },
  });

  poller.start(new Date(300_000).toISOString());
  await clock.fire();

  assert.equal(claimed, true);
  assert.equal(expired, false);
  assert.equal(poller.isRunning, false);
  assert.equal(clock.pendingCount(), 0, "no timer survives a successful claim");
});

test("stops and calls onExpired once the clock passes expiresAt, without ever calling checkClaimed again", async () => {
  const clock = fakeClock(0);
  let checks = 0;
  let expired = false;
  const poller = createPairingPoller({
    intervalMs: 2500,
    now: clock.now,
    scheduleTick: clock.scheduleTick,
    cancelTick: clock.cancelTick,
    checkClaimed: async () => {
      checks += 1;
      return false;
    },
    onExpired: () => {
      expired = true;
    },
  });

  // Expires in 5 seconds; the interval is 2.5 seconds.
  poller.start(new Date(5_000).toISOString());
  clock.advance(2_500);
  await clock.fire(); // first tick: not expired yet, still short of 5s
  assert.equal(checks, 1);
  assert.equal(expired, false);

  clock.advance(2_500); // clock now reads 5_000 == expiresAt
  await clock.fire(); // second tick: expired, checked before calling checkClaimed
  assert.equal(checks, 1, "checkClaimed is never called once expired");
  assert.equal(expired, true);
  assert.equal(poller.isRunning, false);
  assert.equal(clock.pendingCount(), 0, "no timer survives expiry");
});

test("expiry is checked even on the very first tick", async () => {
  const clock = fakeClock(10_000);
  let checks = 0;
  let expired = false;
  const poller = createPairingPoller({
    now: clock.now,
    scheduleTick: clock.scheduleTick,
    cancelTick: clock.cancelTick,
    checkClaimed: async () => {
      checks += 1;
      return false;
    },
    onExpired: () => {
      expired = true;
    },
  });

  // Already expired by the time the pairing panel even starts polling
  // (e.g. a slow network response for the creation call itself).
  poller.start(new Date(1_000).toISOString());
  await clock.fire();

  assert.equal(checks, 0);
  assert.equal(expired, true);
  assert.equal(clock.pendingCount(), 0);
});

test("stop() cancels a pending timer and leaves nothing behind", () => {
  const clock = fakeClock();
  const poller = createPairingPoller({
    now: clock.now,
    scheduleTick: clock.scheduleTick,
    cancelTick: clock.cancelTick,
    checkClaimed: async () => false,
  });

  poller.start(new Date(1_000_000).toISOString());
  assert.equal(clock.pendingCount(), 1);

  poller.stop();

  assert.equal(clock.pendingCount(), 0);
  assert.equal(poller.isRunning, false);
});

test("a checkClaimed that resolves after stop() was called does not restart the loop", async () => {
  const clock = fakeClock(0);
  let claimedCalls = 0;
  let resolveCheck;
  const poller = createPairingPoller({
    now: clock.now,
    scheduleTick: clock.scheduleTick,
    cancelTick: clock.cancelTick,
    checkClaimed: () =>
      new Promise((resolve) => {
        resolveCheck = resolve;
      }),
    onClaimed: () => {
      claimedCalls += 1;
    },
  });

  poller.start(new Date(300_000).toISOString());
  const tickPromise = clock.fire();
  poller.stop();
  resolveCheck(true);
  await tickPromise;

  assert.equal(
    claimedCalls,
    0,
    "a stale in-flight check must not fire onClaimed",
  );
  assert.equal(clock.pendingCount(), 0);
  assert.equal(poller.isRunning, false);
});

test("a checkClaimed rejection is treated as unclaimed and keeps polling", async () => {
  const clock = fakeClock(0);
  let checks = 0;
  const poller = createPairingPoller({
    intervalMs: 2500,
    now: clock.now,
    scheduleTick: clock.scheduleTick,
    cancelTick: clock.cancelTick,
    checkClaimed: async () => {
      checks += 1;
      throw new Error("network hiccup");
    },
  });

  poller.start(new Date(300_000).toISOString());
  await clock.fire();

  assert.equal(checks, 1);
  assert.equal(poller.isRunning, true);
  assert.equal(clock.pendingCount(), 1);
});
