// The catalogue named after what it holds (« Système solaire ») is read in
// the language of the interface, in every shipped language; every other
// catalogue is a proper name and reads the same everywhere.
import assert from "node:assert/strict";
import test from "node:test";
import { shippedLocales } from "astro-contracts/locales";
import { targetCatalogueLabel } from "../dist/target-catalogues.js";

test("the Solar System catalogue is never left in French on a non-French interface", () => {
  for (const locale of shippedLocales()) {
    const label = targetCatalogueLabel("Système solaire", locale);
    assert.ok(label.length > 0, locale);
    if (locale === "fr") assert.equal(label, "Système solaire");
    else assert.notEqual(label, "Système solaire", locale);
  }
  assert.equal(targetCatalogueLabel("Système solaire", "en"), "Solar System");
});

test("a proper-name catalogue reads the same everywhere", () => {
  for (const locale of shippedLocales()) {
    for (const id of [
      "Messier",
      "NGC",
      "IC",
      "Caldwell",
      "Sharpless",
      "Abell",
    ]) {
      assert.equal(targetCatalogueLabel(id, locale), id);
    }
  }
});
