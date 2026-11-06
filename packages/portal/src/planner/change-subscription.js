"use client";

/**
 * Web side of the reactive change signal (a separate, revertible module). The web
 * keeps its structure: it already reads the server on load, on reconnect
 * (`online`) and, for the Journal, on tab focus/visibility
 * (`SessionsAutoRefresh.js`). This module only makes those existing paths
 * run sooner, by listening to `GET /api/v1/changes` and firing
 * `CHANGE_SIGNAL_EVENT` on `window` — it carries no business data of its own and
 * holds no synchronization logic: whoever listens for the event reruns ITS OWN
 * already-tested resync path (`validSavedState`/ `repairPlannerDocument` for the
 * planner, `router.refresh()` for the Journal). Removing every call into this
 * module restores exactly the behaviour without the signal.
 */

// Dispatched on `window` whenever the change channel reports a `change` or a
// `resync` frame. Not planner-specific: the Journal listens for it too.
import { randomUuid } from "../random-uuid.js";
export const CHANGE_SIGNAL_EVENT = "astro:change-signal";

let cachedClientInstanceId = null;

/**
 * A random id identifying this tab's current page load (the
 * `clientInstanceId`), lazily generated once and reused by every caller in
 * this same JS realm for the lifetime of the page — the planner's autosave,
 * the Journal's debrief writes and this module's own `?client=` all need
 * the SAME id, or the server could never withhold this tab's own signal
 * from itself. A full page reload draws a fresh id, which only means this
 * tab's very next write is (harmlessly) echoed back to itself once.
 */
export function clientInstanceId() {
  if (!cachedClientInstanceId) cachedClientInstanceId = randomUuid();
  return cachedClientInstanceId;
}

/**
 * Headers to spread into every write `fetch` the web makes (the planner's
 * autosave, the favorites toggle, the Journal's `/v1` decisions): the
 * server records this instance as the write's origin so the channel never
 * echoes the signal back to the tab that caused it.
 */
export function clientInstanceHeaders() {
  return { "X-Astro-Client-Instance": clientInstanceId() };
}

/**
 * Opens (only while the tab is visible) an `EventSource` on
 * `GET /api/v1/changes`, same origin, session cookie included automatically.
 * Every `change` or `resync` server-sent event dispatches
 * `CHANGE_SIGNAL_EVENT` on `window` — never anything about which domains
 * changed ("no business data ever rides this channel"): a caller that cares about domains is not this module's
 * business, since the only two callers here (the planner, the Journal) both
 * just reread everything they own regardless.
 *
 * A tab that comes back to the front dispatches one signal of its own: the
 * channel was closed while it was away, so what was written meanwhile is read
 * again.
 *
 * `EventSourceImpl`/`win`/`doc` are only ever overridden by tests: in a
 * browser this always runs against the real globals. When any of them is
 * unavailable (a non-browser render, a test with no DOM), this is a no-op
 * that returns a no-op `stop` — the channel is never required (rule 5).
 *
 * Returns a `stop()` function that closes the connection and stops
 * reopening it on visibility changes.
 */
export function startChangeSubscription({
  EventSourceImpl = typeof EventSource !== "undefined" ? EventSource : null,
  win = typeof window !== "undefined" ? window : null,
  doc = typeof document !== "undefined" ? document : null,
} = {}) {
  if (!EventSourceImpl || !win || !doc) return () => {};

  let source = null;
  let stopped = false;

  function signalChange() {
    try {
      win.dispatchEvent(new win.Event(CHANGE_SIGNAL_EVENT));
    } catch {
      // A plain Event should never throw. Nothing useful to do if a test
      // stub's `win` does not implement it fully.
    }
  }

  function open() {
    if (stopped || source) return;
    const url = `/api/v1/changes?client=${encodeURIComponent(clientInstanceId())}`;
    source = new EventSourceImpl(url);
    source.addEventListener("change", signalChange);
    source.addEventListener("resync", signalChange);
    // A transport-level error (network blip, server restart, a 401 while
    // signed out) needs no handling here: `EventSource` retries on its own
    // using the `retry:` value the route sends, and this channel is never
    // required for the app to work (rule 5) — silence is correct.
  }

  function close() {
    if (!source) return;
    source.removeEventListener("change", signalChange);
    source.removeEventListener("resync", signalChange);
    source.close();
    source = null;
  }

  function onVisibilityChange() {
    if (doc.visibilityState === "visible") {
      // A tab brought back to the front has had no channel while it was away,
      // and a signal sent meanwhile is lost: it asks its owners to read again
      // once, so a page left open never keeps a stale copy under
      // « Synchronisé ».
      const wasAway = !source && !stopped;
      open();
      if (wasAway) signalChange();
    } else close();
  }

  if (doc.visibilityState === "visible") open();
  doc.addEventListener("visibilitychange", onVisibilityChange);

  return function stop() {
    stopped = true;
    doc.removeEventListener("visibilitychange", onVisibilityChange);
    close();
  };
}
