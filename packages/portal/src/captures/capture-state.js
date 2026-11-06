/**
 * What the owner of a capture sees of it and may do with it: from its
 * visibility and its two checks (the `checks` of `capture.schema.json`),
 * the end of a block on publishing of its owner, the time and the delay
 * of the notice (`ASTRO_PORTAL_CHECK_NOTICE_DAYS`, 14 days by default),
 * it answers
 *
 * - `state`: the state drawn (`private_sky`, `public_pending`,
 *   `public_verified`, `undetermined` — whose « Publique » is refused
 *   with `needs_review` —, `review_requested`, `protection_notice`,
 *   `protection_lifted`, `refused`, `removed`, `publishing_blocked`; and
 *   two states with no drawing of their own: `check_pending`, the check
 *   has not run yet, and `private_verified`, a private capture the team
 *   approved);
 * - `publishAllowed`: whether the capture may be, or stay, public, and
 *   `publishRefusal`, why not (a machine key: `refused_by_team`,
 *   `publishing_blocked`, `check_pending`, `needs_review`,
 *   `review_pending`, `check_not_passed`), `null` when it may;
 * - `teamLine`: the « Vérifiée par l’équipe » line — `null` (not shown),
 *   `pending`, `approved` or `refused`;
 * - `protectionLiftsAt`: for a capture that did not pass the check, the
 *   date its private protection is (or was) lifted; `null` otherwise;
 * - `publishingBlockedUntil`: the end of the block in force, for the words
 *   of the block; `null` when none.
 *
 * The team wins over the automatic check: a capture whose check did not pass
 * may be public once the team approves it. That rule is written here, once.
 *
 * `moderated: false` is a server with no team (a private server: its owner
 * is the only person who sees a capture): nothing is asked of a check, a
 * private capture is `private_sky` and may be public at once, a public one is
 * `public_pending` with no `teamLine`. No notice, lifting, block or review:
 * they are the team's. `moderated` is true unless named false.
 *
 * Pure and JSON in, JSON out. The server stays the one that refuses (a
 * route never trusts the screen).
 */

/** The delay of the notice of « vérification non passée », in days. */
export const DEFAULT_CHECK_NOTICE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

const time = (iso) => {
  if (typeof iso !== "string" || !iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
};

const plusDays = (iso, days) => {
  const start = time(iso);
  return start === null ? null : new Date(start + days * DAY_MS).toISOString();
};

function answer(state, { allowed, refusal = null, team = null }, context) {
  return {
    state,
    publishAllowed: allowed,
    publishRefusal: allowed ? null : refusal,
    teamLine: team,
    protectionLiftsAt: context.protectionLiftsAt,
    publishingBlockedUntil: context.publishingBlockedUntil,
  };
}

/** The state of a server with no team: see `moderated: false` above. */
function unmoderatedState({ visibility }) {
  const context = { protectionLiftsAt: null, publishingBlockedUntil: null };
  return visibility === "public"
    ? answer("public_pending", { allowed: true }, context)
    : answer("private_sky", { allowed: true }, context);
}

export function captureState({
  visibility,
  checks,
  publishingBlockedUntil = null,
  now,
  noticeDays = DEFAULT_CHECK_NOTICE_DAYS,
  moderated = true,
} = {}) {
  if (moderated === false) return unmoderatedState({ visibility });
  const c = checks ?? {};
  const at = time(now) ?? 0;
  const blockEnd = time(publishingBlockedUntil);
  const blocked = blockEnd !== null && blockEnd > at;
  const days =
    Number.isFinite(noticeDays) && noticeDays >= 0
      ? noticeDays
      : DEFAULT_CHECK_NOTICE_DAYS;

  const failed = c.automatic === "other";
  const protectionLiftsAt = failed
    ? c.protectionLiftedAt ||
      plusDays(c.protectionNoticeAt ?? c.automaticAt, days)
    : null;
  const lifted =
    failed &&
    (Boolean(c.protectionLiftedAt) ||
      (time(protectionLiftsAt) !== null && time(protectionLiftsAt) <= at));
  const approved = c.team === "approved";
  const context = {
    protectionLiftsAt,
    publishingBlockedUntil: blocked ? publishingBlockedUntil : null,
  };

  // Refused by the team: « Publique » stays greyed for this capture (7).
  if (c.team === "refused")
    return answer(
      "refused",
      { allowed: false, refusal: "refused_by_team", team: "refused" },
      context,
    );

  if (visibility === "public") {
    // Out of the gallery after reports, back if the team approves (8).
    if (c.removedFromGalleryAt)
      return answer("removed", { allowed: true, team: "pending" }, context);
    if (approved)
      return answer(
        "public_verified",
        { allowed: true, team: "approved" },
        context,
      );
    return answer(
      "public_pending",
      { allowed: true, team: "pending" },
      context,
    );
  }

  // A private capture that did not pass: the notice, then its lifting
  // (6, 6 bis), whatever the block. The team wins over the automatic
  // check: a failed check that the team approved falls through to the
  // cases below and may be public.
  if (failed && !approved)
    return answer(
      lifted ? "protection_lifted" : "protection_notice",
      {
        allowed: false,
        refusal: "check_not_passed",
        team: approved ? "approved" : lifted ? "pending" : null,
      },
      context,
    );

  // Four warnings: never public before the end of the block (9).
  if (blocked)
    return answer(
      "publishing_blocked",
      {
        allowed: false,
        refusal: "publishing_blocked",
        team: approved ? "approved" : c.reviewRequestedAt ? "pending" : null,
      },
      context,
    );

  if (approved)
    return answer(
      "private_verified",
      { allowed: true, team: "approved" },
      context,
    );

  if (!c.automatic)
    return answer(
      "check_pending",
      { allowed: false, refusal: "check_pending" },
      context,
    );

  if (c.automatic === "sky")
    return answer("private_sky", { allowed: true }, context);

  // « Non déterminée »: never public at once; public when the team
  // approves the verification the owner asked for (4, 5, 5 bis).
  if (c.reviewRequestedAt)
    return answer(
      "review_requested",
      { allowed: false, refusal: "review_pending", team: "pending" },
      context,
    );
  return answer(
    "undetermined",
    { allowed: false, refusal: "needs_review" },
    context,
  );
}
