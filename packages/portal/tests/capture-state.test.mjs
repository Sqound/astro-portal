import assert from "node:assert/strict";
import test from "node:test";
import * as exports from "../dist/captures/capture-state.js";

const { DEFAULT_CHECK_NOTICE_DAYS, captureState } = exports;

// The pure rule behind `GestionCaptureStates`. Every drawn state is in
// the shared fixture `capture-state`; these tests hold what the fixture
// cannot say.

const now = "2026-10-07T08:00:00.000Z";

test("the notice lasts 14 days by default, and a malformed delay keeps them", () => {
  assert.equal(DEFAULT_CHECK_NOTICE_DAYS, 14);
  const checks = {
    automatic: "other",
    protectionNoticeAt: "2026-10-06T10:00:00.000Z",
  };
  for (const noticeDays of [undefined, -1, Number.NaN])
    assert.equal(
      captureState({ visibility: "private", checks, now, noticeDays })
        .protectionLiftsAt,
      "2026-10-20T10:00:00.000Z",
    );
});

test("the team wins over a failed automatic check", () => {
  const failed = {
    automatic: "other",
    protectionNoticeAt: "2026-10-01T10:00:00.000Z",
    protectionLiftedAt: "2026-10-02T10:00:00.000Z",
  };
  // The check alone: the capture does not become public.
  const alone = captureState({ visibility: "private", checks: failed, now });
  assert.equal(alone.publishAllowed, false);
  assert.equal(alone.publishRefusal, "check_not_passed");
  // The team's approval opens it, with its line.
  const approved = captureState({
    visibility: "private",
    checks: { ...failed, team: "approved" },
    now,
  });
  assert.equal(approved.publishAllowed, true);
  assert.equal(approved.publishRefusal, null);
  assert.equal(approved.state, "private_verified");
  assert.equal(approved.teamLine, "approved");
  // Still inside the notice, before any lifting: the team's word is enough.
  const inNotice = captureState({
    visibility: "private",
    checks: {
      automatic: "other",
      protectionNoticeAt: "2026-10-06T10:00:00.000Z",
      team: "approved",
    },
    now,
  });
  assert.equal(inNotice.publishAllowed, true);
  // Once public, it is drawn verified.
  assert.equal(
    captureState({
      visibility: "public",
      checks: { ...failed, team: "approved" },
      now,
    }).state,
    "public_verified",
  );
  // A refusal by the team still wins over everything.
  assert.equal(
    captureState({
      visibility: "private",
      checks: { ...failed, team: "refused" },
      now,
    }).publishRefusal,
    "refused_by_team",
  );
  // A block on publishing still holds an approved capture back.
  assert.equal(
    captureState({
      visibility: "private",
      checks: { ...failed, team: "approved" },
      publishingBlockedUntil: "2026-11-05T12:00:00.000Z",
      now,
    }).publishRefusal,
    "publishing_blocked",
  );
  // The rule has no switch of its own: nothing to turn off.
  assert.equal("TEAM_APPROVAL_OVERRIDES_FAILED_CHECK" in exports, false);
});

test("no checks at all, or an unreadable block, is a capture not checked yet and no block", () => {
  assert.deepEqual(captureState({ visibility: "private", now }), {
    state: "check_pending",
    publishAllowed: false,
    publishRefusal: "check_pending",
    teamLine: null,
    protectionLiftsAt: null,
    publishingBlockedUntil: null,
  });
  const answer = captureState({
    visibility: "private",
    checks: { automatic: "sky" },
    publishingBlockedUntil: "not a date",
    now,
  });
  assert.equal(answer.state, "private_sky");
  assert.equal(answer.publishingBlockedUntil, null);
});

test("a refusal by the team wins over everything, public or private, blocked or not", () => {
  for (const visibility of ["public", "private"])
    for (const publishingBlockedUntil of [null, "2026-11-05T12:00:00.000Z"]) {
      const answer = captureState({
        visibility,
        checks: {
          automatic: "sky",
          team: "refused",
          removedFromGalleryAt: "2026-10-05T00:00:00.000Z",
        },
        publishingBlockedUntil,
        now,
      });
      assert.equal(answer.state, "refused");
      assert.equal(answer.publishRefusal, "refused_by_team");
      assert.equal(answer.teamLine, "refused");
    }
});

test("a server with no team (moderated: false) asks nothing of a check: every capture is the sky and may be public at once", () => {
  const free = (changes) => captureState({ now, moderated: false, ...changes });
  // Whatever was stored -- nothing yet, a person, a result `other`, a team's
  // refusal of an earlier life of the database, a block -- the capture is the
  // sky: no check to wait for, no notice, no lifting, no review.
  for (const checks of [
    {},
    { automatic: "sky" },
    { automatic: "undetermined", automaticReason: "person_detected" },
    {
      automatic: "other",
      protectionNoticeAt: "2026-10-01T10:00:00.000Z",
    },
    {
      automatic: "undetermined",
      team: "refused",
      reviewRequestedAt: "2026-10-01T10:00:00.000Z",
    },
  ]) {
    const state = free({
      visibility: "private",
      checks,
      publishingBlockedUntil: "2027-01-01T00:00:00.000Z",
    });
    assert.equal(state.state, "private_sky", JSON.stringify(checks));
    assert.equal(state.publishAllowed, true);
    assert.equal(state.publishRefusal, null);
    assert.equal(state.teamLine, null);
    assert.equal(state.protectionLiftsAt, null);
    assert.equal(state.publishingBlockedUntil, null);
  }
  // Public: drawn, with no line of the team and no removal.
  const published = free({
    visibility: "public",
    checks: { automatic: "undetermined", removedFromGalleryAt: now },
  });
  assert.equal(published.state, "public_pending");
  assert.equal(published.teamLine, null);
  assert.equal(published.publishAllowed, true);
  // The default stays the service's: a team looks first.
  const team = captureState({
    visibility: "private",
    checks: { automatic: "undetermined" },
    now,
  });
  assert.equal(team.publishAllowed, false);
  assert.equal(team.publishRefusal, "needs_review");
});
