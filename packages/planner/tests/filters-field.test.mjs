import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { messages } from "portal/i18n.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The filters of the equipment stage are a field "Filtres · N sélectionnés"
// that opens a dialog of check boxes, the chosen ones recalled as tags, one
// line and a ⓘ in place of the paragraph. The dialog is drawn in a portal on
// the page (nothing on the server): its rows and its helpers are rendered and
// called here.
await registerJsx();
const {
  FilterChoices,
  FiltersField,
  chosenFilterProfiles,
  filtersFieldValue,
  filtersSearchThreshold,
  filtersTotal,
} = await import("planner/components/FiltersField.js");

const { equipmentSearch } = await import("planner/equipment-search.js");

const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));
const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const nothing = () => {};

const mine = {
  key: "mine",
  label: "Mon matériel",
  profiles: [
    { id: "inv-1", name: "Acuter integrated H-alpha etalon" },
    { id: "inv-2", name: "SVBONY CLS" },
  ],
};
const others = {
  key: "defaults",
  label: "Matériel par défaut",
  profiles: [
    { id: "filter-ha", name: "Hα" },
    { id: "filter-oiii", name: "OIII" },
  ],
};
const field = (props) =>
  render(FiltersField, {
    locale: "fr",
    groups: [mine, others],
    selectedIds: [],
    onApply: nothing,
    ...props,
  });

test("the field says « Aucun » at zero, then the count, in French", () => {
  assert.equal(filtersFieldValue("fr", 0), "Aucun");
  assert.equal(filtersFieldValue("fr", 1), "1 sélectionné");
  assert.equal(filtersFieldValue("fr", 2), "2 sélectionnés");
  assert.equal(filtersFieldValue("en", 0), "None");
  assert.equal(filtersFieldValue("en", 3), "3 selected");
  const markup = field({});
  assert.match(markup, /<legend>Filtres<\/legend>/);
  const button = /<button[^>]*data-filters-field[^>]*>[\s\S]*?<\/button>/.exec(
    markup,
  )[0];
  assert.match(button, /aria-haspopup="dialog"/);
  assert.equal(textOf(button), "Aucun");
  assert.equal(
    textOf(
      /<button[^>]*data-filters-field[^>]*>[\s\S]*?<\/button>/.exec(
        field({ selectedIds: ["inv-1", "filter-ha"] }),
      )[0],
    ),
    "2 sélectionnés",
  );
});

test("no chip per filter and no paragraph: one line stays, the rest of the help is behind the ⓘ", () => {
  const markup = field({});
  assert.doesNotMatch(markup, /aria-pressed|planner-filter-picker/);
  assert.doesNotMatch(markup, /Plusieurs choix possibles/);
  assert.doesNotMatch(markup, /au moins un filtre sélectionné/);
  const line =
    /<div class="info-line planner-filter-line">[\s\S]*?<\/div>/.exec(
      markup,
    )[0];
  assert.match(textOf(line), /^Aucun choix\s: pas de restriction par filtre\./);
  assert.match(
    line,
    /<button[^>]*info-button[^>]*data-testid="planner-filters-info"/,
  );
  // Nothing of the old catalogue keys survives unused: the two sentences stay
  // in the flow catalogue, word for word, for the ⓘ.
  assert.equal(
    messages.fr.plannerFiltersNoChoiceLine,
    "Aucun choix\u00a0: pas de restriction par filtre.",
  );
});

test("the chosen filters are recalled as tags under the field, in the order they were chosen", () => {
  assert.doesNotMatch(field({}), /data-filter-tags/);
  const markup = field({ selectedIds: ["filter-ha", "inv-2", "gone"] });
  const tags = /<ul class="planner-filter-tags"[^>]*>([\s\S]*?)<\/ul>/.exec(
    markup,
  )[1];
  assert.deepEqual(tags.match(/<li[^>]*>[\s\S]*?<\/li>/g).map(textOf), [
    "Hα",
    "SVBONY CLS",
  ]);
  assert.ok(
    markup.indexOf("data-filters-field") < markup.indexOf("data-filter-tags"),
    "the tags come under the field",
  );
  assert.ok(
    markup.indexOf("data-filter-tags") < markup.indexOf("planner-filter-line"),
  );
  assert.deepEqual(
    chosenFilterProfiles([mine, others], ["filter-ha", "x"]).map(
      (profile) => profile.id,
    ),
    ["filter-ha"],
  );
});

test("the dialog lists « Mon matériel » then the other group, one check row per filter, the chosen ones ticked", () => {
  const markup = render(FilterChoices, {
    locale: "fr",
    groups: [mine, others],
    chosen: ["inv-2", "filter-oiii"],
    onToggle: nothing,
  });
  assert.match(markup, /role="group" aria-label="Filtres"/);
  assert.deepEqual(
    (markup.match(/<p class="planner-filter-group-label">[^<]*/g) ?? []).map(
      (label) => label.replace(/<[^>]+>/, ""),
    ),
    ["Mon matériel", "Matériel par défaut"],
  );
  const rows = markup.match(/<label[^>]*>[\s\S]*?<\/label>/g);
  assert.deepEqual(
    rows.map((row) => /data-filter="([^"]+)"/.exec(row)[1]),
    ["inv-1", "inv-2", "filter-ha", "filter-oiii"],
  );
  assert.deepEqual(
    rows.map((row) => /checked=""/.test(row)),
    [false, true, false, true],
  );
  // A visitor's list has one group and no label.
  const visitor = render(FilterChoices, {
    locale: "fr",
    groups: [{ key: "all", label: "", profiles: others.profiles }],
    chosen: [],
    onToggle: nothing,
  });
  assert.doesNotMatch(visitor, /planner-filter-group-label/);
});

test("the dialog searches as every equipment picker: above twelve filters, « Mon matériel » by the search only, « Type » the family", () => {
  assert.equal(filtersSearchThreshold, 12);
  assert.equal(filtersTotal([mine, others]), 4);
  const shown = equipmentSearch({
    category: "filter",
    mine: mine.profiles,
    defaults: others.profiles,
    query: "  SVB ",
  });
  assert.deepEqual(
    shown.mine.map((profile) => profile.id),
    ["inv-2"],
  );
  assert.deepEqual(shown.defaults, []);
  assert.equal(shown.showsSearch, false);
  // Thirteen default filters of two families: the field and « Type », never
  // « Marque » (a filter names no maker).
  const many = Array.from({ length: 13 }, (_, index) => ({
    id: `f-${index}`,
    name: `Filtre ${index}`,
    family: index % 2 ? "ha" : "oiii",
  }));
  const wide = equipmentSearch({
    category: "filter",
    mine: mine.profiles,
    defaults: many,
    kind: "ha",
  });
  assert.equal(wide.showsSearch, true);
  assert.equal(wide.showsKindMenu, true);
  assert.equal(wide.showsMakerMenu, false);
  assert.equal(wide.mine.length, 2);
  assert.equal(wide.count, 6);
});

test("a field with no filter draws nothing", () => {
  assert.equal(field({ groups: [] }), "");
  assert.equal(
    field({ groups: [{ key: "all", label: "", profiles: [] }] }),
    "",
  );
});

test("the ten catalogues carry the words of the field, the dialog and the line", () => {
  const keys = [
    "plannerFiltersSelected",
    "plannerFiltersSelectedOne",
    "plannerFiltersNone",
    "plannerFiltersNoChoiceLine",
    "plannerFiltersApply",
    "plannerFiltersClear",
    "plannerFiltersSearch",
    "plannerFiltersNoMatch",
  ];
  assert.equal(Object.keys(messages).length, 10);
  for (const locale of Object.keys(messages))
    for (const key of keys)
      assert.ok(
        typeof messages[locale][key] === "string" && messages[locale][key],
        `${locale}.${key}`,
      );
});
