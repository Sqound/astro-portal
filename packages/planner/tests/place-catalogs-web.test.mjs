// The words of the places of the space in the ten catalogues — every new key
// in every language, the same placeholders everywhere, the French typography,
// and the vocabulary: "lieu idéal" names our suggestions only.
import assert from "node:assert/strict";
import test from "node:test";
import { shippedLocales } from "portal/locales.js";
import { messages } from "portal/i18n.js";

const keys = [
  "placesUse",
  "placesUseSemantics",
  "placesDuplicate",
  "placesDuplicateLine",
  "placesDuplicateInfo",
  "placesVisitorLine",
  "placesVisitorInfo",
  "placeHorizonMaskSaved",
  "placeTimeZone",
  "placeTimeZoneDeduced",
  "placeTimeZoneUnset",
  "placeDeleteAction",
  "placeDeleteTitle",
  "placeDeleteBody",
  "placeDeleteDialogLabel",
  "placeInUseTitle",
  "placeInUseBodyOne",
  "placeInUseBodyMany",
  "placeUsageLabel",
  "placeUsedByOne",
  "placeUsedByMany",
  "placeUsageToRun",
  "placeNoteTitle",
  "placeIdealEntry",
  "placeIdealEntryHelp",
  "placeTypeLabel",
  "placesKindPrivate",
  "placeOsmTitle",
  "placeOsmSeeOn",
  "placeOsmDetach",
  "placeNoteLabel",
  "placeDuplicateSave",
  "placeDuplicateOpen",
  "placesReadOnly",
  "placesReadFailed",
  "placesWriteFailed",
  "placesDeleteFailed",
  "placesDefaultFailed",
  "placesImportFailed",
  "placePickerFind",
];
const placeholders = (text) =>
  (text.match(/\{[a-zA-Z]+\}/g) || []).sort().join();

test("the ten catalogues hold every key of the lot", () => {
  assert.equal(shippedLocales().length, 10);
  for (const locale of shippedLocales())
    for (const key of keys) {
      const text = messages[locale][key];
      assert.ok(typeof text === "string" && text.trim(), `${locale} ${key}`);
    }
});

test("every language keeps the placeholders of the French sentence, and none leaves a key unwritten", () => {
  for (const key of keys)
    for (const locale of shippedLocales())
      assert.equal(
        placeholders(messages[locale][key]),
        placeholders(messages.fr[key]),
        `${locale} ${key}`,
      );
});

test("the French words are the specified ones, with the typography of the language", () => {
  const fr = messages.fr;
  const nbsp = " ";
  assert.equal(fr.placeDeleteAction, "Retirer de mes lieux");
  assert.equal(fr.placeInUseTitle, "Ce lieu est utilisé");
  assert.equal(fr.placesDuplicate, "Doublon possible");
  assert.equal(fr.placeIdealEntry, "Trouver un lieu idéal");
  assert.equal(fr.placePickerFind, "Trouver un lieu idéal");
  assert.equal(fr.placeNoteLabel, "Note (facultatif)");
  assert.equal(fr.placeTimeZone, "Fuseau horaire");
  // The web removes a place from "mes lieux" (the title of the dialog is the
  // removal's).
  assert.equal(fr.placeDeleteTitle, fr.placeRemoveConfirmTitle);
  assert.match(
    fr.placeDeleteTitle,
    /^Retirer\u00a0«\u00a0\{place\}\u00a0» de vos lieux\u00a0\?$/,
  );
  assert.equal(
    fr.placesDuplicateLine,
    `Deux lieux semblent identiques${nbsp}: «${nbsp}{first}${nbsp}» et «${nbsp}{second}${nbsp}», à {distance} l’un de l’autre.`,
  );
  for (const key of keys)
    assert.ok(
      !/ [:;?!»]|« /.test(fr[key]),
      `${key}: a plain space before a French mark`,
    );
});

test("« idéal » is the entry's word: « Mes lieux » and the saved places never say it", () => {
  for (const locale of shippedLocales())
    assert.equal(
      messages[locale].placePickerFind,
      messages[locale].placeIdealEntry,
      locale,
    );
  for (const key of [
    "placesTabMine",
    "placePickerSaved",
    "placePickerTitle",
    "placesAdd",
    "placesNoneSaved",
    "placeDeleteAction",
    "placeUsageLabel",
  ])
    assert.ok(
      !/idéal|ideal|ideale|ideal|идеальн|理想/i.test(
        messages.fr[key] + messages.en[key],
      ),
      key,
    );
  assert.equal(messages.fr.placesTabSuggested, "Lieux suggérés");
});

test("the vocabulary of the interface: « espace », never « compte » (fr); the plans are « plans », not « sessions »", () => {
  for (const key of keys) {
    assert.ok(!/\bcompte\b|\bsession\b|projet/i.test(messages.fr[key]), key);
  }
  assert.match(messages.fr.placesVisitorInfo, /espace/);
});

test("the former action sheet and the removal link have no words left in any language", () => {
  for (const locale of shippedLocales())
    assert.ok(!("placesActionsLabel" in messages[locale]), locale);
});
