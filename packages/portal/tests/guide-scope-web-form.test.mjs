// The guide scope's own fields in the web form of « Mon
// espace » → « Matériel », as the application's form has them:
// shown in its order with the words of the application, edited, saved through
// the contract and the service, read back — the last alignment and its
// offset (the phone's) shown and kept as they came.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { createEquipmentReader } from "../dist/persistence/equipment-reader.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import {
  createManageEquipment,
  equipmentInput,
} from "../dist/equipment/manage-equipment.js";

await registerJsx();
const { EquipmentEditor } =
  await import("portal/components/equipment/EquipmentEditor.js");
const { equipmentCopy } =
  await import("portal/components/equipment/equipment-copy.js");
const {
  guideScopeField,
  guideScopeOf,
  guideScopeToSave,
  guideScopeTubes,
  withGuideScope,
} = await import("portal/components/equipment/guide-scope.js");

const lastAdjustment = {
  at: "2026-11-04T12:00:00.000Z",
  star: "Véga",
  errorArcmin: 3,
  offset: { xDegrees: 0.31, yDegrees: -0.12 },
};
const newton = {
  id: "newton",
  type: "telescope",
  name: "Newton 250/1200",
  specifications: { apertureMm: 250, focalLengthMm: 1200 },
  planner: {},
};
const phoneItem = {
  id: "guide-1",
  type: "guide-scope",
  name: "Lunette guide 50/200",
  specifications: { apertureMm: 50, focalLengthMm: 200 },
  planner: {
    guideScope: {
      telescopeId: "newton",
      placement: "guide",
      camera: {
        name: "ZWO ASI120MM Mini",
        pixelSizeUm: 3.75,
        widthPx: 1280,
        heightPx: 960,
        sensor: "mono",
      },
      protocol: "alpaca",
      method: "softwareOffset",
      lastAdjustment,
      exposureSeconds: 3,
      binning: 2,
      gain: 120,
    },
  },
};

const render = (selected, locale = "fr") =>
  renderToStaticMarkup(
    createElement(EquipmentEditor, {
      locale,
      selected,
      equipment: [newton, selected],
      onSave: async (item) => item,
      onClose: () => {},
    }),
  );

test("the form lists the application's fields in the application's order, with its words", () => {
  const html = render(phoneItem);
  const order = [
    "Caméra du télescope",
    "Serveur",
    "Caméra placée sur",
    "Lunette guide",
    "Tube principal",
    "Sur le télescope",
    "Newton 250/1200",
    "Sans tube",
    "Optique et capteur",
    "Ouverture (mm)",
    "Focale (mm)",
    "Caméra",
    "Taille de pixel (µm)",
    "Largeur (px)",
    "Hauteur (px)",
    "Capteur",
    "Champ calculé",
    "Méthode de réglage",
    "Régler les bagues",
    "Décalage logiciel",
    "Avancé",
    "Pose par défaut",
    "Regroupement des pixels",
    "Gain",
  ];
  let at = -1;
  for (const word of order) {
    const next = html.indexOf(word, at + 1);
    assert.ok(next > at, `« ${word} » after the one before it`);
    at = next;
  }
  // The tube and the camera of the item are the chosen ones.
  assert.match(html, /<option value="newton" selected="">Newton 250\/1200/);
  assert.match(html, /value="ZWO ASI120MM Mini"/);
  assert.match(
    html,
    /data-testid="guide-scope-placement-guide" name="placement" checked=""/,
  );
  assert.match(
    html,
    /data-testid="guide-scope-method-softwareOffset" name="guide-scope-method" checked=""/,
  );
});

test("the last alignment and its offset are read-only: said, never an input", () => {
  const html = render(phoneItem);
  const line = html.match(
    /data-testid="guide-scope-last-adjustment">([^<]*)</,
  )[1];
  assert.match(line, /^Réglée · Véga · écart 3′ · 4 nov\./);
  assert.match(line, /Décalage logiciel 0,31°\s; -0,12°/);
  assert.doesNotMatch(html, /name="[^"]*(lastAdjustment|offset)/);
  const none = render({ ...phoneItem, planner: {} });
  assert.match(none, /Pas encore réglée/);
});

test("the computed field follows the focal length, the pixel and the sensor", () => {
  const field = guideScopeField(200, {
    pixelSizeUm: 3.75,
    widthPx: 1280,
    heightPx: 960,
  });
  assert.ok(Math.abs(field.arcsecPerPixel - 3.867) < 0.001);
  assert.ok(Math.abs(field.widthDegrees - 1.375) < 0.001);
  assert.equal(guideScopeField(undefined, { pixelSizeUm: 3.75 }), null);
  assert.match(render(phoneItem), /1,4° × 1,0° · 3,9″ par pixel/);
  assert.match(
    render({ ...phoneItem, specifications: {} }),
    /Indiquez la focale, le pixel et la taille du capteur\./,
  );
});

test("the tubes are the active telescopes, never a guide scope or binoculars", () => {
  const tubes = guideScopeTubes([
    newton,
    phoneItem,
    { ...newton, id: "old", archivedAt: "2026-01-01T00:00:00.000Z" },
    { ...newton, id: "jumelles", planner: { kind: "binoculars" } },
  ]);
  assert.deepEqual(
    tubes.map((tube) => tube.id),
    ["newton"],
  );
});

test("editing the form's fields: the draft becomes the contract's item", () => {
  let draft = { ...phoneItem, specifications: { ...phoneItem.specifications } };
  draft = withGuideScope(draft, { protocol: "indi" });
  draft = withGuideScope(draft, {
    placement: "main",
    telescopeId: "",
    method: "rings",
    exposureSeconds: 5,
    binning: 1,
    gain: "0",
    camera: { pixelSizeUm: "3,75", sensor: "colour" },
  });
  const saved = guideScopeToSave(draft);
  const guide = saved.planner.guideScope;
  assert.equal(guide.protocol, "indi");
  assert.equal("connection" in guide, false, "the phone keeps the connection");
  assert.equal(guide.placement, "main");
  assert.equal("telescopeId" in guide, false, "« Sans tube »");
  assert.equal(guide.method, "rings");
  assert.equal(guide.exposureSeconds, 5);
  assert.equal(guide.binning, 1);
  assert.equal(guide.gain, 0);
  assert.equal(guide.camera.pixelSizeUm, 3.75);
  assert.equal(guide.camera.sensor, "colour");
  assert.equal(guide.camera.name, "ZWO ASI120MM Mini", "the rest is kept");
  assert.deepEqual(guide.lastAdjustment, lastAdjustment);
  // The contract takes it as it is.
  assert.deepEqual(equipmentInput(saved).planner, saved.planner);
  // A connection read from the service is not shown and is not written back.
  const withConnection = withGuideScope(phoneItem, {
    connection: { host: "pc.local", port: 11111, device: 0 },
  });
  assert.equal("connection" in guideScopeOf(withConnection), false);
  assert.equal(
    "connection" in guideScopeToSave(withConnection).planner.guideScope,
    false,
  );
});

test("saved by the service and read back, the web's fields and the phone's alignment are there", async () => {
  const directory = await mkdtemp(join(tmpdir(), "debt-w64-web-01-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  await applyMigrations(driver, "sqlite");
  const reader = await createEquipmentReader({ driver });
  try {
    await driver.run(
      "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
      ["tenant-1", "Test", "2026-11-04T00:00:00.000Z"],
    );
    const made = await reader.saveEquipment({
      tenantId: "tenant-1",
      equipment: equipmentInput(phoneItem),
    });
    // The web edits it: another exposure.
    let draft = { ...made };
    draft = withGuideScope(draft, {
      exposureSeconds: 4,
    });
    const saved = await createManageEquipment(reader).update({
      tenantId: "tenant-1",
      equipmentId: made.id,
      body: { equipment: guideScopeToSave(draft) },
    });
    assert.equal(saved.id, made.id);
    const [listed] = await reader.listEquipment("tenant-1");
    const guide = listed.planner.guideScope;
    assert.equal(guide.exposureSeconds, 4);
    assert.equal("connection" in guide, false);
    assert.deepEqual(guide.lastAdjustment, lastAdjustment);
    assert.equal(guide.camera.name, "ZWO ASI120MM Mini");
    // And the form reads it back.
    const html = render(listed);
    assert.doesNotMatch(html, /guide-scope-host|guide-scope-port/);
  } finally {
    await driver.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("every language has the words, and a placeholder keeps its place", () => {
  const french = equipmentCopy.fr.editor.guideScope;
  assert.equal(Object.keys(french).length, 33);
  for (const [locale, copy] of Object.entries(equipmentCopy)) {
    const words = copy.editor.guideScope;
    assert.deepEqual(Object.keys(words), Object.keys(french), locale);
    for (const [key, value] of Object.entries(words))
      assert.ok(String(value).trim(), `${locale} ${key}`);
    for (const [key, token] of [
      ["adjusted", "{star}"],
      ["adjusted", "{error}"],
      ["adjusted", "{date}"],
      ["seconds", "{seconds}"],
      ["fieldValue", "{width}"],
      ["fieldValue", "{height}"],
      ["fieldValue", "{scale}"],
    ])
      assert.ok(words[key].includes(token), `${locale} ${key} ${token}`);
  }
});

test("another kind's form has none of it", () => {
  const html = render(newton);
  assert.doesNotMatch(html, /guide-scope-/);
  assert.doesNotMatch(html, /Caméra du télescope/);
});
