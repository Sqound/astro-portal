// The equipment pickers of the web planner: the search field and the two
// menus « Marque » and « Type » above the native select, the count line and
// « Effacer les filtres » under it, « Mon matériel » first and never filtered,
// « Choisir… » for a field with nothing chosen, no « Personnalisé… », and
// « Définir mon matériel » with the way back that picks the piece declared.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { message } from "portal/i18n.js";
import commonEquipment from "../src/common-equipment-profiles.json" with { type: "json" };
import {
  defineEquipmentHref,
  equipmentCountText,
  equipmentKindLabel,
  equipmentKindShortLabel,
  icuPlural,
} from "../src/equipment-picker.js";
import {
  equipmentChosenOnReturn,
  equipmentReturnKey,
  equipmentReturnMaxAgeMs,
  equipmentReturnPending,
  rememberEquipmentForReturn,
} from "../src/equipment-return.js";
import { equipmentKindOrder } from "../src/equipment-search.js";
import { telescopeProfiles } from "../src/planner.js";

await registerJsx();
const { DefineEquipmentLink, EquipmentPicker, EquipmentSearchBar } =
  await import("planner/components/EquipmentPicker.js");
const { equipmentSearch } = await import("../src/equipment-search.js");

const eyepieces = commonEquipment.eyepieces;
const telescopes = telescopeProfiles;
const ownEyepiece = {
  id: "inv-hyperion",
  name: "Hyperion 13 mm",
  focalLengthMm: 13,
  apparentFieldDegrees: 68,
};
const squash = (text) => text.replace(/[\s  ]+/g, " ");
const decoded = (text) =>
  text
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
const render = (props = {}) =>
  decoded(
    renderToStaticMarkup(
      createElement(EquipmentPicker, {
        locale: "fr",
        category: "eyepiece",
        value: null,
        mine: [ownEyepiece],
        defaults: eyepieces,
        defaultsLabelled: true,
        onChange: () => {},
        ...props,
      }),
    ),
  );
const optgroupLabels = (markup) =>
  [...markup.matchAll(/<optgroup label="([^"]*)"/g)].map((match) => match[1]);
// The options of the field's own select (the last select of the picker).
const fieldOptions = (markup) => {
  const selects = [...markup.matchAll(/<select[^>]*>([\s\S]*?)<\/select>/g)];
  return [
    ...selects.at(-1)[1].matchAll(/<option([^>]*)>([^<]*)<\/option>/g),
  ].map(([, attributes, text]) => ({
    value: /value="([^"]*)"/.exec(attributes)?.[1],
    text,
    hidden: /\bhidden=""/.test(attributes),
    disabled: /\bdisabled=""/.test(attributes),
    selected: /\bselected=""/.test(attributes),
  }));
};
const menuOptions = (markup, name) => {
  const select = new RegExp(
    `<select aria-label="${name}"[^>]*>([\\s\\S]*?)</select>`,
  ).exec(markup);
  return select
    ? [...select[1].matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map(
        ([, text]) => text,
      )
    : null;
};

test("the eyepiece field: search, « Marque » and « Type », « Mon matériel » first, the count, « Choisir… », no « Personnalisé… »", () => {
  const markup = render();
  assert.match(
    markup,
    /<input type="search"[^>]*placeholder="Rechercher un oculaire"/,
  );
  assert.deepEqual(optgroupLabels(markup), [
    "Mon matériel",
    "Matériel par défaut",
  ]);
  const options = fieldOptions(markup);
  assert.deepEqual(options[0], {
    value: "",
    text: "Choisir…",
    hidden: true,
    disabled: true,
    selected: true,
  });
  // « Aucun choix » first, outside the groups, then « Mon matériel ».
  assert.deepEqual(options[1], {
    value: "__no-choice__",
    text: "Aucun choix",
    hidden: false,
    disabled: false,
    selected: false,
  });
  assert.ok(markup.indexOf(">Aucun choix<") < markup.indexOf("<optgroup"));
  assert.equal(options[2].value, "inv-hyperion");
  assert.equal(options.length, 3 + eyepieces.length);
  assert.ok(!options.some((option) => option.value === "custom"));
  assert.doesNotMatch(markup, /Personnalisé/);
  const brands = menuOptions(markup, "Marque");
  assert.equal(brands[0], "Marque");
  assert.equal(brands[1], "Toutes les marques");
  // The most numerous maker of the catalogue comes first.
  const makerCounts = new Map();
  for (const profile of eyepieces)
    if (profile.maker)
      makerCounts.set(profile.maker, (makerCounts.get(profile.maker) || 0) + 1);
  const [topMaker, topCount] = [...makerCounts].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];
  assert.equal(brands[2], `${topMaker} (${topCount})`);
  const types = menuOptions(markup, "Type");
  assert.equal(types[1], "Tous les types");
  assert.ok(
    types.some((text) =>
      /^Ultra grand champ \(80° et plus\) \(\d+\)$/.test(text),
    ),
  );
  assert.match(
    squash(markup),
    new RegExp(
      `<p class="planner-equipment-count"><span>${eyepieces.length} oculaires</span></p>`,
    ),
  );
  assert.doesNotMatch(markup, /Effacer les filtres/);
  // The order of the elements: search, menus, the field, the count.
  const at = (text) => markup.indexOf(text);
  assert.ok(at('type="search"') < at("planner-equipment-menus"));
  assert.ok(at("planner-equipment-menus") < at("planner-equipment-choice"));
  assert.ok(at("planner-equipment-choice") < at("planner-equipment-count"));
});

test("Tele Vue and ultra wide field: the defaults narrowed, « Mon matériel » kept, the menus set, « Effacer les filtres »", () => {
  const markup = render({
    value: "inv-hyperion",
    initialMaker: "Tele Vue",
    initialKind: "ultra-wide-field",
  });
  const expected = eyepieces.filter(
    (profile) =>
      profile.maker === "Tele Vue" && profile.kind === "ultra-wide-field",
  );
  const options = fieldOptions(markup);
  assert.deepEqual(
    options.map((option) => option.value),
    ["__no-choice__", "inv-hyperion", ...expected.map((profile) => profile.id)],
  );
  assert.ok(options[1].selected);
  assert.equal(
    (markup.match(/planner-equipment-menu is-set/g) || []).length,
    2,
  );
  assert.match(
    squash(markup),
    new RegExp(
      `${expected.length} oculaires</span><span aria-hidden="true"> · </span><button type="button" class="btn-link planner-equipment-clear-filters">Effacer les filtres</button>`,
    ),
  );
  // The chosen menu value is the selected option of its menu.
  assert.match(
    markup,
    /<option value="Tele Vue" selected="">Tele Vue \(\d+\)<\/option>/,
  );
});

test("« Type » closed on a long kind reads its short name; the other options keep their full name and count, in every language", () => {
  const cases = {
    fr: ["Ultra grand champ", "Grand champ (56 à 79°)"],
    de: ["Ultraweit", "Weitwinkel (56 bis 79°)"],
    ru: ["Сверхширокий", "Широкоугольный (56–79°)"],
    ja: ["超広視界", "広視界（56〜79°）"],
  };
  for (const [locale, [short, otherFull]] of Object.entries(cases)) {
    const markup = render({ locale, initialKind: "ultra-wide-field" });
    const select = new RegExp(
      `<select aria-label="${message(locale, "plannerEquipmentType")}"[^>]*>([\\s\\S]*?)</select>`,
    ).exec(markup)[1];
    const chosen =
      /<option value="ultra-wide-field" selected="">([^<]*)<\/option>/.exec(
        select,
      );
    assert.ok(chosen, locale);
    assert.ok(
      chosen[1].startsWith(`${short} (`) && !chosen[1].includes("80"),
      `${locale}: ${chosen[1]}`,
    );
    assert.match(
      select,
      new RegExp(
        `<option value="wide-field">${otherFull.replace(/[()]/g, "\\$&")} \\(`,
      ),
      locale,
    );
  }
  // Nothing chosen: every option its full name.
  const types = menuOptions(render(), "Type");
  assert.ok(
    types.some((text) => text.startsWith("Ultra grand champ (80° et plus) (")),
  );
});

test("nothing matches: the select says so, the sentence of the kind and « Définir mon matériel »", () => {
  const markup = render({
    mine: [],
    initialQuery: "barlow 3",
    define: { href: "/fr/manage/equipment" },
  });
  const options = fieldOptions(markup);
  assert.deepEqual(
    options.map((option) => [option.text, option.disabled]),
    [
      ["Choisir…", true],
      ["Aucun choix", false],
      ["Rien ne correspond à votre recherche.", true],
    ],
  );
  assert.match(
    squash(markup),
    /Vous ne trouvez pas votre oculaire \? Déclarez-le dans Mon matériel : il apparaîtra ici, en tête de liste\./,
  );
  assert.match(
    markup,
    /<a class="btn-link planner-equipment-define-link" href="\/fr\/manage\/equipment"><svg[\s\S]*?<\/svg>Définir mon matériel<\/a>/,
  );
  assert.match(markup, /0 oculaire<\/span>/);
  // With matches, the field draws no link: the section draws it once.
  assert.doesNotMatch(
    render({ define: { href: "/fr/manage/equipment" } }),
    /Définir mon matériel/,
  );
});

test("the telescope keeps its kinds under « Matériel par défaut », its line of facts, and filters on the optical formula", () => {
  const own = {
    id: "inv-c8",
    name: "C8 du club",
    apertureMm: 203,
    focalLengthMm: 2032,
  };
  const markup = render({
    category: "telescope",
    mine: [own],
    defaults: telescopes,
    value: "seestar-s50",
  });
  assert.deepEqual(optgroupLabels(markup), [
    "Mon matériel",
    "Matériel par défaut · Télescope intelligent",
    "Matériel par défaut · Lunette",
    "Matériel par défaut · Télescope",
  ]);
  assert.match(markup, /placeholder="Rechercher un instrument"/);
  assert.match(
    squash(markup),
    /<option value="seestar-s50" selected="">ZWO Seestar S50 · 50 mm · 250 mm · f\/5 · caméra intégrée<\/option>/,
  );
  assert.ok(
    menuOptions(markup, "Type").includes(
      `Schmidt-Cassegrain (${telescopes.filter((t) => t.kind === "schmidt-cassegrain").length})`,
    ),
  );
  const sct = render({
    category: "telescope",
    mine: [own],
    defaults: telescopes,
    value: "seestar-s50",
    initialKind: "schmidt-cassegrain",
  });
  const ids = fieldOptions(sct).map((option) => option.value);
  // The chosen Seestar, left out by the menu, stays the select's value.
  assert.deepEqual(fieldOptions(sct)[0], {
    value: "seestar-s50",
    text: "ZWO Seestar S50",
    hidden: true,
    disabled: false,
    selected: true,
  });
  assert.equal(ids[1], "__no-choice__");
  assert.equal(ids[2], "inv-c8");
  for (const id of ids.slice(3))
    assert.equal(
      telescopes.find((telescope) => telescope.id === id).kind,
      "schmidt-cassegrain",
      id,
    );
  // A visitor reads the kinds without « Matériel par défaut ».
  assert.deepEqual(
    optgroupLabels(
      render({
        category: "telescope",
        mine: [],
        defaults: telescopes,
        defaultsLabelled: false,
      }),
    ),
    ["Télescope intelligent", "Lunette", "Télescope"],
  );
});

test("« Aucun » of the reducer stays first, outside the groups and the filters; a mount is never searched", () => {
  const modifiers = commonEquipment.opticalModifiers;
  const markup = render({
    category: "modifier",
    mine: [],
    defaults: modifiers,
    value: "none",
    leading: [{ id: "none", label: "Aucun" }],
    initialMaker: "Svbony",
  });
  const options = fieldOptions(markup);
  assert.deepEqual(options[0], {
    value: "none",
    text: "Aucun",
    hidden: false,
    disabled: false,
    selected: true,
  });
  assert.ok(!options.slice(1).some((option) => option.value === "none"));
  assert.ok(markup.indexOf(">Aucun<") < markup.indexOf("<optgroup"));
  assert.match(markup, /placeholder="Rechercher un réducteur ou une Barlow"/);
  const types = menuOptions(markup, "Type");
  assert.ok(types.some((text) => text.startsWith("Réducteur (")));
  assert.ok(types.some((text) => text.startsWith("Barlow (")));

  const mounts = Array.from({ length: 20 }, (_, index) => ({
    id: `mount-${index}`,
    name: `Monture ${index}`,
  }));
  const mount = render({
    category: "mount",
    mine: mounts,
    defaults: [],
    value: "none",
    leading: [{ id: "none", label: "Aucune zone de sécurité" }],
  });
  assert.doesNotMatch(mount, /type="search"/);
  assert.doesNotMatch(mount, /planner-equipment-menus|planner-equipment-count/);
  assert.equal(fieldOptions(mount).length, 21);
});

test("« Aucun choix » opens the telescope, the camera and the eyepiece, never the reducer nor the mount, and takes the choice back to null", async () => {
  const { equipmentPickerChoice, noChoiceCategories, noChoiceValue } =
    await import("planner/components/EquipmentPicker.js");
  assert.deepEqual(noChoiceCategories, ["telescope", "camera", "eyepiece"]);
  // The select hands null for « Aucun choix », the id otherwise, nothing for
  // the placeholder.
  assert.equal(equipmentPickerChoice(noChoiceValue), null);
  assert.equal(equipmentPickerChoice("plossl-25"), "plossl-25");
  assert.equal(equipmentPickerChoice(""), undefined);
  for (const [category, defaults] of [
    ["telescope", telescopes],
    ["camera", commonEquipment.cameras],
    ["eyepiece", eyepieces],
  ]) {
    const chosen = render({
      category,
      mine: [],
      defaults,
      value: defaults[0].id,
    });
    const options = fieldOptions(chosen);
    // Something chosen: no « Choisir… », « Aucun choix » is the first entry.
    assert.equal(options[0].value, noChoiceValue, category);
    assert.equal(options[0].text, "Aucun choix", category);
    assert.equal(
      options.filter((option) => option.value === noChoiceValue).length,
      1,
      category,
    );
    // Narrowed by a search, it stays (outside the filters).
    const narrowed = fieldOptions(
      render({ category, mine: [], defaults, initialQuery: "zzzz" }),
    );
    assert.ok(narrowed.some((option) => option.value === noChoiceValue));
  }
  // Back to null, the field reads « Choisir… » again.
  assert.equal(
    fieldOptions(render({ category: "camera", value: null, mine: [] }))[0].text,
    "Choisir…",
  );
  for (const category of ["modifier", "mount"])
    assert.doesNotMatch(
      render({
        category,
        mine: [],
        defaults: [],
        value: "none",
        leading: [{ id: "none", label: "Aucun" }],
      }),
      /Aucun choix/,
    );
  // In the ten languages.
  for (const [locale, text] of Object.entries({
    fr: "Aucun choix",
    en: "No choice",
    de: "Keine Auswahl",
    es: "Sin elección",
    it: "Nessuna scelta",
    ja: "選択しない",
    "pt-BR": "Nenhuma escolha",
    ru: "Не выбрано",
    "zh-Hans": "不选择",
    "zh-Hant": "不選擇",
  }))
    assert.equal(message(locale, "plannerEquipmentNoChoice"), text, locale);
});

test("a short list draws neither the search nor the menus; the defaults hidden and nothing of one's own give the sentence and one link", () => {
  const cameras = commonEquipment.cameras.slice(0, 5);
  const short = render({ category: "camera", mine: [], defaults: cameras });
  assert.doesNotMatch(short, /type="search"|planner-equipment-menus/);
  assert.equal(fieldOptions(short).length, 7);

  const empty = render({
    mine: [],
    defaults: [],
    hiddenEmpty: true,
    define: { href: "/fr/manage/equipment" },
  });
  assert.doesNotMatch(empty, /<select/);
  assert.match(empty, /Ajoutez votre matériel dans votre espace\./);
  assert.equal((empty.match(/Définir mon matériel/g) || []).length, 1);
});

test("the filters' search bar: « Type » is the family, no « Marque » (a filter has no maker)", () => {
  const filters = commonEquipment.filters;
  const shown = equipmentSearch({
    category: "filter",
    defaults: [
      ...filters,
      { id: "f-sun", name: "Film solaire", family: "solar" },
    ],
  });
  const markup = decoded(
    renderToStaticMarkup(
      createElement(EquipmentSearchBar, {
        locale: "fr",
        category: "filter",
        shown,
        query: "",
        onQuery: () => {},
        onMaker: () => {},
        onKind: () => {},
      }),
    ),
  );
  assert.match(markup, /placeholder="Rechercher un filtre"/);
  assert.equal(menuOptions(markup, "Marque"), null);
  const solar = filters.filter((filter) => filter.family === "solar").length;
  assert.ok(menuOptions(markup, "Type").includes(`Solaire (${solar + 1})`));
  assert.match(markup, /\d+ filtres<\/span>/);
});

test("« Définir mon matériel »: « Mon espace » → « Matériel » for a person signed in, the sign-in page and back there for a visitor", () => {
  assert.equal(
    defineEquipmentHref({ locale: "fr", signedIn: true }),
    "/fr/manage/equipment",
  );
  assert.equal(
    defineEquipmentHref({
      locale: "fr",
      signedIn: false,
      auth: { signInPath: "/auth/sign-in", method: "email-code" },
    }),
    "/auth/sign-in?next=%2Ffr%2Fmanage%2Fequipment",
  );
  assert.equal(
    defineEquipmentHref({
      locale: "ja",
      signedIn: false,
      auth: { method: "password" },
    }),
    "/auth/login?next=%2Fja%2Fmanage%2Fequipment",
  );
  const link = renderToStaticMarkup(
    createElement(DefineEquipmentLink, {
      locale: "en",
      href: "/en/manage/equipment",
    }),
  );
  assert.match(link, /class="planner-equipment-define"/);
  assert.match(link, /Define my equipment<\/a>/);
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("the way back: exactly one new piece of a type becomes that field's value, the note is read once", () => {
  const before = [
    { id: "t1", type: "telescope" },
    { id: "e1", type: "eyepiece" },
    { id: "old", type: "camera", archivedAt: "2026-10-01T00:00:00Z" },
  ];
  const storage = memoryStorage();
  assert.equal(equipmentReturnPending(storage, 1000), false);
  rememberEquipmentForReturn(storage, before, 1000);
  assert.equal(equipmentReturnPending(storage, 2000), true);
  const after = [
    ...before,
    { id: "t2", type: "telescope" },
    { id: "e2", type: "eyepiece" },
    { id: "e3", type: "eyepiece" },
    { id: "f1", type: "filter" },
    { id: "c-archived", type: "camera", archivedAt: "2026-10-30T00:00:00Z" },
  ];
  assert.deepEqual(equipmentChosenOnReturn(storage, after, 2000), {
    telescope: "t2",
    filter: "f1",
  });
  assert.equal(storage.getItem(equipmentReturnKey), null);
  assert.deepEqual(equipmentChosenOnReturn(storage, after, 3000), {});
  // A note too old is forgotten unread.
  rememberEquipmentForReturn(storage, before, 1000);
  assert.deepEqual(
    equipmentChosenOnReturn(storage, after, 1001 + equipmentReturnMaxAgeMs),
    {},
  );
  // A storage that refuses does not break the link.
  const refusing = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
    removeItem: () => {
      throw new Error("denied");
    },
  };
  assert.equal(rememberEquipmentForReturn(refusing, before), false);
  assert.deepEqual(equipmentChosenOnReturn(refusing, after), {});
});

test("the count line in each language's plural, and every kind named in the ten languages", () => {
  assert.equal(equipmentCountText("fr", "eyepiece", 1), "1 oculaire");
  assert.equal(equipmentCountText("fr", "eyepiece", 0), "0 oculaire");
  assert.equal(
    squash(equipmentCountText("fr", "telescope", 1200)),
    "1 200 instruments",
  );
  assert.equal(equipmentCountText("ru", "eyepiece", 3), "3 окуляра");
  assert.equal(equipmentCountText("ru", "eyepiece", 5), "5 окуляров");
  assert.equal(equipmentCountText("ja", "camera", 4), "カメラ 4 件");
  assert.equal(
    icuPlural("en", "{count, plural, one{# filter} other{# filters}}", 2),
    "2 filters",
  );
  const locales = [
    "fr",
    "en",
    "de",
    "es",
    "it",
    "ja",
    "pt-BR",
    "ru",
    "zh-Hans",
    "zh-Hant",
  ];
  for (const locale of locales) {
    for (const [category, kinds] of Object.entries(equipmentKindOrder))
      for (const kind of kinds)
        assert.notEqual(
          equipmentKindLabel(locale, category, kind),
          kind,
          `${locale} ${category} ${kind}`,
        );
    for (const key of [
      "plannerEquipmentBrand",
      "plannerEquipmentDefineMine",
      "plannerEquipmentChoose",
      "plannerEquipmentClearFilters",
      "plannerEquipmentNotFoundModifier",
    ])
      assert.notEqual(message(locale, key), key, `${locale} ${key}`);
  }
  // The short names: the five long kinds have their own in every language,
  // every other kind reads its full name.
  const long = {
    telescope: ["cassegrain", "smart"],
    eyepiece: ["standard", "wide-field", "ultra-wide-field"],
  };
  for (const locale of locales)
    for (const [category, kinds] of Object.entries(equipmentKindOrder))
      for (const kind of kinds) {
        const short = equipmentKindShortLabel(locale, category, kind);
        const full = equipmentKindLabel(locale, category, kind);
        if (long[category]?.includes(kind)) {
          assert.notEqual(short, full, `${locale} ${category} ${kind}`);
          assert.doesNotMatch(short, /[()（）°]/, `${locale} ${kind}`);
          assert.ok(short.length <= 17, `${locale} ${kind}: ${short}`);
        } else assert.equal(short, full, `${locale} ${category} ${kind}`);
      }
  assert.equal(
    equipmentKindShortLabel("fr", "eyepiece", "ultra-wide-field"),
    "Ultra grand champ",
  );
  assert.equal(equipmentKindShortLabel("en", "telescope", "smart"), "Smart");
  assert.equal(equipmentKindLabel("fr", "filter", "solar"), "Solaire");
  assert.equal(
    equipmentKindLabel("en", "telescope", "smart"),
    "Smart telescope",
  );
});

test("the stylesheet draws the menus, the count line and « Définir mon matériel »", () => {
  const css = readFileSync(
    new URL("../../portal-app/styles/portal.css", import.meta.url),
    "utf8",
  );
  for (const selector of [
    ".planner-equipment-menus",
    ".planner-equipment-menu.is-set select",
    ".planner-equipment-count",
    ".planner-equipment-no-match",
    ".planner-equipment-define",
  ])
    assert.ok(css.includes(`${selector} {`), selector);
});
