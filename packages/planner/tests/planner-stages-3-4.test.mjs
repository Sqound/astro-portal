import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { message } from "portal/i18n.js";

// On the web: "Suggérer les meilleures cibles" a full-width secondary;
// "Sélection éditoriale" and "Suggestions du catalogue" leave stage 3 for stage
// 4's "Options du catalogue", folded by default and kept in the plan's view,
// for the "Catalogues" source only; "Mes préférées" is no longer a source;
// "Tolérance au vent" leaves stage 2 for a row of stage 3 and its dialog. The
// page is read as a source, as `planner-stage-order.test.mjs` does.

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const source = read("../src/components/PlannerPage.js");
const dist = read("../dist/components/PlannerPage.js");

const at = (text, needle, from = 0) => {
  const index = text.indexOf(needle, from);
  assert.ok(index >= 0, `expected ${needle}`);
  return index;
};
const plain = (text) => text.replaceAll("\u00a0", " ");

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

const stage = (name) => {
  const starts = {
    equipment: at(source, "planner-flow-stage planner-equipment-stage"),
    constraints: at(source, "planner-flow-stage planner-constraints-stage"),
    targets: at(source, "planner-recommendations planner-flow-stage"),
    schedule: at(source, "planner-flow-stage planner-schedule-stage"),
  };
  const order = ["equipment", "constraints", "targets", "schedule"];
  const next = order[order.indexOf(name) + 1];
  return source.slice(starts[name], next ? starts[next] : undefined);
};

test("« Suggérer les meilleures cibles » is a secondary of stage 4, full width, with its sparkle", () => {
  const targets = stage("targets");
  const entry = targets.slice(
    at(targets, "planner-suggest-entry") - 200,
    at(targets, 'suggestMessage(locale, "suggestAction")'),
  );
  assert.match(entry, /className="btn-secondary planner-suggest-entry"/);
  assert.doesNotMatch(entry, /btn-primary/);
  assert.match(entry, /<svg viewBox="0 0 24 24" aria-hidden="true">/);
  const css = read("../../portal-app/styles/portal.css");
  assert.match(
    css,
    /\.planner-section-heading \.planner-suggest-entry \{[^}]*width: 100%/,
  );
  assert.ok(dist.includes("btn-secondary planner-suggest-entry"));
});

test("stage 3 no longer holds the editorial selection nor the catalogue suggestions; stage 4 does, under « Options du catalogue »", () => {
  const constraints = stage("constraints");
  assert.ok(!constraints.includes("plannerTargetCatalogueSelection"));
  assert.ok(!constraints.includes("plannerEquipmentRestriction"));
  // What stage 3 keeps: the horizon line, the minimum height, the Moon
  // separation and its sentence, "Contraintes avancées".
  for (const kept of [
    "planner-horizon-constraint-info",
    '"plannerMinAltitude"',
    '"plannerMoonSeparationHelp"',
    "planner-advanced-constraints",
  ])
    assert.ok(constraints.includes(kept), kept);
  const targets = stage("targets");
  const sources = at(targets, "planner-source-switch");
  const options = at(targets, 'className="planner-catalogue-options"');
  const search = at(targets, "planner-recommendation-search");
  assert.ok(sources < options && options < search, "under the sources");
  const block = targets.slice(options, search);
  assert.match(block, /plannerTargetCatalogueSelection/);
  assert.match(block, /plannerEquipmentRestriction"/);
  assert.match(block, /plannerEquipmentRestrictionHelp/);
  assert.match(block, /"favorites",\s*"plannerTargetCatalogueFavorites"/);
});

test("the options exist for « Catalogues » only, folded by default, the fold kept in the plan's view, the summary says both choices", () => {
  const targets = stage("targets");
  const block = targets.slice(
    at(targets, "The catalogue's own options"),
    at(targets, "planner-recommendation-search"),
  );
  assert.match(block, /recommendationSource === "catalogue" && \(/);
  assert.match(block, /open=\{planView\.catalogueOptionsOpen === true\}/);
  assert.match(
    block,
    /updatePlanView\(\s*"catalogueOptionsOpen",\s*planView\.catalogueOptionsOpen !== true,?\s*\)/,
  );
  assert.match(
    block,
    /planView\.catalogueOptionsOpen !== true && \([\s\S]*catalogueOptionsSummary/,
  );
  assert.match(block, /plannerCatalogueOptionsCollapse/);
  assert.match(block, /plannerCatalogueOptionsExpand/);
  // The summary: the tier, then "restreint au matériel" when restricted.
  const summary = source.slice(
    at(source, "const catalogueOptionsSummary = ["),
    at(source, '].join(" · ");') + 14,
  );
  assert.match(summary, /plannerCatalogueOptionsRestricted/);
  assert.match(summary, /state\.equipment\.restrictToEquipment/);
  assert.equal(
    message("fr", "plannerCatalogueOptions"),
    "Options du catalogue",
  );
  assert.equal(
    `${message("fr", "plannerTargetCatalogueEssential")} · ${message("fr", "plannerCatalogueOptionsRestricted")}`,
    "Essentielles · restreint au matériel",
  );
  assert.equal(
    message("fr", "plannerCatalogueOptionsExpand"),
    "Déplier les options du catalogue",
  );
  assert.equal(
    message("fr", "plannerCatalogueOptionsCollapse"),
    "Replier les options du catalogue",
  );
});

test("« Mes préférées » is no longer a source tab: four sources, two per line", () => {
  const targets = stage("targets");
  const switchBlock = targets.slice(
    at(targets, "planner-source-switch"),
    at(targets, 'className="planner-catalogue-options"'),
  );
  assert.ok(!switchBlock.includes('selectRecommendationSource("favorites")'));
  assert.ok(!switchBlock.includes("has-favorites"));
  const tabs = switchBlock.match(/selectRecommendationSource\("(\w+)"\)/g);
  assert.deepEqual(tabs, [
    'selectRecommendationSource("catalogue")',
    'selectRecommendationSource("capture")',
    'selectRecommendationSource("plans")',
    'selectRecommendationSource("framing")',
  ]);
  assert.ok(!source.includes("favoriteSourceAvailable"));
});

test("the wind leaves stage 2 for a row of stage 3 after the Moon separation; the row and the score's link open one dialog", () => {
  assert.ok(!stage("equipment").includes("<WindTolerance"));
  const constraints = stage("constraints");
  const moon = at(constraints, '"plannerMoonSeparationHelp"');
  const row = at(constraints, "<WindToleranceRow");
  const darkness = at(constraints, "planner-darkness-group");
  assert.ok(moon < row && row < darkness, "after the Moon separation");
  assert.match(
    constraints.slice(row, darkness),
    /onOpen=\{\(\) => setWindDialogOpen\(true\)\}/,
  );
  // The folded stage gains "vent Standard".
  const summary = constraints.slice(
    at(constraints, "planner-constraints-summary"),
    at(constraints, "</summary>"),
  );
  assert.match(summary, /windSectionLabels\(\{[\s\S]*\}\)\.summary/);
  // "Régler la tolérance au vent" opens the same dialog.
  const link = source.slice(at(source, "onWindSettings={() => {"));
  assert.match(link.slice(0, 200), /setWindDialogOpen\(true\)/);
  assert.match(source, /\{windDialogOpen && \(\s*<WindToleranceDialog/);
  const component = read("../src/components/WindTolerance.js");
  assert.match(component, /export function WindToleranceRow/);
  assert.match(component, /export function WindToleranceDialog/);
  assert.match(
    component,
    /className="btn-tertiary"[\s\S]*message\(locale, "infoClose"\)/,
  );
  assert.equal(
    plain(message("fr", "plannerWindMount").replace("{mount}", "M")),
    "Réglage de la monture : M. Il est repris dans chaque plan qui l’utilise.",
  );
});

test("every new word exists in the ten languages", () => {
  for (const locale of LOCALES)
    for (const key of [
      "plannerCatalogueOptions",
      "plannerCatalogueOptionsRestricted",
      "plannerCatalogueOptionsExpand",
      "plannerCatalogueOptionsCollapse",
      "plannerWindLimitsPair",
      "plannerWindForMount",
      "plannerWindSummary",
      "plannerWindMount",
      "infoClose",
    ])
      assert.ok(
        message(locale, key) && message(locale, key) !== key,
        `${locale}: ${key}`,
      );
});
