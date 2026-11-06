import assert from "node:assert/strict";
import test from "node:test";

import {
  planStatusTags,
  planPassesFilters,
  noPlanFilters,
} from "planner/plan-library-filters.js";
import {
  planArchivedFrom,
  planWithStatus,
  planWithValidArchivedFrom,
} from "planner/planner.js";
import { planNightWindow } from "planner/planner.js";
import { tonightOverview, tonightSubject } from "planner/tonight-overview.js";
import { tonightWords } from "planner/tonight-words.js";

// "Cette nuit" on the web follows the phone: a plan that was archived leaves
// the night (its list, the count of its title, what chooses its place); a plan
// that was cancelled stays, with its « Abandonné » badge, so that it can be
// launched again. An archived plan says the state it had first.

const place = {
  id: "lac-noir",
  name: "Camping du Lac Noir",
  latitude: "45",
  longitude: "-30",
  timeZone: "Atlantic/Azores",
};
const date = "2026-10-14";
const now = Date.parse(planNightWindow({ date }, place).darkStart);
const plan = (id, status, extra = {}) => ({
  id,
  name: `Plan ${id}`,
  date,
  status,
  location: place,
  items: [],
  ...extra,
});
const subjectOf = (plans, options = {}) =>
  tonightSubject({ now, document: { plans }, ...options });
const ids = (subject) => subject.plans.map((entry) => entry.id);

test("an archived plan is not one of tonight's plans, a cancelled one is", () => {
  const subject = subjectOf([
    plan("ready", "pending"),
    plan("cancelled", "abandoned"),
    plan("away", "archived"),
    plan("away-too", "archived", { archivedFrom: "abandoned" }),
  ]);
  assert.deepEqual(ids(subject), ["ready", "cancelled"]);
});

test("the title counts the plans kept: one once the other is archived", () => {
  const title = (plans) =>
    tonightWords(
      tonightOverview({
        place,
        date,
        plans: subjectOf(plans).plans,
      }),
      { locale: "fr", timeZone: place.timeZone },
    ).plansTitle;
  const two = [plan("a", "pending"), plan("b", "abandoned")];
  const many = title(two);
  const one = title([plan("a", "pending"), plan("b", "archived")]);
  assert.notEqual(many, one);
  assert.equal(
    one,
    tonightWords(
      tonightOverview({ place, date, plans: [plan("a", "pending")] }),
      {
        locale: "fr",
        timeZone: place.timeZone,
      },
    ).plansTitle,
  );
});

test("an archived plan never chooses the place of the night, a cancelled one does", () => {
  const elsewhere = { ...place, id: "col", name: "Col des Mélèzes" };
  const document = (status) => ({
    location: elsewhere,
    knownLocations: [elsewhere],
    plans: [plan("alone", status)],
  });
  const archived = tonightSubject({ now, document: document("archived") });
  assert.equal(archived.place.name, "Col des Mélèzes");
  assert.deepEqual(archived.plans, []);
  const cancelled = tonightSubject({ now, document: document("abandoned") });
  assert.equal(cancelled.place.name, "Camping du Lac Noir");
  assert.deepEqual(ids(cancelled), ["alone"]);
});

test("the card of a plan says its state: « Abandonné » for a cancelled plan, nothing for a planned one", () => {
  const plans = subjectOf([
    plan("ready", "pending"),
    plan("cancelled", "abandoned"),
    plan("done", "executed"),
    plan("some", "partial"),
  ]).plans;
  const fr = tonightWords(tonightOverview({ place, date, plans }), {
    locale: "fr",
    timeZone: place.timeZone,
  });
  const states = Object.fromEntries(
    fr.plans.map((entry) => [entry.id, entry.state]),
  );
  assert.equal(states.ready, null);
  assert.deepEqual(states.cancelled, { tone: "abandoned", label: "Abandonné" });
  assert.deepEqual(states.done, { tone: "executed", label: "Exécuté" });
  assert.deepEqual(states.some, { tone: "partial", label: "En partie" });
  const en = tonightWords(tonightOverview({ place, date, plans }), {
    locale: "en",
    timeZone: place.timeZone,
  });
  assert.equal(
    en.plans.find((entry) => entry.id === "cancelled").state.label,
    "Abandoned",
  );
});

test("an archived plan says « Abandonné » then « Archivé » when it was cancelled", () => {
  assert.deepEqual(
    planStatusTags(plan("a", "archived", { archivedFrom: "abandoned" })),
    ["abandoned", "archived"],
  );
  assert.deepEqual(
    planStatusTags(plan("a", "archived", { archivedFrom: "partial" })),
    ["partial", "archived"],
  );
  // Without a state kept, « Archivé » alone; an unknown word is no state.
  assert.deepEqual(planStatusTags(plan("a", "archived")), ["archived"]);
  assert.deepEqual(
    planStatusTags(plan("a", "archived", { archivedFrom: "pending" })),
    ["archived"],
  );
  // The debriefing does not hide the archive.
  assert.deepEqual(
    planStatusTags(plan("a", "archived", { archivedFrom: "executed" }), {
      toDebrief: true,
    }),
    ["executed", "archived"],
  );
  // A plan that is not archived ignores the field.
  assert.deepEqual(
    planStatusTags(plan("a", "abandoned", { archivedFrom: "abandoned" })),
    ["abandoned"],
  );
});

test("the archive's filter lists an archived plan whatever its state", () => {
  const filters = { ...noPlanFilters, statuses: ["archived"] };
  for (const archivedFrom of [undefined, "abandoned"]) {
    const archived = plan(
      "a",
      "archived",
      archivedFrom ? { archivedFrom } : {},
    );
    assert.equal(
      planPassesFilters(archived, {
        toDebrief: false,
        main: "executed",
        filters,
      }),
      true,
    );
    assert.equal(
      planPassesFilters(archived, {
        toDebrief: false,
        main: "executed",
        filters: noPlanFilters,
      }),
      false,
    );
  }
});

test("archiving keeps the state the plan had, any other change drops it", () => {
  const at = { now: new Date("2026-10-14T20:00:00Z") };
  const cancelled = plan("a", "abandoned");
  const archived = planWithStatus(cancelled, "archived", at);
  assert.equal(archived.status, "archived");
  assert.equal(archived.archivedAt, "2026-10-14T20:00:00.000Z");
  assert.equal(archived.archivedFrom, "abandoned");
  assert.equal(planArchivedFrom(archived), "abandoned");
  // Archived again: what it was before stays.
  assert.equal(
    planWithStatus(archived, "archived", at).archivedFrom,
    "abandoned",
  );
  // A plan archived while it was still planned has nothing to say.
  const planned = planWithStatus(plan("b", "pending"), "archived", at);
  assert.equal(Object.hasOwn(planned, "archivedFrom"), false);
  // « Rétablir » drops it, with `archivedAt`.
  const restored = planWithStatus(archived, "pending", at);
  assert.equal(restored.status, "pending");
  assert.equal(restored.archivedAt, null);
  assert.equal(Object.hasOwn(restored, "archivedFrom"), false);
  // A copy that carries the field on a plan that is not archived is cleaned.
  const stale = plan("c", "abandoned", { archivedFrom: "abandoned" });
  assert.equal(
    Object.hasOwn(planWithValidArchivedFrom(stale), "archivedFrom"),
    false,
  );
  assert.equal(planWithValidArchivedFrom(archived), archived);
});
