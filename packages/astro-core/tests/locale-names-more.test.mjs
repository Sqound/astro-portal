import assert from "node:assert/strict";
import test from "node:test";
import {
  objectTypes,
  taxonomyLabel,
  taxonomyLabels,
} from "../dist/catalog-taxonomy.js";
import {
  localizedPlannerName,
  plannerNameLabels,
  plannerCatalogue,
} from "../dist/planner-targets.js";
import {
  localizedTargetCommonName,
  targetCommonNameLabels,
} from "../dist/target-common-names.js";
import {
  targetCatalogueInfo,
  targetCatalogueOptions,
} from "../dist/target-catalogues.js";
import { constellationTable } from "../dist/constellations.js";
import {
  commonNamesMore,
  plannerNamesMore,
  targetCatalogueInfoMore,
  taxonomyNamesMore,
} from "../dist/locale-names-more.js";

// The names of the second batch of languages, kept beside the tables they
// complete: every key exists, every name is the language's own, and a locale
// without a name still reads English.
const locales = ["zh-Hans", "zh-Hant", "ru"];
const han = /[一-鿿]/u;
const cyrillic = /[Ѐ-ӿ]/u;
const script = (locale) => (locale === "ru" ? cyrillic : han);

test("every object type and capture category has a name in each of the three languages", () => {
  for (const key of Object.keys(taxonomyLabels)) {
    for (const locale of locales) {
      const name = taxonomyNamesMore[key]?.[locale];
      assert.ok(name, `${key} ${locale}`);
      assert.ok(script(locale).test(name), `${key} ${locale}: ${name}`);
      assert.equal(taxonomyLabel(key, locale), name);
    }
  }
  assert.ok(objectTypes.every((type) => type in taxonomyNamesMore));
});

test("the 88 constellations are named, in the language's own script", () => {
  assert.equal(constellationTable.length, 88);
  for (const row of constellationTable)
    for (const locale of locales) {
      const name = row.names[locale];
      assert.ok(script(locale).test(name), `${row.key} ${locale}: ${name}`);
      assert.equal(taxonomyLabel(row.key, locale), name);
    }
  assert.equal(taxonomyLabel("And", "zh-Hans"), "仙女座");
  assert.equal(taxonomyLabel("UMa", "ru"), "Большая Медведица");
  // An older spelling of the key reads the same name.
  assert.equal(taxonomyLabel("Andromède", "zh-Hans"), "仙女座");
  assert.equal(taxonomyLabel("Grande Ourse", "ru"), "Большая Медведица");
});

test("a locale without a name reads English, never the French key", () => {
  assert.equal(taxonomyLabel("Galaxie", "en-XA"), "Galaxy");
  assert.equal(taxonomyLabel("And", "en-XA"), "Andromeda");
  assert.equal(
    localizedPlannerName("Nébuleuse du Crabe", "en-XA"),
    "Crab Nebula",
  );
  assert.equal(
    localizedTargetCommonName({ designation: "IC 2602" }, "en-XA"),
    targetCommonNameLabels["IC 2602"][1],
  );
});

test("the planner's curated names and the common names are written in each language", () => {
  assert.deepEqual(
    Object.keys(plannerNamesMore),
    Object.keys(plannerNameLabels),
  );
  assert.deepEqual(
    Object.keys(commonNamesMore),
    Object.keys(targetCommonNameLabels),
  );
  for (const locale of locales) {
    assert.ok(script(locale).test(localizedPlannerName("Jupiter", locale)));
    assert.ok(
      script(locale).test(
        localizedTargetCommonName({ designation: "IC 2602" }, locale),
      ),
    );
  }
  assert.equal(localizedPlannerName("Jupiter", "zh-Hans"), "木星");
  assert.equal(localizedPlannerName("Jupiter", "ru"), "Юпитер");
  assert.equal(
    localizedTargetCommonName({ designation: "Jupiter" }, "zh-Hant"),
    "木星",
  );
});

test("the six catalogue descriptions are written in each language, facts kept", () => {
  assert.deepEqual(
    Object.keys(targetCatalogueInfoMore),
    Object.keys(targetCatalogueInfo),
  );
  const options = (locale) =>
    targetCatalogueOptions(
      [{ catalogues: ["Messier", "NGC"] }, { catalogues: ["Messier"] }],
      locale,
    );
  for (const locale of locales) {
    const messier = options(locale).find((option) => option.id === "Messier");
    assert.ok(script(locale).test(messier.description), locale);
    assert.match(messier.description, /110/, `${locale}: 110 objects`);
    assert.notEqual(messier.description, options("en")[0].description);
  }
});

test("IC 434 keeps its designation; the Horsehead common name belongs to B033", () => {
  const background = plannerCatalogue.find(
    (target) => target.designation === "IC 434",
  );
  assert.equal(background.name, "");
  assert.equal(background.title, "IC 434");
  for (const locale of [
    "en",
    "fr",
    "ja",
    "de",
    "es",
    "it",
    "pt-BR",
    "zh-Hans",
    "zh-Hant",
    "ru",
  ]) {
    assert.equal(
      localizedTargetCommonName({ designation: "IC 434" }, locale),
      null,
    );
    assert.ok(localizedTargetCommonName({ designation: "B033" }, locale));
  }
});
