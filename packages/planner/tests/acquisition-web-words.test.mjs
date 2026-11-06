import assert from "node:assert/strict";
import test from "node:test";
import { messages } from "portal/i18n.js";
import { shippedLocales } from "astro-contracts/locales";
import {
  acquisitionCountText,
  acquisitionExposureText,
  acquisitionFramesText,
} from "planner/acquisition-words.js";
import { lineReadingOf } from "planner/acquisition-reading.js";

// "Prise de vue par cible": the words are the `acq*` keys of the portal's
// dictionaries, in the ten languages; the plural forms of the count of
// exposures are `acqFrames{One,Few,Many,Other}`.

const placeholders = (text) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const acquisitionKeys = (locale) =>
  Object.keys(messages[locale]).filter((key) => key.startsWith("acq"));

test("every word of « Prise de vue par cible » is in the ten catalogues, with the same placeholders", () => {
  const english = acquisitionKeys("en");
  assert.ok(english.length >= 85, "the words, plus the plural forms");
  for (const locale of shippedLocales()) {
    assert.deepEqual(
      acquisitionKeys(locale).sort(),
      [...english].sort(),
      locale,
    );
    for (const key of english)
      assert.deepEqual(
        placeholders(messages[locale][key]),
        placeholders(messages.en[key]),
        `${locale} ${key}`,
      );
  }
});

const frames = (count, chosen) =>
  lineReadingOf({
    frameCount: {
      value: count,
      source: chosen ? "chosen-target" : "suggested",
    },
  });

test("the count of exposures agrees with its number in each language", () => {
  assert.equal(acquisitionCountText("fr", 1), "1 pose");
  assert.equal(acquisitionCountText("fr", 39), "39 poses");
  assert.equal(acquisitionCountText("en", 1), "1 frame");
  assert.equal(acquisitionCountText("en", 39), "39 frames");
  // Russian: one, few, many.
  assert.equal(acquisitionCountText("ru", 1), "1 кадр");
  assert.equal(acquisitionCountText("ru", 21), "21 кадр");
  assert.equal(acquisitionCountText("ru", 3), "3 кадра");
  assert.equal(acquisitionCountText("ru", 39), "39 кадров");
  // Japanese has no plural.
  assert.equal(acquisitionCountText("ja", 39), "39枚");
  // "≈" when the rule counted, nothing when the person chose.
  assert.equal(acquisitionFramesText("fr", frames(39, false)), "≈ 39 poses");
  assert.equal(acquisitionFramesText("fr", frames(39, true)), "39 poses");
  assert.equal(acquisitionFramesText("fr", lineReadingOf({})), null);
});

test("an exposure is written in the language's decimals", () => {
  assert.equal(acquisitionExposureText("fr", 0.5), "1/2 s");
  assert.equal(acquisitionExposureText("fr", 1.25), "1,25 s");
  assert.equal(acquisitionExposureText("de", 1.25), "1,25 s");
  assert.equal(acquisitionExposureText("ja", 120), "120 s");
  // French groups thousands with a narrow no-break space.
  assert.equal(acquisitionExposureText("fr", 1500), "1\u202f500 s");
});
