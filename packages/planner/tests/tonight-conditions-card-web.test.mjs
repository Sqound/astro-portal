// On "Cette nuit" the link "Voir les conditions à {lieu}" of the note's sheet
// became an access card — the calendar icon, "Conditions à {lieu}", one
// subtitle, a chevron — toward the conditions page on the night's date. The
// subtitle is the same for every profile (the free one, the paid one, a private
// server): the page is explained by itself.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();

const { ConditionsAccessCard } =
  await import("planner/components/NightDetailParts.js");
const { message } = await import("portal/i18n.js");
const { shippedLocales } = await import("portal/locales.js");

const card = (locale, place = "Col des Étoiles") =>
  renderToStaticMarkup(
    createElement(ConditionsAccessCard, {
      conditions: {
        title: message(locale, "conditionsTitle").replace("{place}", place),
        subtitle: message(locale, "conditionsCardSubtitle"),
        href: "/fr/planner?view=conditions&place=col&date=2026-10-14",
      },
    }),
  );

test("the card: icon, title, subtitle, chevron, the whole card a link", () => {
  const markup = card("fr");
  assert.match(markup, /^<a /);
  assert.match(
    markup,
    /href="\/fr\/planner\?view=conditions&amp;place=col&amp;date=2026-10-14"/,
  );
  assert.match(markup, /tonight-score-conditions-icon/);
  assert.match(markup, /<strong>Conditions à Col des Étoiles<\/strong>/);
  assert.match(
    markup,
    /<small>Seize jours de prévisions, les nuits passées<\/small>/,
  );
  assert.match(markup, /tonight-score-conditions-chevron/);
  assert.ok(!markup.includes("Voir les conditions"), "the link is gone");
});

test("one subtitle for everyone, in the ten languages; the old link has no words left", () => {
  for (const locale of shippedLocales()) {
    assert.ok(message(locale, "conditionsCardSubtitle"), locale);
    assert.equal(
      message(locale, "conditionsSeeLink"),
      "conditionsSeeLink",
      `${locale}: the key of the link is removed`,
    );
  }
});

test("the page gives the card the same words whatever the profile: no rule reads the offer", async () => {
  const source = await readFile(
    new URL("../src/components/TonightPage.js", import.meta.url),
    "utf8",
  );
  const start = source.indexOf(
    'subtitle: message(locale, "conditionsCardSubtitle")',
  );
  assert.ok(start > 0, "the subtitle is the catalogue's");
  const around = source.slice(start - 500, start + 500);
  assert.ok(!/offer|advanced|capab|entitle/i.test(around), around);
});
