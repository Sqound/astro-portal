import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { registerHooks } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  acquisitionBasisOf,
  acquisitionItemView,
} from "planner/acquisition-reading.js";
import { targetDialogModel } from "planner/acquisition-dialog-model.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// Three defects of the acquisition lines ("Prise de vue par cible"), the web
// side: (1) a fresh plan shows its suggested lines with nothing stored on it;
// (2) the card draws the line at its foot, under the facts, as one text; (3)
// the dialog offers every filter the plan has, the advised one marked.

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
const { AcquisitionCardLine } =
  await import("planner/components/AcquisitionParts.js");
const { AcquisitionDialog } =
  await import("planner/components/AcquisitionDialog.js");

const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));
const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const nothing = () => {};

const galaxy = (id, startMinute, endMinute) => ({
  id,
  durationMinutes: endMinute - startMinute,
  startMinute,
  endMinute,
  filter: "",
  target: {
    id,
    designation: id.toUpperCase(),
    title: id.toUpperCase(),
    objects: [id.toUpperCase()],
    coordinate: { ra: 10.68, dec: 41.27 },
    coordinateUnit: "degrees",
    skyTarget: { typeKey: "Galaxie", type: "Galaxy" },
    plannerSource: "catalogue",
  },
});
const planOf = (equipment) => ({
  id: "plan-1",
  name: "Fresh plan",
  date: "2026-09-15",
  status: "pending",
  equipment,
  items: [
    galaxy("m31", 0, 120),
    galaxy("m33", 120, 200),
    galaxy("m81", 200, 300),
  ],
});
const rig = {
  mode: "imaging",
  telescopeId: "askar-fra400",
  cameraId: "zwo-asi585mc-pro",
  filterIds: [],
};

test("(1) a fresh plan with three targets shows three suggested lines, nothing stored", () => {
  for (const equipment of [
    rig,
    { mode: "imaging" },
    { mode: "imaging", telescopeId: null, cameraId: null },
    { mode: "imaging", telescopeId: "seestar-s50", filterIds: [] },
    undefined,
  ]) {
    const plan = planOf(equipment);
    assert.equal(plan.acquisitionDefaults, undefined);
    const basis = acquisitionBasisOf({ plan, sqm: 20.8, moonIllumination: 17 });
    for (const item of plan.items) {
      const view = acquisitionItemView(basis, item);
      assert.ok(view, `${item.id} has a line (${JSON.stringify(equipment)})`);
      assert.equal(view.suggested, true, item.id);
      const markup = render(AcquisitionCardLine, { locale: "fr", view });
      assert.match(markup, /acq-suggested-chip/);
    }
    assert.equal(
      plan.items.some((item) => "acquisition" in item),
      false,
    );
  }
});

test("(2) the card line is one text, then the chip; the card draws it under the facts", () => {
  const plan = planOf(rig);
  const basis = acquisitionBasisOf({
    plan,
    ownedFilters: [{ name: "UV/IR cut", family: "broadband" }],
    sqm: 20.8,
    moonIllumination: 17,
  });
  const view = acquisitionItemView(basis, plan.items[0]);
  const markup = render(AcquisitionCardLine, { locale: "fr", view });
  assert.equal(
    (markup.match(/data-acquisition="text"/g) || []).length,
    1,
    "one text",
  );
  assert.match(
    textOf(markup),
    /^\d+ s · gain 200 · UV\/IR cut · ≈ \d+ poses suggéré$/,
  );
  for (const path of [
    "../src/components/PlannerPage.js",
    "../dist/components/PlannerPage.js",
  ]) {
    const text = readFileSync(new URL(path, import.meta.url), "utf8");
    const start = text.indexOf("function TargetCard(");
    const end = text.indexOf("const RecommendationTargetList", start);
    const card = text.slice(start, end);
    const inPlan = card.indexOf('className="planner-target-in-plan"');
    const facts = card.indexOf('className="planner-target-facts"');
    const line = card.indexOf("{acquisitionLine}");
    assert.ok(inPlan > 0 && facts > inPlan, path);
    assert.ok(line > facts, `${path}: the line comes after the facts`);
  }
});

const dialogOf = (plan, ownedFilters) => {
  const basis = acquisitionBasisOf({
    plan,
    ownedFilters,
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
  return render(AcquisitionDialog, { locale: "fr", model, onClose: nothing });
};
const chipsOf = (markup) => {
  const from = markup.indexOf('aria-label="Filtre"');
  const group = markup.slice(from, markup.indexOf("</section>", from));
  return [...group.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) =>
    textOf(m[1]),
  );
};

test("(3) two owned filters: four chips, the advised one marked, a poor fit still selectable", () => {
  const markup = dialogOf(planOf(rig), [
    { name: "UV/IR cut", family: "broadband" },
    { name: "Dual band", family: "dual" },
  ]);
  assert.deepEqual(chipsOf(markup), [
    "Conseillé par cible",
    "UV/IR cut · conseillé",
    "Dual band",
    "Sans filtre",
  ]);
  assert.doesNotMatch(
    markup,
    /data-filter="Dual band"[^>]*disabled/,
    "a filter that does not suit is selectable",
  );
});

test("(3) a smart telescope: its own filters are offered whatever step 2 and the inventory hold", () => {
  const markup = dialogOf(
    planOf({ mode: "imaging", telescopeId: "seestar-s50", filterIds: [] }),
    [],
  );
  const chips = chipsOf(markup);
  assert.equal(chips.length, 4, chips.join(" | "));
  // The plan's own list, so the bare names; the built-in tag "intégré".
  assert.deepEqual(
    chips.slice(1, 3).map((chip) => chip.replace(/\s+/g, " ")),
    ["UV/IR-Cut · conseillé intégré", "Duo-Band intégré"],
  );
  assert.doesNotMatch(textOf(markup), /aucun de vos filtres ne convient/);
});

test("(6) the open « Plus de réglages » says dithering and offset are not sent", () => {
  const plan = planOf(rig);
  const basis = acquisitionBasisOf({ plan, sqm: 20.8, moonIllumination: 17 });
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
  const note =
    "Le dithering et l’offset ne sont pas envoyés aux appareils\u00a0: réglez-les sur l’appareil ou dans votre logiciel d’acquisition.";
  assert.equal(
    textOf(
      render(AcquisitionDialog, { locale: "fr", model, onClose: nothing }),
    ).includes(note),
    false,
  );
  const source = readFileSync(
    new URL("../src/components/AcquisitionDialog.js", import.meta.url),
    "utf8",
  );
  const open = source.indexOf("{moreOpen ? (");
  assert.ok(open > 0);
  assert.ok(
    source.indexOf('data-acquisition="more-note"', open) >
      source.indexOf('data-acquisition="frames-help"', open),
    "after the count's help, inside the open section",
  );
  assert.match(
    readFileSync(
      new URL("../../portal/src/messages/fr.js", import.meta.url),
      "utf8",
    ),
    new RegExp(note.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});
