import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { message } from "portal/i18n.js";
import { plannerFlowMessage } from "portal/planner/flow-messages.js";

// The planner in the order of use. The page is read as a source, as
// `planner-page-gates.test.mjs` does: five stages, the forecast inside the
// first, the count of targets heading the fourth, the timeline fifth.

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const source = read("../src/components/PlannerPage.js");
const dist = read("../dist/components/PlannerPage.js");

const at = (text, needle) => {
  const index = text.indexOf(needle);
  assert.ok(index >= 0, `expected ${needle}`);
  return index;
};

const LOCALES = [
  "en",
  "fr",
  "ja",
  "de",
  "es",
  "it",
  "pt-BR",
  "ru",
  "zh-Hans",
  "zh-Hant",
];

test("the stages are numbered 1 to 5 in the order of use: the targets are the fourth, the timeline the fifth", () => {
  for (const text of [source, dist]) {
    const steps = [...text.matchAll(/data-stage-crumb-step="(\d)"/g)].map(
      (match) => Number(match[1]),
    );
    assert.deepEqual(steps, [1, 2, 3, 4, 5]);
    // The targets stage comes before the schedule stage in the page.
    assert.ok(
      at(text, 'id="planner-target-step"') <
        at(text, 'id="planner-schedule-step"'),
    );
  }
  const crumbStart = at(source, "<StageCrumbs");
  const crumbs = source.slice(
    crumbStart,
    at(source, 'className="planner-flow-stage planner-location-stage"'),
  );
  assert.ok(
    crumbs.indexOf('flow(locale, "targets")') <
      crumbs.indexOf('flow(locale, "schedule")'),
    "the sticky bar lists the targets before the schedule",
  );
  assert.match(crumbs, /step: 4, title: flow\(locale, "targets"\)/);
  assert.match(crumbs, /step: 5, title: flow\(locale, "schedule"\)/);
});

test("the forecast is inside the location stage", () => {
  for (const text of [source, dist]) {
    const stage = at(text, "planner-flow-stage planner-location-stage");
    const forecast = at(text, "planner-flow-stage planner-shared-forecast");
    const tabs = at(text, "planner-night-tabs-heading");
    assert.ok(stage < forecast && forecast < tabs);
  }
  // The stage's own closing tag sits after the forecast, before the plans.
  const forecast = at(source, "planner-flow-stage planner-shared-forecast");
  const tabs = at(source, "planner-night-tabs-heading");
  assert.ok(
    source.slice(forecast, tabs).includes("</details>"),
    "the location stage closes after the forecast",
  );
  const stage = at(source, "planner-flow-stage planner-location-stage");
  assert.ok(
    !source.slice(stage, forecast).includes("\n            </details>"),
    "nothing closes the location stage before the forecast",
  );
});

test("the count of suitable targets heads the targets stage, with no « Choisir les cibles ↓ », and the exclusions come under the list", () => {
  const targets = at(source, "planner-recommendations planner-flow-stage");
  const schedule = at(source, "planner-flow-stage planner-schedule-stage");
  const summary = at(source, 'className="planner-eligibility-summary"');
  const list = at(source, 'className="planner-target-list"');
  const exclusions = at(source, 'className="planner-exclusion-summary"');
  assert.ok(targets < summary && summary < list, "head line inside stage 4");
  assert.ok(
    list < exclusions && exclusions < schedule,
    "exclusions after the list",
  );
  assert.ok(
    !/flow\(locale, "showTargets"\)/.test(source),
    "no « Choisir les cibles ↓ » button any more",
  );
  assert.equal(
    plannerFlowMessage("fr", "available"),
    "cibles adaptées à ce plan",
  );
  assert.equal(
    message("fr", "plannerExcludedSummary").replace(
      "{items}",
      `6 ${message("fr", "plannerExcludedMoon")}${message("fr", "plannerExcludedSeparator")}3 ${message("fr", "plannerExcludedAltitude")}`,
    ),
    "Écartées de ces suggestions : 6 trop proches de la Lune, 3 sous le seuil de hauteur.",
  );
});

test("the plan action of a card is an icon button named « Ajouter au plan » / « Retirer du plan », and the plan tab gives its count a unit", () => {
  for (const text of [source, dist]) {
    assert.match(text, /planner-target-icon-action/);
    assert.match(text, /iconOnly/);
  }
  const action = source.slice(
    at(source, "if (iconOnly) {"),
    at(source, "planner-target-action-label"),
  );
  assert.match(action, /plannerRemoveFromPlan/);
  assert.match(action, /"plannerAdd"/);
  assert.ok(
    !/planner-target-action-label/.test(action),
    "no label in the icon",
  );
  assert.equal(message("fr", "plannerAdd"), "Ajouter au plan");
  assert.equal(message("fr", "plannerRemoveFromPlan"), "Retirer du plan");
  // "Nouveau plan": short, on one line in the night's tab row; the button names its object
  //.
  assert.equal(message("fr", "plannerAddPlan"), "Nouveau plan");
  assert.match(
    source,
    /<output>\s*\{planTabCount\(locale, planTargetCount\(plan\)\)\}/,
  );
  assert.equal(message("fr", "plannerPlanTabCountNone"), "Aucune cible");
  assert.equal(message("fr", "nightSummaryTargetCountOne"), "1 cible");
});

test("the plans' heading has no help line and no ⓘ; the sync state wears a small gold cloud; every new word exists in the ten languages", () => {
  const heading = source.slice(
    at(source, 'className="planner-night-tabs-heading"'),
    at(source, 'className="planner-night-tabs-row"'),
  );
  assert.doesNotMatch(heading, /planHelp|planner-plans-help|InfoDisclosure/);
  assert.doesNotMatch(heading, /plannerPlansInfoLabel/);
  assert.match(heading, /<PlannerSyncIcon status=\{syncStatus\} \/>/);
  assert.match(source, /function PlannerSyncIcon\(\{ status \}\)/);
  for (const locale of LOCALES) {
    for (const key of [
      "plannerRemoveFromPlan",
      "plannerPlanTabCountNone",
      "plannerExcludedSummary",
      "plannerExcludedSeparator",
      "plannerAddPlan",
    ])
      assert.ok(
        message(locale, key) && message(locale, key) !== key,
        `${locale}: ${key}`,
      );
    // The two words that went with the line are gone from the catalogues.
    assert.equal(
      message(locale, "plannerPlansInfoLabel"),
      "plannerPlansInfoLabel",
    );
  }
});
