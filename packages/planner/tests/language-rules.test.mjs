import assert from "node:assert/strict";
import test from "node:test";

import { plannerFlowMessage } from "portal/planner/flow-messages.js";
import {
  causeLabelInSentence,
  causeLabel,
} from "portal/components/sessions/night-summary-view.js";
import { horizonCardinalLabel } from "planner/horizon-projection.js";
import { nightSpanNightDates } from "planner/night-span-copy.js";

// The rules of the languages that are code, not tables — the day and month
// words of "Durée de la nuit", the compass letters, the lower-cased cause, the
// positional table of the planner flow.

test("the night's two dates, in German, Spanish, Italian and Portuguese", () => {
  assert.deepEqual(nightSpanNightDates("2026-10-14", "de"), {
    from: "14.",
    to: "15. Oktober",
  });
  assert.deepEqual(nightSpanNightDates("2026-10-31", "de"), {
    from: "31. Oktober",
    to: "1. November",
  });
  assert.deepEqual(nightSpanNightDates("2026-10-14", "es"), {
    from: "14",
    to: "15 de octubre",
  });
  assert.deepEqual(nightSpanNightDates("2026-10-31", "es"), {
    from: "31 de octubre",
    to: "1 de noviembre",
  });
  // Italian and Portuguese write the first of the month "1º".
  assert.deepEqual(nightSpanNightDates("2026-10-31", "it"), {
    from: "31 ottobre",
    to: "1º novembre",
  });
  assert.deepEqual(nightSpanNightDates("2026-09-30", "pt-BR"), {
    from: "30 de setembro",
    to: "1º de outubro",
  });
  assert.deepEqual(nightSpanNightDates("2026-10-14", "pt-BR"), {
    from: "14",
    to: "15 de outubro",
  });
});

test("the compass letters of the target's path follow the language", () => {
  const letters = (locale) =>
    ["N", "E", "S", "O"].map((label) => horizonCardinalLabel(label, locale));
  assert.deepEqual(letters("fr"), ["N", "E", "S", "O"]);
  assert.deepEqual(letters("es"), ["N", "E", "S", "O"]);
  assert.deepEqual(letters("it"), ["N", "E", "S", "O"]);
  // German: O is Osten (east) and W is Westen (west): "O" must never stay
  // the French "Ouest".
  assert.deepEqual(letters("de"), ["N", "O", "S", "W"]);
  assert.deepEqual(letters("pt-BR"), ["N", "L", "S", "O"]);
  assert.deepEqual(letters("en"), ["N", "E", "S", "W"]);
  assert.deepEqual(letters("ja"), ["N", "E", "S", "W"]);
});

test("a cause inside a sentence is lower-cased, except in German", () => {
  assert.equal(
    causeLabelInSentence("fr", "clouds"),
    causeLabel("fr", "clouds").toLowerCase(),
  );
  assert.equal(
    causeLabelInSentence("de", "clouds"),
    causeLabel("de", "clouds"),
  );
});

test("the planner flow reads the slot of every shipped language, English otherwise", () => {
  const key = "distantPlace";
  const slots = ["en", "fr", "ja", "de", "es", "it", "pt-BR"];
  const texts = slots.map((locale) => plannerFlowMessage(locale, key));
  assert.equal(new Set(texts).size, texts.length, "one text per language");
  for (const text of texts) assert.match(text, /\{distance\}/);
  // Every language reads its catalogue through the same accessor; a
  // locale the product does not ship reads English.
  assert.notEqual(plannerFlowMessage("zh-Hans", key), texts[0]);
  assert.equal(plannerFlowMessage("xx", key), texts[0]);
  assert.equal(plannerFlowMessage("de", "unknown-key"), "unknown-key");
  assert.match(plannerFlowMessage("de", "retry"), /^Erneut/);
});
