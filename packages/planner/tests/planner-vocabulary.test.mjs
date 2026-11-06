// One name for creating a plan, the position written as a common noun in the
// place's own sheet, a zenith limit that reads with its angle, a grid without a
// plural noun, and the reading of "no connection" that is true when only the
// service is down.
import assert from "node:assert/strict";
import test from "node:test";
import { shippedLocales } from "portal/locales.js";
import { message } from "portal/i18n.js";
import { referenceNameInSentence } from "../src/places-copy.js";

test("creating a plan has one name on the web, in each language", () => {
  for (const locale of shippedLocales()) {
    assert.ok(message(locale, "tonightNewPlan"), locale);
    assert.equal(
      message(locale, "plannerAddPlan"),
      message(locale, "tonightNewPlan"),
      locale,
    );
  }
  assert.equal(message("fr", "tonightNewPlan"), "Nouveau plan");
  assert.equal(message("en", "plannerAddPlan"), "New plan");
});

test("the position is a common noun mid-sentence, a saved place keeps its name", () => {
  const position = { name: "Votre position", placeId: null };
  assert.equal(referenceNameInSentence("fr", position), "votre position");
  assert.equal(
    referenceNameInSentence("en", {
      name: "Your position",
      placeId: undefined,
    }),
    "your position",
  );
  assert.equal(
    referenceNameInSentence("fr", { name: "Jardin", placeId: "p1" }),
    "Jardin",
  );
  assert.equal(
    referenceNameInSentence("fr", { name: "Votre position", placeId: "p1" }),
    "Votre position",
  );
});

test("the zenith limit: a label without a dangling degree sign, and a summary label for the value beside it", () => {
  for (const locale of shippedLocales()) {
    assert.doesNotMatch(
      message(locale, "plannerMountZenith"),
      /(^|\s)°(\s|$)/,
      `${locale}: a degree sign with no number`,
    );
    assert.ok(message(locale, "plannerMountZenithSummary"), locale);
    assert.doesNotMatch(message(locale, "plannerMountZenithSummary"), /°/);
  }
});

test("the mosaic grid carries no plural noun to get wrong (1 × 1)", () => {
  assert.equal(
    message("fr", "plannerFramingMosaicComputedGrid"),
    "Grille de {columns} × {rows} avec ce matériel",
  );
  for (const locale of shippedLocales()) {
    for (const key of [
      "plannerFramingMosaicComputedGrid",
      "plannerFramingFieldRecalculated",
    ]) {
      assert.match(
        message(locale, key),
        /\{columns\} × \{rows\}/,
        `${locale} ${key}`,
      );
    }
  }
});

test("« no connection » is not told when only the service is down", () => {
  assert.equal(
    message("fr", "tonightVerdictReasonOffline"),
    "Hors ligne ou service injoignable, aucune prévision gardée.",
  );
  assert.match(
    message("en", "tonightVerdictReasonOffline"),
    /^Offline or service/,
  );
});

test("the French photo / visual favourites toasts read as the list does", () => {
  assert.equal(
    message("fr", "plannerTargetCataloguePhotoFavoriteAdded"),
    "Cible ajoutée aux préférées (photo)",
  );
  assert.equal(
    message("fr", "plannerTargetCatalogueVisualFavoriteRemoved"),
    "Cible retirée des préférées (visuel)",
  );
});
