import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// « One line, then ⓘ »: the web's one ⓘ, its line, its « Sources » section and
// the one empty state, read as markup in the three languages the pages ship
// first. The dialog itself needs a browser (`<dialog>`): the pages' browser
// tests open it.
await registerJsx();
const { InfoButton, InfoLine, InfoSources } =
  await import("portal/components/dialog/InfoButton.js");
const { EmptyState } = await import("portal/components/empty/EmptyState.js");

const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));
const css = readFileSync(
  new URL("../../portal-app/styles/portal.css", import.meta.url),
  "utf8",
);
const rule = (selector) => {
  const start = css.indexOf(`\n${selector} {`);
  assert.notEqual(start, -1, `${selector} is styled`);
  return css.slice(start, css.indexOf("}", start));
};

test("the ⓘ is one outline glyph on a 44 px target, named « En savoir plus » unless the control has a name", () => {
  const fr = render(InfoButton, { locale: "fr" });
  assert.match(
    fr,
    /^<button type="button" class="info-button" aria-label="En savoir plus" title="En savoir plus"><svg viewBox="0 0 24 24" aria-hidden="true">/,
  );
  assert.match(render(InfoButton, { locale: "en" }), /aria-label="Learn more"/);
  assert.match(render(InfoButton, { locale: "ja" }), /aria-label="詳しく見る"/);
  const named = render(InfoButton, {
    locale: "fr",
    label: "Que contient le fichier ?",
    testId: "export-info",
  });
  assert.match(named, /aria-label="Que contient le fichier \?"/);
  assert.match(named, /data-testid="export-info"/);
  const target = rule(".info-button");
  assert.match(target, /width: 44px;/);
  assert.match(target, /height: 44px;/);
  assert.match(rule(".info-button svg"), /width: 20px;/);
});

test("a line with its ⓘ shows the short summary and only the button; the detail waits behind it", () => {
  const html = render(InfoLine, {
    locale: "fr",
    text: "Une notification à midi le jour de la nuit, sans nommer le lieu.",
    title: "Avant la nuit",
    body: "À midi le jour de la nuit, une notification sur cet appareil.",
  });
  assert.match(
    html,
    /<p class="info-line-text">Une notification à midi le jour de la nuit, sans nommer le lieu\.<\/p>/,
  );
  assert.ok(!html.includes("sur cet appareil"), "the detail is not printed");
  assert.equal(html.split("<button").length, 2, "one ⓘ");
});

test("« Sources » is a translated heading; a licensor's sentence stays in its language, set apart and marked", () => {
  const eog =
    "This product was made utilizing VIIRS Nighttime Lights (VNL) data produced by the Earth Observation Group, Payne Institute for Public Policy, Colorado School of Mines.";
  for (const [locale, title] of [
    ["fr", "Sources"],
    ["en", "Sources"],
    ["ja", "出典"],
    ["de", "Quellen"],
    ["ru", "Источники"],
  ]) {
    const html = render(InfoSources, {
      locale,
      lines: ["Une ligne de source traduite."],
      attributions: [eog],
    });
    assert.match(html, new RegExp(`<h3>${title}</h3>`), locale);
    assert.match(html, /<p class="info-attribution" lang="en">This product/);
    assert.match(html, /Une ligne de source traduite\./);
  }
  assert.match(rule(".info-sources .info-attribution"), /border-left/);
});

test("the empty state is one sentence, one primary button and the star in filigree: no link, never focusable", () => {
  const html = render(EmptyState, {
    sentence: "Choisissez un lieu pour planifier votre nuit.",
    actionLabel: "Choisir un lieu",
    onAction() {},
  });
  assert.equal(html.split("empty-state-sentence").length, 2, "one sentence");
  assert.match(html, />Choisissez un lieu pour planifier votre nuit\.</);
  assert.match(
    html,
    /<button type="button" class="btn-primary empty-state-action">Choisir un lieu<\/button>/,
  );
  assert.equal(html.split("<button").length, 2, "one button");
  assert.ok(!html.includes("<a "), "no link");
  assert.match(html, /<svg class="empty-state-star"[^>]*aria-hidden="true"/);
  assert.ok(!/<svg[^>]*tabindex/.test(html), "the star is not focusable");
  const star = rule(".empty-state-star");
  assert.match(star, /pointer-events: none;/);
  assert.match(star, /fill-opacity: 0\.1;/);
  assert.match(star, /width: 150px;/);
  // The second line some boards draw is optional.
  assert.ok(!html.includes("empty-state-detail"));
  assert.match(
    render(EmptyState, {
      sentence: "Vous n’avez rien publié pour le moment.",
      detail: "Publiez une image depuis votre galerie.",
      actionLabel: "Ouvrir la galerie",
      onAction() {},
    }),
    /<p class="empty-state-detail">Publiez une image depuis votre galerie\.<\/p>/,
  );
});
