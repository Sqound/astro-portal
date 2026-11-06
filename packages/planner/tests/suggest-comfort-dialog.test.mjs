// « Observation confortable » in the web dialog —
// the same switch as « Exclure les cibles déjà faites », in visual only, and
// one line under it per instrument.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { suggestNight } from "../src/suggest-night.js";
import { suggestDialogModel } from "../src/suggest-dialog-model.js";
import { suggestionMessages } from "../src/suggest-messages.js";
import { candidate, night } from "./helpers/suggestion-cases.mjs";

await registerJsx();
const { SuggestNightContent } =
  await import("planner/components/SuggestNightDialog.js");

const pool = Array.from({ length: 4 }, (_, index) =>
  candidate(`c${index}`, {
    score: 90 - index,
    minutes: 20,
    centre: 100 + index * 60,
  }),
);
const render = ({
  visual = true,
  comfort = null,
  comfortOn = false,
  locale = "fr",
}) => {
  const proposal = suggestNight({
    night,
    mode: visual ? "visual" : "imaging",
    candidates: pool,
    count: 3,
  });
  return renderToStaticMarkup(
    createElement(SuggestNightContent, {
      locale,
      visual,
      proposal,
      model: {
        ...suggestDialogModel({
          proposal,
          selected: new Set(proposal.items.map((entry) => entry.target.id)),
          locale,
          timeZone: "UTC",
          visual,
        }),
        locale,
      },
      contextLine: "Plateau · nuit du 20 juin",
      equipmentLine: "Lunette 72 mm",
      count: 3,
      comfort,
      comfortOn,
    }),
  );
};
const text = (markup) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "’")
    .replaceAll(" ", " ")
    .replace(/\s+/g, " ")
    .trim();

test("visual with a refractor: « Confort », the segments of « Placement »", () => {
  const off = render({ comfort: { family: "refractor", on: false } });
  assert.match(off, /data-testid="suggest-comfort"/);
  assert.match(text(off), /Confort Sans restriction Visée confortable/);
  assert.match(off, /aria-checked="true"[^>]*>Sans restriction</);
  // The line only with « Visée confortable ».
  assert.doesNotMatch(off, /suggest-comfort-help/);
  const on = render({
    comfort: { family: "refractor", on: true },
    comfortOn: true,
  });
  assert.match(on, /aria-checked="true"[^>]*>Visée confortable</);
  assert.match(
    text(on),
    /Lunette : au-dessus de 65°, l’oculaire devient difficile à atteindre\./,
  );
  // The same classes as « Placement ».
  assert.match(
    on,
    /planner-suggest-segments--placement" role="radiogroup" aria-label="Confort de visée"/,
  );
});

test("a Dobson and an equatorial Newtonian have their own line", () => {
  assert.match(
    text(render({ comfort: { family: "newtonian-altaz" }, comfortOn: true })),
    /Newton sur Dobson : sous 30°, l’oculaire est trop bas\./,
  );
  assert.match(
    text(
      render({
        comfort: { family: "newtonian-equatorial" },
        comfortOn: true,
        locale: "en",
      }),
    ),
    /from 25° to 75°/,
  );
});

test("no switch in photo, nor without a family to offer it for", () => {
  assert.doesNotMatch(
    render({ visual: false, comfort: { family: "refractor" } }),
    /suggest-comfort/,
  );
  assert.doesNotMatch(render({ comfort: null }), /suggest-comfort/);
  assert.doesNotMatch(
    render({ comfort: { family: "naked-eye" } }),
    /suggest-comfort/,
  );
});

test("every language has « Confort », its two segments and its five lines", () => {
  for (const [locale, words] of Object.entries(suggestionMessages))
    for (const key of [
      "suggestComfort",
      "suggestComfortAny",
      "suggestComfortEasy",
      "suggestComfortLabel",
      "suggestComfortRefractor",
      "suggestComfortRearEyepiece",
      "suggestComfortNewtonianAltaz",
      "suggestComfortNewtonianEquatorial",
      "suggestComfortBinoculars",
    ])
      assert.ok(words[key], `${locale} ${key}`);
});
