import assert from "node:assert/strict";
import test from "node:test";

import {
  overpassAroundQuery,
  overpassElementQuery,
  parseOsmReference,
  placeFromOverpassElement,
  defaultPlacesUrl,
  fallbackPlacesUrl,
  placesSourceSettings,
  placesTimeoutSeconds,
  queryOverpass,
} from "portal/places/overpass.js";
import {
  createPlacesService,
  placesCacheMs,
  roundPlacesCentre,
} from "portal/places/suggested.js";
import { createPlannerSkyQualityCache } from "portal/planner/sky-quality.server.js";
import { encodeSkyQualityRadiance } from "portal/sky-quality.js";

// The suggested places. Every source answer here is synthetic — invented
// names, ids and positions in the open Atlantic — and served by a stub
// `request`; no test reaches the network.

const node = (id, name, tags = {}, lat = 45.02, lon = -30.04) => ({
  type: "node",
  id,
  lat,
  lon,
  tags: { name, tourism: "viewpoint", ...tags },
});

function stubSource(program = () => ({ elements: [] })) {
  const calls = [];
  const request = async (url, init) => {
    const query = new URLSearchParams(init.body).get("data");
    calls.push({ url: String(url), init, query });
    const answer = await program(query, calls.length);
    if (answer instanceof Error) throw answer;
    if (answer?.status && answer.status !== 200)
      return new Response("busy", { status: answer.status });
    if (typeof answer === "string") return new Response(answer);
    return Response.json(answer);
  };
  return { calls, request };
}

const noDarkness = async () => {
  throw Object.assign(new Error("No raster."), { code: "provider" });
};

function service({ program, env = {}, skyQuality = noDarkness, now } = {}) {
  const source = stubSource(program);
  return {
    source,
    places: createPlacesService({
      request: source.request,
      intervalMs: 0,
      skyQuality,
      env: { ASTRO_PORTAL_PLACES: "overpass", ...env },
      ...(now ? { now } : {}),
    }),
  };
}

const search = { latitude: 45.0, longitude: -30.0, radiusKm: 60 };

test("the query asks, per type, for named features only, nodes with positions and the rest by centre", () => {
  const query = (types) =>
    overpassAroundQuery({ latitude: 45, longitude: -30, radiusKm: 30, types });
  const viewpoints = query(["viewpoint"]);
  assert.match(
    viewpoints,
    /nwr\["tourism"="viewpoint"\]\["name"\]\(around:30000,45\.00,-30\.00\);/,
  );
  assert.doesNotMatch(viewpoints, /camp_site|picnic_site|national_park/);
  assert.match(viewpoints, /^\[out:json\]\[timeout:30\];/);
  assert.match(viewpoints, /node\.found;\nout body;/);
  assert.match(
    viewpoints,
    /\(way\.found; relation\.found;\);\nout tags center;/,
  );
  assert.match(query(["campsite"]), /\["tourism"="camp_site"\]\["name"\]/);
  assert.match(query(["picnic"]), /\["tourism"="picnic_site"\]\["name"\]/);
  const parks = query(["park"]);
  assert.match(parks, /\["boundary"="national_park"\]\["name"\]/);
  assert.match(parks, /\["leisure"="nature_reserve"\]\["name"\]/);
  // Never an urban park.
  assert.doesNotMatch(parks, /"leisure"="park"/);
});

test("the centre is rounded to 0.05° before the query, and never sent as given", async () => {
  assert.deepEqual(
    roundPlacesCentre({ latitude: 45.123, longitude: -30.037 }),
    {
      latitude: 45.1,
      longitude: -30.05,
    },
  );
  assert.deepEqual(roundPlacesCentre({ latitude: -0.01, longitude: 179.99 }), {
    latitude: 0,
    longitude: 180,
  });
  assert.equal(roundPlacesCentre({ latitude: 95, longitude: 0 }), null);
  const { source, places } = service();
  await places.suggest({ ...search, latitude: 45.123, longitude: -30.037 });
  assert.equal(source.calls.length, 1);
  assert.match(source.calls[0].query, /\(around:60000,45\.10,-30\.05\)/);
  assert.doesNotMatch(source.calls[0].query, /45\.123|30\.037/);
});

test("the radius is one of 10, 30, 60 or 100 km; anything else is refused before the source is asked", async () => {
  const { source, places } = service();
  for (const radiusKm of [10, 30, 60, 100])
    await places.suggest({ ...search, radiusKm });
  assert.equal(source.calls.length, 4);
  for (const radiusKm of [0, 20, 150, "abc", undefined, -10])
    await assert.rejects(
      places.suggest({ ...search, radiusKm }),
      (error) => error.code === "invalid",
      String(radiusKm),
    );
  await assert.rejects(
    places.suggest({ ...search, types: "viewpoint,parking" }),
    (error) => error.code === "invalid",
  );
  await assert.rejects(
    places.suggest({ ...search, latitude: 91 }),
    (error) => error.code === "invalid",
  );
  assert.equal(source.calls.length, 4);
});

test("unnamed features and features of no supported type are dropped", async () => {
  const { places } = service({
    program: () => ({
      elements: [
        node(1, "Belvédère de la Crête"),
        {
          type: "node",
          id: 2,
          lat: 45,
          lon: -30,
          tags: { tourism: "viewpoint" },
        },
        node(3, "   "),
        node(4, "Parking des Sapins", {
          tourism: undefined,
          amenity: "parking",
        }),
        { type: "node", id: 5, lat: 45, lon: -30, tags: { name: "Sans tags" } },
      ],
    }),
  });
  const { results } = await places.suggest(search);
  assert.deepEqual(
    results.map((place) => place.id),
    ["osm:node/1"],
  );
});

test("ways and relations are placed at their centre; one without a centre is dropped", async () => {
  const { places } = service({
    program: () => ({
      elements: [
        {
          type: "way",
          id: 21,
          center: { lat: 45.1234567, lon: -30.7654321 },
          tags: { name: "Camping des Hauts Prés", tourism: "camp_site" },
        },
        {
          type: "relation",
          id: 31,
          center: { lat: 44.9, lon: -29.8 },
          tags: { name: "Parc des Combes Sauvages", boundary: "national_park" },
        },
        {
          type: "way",
          id: 22,
          tags: { name: "Aire sans centre", tourism: "picnic_site" },
        },
      ],
    }),
  });
  const { results } = await places.suggest(search);
  assert.deepEqual(
    results.map(({ id, type, latitude, longitude }) => ({
      id,
      type,
      latitude,
      longitude,
    })),
    // Equal skies (here none is known): the nearer to the search centre first.
    [
      {
        id: "osm:relation/31",
        type: "park",
        latitude: 44.9,
        longitude: -29.8,
      },
      {
        id: "osm:way/21",
        type: "campsite",
        latitude: 45.123457,
        longitude: -30.765432,
      },
    ],
  );
  // No distance: the service does not know where the observer is.
  for (const place of results) assert.equal("distanceKm" in place, false);
});

test("darkness comes from the installed raster, as an estimate, through the GET /v1/sky-quality function", async () => {
  const width = 360;
  const height = 180;
  const data = Buffer.alloc(width * height);
  // A lit patch around 45° N, 30° W; the natural sky elsewhere.
  for (let row = 43; row <= 46; row += 1)
    for (let column = 148; column <= 151; column += 1)
      data[row * width + column] = encodeSkyQualityRadiance(40);
  const grid = {
    cellSizeDegrees: 1,
    data,
    height,
    north: 90,
    west: -180,
    width,
  };
  const skyQuality = createPlannerSkyQualityCache({
    raster: async () => ({ grid, year: 2025, checksum: "sha256:test" }),
  });
  const { places } = service({
    skyQuality,
    program: () => ({
      elements: [
        node(1, "Rocher des Trois Chouettes", {}, 45.02, -30.04),
        node(2, "Belvédère de la Crête", {}, -40, -120),
      ],
    }),
  });
  const { results } = await places.suggest(search);
  const byId = Object.fromEntries(results.map((place) => [place.id, place]));
  const dark = byId["osm:node/2"].skyQuality;
  const lit = byId["osm:node/1"].skyQuality;
  assert.deepEqual(dark, { bortle: 1, sqm: 22, estimate: true });
  assert.equal(lit.estimate, true);
  assert.ok(lit.sqm < dark.sqm);
  assert.ok(lit.bortle > dark.bortle);
  // Darkest first.
  assert.deepEqual(
    results.map((place) => place.id),
    ["osm:node/2", "osm:node/1"],
  );
});

test("without an installed raster, darkness is null and the places are still suggested", async () => {
  const skyQuality = createPlannerSkyQualityCache({ raster: async () => null });
  const { places } = service({
    skyQuality,
    program: () => ({ elements: [node(1, "Belvédère de la Crête")] }),
  });
  const { results } = await places.suggest(search);
  assert.equal(results.length, 1);
  assert.equal(results[0].skyQuality, null);
});

test("a search already answered is served from memory for 30 minutes, in any language", async () => {
  let clock = 1_800_000_000_000;
  const { source, places } = service({
    now: () => clock,
    program: () => ({
      elements: [
        node(1, "Belvédère de la Crête", { "name:ja": "稜線の展望台" }),
      ],
    }),
  });
  const first = await places.suggest({ ...search, locale: "fr" });
  // Another position in the same rounded cell, another language.
  const second = await places.suggest({
    ...search,
    latitude: 45.01,
    longitude: -30.02,
    locale: "ja",
  });
  assert.equal(source.calls.length, 1);
  assert.equal(first.results[0].name, "Belvédère de la Crête");
  assert.equal(second.results[0].name, "稜線の展望台");
  assert.equal(second.fetchedAt, first.fetchedAt);
  assert.equal(first.fetchedAt, new Date(1_800_000_000_000).toISOString());
  clock += placesCacheMs + 1;
  await places.suggest(search);
  assert.equal(source.calls.length, 2);
});

test("switched off, the service never asks the source", async () => {
  assert.equal(
    placesSourceSettings({ ASTRO_PORTAL_PLACES: "off" }).enabled,
    false,
  );
  assert.equal(placesSourceSettings({}).enabled, true);
  assert.equal(
    placesSourceSettings({}).url,
    "https://overpass-api.de/api/interpreter",
  );
  const { source, places } = service({ env: { ASTRO_PORTAL_PLACES: "off" } });
  await assert.rejects(
    places.suggest(search),
    (error) => error.code === "disabled",
  );
  await assert.rejects(
    places.known({ id: "node/1" }),
    (error) => error.code === "disabled",
  );
  assert.equal(source.calls.length, 0);
});

test("a source that refuses, fails or answers garbage is a `source` failure, never cached", async () => {
  for (const answer of [
    { status: 429 },
    { status: 504 },
    new TypeError("fetch failed"),
    "<html>busy</html>",
    { remark: "no elements" },
  ]) {
    // A configured mirror, so the fallback of the default one stays out.
    const { source, places } = service({
      program: () => answer,
      env: { ASTRO_PORTAL_PLACES_URL: "http://places.invalid/interpreter" },
    });
    await assert.rejects(
      places.suggest(search),
      (error) => error.code === "source",
      JSON.stringify(answer),
    );
    await assert.rejects(
      places.suggest(search),
      (error) => error.code === "source",
    );
    assert.equal(source.calls.length, 2);
  }
});

test("one attempt waits 30 s, in the request and in the query", async () => {
  assert.equal(placesTimeoutSeconds, 30);
  const { calls, request } = stubSource();
  await queryOverpass("[out:json];", { request });
  const [call] = calls;
  // The abort signal is the timeout of the attempt; no clock is waited on.
  assert.equal(call.init.signal.aborted, false);
  assert.equal(call.url, defaultPlacesUrl);
});

test("a failure of the default instance is retried once on the fallback mirror", async () => {
  for (const failure of [
    new DOMException("timed out", "TimeoutError"),
    new TypeError("fetch failed"),
    { status: 504 },
    "<html>busy</html>",
  ]) {
    const { calls, request } = stubSource((_query, count) =>
      count === 1 ? failure : { elements: [node(1, "Point")] },
    );
    const elements = await queryOverpass("[out:json];", { request });
    assert.equal(elements.length, 1);
    assert.deepEqual(
      calls.map((call) => call.url),
      [defaultPlacesUrl, fallbackPlacesUrl],
    );
    assert.equal(calls[1].query, calls[0].query);
  }
  // Through the service, and the cache keeps the answer: one search, two calls.
  const { source, places } = service({
    program: (_query, count) =>
      count === 1 ? { status: 503 } : { elements: [node(2, "Crête")] },
  });
  assert.equal((await places.suggest(search)).results.length, 1);
  assert.equal((await places.suggest(search)).results.length, 1);
  assert.equal(source.calls.length, 2);
});

test("only one retry: when the fallback fails too, the search is a `source` failure", async () => {
  const { calls, request } = stubSource(() => ({ status: 503 }));
  await assert.rejects(
    queryOverpass("[out:json];", { request }),
    (error) => error.code === "source" && error.status === 503,
  );
  assert.equal(calls.length, 2);
});

test("no fallback after a 4xx answer, nor for an instance chosen with ASTRO_PORTAL_PLACES_URL", async () => {
  for (const status of [400, 429]) {
    const { calls, request } = stubSource(() => ({ status }));
    await assert.rejects(
      queryOverpass("[out:json];", { request }),
      (error) => error.code === "source" && error.status === status,
    );
    assert.equal(calls.length, 1, `${status}`);
  }
  const { source, places } = service({
    program: () => ({ status: 504 }),
    env: { ASTRO_PORTAL_PLACES_URL: "http://places.invalid/api/interpreter" },
  });
  await assert.rejects(
    places.suggest(search),
    (error) => error.code === "source",
  );
  assert.deepEqual(
    source.calls.map((call) => call.url),
    ["http://places.invalid/api/interpreter"],
  );
});

test("at most 50 results, the darkest kept, and `truncated` says so", async () => {
  const elements = Array.from({ length: 60 }, (_, index) =>
    node(
      index + 1,
      `Point ${String(index + 1).padStart(2, "0")}`,
      {},
      45,
      -30 + index / 100,
    ),
  );
  const skyQuality = async ({ longitude }) => ({
    bortleClass: 3,
    sqm: Number((21 + (longitude + 30)).toFixed(2)),
  });
  const { places } = service({ skyQuality, program: () => ({ elements }) });
  const answer = await places.suggest(search);
  assert.equal(answer.results.length, 50);
  assert.equal(answer.truncated, true);
  assert.equal(answer.results[0].name, "Point 60");
  assert.equal(answer.results.at(-1).name, "Point 11");
  const few = service({ program: () => ({ elements: elements.slice(0, 3) }) });
  assert.equal((await few.places.suggest(search)).truncated, false);
});

test("the request carries the service's own User-Agent, no personal data, to the configured URL", async () => {
  const { source, places } = service({
    env: { ASTRO_PORTAL_PLACES_URL: "http://places.invalid/api/interpreter" },
  });
  const answer = await places.suggest({ ...search, types: "campsite" });
  const [call] = source.calls;
  assert.equal(call.url, "http://places.invalid/api/interpreter");
  assert.equal(call.init.method, "POST");
  assert.equal(
    call.init.headers["User-Agent"],
    "Astro-Portal/1.0 (+https://github.com/sqound/astro-portal)",
  );
  assert.deepEqual(Object.keys(call.init.headers).sort(), [
    "User-Agent",
    "accept",
    "content-type",
  ]);
  assert.ok(call.init.signal instanceof AbortSignal);
  assert.deepEqual(answer.attribution, {
    text: "© OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
    licence: "ODbL-1.0",
  });
  assert.equal(answer.source, "osm");
});

test("the details a feature carries are passed on; a website only when it is an http(s) address", () => {
  const place = placeFromOverpassElement(
    node(7, "Belvédère de la Crête", {
      website: "https://belvedere.invalid/",
      opening_hours: "24/7",
      access: "yes",
      fee: "no",
      ele: "1720 m",
    }),
    "fr",
  );
  assert.deepEqual(place, {
    id: "osm:node/7",
    name: "Belvédère de la Crête",
    type: "viewpoint",
    latitude: 45.02,
    longitude: -30.04,
    website: "https://belvedere.invalid/",
    openingHours: "24/7",
    access: "yes",
    fee: "no",
    elevation: 1720,
  });
  // The source's own `description`, kept as written (whitespace
  // folded, never translated) and absent when the feature has none.
  const described = placeFromOverpassElement(
    node(9, "Camping des Hauts Prés", {
      description: "  Terrain en lisière\n de forêt.  ",
    }),
    "ja",
  );
  assert.equal(described.description, "Terrain en lisière de forêt.");
  assert.equal("description" in place, false);
  assert.equal(
    placeFromOverpassElement(node(10, "Long", { description: "x".repeat(700) }))
      .description.length,
    500,
  );
  const unsafe = placeFromOverpassElement(
    node(8, "Pas de l’Ours", { website: "javascript:alert(1)", ele: "haut" }),
  );
  assert.equal("website" in unsafe, false);
  assert.equal("elevation" in unsafe, false);
});

test("a known place is read again by its id; one the source no longer has is gone", async () => {
  assert.deepEqual(parseOsmReference("osm:way/42"), {
    elementType: "way",
    number: "42",
  });
  assert.equal(parseOsmReference("node/0"), null);
  assert.equal(parseOsmReference("area/1"), null);
  assert.match(
    overpassElementQuery("relation/9"),
    /relation\(9\);\nout tags center;/,
  );
  const { source, places } = service({
    program: (query) =>
      query.includes("node(7)")
        ? {
            elements: [
              node(7, "Belvédère de la Crête", {
                website: "https://belvedere.invalid/",
              }),
            ],
          }
        : { elements: [] },
  });
  const found = await places.known({ id: "node/7", locale: "fr" });
  assert.equal(found.place.id, "osm:node/7");
  assert.equal(found.place.website, "https://belvedere.invalid/");
  assert.equal(found.place.skyQuality, null);
  assert.equal(found.source, "osm");
  assert.equal(await places.known({ id: "node/8" }), null);
  await assert.rejects(
    places.known({ id: "node/abc" }),
    (error) => error.code === "invalid",
  );
  assert.equal(source.calls.length, 2);
});
