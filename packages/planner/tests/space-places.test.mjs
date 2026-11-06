// The client of
// `/v1/places`, and the store the planner page keeps for a signed-in person —
// reads, writes shown at once and then adopted from the service's answer, the
// refusal of a deletion, the default place, the one-time import of the
// browser's places. No test reaches the network: the service is a fake that
// keeps the rule of the most recent edit.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { schemaErrors } from "../../astro-contracts/tests/schema-assert.mjs";
import {
  createSpacePlacesClient,
  placeOfService,
  placeWriteBody,
  planCopyOfPlace,
} from "planner/places-client.js";
import {
  clearSpacePlacesCache,
  createSpacePlacesStore,
  placesToSend,
  readSentPlaceIds,
  spacePlacesCacheKey,
  spacePlacesSentKey,
} from "planner/space-places.js";

const fixture = JSON.parse(
  await readFile(
    new URL(
      "../../astro-contracts/fixtures/places/places.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const schema = JSON.parse(
  await readFile(
    new URL(
      "../../astro-contracts/schemas/api/place.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const full = fixture.examples.find(
  (example) => example.id === "place-full",
).value;

const memory = () => {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
};

const mine = (id, name, extra = {}) => ({
  id,
  name,
  locality: "",
  latitude: "45.00000",
  longitude: "-30.00000",
  elevation: "",
  timeZone: "Atlantic/Azores",
  horizonStatus: "unverified",
  ...extra,
});

const servicePlace = (place, editedAt, usage) => ({
  id: place.id,
  name: place.name,
  latitude: Number(place.latitude),
  longitude: Number(place.longitude),
  timeZone: place.timeZone,
  horizonMask: null,
  editedAt,
  createdAt: editedAt,
  updatedAt: editedAt,
  usage: usage ?? { pendingPlans: [], pastPlans: [] },
});

test("a place of the page becomes the body of PUT: numbers, the whole place, editedAt, no field of the service", () => {
  const place = {
    ...mine("p1", "  Col des Étoiles ", {
      locality: "Massif imaginaire",
      elevation: "1240",
      kind: "viewpoint",
      note: " Parking au pied du col ",
      version: 3,
      sourceProfileId: "legacy",
      usage: { pendingPlans: [], pastPlans: [] },
    }),
  };
  const body = placeWriteBody(place, Date.UTC(2026, 9, 9, 12, 0, 0));
  assert.equal(body.latitude, 45);
  assert.equal(body.longitude, -30);
  assert.equal(typeof body.latitude, "number");
  assert.equal(body.name, "Col des Étoiles");
  assert.equal(body.elevation, "1240");
  assert.equal(body.kind, "viewpoint");
  assert.equal(body.note, "Parking au pied du col");
  assert.equal(body.editedAt, "2026-10-09T12:00:00.000Z");
  assert.equal(body.horizonMask, null);
  for (const absent of ["usage", "version", "sourceProfileId", "createdAt"])
    assert.ok(!(absent in body), absent);
});

test("an unknown elevation, an empty locality or note and a missing time zone are left out, never written as 0 or UTC", () => {
  const body = placeWriteBody(
    mine("p2", "Jardin", { timeZone: "", locality: "", note: "" }),
    0,
  );
  for (const absent of ["elevation", "locality", "note", "timeZone", "kind"])
    assert.ok(!(absent in body), absent);
  assert.equal(
    placeWriteBody({ id: "x", name: "", latitude: "1", longitude: "1" }, 0),
    null,
  );
  assert.equal(
    placeWriteBody(mine("y", "Sans position", { latitude: "" }), 0),
    null,
  );
});

test("the fixture's full place is read into the page's shape and written back as a valid body", () => {
  const read = placeOfService(full);
  assert.equal(read.latitude, "45");
  assert.equal(read.longitude, "-30");
  assert.equal(read.elevation, "1240");
  assert.equal(read.kind, full.kind);
  assert.equal(read.note, full.note);
  assert.deepEqual(read.usage, full.usage);
  assert.equal(read.horizonMask.points.length, 36);
  const body = placeWriteBody(read, Date.parse(full.editedAt));
  assert.deepEqual(
    schemaErrors({ $ref: "#/$defs/placeWrite", $defs: schema.$defs }, body, {
      $defs: schema.$defs,
    }),
    [],
  );
});

test("a place the service holds without a position of horizon reads as « à relever », with no time zone invented", () => {
  const read = placeOfService({
    ...servicePlace(mine("p3", "Pas de l'Ours"), "2026-10-09T10:00:00.000Z"),
    timeZone: undefined,
  });
  assert.equal(read.horizonStatus, "unverified");
  assert.ok(!("horizonMask" in read));
  assert.ok(!("timeZone" in read) || read.timeZone === "");
});

test("a plan keeps the place without its note, its kind or the service's bookkeeping", () => {
  const copy = planCopyOfPlace({
    ...mine("p1", "Col"),
    kind: "park",
    note: "secret",
    usage: {},
    editedAt: "x",
    createdAt: "x",
    updatedAt: "x",
  });
  assert.deepEqual(
    Object.keys(copy).sort(),
    Object.keys(mine("p1", "Col")).sort(),
  );
});

// A service that keeps the rule: the most recent edit wins, equal keeps its own.
function fakeService({ places = [], defaultPlaceId = null, fail = null } = {}) {
  const held = new Map(places.map((place) => [place.id, place]));
  const calls = [];
  let defaultId = defaultPlaceId;
  const request = async (path, { method = "GET", body } = {}) => {
    calls.push({ method, path, body });
    if (fail?.(method, path)) {
      const [status, payload] = fail(method, path);
      return new Response(JSON.stringify(payload), { status });
    }
    const json = (value, status = 200) =>
      new Response(JSON.stringify(value), { status });
    if (method === "GET")
      return json({
        places: [...held.values()],
        defaultPlaceId: defaultId,
        defaultPlaceEditedAt: null,
      });
    if (path === "/api/v1/places/import") {
      const imported = body.places.map((place) => {
        const created = !held.has(place.id);
        if (created)
          held.set(
            place.id,
            servicePlace(
              {
                ...place,
                latitude: place.latitude,
                longitude: place.longitude,
              },
              place.editedAt,
            ),
          );
        return { id: place.id, created };
      });
      return json({ places: [...held.values()], imported });
    }
    if (path === "/api/v1/places/default") {
      defaultId = body.placeId;
      return json({
        defaultPlaceId: defaultId,
        defaultPlaceEditedAt: body.editedAt,
        applied: true,
      });
    }
    const id = decodeURIComponent(path.split("?")[0].split("/").pop());
    if (method === "PUT") {
      const kept = held.get(id);
      if (kept && Date.parse(kept.editedAt) >= Date.parse(body.editedAt))
        return json({ place: kept, applied: false });
      const place = {
        ...servicePlace({ ...body }, body.editedAt, kept?.usage),
        ...body,
      };
      held.set(id, place);
      return json({ place, applied: true }, kept ? 200 : 201);
    }
    if (method === "DELETE") {
      held.delete(id);
      return json({ deleted: true });
    }
    return json({}, 404);
  };
  return { request, calls, held };
}

const store = (
  service,
  { storage = memory(), onError = () => {}, now } = {},
) => ({
  storage,
  service,
  store: createSpacePlacesStore({
    client: createSpacePlacesClient({ request: service.request }),
    storage,
    onError,
    now,
  }),
});

test("start: reads the space, the list and the default place, and keeps a copy for the observing site", async () => {
  const service = fakeService({
    places: [servicePlace(mine("a", "Col"), "2026-10-09T10:00:00.000Z")],
    defaultPlaceId: "a",
  });
  const { store: places, storage } = store(service);
  await places.start({ email: "camille@example.test", browserPlaces: [] });
  const snapshot = places.getSnapshot();
  assert.deepEqual(
    snapshot.places.map((place) => place.name),
    ["Col"],
  );
  assert.equal(snapshot.defaultId, "a");
  assert.equal(snapshot.loaded, true);
  assert.ok(storage.getItem(spacePlacesCacheKey));
  // Offline at the next launch: the copy is shown, then the failure is told.
  const failing = fakeService({
    fail: () => [503, { error: { code: "unavailable", message: "down" } }],
  });
  const errors = [];
  const second = createSpacePlacesStore({
    client: createSpacePlacesClient({ request: failing.request }),
    storage,
    onError: (kind) => errors.push(kind),
  });
  await second.start({ email: "Camille@example.test", browserPlaces: [] });
  assert.deepEqual(
    second.getSnapshot().places.map((place) => place.name),
    ["Col"],
  );
  assert.deepEqual(errors, ["read"]);
  clearSpacePlacesCache(storage);
  assert.equal(storage.getItem(spacePlacesCacheKey), null);
});

test("the copy of another person's space is never shown", async () => {
  const storage = memory();
  const first = store(
    fakeService({
      places: [servicePlace(mine("a", "Col"), "2026-10-09T10:00:00.000Z")],
    }),
    { storage },
  );
  await first.store.start({ email: "camille@example.test" });
  const failing = fakeService({ fail: () => [503, { error: {} }] });
  const other = createSpacePlacesStore({
    client: createSpacePlacesClient({ request: failing.request }),
    storage,
  });
  await other.start({ email: "autre@example.test" });
  assert.deepEqual(other.getSnapshot().places, []);
});

test("save: the gesture shows at once, the service's answer is adopted, a stale write gives the service's place back", async () => {
  const service = fakeService({
    places: [servicePlace(mine("a", "Col"), "2030-01-01T00:00:00.000Z")],
  });
  const { store: places } = store(service, { now: () => Date.UTC(2026, 9, 9) });
  await places.start({ email: "c@example.test" });
  const pending = places.save(mine("a", "Col renommé"));
  assert.equal(
    places.getSnapshot().places[0].name,
    "Col renommé",
    "shown before the answer",
  );
  const answer = await pending;
  // The service holds a later edit: applied false, its place is adopted.
  assert.equal(answer.name, "Col");
  assert.equal(places.getSnapshot().places[0].name, "Col");
  const created = await places.save(mine("b", "Pas de l'Ours"));
  assert.equal(created.name, "Pas de l'Ours");
  assert.deepEqual(
    places.getSnapshot().places.map((place) => place.id),
    ["b", "a"],
  );
  assert.equal(service.calls.filter((call) => call.method === "PUT").length, 2);
  assert.ok(service.calls.find((call) => call.method === "PUT").body.editedAt);
});

test("save: a failure puts the list back and tells the one-line notice", async () => {
  const service = fakeService({
    places: [servicePlace(mine("a", "Col"), "2026-10-09T10:00:00.000Z")],
  });
  const errors = [];
  const { store: places } = store(service, {
    onError: (kind) => errors.push(kind),
  });
  await places.start({ email: "c@example.test" });
  const broken = createSpacePlacesStore({
    client: createSpacePlacesClient({
      request: async (path, init) => {
        if (init?.method === "PUT")
          return new Response(
            JSON.stringify({
              error: { code: "entitlement_read_only", message: "ended" },
            }),
            { status: 403 },
          );
        return service.request(path, init);
      },
    }),
    storage: memory(),
    onError: (kind) => errors.push(kind),
  });
  await broken.start({ email: "c@example.test" });
  const result = await broken.save(mine("a", "Autre nom"));
  assert.equal(result, null);
  assert.equal(broken.getSnapshot().places[0].name, "Col");
  assert.deepEqual(errors, ["write"]);
});

test("remove: a place used by a plan to execute is refused from its usage, naming the plans, without a request", async () => {
  const pending = [
    {
      planId: "11111111-1111-4111-8111-111111111111",
      name: "Nuit du 12 octobre",
      planDate: "2026-10-12",
      status: "active",
    },
    {
      planId: "22222222-2222-4222-8222-222222222222",
      name: "Nuit du 14 octobre",
      planDate: "2026-10-14",
      status: "active",
    },
  ];
  const service = fakeService({
    places: [
      servicePlace(mine("a", "Col"), "2026-10-09T10:00:00.000Z", {
        pendingPlans: pending,
        pastPlans: [],
      }),
    ],
  });
  const { store: places } = store(service);
  await places.start({ email: "c@example.test" });
  const before = service.calls.length;
  const result = await places.remove("a");
  assert.equal(result.inUse, true);
  assert.deepEqual(
    result.pendingPlans.map((plan) => plan.name),
    ["Nuit du 12 octobre", "Nuit du 14 octobre"],
  );
  assert.equal(
    service.calls.length,
    before,
    "decided from the usage read with the place",
  );
});

test("remove: a plan made elsewhere meanwhile is refused by the service (409 place_in_use) and the place stays", async () => {
  const pending = [
    {
      planId: "33333333-3333-4333-8333-333333333333",
      name: "Nuit du 12 octobre",
      planDate: "2026-10-12",
      status: "active",
    },
  ];
  const service = fakeService({
    places: [servicePlace(mine("a", "Col"), "2026-10-09T10:00:00.000Z")],
    fail: (method) =>
      method === "DELETE"
        ? [
            409,
            {
              error: { code: "place_in_use", message: "used" },
              pendingPlans: pending,
            },
          ]
        : null,
  });
  const { store: places } = store(service);
  await places.start({ email: "c@example.test" });
  const result = await places.remove("a");
  assert.equal(result.inUse, true);
  assert.equal(result.pendingPlans[0].name, "Nuit du 12 octobre");
  assert.equal(places.getSnapshot().places.length, 1);
});

test("remove: an executed plan does not block, the place leaves the list, and the default place with it", async () => {
  const service = fakeService({
    places: [
      servicePlace(mine("a", "Col"), "2026-10-09T10:00:00.000Z", {
        pendingPlans: [],
        pastPlans: [
          {
            planId: "44444444-4444-4444-8444-444444444444",
            name: "Nuit du 5 octobre",
            planDate: "2026-10-05",
            status: "executed",
          },
        ],
      }),
    ],
    defaultPlaceId: "a",
  });
  const { store: places } = store(service);
  await places.start({ email: "c@example.test" });
  assert.deepEqual(await places.remove("a"), { ok: true });
  assert.deepEqual(places.getSnapshot().places, []);
  assert.equal(places.getSnapshot().defaultId, null);
  const deletion = service.calls.find((call) => call.method === "DELETE");
  assert.match(deletion.path, /\?at=/);
});

test("setDefault: shown at once, kept by the service, put back on a failure", async () => {
  const service = fakeService({
    places: [
      servicePlace(mine("a", "Col"), "2026-10-09T10:00:00.000Z"),
      servicePlace(mine("b", "Pas"), "2026-10-08T10:00:00.000Z"),
    ],
    defaultPlaceId: "a",
  });
  const errors = [];
  const { store: places } = store(service, {
    onError: (kind) => errors.push(kind),
  });
  await places.start({ email: "c@example.test" });
  const pending = places.setDefault("b");
  assert.equal(places.getSnapshot().defaultId, "b");
  assert.equal(await pending, true);
  assert.equal(places.getSnapshot().defaultId, "b");
  const broken = createSpacePlacesStore({
    client: createSpacePlacesClient({
      request: async (path, init) =>
        init?.method === "PUT"
          ? new Response("{}", { status: 500 })
          : service.request(path, init),
    }),
    storage: memory(),
    onError: (kind) => errors.push(kind),
  });
  await broken.start({ email: "c@example.test" });
  assert.equal(await broken.setDefault("a"), false);
  assert.equal(broken.getSnapshot().defaultId, "b");
  assert.deepEqual(errors, ["default"]);
});

test("the browser's places go once, each with its own identifier, then the marker says it is done", async () => {
  const browser = [
    mine("browser-1", "Col des Étoiles"),
    mine("browser-2", "Jardin de la maison", { latitude: "46.00000" }),
  ];
  const service = fakeService();
  const { store: places, storage } = store(service);
  await places.start({ email: "c@example.test", browserPlaces: browser });
  const imports = service.calls.filter(
    (call) => call.path === "/api/v1/places/import",
  );
  assert.equal(imports.length, 1);
  assert.deepEqual(
    imports[0].body.places.map((place) => place.id),
    ["browser-1", "browser-2"],
  );
  assert.deepEqual(
    places
      .getSnapshot()
      .places.map((place) => place.id)
      .sort(),
    ["browser-1", "browser-2"],
  );
  assert.deepEqual([...readSentPlaceIds("C@example.test", storage)].sort(), [
    "browser-1",
    "browser-2",
  ]);
  // A second sign-in of the same browser sends nothing again.
  const again = createSpacePlacesStore({
    client: createSpacePlacesClient({ request: service.request }),
    storage,
  });
  await again.start({ email: "c@example.test", browserPlaces: browser });
  assert.equal(
    service.calls.filter((call) => call.path === "/api/v1/places/import")
      .length,
    1,
  );
});

test("a failed import marks nothing and is told; the next launch sends again", async () => {
  const browser = [mine("browser-1", "Col")];
  const errors = [];
  const broken = fakeService({
    fail: (method, path) =>
      path === "/api/v1/places/import"
        ? [409, { error: { code: "place_limit_reached", message: "full" } }]
        : null,
  });
  const { store: places, storage } = store(broken, {
    onError: (kind) => errors.push(kind),
  });
  await places.start({ email: "c@example.test", browserPlaces: browser });
  assert.deepEqual(errors, ["import"]);
  assert.equal(readSentPlaceIds("c@example.test", storage).size, 0);
  assert.equal(
    places.getSnapshot().loaded,
    true,
    "the space is read nevertheless",
  );
});

test("placesToSend: at most 200, each id once, none already sent; an id the service would refuse gets a new one", () => {
  const places = [
    mine("ok", "A"),
    mine("ok", "A bis"),
    mine("sent", "B"),
    mine("Col des Étoiles:45:-30", "C"),
    mine("default", "D"),
    { id: "bad", name: "", latitude: "1", longitude: "1" },
  ];
  const { places: out, sent } = placesToSend(places, new Set(["sent"]));
  assert.deepEqual(sent, ["ok", "Col des Étoiles:45:-30", "default"]);
  assert.equal(out[0].id, "ok");
  assert.match(out[1].id, /^[0-9a-f-]{36}$/);
  assert.match(out[2].id, /^[0-9a-f-]{36}$/);
  const many = Array.from({ length: 230 }, (_, index) =>
    mine(`p${index}`, `Lieu ${index}`),
  );
  assert.equal(placesToSend(many).places.length, 200);
  assert.equal(spacePlacesSentKey.startsWith("astro-portal:places:"), true);
});

test("a change signal reads the space again; a reload before start does nothing", async () => {
  const service = fakeService({
    places: [servicePlace(mine("a", "Col"), "2026-10-09T10:00:00.000Z")],
  });
  const { store: places } = store(service);
  assert.equal(await places.reload(), false);
  await places.start({ email: "c@example.test" });
  service.held.set(
    "b",
    servicePlace(mine("b", "Pas"), "2026-10-09T11:00:00.000Z"),
  );
  await places.reload();
  assert.equal(places.getSnapshot().places.length, 2);
});

// The zone the person picked travels with the place — a write
// that dropped the mark would let the service's reading replace it.
test("the body of a write keeps a zone the person chose, and only that", () => {
  const place = {
    id: "home",
    name: "Maison",
    latitude: "48.8566",
    longitude: "2.3522",
    timeZone: "Europe/Paris",
  };
  const at = "2026-10-16T08:00:00.000Z";
  assert.equal(placeWriteBody(place, at).timeZone, "Europe/Paris");
  assert.ok(!("timeZoneSource" in placeWriteBody(place, at)));
  assert.equal(
    placeWriteBody({ ...place, timeZoneSource: "chosen" }, at).timeZoneSource,
    "chosen",
  );
  assert.ok(
    !(
      "timeZoneSource" in
      placeWriteBody({ ...place, timeZone: "", timeZoneSource: "chosen" }, at)
    ),
    "a mark with no zone is not sent",
  );
  assert.equal(
    placeOfService({
      ...place,
      latitude: 48.8566,
      longitude: 2.3522,
      timeZoneSource: "chosen",
    }).timeZoneSource,
    "chosen",
  );
});
