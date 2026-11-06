// The detail of the planner's sync status line: what waits, when the last
// attempt was and how it ended, and why it failed -- in three plain reasons.
//
// The web synchronizes one document (the space's plans) and the plans of the
// browser that wait to join it; there is no queue of equipment, favorites or
// error logs on the web, so the summary has two rows. Nothing
// personal is kept: a kind, an hour, a reason and a status or code.

/**
 * Reads what a send threw as one of the three reasons.
 *
 * - no network on the device (`online` false) is the network's, whatever the
 *   error says;
 * - the service answered and said no (`status` 4xx, or a `code` of its own
 *   without a status): a refusal, with its status or code;
 * - anything else -- a `fetch` that failed, a `5xx`, an answer that is not
 *   JSON (a front door that is starting) -- is a service that does not answer.
 *
 * Nothing of the message of the error is kept.
 */
export function describeSyncFailure(error, { online = true } = {}) {
  if (online === false) return { kind: "offline" };
  const status = Number(error?.status ?? error?.statusCode) || null;
  const code =
    typeof error?.code === "string" && error.code ? error.code : null;
  if (status && status >= 400 && status < 500)
    return { kind: "refused", status, code };
  if (!status && code) return { kind: "refused", code };
  return { kind: "unreachable" };
}

/** What a refusal shows as its code: the status, else the service's code. */
export function shownSyncCode(failure) {
  return failure?.status ? String(failure.status) : failure?.code || "—";
}

/**
 * The rows of what waits. `edits`: the space's document holds changes it has
 * not sent (the web sends the document as a whole, so there is no count by
 * plan). `browserPlans`: the plans of this browser that wait to join the
 * space (a number).
 */
export function syncPendingRows({ status, edits = false, browserPlans = 0 }) {
  if (status === "local") return [];
  const rows = [];
  if (edits || status === "pending") rows.push({ kind: "edits" });
  if (browserPlans > 0)
    rows.push({ kind: "browserPlans", count: browserPlans });
  return rows;
}

const SAME_DAY = 24 * 60 * 60 * 1000;

function localMidnight(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * When an attempt was: the hour alone today, then
 * "hier", then the date (with the year when it is not this year's).
 * Returns the message key and the values it takes.
 */
export function syncAttemptWhen(at, now, locale) {
  const when = new Date(at);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(when);
  const days = Math.round((localMidnight(now) - localMidnight(at)) / SAME_DAY);
  if (days <= 0) return { key: "plannerSyncDetailWhenToday", values: { time } };
  if (days === 1)
    return { key: "plannerSyncDetailWhenYesterday", values: { time } };
  const date = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(when.getFullYear() === new Date(now).getFullYear()
      ? {}
      : { year: "numeric" }),
  }).format(when);
  return { key: "plannerSyncDetailWhenOn", values: { date, time } };
}
