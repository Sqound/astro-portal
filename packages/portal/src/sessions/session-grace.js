// The grace of a deleted session: a session the owner
// deletes is kept `SESSION_GRACE_DAYS` days, restorable, before the
// maintenance erases it with its captures and its data. One constant, read by
// the service alone; the phone and the web read `graceDays`, `purgeAt` and
// `daysRemaining` from the answers (api/v1.md, « Deleting a session »).

/** The days a deleted session is kept. */
export const SESSION_GRACE_DAYS = 30;

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

/** The instant a session deleted at `deletedAt` is erased, or `null`. */
export function purgeAtOf(deletedAt) {
  const at = Date.parse(deletedAt ?? "");
  return Number.isFinite(at)
    ? new Date(at + SESSION_GRACE_DAYS * DAY_MILLISECONDS).toISOString()
    : null;
}

/**
 * The whole days left before the erasure, rounded up (a session deleted a
 * minute ago has `30`; one whose last day has begun has `1`; never below `0`).
 */
export function daysRemainingOf(deletedAt, at) {
  const purge = Date.parse(purgeAtOf(deletedAt) ?? "");
  const now = Date.parse(at ?? "");
  if (!Number.isFinite(purge) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.ceil((purge - now) / DAY_MILLISECONDS));
}
