import assert from "node:assert/strict";
import test from "node:test";
import {
  OWNER_READABLE_CHECK_REASONS,
  checksOf,
} from "portal/persistence/capture-repository.js";
import { SKY_CHECK_REASONS } from "portal/sky-check/rule.js";

// The owner reads why the automatic check could not decide when the reason
// is about the service or the file (`unsupported_format` and
// `raw_camera_file` say what to send instead), and, since the rule has four
// outcomes, why the team looks first: a person (`person_detected`), or
// neither a sky nor a landscape (`not_recognised`). The figure of the rule
// that fell short stays with the administration: every other reason of the
// rule reads as `not_recognised`.

const row = (result, reason) => ({
  auto_check: result,
  auto_check_reason: reason,
  auto_check_at: "2026-10-21T10:00:00.000Z",
});

test("a check that could not decide says why, in the eight reasons the owner reads", () => {
  for (const reason of OWNER_READABLE_CHECK_REASONS) {
    const checks = checksOf(row("undetermined", reason));
    assert.equal(checks.automatic, "undetermined");
    assert.equal(checks.automaticReason, reason);
  }
  assert.deepEqual(OWNER_READABLE_CHECK_REASONS, [
    "check_off",
    "unreadable",
    "too_large",
    "too_slow",
    "unsupported_format",
    "raw_camera_file",
    "person_detected",
    "not_recognised",
  ]);
});

test("the figures of the rule read as « not recognised », and no reason of any other result reaches the owner", () => {
  const rule = SKY_CHECK_REASONS.undetermined.filter(
    (reason) => !OWNER_READABLE_CHECK_REASONS.includes(reason),
  );
  assert.deepEqual(rule.sort(), [
    "astro_header",
    "calibration_frame",
    "not_a_landscape",
    "people_unchecked",
    "person_doubt",
    "too_few_stars",
  ]);
  for (const reason of rule) {
    const checks = checksOf(row("undetermined", reason));
    assert.equal(checks.automaticReason, "not_recognised", reason);
    assert.equal(JSON.stringify(checks).includes(reason), false, reason);
  }
  // A person, stored as undetermined, says so.
  assert.equal(
    checksOf(row("undetermined", "person_detected")).automaticReason,
    "person_detected",
  );
  for (const [result, reasons] of [
    ["sky", SKY_CHECK_REASONS.sky],
    ["other", SKY_CHECK_REASONS.other],
    ["sky", SKY_CHECK_REASONS.person],
  ])
    for (const reason of reasons) {
      const checks = checksOf(row(result, reason));
      assert.equal("automaticReason" in checks, false, `${result} ${reason}`);
    }
  // A result `other`, read as undetermined by its owner, gives no reason even
  // if the stored one were a file-level word.
  assert.equal(
    "automaticReason" in checksOf(row("other", "unreadable")),
    false,
  );
  // No check yet, no reason.
  assert.equal(
    "automaticReason" in
      checksOf({ auto_check: null, auto_check_reason: null }),
    false,
  );
});
