import assert from "node:assert/strict";
import test from "node:test";
import {
  planCreationGate,
  pendingPlanSlots,
} from "../dist/capability-gates.js";
const capabilities = { "planner.multiple": false, "sync.plan_limit": 1000 };
const plans = [{ id: "a", date: "2030-01-01", status: "pending" }];
test("the night gate ignores place and accepts another night", () => {
  assert.deepEqual(
    planCreationGate({
      capabilities,
      plans,
      date: "2030-01-01",
      signedIn: true,
    }),
    { allowed: false, refusal: "planLimit" },
  );
  assert.equal(
    planCreationGate({ capabilities, plans, date: "2030-01-02" }).allowed,
    true,
  );
  assert.equal(
    pendingPlanSlots({ capabilities, plans, date: "2030-01-02" }),
    1,
  );
});
test("a dateless draft waits for its date and editing excludes itself", () => {
  assert.equal(planCreationGate({ capabilities, plans }).allowed, true);
  assert.equal(
    planCreationGate({ capabilities, plans, date: "2030-01-01", planId: "a" })
      .allowed,
    true,
  );
});
test("the guard refusal differs from a same-night refusal", () => {
  assert.deepEqual(
    planCreationGate({
      capabilities: { ...capabilities, "sync.plan_limit": 1 },
      plans,
      date: "2030-01-02",
      signedIn: true,
    }),
    { allowed: false, refusal: "planGuard" },
  );
});

test("the open core has neutral night and guard sentences in every language", async () => {
  const { HELD_COPY } = await import("../dist/capability-gates.js");
  assert.equal(
    HELD_COPY.fr.planLimit,
    "Ce service n’autorise qu’un plan par nuit. Un autre plan pour cette nuit ne peut pas être créé ici.",
  );
  assert.equal(
    HELD_COPY.fr.planLimitLocal,
    "Plusieurs plans pour une même nuit ne sont pas disponibles avec ce service.",
  );
  assert.equal(
    HELD_COPY.fr.planGuard,
    "Ce service ne synchronise pas plus de 1 000 plans en cours. Un plan de plus ne peut pas être créé ici.",
  );
  for (const copy of Object.values(HELD_COPY)) {
    assert.ok(copy.planGuard);
    assert.ok(copy.planLimit);
  }
});
test("the internal plan of a guided evening neither holds the night nor fills the guard", () => {
  const guided = {
    id: "g",
    date: "2030-01-01",
    status: "pending",
    guidedEvening: true,
  };
  // Alone on its night, it leaves the night free…
  assert.equal(
    planCreationGate({
      capabilities,
      plans: [guided],
      date: "2030-01-01",
      signedIn: true,
    }).allowed,
    true,
  );
  assert.equal(
    pendingPlanSlots({ capabilities, plans: [guided], date: "2030-01-01" }),
    1,
  );
  // …and beside the night's ordinary plan it does not change the answer.
  assert.equal(
    planCreationGate({
      capabilities: { ...capabilities, "sync.plan_limit": 2 },
      plans: [...plans, guided],
      date: "2030-01-02",
    }).allowed,
    true,
  );
  assert.equal(
    planCreationGate({
      capabilities: { ...capabilities, "sync.plan_limit": 1 },
      plans: [guided],
      date: "2030-01-02",
    }).allowed,
    true,
  );
  assert.equal(
    planCreationGate({
      capabilities,
      plans: [...plans, guided],
      date: "2030-01-01",
    }).allowed,
    false,
  );
});
