import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import {
  PLANNER_EXTENSION_POINTS,
  getPlannerExtensions,
  registerPlannerExtension,
} from "portal/planner/extensions.js";
import {
  LIGHT_MAP_ACCESS,
  LIGHT_MAP_POINT,
  placesLightMapAccess,
} from "../src/places-light-map-access.js";

// The geographic light-pollution map is a shell's, registered at
// `planner.places.lightMap`; the open planner only draws its entry in
// "Lieux", held back without `planner.mosaic`. Nothing registered (a
// private server): no entry at all. The labelled row under the title is
// the one entry; the title line carries no map button.

await registerJsx();
const placesView = await import("planner/components/PlacesView.js");
const { PlacesLightMapRow } = placesView;

const mosaic = { "planner.mosaic": true };
const free = { "planner.mosaic": false };

test("planner.places.lightMap is a point of the closed list", () => {
  assert.equal(LIGHT_MAP_POINT, "planner.places.lightMap");
  assert.ok(PLANNER_EXTENSION_POINTS.includes(LIGHT_MAP_POINT));
  const extension = { View: () => null, copy: () => ({ entry: "x" }) };
  registerPlannerExtension(LIGHT_MAP_POINT, extension);
  assert.equal(getPlannerExtensions(LIGHT_MAP_POINT)[0], extension);
});

test("absent where nothing is registered or the page is not the hosted service's", () => {
  assert.deepEqual([...LIGHT_MAP_ACCESS], ["absent", "heldBack", "open"]);
  for (const capabilities of [null, mosaic, free]) {
    assert.equal(
      placesLightMapAccess({ registered: false, hosted: true, capabilities }),
      "absent",
    );
    assert.equal(
      placesLightMapAccess({ registered: true, hosted: false, capabilities }),
      "absent",
    );
  }
});

test("held back without planner.mosaic (a visitor, a free space), open with it", () => {
  for (const capabilities of [null, free, {}])
    assert.equal(
      placesLightMapAccess({ registered: true, hosted: true, capabilities }),
      "heldBack",
    );
  assert.equal(
    placesLightMapAccess({
      registered: true,
      hosted: true,
      capabilities: mosaic,
    }),
    "open",
  );
});

test("the title line has no map button any more: the labelled row is the one entry", () => {
  assert.equal(placesView.PlacesLightMapEntry, undefined);
});

const row = (props) =>
  renderToStaticMarkup(
    createElement(PlacesLightMapRow, {
      locale: "fr",
      onOpen: () => {},
      ...props,
    }),
  );

test("the labelled row of « Lieux »: label, chip while held and sold, chevron; nothing where the map is absent", () => {
  const label = "Carte de la pollution lumineuse";
  assert.equal(row({ lightMap: null }), "");
  assert.equal(row({ lightMap: { access: "absent", label } }), "");
  // Sold here: a shell registered its offers.
  registerPlannerExtension("planner.offers", {
    gateCopy: () => ({}),
    href: () => "/fr/offers",
    price: () => "34,99 €",
    lightMapRowLabel: () =>
      "Carte de la pollution lumineuse, Planification avancée",
    components: {
      HeldChip: ({ offer }) =>
        createElement(
          "span",
          { className: "advanced-chip-wrap" },
          createElement("span", { "data-advanced-chip": offer }),
        ),
    },
  });
  const held = row({ lightMap: { access: "heldBack", label } });
  assert.match(held, /class="light-map-row"/);
  assert.match(
    held,
    /aria-label="Carte de la pollution lumineuse, Planification avancée"/,
  );
  assert.match(held, /data-advanced-chip="planning"/);
  assert.match(held, /light-map-row-chevron/);
  // The chip is under the title, in the same text column, not beside it.
  assert.match(
    held,
    /light-map-row-text[^>]*><span class="light-map-row-label">Carte de la pollution lumineuse<\/span><span class="advanced-chip-wrap"><span[^>]*data-advanced-chip="planning"/,
  );
  const open = row({ lightMap: { access: "open", label } });
  assert.match(open, /aria-label="Carte de la pollution lumineuse"/);
  assert.doesNotMatch(open, /advanced-chip/);
});

test("the planner reads the point and draws the one entry under the title of « Lieux »", () => {
  const page = readFileSync(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  assert.match(page, /plannerExtension\("planner\.places\.lightMap"\)/);
  assert.match(page, /lightMap=\{placesLightMap\}/);
  const view = readFileSync(
    new URL("../src/components/PlacesView.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(view, /PlacesLightMapEntry|places-title-row/);
  assert.doesNotMatch(view, /places-light-map-entry/);
  // The labelled row is under the title and above the two tabs.
  assert.match(
    view,
    /<PlacesLightMapRow[\s\S]{0,200}\/>\s*<div\s+className=\{`session-view-switch places-switch/,
  );
});
