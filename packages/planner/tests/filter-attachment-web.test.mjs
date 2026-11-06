import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { acquisitionBasisOf } from "planner/acquisition-reading.js";
import { targetDialogModel } from "planner/acquisition-dialog-model.js";
import {
  bundledPlannerFilters,
  builtInFiltersOf,
  equipmentProfilesFromInventory,
  smartTelescopeFilterProfiles,
  telescopeProfiles,
} from "planner/planner.js";
import {
  offeredFilterGroups,
  ownFiltersOnlyNote,
  planFilterOwners,
  planOfferedFilters,
} from "planner/offered-filters.js";
import { filterDisplayName } from "planner/telescope-order.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// Filters attached to equipment, the web side: the forms of "Mon matériel"
// (switch rule, built-in filters read-only), the plan's offered filters, the
// pose dialog's order, the bare-name rule.

await registerJsx();
globalThis.__createElement = createElement;
const DIALOG = `data:text/javascript,${encodeURIComponent(
  'const h = globalThis.__createElement; export const WebDialog = ({ title, children, footer, footerClassName }) => h("div", { className: "web-dialog-stand-in" }, h("h2", null, title), h("div", { className: "web-dialog-body" }, children), h("footer", { className: footerClassName }, footer));',
)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "portal/components/dialog/WebDialog.js")
      return { url: DIALOG, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { EquipmentEditor } =
  await import("portal/components/equipment/EquipmentEditor.js");
const { EquipmentLibrary } =
  await import("portal/components/equipment/EquipmentLibrary.js");
const attachment =
  await import("portal/components/equipment/filter-attachment.js");
const { builtInFilterRows, smartProfileIds } =
  await import("portal/components/equipment/built-in-filters.js");
const { AcquisitionDialog } =
  await import("planner/components/AcquisitionDialog.js");
const { messagesFr } = await import("portal/messages/fr.js");

const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));
const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "’")
    .replace(/\s+/g, " ")
    .trim();
const nothing = () => {};
// The `<input …>` that carries a data attribute.
const inputWith = (markup, attribute) =>
  markup.match(new RegExp(`<input[^>]*${attribute}[^>]*>`))?.[0] ?? "";
const ids = (list) => list.map((filter) => filter.id);

const item = (id, type, name, planner = {}, extra = {}) => ({
  id,
  type,
  name,
  manufacturer: "",
  model: "",
  specifications: {},
  planner,
  notes: "",
  archivedAt: null,
  ...extra,
});
const newton = item(
  "t-newton",
  "telescope",
  "Newton 150/750",
  {},
  {
    specifications: { apertureMm: 150, focalLengthMm: 750 },
  },
);
const monSeestar = item(
  "t-seestar",
  "telescope",
  "Mon Seestar",
  {
    profileId: "seestar-s50",
    integratedCamera: {
      name: "IMX462",
      sensorWidthMm: 5.6,
      sensorHeightMm: 3.2,
    },
  },
  { specifications: { apertureMm: 50, focalLengthMm: 250 } },
);
const handTyped = item(
  "t-hand",
  "telescope",
  "Mon intelligent tapé",
  { integratedCamera: { name: "X", sensorWidthMm: 5, sensorHeightMm: 3 } },
  { specifications: { apertureMm: 50, focalLengthMm: 250 } },
);
const camera = item(
  "c-asi",
  "camera",
  "Caméra couleur refroidie",
  {},
  { specifications: { sensorWidthMm: 23.5, sensorHeightMm: 15.7 } },
);
const doubleBand = item("f-db", "filter", "Double bande", {
  family: "dual",
  equipmentIds: ["t-newton"],
  forAllEquipment: false,
});
const antiPollution = item("f-ap", "filter", "Anti-pollution", {
  family: "broadband",
});
const inventory = [
  newton,
  monSeestar,
  handTyped,
  camera,
  doubleBand,
  antiPollution,
];

test("the portal's copy of the built-in filters is the planner's data, field for field", () => {
  assert.deepEqual(
    builtInFilterRows.map((row) => ({ ...row })),
    smartTelescopeFilterProfiles.map(
      ({ id, name, family, telescopeIds, builtIn }) => ({
        id,
        name,
        family,
        telescopeIds,
        builtIn,
      }),
    ),
  );
  assert.deepEqual(
    [...smartProfileIds],
    telescopeProfiles.filter((t) => t.ownFiltersOnly).map((t) => t.id),
  );
  for (const profile of telescopeProfiles) {
    const probe = item("x", "telescope", "x", { profileId: profile.id });
    assert.deepEqual(
      ids(attachment.builtInFiltersFor(probe)),
      ids(builtInFiltersOf({ id: "x", profileId: profile.id })),
      profile.id,
    );
  }
});

test("(1) the switch « Proposé pour tout le matériel » cannot be switched off while nothing is ticked", () => {
  const blank = { type: "filter", planner: {} };
  assert.equal(attachment.canLimitFilter(blank), false);
  // Refused: the draft is returned as it was.
  assert.equal(attachment.withFilterOfferedForAll(blank, false), blank);
  const ticked = attachment.withFilterEquipment(blank, "t-newton", true);
  assert.equal(attachment.canLimitFilter(ticked), true);
  const limited = attachment.withFilterOfferedForAll(ticked, false);
  assert.equal(limited.planner.forAllEquipment, false);
  // Unticking the last one puts the filter back for all equipment: never
  // "proposed nowhere".
  const emptied = attachment.withFilterEquipment(limited, "t-newton", false);
  assert.equal(attachment.filterOfferedForAll(emptied), true);

  const markup = (selected) =>
    render(EquipmentEditor, {
      locale: "fr",
      selected,
      equipment: inventory,
      onSave: async (saved) => saved,
      onClose: nothing,
    });
  const empty = markup({ type: "filter", name: "Hα", planner: {} });
  assert.match(inputWith(empty, "data-filter-offer-all"), /disabled=""/);
  assert.match(
    textOf(empty),
    /Cochez au moins un matériel pour limiter ce filtre\./,
  );
  assert.match(textOf(empty), /Proposé pour tout le matériel/);
  const withOne = markup({
    type: "filter",
    name: "Hα",
    planner: { equipmentIds: ["t-newton"] },
  });
  assert.doesNotMatch(withOne, /data-filter-offer-needs/);
  assert.doesNotMatch(inputWith(withOne, "data-filter-offer-all"), /disabled/);
  // The list "Matériel": telescopes and cameras, not the archived ones.
  assert.match(
    inputWith(withOne, 'data-filter-equipment="t-newton"'),
    /checked=""/,
  );
  assert.match(withOne, /data-filter-equipment="c-asi"/);
  assert.doesNotMatch(withOne, /data-filter-equipment="f-db"/);
  const limitedMarkup = markup({
    type: "filter",
    name: "Hα",
    planner: { equipmentIds: ["t-newton"], forAllEquipment: false },
  });
  assert.match(
    textOf(limitedMarkup),
    /Seulement le matériel coché\./,
    "the off line",
  );
});

test("the forms save the keys of their own kind only", () => {
  const filter = attachment.filterFieldsToSave({
    type: "filter",
    planner: {
      equipmentIds: ["t1"],
      forAllEquipment: false,
      ownFiltersOnly: true,
      profileId: "seestar-s50",
    },
  });
  assert.deepEqual(filter.planner, {
    equipmentIds: ["t1"],
    forAllEquipment: false,
  });
  const mount = attachment.filterFieldsToSave({
    type: "mount",
    planner: { equipmentIds: ["t1"], ownFiltersOnly: true },
  });
  assert.deepEqual(mount.planner, {});
  const cam = attachment.filterFieldsToSave({
    type: "camera",
    planner: { ownFiltersOnly: true, profileId: "x" },
  });
  assert.deepEqual(cam.planner, { ownFiltersOnly: true });
});

test("the telescope form: built-in filters read-only and tagged, the attached ones, « Ne proposer que ses filtres » on for a smart profile", () => {
  const markup = render(EquipmentEditor, {
    locale: "fr",
    selected: monSeestar,
    equipment: [
      ...inventory,
      item("f-own", "filter", "Mon filtre", {
        equipmentIds: ["t-seestar"],
        forAllEquipment: false,
      }),
    ],
    onOpenItem: nothing,
    onAddFilter: nothing,
    onSave: async (saved) => saved,
    onClose: nothing,
  });
  assert.match(markup, /data-built-in-filter="filter-seestar-s50-uvir"/);
  assert.match(markup, /data-built-in-filter="filter-seestar-s50-duoband"/);
  const builtIn = markup.slice(
    markup.indexOf('data-built-in-filter="filter-seestar-s50-uvir"'),
  );
  assert.doesNotMatch(
    builtIn.slice(0, builtIn.indexOf("</li>")),
    /<button/,
    "a built-in filter has no edit",
  );
  assert.match(textOf(markup), /UV\/IR-Cut intégré/);
  assert.match(textOf(markup), /Mon filtre ici seulement/);
  assert.match(markup, /data-add-filter/);
  assert.match(inputWith(markup, "data-own-filters-only"), /checked=""/);
  assert.match(textOf(markup), /Ne proposer que ses filtres/);

  // Nothing silent: a hand-typed smart telescope has no built-in filter.
  const hand = render(EquipmentEditor, {
    locale: "fr",
    selected: handTyped,
    equipment: inventory,
    onAddFilter: nothing,
    onSave: async (saved) => saved,
    onClose: nothing,
  });
  assert.doesNotMatch(hand, /data-built-in-filter/);
  assert.match(textOf(hand), /Aucun filtre rattaché à ce matériel\./);
  assert.doesNotMatch(inputWith(hand, "data-own-filters-only"), /checked=""/);

  // A camera has the section and the switch (off), no built-in filter.
  const cam = render(EquipmentEditor, {
    locale: "fr",
    selected: camera,
    equipment: inventory,
    onSave: async (saved) => saved,
    onClose: nothing,
  });
  assert.match(cam, /data-equipment-filters/);
  assert.doesNotMatch(cam, /data-built-in-filter/);
  // A new piece of equipment cannot "Ajouter un filtre" yet.
  const created = render(EquipmentEditor, {
    locale: "fr",
    selected: {},
    equipment: inventory,
    onAddFilter: nothing,
    onSave: async (saved) => saved,
    onClose: nothing,
  });
  assert.doesNotMatch(created, /data-add-filter/);
});

test("the list of filters shows the built-in rows of the smart telescopes read-only, the owner composed with the bare name", () => {
  const markup = render(EquipmentLibrary, {
    locale: "fr",
    equipment: inventory,
    showArchives: false,
    onShowArchives: nothing,
    onCreate: nothing,
    onAdd: nothing,
    onEdit: nothing,
    onArchive: nothing,
    onRestore: nothing,
    onMove: nothing,
    onReorder: nothing,
  });
  const rows = [
    ...markup.matchAll(
      /<article[^>]*data-built-in-filter="([^"]+)"[^>]*>(.*?)<\/article>/g,
    ),
  ];
  assert.deepEqual(
    rows.map((row) => row[1]),
    ["filter-seestar-s50-uvir", "filter-seestar-s50-duoband"],
  );
  for (const [, , body] of rows) {
    assert.doesNotMatch(body, /<button/, "no menu, no edit, no archive");
    assert.match(textOf(body), /^Mon Seestar · (UV\/IR-Cut|Duo-Band) intégré$/);
  }
  // The filter limited to the Newton says so; the archives show no built-in row.
  assert.match(textOf(markup), /Double bande.*ici seulement/);
  const archives = render(EquipmentLibrary, {
    locale: "fr",
    equipment: [
      { ...antiPollution, archivedAt: "2026-10-01T00:00:00Z" },
      monSeestar,
    ],
    showArchives: true,
    onShowArchives: nothing,
    onCreate: nothing,
    onEdit: nothing,
    onArchive: nothing,
    onRestore: nothing,
    onMove: nothing,
    onReorder: nothing,
  });
  assert.doesNotMatch(archives, /data-built-in-filter/);
});

const defaults = bundledPlannerFilters.filter((filter) => !filter.telescopeIds);
const poolOf = () => {
  const profiles = equipmentProfilesFromInventory(inventory);
  return {
    profiles,
    pool: [...profiles.filters, ...defaults, ...smartTelescopeFilterProfiles],
  };
};

test("a plan offers the filters of its telescope and camera: step 2's groups and the pose dialog agree", () => {
  const { profiles, pool } = poolOf();
  const seestar = profiles.telescopes.find((t) => t.id === "t-seestar");
  assert.equal(seestar.ownFiltersOnly, true);
  const owners = planFilterOwners({
    telescope: seestar,
    camera: profiles.cameras[0],
    mode: "imaging",
  });
  assert.equal(owners.camera, null, "a smart telescope's camera is built in");
  const offered = planOfferedFilters({ pool, owners, selectedIds: [] });
  assert.deepEqual(ids(offered), [
    "filter-seestar-s50-uvir",
    "filter-seestar-s50-duoband",
  ]);
  const groups = offeredFilterGroups("fr", {
    offered,
    owners,
    selectedIds: [],
    authenticated: true,
    defaultFilters: [...defaults, ...smartTelescopeFilterProfiles],
    hideDefaults: true,
  });
  // The defaults are hidden by the space, yet the telescope's own stay.
  assert.deepEqual(
    groups.flatMap((group) => ids(group.profiles)),
    ids(offered),
  );
  const plan = {
    id: "p",
    name: "p",
    date: "2026-09-15",
    status: "pending",
    equipment: { mode: "imaging", telescopeId: "t-seestar", filterIds: [] },
    items: [],
  };
  const basis = acquisitionBasisOf({
    plan,
    profileSets: { ...profiles, filters: pool },
    sqm: 20.8,
    moonIllumination: 17,
  });
  assert.deepEqual(
    basis.filterNames,
    offered.map((filter) => filter.name),
  );
  assert.deepEqual(basis.otherFilterNames, []);
  assert.deepEqual(basis.builtInFilterNames, ["UV/IR-Cut", "Duo-Band"]);
  assert.equal(basis.ownFiltersOnlyName, "Mon Seestar");

  // A Newton with a camera: the generic filters and the ones attached to it.
  const newtonPlan = {
    ...plan,
    equipment: {
      mode: "imaging",
      telescopeId: "t-newton",
      cameraId: "c-asi",
      filterIds: [],
    },
  };
  const newtonBasis = acquisitionBasisOf({
    plan: newtonPlan,
    profileSets: { ...profiles, filters: pool },
    sqm: 20.8,
    moonIllumination: 17,
  });
  assert.ok(newtonBasis.filterNames.includes("Double bande"));
  assert.ok(newtonBasis.filterNames.includes("Anti-pollution"));
  assert.ok(!newtonBasis.filterNames.includes("UV/IR-Cut"));
  assert.equal(newtonBasis.ownFiltersOnlyName, null);
  const newtonOwners = planFilterOwners({
    telescope: profiles.telescopes.find((t) => t.id === "t-newton"),
    camera: profiles.cameras[0],
    mode: "imaging",
  });
  assert.deepEqual(
    ids(
      planOfferedFilters({ pool, owners: newtonOwners, selectedIds: [] }),
    ).sort(),
    ids(pool.filter((f) => newtonBasis.filterNames.includes(f.name))).sort(),
    "step 2 and the sheet agree",
  );
});

test("(2) the pose sheet: the filters ticked at step 2 come first, the others follow after a thin rule, quieter", () => {
  const { profiles, pool } = poolOf();
  const plan = (filterIds) => ({
    id: "p",
    name: "p",
    date: "2026-09-15",
    status: "pending",
    equipment: {
      mode: "imaging",
      telescopeId: "t-newton",
      cameraId: "c-asi",
      filterIds,
    },
    items: [
      {
        id: "m31",
        durationMinutes: 80,
        startMinute: 0,
        endMinute: 80,
        filter: "",
        target: {
          id: "m31",
          designation: "M31",
          title: "M31",
          objects: ["M31"],
          coordinate: { ra: 10.68, dec: 41.27 },
          coordinateUnit: "degrees",
          skyTarget: { typeKey: "Galaxie", type: "Galaxy" },
          plannerSource: "catalogue",
        },
      },
    ],
  });
  const dialogOf = (filterIds) => {
    const basis = acquisitionBasisOf({
      plan: plan(filterIds),
      profileSets: { ...profiles, filters: pool },
      sqm: 20.8,
      moonIllumination: 17,
    });
    const model = targetDialogModel({
      locale: "fr",
      basis,
      itemId: "m31",
      editable: true,
      targetName: "M31",
      slot: "20:59 → 22:19",
      minutes: 80,
      writeItemLine: nothing,
    });
    return {
      basis,
      markup: render(AcquisitionDialog, {
        locale: "fr",
        model,
        onClose: nothing,
      }),
    };
  };
  const ticked = dialogOf(["f-ap"]);
  assert.deepEqual(ticked.basis.filterNames, ["Anti-pollution"]);
  assert.ok(ticked.basis.otherFilterNames.includes("Double bande"));
  const chips = textOf(ticked.markup);
  assert.ok(
    chips.indexOf("Anti-pollution") < chips.indexOf("Double bande"),
    "ticked first",
  );
  assert.match(ticked.markup, /data-filter-rule/);
  assert.match(
    ticked.markup,
    /class="filter-choice is-quiet"[^>]*data-filter="Double bande"|data-filter="Double bande"[^>]*/,
  );
  assert.match(ticked.markup, /filter-choice is-quiet/);
  assert.doesNotMatch(
    ticked.markup.match(/<button[^>]*data-filter="Anti-pollution"[^>]*>/)[0],
    /is-quiet/,
  );
  assert.match(
    textOf(ticked.markup),
    /Filtres de ce matériel et filtres proposés partout\./,
  );

  // Nothing ticked: the whole offered list, no rule.
  const none = dialogOf([]);
  assert.deepEqual(none.basis.otherFilterNames, []);
  assert.ok(none.basis.filterNames.includes("Double bande"));
  assert.doesNotMatch(none.markup, /data-filter-rule/);

  // A smart telescope that offers its own filters only says so.
  const smart = acquisitionBasisOf({
    plan: {
      ...plan([]),
      equipment: { mode: "imaging", telescopeId: "t-seestar", filterIds: [] },
    },
    profileSets: { ...profiles, filters: pool },
  });
  assert.equal(smart.ownFiltersOnlyName, "Mon Seestar");
});

test("(3) a filter is written bare in the plan's own list and composed from its equipment in a mixed one, never parsed from its name", () => {
  const seestarFilter = smartTelescopeFilterProfiles.find(
    (filter) => filter.id === "filter-seestar-s50-uvir",
  );
  assert.equal(seestarFilter.name, "UV/IR-Cut", "the data holds the bare name");
  // Mixed list (no plan telescope): the maker's profile is the owner.
  assert.equal(filterDisplayName(seestarFilter), "ZWO Seestar S50 · UV/IR-Cut");
  // The person's telescope names itself, from `equipmentIds`.
  const profiles = equipmentProfilesFromInventory(inventory);
  const mine = {
    ...seestarFilter,
    equipmentIds: ["t-seestar"],
  };
  assert.equal(
    filterDisplayName(mine, undefined, { equipment: profiles.telescopes }),
    "Mon Seestar · UV/IR-Cut",
  );
  // Inside the plan's own telescope: bare.
  const seestar = profiles.telescopes.find((t) => t.id === "t-seestar");
  assert.equal(
    filterDisplayName(seestarFilter, undefined, { within: [seestar] }),
    "UV/IR-Cut",
  );
  assert.equal(
    filterDisplayName(
      { id: "f-db", name: "Double bande", equipmentIds: ["t-newton"] },
      undefined,
      { equipment: profiles.telescopes },
    ),
    "Newton 150/750 · Double bande",
  );
  // A generic filter is its name; the code reads no name to find the owner.
  assert.equal(filterDisplayName({ id: "f", name: "Hα" }), "Hα");
  const source = readFileSync(
    new URL("../src/telescope-order.js", import.meta.url),
    "utf8",
  );
  const body = source.slice(
    source.indexOf("export function filterDisplayName"),
  );
  assert.doesNotMatch(body, /\.split\(|\.match\(|\.replace\(|RegExp/);
});

test("« {name} ne propose que ses filtres. »: said for the piece that offers its own only, with the way to edit it when the person owns it", () => {
  const profiles = equipmentProfilesFromInventory(inventory);
  const seestar = profiles.telescopes.find((t) => t.id === "t-seestar");
  const owners = planFilterOwners({
    telescope: seestar,
    camera: null,
    mode: "imaging",
  });
  assert.deepEqual(ownFiltersOnlyNote(owners, ["t-seestar"]), {
    name: "Mon Seestar",
    owned: true,
  });
  const common = telescopeProfiles.find((t) => t.id === "seestar-s50");
  assert.deepEqual(
    ownFiltersOnlyNote(
      planFilterOwners({ telescope: common, mode: "imaging" }),
      ["t-seestar"],
    ),
    { name: common.name, owned: false },
  );
  assert.equal(
    ownFiltersOnlyNote(
      planFilterOwners({ telescope: profiles.telescopes[0], mode: "imaging" }),
      [],
    ),
    null,
  );
  const page = readFileSync(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  assert.match(page, /planOfferedFilters\(/);
  assert.doesNotMatch(page, /filtersShownFor/);
});

test("the new words exist in the ten dictionaries, French with « vous »", async () => {
  const keys = [
    "filterOfferAllTitle",
    "filterOfferAllOn",
    "filterOfferAllOff",
    "filterOfferNeedsEquipment",
    "filterOfferAllInfoBody",
    "filterEquipmentLabel",
    "filterEquipmentOptional",
    "filterEquipmentOnly",
    "filterEquipmentKindTelescope",
    "filterEquipmentKindSmartTelescope",
    "filterEquipmentKindCamera",
    "equipmentFiltersTitle",
    "equipmentFiltersNone",
    "equipmentOwnOnlyTitle",
    "equipmentOwnOnlyOn",
    "equipmentOwnOnlyOff",
    "equipmentOwnOnlyInfoBody",
    "filterTagBuiltIn",
    "filterTagHereOnly",
    "filterTagEverywhere",
    "acqFilterPoolLine",
    "acqFilterOwnLine",
    "filtersSheetOwnOnly",
    "filterAddForEquipment",
    "filtersOwnOnlyEdit",
  ];
  for (const locale of [
    "en",
    "fr",
    "de",
    "es",
    "it",
    "ja",
    "pt-BR",
    "ru",
    "zh-Hans",
    "zh-Hant",
  ]) {
    const module = await import(`portal/messages/${locale}.js`);
    const messages = Object.values(module)[0];
    for (const key of keys)
      assert.ok(String(messages[key] ?? "").trim(), `${locale} ${key}`);
  }
  assert.equal(
    messagesFr.filterOfferNeedsEquipment,
    "Cochez au moins un matériel pour limiter ce filtre.",
  );
  assert.match(messagesFr.filterOfferAllOn, /Tous vos télescopes/);
});
