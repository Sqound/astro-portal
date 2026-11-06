/**
 * The stretches a skip cost: a target
 * skipped and then taken up again (« Reprendre ») leaves a hole between the
 * `target_skipped` and the `target_started` that resumed it. « Nuit en
 * cours » draws it hatched and greyed inside the target's frame; the page
 * of a session draws the same hole from the journal.
 *
 * Pure and JSON-in/JSON-out. Input: `events` — the journal as GET
 * /v1/sessions/{id}/events returns it (`{ eventId, type, recordedAt,
 * timing?, payload }`, in any order, read in session order).
 *
 * Rules:
 *
 * - a `target_skipped` opens a hole for its target; the next
 *   `target_started` of the same target closes it (`resumedAt`);
 * - `ran` says the target had been started before it was skipped: the hole
 *   then runs from the skip; a target skipped before it ever ran lost its
 *   slot from the slot's start, which the caller knows (`skipGapSpan`);
 * - two events name the same target when they carry the same `planItemId`,
 *   or, when one of them carries none, the same `targetId` (else
 *   `targetLabel`) -- the rule of `session-passages.js`;
 * - the debriefing's own events (`timing: planned | reconstructed`) open and
 *   close nothing;
 * - a hole still open at the end of the journal (never resumed) is not a
 *   hole: the target stays skipped.
 */

function instantOf(value) {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function text(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function sameTarget(left, right) {
  if (left.planItemId && right.planItemId)
    return left.planItemId === right.planItemId;
  const name = left.targetId ?? left.targetLabel;
  return name !== null && name === (right.targetId ?? right.targetLabel);
}

/**
 * @typedef {{
 *   targetId: string | null,
 *   targetLabel: string | null,
 *   planItemId: string | null,
 *   skippedAt: number,
 *   resumedAt: number,
 *   ran: boolean,
 * }} SessionSkipGap
 */

/** The resumed skips of a journal, in the order they were resumed. */
export function sessionSkipGaps({ events = [] } = {}) {
  const journal = (Array.isArray(events) ? events : [])
    .map((event) => {
      const payload =
        event?.payload && typeof event.payload === "object"
          ? event.payload
          : {};
      return {
        eventId: String(event?.eventId ?? ""),
        type: event?.type,
        field: event?.timing !== "planned" && event?.timing !== "reconstructed",
        at: instantOf(event?.recordedAt),
        planItemId: text(payload.planItemId),
        targetId: text(payload.targetId),
        targetLabel: text(payload.targetLabel),
      };
    })
    .filter((event) => event.at !== null && event.field)
    .sort(
      (left, right) =>
        left.at - right.at ||
        (left.eventId < right.eventId
          ? -1
          : left.eventId > right.eventId
            ? 1
            : 0),
    );
  const started = [];
  let open = [];
  const gaps = [];
  for (const event of journal) {
    if (event.type === "target_started") {
      const index = open.findIndex((skip) => sameTarget(skip.event, event));
      if (index >= 0) {
        const [skip] = open.splice(index, 1);
        gaps.push({
          targetId: event.targetId,
          targetLabel: event.targetLabel,
          planItemId: event.planItemId,
          skippedAt: skip.event.at,
          resumedAt: event.at,
          ran: skip.ran,
        });
      }
      started.push(event);
    } else if (event.type === "target_skipped") {
      open = open.filter((skip) => !sameTarget(skip.event, event));
      open.push({
        event,
        ran: started.some((start) => sameTarget(start, event)),
      });
    }
  }
  return gaps;
}

/**
 * The hole a skip cost, `{ start, end }` (epoch ms): from the skip, or -- a
 * target skipped before it ever ran -- from the start of its planned slot
 * (`slotStart`) when that comes later; `null` when nothing is left of it.
 */
export function skipGapSpan(gap, slotStart = null) {
  const start =
    !gap.ran && slotStart !== null && slotStart > gap.skippedAt
      ? slotStart
      : gap.skippedAt;
  return gap.resumedAt > start ? { start, end: gap.resumedAt } : null;
}
