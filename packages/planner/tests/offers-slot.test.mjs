// The planner of the open core sells nothing: every place that could show an
// offer goes through `offers-slot.js`, which draws what a shell registered at
// `planner.offers` (`components`, `copy`, …) and, without a shell, nothing.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getPlannerExtensions,
  registerPlannerExtension,
} from "portal/planner/extensions.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const slot = await import("planner/offers-slot.js");

const render = (component, props = {}) =>
  renderToStaticMarkup(createElement(component, props));

const PIECES = [
  "HeldChip",
  "LockedCard",
  "LockedCardDialog",
  "LockedChip",
  "NightsOfferDialog",
  "PlanExistsOffersCard",
  "PurchaseBoxDialog",
  "PurchasePrimary",
  "TrendLocked",
];

test("without an extension, nothing: no component of an offer is drawn, nothing is said, no address leads anywhere", () => {
  assert.equal(getPlannerExtensions("planner.offers").length, 0);
  assert.equal(slot.offersRegistered(), false);
  for (const name of PIECES)
    assert.equal(
      render(slot[name], {
        locale: "fr",
        feature: "mosaic",
        offer: "planning",
      }),
      "",
      name,
    );
  assert.equal(slot.lockedOffersHref("fr", "planning", "mosaic"), null);
  assert.equal(slot.offersCopy("fr", "offerAdvancedPlanningName"), "");
  assert.equal(slot.lightMapRowLabel("fr"), "");
  // The session of the purchase boxes is only its children.
  assert.equal(
    render(slot.OffersSession, {
      value: { signedIn: true },
      children: createElement("i", null, "kept"),
    }),
    "<i>kept</i>",
  );
  // Greyed fields stay greyed, inert: the neutral sentence is the caller's.
  const fields = render(slot.LockedFields, {
    locale: "fr",
    feature: "mosaic",
    children: createElement("input"),
  });
  assert.match(
    fields,
    /^<div class="locked-fields is-inert"><input\/><\/div>$/,
  );
});

test("with an extension, each piece is the one it registered, told what the planner told the slot", () => {
  const seen = [];
  const piece = (name) => (props) => {
    seen.push([name, props.locale]);
    return createElement("b", { "data-piece": name });
  };
  const Provider = ({ value, children }) =>
    createElement(
      "section",
      { "data-signed-in": String(value.signedIn) },
      children,
    );
  registerPlannerExtension("planner.offers", {
    copy: (locale, key, values) => `${locale}:${key}:${values.n ?? ""}`,
    lockedHref: (locale, offer, feature) => `/${locale}/${offer}/${feature}`,
    lightMapRowLabel: (locale) => `row-${locale}`,
    components: {
      ...Object.fromEntries(PIECES.map((name) => [name, piece(name)])),
      LockedFields: ({ children }) =>
        createElement("div", { "data-linked": "" }, children),
      SessionProvider: Provider,
    },
  });
  assert.equal(slot.offersRegistered(), true);
  for (const name of PIECES)
    assert.equal(
      render(slot[name], { locale: "fr" }),
      `<b data-piece="${name}"></b>`,
      name,
    );
  assert.deepEqual(
    seen.map(([name]) => name),
    PIECES,
  );
  assert.equal(
    slot.lockedOffersHref("fr", "planning", "mosaic"),
    "/fr/planning/mosaic",
  );
  assert.equal(slot.offersCopy("en", "k", { n: 2 }), "en:k:2");
  assert.equal(slot.lightMapRowLabel("fr"), "row-fr");
  assert.equal(
    render(slot.OffersSession, { value: { signedIn: true }, children: "x" }),
    '<section data-signed-in="true">x</section>',
  );
  assert.match(
    render(slot.LockedFields, { children: createElement("input") }),
    /data-linked/,
  );
});

// Written in parts: this file is not one of the sales pieces it looks for.
const SALES_PIECES = new RegExp(
  ["advanced-offers" + "-copy", "Pay" + "wallCard", "Purchase" + "Button"]
    .concat(["useLocked" + "Price", "locked" + "Checkout"])
    .join("|"),
);

test("the planner's sources hold nothing that sells: no price, no purchase component, no offers copy", () => {
  const files = (directory) =>
    readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
      .map((entry) => join(entry.parentPath ?? entry.path, entry.name));
  const source = new URL("../src", import.meta.url).pathname;
  for (const file of files(source)) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, SALES_PIECES, file);
    assert.doesNotMatch(text, /34,99|59,99|79,99|29,99/, file);
  }
});
