import assert from "node:assert/strict";
import test from "node:test";
import { message } from "portal/i18n.js";
import { planDisplayTags, planIsDraft } from "planner/plan-readiness.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { planSheetWords } = await import("planner/plan-sheet-words.js");

// "Brouillon" on the web (`planReadiness`): a pending plan is ready with a
// place that has coordinates, a date and one target placed on the night; any
// other pending plan is a draft and its card and sheet say so instead of
// "Planifié".

const place = { name: "Love", latitude: 45, longitude: 6, timeZone: "UTC" };
const placedItem = {
  id: "m31",
  targetId: "m31",
  startMinute: 60,
  endMinute: 120,
};
const plan = (extra = {}) => ({
  id: "plan-1",
  name: "Plan 1",
  status: "pending",
  date: "2026-10-19",
  location: place,
  items: [placedItem],
  ...extra,
});

test("a pending plan is a draft unless a place, a date and a placed target are there", () => {
  assert.equal(planIsDraft(plan()), false);
  assert.equal(planIsDraft(plan({ items: [] })), true, "no target");
  assert.equal(
    planIsDraft(plan({ items: [{ id: "m31", targetId: "m31" }] })),
    true,
    "a target not placed on the night",
  );
  assert.equal(
    planIsDraft(
      plan({ location: { name: "Love", latitude: "", longitude: "" } }),
    ),
    true,
    "a place without coordinates",
  );
  assert.equal(planIsDraft(plan({ location: null })), true, "no place");
  assert.equal(planIsDraft(plan({ date: "" })), true, "no date");
});

test("a plan that is no longer pending is never a draft", () => {
  for (const status of ["executed", "partial", "abandoned", "archived"])
    assert.equal(planIsDraft(plan({ status, items: [] })), false, status);
});

test("the tags read draft in place of planned, nothing else changes", () => {
  assert.deepEqual(planDisplayTags(plan({ items: [] }), ["planned"]), [
    "draft",
  ]);
  assert.deepEqual(planDisplayTags(plan(), ["planned"]), ["planned"]);
  assert.deepEqual(
    planDisplayTags(plan({ status: "executed", items: [] }), [
      "executed",
      "toDebrief",
    ]),
    ["executed", "toDebrief"],
  );
});

test("the sheet's tags and the draft word, in the ten languages", () => {
  const draft = planSheetWords("fr", plan({ items: [] }), {
    now: Date.parse("2026-10-19T12:00:00Z"),
  });
  assert.deepEqual(draft.tags, ["draft"]);
  const ready = planSheetWords("fr", plan(), {
    now: Date.parse("2026-10-19T12:00:00Z"),
  });
  assert.deepEqual(ready.tags, ["planned"]);
  assert.equal(message("fr", "plannerPlanStatusDraft"), "Brouillon");
  assert.equal(message("en", "plannerPlanStatusDraft"), "Draft");
  for (const locale of [
    "fr",
    "en",
    "ja",
    "de",
    "es",
    "it",
    "pt-BR",
    "ru",
    "zh-Hans",
    "zh-Hant",
  ])
    assert.notEqual(
      message(locale, "plannerPlanStatusDraft"),
      undefined,
      locale,
    );
});
