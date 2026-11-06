import assert from "node:assert/strict";
import test from "node:test";
import { nightSpanNightDates } from "../dist/night-span-copy.js";
import { message } from "portal/i18n.js";

// The planner's night-span words in Simplified and Traditional Chinese and in
// Russian: the two civil dates of a night, written as each language writes a
// date, and the sentence that holds them.
test("a night's two dates are written the Chinese way, with the month once", () => {
  for (const locale of ["zh-Hans", "zh-Hant"]) {
    assert.deepEqual(nightSpanNightDates("2026-10-14", locale), {
      from: "10月14日",
      to: "15日",
    });
    assert.deepEqual(nightSpanNightDates("2026-10-31", locale), {
      from: "10月31日",
      to: "11月1日",
    });
  }
});

test("a night's two dates are written the Russian way, in the genitive", () => {
  assert.deepEqual(nightSpanNightDates("2026-10-14", "ru"), {
    from: "14",
    to: "15 октября",
  });
  assert.deepEqual(nightSpanNightDates("2026-10-31", "ru"), {
    from: "31 октября",
    to: "1 ноября",
  });
});

test("the night's sentence holds both dates in each of the three languages", () => {
  for (const locale of ["zh-Hans", "zh-Hant", "ru"]) {
    const { from, to } = nightSpanNightDates("2026-10-14", locale);
    const sentence = message(locale, "plannerNightSpanChartNight")
      .replace("{from}", from)
      .replace("{to}", to)
      .replace("{start}", "21:10")
      .replace("{end}", "04:30");
    assert.ok(sentence.includes(from) && sentence.includes(to), locale);
    assert.ok(!/[{}]/.test(sentence), `${locale}: ${sentence}`);
  }
});
