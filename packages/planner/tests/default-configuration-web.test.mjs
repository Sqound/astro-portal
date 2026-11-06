// The web's part of "Ma configuration par
// défaut": the line of the planner's stage 2 and its two links, the notice
// that confirms them with "Annuler", the card and the dialog of "Mon
// espace" → "Matériel", and the rule every new web plan starts from.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shippedLocales } from "astro-contracts/locales";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import {
  equipmentConfigurationDifferences,
  normalizeDefaultConfiguration,
  planStartEquipment,
} from "portal/planner/default-configuration.js";

await registerJsx();
const { DefaultConfigurationLine, defaultConfigurationLineState } =
  await import("planner/components/DefaultConfigurationLine.js");
const { EquipmentView, configurationNames } =
  await import("portal/components/manage/EquipmentTab.js");
const { equipmentCopyFor } =
  await import("portal/components/equipment/equipment-copy.js");
const {
  DefaultConfigurationFields,
  configurationDraftWith,
  configurationRows,
} = await import("portal/components/manage/DefaultConfigurationCard.js");
const { createWebQuickPlanAction } = await import("../src/quick-plan-web.js");

const squash = (text) =>
  text
    .replace(/<[^>]+>/g, " ")
    .replace(/[\s  ]+/g, " ")
    .trim();

const configuration = {
  mode: "imaging",
  telescopeId: "t1",
  cameraId: "c1",
  modifierId: "none",
  filterIds: ["f1"],
  mountId: "m1",
};
const item = (id, type, name, planner = {}) => ({
  id,
  type,
  name,
  manufacturer: "",
  model: "",
  isBinoculars: false,
  specifications: {},
  planner,
  notes: "",
  archivedAt: null,
  preferenceOrder: 0,
});
const read = {
  equipment: [
    item("t1", "telescope", "Lunette 72 mm"),
    item("t2", "telescope", "Newton 150/750"),
    item("c1", "camera", "Caméra couleur refroidie"),
    item("m1", "mount", "Monture équatoriale compacte"),
    item("f1", "filter", "Double bande Hα/OIII 7 nm"),
  ],
  defaults: [
    item("seestar-s50", "telescope", "Seestar S50", {
      integratedCamera: { name: "IMX462" },
      mount: { id: "integrated-altaz" },
    }),
  ],
  hideDefaultEquipment: false,
  defaultConfiguration: configuration,
};

test("stage 2 says what differs, with « Reprendre » and « Enregistrer comme… », or « Identique… » without a link", () => {
  const differs = defaultConfigurationLineState({
    locale: "fr",
    equipment: { ...configuration, telescopeId: "seestar-s50" },
    configuration,
    smartTelescopeIds: ["seestar-s50"],
  });
  assert.equal(
    differs.sentence.replace(/ /g, " "),
    "Diffère de ma configuration par défaut : télescope, caméra, monture.",
  );
  assert.equal(differs.restore, true);
  assert.equal(differs.saveAs, true);

  const same = defaultConfigurationLineState({
    locale: "fr",
    equipment: configuration,
    configuration,
  });
  assert.equal(same.sentence, "Identique à ma configuration par défaut.");
  assert.equal(same.restore || same.saveAs, false);

  const none = defaultConfigurationLineState({
    locale: "fr",
    equipment: configuration,
    configuration: null,
  });
  assert.equal(none.sentence, null);
  assert.equal(none.restore, false);
  assert.equal(none.saveAs, true);

  const markup = renderToStaticMarkup(
    createElement(DefaultConfigurationLine, {
      locale: "fr",
      equipment: { ...configuration, telescopeId: "t2" },
      configuration,
    }),
  );
  assert.match(
    squash(markup),
    /Diffère de ma configuration par défaut : télescope\. Reprendre ma configuration par défaut Enregistrer comme configuration par défaut/,
  );
  // No frame class, "Reprendre" is the only
  // link, and the saving is a secondary with an icon, never a link and never a
  // primary, on the right.
  assert.equal((markup.match(/class="btn-link /g) || []).length, 1);
  assert.equal((markup.match(/class="btn-primary/g) || []).length, 0);
  assert.match(
    markup,
    /<button type="button" class="btn-secondary planner-default-configuration-save"><svg [^>]*aria-hidden="true">.*<\/svg>Enregistrer comme configuration par défaut<\/button>/,
  );
  assert.match(
    markup,
    /<div class="planner-default-configuration-actions">.*Reprendre ma configuration par défaut.*Enregistrer comme/,
    "the weakest first, the strongest last, in one row on the right",
  );
  assert.equal(
    renderToStaticMarkup(
      createElement(DefaultConfigurationLine, {
        locale: "fr",
        equipment: configuration,
        configuration,
        editable: false,
      }),
    ),
    "",
    "a plan that can no longer be edited has no line",
  );
  const identical = renderToStaticMarkup(
    createElement(DefaultConfigurationLine, {
      locale: "fr",
      equipment: configuration,
      configuration,
    }),
  );
  assert.doesNotMatch(identical, /btn-/, "identical: the sentence alone");
  const noConfiguration = renderToStaticMarkup(
    createElement(DefaultConfigurationLine, {
      locale: "fr",
      equipment: configuration,
      configuration: null,
    }),
  );
  assert.doesNotMatch(
    noConfiguration,
    /planner-default-configuration-sentence/,
  );
  assert.match(noConfiguration, /btn-secondary/, "the saving alone");
});

test("the line has no frame, its actions and the foot link stand on the right", () => {
  const css = readFileSync(
    new URL("../../portal-app/styles/portal.css", import.meta.url),
    "utf8",
  );
  const block = (selector) => {
    const start = css.indexOf(`\n${selector} {`);
    assert.ok(start >= 0, `${selector} is styled`);
    return css.slice(start, css.indexOf("}", start));
  };
  const line = block(".planner-default-configuration");
  assert.doesNotMatch(line, /border|padding/, "no frame around the line");
  const actions = block(".planner-default-configuration-actions");
  assert.match(actions, /justify-content: flex-end/);
  assert.match(actions, /flex-wrap: wrap-reverse/, "stacked: strongest first");
  assert.match(
    block(".planner-equipment-manage"),
    /justify-content: flex-end/,
    "« Gérer mon matériel » on the right",
  );
});

test("the line and its notice speak every shipped language", () => {
  for (const locale of shippedLocales()) {
    const line = defaultConfigurationLineState({
      locale,
      equipment: { ...configuration, telescopeId: "t2", mountId: "none" },
      configuration,
    });
    assert.ok(line.sentence && !line.sentence.includes("{parts}"), locale);
    assert.ok(!/planner[A-Z]/.test(line.sentence), `${locale}: no raw key`);
  }
});

test("the card of « Mon espace » → « Matériel » lists the configuration in the order of stage 2, and offers « Modifier ma configuration »", () => {
  const markup = renderToStaticMarkup(
    createElement(EquipmentView, {
      locale: "fr",
      read,
      actions: new Proxy({}, { get: () => () => {} }),
    }),
  );
  const text = squash(markup);
  assert.ok(
    text.startsWith(
      "Ma configuration par défaut Pré-remplit chaque nouveau plan",
    ),
    text.slice(0, 120),
  );
  assert.match(
    text,
    /Mode Photo Instrument Lunette 72 mm Caméra Caméra couleur refroidie Réducteur \/ Barlow Aucun Filtres Double bande Hα\/OIII 7 nm Monture Monture équatoriale compacte Enregistrée dans votre espace Modifier ma configuration/,
  );
  assert.match(markup, /class="btn-tertiary"[^>]*>.*Modifier ma configuration/);
  // The card comes before "Mon matériel".
  assert.ok(
    text.indexOf("Ma configuration par défaut") < text.indexOf("Mon matériel"),
  );

  const unset = squash(
    renderToStaticMarkup(
      createElement(EquipmentView, {
        locale: "fr",
        read: { ...read, defaultConfiguration: null },
        actions: new Proxy({}, { get: () => () => {} }),
      }),
    ),
  );
  assert.match(
    unset,
    /Pas encore réglée : un nouveau plan reprend le matériel du plan précédent\. Choisir mon matériel par défaut/,
  );
});

test("a place the configuration leaves out, or a smart telescope, has its own reading", () => {
  const rows = configurationRows(
    "fr",
    { mode: "imaging", telescopeId: "seestar-s50", filterIds: [] },
    read,
  );
  assert.deepEqual(
    rows.map(([key, , value]) => [key, value.replace(/ /g, " ")]),
    [
      ["mode", "Photo"],
      ["telescope", "Seestar S50"],
      ["camera", "Intégrée au Seestar S50 · IMX462"],
      ["filters", "Aucun"],
      ["mount", "Azimutale intégrée"],
    ],
  );
  const archived = configurationRows("fr", { mode: "imaging" }, read);
  assert.equal(archived.find(([key]) => key === "telescope")[2], "à choisir");
  assert.equal(archived.find(([key]) => key === "telescope")[3], true);
});

test("the dialog's fields are those of stage 2, telescope first (J13); a smart telescope brings its camera and mount", () => {
  const markup = renderToStaticMarkup(
    createElement(DefaultConfigurationFields, {
      locale: "fr",
      read,
      draft: configuration,
      onSet: () => {},
    }),
  );
  const text = squash(markup);
  const order = [
    "Photo",
    "Instrument",
    "Caméra",
    "Réducteur / Barlow",
    "Filtres",
    "Monture",
  ].map((label) => text.indexOf(label));
  assert.ok(
    order.every(
      (index, at) => index >= 0 && (at === 0 || index > order[at - 1]),
    ),
    JSON.stringify(order),
  );
  // Each select starts with "à choisir", then "Mon matériel" and
  // "Matériel par défaut"; the chosen item is selected.
  assert.match(markup, /<option value="">à choisir<\/option>/);
  assert.match(markup, /<optgroup label="Mon matériel">/);
  assert.match(
    markup,
    /<option value="t1" selected="">Lunette 72 mm<\/option>/,
  );
  // The mode is a segmented choice, not a primary.
  assert.doesNotMatch(markup, /btn-primary/);

  const smart = squash(
    renderToStaticMarkup(
      createElement(DefaultConfigurationFields, {
        locale: "fr",
        read,
        draft: { mode: "imaging", telescopeId: "seestar-s50" },
        onSet: () => {},
      }),
    ),
  );
  assert.match(smart, /Intégrée au Seestar S50 · IMX462/);
  assert.match(smart, /Azimutale intégrée/);
  assert.doesNotMatch(smart, /Réducteur/);
});

test("with the planner's pickers handed down, each place searches like stage 2 and « Définir mon matériel » leads to the tab", async () => {
  const { EquipmentPickerProvider } =
    await import("portal/components/manage/EquipmentPickerContext.js");
  const { ConfigurationEquipmentPicker } =
    await import("planner/components/ConfigurationEquipmentPicker.js");
  const { DefineEquipmentLink } =
    await import("planner/components/EquipmentPicker.js");
  const { telescopeProfiles } = await import("../src/planner.js");
  // The service's default rows: every telescope of the catalogue.
  const defaults = telescopeProfiles
    .map((profile) =>
      item(profile.id, "telescope", profile.name, {
        ...(profile.group ? { group: profile.group } : {}),
        maker: profile.maker,
        kind: profile.kind,
      }),
    )
    .map((row, index) => ({
      ...row,
      specifications: {
        apertureMm: telescopeProfiles[index].apertureMm,
        focalLengthMm: telescopeProfiles[index].focalLengthMm,
      },
    }));
  const withPickers = (props) =>
    renderToStaticMarkup(
      createElement(
        EquipmentPickerProvider,
        {
          value: {
            Picker: ConfigurationEquipmentPicker,
            DefineLink: DefineEquipmentLink,
          },
        },
        createElement(DefaultConfigurationFields, {
          locale: "fr",
          onSet: () => {},
          ...props,
        }),
      ),
    );
  const markup = withPickers({
    read: { ...read, defaults },
    draft: { mode: "imaging", telescopeId: "t1", modifierId: "none" },
  });
  // The telescope: the search, « Marque » and « Type », « Mon matériel »
  // first, its own item chosen.
  assert.match(markup, /placeholder="Rechercher un instrument"/);
  assert.match(markup, /<select aria-label="Marque">/);
  assert.match(
    markup,
    /<select aria-label="Instrument"><option value="__no-choice__">Aucun choix<\/option><optgroup label="Mon matériel"><option value="t1" selected="">Lunette 72 mm<\/option>/,
  );
  // Once chosen, « Aucun choix » takes it back: not on the reducer nor the
  // mount, which keep « Aucun » / « Aucune ».
  assert.doesNotMatch(
    markup,
    /<select aria-label="(Réducteur \/ Barlow|Monture)">(?:(?!<\/select>)[\s\S])*Aucun choix/,
  );
  assert.match(markup, /<optgroup label="Matériel par défaut · Lunette">/);
  // « Aucun » first for the reducer, « Aucune » for the mount.
  assert.match(
    markup,
    /<select aria-label="Réducteur \/ Barlow"><option value="none" selected="">Aucun<\/option>/,
  );
  assert.match(
    markup,
    /<select aria-label="Monture"><option disabled="" hidden="" value=""[^>]*>Choisir…<\/option><option value="none">Aucune<\/option>/,
  );
  // One « Définir mon matériel », to the tab « Matériel » of « Mon espace ».
  assert.equal((markup.match(/Définir mon matériel/g) || []).length, 1);
  assert.match(
    markup,
    /<a class="btn-link planner-equipment-define-link" href="\/fr\/manage\/equipment">/,
  );
  assert.doesNotMatch(markup, />à choisir</);
  // « Masquer le matériel par défaut »: the defaults leave the lists, the
  // chosen one stays named.
  const hidden = withPickers({
    read: { ...read, defaults, hideDefaultEquipment: true },
    draft: { mode: "imaging", telescopeId: "seestar-s50" },
  });
  assert.doesNotMatch(hidden, /Matériel par défaut ·/);
  assert.doesNotMatch(hidden, /<select aria-label="Marque">/);
  assert.match(hidden, /<option hidden="" value="seestar-s50"/);
});

test("« Aucun choix » takes a chosen telescope, camera or eyepiece back: the place reads « à choisir », the configuration and its comparison accept it", () => {
  // The dialog's draft: null (« Aucun choix ») takes the key out.
  const draft = configurationDraftWith(configuration, "telescopeId", null);
  assert.equal("telescopeId" in draft, false);
  assert.equal(configurationDraftWith(draft, "cameraId", "c1").cameraId, "c1");
  assert.equal(
    "cameraId" in configurationDraftWith(configuration, "cameraId", ""),
    false,
  );
  // Saved, it is a configuration without a telescope, read « à choisir ».
  const saved = normalizeDefaultConfiguration(draft);
  assert.deepEqual(saved, {
    mode: "imaging",
    cameraId: "c1",
    modifierId: "none",
    filterIds: ["f1"],
    mountId: "m1",
  });
  // A null value is as good as a key left out.
  assert.deepEqual(
    normalizeDefaultConfiguration({ ...configuration, telescopeId: null }),
    saved,
  );
  const rows = configurationRows("fr", saved, read);
  assert.deepEqual(rows.find(([key]) => key === "telescope").slice(2), [
    "à choisir",
    true,
  ]);
  // A new plan starts on nothing chosen for it; a plan whose telescope is
  // null is the same as the configuration, one that names one differs.
  assert.equal(planStartEquipment({}, saved).telescopeId, null);
  assert.deepEqual(
    equipmentConfigurationDifferences(
      { ...configuration, telescopeId: null },
      saved,
    ),
    [],
  );
  assert.deepEqual(equipmentConfigurationDifferences(configuration, saved), [
    "telescope",
  ]);
});

test("an archive the configuration names says that its place will read « à choisir »", () => {
  assert.equal(configurationNames(read, read.equipment[0]), true);
  assert.equal(configurationNames(read, read.equipment[4]), true);
  assert.equal(configurationNames(read, read.equipment[1]), false);
  assert.equal(
    configurationNames(
      { ...read, defaultConfiguration: null },
      read.equipment[0],
    ),
    false,
  );
  for (const locale of shippedLocales()) {
    const sentence = equipmentCopyFor(locale).configuration.archive("Lunette");
    assert.ok(
      sentence.includes("Lunette") && !sentence.includes("{name}"),
      locale,
    );
  }
  assert.equal(
    equipmentCopyFor("fr")
      .configuration.archive("Lunette 72 mm")
      .replace(/\u00a0/g, " "),
    "« Lunette 72 mm » sera aussi retiré de « Ma configuration par défaut » : sa place y sera « à choisir ».",
  );
});

test("a web plan made from « Cette nuit » starts from the configuration of a signed-in space, never a visitor's", () => {
  const settings = (signedIn) =>
    createWebQuickPlanAction({
      document: { plans: [] },
      date: "2026-10-14",
      location: { latitude: 45, longitude: -30, timeZone: "UTC" },
      locale: "fr",
      signedIn,
      inventory: read.equipment,
      defaultConfiguration: configuration,
    }).newSettings.equipment;
  assert.equal(settings(true).telescopeId, "t1");
  assert.deepEqual(settings(true).filterIds, ["f1"]);
  assert.equal(settings(false).telescopeId, null);
  assert.deepEqual(
    settings(true),
    planStartEquipment(settings(false), configuration),
  );
});

test("every plan the web planner creates goes through the start rule, and the adoption of the equipment stands aside when a configuration is set", () => {
  for (const file of [
    "../src/components/PlannerPage.js",
    "../dist/components/PlannerPage.js",
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const creations =
      source.match(/newPlanDarkness\(darknessPreferenceRef\.current\),/g) || [];
    const starts = source.match(/\.\.\.newPlanStart\((current|next)\),/g) || [];
    assert.equal(starts.length, creations.length, file);
    assert.match(source, /\{ id, name, \.\.\.darkness, \.\.\.start \}/);
    assert.match(source, /if \(defaultConfiguration\)\s*return;/);
  }
});
