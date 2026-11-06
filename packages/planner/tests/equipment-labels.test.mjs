import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { localeKeyGaps, message } from "portal/i18n.js";
import { modifierChoices, modifierName } from "../src/equipment-labels.js";
import { opticalModifiers } from "../src/planner.js";

// Seen in a new installation in English: the entry "no reducer" of the Reducer
// / Barlow selector read "Aucun" in every language, and the custom equipment
// fields carried a label that names nothing ("Equipment" for a telescope, a
// camera, an eyepiece, a reducer). The web planner had both.

const locales = ["en", "fr", "ja"];

test("the entry without a modifier is named in the language of the interface", () => {
  const none = opticalModifiers.find((profile) => profile.id === "none");
  assert.equal(modifierName("en", none), "None");
  assert.equal(modifierName("fr", none), "Aucun");
  assert.equal(modifierName("ja", none), "なし");
});

test("the three built-in entries are named in the language of the interface, by id", () => {
  const byId = (id) => opticalModifiers.find((profile) => profile.id === id);
  const expected = {
    none: { en: "None", fr: "Aucun", ja: "なし" },
    reducer: {
      en: "Reducer 0.8×",
      fr: "Réducteur 0,8×",
      ja: "レデューサー 0.8×",
    },
    barlow: { en: "Barlow 2×", fr: "Barlow 2×", ja: "バーロー 2×" },
  };
  for (const [id, names] of Object.entries(expected))
    for (const locale of locales)
      assert.equal(
        modifierName(locale, byId(id)),
        names[locale],
        `${locale} ${id}`,
      );
  assert.equal(modifierName("en", null), "");
  // A French word never reaches an English or a Japanese screen.
  for (const locale of ["en", "ja"])
    for (const choice of modifierChoices(locale, opticalModifiers))
      assert.doesNotMatch(
        choice.name,
        /Aucun|Réducteur/,
        `${locale} ${choice.id}`,
      );
});

test("an entry the person made keeps the name they typed, even one that reads like a built-in", () => {
  for (const locale of locales) {
    assert.equal(
      modifierName(locale, {
        id: "inv-77",
        name: "Réducteur 0,8×",
        multiplier: 0.8,
      }),
      "Réducteur 0,8×",
    );
    assert.equal(
      modifierName(locale, { id: "inv-1", name: "Aucun", multiplier: 1 }),
      "Aucun",
    );
  }
});

test("the choices never change what is stored or exchanged: same ids, same multipliers, the data untouched", () => {
  const before = JSON.stringify(opticalModifiers);
  for (const locale of locales) {
    const choices = modifierChoices(locale, opticalModifiers);
    assert.deepEqual(
      choices.map((profile) => profile.id),
      opticalModifiers.map((profile) => profile.id),
    );
    assert.deepEqual(
      choices.map((profile) => profile.multiplier),
      opticalModifiers.map((profile) => profile.multiplier),
    );
  }
  assert.equal(JSON.stringify(opticalModifiers), before);
  assert.deepEqual(
    opticalModifiers.slice(0, 3).map((profile) => profile.name),
    ["Aucun", "Réducteur 0,8×", "Barlow 2×"],
    "what is stored and exchanged is the same as before",
  );
  assert.notEqual(
    modifierChoices("en", opticalModifiers)[0],
    opticalModifiers[0],
  );
});

test("an inventory that names its own entry is shown in the same way", () => {
  const choices = modifierChoices("en", [
    { id: "none", name: "Aucun", multiplier: 1 },
    { id: "lens-1", name: "My 0.7× reducer", multiplier: 0.7 },
  ]);
  assert.deepEqual(
    choices.map((profile) => profile.name),
    ["None", "My 0.7× reducer"],
  );
});

const fieldKeys = [
  "plannerModifierNone",
  "plannerModifierReducer",
  "plannerModifierBarlow",
];

test("every label exists in en, fr and ja, and the custom fields' labels are gone", () => {
  for (const locale of locales)
    for (const key of fieldKeys) {
      const text = message(locale, key);
      assert.ok(text && text !== key, `${locale}.${key} is missing`);
    }
  // « Personnalisé… » and its free fields left the pickers with their words.
  for (const locale of locales)
    for (const key of [
      "plannerCustom",
      "plannerTelescopeName",
      "plannerCameraName",
      "plannerEyepieceName",
      "plannerModifierName",
      "plannerSensorWidth",
      "plannerSensorHeight",
      "plannerAperture",
      "plannerFocalLength",
      "plannerEyepieceApparentField",
      "plannerMultiplier",
      "tonightPlanEquipmentCustom",
    ])
      assert.equal(message(locale, key), key, `${locale}.${key} remains`);
  const gaps = localeKeyGaps();
  for (const [locale, { missing, extra }] of Object.entries(gaps)) {
    assert.deepEqual(missing, [], `${locale} misses keys`);
    assert.deepEqual(extra, [], `${locale} has extra keys`);
  }
});

test("the page has no custom equipment fields and draws the modifier list through the helper", async () => {
  const source = await readFile(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  // « Personnalisé… » and its fields are gone: nothing chosen reads
  // « Choisir… ».
  for (const key of [
    "plannerCustom",
    "plannerTelescopeName",
    "plannerCameraName",
    "plannerEyepieceName",
    "plannerModifierName",
    "plannerSensorWidth",
    "plannerSensorHeight",
  ])
    assert.doesNotMatch(
      source,
      new RegExp(`message\\(\\s*locale,\\s*"${key}"`),
      key,
    );
  assert.doesNotMatch(source, /custom(Telescope|Camera|Eyepiece|Modifier)/);
  assert.match(source, /"plannerEquipmentChoose"/);
  // The three lists of modifiers (the page's select, the map's control and
  // the framing editor's) go through the helper, never the raw profiles.
  assert.doesNotMatch(source, /\.\.\.plannerModifiers,/);
  assert.doesNotMatch(source, /plannerModifiers\.map\(/);
  assert.match(source, /modifierChoices\(locale, plannerModifiers\)/);
});
