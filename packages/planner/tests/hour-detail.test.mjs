import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The weather views say the retained cover alone; the range, the models one by
// one and the "incertaine" tag live in the detail of an hour (what a touch on a
// column of the strip, or on a row of "Heure par heure", opens). Fixture
// `forecast-hourly.json` (the night of 2026-10-22 on the Kanto plain).
await registerJsx();
const { HourlyForecast, HourDetailBody } =
  await import("planner/components/HourlyForecast.js");
const { ScoreSheetBody } =
  await import("planner/components/NightDetailParts.js");
const { tonightScoreSheetWords } = await import("planner/tonight-words.js");

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../astro-contracts/fixtures/forecast-hourly.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const several = fixture.cases.find(
  (entry) => entry.id === "several-models-retain-the-median-night-2026-10-22",
).result;
const single = fixture.cases.find(
  (entry) => entry.id === "one-model-answering-reads-as-before",
).result;
const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/&#x27;/g, "’")
    .replace(/\s+/g, " ")
    .trim();
const at22 = several.find((row) => row.cloudSpread === 71);
const detail = (row, locale = "fr") =>
  renderToStaticMarkup(createElement(HourDetailBody, { row, locale }));

test("the detail of 22:00: the median, the models one by one, the range in one line, « incertaine » and why", () => {
  const markup = detail(at22);
  const text = textOf(markup);
  assert.match(
    markup,
    /data-metric="cloud"[^>]*><span>Couverture nuageuse<\/span><strong>8%<\/strong>/,
  );
  for (const [model, cover] of [
    ["ecmwf_ifs025", "3%"],
    ["icon_seamless", "74%"],
    ["gfs_seamless", "13%"],
    ["jma_seamless", "3%"],
  ])
    assert.ok(
      new RegExp(
        `data-model="${model}"[^>]*><span>[^<]+</span><strong>${cover}</strong>`,
      ).test(markup),
      model,
    );
  for (const name of ["ECMWF", "ICON", "GFS", "JMA"])
    assert.ok(text.includes(name), name);
  assert.match(
    markup,
    /data-testid="planner-hour-detail-range"[^>]*><span>Fourchette<\/span><strong>3–74 %<\/strong>/,
  );
  assert.match(markup, /data-testid="planner-hour-detail-uncertain"/);
  assert.ok(text.includes("incertaine"));
  assert.ok(
    text.includes(
      "ICON donne 74 % de nuages à cette heure, alors que la médiane reste sous 20 %.",
    ),
    text,
  );
});

test("an hour whose models agree, or a single model, has no uncertain tag and no model block", () => {
  const calm = several.find(
    (row) => row.cloudSpread !== null && row.cloudSpread < 25,
  );
  assert.ok(calm);
  const markup = detail(calm);
  assert.match(markup, /planner-hour-detail-models/);
  assert.ok(!markup.includes("planner-hour-detail-uncertain"));
  const one = detail(single[0]);
  assert.ok(!one.includes("planner-hour-detail-models"));
  assert.ok(!one.includes("planner-hour-detail-range"));
});

test("the detail speaks the language of the app", () => {
  assert.ok(
    textOf(detail(at22, "en")).includes(
      "ICON gives 74% cloud at this hour, while the median stays under 20%.",
    ),
  );
  assert.ok(textOf(detail(at22, "en")).includes("Weather models"));
  assert.ok(textOf(detail(at22, "ja")).includes("気象モデル"));
  assert.ok(
    textOf(detail(at22, "ja")).includes(
      "この時間、ICON は雲量 74% ですが、中央値は 20% 未満です。",
    ),
  );
});

test("the strip's columns open the detail by touch or by keyboard", () => {
  const markup = renderToStaticMarkup(
    createElement(HourlyForecast, {
      forecast: { hourly: several, fetchedAt: "2026-10-22T14:00:00.000Z" },
      locale: "fr",
      night: { start: "2026-10-22T11:00:00Z", end: "2026-10-22T16:00:00Z" },
      timeZone: "Asia/Tokyo",
    }),
  );
  const cells = markup.match(/<div class="planner-hourly-forecast-cell[^>]*>/g);
  assert.equal(cells.length, several.length);
  for (const cell of cells) {
    assert.match(cell, /role="button"/);
    assert.match(cell, /tabindex="0"/);
    assert.match(cell, /aria-haspopup="dialog"/);
  }
});

const verdict = {
  level: "excellent",
  score: 88,
  kind: "excellent",
  uncertain: true,
  uncertainBy: { model: "icon_seamless", cover: 49 },
};
const at = (value) =>
  new Intl.DateTimeFormat("fr", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
const sheetMarkup = (updated, uncertain = verdict) =>
  renderToStaticMarkup(
    createElement(ScoreSheetBody, {
      sheet: tonightScoreSheetWords(uncertain, {
        locale: "fr",
        at,
        hours: several,
        updated,
      }),
      locale: "fr",
    }),
  );

test("« Heure par heure »: the cover alone, when it was forecast under the title, a row opens its hour", () => {
  const markup = sheetMarkup("Mis à jour à 06:51");
  const table = markup.slice(markup.indexOf("tonight-score-table"));
  assert.ok(!/\d+–\d+ ?%/.test(textOf(table)), textOf(table));
  assert.match(
    markup,
    /<h3>Heure par heure<\/h3><p class="tonight-muted tonight-score-updated"[^>]*>Mis à jour à 06:51<\/p>/,
  );
  const rows = markup.match(/<tr class="tonight-score-row"[^>]*>/g);
  assert.equal(rows.length, several.length);
  for (const row of rows) {
    assert.match(row, /tabindex="0"/);
    assert.match(row, /aria-haspopup="dialog"/);
  }
  // No button is added to the sheet (the rule of the four levels).
  assert.ok(!markup.includes("<button"));
  // A past night says "Mesuré".
  assert.match(sheetMarkup("Mesuré"), /tonight-score-updated[^>]*>Mesuré</);
  // Nothing given, nothing said.
  assert.ok(!sheetMarkup(null).includes("tonight-score-updated"));
});

test("the verdict's own text says the night is « incertaine » and by which model", () => {
  const text = textOf(sheetMarkup(null));
  assert.ok(
    text.includes(
      "Note incertaine : ICON donne 49 % de nuages en moyenne sur la nuit, alors que la médiane des modèles reste sous 20 %.",
    ),
    text,
  );
  const calm = sheetMarkup(null, { ...verdict, uncertain: undefined });
  assert.ok(!calm.includes("tonight-score-uncertain"));
  // Without the model named (a copy kept before this rule), the general note.
  assert.ok(
    textOf(sheetMarkup(null, { ...verdict, uncertainBy: undefined })).includes(
      "vérifiez le ciel avant de vous installer",
    ),
  );
});

test("the sheet of « Cette nuit » carries the forecast time under « Heure par heure »", async () => {
  const { forecastUpdatedWords } = await import("planner/tonight-words.js");
  const words = (forecastUpdated) =>
    forecastUpdatedWords(forecastUpdated, {
      locale: "fr",
      at: (value) => at(value),
    });
  assert.equal(
    words({ fetchedAt: "2026-10-21T21:51:00Z" }),
    "Mis à jour à 06:51",
  );
  assert.equal(
    words({ fetchedAt: "2026-10-21T21:51:00Z", stale: true }),
    "Estimation de 06:51",
  );
  assert.equal(words(null), null);
  // The sheet shows it, and both pages hand it over.
  assert.match(
    sheetMarkup(words({ fetchedAt: "2026-10-21T21:51:00Z" })),
    /tonight-score-updated[^>]*>Mis à jour à 06:51</,
  );
  for (const page of ["TonightPage", "PlannerPage"])
    assert.ok(
      readFileSync(
        new URL(`../src/components/${page}.js`, import.meta.url),
        "utf8",
      ).includes("forecastUpdated:"),
      page,
    );
});

test("no compact view of the web writes the range of the models inline", () => {
  // The planner's forecast sheet used to write "8 % (3–74 %)": the cover
  // alone now; only the hour's detail names the range.
  const source = readFileSync(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  assert.ok(!source.includes("cloudRangeText"));
  const strip = readFileSync(
    new URL("../src/components/HourlyForecast.js", import.meta.url),
    "utf8",
  );
  const uses = strip.match(/cloudRangeText\(/g) || [];
  // Its definition and the hour's detail, nothing else.
  assert.equal(uses.length, 2);
});
