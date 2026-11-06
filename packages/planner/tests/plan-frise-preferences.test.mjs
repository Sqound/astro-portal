import assert from "node:assert/strict";
import test from "node:test";

import {
  planTargetViews,
  readTargetView,
  subscribeTargetView,
  targetViewStorageKey as friseViewStorageKey,
  writeTargetView,
} from "planner/plan-frise-preferences.js";

// The browser's choice of how a plan shows its targets — compact (the
// labels), details or frise, for "Cette nuit", Planifier and "Tous les
// plans" alike.

const memoryStore = () => {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
};
const throwingStore = () => ({
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
});

test("one key, three values, compact (the labels) by default", () => {
  assert.equal(friseViewStorageKey, "astro-portal:plans:target-view:v1");
  assert.deepEqual(planTargetViews, ["compact", "details", "frise"]);
  assert.equal(readTargetView(memoryStore()), "compact");
  assert.equal(readTargetView(null), "compact");
});

test("a choice is written under that key and read back, both ways", () => {
  const storage = memoryStore();
  assert.equal(writeTargetView("frise", storage), true);
  assert.deepEqual([...storage.values.keys()], [friseViewStorageKey]);
  assert.equal(readTargetView(storage), "frise");
  assert.equal(writeTargetView("compact", storage), true);
  assert.equal(readTargetView(storage), "compact");
  // Whatever else is in the store means compact.
  storage.values.set(friseViewStorageKey, "yes");
  assert.equal(readTargetView(storage), "compact");
});

test("a store that throws gives labels and a failed write", () => {
  assert.equal(readTargetView(throwingStore()), "compact");
  assert.equal(writeTargetView("frise", throwingStore()), false);
  assert.equal(writeTargetView("frise", null), false);
});

test("a listener hears a write of this page and a storage event of another tab, until it stops", () => {
  const storage = memoryStore();
  const tabs = new EventTarget();
  let heard = 0;
  const stop = subscribeTargetView(() => (heard += 1), tabs);
  writeTargetView("frise", storage);
  assert.equal(heard, 1);
  tabs.dispatchEvent(
    Object.assign(new Event("storage"), { key: friseViewStorageKey }),
  );
  assert.equal(heard, 2);
  // Another key of the browser is not ours; a cleared store (key null) is.
  tabs.dispatchEvent(Object.assign(new Event("storage"), { key: "other" }));
  assert.equal(heard, 2);
  tabs.dispatchEvent(Object.assign(new Event("storage"), { key: null }));
  assert.equal(heard, 3);
  stop();
  writeTargetView("compact", storage);
  tabs.dispatchEvent(
    Object.assign(new Event("storage"), { key: friseViewStorageKey }),
  );
  assert.equal(heard, 3);
  // A failed write tells nobody.
  const again = subscribeTargetView(() => (heard += 1), tabs);
  writeTargetView("frise", throwingStore());
  assert.equal(heard, 3);
  again();
});

test("each of the three values is kept and read back", () => {
  const storage = memoryStore();
  for (const view of planTargetViews) {
    assert.equal(writeTargetView(view, storage), true);
    assert.equal(storage.values.get(friseViewStorageKey), view);
    assert.equal(readTargetView(storage), view);
  }
  // A value outside the three is refused and leaves the choice as it was.
  assert.equal(writeTargetView("mosaic", storage), false);
  assert.equal(readTargetView(storage), "frise");
});
