import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { roundPlacesCentre as serverRoundPlacesCentre } from "portal/places/suggested.js";
import { normalizeKnownPlaceLink } from "portal/planner/state.js";
import {
  createPlacesClient,
  placesFailureOf,
  placesSearchKey,
  placesSessionKey,
} from "planner/places-client.js";
import {
  alreadyMinePlace,
  compareSky,
  defaultPlaceOf,
  formatMagnitude,
  formatMetres,
  formatPlaceDistance,
  itineraryUrl,
  normalizeSuggestedPlace,
  personalPlaceFromSuggestion,
  roundPlacesCentre,
  skyScalePosition,
  sortSuggestions,
} from "planner/places-rules.js";

// The data of suggested places on the web — the rules and the client of the
// service with the tab's memory. Synthetic places, in the open sea; no test
// reaches the network.

const suggestion = (id, name, type, latitude, longitude, sqm, extra = {}) => ({
  id: `osm:node/${id}`,
  name,
  type,
  latitude,
  longitude,
  ...extra,
  skyQuality: sqm ? { bortle: 2, sqm, estimate: true } : null,
});
const crest = suggestion(
  11,
  "Belvédère de la Crête",
  "viewpoint",
  45.1,
  -30.1,
  21.7,
  {
    website: "https://exemple.invalid/crete",
    elevation: 1720,
  },
);
const lake = suggestion(
  12,
  "Camping du Lac Noir",
  "campsite",
  45.2,
  -30.2,
  21.4,
);
const combes = suggestion(
  13,
  "Parc des Combes Sauvages",
  "park",
  45.5,
  -30.5,
  21.2,
);

/** A `sessionStorage` that remembers what was written, and where. */
const memory = () => {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
};
const answer = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const page = (...results) => ({
  results,
  truncated: false,
  attribution: {
    text: "© OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
    licence: "ODbL-1.0",
  },
  source: "osm",
  fetchedAt: "2026-10-01T20:00:00.000Z",
});

test("the centre is rounded like the service rounds it, whatever the coordinates", () => {
  for (const [latitude, longitude] of [
    [45.02, -30.026],
    [45.025, -29.975],
    [-0.02, 0.024],
    [0.025, -0.025],
    [-45.075, 179.99],
    [89.98, -179.98],
  ])
    assert.deepEqual(
      roundPlacesCentre({ latitude, longitude }),
      serverRoundPlacesCentre({ latitude, longitude }),
      `${latitude}, ${longitude}`,
    );
  assert.deepEqual(
    roundPlacesCentre({ latitude: "45.02", longitude: "-30.03" }),
    {
      latitude: 45,
      longitude: -30.05,
    },
  );
  assert.equal(roundPlacesCentre({ latitude: 95, longitude: 0 }), null);
  assert.equal(roundPlacesCentre({}), null);
});

test("a suggestion without a valid id, name, kind or position is dropped; the site is kept only if it is http(s)", () => {
  assert.equal(normalizeSuggestedPlace({ ...crest, id: "node/11" }), null);
  assert.equal(normalizeSuggestedPlace({ ...crest, name: "  " }), null);
  assert.equal(normalizeSuggestedPlace({ ...crest, type: "hotel" }), null);
  assert.equal(normalizeSuggestedPlace({ ...crest, latitude: 91 }), null);
  const kept = normalizeSuggestedPlace(crest);
  assert.equal(kept.website, "https://exemple.invalid/crete");
  assert.equal(kept.elevation, 1720);
  assert.deepEqual(kept.sky, { bortle: 2, sqm: 21.7 });
  const javascript = normalizeSuggestedPlace({
    ...crest,
    website: "javascript:alert(1)",
  });
  assert.equal("website" in javascript, false);
  assert.equal(normalizeSuggestedPlace(lake).sky.sqm, 21.4);
  assert.equal(
    normalizeSuggestedPlace({ ...lake, skyQuality: null }).sky,
    null,
  );
});

test("« déjà dans vos lieux »: the place linked to the same known place, else the nearest within 500 m", () => {
  const link = {
    source: "osm",
    id: "node/12",
    type: "campsite",
    linkedAt: "2026-10-01T20:00:00Z",
  };
  const linked = {
    id: "a",
    name: "Mon camping",
    latitude: "10",
    longitude: "10",
    knownPlace: link,
  };
  const near = {
    id: "b",
    name: "Près du lac",
    latitude: "45.2040",
    longitude: "-30.2",
  };
  const nearer = {
    id: "c",
    name: "Au bord",
    latitude: "45.2020",
    longitude: "-30.2",
  };
  const far = {
    id: "d",
    name: "Loin",
    latitude: "45.2080",
    longitude: "-30.2",
  };
  const wanted = normalizeSuggestedPlace(lake);
  // The link wins over a place that happens to be closer.
  assert.equal(alreadyMinePlace(wanted, [near, linked]).id, "a");
  // Else within 500 m (0.004° ≈ 445 m), the nearest.
  assert.equal(alreadyMinePlace(wanted, [near, nearer, far]).id, "c");
  // 0.008° ≈ 890 m: not the same place.
  assert.equal(alreadyMinePlace(wanted, [far]), null);
  assert.equal(alreadyMinePlace(wanted, []), null);
});

test("the skies compare to a tenth of a magnitude, « comparable » within ± 0.2 inclusive", () => {
  assert.deepEqual(compareSky(21.7, 20.9), { kind: "darker", delta: 0.8 });
  assert.deepEqual(compareSky(20.9, 20.9), { kind: "comparable", delta: 0 });
  assert.deepEqual(compareSky(21.1, 20.9), { kind: "comparable", delta: 0.2 });
  assert.deepEqual(compareSky(20.7, 20.9), { kind: "comparable", delta: 0.2 });
  assert.deepEqual(compareSky(21.2, 20.9), { kind: "darker", delta: 0.3 });
  assert.deepEqual(compareSky(19.0, 20.9), { kind: "brighter", delta: 1.9 });
  assert.equal(compareSky(null, 20.9), null);
  assert.equal(compareSky(21.2, NaN), null);
});

test("the two orders of the list: nearest first from the reference, darkest first with an unknown sky last, ties by name", () => {
  const places = [
    combes,
    lake,
    crest,
    { ...lake, id: "osm:node/14", name: "Aire sans ciel", skyQuality: null },
  ].map(normalizeSuggestedPlace);
  const reference = { latitude: 45, longitude: -30 };
  assert.deepEqual(
    sortSuggestions(places, "distance", reference).map((place) => place.id),
    // Same position as the camping: the tie goes by name.
    ["osm:node/11", "osm:node/14", "osm:node/12", "osm:node/13"],
  );
  assert.deepEqual(
    sortSuggestions(places, "darkest", reference).map((place) => place.name),
    [
      "Belvédère de la Crête",
      "Camping du Lac Noir",
      "Parc des Combes Sauvages",
      "Aire sans ciel",
    ],
  );
});

test("distances, magnitudes and metres are written for each language", () => {
  assert.equal(formatPlaceDistance(0.2, "fr"), "0,2 km");
  assert.equal(formatPlaceDistance(0.24, "en"), "0.2 km");
  assert.equal(formatPlaceDistance(38.4, "fr"), "38 km");
  assert.equal(formatPlaceDistance(1, "fr"), "1 km");
  assert.equal(formatMagnitude(21.7, "fr"), "21,7");
  assert.equal(formatMagnitude(21.7, "ja"), "21.7");
  assert.equal(formatMetres(1720, "fr").replace(/\s/g, " "), "1 720");
  assert.ok(Math.abs(skyScalePosition(21.7) - 0.925) < 1e-9);
  assert.equal(skyScalePosition(10), 0);
  assert.equal(skyScalePosition(30), 1);
  assert.equal(
    itineraryUrl({ latitude: 45.1, longitude: -30.1 }),
    "https://www.openstreetmap.org/directions?to=45.1,-30.1",
  );
});

test("adding a suggestion copies its name and position and a link, never its details", () => {
  const place = personalPlaceFromSuggestion(normalizeSuggestedPlace(crest), {
    linkedAt: "2026-10-01T20:00:00Z",
    id: "place-1",
  });
  assert.equal(place.name, "Belvédère de la Crête");
  assert.equal(place.latitude, "45.1");
  assert.equal(place.longitude, "-30.1");
  assert.equal(place.elevation, "1720");
  assert.equal(place.horizonStatus, "unverified");
  assert.deepEqual(place.knownPlace, {
    source: "osm",
    id: "node/11",
    type: "viewpoint",
    linkedAt: "2026-10-01T20:00:00.000Z",
  });
  assert.deepEqual(normalizeKnownPlaceLink(place.knownPlace), place.knownPlace);
  for (const detail of ["website", "openingHours", "access", "fee", "sky"])
    assert.equal(detail in place, false, detail);
  assert.equal(
    "elevation" in
      personalPlaceFromSuggestion(normalizeSuggestedPlace(lake), {
        linkedAt: 0,
        id: "x",
      }),
    false,
  );
});

test("the default place is the marked one, else the first with a position", () => {
  const places = [
    { id: "a", name: "Sans position" },
    { id: "b", name: "Premier", latitude: "1", longitude: "2" },
    { id: "c", name: "Marqué", latitude: "3", longitude: "4" },
  ];
  assert.equal(defaultPlaceOf(places, "c").id, "c");
  assert.equal(defaultPlaceOf(places, "zzz").id, "b");
  assert.equal(defaultPlaceOf(places).id, "b");
  assert.equal(defaultPlaceOf([]), null);
});

test("a search sends the rounded centre and the kinds, never the reference, and keeps its answer in the tab", async () => {
  const requests = [];
  const storage = memory();
  const client = createPlacesClient({
    storage,
    now: () => Date.parse("2026-10-01T20:05:00Z"),
    fetchImpl: async (url) => {
      requests.push(url);
      return answer(page(crest, lake, combes));
    },
  });
  const result = await client.search({
    latitude: 45.0213,
    longitude: -30.0187,
    radiusKm: 60,
    kinds: ["park", "viewpoint"],
    locale: "fr",
  });
  assert.equal(result.failure, null);
  assert.equal(result.page.places.length, 3);
  assert.equal(requests.length, 1);
  const query = new URL(requests[0], "http://127.0.0.1").searchParams;
  assert.equal(
    new URL(requests[0], "http://127.0.0.1").pathname,
    "/api/v1/places/suggested",
  );
  assert.equal(query.get("latitude"), "45.00");
  assert.equal(query.get("longitude"), "-30.00");
  assert.equal(query.get("radiusKm"), "60");
  assert.equal(query.get("types"), "viewpoint,park");
  assert.equal(query.get("locale"), "fr");
  assert.ok(
    !requests[0].includes("45.0213") && !requests[0].includes("30.0187"),
  );
  assert.deepEqual([...storage.values.keys()], [placesSessionKey]);
});

test("offline, the tab's last results are shown with why they are not fresh, narrowed to the kinds asked for", async () => {
  const storage = memory();
  let online = true;
  const client = createPlacesClient({
    storage,
    fetchImpl: async () => {
      if (!online) throw new TypeError("Failed to fetch");
      return answer(page(crest, lake, combes));
    },
  });
  const query = {
    latitude: 45.02,
    longitude: -30.02,
    radiusKm: 60,
    kinds: ["viewpoint", "campsite", "park"],
    locale: "fr",
  };
  await client.search(query);
  online = false;
  const offline = await client.search({ ...query, kinds: ["viewpoint"] });
  assert.equal(offline.failure, "offline");
  assert.deepEqual(
    offline.page.places.map((place) => place.name),
    ["Belvédère de la Crête"],
  );
  assert.equal(offline.page.fetchedAt, "2026-10-01T20:00:00.000Z");
  // A search the tab never made has nothing to show but the reason.
  const other = await client.search({ ...query, radiusKm: 100 });
  assert.deepEqual(other, { page: null, failure: "offline" });
  // A kind the kept search did not hold is not invented.
  const narrow = createPlacesClient({
    storage: memory(),
    fetchImpl: async () => {
      throw new TypeError("x");
    },
  });
  assert.equal((await narrow.search(query)).page, null);
});

test("the refusals of the service are told apart: switched off, source down, gone", async () => {
  const refuse = (status, error) =>
    createPlacesClient({
      storage: memory(),
      fetchImpl: async () => answer({ error }, status),
    });
  const query = {
    latitude: 45,
    longitude: -30,
    radiusKm: 30,
    kinds: ["viewpoint"],
    locale: "en",
  };
  assert.equal(
    (
      await refuse(503, {
        code: "places_unavailable",
        reason: "disabled",
      }).search(query)
    ).failure,
    "disabled",
  );
  assert.equal(
    (
      await refuse(503, {
        code: "places_unavailable",
        reason: "source",
      }).search(query)
    ).failure,
    "source",
  );
  assert.equal(
    (await refuse(429, { code: "rate_limited" }).search(query)).failure,
    "source",
  );
  assert.equal(
    (
      await refuse(404, { code: "known_place_gone" }).known("node/11", {
        locale: "en",
      })
    ).failure,
    "gone",
  );
  assert.equal(placesFailureOf({ status: null }), "offline");
  assert.equal(placesFailureOf({ status: 404 }), "gone");
});

test("the details of a known place are read when shown and kept nowhere", async () => {
  const storage = memory();
  const requests = [];
  const client = createPlacesClient({
    storage,
    fetchImpl: async (url) => {
      requests.push(url);
      return answer({
        place: crest,
        attribution: page().attribution,
        source: "osm",
        fetchedAt: "2026-10-01T21:00:00.000Z",
      });
    },
  });
  const result = await client.known("node/11", { locale: "fr" });
  assert.equal(result.failure, null);
  assert.equal(result.place.website, "https://exemple.invalid/crete");
  assert.equal(result.fetchedAt, "2026-10-01T21:00:00.000Z");
  const query = new URL(requests[0], "http://127.0.0.1");
  assert.equal(query.pathname, "/api/v1/places/known");
  assert.equal(query.searchParams.get("id"), "node/11");
  assert.equal(query.searchParams.get("source"), "osm");
  await client.known("node/11", { locale: "fr" });
  assert.equal(requests.length, 2, "read again each time");
  assert.equal(storage.values.size, 0, "no memory of a detail");
});

test("the device cache persists locally without cookies or IndexedDB and has bounded retention", async () => {
  const source = await readFile(
    new URL("../src/places-client.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /localStorage/);
  assert.doesNotMatch(source, /indexedDB|document\.cookie|caches\./);
  assert.equal(
    placesSearchKey({
      latitude: 45.0213,
      longitude: -30.0187,
      radiusKm: 60,
      locale: "fr",
    }),
    "45.00,-30.00|60|fr",
  );
});

test("device results survive a new client, preserve locale/categories and expire after 30 days", async () => {
  const storage = memory();
  let time = Date.parse("2026-10-03T20:00:00Z");
  const query = {
    latitude: 45,
    longitude: -30,
    radiusKm: 60,
    kinds: ["viewpoint", "park"],
    locale: "fr",
  };
  await createPlacesClient({
    storage,
    now: () => time,
    fetchImpl: async () => answer(page(crest, combes)),
  }).search(query);
  const restarted = createPlacesClient({
    storage,
    now: () => time,
    fetchImpl: async () => {
      throw new TypeError("offline");
    },
  });
  assert.equal((await restarted.search(query)).page.places.length, 2);
  assert.equal((await restarted.search({ ...query, locale: "ja" })).page, null);
  assert.equal(
    (await restarted.search({ ...query, kinds: ["campsite"] })).page,
    null,
  );
  time += 30 * 24 * 60 * 60 * 1000 + 1;
  assert.equal((await restarted.search(query)).page, null);
  assert.equal(JSON.parse(storage.getItem(placesSessionKey)).length, 0);
});
