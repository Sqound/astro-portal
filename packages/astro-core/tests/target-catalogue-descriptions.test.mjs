// A catalogue's description falls back per catalogue and per language, the
// generic English sentence is gone, and the five catalogues of the third wave
// (Sharpless, LDN, LBN, Abell, Système solaire) read in the ten languages.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  targetCatalogueDescription,
  targetCatalogueInfo,
  targetCatalogueNotorietyOrder,
  targetCatalogueOptions,
} from "../dist/target-catalogues.js";
import { targetCatalogueInfoMore } from "../dist/locale-names-more.js";

const locales = [
  "fr",
  "en",
  "ja",
  "de",
  "es",
  "it",
  "pt-BR",
  "zh-Hans",
  "zh-Hant",
  "ru",
];
const generic =
  "A reference catalogue represented in the local target library.";
const everyCatalogue = [{ catalogues: [...targetCatalogueNotorietyOrder] }];
const descriptions = (targets, locale, stored) =>
  Object.fromEntries(
    targetCatalogueOptions(targets, locale, stored).map((option) => [
      option.id,
      option.description,
    ]),
  );

test("a stored document with Messier in fr, en and ja only: German gets the code's German, Sharpless its text", () => {
  const stored = {
    Messier: { fr: "Document fr.", en: "Document en.", ja: "文書。" },
  };
  const german = descriptions(
    [{ catalogues: ["Messier", "Sharpless"] }],
    "de",
    stored,
  );
  assert.equal(german.Messier, targetCatalogueInfo.Messier.de);
  assert.match(german.Sharpless, /1959/);
  assert.equal(german.Sharpless, targetCatalogueInfo.Sharpless.de);
  // The document still wins in the languages it holds.
  assert.equal(
    descriptions([{ catalogues: ["Messier"] }], "fr", stored).Messier,
    "Document fr.",
  );
  // zh and ru come from the « more » table, not from English.
  assert.equal(
    descriptions([{ catalogues: ["Sharpless"] }], "ru", stored).Sharpless,
    targetCatalogueInfoMore.Sharpless.ru,
  );
});

test("the chain is stored[lang], code[lang], more[lang], stored.en, code.en", () => {
  const stored = {
    Messier: { en: "Stored English." },
    Zeta: { en: "Stored English for an unknown catalogue." },
  };
  // A language nobody wrote: the stored English wins over the code's English.
  assert.equal(
    targetCatalogueDescription("Messier", "ko", stored),
    "Stored English.",
  );
  assert.equal(
    targetCatalogueDescription("Zeta", "fr", stored),
    "Stored English for an unknown catalogue.",
  );
  // Nothing stored for that catalogue: the code's English.
  assert.equal(
    targetCatalogueDescription("NGC", "ko", stored),
    targetCatalogueInfo.NGC.en,
  );
  // No stored document at all, or a null one: the code alone answers.
  assert.equal(
    targetCatalogueDescription("NGC", "fr", null),
    targetCatalogueInfo.NGC.fr,
  );
  assert.equal(
    targetCatalogueDescription("Messier", "zh-Hant"),
    targetCatalogueInfoMore.Messier["zh-Hant"],
  );
});

test("the generic sentence is deleted: a catalogue without text has an empty description", () => {
  assert.equal(
    targetCatalogueOptions([{ catalogues: ["Zeta"] }], "fr")[0].description,
    "",
  );
  const walk = (directory) =>
    readdirSync(directory).flatMap((name) => {
      const path = join(directory, name);
      if (name === "node_modules") return [];
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  const roots = [
    "../src",
    "../dist",
    "../../portal-app/src",
    "../../planner/src",
  ];
  for (const root of roots)
    for (const file of walk(new URL(root, import.meta.url).pathname))
      if (/\.(js|ts|mjs)$/.test(file))
        assert.ok(
          !readFileSync(file, "utf8").includes(generic),
          `${file} still holds the generic sentence`,
        );
});

test("every catalogue of the library reads in each of the ten languages, with no generic sentence", () => {
  for (const locale of locales) {
    const texts = descriptions(everyCatalogue, locale);
    assert.deepEqual(
      Object.keys(texts).toSorted(),
      [...targetCatalogueNotorietyOrder].toSorted(),
    );
    for (const [id, text] of Object.entries(texts)) {
      assert.ok(text.length > 40, `${id} ${locale}`);
      assert.notEqual(text, generic, `${id} ${locale}`);
      if (locale !== "en" && ["Sharpless", "LDN", "LBN", "Abell"].includes(id))
        assert.notEqual(text, texts.Messier, `${id} ${locale}`);
    }
  }
});

test("the five catalogues of the third wave say who, when, what, and what it brings, in every language", () => {
  const year = {
    Sharpless: "1959",
    LBN: "1965",
    LDN: "1962",
    Abell: "1966",
  };
  for (const locale of locales) {
    const texts = descriptions(everyCatalogue, locale);
    for (const [id, expected] of Object.entries(year))
      assert.ok(texts[id].includes(expected), `${id} ${locale}: ${expected}`);
    // The solar system is told apart from a catalogue of fixed objects: it
    // names the Sun and the Moon's company, never a catalogue year.
    assert.ok(!/\b1[89]\d\d\b/.test(texts["Système solaire"]), locale);
  }
  // French is the reference: « H II » as the other languages write it.
  assert.match(targetCatalogueInfo.Sharpless.fr, /régions H II/);
});

test("the description is the same function on the service and in the options", () => {
  const stored = { Abell: { fr: "Texte enregistré." } };
  const options = targetCatalogueOptions(
    [{ catalogues: ["Abell", "LDN"] }],
    "fr",
    stored,
  );
  assert.equal(
    options.find((option) => option.id === "Abell").description,
    targetCatalogueDescription("Abell", "fr", stored),
  );
  assert.equal(
    options.find((option) => option.id === "LDN").description,
    targetCatalogueInfo.LDN.fr,
  );
});
