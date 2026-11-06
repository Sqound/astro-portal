import assert from "node:assert/strict";
import test from "node:test";
import { captureDetail, targetLabel } from "../dist/captures/capture-detail.js";

// The detail of a capture: one builder for the owner and for a visitor,
// and a visitor never reads the place.
const capture = {
  id: "c1",
  original_name: "M31_LRGB_final.tif",
  byte_size: 48_200_000,
  created_at: "2026-10-04T08:00:00.000Z",
};
const plan = {
  plan_date: "2026-10-03",
  location_json: JSON.stringify({
    name: "Lac Noir",
    latitude: 45,
    longitude: -30,
    bortle: 4,
  }),
};
const targets = [
  {
    id: "m31",
    designation: "M31",
    aliases_json: "[]",
    common_names_json: "[]",
  },
];

test("the owner reads the place; a visitor never does, nor its coordinates", () => {
  const owner = captureDetail(
    { capture, plan, targets, equipment: ["Lunette 72/432"], locale: "fr" },
    { audience: "owner" },
  );
  assert.deepEqual(owner.place, { name: "Lac Noir" });
  assert.equal(owner.night, "2026-10-03");
  assert.deepEqual(owner.skyQuality, { bortle: 4 });
  assert.deepEqual(owner.equipment, ["Lunette 72/432"]);
  assert.equal(owner.fileName, "M31_LRGB_final.tif");
  assert.equal(owner.byteSize, 48_200_000);
  const visitor = captureDetail(
    { capture, plan, targets, locale: "fr" },
    { audience: "visitor" },
  );
  assert.equal("place" in visitor, false);
  const text = JSON.stringify(visitor);
  for (const secret of ["Lac Noir", "latitude", "longitude", "-30"])
    assert.ok(!text.includes(secret), secret);
  assert.throws(() => captureDetail({ capture }, { audience: "public" }));
});

test("what the data lacks is null: a capture sent alone has no night, no place, no exposure", () => {
  const alone = captureDetail({ capture }, { audience: "owner" });
  assert.equal(alone.night, null);
  assert.equal(alone.place, null);
  assert.equal(alone.skyQuality, null);
  // The dead `exposureSeconds` is removed, not patched.
  assert.equal("exposureSeconds" in alone, false);
  assert.deepEqual(alone.targets, []);
  assert.deepEqual(alone.equipment, []);
  assert.equal(alone.addedAt, "2026-10-04T08:00:00.000Z");
  const session = captureDetail(
    { capture, session: { started_at: "2026-09-27T21:10:00.000Z" } },
    { audience: "owner" },
  );
  assert.equal(session.night, "2026-09-27");
});

test("a target reads its designation and its name in the page's language", () => {
  assert.deepEqual(targetLabel(targets[0], "fr"), {
    id: "m31",
    designation: "M31",
    name: "Galaxie d’Andromède",
  });
  assert.equal(targetLabel(targets[0], "ja").name, "アンドロメダ銀河");
  assert.deepEqual(
    targetLabel({ id: "ngc7000", designation: "NGC7000" }, "fr").designation,
    "NGC 7000",
  );
  assert.equal(
    targetLabel({ id: "x", designation: "Unknown 1" }, "fr").name,
    null,
  );
});
