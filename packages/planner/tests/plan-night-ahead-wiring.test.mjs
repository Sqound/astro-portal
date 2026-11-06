import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { messages } from "portal/i18n.js";
import { shippedLocales } from "portal/locales.js";

// On the web, the wiring of the page, which the rules
// (`plan-night-ahead.test.mjs`) cannot read.
const source = readFileSync(
  new URL("../src/components/PlannerPage.js", import.meta.url),
  "utf8",
);

test("« Marquer comme exécuté » and « abandonné » are offered only once the night has begun", () => {
  // The card's ⋯ menu and the plan's dialog read the same rule,
  // `planActionsOf` (tested in `plan-sheet-web.test.mjs`), fed with the night.
  assert.match(source, /nightAhead: planNightIsAhead\(\{/);
  assert.match(source, /nightAhead: facts\.nightAhead/);
});

test("the two refusals of the service put the plan back and say a sentence of the person's language", () => {
  assert.match(source, /error\.code === "plan_not_deletable"/);
  assert.match(source, /error\.code === "plan_night_not_begun"/);
  assert.match(source, /restoreRefusedDeletions\(error\.planIds\)/);
  assert.match(source, /revertRefusedClosures\(error\.planIds\)/);
  assert.match(source, /"plannerPlanNotDeletable"/);
  // A refusal said as a refusal, with "Archiver ce plan" and "Fermer".
  assert.match(source, /data-testid="plan-deletion-refused"/);
  assert.match(source, /"planDeletionRefusedArchive"/);
  assert.match(source, /"planDeletionRefusedClose"/);
  assert.match(source, /"plannerPlanNightNotBegun"/);
});

test("the two sentences exist in the ten languages", () => {
  for (const locale of shippedLocales())
    for (const key of [
      "plannerPlanNotDeletable",
      "plannerPlanNightNotBegun",
      "planDeletionRefusedExecutedDetail",
      "planDeletionRefusedArchive",
      "planDeletionRefusedClose",
    ])
      assert.ok(messages[locale]?.[key], `${locale} ${key}`);
});
