// The telescope field of the "Matériel" stage on the web (`EquipmentPicker`):
// the native select with the search field above it, one optgroup per group,
// options "name · line of facts", « Choisir… » while nothing is chosen, and a
// connected telescope's fixed camera and mount.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { message } from "portal/i18n.js";
import { resolveEquipment, telescopeProfiles } from "../src/planner.js";
import {
  equipmentStageName,
  foldForSearch,
  integratedCameraLine,
  integratedCameraNote,
  integratedMountName,
  searchTelescopes,
  telescopeGroups,
  telescopeOpticsLine,
  telescopeSpecLine,
} from "../src/telescope-picker.js";

await registerJsx();
const { EquipmentPicker } =
  await import("planner/components/EquipmentPicker.js");

const owner = [
  {
    id: "inv-refractor",
    name: "Lunette 72 mm de l’atelier",
    apertureMm: 72,
    focalLengthMm: 420,
  },
];
const byId = (id) => telescopeProfiles.find((profile) => profile.id === id);
const squash = (text) => text.replace(/[\s  ]+/g, " ");

function render(props = {}) {
  return renderToStaticMarkup(
    createElement(EquipmentPicker, {
      locale: "fr",
      category: "telescope",
      value: null,
      mine: [],
      defaults: telescopeProfiles,
      onChange: () => {},
      ...props,
    }),
  );
}
// The field's own select (the menus « Marque » and « Type » are others).
const fieldSelect = (markup) =>
  /<label class="planner-equipment-choice"><select[\s\S]*?<\/select>/.exec(
    markup,
  )?.[0] ?? "";
const optgroupLabels = (markup) =>
  [...fieldSelect(markup).matchAll(/<optgroup label="([^"]*)"/g)].map(
    (match) => match[1],
  );
// The options that name a piece of equipment (« Choisir… » and « Rien ne
// correspond » have no value, « Aucun choix » names none).
const optionIds = (markup) =>
  [...fieldSelect(markup).matchAll(/<option[^>]*value="([^"]*)"/g)]
    .map((match) => match[1])
    .filter((id) => id && id !== "__no-choice__");
// The values of the field's options in order, « Aucun choix » too.
const optionValues = (markup) =>
  [...fieldSelect(markup).matchAll(/<option[^>]*value="([^"]*)"/g)]
    .map((match) => match[1])
    .filter(Boolean);

test("one optgroup per group, each by maker then model, « Mon matériel » first for an owner, « Choisir… » while nothing is chosen", () => {
  const guest = render();
  assert.deepEqual(optgroupLabels(guest), [
    "Télescope intelligent",
    "Lunette",
    "Télescope",
  ]);
  const ids = optionIds(guest);
  assert.deepEqual(ids.slice(0, 8), [
    "celestron-origin",
    "celestron-origin-mark-ii",
    "dwarf-3",
    "dwarf-draco",
    "dwarf-mini",
    "unistellar-equinox-2",
    "unistellar-evscope-2",
    "unistellar-odyssey",
  ]);
  // The ZWO Seestars close the smart telescopes, S30 before S50.
  assert.deepEqual(ids.slice(16, 20), [
    "seestar-s30",
    "seestar-s30-pro",
    "seestar-s50",
    "seestar-s50-pro",
  ]);
  // Every common telescope (never fewer than the original 272), no
  // « Personnalisé… »; « Choisir… » first, chosen.
  assert.ok(ids.length >= 272);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes("custom"));
  assert.match(guest, /<select[^>]*><option[^>]*selected=""[^>]*>Choisir…/);
  assert.match(guest, /Rechercher un instrument/);

  const paired = render({ mine: owner });
  assert.deepEqual(optgroupLabels(paired), [
    "Mon matériel",
    "Télescope intelligent",
    "Lunette",
    "Télescope",
  ]);
  assert.equal(optionIds(paired)[0], "inv-refractor");
  // « Aucun choix » before « Mon matériel », outside the groups.
  assert.deepEqual(optionValues(paired).slice(0, 2), [
    "__no-choice__",
    "inv-refractor",
  ]);
  // English and Japanese carry the same groups.
  assert.deepEqual(optgroupLabels(render({ locale: "en", mine: owner })), [
    "My equipment",
    "Smart telescope",
    "Refractor",
    "Reflector",
  ]);
  assert.equal(optgroupLabels(render({ locale: "ja" })).length, 3);
});

test("each option is « name · line of facts » with the locale's signs and « caméra intégrée » for a connected telescope", () => {
  assert.equal(
    telescopeSpecLine("fr", byId("seestar-s50")),
    "50 mm · 250 mm · f/5 · caméra intégrée",
  );
  assert.equal(
    telescopeSpecLine("fr", byId("dwarf-3")),
    "35 mm · 150 mm · f/4,3 · caméra intégrée",
  );
  assert.equal(
    telescopeSpecLine("en", byId("dwarf-3")).includes("f/4.3"),
    true,
  );
  assert.equal(
    squash(telescopeSpecLine("fr", byId("skywatcher-dobson-200-1200"))),
    "203 mm · 1 200 mm · f/5,9",
  );
  assert.equal(
    squash(telescopeSpecLine("fr", byId("celestron-c8"))),
    "203,2 mm · 2 032 mm · f/10",
  );
  const markup = squash(render());
  assert.match(
    markup,
    /ZWO Seestar S50 · 50 mm · 250 mm · f\/5 · caméra intégrée<\/option>/,
  );
  assert.match(
    markup,
    /Sky-Watcher Evostar 72 ED · 72 mm · 420 mm · f\/5,8<\/option>/,
  );
});

test("the search keeps the names that contain the text, case and accents ignored, hides empty groups", () => {
  assert.equal(foldForSearch("Célestron"), "celestron");
  const sky = render({ initialQuery: "SKY" });
  assert.deepEqual(optgroupLabels(sky), ["Lunette", "Télescope"]);
  const skyIds = optionIds(sky);
  assert.ok(!skyIds.includes("custom"));
  // The twelve original Sky-Watcher rows are all kept, in their order.
  const originalSky = [
    "skywatcher-evostar-72ed",
    "skywatcher-evostar-80ed",
    "skywatcher-startravel-80",
    "skywatcher-startravel-102",
    "skywatcher-dobson-150-1200",
    "skywatcher-dobson-200-1200",
    "skywatcher-heritage-130",
    "skywatcher-heritage-150",
    "skywatcher-newton-150-750",
    "skywatcher-skymax-90",
    "skywatcher-skymax-102",
    "skywatcher-skymax-127",
  ];
  assert.deepEqual(
    skyIds.filter((id) => originalSky.includes(id)),
    originalSky.filter((id) => skyIds.includes(id)),
  );
  for (const id of originalSky) assert.ok(skyIds.includes(id), id);
  for (const id of skyIds.slice(0, -1))
    assert.match(telescopeProfiles.find((p) => p.id === id).maker, /^Sky[- ]/);
  const celestron = searchTelescopes(telescopeProfiles, "celestron").map(
    (p) => p.id,
  );
  for (const id of [
    "celestron-origin",
    "celestron-origin-mark-ii",
    "celestron-astromaster-70az",
    "celestron-astromaster-90az",
    "celestron-astromaster-114eq",
    "celestron-astromaster-130eq",
    "celestron-c8",
    "celestron-nexstar-4se",
    "celestron-nexstar-5se",
    "celestron-nexstar-6se",
    "celestron-starsense-explorer-dx-130az",
  ])
    assert.ok(celestron.includes(id), id);
  assert.ok(
    celestron.every((id) => /^celestron-/.test(id)),
    "only Celestron",
  );
  assert.equal(
    searchTelescopes(telescopeProfiles, "  ").length,
    telescopeProfiles.length,
  );
  // "mak" keeps the Maksutov, whose names say so, and nothing that is not one.
  const mak = searchTelescopes(telescopeProfiles, "mak").map((p) => p.id);
  for (const id of [
    "celestron-nexstar-4se",
    "skywatcher-skymax-90",
    "skywatcher-skymax-102",
    "skywatcher-skymax-127",
  ])
    assert.ok(mak.includes(id), id);
  for (const id of mak)
    assert.match(telescopeProfiles.find((p) => p.id === id).name, /mak/i, id);

  const none = render({ initialQuery: "zzz" });
  assert.deepEqual(optgroupLabels(none), []);
  assert.match(none, /Rien ne correspond à votre recherche\./);
  assert.deepEqual(optionIds(none), []);

  // The chosen telescope the search leaves out is still the select's value.
  const chosen = render({ value: "celestron-c8", initialQuery: "sky" });
  assert.match(chosen, /<option hidden="" value="celestron-c8"/);
  assert.equal(
    telescopeGroups("fr", { common: telescopeProfiles }, "sky").length,
    2,
  );
});

test("a connected telescope fixes the camera and the mount, with the sentence, and the resolved equipment uses the integrated camera", () => {
  const seestar = byId("seestar-s50");
  assert.equal(
    integratedCameraLine("fr", seestar),
    "Intégrée au Seestar S50 · IMX462",
  );
  assert.equal(
    integratedCameraNote("fr", seestar),
    "Le Seestar S50 a son télescope et sa caméra dans le même boîtier : la caméra est choisie pour vous.",
  );
  assert.equal(integratedMountName("fr", seestar), "Azimutale intégrée");
  assert.equal(integratedMountName("en", seestar), "Built-in alt-azimuth");
  for (const key of [
    "plannerTelescopeSearch",
    "plannerGroupMine",
    "plannerIntegratedCameraNote",
    "plannerMountIntegratedAltaz",
  ])
    for (const locale of ["en", "ja", "de", "ru", "zh-Hant"])
      assert.notEqual(message(locale, key), key, `${locale} ${key}`);

  // The score and the field use the integrated camera, whatever the plan's
  // `cameraId` says; the plan's own camera and mount are left as they were.
  const plan = {
    telescopeId: "seestar-s50",
    cameraId: "inv-camera",
    mountId: "inv-mount",
    modifierId: "none",
  };
  const sets = {
    telescopes: owner,
    cameras: [
      {
        id: "inv-camera",
        name: "Caméra",
        sensorWidthMm: 23.5,
        sensorHeightMm: 15.7,
      },
    ],
    commonTelescopes: telescopeProfiles,
  };
  const resolved = resolveEquipment(plan, sets);
  assert.equal(resolved.sensorWidthMm, 3.13);
  assert.equal(resolved.focalLengthMm, 250);
  assert.equal(plan.cameraId, "inv-camera");
  assert.equal(
    resolveEquipment({ ...plan, telescopeId: "inv-refractor" }, sets)
      .sensorWidthMm,
    23.5,
  );
  // The stage's header names the telescope alone.
  assert.equal(
    equipmentStageName(resolved, seestar, { id: "none" }, false),
    "Seestar S50",
  );
  assert.equal(
    equipmentStageName({ name: "x" }, byId("celestron-c8"), null, false),
    "x",
  );
});

// A signed-in person reads "Mon matériel", then "Matériel par défaut" — the
// administration's list, from the service — for the telescope, the camera,
// the eyepiece, the modifier, the mount and the filters; "Masquer le
// matériel par défaut" leaves "Mon matériel" alone.
const { defaultEquipmentProfiles } = await import("../src/planner.js");
const {
  bundledDefaultEquipmentProfiles,
  equipmentChoiceGroups,
  equipmentHiddenAndEmpty,
  mySpaceEquipmentPath,
} = await import("../src/equipment-groups.js");

const defaultRow = (id, type, name, specifications = {}, planner = {}) => ({
  id,
  type,
  name,
  specifications,
  planner,
  archivedAt: null,
});
const defaultRows = [
  defaultRow(
    "seestar-s50",
    "telescope",
    "Seestar S50",
    { apertureMm: 50, focalLengthMm: 250 },
    {
      group: "connected",
      integratedCamera: { id: "seestar-s50-imx462", name: "IMX462" },
      mount: { id: "integrated-altaz", name: "Azimutale intégrée" },
    },
  ),
  defaultRow(
    "skywatcher-evostar-72ed",
    "telescope",
    "Sky-Watcher Evostar 72 ED",
    { apertureMm: 72, focalLengthMm: 420 },
    { group: "refractors" },
  ),
  defaultRow(
    "celestron-c8",
    "telescope",
    "Celestron C8",
    { apertureMm: 203, focalLengthMm: 2032 },
    { group: "reflectors" },
  ),
  defaultRow("team-refractor", "telescope", "Lunette de l’équipe", {
    apertureMm: 80,
    focalLengthMm: 480,
  }),
  defaultRow("zwo-asi533mc-pro", "camera", "ZWO ASI533MC Pro", {
    sensorWidthMm: 11.3,
    sensorHeightMm: 11.3,
  }),
  defaultRow("canon-eos-6d", "camera", "Canon EOS 6D", {
    sensorWidthMm: 35.8,
    sensorHeightMm: 23.9,
  }),
  defaultRow("filter-ha", "filter", "Hα", {}, { family: "ha" }),
];
const defaults = defaultEquipmentProfiles(defaultRows);
const ownCamera = {
  id: "inv-camera",
  name: "Caméra couleur refroidie",
  sensorWidthMm: 23.5,
  sensorHeightMm: 15.7,
};
const options = (props) =>
  render({ category: "camera", defaultsLabelled: true, ...props });

test("signed in: « Mon matériel », then the default groups labelled « Matériel par défaut · <kind> », an ungrouped default last", () => {
  const markup = render({
    mine: owner,
    defaults: defaults.telescopes,
    defaultsLabelled: true,
  });
  assert.deepEqual(optgroupLabels(markup), [
    "Mon matériel",
    "Matériel par défaut · Télescope intelligent",
    "Matériel par défaut · Lunette",
    "Matériel par défaut · Télescope",
    "Matériel par défaut",
  ]);
  assert.deepEqual(optionIds(markup), [
    "inv-refractor",
    "seestar-s50",
    "skywatcher-evostar-72ed",
    "celestron-c8",
    "team-refractor",
  ]);
  assert.match(markup, /Seestar S50 · 50 mm · 250 mm · f\/5 · caméra intégrée/);
  assert.deepEqual(
    optgroupLabels(
      render({
        locale: "en",
        mine: owner,
        defaults: defaults.telescopes,
        defaultsLabelled: true,
      }),
    ).slice(0, 2),
    ["My equipment", "Default equipment · Smart telescope"],
  );
});

test("the camera, the eyepiece, the modifier and the mount: « Mon matériel » then « Matériel par défaut »; a visitor's list has no group", () => {
  const markup = options({
    value: "inv-camera",
    mine: [ownCamera],
    defaults: defaults.cameras,
  });
  assert.deepEqual(optgroupLabels(markup), [
    "Mon matériel",
    "Matériel par défaut",
  ]);
  assert.deepEqual(optionIds(markup), [
    "inv-camera",
    "zwo-asi533mc-pro",
    "canon-eos-6d",
  ]);
  const visitor = options({
    value: "zwo-asi533mc-pro",
    defaults: defaults.cameras,
    defaultsLabelled: false,
  });
  assert.deepEqual(optgroupLabels(visitor), []);
  assert.deepEqual(optionIds(visitor), ["zwo-asi533mc-pro", "canon-eos-6d"]);
  assert.deepEqual(
    equipmentChoiceGroups("fr", {
      mine: [],
      defaults: defaults.cameras,
    }).map((group) => group.label),
    ["Matériel par défaut"],
  );
});

test("« Masquer le matériel par défaut »: « Mon matériel » alone, and a default still chosen stays the select's value", () => {
  const telescopes = render({
    value: owner[0].id,
    mine: owner,
    defaults: [],
    known: [...owner, ...defaults.telescopes],
    defaultsLabelled: true,
  });
  assert.deepEqual(optgroupLabels(telescopes), ["Mon matériel"]);
  assert.deepEqual(optionIds(telescopes), ["inv-refractor"]);
  const cameras = options({
    value: "canon-eos-6d",
    mine: [ownCamera],
    defaults: [],
    known: [ownCamera, ...defaults.cameras],
  });
  assert.deepEqual(optgroupLabels(cameras), ["Mon matériel"]);
  assert.match(cameras, /<option hidden="" value="canon-eos-6d"/);
  const chosenTelescope = render({
    value: "seestar-s50",
    mine: owner,
    defaults: [],
    known: [...owner, ...defaults.telescopes],
    defaultsLabelled: true,
  });
  assert.match(chosenTelescope, /<option hidden="" value="seestar-s50"/);
});

test("hidden and nothing of one's own: the line and « Définir mon matériel », no select", () => {
  const markup = render({
    value: null,
    mine: [],
    defaults: [],
    known: defaults.telescopes,
    defaultsLabelled: true,
    hiddenEmpty: true,
    define: { href: mySpaceEquipmentPath("fr") },
  });
  assert.deepEqual(optionIds(markup), []);
  assert.ok(!/<select/.test(markup));
  assert.ok(!/Rechercher un instrument/.test(markup));
  assert.match(markup, /Ajoutez votre matériel dans votre espace\./);
  assert.match(
    markup,
    /<a class="btn-link planner-equipment-define-link" href="\/fr\/manage\/equipment">/,
  );
  assert.match(squash(markup), /Définir mon matériel/);
  assert.equal(equipmentHiddenAndEmpty({ hidden: true, mine: [] }), true);
  assert.equal(equipmentHiddenAndEmpty({ hidden: true, mine: owner }), false);
  assert.equal(equipmentHiddenAndEmpty({ hidden: false, mine: [] }), false);
  // With something to list, the line is not there.
  assert.ok(
    !/Ajoutez votre matériel/.test(
      render({
        mine: owner,
        defaults: [],
        defaultsLabelled: true,
        define: { href: "/fr/manage/equipment" },
      }),
    ),
  );
});

test("a visitor keeps today's telescope list (the kinds without « Matériel par défaut »), and the default rows resolve like the bundled ones", () => {
  assert.deepEqual(optgroupLabels(render()), [
    "Télescope intelligent",
    "Lunette",
    "Télescope",
  ]);
  assert.ok(!/Matériel par défaut/.test(render()));
  // A plan naming a default telescope or camera resolves the same from the
  // service's rows as from the bundled profiles.
  const selection = {
    telescopeId: "seestar-s50",
    cameraId: "zwo-asi533mc-pro",
    modifierId: "none",
    filterIds: ["filter-ha"],
  };
  const resolved = resolveEquipment(selection, {
    telescopes: owner,
    commonTelescopes: defaults.telescopes,
    cameras: [ownCamera, ...defaults.cameras],
    filters: defaults.filters,
  });
  assert.equal(resolved.apertureMm, 50);
  // A connected telescope's camera is its integrated one.
  assert.equal(resolved.name, "Seestar S50 · IMX462");
  assert.deepEqual(resolved.filterProfiles, [
    { id: "filter-ha", name: "Hα", family: "ha" },
  ]);
  assert.equal(bundledDefaultEquipmentProfiles.telescopes, telescopeProfiles);
  assert.ok(
    !bundledDefaultEquipmentProfiles.modifiers.some(
      (profile) => profile.id === "none",
    ),
  );
});

test("an own filter is ticked and counts like a default one: both resolve into the plan's filters", () => {
  const ownFilter = { id: "inv-filter", name: "Hα 7 nm" };
  const resolved = resolveEquipment(
    {
      telescopeId: "inv-refractor",
      cameraId: "inv-camera",
      modifierId: "none",
      filterIds: ["inv-filter", "filter-ha"],
    },
    {
      telescopes: owner,
      cameras: [ownCamera],
      filters: [ownFilter, ...defaults.filters],
    },
  );
  assert.deepEqual(
    resolved.filterProfiles.map((profile) => profile.id),
    ["inv-filter", "filter-ha"],
  );
  assert.deepEqual(resolved.unresolvedFilterIds, []);
  assert.deepEqual(
    equipmentChoiceGroups("fr", {
      mine: [ownFilter],
      defaults: defaults.filters,
    }).map((group) => [group.label, group.profiles.length]),
    [
      ["Mon matériel", 1],
      ["Matériel par défaut", 1],
    ],
  );
});

// The telescope list has three
// categories, "Télescope intelligent", "Lunette", "Télescope" (the keys
// keep their names, the values change); the Maksutov, the Schmidt-Cassegrain,
// the Newtons and the Dobsonians are all under "Télescope".
test("three labelled sections in fr, en and ja, the three labels in the ten catalogues, the mirror telescopes under « Télescope »", () => {
  const keys = [
    "plannerGroupConnected",
    "plannerGroupRefractors",
    "plannerGroupReflectors",
  ];
  const expected = {
    fr: ["Télescope intelligent", "Lunette", "Télescope"],
    en: ["Smart telescope", "Refractor", "Reflector"],
    de: ["Smart-Teleskop", "Refraktor", "Reflektor"],
    ja: ["スマート望遠鏡", "屈折望遠鏡", "反射望遠鏡"],
  };
  for (const [locale, labels] of Object.entries(expected)) {
    assert.deepEqual(
      keys.map((key) => message(locale, key)),
      labels,
      locale,
    );
    assert.deepEqual(
      telescopeGroups(locale, { common: telescopeProfiles }).map(
        (group) => group.label,
      ),
      labels,
      locale,
    );
  }
  for (const locale of ["es", "it", "pt-BR", "ru", "zh-Hans", "zh-Hant"]) {
    const labels = keys.map((key) => message(locale, key));
    assert.equal(new Set(labels).size, 3, locale);
    for (const label of labels) assert.ok(label && !keys.includes(label));
  }
  // Group sizes: 20 smart telescopes, then at least the original 147
  // refractors and 105 telescopes (the catalogue only grows).
  const sizes = telescopeGroups("fr", { common: telescopeProfiles }).map(
    (group) => group.profiles.length,
  );
  assert.equal(sizes.length, 3);
  assert.equal(sizes[0], 20);
  assert.ok(sizes[1] >= 147);
  assert.ok(sizes[2] >= 105);
  assert.equal(
    sizes.reduce((a, b) => a + b, 0),
    telescopeProfiles.length,
  );
  const telescopes = telescopeGroups("fr", {
    common: telescopeProfiles,
  }).find((group) => group.label === "Télescope");
  for (const id of [
    "skywatcher-skymax-90",
    "skywatcher-skymax-127",
    "celestron-nexstar-4se",
    "celestron-nexstar-5se",
    "celestron-c8",
    "celestron-astromaster-130eq",
    "skywatcher-heritage-150",
  ])
    assert.ok(
      telescopes.profiles.some((profile) => profile.id === id),
      id,
    );
});

// The sections of an equipment select read by shape on the web too (bold
// heading in the ink colour, options 12 px in, « Choisir… » under no
// heading).
test("the stylesheet makes the heading of an optgroup bold and its options 0.75rem inside it", () => {
  const css = readFileSync(
    new URL("../../portal-app/styles/portal.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /\.planner-equipment-choice select optgroup \{[^}]*color: var\(--ink\);[^}]*font-weight: 700;/,
  );
  assert.match(
    css,
    /\.planner-equipment-choice select optgroup option \{[^}]*padding-inline-start: 0\.75rem;/,
  );
  // « Choisir… » is a direct child of the select, under no optgroup.
  const markup = render();
  assert.match(markup, /<select[^>]*><option[^>]*value=""[^>]*>Choisir…/);
});

test("the readout under the select says the optics as the list does, in each locale", () => {
  const skymax = { apertureMm: 90, focalLengthMm: 1250 };
  assert.equal(
    squash(telescopeOpticsLine("fr", skymax)),
    "90 mm · 1 250 mm · f/13,9",
  );
  assert.equal(telescopeOpticsLine("en", skymax), "90 mm · 1,250 mm · f/13.9");
  assert.match(
    telescopeOpticsLine("de", skymax),
    /^90 mm · 1\.250 mm · f\/13,9$/,
  );
  assert.equal(telescopeOpticsLine("fr", {}), "— mm · — mm · f/—");
  // The option's line is the optics, then the integrated camera.
  const dwarf = byId("dwarf-3");
  assert.equal(
    telescopeSpecLine("fr", dwarf).startsWith(telescopeOpticsLine("fr", dwarf)),
    true,
  );
  // The planner draws the readout with it, not with the raw numbers.
  assert.match(
    readFileSync(
      new URL("../src/components/PlannerPage.js", import.meta.url),
      "utf8",
    ),
    /\{telescopeOpticsLine\(locale, selectedTelescope\)\}/,
  );
});
