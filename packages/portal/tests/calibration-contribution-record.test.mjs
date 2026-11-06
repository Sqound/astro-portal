import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTRIBUTION_RECORD_FIELDS,
  FORBIDDEN_CONTRIBUTION_FIELDS,
  buildContributionRecord,
  contributionRecordKey,
  contributionRecordProblems,
  forbiddenContributionFields,
  isForbiddenContributionField,
} from "../dist/calibration/contribution-record.js";
import { encodeSkyQualityRadiance } from "../dist/sky-quality.js";

// The record of the project's own sky-brightness calibration set
// (docs/CONTRIBUTION_RULES.md) — the seven fields, never a place, a name,
// a path or an identifier. The place is the captures' synthetic « Col des
// Mélèzes » (45° N, 30° W, in the Atlantic).

const COL = {
  id: "col-des-melezes",
  name: "Col des Mélèzes",
  latitude: 45.0,
  longitude: -30.0,
};
const TOKYO = { latitude: 35.68, longitude: 139.76 };

/** A global 1° grid, every cell at `level`, the cell of `lit` at `litLevel`. */
function grid({ level = 12, lit = COL, litLevel = 140 } = {}) {
  const width = 360;
  const height = 180;
  const data = Buffer.alloc(width * height, level);
  const row = Math.floor(90 - lit.latitude);
  const column = Math.floor(lit.longitude + 180);
  data[row * width + column] = litLevel;
  return { cellSizeDegrees: 1, data, height, north: 90, west: -180, width };
}

const measured = {
  kind: "measured",
  sqm: 21.0449,
  night: "2026-10-10",
  methodVersion: "astro-sync-sky/1",
  // What a stored measure also carries, and the record must drop.
  placeId: COL.id,
  sessionId: "0b9f3c1e-6d0a-4f5e-9a3b-2c1d0e9f8a7b",
  observedAt: "2026-10-11T05:11:00.000Z",
  poseCount: 14,
};
const entered = {
  kind: "entered",
  sqm: 20.7,
  enteredAt: "2027-01-03T21:00:00.000Z",
};

/** Every string of a value, at any depth. */
const strings = (value) =>
  typeof value === "string"
    ? [value]
    : value && typeof value === "object"
      ? Object.values(value).flatMap(strings)
      : [];

test("a measured value's record has exactly the seven fields, in the camera band", () => {
  const record = buildContributionRecord(measured, COL, { grid: grid() });
  assert.deepEqual(Object.keys(record), [...CONTRIBUTION_RECORD_FIELDS]);
  assert.deepEqual(record, {
    kind: "measured",
    sqm: 21.04,
    band: "camera",
    radianceLevel: 140,
    region: "global",
    year: 2026,
    methodVersion: "astro-sync-sky/1",
  });
  assert.deepEqual(contributionRecordProblems(record), []);
});

test("an entered value's record is in the sky-meter band, without a method", () => {
  const record = buildContributionRecord(entered, COL, { grid: grid() });
  assert.deepEqual(record, {
    kind: "entered",
    sqm: 20.7,
    band: "sqm",
    radianceLevel: 140,
    region: "global",
    year: 2027,
    methodVersion: null,
  });
});

test("no place, coordinate, name, space, person, device or path ever appears, in the keys or in the values", () => {
  const place = { ...COL, latitude: 45.0123, longitude: -30.0456 };
  for (const value of [measured, entered]) {
    const record = buildContributionRecord(
      { ...value, tenantId: "tenant-a", deviceId: "device-a", path: "/x/y" },
      place,
      { grid: grid({ lit: place }) },
    );
    assert.deepEqual(forbiddenContributionFields(record), []);
    for (const key of Object.keys(record))
      assert.equal(isForbiddenContributionField(key), false, key);
    const text = strings(record).join(" ");
    for (const secret of [
      COL.id,
      COL.name,
      "45.0123",
      "-30.0456",
      "45",
      "tenant-a",
      "device-a",
      "/x/y",
      measured.sessionId,
      "2026-10-10",
      "2027-01-03",
    ])
      assert.ok(!text.includes(secret), `${secret} leaked into ${text}`);
    for (const number of Object.values(record).filter(
      (item) => typeof item === "number",
    ))
      assert.ok(![45.0123, -30.0456].includes(number));
  }
});

test("the radiance is the raster's own level, 0–255, never the raw value", () => {
  const raw = 37.5;
  const level = encodeSkyQualityRadiance(raw);
  const record = buildContributionRecord(measured, COL, {
    grid: grid({ litLevel: level }),
  });
  assert.equal(record.radianceLevel, level);
  assert.ok(Number.isInteger(record.radianceLevel));
  assert.ok(record.radianceLevel >= 0 && record.radianceLevel <= 255);
  assert.notEqual(record.radianceLevel, raw);
  // A dark cell is level 0, still a level.
  assert.equal(
    buildContributionRecord(measured, COL, { grid: grid({ litLevel: 0 }) })
      .radianceLevel,
    0,
  );
});

test("the region is the calibration region of the place, global outside every region", () => {
  assert.equal(
    buildContributionRecord(measured, TOKYO, { grid: grid({ lit: TOKYO }) })
      .region,
    "japan",
  );
  assert.equal(
    buildContributionRecord(measured, COL, { grid: grid() }).region,
    "global",
  );
});

test("only the year is kept, never the month or the day", () => {
  const record = buildContributionRecord(
    { ...measured, night: "2026-12-31" },
    COL,
    { grid: grid() },
  );
  assert.equal(record.year, 2026);
  assert.equal(Object.keys(record).includes("night"), false);
  for (const value of Object.values(record))
    assert.ok(!/\d{4}-\d{2}/.test(String(value)), String(value));
});

test("without a raster, a usable place or a value in range, nothing is built", () => {
  assert.equal(buildContributionRecord(measured, COL, { grid: null }), null);
  assert.equal(buildContributionRecord(measured, {}, { grid: grid() }), null);
  assert.equal(
    buildContributionRecord(
      measured,
      { latitude: 95, longitude: 0 },
      {
        grid: grid(),
      },
    ),
    null,
  );
  assert.equal(
    buildContributionRecord({ ...measured, sqm: 3 }, COL, { grid: grid() }),
    null,
  );
  assert.equal(
    buildContributionRecord({ ...measured, methodVersion: "mine" }, COL, {
      grid: grid(),
    }),
    null,
  );
  assert.equal(
    buildContributionRecord({ ...measured, kind: "guessed" }, COL, {
      grid: grid(),
    }),
    null,
  );
});

test("a record with any other field, or a forbidden one, is refused", () => {
  const record = buildContributionRecord(measured, COL, { grid: grid() });
  for (const extra of [
    { latitude: 45 },
    { place_id: "col" },
    { Device_ID: "x" },
    { night: "2026-10-10" },
    { note: "Col des Mélèzes" },
  ])
    assert.notDeepEqual(
      contributionRecordProblems({ ...record, ...extra }),
      [],
      JSON.stringify(extra),
    );
  assert.notDeepEqual(
    contributionRecordProblems({ ...record, band: "sqm" }),
    [],
  );
  assert.notDeepEqual(
    contributionRecordProblems({ ...record, radianceLevel: 256 }),
    [],
  );
  assert.notDeepEqual(contributionRecordProblems({ ...record, year: 26 }), []);
  const { region: _region, ...missing } = record;
  assert.notDeepEqual(contributionRecordProblems(missing), []);
});

test("the forbidden names are found at any depth, whatever their spelling", () => {
  assert.deepEqual(
    forbiddenContributionFields({
      records: [{ sqm: 21 }, { meta: { Place_ID: "x", LATITUDE: 1 } }],
      card: { licence: "x", serialNumber: "123" },
    }),
    [
      "records[1].meta.Place_ID",
      "records[1].meta.LATITUDE",
      "card.serialNumber",
    ],
  );
  for (const name of FORBIDDEN_CONTRIBUTION_FIELDS)
    assert.equal(isForbiddenContributionField(name), true, name);
  for (const field of CONTRIBUTION_RECORD_FIELDS)
    assert.equal(isForbiddenContributionField(field), false, field);
});

test("the same record gives the same key; another value another key", () => {
  const record = buildContributionRecord(measured, COL, { grid: grid() });
  const again = buildContributionRecord({ ...measured }, COL, { grid: grid() });
  assert.equal(contributionRecordKey(record), contributionRecordKey(again));
  assert.notEqual(
    contributionRecordKey(record),
    contributionRecordKey({ ...record, sqm: 20.5 }),
  );
});
