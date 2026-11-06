import assert from "node:assert/strict";
import test from "node:test";

import { planLibraryEntries, planProjectId } from "../dist/plan-groups.js";

// "Tous les plans" on the
// web — the nights of a multi-night plan in one group, never twice; at its
// next night under "À exécuter", at its most recent under "Exécutés"; a
// mixed plan in both lists with a count for the other; the filters sort the
// nights and a count says how many they leave out.

const night = (id, date, status, projectId = "ic") => ({
  id,
  date,
  status,
  items: [{ id: `${id}-item`, ...(projectId ? { projectId } : {}) }],
});
const plans = [
  night("bibande", "2026-08-09", "executed"),
  night("rvb", "2026-08-10", "executed"),
  night("lost", "2026-08-12", "abandoned"),
  night("ha", "2026-10-27", "pending"),
  night("oiii", "2026-10-28", "pending"),
  night("col", "2026-10-23", "pending", null),
  night("oct14", "2026-10-14", "executed", null),
];
const mainOf = (plan) =>
  ["executed", "partial", "abandoned"].includes(plan.status)
    ? "executed"
    : "to_execute";
// The preselection: abandoned nights out.
const passes = (plan, main) =>
  mainOf(plan) === main && plan.status !== "abandoned";

test("a night of a multi-night plan names its plan; a plan of one night none", () => {
  assert.equal(planProjectId(plans[0]), "ic");
  assert.equal(planProjectId(plans[5]), null);
});

test("« À exécuter »: the group at its next night, its planned nights, a count of the nights carried out", () => {
  const entries = planLibraryEntries({
    plans,
    main: "to_execute",
    passes,
    mainOf,
  });
  assert.deepEqual(
    entries.map((entry) =>
      entry.kind === "group" ? `group:${entry.projectId}` : entry.plan.id,
    ),
    ["group:ic", "col"],
  );
  const group = entries[0];
  assert.deepEqual(
    group.nights.map((each) => each.id),
    ["oiii", "ha"],
  );
  assert.equal(group.otherList, 2);
  assert.equal(group.hidden, 0);
});

test("« Exécutés »: the group at its most recent night, the abandoned one counted as hidden, never twice", () => {
  const entries = planLibraryEntries({
    plans,
    main: "executed",
    passes,
    mainOf,
  });
  assert.deepEqual(
    entries.map((entry) =>
      entry.kind === "group" ? `group:${entry.projectId}` : entry.plan.id,
    ),
    ["oct14", "group:ic"],
  );
  const group = entries[1];
  assert.deepEqual(
    group.nights.map((each) => each.id),
    ["rvb", "bibande"],
  );
  assert.equal(group.hidden, 1);
  assert.equal(group.otherList, 2);
});
