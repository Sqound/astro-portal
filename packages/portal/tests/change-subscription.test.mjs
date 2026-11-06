import assert from "node:assert/strict";
import test from "node:test";
import {
  CHANGE_SIGNAL_EVENT,
  clientInstanceHeaders,
  clientInstanceId,
  startChangeSubscription,
} from "../dist/planner/change-subscription.js";

/**
 * 10's web transport: an `EventSource` opened only while the tab is
 * visible, closed otherwise, that dispatches `CHANGE_SIGNAL_EVENT` on
 * `window` for every `change`/`resync` server-sent event and nothing else
 * (no business data ever rides the channel — rule 4 of the phase plan). No
 * real browser exists in this `node --test` run, so `EventSource`/`window`/
 * `document` are stubbed and injected explicitly.
 */

class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    this.closed = false;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
  close() {
    this.closed = true;
  }
  emit(type) {
    for (const listener of this.listeners.get(type) || []) listener({ type });
  }
}
FakeEventSource.instances = [];

function fakeBrowser({ visible = true } = {}) {
  FakeEventSource.instances = [];
  const win = new EventTarget();
  win.Event = Event;
  const doc = new EventTarget();
  doc.visibilityState = visible ? "visible" : "hidden";
  return { win, doc };
}

test("opens only while the tab is visible, and closes on hidden", () => {
  const { win, doc } = fakeBrowser({ visible: false });
  const stop = startChangeSubscription({
    EventSourceImpl: FakeEventSource,
    win,
    doc,
  });
  assert.equal(FakeEventSource.instances.length, 0, "hidden tab opens nothing");

  doc.visibilityState = "visible";
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(FakeEventSource.instances.length, 1);
  const source = FakeEventSource.instances[0];
  assert.match(source.url, /^\/api\/v1\/changes\?client=/);
  assert.equal(source.closed, false);

  doc.visibilityState = "hidden";
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(source.closed, true, "leaving the tab closes the connection");

  // Coming back reopens a fresh connection rather than reusing the closed one.
  doc.visibilityState = "visible";
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(FakeEventSource.instances.length, 2);
  assert.equal(FakeEventSource.instances[1].closed, false);

  stop();
  assert.equal(FakeEventSource.instances[1].closed, true, "stop() closes too");
});

test("a tab brought back to the front signals once, so it reads what it missed", () => {
  const { win, doc } = fakeBrowser({ visible: true });
  const received = [];
  win.addEventListener(CHANGE_SIGNAL_EVENT, (event) => received.push(event));
  const stop = startChangeSubscription({
    EventSourceImpl: FakeEventSource,
    win,
    doc,
  });
  assert.equal(received.length, 0, "the first opening signals nothing");

  doc.visibilityState = "hidden";
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(received.length, 0, "leaving signals nothing");

  doc.visibilityState = "visible";
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(received.length, 1, "coming back signals once");
  // A second `visible` with the channel already open signals nothing more.
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(received.length, 1);
  stop();
});

test("a change or resync frame dispatches CHANGE_SIGNAL_EVENT on window, carrying no data", () => {
  const { win, doc } = fakeBrowser({ visible: true });
  const received = [];
  win.addEventListener(CHANGE_SIGNAL_EVENT, (event) => received.push(event));
  const stop = startChangeSubscription({
    EventSourceImpl: FakeEventSource,
    win,
    doc,
  });
  const source = FakeEventSource.instances[0];

  source.emit("change");
  source.emit("resync");
  assert.equal(received.length, 2);
  // Rule 4 of the phase plan: the channel carries no business data — the
  // dispatched signal is a plain Event with nothing attached to it.
  for (const event of received) {
    assert.equal(event.type, CHANGE_SIGNAL_EVENT);
    assert.equal("domains" in event, false);
    assert.equal("cursor" in event, false);
  }

  stop();
});

test("stop() stops reopening on a later visibility change", () => {
  const { win, doc } = fakeBrowser({ visible: true });
  const stop = startChangeSubscription({
    EventSourceImpl: FakeEventSource,
    win,
    doc,
  });
  assert.equal(FakeEventSource.instances.length, 1);
  stop();
  assert.equal(FakeEventSource.instances[0].closed, true);

  doc.visibilityState = "hidden";
  doc.dispatchEvent(new Event("visibilitychange"));
  doc.visibilityState = "visible";
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(
    FakeEventSource.instances.length,
    1,
    "a stopped subscription never reopens",
  );
});

test("startChangeSubscription is a no-op without EventSource/window/document", () => {
  const stop = startChangeSubscription({
    EventSourceImpl: null,
    win: null,
    doc: null,
  });
  assert.equal(typeof stop, "function");
  stop(); // must not throw
});

test("clientInstanceId is stable within the process and rides both the query string and the write header", () => {
  const id = clientInstanceId();
  assert.equal(clientInstanceId(), id);
  assert.deepEqual(clientInstanceHeaders(), { "X-Astro-Client-Instance": id });

  const { win, doc } = fakeBrowser({ visible: true });
  const stop = startChangeSubscription({
    EventSourceImpl: FakeEventSource,
    win,
    doc,
  });
  assert.equal(
    FakeEventSource.instances[0].url,
    `/api/v1/changes?client=${encodeURIComponent(id)}`,
  );
  stop();
});
