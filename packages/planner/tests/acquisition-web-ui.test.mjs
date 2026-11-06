import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  acquisitionBasisOf,
  acquisitionItemView,
} from "planner/acquisition-reading.js";
import {
  targetDialogModel,
  planDialogModel,
} from "planner/acquisition-dialog-model.js";
import {
  draftOf,
  emptyDraft,
  lineOf,
  problems,
} from "planner/acquisition-draft.js";
import { itemWithAcquisitionLine } from "planner/acquisition-edit.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// "Prise de vue par cible": the pieces the web puts on its screens — the block
// of step 2, the line of a card, the line of the interval editor, the dialog
// "Paramètres de la pose", the plan's dialog of the library — rendered in their
// first state, and the draft the dialog builds from what is typed.

await registerJsx();
// `WebDialog` draws through a portal (nothing on the server): a stand-in lays
// its title, body and footer out in place, as `plan-sheet-web.test.mjs`.
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
const { AcquisitionCardLine, AcquisitionEditorLine, AcquisitionTargetBlock } =
  await import("planner/components/AcquisitionParts.js");
const { AcquisitionDefaultsBlock } =
  await import("planner/components/AcquisitionDefaultsBlock.js");
const { AcquisitionDialog } =
  await import("planner/components/AcquisitionDialog.js");
const { PlanSheetDialog } =
  await import("planner/components/PlanSheetDialog.js");

const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));
const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/&#x27;|&#39;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const filters = [
  { name: "UV/IR cut", family: "broadband" },
  { name: "Dual band", family: "dual" },
];
const galaxy = (extra = {}) => ({
  id: "m31",
  durationMinutes: 80,
  startMinute: 120,
  endMinute: 200,
  filter: "",
  target: {
    id: "m31",
    designation: "M31",
    title: "M31 — Andromeda Galaxy",
    objects: ["M31"],
    coordinate: { ra: 10.68, dec: 41.27 },
    coordinateUnit: "degrees",
    skyTarget: { typeKey: "Galaxie", type: "Galaxy" },
    plannerSource: "catalogue",
  },
  ...extra,
});
const planOf = ({ items = [galaxy()], extra = {}, mode = "imaging" } = {}) => ({
  id: "plan-1",
  name: "Night by the lake",
  date: "2026-09-15",
  status: "pending",
  equipment: {
    mode,
    telescopeId: "askar-fra400",
    cameraId: "zwo-asi585mc-pro",
    filterIds: [],
  },
  items,
  ...extra,
});
const basisOf = (plan = planOf()) =>
  acquisitionBasisOf({
    plan,
    ownedFilters: filters,
    sqm: 20.8,
    moonIllumination: 17,
  });
const nothing = () => {};

// ——— The lines ———

test("the card line: the line, the count, the chip « suggéré »", () => {
  const basis = basisOf();
  const view = acquisitionItemView(basis, basis.plan.items[0]);
  const text = textOf(render(AcquisitionCardLine, { locale: "fr", view }));
  assert.equal(text, "120 s · gain 200 · UV/IR cut · ≈ 39 poses suggéré");
  assert.equal(render(AcquisitionCardLine, { locale: "fr", view: null }), "");
});

test("the card line: a choice takes the chip away, a count that does not fit is warned", () => {
  const chosen = planOf({
    items: [
      galaxy({
        acquisition: { lines: [{ exposureSeconds: 90, frameCount: 80 }] },
      }),
    ],
  });
  const basis = basisOf(chosen);
  const markup = render(AcquisitionCardLine, {
    locale: "fr",
    view: acquisitionItemView(basis, chosen.items[0]),
  });
  assert.doesNotMatch(markup, /suggéré/);
  assert.match(markup, /acq-card-line-text is-warning/);
  assert.match(textOf(markup), /^90 s · gain 200 · UV\/IR cut · 80 poses$/);
});

test("the card line of a launched plan: the frozen values, « figé au lancement », no chip", () => {
  const plan = planOf({
    extra: {
      launchedSchedule: [
        {
          planItemId: "m31",
          targetId: "m31",
          startMinute: 120,
          endMinute: 200,
          acquisition: {
            lines: [
              {
                filter: "UV/IR cut",
                exposureSeconds: 45,
                gain: 111,
                frameCount: 5,
              },
            ],
          },
          ruleVersion: "expo-b-0",
        },
      ],
    },
  });
  const basis = basisOf(plan);
  const view = acquisitionItemView(basis, plan.items[0]);
  assert.equal(
    textOf(render(AcquisitionCardLine, { locale: "fr", view })),
    "45 s · gain 111 · UV/IR cut · 5 poses figé au lancement",
  );
});

test("the interval editor line: the line, where it comes from, the link", () => {
  const basis = basisOf();
  const view = acquisitionItemView(basis, basis.plan.items[0]);
  const markup = render(AcquisitionEditorLine, {
    locale: "fr",
    view,
    onOpen: nothing,
  });
  assert.equal(
    textOf(markup),
    "120 s · gain 200 · UV/IR cut · ≈ 39 poses suggéré : galaxie, caméra couleur Paramètres de la pose ›",
  );
  assert.match(markup, /btn-link acq-link/);
});

test("the editor reads the slot as the handles left it", () => {
  const basis = basisOf();
  const item = basis.plan.items[0];
  const view = acquisitionItemView(basis, item, {
    startMinute: 120,
    endMinute: 160,
  });
  assert.match(
    textOf(
      render(AcquisitionEditorLine, { locale: "fr", view, onOpen: nothing }),
    ),
    /≈ 19 poses/,
  );
});

test("the block under a target of the plan's dialog: the line, and the line itself opens the target's setting (no repeated link)", () => {
  const basis = basisOf();
  const view = acquisitionItemView(basis, basis.plan.items[0]);
  const markup = render(AcquisitionTargetBlock, {
    locale: "fr",
    view,
    rowKey: "m31",
    onOpen: nothing,
  });
  assert.match(
    textOf(markup),
    /^120 s · gain 200 · UV\/IR cut · ≈ 39 poses suggéré$/,
  );
  assert.match(markup, /data-testid="acquisition-link-m31"/);
  assert.match(markup, /role="button"/);
});

// ——— The block of step 2 ———

test("step 2: three fields, the help, the link, in photo mode", () => {
  const markup = render(AcquisitionDefaultsBlock, {
    locale: "fr",
    basis: basisOf(),
    editable: true,
    onChange: nothing,
    onOpenDialog: nothing,
  });
  const text = textOf(markup);
  assert.match(text, /^Prise de vue /);
  assert.match(
    text,
    /Défauts de vos plans en mode photo, gardés sur cet appareil/,
  );
  for (const label of [
    "Pose",
    "Gain",
    "Filtre",
    "Plus de réglages ›",
    "binning, nombre de poses",
  ])
    assert.ok(text.includes(label), label);
  // The empty fields say what stays suggested.
  assert.match(markup, /placeholder="suggérée"/);
  assert.match(text, /suggéré/);
  assert.match(text, /conseillé/);
  // The gain lists the camera's named values, then "Autre valeur".
  assert.match(text, /HCG · 200/);
  assert.match(text, /Autre valeur/);
});

test("step 2: visual mode shows nothing; a plan read-only disables the fields", () => {
  assert.equal(
    render(AcquisitionDefaultsBlock, {
      locale: "fr",
      basis: basisOf(planOf({ mode: "visual" })),
      editable: true,
      onChange: nothing,
      onOpenDialog: nothing,
    }),
    "",
  );
  const markup = render(AcquisitionDefaultsBlock, {
    locale: "fr",
    basis: basisOf(),
    editable: false,
    onChange: nothing,
    onOpenDialog: nothing,
  });
  // The pose, the gain, the filter and the link.
  assert.equal((markup.match(/disabled=""/g) ?? []).length, 4);
});

test("step 2: the plan's defaults are shown in their fields", () => {
  const plan = planOf({
    extra: {
      acquisitionDefaults: {
        exposureSeconds: 60,
        gain: 200,
        filter: "Dual band",
      },
    },
  });
  const markup = render(AcquisitionDefaultsBlock, {
    locale: "en",
    basis: basisOf(plan),
    editable: true,
    onChange: nothing,
    onOpenDialog: nothing,
  });
  assert.match(markup, /value="60"/);
  assert.match(markup, /<option value="200" selected="">HCG · 200<\/option>/);
  assert.match(
    markup,
    /<option value="Dual band" selected="">Dual band<\/option>/,
  );
});

// ——— The dialog ———

const dialogOf = (model, locale = "fr") =>
  render(AcquisitionDialog, { locale, model, onClose: nothing });

test("G1: the fields, the named gains, the filters and what the rule suggests", () => {
  const plan = planOf();
  const model = targetDialogModel({
    locale: "fr",
    basis: basisOf(plan),
    itemId: "m31",
    editable: true,
    targetName: "M31",
    slot: "20:59 → 22:19",
    minutes: 80,
    writeItemLine: nothing,
  });
  const markup = dialogOf(model);
  const text = textOf(markup);
  assert.match(
    text,
    /^Paramètres de la pose M31 · créneau 20:59 → 22:19 · 1 h 20 /,
  );
  for (const part of [
    "Pose (s)",
    "Suggérée : 120 s · galaxie, f/5,6, ciel moyen",
    "Gain",
    "HCG · 200",
    "Autre valeur",
    "Suggéré : 200 · gain HCG de la caméra ZWO ASI585MC Pro",
    "Filtre",
    "Conseillé par cible",
    "UV/IR cut",
    "Dual band",
    "Sans filtre",
    "Conseillé pour M31 : UV/IR cut (Lune à 17 %)",
    "Plus de réglages ›",
    "Réinitialiser aux valeurs conseillées",
    "Utiliser pour cette cible",
  ])
    assert.ok(text.includes(part), part);
  // "Plus de réglages" is folded: neither the binning nor the count yet.
  assert.doesNotMatch(text, /Binning/);
  // The primary is the foot's last button, the tertiary the one before it.
  assert.match(
    markup,
    /<footer class="acq-dialog-footer"><button[^>]*class="btn-tertiary"[^>]*>Réinitialiser aux valeurs conseillées<\/button><button[^>]*class="btn-primary"[^>]*>Utiliser pour cette cible<\/button><\/footer>/,
  );
  // "Conseillé par cible" is the chip pressed while nothing is chosen.
  assert.match(
    markup,
    /filter-choice is-selected" aria-pressed="true"[^>]*>Conseillé par cible/,
  );
});

test("G1: a dialog opened on a binning or a count has « Plus de réglages » open", () => {
  const plan = planOf({
    items: [
      galaxy({ acquisition: { lines: [{ binning: 2, frameCount: 80 }] } }),
    ],
  });
  const model = targetDialogModel({
    locale: "fr",
    basis: basisOf(plan),
    itemId: "m31",
    editable: true,
    targetName: "M31",
    slot: "20:59 → 22:19",
    minutes: 80,
    writeItemLine: nothing,
  });
  const text = textOf(dialogOf(model));
  assert.match(text, /Binning 1 × 1 2 × 2/);
  assert.match(text, /Poses par cible/);
  // 80 frames do not fit 80 minutes at 122 s: warned, the slot never moves.
  assert.match(
    text,
    /80 poses ne tiennent pas dans ce créneau : 39 au plus\. Le créneau ne bouge pas\./,
  );
});

test("G2: the plan's dialog, « Utiliser pour tout le plan », the suggestions quoted for its first target", () => {
  const plan = planOf();
  const model = planDialogModel({
    locale: "fr",
    basis: basisOf(plan),
    editable: true,
    nameOf: (item) => item.target.designation,
    planName: "Nuit d’octobre au lac",
    writeDefaults: nothing,
  });
  const text = textOf(dialogOf(model));
  assert.match(
    text,
    /^Paramètres de la pose Pour tout le plan · Nuit d’octobre au lac /,
  );
  assert.ok(text.includes("Utiliser pour tout le plan"));
  assert.ok(text.includes("Conseillé pour M31 : UV/IR cut (Lune à 17 %)"));
  // A plan with no target says nothing is suggested.
  const empty = planDialogModel({
    locale: "fr",
    basis: basisOf(planOf({ items: [] })),
    editable: true,
    nameOf: () => "",
    planName: "Vide",
    writeDefaults: nothing,
  });
  assert.ok(
    textOf(dialogOf(empty)).includes(
      "Rien de suggéré : réglage de l’appareil.",
    ),
  );
});

test("the dialog of a launched plan: the frozen values, the mention, no primary, nothing to revert", () => {
  const plan = planOf({
    extra: {
      launchedSchedule: [
        {
          planItemId: "m31",
          targetId: "m31",
          startMinute: 120,
          endMinute: 200,
          acquisition: {
            lines: [{ filter: "UV/IR cut", exposureSeconds: 45, gain: 111 }],
          },
        },
      ],
    },
  });
  const model = targetDialogModel({
    locale: "fr",
    basis: basisOf(plan),
    itemId: "m31",
    editable: true,
    targetName: "M31",
    slot: null,
    writeItemLine: nothing,
  });
  assert.equal(model.readOnly, true);
  assert.equal(model.frozen, true);
  const markup = dialogOf(model);
  const text = textOf(markup);
  assert.ok(text.includes("Figé au lancement"));
  assert.ok(text.startsWith("Paramètres de la pose M31 "));
  assert.doesNotMatch(markup, /acquisition-use|acquisition-revert/);
  assert.match(markup, /value="45"/);
  assert.match(markup, /value="111"/);
  // A finished plan reads without editing, and does not claim a freeze.
  const finished = targetDialogModel({
    locale: "fr",
    basis: basisOf(planOf()),
    itemId: "m31",
    editable: false,
    targetName: "M31",
    writeItemLine: nothing,
  });
  assert.equal(finished.readOnly, true);
  assert.equal(finished.frozen, false);
  assert.ok(!textOf(dialogOf(finished)).includes("Figé au lancement"));
});

test("the dialog says its words in English, German and Japanese", () => {
  const model = targetDialogModel({
    locale: "en",
    basis: basisOf(),
    itemId: "m31",
    editable: true,
    targetName: "M31",
    slot: "20:59 → 22:19",
    minutes: 80,
    writeItemLine: nothing,
  });
  assert.ok(textOf(dialogOf(model, "en")).includes("Use for this target"));
  assert.ok(
    textOf(dialogOf(model, "en")).includes("Reset to suggested values"),
  );
  assert.ok(textOf(dialogOf(model, "de")).length > 0);
  assert.ok(textOf(dialogOf(model, "ja")).length > 0);
});

// ——— The draft ———

const gainChoices = [
  { kind: "unity", value: 100 },
  { kind: "hcg", value: 200 },
];

test("an empty draft chooses nothing: the suggestions stay", () => {
  assert.equal(lineOf(emptyDraft), null);
  assert.deepEqual(problems(emptyDraft), {
    exposure: false,
    gain: false,
    frames: false,
  });
});

test("a pose typed is the choice, and only it", () => {
  assert.deepEqual(lineOf({ ...emptyDraft, exposure: "90" }), {
    exposureSeconds: 90,
  });
  assert.deepEqual(lineOf({ ...emptyDraft, exposure: "1,5" }), {
    exposureSeconds: 1.5,
  });
});

test("a named gain and a filter of the plan are chosen", () => {
  assert.deepEqual(
    lineOf({
      ...emptyDraft,
      gainNamed: 200,
      filter: "named",
      filterName: "Dual band",
    }),
    { filter: "Dual band", gain: 200 },
  );
});

test("« Autre valeur » left empty is the device's own setting; « Sans filtre » is none", () => {
  assert.deepEqual(lineOf({ ...emptyDraft, gainOther: true }), { gain: null });
  assert.deepEqual(lineOf({ ...emptyDraft, filter: "none" }), { filter: null });
  assert.deepEqual(lineOf({ ...emptyDraft, gainOther: true, gain: "150" }), {
    gain: 150,
  });
});

test("a pose that is not a pose, a gain out of range, a count under one are refused", () => {
  assert.equal(problems({ ...emptyDraft, exposure: "0" }).exposure, true);
  assert.equal(problems({ ...emptyDraft, exposure: "abc" }).exposure, true);
  assert.equal(problems({ ...emptyDraft, exposure: "90000" }).exposure, true);
  assert.equal(
    problems({ ...emptyDraft, gainOther: true, gain: "1.5" }).gain,
    true,
  );
  assert.equal(
    problems({ ...emptyDraft, gainOther: true, gain: "200000" }).gain,
    true,
  );
  assert.equal(problems({ ...emptyDraft, frames: "0" }).frames, true);
  assert.equal(problems({ ...emptyDraft, frames: "3" }).frames, false);
  // A refused value never reaches the line.
  assert.equal(lineOf({ ...emptyDraft, exposure: "0" }), null);
});

test("the draft loads the line it is opened on, and gives it back", () => {
  const basis = { gainChoices };
  const line = {
    filter: null,
    exposureSeconds: 90,
    gain: 100,
    binning: 2,
    frameCount: 30,
  };
  const draft = draftOf(line, basis);
  assert.equal(draft.exposure, "90");
  assert.equal(draft.gainNamed, 100);
  assert.equal(draft.gainOther, false);
  assert.equal(draft.filter, "none");
  assert.equal(draft.binning, 2);
  assert.equal(draft.frames, "30");
  assert.deepEqual(lineOf(draft), line);
  // A gain that is not a named one opens "Autre valeur".
  const other = draftOf({ gain: 150 }, basis);
  assert.equal(other.gainOther, true);
  assert.equal(other.gain, "150");
  assert.deepEqual(lineOf(other), { gain: 150 });
  // "Réinitialiser aux valeurs conseillées" is the empty draft.
  assert.equal(lineOf(draftOf(null, basis)), null);
});

test("the frame count of the draft is read against the slot, not the plan's default", () => {
  const plan = planOf({ extra: { acquisitionDefaults: { frameCount: 500 } } });
  const basis = basisOf(plan);
  const item = plan.items[0];
  // With the default count the line does not fit the slot...
  assert.equal(basis.read(item).first.fitsSlot, false);
  // ...so the dialog previews the slot without it.
  const { acquisitionDefaults, ...rest } = basis.plan;
  const { frameCount: _frames, ...kept } = acquisitionDefaults;
  const slot = basis.withPlan({ ...rest, acquisitionDefaults: kept });
  assert.equal(
    slot.read(itemWithAcquisitionLine(item, null)).first.frameCount.value,
    39,
  );
});

// ——— The plan's dialog of the library ———

test("the plan's dialog: the defaults row with « Modifier », a line and a link under each target", () => {
  const plan = {
    ...planOf(),
    nightId: "night-1",
    location: {
      id: "lac",
      name: "Lac",
      latitude: 45,
      longitude: -30,
      timeZone: "UTC",
    },
  };
  const acquisition = {
    basis: acquisitionBasisOf({
      plan,
      ownedFilters: filters,
      sqm: 20.8,
      moonIllumination: 17,
    }),
    onWriteDefaults: nothing,
    onWriteItemLine: nothing,
  };
  const markup = render(PlanSheetDialog, {
    locale: "fr",
    plan,
    acquisition,
    now: Date.parse("2026-09-14T17:00:00Z"),
  });
  const text = textOf(markup);
  assert.ok(
    text.includes("Prise de vue · pose suggérée · gain 200 · filtre conseillé"),
    text,
  );
  // A pencil icon button named "Modifier la prise de vue", not a wide
  // "Modifier".
  assert.match(
    markup,
    /data-testid="plan-sheet-acquisition-edit"[^>]*aria-label="Modifier la prise de vue"[^>]*><svg/,
  );
  assert.doesNotMatch(
    markup,
    /data-testid="plan-sheet-acquisition-edit"[^>]*>Modifier</,
  );
  // A rig with nothing chosen reads « Matériel à choisir · photo », before the
  // shooting row, which comes before the night's own row.
  assert.ok(text.includes("Matériel à choisir · photo"), text);
  assert.ok(
    markup.indexOf('data-row="rig"') <
      markup.indexOf('data-row="acquisition"') &&
      markup.indexOf('data-row="acquisition"') <
        markup.indexOf('data-row="darkness"'),
  );
  assert.match(markup, /data-testid="acquisition-link-item-0"/);
  // The setting has ONE visible entry in the dialog — the pencil of the
  // shooting row — and no link "Paramètres de la pose › repeated on every
  // target; the target's own line opens its setting.
  assert.doesNotMatch(markup, /acq-link/);
  assert.equal((text.match(/Paramètres de la pose/g) || []).length, 0, text);
  assert.equal(
    (markup.match(/data-testid="plan-sheet-acquisition-edit"/g) || []).length,
    1,
  );
  assert.match(
    markup,
    /class="acq-target-block"[^>]*role="button"[^>]*aria-label="Paramètres de la pose"/,
  );
  assert.ok(text.includes("120 s · gain 200 · UV/IR cut · ≈ 39 poses suggéré"));
  // Without `acquisition` (visual mode, a finished plan) the dialog is as before.
  const bare = render(PlanSheetDialog, {
    locale: "fr",
    plan,
    now: Date.parse("2026-09-14T17:00:00Z"),
  });
  assert.doesNotMatch(bare, /acquisition/);
  // A plan whose night was launched shows its frozen lines and no "Modifier".
  const launched = {
    ...plan,
    launchedSchedule: [
      {
        planItemId: "m31",
        targetId: "m31",
        startMinute: 120,
        endMinute: 200,
        acquisition: { lines: [{ exposureSeconds: 45 }] },
      },
    ],
  };
  const frozen = render(PlanSheetDialog, {
    locale: "fr",
    plan: launched,
    acquisition: {
      ...acquisition,
      basis: acquisitionBasisOf({
        plan: launched,
        ownedFilters: filters,
        sqm: 20.8,
      }),
    },
    now: Date.parse("2026-09-14T17:00:00Z"),
  });
  assert.doesNotMatch(frozen, /plan-sheet-acquisition-edit/);
  assert.ok(textOf(frozen).includes("figé au lancement"));
  // An executed plan shows nothing of it.
  const executed = render(PlanSheetDialog, {
    locale: "fr",
    plan: { ...plan, status: "executed" },
    acquisition,
    now: Date.parse("2026-09-14T17:00:00Z"),
  });
  assert.doesNotMatch(executed, /acquisition/);
});
