// The web's part of "Mon matériel": the permanent "Gérer mon matériel" link of
// the planner's stage 2 (to "Mon espace" → "Matériel"), « Définir mon
// matériel » in the hidden-and-empty picker, and "Filtres possédés" merged into the filters of
// "Mon matériel" for a person signed in to a space.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { message } from "portal/i18n.js";
import { mySpaceEquipmentPath } from "../src/equipment-groups.js";
import {
  ownedFiltersAsEquipment,
  plannerOwnedFilters,
} from "../src/owned-filters.js";

await registerJsx();
const { EquipmentManageLink } =
  await import("planner/components/EquipmentManageLink.js");
const { EquipmentPicker } =
  await import("planner/components/EquipmentPicker.js");

const squash = (text) => text.replace(/[\s  ]+/g, " ");

test("« Gérer mon matériel », a link to « Mon espace » → « Matériel », in every language", () => {
  const markup = renderToStaticMarkup(
    createElement(EquipmentManageLink, {
      locale: "fr",
      href: mySpaceEquipmentPath("fr"),
    }),
  );
  assert.match(
    markup,
    /<a class="btn-link planner-equipment-manage-link" href="\/fr\/manage\/equipment"><svg [^>]*aria-hidden="true">.*<\/svg>Gérer mon matériel<\/a>/,
  );
  for (const locale of [
    "en",
    "ja",
    "de",
    "es",
    "it",
    "pt-BR",
    "ru",
    "zh-Hans",
    "zh-Hant",
  ]) {
    const words = message(locale, "plannerEquipmentManage");
    assert.ok(words && words !== "plannerEquipmentManage", locale);
    assert.notEqual(words, message("fr", "plannerEquipmentManage"), locale);
  }
  // Hidden and nothing of one's own: the picker's way out is « Définir mon
  // matériel », to the same page.
  const hidden = renderToStaticMarkup(
    createElement(EquipmentPicker, {
      locale: "fr",
      category: "telescope",
      value: null,
      mine: [],
      defaults: [],
      known: [],
      defaultsLabelled: true,
      hiddenEmpty: true,
      define: { href: mySpaceEquipmentPath("fr") },
      onChange: () => {},
    }),
  );
  assert.match(squash(hidden), /Définir mon matériel/);
  assert.match(hidden, /href="\/fr\/manage\/equipment"/);
  assert.ok(!/Ouvrir mon espace/.test(squash(hidden)));
});

test("signed in, the browser's filters go to « Mon matériel » with their family, and the advice reads the space's list alone", () => {
  const local = [
    { id: "local-a", name: "Anti-pollution large bande", family: "uhc" },
    { id: "local-b", name: "  Hα  7 nm ", family: "ha" },
    { id: "", name: "Sans identifiant", family: "ha" },
  ];
  assert.deepEqual(ownedFiltersAsEquipment(local), [
    {
      id: "local-a",
      type: "filter",
      name: "Anti-pollution large bande",
      planner: { family: "uhc" },
    },
    {
      id: "local-b",
      type: "filter",
      name: "Hα 7 nm",
      planner: { family: "ha" },
    },
  ]);
  const inventory = [{ id: "f-1", name: "UV/IR cut" }];
  const signedIn = plannerOwnedFilters({ signedIn: true, inventory, local });
  assert.deepEqual(
    signedIn.map((filter) => filter.id),
    ["f-1"],
  );
  const visitor = plannerOwnedFilters({ signedIn: false, inventory, local });
  assert.deepEqual(
    visitor.map((filter) => filter.id),
    ["local-a", "local-b"],
  );
});
