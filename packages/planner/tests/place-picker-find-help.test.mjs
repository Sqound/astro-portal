// The label "Trouver un lieu idéal" is kept in the ten languages; the one-line
// help that stood under it was removed: the choice speaks for itself.
// ("Suggérés pour la nuit, pas une recherche d’adresse" was its French text.)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { message } from "portal/i18n.js";
import { shippedLocales } from "portal/locales.js";

const picker = readFileSync(
  new URL("../src/components/PlacePickerSheet.js", import.meta.url),
  "utf8",
);

test("French: « Trouver un lieu idéal »; the other two choices are unchanged", () => {
  assert.equal(message("fr", "placePickerFind"), "Trouver un lieu idéal");
  assert.equal(message("fr", "placePickerUsePosition"), "Utiliser ma position");
  assert.equal(
    message("fr", "placePickerAddByHand"),
    "Ajouter un lieu à la main",
  );
  assert.doesNotMatch(message("fr", "placePickerFind"), /Rechercher/);
  assert.notEqual(message("fr", "placePickerFind"), "Trouver un lieu");
  assert.notEqual(message("fr", "placePickerFind"), "Lieux idéaux suggérés");
});

test("the ten languages have a label of their own and no help line any more", () => {
  assert.equal(shippedLocales().length, 10);
  const labels = new Set();
  for (const locale of shippedLocales()) {
    const label = message(locale, "placePickerFind");
    assert.ok(label, locale);
    assert.doesNotMatch(label, /\n/, `${locale}: one line`);
    labels.add(label);
    if (locale !== "fr") {
      assert.notEqual(label, message("fr", "placePickerFind"), locale);
    }
    assert.equal(
      message(locale, "placePickerFindHelp"),
      "placePickerFindHelp",
      `${locale}: the help key is gone`,
    );
  }
  assert.equal(labels.size, 10, "each language has its own wording");
});

test("the picker no longer shows a help line", () => {
  assert.ok(!picker.includes("placePickerFindHelp"));
  assert.ok(!picker.includes("places-picker-find-help"));
});
