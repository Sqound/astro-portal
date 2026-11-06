import assert from "node:assert/strict";
import test from "node:test";
import {
  rebaseOnRevisions,
  revisionsOf,
  servedFormOfUntouchedPlans,
  servedPlanEntries,
  spaceContentKey,
} from "../src/plan-revisions.js";

// The page saves on the revision the service gave it, and writes a plan
// nobody touched as it was served.

const served = {
  plans: [
    { id: "a", revision: 4, name: "Plan A", minAltitude: null, items: [] },
    { id: "b", revision: 2, name: "Plan B", minAltitude: null, items: [] },
  ],
};
// What the screen makes of them: the web's own defaults.
const shown = {
  plans: served.plans.map((plan) => ({ ...plan, minAltitude: 30 })),
};

test("the revisions of a served document, by plan", () => {
  assert.deepEqual(
    [...revisionsOf(served)],
    [
      ["a", 4],
      ["b", 2],
    ],
  );
  assert.equal(revisionsOf(null).size, 0);
  assert.equal(revisionsOf({ plans: [{ id: "x" }] }).size, 0);
});

test("a copy read at an older revision goes out on the one the service gave", () => {
  const copy = {
    plans: [
      { id: "a", revision: 3, name: "Plan A" },
      { id: "b", revision: 5, name: "Plan B" },
      { id: "new", name: "No revision yet" },
    ],
  };
  const rebased = rebaseOnRevisions(
    copy,
    new Map([
      ["a", 4],
      ["b", 2],
      ["new", 1],
    ]),
  );
  assert.deepEqual(
    rebased.plans.map((plan) => [plan.id, plan.revision]),
    [
      ["a", 4],
      // A revision further than the one known stays: the page was told more.
      ["b", 5],
      ["new", 1],
    ],
  );
  // Nothing to change: the very same document.
  assert.equal(rebaseOnRevisions(rebased, new Map([["a", 4]])), rebased);
  assert.equal(rebaseOnRevisions(copy, new Map()), copy);
});

test("a plan nobody touched goes out as it was served, an edited one as it is", () => {
  const entries = servedPlanEntries(served, shown);
  const edited = {
    plans: [
      { ...shown.plans[0], name: "Renamed" },
      { ...shown.plans[1], revision: 3 },
    ],
  };
  const out = servedFormOfUntouchedPlans(edited, entries);
  assert.equal(out.plans[0].name, "Renamed", "the edited plan is as edited");
  assert.deepEqual(out.plans[1], served.plans[1], "the other is as served");
  assert.equal(
    servedFormOfUntouchedPlans(shown, new Map()),
    shown,
    "no entries, no change",
  );
});

// PORTAL-SYNC-LOOP-01: an executed plan the page completed (the snapshot of a
// target the phone keeps by its id) is, for the service, the plan it served;
// the page compared the space in the screen's form and wrote it back at every
// reading of the space.
const servedHistory = {
  plans: [
    {
      id: "done",
      revision: 3,
      status: "executed",
      nightId: null,
      minAltitude: null,
      items: [{ id: "openngc-ic0348", title: "IC 348" }],
    },
    { id: "todo", revision: 1, status: "pending", nightId: null, items: [] },
  ],
};
const shownHistory = {
  plans: servedHistory.plans.map((plan) => ({
    ...plan,
    nightId: `night-${plan.id}`,
    minAltitude: 30,
  })),
};
const completed = (document) => ({
  ...document,
  plans: document.plans.map((plan) =>
    plan.id === "done"
      ? {
          ...plan,
          items: plan.items.map((item) => ({
            ...item,
            target: { id: item.id, coordinate: { ra: 56.13, dec: 32.16 } },
          })),
        }
      : plan,
  ),
});

test("an executed plan the page completed goes out as served, in the screen's night", () => {
  const entries = servedPlanEntries(servedHistory, shownHistory);
  const out = servedFormOfUntouchedPlans(completed(shownHistory), entries);
  assert.deepEqual(out.plans[0], {
    ...servedHistory.plans[0],
    nightId: "night-done",
  });
  assert.deepEqual(out.plans[1], {
    ...servedHistory.plans[1],
    nightId: "night-todo",
  });
  // Archived: a change of state is an edit, sent as it is.
  const archived = {
    plans: [{ ...shownHistory.plans[0], status: "archived" }],
  };
  assert.equal(
    servedFormOfUntouchedPlans(archived, entries).plans[0].status,
    "archived",
  );
});

test("the space's key ignores what the page made of the served plans, not an edit", () => {
  const entries = servedPlanEntries(servedHistory, shownHistory);
  const key = spaceContentKey(shownHistory, entries);
  assert.equal(spaceContentKey(completed(shownHistory), entries), key);
  // Neither the revisions nor the sync stamp are content.
  assert.equal(
    spaceContentKey(
      {
        ...shownHistory,
        sync: { updatedAt: "2026-11-05T09:00:00.000Z" },
        plans: shownHistory.plans.map((plan) => ({ ...plan, revision: 9 })),
      },
      entries,
    ),
    key,
  );
  const renamed = {
    ...shownHistory,
    plans: [
      shownHistory.plans[0],
      { ...shownHistory.plans[1], name: "Plan 2" },
    ],
  };
  assert.notEqual(spaceContentKey(renamed, entries), key);
  assert.notEqual(
    spaceContentKey({ ...shownHistory, date: "2026-11-06" }, entries),
    key,
  );
});
