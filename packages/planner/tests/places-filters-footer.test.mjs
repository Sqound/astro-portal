import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { messages } from "portal/i18n.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The second line of fields and the rows of its two dialogs, the foot of the
// sheet of a place in its three states, and the confirmation of the removal.
// The dialogs themselves are drawn in a portal on the page (nothing on the
// server): their rows are components of their own, rendered here.
await registerJsx();
const {
  PlacesFilterFields,
  PlacesKindChoices,
  PlacesSortChoices,
  placeKindsOrder,
} = await import("planner/components/PlacesSuggestedPane.js").then(
  (module) => ({
    ...module,
    placeKindsOrder: ["viewpoint", "campsite", "park", "picnic"],
  }),
);
const { PlaceDetailFooter, PlaceRemoveDialog } =
  await import("planner/components/PlaceSuggestedDetail.js");

const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));
const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const nothing = () => {};

const fields = (props) =>
  render(PlacesFilterFields, {
    locale: "fr",
    sort: "darkest",
    kinds: ["viewpoint", "campsite", "park"],
    onSort: nothing,
    onKinds: nothing,
    ...props,
  });

test("the second line of fields: « Trier par » and « Types de lieux · 3 sur 4 », two buttons that open a dialog, no pill", () => {
  const markup = fields({});
  assert.match(markup, /class="places-fields is-filters"/);
  const buttons = markup.match(/<button[^>]*places-field-button[^>]*>/g) ?? [];
  assert.equal(buttons.length, 2);
  for (const button of buttons) assert.match(button, /aria-haspopup="dialog"/);
  const [sort, kinds] = markup
    .split("</button>")
    .map((part) => textOf(part))
    .filter(Boolean);
  assert.equal(sort, "Trier par Ciel le plus sombre");
  assert.equal(kinds, "Types de lieux 3 sur 4");
  assert.doesNotMatch(markup, /places-pill|role="radio"|aria-pressed/);
  assert.doesNotMatch(textOf(markup), /Hors ligne/);
  // The field says the current sort, whatever it is, and the count of kinds.
  assert.match(textOf(fields({ sort: "distance" })), /Trier par Distance/);
  assert.match(
    textOf(fields({ sort: "bestTonight" })),
    /Trier par Meilleur cette nuit/,
  );
  assert.match(textOf(fields({ kinds: ["park"] })), /Types de lieux 1 sur 4/);
  assert.match(textOf(fields({ kinds: [] })), /Types de lieux 0 sur 4/);
  // Offline "Meilleur cette nuit" cannot be the sort: the field says what
  // the list is sorted by, "Ciel le plus sombre".
  assert.match(
    textOf(fields({ sort: "bestTonight", offline: true })),
    /Trier par Ciel le plus sombre/,
  );
});

test("« Trier par »: one row per sort, the current one ticked, « Meilleur cette nuit » carries its ranking sentence", () => {
  const markup = render(PlacesSortChoices, {
    locale: "fr",
    sort: "darkest",
    offline: false,
    onChoose: nothing,
  });
  assert.match(markup, /role="radiogroup" aria-label="Trier par"/);
  const rows = markup.match(
    /<button[^>]*role="radio"[^>]*>[\s\S]*?<\/button>/g,
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => /data-sort="(\w+)"/.exec(row)[1]),
    ["distance", "darkest", "bestTonight"],
  );
  assert.deepEqual(
    rows.map((row) => /aria-checked="(\w+)"/.exec(row)[1]),
    ["false", "true", "false"],
  );
  assert.deepEqual(
    rows.map((row) => row.includes("places-choice-tick")),
    [false, true, false],
  );
  assert.match(
    textOf(rows[2]),
    /Meilleur cette nuit Classés selon la météo de cette nuit, le ciel et le temps de trajet \(estimations\)\./,
  );
  assert.ok(rows.every((row) => !/disabled/.test(row)));
});

test("offline, « Meilleur cette nuit » is greyed in the sheet with its reason; the line « Hors ligne. » is gone", () => {
  const markup = render(PlacesSortChoices, {
    locale: "fr",
    sort: "bestTonight",
    offline: true,
    onChoose: nothing,
  });
  const rows = markup.match(
    /<button[^>]*role="radio"[^>]*>[\s\S]*?<\/button>/g,
  );
  assert.match(rows[2], /disabled/);
  assert.match(rows[2], /aria-checked="false"/);
  assert.match(
    textOf(rows[2]),
    /^Meilleur cette nuit Indisponible hors ligne : ce classement demande la météo de cette nuit\.$/,
  );
  assert.doesNotMatch(textOf(markup), /Classés selon/);
  // The old key is gone from every catalogue.
  for (const locale of Object.keys(messages))
    assert.equal(messages[locale].placesRankingOffline, undefined, locale);
});

test("« Types de lieux »: four check rows with the pictograms of the cards, the three default kinds ticked", () => {
  const markup = render(PlacesKindChoices, {
    locale: "fr",
    kinds: ["viewpoint", "campsite", "park"],
    onToggle: nothing,
  });
  assert.match(markup, /role="group" aria-label="Types de lieux"/);
  const rows = markup.match(/<label[^>]*>[\s\S]*?<\/label>/g);
  assert.equal(rows.length, placeKindsOrder.length);
  assert.deepEqual(
    rows.map((row) => textOf(row)),
    ["Points de vue", "Campings", "Parcs", "Aires de pique-nique"],
  );
  assert.deepEqual(
    rows.map((row) => /checked=""/.test(row)),
    [true, true, true, false],
  );
  for (const row of rows) assert.match(row, /<svg[^>]*places-icon/);
});

test("the campsite is drawn as a tent, outline and door", async () => {
  const { PlaceKindIcon } = await import("planner/components/PlacesParts.js");
  const tent = render(PlaceKindIcon, { kind: "campsite" });
  assert.match(tent, /d="M3 19 12 5l9 14Z"/);
  assert.match(tent, /d="M10 19l2-5 2 5"/);
  assert.doesNotMatch(render(PlaceKindIcon, { kind: "park" }), /M10 19l2-5/);
});

const footer = (props) =>
  render(PlaceDetailFooter, {
    locale: "fr",
    mode: "suggested",
    mine: null,
    place: { latitude: 45.5037, longitude: -30 },
    onAdd: nothing,
    onRemove: nothing,
    ...props,
  });
const buttonsOf = (markup) =>
  markup.match(
    /<(?:a|button)\b[^>]*class="btn-[^"]*"[\s\S]*?<\/(?:a|button)>/g,
  );

test("the foot of the sheet: « Itinéraire » first (left), then « Ajouter à mes lieux » (primary, with its « + ») taking the rest", () => {
  const markup = footer({});
  const [route, add] = buttonsOf(markup);
  assert.match(route, /^<a class="btn-secondary places-route"/);
  assert.match(route, /<svg[\s\S]*<path d="M5 17V9/); // the glyph of "Itinéraire" on the cards
  assert.equal(textOf(route), "Itinéraire");
  assert.match(add, /^<button type="button" class="btn-primary"/);
  assert.match(add, /<path d="M12 5v14M5 12h14"/); // the "+" of the cards
  assert.equal(textOf(add), "Ajouter à mes lieux");
  assert.equal(buttonsOf(markup).length, 2);
  assert.doesNotMatch(markup, /places-already|is-destructive/);
});

test("a place already saved: the status line above « Itinéraire » and « Retirer de mes lieux » (secondary, destructive tint), no add", () => {
  const markup = footer({ mine: { id: "lac" } });
  assert.ok(
    markup.indexOf("places-already") < markup.indexOf("btn-secondary"),
    "the status line comes first",
  );
  assert.match(
    textOf(markup),
    /^Déjà dans vos lieux Itinéraire Retirer de mes lieux$/,
  );
  const [route, remove] = buttonsOf(markup);
  assert.match(route, /places-route/);
  assert.match(
    remove,
    /^<button type="button" class="btn-secondary is-destructive"/,
  );
  assert.doesNotMatch(markup, /btn-primary|Ajouter à mes lieux/);
  // A screen that offers no removal (the place picker) shows the status only.
  const picker = footer({ mine: { id: "lac" }, onRemove: undefined });
  assert.doesNotMatch(picker, /Retirer de mes lieux|is-destructive/);
  assert.match(textOf(picker), /Déjà dans vos lieux Itinéraire/);
});

test("a saved place opened from « Mes lieux »: the route alone, on the right; no add, no removal", () => {
  const markup = footer({ mode: "linked", mine: { id: "lac" } });
  assert.deepEqual(
    buttonsOf(markup).map((button) => textOf(button)),
    ["Itinéraire"],
  );
  assert.match(markup, /data-footer="linked"/);
  assert.doesNotMatch(markup, /places-already|btn-primary|is-destructive/);
});

test("the confirmation of the removal: the title names the place, the destructive primary removes, « Annuler » is a link (rules 4 and 6)", () => {
  const dialog = PlaceRemoveDialog({
    locale: "fr",
    name: "Camping du Lac Noir",
    onCancel: nothing,
    onConfirm: nothing,
  });
  assert.equal(dialog.props.ariaLabel, "Retirer ce lieu enregistré");
  // The title is the catalogue's sentence with the place's name, and it
  // keeps the no-break spaces of the French typography.
  assert.equal(
    dialog.props.title,
    messages.fr.placeRemoveConfirmTitle.replace(
      "{place}",
      "Camping du Lac Noir",
    ),
  );
  assert.match(dialog.props.title, /^Retirer\u00a0«\u00a0Camping du Lac Noir/);
  const body = textOf(renderToStaticMarkup(dialog.props.children));
  assert.equal(body, "Les sessions existantes conservent leur copie.");
  const foot = renderToStaticMarkup(dialog.props.footer);
  assert.match(
    foot,
    /<button type="button" class="btn-link">Annuler<\/button>/,
  );
  assert.match(
    foot,
    /<button type="button" class="btn-primary is-destructive">Retirer de mes lieux<\/button>/,
  );
  assert.ok(foot.indexOf("btn-link") < foot.indexOf("btn-primary"));
});

test("every new word exists in the ten languages, with its placeholders", () => {
  const keys = [
    "placesKindsValue",
    "placesSortBestTonightOffline",
    "placeRemoveFromMine",
    "placeRemoveConfirmTitle",
    "placeRemoveConfirmBody",
    "placeRemoveDialogLabel",
  ];
  assert.equal(Object.keys(messages).length, 10);
  for (const locale of Object.keys(messages)) {
    for (const key of keys)
      assert.ok(messages[locale][key], `${locale}.${key}`);
    assert.ok(messages[locale].placesKindsValue.includes("{n}"), locale);
    assert.ok(messages[locale].placesKindsValue.includes("{total}"), locale);
    assert.match(messages[locale].placeRemoveConfirmTitle, /\{place\}/, locale);
  }
});
