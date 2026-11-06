// When the other plans of the night took every target, the suggest dialog
// says so with its own words, not that the Moon, the horizon or the minimum
// altitude leave nothing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { suggestNight } from "../src/suggest-night.js";
import {
  suggestDialogModel,
  suggestNothingState,
} from "../src/suggest-dialog-model.js";
import { targetIdsTakenOnNight } from "../src/night-taken-targets.js";
import { base, candidate } from "./helpers/suggestion-cases.mjs";

const two = {
  ...base,
  candidates: [candidate("t00"), candidate("t01")],
  count: 3,
  layout: "night",
};
const plan = (id, targets) => ({
  id,
  date: "2026-10-14",
  equipment: { mode: "imaging" },
  items: targets.map((target) => ({ id: target })),
});

test("empty because the other plans hold the candidates: the proposal says so", () => {
  const plans = [plan("photo-1", ["t00"]), plan("photo-2", ["t01"])];
  const taken = targetIdsTakenOnNight(plans, { date: "2026-10-14" });
  const proposal = suggestNight({
    ...two,
    excluded: taken,
    takenByOtherPlans: taken,
  });
  assert.equal(proposal.items.length, 0);
  assert.equal(proposal.takenByOtherPlans, true);
});

test("no candidate in the sky: not blamed on the other plans", () => {
  const proposal = suggestNight({
    ...two,
    candidates: [],
    excluded: ["t00"],
    takenByOtherPlans: ["t00"],
  });
  assert.equal(proposal.items.length, 0);
  assert.equal(proposal.takenByOtherPlans, undefined);
});

test("exclusions the other plans do not own (the targets already shown) are not blamed on them", () => {
  const proposal = suggestNight({
    ...two,
    excluded: ["t00", "t01"],
    takenByOtherPlans: [],
  });
  assert.equal(proposal.items.length, 0);
  assert.equal(proposal.takenByOtherPlans, undefined);
});

test("a proposal that is not empty is left as it is", () => {
  const proposal = suggestNight({
    ...two,
    excluded: ["t00"],
    takenByOtherPlans: ["t00"],
  });
  assert.ok(proposal.items.length > 0);
  assert.equal(proposal.takenByOtherPlans, undefined);
});

test("the rule: after the night and the plan itself, before the sky", () => {
  const state = (over) =>
    suggestNothingState({
      windowMinutes: 720,
      windowStartMinute: 0,
      freeMinutes: 720,
      minimumMinutes: 45,
      hasPlans: true,
      takenByOtherPlans: true,
      ...over,
    });
  assert.deepEqual(state({}), { cause: "takenByOtherPlans", minutes: 720 });
  assert.equal(state({ windowMinutes: 30 }).cause, "nightShort");
  assert.equal(state({ freeMinutes: 10 }).cause, "planFull");
  assert.equal(state({ takenByOtherPlans: false }).cause, "noTarget");
});

test("the dialog's words for that cause, in French", () => {
  const emptyProposal = {
    window: { startMinute: 0, endMinute: 720 },
    items: [],
    free: [],
    imagingMinutes: 0,
    freeMinutes: 720,
    estimate: { count: 0, slotMinutes: 90 },
    takenByOtherPlans: true,
  };
  const model = suggestDialogModel({
    proposal: emptyProposal,
    selected: new Set(),
    locale: "fr",
    timeZone: "UTC",
    planCount: 2,
  });
  assert.equal(model.nothingCause, "takenByOtherPlans");
  assert.equal(
    model.nothingTitle,
    "Les autres plans ont pris toutes les cibles.",
  );
  assert.match(
    model.nothingDetail,
    /^Une cible déjà prévue dans un autre plan/,
  );
  assert.doesNotMatch(model.nothingDetail, /Lune/);
});

test("the pages hand the engine the ids the other plans hold", () => {
  const read = (name) =>
    readFileSync(new URL(`../src/components/${name}`, import.meta.url), "utf8");
  assert.equal(
    read("TonightPage.js").match(/takenByOtherPlans:/g).length,
    2,
    "TonightPage: the first proposal and every new one",
  );
  assert.match(read("PlannerPage.js"), /takenByOtherPlans:/);
});
