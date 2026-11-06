import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { schemaErrors } from "./schema-assert.mjs";

// The contract of the places of a
// space. Every example of `fixtures/places/places.json` satisfies the
// definition it names; every request of the conflict matrix is a valid
// write; the duplicates fixture says what its own rule computes.

const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const schema = await read("../schemas/api/place.schema.json");
const places = await read("../fixtures/places/places.json");
const conflict = await read("../fixtures/places/places-conflict.json");
const duplicates = await read("../fixtures/places/places-duplicates.json");
const phoneWrites = await read("../fixtures/places/places-phone-writes.json");

const definition = (name) => ({ $ref: `#/$defs/${name}`, $defs: schema.$defs });
const errors = (name, value) =>
  schemaErrors(definition(name), value, { $defs: schema.$defs });

const full = places.examples.find((example) => example.id === "place-full");

test("places.json: every example satisfies the definition it names, and the root schema", () => {
  assert.equal(places.contract, "place.schema.json");
  const ids = new Set();
  for (const example of places.examples) {
    assert.ok(!ids.has(example.id), `duplicate example ${example.id}`);
    ids.add(example.id);
    const [file, pointer] = example.schema.split("#/$defs/");
    assert.equal(file, "place.schema.json");
    assert.deepEqual(errors(pointer, example.value), [], example.id);
    if (!["placeWrite", "defaultWrite", "importRequest"].includes(pointer))
      assert.deepEqual(schemaErrors(schema, example.value), [], example.id);
  }
});

test("places.json covers every answer and every error of the routes", () => {
  const codes = places.examples
    .filter((example) => example.schema.endsWith("/error"))
    .map((example) => example.value.error.code)
    .sort();
  assert.deepEqual(codes, [
    "entitlement_read_only",
    "invalid_request",
    "place_in_use",
    "place_limit_reached",
    "place_not_found",
  ]);
  for (const name of [
    "place",
    "placeList",
    "placeWrite",
    "writeAnswer",
    "deleteAnswer",
    "defaultWrite",
    "defaultAnswer",
    "importRequest",
    "importAnswer",
  ])
    assert.ok(
      places.examples.some((example) =>
        example.schema.endsWith(`/$defs/${name}`),
      ),
      name,
    );
});

test("the place schema holds the bounds of the sheet", () => {
  const place = full.value;
  const refused = (change, label) =>
    assert.notDeepEqual(errors("place", { ...place, ...change }), [], label);
  refused({ name: "" }, "an empty name");
  refused({ name: "   " }, "a blank name");
  refused({ name: "é".repeat(101) }, "a name of 101 characters");
  refused({ locality: "é".repeat(201) }, "a locality of 201 characters");
  refused({ note: "é".repeat(501) }, "a note of 501 characters");
  refused({ latitude: 90.5 }, "a latitude beyond the pole");
  refused({ longitude: -180.5 }, "a longitude beyond the antimeridian");
  refused({ elevation: "1 240 m" }, "an elevation with a unit");
  refused({ kind: "home" }, "a sixth type");
  assert.deepEqual(
    errors("place", { ...place, kind: "private" }),
    [],
    "private",
  );
  refused(
    {
      knownPlace: { ...place.knownPlace, type: "private" },
    },
    "a link to an OpenStreetMap record whose type is « private »",
  );
  refused({ id: "Col des Étoiles" }, "an identifier with spaces and accents");
  refused({ id: "x".repeat(121) }, "an identifier of 121 characters");
  refused({ secret: true }, "a field the contract does not name");
  refused(
    {
      horizonMask: {
        enabled: true,
        points: Array.from({ length: 12 }, (_, index) => ({
          azimuth: index * 30,
          altitude: 5,
        })),
      },
    },
    "the old grid of twelve points",
  );
  // A point may say when its 10° sector was
  // surveyed; a point without it is « à relever ».
  const surveyed = {
    enabled: true,
    points: Array.from({ length: 36 }, (_, index) => ({
      azimuth: index * 10,
      altitude: 12,
      ...(index === 18 ? { surveyedAt: "2026-10-31T02:12:00.000Z" } : {}),
    })),
  };
  assert.deepEqual(
    errors("place", { ...place, horizonMask: surveyed }),
    [],
    "a mask whose south was surveyed",
  );
  refused(
    {
      horizonMask: {
        ...surveyed,
        points: surveyed.points.map((point, index) =>
          index === 18 ? { ...point, surveyedAt: "ce matin" } : point,
        ),
      },
    },
    "a survey instant that is not one",
  );
  refused(
    { skyEntered: { sqm: 23, enteredAt: place.editedAt } },
    "a SQM of 23",
  );
  assert.deepEqual(
    errors("place", { ...place, name: "é".repeat(100), note: "é".repeat(500) }),
    [],
  );
  const { timeZone: _timeZone, ...withoutTimeZone } = place;
  assert.deepEqual(errors("place", withoutTimeZone), [], "no time zone");
  assert.deepEqual(errors("place", { ...place, timeZone: "UTC" }), [], "UTC");
  assert.notDeepEqual(
    errors("placeWrite", { name: "Jardin", latitude: 45, longitude: -30 }),
    [],
    "a write without its instant",
  );
  assert.notDeepEqual(
    errors("importRequest", {
      places: [
        {
          name: "Jardin",
          latitude: 45,
          longitude: -30,
          editedAt: place.editedAt,
        },
      ],
    }),
    [],
    "an imported place without its id",
  );
  assert.notDeepEqual(
    errors("importRequest", {
      places: Array.from({ length: 201 }, (_, index) => ({
        id: `place-${index}`,
        name: "Jardin",
        latitude: 45,
        longitude: -30,
        editedAt: place.editedAt,
      })),
    }),
    [],
    "201 places at once",
  );
});

test("places-conflict.json: every case starts empty and every request is a valid write", () => {
  assert.equal(conflict.rule.clockCapMinutes, 5);
  assert.equal(conflict.rule.tombstoneDays, 90);
  const ids = new Set();
  const covered = new Set();
  for (const entry of conflict.cases) {
    assert.ok(!ids.has(entry.id), entry.id);
    ids.add(entry.id);
    assert.ok(entry.steps.length >= 1, entry.id);
    for (const step of entry.steps) {
      assert.ok(Number.isFinite(Date.parse(step.now)), entry.id);
      assert.ok(Number.isInteger(step.expect.status), entry.id);
      const { method, body, path } = step.request;
      covered.add(path === "default" ? `${method} default` : method);
      if (method === "PUT" && path === "default")
        assert.deepEqual(
          errors("defaultWrite", {
            ...body,
            placeId: body.placeId ? conflict.base.placeId : null,
          }),
          [],
          entry.id,
        );
      else if (method === "PUT")
        assert.deepEqual(
          errors("placeWrite", {
            latitude: conflict.base.latitude,
            longitude: conflict.base.longitude,
            ...body,
          }),
          [],
          entry.id,
        );
    }
  }
  assert.deepEqual([...covered].sort(), [
    "DELETE",
    "GET",
    "PUT",
    "PUT default",
  ]);
  for (const id of [
    "edit-edit-older-loses",
    "edit-edit-equal-service-keeps",
    "edit-delete-newer-deletes",
    "edit-delete-older-gives-back",
    "delete-edit-newer-gives-back",
    "delete-edit-older-stays-deleted",
    "clock-one-hour-ahead",
    "purged-tombstone-never-resurrected",
  ])
    assert.ok(ids.has(id), id);
});

// The rule as `places-duplicates.json` states it, read once more here: the
// fixture cannot drift from its own description.
const fold = (name) =>
  String(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
function metres(a, b, radius) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return radius * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

test("places-duplicates.json: each case says what the rule computes", () => {
  const { thresholdMetres, earthRadiusMetres } = duplicates.rule;
  assert.equal(thresholdMetres, 100);
  for (const entry of duplicates.cases) {
    const pairs = [];
    entry.places.forEach((a, i) =>
      entry.places.slice(i + 1).forEach((b) => {
        const sameName = fold(a.name) === fold(b.name);
        const distance = metres(a, b, earthRadiusMetres);
        if (sameName || distance < thresholdMetres)
          pairs.push({
            ids: [a.id, b.id],
            sameName,
            distanceMetres: Math.round(distance),
          });
      }),
    );
    assert.deepEqual(entry.duplicates, pairs, entry.id);
    assert.deepEqual(
      entry.flagged,
      entry.places
        .filter((place) => pairs.some((pair) => pair.ids.includes(place.id)))
        .map((place) => place.id),
      entry.id,
    );
    for (const place of entry.places)
      assert.deepEqual(
        errors("placeFields", place).filter((line) => !line.includes(".id")),
        [],
        entry.id,
      );
  }
  const byId = Object.fromEntries(
    duplicates.cases.map((entry) => [entry.id, entry]),
  );
  assert.equal(byId["three-homonyms"].duplicates.length, 3);
  assert.equal(byId["just-under-100-m"].flagged.length, 2);
  assert.equal(byId["just-over-100-m"].flagged.length, 0);
  assert.equal(byId["sharp-s-not-folded"].flagged.length, 0);
});

test("places-phone-writes.json: every body the phone builds is a valid write, in the shape of its input", () => {
  assert.equal(phoneWrites.contract, "place.schema.json");
  const ids = new Set();
  for (const write of phoneWrites.writes) {
    assert.ok(!ids.has(write.id), `duplicate write ${write.id}`);
    ids.add(write.id);
    assert.deepEqual(errors("placeWrite", write.body), [], write.id);
    // The body is the place of the input, whole: same identifier, same
    // position as a number, same instant; the note travels with it.
    const place = write.input.place;
    assert.equal(write.body.id, place.id, write.id);
    assert.equal(write.body.latitude, Number(place.latitude), write.id);
    assert.equal(write.body.longitude, Number(place.longitude), write.id);
    assert.equal(write.body.editedAt, place.editedAt, write.id);
    assert.equal(write.body.note, write.input.note, write.id);
    // No field of the phone's own list leaves it.
    for (const local of ["needsOnlineResolution", "version", "sourceProfileId"])
      assert.ok(!(local in write.body), `${write.id}: ${local}`);
  }
});
