// The photo / visual button of « À voir ce soir » on the web (the app's
// TONIGHT-SUGGESTIONS-MODE-01): the mode kept in this browser, the rule of
// before the first time, the equipment of the mode shown, the binoculars rule
// and the two lines it writes, in every shipped language.
import assert from "node:assert/strict";
import test from "node:test";
import { shippedLocales } from "astro-contracts/locales";
import { message } from "portal/i18n.js";
import {
  observingBinoculars,
  readTonightSuggestionsMode,
  subscribeTonightSuggestionsMode,
  tonightSuggestionsEquipment,
  tonightSuggestionsMode,
  tonightSuggestionsModeLine,
  tonightSuggestionsModeStorageKey,
  tonightVisualFactsLine,
  visualInstrumentFor,
  writeTonightSuggestionsMode,
} from "../src/tonight-suggestions-mode.js";
import { createWebQuickPlanAction } from "../src/quick-plan-web.js";

const memory = () => {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
  };
};

const target = (id, magnitude, size, type) => ({
  id,
  designation: id.toUpperCase(),
  skyTarget: { typeKey: type, type },
  apparentSizeArcmin: [size, size],
  integratedMagnitude: magnitude,
});
const m13 = target("m13", 5.8, 16.5, "Amas globulaire");
const m27 = target("m27", 7.4, 6.7, "Nébuleuse planétaire");
const m57 = target("m57", 8.8, 1.3, "Nébuleuse planétaire");
// Maison, a city sky.
const city = { sqm: 18.1 };

test("the choice is kept in this browser and told to the page", () => {
  const storage = memory();
  assert.equal(readTonightSuggestionsMode(storage), null);
  const heard = [];
  const stop = subscribeTonightSuggestionsMode(
    (mode) => heard.push(mode),
    null,
  );
  assert.equal(writeTonightSuggestionsMode("visual", storage), true);
  assert.equal(storage.getItem(tonightSuggestionsModeStorageKey), "visual");
  assert.equal(readTonightSuggestionsMode(storage), "visual");
  assert.deepEqual(heard, ["visual"]);
  assert.equal(writeTonightSuggestionsMode("smart", storage), false);
  stop();
  writeTonightSuggestionsMode("imaging", storage);
  assert.deepEqual(heard, ["visual"]);
  // A store that cannot be read means nothing chosen.
  assert.equal(
    readTonightSuggestionsMode({
      getItem() {
        throw new Error("blocked");
      },
    }),
    null,
  );
});

test("the first time, the rule of before; then the person's choice", () => {
  assert.equal(tonightSuggestionsMode({}), "imaging");
  assert.equal(
    tonightSuggestionsMode({ defaultConfiguration: { mode: "visual" } }),
    "visual",
  );
  assert.equal(
    tonightSuggestionsMode({
      planEquipment: { mode: "imaging" },
      defaultConfiguration: { mode: "visual" },
    }),
    "imaging",
  );
  assert.equal(
    tonightSuggestionsMode({
      chosen: "visual",
      planEquipment: { mode: "imaging" },
    }),
    "visual",
  );
});

test("the equipment of the mode shown: the night's own while it is of that mode, else one of that mode", () => {
  const own = { mode: "imaging", telescopeId: "t" };
  assert.equal(tonightSuggestionsEquipment({ mode: "imaging", own }), own);
  const visualPlan = { equipment: { mode: "visual", eyepieceId: "e" } };
  assert.equal(
    tonightSuggestionsEquipment({
      mode: "visual",
      own,
      plans: [{ equipment: own }, visualPlan],
    }),
    visualPlan.equipment,
  );
  assert.deepEqual(
    tonightSuggestionsEquipment({
      mode: "visual",
      own,
      configurationStart: { mode: "visual", telescopeId: "c" },
    }),
    { mode: "visual", telescopeId: "c" },
  );
  // No rig of that mode: the list is made anyway.
  assert.deepEqual(
    tonightSuggestionsEquipment({
      mode: "visual",
      own,
      inventoryStart: { telescopeId: null },
    }),
    { telescopeId: null, mode: "visual" },
  );
});

test("the rule reads the binoculars of « Mon matériel » first, else the common 7×50", () => {
  const own = {
    id: "own-binoculars",
    kind: "binoculars",
    apertureMm: 100,
    magnification: 25,
    exitPupilMm: 4,
    trueFieldDegrees: 2.7,
  };
  assert.equal(observingBinoculars([]).id, "nikon-aculon-a211-7x50");
  // A common model the list adds for everyone is not the person's.
  assert.equal(
    observingBinoculars([{ id: "nikon-aculon-a211-7x35", isBinoculars: true }])
      .id,
    "nikon-aculon-a211-7x50",
  );
  assert.equal(
    observingBinoculars([{ id: "t", kind: "telescope" }, own]).id,
    own.id,
  );
  assert.equal(visualInstrumentFor(m57, city), "telescope");
  assert.equal(visualInstrumentFor(m57, city, own), "binoculars");
});

test("the binoculars rule (7×50, one magnitude of margin) on three targets under a city sky", () => {
  assert.equal(visualInstrumentFor(m13, city), "binoculars");
  assert.equal(visualInstrumentFor(m27, city), "telescope");
  assert.equal(visualInstrumentFor(m57, city), "telescope");
  assert.equal(visualInstrumentFor({ id: "x" }, city), null);
  assert.equal(
    visualInstrumentFor({ id: "jupiter", tags: ["planet"] }, city),
    "telescope",
  );
  // The same numbers as the app's rule.
  assert.equal(
    tonightVisualFactsLine("fr", m13, city),
    "Mag\u00a05,8 · 16,5′ · Aux\u00a0jumelles",
  );
  assert.equal(
    tonightVisualFactsLine("fr", m57, city),
    "Mag\u00a08,8 · 1,3′ · Au\u00a0télescope",
  );
  assert.equal(tonightVisualFactsLine("fr", {}, city), null);
});

test("the line under the title, and its second ten", () => {
  assert.equal(
    tonightSuggestionsModeLine("fr", {
      mode: "imaging",
      tier: 1,
      placeName: "Maison",
    }),
    "Suggestions pour la photo · Maison",
  );
  assert.equal(
    tonightSuggestionsModeLine("fr", {
      mode: "visual",
      tier: 1,
      placeName: "Maison",
    }),
    "Suggestions pour le visuel · Maison",
  );
  assert.equal(
    tonightSuggestionsModeLine("fr", {
      mode: "imaging",
      tier: 2,
      placeName: "Maison",
    }),
    "Suggestions 11 à 20 · photo · Maison",
  );
  assert.equal(
    tonightSuggestionsModeLine("fr", { mode: "imaging", tier: 1 }),
    null,
  );
  assert.equal(
    message("fr", "tonightSuggestionsModePhoto"),
    "Suggestions : photo",
  );
});

test("every shipped language words the button, the lines and the facts", () => {
  for (const locale of shippedLocales()) {
    for (const key of [
      "tonightSuggestionsModePhoto",
      "tonightSuggestionsModeVisual",
      "tonightVisualBinoculars",
      "tonightVisualTelescope",
    ]) {
      const text = message(locale, key);
      assert.ok(text && text !== key, `${locale} ${key}`);
      if (locale !== "en")
        assert.notEqual(text, message("en", key), `${locale} ${key}`);
    }
    for (const mode of ["imaging", "visual"])
      for (const tier of [1, 2]) {
        const line = tonightSuggestionsModeLine(locale, {
          mode,
          tier,
          placeName: "Maison",
        });
        assert.match(line, /Maison/, locale);
        assert.ok(!line.includes("{"), `${locale} ${line}`);
        if (tier === 2) assert.match(line, /11.*20/, locale);
      }
    const facts = tonightVisualFactsLine(locale, m13, city);
    assert.ok(!facts.includes("{"), `${locale} ${facts}`);
    assert.ok(
      facts.endsWith(
        message(locale, "tonightVisualBinoculars").replaceAll(" ", "\u00a0"),
      ),
    );
  }
});

test("a plan made from the list carries the equipment of the mode shown", async () => {
  const action = createWebQuickPlanAction({
    document: { plans: [] },
    date: "2026-10-14",
    location: { id: "maison", name: "Maison", latitude: 45, longitude: 5 },
    locale: "fr",
    equipment: { mode: "visual", eyepieceId: "e" },
    inputsFor: async () => ({}),
    storage: memory(),
    fetcher: async () => ({ ok: true, json: async () => ({}) }),
  });
  assert.equal(action.newSettings.equipment.mode, "visual");
  const before = createWebQuickPlanAction({
    document: { plans: [] },
    date: "2026-10-14",
    location: { id: "maison", name: "Maison", latitude: 45, longitude: 5 },
    locale: "fr",
    inputsFor: async () => ({}),
    storage: memory(),
    fetcher: async () => ({ ok: true, json: async () => ({}) }),
  });
  assert.equal(before.newSettings.equipment.mode, "imaging");
});
