import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { message } from "portal/i18n.js";
import { filterAdviceForNight } from "planner/filters.js";
import {
  filterAdviceSentence,
  filterAdviceTitle,
  filterFamilyDefaultName,
  filterFamilyName,
  ownedFilterFamilyChoices,
  ownedFilterLine,
} from "planner/filters-section.js";

// "Owned filters" and "Advice for tonight" in the web planner's equipment
// stage.

const plain = (text) => text.replaceAll("\u00a0", " ");
const iso = (hour, minute = 0) =>
  new Date(Date.UTC(2026, 9, 14, hour, minute)).toISOString();
const sets = [10, 1, -11, -25, -38, -48, -50, -44, -33, -20].map(
  (altitude, index) => ({ time: iso(20 + index), altitude }),
);
const night = { start: iso(20), end: iso(29), moonIllumination: 55 };
const advise = (ownedFilters, extra = {}) =>
  filterAdviceForNight({
    ownedFilters,
    moonSeries: sets,
    night: { ...night, ...extra },
  });
const words = (locale, advice) =>
  advice.map((item) =>
    plain(filterAdviceSentence({ locale, item, timeZone: "UTC" })),
  );
const dual = { id: "f-1", name: "Double bande Hα/OIII 7 nm" };
const broadband = { id: "f-2", name: "UV/IR cut" };
const component = (name) =>
  readFileSync(
    new URL(`../src/components/${name}.js`, import.meta.url),
    "utf8",
  );

test("the French copy: titles, family lines, buttons", () => {
  assert.equal(message("fr", "plannerOwnedFiltersTitle"), "Filtres possédés");
  assert.equal(message("fr", "plannerOwnedFiltersAdd"), "Ajouter un filtre");
  assert.equal(
    plain(message("fr", "plannerOwnedFilterOptions")),
    "Options du filtre {name}",
  );
  assert.equal(ownedFilterLine("fr", "dual"), "Bande étroite, pour l’émission");
  assert.equal(
    ownedFilterLine("fr", "broadband"),
    "Large bande · toutes cibles",
  );
  assert.equal(ownedFilterLine("fr", "uhc"), "Large bande · ciel périurbain");
  assert.equal(
    ownedFilterLine("fr", "oiii"),
    "Bande étroite · OIII, pour l’émission",
  );
  assert.equal(ownedFilterLine("fr", null), "Famille non reconnue");
  assert.equal(filterAdviceTitle("fr", true), "Conseil pour ce soir");
  assert.equal(filterAdviceTitle("fr", false), "Conseil pour cette nuit");
  assert.equal(
    message("fr", "plannerOwnedFilterManaged"),
    "Géré dans l’inventaire de votre espace",
  );
  assert.equal(message("fr", "plannerOwnedFilterRename"), "Renommer");
  assert.equal(message("fr", "plannerOwnedFilterRemove"), "Retirer");
});

test("the advice, word for word", () => {
  assert.deepEqual(words("fr", advise([dual, broadband])), [
    "Avant 21:05, Lune levée : privilégiez le filtre double bande sur les nébuleuses en émission.",
    "Après son coucher, le UV/IR cut suffit pour les galaxies.",
  ]);
});

test("without the filter that would help, the family is named", () => {
  assert.deepEqual(words("fr", advise([broadband])), [
    "Avant 21:05, Lune levée : un filtre double bande serait utile sur les nébuleuses en émission.",
    "Après son coucher, le UV/IR cut suffit pour les galaxies.",
  ]);
  assert.deepEqual(words("fr", advise([])), [
    "Avant 21:05, Lune levée : un filtre double bande serait utile sur les nébuleuses en émission.",
    "Après son coucher, un filtre UV/IR cut suffirait pour les galaxies.",
  ]);
});

test("every stretch has its sentence, in the three languages, no placeholder left", () => {
  const rising = [-30, -18, -6, 8, 20, 12, -2, -14, -26, -38].map(
    (altitude, index) => ({ time: iso(20 + index), altitude }),
  );
  const cases = [
    filterAdviceForNight({
      ownedFilters: [dual, broadband],
      moonSeries: rising,
      night: { ...night, moonIllumination: 65 },
    }),
    advise([dual, broadband], { moonIllumination: 12 }),
    filterAdviceForNight({
      ownedFilters: [dual],
      moonSeries: sets.map((point) => ({ ...point, altitude: 30 })),
      night,
    }),
    filterAdviceForNight({
      ownedFilters: [],
      moonSeries: sets.map((point) => ({ ...point, altitude: -30 })),
      night,
    }),
  ].flat();
  assert.ok(cases.length >= 6);
  const spans = new Set(cases.map((item) => `${item.key}:${item.span}`));
  for (const locale of ["fr", "en", "ja"])
    for (const sentence of words(locale, cases)) {
      assert.ok(sentence.length > 10, sentence);
      assert.ok(!/[{}]|undefined|null/.test(sentence), sentence);
    }
  assert.ok(spans.size >= 6);
  assert.deepEqual(words("fr", cases.slice(0, 3)), [
    "Avant le lever de la Lune, le UV/IR cut suffit pour les galaxies.",
    "De 22:26 à 01:51, Lune levée : privilégiez le filtre double bande sur les nébuleuses en émission.",
    "Après son coucher, le UV/IR cut suffit pour les galaxies.",
  ]);
});

test("a family has a noun, a capitalised name for a new filter, and a place in the picker", () => {
  assert.deepEqual(ownedFilterFamilyChoices.slice().sort(), [
    "broadband",
    "dual",
    "ha",
    "hb",
    "oiii",
    "sii",
    "uhc",
  ]);
  assert.equal(filterFamilyName("fr", "dual"), "double bande");
  assert.equal(filterFamilyDefaultName("fr", "dual"), "Double bande");
  assert.equal(filterFamilyDefaultName("fr", "ha"), "Hα");
  assert.equal(filterFamilyName("fr", "infrared"), null);
});

test("the advice names a family, never a brand", () => {
  const sentences = words(
    "en",
    advise([{ id: "f", name: "Brand X Duo-band", family: "dual" }]),
  ).join(" ");
  assert.ok(!sentences.includes("Brand"));
  assert.ok(sentences.includes("dual-band"));
});

test("the components: a list with an options menu, a tertiary « Ajouter un filtre », an aside for the advice", () => {
  const owned = component("OwnedFilters");
  assert.match(owned, /className="btn-tertiary planner-owned-filter-add"/);
  assert.match(owned, /aria-haspopup="menu"/);
  assert.match(owned, /role="menuitem"/);
  // The inventory's filters get no rename and no removal.
  assert.match(owned, /managed \?/);
  // Removing is asked first, in the destructive tint.
  assert.match(owned, /tone="danger"/);
  assert.match(component("FilterAdvice"), /<aside/);
});

test("the planner shows both zones in its equipment stage; a visitor keeps the added filters in this browser, a signed-in person's join « Mon matériel »", () => {
  const source = readFileSync(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /\{!auth\.authenticated && \(\s*<OwnedFilters[\s\S]*onAdd=/,
  );
  assert.match(source, /<FilterAdvice/);
  assert.match(source, /plannerOwnedFilters\(\{/);
  assert.match(source, /signedIn: Boolean\(auth\.authenticated\)/);
  assert.match(
    source,
    /action: "import",\s*items: ownedFiltersAsEquipment\(localFilters\)/,
  );
  assert.match(source, /writeOwnedFilters\(storage, next\)/);
});
