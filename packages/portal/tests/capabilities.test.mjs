import assert from "node:assert/strict";
import test from "node:test";
import { can, staticProfile } from "../dist/capabilities/provider.js";

const capabilities = {
  "planner.multiple": false,
  "planner.mosaic": true,
  "pointing.solve": true,
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
  "history.retention_days": 90,
};

test("capabilities support boolean and numeric gates", async () => {
  assert.equal(can(capabilities, "planner.mosaic"), true);
  assert.equal(can(capabilities, "planner.multiple"), false);
  assert.equal(can(capabilities, "sync.plan_limit"), true);
  assert.equal(can(capabilities, "storage.quota_bytes"), false);
  assert.deepEqual(
    await staticProfile(capabilities).capabilitiesFor(null),
    capabilities,
  );
});

test("the open-source profile withholds pointing.solve, which is the application's, and opens planner.mosaic, which the server serves", async () => {
  const { OPEN_SOURCE_PROFILE } =
    await import("../dist/capabilities/profiles.js");
  assert.equal(OPEN_SOURCE_PROFILE["pointing.solve"], false);
  assert.equal(OPEN_SOURCE_PROFILE["planner.mosaic"], true);
  assert.equal(can(OPEN_SOURCE_PROFILE, "pointing.solve"), false);
  assert.equal(can(capabilities, "pointing.solve"), true);
});

// Everything is open on a private
// server — the analysis of the logs, the progression, and the stacking,
// which follows `analysis.progression` (no fifteenth key; the strict
// readers of the `Capabilities` contract keep their fourteen).
test("the open-source profile grants the three analysis treatments, with fourteen keys and no offer named", async () => {
  const { OPEN_SOURCE_PROFILE } =
    await import("../dist/capabilities/profiles.js");
  const { CAPABILITY_NAMES } = await import("astro-contracts/capabilities");
  assert.equal(OPEN_SOURCE_PROFILE["analysis.logs"], true);
  assert.equal(OPEN_SOURCE_PROFILE["analysis.progression"], true);
  assert.equal(can(OPEN_SOURCE_PROFILE, "analysis.progression"), true);
  assert.deepEqual(
    Object.keys(OPEN_SOURCE_PROFILE).sort(),
    [...CAPABILITY_NAMES].sort(),
  );
  assert.equal(Object.keys(OPEN_SOURCE_PROFILE).length, 14);
  assert.ok(!("analysis.stacking" in OPEN_SOURCE_PROFILE));
});
