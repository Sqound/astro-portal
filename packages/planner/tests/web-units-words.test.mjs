import assert from "node:assert/strict";
import test from "node:test";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The parts that need no browser: the sentence under the suggestion button
// never says "NaN°", and the night "Cette nuit" is about when the planner's
// plans do not name a place.
await registerJsx();
const { equipmentCapabilityLine } =
  await import("planner/equipment-capability.js");
const { tonightSubject } = await import("planner/tonight-overview.js");

const imagingField = { width: 3.1, height: 2.07, shape: "rectangle" };

test("the equipment sentence is written when every number in it is known", () => {
  assert.equal(
    equipmentCapabilityLine({
      equipment: { name: "Lunette 72 mm" },
      field: imagingField,
      visualMode: false,
      locale: "fr",
    }),
    "Lunette 72 mm cadre un champ de 3,1° × 2,07°.",
  );
  assert.equal(
    equipmentCapabilityLine({
      equipment: {
        name: "Dobson 200",
        magnification: 48,
        visualFieldDiameterDegrees: 1.04,
      },
      field: { width: 1.04, height: 1.04, shape: "circle" },
      visualMode: true,
      locale: "en",
    }),
    "Dobson 200 provides 48× with a 1.04° circular field. It is ideal for bright objects; diffuse nebulae benefit from a dark sky.",
  );
});

test("a custom set-up whose fields are still empty says nothing, never NaN", () => {
  for (const [equipment, field, visualMode] of [
    // "Personnalisé…" with empty fields: no name, no field of view.
    [{ name: "" }, null, false],
    [{ name: "Lunette 72 mm" }, null, false],
    [{ name: "Lunette 72 mm" }, { width: Number.NaN, height: 2 }, false],
    [{ name: "Lunette 72 mm" }, { width: 0, height: 2 }, false],
    [
      {
        name: "Dobson 200",
        magnification: Number.NaN,
        visualFieldDiameterDegrees: 1,
      },
      null,
      true,
    ],
    [
      { name: "Dobson 200", magnification: 48, visualFieldDiameterDegrees: "" },
      null,
      true,
    ],
    [{ name: "Dobson 200" }, null, true],
  ])
    for (const locale of ["fr", "en", "ja", "de", "ru", "zh-Hans"])
      assert.equal(
        equipmentCapabilityLine({ equipment, field, visualMode, locale }),
        null,
        JSON.stringify([equipment, field, visualMode, locale]),
      );
});

const nobeyama = {
  id: "nobeyama",
  name: "Nobeyama",
  latitude: 35.94,
  longitude: 138.475,
  timeZone: "Asia/Tokyo",
};
const jardin = {
  id: "jardin",
  name: "Jardin",
  latitude: 35.7,
  longitude: 139.7,
  timeZone: "Asia/Tokyo",
};
// 19:00 in Tokyo on 21 October 2026.
const now = Date.parse("2026-10-21T10:00:00Z");

test("without a plan of tonight, the night is the default place's", () => {
  const document = {
    schemaVersion: 2,
    plans: [{ id: "p", date: "2026-10-22", status: "pending" }],
    nights: [],
  };
  const subject = tonightSubject({
    document,
    now,
    defaultPlace: nobeyama,
    knownPlaces: [jardin, nobeyama],
  });
  assert.equal(subject.place?.id, "nobeyama");
  assert.equal(subject.date, "2026-10-21");
});

test("the place of the document's active night comes before the default place, the last saved place after it", () => {
  const document = {
    schemaVersion: 2,
    plans: [],
    nights: [
      { id: "n1", date: "2026-10-21", location: jardin },
      { id: "n2", date: "2026-10-22", location: nobeyama },
    ],
    activeNightId: "n1",
  };
  assert.equal(
    tonightSubject({ document, now, defaultPlace: nobeyama }).place?.id,
    "jardin",
  );
  assert.equal(
    tonightSubject({
      document: { schemaVersion: 2, plans: [] },
      now,
      defaultPlace: nobeyama,
      knownPlaces: [jardin],
    }).place?.id,
    "nobeyama",
  );
  assert.equal(
    tonightSubject({
      document: { schemaVersion: 2, plans: [] },
      now,
      knownPlaces: [nobeyama, jardin],
    }).place?.id,
    "jardin",
    "no default place: the one saved last",
  );
  assert.equal(
    tonightSubject({ document: { schemaVersion: 2, plans: [] }, now }).place,
    null,
  );
});

test("a chosen place or the place of tonight's plan still comes first", () => {
  const document = {
    schemaVersion: 2,
    plans: [
      { id: "p", date: "2026-10-21", status: "pending", location: jardin },
    ],
  };
  assert.equal(
    tonightSubject({ document, now, defaultPlace: nobeyama }).place?.id,
    "jardin",
  );
  assert.equal(
    tonightSubject({
      document,
      now,
      chosen: nobeyama,
      defaultPlace: jardin,
    }).place?.id,
    "nobeyama",
  );
});
