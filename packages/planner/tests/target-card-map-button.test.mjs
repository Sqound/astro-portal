import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { message } from "portal/i18n.js";

// The card of a target in the stage 4
// list is no longer a click target; the map has its own icon button
// "Voir sur la carte", the weakest of the card's icon actions, before the
// plan action. The page is read as a source, as the
// other page tests of this package do.

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const source = read("../src/components/PlannerPage.js");
const dist = read("../dist/components/PlannerPage.js");
const css = read("../../portal-app/styles/portal.css");

const between = (text, from, to) => {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `${from} is in the page`);
  const end = text.indexOf(to, start);
  assert.ok(end > start, `${to} follows ${from}`);
  return text.slice(start, end);
};

for (const [name, text] of [
  ["src", source],
  ["dist", dist],
]) {
  test(`${name}: the stage 4 card has no click handler and no « is-map-selectable » class`, () => {
    assert.ok(!text.includes("is-map-selectable"), "the class is gone");
    assert.ok(!text.includes("onSelectMap"), "the old prop is gone");
    const card = between(
      text,
      "function TargetCard(",
      "const RecommendationTargetList",
    );
    // The article's only handler is the optional one of the plan's list under
    // the timeline (a click opens the slot's editing): undefined without
    // `onOpen`.
    assert.match(card, /onClick=\{openOnClick\}/);
    assert.match(card, /const openOnClick = onOpen\s*\?/);
    assert.match(card, /:\s*undefined;/);
    assert.equal((card.match(/<article/g) || []).length, 1);
    // The stage 4 list gives no `onOpen`: its cards are inert to a click.
    const list = between(
      text,
      "const RecommendationTargetList = memo(",
      "sameShallowContentProps",
    );
    assert.ok(!list.includes("onOpen"));
    assert.match(list, /onShowOnMap=\{onShowOnMap\}/);
  });

  test(`${name}: the map button calls selectMap and comes before the plan action`, () => {
    const card = between(
      text,
      "function TargetCard(",
      "const RecommendationTargetList",
    );
    const button = card.indexOf('className="planner-target-map-action"');
    const action = card.indexOf("<TargetPlanAction");
    assert.ok(button > 0 && action > button, "[carte] then [+ / ✕]");
    assert.match(card, /aria-label=\{message\(locale, "targetMapOpen"\)\}/);
    assert.match(card, /onClick=\{\(\) => onShowOnMap\(target\.id\)\}/);
    // The page's stable action: select on the map, then the map view.
    assert.match(text, /onShowOnMap=\{recommendationListActions\.selectMap\}/);
    const select = between(text, "selectMap: (id) => {", "showScore:");
    assert.match(select, /setMapSelectedTargetId\(id\)/);
    assert.match(select, /setTargetView\("map"\)/);
  });
}

test("the stylesheet: no hover style of the old class, a 44 px map button", () => {
  // Centred in the card like the plan action alone was: at the top it would
  // stand under the corner icons.
  assert.match(css, /\.planner-target-actions \{[^}]*align-self: center;/);
  assert.ok(!css.includes("is-map-selectable"));
  assert.match(
    css,
    /\.planner-target-card\.is-openable \{[^}]*cursor: pointer;/,
  );
  assert.match(
    css,
    /\.planner-target-map-action \{[^}]*width: 2\.75rem;[^}]*height: 2\.75rem;/,
  );
});

test("« Voir sur la carte »: one key, ten catalogues, French as specified", () => {
  assert.equal(message("fr", "targetMapOpen"), "Voir sur la carte");
  for (const locale of [
    "en",
    "de",
    "es",
    "it",
    "pt-BR",
    "ja",
    "ru",
    "zh-Hans",
    "zh-Hant",
  ]) {
    const text = message(locale, "targetMapOpen");
    assert.ok(text && text !== "targetMapOpen", `${locale} has the key`);
    assert.notEqual(text, message("fr", "targetMapOpen"), locale);
  }
});
