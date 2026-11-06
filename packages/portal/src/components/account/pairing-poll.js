/**
 * Drives "has this pairing code been claimed yet?" polling for the account
 * page's pairing panel (the web pairing page should
 * update itself as soon as that pairing is done). Kept
 * framework-agnostic and independent of `fetch`/`document` so it is testable
 * with a fake clock and no DOM (`packages/portal/tests/pairing-poll.test.mjs`)
 * — the React component (`AccountPage.js`) owns wiring it to
 * `visibilitychange`/unmount and to the actual network call.
 *
 * Every stop condition the account page needs collapses to exactly one of:
 * `stop()` called directly (panel closed, tab hidden, unmount), the code's
 * own expiry (checked against the injected clock before every tick,
 * including the first), or `checkClaimed` resolving `true`. Whichever comes
 * first cancels the one live timer and calling `start()` again while
 * already running is a no-op — there is never a second timer ticking
 * alongside the first.
 */
export function createPairingPoller({
  intervalMs = 2500,
  now = () => Date.now(),
  scheduleTick = (fn, ms) => setTimeout(fn, ms),
  cancelTick = (handle) => clearTimeout(handle),
  checkClaimed,
  onClaimed = () => {},
  onExpired = () => {},
} = {}) {
  let handle = null;
  let expiresAtMs = null;
  let running = false;

  function stop() {
    running = false;
    if (handle != null) {
      cancelTick(handle);
      handle = null;
    }
  }

  async function tick() {
    handle = null;
    if (!running) return;
    if (now() >= expiresAtMs) {
      stop();
      onExpired();
      return;
    }
    let claimed = false;
    try {
      claimed = Boolean(await checkClaimed());
    } catch {
      // A transient network failure is not "expired" or "claimed": just
      // try again on the next tick rather than tearing down the poller.
      claimed = false;
    }
    // The poller may have been stopped (panel closed, tab hidden, unmount)
    // while `checkClaimed` was in flight — never resurrect it here.
    if (!running) return;
    if (claimed) {
      stop();
      onClaimed();
      return;
    }
    if (now() >= expiresAtMs) {
      stop();
      onExpired();
      return;
    }
    handle = scheduleTick(tick, intervalMs);
  }

  return {
    /** No-op while already running — never a second concurrent timer. */
    start(expiresAt) {
      if (running) return;
      expiresAtMs = new Date(expiresAt).getTime();
      running = true;
      handle = scheduleTick(tick, intervalMs);
    },
    stop,
    get isRunning() {
      return running;
    },
  };
}
