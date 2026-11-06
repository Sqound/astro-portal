// « À voir ce soir » → « Prévisualiser » → « Matériel de l'aperçu »: the
// planner's own equipment pickers — « Mon matériel » first then « Matériel
// par défaut » for a person signed in, the catalogue for a visitor,
// « Aucun choix » first, « Définir mon matériel » at the foot — and the way
// back of that link, whose piece goes into the sheet's draft.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { registerHooks } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import {
  equipmentPickerLists,
  equipmentPickerPropsFrom,
} from "../src/equipment-picker-lists.js";
import { equipmentSelectionWithReturn } from "../src/equipment-return.js";
import {
  cameraProfiles,
  eyepieceProfiles,
  telescopeProfiles,
} from "../src/planner.js";
import { targetPreviewShown } from "../src/target-preview.js";

// The dialog, rendered on the server: a stand-in for `WebDialog`, which
// draws nothing without a document.
await registerJsx();
globalThis.__createElement = createElement;
const DIALOG = `data:text/javascript,${encodeURIComponent(
  'const h = globalThis.__createElement; export const WebDialog = ({ title, children, footer }) => h("div", { className: "web-dialog-stand-in" }, h("h2", null, title), h("div", { className: "web-dialog-body" }, children), footer ? h("div", { className: "web-dialog-footer" }, footer) : null);',
)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "portal/components/dialog/WebDialog.js")
      return { url: DIALOG, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { TargetPreviewSheet } =
  await import("planner/components/TargetPreviewBlock.js");

const item = (id, type, name, specifications = {}, planner = {}) => ({
  id,
  type,
  name,
  specifications,
  planner,
  archivedAt: null,
});
const inventory = [
  item("inv-c8", "telescope", "C8 du club", {
    apertureMm: 203,
    focalLengthMm: 2032,
  }),
  item("inv-cam", "camera", "Caméra du club", {
    sensorWidthMm: 11.3,
    sensorHeightMm: 7.1,
  }),
  item("inv-old", "camera", "Ancienne caméra", {
    sensorWidthMm: 6,
    sensorHeightMm: 4,
  }),
];
inventory[2].archivedAt = "2026-10-01T00:00:00Z";
const defaults = [
  item(
    "skywatcher-skymax-127",
    "telescope",
    "Sky-Watcher Skymax 127",
    { apertureMm: 127, focalLengthMm: 1500 },
    { maker: "Sky-Watcher", kind: "maksutov" },
  ),
  item(
    "zwo-asi585mc-pro",
    "camera",
    "ZWO ASI585MC Pro",
    { sensorWidthMm: 11.1, sensorHeightMm: 6.2 },
    { maker: "ZWO", kind: "colour" },
  ),
];

test("signed in: « Mon matériel » then the space's defaults, hidden on request but still known; a visitor reads the catalogue", () => {
  const { lists, profiles } = equipmentPickerLists({
    locale: "fr",
    signedIn: true,
    inventory,
    defaults,
  });
  assert.deepEqual(
    lists.telescope.mine.map((profile) => profile.id),
    ["inv-c8"],
  );
  assert.deepEqual(
    lists.telescope.defaults.map((profile) => profile.id),
    ["skywatcher-skymax-127"],
  );
  // The archived camera is not one's own any more.
  assert.deepEqual(
    lists.camera.mine.map((profile) => profile.id),
    ["inv-cam"],
  );
  assert.equal(lists.camera.defaultsLabelled, true);
  // The preview resolves over the same lists: own then default.
  assert.deepEqual(
    profiles.cameras.map((profile) => profile.id),
    ["inv-cam", "zwo-asi585mc-pro"],
  );
  assert.deepEqual(
    profiles.commonTelescopes.map((profile) => profile.id),
    ["skywatcher-skymax-127"],
  );
  // « Aucun » is the reducer's own first choice, never a list's.
  assert.ok(!lists.modifier.mine.some((profile) => profile.id === "none"));

  const hidden = equipmentPickerLists({
    locale: "fr",
    signedIn: true,
    inventory,
    defaults,
    hideDefaults: true,
  });
  assert.deepEqual(hidden.lists.telescope.defaults, []);
  assert.ok(
    hidden.lists.telescope.known.some(
      (profile) => profile.id === "skywatcher-skymax-127",
    ),
  );
  assert.equal(hidden.lists.eyepiece.hidden, true);
  // Nothing of one's own and the defaults hidden: the sentence and the link.
  const define = { href: "/fr/manage/equipment" };
  const hiddenProps = equipmentPickerPropsFrom(hidden.lists, {
    locale: "fr",
    define,
  });
  assert.equal(hiddenProps("eyepiece", null).hiddenEmpty, true);
  assert.equal(hiddenProps("telescope", null).hiddenEmpty, false);
  assert.equal(hiddenProps("telescope", null).define, define);

  // A portal that names no default list: the bundled catalogue.
  const bundled = equipmentPickerLists({
    locale: "fr",
    signedIn: true,
    inventory: [],
    defaults: null,
  });
  assert.equal(bundled.lists.telescope.defaults, telescopeProfiles);

  const visitor = equipmentPickerLists({ locale: "fr", signedIn: false });
  assert.deepEqual(visitor.lists.telescope.mine, []);
  assert.equal(visitor.lists.telescope.defaults, telescopeProfiles);
  assert.equal(visitor.lists.camera.defaults, cameraProfiles);
  assert.equal(visitor.lists.eyepiece.defaults, eyepieceProfiles);
  assert.equal(visitor.lists.telescope.defaultsLabelled, false);
  const modifier = equipmentPickerPropsFrom(visitor.lists, { locale: "fr" })(
    "modifier",
    "none",
  );
  assert.deepEqual(modifier.leading, [{ id: "none", label: "Aucun" }]);
  assert.ok(!modifier.defaults.some((profile) => profile.id === "none"));
});

const sheet = (pickers, equipment = {}) => {
  const shown = targetPreviewShown({
    preference: {
      mode: "imaging",
      telescopeId: "inv-c8",
      cameraId: "inv-cam",
      modifierId: "none",
      ...equipment,
    },
    mode: "imaging",
    profiles: pickers.profiles,
  });
  assert.equal(shown.source, "preference");
  return renderToStaticMarkup(
    createElement(TargetPreviewSheet, {
      locale: "fr",
      shown,
      profiles: pickers.profiles,
      pickers,
      onApply: () => {},
      onClose: () => {},
    }),
  );
};
const selectOf = (markup, label) =>
  new RegExp(`<select aria-label="${label}">([\\s\\S]*?)</select>`).exec(
    markup,
  )?.[1] ?? "";

test("« Matériel de l'aperçu » draws the planner's pickers: « Aucun choix », « Mon matériel » first, « Définir mon matériel » at the foot", () => {
  const { lists, profiles } = equipmentPickerLists({
    locale: "fr",
    signedIn: true,
    inventory,
    defaults,
  });
  const define = { href: "/fr/manage/equipment", inventory };
  const markup = sheet({
    profiles,
    props: equipmentPickerPropsFrom(lists, { locale: "fr", define }),
    define,
  });
  const telescope = selectOf(markup, "Instrument");
  assert.match(
    telescope,
    /^<option value="__no-choice__">Aucun choix<\/option><optgroup label="Mon matériel"><option value="inv-c8" selected="">C8 du club/,
  );
  assert.match(
    telescope,
    /<optgroup label="Matériel par défaut"><option value="skywatcher-skymax-127">/,
  );
  const camera = selectOf(markup, "Caméra");
  assert.match(
    camera,
    /^<option value="__no-choice__">Aucun choix<\/option><optgroup label="Mon matériel"><option value="inv-cam" selected="">Caméra du club<\/option><\/optgroup><optgroup label="Matériel par défaut"><option value="zwo-asi585mc-pro">/,
  );
  // The reducer keeps « Aucun », without « Aucun choix ».
  const reducer = selectOf(markup, "Réducteur / Barlow");
  assert.match(reducer, /^<option value="none" selected="">Aucun<\/option>/);
  assert.doesNotMatch(reducer, /Aucun choix/);
  assert.equal((markup.match(/Définir mon matériel/g) || []).length, 1);
  assert.match(
    markup,
    /planner-target-preview-define[\s\S]*href="\/fr\/manage\/equipment"[\s\S]*data-testid="preview-apply"/,
  );
  // A default camera of the space resolves: the readout has its field.
  const withDefault = sheet(
    {
      profiles,
      props: equipmentPickerPropsFrom(lists, { locale: "fr", define }),
      define,
    },
    { cameraId: "zwo-asi585mc-pro" },
  );
  assert.match(
    selectOf(withDefault, "Caméra"),
    /<option value="zwo-asi585mc-pro" selected="">/,
  );
  assert.match(withDefault, /data-testid="preview-sheet-readout"/);
});

test("the way back: the new piece goes into the sheet's draft, once; a mount or a filter is not the sheet's", () => {
  const selection = { mode: "imaging", telescopeId: "inv-c8", cameraId: null };
  assert.equal(equipmentSelectionWithReturn(selection, {}), selection);
  assert.equal(
    equipmentSelectionWithReturn(selection, { telescope: "inv-c8" }),
    selection,
  );
  assert.deepEqual(
    equipmentSelectionWithReturn(selection, {
      camera: "inv-new",
      lens: "inv-barlow",
      mount: "inv-mount",
      filter: "inv-filter",
    }),
    {
      mode: "imaging",
      telescopeId: "inv-c8",
      cameraId: "inv-new",
      modifierId: "inv-barlow",
    },
  );
  assert.deepEqual(equipmentSelectionWithReturn(selection, { eyepiece: "e" }), {
    ...selection,
    eyepieceId: "e",
  });

  const declared = [
    ...inventory,
    item("inv-new", "camera", "Caméra déclarée", {
      sensorWidthMm: 23.5,
      sensorHeightMm: 15.7,
    }),
  ];
  const { lists, profiles } = equipmentPickerLists({
    locale: "fr",
    signedIn: true,
    inventory: declared,
    defaults,
  });
  const used = [];
  const returned = { chosen: { camera: "inv-new" } };
  const markup = sheet({
    profiles,
    props: equipmentPickerPropsFrom(lists, { locale: "fr" }),
    define: null,
    returned,
    onReturnedUsed: (value) => used.push(value),
  });
  // The sheet opens on the piece declared, nothing applied before
  // « Appliquer ».
  assert.match(
    selectOf(markup, "Caméra"),
    /<option value="inv-new" selected="">Caméra déclarée<\/option>/,
  );
  // (A static render runs no effect: `onReturnedUsed` is the page's once
  // the sheet is on screen.)
  assert.deepEqual(used, []);
});

test("the page hands the sheet its pickers, its link and the way back", () => {
  const page = readFileSync(
    new URL("../src/components/TonightPage.js", import.meta.url),
    "utf8",
  );
  assert.match(page, /equipmentPickerLists\(\{/);
  assert.match(page, /defaults: defaultEquipment,/);
  assert.match(page, /hideDefaults: hideDefaultEquipment,/);
  assert.match(page, /profiles: pickerLists\.profiles,/);
  assert.match(
    page,
    /pickers: \{\s*props: previewPickerProps,\s*define: defineEquipment,\s*returned: returnedEquipment,/,
  );
  assert.match(page, /signedIn: authenticated,/);
  assert.match(page, /useEquipmentReturn\(\{/);
  assert.match(
    page,
    /onChosen: \(chosen\) => setReturnedEquipment\(\{ chosen \}\)/,
  );
  // The equipment read again lays the defaults and the option to hide them.
  assert.match(page, /setDefaultEquipment\(/);
  assert.match(
    page,
    /setHideDefaultEquipment\(payload\.hideDefaultEquipment === true\)/,
  );
  const block = readFileSync(
    new URL("../src/components/TargetPreviewBlock.js", import.meta.url),
    "utf8",
  );
  assert.match(
    block,
    /equipmentSelectionWithReturn\(shown\.equipment, returned\?\.chosen\)/,
  );
  assert.match(block, /onReturnedUsed\?\.\(returned\)/);
});
