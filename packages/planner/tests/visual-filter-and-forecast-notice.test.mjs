// A visual target that needs a filter stays in the suggestions
// and says which; a list shown before the forecast says when the forecast has
// changed it, and says nothing when it has not.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shippedLocales } from "astro-contracts/locales";
import { message } from "portal/i18n.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { suggestNight } from "../src/suggest-night.js";
import { suggestDialogModel } from "../src/suggest-dialog-model.js";
import {
  noteSuggestionRead,
  suggestionsForecastNoticeDuration,
} from "../src/suggestions-forecast-notice.js";
import {
  visualFilterAdviceFamilies,
  visualFilterAdviceText,
} from "../src/visual-filter-advice.js";
import { candidate, night } from "./helpers/suggestion-cases.mjs";

await registerJsx();
const { SuggestNightContent } =
  await import("planner/components/SuggestNightDialog.js");

const nebula = { skyTarget: { typeKey: "Nébuleuse en émission" } };
const galaxy = { skyTarget: { typeKey: "Galaxie" } };

test("the catalogue's data says which filters, a galaxy needs none", () => {
  assert.deepEqual(visualFilterAdviceFamilies(nebula), ["uhc", "oiii"]);
  assert.deepEqual(
    visualFilterAdviceFamilies({
      skyTarget: { typeKey: "Nébuleuse planétaire" },
    }),
    ["oiii", "uhc"],
  );
  assert.deepEqual(visualFilterAdviceFamilies(galaxy), []);
  assert.deepEqual(
    visualFilterAdviceFamilies({ skyTarget: { typeKey: "Amas ouvert" } }),
    [],
  );
  assert.deepEqual(visualFilterAdviceFamilies(null), []);
  // The explicit visual families win, two at most.
  assert.deepEqual(
    visualFilterAdviceFamilies({
      ...nebula,
      knowledge: {
        observingGuide: { visualFilterFamilies: ["hb", "uhc", "oiii"] },
      },
    }),
    ["hb", "uhc"],
  );
  assert.deepEqual(
    visualFilterAdviceFamilies({
      ...nebula,
      knowledge: { observingGuide: { visualFilterFamilies: [] } },
    }),
    [],
    "the catalogue says no filter",
  );
});

test("the line is worded in every shipped language", () => {
  assert.equal(
    visualFilterAdviceText("en", nebula),
    "Recommended filter: UHC / OIII",
  );
  assert.equal(
    visualFilterAdviceText("fr", nebula),
    "Filtre conseillé : UHC / OIII",
  );
  assert.equal(visualFilterAdviceText("en", galaxy), null);
  for (const locale of shippedLocales()) {
    const text = visualFilterAdviceText(locale, nebula);
    assert.match(text, /UHC/, locale);
    assert.ok(!text.includes("{"), locale);
    assert.notEqual(
      message(locale, "tonightListUpdatedWithWeather"),
      locale === "en" ? "" : message("en", "tonightListUpdatedWithWeather"),
      locale,
    );
  }
  assert.equal(
    message("fr", "tonightListUpdatedWithWeather"),
    "Liste mise à jour avec la météo",
  );
});

const pool = [
  candidate("m31", { score: 90, type: "Galaxie" }),
  candidate("ngc7000", { score: 85, type: "Nébuleuse en émission" }),
];
const withType = (entry) => entry;
const dialog = (visual) => {
  const proposal = suggestNight({
    night,
    mode: visual ? "visual" : "imaging",
    candidates: pool.map(withType),
    count: 2,
  });
  const selected = new Set(proposal.items.map((entry) => entry.target.id));
  return renderToStaticMarkup(
    createElement(SuggestNightContent, {
      locale: "fr",
      visual,
      proposal,
      model: {
        ...suggestDialogModel({
          proposal,
          selected,
          locale: "fr",
          timeZone: "UTC",
        }),
        locale: "fr",
      },
      contextLine: "Camping du Lac Noir · nuit du 14 oct.",
      equipmentLine: "Maksutov 127 mm · oculaire 25 mm",
      count: 2,
      filterAdviceFor: (entry) =>
        visualFilterAdviceText(
          "fr",
          pool.find((item) => item.card.target.id === entry.target.id)?.card
            .target,
        ),
    }),
  );
};

test("the web suggestion card of a nebula carries the line, a galaxy's does not", () => {
  const markup = dialog(true);
  assert.match(markup, /data-testid="suggest-filter-advice-ngc7000"/);
  assert.match(markup, /Filtre conseillé : UHC \/ OIII/);
  assert.doesNotMatch(markup, /suggest-filter-advice-m31/);
  assert.ok(markup.includes("NGC7000") || markup.includes("M31"));
  assert.match(markup, /M31/, "the galaxy stays in the list");
  // A photo list says nothing about filters of the eyepiece.
  assert.doesNotMatch(dialog(false), /suggest-filter-advice/);
});

test("the target's sheet writes the line it is given, under its names", () => {
  // The dialog renders in a portal (nothing in a static render): the wiring is
  // read from the sources.
  const sheet = readFileSync(
    new URL("../src/components/TargetScoreExplained.js", import.meta.url),
    "utf8",
  );
  assert.match(sheet, /filterAdvice = null/);
  assert.match(
    sheet,
    /\{sheet\.night[\s\S]*\{filterAdvice && \([\s\S]*data-testid="target-score-filter-advice"/,
  );
  const page = readFileSync(
    new URL("../src/components/TonightPage.js", import.meta.url),
    "utf8",
  );
  assert.match(
    page,
    // VISUAL-SIM-02b: the line of the card's best pair, else the filter.
    /filterAdvice=\{\s*visualList\s*\?\s*visualCardAdviceText\(locale, explained\.card\)\s*:\s*null/,
  );
});

test("a forecast that comes in late and reorders the list raises one notice", () => {
  // The list is read without the forecast.
  let state = noteSuggestionRead(null, {
    ids: ["a", "b", "c"],
    hasForecast: false,
  });
  assert.equal(state.notice, false, "the list shown at once says nothing");
  // The same list again (a re-render): nothing.
  state = noteSuggestionRead(state.read, {
    ids: ["a", "b", "c"],
    hasForecast: false,
  });
  assert.equal(state.notice, false);
  // The forecast comes in and the order changes: the notice, once.
  state = noteSuggestionRead(state.read, {
    ids: ["b", "a", "c"],
    hasForecast: true,
  });
  assert.equal(state.notice, true);
  state = noteSuggestionRead(state.read, {
    ids: ["b", "a", "c"],
    hasForecast: true,
  });
  assert.equal(state.notice, false, "once");
  // The set changes too.
  const other = noteSuggestionRead(
    { ids: ["a", "b"], hasForecast: false },
    { ids: ["a", "d"], hasForecast: true },
  );
  assert.equal(other.notice, true);
});

test("a forecast that confirms the list, or that was already there, raises none", () => {
  const confirmed = noteSuggestionRead(
    { ids: ["a", "b", "c"], hasForecast: false },
    { ids: ["a", "b", "c"], hasForecast: true },
  );
  assert.equal(confirmed.notice, false);
  assert.equal(confirmed.read.hasForecast, true);
  const already = noteSuggestionRead(
    { ids: ["a", "b"], hasForecast: true },
    { ids: ["b", "a"], hasForecast: true },
  );
  assert.equal(
    already.notice,
    false,
    "a refresh with the forecast in is not an arrival",
  );
  // An empty list neither starts nor ends a reading.
  const empty = noteSuggestionRead(
    { ids: ["a"], hasForecast: false },
    { ids: [], hasForecast: true },
  );
  assert.equal(empty.notice, false);
  assert.deepEqual(empty.read, { ids: ["a"], hasForecast: false });
  assert.ok(suggestionsForecastNoticeDuration > 0);
});

test("the page wires the notice and the filter line to the shared helpers", () => {
  const page = readFileSync(
    new URL("../src/components/TonightPage.js", import.meta.url),
    "utf8",
  );
  assert.match(page, /noteSuggestionRead\(listRead\.current/);
  assert.match(page, /data-testid="tonight-weather-notice"/);
  assert.match(page, /role="status"/);
  assert.match(page, /tonightListUpdatedWithWeather/);
  assert.match(page, /tonight-filter-advice-\$\{candidate\.id\}/);
  assert.match(page, /filterAdvice=\{/);
});
