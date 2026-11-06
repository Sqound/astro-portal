import assert from "node:assert/strict";
import test from "node:test";

import { planFrise } from "planner/plan-frise.js";
import {
  planFriseCaption,
  planFriseReducedSentence,
  planFriseSentence,
} from "planner/plan-frise-words.js";
import { clock } from "planner/wind-section.js";
import { boardPlan, item, planWith } from "./helpers/plan-frise-cases.mjs";

// The sentences and labels of the frise, exactly the designed texts in French
// and the same fragments in the other languages. The designed night reads 18:54
// → 04:38 on the UTC clock.

const at = (locale) => (value) => clock(value, locale, "UTC");
const nbsp = " ";
const board = planFrise(boardPlan());

test("the full frise reads the specified sentence, character for character", () => {
  assert.equal(
    planFriseSentence(board, { locale: "fr", clock: at("fr") }),
    `Frise du plan${nbsp}: M31 de 19:49 à 21:49, monte de 48° à 68°${nbsp}; NGC 7000 de 22:19 à 00:19, descend de 63° à 42°${nbsp}; M33 de 00:19 à 02:49, de 75° à 54°${nbsp}; M45 de 02:49 à 03:49, de 68° à 61°. Crépuscule jusqu’à 18:54 et à partir de 04:38. Repères de hauteur à 30° et 60°.`,
  );
});

test("the three reduced sentences: commas for four names, « puis » for two", () => {
  const reduced = (items) =>
    planFriseReducedSentence(planFrise(planWith(items)), {
      locale: "fr",
      clock: at("fr"),
    });
  assert.equal(
    planFriseReducedSentence(board, { locale: "fr", clock: at("fr") }),
    `Frise réduite${nbsp}: M31, NGC 7000, M33, M45, de 19:49 à 03:49.`,
  );
  // 20:30 → 02:40 is minutes 96 → 466 of the night that starts at 18:54.
  assert.equal(
    reduced([item("NGC 7000", 96, 220), item("M33", 250, 466)]),
    `Frise réduite${nbsp}: NGC 7000 puis M33, de 20:30 à 02:40.`,
  );
  assert.equal(
    reduced([item("M31", 81, 180), item("M45", 200, 276)]),
    `Frise réduite${nbsp}: M31 puis M45, de 20:15 à 23:30.`,
  );
  // One name stands alone, three are joined by commas.
  assert.equal(
    reduced([item("M31", 81, 180)]),
    `Frise réduite${nbsp}: M31, de 20:15 à 21:54.`,
  );
  assert.match(
    reduced([item("A", 60, 90), item("B", 100, 120), item("C", 130, 150)]),
    /: A, B, C, de /,
  );
});

test("« monte » and « descend » only for rises and falls; a block with no curve is its name and hours alone", () => {
  const sentence = planFriseSentence(board, { locale: "fr", clock: at("fr") });
  assert.equal(sentence.match(/monte/g).length, 1);
  assert.equal(sentence.match(/descend/g).length, 1);
  assert.match(sentence, /M33 de 00:19 à 02:49, de 75° à 54°/);
  const bare = planFrise(planWith([item("M31", 55, 175)]));
  assert.match(
    planFriseSentence(bare, { locale: "fr", clock: at("fr") }),
    /^Frise du plan : M31 de 19:49 à 21:49\. Crépuscule/,
  );
});

test("the caption is the specified one", () => {
  assert.equal(
    planFriseCaption("fr"),
    "Hauteur de chaque cible pendant son créneau",
  );
});

test("the same fragments in English and Japanese, and in every other language", () => {
  assert.equal(
    planFriseSentence(board, { locale: "en", clock: at("en") }),
    "Plan timeline: M31 from 19:49 to 21:49, rises from 48° to 68°; NGC 7000 from 22:19 to 00:19, falls from 63° to 42°; M33 from 00:19 to 02:49, from 75° to 54°; M45 from 02:49 to 03:49, from 68° to 61°. Twilight until 18:54 and from 04:38. Height guides at 30° and 60°.",
  );
  assert.equal(
    planFriseSentence(board, { locale: "ja", clock: at("ja") }),
    "プランのタイムライン：M31 19:49〜21:49、48°から68°へ上昇；NGC 7000 22:19〜00:19、63°から42°へ下降；M33 00:19〜02:49、75°から54°；M45 02:49〜03:49、68°から61°。薄明は18:54まで、04:38以降。高度の目安は30°と60°。",
  );
  assert.equal(
    planFriseReducedSentence(board, { locale: "ja", clock: at("ja") }),
    "簡易タイムライン：M31、NGC 7000、M33、M45、19:49〜03:49。",
  );
  for (const locale of [
    "de",
    "es",
    "fr",
    "it",
    "pt-BR",
    "ru",
    "zh-Hans",
    "zh-Hant",
  ]) {
    const full = planFriseSentence(board, { locale, clock: at(locale) });
    const reduced = planFriseReducedSentence(board, {
      locale,
      clock: at(locale),
    });
    assert.ok(!/[{}]/.test(full + reduced), `${locale}: no placeholder left`);
    assert.ok(full.includes("NGC 7000") && full.includes("19:49"), locale);
    assert.ok(reduced.includes("M45") && reduced.includes("03:49"), locale);
    assert.ok(planFriseCaption(locale).length > 3, locale);
  }
});
