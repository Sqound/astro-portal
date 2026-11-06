// The place search lists one line per place the person can tell apart. The
// geocoder answered "Nobeyama" three times with the same label (the node,
// the polygon and the relation of the hamlet).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

const feature = (longitude, latitude, properties) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [longitude, latitude] },
  properties,
});
const hamlet = {
  name: "野辺山",
  street: "佐久甲州街道",
  city: "南牧村",
  state: "Préfecture de Nagano",
  country: "Japon",
};

test("three geocoder answers with the same label are one line", async (t) => {
  const asked = [];
  const geocoder = createServer((request, response) => {
    asked.push(request.url);
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        features: [
          feature(138.475, 35.94, hamlet),
          feature(138.4752, 35.9402, hamlet),
          feature(138.4761, 35.9411, hamlet),
          feature(138.2, 36.3, { name: "Observatoire", city: "Nagano" }),
          feature(138.2, 36.3, { name: "Observatoire", city: "Nagano" }),
        ],
      }),
    );
  });
  await new Promise((resolve) => geocoder.listen(0, "127.0.0.1", resolve));
  t.after(() => geocoder.close());
  process.env.ASTRO_PORTAL_GEOCODER_URL = `http://127.0.0.1:${geocoder.address().port}/`;
  t.after(() => delete process.env.ASTRO_PORTAL_GEOCODER_URL);
  const { searchPlannerPlaces } =
    await import("portal/planner/location.server.js");
  const results = await searchPlannerPlaces("Nobeyama", "fr");
  assert.deepEqual(
    results.map((result) => result.name),
    [
      "野辺山, 佐久甲州街道, 南牧村, Préfecture de Nagano, Japon",
      "Observatoire, Nagano",
    ],
  );
  // The geocoder is asked for more than is kept, so that the duplicates do not
  // leave the list short.
  assert.match(asked[0], /limit=10/);
});

test("distinct labels stay, in the geocoder's order; the label is compared as it reads", async () => {
  const { distinctPlaceResults } =
    await import("portal/planner/location.server.js");
  const results = distinctPlaceResults([
    { name: "Mont Blanc, Savoie" },
    { name: "Mont Blanc,  Savoie " },
    { name: "mont blanc, savoie" },
    { name: "Mont Blanc, Aoste" },
    { name: "" },
    { name: "" },
  ]);
  assert.deepEqual(
    results.map((result) => result.name),
    ["Mont Blanc, Savoie", "Mont Blanc, Aoste", "", ""],
  );
  assert.deepEqual(distinctPlaceResults(null), []);
});

test("a result says its name once: the place, then where it is", async () => {
  const { placeResultLines } = await import("portal/planner/place-results.js");
  assert.deepEqual(
    placeResultLines({
      shortName: "Saint-Véran",
      name: "Saint-Véran, Provence-Alpes-Côte d’Azur, France",
    }),
    { title: "Saint-Véran", detail: "Provence-Alpes-Côte d’Azur, France" },
  );
  // A name that adds nothing is not said a second time.
  assert.deepEqual(placeResultLines({ shortName: "Turini", name: "Turini" }), {
    title: "Turini",
    detail: "",
  });
  assert.deepEqual(placeResultLines({ name: "Col de Turini, France" }), {
    title: "Col de Turini, France",
    detail: "",
  });
  // A full name that does not start with the short one keeps all of it.
  assert.deepEqual(
    placeResultLines({
      shortName: "Lac Noir",
      name: "Camping du Lac Noir, Alpes",
    }),
    { title: "Lac Noir", detail: "Camping du Lac Noir, Alpes" },
  );
});
