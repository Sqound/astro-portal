import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertInvalid,
  assertValid,
  registerExternalSchema,
  schemaErrors,
} from "./schema-assert.mjs";
import { shippedLocales } from "../dist/locales.js";

const schemasDirectory = new URL("../schemas/", import.meta.url);
const schema = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, schemasDirectory), "utf8"));

registerExternalSchema(
  "capabilities.schema.json",
  await schema("api/capabilities.schema.json"),
);

test("planner-document.schema.json accepts a consistent v2 document", async () => {
  const document = await schema("planner/planner-document.schema.json");
  assertValid(document, {
    schemaVersion: 2,
    date: "2024-06-01",
    activeNightId: "night-1",
    activePlanId: "plan-1",
    nights: [{ id: "night-1", date: "2024-06-01", location: null }],
    knownLocations: [{ latitude: 45.5, longitude: -73.6, name: "Home" }],
    plans: [
      {
        id: "plan-1",
        date: "2024-06-01",
        nightId: "night-1",
        name: "Tonight",
        status: "pending",
        items: [{ id: "item-1" }],
      },
    ],
  });
});

test("planner-document.schema.json accepts a place linked to a known place, never with the known place's details", async () => {
  const document = await schema("planner/planner-document.schema.json");
  const link = {
    source: "osm",
    id: "node/101",
    type: "viewpoint",
    linkedAt: "2026-10-01T20:15:00.000Z",
  };
  const withPlace = (knownPlace) => ({
    schemaVersion: 2,
    date: "2026-10-03",
    nights: [],
    knownLocations: [
      { latitude: 45.02, longitude: -30.04, name: "Belvédère", knownPlace },
    ],
    plans: [],
  });
  assertValid(document, withPlace(link));
  assertInvalid(
    document,
    withPlace({ ...link, website: "https://x.invalid/" }),
  );
  assertInvalid(document, withPlace({ ...link, id: "osm:node/101" }));
  assertInvalid(document, withPlace({ ...link, source: "wikidata" }));
  assertInvalid(document, withPlace({ ...link, type: "parking" }));
});

test("planner-document.schema.json accepts a place with the sky background its observer typed, inside its range", async () => {
  const document = await schema("planner/planner-document.schema.json");
  const typed = { sqm: 21.35, enteredAt: "2026-10-01T20:15:00.000Z" };
  const withPlace = (skyEntered) => ({
    schemaVersion: 2,
    date: "2026-10-03",
    nights: [],
    knownLocations: [
      { latitude: 45.02, longitude: -30.04, name: "Col", skyEntered },
    ],
    plans: [],
  });
  assertValid(document, withPlace(typed));
  assertInvalid(document, withPlace({ ...typed, sqm: 22.6 }));
  assertInvalid(document, withPlace({ ...typed, sqm: "21.35" }));
  assertInvalid(document, withPlace({ sqm: 21.35 }));
  assertInvalid(document, withPlace({ ...typed, meter: "SQM-L" }));
});

test("plan.schema.json accepts a plan place with a typed sky background, never out of range", async () => {
  const plan = await schema("api/plan.schema.json");
  const payload = (skyEntered) => ({
    payload: {
      id: "browser-1",
      date: "2026-10-14",
      name: "Nuit d’octobre au lac",
      items: [],
      location: {
        name: "Col des Mélèzes",
        latitude: 45.02,
        longitude: -30.04,
        skyEntered,
      },
    },
  });
  assertValid(plan, payload({ sqm: 20.5, enteredAt: "2026-10-01T20:15:00Z" }));
  assertInvalid(plan, payload({ sqm: 13, enteredAt: "2026-10-01T20:15:00Z" }));
  assertInvalid(plan, payload({ sqm: 20.5 }));
});

test("planner-document.schema.json rejects a plan without an items array", async () => {
  const document = await schema("planner/planner-document.schema.json");
  assertInvalid(document, {
    plans: [{ id: "plan-1", date: "2024-06-01", name: "Tonight" }],
  });
});

// A plan's darkness and nightSpan, both optional.
const nightPlan = (extra) => ({
  plans: [{ id: "plan-1", date: "2026-10-14", items: [], ...extra }],
});

test("planner-document.schema.json accepts a plan's darkness and nightSpan", async () => {
  const document = await schema("planner/planner-document.schema.json");
  for (const darkness of ["astronomical", "nautical", "civil"])
    assertValid(document, nightPlan({ darkness }));
  assertValid(document, nightPlan({ nightSpan: { mode: "astronomical" } }));
  assertValid(
    document,
    nightPlan({
      darkness: "civil",
      nightSpan: {
        mode: "custom",
        start: "2026-10-14T20:30:00.000Z",
        end: "2026-10-15T02:20:00.000Z",
      },
    }),
  );
});

test("planner-document.schema.json rejects an unknown darkness or span", async () => {
  const document = await schema("planner/planner-document.schema.json");
  assertInvalid(document, nightPlan({ darkness: "twilight" }));
  assertInvalid(document, nightPlan({ nightSpan: { mode: "custom" } }));
  assertInvalid(
    document,
    nightPlan({ nightSpan: { mode: "astronomical", start: "x" } }),
  );
});

// The horizon map's mode and the target of its path, both optional in a
// plan's view (absent = positions).
const horizonView = (horizon) =>
  nightPlan({ view: { skyMap: "projection", horizon } });

test("planner-document.schema.json accepts the horizon map's path mode", async () => {
  const document = await schema("planner/planner-document.schema.json");
  assertValid(document, horizonView({ mode: "path", pathTargetId: "m31" }));
  assertValid(document, horizonView({ mode: "path", pathTargetId: null }));
  assertValid(document, horizonView({ mode: "positions" }));
});

test("planner-document.schema.json reads an absent horizon mode as valid", async () => {
  const document = await schema("planner/planner-document.schema.json");
  assertValid(
    document,
    horizonView({ projection: "linear", rotation: 0, showLabels: true }),
  );
  assertValid(document, nightPlan({ view: { skyMap: "projection" } }));
});

test("planner-document.schema.json rejects an unknown horizon mode or target", async () => {
  const document = await schema("planner/planner-document.schema.json");
  assertInvalid(document, horizonView({ mode: "trail" }));
  assertInvalid(document, horizonView({ mode: "path", pathTargetId: 42 }));
  assertInvalid(document, horizonView({ mode: null }));
});

test("plan.schema.json accepts the night properties in a v1 payload", async () => {
  const plan = await schema("api/plan.schema.json");
  const payload = {
    id: "browser-1",
    date: "2026-10-14",
    name: "Nuit d’octobre au lac",
    items: [],
    darkness: "nautical",
    nightSpan: {
      mode: "custom",
      start: "2026-10-14T20:30:00.000Z",
      end: "2026-10-15T02:20:00.000Z",
    },
  };
  assertValid(plan, { payload });
  assertInvalid(plan, { payload: { ...payload, darkness: "dusk" } });
});

test("plan.schema.json carries the status a device recorded on a finished night, and nothing else", async () => {
  const plan = await schema("api/plan.schema.json");
  const payload = {
    id: "browser-1",
    date: "2026-10-14",
    name: "Nuit d’octobre au lac",
    items: [],
  };
  for (const closedAs of ["executed", "partial", "abandoned", "archived"])
    assertValid(plan, { payload: { ...payload, closedAs } });
  assertValid(plan, { payload });
  assertInvalid(plan, { payload: { ...payload, closedAs: "active" } });
  assertInvalid(plan, { payload: { ...payload, closedAs: "pending" } });
  assertInvalid(plan, { payload: { ...payload, closedAs: null } });
  // The resource keeps `active` while the plan is not debriefed: the status
  // of the resource and the closure of the payload are two different things.
  assertValid(plan, {
    id: "9f1c1a52-0f5b-4a6a-8f3a-2d3a3c7d9c11",
    revision: 4,
    status: "active",
    updatedAt: "2026-10-14T23:41:00.000Z",
    payload: { ...payload, closedAs: "executed" },
  });
});

// The horizon map's layers.
test("planner-document.schema.json accepts the horizon map's layers, or none", async () => {
  const document = await schema("planner/planner-document.schema.json");
  assertValid(
    document,
    horizonView({ layers: { mask: true, lightPollution: true } }),
  );
  assertValid(document, horizonView({ layers: { mask: false } }));
  assertValid(document, horizonView({ mode: "positions" }));
  assertInvalid(document, horizonView({ layers: { lightPollution: "on" } }));
  assertInvalid(document, horizonView({ layers: true }));
});

const fineMask = (altitude = 0) => ({
  enabled: true,
  points: Array.from({ length: 36 }, (_, index) => ({
    azimuth: index * 10,
    altitude,
  })),
});

test("horizon-mask.schema.json accepts a 36-point mask, one point every 10°", async () => {
  const horizonMask = await schema("planner/horizon-mask.schema.json");
  assertValid(horizonMask, fineMask());
  assertValid(horizonMask, fineMask(90));
});

test("horizon-mask.schema.json rejects the former 12-point mask as a written form", async () => {
  const horizonMask = await schema("planner/horizon-mask.schema.json");
  assertInvalid(horizonMask, {
    enabled: true,
    points: Array.from({ length: 12 }, (_, index) => ({
      azimuth: index * 30,
      altitude: 0,
    })),
  });
  assertInvalid(horizonMask, {
    enabled: true,
    points: fineMask().points.slice(1),
  });
});

test("horizon-mask.schema.json rejects an azimuth off the 10° grid or past 350°", async () => {
  const horizonMask = await schema("planner/horizon-mask.schema.json");
  const offGrid = fineMask();
  offGrid.points[3] = { azimuth: 35, altitude: 0 };
  assertInvalid(horizonMask, offGrid);
  const pastNorth = fineMask();
  pastNorth.points[0] = { azimuth: 360, altitude: 0 };
  assertInvalid(horizonMask, pastNorth);
  const tooHigh = fineMask();
  tooHigh.points[5] = { azimuth: 50, altitude: 91 };
  assertInvalid(horizonMask, tooHigh);
});

test("planner-document.schema.json holds a place's mask to the same 36 points", async () => {
  const document = await schema("planner/planner-document.schema.json");
  const place = (horizonMask) => ({
    schemaVersion: 2,
    plans: [],
    knownLocations: [{ latitude: 45, longitude: -30, horizonMask }],
  });
  assertValid(document, place(fineMask(12)));
  assertValid(document, place(null));
  assertInvalid(document, place({ enabled: true, points: [] }));
});

test("framing.schema.json accepts a fully saved framing", async () => {
  const framing = await schema("planner/framing.schema.json");
  assertValid(framing, {
    center: { ra: 10.6847083, dec: 41.26875 },
    field: { width: 1.2, height: 0.8 },
    equipment: { telescopeId: "askar-50p" },
    objects: ["M31"],
    matchedTargets: [{ id: "m31" }],
    previewImageUrl: "https://example.invalid/preview.jpg",
    savedAt: "2024-06-01T20:00:00.000Z",
  });
});

test("framing.schema.json rejects a framing missing savedAt", async () => {
  const framing = await schema("planner/framing.schema.json");
  assertInvalid(framing, {
    center: { ra: 10.6847083, dec: 41.26875 },
    field: { width: 1.2, height: 0.8 },
    objects: ["M31"],
    matchedTargets: [],
  });
});

test("api/framing.schema.json: a framing's angle is a position angle in [0, 360)", async () => {
  const framingApi = await schema("api/framing.schema.json");
  const payloadSchema = {
    ...framingApi.$defs.payload,
    $defs: framingApi.$defs,
  };
  const payload = (angleDegrees) => ({
    target: { framing: { angleDegrees } },
    catalogueTargetId: null,
    angleDegrees,
  });
  for (const angle of [0, 30, 270, 359.99])
    assertValid(payloadSchema, payload(angle));
  for (const angle of [360, -1, 720, "30", null])
    assertInvalid(payloadSchema, payload(angle));
});

test("plan-archive.schema.json accepts the version-1 envelope", async () => {
  const archive = await schema("export/plan-archive.schema.json");
  assertValid(archive, {
    format: "astro-portal-observation-plan",
    version: 1,
    exportedAt: "2024-06-01T20:00:00.000Z",
    plan: { id: "plan-1", date: "2024-06-01", name: "Tonight", items: [] },
  });
});

test("plan-archive.schema.json rejects an envelope claiming a later version", async () => {
  const archive = await schema("export/plan-archive.schema.json");
  assertInvalid(archive, {
    format: "astro-portal-observation-plan",
    version: 2,
    exportedAt: "2024-06-01T20:00:00.000Z",
    plan: { id: "plan-1", date: "2024-06-01", name: "Tonight", items: [] },
  });
});

test("target-library-query.schema.json accepts a query and a paginated result", async () => {
  const targetLibrary = await schema("api/target-library-query.schema.json");
  assertValid(targetLibrary, {
    locale: "en",
    selection: "best",
    hemisphere: "north",
    offset: 0,
    limit: 48,
  });
  assertValid(targetLibrary, {
    total: 0,
    offset: 0,
    limit: 48,
    targets: [],
    counts: { total: 0, best: 0, extended: 0 },
  });
});

test("target-library-query.schema.json accepts a knowledge text flagged as an English fallback", async () => {
  const targetLibrary = await schema("api/target-library-query.schema.json");
  const result = (target) => ({
    total: 1,
    offset: 0,
    limit: 48,
    targets: [target],
    counts: { total: 1, best: 0, extended: 1 },
  });
  // A locale without a curated text: the English text, said.
  assertValid(
    targetLibrary,
    result({
      id: "ngc-7000",
      story: "An emission nebula.",
      storyFallbackLocale: "en",
    }),
  );
  // A text in the requested locale carries no flag (the field is optional).
  assertValid(
    targetLibrary,
    result({ id: "ngc-7000", story: "Une nébuleuse." }),
  );
  assertInvalid(
    targetLibrary,
    result({ id: "ngc-7000", storyFallbackLocale: "English" }),
  );
});

test("target-library-query.schema.json accepts a target's distance, or none, and refuses an unknown layer", async () => {
  const targetLibrary = await schema("api/target-library-query.schema.json");
  const target = (distance) => ({ id: "m31", distance });
  const published = {
    lightYears: 2500000,
    source: "published",
    reference: "Author et al. 2016, AJ 1, 1 · 2016AJ.......1A",
  };
  assertValid(targetLibrary, target(published));
  assertValid(targetLibrary, target(null));
  assertValid(targetLibrary, { id: "m31" });
  assertInvalid(targetLibrary, target({ ...published, source: "wikidata" }));
  assertInvalid(targetLibrary, target({ ...published, lightYears: 0 }));
  assertInvalid(targetLibrary, target({ lightYears: 100, source: "parallax" }));
});

test("target-library-query.schema.json accepts the optional spoken texts beside the written one", async () => {
  const targetLibrary = await schema("api/target-library-query.schema.json");
  const result = (target) => ({
    total: 1,
    offset: 0,
    limit: 48,
    targets: [target],
    counts: { total: 1, best: 0, extended: 1 },
  });
  // Both spoken texts, beside the written story.
  assertValid(
    targetLibrary,
    result({
      id: "m31",
      story: "M31 est une galaxie dans Andromède.",
      spokenParagraphs: ["Messier 31 est une galaxie."],
      childrenSpokenParagraphs: ["Messier 31 est une galaxie."],
    }),
  );
  // Optional: a knowledge without them is valid (the written text is read).
  assertValid(targetLibrary, result({ id: "m31", story: "Une galaxie." }));
  assertInvalid(
    targetLibrary,
    result({ id: "m31", spokenParagraphs: "Messier 31 est une galaxie." }),
  );
  assertInvalid(
    targetLibrary,
    result({ id: "m31", childrenSpokenParagraphs: [""] }),
  );
});

test("target-library-query.schema.json rejects an unknown hemisphere", async () => {
  const targetLibrary = await schema("api/target-library-query.schema.json");
  assertInvalid(targetLibrary, { hemisphere: "east" });
});

test("target-library-query.schema.json accepts the planner ordering", async () => {
  const targetLibrary = await schema("api/target-library-query.schema.json");
  assertValid(targetLibrary, {
    locale: "en",
    selection: "extended",
    sort: "planner",
    latitude: 48,
    minimumAltitude: 30,
    limit: 48,
  });
  assertValid(targetLibrary, {
    total: 0,
    offset: 0,
    limit: 48,
    sort: "planner",
    targets: [],
    counts: { total: 0, best: 0, extended: 0 },
  });
});

test("target-library-query.schema.json accepts the faceted counts and their additive companions", async () => {
  const targetLibrary = await schema("api/target-library-query.schema.json");
  // A portal predating the facet fix: `counts` alone, no `total` on the
  // options. Still valid — the new fields are additive.
  assertValid(targetLibrary, {
    total: 4,
    offset: 0,
    limit: 48,
    targets: [],
    counts: { total: 126, best: 4, extended: 6 },
    catalogueOptions: [
      { id: "Messier", name: "Messier", description: "…", count: 1 },
    ],
    typeOptions: [{ id: "Galaxie", name: "Galaxy", count: 1 }],
  });
  // The corrected portal: `countsUnfiltered` alongside `counts`, and
  // `.total` alongside `.count` on every option.
  assertValid(targetLibrary, {
    total: 4,
    offset: 0,
    limit: 48,
    targets: [],
    counts: { total: 126, best: 4, extended: 6 },
    countsUnfiltered: { total: 137, best: 4, extended: 6 },
    catalogueOptions: [
      {
        id: "Messier",
        name: "Messier",
        description: "…",
        count: 1,
        total: 3,
      },
    ],
    typeOptions: [{ id: "Galaxie", name: "Galaxy", count: 1, total: 2 }],
  });
});

test("target-library-query.schema.json rejects an unknown sort or an off-globe latitude", async () => {
  const targetLibrary = await schema("api/target-library-query.schema.json");
  assertInvalid(targetLibrary, { sort: "brightness" });
  assertInvalid(targetLibrary, { sort: "planner", latitude: 120 });
  assertInvalid(targetLibrary, { sort: "planner", minimumAltitude: 90 });
});

test("target-index.schema.json accepts a compact query and a columnar page", async () => {
  const targetIndex = await schema("api/target-index.schema.json");
  assertValid(targetIndex, {
    locale: "fr",
    sort: "planner",
    latitude: 46,
    minimumAltitude: 30,
    limit: 720,
    include: "extended",
  });
  assertValid(targetIndex, {
    v: 1,
    revision: "wJ8nQ2x1",
    total: 1204,
    offset: 0,
    limit: 720,
    sort: "planner",
    include: "extended",
    types: [["Galaxie", "Galaxy"]],
    constellations: [["Andromeda", "Andromeda"]],
    fields: ["id", "designation", "ra", "dec", "type", "constellation"],
    rows: [["m31", "M31", 0.7123, 41.2687, 0, 0]],
  });
});

test("target-index.schema.json accepts the distance columns appended at the end of `fields`", async () => {
  const targetIndex = await schema("api/target-index.schema.json");
  assertValid(targetIndex, {
    v: 1,
    revision: "wJ8nQ2x1",
    total: 2,
    offset: 0,
    limit: 720,
    sort: "designation",
    types: [["Galaxie", "Galaxy"]],
    constellations: [["Andromeda", "Andromeda"]],
    fields: ["id", "designation", "type", "distanceLy", "distanceSource"],
    rows: [
      ["m31", "M31", 0, 2500000, "published"],
      ["ngc-1", "NGC 1", 0, null, null],
    ],
  });
});

test("target-index.schema.json accepts a selection's mode and the modes column (TARGET-SELECTIONS-TAGS-01)", async () => {
  const targetIndex = await schema("api/target-index.schema.json");
  assertValid(targetIndex, {
    selection: "extended",
    mode: "visual",
    include: "extended",
  });
  assertInvalid(targetIndex, { mode: "binoculars" });
  assertValid(targetIndex, {
    v: 1,
    total: 3,
    offset: 0,
    limit: 720,
    sort: "planner",
    include: "extended",
    types: [["Galaxie", "Galaxy"]],
    constellations: [["And", "Andromeda"]],
    fields: ["id", "designation", "best", "extended", "modes"],
    rows: [
      ["m31", "M31", 1, 0, 3],
      ["ngc-891", "NGC 891", 0, 1, 2],
      ["ngc-1", "NGC 1", 0, 0, 0],
    ],
  });
});

test("target-library-query.schema.json accepts mode and a target's modes", async () => {
  const targetLibrary = await schema("api/target-library-query.schema.json");
  assertValid(targetLibrary, { selection: "best", mode: "photo" });
  assertValid(targetLibrary, { mode: "" });
  assertInvalid(targetLibrary, { mode: "imaging" });
  assertValid(targetLibrary, {
    total: 1,
    offset: 0,
    limit: 48,
    targets: [
      {
        id: "m31",
        designation: "M31",
        isBest: true,
        isExtended: false,
        modes: ["visual", "photo"],
      },
    ],
    counts: { total: 1, best: 1, extended: 0 },
  });
  assertInvalid(targetLibrary, {
    total: 1,
    offset: 0,
    limit: 48,
    targets: [{ id: "m31", designation: "M31", modes: ["smartphone"] }],
    counts: { total: 1, best: 1, extended: 0 },
  });
});

test("target-index.schema.json rejects a page cut above the compact cap", async () => {
  const targetIndex = await schema("api/target-index.schema.json");
  assertInvalid(targetIndex, { limit: 1001 });
  assertInvalid(targetIndex, { include: "best" });
  // `fields` and `rows` are what makes a columnar page readable at all.
  assertInvalid(targetIndex, {
    v: 1,
    total: 0,
    offset: 0,
    limit: 720,
    sort: "planner",
  });
});

test("target-favorites.schema.json accepts a favorites map and a set request", async () => {
  const favorites = await schema("api/target-favorites.schema.json");
  assertValid(favorites, { photoTargetIds: ["m31"], visualTargetIds: [] });
  assertValid(favorites, { targetId: "m31", mode: "photo", favorite: true });
});

test("target-favorites.schema.json accepts a phone's import and its answer", async () => {
  const favorites = await schema("api/target-favorites.schema.json");
  assertValid(favorites, {
    action: "import",
    items: [
      { targetId: "m31", mode: "photo" },
      { targetId: "m42", mode: "visual" },
    ],
  });
  assertValid(favorites, {
    photoTargetIds: ["m31"],
    visualTargetIds: ["m42"],
    imported: [
      { targetId: "m31", mode: "photo", status: "added" },
      { targetId: "m42", mode: "visual", status: "kept" },
      { targetId: "gone", mode: "photo", status: "unknown_target" },
    ],
  });
  assertInvalid(favorites, {
    action: "import",
    items: [{ targetId: "m31", mode: "spectroscopic" }],
  });
  assertInvalid(favorites, { action: "replace", items: [] });
});

test("target-favorites.schema.json rejects an unknown favorite mode", async () => {
  const favorites = await schema("api/target-favorites.schema.json");
  assertInvalid(favorites, { targetId: "m31", mode: "bogus", favorite: true });
});

test("offline-pack.schema.json accepts the documented manifest shape", async () => {
  const offlinePack = await schema("api/offline-pack.schema.json");
  assertValid(offlinePack, {
    v: 1,
    catalogue: {
      revision: "wJ8nQ2x1",
      targets: 14386,
      locales: ["en", "fr", "ja"],
    },
    components: [
      {
        id: "target-index",
        kind: "index-pages",
        required: true,
        revision: "wJ8nQ2x1",
        pageSize: 1000,
        pages: 15,
        estimatedBytes: 3729606,
        estimatedEncodedBytes: 504645,
        urlTemplate:
          "/v1/target-index?locale={locale}&sort=designation&limit=1000&offset={offset}",
      },
      {
        id: "sky-quality",
        kind: "file-set",
        required: true,
        revision: "sha256:abc123",
        estimatedBytes: 6480000,
        files: [
          {
            name: "manifest.json",
            url: "/v1/offline-pack/sky-quality/manifest.json",
          },
          {
            name: "raster.bin",
            url: "/v1/offline-pack/sky-quality/raster.bin",
            bytes: 6480000,
            checksum: "sha256:abc123",
          },
        ],
        attribution: "This product was made utilizing …",
        license: "CC BY 4.0",
        year: 2025,
      },
      {
        id: "sky-backdrop",
        kind: "hips-tiles",
        required: false,
        survey: {
          id: "dss-colour",
          hipsId: "CDS/P/DSS2/color",
          format: "jpg",
          tileWidth: 512,
          maxOrder: 9,
          frame: "equatorial",
          attribution:
            "DSS2 colour — CDS/Strasbourg HiPS of the Digitized Sky Survey",
          license: "ODbL-1.0",
          licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
          imageryCopyright: "Caltech, AAO, SERC/PPARC, AURA",
          upstreamRoot: "https://alasky.cds.unistra.fr/DSS/DSSColor/",
          upstreamRoots: [
            "https://alasky.cds.unistra.fr/DSS/DSSColor/",
            "https://alaskybis.cds.unistra.fr/DSS/DSSColor/",
          ],
        },
        meanTileBytes: 43213,
        meanTileBytesByOrder: {
          0: 48467,
          1: 43093,
          2: 41740,
          3: 43507,
          4: 54519,
          5: 75403,
          6: 92750,
        },
        archiveChunkDelta: 4,
        archiveUrlTemplate:
          "/v1/sky-tiles/{survey}/Norder{order}/Chunk{chunkOrder}/{chunkPix}.tar",
        tileUrlTemplate:
          "/v1/sky-tiles/{survey}/Norder{order}/Dir{dir}/Npix{pix}.{format}",
        tiers: [
          {
            id: "essential",
            maxOrder: 3,
            tiles: 1020,
            // Built in full: EXACT, not an estimate — the real combined
            // size of Norder3/Chunk3/0.tar on disk.
            estimatedBytes: 44856832,
            state: "ready",
            exactBytes: true,
          },
          {
            id: "standard",
            maxOrder: 4,
            tiles: 4092,
            estimatedBytes: 214715860,
            state: "on-demand",
          },
          {
            id: "comfort",
            maxOrder: 5,
            tiles: 16380,
            estimatedBytes: 1150754260,
            state: "on-demand",
          },
          {
            id: "quality",
            maxOrder: 6,
            tiles: 65532,
            estimatedBytes: 5747547604,
            state: "on-demand",
          },
        ],
        topUp: { maxOrderWide: 7, maxOrderFocus: 8, estimatedBytes: 210000000 },
      },
    ],
  });
});

test("offline-pack.schema.json accepts a manifest with only its required target-index component", async () => {
  const offlinePack = await schema("api/offline-pack.schema.json");
  assertValid(offlinePack, {
    v: 1,
    catalogue: { revision: "wJ8nQ2x1", targets: 0, locales: ["en"] },
    components: [
      {
        id: "target-index",
        kind: "index-pages",
        required: true,
        revision: "wJ8nQ2x1",
        pageSize: 1000,
        pages: 0,
        estimatedBytes: 0,
        estimatedEncodedBytes: 0,
        urlTemplate:
          "/v1/target-index?locale={locale}&sort=designation&limit=1000&offset={offset}",
      },
    ],
  });
});

test("offline-pack.schema.json keeps an unrecognized component kind valid (evolvability)", async () => {
  const offlinePack = await schema("api/offline-pack.schema.json");
  assertValid(offlinePack, {
    v: 1,
    catalogue: { revision: "wJ8nQ2x1", targets: 0, locales: ["en"] },
    components: [
      {
        id: "target-index",
        kind: "index-pages",
        required: true,
        revision: "wJ8nQ2x1",
        pageSize: 1000,
        pages: 0,
        estimatedBytes: 0,
        estimatedEncodedBytes: 0,
        urlTemplate:
          "/v1/target-index?locale={locale}&sort=designation&limit=1000&offset={offset}",
      },
      { id: "future-thing", kind: "not-invented-yet", note: "additive" },
    ],
  });
});

test("offline-pack.schema.json rejects a manifest missing its required catalogue or components", async () => {
  const offlinePack = await schema("api/offline-pack.schema.json");
  assertInvalid(offlinePack, { v: 1, components: [] });
  assertInvalid(offlinePack, {
    v: 1,
    catalogue: { revision: "wJ8nQ2x1", targets: 0, locales: ["en"] },
  });
  // The permissive fallback that keeps an unrecognized `kind` valid also
  // means a *malformed* known-kind component (missing fields `kind` would
  // otherwise require) is not rejected here — `component.id`/`.kind` are
  // the only universal contract. That trade-off is deliberate: see this
  // schema's own top-level description.
  assertInvalid(offlinePack, {
    v: 1,
    catalogue: { revision: "wJ8nQ2x1", targets: 0, locales: ["en"] },
    components: [{ note: "no id or kind at all" }],
  });
});

test("sky-quality.schema.json accepts a result with or without the additive `calibration` field", async () => {
  const skyQuality = await schema("api/sky-quality.schema.json");
  const base = {
    bortleClass: 4,
    sqm: 21.02,
    source: "viirs-vnl-2025",
    method: "viirs-propagated-radiance-zenith-sky-brightness",
    estimated: true,
    calculatedAt: "2026-09-20T12:00:00.000Z",
    stale: false,
  };
  assertValid(skyQuality, base); // an older client, or a fixture recorded
  // before this field existed, still validates.
  assertValid(skyQuality, { ...base, calibration: "2026-09/japan" });
  assertValid(skyQuality, { ...base, calibration: "2026-09/global" });
  assertInvalid(skyQuality, { ...base, calibration: "not-a-calibration-tag" });
});

// The brightness by direction around a place.
test("sky-quality-direction.schema.json accepts the grid by direction and rejects an echoed position or a non-estimate", async () => {
  const direction = await schema("api/sky-quality-direction.schema.json");
  const base = {
    model: "line-of-sight-v1",
    estimate: true,
    azimuthStepDegrees: 90,
    altitudes: [0, 45, 90],
    sqm: [
      [19.2, 21.4, 21.8, 21.1],
      [20.6, 21.7, 21.9, 21.5],
      [21.6, 21.6, 21.6, 21.6],
    ],
    zenithSqm: 21.6,
    source: "viirs-vnl-2025",
    rasterChecksum: "sha256:" + "0".repeat(64),
    calibration: "2026-09/global",
    calculatedAt: "2026-10-01T02:00:00.000Z",
  };
  assertValid(direction, base);
  assertValid(direction, { latitude: "45.00", longitude: "-30.00" });
  assertInvalid(direction, { ...base, latitude: 45 });
  assertInvalid(direction, { ...base, estimate: false });
  assertInvalid(direction, { ...base, model: "point-v0" });
  assertInvalid(direction, { ...base, sqm: [[9.5]] });
});

test("places-suggested.schema.json accepts suggestions with their attribution and rejects a distance or an echoed centre", async () => {
  const suggested = await schema("api/places-suggested.schema.json");
  const place = {
    id: "osm:node/101",
    name: "Belvédère de la Crête",
    type: "viewpoint",
    latitude: 45.02,
    longitude: -30.04,
    website: "https://belvedere.invalid/",
    elevation: 1720,
    skyQuality: { bortle: 2, sqm: 21.7, estimate: true },
  };
  const base = {
    results: [
      place,
      { ...place, id: "osm:way/7", type: "campsite", skyQuality: null },
    ],
    truncated: false,
    attribution: {
      text: "© OpenStreetMap contributors",
      url: "https://www.openstreetmap.org/copyright",
      licence: "ODbL-1.0",
    },
    source: "osm",
    fetchedAt: "2026-10-01T20:00:00.000Z",
  };
  assertValid(suggested, base);
  assertValid(suggested, {
    latitude: "45.00",
    longitude: "-30.05",
    radiusKm: "60",
    types: "viewpoint,campsite",
  });
  assertValid(suggested, {
    error: { code: "places_unavailable", message: "Off.", reason: "disabled" },
  });
  assertInvalid(suggested, { ...base, latitude: 45 });
  assertInvalid(suggested, {
    ...base,
    results: [{ ...place, distanceKm: 18 }],
  });
  assertInvalid(suggested, {
    ...base,
    results: [{ ...place, type: "parking" }],
  });
  assertInvalid(suggested, {
    ...base,
    results: [{ ...place, website: "javascript:x" }],
  });
  assertInvalid(suggested, {
    ...base,
    results: [
      { ...place, skyQuality: { bortle: 2, sqm: 21.7, estimate: false } },
    ],
  });
  assertInvalid(suggested, { ...base, attribution: undefined });
  assertInvalid(suggested, {
    latitude: "45",
    longitude: "-30",
    radiusKm: "20",
  });
});

test("place-known.schema.json accepts one known place and the gone answer", async () => {
  const known = await schema("api/place-known.schema.json");
  const result = {
    place: {
      id: "osm:relation/31",
      name: "Parc des Combes Sauvages",
      type: "park",
      latitude: 44.9,
      longitude: -29.8,
      skyQuality: null,
    },
    attribution: {
      text: "© OpenStreetMap contributors",
      url: "https://www.openstreetmap.org/copyright",
      licence: "ODbL-1.0",
    },
    source: "osm",
    fetchedAt: "2026-10-01T20:00:00.000Z",
  };
  assertValid(known, result);
  assertValid(known, { source: "osm", id: "relation/31" });
  assertValid(known, {
    error: { code: "known_place_gone", message: "Gone." },
  });
  assertInvalid(known, { id: "area/31" });
  assertInvalid(known, { ...result, source: "wikidata" });
  assertInvalid(known, { ...result, place: { ...result.place, type: null } });
});

// The measured sky background, one number per night.
const skyUpload = {
  sessionId: "0b9f3c1e-6d0a-4f5e-9a3b-2c1d0e9f8a7b",
  site: { latitude: 45.0, longitude: -30.0 },
  observedAt: "2026-10-11T05:11:00.000Z",
  sqm: 21.04,
  poseCount: 14,
  methodVersion: "astro-sync-sky/1",
};
const skyMeasure = {
  placeId: "col-des-melezes",
  night: "2026-10-10",
  sqm: 21.04,
  poseCount: 14,
  methodVersion: "astro-sync-sky/1",
  observedAt: "2026-10-11T05:11:00.000Z",
  sessionId: null,
  updatedAt: "2026-10-11T09:00:00.000Z",
};

test("place-sky-measure.schema.json accepts the night's one value, with a session, a site or both", async () => {
  const contract = await schema("api/place-sky-measure.schema.json");
  assertValid(contract, skyUpload);
  const { site: _site, ...withSession } = skyUpload;
  assertValid(contract, withSession);
  const { sessionId: _session, ...withSite } = skyUpload;
  assertValid(contract, withSite);
  assertInvalid(contract, {
    observedAt: skyUpload.observedAt,
    sqm: 21.04,
    poseCount: 14,
    methodVersion: "astro-sync-sky/1",
  });
});

test("place-sky-measure.schema.json carries nothing but the number and its evidence", async () => {
  const contract = await schema("api/place-sky-measure.schema.json");
  for (const extra of [
    { image: "data:image/png;base64,AAAA" },
    { poses: [{ sqm: 21.0 }] },
    { score: 7 },
    { site: { latitude: 45, longitude: -30, elevation: 800 } },
  ])
    assertInvalid(contract, { ...skyUpload, ...extra });
  assertInvalid(contract, { ...skyUpload, sqm: 4.2 });
  assertInvalid(contract, { ...skyUpload, poseCount: 0 });
  assertInvalid(contract, { ...skyUpload, methodVersion: "my-own-meter" });
});

test("place-sky-measure.schema.json answers the stored value and whether it replaced one", async () => {
  const contract = await schema("api/place-sky-measure.schema.json");
  assertValid(contract, { measure: skyMeasure, replaced: false });
  assertValid(contract, {
    measure: {
      ...skyMeasure,
      sessionId: "0b9f3c1e-6d0a-4f5e-9a3b-2c1d0e9f8a7b",
    },
    replaced: true,
  });
  assertInvalid(contract, { measure: skyMeasure });
  assertInvalid(contract, {
    measure: { ...skyMeasure, night: "10/10/2026" },
    replaced: false,
  });
  assertValid(contract, {
    error: { code: "place_not_found", message: "No place within 500 m." },
  });
  assertInvalid(contract, {
    error: { code: "analysis_not_entitled", message: "Not this route." },
  });
});

test("place-sky-measure.schema.json lists the account's values by place, newest night first", async () => {
  const contract = await schema("api/place-sky-measure.schema.json");
  const { placeId: _placeId, ...night } = skyMeasure;
  assertValid(contract, { places: [] });
  assertValid(contract, {
    places: [
      {
        placeId: "col-des-melezes",
        measures: [night, { ...night, night: "2026-09-12", sqm: 20.71 }],
      },
      { placeId: "camping-du-lac-noir", measures: [night] },
    ],
  });
  assertInvalid(contract, {
    places: [{ placeId: "col-des-melezes", measures: [] }],
  });
  assertInvalid(contract, {
    places: [{ placeId: "col-des-melezes", measures: [skyMeasure] }],
  });
});

const calibrationConsent = {
  enabled: true,
  consentedAt: "2026-10-11T09:00:00.000Z",
  kept: 3,
  lastKeptAt: "2026-10-12T09:00:00.000Z",
};
const calibrationRecord = {
  kind: "measured",
  sqm: 21.04,
  band: "camera",
  radianceLevel: 140,
  region: "global",
  year: 2026,
  methodVersion: "astro-sync-sky/1",
};
const calibrationDef = (name) => ({
  $ref: `calibration-consent.schema.json#/$defs/${name}`,
});

test("calibration-consent.schema.json reads and switches the consent, and nothing else", async () => {
  const contract = await schema("api/calibration-consent.schema.json");
  registerExternalSchema("calibration-consent.schema.json", contract);
  assertValid(contract, { consent: calibrationConsent });
  assertValid(contract, {
    consent: {
      enabled: false,
      consentedAt: null,
      kept: 0,
      lastKeptAt: null,
    },
  });
  assertValid(contract, { enabled: false });
  assertInvalid(contract, { enabled: "yes" });
  assertInvalid(contract, { enabled: true, placeId: "col-des-melezes" });
  assertInvalid(contract, { consent: { ...calibrationConsent, kept: -1 } });
  assertInvalid(contract, {
    consent: { ...calibrationConsent, email: "vous@exemple.fr" },
  });
});

test("calibration-consent.schema.json answers a withdrawal with the count and the consent after", async () => {
  const contract = await schema("api/calibration-consent.schema.json");
  assertValid(contract, {
    withdrawn: 3,
    consent: { enabled: false, consentedAt: null, kept: 0, lastKeptAt: null },
  });
  assertInvalid(contract, { withdrawn: 3 });
  assertValid(contract, {
    error: { code: "not_available", message: "A private server." },
  });
  assertInvalid(contract, {
    error: { code: "place_not_found", message: "Not this route." },
  });
});

test("calibration-consent.schema.json's record holds the seven fields, never a place", async () => {
  const contract = await schema("api/calibration-consent.schema.json");
  registerExternalSchema("calibration-consent.schema.json", contract);
  const record = calibrationDef("record");
  assert.deepEqual(schemaErrors(record, calibrationRecord), []);
  assert.deepEqual(
    schemaErrors(record, {
      ...calibrationRecord,
      kind: "entered",
      band: "sqm",
      methodVersion: null,
    }),
    [],
  );
  for (const wrong of [
    { latitude: 45 },
    { placeId: "col-des-melezes" },
    { night: "2026-10-10" },
    { band: "sqm" },
    { methodVersion: null },
    { radianceLevel: 256 },
    { radianceLevel: 37.5 },
  ])
    assert.notDeepEqual(
      schemaErrors(record, { ...calibrationRecord, ...wrong }),
      [],
      JSON.stringify(wrong),
    );
});

test("calibration-consent.schema.json's release is versioned and holds records only", async () => {
  const contract = await schema("api/calibration-consent.schema.json");
  const release = {
    dataset: "astro-portal-sky-calibration",
    version: "1.0.0",
    generatedAt: "2026-10-12T09:00:00.000Z",
    records: [calibrationRecord],
  };
  assertValid(contract, release);
  assertInvalid(contract, { ...release, version: "v1" });
  assertInvalid(contract, {
    ...release,
    records: [{ ...calibrationRecord, rowKey: "row-1" }],
  });
  assertInvalid(contract, { ...release, ledger: [] });
});

test("change-signal.schema.json accepts a change event and rejects an empty or unknown domain list", async () => {
  const changeSignal = await schema("api/change-signal.schema.json");
  assertValid(changeSignal, { cursor: "boot-1:0", domains: ["plans"] });
  assertValid(changeSignal, {
    cursor: "boot-1:42",
    domains: ["plans", "sessions", "devices"],
  });
  assertInvalid(changeSignal, { cursor: "boot-1:0", domains: [] });
  assertInvalid(changeSignal, { cursor: "boot-1:0", domains: ["catalogue"] });
  assertInvalid(changeSignal, {
    cursor: "boot-1:0",
    domains: ["plans", "plans"],
  });
});

test("change-signal.schema.json accepts a resync event, which the SSE `event:` line (outside this JSON payload) distinguishes from a change carrying the same cursor", async () => {
  const changeSignal = await schema("api/change-signal.schema.json");
  assertValid(changeSignal, { cursor: "boot-1:7" });
  // The bare `resyncEvent` shape itself still refuses `domains`: a payload
  // that carries one is only ever valid as a `change` (below), never as this
  // definition specifically. `root` is passed explicitly so the definition's
  // own `$ref`s (to `#/$defs/cursor`) still resolve against the whole file.
  assert.ok(
    schemaErrors(
      changeSignal.$defs.resyncEvent,
      { cursor: "boot-1:7", domains: ["plans"] },
      changeSignal,
    ).length > 0,
  );
});

test("change-signal.schema.json rejects a malformed cursor or an unknown field", async () => {
  const changeSignal = await schema("api/change-signal.schema.json");
  assertInvalid(changeSignal, { cursor: "boot-1", domains: ["plans"] });
  assertInvalid(changeSignal, { cursor: "boot-1:01", domains: ["plans"] });
  assertInvalid(changeSignal, { cursor: "bo:ot-1:0", domains: ["plans"] });
  assertInvalid(changeSignal, {
    cursor: "boot-1:0",
    domains: ["plans"],
    originDeviceId: "d1",
  });
});

test("widget-snapshot.schema.json accepts the minimal and the fully populated snapshot", async () => {
  const widgetSnapshot = await schema("widget-snapshot.schema.json");
  assertValid(widgetSnapshot, {
    version: 1,
    generatedAt: "2026-09-27T20:00:00.000Z",
  });
  assertValid(widgetSnapshot, {
    version: 1,
    generatedAt: "2026-09-27T20:00:00.000Z",
    nextPlanName: "Ce soir",
    nextTargetName: "M31",
    nightStartAt: "2026-09-27T18:32:00.000Z",
    nightEndAt: "2026-09-28T04:10:00.000Z",
    constraintSummary: "Ciel dégagé, Lune à 12 % — bonne nuit",
    activeSession: { currentTargetName: "M31", status: "open" },
  });
  assertValid(widgetSnapshot, {
    version: 1,
    generatedAt: "2026-09-27T20:00:00.000Z",
    activeSession: { status: "paused" },
  });
});

test("widget-snapshot.schema.json rejects an extra `location` property, at the top level and inside activeSession", async () => {
  const widgetSnapshot = await schema("widget-snapshot.schema.json");
  assertInvalid(widgetSnapshot, {
    version: 1,
    generatedAt: "2026-09-27T20:00:00.000Z",
    location: { latitude: 45.5, longitude: -73.6 },
  });
  assertInvalid(widgetSnapshot, {
    version: 1,
    generatedAt: "2026-09-27T20:00:00.000Z",
    activeSession: {
      currentTargetName: "M31",
      status: "open",
      location: "Home",
    },
  });
});

test("widget-snapshot.schema.json rejects a missing required field, a wrong version, an oversize constraint summary, or an unknown session status", async () => {
  const widgetSnapshot = await schema("widget-snapshot.schema.json");
  assertInvalid(widgetSnapshot, { generatedAt: "2026-09-27T20:00:00.000Z" });
  assertInvalid(widgetSnapshot, { version: 1 });
  assertInvalid(widgetSnapshot, {
    version: 2,
    generatedAt: "2026-09-27T20:00:00.000Z",
  });
  assertInvalid(widgetSnapshot, {
    version: 1,
    generatedAt: "2026-09-27T20:00:00.000Z",
    constraintSummary: "x".repeat(81),
  });
  assertInvalid(widgetSnapshot, {
    version: 1,
    generatedAt: "2026-09-27T20:00:00.000Z",
    activeSession: { currentTargetName: "M31", status: "closed" },
  });
});

test("every new schema declares a 2020-12 $schema and a stable $id", async () => {
  const paths = [
    "widget-snapshot.schema.json",
    "planner/planner-document.schema.json",
    "planner/horizon-mask.schema.json",
    "planner/framing.schema.json",
    "export/plan-archive.schema.json",
    "api/target-library-query.schema.json",
    "api/target-index.schema.json",
    "api/target-favorites.schema.json",
    "api/offline-pack.schema.json",
    "api/change-signal.schema.json",
    "api/service.schema.json",
    "api/session-package-import.schema.json",
    "api/session-analysis.schema.json",
    "api/sky-quality-direction.schema.json",
    "api/places-suggested.schema.json",
    "api/place-known.schema.json",
    "api/app-log-batch.schema.json",
    "api/place-sky-measure.schema.json",
    "api/calibration-consent.schema.json",
  ];
  for (const path of paths) {
    const document = await schema(path);
    assert.equal(
      document.$schema,
      "https://json-schema.org/draft/2020-12/schema",
    );
    assert.ok(document.$id?.startsWith("https://astroportal.invalid/schemas/"));
  }
});

test("capabilities.schema.json requires pointing.solve, a boolean", async () => {
  const capabilities = await schema("api/capabilities.schema.json");
  const map = {
    "planner.multiple": true,
    "planner.mosaic": true,
    "pointing.solve": true,
    "sync.plan_limit": 1000,
    "gallery.private": true,
    "capture.variant_limit": 4,
    "analysis.logs": false,
    "analysis.progression": false,
    "storage.max_file_bytes": 104857600,
    "storage.quota_bytes": 53687091200,
    "portal.invitations": false,
    "capture.count_limit": 9007199254740991,
    "capture.public": true,
    "history.retention_days": 90,
  };
  assertValid(capabilities, map);
  assertValid(capabilities, { ...map, "pointing.solve": false });
  const { "pointing.solve": _removed, ...withoutPointing } = map;
  assertInvalid(capabilities, withoutPointing);
  assertInvalid(capabilities, { ...map, "pointing.solve": "yes" });
  assertInvalid(capabilities, { ...map, "pointing.solve": 1 });
});

test("capabilities.schema.json requires the capture and invitation keys, and types them", async () => {
  const capabilities = await schema("api/capabilities.schema.json");
  const map = {
    "planner.multiple": true,
    "planner.mosaic": true,
    "pointing.solve": true,
    "sync.plan_limit": 1000,
    "gallery.private": true,
    "portal.invitations": true,
    "capture.variant_limit": 4,
    "capture.count_limit": 3,
    "capture.public": true,
    "analysis.logs": false,
    "analysis.progression": false,
    "storage.max_file_bytes": 26214400,
    "storage.quota_bytes": 78643200,
    "history.retention_days": 7,
  };
  assertValid(capabilities, map);
  assertValid(capabilities, { ...map, "capture.count_limit": 0 });
  assertValid(capabilities, {
    ...map,
    "capture.count_limit": Number.MAX_SAFE_INTEGER,
  });
  for (const name of [
    "capture.count_limit",
    "capture.public",
    "portal.invitations",
  ]) {
    const { [name]: _removed, ...without } = map;
    assertInvalid(capabilities, without);
  }
  assertInvalid(capabilities, { ...map, "capture.count_limit": -1 });
  assertInvalid(capabilities, { ...map, "capture.count_limit": true });
  assertInvalid(capabilities, { ...map, "capture.public": 1 });
  assertInvalid(capabilities, { ...map, "portal.invitations": "yes" });
  assertInvalid(capabilities, { ...map, "capture.unknown": true });
});

test("offline-pack.schema.json describes the deep star catalogue component", async () => {
  const offlinePack = await schema("api/offline-pack.schema.json");
  const component = {
    id: "solve-catalogue",
    kind: "file-set",
    required: false,
    revision: "sha256:abc",
    estimatedBytes: 744024,
    magnitudeLimit: 8.5,
    stars: 62000,
    files: [
      {
        name: "stars.bin",
        url: "solve-catalogue/stars.bin",
        bytes: 744024,
        checksum: "sha256:abc",
      },
    ],
    attribution: "HYG v4.1 — David Nash, astronexus.com",
    license: "CC BY-SA 4.0",
  };
  const solveCatalogue = offlinePack.$defs.solveCatalogueComponent;
  const definitions = { $defs: offlinePack.$defs };
  assertValid({ ...solveCatalogue, ...definitions }, component);
  assertValid(offlinePack, {
    v: 1,
    catalogue: { revision: "wJ8nQ2x1", targets: 0, locales: ["en"] },
    components: [component],
  });
});

test("offline-pack.schema.json: the deep catalogue is optional, attributed and has a file", async () => {
  const offlinePack = await schema("api/offline-pack.schema.json");
  const solveCatalogue = {
    ...offlinePack.$defs.solveCatalogueComponent,
    $defs: offlinePack.$defs,
  };
  const component = {
    id: "solve-catalogue",
    kind: "file-set",
    required: false,
    revision: "sha256:abc",
    estimatedBytes: 10,
    files: [{ name: "stars.bin", url: "solve-catalogue/stars.bin" }],
    attribution: "HYG v4.1 — David Nash, astronexus.com",
    license: "CC BY-SA 4.0",
  };
  assertInvalid(solveCatalogue, { ...component, required: true });
  assertInvalid(solveCatalogue, { ...component, files: [] });
  const { license: _license, ...unlicensed } = component;
  assertInvalid(solveCatalogue, unlicensed);
});

test("offline-pack.schema.json: the camera catalogue is optional, zoned, credited and carries its provenance", async () => {
  const offlinePack = await schema("api/offline-pack.schema.json");
  const cameraCatalogue = {
    ...offlinePack.$defs.cameraCatalogueComponent,
    $defs: offlinePack.$defs,
  };
  const component = {
    id: "camera-catalogue",
    kind: "file-set",
    required: false,
    revision: "sha256:abc",
    estimatedBytes: 12043672,
    magnitudeLimit: 11.5,
    stars: 1500277,
    layout: "PSTZ",
    files: [
      {
        name: "stars.bin",
        url: "/v1/offline-pack/camera-catalogue/stars.bin",
        bytes: 12043672,
        checksum: "sha256:abc",
      },
    ],
    attribution: "Tycho-2 Catalogue (Høg et al. 2000), ESA Hipparcos mission",
    license:
      "CC BY-NC 3.0 IGO, autorisation commerciale demandée à l'ESA le 04/11/2026",
    source: {
      catalogue: "Tycho-2, VizieR I/259",
      url: "http://vizier.nao.ac.jp/ftp/cats/I/259/",
      retrievedAt: "2026-11-04",
      files: [{ name: "tyc2.dat.00.gz", bytes: 1, sha256: "a".repeat(64) }],
    },
  };
  assertValid(cameraCatalogue, component);
  assertValid(offlinePack, {
    v: 1,
    catalogue: { revision: "wJ8nQ2x1", targets: 0, locales: ["en"] },
    components: [component],
  });
  assertInvalid(cameraCatalogue, { ...component, required: true });
  assertInvalid(cameraCatalogue, { ...component, layout: "PSTR" });
  assertInvalid(cameraCatalogue, {
    ...component,
    source: { files: [{ name: "x", sha256: "not hex" }] },
  });
  const { license: _license, ...unlicensed } = component;
  assertInvalid(cameraCatalogue, unlicensed);
});

test("offline-pack.schema.json describes the optional catalogue texts component", async () => {
  const offlinePack = await schema("api/offline-pack.schema.json");
  const shard = (number) => ({
    shard: number,
    bytes: 1_400_000,
    sha256: "a".repeat(64),
    revision: `rev-${number}`,
    count: 500,
  });
  const component = {
    id: "target-texts",
    kind: "text-shards",
    required: false,
    revision: "texts-revision",
    urlTemplate: "/v1/offline-pack/target-texts/{locale}/{shard}.json",
    locales: { fr: [shard("000"), shard("001")], "zh-Hans": [shard("000")] },
  };
  const definition = {
    ...offlinePack.$defs.textShardsComponent,
    $defs: offlinePack.$defs,
  };
  assertValid(definition, component);
  assertValid(offlinePack, {
    v: 1,
    catalogue: { revision: "wJ8nQ2x1", targets: 0, locales: ["fr"] },
    components: [component],
  });
  // Optional by construction, addressed by its template, and each shard names
  // its digest: a manifest that says otherwise is not this component.
  assertInvalid(definition, { ...component, required: true });
  const { urlTemplate: _urlTemplate, ...unaddressed } = component;
  assertInvalid(definition, unaddressed);
  assertInvalid(definition, {
    ...component,
    locales: { fr: [{ ...shard("000"), sha256: "short" }] },
  });
  assertInvalid(definition, {
    ...component,
    locales: { fr: [{ ...shard("000"), shard: "0" }] },
  });
  assertInvalid(definition, { ...component, locales: { fr: [] } });
});

test("read-aloud-manifest.schema.json accepts the fixture language manifest and rejects what breaks the contract", async () => {
  const manifestSchema = await schema("api/read-aloud-manifest.schema.json");
  const manifest = JSON.parse(
    await readFile(
      new URL(
        "../fixtures/read-aloud/azure-hd-test/fr/manifest.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assertValid(manifestSchema, manifest);
  assert.deepEqual(
    manifest.fiches.map((fiche) => fiche.level),
    ["essential", "extended", "complete"],
  );
  assertInvalid(manifestSchema, { ...manifest, kind: "units" });
  assertInvalid(manifestSchema, { ...manifest, fiches: [] });
  const { license: _license, ...unlicensed } = manifest;
  assertInvalid(manifestSchema, unlicensed);
  assertInvalid(manifestSchema, { ...manifest, invented: true });
  const withUnit = (change) => ({
    ...manifest,
    fiches: [
      {
        ...manifest.fiches[0],
        units: [{ ...manifest.fiches[0].units[0], ...change }],
      },
    ],
  });
  assertValid(manifestSchema, withUnit({}));
  assertInvalid(manifestSchema, withUnit({ id: "ABCDEF" }));
  assertInvalid(manifestSchema, withUnit({ sha256: "short" }));
  assertInvalid(manifestSchema, withUnit({ bytes: 0 }));
  assertInvalid(manifestSchema, withUnit({ cues: [] }));
  assertInvalid(manifestSchema, withUnit({ cues: [0, -1] }));
  assertInvalid(manifestSchema, {
    ...manifest,
    fiches: [{ ...manifest.fiches[0], level: "full" }],
  });
});

test("offline-pack.schema.json describes the optional spoken reading component", async () => {
  const offlinePack = await schema("api/offline-pack.schema.json");
  const totals = (fiches, units, bytes) => ({ fiches, units, bytes });
  const component = {
    id: "read-aloud",
    kind: "audio-units",
    required: false,
    revision: "0123456789abcdef",
    estimatedBytes: 231000000,
    urlTemplate: "/v1/offline-pack/read-aloud/{locale}/{voice}/u/{unit}.m4a",
    locales: {
      fr: {
        voiceVersion: "azure-hd-2026-11",
        voice: "fr-FR-VivienneMultilingualNeural",
        source: "Voix de synthèse neuronale HD",
        attribution: "Voix de synthèse neuronale HD",
        license: "Redistribution permise par les Product Terms",
        manifest: {
          url: "/v1/offline-pack/read-aloud/fr/azure-hd-2026-11/manifest.json",
          bytes: 640000,
          checksum: `sha256:${"a".repeat(64)}`,
        },
        levels: {
          essential: totals(12, 60, 9000000),
          extended: totals(200, 1250, 190000000),
          complete: totals(260, 1500, 231000000),
        },
      },
    },
  };
  const definition = {
    ...offlinePack.$defs.readAloudComponent,
    $defs: offlinePack.$defs,
  };
  assertValid(definition, component);
  assertValid(offlinePack, {
    v: 1,
    catalogue: { revision: "wJ8nQ2x1", targets: 0, locales: ["fr"] },
    components: [component],
  });
  assertInvalid(definition, { ...component, required: true });
  assertInvalid(definition, { ...component, kind: "text-shards" });
  const { urlTemplate: _urlTemplate, ...unaddressed } = component;
  assertInvalid(definition, unaddressed);
  const french = component.locales.fr;
  const { license: _license, ...unlicensed } = french;
  assertInvalid(definition, { ...component, locales: { fr: unlicensed } });
  assertInvalid(definition, {
    ...component,
    locales: {
      fr: { ...french, manifest: { ...french.manifest, checksum: "abc" } },
    },
  });
  const { complete: _complete, ...partial } = french.levels;
  assertInvalid(definition, {
    ...component,
    locales: { fr: { ...french, levels: partial } },
  });
});

test("capture.schema.json: a capture is private or public, nothing else", async () => {
  const capture = await schema("api/capture.schema.json");
  assertValid(capture, v6Capture);
  assertValid(capture, { ...v6Capture, visibility: "public" });
  for (const visibility of ["unlisted", "members", "Public", "", null])
    assertInvalid(capture, { ...v6Capture, visibility });
  const { visibility: _visibility, ...withoutVisibility } = v6Capture;
  assertInvalid(capture, withoutVisibility);
});

// « Publique depuis le … ».
test("capture.schema.json: madePublicAt is a date or null, optional, on a public or a private capture", async () => {
  const capture = await schema("api/capture.schema.json");
  // Optional: an answer from before the field still validates.
  assertValid(capture, { ...v6Capture, visibility: "public" });
  for (const madePublicAt of [null, "2026-10-04T09:00:00.000Z"])
    for (const visibility of ["public", "private"])
      assertValid(capture, { ...v6Capture, visibility, madePublicAt });
  for (const madePublicAt of ["yesterday", 1760000000000, true, ""])
    assertInvalid(capture, {
      ...v6Capture,
      visibility: "public",
      madePublicAt,
    });
  assert.ok(
    capture.$defs.capture.properties.madePublicAt,
    "the capture resource declares madePublicAt",
  );
  assert.ok(
    !capture.$defs.capture.required.includes("madePublicAt"),
    "madePublicAt is optional",
  );
  // The date is not one of the checks.
  assertInvalid(capture, {
    ...v6Capture,
    checks: { ...v6Checks, madePublicAt: null },
  });
});

test("capture.schema.json: the checks object, every state the screens draw", async () => {
  const capture = await schema("api/capture.schema.json");
  for (const checks of [
    { ...v6Checks, automatic: null, automaticAt: null },
    v6Checks,
    { ...v6Checks, team: "approved", teamAt: "2026-10-04T09:00:00.000Z" },
    {
      ...v6Checks,
      automatic: "undetermined",
      reviewRequestedAt: "2026-10-04T09:00:00.000Z",
    },
    {
      ...v6Checks,
      automatic: "other",
      protectionNoticeAt: "2026-10-06T10:00:00.000Z",
      protectionLiftedAt: "2026-10-07T10:00:00.000Z",
    },
    {
      ...v6Checks,
      team: "refused",
      teamAt: "2026-10-04T09:00:00.000Z",
      teamReason: "not_sky",
    },
    { ...v6Checks, removedFromGalleryAt: "2026-10-05T09:00:00.000Z" },
  ])
    assertValid(capture, { ...v6Capture, visibility: "public", checks });
  // `checks` stays optional on the resource.
  assertValid(capture, v6Capture);
});

test("capture.schema.json: the checks never carry the automatic check's reason, nor an unknown value", async () => {
  const capture = await schema("api/capture.schema.json");
  for (const checks of [
    { ...v6Checks, automaticReason: "plate_solved" },
    { ...v6Checks, auto_check_reason: "plate_solved" },
    { ...v6Checks, automatic: "maybe" },
    { ...v6Checks, team: "pending" },
    { ...v6Checks, teamReason: "ugly" },
    { ...v6Checks, teamNote: "Un visage au premier plan" },
    { ...v6Checks, reviewRequestedAt: "yesterday" },
  ])
    assertInvalid(capture, { ...v6Capture, checks });
  const { removedFromGalleryAt: _removed, ...incomplete } = v6Checks;
  assertInvalid(capture, { ...v6Capture, checks: incomplete });
});

// The owner reads eight reasons of an undetermined check (the file, the
// format, a person, neither a sky nor a landscape); the figures of the rule
// stay with the administration.
test("capture.schema.json: automaticReason is one of the eight reasons the owner reads, never a figure the administration keeps", async () => {
  const capture = await schema("api/capture.schema.json");
  for (const automaticReason of [
    "check_off",
    "unreadable",
    "too_large",
    "too_slow",
    "unsupported_format",
    "raw_camera_file",
    "person_detected",
    "not_recognised",
  ])
    assertValid(capture, {
      ...v6Capture,
      checks: { ...v6Checks, automatic: "undetermined", automaticReason },
    });
  for (const automaticReason of [
    "too_few_stars",
    "calibration_frame",
    "astro_header",
    "person_doubt",
    "not_a_landscape",
    "people_unchecked",
  ])
    assertInvalid(capture, {
      ...v6Capture,
      checks: { ...v6Checks, automatic: "undetermined", automaticReason },
    });
});

// What the phone reads of a capture beside its checks.
test("capture.schema.json: protectionLiftsAt is a date or null, optional, and the retired publication is gone", async () => {
  const file = await schema("api/capture.schema.json");
  registerExternalSchema("capture.schema.json", file);
  const capture = { $ref: "capture.schema.json#/$defs/capture" };
  const noticed = {
    ...v6Checks,
    automatic: "other",
    protectionNoticeAt: "2026-10-06T10:00:00.000Z",
  };
  for (const protectionLiftsAt of ["2026-10-20T10:00:00.000Z", null])
    assertValid(capture, {
      ...v6Capture,
      checks: noticed,
      protectionLiftsAt,
    });
  // Optional: the answer of an upload, and an earlier list, carry none.
  assertValid(capture, { ...v6Capture, checks: v6Checks });
  for (const protectionLiftsAt of ["yesterday", 14, true])
    assertInvalid(capture, { ...v6Capture, protectionLiftsAt });
  // The publications are retired and the field is out.
  assertInvalid(capture, { ...v6Capture, publication: null });
  assertInvalid(capture, {
    ...v6Capture,
    publication: { status: "public" },
  });
});

// A capture is private or public, and carries the state of its two checks
// for its owner.
const v6Capture = {
  id: "2e7d9b31-4c06-4a8f-91b3-5f8c0d2a6e47",
  sessionId: null,
  planId: null,
  targetIds: ["m31"],
  originalName: "M31_LRGB_final.tif",
  sha256: "3b1f0d6c9a8e4725d0c1b2a39f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c",
  byteSize: 4194304,
  status: "uploaded",
  visibility: "private",
  createdAt: "2026-10-03T22:41:00.000Z",
};
const v6Checks = {
  automatic: "sky",
  automaticAt: "2026-10-03T22:42:00.000Z",
  team: null,
  teamAt: null,
  teamReason: null,
  reviewRequestedAt: null,
  protectionNoticeAt: null,
  protectionLiftedAt: null,
  removedFromGalleryAt: null,
};

test("capture.schema.json: the list says whether the person may not make a capture public", async () => {
  const capture = await schema("api/capture.schema.json");
  const page = { captures: [v6Capture], nextSince: null, hasMore: false };
  const list = { $ref: "capture.schema.json#/$defs/list" };
  registerExternalSchema("capture.schema.json", capture);
  for (const publishingBlocked of [true, false])
    assert.deepEqual(schemaErrors(list, { ...page, publishingBlocked }), []);
  // Optional, so that a reader of an earlier answer still validates.
  assert.deepEqual(schemaErrors(list, page), []);
  for (const publishingBlocked of ["yes", 1, null])
    assert.notDeepEqual(schemaErrors(list, { ...page, publishingBlocked }), []);
});

// The owner's captures (« Mon espace » → « Captures »).
const manageCapture = {
  ...v6Capture,
  checks: v6Checks,
  state: {
    state: "private_sky",
    publishAllowed: true,
    publishRefusal: null,
    teamLine: null,
    protectionLiftsAt: null,
    publishingBlockedUntil: null,
  },
  preview: true,
  // The thumbnail, a file a gallery can show, and a protection lifted
  // by its delay.
  thumbnail: true,
  showable: true,
  protectionLapsed: false,
  detail: {
    targets: [{ id: "m31", designation: "M31", name: "Galaxie d’Andromède" }],
    night: "2026-10-03",
    addedAt: "2026-10-04T08:00:00.000Z",
    fileName: "M31_LRGB_final.tif",
    byteSize: 48200000,
    equipment: ["Lunette 72/432"],
    skyQuality: null,
    place: { name: "Lac Noir" },
  },
  // The owner's own tags, always.
  tags: ["Nuit très froide", "première lumière"],
  // The stage, and the images of the capture (its main one first).
  stage: "finalized",
  variants: [
    {
      id: "6b2f0c1e-3a4d-4e5f-8a9b-0c1d2e3f4a5b",
      main: true,
      sha256: "a".repeat(64),
      byteSize: 48200000,
      originalName: "M31_LRGB_final.tif",
      width: 6248,
      height: 4176,
      source: "astro-sync",
      public: false,
      automaticCheck: "sky",
      createdAt: "2026-10-04T08:00:00.000Z",
      thumbnail: true,
    },
  ],
};

async function manageSchema(pointer) {
  registerExternalSchema(
    "capture.schema.json",
    await schema("api/capture.schema.json"),
  );
  registerExternalSchema(
    "capture-variant.schema.json",
    await schema("api/capture-variant.schema.json"),
  );
  const document = await schema("api/manage-captures.schema.json");
  return { ...document, $ref: `#/$defs/${pointer}`, oneOf: undefined };
}

test("manage-captures.schema.json: the list and one capture, with the state, the preview and the owner's detail", async () => {
  const list = await manageSchema("list");
  const page = {
    captures: [manageCapture],
    hasMore: false,
    nextBefore: null,
    storage: {
      usedBytes: 48200000,
      quotaBytes: 0,
      maxFileBytes: 0,
      captureCount: 1,
    },
    publishing: { available: true, warningsCount: 0, blockedUntil: null },
    names: { publicNameRefusedAt: null, portalNameRefusedAt: null },
  };
  assertValid(list, page);
  assertValid(list, {
    ...page,
    storage: { ...page.storage, captureCountLimit: 3 },
  });
  assertValid(await manageSchema("one"), { capture: manageCapture });
  // Additive: the read-only window, dated, and the
  // true reason when a payment failed; an earlier answer still validates.
  assertValid(list, {
    ...page,
    readOnly: true,
    readOnlyUntil: "2027-01-11T12:00:00.000Z",
  });
  assertValid(list, {
    ...page,
    readOnly: true,
    readOnlyUntil: "2027-01-16T12:00:00.000Z",
    paymentFailed: true,
  });
  assertInvalid(list, { ...page, readOnly: true, paymentFailed: false });
  assertInvalid(list, { ...page, readOnly: true, readOnlyUntil: "tomorrow" });
  // The detail names every value, null where the data lacks it.
  const { place: _place, ...withoutPlace } = manageCapture.detail;
  assertInvalid(list, {
    ...page,
    captures: [{ ...manageCapture, detail: withoutPlace }],
  });
  assertInvalid(list, {
    ...page,
    captures: [
      { ...manageCapture, state: { ...manageCapture.state, state: "gone" } },
    ],
  });
});

// The owner's resource of the web carries the date too.
test("manage-captures.schema.json: madePublicAt on the owner's capture is a date or null, optional, never written by the PATCH", async () => {
  const one = await manageSchema("one");
  assertValid(one, { capture: manageCapture });
  for (const madePublicAt of [null, "2026-10-04T09:00:00.000Z"])
    assertValid(one, { capture: { ...manageCapture, madePublicAt } });
  for (const madePublicAt of ["yesterday", 1760000000000, true, ""])
    assertInvalid(one, { capture: { ...manageCapture, madePublicAt } });
  const patch = await manageSchema("patch");
  assertInvalid(patch, { madePublicAt: "2026-10-04T09:00:00.000Z" });
  assertInvalid(patch, {
    visibility: "public",
    madePublicAt: "2026-10-04T09:00:00.000Z",
  });
});

// The owner's own tags of a capture (`capture_tags`) — free text of 40
// characters at most, 20 at most — read on the phone's list, always on the
// owner's capture, written by the owner's PATCH alone.
test("capture.schema.json and manage-captures.schema.json: the owner's own tags, read only on the phone, written by the owner's PATCH", async () => {
  const file = await schema("api/capture.schema.json");
  registerExternalSchema("capture.schema.json", file);
  const capture = { $ref: "capture.schema.json#/$defs/capture" };
  // Optional on the phone's resource: an upload's answer carries none.
  assertValid(capture, v6Capture);
  for (const tags of [[], ["Nuit très froide"], ["é".repeat(40)]])
    assertValid(capture, { ...v6Capture, tags });
  for (const tags of [
    [""],
    ["é".repeat(41)],
    ["Lune", "Lune"],
    Array.from({ length: 21 }, (_, index) => `tag ${index}`),
    "Lune",
    [3],
  ])
    assertInvalid(capture, { ...v6Capture, tags });
  // Always on the owner's capture.
  const one = await manageSchema("one");
  assertValid(one, { capture: manageCapture });
  const { tags: _tags, ...withoutTags } = manageCapture;
  assertInvalid(one, { capture: withoutTags });
  // One change per PATCH: the whole list, nothing beside it.
  const patch = await manageSchema("patch");
  for (const body of [{ tags: [] }, { tags: [" Nuit froide ", "M31"] }])
    assertValid(patch, body);
  for (const body of [
    { tags: "Nuit froide" },
    { tags: [1] },
    { tags: ["M31"], visibility: "private" },
  ])
    assertInvalid(patch, body);
});

test("manage-captures.schema.json: one change per PATCH, and the refusal codes", async () => {
  const patch = await manageSchema("patch");
  for (const body of [
    { visibility: "public" },
    { visibility: "private" },
    { requestReview: true },
    { acceptVerification: true },
  ])
    assertValid(patch, body);
  for (const body of [
    {},
    { visibility: "unlisted" },
    { visibility: "public", requestReview: true },
    { requestReview: false },
  ])
    assertInvalid(patch, body);
  const refusal = await manageSchema("refusal");
  for (const code of [
    "web_session_required",
    "capture_public_unavailable",
    "publishing_blocked",
    "needs_review",
    "review_not_applicable",
    "verification_not_applicable",
    "not_showable",
    "shared_copy_failed",
  ])
    assertValid(refusal, { error: { code, message: "Refused." } });
  assertInvalid(refusal, { error: { code: "forbidden", message: "No." } });
});

// « Mon espace » → « Matériel », and the default list the planners read
// with the inventory.
const ownTelescope = {
  id: "8f1c2c1e-5b0a-4bd4-9a51-7f0c3d1a2b3c",
  tenantId: "space-camille",
  type: "telescope",
  name: "Lunette 72/432",
  manufacturer: "",
  model: "",
  isBinoculars: false,
  specifications: { apertureMm: 72, focalLengthMm: 432 },
  planner: {},
  notes: "",
  createdAt: "2026-10-07T08:00:00.000Z",
  updatedAt: "2026-10-07T08:00:00.000Z",
  archivedAt: null,
  preferenceOrder: 0,
};
const {
  tenantId: _tenant,
  notes: _notes,
  ...defaultSeestar
} = {
  ...ownTelescope,
  id: "seestar-s50",
  name: "Seestar S50",
  specifications: { apertureMm: 50, focalLengthMm: 250 },
  planner: {
    group: "connected",
    integratedCamera: { id: "seestar-s50-imx462", name: "IMX462" },
    mount: { id: "integrated-altaz", name: "Azimutale intégrée" },
  },
};

async function manageEquipmentSchema(pointer) {
  registerExternalSchema(
    "equipment.schema.json",
    await schema("api/equipment.schema.json"),
  );
  const document = await schema("api/manage-equipment.schema.json");
  return { ...document, $ref: `#/$defs/${pointer}` };
}

test("equipment.schema.json: the inventory, the default list without tenant nor notes, the option", async () => {
  const equipment = await schema("api/equipment.schema.json");
  assertValid(equipment, { equipment: [ownTelescope] });
  assertValid(equipment, {
    equipment: [ownTelescope],
    defaults: [defaultSeestar],
    hideDefaultEquipment: true,
  });
  assertInvalid(equipment, {
    equipment: [],
    defaults: [{ ...defaultSeestar, tenantId: "platform" }],
  });
  assertInvalid(equipment, {
    equipment: [],
    defaults: [{ ...defaultSeestar, notes: "réservé" }],
  });
});

test("equipment.schema.json: the planner keys of the filters attached to equipment are typed", async () => {
  const equipment = await schema("api/equipment.schema.json");
  const withPlanner = (planner) => ({
    equipment: [{ ...ownTelescope, planner }],
  });
  assertValid(
    equipment,
    withPlanner({
      equipmentIds: ["t-1", "c-1"],
      forAllEquipment: false,
      ownFiltersOnly: true,
      profileId: "seestar-s50",
      family: "dual",
    }),
  );
  assertInvalid(equipment, withPlanner({ equipmentIds: "t-1" }));
  assertInvalid(equipment, withPlanner({ forAllEquipment: "no" }));
  assertInvalid(equipment, withPlanner({ ownFiltersOnly: 1 }));
  assertInvalid(equipment, withPlanner({ profileId: 3 }));
});

test("manage-equipment.schema.json: the read, one item, and the changes a PATCH accepts", async () => {
  const read = await manageEquipmentSchema("read");
  assertValid(read, {
    equipment: [
      ownTelescope,
      { ...ownTelescope, archivedAt: ownTelescope.createdAt },
    ],
    defaults: [defaultSeestar],
    hideDefaultEquipment: false,
  });
  assertInvalid(read, { equipment: [], defaults: [] });
  assertValid(await manageEquipmentSchema("item"), { equipment: ownTelescope });
  const item = await manageEquipmentSchema("itemChange");
  assertValid(item, { equipment: { type: "camera", name: "Caméra couleur" } });
  assertValid(item, { action: "restore" });
  assertInvalid(item, { action: "archive" });
  assertInvalid(item, { equipment: { type: "lamp", name: "Lampe" } });
  const collection = await manageEquipmentSchema("collectionChange");
  assertValid(collection, { hideDefaultEquipment: true });
  assertValid(collection, {
    action: "reorder",
    type: "telescope",
    ids: ["a", "b"],
  });
  assertInvalid(collection, { hideDefaultEquipment: "yes" });
  assertInvalid(collection, { action: "reorder", type: "telescope" });
});

test("manage-captures.schema.json: every capture says whether it has a thumbnail, whether a gallery can show it and whether its protection lapsed", async () => {
  const one = await manageSchema("one");
  for (const changes of [
    { thumbnail: false, showable: false },
    { protectionLapsed: true },
  ])
    assertValid(one, { capture: { ...manageCapture, ...changes } });
  for (const field of ["thumbnail", "showable", "protectionLapsed"]) {
    const { [field]: _gone, ...without } = manageCapture;
    assertInvalid(one, { capture: without });
    assertInvalid(one, { capture: { ...manageCapture, [field]: "yes" } });
  }
});

async function gallerySchema(pointer) {
  const document = await schema("api/private-gallery.schema.json");
  return { ...document, $ref: `#/$defs/${pointer}` };
}

test("private-gallery.schema.json: the owner's settings, the modes offered and one change per PATCH", async () => {
  const settings = await gallerySchema("settings");
  const base = {
    address: "https://portal.example.test/p/k7Qm2xV9aTfR4bWc8ZpL3nAb",
    mode: "none",
    publicName: null,
    portalName: null,
    modes: { none: "available", link: "available" },
  };
  assertValid(settings, base);
  assertValid(settings, {
    ...base,
    mode: "link",
    publicName: "Camille",
    portalName: "Ciel du Lac Noir",
  });
  // A private server has these two modes; a service that adds one describes it
  // itself (the hosted service's settings: hosted-contracts, portal-access).
  for (const body of [
    { ...base, mode: "unlisted" },
    { ...base, mode: "invited" },
    { ...base, modes: { ...base.modes, invited: "available" } },
    { ...base, modes: { none: "available" } },
    { ...base, address: "https://portal.example.test/p/short" },
    { ...base, publicName: "x".repeat(61) },
    { ...base, portalName: "" },
  ])
    assertInvalid(settings, body);
  const patch = await gallerySchema("patch");
  for (const body of [
    { mode: "link", confirmVerifiers: true },
    { mode: "none" },
    { publicName: "Camille", portalName: null },
    { portalName: "Ciel du Lac Noir" },
    { regenerateToken: true },
  ])
    assertValid(patch, body);
  for (const body of [
    {},
    { mode: "public" },
    { mode: "invited" },
    { mode: "link", publicName: "Camille" },
    { regenerateToken: false },
  ])
    assertInvalid(patch, body);
});

test("private-gallery.schema.json: the gallery a viewer reads, never a place, and the refusal codes", async () => {
  const gallery = await gallerySchema("gallery");
  const item = {
    id: "00000000-0000-4000-8000-000000000001",
    // The target as the public gallery's card reads it, the month of the
    // night and its telescope.
    targets: [
      {
        id: "m31",
        designation: "M31",
        name: "Galaxie d’Andromède",
        aliases: ["NGC 224"],
        type: "Galaxie",
        constellation: "Andromède",
        ra: 10.6847,
        dec: 41.2688,
      },
    ],
    fileName: "M31_LRGB_final.jpg",
    night: "2026-10-03",
    nightMonth: "2026-10",
    telescope: "Askar 50P",
    addedAt: "2026-10-04T08:00:00.000Z",
    thumbnail: true,
    // The generic tags and the owner's.
    tags: ["Galaxie"],
    ownTags: ["Nuit très froide"],
  };
  const body = {
    gallery: {
      portalName: "Ciel du Lac Noir",
      publicName: "Camille",
      captures: [
        item,
        {
          ...item,
          targets: [],
          night: null,
          nightMonth: null,
          telescope: null,
          tags: ["Grand champ"],
        },
      ],
      tags: ["Galaxie", "Grand champ"],
      ownTags: ["Nuit très froide"],
    },
  };
  assertValid(gallery, body);
  assertValid(gallery, {
    gallery: {
      portalName: null,
      publicName: null,
      captures: [],
      tags: [],
      ownTags: [],
    },
  });
  assertInvalid(gallery, {
    gallery: {
      ...body.gallery,
      captures: [{ ...item, place: { name: "Lac Noir" } }],
    },
  });
  assertInvalid(gallery, {
    gallery: {
      ...body.gallery,
      captures: [{ ...item, visibility: "private" }],
    },
  });
  // The generic tags are the catalogue's keys only; the owner's are free
  // text within their bounds; both are always written.
  for (const changes of [
    { tags: ["Nuit très froide"] },
    { tags: ["Messier"] },
    { ownTags: ["é".repeat(41)] },
    { ownTags: [""] },
  ])
    assertInvalid(gallery, {
      gallery: { ...body.gallery, captures: [{ ...item, ...changes }] },
    });
  for (const field of ["tags", "ownTags"]) {
    const { [field]: _gone, ...without } = item;
    assertInvalid(gallery, {
      gallery: { ...body.gallery, captures: [without] },
    });
  }
  assertValid(gallery, {
    gallery: {
      ...body.gallery,
      captures: [{ ...item, tags: ["Grand champ"], ownTags: [] }],
    },
  });
  // The bar's lists: generic keys only, the owner's within their bounds.
  for (const changes of [
    { tags: ["Nuit très froide"] },
    { ownTags: ["é".repeat(41)] },
    { tags: undefined },
    { ownTags: undefined },
  ])
    assertInvalid(gallery, { gallery: { ...body.gallery, ...changes } });
  const refusal = await gallerySchema("refusal");
  for (const code of ["confirmation_required", "gallery_not_found"])
    assertValid(refusal, { error: { code, message: "Refused." } });
  // The codes of a gate a composition adds are its own.
  for (const code of [
    "portal_invitations_unavailable",
    "authentication_required",
    "gallery_access_denied",
  ])
    assertInvalid(refusal, { error: { code, message: "Refused." } });
  assertValid(refusal, {
    error: {
      code: "name_forbidden",
      message: "Refused.",
      field: "publicName",
      word: "casino",
    },
  });
  assertInvalid(refusal, { error: { code: "forbidden", message: "No." } });
  assertInvalid(refusal, {
    error: { code: "name_forbidden", message: "No.", field: "notes" },
  });
});

// The catalogue texts shards: the service imports them into
// `target_texts`.
const textsFixtures = new URL("../fixtures/target-texts/", import.meta.url);
const textsFixture = async (name) =>
  JSON.parse(await readFile(new URL(name, textsFixtures), "utf8"));

test("target-texts-shard.schema.json accepts the fixture shard: the older tier A form with children only, tiers B and C with a page and a lede, and tier A with its page", async () => {
  const shardSchema = await schema("api/target-texts-shard.schema.json");
  const shard = await textsFixture("shard.en.json");
  assertValid(shardSchema, shard);
  assert.deepEqual(
    shard.entries.map((entry) => entry.tier),
    ["A", "B", "C", "A"],
  );
  assert.equal(shard.entries[0].page, undefined);
  assert.equal(shard.entries[0].lede, undefined);
  assert.ok(shard.entries[1].children);
  assert.equal(shard.entries[2].children, undefined);
  // Tier A carries its page like the others, with its children's text.
  assert.ok(shard.entries[3].page.storySections.length >= 3);
  assert.ok(shard.entries[3].lede);
  assert.ok(shard.entries[3].children);
});

test("target-texts-shard.schema.json rejects an entry that breaks the tier rules or invents a field", async () => {
  const shardSchema = await schema("api/target-texts-shard.schema.json");
  const shard = await textsFixture("shard.en.json");
  const withEntry = (entry) => ({ ...shard, entries: [entry] });
  const [a, b, , pageA] = shard.entries;
  // The older tier A form holds the children's text alone: a page without a
  // lede, a lede without a page, or nothing at all is no entry.
  assertInvalid(shardSchema, withEntry({ ...a, page: b.page }));
  assertInvalid(shardSchema, withEntry({ ...a, lede: b.lede }));
  assertInvalid(
    shardSchema,
    withEntry({ id: a.id, revision: a.revision, tier: "A" }),
  );
  // Tier A with its page is an entry like a tier B one: both parts are
  // required, the children's text is optional, and the same page rules
  // hold.
  assertValid(shardSchema, withEntry(pageA));
  const { children: ignoredChildren, ...pageAWithoutChildren } = pageA;
  assertValid(shardSchema, withEntry(pageAWithoutChildren));
  const { lede: ignoredLede, ...pageAWithoutLede } = pageA;
  assertInvalid(shardSchema, withEntry(pageAWithoutLede));
  const { page: ignoredPage, ...pageAWithoutPage } = pageA;
  assertInvalid(shardSchema, withEntry(pageAWithoutPage));
  assertInvalid(
    shardSchema,
    withEntry({ ...pageA, page: { ...pageA.page, story: "x" } }),
  );
  // A tier B or C entry has its page and its lede.
  const { lede, ...withoutLede } = b;
  assertInvalid(shardSchema, withEntry(withoutLede));
  const { page, ...withoutPage } = b;
  assertInvalid(shardSchema, withEntry(withoutPage));
  assertInvalid(shardSchema, withEntry({ ...b, tier: "D" }));
  // The page stores the sections, the sources and the note, nothing else: the
  // story and its paragraphs are derived, never stored.
  assertInvalid(
    shardSchema,
    withEntry({ ...b, page: { ...b.page, tier: "B" } }),
  );
  assertInvalid(
    shardSchema,
    withEntry({ ...b, page: { ...b.page, storyParagraphs: ["x"] } }),
  );
  assertInvalid(
    shardSchema,
    withEntry({ ...b, page: { ...b.page, story: "x" } }),
  );
  assertInvalid(
    shardSchema,
    withEntry({ ...b, page: { ...b.page, storySections: [] } }),
  );
  assertInvalid(
    shardSchema,
    withEntry({
      ...b,
      page: { ...b.page, researchSources: [{ label: "x", url: "ftp://x" }] },
    }),
  );
  assertInvalid(shardSchema, { ...shard, v: 2 });
  assertInvalid(shardSchema, { ...shard, shard: "7" });
  const { revision, ...withoutRevision } = shard;
  assertInvalid(shardSchema, withoutRevision);
});

test("target-texts-index.schema.json accepts the fixture index and rejects a shard with no digest", async () => {
  const indexSchema = await schema("api/target-texts-index.schema.json");
  const index = await textsFixture("index.json");
  assertValid(indexSchema, index);
  const [item] = index.locales.en;
  assertInvalid(indexSchema, {
    ...index,
    locales: { en: [{ ...item, sha256: "abc" }] },
  });
  assertInvalid(indexSchema, {
    ...index,
    locales: { en: [{ ...item, path: "007.json" }] },
  });
  const { shardCount, ...withoutCount } = index;
  assertInvalid(indexSchema, withoutCount);
});

test("the fixture index describes the fixture shard: its bytes, digest, revision and count", async () => {
  const { createHash } = await import("node:crypto");
  const bytes = await readFile(new URL("shard.en.json", textsFixtures));
  const shard = JSON.parse(bytes.toString("utf8"));
  const [item] = (await textsFixture("index.json")).locales.en;
  assert.equal(item.path, `en/${shard.shard}.json`);
  assert.equal(item.bytes, bytes.length);
  assert.equal(item.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(item.revision, shard.revision);
  assert.equal(item.count, shard.entries.length);
});
