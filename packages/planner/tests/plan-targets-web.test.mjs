import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { planFrise } from "planner/plan-frise.js";
import {
  planTargetRowWords,
  planTargetSheetWords,
} from "planner/plan-target-words.js";
import {
  planTargetTrend,
  scorePlanTargets,
} from "planner/tonight-plan-targets.js";
import { tonightPlanCard } from "planner/tonight-overview.js";
import { clock } from "planner/wind-section.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { boardPlan } from "./helpers/plan-frise-cases.mjs";

// On the web, each target of tonight's plan over its slot (heights, score for
// the slot), the words of its details row and of its dialog, the three-icon
// control and the frise's blocks as buttons.

await registerJsx();
// `WebDialog` draws through a portal into `document.body` (nothing on the
// server): a stand-in lays its body and its footer out in place, as
// `target-score-explained.test.mjs` does. The shell is tested elsewhere.
globalThis.__createElement = createElement;
const DIALOG = `data:text/javascript,${encodeURIComponent(
  'const h = globalThis.__createElement; export const WebDialog = ({ children, footer }) => h("div", { className: "web-dialog-stand-in" }, h("div", { className: "web-dialog-body" }, children), h("footer", null, footer));',
)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "portal/components/dialog/WebDialog.js")
      return { url: DIALOG, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { PlanFrise, PlanTargetViewButtons } =
  await import("planner/components/PlanFrise.js");
const { PlanTargetDialog } =
  await import("planner/components/PlanTargetDialog.js");

const place = {
  id: "lac-noir",
  name: "Camping du Lac Noir",
  latitude: 45,
  longitude: -30,
  timeZone: "UTC",
};
const date = "2026-10-14";
const target = (id, designation, title, ra, dec, type) => ({
  id,
  designation,
  title,
  objects: [designation],
  coordinate: { ra, dec },
  coordinateUnit: "degrees",
  skyTarget: { type },
  apparentSizeArcmin: [180, 60],
});
const plan = {
  id: "plan-lac",
  name: "Nuit d’octobre au lac",
  status: "pending",
  date,
  location: place,
  items: [
    {
      startMinute: 55,
      endMinute: 175,
      target: {
        ...target(
          "m31",
          "M31",
          "M31 — Galaxie d’Andromède",
          10.68,
          41.27,
          "Galaxie",
        ),
        integratedMagnitude: 3.4,
      },
    },
    {
      startMinute: 205,
      endMinute: 325,
      target: target(
        "ngc7000",
        "NGC 7000",
        "NGC 7000 — Amérique du Nord",
        314.68,
        44.33,
        "Nébuleuse en émission",
      ),
    },
  ],
};
const at = (value) => clock(value, "fr", "UTC");

test("each target of the plan over its slot: its heights, its highest, and its score for the slot", () => {
  const nights = scorePlanTargets({ plan, place, date, locale: "fr" });
  assert.deepEqual(Object.keys(nights), ["0", "1"]);
  const card = tonightPlanCard(plan, place);
  for (const item of card.items) {
    const night = nights[item.index];
    assert.ok(night.card.series.length > 0);
    assert.equal(night.card.usableStart, item.start);
    assert.equal(night.card.usableEnd, item.end);
    assert.equal(night.card.target, item.target);
    assert.ok(
      night.maxAltitude >= Math.max(night.startAltitude, night.endAltitude),
    );
    assert.ok(night.score.max > 0);
    assert.ok(
      ["rising", "culminating", "setting"].includes(planTargetTrend(night)),
    );
  }
  // A plan without a place nor a slot gives nothing, never an error.
  assert.deepEqual(
    scorePlanTargets({ plan: { ...plan, location: null }, place: null, date }),
    {},
  );
  assert.deepEqual(
    scorePlanTargets({ plan: { ...plan, items: [] }, place, date }),
    {},
  );
});

const item = {
  index: 0,
  key: "item-0",
  id: "m31",
  label: "M31",
  designation: "M31",
  name: "Galaxie d’Andromède",
  target: {
    ...plan.items[0].target,
    story: "La grande galaxie spirale la plus proche de la nôtre.",
    observingGuide: {
      focalLengthMinimumMm: 200,
      focalLengthMaximumMm: 400,
      visualMinimumApertureMm: 50,
      visualDifficulty: "easy",
    },
    photoImageCredit: "NOIRLab / NSF / AURA",
    photoImageSourceUrl: "https://example.invalid/m31",
  },
  start: "2026-10-14T19:49:00.000Z",
  end: "2026-10-14T21:49:00.000Z",
  minutes: 120,
};
const night = {
  card: {
    series: [
      { time: "2026-10-14T19:49:00.000Z", altitude: 48 },
      { time: "2026-10-14T20:49:00.000Z", altitude: 60 },
      { time: "2026-10-14T21:49:00.000Z", altitude: 68 },
    ],
  },
  score: { total: 86, max: 100 },
  startAltitude: 48,
  endAltitude: 68,
  maxAltitude: 68,
};

test("a details row: the slot, the time in the plan with the highest altitude, the score for the slot", () => {
  assert.deepEqual(planTargetRowWords(item, night, { locale: "fr", at }), {
    designation: "M31",
    name: "Galaxie d’Andromède",
    slot: "19:49 → 21:49",
    facts: "2\u00a0h dans ce plan · max 68°",
    score: `${night.score.total}/100`,
  });
  assert.match(
    planTargetRowWords(item, night, { locale: "fr", at }).score,
    /^\d{1,3}\/100$/,
  );
  assert.equal(
    planTargetRowWords(item, null, { locale: "fr", at }).facts,
    "2\u00a0h dans ce plan",
  );
  assert.equal(
    planTargetRowWords(item, null, { locale: "fr", at }).score,
    null,
  );
  assert.equal(
    planTargetRowWords(item, night, { locale: "en", at }).facts,
    "2\u00a0h in this plan · max 68°",
  );
});

test("the dialog's words, in order: names, « Cette nuit dans ce plan », description, guide, credit", () => {
  const words = planTargetSheetWords({
    item,
    night,
    locale: "fr",
    at,
    moonUp: [],
    dew: { level: "moderate", from: "2026-10-15T00:00:00.000Z" },
  });
  assert.equal(words.title, "M31 · Galaxie d’Andromède");
  assert.equal(words.photo, "Voir la photo de M31 en plein écran");
  assert.equal(words.facts, "Galaxie · ≈\u00a0180 × 60′ · magnitude 3,4");
  assert.equal(words.tonight, "Cette nuit dans ce plan");
  assert.deepEqual(
    words.tiles.map((tile) => [tile.label, tile.value]),
    [
      ["Créneau", "19:49 → 21:49"],
      ["Durée", "2\u00a0h"],
      ["Hauteur", "48° → 68°"],
      ["Note", "86"],
    ],
  );
  assert.equal(
    words.curveLabel,
    "Hauteur de M31 pendant son créneau : de 48° à 19:49 à 68° à 21:49.",
  );
  assert.equal(
    words.nightFacts,
    "Monte vers son méridien, Lune couchée. Rosée probable après 00:00, après son créneau.",
  );
  assert.equal(words.description.title, "Description");
  assert.equal(words.guide.title, "Repères d’observation");
  assert.equal(words.guide.focal, "200–400 mm");
  assert.equal(words.guide.visual, "50 mm · Facile");
  assert.equal(words.credit, "Crédit image\u00a0: NOIRLab / NSF / AURA");
  assert.equal(words.sourceLabel, "Voir l’image source");
  assert.equal(words.close, "Fermer");
  // Without a slot, a night or a description: no section for them.
  const bare = planTargetSheetWords({
    item: {
      ...item,
      start: null,
      end: null,
      minutes: null,
      target: plan.items[0].target,
    },
    locale: "fr",
    at,
  });
  assert.equal(bare.tonight, null);
  assert.deepEqual(bare.tiles, []);
  assert.equal(bare.description, null);
  assert.equal(bare.guide, null);
});

test("the dialog renders its sections in that order and closes by « Fermer » alone", () => {
  const markup = renderToStaticMarkup(
    createElement(PlanTargetDialog, {
      item,
      night,
      locale: "fr",
      at,
      onClose: () => {},
    }),
  );
  const order = [
    "plan-target-photo",
    "M31 · Galaxie d’Andromède",
    'data-section="tonight"',
    'class="plan-target-curve"',
    'data-section="description"',
    'data-section="guide"',
    "plan-target-credit",
    "Voir l’image source",
    "plan-target-close",
  ];
  let from = -1;
  for (const needle of order) {
    const index = markup.indexOf(needle.replaceAll("’", "’"));
    assert.ok(index > from, `${needle} after the previous section`);
    from = index;
  }
  assert.match(markup, /class="btn-tertiary plan-target-close"[^>]*>Fermer</);
  assert.match(markup, /class="btn-link"[^>]*>Voir l’image source</);
});

test("the three-icon control: three radios named as specified, the chosen one active; disabled without a placed target", () => {
  const on = renderToStaticMarkup(
    createElement(PlanTargetViewButtons, { locale: "fr", view: "details" }),
  );
  assert.match(
    on,
    /role="radiogroup" aria-label="Affichage des cibles du plan"/,
  );
  for (const label of [
    "Compact : les cibles en étiquettes",
    "Détails : les cartes des cibles",
    "Frise : la nuit du plan",
  ])
    assert.ok(on.includes(`aria-label="${label}"`), label);
  assert.equal((on.match(/aria-checked="true"/g) ?? []).length, 1);
  assert.match(
    on,
    /aria-checked="true"[^>]*data-view="details" class="is-active"/,
  );
  const off = renderToStaticMarkup(
    createElement(PlanTargetViewButtons, {
      locale: "fr",
      view: "details",
      disabled: true,
    }),
  );
  assert.match(off, /class="plan-target-view is-disabled"/);
  assert.equal((off.match(/disabled=""/g) ?? []).length, 3);
  assert.equal((off.match(/aria-checked="true"/g) ?? []).length, 0);
  assert.ok(!off.includes("is-active"));
  assert.match(
    renderToStaticMarkup(
      createElement(PlanTargetViewButtons, { locale: "ja", view: "compact" }),
    ),
    /aria-label="詳細：対象のカード"/,
  );
});

test("with onBlock, each block of the frise is a button named « M31 de 19:49 à 21:49 : la fiche de la cible »", () => {
  const board = planFrise(boardPlan());
  const markup = renderToStaticMarkup(
    createElement(PlanFrise, {
      frise: board,
      locale: "fr",
      clock: at,
      onBlock: () => {},
    }),
  );
  assert.equal(
    (markup.match(/class="plan-frise-block-button"/g) ?? []).length,
    4,
  );
  assert.ok(
    markup.includes('aria-label="M31 de 19:49 à 21:49 : la fiche de la cible"'),
  );
  // Without it, the frise stays one image without a gesture.
  const still = renderToStaticMarkup(
    createElement(PlanFrise, { frise: board, locale: "fr", clock: at }),
  );
  assert.ok(!still.includes("plan-frise-block-button"));
});
