import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { shippedLocales } from "astro-contracts/locales";
import {
  brightStarCatalogueTargets,
  constellationCatalogueTargets,
} from "../dist/sky-targets.js";
import {
  brightStarTextKey,
  constellationTextKey,
  skyText,
  skyTextChoice,
  skyTextFallbackLocale,
  skyTextKeyOf,
} from "../dist/sky-texts.js";
import { skyTextTable } from "../dist/sky-text-table.js";
import {
  lightYearsPerParsec,
  roundSignificant,
} from "../dist/target-distance.js";

// The facts table and the text files of the 92 bright stars and the 88
// constellations (`sky-data/texts/`). The texts themselves are checked
// against the table by `tests/sky-texts.test.mjs` at the repository root.

const read = (path) =>
  JSON.parse(
    readFileSync(new URL(`../sky-data/${path}`, import.meta.url), "utf8"),
  );
const stars = read("bright-stars.json");
const constellations = read("constellations.json");
const facts = read("texts/facts.json");
const keys = [
  ...stars.map((star) => `hip:${star.hip}`),
  ...constellations.map((row) => row.key),
];

test("the facts table covers the 180 keys, and only them", () => {
  assert.equal(keys.length, 180);
  assert.deepEqual(Object.keys(facts.entries).sort(), [...keys].sort());
  for (const star of stars)
    assert.equal(facts.entries[`hip:${star.hip}`].kind, "star");
  for (const row of constellations)
    assert.equal(facts.entries[row.key].kind, "constellation");
});

test("every fact says how sure it is", () => {
  const unmarked = [];
  const walk = (value, path, isFact) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, true));
      return;
    }
    if (!value || typeof value !== "object") return;
    if (isFact && !["sure", "estimate"].includes(value.confidence))
      unmarked.push(path);
    for (const [key, child] of Object.entries(value))
      // A number inside a fact carries the fact's confidence unless it
      // states its own; a brightest star's magnitude is the data's.
      if (key !== "numbers" && key !== "magnitude")
        walk(child, `${path}.${key}`, false);
  };
  for (const [key, entry] of Object.entries(facts.entries))
    for (const [field, value] of Object.entries(entry))
      if (!["kind", "name"].includes(field))
        walk(value, `${key}.${field}`, !Array.isArray(value));
  for (const [field, value] of Object.entries(facts.common))
    walk(value, `common.${field}`, true);
  assert.deepEqual(unmarked, []);
});

test("the facts of a star are those of the star data", () => {
  const genitive = new Map(
    constellations.map((row) => [row.key, row.genitive]),
  );
  for (const star of stars) {
    const entry = facts.entries[`hip:${star.hip}`];
    const at = `HIP ${star.hip}`;
    assert.equal(entry.name, star.name, at);
    assert.equal(entry.nameKind.value, star.nameKind, at);
    assert.equal(entry.constellation.value, star.constellationHyg, at);
    assert.equal(
      entry.bayer.value,
      `${star.bayerLetter} ${genitive.get(star.constellationHyg)}`,
      at,
    );
    assert.equal(entry.hip.value, star.hip, at);
    assert.equal(entry.hr.value, star.hr, at);
    assert.equal(entry.hd.value, star.hd, at);
    assert.equal(entry.spectralType.value, star.spectralType, at);
    assert.equal(entry.magnitude.value, star.magnitude, at);
    // The distance the catalogue serves, an estimate beyond 150 parsecs.
    assert.equal(
      entry.distance.value,
      roundSignificant(star.distanceParsecs * lightYearsPerParsec, 3),
      at,
    );
    assert.equal(entry.distance.unit, "ly", at);
    if (star.distanceParsecs > 150)
      assert.equal(entry.distance.confidence, "estimate", at);
    assert.ok(entry.finder?.text, at);
    assert.ok(entry.features.length > 0, at);
  }
});

test("the facts of a constellation: area, rank, brightest star, how to find it", () => {
  const ranks = new Set();
  let area = 0;
  for (const row of constellations) {
    const entry = facts.entries[row.key];
    assert.equal(entry.name, row.latinName, row.key);
    assert.equal(entry.area.unit, "deg²", row.key);
    area += entry.area.value;
    ranks.add(entry.areaRank.value);
    assert.ok(
      entry.origin.text && entry.myth.text && entry.finder.text,
      row.key,
    );
    const brightest = entry.brightestStar;
    assert.ok(brightest.value, row.key);
    if (brightest.key) {
      // A constellation that holds bright stars: the brightest of them.
      const star = stars.find((item) => `hip:${item.hip}` === brightest.key);
      assert.equal(star.constellationHyg, row.key, row.key);
      assert.equal(
        star.magnitude,
        Math.min(
          ...stars
            .filter((item) => item.constellationHyg === row.key)
            .map((item) => item.magnitude),
        ),
        row.key,
      );
    } else
      assert.ok(
        !stars.some((item) => item.constellationHyg === row.key),
        row.key,
      );
  }
  assert.equal(ranks.size, 88);
  // The rounded areas add up to the sphere, 41 253 square degrees.
  assert.ok(Math.abs(area - 41253) <= 5, `${area}`);
  assert.equal(facts.entries.Hya.areaRank.value, 1);
  assert.equal(facts.entries.Cru.areaRank.value, 88);
});

test("a text file per shipped language, keyed by the 180 keys, and its table", () => {
  const known = new Set(keys);
  for (const locale of shippedLocales()) {
    const texts = read(`texts/${locale}.json`);
    assert.equal(typeof texts, "object", locale);
    for (const [key, text] of Object.entries(texts)) {
      assert.ok(known.has(key), `${locale}: ${key}`);
      assert.equal(typeof text, "string", `${locale}: ${key}`);
    }
    // The table the service reads is generated from the files
    // (`scripts/generate-sky-text-table.mjs`).
    assert.deepEqual(
      Object.entries(skyTextTable[locale] ?? {}).sort(),
      Object.entries(texts)
        .filter(([, text]) => text.trim())
        .map(([key, text]) => [key, text.trim()])
        .sort(),
      `${locale}: run scripts/generate-sky-text-table.mjs`,
    );
  }
});

test("a text in the asked language, else in English, else none", () => {
  const table = {
    en: { "hip:91262": "Vega in English.", Lyr: "Lyra in English." },
    fr: { "hip:91262": "Véga en français." },
  };
  assert.equal(skyTextFallbackLocale, "en");
  assert.equal(skyText("hip:91262", "fr", table), "Véga en français.");
  assert.equal(skyText("hip:91262", "ja", table), "Vega in English.");
  assert.equal(skyText("Lyr", "fr", table), "Lyra in English.");
  assert.equal(skyText("Ori", "fr", table), null);
  assert.equal(skyText("Ori", "xx"), skyText("Ori", "en"));
  // The choice says which language the text is in.
  assert.deepEqual(skyTextChoice("hip:91262", "fr", table), {
    text: "Véga en français.",
    locale: "fr",
    fallback: false,
  });
  assert.deepEqual(skyTextChoice("Lyr", "fr", table), {
    text: "Lyra in English.",
    locale: "en",
    fallback: true,
  });
  assert.equal(skyTextChoice("Ori", "fr", table), null);
});

test("the text key of a catalogue entry", () => {
  const vega = brightStarCatalogueTargets.find(
    (entry) => entry.stellar.hip === 91262,
  );
  const lyra = constellationCatalogueTargets.find(
    (entry) => entry.constellationKey === "Lyr",
  );
  assert.equal(brightStarTextKey(91262), "hip:91262");
  assert.equal(constellationTextKey("Lyr"), "Lyr");
  assert.equal(skyTextKeyOf(vega), "hip:91262");
  assert.equal(skyTextKeyOf(lyra), "Lyr");
  assert.equal(
    skyTextKeyOf({ typeKey: "Galaxie", constellationKey: "And" }),
    null,
  );
  assert.equal(skyTextKeyOf(null), null);
  for (const entry of [
    ...brightStarCatalogueTargets,
    ...constellationCatalogueTargets,
  ])
    assert.ok(facts.entries[skyTextKeyOf(entry)], entry.id);
});
