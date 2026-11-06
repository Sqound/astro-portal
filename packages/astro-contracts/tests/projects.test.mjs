import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseChangeSignalEvent } from "../dist/change-signal.js";
import {
  assertInvalid,
  assertValid,
  registerExternalSchema,
  schemaErrors,
} from "./schema-assert.mjs";

// The project resource (shown as « plan multi-nuits »), the plan item's
// `projectId` and the `projects` change-signal domain.

const schemasDirectory = new URL("../schemas/", import.meta.url);
const schema = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, schemasDirectory), "utf8"));

registerExternalSchema(
  "../planner/horizon-mask.schema.json",
  await schema("planner/horizon-mask.schema.json"),
);

const project = await schema("api/project.schema.json");
const write = { $defs: project.$defs, $ref: "#/$defs/write" };

const mask = {
  enabled: true,
  points: Array.from({ length: 36 }, (_, index) => ({
    azimuth: index * 10,
    altitude: index >= 24 && index <= 30 ? 55 : 5,
  })),
};

const resource = () => ({
  id: "5d0c6b1e-2f4a-4c8e-9b7d-3a1f0e6c2b90",
  revision: 3,
  status: "active",
  target: {
    targetId: "ngc7000",
    name: "NGC 7000",
    commonName: "Nébuleuse de l’Amérique du Nord",
  },
  goalMinutes: 720,
  place: {
    name: "Col des Mélèzes",
    latitude: 45,
    longitude: -30,
    timeZone: "UTC",
    horizonMask: mask,
  },
  equipment: { telescopeId: "lunette-72" },
  constraints: {
    minAltitude: 30,
    moonSeparationMinimum: 25,
    moonSeparationMinimumByFilter: { "Ha/OIII": 15 },
  },
  createdAt: "2026-06-20T19:40:00.000Z",
  updatedAt: "2026-09-19T08:12:00.000Z",
});

test("project.schema.json declares a 2020-12 $schema and a stable $id", () => {
  assert.equal(project.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(
    project.$id,
    "https://astroportal.invalid/schemas/api/project.schema.json",
  );
});

test("a project of a catalogue target, of a framing, a list and an archive validate", () => {
  assertValid(project, resource());
  const framed = resource();
  framed.target = {
    framingId: "0f8fad5b-d9cb-469f-a165-70867728950e",
    name: "Mosaïque du Cygne",
  };
  framed.status = "archived";
  delete framed.place.horizonMask;
  delete framed.place.timeZone;
  assertValid(project, framed);
  assertValid(project, { projects: [resource(), framed] });
  assertValid(project, { projects: [] });
  assertValid(project, { archived: true, project: framed });
});

test("a target names exactly one of targetId and framingId", () => {
  const both = resource();
  both.target.framingId = "0f8fad5b-d9cb-469f-a165-70867728950e";
  assertInvalid(project, both);
  const neither = resource();
  delete neither.target.targetId;
  assertInvalid(project, neither);
  const unnamed = resource();
  delete unnamed.target.name;
  assertInvalid(project, unnamed);
});

test("goalMinutes is a whole number of minutes from 30 to 6 000", () => {
  for (const goalMinutes of [30, 480, 6000]) {
    const value = resource();
    value.goalMinutes = goalMinutes;
    assertValid(project, value);
  }
  for (const goalMinutes of [29, 6001, 90.5, "720", null]) {
    const value = resource();
    value.goalMinutes = goalMinutes;
    assertInvalid(project, value);
  }
});

test("a project carries no progress and no unknown status", () => {
  const withProgress = resource();
  withProgress.acquiredMinutes = 250;
  assertInvalid(project, withProgress);
  const deleted = resource();
  deleted.status = "deleted";
  assertInvalid(project, deleted);
  const noEquipment = resource();
  delete noEquipment.equipment;
  assertInvalid(project, noEquipment);
});

test("the place and the constraints are bounded", () => {
  const north = resource();
  north.place.latitude = 91;
  assertInvalid(project, north);
  const unnamed = resource();
  unnamed.place.name = "";
  assertInvalid(project, unnamed);
  const coarseMask = resource();
  coarseMask.place.horizonMask = { enabled: true, points: [] };
  assertInvalid(project, coarseMask);
  const altitude = resource();
  altitude.constraints.minAltitude = 95;
  assertInvalid(project, altitude);
  const missingByFilter = resource();
  delete missingByFilter.constraints.moonSeparationMinimumByFilter;
  assertInvalid(project, missingByFilter);
});

test("the write body: status active or finished, never archived, no server field", () => {
  const { id, revision, createdAt, updatedAt, ...body } = resource();
  assert.ok(id && revision && createdAt && updatedAt);
  assertValid(write, body);
  const { status: _status, ...withoutStatus } = body;
  assertValid(write, withoutStatus);
  assertValid(write, { ...body, status: "finished" });
  assertInvalid(write, { ...body, status: "archived" });
  assertInvalid(write, { ...body, revision: 4 });
});

test("the refusals: a conflict carries the project, a capability refusal names planner.mosaic", () => {
  assertValid(project, {
    error: {
      code: "project_conflict",
      message: "The project changed on another surface.",
    },
    project: resource(),
  });
  assertValid(project, {
    error: {
      code: "capability_required",
      message: "Multi-night plans need another capability.",
    },
    capability: "planner.mosaic",
  });
  assertInvalid(project, {
    error: { code: "capability_required", message: "x" },
    capability: "planner.projects",
  });
});

test("a plan item may carry projectId, in the plan resource and in the planner document", async () => {
  const plan = await schema("api/plan.schema.json");
  const item = {
    id: "item-1",
    targetId: "ngc7000",
    projectId: "5d0c6b1e-2f4a-4c8e-9b7d-3a1f0e6c2b90",
    startMinute: 0,
    endMinute: 200,
  };
  assertValid(plan, {
    id: "5d0c6b1e-2f4a-4c8e-9b7d-3a1f0e6c2b91",
    revision: 1,
    status: "active",
    updatedAt: "2026-06-20T19:40:00.000Z",
    payload: { id: "plan-1", date: "2026-06-20", name: "Nuit", items: [item] },
  });
  const document = await schema("planner/planner-document.schema.json");
  const plannerDocument = (items) => ({
    schemaVersion: 2,
    date: "2026-06-20",
    nights: [{ id: "night-1", date: "2026-06-20", location: null }],
    knownLocations: [],
    plans: [
      {
        id: "plan-1",
        date: "2026-06-20",
        nightId: "night-1",
        name: "Nuit",
        status: "pending",
        items,
      },
    ],
  });
  assertValid(document, plannerDocument([item]));
  assert.ok(
    schemaErrors(document, plannerDocument([{ ...item, projectId: "ngc" }]))
      .length > 0,
    "a projectId that is not a UUID is refused by the document schema",
  );
});

test("the change signal names the projects domain", async () => {
  const signal = await schema("api/change-signal.schema.json");
  assertValid(signal, { cursor: "boot-1:3", domains: ["projects"] });
  assert.deepEqual(
    parseChangeSignalEvent("change", {
      cursor: "boot-1:4",
      domains: ["plans", "projects"],
    }),
    {
      valid: true,
      kind: "change",
      cursor: "boot-1:4",
      domains: ["plans", "projects"],
    },
  );
});
