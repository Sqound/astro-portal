// The free offer's one rule "one plan per night" counts a plan that was run.
// After an executed (or partial) night, a quick plan for that night is
// refused as "taken" -- nothing to merge into or erase -- the same as a
// pending plan makes it "exists".
import assert from "node:assert/strict";
import test from "node:test";
import { fixture, existing } from "./quick-plan.test.mjs";
import { planCreationGate, pendingPlanSlots } from "../src/capability-gates.js";

const selected = new Set(["t00", "t01"]);
const date = existing.date;

for (const status of ["executed", "partial"]) {
  test(`a ${status} plan of the night: the quick plan is taken, nothing written`, async () => {
    const { action, events } = fixture({
      plans: [{ ...existing, id: "ran", status }],
    });
    const result = await action.create(selected);
    assert.equal(result.kind, "taken");
    assert.equal(result.plan, undefined);
    assert.deepEqual(events, []);
  });
}

for (const status of ["abandoned", "archived"]) {
  test(`a ${status} plan puts the night back at the person's disposal`, async () => {
    const { action } = fixture({
      plans: [{ ...existing, id: "gone", status }],
    });
    assert.equal((await action.create(selected)).kind, "created");
  });
}

test("a run plan of another night does not take this one", async () => {
  const { action } = fixture({
    plans: [{ ...existing, id: "ran", status: "executed", date: "2026-10-13" }],
  });
  assert.equal((await action.create(selected)).kind, "created");
});

test("Advanced Planning (planner.multiple) makes a second plan after a run night", async () => {
  const { action } = fixture({
    plans: [{ ...existing, id: "ran", status: "executed" }],
    multiple: true,
    signedIn: true,
  });
  assert.equal((await action.create(selected)).kind, "created");
});

test("erasing the pending plan of a night that also kept a run plan is refused before anything is erased", async () => {
  const { action, events } = fixture({
    plans: [existing, { ...existing, id: "ran", status: "executed" }],
  });
  const result = await action.eraseAndCreate(selected);
  assert.equal(result.kind, "exists");
  assert.deepEqual(
    events.filter((e) => e[0] === "delete"),
    [],
  );
});

test("the gate and the slot count read the same rule", () => {
  const capabilities = { "planner.multiple": false, "sync.plan_limit": 1000 };
  const plans = [{ ...existing, id: "ran", status: "executed" }];
  assert.equal(planCreationGate({ capabilities, plans, date }).allowed, false);
  assert.equal(pendingPlanSlots({ capabilities, plans, date }), 0);
  // the numeric guard counts the pending plans only
  assert.equal(
    pendingPlanSlots({ capabilities, plans }),
    1000,
    "an executed plan is not a slot of the guard",
  );
});

test("the dialog of a night taken by a run plan holds the offer only", async () => {
  const { quickPlanDialogData } = await import("../src/quick-plan-web.js");
  const { action } = fixture({
    plans: [{ ...existing, id: "ran", status: "partial" }],
  });
  const data = await quickPlanDialogData({
    action,
    ids: selected,
    locale: "en",
    eraseState: async () => {
      throw new Error("nothing to erase");
    },
    tonightDate: date,
  });
  assert.equal(data.taken, true);
  assert.equal(data.tonight, true);
});
