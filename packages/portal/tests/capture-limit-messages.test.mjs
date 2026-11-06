import assert from "node:assert/strict";
import test from "node:test";
import { message, messages } from "../dist/i18n.js";

// The words of the capture limit refusal and of the usage line of the
// captures tab, in the web messages.

const KEYS = ["captureLimitRefused", "captureLimitHint", "captureCountOfLimit"];

test("the French words, to the character", () => {
  assert.equal(
    message("fr", "captureLimitRefused")
      .replace("{file}", "IMG_2042.jpg")
      .replace("{limit}", "3"),
    "IMG_2042.jpg n’a pas été ajoutée : votre espace gratuit garde 3 captures.",
  );
  assert.equal(
    message("fr", "captureLimitHint"),
    "Supprimez une capture, ou choisissez une offre de stockage.",
  );
  assert.equal(
    message("fr", "captureCountOfLimit")
      .replace("{count}", "2")
      .replace("{limit}", "3"),
    "2 captures sur 3",
  );
});

test("the ten languages carry the three messages with their placeholders", () => {
  const locales = Object.keys(messages);
  assert.equal(locales.length, 10);
  for (const locale of locales) {
    for (const key of KEYS)
      assert.ok(
        typeof messages[locale][key] === "string" && messages[locale][key],
        `${locale}: ${key}`,
      );
    assert.ok(messages[locale].captureLimitRefused.includes("{file}"), locale);
    assert.ok(messages[locale].captureLimitRefused.includes("{limit}"), locale);
    assert.ok(messages[locale].captureCountOfLimit.includes("{count}"), locale);
    assert.ok(messages[locale].captureCountOfLimit.includes("{limit}"), locale);
    // No offer is named, and « Gestion » never appears (vocabulary).
    for (const key of KEYS)
      assert.doesNotMatch(
        messages[locale][key],
        /Gestion|Synchronis|Advanced Sync/i,
        `${locale}: ${key}`,
      );
  }
});
