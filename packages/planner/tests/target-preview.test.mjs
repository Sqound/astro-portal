import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { registerHooks } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import {
  targetPreviewApplied,
  targetPreviewAvailable,
  targetPreviewBiggerText,
  targetPreviewDraftWith,
  targetPreviewEquipmentLines,
  targetPreviewMine,
  targetPreviewMosaicText,
  targetPreviewOpeningMode,
  targetPreviewPhoto,
  targetPreviewPlanLine,
  targetPreviewPreferenceKey,
  targetPreviewReadPreferences,
  targetPreviewResolve,
  targetPreviewReverted,
  targetPreviewSameEquipment,
  targetPreviewSampleEquipment,
  targetPreviewShown,
  targetPreviewWritePreferences,
} from "../src/target-preview.js";

// « Prévisualiser » in "Statistiques de la cible" (TARGET-PREVIEW-02, -05):
// which equipment it shows (the browser's preference of the mode, else « Mon
// matériel » -- the default configuration --, else the first launch's
// example), when it says « Matériel d'exemple » or offers « Reprendre mon
// matériel », the sheet's draft, « Appliquer », the plan's line, the two lines of the
// equipment with the language's decimals, the sentences of a target larger
// than the field, the photo's survey; and the section's place in the dialog.

const nbsp = "\u00a0";
// The catalogues' narrow and plain no-break spaces, read as spaces.
const plain = (text) => text?.replace(/[\u00a0\u202f]/g, " ") ?? text;
// A 70/420 refractor with the 25 mm Plössl, and a colour APS-C camera.
const refractor = {
  mode: "visual",
  telescopeId: "altair-starwave-ascent-70ed",
  eyepieceId: "plossl-25",
  cameraId: "zwo-asi2600mc-pro",
  modifierId: "none",
};
const m31 = {
  id: "m31",
  designation: "M31",
  title: "M31 — Galaxie d’Andromède",
  apparentSizeArcmin: [178, 63],
  coordinate: { ra: 10.6847, dec: 41.2687 },
};

const mineConfiguration = {
  mode: "imaging",
  telescopeId: "skywatcher-dobson-200-1200",
  cameraId: "zwo-asi585mc-pro",
  eyepieceId: "plossl-25",
};

// An in-memory stand-in for the browser's local storage.
const memoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

test("the preference is shown when it gives a preview in the mode", () => {
  const visual = targetPreviewShown({ preference: refractor, mode: "visual" });
  assert.equal(visual.source, "preference");
  assert.equal(visual.sample, false);
  assert.equal(visual.canRevert, false);
  assert.deepEqual(
    targetPreviewEquipmentLines({ shown: visual, locale: "fr" }),
    {
      name: "Altair Starwave Ascent 70ED · Plössl 25 mm",
      readout: `16,8× · 4,2${nbsp}mm · 3,1°`,
    },
  );
  // English keeps its decimal point.
  assert.equal(
    targetPreviewEquipmentLines({ shown: visual, locale: "en" }).readout,
    `16.8× · 4.2${nbsp}mm · 3.1°`,
  );
  const photo = targetPreviewShown({ preference: refractor, mode: "imaging" });
  assert.equal(photo.source, "preference");
  assert.deepEqual(
    targetPreviewEquipmentLines({ shown: photo, locale: "fr" }),
    {
      name: "Altair Starwave Ascent 70ED · ZWO ASI2600MC Pro",
      readout: "Cadre un champ de 3,2° × 2,14°.",
    },
  );
});

test("without a preference nor « Mon matériel », or with one that gives nothing in the mode, the example equipment", () => {
  const visual = targetPreviewShown({ preference: null, mode: "visual" });
  assert.equal(visual.source, "sample");
  assert.equal(visual.sample, true);
  assert.equal(visual.canRevert, false);
  assert.deepEqual(visual.equipment, targetPreviewSampleEquipment("visual"));
  assert.equal(
    targetPreviewEquipmentLines({ shown: visual, locale: "fr" }).name,
    "Sky-Watcher Skymax 127 (Maksutov) · Plössl 25 mm",
  );
  const photo = targetPreviewShown({ preference: null, mode: "imaging" });
  // A connected telescope: its camera is built in, the telescope alone.
  assert.deepEqual(
    targetPreviewEquipmentLines({ shown: photo, locale: "fr" }),
    {
      name: "Seestar S50",
      readout: "Cadre un champ de 0,72° × 1,28°.",
    },
  );
  // A preference without a camera in photo: not usable, the example.
  const noCamera = { ...refractor, cameraId: null };
  assert.equal(
    targetPreviewShown({ preference: noCamera, mode: "imaging" }).source,
    "sample",
  );
  assert.equal(
    targetPreviewShown({ preference: noCamera, mode: "visual" }).source,
    "preference",
  );
});

test("the order: the mode's preference, then « Mon matériel », then the example", () => {
  const configuration = mineConfiguration;
  // « Mon matériel » in photo: the configuration, mode forced.
  const mine = targetPreviewShown({ configuration, mode: "imaging" });
  assert.equal(mine.source, "mine");
  assert.equal(mine.sample, false);
  assert.equal(mine.canRevert, false);
  assert.equal(mine.equipment.mode, "imaging");
  assert.equal(
    targetPreviewEquipmentLines({ shown: mine, locale: "fr" }).name,
    "Sky-Watcher Dobson 200/1200 · ZWO ASI585MC Pro",
  );
  // In visual: the same configuration, the mode forced, with its Plössl 25.
  const visualMine = targetPreviewShown({ configuration, mode: "visual" });
  assert.equal(visualMine.source, "mine");
  assert.equal(visualMine.equipment.mode, "visual");
  // A configuration that gives nothing in the mode: the example.
  const photoOnly = {
    mode: "imaging",
    telescopeId: "skywatcher-dobson-200-1200",
    cameraId: null,
  };
  assert.equal(
    targetPreviewShown({ configuration: photoOnly, mode: "imaging" }).source,
    "sample",
  );
  assert.equal(
    targetPreviewMine({ configuration: photoOnly, mode: "imaging" }),
    null,
  );
  assert.equal(
    targetPreviewMine({ configuration: null, mode: "imaging" }),
    null,
  );
  // The preference of the mode comes first, the other mode's is ignored.
  const kept = targetPreviewShown({
    preference: refractor,
    configuration,
    mode: "imaging",
  });
  assert.equal(kept.source, "preference");
  assert.equal(kept.mine.telescopeId, "skywatcher-dobson-200-1200");
  assert.equal(
    targetPreviewEquipmentLines({ shown: kept, locale: "fr" }).name,
    "Altair Starwave Ascent 70ED · ZWO ASI2600MC Pro",
  );
});

test("« Reprendre mon matériel » only for a preference that differs from « Mon matériel »", () => {
  const configuration = mineConfiguration;
  const mine = targetPreviewMine({ configuration, mode: "imaging" });
  const differs = targetPreviewShown({
    preference: refractor,
    configuration,
    mode: "imaging",
  });
  assert.equal(differs.canRevert, true);
  // The same equipment (whatever its mode): nothing to go back to.
  const same = targetPreviewShown({
    preference: { ...mine, mode: "visual" },
    configuration,
    mode: "imaging",
  });
  assert.equal(same.source, "preference");
  assert.equal(same.canRevert, false);
  // No « Mon matériel »: no link, even for a preference.
  assert.equal(
    targetPreviewShown({ preference: refractor, mode: "imaging" }).canRevert,
    false,
  );
  // Shown « Mon matériel » itself: no link.
  assert.equal(
    targetPreviewShown({ configuration, mode: "imaging" }).canRevert,
    false,
  );
});

test("the opening mode: the plan's, else the configuration's, else the planner's", () => {
  assert.equal(
    targetPreviewOpeningMode({
      planEquipment: { mode: "visual" },
      configuration: { mode: "imaging" },
      fallback: "imaging",
    }),
    "visual",
  );
  assert.equal(
    targetPreviewOpeningMode({
      configuration: { mode: "visual" },
      fallback: "imaging",
    }),
    "visual",
  );
  // A configuration that leaves the mode out reads as photo.
  assert.equal(
    targetPreviewOpeningMode({ configuration: {}, fallback: "visual" }),
    "imaging",
  );
  assert.equal(targetPreviewOpeningMode({ fallback: "visual" }), "visual");
  assert.equal(targetPreviewOpeningMode({}), "imaging");
});

test("the preferences: one per mode in the browser's storage, read and written safely", () => {
  assert.equal(
    targetPreviewPreferenceKey,
    "planastro.targetPreviewEquipment.v1",
  );
  const storage = memoryStorage();
  assert.deepEqual(targetPreviewReadPreferences(storage), {});
  assert.equal(
    targetPreviewWritePreferences({ visual: refractor }, storage),
    true,
  );
  assert.deepEqual(JSON.parse(storage.values.get(targetPreviewPreferenceKey)), {
    visual: refractor,
  });
  assert.deepEqual(targetPreviewReadPreferences(storage), {
    visual: refractor,
  });
  // The other target's dialog, later: the same value.
  assert.equal(
    targetPreviewShown({
      preference: targetPreviewReadPreferences(storage).visual,
      mode: "visual",
    }).source,
    "preference",
  );
  // Nothing left: the key goes.
  targetPreviewWritePreferences({}, storage);
  assert.equal(storage.values.has(targetPreviewPreferenceKey), false);
  // A value that is not preferences, or not JSON: none.
  storage.values.set(targetPreviewPreferenceKey, "not json");
  assert.deepEqual(targetPreviewReadPreferences(storage), {});
  storage.values.set(
    targetPreviewPreferenceKey,
    JSON.stringify({ visual: "x", imaging: [1], other: refractor }),
  );
  assert.deepEqual(targetPreviewReadPreferences(storage), {});
  // Without storage (server, private window): the section still works.
  assert.deepEqual(targetPreviewReadPreferences(null), {});
  assert.equal(
    targetPreviewWritePreferences({ visual: refractor }, null),
    false,
  );
  const throwing = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
    removeItem() {
      throw new Error("denied");
    },
  };
  assert.deepEqual(targetPreviewReadPreferences(throwing), {});
  assert.equal(
    targetPreviewWritePreferences({ visual: refractor }, throwing),
    false,
  );
  // This process has no `window`: the default storage is none.
  assert.deepEqual(targetPreviewReadPreferences(), {});
});

test("materials are compared by what they give, not by their raw keys", () => {
  // The default configuration, as « Mon matériel » (numbers as text) ...
  const configuration = {
    ...mineConfiguration,
    mode: "visual",
    eyepieceFocalLengthMm: "",
  };
  const mine = targetPreviewMine({ configuration, mode: "visual" });
  // ... and a plan of the same Dobson and Plössl, written otherwise: a
  // number, a mount, a wind tolerance, another camera (not shown in visual).
  const plan = {
    mode: "visual",
    telescopeId: "skywatcher-dobson-200-1200",
    cameraId: "canon-eos-6d",
    eyepieceId: "plossl-25",
    eyepieceFocalLengthMm: 25,
    modifierId: "none",
    filterIds: [],
    mountId: "az-gti",
    restrictToEquipment: true,
    windTolerance: 30,
  };
  assert.notDeepEqual(
    { ...plan, mode: undefined },
    { ...mine, mode: undefined },
  );
  assert.equal(targetPreviewSameEquipment(plan, mine, null, "visual"), true);
  const shown = targetPreviewShown({ configuration, mode: "visual" });
  assert.equal(
    targetPreviewPlanLine({ planEquipment: plan, shown, locale: "fr" }),
    null,
  );
  // A different eyepiece, aperture, sensor or filter is a different equipment.
  assert.equal(
    targetPreviewSameEquipment(
      { ...plan, eyepieceId: "plossl-10", eyepieceFocalLengthMm: 10 },
      mine,
      null,
      "visual",
    ),
    false,
  );
  assert.equal(
    targetPreviewSameEquipment(
      { ...plan, telescopeId: "skywatcher-explorer-250pds" },
      mine,
      null,
      "visual",
    ),
    false,
  );
  assert.equal(
    targetPreviewSameEquipment(
      { ...plan, filterIds: ["uhc"] },
      mine,
      null,
      "visual",
    ),
    false,
  );
  // In photo the camera counts; the leftover eyepiece does not.
  const photoMine = targetPreviewMine({ configuration, mode: "imaging" });
  assert.equal(
    targetPreviewSameEquipment(
      { ...photoMine, eyepieceId: "plossl-10" },
      photoMine,
      null,
      "imaging",
    ),
    true,
  );
  assert.equal(
    targetPreviewSameEquipment(
      { ...photoMine, cameraId: "canon-eos-6d" },
      photoMine,
      null,
      "imaging",
    ),
    false,
  );
  // « Appliquer » on « Mon matériel » written as the plan: no preference left.
  assert.deepEqual(
    targetPreviewApplied({
      preferences: { visual: refractor },
      mode: "visual",
      draft: plan,
      mine,
    }),
    {},
  );
  // « Reprendre mon matériel » is not offered for a preference that is it.
  assert.equal(
    targetPreviewShown({ preference: plan, configuration, mode: "visual" })
      .canRevert,
    false,
  );
});

test("« Appliquer » keeps the draft for the mode; « Mon matériel » itself removes it; the cross changes nothing", () => {
  const configuration = mineConfiguration;
  const mine = targetPreviewMine({ configuration, mode: "imaging" });
  const shown = targetPreviewShown({ configuration, mode: "imaging" });
  // The draft is a copy: the choices touch nothing until « Appliquer ».
  const draft = targetPreviewDraftWith(
    shown.equipment,
    "cameraId",
    "canon-eos-6d",
  );
  const other = targetPreviewDraftWith(draft, "telescopeId", "plossl-x");
  assert.equal(shown.equipment.telescopeId, "skywatcher-dobson-200-1200");
  assert.equal(shown.equipment.cameraId, "zwo-asi585mc-pro");
  assert.equal(other.telescopeId, "plossl-x");
  const stored = { visual: refractor };
  const changed = { ...mine, telescopeId: "skywatcher-explorer-250pds" };
  const applied = targetPreviewApplied({
    preferences: stored,
    mode: "imaging",
    draft: changed,
    mine,
  });
  assert.equal(applied.imaging.telescopeId, "skywatcher-explorer-250pds");
  assert.equal(applied.imaging.mode, "imaging");
  // The other mode is kept, the input is not touched.
  assert.deepEqual(applied.visual, refractor);
  assert.deepEqual(stored, { visual: refractor });
  // Applying « Mon matériel » again removes the mode's preference.
  const back = targetPreviewApplied({
    preferences: applied,
    mode: "imaging",
    draft: { ...mine },
    mine,
  });
  assert.deepEqual(back, { visual: refractor });
  // Without « Mon matériel » the draft is always kept.
  assert.ok(
    targetPreviewApplied({
      preferences: {},
      mode: "visual",
      draft: refractor,
      mine: null,
    }).visual,
  );
  // « Reprendre mon matériel » removes the mode's preference only.
  assert.deepEqual(
    targetPreviewReverted({ preferences: applied, mode: "imaging" }),
    { visual: refractor },
  );
  assert.deepEqual(
    targetPreviewReverted({
      preferences: { imaging: changed },
      mode: "imaging",
    }),
    {},
  );
});

test("« Le plan utilise … » only when the plan's equipment gives a preview and differs from what is shown", () => {
  const shown = targetPreviewShown({ preference: null, mode: "visual" });
  assert.equal(
    plain(
      targetPreviewPlanLine({
        planEquipment: refractor,
        shown,
        locale: "fr",
      }),
    ),
    "Le plan utilise Altair Starwave Ascent 70ED · Plössl 25 mm",
  );
  assert.equal(
    targetPreviewPlanLine({
      planEquipment: refractor,
      shown,
      locale: "en",
    }),
    "The plan uses Altair Starwave Ascent 70ED · Plössl 25 mm",
  );
  // In photo, the plan's camera.
  const photo = targetPreviewShown({ preference: null, mode: "imaging" });
  assert.equal(
    targetPreviewPlanLine({
      planEquipment: refractor,
      shown: photo,
      locale: "fr",
    }),
    "Le plan utilise Altair Starwave Ascent 70ED · ZWO ASI2600MC Pro",
  );
  // From the catalogue (no plan): no line.
  assert.equal(
    targetPreviewPlanLine({ planEquipment: null, shown, locale: "fr" }),
    null,
  );
  // The same equipment as shown: nothing to say.
  const same = targetPreviewShown({ preference: refractor, mode: "visual" });
  assert.equal(
    targetPreviewPlanLine({
      planEquipment: refractor,
      shown: same,
      locale: "fr",
    }),
    null,
  );
  // A plan without a camera in photo gives no preview: no line.
  const noCamera = { ...refractor, cameraId: null };
  assert.equal(
    targetPreviewPlanLine({
      planEquipment: noCamera,
      shown: photo,
      locale: "fr",
    }),
    null,
  );
});

test("an owner's own lists still resolve the example's profiles", () => {
  const profiles = {
    telescopes: [
      { id: "mine", name: "Ma lunette", apertureMm: 80, focalLengthMm: 480 },
    ],
    eyepieces: [
      {
        id: "my-eyepiece",
        name: "Mon oculaire",
        focalLengthMm: 20,
        apparentFieldDegrees: 68,
      },
    ],
  };
  const shown = targetPreviewShown({
    preference: null,
    mode: "visual",
    profiles,
  });
  assert.equal(
    targetPreviewEquipmentLines({ shown, profiles, locale: "fr" }).name,
    "Sky-Watcher Skymax 127 (Maksutov) · Plössl 25 mm",
  );
});

test("a target larger than the field: the ratio in visual, the mosaic in photo", () => {
  const tried = targetPreviewShown({
    preference: { ...refractor, eyepieceId: "plossl-10" },
    mode: "visual",
  });
  assert.equal(
    plain(
      targetPreviewBiggerText({
        target: m31,
        resolved: tried.resolved,
        locale: "fr",
      }),
    ),
    "M31 (≈ 178 × 63′) est 2,4× plus grande que le champ : on en voit le centre.",
  );
  const wide = targetPreviewShown({ preference: refractor, mode: "visual" });
  assert.equal(
    targetPreviewBiggerText({
      target: { ...m31, apparentSizeArcmin: [20, 4] },
      resolved: wide.resolved,
      locale: "fr",
    }),
    null,
  );
  const dobson = { ...refractor, telescopeId: "skywatcher-explorer-250pds" };
  const photo = targetPreviewShown({ preference: dobson, mode: "imaging" });
  assert.equal(
    plain(
      targetPreviewMosaicText({
        target: m31,
        resolved: photo.resolved,
        locale: "fr",
      }),
    ),
    `M31 (≈ 178 × 63′) dépasse la largeur du champ de 1,1° × 0,7° : mosaïque nécessaire.`,
  );
  assert.equal(
    targetPreviewMosaicText({
      target: { ...m31, apparentSizeArcmin: [20, 4] },
      resolved: photo.resolved,
      locale: "fr",
    }),
    null,
  );
});

test("the photo's survey: wider than the sensor, the frame to scale", () => {
  const dobson = { ...refractor, telescopeId: "skywatcher-explorer-250pds" };
  const shown = targetPreviewShown({ preference: dobson, mode: "imaging" });
  const photo = targetPreviewPhoto({
    target: m31,
    coordinate: m31.coordinate,
    resolved: shown.resolved,
  });
  assert.equal(photo.fovDegrees, 3.9);
  assert.ok(Math.abs(photo.frameWidth - 1.122 / 3.9) < 0.002);
  // The portal's own cutout of the colour survey, never a third party's.
  assert.equal(
    photo.url,
    "/api/v1/sky-cutout?survey=dss-colour&ra=10.68470&dec=41.26870&fov=3.9",
  );
  // Without a sensor's field (no camera chosen): nothing.
  assert.equal(
    targetPreviewPhoto({
      target: m31,
      coordinate: m31.coordinate,
      resolved: targetPreviewResolve(
        { ...refractor, cameraId: null },
        "imaging",
      ),
    }),
    null,
  );
});

test("the Moon and the planets have a section, never the Sun nor the Earth", () => {
  assert.equal(targetPreviewAvailable(m31), true);
  for (const id of [
    "solar-system-moon",
    "solar-system-mercury",
    "solar-system-jupiter",
    "solar-system-pluto",
  ])
    assert.equal(targetPreviewAvailable({ id }, true), true, id);
  assert.equal(
    targetPreviewAvailable({ id: "planner-planet-saturne", body: "Saturn" }),
    true,
  );
  assert.equal(targetPreviewAvailable({ id: "solar-system-sun" }), false);
  assert.equal(targetPreviewAvailable({ id: "solar-system-earth" }), false);
  assert.equal(
    targetPreviewAvailable({ body: "Sun", tags: ["planet"] }),
    false,
  );
  // A body the preview does not know.
  assert.equal(
    targetPreviewAvailable({ id: "jupiter", tags: ["planet"] }),
    false,
  );
  assert.equal(targetPreviewAvailable(m31, true), false);
});

test("the visual disc's sky: the DSS2 red cutout at the eyepiece's true field", async () => {
  const { targetPreviewVisualSky } = await import("../src/target-preview.js");
  const shown = targetPreviewShown({ preference: refractor, mode: "visual" });
  const sky = targetPreviewVisualSky({
    coordinate: m31.coordinate,
    resolved: shown.resolved,
  });
  assert.equal(sky.discFieldRatio, 1);
  assert.ok(
    Math.abs(sky.fieldDegrees - shown.resolved.visualFieldDiameterDegrees) <
      1e-12,
  );
  assert.equal(
    sky.path,
    `/api/v1/sky-cutout?survey=dss2-red&ra=10.68470&dec=41.26870&fov=${Number(
      sky.fieldDegrees.toPrecision(3),
    )}`,
  );
  assert.equal(
    targetPreviewVisualSky({ coordinate: null, resolved: shown.resolved }),
    null,
  );
});

// The dialog, rendered on the server: the section between « Saison » and
// « Caractéristiques ».
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
const { TargetScoreExplained } =
  await import("planner/components/TargetScoreExplained.js");

const render = ({ target = m31, preview = null, visualMode = false } = {}) =>
  renderToStaticMarkup(
    createElement(TargetScoreExplained, {
      card: { target: { skyTarget: { typeKey: "Galaxie" }, ...target } },
      locale: "fr",
      visualMode,
      preview,
      onClose: () => {},
    }),
  );

// The page's storage, for the duration of one render.
const withStorage = (storage, run) => {
  const before = globalThis.window;
  globalThis.window = { localStorage: storage };
  try {
    return run();
  } finally {
    if (before === undefined) delete globalThis.window;
    else globalThis.window = before;
  }
};

test("the section stands between « Saison » and « Caractéristiques »", () => {
  const markup = withStorage(
    memoryStorage({
      [targetPreviewPreferenceKey]: JSON.stringify({ visual: refractor }),
    }),
    () =>
      render({
        target: {
          ...m31,
          integratedMagnitude: 3.4,
          constellation: "Andromède",
        },
        preview: {
          planEquipment: null,
          configuration: null,
          profiles: null,
          sky: null,
        },
        visualMode: true,
      }),
  );
  const season = markup.indexOf('id="target-facts-season"');
  const preview = markup.indexOf('id="target-facts-preview"');
  const facts = markup.indexOf('id="target-facts-facts"');
  assert.ok(season > 0 && preview > season && facts > preview);
  assert.match(
    markup,
    /data-preview-mode="visual" data-preview-source="preference"/,
  );
  assert.match(markup, />Prévisualiser</);
  assert.match(markup, />Changer le matériel</);
  assert.match(
    markup,
    /Simulation de la vue à l’oculaire — approximative, contraste accentué pour l’écran\./,
  );
  assert.match(markup, /Altair Starwave Ascent 70ED · Plössl 25 mm/);
  // Photo then Visuel, the mode pressed.
  assert.match(
    markup,
    /<button class="" type="button" aria-pressed="false">.*?Photo<\/button><button class="is-active" type="button" aria-pressed="true">.*?Visuel<\/button>/s,
  );
  assert.doesNotMatch(markup, /Matériel d’exemple/);
  // No « Essai » line any more, no plan line from the catalogue, no « Mon
  // matériel » to go back to.
  assert.doesNotMatch(markup, /Essai/);
  assert.doesNotMatch(markup, /preview-plan-uses/);
  assert.doesNotMatch(markup, /planner-target-preview-revert/);
});

test("« Mon matériel » is shown first; the preference, « Reprendre mon matériel » and the plan's line", () => {
  const preview = {
    planEquipment: null,
    configuration: mineConfiguration,
    profiles: null,
    sky: null,
  };
  // « Mon matériel »: the configuration's mode, no example label, no link.
  const mine = render({ preview });
  assert.match(mine, /data-preview-mode="imaging" data-preview-source="mine"/);
  assert.match(mine, /Sky-Watcher Dobson 200\/1200 · ZWO ASI585MC Pro/);
  assert.doesNotMatch(mine, /Matériel d’exemple/);
  assert.doesNotMatch(mine, />Choisir mon matériel</);
  assert.match(mine, />Changer le matériel</);
  assert.doesNotMatch(mine, /planner-target-preview-revert/);
  // A preference that differs: shown, with the link.
  const stored = memoryStorage({
    [targetPreviewPreferenceKey]: JSON.stringify({ imaging: refractor }),
  });
  const kept = withStorage(stored, () => render({ preview }));
  assert.match(
    kept,
    /data-preview-mode="imaging" data-preview-source="preference"/,
  );
  assert.match(kept, /Altair Starwave Ascent 70ED · ZWO ASI2600MC Pro/);
  assert.match(
    kept,
    /class="btn-link planner-target-preview-revert"[^>]*>Reprendre mon matériel</,
  );
  // The fiche of a plan's target: the plan's line under the equipment.
  const planned = render({
    preview: { ...preview, planEquipment: refractor },
  });
  assert.match(
    plain(planned),
    /data-testid="preview-plan-uses">Le plan utilise Altair Starwave Ascent 70ED · Plössl 25 mm</,
  );
  // The plan's mode opens the section: visual.
  assert.match(planned, /data-preview-mode="visual"/);
});

test("the sheet: a draft of the equipment shown, « Appliquer » as its primary button", async () => {
  const { TargetPreviewSheet } =
    await import("planner/components/TargetPreviewBlock.js");
  const shown = targetPreviewShown({ preference: refractor, mode: "visual" });
  const markup = renderToStaticMarkup(
    createElement(TargetPreviewSheet, {
      locale: "fr",
      shown,
      profiles: null,
      onApply: () => {},
      onClose: () => {},
    }),
  );
  assert.match(markup, /<h2>Matériel de l’aperçu<\/h2>/);
  assert.match(markup, /aria-label="Oculaire"/);
  assert.match(
    markup,
    /<button type="button" class="btn-primary" data-testid="preview-apply">Appliquer<\/button>/,
  );
  // The draft starts as the equipment shown: its readout, nothing applied.
  assert.match(plain(markup), /16,8× · 4,2 mm · 3,1°/);
  // A draft that gives no preview cannot be applied: not reachable from the
  // sheet's first render, whose draft is a usable equipment.
  assert.doesNotMatch(markup, /<button[^>]*disabled=""/);
  // The fields are the planner's pickers: the search, « Marque » and « Type »,
  // never « Personnalisé… ».
  assert.match(markup, /placeholder="Rechercher un instrument"/);
  assert.match(markup, /<select aria-label="Marque">/);
  assert.match(markup, /<select aria-label="Type">/);
  assert.doesNotMatch(markup, /value="custom"/);
  // Nothing chosen reads « Choisir… »; « Définir mon matériel » sits at the
  // box's foot, before « Appliquer ».
  const empty = renderToStaticMarkup(
    createElement(TargetPreviewSheet, {
      locale: "fr",
      shown: { ...shown, equipment: { ...shown.equipment, telescopeId: null } },
      profiles: null,
      pickers: { props: null, define: { href: "/fr/manage/equipment" } },
      onApply: () => {},
      onClose: () => {},
    }),
  );
  assert.match(empty, /<option disabled="" hidden="" value=""[^>]*>Choisir…</);
  assert.match(
    empty,
    /planner-target-preview-define[\s\S]*href="\/fr\/manage\/equipment"[\s\S]*Définir mon matériel[\s\S]*data-testid="preview-apply"/,
  );
});

test("without a preference nor « Mon matériel »: the example, labelled, and « Choisir mon matériel »", () => {
  const markup = render({ visualMode: false });
  assert.match(
    markup,
    /data-preview-mode="imaging" data-preview-source="sample"/,
  );
  assert.doesNotMatch(
    markup,
    /planner-target-preview-sample|Matériel d’exemple/,
  );
  assert.match(
    markup,
    /Renseignez votre matériel pour voir votre propre vue\./,
  );
  assert.match(markup, />Choisir mon matériel</);
  assert.match(markup, /Seestar S50/);
  assert.match(
    markup,
    /Ciel au champ de votre capteur \(DSS2\).; le cadre rouge est votre capteur\./,
  );
  assert.match(markup, /<canvas class="planner-target-preview-photo"/);
});

test("Jupiter has its section, its size in the field and its moons; the Sun has none", () => {
  const markup = render({
    target: {
      id: "solar-system-jupiter",
      designation: "Jupiter",
      tags: ["planet"],
    },
  });
  assert.match(markup, /target-facts-preview/);
  assert.match(
    plain(markup),
    /data-testid="preview-planet-line">Jupiter : [\d,]+″ dans un champ de [\d,]+°\.</,
  );
  assert.match(
    markup,
    /Les quatre satellites de Jupiter \(Io, Europe, Ganymède, Callisto\) à \d\d:\d\d\./,
  );
  assert.doesNotMatch(markup, /Partie éclairée/);
  const sun = render({
    target: { id: "solar-system-sun", designation: "Soleil", tags: ["planet"] },
  });
  assert.doesNotMatch(sun, /target-facts-preview/);
});

test("a target with an authorised sketch is simulated at the eyepiece's field, never shown as the sketch", async () => {
  const { targetPreviewSimulationTarget } =
    await import("../src/target-preview.js");
  const { eyepieceViewFor } = await import("../src/eyepiece-view.js");
  const { targetImageVariant } =
    await import("portal/target-image-variants.js");
  // M31 as the catalogue serves it: a DeepSkyWatch sketch, a generated
  // visual preview, a photo.
  const m31 = {
    id: "m31",
    apparentSizeArcmin: [177.83, 69.66],
    magnitude: 3.44,
    visualThumbnailUrl: "/target-library-visual-images/M31-sketch-s.jpg",
    visualPreviewThumbnailUrl:
      "/target-library-visual-preview-images/visual-preview-openngc-ngc0224.jpg",
    photoThumbnailUrl: "/target-library-curated-images/noirlab-noao-m31.jpg",
  };
  const setting = (focalLengthMm) => ({
    telescope: { apertureMm: 254, focalLengthMm: 1200 },
    eyepiece: { focalLengthMm, apparentFieldDegrees: 52 },
    sky: { sqm: 21.9 },
  });
  const sketch = targetImageVariant(m31, { visualMode: true });
  // The rule of the cards: the sketch, the same whatever the eyepiece.
  assert.equal(
    eyepieceViewFor(m31, setting(10), { imageSource: sketch.source }).kind,
    "reference",
  );
  const target = targetPreviewSimulationTarget(m31);
  const image = targetImageVariant(target, { visualMode: true });
  assert.equal(image.url, m31.visualPreviewThumbnailUrl);
  for (const [focal, fov] of [
    [25, 1.1],
    [10, 0.47],
  ]) {
    const view = eyepieceViewFor(target, setting(focal), {
      imageSource: image.source,
    });
    assert.equal(view.kind, "simulation");
    assert.equal(
      view.fieldImage.path,
      `/api/v1/targets/m31/field-image?fov=${fov}`,
    );
  }
  // Under `knowledge` too, and the card itself is left as it was.
  const card = { id: "m31", knowledge: { ...m31 } };
  assert.equal(
    targetPreviewSimulationTarget(card).knowledge.visualThumbnailUrl,
    undefined,
  );
  assert.equal(card.knowledge.visualThumbnailUrl, m31.visualThumbnailUrl);
});

// ## The sky of the preview (TARGET-STATS-SKY-PLACE-01)

const placeChoice = (source, shown) => ({ source, shown });
const entered = placeChoice("entered", { sqm: 21.3, bortleClass: 4 });

test("the sky: the place's value retained (measured, else typed, else the model's), its source kept, never forced to its own class", async () => {
  const { targetPreviewSkyState } = await import("../src/target-preview.js");
  const state = targetPreviewSkyState({ choice: entered });
  assert.deepEqual(state.place, {
    bortleClass: 4,
    sqm: 21.3,
    source: "entered",
  });
  assert.equal(state.forced, null);
  assert.deepEqual(state.used, { sqm: 21.3, bortleClass: 4 });
  // The model's estimate (or an older caller's bare value) is « model ».
  assert.equal(
    targetPreviewSkyState({
      choice: placeChoice("model", { sqm: null, bortleClass: 3 }),
    }).place.source,
    "model",
  );
  assert.equal(
    targetPreviewSkyState({ sky: { sqm: 20, bortleClass: 5 } }).place.source,
    "model",
  );
  // Forcing the place's own class forces nothing.
  assert.equal(
    targetPreviewSkyState({ choice: entered, forcedBortle: 4 }).forced,
    null,
  );
  // Another class: its typical SQM (18,7 for 7), read by the disc and the verdict.
  const forced = targetPreviewSkyState({ choice: entered, forcedBortle: 7 });
  assert.deepEqual(forced.forced, { bortleClass: 7, sqm: 18.7 });
  assert.deepEqual(forced.used, { sqm: 18.7, bortleClass: 7 });
  assert.equal(forced.place.bortleClass, 4);
  // Without a value for the place, a forced class is the sky seen.
  assert.deepEqual(targetPreviewSkyState({ forcedBortle: 2 }).used, {
    sqm: 21.9,
    bortleClass: 2,
  });
  assert.equal(targetPreviewSkyState({}).used, null);
  // Out of range: no forcing.
  for (const bad of [0, 10, 3.5, "x"])
    assert.equal(
      targetPreviewSkyState({ choice: entered, forcedBortle: bad }).forced,
      null,
    );
});

test("the sky is being read: the measures on their first read, or no value while the estimate is asked", async () => {
  const { placeSkyLoading } = await import("../src/sky-brightness.js");
  assert.equal(
    placeSkyLoading({ choice: null, measures: { status: "loading" } }),
    true,
  );
  assert.equal(
    placeSkyLoading({ choice: entered, measures: { status: "loading" } }),
    true,
    "a typed value may still be replaced by a measured one",
  );
  assert.equal(
    placeSkyLoading({
      choice: null,
      measures: { status: "none" },
      modelStatus: "loading",
    }),
    true,
  );
  assert.equal(
    placeSkyLoading({
      choice: entered,
      measures: { status: "fresh" },
      modelStatus: "loading",
    }),
    false,
  );
  assert.equal(
    placeSkyLoading({
      choice: null,
      measures: { status: "none" },
      modelStatus: "unavailable",
    }),
    false,
  );
  assert.equal(
    placeSkyLoading({
      choice: null,
      measures: { status: "none" },
      modelStatus: "idle",
    }),
    false,
  );
});

test("the tile and the message in French: the value and where it comes from, the forced state, the unknown sky", async () => {
  const { targetPreviewSkyState, targetPreviewSkyWords } =
    await import("../src/target-preview.js");
  const words = (options, placeName = "Col des Mélèzes") =>
    targetPreviewSkyWords(targetPreviewSkyState(options), {
      locale: "fr",
      placeName,
    });
  const typed = words({ choice: entered });
  assert.deepEqual(typed.tile, {
    tone: "place",
    value: "Bortle 4",
    title: "Ciel du lieu",
  });
  assert.equal(typed.message.from, "Vue depuis Col des Mélèzes");
  assert.equal(
    typed.message.how,
    "Ciel de Bortle 4 (SQM 21,3) · valeur saisie pour ce lieu",
  );
  assert.equal(typed.message.action, null);
  assert.equal(
    words({ choice: placeChoice("measured", { sqm: 21.9, bortleClass: 3 }) })
      .message.how,
    "Ciel de Bortle 3 (SQM 21,9) · valeur mesurée pour ce lieu",
  );
  assert.equal(
    words({ choice: placeChoice("model", { sqm: 20.1, bortleClass: 5 }) })
      .message.how,
    "Ciel de Bortle 5 (SQM 20,1) · valeur estimée pour ce lieu",
  );
  // An estimate without an SQM says the class alone.
  assert.equal(
    words({ choice: placeChoice("model", { sqm: null, bortleClass: 5 }) })
      .message.how,
    "Ciel de Bortle 5 · valeur estimée pour ce lieu",
  );
  const forced = words({ choice: entered, forcedBortle: 7 });
  assert.deepEqual(forced.tile, {
    tone: "forced",
    value: "Bortle 7",
    title: "Ciel forcé",
  });
  assert.equal(
    forced.message.title,
    "Valeur forcée : ne correspond pas au lieu".replace(" :", `${nbsp}:`),
  );
  assert.equal(
    forced.message.detail,
    `Aperçu sous un ciel de Bortle 7 (SQM 18,7)${nbsp}; Col des Mélèzes est en Bortle 4.`,
  );
  assert.deepEqual(forced.message.action, {
    kind: "revert",
    label: "Revenir à la valeur du lieu",
  });
  const unknown = words({});
  assert.deepEqual(unknown.tile, {
    tone: "unknown",
    value: "Ciel inconnu",
    title: "Ciel du lieu",
  });
  assert.equal(
    unknown.message.how,
    `Ciel inconnu${nbsp}: la vue est calculée avec un ciel sombre par défaut.`,
  );
  assert.deepEqual(unknown.message.action, {
    kind: "choose",
    label: "Choisir un ciel",
  });
  // Forced where the place has nothing: the detail says the place's sky is unknown.
  assert.match(
    words({ forcedBortle: 7 }).message.detail,
    /^Aperçu sous un ciel de Bortle 7 \(SQM 18,7\) ; le ciel de Col des Mélèzes est inconnu\.$/,
  );
  // No name: no « Vue depuis » line.
  assert.equal(words({ choice: entered }, "").message.from, null);
  // English and a language with another decimal separator.
  assert.equal(
    targetPreviewSkyWords(targetPreviewSkyState({ choice: entered }), {
      locale: "en",
      placeName: "Hill",
    }).message.how,
    "Sky: Bortle 4 (SQM 21.3) · entered value for this place",
  );
});

test("the visibility notice follows the sky retained, forced or not, and is silent when the target is fine or the sky unknown", async () => {
  const { targetPreviewVisibility } = await import("../src/target-preview.js");
  const resolved = targetPreviewResolve(refractor, "visual", null);
  const faint = {
    id: "ngc-x",
    integratedMagnitude: 12.5,
    apparentSizeArcmin: [3, 2],
    skyTarget: { typeKey: "Galaxie" },
  };
  const verdict = (sky, extra = {}) =>
    targetPreviewVisibility({
      target: faint,
      resolved,
      sky,
      locale: "fr",
      ...extra,
    });
  const difficult = verdict({ bortleClass: 4, sqm: null });
  assert.equal(difficult.status, "difficult");
  assert.equal(difficult.title, "Cible difficilement visible avec ce matériel");
  assert.equal(difficult.limit, "Magnitude limite 11,7 sous ce ciel.");
  const unlikely = verdict({ bortleClass: 7, sqm: 18.7 }, { forced: true });
  assert.equal(unlikely.status, "unlikely");
  assert.equal(unlikely.title, "Cible probablement invisible avec ce matériel");
  assert.equal(unlikely.limit, "Magnitude limite 10,4 sous ce ciel forcé.");
  // A bright target, an unknown sky, a planet, the photo mode: nothing.
  assert.equal(
    targetPreviewVisibility({
      target: {
        ...faint,
        integratedMagnitude: 3.4,
        apparentSizeArcmin: [178, 63],
      },
      resolved,
      sky: { bortleClass: 4, sqm: null },
      locale: "fr",
    }),
    null,
  );
  assert.equal(verdict(null), null);
  assert.equal(
    verdict({ bortleClass: 7, sqm: null }, { target: undefined }),
    null,
  );
  assert.equal(
    targetPreviewVisibility({
      target: { ...faint, tags: ["planet"] },
      resolved,
      sky: { bortleClass: 7, sqm: null },
      locale: "fr",
    }),
    null,
  );
  assert.equal(
    targetPreviewVisibility({
      target: faint,
      resolved: targetPreviewResolve(
        { ...refractor, mode: "imaging" },
        "imaging",
        null,
      ),
      sky: { bortleClass: 7, sqm: null },
      locale: "fr",
    }),
    null,
  );
  // A magnitude held under the target's knowledge counts like its own.
  assert.equal(
    targetPreviewVisibility({
      target: {
        id: "k",
        knowledge: { integratedMagnitude: 12.5, apparentSizeArcmin: [3, 2] },
        skyTarget: { typeKey: "Galaxie" },
      },
      resolved,
      sky: { bortleClass: 4, sqm: null },
      locale: "fr",
    })?.status,
    "difficult",
  );
});

test("the scale of the sheet: the class chosen ringed with its typical SQM, its word, what the place holds", async () => {
  const {
    targetPreviewSkyScale,
    targetPreviewSkyWord,
    targetPreviewSkyPlaceLine,
    targetPreviewSkyState,
  } = await import("../src/target-preview.js");
  const scale = targetPreviewSkyScale({ locale: "fr", bortle: 7 });
  assert.equal(scale.here, "Bortle 7 · 18,7");
  assert.equal(scale.steps.length, 9);
  assert.deepEqual(
    scale.steps.filter((step) => step.here).map((step) => step.bortle),
    [7],
  );
  assert.deepEqual(
    scale.steps.filter((step) => step.labelled).map((step) => step.bortle),
    [1, 3, 5, 7, 9],
  );
  assert.equal(targetPreviewSkyScale({ locale: "fr" }).here, "");
  assert.equal(targetPreviewSkyWord("fr", 7), "Ciel périurbain dense");
  assert.equal(targetPreviewSkyWord("fr", null), null);
  const line = (options, name = "Col des Mélèzes") =>
    targetPreviewSkyPlaceLine(targetPreviewSkyState(options), {
      locale: "fr",
      placeName: name,
    });
  assert.equal(
    line({ choice: entered }),
    `Valeur du lieu${nbsp}: Bortle 4 (SQM 21,3), saisie · Col des Mélèzes`,
  );
  assert.equal(
    line({ choice: placeChoice("measured", { sqm: 21.9, bortleClass: 3 }) }),
    `Valeur du lieu${nbsp}: Bortle 3 (SQM 21,9), mesurée · Col des Mélèzes`,
  );
  assert.equal(line({}), "Ce lieu n’a pas de valeur de ciel · Col des Mélèzes");
  assert.equal(
    line({ choice: entered }, ""),
    `Valeur du lieu${nbsp}: Bortle 4 (SQM 21,3), saisie`,
  );
});
