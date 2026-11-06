import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertInvalid,
  assertValid,
  registerExternalSchema,
} from "./schema-assert.mjs";

// The nights of a
// multi-night plan — attached afterwards (`nightsWrite`), listed with their
// candidates (`nights`), carried by the project read alone — and a
// multi-night plan created from existing nights (`create`).

const schemasDirectory = new URL("../schemas/", import.meta.url);
const schema = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, schemasDirectory), "utf8"));

registerExternalSchema(
  "integration.schema.json",
  await schema("api/integration.schema.json"),
);
registerExternalSchema(
  "../planner/horizon-mask.schema.json",
  await schema("planner/horizon-mask.schema.json"),
);
const project = await schema("api/project.schema.json");
const def = (name) => ({ $defs: project.$defs, $ref: `#/$defs/${name}` });

const PROJECT = "5d0c6b1e-2f4a-4c8e-9b7d-3a1f0e6c2b90";
const AUG9 = "0b8a3c2e-1d4f-4a6b-9c8d-7e6f5a4b3c21";
const AUG10 = "1c9b4d3f-2e5a-4b7c-8d9e-8f7a6b5c4d32";
const PLAN9 = "2dac5e40-3f6b-4c8d-9eaf-9a8b7c6d5e43";
const PLAN12 = "3ebd6f51-4a7c-4d9e-8fba-ab9c8d7e6f54";

// The Heart (IC 1805): the 9th by its plan item, the 10th by itself.
const aug9 = {
  sessionId: AUG9,
  planId: PLAN9,
  planName: "IC 1805",
  eveningDate: "2026-08-09",
  sessionStatus: "finished",
  link: "plan",
  integrationCount: 1,
  integrationSeconds: 17640,
};
const aug10 = {
  sessionId: AUG10,
  planId: null,
  planName: null,
  eveningDate: "2026-08-10",
  sessionStatus: "finished",
  link: "night",
  integrationCount: 1,
  integrationSeconds: 8010,
};
const plan12 = {
  sessionId: null,
  planId: PLAN12,
  planName: "IC 1805",
  eveningDate: "2026-08-12",
  sessionStatus: null,
  link: null,
  integrationCount: 0,
  integrationSeconds: 0,
  projectId: null,
};

const heart = {
  target: { targetId: "ic1805", name: "IC 1805" },
  goalMinutes: 720,
  place: { name: "Col des Mélèzes", latitude: 45, longitude: 2 },
  equipment: {},
  constraints: {
    minAltitude: 30,
    moonSeparationMinimum: 30,
    moonSeparationMinimumByFilter: {},
  },
};

test("nightsWrite: nights of the journal and plans of one night, at least one list", () => {
  assertValid(def("nightsWrite"), { sessionIds: [AUG9, AUG10] });
  assertValid(def("nightsWrite"), { planIds: [PLAN12] });
  assertValid(def("nightsWrite"), { sessionIds: [AUG9], planIds: [PLAN12] });
  assertInvalid(def("nightsWrite"), {});
  assertInvalid(def("nightsWrite"), { nightIds: [AUG9] });
  assertInvalid(def("nightsWrite"), {
    sessionIds: Array.from({ length: 51 }, () => AUG9),
  });
});

test("nights: the nights of the plan and its candidates, the GET / POST / DELETE answer", () => {
  const body = {
    projectId: PROJECT,
    nights: [aug9, aug10],
    candidates: [plan12],
  };
  assertValid(def("nights"), body);
  assertValid(project, body);
  assertInvalid(def("nights"), { projectId: PROJECT, nights: [aug9] });
  assertInvalid(def("night"), { ...aug9, link: "item" });
  assertInvalid(def("night"), { ...aug9, eveningDate: "9 août" });
  assertInvalid(def("night"), { ...aug9, integrationCount: -1 });
  const { link: _link, ...withoutLink } = aug9;
  assertInvalid(def("night"), withoutLink);
});

test("the project read alone carries its nights; the list never needs them", () => {
  const resource = {
    id: PROJECT,
    revision: 1,
    status: "active",
    ...heart,
    createdAt: "2026-08-13T09:00:00.000Z",
    updatedAt: "2026-08-13T09:00:00.000Z",
  };
  assertValid(project, { ...resource, nights: [aug9, aug10] });
  assertValid(project, { projects: [resource] });
  assertInvalid(project, { ...resource, nights: [{ sessionId: AUG9 }] });
});

test("create: a blank multi-night plan, or one made from existing nights", () => {
  assertValid(def("create"), heart);
  assertValid(def("create"), {
    ...heart,
    id: PROJECT,
    fromSessionIds: [AUG9, AUG10],
    fromPlanIds: [PLAN12],
  });
  assertInvalid(def("create"), { ...heart, nights: [AUG9] });
  // `write` (PUT) never takes them.
  assertInvalid(def("write"), { ...heart, fromSessionIds: [AUG9] });
});

test("the refusals name the capability, the night or the plan", () => {
  assertValid(project, {
    error: { code: "multi_night_not_active", message: "…" },
    capability: "planner.mosaic",
  });
  // The integrations of a plan keep their own right (integration.schema.json).
  assertValid(project, {
    error: { code: "multi_night_not_active", message: "…" },
    capability: "analysis.progression",
  });
  assertValid(project, {
    error: { code: "target_mismatch", message: "…" },
    sessionId: AUG10,
  });
  assertValid(project, {
    error: { code: "plan_not_found", message: "…" },
    planId: PLAN12,
  });
  assertValid(project, {
    error: { code: "capability_required", message: "…" },
    capability: "planner.mosaic",
  });
  assertInvalid(project, {
    error: { code: "capability_required", message: "…" },
    capability: "planner.other",
  });
});
