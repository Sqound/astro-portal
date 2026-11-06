// "Choisir un lieu" — the three ways to
// change place are three tertiaries of the same weight, "Choisir ce lieu"
// is the only primary, each row says what the card of "Mes lieux" says, and
// "Détails" is offered for any place. Synthetic places.
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shippedLocales } from "portal/locales.js";
import { message } from "portal/i18n.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
// The picker draws through the shared sheet (`FormSheet`, a `WebDialog` portal,
// nothing on the server): a stand-in lays its title, body and footer out in
// place, as `plan-sheet-web.test.mjs` does for the dialogs.
globalThis.__createElement = createElement;
const DIALOG = `data:text/javascript,${encodeURIComponent(
  'const h = globalThis.__createElement; export const WebDialog = ({ title, children, footer }) => h("div", { className: "web-dialog-stand-in" }, h("h2", null, title), h("div", { className: "web-dialog-body" }, children), h("footer", null, footer));',
)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "portal/components/dialog/WebDialog.js")
      return { url: DIALOG, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { PlacePickerSheet } =
  await import("planner/components/PlacePickerSheet.js");
const { MyPlaceCard } = await import("planner/components/PlacesView.js");

const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/&#x27;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const col = {
  id: "col",
  name: "Col des Étoiles",
  latitude: "45",
  longitude: "-30",
  kind: "viewpoint",
  horizonStatus: "verified",
};
const lac = {
  id: "lac",
  name: "Camping du Lac Noir",
  latitude: "45.4",
  longitude: "-30.4",
  kind: "campsite",
  horizonStatus: "unverified",
  knownPlace: {
    source: "osm",
    id: "node/12",
    type: "campsite",
    linkedAt: "2026-09-20T18:00:00.000Z",
  },
};
const jardin = {
  id: "jardin",
  name: "Jardin de la maison",
  latitude: "45.1",
  longitude: "-30.1",
  horizonStatus: "verified",
};
const client = {
  known: async () => ({ place: null }),
  search: async () => ({ page: null }),
};
const body = (props = {}) =>
  renderToStaticMarkup(
    createElement(PlacePickerSheet, {
      locale: "fr",
      places: [col, lac, jardin],
      selectedId: "lac",
      defaultId: "col",
      client,
      onChoose() {},
      onUsePosition() {},
      onAddByHand() {},
      onAddSuggestion: async () => null,
      onClose() {},
      ...props,
    }),
  );

test("the three ways to change place are three tertiaries of one style, « Choisir ce lieu » the only primary", () => {
  const markup = body();
  const actions = markup.slice(
    markup.indexOf("places-picker-actions"),
    markup.indexOf("places-picker-foot"),
  );
  assert.equal((actions.match(/btn-tertiary/g) || []).length, 3);
  assert.ok(!/btn-primary|btn-link/.test(actions), "only the three choices");
  const order = [
    "Trouver un lieu idéal",
    "Utiliser ma position",
    "Ajouter un lieu à la main",
  ].map((label) => actions.indexOf(label));
  assert.ok(
    order.every((index) => index > 0) &&
      [...order].sort((a, b) => a - b).join() === order.join(),
    "in the designed order",
  );
  assert.ok(
    !markup.includes("places-picker-find-help"),
    "no help line under the first choice",
  );
});

test("the foot has « Mes lieux » (link) at the left and « Choisir ce lieu » (primary) at the right", () => {
  const markup = body();
  const foot = markup.slice(markup.indexOf("places-picker-foot"));
  assert.match(
    foot,
    /^places-picker-foot"><button type="button" class="btn-link">Mes lieux<\/button><button type="button" class="btn-primary"[^>]*>Choisir ce lieu/,
  );
  assert.equal((markup.match(/btn-primary/g) || []).length, 1);
  assert.match(
    textOf(foot),
    /Mes lieux Choisir ce lieu/,
    "link first, primary last",
  );
});

test("the first choice reads « Trouver un lieu idéal », the very words of the editor's entry", () => {
  assert.equal(
    message("fr", "placePickerFind"),
    message("fr", "placeIdealEntry"),
  );
  for (const locale of shippedLocales())
    assert.equal(
      message(locale, "placePickerFind"),
      message(locale, "placeIdealEntry"),
      locale,
    );
});

test("« Choisir ce lieu » waits for a chosen place; with none saved it is not drawn and the three choices stay active", () => {
  const some = body({ selectedId: null });
  assert.match(
    some,
    /<button type="button" class="btn-primary" disabled="">Choisir ce lieu/,
  );
  const none = body({ places: [], selectedId: null });
  assert.match(none, /Aucun lieu enregistré\./);
  assert.doesNotMatch(none, /Choisir ce lieu/);
  assert.match(none, /btn-link">Mes lieux<\/button>/);
  assert.ok(!/<button[^>]*btn-tertiary[^>]*disabled/.test(none));
});

test("each row says what the card says: « Lieu par défaut · Point de vue », « Camping · 52 km », the Bortle line", () => {
  const markup = body();
  const rows = markup.split('class="places-picker-item').slice(1).map(textOf);
  assert.match(rows[0], /^.*Col des Étoiles Lieu par défaut · Point de vue/);
  assert.ok(
    !/Lieu par défaut · Point de vue · \d/.test(rows[0]),
    "the default place has no distance",
  );
  assert.match(rows[1], /Camping du Lac Noir Camping · \d+ km/);
  assert.match(rows[2], /Jardin de la maison Privé · \d+ km/);
  assert.ok(
    !/estimé/.test(textOf(markup)),
    "the former « Bortle N estimé » is gone",
  );
});

test("the card of « Mes lieux » and the picker's row share the lines (kind and distance, sky)", () => {
  const card = renderToStaticMarkup(
    createElement(MyPlaceCard, {
      locale: "fr",
      place: lac,
      isDefault: false,
      reference: {
        name: "Col des Étoiles",
        latitude: 45,
        longitude: -30,
        placeId: "col",
      },
      skyOverride: { bortle: 3, sqm: 21.4 },
      onOpen() {},
    }),
  );
  const row = body({ selectedId: null });
  const lineOf = (markup) =>
    (
      markup.match(
        /<p class="places-kind-line">.*?<\/p>|<span class="places-kind-line">(?:<span[^>]*>.*?<\/span>)+<\/span>/g,
      ) || []
    ).map(textOf);
  // On the card the type is a badge, then the distance; the picker's
  // row keeps its one line of text — the same words either way.
  const cardLine = lineOf(card)[0];
  assert.match(cardLine, /^Camping \d+ km$/);
  assert.ok(
    lineOf(row).includes(cardLine.replace("Camping ", "Camping · ")),
    "the picker repeats the card's kind-and-distance words",
  );
});

test("« Détails » is on the chosen row, for any place; « Site internet » only for a linked one", () => {
  const unlinked = body({ selectedId: "jardin" });
  assert.match(unlinked, /places-picker-extras[^]*Détails/);
  assert.ok(!unlinked.includes("Site internet"));
  const linked = body({ selectedId: "lac" });
  assert.match(linked, /places-picker-extras[^]*Détails/);
  assert.equal(
    (linked.match(/Détails/g) || []).length,
    1,
    "only the chosen row has it",
  );
});

test("« Mes lieux » calls onOpenMine; ten languages say it with the key of the tab", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../src/components/PlacePickerSheet.js", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /className="btn-link" onClick=\{onOpenMine\}>\s*\{message\(locale, "placesTabMine"\)\}/,
  );
  for (const locale of shippedLocales())
    assert.ok(message(locale, "placesTabMine"), locale);
  assert.equal(message("fr", "placesTabMine"), "Mes lieux");
});

test("the picker's source gives the picker no other primary and no link among its choices", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../src/components/PlacePickerSheet.js", import.meta.url),
    "utf8",
  );
  assert.equal((source.match(/className="btn-primary"/g) || []).length, 1);
  assert.ok(
    !/placePickerUsePosition[^]{0,80}btn-link|btn-link[^]{0,120}placePickerUsePosition/.test(
      source,
    ),
  );
});
