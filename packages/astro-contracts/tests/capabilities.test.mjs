import assert from "node:assert/strict";
import test from "node:test";
import { CAPABILITY_NAMES } from "../dist/capabilities.js";

test("every capability name is represented in a profile", () => {
  const profile = {
    "planner.multiple": false,
    "planner.mosaic": false,
    "pointing.solve": false,
    "sync.plan_limit": 1,
    "gallery.private": true,
    "capture.variant_limit": 0,
    "analysis.logs": false,
    "analysis.progression": false,
    "storage.max_file_bytes": 0,
    "storage.quota_bytes": 0,
    "portal.invitations": false,
    "capture.count_limit": 9007199254740991,
    "capture.public": true,
    "history.retention_days": 0,
  };

  for (const name of CAPABILITY_NAMES) assert.ok(name in profile);
});

test("a numeric capability that sets no cap carries one named integer", async () => {
  const { CAPABILITY_UNLIMITED, isUnlimitedCapability } =
    await import("../dist/capabilities.js");
  assert.equal(CAPABILITY_UNLIMITED, Number.MAX_SAFE_INTEGER);
  assert.ok(Number.isSafeInteger(CAPABILITY_UNLIMITED));
  assert.equal(isUnlimitedCapability(CAPABILITY_UNLIMITED), true);
  assert.equal(isUnlimitedCapability(0), false);
});

test("pointing.solve is a capability name, next to planner.mosaic", async () => {
  const { CAPABILITY_NAMES } = await import("../dist/capabilities.js");
  assert.ok(CAPABILITY_NAMES.includes("pointing.solve"));
  assert.equal(
    CAPABILITY_NAMES.indexOf("pointing.solve"),
    CAPABILITY_NAMES.indexOf("planner.mosaic") + 1,
  );
  assert.equal(CAPABILITY_NAMES.length, 14);
});

test("the capture and invitation keys are capability names", async () => {
  const { CAPABILITY_NAMES } = await import("../dist/capabilities.js");
  for (const name of [
    "capture.count_limit",
    "capture.public",
    "portal.invitations",
  ])
    assert.ok(CAPABILITY_NAMES.includes(name), name);
  assert.equal(new Set(CAPABILITY_NAMES).size, CAPABILITY_NAMES.length);
});

test("the capabilities schema requires exactly the fourteen names", async () => {
  const { readFile } = await import("node:fs/promises");
  const schema = JSON.parse(
    await readFile(
      new URL("../schemas/api/capabilities.schema.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual([...schema.required].sort(), [...CAPABILITY_NAMES].sort());
  assert.deepEqual(
    Object.keys(schema.properties).sort(),
    [...CAPABILITY_NAMES].sort(),
  );
  assert.equal(schema.properties["capture.count_limit"].type, "integer");
  assert.equal(schema.properties["capture.public"].type, "boolean");
  assert.equal(schema.properties["portal.invitations"].type, "boolean");
});
