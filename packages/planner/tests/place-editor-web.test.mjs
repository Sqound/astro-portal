// The editor of a place — "Trouver un lieu idéal" at the top of
// "Localisation", the suggested places in a dialog whose cards offer
// "Utiliser", "Type", "Note (facultatif)" and the duplicate line at
// "Enregistrement", and no more "Retirer des lieux enregistrés".
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { registerHooks } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shippedLocales } from "portal/locales.js";
import { message } from "portal/i18n.js";
import { plannerFlowMessage as flow } from "portal/planner/flow-messages.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
globalThis.__createElement = createElement;
const DIALOG = `data:text/javascript,${encodeURIComponent(
  'const h = globalThis.__createElement; export const WebDialog = ({ title, children, footer }) => h("div", { className: "web-dialog-stand-in" }, h("h2", null, title), h("div", { className: "web-dialog-body" }, children), h("footer", null, footer)); export const WebConfirmDialog = () => null;',
)}`;
// The editor imports the map's stylesheet: nothing to load on the server.
const EMPTY = "data:text/javascript,export default {};";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith(".css")) return { url: EMPTY, shortCircuit: true };
    if (/dialog\/WebDialog\.js$/.test(specifier))
      return { url: DIALOG, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { PlannerPlaceDialog } =
  await import("portal/components/planner/PlannerPlaceDialog.js");
const { SuggestionCard } =
  await import("planner/components/PlacesSuggestedPane.js");
const { PlaceDetailFooter } =
  await import("planner/components/PlaceSuggestedDetail.js");
const { normalizeSuggestedPlace } = await import("planner/places-rules.js");

const here = (path) => new URL(path, import.meta.url);
const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/&#x27;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const editor = (props = {}) =>
  renderToStaticMarkup(
    createElement(PlannerPlaceDialog, {
      locale: "fr",
      place: null,
      places: [],
      autoLocate: false,
      onSave() {},
      onClose() {},
      ...props,
    }),
  );
const Ideal = () => null;
const dialogSource = await readFile(
  here("../../portal/src/components/planner/PlannerPlaceDialog.js"),
  "utf8",
);

test("« Trouver un lieu idéal » stands at the top of « Localisation », before « Utiliser ma position », as a whole row outside the four levels", () => {
  const markup = editor({ IdealPlaces: Ideal });
  const entry = markup.indexOf("planner-place-ideal");
  assert.ok(entry > 0, "the entry is drawn");
  assert.ok(
    entry < markup.indexOf("Utiliser ma position"),
    "above « Utiliser ma position »",
  );
  const text = textOf(markup);
  assert.match(
    text,
    /Trouver un lieu idéal Points de vue, campings et parcs au ciel sombre, autour de vous ou d’un de vos lieux\./,
  );
  const button = markup.slice(entry - 40, markup.indexOf("</button>", entry));
  assert.ok(
    !/btn-(primary|secondary|tertiary|link)/.test(button),
    "a row, not a button of the four levels",
  );
  assert.match(button, /aria-haspopup="dialog"/);
});

test("without the panel of the suggested places the entry is not offered", () => {
  assert.ok(!editor().includes("planner-place-ideal"));
});

test("the footer keeps its two buttons: « Annuler » a link, « Définir l’horizon » the primary", () => {
  const markup = editor({ IdealPlaces: Ideal });
  assert.match(markup, /btn-link" type="button">Annuler</);
  assert.match(
    markup,
    /btn-primary" type="button" disabled="">Définir l’horizon</,
  );
  assert.equal(
    (markup.match(/btn-primary/g) || []).length >= 2,
    true,
    "the search and the step",
  );
});

test("« Retirer des lieux enregistrés » is gone from the editor, its words from the catalogues, its prop from the page", async () => {
  assert.ok(
    !/removePlace|WebConfirmDialog|deleteConfirm|onDelete/.test(dialogSource),
  );
  for (const locale of shippedLocales()) {
    assert.equal(
      flow(locale, "removePlace"),
      "removePlace",
      `${locale} no longer says it`,
    );
    assert.equal(
      flow(locale, "removePlaceConfirm"),
      "removePlaceConfirm",
      locale,
    );
  }
  const page = await readFile(here("../src/components/PlannerPage.js"), "utf8");
  const dialog = page.slice(page.indexOf("<PlannerPlaceDialog"));
  assert.ok(!dialog.slice(0, 1800).includes("onDelete"));
});

test("step 3 offers « Type de lieu » (« Privé » first, then the four types), « Note (facultatif) » of 500 signs, and the duplicate line", () => {
  assert.match(dialogSource, /placeTypeLabel/);
  assert.match(dialogSource, /placesKindPrivate/);
  for (const key of [
    "placesKindViewpoint",
    "placesKindCampsite",
    "placesKindPark",
    "placesKindPicnic",
  ])
    assert.match(dialogSource, new RegExp(key));
  assert.match(dialogSource, /maxLength=\{500\}/);
  assert.match(dialogSource, /placeNoteLabel/);
  // Flagged, never blocked: the line sits beside the primary, which stays enabled.
  assert.match(dialogSource, /placeDuplicateSave/);
  assert.match(dialogSource, /placeDuplicateOpen/);
  const save = dialogSource.slice(
    dialogSource.indexOf("function save()"),
    dialogSource.indexOf("// The place being written against the others"),
  );
  assert.ok(!/duplicate/i.test(save), "saving never looks at the duplicates");
  assert.match(save, /kind: draft\.kind \|\| "private"/);
  assert.match(save, /note: note \|\| undefined/);
});

test("the duplicate line and the type are written in the ten languages", () => {
  for (const locale of shippedLocales())
    for (const key of [
      "placeTypeLabel",
      "placesKindPrivate",
      "placeNoteLabel",
      "placeDuplicateSave",
      "placeDuplicateOpen",
      "placeIdealEntry",
      "placeIdealEntryHelp",
    ])
      assert.notEqual(message(locale, key), key, `${locale} ${key}`);
});

const crest = normalizeSuggestedPlace({
  id: "osm:node/11",
  name: "Belvédère de la Crête",
  type: "viewpoint",
  latitude: 45.5,
  longitude: -30,
  skyQuality: { bortle: 2, sqm: 21.7, estimate: true },
});
const card = (props) =>
  renderToStaticMarkup(
    createElement(
      "ul",
      null,
      createElement(SuggestionCard, {
        locale: "fr",
        place: crest,
        reference: {
          name: "Col des Étoiles",
          latitude: 45,
          longitude: -30,
          placeId: "col",
        },
        referenceSky: { bortle: 3, sqm: 20.9 },
        mine: null,
        onAdd() {},
        onOpen() {},
        ...props,
      }),
    ),
  );

test("from the editor each card offers « Utiliser » beside « Itinéraire », and no « Ajouter » nor « Déjà dans vos lieux »", () => {
  const markup = card({ useMode: true, mine: { id: "x" } });
  const text = textOf(markup);
  assert.match(text, /Itinéraire Utiliser/);
  assert.ok(!text.includes("Ajouter") && !text.includes("Déjà dans vos lieux"));
  // "Utiliser" is the action of the card, the primary; "Itinéraire"
  // its secondary.
  assert.equal((markup.match(/btn-secondary/g) || []).length, 1);
  assert.equal((markup.match(/btn-primary/g) || []).length, 1);
  assert.ok(!markup.includes("btn-tertiary"));
});

test("from the picker and the tab the card keeps « Ajouter »", () => {
  const text = textOf(card({}));
  assert.match(text, /Itinéraire Ajouter/);
  assert.ok(!text.includes("Utiliser"));
});

test("the detail of a suggestion opened from the editor ends with « Utiliser », the primary, and creates nothing", () => {
  const markup = renderToStaticMarkup(
    createElement(PlaceDetailFooter, {
      locale: "fr",
      mode: "suggested",
      mine: null,
      place: crest,
      useMode: true,
      onUse() {},
    }),
  );
  assert.match(markup, /data-footer="use"/);
  assert.match(markup, /class="btn-primary">Utiliser</);
  assert.ok(!markup.includes("Ajouter à mes lieux"));
});

test("the panel of the suggested places in the editor is the tab's own component, in a dialog titled « Lieux suggérés »", async () => {
  const source = await readFile(
    here("../src/components/PlaceIdealDialog.js"),
    "utf8",
  );
  assert.match(source, /<PlacesSuggestedPane[^>]*useMode/s);
  assert.match(source, /placesTabSuggested/);
  assert.match(source, /<PlaceSuggestedDetail[^>]*useMode/s);
  assert.equal(message("fr", "placesTabSuggested"), "Lieux suggérés");
});

test("« lieu idéal » names our suggestions only, never the list of the person's places", () => {
  for (const locale of ["fr"]) {
    for (const key of [
      "placesTabMine",
      "placePickerSaved",
      "placePickerTitle",
      "placesTitle",
    ])
      assert.ok(!/idéal/i.test(message(locale, key)), key);
  }
  assert.equal(message("fr", "placeIdealEntry"), "Trouver un lieu idéal");
});
