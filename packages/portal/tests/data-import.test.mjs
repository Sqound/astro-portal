import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  dataExportDocuments,
  dataExportFileText,
} from "portal/data-export/rules.js";
import { zipArchive } from "portal/data-export/zip.js";
import {
  dataImportIdentifiers,
  dataImportPlan,
  dataImportReport,
  emptyExisting,
  reidentifiedId,
  skyMeasureKey,
} from "portal/data-import/plan.js";
import { DataImportError, readDataExport } from "portal/data-import/reader.js";
import { readZip } from "portal/data-import/zip-reader.js";

/**
 * « Importer mes données »: the reader of the export file — its ZIP read
 * without a dependency, CRC-32 checked, the README's version read first,
 * each JSON held to its schema — and the pure plan of the import, which
 * splits « à importer » and « déjà présent » by identifier. The data are
 * the export fixture's: synthetic names, places at 45° N, 30° W.
 */

const contracts = new URL("../../astro-contracts/", import.meta.url);
const fixture = JSON.parse(
  await readFile(new URL("fixtures/data-export.json", contracts), "utf8"),
);
const sixBoxes = fixture.cases.find((entry) => entry.id === "six-boxes")
  .args[0];
const EXPORTED_AT = "2026-10-05T18:30:00.000Z";

/** The ZIP the export writer makes of `files` (the rule's documents). */
function archive(files, extra = []) {
  return zipArchive(
    [
      ...files.map((file) => ({
        name: file.name,
        data: dataExportFileText(file),
      })),
      ...extra,
    ],
    { modifiedAt: new Date(EXPORTED_AT) },
  );
}
const exportOf = (source, parts = sixBoxes.parts) =>
  archive(
    dataExportDocuments({ parts, exportedAt: EXPORTED_AT, source }).files,
  );

/** Synthetic records every box can store: framings with their centre, a
 * horizon with its place, measures with their instant. */
const ids = {
  plan: "8a3e5c1e-0d1f-4b8e-9f00-000000000001",
  otherPlan: "8a3e5c1e-0d1f-4b8e-9f00-000000000002",
  framing: "3c1f0e9a-2222-4d3e-9a00-000000000006",
  session: "5b7e2d10-3333-4e4f-8b00-000000000007",
};
const COL = {
  id: "col-des-melezes",
  name: "Col des Mélèzes",
  latitude: "45.00000",
  longitude: "-30.00000",
  elevation: "",
  timeZone: "UTC",
};
const source = {
  plans: [
    {
      id: "plan-col-1",
      date: "2026-10-03",
      name: "Nébuleuses d’automne",
      location: COL,
      items: [{ id: "m31", framingId: ids.framing }, { id: "ngc7000" }],
      resourceId: ids.plan,
      status: "executed",
    },
    {
      id: "plan-lac-2",
      date: "2026-10-05",
      name: "Nuit au lac",
      items: [],
      resourceId: ids.otherPlan,
      status: "active",
    },
  ],
  projects: [
    {
      id: "6f1d1c2a-6b3c-4c55-8e1f-000000000003",
      revision: 2,
      status: "active",
    },
  ],
  places: [COL],
  horizonProfiles: [
    {
      id: "horizon-terrasse",
      name: "Terrasse",
      location: COL,
      mask: { enabled: true, points: [] },
    },
  ],
  equipment: [
    {
      id: "9d2b6c1e-1111-4a0b-8c00-000000000004",
      type: "telescope",
      name: "Lunette 80 mm",
    },
  ],
  framings: [
    {
      id: ids.framing,
      name: "M31 en deux panneaux",
      revision: 1,
      payload: { target: { id: "m31", center: { ra: 10.68, dec: 41.27 } } },
    },
  ],
  sessions: [
    {
      id: ids.session,
      planId: ids.plan,
      status: "finished",
      startedAt: "2026-10-03T19:40:00.000Z",
      events: [
        {
          eventId: "01JA0000000000000000000001",
          type: "target_started",
          recordedAt: "2026-10-03T19:45:00.000Z",
          payload: { targetId: "m31" },
        },
      ],
    },
  ],
  // The phone's: the outcome only, no instant, no adjustment.
  debriefs: [
    { planId: ids.plan, outcome: "executed", decidedAt: null, targets: [] },
  ],
  skyMeasurements: [
    {
      placeId: COL.id,
      measures: [
        {
          night: "2026-10-03",
          sqm: 21.04,
          poseCount: 14,
          methodVersion: "astro-sync-sky/1",
          observedAt: "2026-10-04T01:30:00.000Z",
        },
      ],
    },
  ],
};

test("the reader takes a ZIP written by the export writer, CRC-32 checked, and refuses a damaged entry", () => {
  const bytes = exportOf(sixBoxes.source);
  const entries = readZip(bytes);
  assert.deepEqual(
    [...entries.keys()],
    [
      "README.md",
      "plans.json",
      "places.json",
      "equipment.json",
      "framings.json",
      "journal.json",
      "sky-measurements.json",
    ],
  );
  const file = readDataExport(bytes);
  assert.equal(file.formatVersion, 1);
  assert.equal(file.exportedAt, EXPORTED_AT);
  assert.deepEqual(file.absent, []);
  assert.deepEqual(file.unknownFiles, []);
  assert.equal(file.documents.plans.plans.length, 2);
  assert.equal(file.documents.journal.sessions[0].events.length, 1);

  // One byte of plans.json's deflated bytes changed: its CRC-32 no longer
  // matches, and the file is refused with the entry named.
  const damaged = Buffer.from(bytes);
  const local = damaged.indexOf(Buffer.from("plans.json")) + 10;
  damaged[local + 4] ^= 0xff;
  assert.throws(
    () => readDataExport(damaged),
    (error) =>
      error instanceof DataImportError &&
      error.code === "not_an_export" &&
      error.status === 400 &&
      error.details.reason === "damaged" &&
      error.details.entry === "plans.json",
  );
  // Not a ZIP at all, and a ZIP without README.
  assert.throws(() => readDataExport(Buffer.from("plans, places, equipment")), {
    code: "not_an_export",
  });
  assert.throws(
    () =>
      readDataExport(
        zipArchive([{ name: "plans.json", data: "{}" }], {
          modifiedAt: new Date(EXPORTED_AT),
        }),
      ),
    { code: "not_an_export" },
  );
});

test("formatVersion 2 is refused with its number, before any JSON is read", () => {
  const readme = [
    "formatVersion: 2",
    `exportedAt: ${EXPORTED_AT}`,
    "parts: plans",
    "",
    "# PlanAstro",
  ].join("\n");
  const bytes = zipArchive(
    [
      { name: "README.md", data: readme },
      { name: "plans.json", data: "not even JSON" },
    ],
    { modifiedAt: new Date(EXPORTED_AT) },
  );
  assert.throws(
    () => readDataExport(bytes),
    (error) =>
      error.code === "unsupported_format_version" &&
      error.status === 422 &&
      error.details.formatVersion === 2,
  );
});

test("a JSON that breaks its schema refuses the file and names its box; an unknown file is ignored and reported, a box absent from the file is said", () => {
  const { files } = dataExportDocuments({
    parts: ["plans", "equipment"],
    exportedAt: EXPORTED_AT,
    source,
  });
  const broken = files.map((file) =>
    file.name === "equipment.json"
      ? { ...file, document: { ...file.document, equipment: [{ name: "?" }] } }
      : file,
  );
  assert.throws(
    () => readDataExport(archive(broken)),
    (error) =>
      error.code === "not_an_export" && error.details.part === "equipment",
  );
  const file = readDataExport(
    archive(files, [{ name: "notes/carnet.txt", data: "Ciel voilé." }]),
  );
  assert.deepEqual(file.unknownFiles, ["notes/carnet.txt"]);
  assert.deepEqual(file.absent, [
    "places",
    "framings",
    "journal",
    "sky-measurements",
  ]);
  const plan = dataImportPlan({ file });
  assert.deepEqual(plan.notes.unknownFiles, ["notes/carnet.txt"]);
  assert.equal(plan.parts.places.present, false);
  assert.equal(plan.parts.plans.present, true);
});

test("the plan splits « à importer » and « déjà présent » by identifier, box by box, and keeps the phone's debriefing as it is", () => {
  const file = readDataExport(exportOf(source));
  const fresh = dataImportPlan({ file });
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(fresh.parts).map(([part, row]) => [
        part,
        [row.toImport, row.alreadyThere],
      ]),
    ),
    {
      plans: [3, 0],
      places: [2, 0],
      equipment: [1, 0],
      framings: [1, 0],
      journal: [2, 0],
      "sky-measurements": [1, 0],
    },
  );
  assert.deepEqual(fresh.totals, { toImport: 10, alreadyThere: 0 });
  // The phone's debriefing enters with its plan, its instant unknown.
  const executed = fresh.writes.plans.find((p) => p.resourceId === ids.plan);
  assert.equal(executed.status, "executed");
  assert.deepEqual(executed.debrief, {
    outcome: "executed",
    decidedAt: null,
    targets: [],
  });
  // The plan keeps its items, the framing reduced to its reference.
  assert.deepEqual(executed.payload.items[0].target, {
    id: ids.framing,
    plannerSource: "framing",
    framingId: ids.framing,
  });
  assert.equal("writes" in dataImportReport(fresh), false);

  // The space already holds one plan (by its planner id), the place, one
  // measure and the night: they are already there, the rest is to import.
  const known = dataImportIdentifiers(file.documents);
  assert.ok(known.planResourceIds.includes(ids.plan));
  const existing = emptyExisting();
  existing.plans.clientIds.add("plan-lac-2");
  existing.places.add(COL.id);
  existing.skyMeasures.add(skyMeasureKey(COL.id, "2026-10-03"));
  existing.sessions.space.add(ids.session);
  existing.framings.live.add(ids.framing);
  existing.framings.space.add(ids.framing);
  const again = dataImportPlan({ file, existing });
  assert.deepEqual(
    [again.parts.plans.toImport, again.parts.plans.alreadyThere],
    [2, 1],
  );
  assert.deepEqual(
    [again.parts.places.toImport, again.parts.places.alreadyThere],
    [1, 1],
  );
  assert.deepEqual(
    [again.parts.framings.toImport, again.parts.framings.alreadyThere],
    [0, 1],
  );
  assert.deepEqual(
    [again.parts.journal.toImport, again.parts.journal.alreadyThere],
    [1, 1],
  );
  assert.equal(again.parts["sky-measurements"].alreadyThere, 1);
  assert.ok(
    !again.writes.plans.some((p) => p.payload.id === "plan-lac-2"),
    "a plan already there is never written",
  );

  // Another space holds the plan's and the night's identifiers: neither
  // is dropped, both enter with a new identifier, and the night's link to
  // its plan, the debriefing and the plan's framing follow.
  const elsewhere = emptyExisting();
  elsewhere.plans.other.add(ids.plan);
  elsewhere.sessions.other.add(ids.session);
  elsewhere.framings.live.add(ids.framing);
  const other = dataImportPlan({ file, existing: elsewhere, tenantId: "T" });
  const plan = reidentifiedId("T", "plans", ids.plan);
  const night = reidentifiedId("T", "sessions", ids.session);
  assert.equal(other.notes.reidentified, 2);
  assert.deepEqual(other.notes.reidentifiedKinds, {
    plans: 1,
    projects: 0,
    framings: 0,
    equipment: 0,
    sessions: 1,
  });
  assert.deepEqual(
    other.writes.plans.map((record) => record.resourceId),
    [plan, ids.otherPlan],
  );
  assert.equal(other.writes.sessions[0].id, night);
  assert.equal(other.writes.sessions[0].planId, plan, "the link follows");
  assert.equal(other.writes.plans[0].debrief.outcome, "executed");
  assert.deepEqual(other.kinds.plans, { toImport: 2, alreadyThere: 0 });
  assert.equal(other.parts.journal.toImport, 2, "the night and its debriefing");
  assert.equal(other.parts.plans.toImport, 3);
  // The same identifier in the same space, never the same in two spaces.
  assert.equal(plan, reidentifiedId("T", "plans", ids.plan));
  assert.notEqual(plan, reidentifiedId("U", "plans", ids.plan));
  assert.notEqual(plan, ids.plan);
  assert.match(
    plan,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-/,
  );
  // Once written, the space holds the new identifiers: the second plan
  // finds them and notes nothing.
  const written = emptyExisting();
  written.plans.space.add(plan);
  written.plans.clientIds.add("plan-col-1");
  written.sessions.space.add(night);
  written.framings.live.add(ids.framing);
  written.plans.other.add(ids.plan);
  written.sessions.other.add(ids.session);
  const second = dataImportPlan({ file, existing: written, tenantId: "T" });
  assert.equal(second.notes.reidentified, 0);
  assert.equal(second.parts.journal.toImport, 0);
  assert.deepEqual(second.kinds.plans, { toImport: 1, alreadyThere: 1 });
  // Without the framing it names, neither in the file nor in the space,
  // the plan is not imported: a missing reference.
  const { files } = dataExportDocuments({
    parts: ["plans"],
    exportedAt: EXPORTED_AT,
    source,
  });
  const alone = dataImportPlan({ file: readDataExport(archive(files)) });
  assert.equal(alone.notes.missingReference, 1);
  assert.equal(alone.parts.plans.toImport, 2);
});

test("the offer's limits: a pending plan the offer would not let the space create is planned ARCHIVED, a plan that was run takes its night first, the space's own plans count, nothing is dropped", () => {
  const plan = (id, date, status = "pending") => ({
    id: `plan-${id}`,
    date,
    name: `Plan ${id}`,
    items: [{ id: "m45" }],
    resourceId: `00000000-0000-4000-8000-${String(id.charCodeAt(0)).padStart(12, "0")}`,
    status,
  });
  const plans = [
    plan("a", "2026-11-01"),
    plan("b", "2026-11-01"),
    plan("c", "2026-11-02"),
    plan("d", "2026-11-02", "executed"),
    plan("e", "2026-11-03"),
  ];
  const file = readDataExport(exportOf({ plans }, ["plans"]));
  const free = {
    capabilities: { "planner.multiple": false, "sync.plan_limit": 1000 },
  };
  const archived = (result) =>
    Object.fromEntries(
      result.writes.plans.map((record) => [
        record.payload.id,
        Boolean(record.archive),
      ]),
    );

  // The free offer: b shares a's night, c shares the night of d (run).
  const result = dataImportPlan({
    file,
    existing: emptyExisting(),
    offer: free,
  });
  assert.deepEqual(archived(result), {
    "plan-a": false,
    "plan-b": true,
    "plan-c": true,
    "plan-d": false,
    "plan-e": false,
  });
  assert.equal(result.notes.archivedForNight, 2);
  assert.equal(result.notes.archivedForPlanLimit, 0);
  assert.equal(result.parts.plans.toImport, 5, "every plan still enters");
  assert.equal(dataImportReport(result).writes, undefined);

  // The space already holds a plan of the night of e: e is archived too.
  const held = emptyExisting();
  held.nightPlans = [{ id: "held", date: "2026-11-03", status: "pending" }];
  assert.equal(
    archived(dataImportPlan({ file, existing: held, offer: free }))["plan-e"],
    true,
  );

  // The numeric guard: the pending plans beyond the guard of two (the executed one is history).
  const guarded = dataImportPlan({
    file,
    existing: emptyExisting(),
    offer: { capabilities: { "planner.multiple": true, "sync.plan_limit": 2 } },
  });
  assert.deepEqual(archived(guarded), {
    "plan-a": false,
    "plan-b": false,
    "plan-c": true,
    "plan-d": false,
    "plan-e": true,
  });
  assert.equal(guarded.notes.archivedForPlanLimit, 2);

  // Several plans a night open, no guard: nothing archived. Without an
  // offer (a bare plan), no limit is applied either.
  for (const offer of [
    { capabilities: { "planner.multiple": true, "sync.plan_limit": 0 } },
    null,
  ]) {
    const open = dataImportPlan({ file, existing: emptyExisting(), offer });
    assert.ok(Object.values(archived(open)).every((value) => !value));
    assert.equal(open.notes.archivedForNight, 0);
  }
});
