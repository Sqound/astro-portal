import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { messages } from "portal/i18n.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// On a card of the places list the gap chip of a sky comparable to the
// reference's said "≈ 0" with no word; it now says "Ciel comparable". The
// signed figures stay figures; the enlarged figure of the explanation keeps "≈
// 0" (its title says the words).
await registerJsx();
const { SkyDeltaBadge, SkyDeltaFrame } =
  await import("planner/components/PlacesParts.js");
const { skyDeltaChipLabel, skyDeltaBadgeLabel } =
  await import("planner/places-copy.js");

const comparable = { kind: "comparable", delta: 0.1 };
const darker = { kind: "darker", delta: 3.5 };
const reference = { name: "Jardin", placeId: "garden" };
const render = (comparison) =>
  renderToStaticMarkup(
    createElement(SkyDeltaBadge, {
      locale: "fr",
      comparison,
      place: { name: "Kitt Peak", sqm: 21.6 },
      reference,
      referenceSky: { sqm: 21.5 },
    }),
  );

test("a comparable sky is a word in the chip, in every language", () => {
  for (const locale of Object.keys(messages)) {
    const label = skyDeltaChipLabel(locale, comparable);
    assert.ok(label.length > 2, locale);
    assert.notEqual(label, skyDeltaBadgeLabel(locale, comparable), locale);
    assert.doesNotMatch(label, /^≈\s?0$/, locale);
  }
  assert.equal(skyDeltaChipLabel("fr", comparable), "Ciel comparable");
});

test("a gap keeps its signed figure", () => {
  assert.equal(skyDeltaChipLabel("fr", darker), "−3,5");
});

test("the card's chip shows the word; the explanation's large frame keeps the figure", () => {
  const card = render(comparable);
  assert.match(card, /class="places-delta-frame"[^>]*>Ciel comparable</);
  assert.doesNotMatch(card, /≈ 0/);
  const large = renderToStaticMarkup(
    createElement(SkyDeltaFrame, {
      locale: "fr",
      comparison: comparable,
      large: true,
    }),
  );
  assert.match(large, />≈ 0</);
});
