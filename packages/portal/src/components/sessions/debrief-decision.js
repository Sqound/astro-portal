// Framework-free helpers for the debriefing screen: building the exact request
// body debrief.schema.json's `$defs.request` describes from the form's own state,
// formatting a plan version's date for the "two versions" choice, and turning a
// target checklist into `sessionAdjustments.targets`. Kept apart from
// DebriefScreen.js so they can be unit-tested without React
// (packages/portal/tests/debrief-decision.test.mjs).

// The registry's own closed list (session-events/target-skipped.schema.json
// properties.reason.enum), restated here on the same principle
// packages/portal/src/api/debrief.js's own SKIP_REASONS does — both are
// pinned against debrief.schema.json's $defs.skipReason by
// packages/astro-contracts/tests/sessions.test.mjs.
export const SKIP_REASONS = [
  "weather",
  "equipment",
  "time",
  "visibility",
  "other",
];

const DATETIME_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * The IANA zone the debriefing screen shows and edits its times in: the
 * plan's own observing place (`payload.location.timeZone`), because "last
 * night, 21:30 to 02:10" only means something in the time of the place the
 * person observed from. An absent or unusable zone reads as UTC, exactly as
 * the planner's own `validTimeZone` does, and the screen then says so.
 */
export function debriefTimeZone(value) {
  if (typeof value !== "string" || !value) return "UTC";
  // `Etc/UTC` is UTC, written « UTC ».
  if (value === "Etc/UTC") return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    return "UTC";
  }
}

function wallClockParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const read = (type) => parts.find((part) => part.type === type)?.value;
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  };
}

/** How far east of UTC `timeZone` sits at `date`, in milliseconds. */
function zoneOffsetMs(date, timeZone) {
  const wall = wallClockParts(date, timeZone);
  const wallAsUtc = Date.UTC(
    Number(wall.year),
    Number(wall.month) - 1,
    Number(wall.day),
    Number(wall.hour),
    Number(wall.minute),
  );
  return wallAsUtc - Math.floor(date.getTime() / 60000) * 60000;
}

/**
 * An ISO 8601 instant ("2026-09-16T01:50:00.000Z") to the value a native
 * `<input type="datetime-local">` accepts, as the wall clock of `timeZone`
 * ("2026-09-16T10:50" in Asia/Tokyo). Seconds are dropped: the field edits
 * minutes.
 */
export function toDateTimeLocalInputValue(iso, timeZone = "UTC") {
  if (typeof iso !== "string") return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const wall = wallClockParts(date, debriefTimeZone(timeZone));
  return `${wall.year}-${wall.month}-${wall.day}T${wall.hour}:${wall.minute}`;
}

/**
 * The inverse of toDateTimeLocalInputValue: a wall clock of `timeZone` back
 * to a UTC instant; "" or malformed -> null. Two passes, like astro-core's
 * own `zonedDate`, so a daylight-saving transition between the guess and the
 * answer is accounted for.
 */
export function fromDateTimeLocalInputValue(value, timeZone = "UTC") {
  const match =
    typeof value === "string" ? value.match(DATETIME_LOCAL_PATTERN) : null;
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const base = Date.UTC(year, month - 1, day, hour, minute);
  if (Number.isNaN(base)) return null;
  const zone = debriefTimeZone(timeZone);
  const guess = base - zoneOffsetMs(new Date(base), zone);
  return new Date(base - zoneOffsetMs(new Date(guess), zone)).toISOString();
}

/**
 * The session preview's prefilled, editable start/end — "from the plan
 * (derived night)": the queue's own nightStartAt/
 * nightEndAt when the server could derive them, else empty so the person
 * fills them in rather than seeing an invented time. Shown in the plan's
 * own local time.
 */
export function defaultSessionWindow({
  nightStartAt,
  nightEndAt,
  timeZone = "UTC",
} = {}) {
  return {
    startedAt: toDateTimeLocalInputValue(nightStartAt, timeZone),
    finishedAt: toDateTimeLocalInputValue(nightEndAt, timeZone),
  };
}

function clampedNote(value, maxLength) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/**
 * One target checklist row -> one debrief.schema.json `$defs.targetAdjustment`.
 * `row.targetId` must be the PLAN ITEM's own `id` (api/v1.md, "Targets ->
 * events": "let A be the entry of D.sessionAdjustments.targets whose
 * targetId equals I.id") — not `item.targetId`, which only names the shared
 * catalogue entry. `row.checked` true with no note is "done"; true with a
 * note is "modified" (done, but not as planned, the note says how); false is
 * "skipped", with an optional registry reason and a note bounded at 300
 * characters rather than the 500 a done/modified note gets — the same
 * narrower bound debrief.schema.json's own allOf enforces. A checked row with
 * `row.partial` is "partial" (observed for part of its slot), and a checked row
 * carries `row.acquiredMinutes` (whole minutes, 0 or more) when the person
 * declared it; a skipped row never does.
 */
export function targetAdjustmentsFromChecklist(rows = []) {
  return rows
    .map((row) => {
      const targetId = String(row?.targetId || "").trim();
      if (!targetId) return null;
      if (row.checked) {
        const note = clampedNote(row.note, 500);
        const acquiredMinutes =
          Number.isSafeInteger(row.acquiredMinutes) && row.acquiredMinutes >= 0
            ? row.acquiredMinutes
            : null;
        return {
          targetId,
          state: row.partial ? "partial" : note ? "modified" : "done",
          ...(note ? { note } : {}),
          ...(acquiredMinutes !== null ? { acquiredMinutes } : {}),
          ...declaredFigures(row),
        };
      }
      const reason = SKIP_REASONS.includes(row.reason) ? row.reason : null;
      const note = clampedNote(row.note, 300);
      return {
        targetId,
        state: "skipped",
        ...(reason ? { reason } : {}),
        ...(note ? { note } : {}),
        // « Retirée au débriefing »: sent with `skipped`, the value an
        // older reader understands.
        ...(row.removed ? { removed: true } : {}),
      };
    })
    .filter(Boolean);
}

/**
 * What the person declares for a target they observed: the frames (a whole
 * number, 0 or more), the exposure of one frame (more than 0 s, a day at
 * most) and the hours it ran, as instants — never turned into events,
 * stored with the debriefing.
 */
function declaredFigures(row) {
  const figures = {};
  if (Number.isSafeInteger(row.frameCount) && row.frameCount >= 0)
    figures.frameCount = row.frameCount;
  if (
    typeof row.exposureSeconds === "number" &&
    row.exposureSeconds > 0 &&
    row.exposureSeconds <= 86_400
  )
    figures.exposureSeconds = row.exposureSeconds;
  for (const key of ["startedAt", "finishedAt"])
    if (typeof row[key] === "string" && !Number.isNaN(Date.parse(row[key])))
      figures[key] = row[key];
  return figures;
}

/**
 * The targets added at the debriefing (`addedTargets` of the request): a
 * target of the catalogue or of the space the plan did not have, with the
 * hours, the frames and the filter the person gives (at most 32, a filter of
 * 40 characters).
 */
export function addedTargetsFromRows(rows = []) {
  return rows
    .map((row) => {
      const targetId = String(row?.targetId || "").trim();
      if (!targetId) return null;
      const filter = clampedNote(row.filter, 40);
      return {
        targetId,
        ...declaredFigures(row),
        ...(filter ? { filter } : {}),
      };
    })
    .filter(Boolean)
    .slice(0, 32);
}

/**
 * The exact POST /v1/plans/{planId}/debrief body for the current form state,
 * matching debrief.schema.json's `$defs.request`. `abandoned` never carries
 * `session`, `sessionAdjustments` or `note`: it creates a session of its own
 * without any event, so a client-side note would silently be discarded rather
 * than recorded — it carries its `reason`. `addedEvents`, `eventMoves` and
 * `eventReplacements` are already in the wire form (see `session-rework.js`).
 */
export function buildDebriefDecisionBody({
  outcome,
  baseVersion = null,
  setAsideVersionId = null,
  sessionStartedAt = null,
  sessionFinishedAt = null,
  targetRows = [],
  addedRows = [],
  reason = null,
  note = "",
  addedEvents = [],
  eventMoves = [],
  eventReplacements = [],
} = {}) {
  const body = { outcome };
  if (baseVersion) body.baseVersion = baseVersion;
  if (baseVersion === "set_aside" && setAsideVersionId)
    body.setAsideVersionId = setAsideVersionId;

  // A night not carried out keeps a session of its own, with the reason the
  // person gives: never targets, never a note.
  if (outcome === "abandoned") {
    if (SKIP_REASONS.includes(reason)) body.reason = reason;
    return body;
  }

  const session = {};
  if (sessionStartedAt) session.startedAt = sessionStartedAt;
  if (sessionFinishedAt) session.finishedAt = sessionFinishedAt;
  if (Object.keys(session).length) body.session = session;

  if (outcome === "partial") {
    body.sessionAdjustments = {
      targets: targetAdjustmentsFromChecklist(targetRows),
    };
    const added = addedTargetsFromRows(addedRows);
    if (added.length) body.addedTargets = added;
  }

  // Events the person adds at the debriefing and reports they move (the forms
  // of the rework's `addedEvents` / `eventMoves`, which the service reads for
  // `executed` and `partial`, never for `abandoned`).
  if (addedEvents.length) body.addedEvents = addedEvents;
  if (eventMoves.length) body.eventMoves = eventMoves;
  if (eventReplacements.length) body.eventReplacements = eventReplacements;

  const trimmedNote = clampedNote(note, 500);
  if (trimmedNote) body.note = trimmedNote;

  return body;
}

/**
 * An instant of a session (its start, its end, an event) for the journal
 * pages: the wall clock of the plan's observing place when the session has
 * one, and otherwise UTC, said so — a direct session carries no place, and
 * an unlabelled hour would be read as local time. The caller passes the zone
 * the page resolved for the session's place.
 */
export function formatSessionInstant(iso, locale = "en", timeZone = null) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const zone = debriefTimeZone(timeZone);
  const text = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
    timeZone: zone,
  }).format(date);
  // « UTC » is written whenever the hours are UTC: a place without a zone,
  // and a zone that is UTC itself (`UTC`, `Etc/UTC`) -- never a bare hour.
  return zone === "UTC" ? `${text} UTC` : text;
}

/**
 * An instant formatted for a sentence of the debriefing screen — a plan
 * version's `createdAt` in the "two versions" choice ("web, {date} / field,
 * {date}"), a device's last synchronization in the stale-device banner — in
 * the plan's own local time, like the session-window fields. A fixed zone
 * also keeps the server render and the browser render identical.
 */
export function formatVersionDate(iso, locale = "en", timeZone = "UTC") {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
    timeZone: debriefTimeZone(timeZone),
  }).format(date);
}

/**
 * A plan's own `payload.date` ("2026-08-29", a plain calendar date with no
 * time or zone — the night-OF date, not an instant) as a person reads it,
 * never as the raw ISO string. Shared by the debrief queue's own entries
 * and the debriefing screen's intro sentence, which both name this same
 * date. Parsed as UTC and formatted back in UTC so the calendar day never
 * shifts with the reader's own clock.
 */
export function formatNightDate(value, locale = "en") {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(
    new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    ),
  );
}
