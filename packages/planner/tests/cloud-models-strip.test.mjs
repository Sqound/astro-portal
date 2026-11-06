import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The hourly strip shows the retained cover (the highest of the weather models)
// and, where the models are 25 points or more apart, an amber note with the
// model names. The fixture is `forecast-hourly.json` (the night of 2026-10-22
// on the Kanto plain).
await registerJsx();
const { HourlyForecast, modelsDisagreementNote } =
  await import("planner/components/HourlyForecast.js");

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../astro-contracts/fixtures/forecast-hourly.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const cases = (id) => fixture.cases.find((entry) => entry.id === id).result;
const several = cases("several-models-retain-the-median-night-2026-10-22");
const single = cases("one-model-answering-reads-as-before");
const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/&#x27;/g, "’")
    .replace(/\s+/g, " ")
    .trim();
const render = (hourly, locale = "fr") =>
  renderToStaticMarkup(
    createElement(HourlyForecast, {
      forecast: { hourly, fetchedAt: "2026-10-22T14:00:00.000Z" },
      locale,
      night: {
        start: "2026-10-22T11:00:00Z",
        end: "2026-10-22T16:00:00Z",
      },
      timeZone: "Asia/Tokyo",
    }),
  );

test("the strip shows the median at 22:00, without the range of the models, and the « incertaine » tag", () => {
  const markup = render(several);
  // 22:00 JST: median of ECMWF 3, ICON 74, GFS 13, JMA 3 = 8 %, range 3–74 %.
  assert.match(markup, /Couverture nuageuse 8%/);
  assert.ok(!markup.includes("Couverture nuageuse 3%"));
  // The range is not on the strip, it says nothing to a reader; it lives in the
  // hour's detail.
  assert.ok(!markup.includes("planner-hourly-cloud-range"));
  assert.ok(!/\d+–\d+ ?%/.test(textOf(markup)), textOf(markup));
  // The tag stands on the hours' scores of "Cette nuit", not on the planner's.
  assert.ok(!markup.includes("planner-hourly-forecast-uncertain"));
  const scored = renderToStaticMarkup(
    createElement(HourlyForecast, {
      forecast: { hourly: several, fetchedAt: "2026-10-22T14:00:00.000Z" },
      locale: "fr",
      night: { start: "2026-10-22T11:00:00Z", end: "2026-10-22T16:00:00Z" },
      timeZone: "Asia/Tokyo",
      hourScores: true,
    }),
  );
  const cell = scored
    .split('<div class="planner-hourly-forecast-cell')
    .find((chunk) => chunk.includes("<time>22:00</time>"));
  assert.ok(cell.includes("planner-hourly-forecast-uncertain"), "tag on");
  assert.ok(cell.includes(">incertaine<"));
  const earlier = scored
    .split('<div class="planner-hourly-forecast-cell')
    .find((chunk) => chunk.includes("<time>20:00</time>"));
  // FIX-FIN-AG: the line is reserved in every scored column -- empty and
  // hidden from assistive technology when the score is certain -- so the
  // columns share one height.
  assert.ok(earlier.includes("planner-hourly-forecast-uncertain"), "slot kept");
  assert.ok(!earlier.includes(">incertaine<"), "no tag text");
  assert.match(
    earlier,
    /planner-hourly-forecast-uncertain" aria-hidden="true"><\/span>/,
    "empty slot hidden",
  );
});

test("an amber note names the models where they disagree most, in ten languages", () => {
  const note = textOf(render(several));
  assert.ok(
    note.includes(
      "22:00 · Les modèles ne sont pas d’accord (ICON 74 %, JMA 3 %)",
    ),
    note,
  );
  assert.match(render(several), /class="planner-hourly-forecast-models-note"/);
  const row = several.find((entry) => entry.cloudSpread === 71);
  const expected = {
    en: "The models disagree (ICON 74%, JMA 3%)",
    de: "Die Modelle sind sich uneinig (ICON 74 %, JMA 3 %)",
    es: "Los modelos no coinciden (ICON 74 %, JMA 3 %)",
    it: "I modelli non concordano (ICON 74 %, JMA 3 %)",
    ja: "予報モデルの見解が分かれています（ICON 74%、JMA 3%）",
    "pt-BR": "Os modelos não concordam (ICON 74 %, JMA 3 %)",
    ru: "Модели расходятся (ICON 74 %, JMA 3 %)",
    "zh-Hans": "各气象模型的预测不一致（ICON 74%，JMA 3%）",
    "zh-Hant": "各氣象模型的預測不一致（ICON 74%，JMA 3%）",
  };
  for (const [locale, text] of Object.entries(expected))
    assert.equal(modelsDisagreementNote(row, locale), text, locale);
});

test("one model answering says no disagreement, and models that agree neither", () => {
  assert.ok(!render(single).includes("planner-hourly-forecast-models-note"));
  assert.equal(
    modelsDisagreementNote({ cloudModels: { best_match: 90 } }, "fr"),
    null,
  );
  assert.equal(
    modelsDisagreementNote(
      { cloudModels: { best_match: 10, icon_seamless: 34 } },
      "fr",
    ),
    null,
  );
  // MET Norway alone: the rows carry no models at all.
  assert.equal(modelsDisagreementNote({ cloud: 5 }, "fr"), null);
});

test("the verdict card of « Cette nuit » says « incertaine » only when the verdict is", async () => {
  const { tonightVerdictWords } = await import("planner/tonight-words.js");
  const at = (value) => String(value);
  const ready = { level: "excellent", score: 88, kind: "excellent" };
  const tagged = tonightVerdictWords(
    { ...ready, uncertain: true },
    { locale: "fr", at },
  );
  assert.equal(tagged.uncertain, true);
  assert.equal(tagged.uncertainWord, "incertaine");
  assert.match(tagged.uncertainInfo, /vérifiez le ciel/);
  assert.equal(
    tonightVerdictWords(ready, { locale: "fr", at }).uncertain,
    false,
  );
});
