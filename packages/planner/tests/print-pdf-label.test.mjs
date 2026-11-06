import assert from "node:assert/strict";
import test from "node:test";
import { message } from "portal/i18n.js";

// The web keeps the browser's print dialog, which saves a PDF on every
// platform; the action says so instead of promising paper only.
test("the print action says it also saves a PDF, in the three languages", () => {
  assert.equal(message("en", "plannerPrint"), "Print or save as PDF");
  assert.equal(message("fr", "plannerPrint"), "Imprimer ou enregistrer en PDF");
  assert.equal(message("ja", "plannerPrint"), "印刷または PDF として保存");
});

test("the print choice dialog's title carries the same words", () => {
  for (const locale of ["en", "fr", "ja"]) {
    assert.match(message(locale, "plannerPrintChoiceTitle"), /PDF/);
  }
});
