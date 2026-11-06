// "Réglages du plan" in the web modal "Deux versions de ce plan" — the
// rows of the shared rule rendered with the specified words, the
// pre-selected side, the highlighted row both versions changed and the
// line that holds "Valider" back.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { planFieldDifferences } from "../src/plan-merge.js";

await registerJsx();
const { PlanMergeFieldsSection } =
  await import("planner/components/PlanMergeFields.js");

const base = {
  id: "plan-col",
  name: "Nuit du Cygne",
  date: "2026-10-02",
  minAltitude: 30,
  equipment: { mode: "imaging", mountId: "az-gti" },
  items: [],
};
const profiles = {
  mounts: [
    { id: "az-gti", name: "AZ-GTi" },
    { id: "eq6", name: "EQ6-R Pro" },
  ],
};
const text = (markup) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replace(/\s+/g, " ")
    .trim();

function render(local, other, { choices = null, locale = "fr" } = {}) {
  const rows = planFieldDifferences(local, other, base);
  const effective =
    choices ||
    Object.fromEntries(
      rows
        .filter((row) => row.preselected)
        .map((row) => [row.field, row.preselected]),
    );
  return renderToStaticMarkup(
    createElement(PlanMergeFieldsSection, {
      busy: false,
      choices: effective,
      locale,
      onChoose: () => {},
      profiles,
      rows,
      timeZone: "UTC",
    }),
  );
}

test("one-side: the mount changed in this browser is pre-selected with « Modifié ici »", () => {
  const markup = render(
    { ...base, equipment: { ...base.equipment, mountId: "eq6" } },
    base,
  );
  assert.match(
    text(markup),
    /Réglages du plan Ce navigateur Version de l’autre appareil Monture/,
  );
  assert.match(markup, /aria-checked="true"[^>]*data-side="local"/);
  assert.match(
    text(markup),
    /EQ6-R Pro Modifié ici ✓ Version de l’autre appareil AZ-GTi/,
  );
  assert.doesNotMatch(markup, /is-pending/);
  assert.doesNotMatch(markup, /Choisir une valeur/);
});

test("both: no pre-selection, the row is highlighted and « Valider » is held back", () => {
  const markup = render(
    { ...base, minAltitude: 25 },
    { ...base, minAltitude: 35 },
  );
  assert.match(markup, /class="planner-merge-field is-pending"/);
  assert.doesNotMatch(markup, /aria-checked="true"/);
  assert.match(text(markup), /25° Modifié ici/);
  assert.match(text(markup), /35° Modifié sur l’autre appareil/);
  assert.match(
    text(markup),
    /Choisir une valeur pour chaque réglage avant de valider/,
  );
});

test("the wind tolerance reads on one line", () => {
  const markup = render(base, {
    ...base,
    equipment: { ...base.equipment, windTolerance: { preset: "heavy" } },
  });
  assert.match(
    text(markup),
    /Lourd ou abrité · vent soutenu 30 km\/h · rafales 45 km\/h Modifié sur l’autre appareil/,
  );
  assert.match(
    text(markup),
    /Standard · vent soutenu 20 km\/h · rafales 30 km\/h/,
  );
});

test("the section speaks the page's language", () => {
  const markup = render({ ...base, minAltitude: 25 }, base, { locale: "en" });
  assert.match(text(markup), /Plan settings/);
  assert.match(text(markup), /Changed here/);
  const japanese = render({ ...base, minAltitude: 25 }, base, {
    locale: "ja",
  });
  assert.match(text(japanese), /プランの設定/);
});
