import assert from "node:assert/strict";
import test from "node:test";
import { planTargetCount, tonightPlanCard } from "planner/tonight-overview.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { planSheetWords } = await import("planner/plan-sheet-words.js");

// "3 cibles" in the hub and the planner against "2
// cibles" in "Cette nuit" for M33 in two slots and NGC 7822. A target
// planned in several slots is one target, everywhere.

const plan = {
  id: "plan-1",
  name: "Two slots",
  date: "2026-10-18",
  items: [
    {
      id: "m33",
      startMinute: 60,
      endMinute: 120,
      target: { id: "m33", designation: "M33", catalogue: "Messier" },
    },
    {
      id: "m33",
      startMinute: 300,
      endMinute: 360,
      target: { id: "m33", designation: "M33", catalogue: "Messier" },
    },
    {
      id: "ngc7822",
      startMinute: 180,
      endMinute: 240,
      target: { id: "ngc7822", designation: "NGC 7822", catalogue: "NGC" },
    },
  ],
};

test("a target in two slots counts once, the same as the card of « Cette nuit »", () => {
  assert.equal(planTargetCount(plan), 2);
  assert.equal(tonightPlanCard(plan).targetCount, 2);
});

test("an empty plan has no target", () => {
  assert.equal(planTargetCount({ items: [] }), 0);
  assert.equal(planTargetCount({}), 0);
});

test("the plan's sheet and the details rows read the same count", () => {
  const words = planSheetWords("en", plan, {
    now: Date.parse("2026-10-18T12:00:00Z"),
  });
  assert.match(JSON.stringify(words), /2 targets/);
  assert.doesNotMatch(JSON.stringify(words), /3 targets/);
});
