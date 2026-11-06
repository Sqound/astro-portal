import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { planFrise } from "planner/plan-frise.js";
import { clock } from "planner/wind-section.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { boardPlan } from "./helpers/plan-frise-cases.mjs";

// The frise as markup — its drawing, one image for a screen reader; the
// three-icon control replaced the two-state icon, here named for the plans.

await registerJsx();
const { PlanFrise, PlanTargetViewButtons } =
  await import("planner/components/PlanFrise.js");

const board = planFrise(boardPlan());
const at = (locale) => (value) => clock(value, locale, "UTC");
const render = (variant, locale = "fr") =>
  renderToStaticMarkup(
    createElement(PlanFrise, {
      frise: board,
      locale,
      clock: at(locale),
      variant,
    }),
  );
const count = (markup, pattern) => (markup.match(pattern) ?? []).length;
const text = (markup) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replace(/\s+/g, " ")
    .trim();

test("the full frise is one image with the specified sentence, 330 × 146", () => {
  const markup = render("full");
  assert.match(markup, /<svg[^>]*role="img"/);
  assert.match(markup, /width="330" height="146"/);
  assert.ok(
    markup.includes(
      "Frise du plan : M31 de 19:49 à 21:49, monte de 48° à 68° ; NGC 7000 de 22:19 à 00:19",
    ),
  );
  assert.ok(
    markup.includes(
      "Crépuscule jusqu’à 18:54 et à partir de 04:38. Repères de hauteur à 30° et 60°.",
    ),
  );
  // No gesture of its own: the frise is not a button or a link.
  assert.equal(count(markup, /<(button|a)[\s>]/g), 0);
});

test("the full frise draws four blocks with their curves and names, ten ticks, five hours, two references and the caption", () => {
  const markup = render("full");
  assert.equal(count(markup, /class="plan-frise-block"/g), 4);
  assert.equal(count(markup, /class="plan-frise-block-edge"/g), 4);
  assert.equal(count(markup, /class="plan-frise-curve"/g), 4);
  assert.equal(count(markup, /class="plan-frise-name"/g), 4);
  const ticks = markup.match(/<g class="plan-frise-ticks">(.*?)<\/g>/)[1];
  assert.equal(count(ticks, /<line /g), 10);
  const content = text(markup);
  for (const expected of [
    "20:00 22:00 00:00 02:00 04:00",
    "30° 60°",
    "M31",
    "NGC 7000",
    "M33",
    "M45",
    "Hauteur de chaque cible pendant son créneau",
  ])
    assert.ok(content.includes(expected), `« ${expected} » is drawn`);
  assert.equal(count(markup, /class="plan-frise-night-lines"/g), 1);
});

test("the reduced frise is 328 × 60 with the specified sentence, no hour, no caption, unlabelled references", () => {
  const markup = render("reduced");
  assert.match(markup, /width="328" height="60"/);
  assert.ok(
    markup.includes(
      "Frise réduite : M31, NGC 7000, M33, M45, de 19:49 à 03:49.",
    ),
  );
  assert.equal(count(markup, /plan-frise-hours/g), 0);
  assert.equal(count(markup, /plan-frise-ticks/g), 0);
  assert.equal(count(markup, /plan-frise-heights/g), 0);
  assert.equal(count(markup, /plan-frise-caption/g), 0);
  assert.equal(count(markup, /class="plan-frise-block"/g), 4);
  assert.equal(count(markup, /<line /g), 2 + 2);
  assert.ok(!text(markup).includes("Hauteur de chaque cible"));
});

test("the drawing never relies on hue alone: blocks have an edge, curves a stroke, references dashes", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(
    new URL("../../portal-app/styles/portal.css", import.meta.url),
    "utf8",
  );
  const rule = (selector) =>
    css.match(
      new RegExp(`\\n${selector.replace(".", "\\.")} \\{([^}]*)\\}`),
    )?.[1];
  assert.match(rule(".plan-frise-block-edge"), /stroke: #c18d45/);
  assert.match(rule(".plan-frise-block"), /fill-opacity: 0\.42/);
  assert.match(rule(".plan-frise-curve"), /stroke: var\(--active-gold-text\)/);
  assert.match(css, /\.plan-frise-reference line \{[^}]*stroke-dasharray: 3 4/);
});

test("every gradient has its own identifier, so that several frises share a page", () => {
  const ids = (markup) =>
    [...markup.matchAll(/<linearGradient id="([^"]+)"/g)].map(
      (match) => match[1],
    );
  const alone = ids(render("full"));
  assert.equal(alone.length, 2);
  const both = renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement(PlanFrise, { frise: board, locale: "fr", clock: at("fr") }),
      createElement(PlanFrise, { frise: board, locale: "fr", clock: at("fr") }),
    ),
  );
  assert.equal(new Set(ids(both)).size, 4);
});

test("the three-icon control of Planifier and « Tous les plans », named for the plans; greyed without any plan", () => {
  const html = renderToStaticMarkup(
    createElement(PlanTargetViewButtons, {
      locale: "fr",
      view: "details",
      plans: true,
      onChange() {},
    }),
  );
  assert.match(html, /role="radiogroup" aria-label="Affichage des plans"/);
  for (const label of [
    "Compact : les plans en lignes",
    "Détails : les plans avec leur lieu, leur matériel et leurs cibles",
    "Frise : la nuit de chaque plan",
  ])
    assert.match(html, new RegExp(`aria-label="${label}"`));
  assert.match(html, /aria-checked="true"[^>]*data-view="details"/);
  assert.ok(!/btn-(link|tertiary|secondary|primary)/.test(html));
  const off = renderToStaticMarkup(
    createElement(PlanTargetViewButtons, {
      locale: "fr",
      view: "compact",
      plans: true,
      disabled: true,
      onChange() {},
    }),
  );
  assert.match(off, /class="plan-target-view is-disabled"/);
  assert.equal(count(off, /disabled=""/g), 3);
  // The control of "Cette nuit" keeps its words for the targets.
  assert.match(
    renderToStaticMarkup(
      createElement(PlanTargetViewButtons, {
        locale: "fr",
        view: "compact",
        onChange() {},
      }),
    ),
    /aria-label="Affichage des cibles du plan"/,
  );
});

test("the sentences and labels come in English and Japanese too", () => {
  assert.ok(
    render("full", "en").includes(
      "Plan timeline: M31 from 19:49 to 21:49, rises from 48° to 68°",
    ),
  );
  assert.ok(
    render("reduced", "ja").includes("簡易タイムライン：M31、NGC 7000"),
  );
  assert.match(
    renderToStaticMarkup(
      createElement(PlanTargetViewButtons, {
        locale: "ja",
        view: "frise",
        plans: true,
        onChange() {},
      }),
    ),
    /aria-label="タイムライン：各プランの夜"/,
  );
});

test("in the red night mode every part of the drawing still differs from its neighbour by brightness", () => {
  // The night mode of the page keeps the luminance of a colour (portal/night-mode.js):
  // what the drawing shows is carried by luminance, not by hue.
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luminance = (color) =>
    0.2126 * channel(color[0]) +
    0.7152 * channel(color[1]) +
    0.0722 * channel(color[2]);
  const contrast = (left, right) => {
    const [a, b] = [luminance(left), luminance(right)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  };
  const plot = rgb("#111712");
  const fill = rgb("#9b6930").map((value, i) =>
    Math.round(value * 0.42 + plot[i] * 0.58),
  );
  const edge = rgb("#c18d45");
  const curve = rgb("#ffe0ae");
  assert.ok(contrast(fill, plot) >= 1.5, "a block against the plot");
  assert.ok(contrast(edge, plot) >= 3, "its edge against the plot");
  assert.ok(contrast(curve, fill) >= 3, "the curve against its block");
  assert.ok(contrast(rgb("#5b6f78"), rgb("#1c2528")) >= 2.5, "the twilights");
});
