import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProjectWrite } from "../dist/validation.js";
import { projectBody } from "./support.mjs";

// The write body of a project (`project.schema.json`, `write`): refused,
// never repaired, when it leaves the contract.

const refusedBody = (body, pattern) =>
  assert.throws(
    () => normalizeProjectWrite(body),
    (error) =>
      error.code === "invalid_request" &&
      error.status === 400 &&
      pattern.test(error.message),
  );

test("a write body is reduced to the resource's fields, its status apart", () => {
  const { status, fields } = normalizeProjectWrite(
    projectBody({ status: "finished" }),
  );
  assert.equal(status, "finished");
  const { status: _status, ...expected } = projectBody();
  assert.deepEqual(fields, expected);
  assert.equal(normalizeProjectWrite(projectBody()).status, null);
});

test("goalMinutes is a whole number from 30 to 6 000", () => {
  for (const goalMinutes of [30, 6000])
    assert.equal(
      normalizeProjectWrite(projectBody({ goalMinutes })).fields.goalMinutes,
      goalMinutes,
    );
  for (const goalMinutes of [29, 6001, 90.5, "720", undefined])
    refusedBody(projectBody({ goalMinutes }), /goalMinutes/);
});

test("a target names exactly one of targetId and framingId", () => {
  refusedBody(
    projectBody({
      target: {
        targetId: "ngc7000",
        framingId: "0f8fad5b-d9cb-469f-a165-70867728950e",
        name: "NGC 7000",
      },
    }),
    /exactly one/,
  );
  refusedBody(projectBody({ target: { name: "NGC 7000" } }), /exactly one/);
  refusedBody(
    projectBody({ target: { framingId: "ngc7000", name: "NGC 7000" } }),
    /UUID/,
  );
  refusedBody(projectBody({ target: { targetId: "ngc7000" } }), /name/);
});

test("unknown fields, progress and server fields are refused", () => {
  refusedBody(projectBody({ acquiredMinutes: 250 }), /acquiredMinutes/);
  refusedBody(projectBody({ revision: 2 }), /revision/);
  refusedBody(
    projectBody({ place: { ...projectBody().place, elevation: 1200 } }),
    /elevation/,
  );
  refusedBody(projectBody({ status: "archived" }), /DELETE/);
  refusedBody(projectBody({ equipment: null }), /equipment/);
  refusedBody(null, /JSON project/);
});

test("the place and the constraints are bounded numbers", () => {
  refusedBody(
    projectBody({ place: { ...projectBody().place, latitude: "45" } }),
    /latitude/,
  );
  refusedBody(
    projectBody({ place: { ...projectBody().place, longitude: 181 } }),
    /longitude/,
  );
  refusedBody(
    projectBody({
      constraints: { ...projectBody().constraints, minAltitude: 95 },
    }),
    /minAltitude/,
  );
  refusedBody(
    projectBody({
      constraints: {
        ...projectBody().constraints,
        moonSeparationMinimumByFilter: { Ha: "" },
      },
    }),
    /Ha/,
  );
  refusedBody(
    projectBody({
      constraints: { minAltitude: 30, moonSeparationMinimum: 25 },
    }),
    /moonSeparationMinimumByFilter/,
  );
});
