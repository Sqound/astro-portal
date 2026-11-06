import { DEBRIEF_LOSS_CAUSES } from "portal/debrief-summary.js";
import { minuteInstant } from "../project-night.js";

// The real progress of a multi-night plan ("plan multi-nuits"), from the
// debriefings of its nights: planned, acquired and
// remaining minutes, the cause of every lost minute, and the plan's nights
// with their outcome. Pure and JSON-in/JSON-out.

const MINUTE_MS = 60000;
const PENDING_STATUSES = new Set(["pending", "active"]);

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** An item's slot in minutes from the night's start, `[start, end]` or null. */
function itemSlot(item) {
  const start = finiteNumber(item?.startMinute);
  const end = finiteNumber(item?.endMinute);
  const duration = finiteNumber(item?.durationMinutes);
  if (start !== null && start >= 0) {
    if (end !== null && end >= start) return [start, end];
    if (duration !== null && duration > 0) return [start, start + duration];
    return [start, start];
  }
  return null;
}

function itemPlannedMinutes(item) {
  const slot = itemSlot(item);
  if (slot) return Math.round(slot[1] - slot[0]);
  const duration = finiteNumber(item?.durationMinutes);
  return duration !== null && duration > 0 ? Math.round(duration) : 0;
}

// Ordinal comparison (UTF-16 code units).
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareNights(left, right) {
  return (
    compareText(left.date ?? "", right.date ?? "") ||
    compareText(left.planId, right.planId)
  );
}

function causeOrder(left, right) {
  if (left.cause === "unexplained" && right.cause !== "unexplained") return 1;
  if (right.cause === "unexplained" && left.cause !== "unexplained") return -1;
  return (
    right.minutes - left.minutes ||
    DEBRIEF_LOSS_CAUSES.indexOf(left.cause) -
      DEBRIEF_LOSS_CAUSES.indexOf(right.cause)
  );
}

function entryMinutes(entry, key) {
  return finiteNumber(entry?.[key]) ?? 0;
}

function spanMinutes(span) {
  return Math.round(
    (Date.parse(span.end) - Date.parse(span.start)) / MINUTE_MS,
  );
}

function overlaps(span, slot) {
  if (!slot) return false;
  return (
    Date.parse(span.start) < Date.parse(slot.end) &&
    Date.parse(span.end) > Date.parse(slot.start)
  );
}

/**
 * The lost minutes of one debriefed item, by cause: the spans the summary
 * gave that target (inside its slot when the night has several items of the
 * same target), capped at what the item lost, the rest `unexplained`.
 */
function itemLosses(summary, entry, sharedTarget) {
  const lost = Math.max(
    0,
    entryMinutes(entry, "plannedMinutes") -
      entryMinutes(entry, "acquiredMinutes"),
  );
  const byCause = new Map();
  let remaining = lost;
  const add = (cause, minutes, span) => {
    if (minutes <= 0) return;
    if (!byCause.has(cause))
      byCause.set(cause, { cause, minutes: 0, from: null, kinds: new Set() });
    const record = byCause.get(cause);
    record.minutes += minutes;
    if (span) {
      const start = minuteInstant(span.start);
      if (record.from === null || Date.parse(start) < Date.parse(record.from))
        record.from = start;
      if (typeof span.kind === "string") record.kinds.add(span.kind);
    }
  };
  for (const loss of Array.isArray(summary?.lostByCause)
    ? summary.lostByCause
    : []) {
    for (const span of Array.isArray(loss?.spans) ? loss.spans : []) {
      if (remaining <= 0) break;
      if (span?.targetId !== entry.targetId) continue;
      if (sharedTarget && !overlaps(span, entry.slot)) continue;
      const minutes = Math.min(remaining, spanMinutes(span));
      remaining -= minutes;
      add(loss.cause, minutes, span);
    }
  }
  add("unexplained", remaining, null);
  return { lost, byCause };
}

function nightCauses(byCause) {
  return [...byCause.values()]
    .map((record) => ({
      cause: record.cause,
      minutes: record.minutes,
      from: record.from,
      kinds: [...record.kinds].sort(compareText),
    }))
    .sort(causeOrder);
}

function mergeCauses(target, source) {
  for (const record of source.values()) {
    if (!target.has(record.cause))
      target.set(record.cause, {
        cause: record.cause,
        minutes: 0,
        from: null,
        kinds: new Set(),
      });
    const merged = target.get(record.cause);
    merged.minutes += record.minutes;
    if (
      record.from !== null &&
      (merged.from === null ||
        Date.parse(record.from) < Date.parse(merged.from))
    )
      merged.from = record.from;
    for (const kind of record.kinds) merged.kinds.add(kind);
  }
}

function plannedWindow(plan, items) {
  const nightStart = Date.parse(plan?.nightStartAt);
  if (!Number.isFinite(nightStart)) return { start: null, end: null };
  const slots = items.map(itemSlot).filter(Boolean);
  if (!slots.length) return { start: null, end: null };
  const start = Math.min(...slots.map((slot) => slot[0]));
  const end = Math.max(...slots.map((slot) => slot[1]));
  return {
    start: minuteInstant(nightStart + start * MINUTE_MS),
    end: minuteInstant(nightStart + end * MINUTE_MS),
  };
}

function debriefedWindow(entries) {
  const slots = entries.map((entry) => entry.slot).filter(Boolean);
  if (!slots.length) return { start: null, end: null };
  let start = slots[0].start;
  let end = slots[0].end;
  for (const slot of slots) {
    if (Date.parse(slot.start) < Date.parse(start)) start = slot.start;
    if (Date.parse(slot.end) > Date.parse(end)) end = slot.end;
  }
  return { start: minuteInstant(start), end: minuteInstant(end) };
}

function nightOutcome(entries) {
  if (entries.every((entry) => entry.outcome === "done")) return "done";
  if (entries.every((entry) => entry.outcome === "abandoned")) return "lost";
  return "partial";
}

/**
 * Arguments:
 *
 * - `project`: `{ id, goalMinutes }` (the multi-night plan);
 * - `plans`: the night plans, `[{ id, date, status, nightStartAt?, items }]`
 *   — `status` in either vocabulary (`pending`/`active` for a night still to
 *   come), `items` the plan's items, those of this plan carrying its
 *   `projectId`;
 * - `summaries`: `[{ planId, summary }]`, each `summary` the night's
 *  `debriefSummary` (with the `slot` of each target).
 *
 * A night is **debriefed** when it has a summary that lists its items: it
 * counts its acquired and lost minutes, and its outcome is `done` (every
 * item done), `lost` (every item abandoned) or `partial`. A night still to
 * come (`pending`/`active`, no summary) is **planned**: its minutes are
 * planned, not acquired. A past night without a summary is `undebriefed`
 * and counts for nothing; an archived one without a summary is left out.
 *
 * Returns `{ goalMinutes, acquiredMinutes, remainingMinutes, plannedMinutes,
 * unplacedMinutes, debriefedPlannedMinutes, lostMinutes, lostByCause: [{
 * cause, minutes, nights: [{ planId, date, minutes, from, wholeNight, kinds
 * }] }], nights: [{ planId, date, state, plannedMinutes, acquiredMinutes,
 * lostMinutes, start, end, causes: [{ cause, minutes, from, kinds }] }] }`:
 *
 * - `remainingMinutes` = goal − acquired (never negative);
 * - `plannedMinutes`: the planned nights' minutes; `unplacedMinutes` =
 *   remaining − planned (never negative), what still has no night;
 * - `debriefedPlannedMinutes`/`lostMinutes`: over the debriefed nights;
 * - causes in the debriefing's order (most minutes first, `unexplained`
 *   last); `from` the first lost instant of that cause that night (`null`
 *   without a span); `wholeNight` when the cause took the night's whole
 *   planned time;
 * - nights by date, then plan id.
 */
export function projectProgress({ project, plans = [], summaries = [] } = {}) {
  const projectId = project?.id;
  const goalMinutes = Math.max(
    0,
    Math.round(finiteNumber(project?.goalMinutes) ?? 0),
  );
  const summaryByPlan = new Map();
  for (const entry of Array.isArray(summaries) ? summaries : [])
    if (
      typeof entry?.planId === "string" &&
      entry.summary &&
      typeof entry.summary === "object" &&
      !summaryByPlan.has(entry.planId)
    )
      summaryByPlan.set(entry.planId, entry.summary);

  const nights = [];
  const allCauses = new Map();
  const causeNights = new Map();
  for (const plan of Array.isArray(plans) ? plans : []) {
    if (typeof plan?.id !== "string") continue;
    const items = (Array.isArray(plan.items) ? plan.items : []).filter(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof projectId === "string" &&
        item.projectId === projectId,
    );
    if (!items.length) continue;
    const date = typeof plan.date === "string" ? plan.date : null;
    const summary = summaryByPlan.get(plan.id);
    const perTarget = Array.isArray(summary?.perTarget)
      ? summary.perTarget
      : [];
    const entries = items
      .map((item) =>
        perTarget.find(
          (entry) =>
            typeof item.id === "string" && entry?.planItemId === item.id,
        ),
      )
      .filter(Boolean);
    if (summary && entries.length) {
      const byCause = new Map();
      let plannedMinutes = 0;
      let acquiredMinutes = 0;
      let lostMinutes = 0;
      for (const entry of entries) {
        const sharedTarget =
          perTarget.filter((other) => other?.targetId === entry.targetId)
            .length > 1;
        const losses = itemLosses(summary, entry, sharedTarget);
        plannedMinutes += entryMinutes(entry, "plannedMinutes");
        acquiredMinutes += entryMinutes(entry, "acquiredMinutes");
        lostMinutes += losses.lost;
        mergeCauses(byCause, losses.byCause);
      }
      const causes = nightCauses(byCause);
      mergeCauses(allCauses, byCause);
      for (const cause of causes) {
        if (!causeNights.has(cause.cause)) causeNights.set(cause.cause, []);
        causeNights.get(cause.cause).push({
          planId: plan.id,
          date,
          minutes: cause.minutes,
          from: cause.from,
          wholeNight: plannedMinutes > 0 && cause.minutes === plannedMinutes,
          kinds: cause.kinds,
        });
      }
      nights.push({
        planId: plan.id,
        date,
        state: nightOutcome(entries),
        plannedMinutes,
        acquiredMinutes,
        lostMinutes,
        ...debriefedWindow(entries),
        causes,
      });
      continue;
    }
    const status = typeof plan.status === "string" ? plan.status : "pending";
    if (status === "archived") continue;
    const plannedMinutes = items.reduce(
      (sum, item) => sum + itemPlannedMinutes(item),
      0,
    );
    nights.push({
      planId: plan.id,
      date,
      state: PENDING_STATUSES.has(status) ? "planned" : "undebriefed",
      plannedMinutes,
      acquiredMinutes: 0,
      lostMinutes: 0,
      ...plannedWindow(plan, items),
      causes: [],
    });
  }

  nights.sort(compareNights);
  const sum = (state, key) =>
    nights
      .filter((night) => state.includes(night.state))
      .reduce((total, night) => total + night[key], 0);
  const debriefed = ["done", "partial", "lost"];
  const acquiredMinutes = sum(debriefed, "acquiredMinutes");
  const plannedMinutes = sum(["planned"], "plannedMinutes");
  const remainingMinutes = Math.max(0, goalMinutes - acquiredMinutes);
  return {
    goalMinutes,
    acquiredMinutes,
    remainingMinutes,
    plannedMinutes,
    unplacedMinutes: Math.max(0, remainingMinutes - plannedMinutes),
    debriefedPlannedMinutes: sum(debriefed, "plannedMinutes"),
    lostMinutes: sum(debriefed, "lostMinutes"),
    lostByCause: nightCauses(allCauses).map((cause) => ({
      cause: cause.cause,
      minutes: cause.minutes,
      nights: (causeNights.get(cause.cause) ?? []).sort(compareNights),
    })),
    nights,
  };
}
