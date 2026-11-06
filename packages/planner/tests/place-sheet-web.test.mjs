// The sheet of one of my places — its
// actions ("Edit this place" secondary, "Make it the default place"
// tertiary and absent for the default place, "Retirer de mes lieux" tertiary in
// the destructive tint, last), "Utilisé par N plans", "Note", the time zone
// tile, "Voir l’horizon de ce lieu" — and the confirmation and the refusal of
// a deletion. Synthetic data; nothing is asked of the network.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
// A horizon really recorded: one direction rises above 0° (a mask whose points
// are all 0° records nothing).
const surveyedHorizon = {
  enabled: true,
  points: Array.from({ length: 36 }, (_, index) => ({
    azimuth: index * 10,
    altitude: index === 9 ? 12 : 0,
  })),
};

const { PlaceDetailView, PlaceDeleteDialog, PlaceOwnedActions } =
  await import("planner/components/PlaceSuggestedDetail.js");

const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));
const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/&#x27;/g, "’")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const mine = {
  id: "col",
  name: "Col des Étoiles",
  latitude: "45",
  longitude: "-30",
  elevation: "1720",
  timeZone: "Europe/Paris",
  kind: "viewpoint",
  note: "Parking au pied du col, dix minutes à pied.",
  horizonStatus: "verified",
  horizonMask: surveyedHorizon,
};
const plans = [
  {
    planId: "11111111-1111-4111-8111-111111111111",
    name: "Plan 1",
    planDate: "2026-10-12",
    status: "active",
  },
  {
    planId: "22222222-2222-4222-8222-222222222222",
    name: "Plan 2",
    planDate: "2026-10-14",
    status: "active",
  },
];
const actions = { onEdit() {}, onMakeDefault() {}, onDelete() {} };
const sheet = (extra = {}, ownedExtra = {}) =>
  render(PlaceDetailView, {
    locale: "fr",
    mode: "linked",
    place: {
      id: "osm:node/1",
      name: mine.name,
      type: "viewpoint",
      latitude: 45,
      longitude: -30,
      elevation: 1720,
    },
    mine,
    reference: null,
    sky: { bortle: 3, sqm: 21.5 },
    owned: {
      isDefault: true,
      usage: { pendingPlans: plans, pastPlans: [] },
      timeZone: mine.timeZone,
      note: mine.note,
      linked: false,
      actions,
      ...ownedExtra,
    },
    onBack() {},
    onViewHorizon() {},
    ...extra,
  });

test("the default place: « Éditer ce lieu » then « Retirer de mes lieux », no « En faire le lieu par défaut », the pill instead", () => {
  const markup = sheet();
  const text = textOf(markup);
  assert.match(text, /Point de vue Lieu par défaut Col des Étoiles/);
  const row = markup.slice(markup.indexOf("places-owned-actions"));
  assert.ok(row.indexOf("Éditer ce lieu") > 0);
  assert.ok(
    row.indexOf("Retirer de mes lieux") > row.indexOf("Éditer ce lieu"),
  );
  assert.ok(!markup.includes("En faire le lieu par défaut"));
});

test("another place: « En faire le lieu par défaut » is a tertiary between the secondary and the destructive tertiary", () => {
  const markup = sheet({}, { isDefault: false });
  const row = markup.slice(markup.indexOf("places-owned-actions"));
  const edit = row.indexOf("Éditer ce lieu");
  const make = row.indexOf("En faire le lieu par défaut");
  const del = row.indexOf("Retirer de mes lieux");
  assert.ok(
    edit > 0 && make > edit && del > make,
    "edit, default, delete in that order",
  );
  assert.match(row.slice(0, edit), /btn-secondary[^>]*>$/);
  assert.match(row.slice(edit, make), /btn-tertiary[^>]*>$/);
  assert.match(row.slice(make, del), /btn-tertiary is-destructive[^>]*>$/);
  assert.ok(
    !markup.includes("Lieu par défaut"),
    "no pill for a place that is not the default",
  );
});

test("the actions are the zone's: one secondary, two tertiaries, no primary, no link", () => {
  const markup = render(PlaceOwnedActions, {
    locale: "fr",
    isDefault: false,
    actions,
  });
  assert.equal((markup.match(/btn-secondary/g) || []).length, 1);
  assert.equal((markup.match(/btn-tertiary/g) || []).length, 2);
  assert.equal((markup.match(/is-destructive/g) || []).length, 1);
  assert.ok(!/btn-primary|btn-link/.test(markup));
});

test("the sheet names the plans that use the place, the time zone, the note and the horizon the web can show", () => {
  const text = textOf(sheet());
  assert.match(
    text,
    /Utilisé par 2 plans Nuit du 12 octobre Plan 1 · plan à exécuter Nuit du 14 octobre Plan 2 · plan à exécuter/,
  );
  assert.match(text, /Fuseau horaire Europe\/Paris déduit du lieu/);
  assert.match(text, /Altitude 1 720 m/);
  assert.match(text, /Note Parking au pied du col, dix minutes à pied\./);
  assert.match(
    text,
    /Horizon : relevé Masque enregistré, 36 points tous les 10°\..*1 point relevé Voir l’horizon de ce lieu/,
  );
  assert.ok(!text.includes("réalité augmentée"), "the web has no camera");
  assert.ok(!text.includes("Distance"), "« Distance » is no tile of the sheet");
});

test("a place no plan uses shows no usage card; one without a time zone reads UTC, never the browser's", () => {
  const text = textOf(
    sheet(
      {},
      { usage: { pendingPlans: [], pastPlans: [] }, timeZone: "", note: "" },
    ),
  );
  assert.ok(!text.includes("Utilisé par"));
  assert.ok(!text.includes("Note Parking"));
  assert.match(text, /Fuseau horaire UTC aucun fuseau enregistré/);
});

test("« Utilisé par » counts the plans to run and the past ones together, singular for one", () => {
  const past = {
    planId: "33333333-3333-4333-8333-333333333333",
    name: "Plan 0",
    planDate: "2026-10-05",
    status: "executed",
  };
  assert.match(
    textOf(
      sheet({}, { usage: { pendingPlans: [plans[0]], pastPlans: [past] } }),
    ),
    /Utilisé par 2 plans .*Plan 0 · exécuté/,
  );
  assert.match(
    textOf(sheet({}, { usage: { pendingPlans: [], pastPlans: [past] } })),
    /Utilisé par 1 plan Nuit du 5 octobre/,
  );
});

test("without actions (the picker's « Détails ») the sheet shows the facts and no edit, no delete", () => {
  const markup = sheet({}, { actions: null });
  assert.ok(!markup.includes("Éditer ce lieu"));
  assert.ok(!markup.includes("Retirer de mes lieux"));
  assert.ok(markup.includes("Utilisé par 2 plans"));
});

// `WebDialog` draws through a portal (nothing on the server): the dialog
// component is called as a function and its props are read, like the removal
// dialog of the suggested places (`places-filters-footer.test.mjs`).
const dialogOf = (props) => {
  const dialog = PlaceDeleteDialog({
    locale: "fr",
    name: mine.name,
    onCancel() {},
    onConfirm() {},
    ...props,
  });
  return {
    title: dialog.props.title.replace(/\u00a0/g, " "),
    body: textOf(renderToStaticMarkup(dialog.props.children)),
    footer: renderToStaticMarkup(dialog.props.footer),
  };
};

test("the confirmation: the primary in the destructive tint on the right, « Annuler » a link, what stays said", () => {
  const { title, body, footer } = dialogOf({ pendingPlans: null });
  assert.equal(title, "Retirer « Col des Étoiles » de vos lieux ?");
  assert.equal(
    body,
    "Aucun plan à venir ne l’utilise. Les sessions déjà faites gardent leur copie du lieu et de son horizon.",
  );
  assert.ok(
    footer.indexOf("btn-link") < footer.indexOf("btn-primary is-destructive"),
  );
  assert.equal((footer.match(/btn-primary/g) || []).length, 1);
  assert.match(
    footer,
    /btn-link">Annuler<[\s\S]*btn-primary is-destructive">Retirer de mes lieux</,
  );
});

test("the refusal names the plans to run, each row opens the plan, « Fermer » is alone", () => {
  const { title, body, footer } = dialogOf({
    pendingPlans: plans,
    onOpenPlan() {},
  });
  assert.equal(title, "Ce lieu est utilisé");
  assert.match(
    body,
    /« Col des Étoiles » sert encore à 2 plans à exécuter\. Changez le lieu de ces plans ou supprimez-les, puis retirez le lieu\. Nuit du 12 octobre Plan 1 Nuit du 14 octobre Plan 2/,
  );
  assert.equal(
    (
      renderToStaticMarkup(
        PlaceDeleteDialog({
          locale: "fr",
          name: "x",
          pendingPlans: plans,
          onOpenPlan() {},
        }).props.children,
      ).match(/places-usage-row/g) || []
    ).length,
    2,
  );
  assert.ok(!footer.includes("btn-primary"), "nothing to confirm in a refusal");
  assert.match(
    footer,
    /^<button type="button" class="btn-link">Fermer<\/button>$/,
  );
  assert.match(
    dialogOf({ pendingPlans: [plans[0]] }).body,
    /sert encore à 1 plan à exécuter\. Changez le lieu de ce plan ou supprimez-le/,
  );
});

test("« Voir l’horizon de ce lieu » is a tertiary on the sheet of my place, a link on a suggestion's", () => {
  const owned = sheet();
  assert.match(owned, /class="btn-tertiary"[^>]*>Voir l’horizon de ce lieu</);
  const suggestion = render(PlaceDetailView, {
    locale: "fr",
    mode: "suggested",
    place: {
      id: "osm:node/1",
      name: "Belvédère",
      type: "viewpoint",
      latitude: 45,
      longitude: -30,
    },
    mine: mine,
    onBack() {},
    onViewHorizon() {},
  });
  assert.match(suggestion, /class="btn-link"[^>]*>Voir l’horizon de ce lieu</);
});

test("« Conditions » shows only when the sheet is given the opener", () => {
  assert.ok(!sheet().includes("place-detail-conditions"));
  const markup = sheet({ onConditions() {} });
  assert.match(
    markup,
    /<button type="button" class="btn-secondary places-conditions" data-testid="place-detail-conditions">Conditions<\/button>/u,
  );
});

test("the badge says the type, « Privé » for a place of one's own; « Fiche OpenStreetMap » only when the place is linked, with its two links", () => {
  const privateSheet = textOf(
    sheet(
      { place: { id: "x", name: "Chez moi", type: "private" } },
      { isDefault: false },
    ),
  );
  assert.match(privateSheet, /Privé Chez moi/);
  assert.ok(!privateSheet.includes("Fiche OpenStreetMap"));
  let detached = 0;
  const markup = sheet(
    { place: { id: "x", name: "Camping des Cimes", type: "campsite" } },
    {
      isDefault: false,
      linked: true,
      osm: { id: "node/123", onDetach: () => (detached += 1) },
    },
  );
  const text = textOf(markup);
  assert.match(text, /Camping Camping des Cimes/);
  const section = markup.slice(
    markup.indexOf('data-testid="place-osm-section"'),
  );
  assert.match(textOf(section), /^.*Fiche OpenStreetMap/);
  assert.match(section, /href="https:\/\/www\.openstreetmap\.org\/node\/123"/);
  assert.match(textOf(section), /Voir sur OpenStreetMap/);
  assert.match(textOf(section), /© OpenStreetMap contributors \(ODbL\)/);
  assert.match(
    section,
    /btn-link is-destructive[^>]*>Détacher de la fiche OpenStreetMap/,
  );
  assert.equal(detached, 0);
});
