import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { registerHeldChipOffers } from "./helpers/offers-stub.mjs";

// On the web, the link "Voir sur la carte de la pollution
// lumineuse" at the end of the card "Qualité du ciel" of the place fiche
// and the secondary "Voir sur la carte" of its ⓘ dialog, by role — open,
// held back (with the chip), and nothing at all on a private server or the
// open core (no context, or `absent`). Synthetic places only.
await registerJsx();
const { PlaceLightMapContext, PlaceLightMapButton, PlaceLightMapLink } =
  await import("planner/components/PlaceLightMapEntry.js");
const { PlaceDetailView } =
  await import("planner/components/PlaceSuggestedDetail.js");
const { placesLightMapAccess } =
  await import("planner/places-light-map-access.js");

const place = {
  id: "osm:node/12",
  name: "Camping du Lac Noir",
  type: "campsite",
  latitude: 45.377,
  longitude: -29.606,
};

const withAccess = (access, element) =>
  access === null
    ? element
    : createElement(
        PlaceLightMapContext.Provider,
        { value: { access, open: () => {} } },
        element,
      );

const detail = (access) =>
  renderToStaticMarkup(
    withAccess(
      access,
      createElement(PlaceDetailView, {
        locale: "fr",
        mode: "suggested",
        place,
        sky: { bortle: 3, sqm: 21.4 },
        onBack: () => {},
      }),
    ),
  );

test("the fiche's card « Qualité du ciel » ends with the link, by role", () => {
  const open = detail("open");
  assert.ok(open.includes("Voir sur la carte de la pollution lumineuse"));
  assert.match(open, /data-light-map-entry="open"/);
  // The link is inside the card, after its scale.
  const card = open.slice(open.indexOf("places-sky-card"));
  assert.ok(
    card.indexOf("places-sky-map-link") > card.indexOf("places-scale"),
    "at the end of the card",
  );
  registerHeldChipOffers();
  const held = detail("heldBack");
  assert.match(held, /data-light-map-entry="heldBack"/);
  assert.ok(held.includes("Planification avancée"), "held: the chip");
  for (const absent of [detail("absent"), detail(null)])
    assert.ok(!absent.includes("places-sky-map-link"), "private / open core");
});

test("the ⓘ dialog's secondary « Voir sur la carte », by role", () => {
  const render = (access) =>
    renderToStaticMarkup(
      createElement(
        PlaceLightMapContext.Provider,
        { value: access && { access, open: () => {} } },
        createElement(PlaceLightMapButton, { locale: "fr", place }),
      ),
    );
  assert.match(render("open"), /class="btn-secondary"[^>]*>Voir sur la carte</);
  assert.match(render("heldBack"), /Voir sur la carte/);
  assert.equal(render("absent"), "");
  assert.equal(render(null), "");
});

test("the map's entry is never shown by a private server or the core alone", () => {
  assert.equal(
    placesLightMapAccess({ registered: false, hosted: true }),
    "absent",
  );
  assert.equal(
    placesLightMapAccess({ registered: true, hosted: false }),
    "absent",
  );
  assert.equal(
    placesLightMapAccess({ registered: true, hosted: true, capabilities: {} }),
    "heldBack",
  );
  assert.equal(
    placesLightMapAccess({
      registered: true,
      hosted: true,
      capabilities: { "planner.mosaic": true },
    }),
    "open",
  );
  const link = renderToStaticMarkup(
    createElement(PlaceLightMapLink, { locale: "fr", place }),
  );
  assert.equal(link, "");
});
