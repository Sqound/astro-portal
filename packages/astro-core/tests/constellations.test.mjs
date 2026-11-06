import assert from "node:assert/strict";
import test from "node:test";
import { shippedLocales } from "astro-contracts/locales";
import { taxonomyLabel } from "../dist/catalog-taxonomy.js";
import {
  canonicalConstellationKey,
  constellationByKey,
  constellationKeys,
  constellationName,
  constellationNames,
  constellationTable,
  foldConstellationName,
} from "../dist/constellations.js";

// The 88 IAU constellations: their catalogue key is the abbreviation, their
// names are in the ten languages of the application, and every older spelling
// the catalogue carried names the same constellation.

test("88 constellations, keyed by their IAU abbreviation, each named in every language of the application", () => {
  assert.equal(constellationTable.length, 88);
  assert.equal(new Set(constellationKeys).size, 88);
  const locales = shippedLocales();
  assert.equal(locales.length, 10);
  for (const row of constellationTable) {
    assert.match(row.key, /^[A-Z][A-Za-z]{2}$/, row.key);
    assert.ok(row.latinName && row.genitive && row.englishName, row.key);
    for (const locale of locales)
      assert.ok(row.names[locale]?.trim(), `${row.key} ${locale}`);
    assert.equal(row.names.en, row.latinName);
    assert.ok(row.linesRadiusDegrees > 0 && row.linesRadiusDegrees < 90);
    assert.ok(
      row.centreRightAscensionHours >= 0 && row.centreRightAscensionHours < 24,
    );
    assert.ok(Math.abs(row.centreDeclinationDegrees) <= 90);
  }
  // Three of them have no drawing in the sky culture, the rest have one.
  assert.deepEqual(
    constellationTable.filter((row) => !row.hasDrawing).map((row) => row.key),
    ["Pup", "Ser", "Vel"],
  );
});

test("no gap, no leftover English label: the names are the names of the constellation", () => {
  for (const row of constellationTable) {
    // The Latin name has no « Air Pump », « Bird of Paradise »: those are
    // spellings of the old key, kept as aliases.
    assert.notEqual(row.names.en, "Air Pump");
    assert.notEqual(row.names.en, "Bird of Paradise");
    // Each language names it in its own script.
    assert.match(row.names.ja, /[ぁ-んァ-ヶ一-鿿]/u, row.key);
    assert.match(row.names["zh-Hans"], /[一-鿿]/u, row.key);
    assert.match(row.names["zh-Hant"], /[一-鿿]/u, row.key);
    assert.match(row.names.ru, /[Ѐ-ӿ]/u, row.key);
  }
  assert.equal(constellationName("Ant", "fr"), "Machine pneumatique");
  assert.equal(constellationName("Aps", "fr"), "Oiseau de paradis");
  assert.equal(constellationName("Car", "fr"), "Carène");
  assert.equal(constellationName("Car", "de"), "Kiel des Schiffs");
  assert.equal(constellationName("Boo", "en"), "Boötes");
});

test("no two constellations share a name in one language", () => {
  for (const locale of shippedLocales()) {
    const seen = new Map();
    for (const row of constellationTable) {
      const folded = foldConstellationName(row.names[locale]);
      assert.ok(
        !seen.has(folded),
        `${locale}: ${row.names[locale]} is ${seen.get(folded)} and ${row.key}`,
      );
      seen.set(folded, row.key);
    }
  }
});

test("a name, an abbreviation or an older spelling resolves to the catalogue key", () => {
  const cases = [
    ["Lyr", "Lyr"],
    ["lyr", "Lyr"],
    ["Lyre", "Lyr"],
    ["Lyra", "Lyr"],
    ["こと座", "Lyr"],
    ["Лира", "Lyr"],
    ["Leier", "Lyr"],
    // The old key of the Serpent, in two parts; the Carina's abbreviation.
    ["Se1", "Ser"],
    ["Se2", "Ser"],
    ["Serpent", "Ser"],
    ["Serpens", "Ser"],
    ["Car", "Car"],
    ["Carène", "Car"],
    // The labels that had slipped in, and the diaeresis.
    ["Air Pump", "Ant"],
    ["Bird of Paradise", "Aps"],
    ["Boötes", "Boo"],
    ["Bootes", "Boo"],
    ["bouvier", "Boo"],
    ["Écu de Sobieski", "Sct"],
    ["ecu de sobieski", "Sct"],
    ["Chiens de chasse", "CVn"],
    ["Canes Venatici", "CVn"],
    ["Triangle austral", "TrA"],
    ["  Grande Ourse ", "UMa"],
    ["Ursa Major", "UMa"],
    ["CrB", "CrB"],
  ];
  for (const [spelling, key] of cases)
    assert.equal(canonicalConstellationKey(spelling), key, spelling);
  for (const nothing of [
    "Système solaire",
    "",
    "Galaxie",
    "zzz",
    null,
    undefined,
    7,
  ])
    assert.equal(canonicalConstellationKey(nothing), null, String(nothing));
  // « Compass » is both Pyxis and Circinus in English: it names neither.
  assert.equal(canonicalConstellationKey("Compass"), null);
  assert.equal(constellationByKey("Lyr").latinName, "Lyra");
  assert.equal(constellationByKey("Lyre"), undefined);
});

test("every localized name resolves back to its constellation", () => {
  for (const row of constellationTable)
    for (const name of [row.key, row.latinName, ...Object.values(row.names)])
      assert.equal(canonicalConstellationKey(name), row.key, name);
});

test("the taxonomy reads a constellation by key or by any older spelling", () => {
  assert.equal(taxonomyLabel("Lyr", "fr"), "Lyre");
  assert.equal(taxonomyLabel("Lyr", "ja"), "こと座");
  assert.equal(taxonomyLabel("Lyr", "de"), "Leier");
  assert.equal(taxonomyLabel("Lyr", "en-XA"), "Lyra");
  assert.equal(taxonomyLabel("Lyre", "ja"), "こと座");
  assert.equal(taxonomyLabel("Se2", "fr"), "Serpent");
  assert.equal(taxonomyLabel("Car", "ru"), "Киль");
  assert.equal(taxonomyLabel("Système solaire", "en"), "Solar System");
  // A stored document may rename a constellation, under the older key.
  assert.equal(
    taxonomyLabel("Lyr", "fr", {
      constellationLabels: { Lyre: { en: "Lyre", ja: "琴", fr: "La Lyre" } },
    }),
    "La Lyre",
  );
  assert.equal(Object.keys(constellationNames).length, 88);
});
