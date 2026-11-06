// A horizon mask "enabled" with no measured point is not "Horizon relevé". The
// list of my places and the sheet of a place say the same thing.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { placeHorizonRecorded } = await import("planner/places-rules.js");
const { MyPlacesList } = await import("planner/components/PlacesView.js");
const { PlaceDetailView } =
  await import("planner/components/PlaceSuggestedDetail.js");

const flat = {
  enabled: true,
  points: Array.from({ length: 36 }, (_, index) => ({
    azimuth: index * 10,
    altitude: 0,
  })),
};
const traced = {
  enabled: true,
  points: flat.points.map((point) => ({
    ...point,
    altitude: point.azimuth === 90 ? 14 : 0,
  })),
};
const place = (extra) => ({
  id: "col",
  name: "Col des Étoiles",
  latitude: "45",
  longitude: "-30",
  ...extra,
});

const text = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

test("the rule: recorded needs a status other than « à vérifier » and a point above 0°", () => {
  assert.equal(
    placeHorizonRecorded(
      place({ horizonStatus: "verified", horizonMask: traced }),
    ),
    true,
  );
  // The horizon step crossed without tracing: enabled, thirty-six zeros.
  assert.equal(
    placeHorizonRecorded(
      place({ horizonStatus: "verified", horizonMask: flat }),
    ),
    false,
  );
  assert.equal(
    placeHorizonRecorded(place({ horizonStatus: "verified" })),
    false,
  );
  assert.equal(
    placeHorizonRecorded(
      place({ horizonStatus: "unverified", horizonMask: traced }),
    ),
    false,
  );
  assert.equal(placeHorizonRecorded(null), false);
});

const list = (extra) =>
  text(
    renderToStaticMarkup(
      createElement(MyPlacesList, {
        locale: "fr",
        places: [place({ horizonStatus: "verified", ...extra })],
        defaultId: null,
        position: null,
        skies: {},
        onOpen() {},
        onNewPlace() {},
      }),
    ),
  );

test("the list says « Horizon à relever » for an enabled mask with no measured point", () => {
  assert.match(list({ horizonMask: flat }), /Horizon à relever/);
  assert.ok(!list({ horizonMask: flat }).includes("Horizon relevé"));
  assert.match(list({ horizonMask: traced }), /Horizon relevé/);
});

test("the sheet of my place says the same", () => {
  const sheet = (horizonMask) =>
    text(
      renderToStaticMarkup(
        createElement(PlaceDetailView, {
          locale: "fr",
          mode: "linked",
          place: {
            id: "osm:node/1",
            name: "Belvédère",
            type: "viewpoint",
            latitude: 45,
            longitude: -30,
          },
          mine: place({ horizonStatus: "verified", horizonMask }),
          owned: {
            usage: { pendingPlans: [], pastPlans: [] },
            isDefault: false,
          },
          onBack() {},
          onViewHorizon() {},
          actions: { onEdit() {}, onMakeDefault() {}, onDelete() {} },
        }),
      ),
    );
  assert.ok(!sheet(flat).includes("Horizon : relevé"));
  assert.match(sheet(traced), /Horizon : relevé/);
});

// The sheet of a place whose horizon is recorded draws the horizon map (the
// compact, read-only mode of the horizon editor's plot); a horizon to record
// draws none.
test("the sheet draws the compact horizon map only for a recorded horizon", () => {
  const sheet = (mine, onViewHorizon = () => {}) =>
    renderToStaticMarkup(
      createElement(PlaceDetailView, {
        locale: "fr",
        mode: "linked",
        place: {
          id: "osm:node/1",
          name: "Belvédère",
          type: "viewpoint",
          latitude: 45,
          longitude: -30,
        },
        mine,
        owned: {
          usage: { pendingPlans: [], pastPlans: [] },
          isDefault: false,
        },
        onBack() {},
        onViewHorizon,
        actions: { onEdit() {}, onMakeDefault() {}, onDelete() {} },
      }),
    );
  const recorded = sheet(
    place({ horizonStatus: "verified", horizonMask: traced }),
  );
  assert.match(recorded, /data-place-horizon-map/);
  assert.match(recorded, /planner-horizon-plot/);
  assert.match(recorded, /planner-horizon-masked-area/);
  // Read only, nothing but the mask and the cardinals: no handle, no
  // projection switch, no orientation slider.
  assert.ok(!recorded.includes("planner-horizon-handle"));
  assert.ok(!recorded.includes("planner-horizon-projection-switch"));
  assert.ok(!recorded.includes("planner-horizon-time-slider"));
  // "N points relevés": the directions that rise above 0° (one here).
  assert.match(text(recorded), /1 point relevé/);
  // "Voir l'horizon" stays under the map.
  assert.ok(
    recorded.indexOf("data-place-horizon-map") <
      recorded.indexOf(">Voir l’horizon de ce lieu</button>"),
  );
  // The lone button stands on the right of the card's content.
  assert.match(
    recorded,
    /<div class="places-horizon-actions"><button[^>]*>Voir l’horizon de ce lieu<\/button><\/div>/,
  );
  for (const mine of [
    place({ horizonStatus: "verified", horizonMask: flat }),
    place({ horizonStatus: "unverified", horizonMask: traced }),
    place({}),
  ]) {
    assert.ok(!sheet(mine).includes("data-place-horizon-map"));
    assert.ok(!sheet(mine).includes("planner-horizon-plot"));
  }
  assert.ok(!sheet(null).includes("data-place-horizon-map"));
});
