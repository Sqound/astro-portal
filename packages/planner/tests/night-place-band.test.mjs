import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The "une nuit = un lieu" rule, the wiring of the web planner's page.

const source = readFileSync(
  new URL("../src/components/PlannerPage.js", import.meta.url),
  "utf8",
);

test("the page: the band replaces the tabs, the page under it is inert, nothing is edited or made", () => {
  assert.match(source, /const nightConflict = nightPlaceConflict\(state\)/);
  assert.match(source, /<NightPlaceBand/);
  assert.match(source, /tabPlans\.length > 0 && !nightConflict/);
  assert.match(source, /inert=\{nightConflict \? true : undefined\}/);
  assert.match(
    source,
    /data-night-place-held=\{nightConflict \? "" : undefined\}/,
  );
  // `canEditActivePlan` and `addPlan` refuse on a night that has two places.
  assert.match(
    source,
    /const canEditActivePlan = [\s\S]{0,260}if \(nightPlaceConflict\(current\)\) return false/,
  );
  assert.match(
    source,
    /const addPlan = \(\) => \{[\s\S]{0,200}if \(nightPlaceConflict\(stateRef\.current\)\) return/,
  );
});

test("the page: a date chosen at a place opens the night of that place, empty, when the date's plans are elsewhere", () => {
  assert.match(source, /const held = chooseDateAtPlace\(/);
  assert.match(
    source,
    /nightBesideFinishedPlans\(base, date, base\.location\)/,
  );
});

test("the page: each choice goes through the distance dialog, then every plan moves", () => {
  assert.match(source, /setNightPlaceChoice\(\{ place, current \}\)/);
  assert.match(
    source,
    /<PlaceFarDialog[\s\S]{0,260}onConfirm=\{\(\) => resolveNightPlace\(nightPlaceChoice\.place\)\}/,
  );
  assert.match(source, /unifyNightPlace\(current, place\)/);
  // "Utiliser" always asks; "Revenir" only when a plan at the chosen place
  // has to move.
  assert.match(source, /kind === "use" \|\|/);
});

test("the page: the service's refusal keeps the plan and reads the night's plans again", () => {
  assert.match(source, /error\.code === "plan_night_place_conflict"/);
  assert.match(
    source,
    /plan_night_place_conflict"\) \{[\s\S]{0,700}synchronizeSpaceRef\.current\(\)/,
  );
});
