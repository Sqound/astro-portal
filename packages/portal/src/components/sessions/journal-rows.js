// What the page of a night and the add-a-capture box read of the journal's
// rows: the date of a plan's night, written short with a capital
// (`packages/portal/tests/journal-rows.test.mjs`), and the events a night's
// journal lists once (`journalEntries`). The Journal's own list
// (`journal-list-view.js`) has its module.

const capitalised = (label, locale) =>
  label ? label[0].toLocaleUpperCase(locale) + label.slice(1) : label;

/**
 * « Sam. 12 sept. »: the date of a plan's night (`2026-09-12`, a calendar date
 * with no zone), short, with a capital.
 */
export function journalPlanDate(date, locale) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ""));
  if (!match) return "";
  return capitalised(
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
    ),
    locale,
  );
}

const TARGET_EVENT_TYPES = new Set(
  Object.keys({
    target_started: true,
    target_finished: true,
    target_skipped: true,
  }),
);

const debriefTiming = (event) =>
  event?.timing === "planned" || event?.timing === "reconstructed";

const textOf = (value) =>
  typeof value === "string" && value.length > 0 ? value : null;

/** Whether two journal events name the same target (`session-passages.js`'s rule). */
function sameTarget(left, right) {
  const a = left?.payload ?? {};
  const b = right?.payload ?? {};
  if (textOf(a.planItemId) && textOf(b.planItemId))
    return a.planItemId === b.planItemId;
  const name = (payload) =>
    textOf(payload.targetId) ?? textOf(payload.targetLabel);
  return name(a) !== null && name(a) === name(b);
}

/**
 * The events the « Journal de la nuit » lists: after a debriefing « exécuté », the
 * service also writes the plan's own passages (`timing: planned` or
 * `reconstructed`) — the journal showed every passage twice, measured then
 * planned. A debriefing's start, finish or skip of a target the field
 * journal already started is left out: the measured passage wins over the
 * planned one, as `session-passages.js` counts it. A target the field never
 * started keeps its planned events (they are the only trace of it), and
 * every other event stays, in its order.
 */
export function journalEntries(events) {
  const list = Array.isArray(events) ? events : [];
  const fieldStarts = list.filter(
    (event) => event?.type === "target_started" && !debriefTiming(event),
  );
  return list.filter(
    (event) =>
      !TARGET_EVENT_TYPES.has(event?.type) ||
      !debriefTiming(event) ||
      !fieldStarts.some((start) => sameTarget(start, event)),
  );
}
