// The settings half of "Deux versions de ce plan": `mergePlanFields`, the one
// rule the clients and the server share (fixture `plan-merge-fields`).
import assert from "node:assert/strict";
import test from "node:test";
import {
  mergePlanFields,
  planFieldChoicesFor,
  planFieldDifferences,
  planFieldRowIds,
} from "../src/plan-merge.js";

const base = {
  id: "plan-col",
  name: "Nuit au col",
  date: "2026-09-17",
  nightId: "night-col",
  location: {
    name: "Col des Mélèzes",
    latitude: "45.00000",
    longitude: "-30.00000",
  },
  equipment: {
    mode: "imaging",
    telescopeId: "askar-50p",
    mountId: "az-gti",
    cameraId: "asi533mc-pro",
    filterIds: ["l-pro", "ha"],
  },
  minAltitude: 30,
  status: "pending",
  view: { type: "" },
  items: [{ id: "m31", startMinute: 0, endMinute: 60 }],
};
const edit = (patch, equipment = null) => ({
  ...structuredClone(base),
  ...patch,
  ...(equipment
    ? { equipment: { ...structuredClone(base.equipment), ...equipment } }
    : {}),
});

test("nothing differs: no row, and the targets are the rails' own", () => {
  const items = [{ id: "m13", startMinute: 60, endMinute: 120 }];
  const result = mergePlanFields(
    edit({ view: { type: "galaxy" } }),
    base,
    base,
    {},
    { items },
  );
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.payload.items, items);
  assert.equal(result.payload.name, "Nuit au col");
});

test("a field changed on one side is pre-selected on that side", () => {
  const [row] = planFieldDifferences(edit({ minAltitude: 25 }), base, base);
  assert.deepEqual(
    { field: row.field, changed: row.changed, preselected: row.preselected },
    { field: "minAltitude", changed: ["local"], preselected: "local" },
  );
  assert.equal(
    mergePlanFields(edit({ minAltitude: 25 }), base, base).payload.minAltitude,
    25,
  );
});

test("equipment is split into rows: a mount changed elsewhere is its own row", () => {
  const other = edit({}, { mountId: "eq6-r-pro", cameraId: "asi533mc-pro" });
  const rows = planFieldDifferences(base, other, base);
  assert.deepEqual(
    rows.map((row) => row.field),
    ["equipment.mount"],
  );
  assert.equal(rows[0].preselected, "other");
  const { payload } = mergePlanFields(base, other, base);
  assert.equal(payload.equipment.mountId, "eq6-r-pro");
  assert.equal(payload.equipment.telescopeId, "askar-50p");
});

test("both sides changed the same field: no default, nothing merged until chosen", () => {
  const local = edit({ minAltitude: 25 });
  const other = edit({ minAltitude: 35 });
  const pending = mergePlanFields(local, other, base);
  assert.deepEqual(pending.missing, ["minAltitude"]);
  assert.equal(pending.payload, null);
  assert.equal(pending.rows[0].preselected, null);
  const chosen = mergePlanFields(local, other, base, { minAltitude: "other" });
  assert.equal(chosen.payload.minAltitude, 35);
});

test("filters compare as a set, and two spellings of one value are no difference", () => {
  const local = edit(
    { minAltitude: "30" },
    { filterIds: ["ha", "l-pro"], restrictToEquipment: false },
  );
  assert.deepEqual(planFieldDifferences(local, base, base), []);
  const added = edit({}, { filterIds: ["ha", "oiii", "l-pro"] });
  assert.deepEqual(
    planFieldDifferences(added, base, base).map((row) => row.field),
    ["equipment.filters"],
  );
});

test("view is never a row; launchedSchedule always comes from the server", () => {
  const launched = [
    { planItemId: "m31", targetId: "m31", startMinute: 0, endMinute: 60 },
  ];
  const local = edit({ view: { type: "nebula" }, launchedSchedule: [] });
  const other = edit({ view: { type: "galaxy" }, launchedSchedule: launched });
  const result = mergePlanFields(local, other, base);
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.payload.view, { type: "nebula" });
  assert.deepEqual(result.payload.launchedSchedule, launched);
});

test("without a base the more recent version is pre-selected and says so", () => {
  const rows = planFieldDifferences(
    edit({ minAltitude: 25 }),
    edit({ minAltitude: 35 }),
    null,
    { newer: "other" },
  );
  assert.equal(rows[0].preselected, "other");
  assert.equal(rows[0].reason, "newer");
  assert.deepEqual(rows[0].changed, []);
});

test("a shortcut keeps the whole version it names, settings included", () => {
  const local = edit(
    { name: "Téléphone", minAltitude: 25 },
    { mountId: "eq6-r-pro" },
  );
  const other = edit({ name: "Web", darkness: "nautical" });
  const rows = planFieldDifferences(local, other, base);
  const keepOther = mergePlanFields(
    local,
    other,
    base,
    planFieldChoicesFor(rows, "other"),
  );
  assert.equal(keepOther.payload.name, "Web");
  assert.equal(keepOther.payload.minAltitude, 30);
  assert.equal(keepOther.payload.equipment.mountId, "az-gti");
  assert.equal(keepOther.payload.darkness, "nautical");
  const keepLocal = mergePlanFields(
    local,
    other,
    base,
    planFieldChoicesFor(rows, "local"),
  );
  assert.equal(keepLocal.payload.name, "Téléphone");
  assert.equal(keepLocal.payload.darkness, undefined);
});

test("a choice naming no row is reported, never applied", () => {
  const result = mergePlanFields(edit({ minAltitude: 25 }), base, base, {
    "equipment.colour": "local",
  });
  assert.deepEqual(result.unknown, ["equipment.colour"]);
  assert.equal(result.payload, null);
  assert.ok(planFieldRowIds.includes("equipment.windTolerance"));
  assert.ok(!planFieldRowIds.includes("view"));
});
