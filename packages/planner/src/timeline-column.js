// The planner's timeline as a side column on a wide screen. Its header
// line "3 cibles · 5 h 15 placées · 1 h 40 libre" and, after an
// add, "NGC 7000 placée · raccourcie à 45 min".
import { message } from "portal/i18n.js";
import { durationText } from "portal/written-forms.js";
import { nightMinutes } from "./recommendations.js";
import { plannedWindow } from "./schedule.js";

// From this width the timeline is a column beside the stages; below it, the
// stage after the targets, as before (`portal.css`, the planner's
// `@media (min-width: 761px)`).
export const timelineColumnMinWidth = 761;

// "45 min", "5 h 15", "6 h", in the one writing of durations
// (`portal/written-forms.js`), no-break spaces inside.
export function timelineDurationLabel(minutes, locale = "fr") {
  return durationText(Math.max(0, Math.round(Number(minutes) || 0)), locale);
}

const fill = (text, values) =>
  String(text).replace(/\{(\w+)\}/g, (match, name) =>
    name in values ? String(values[name]) : match,
  );

// The figures of the line, or `null` for an empty plan: the count of targets
// on the timeline, the union of their intervals (two that overlap count
// their shared time once), the night minus that union, and the pairs that
// overlap.
export function timelineTotals({ cards, items, night }) {
  if (!night || !Array.isArray(items) || !Array.isArray(cards)) return null;
  const windows = items
    .map((item) => {
      const card = cards.find((entry) => entry.target?.id === item.id);
      return card ? plannedWindow(item, card, night) : null;
    })
    .filter(Boolean)
    .map((window) => [window.start, window.end]);
  if (!windows.length) return null;
  const total = nightMinutes(night);
  let overlaps = 0;
  for (let i = 0; i < windows.length; i += 1)
    for (let j = i + 1; j < windows.length; j += 1)
      if (windows[i][0] < windows[j][1] && windows[j][0] < windows[i][1])
        overlaps += 1;
  let placed = 0;
  let run = null;
  for (const [start, end] of [...windows].sort((a, b) => a[0] - b[0])) {
    if (end <= start) continue;
    if (!run || start > run[1]) {
      if (run) placed += run[1] - run[0];
      run = [start, end];
    } else if (end > run[1]) run[1] = end;
  }
  if (run) placed += run[1] - run[0];
  const placedMinutes = Math.round(placed);
  return {
    count: windows.length,
    placedMinutes,
    freeMinutes: Math.max(0, total - placedMinutes),
    overlaps,
  };
}

const targetCount = (locale, count) =>
  fill(
    message(
      locale,
      count === 1
        ? "nightSummaryTargetCountOne"
        : "nightSummaryTargetCountOther",
    ),
    { count },
  );

const overlapCount = (locale, count) =>
  fill(
    message(
      locale,
      count === 1 ? "plannerTimelineOverlapOne" : "plannerTimelineOverlapOther",
    ),
    { count },
  );

// "3 cibles · 5 h 15 placées · 1 h 40 libre", "· 1 chevauchement" when
// intervals overlap; the empty plan's invitation otherwise.
export function timelineTotalsLine(locale, totals) {
  if (!totals) return message(locale, "plannerEmptyPlanTitle");
  const base = fill(message(locale, "plannerTimelineTotals"), {
    targets: targetCount(locale, totals.count),
    placed: timelineDurationLabel(totals.placedMinutes, locale),
    free: timelineDurationLabel(totals.freeMinutes, locale),
  });
  return totals.overlaps > 0
    ? `${base} · ${overlapCount(locale, totals.overlaps)}`
    : base;
}

// "3 cibles réparties dans la nuit.": what an add had to move.
export const spreadDoneLine = (locale, count) =>
  fill(
    message(
      locale,
      count === 1 ? "plannerSpreadDoneOne" : "plannerSpreadDoneOther",
    ),
    { count },
  );

// The add line by placement reason: "ideal" and "free-slot" "NGC
// 7000 placée", "shortened" "… · raccourcie à 45 min",
// "overlap-fallback" "… · 1 chevauchement", "no-time" "NGC 7000 : plus le
// temps ce soir" (no room even once the plan was spread); an add that spread
// the plan says how many targets moved.
export function timelineAddLine(
  locale,
  { designation, reason, minutes, spreadCount = 0 },
) {
  if (reason === "no-time")
    return fill(message(locale, "plannerPlacementLineNoTime"), {
      name: designation,
    });
  if (spreadCount > 0) return spreadDoneLine(locale, spreadCount);
  if (reason === "shortened")
    return fill(message(locale, "plannerTimelineAddedShortened"), {
      designation,
      duration: timelineDurationLabel(minutes, locale),
    });
  if (reason === "overlap-fallback")
    return fill(message(locale, "plannerTimelineAddedOverlap"), {
      designation,
      overlap: overlapCount(locale, 1),
    });
  return fill(message(locale, "plannerTimelineAddedPlaced"), { designation });
}

// With no target open, the plan's targets
// under the timeline, in the order of the night — sorted by the start of the
// slot the timeline draws, then by its end, then in the plan's own order. A
// target whose card has not resolved is not listed (the timeline does not
// draw it either).
export function timelinePlanTargets({ cards, items, night }) {
  if (!night || !Array.isArray(items) || !Array.isArray(cards)) return [];
  return items
    .map((item, order) => {
      const card = cards.find((entry) => entry.target?.id === item.id);
      if (!card) return null;
      const window = plannedWindow(item, card, night);
      if (!window) return null;
      const start = Number(window.start);
      const end = Number(window.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      return { itemId: item.id, card, item, start, end, order };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || a.end - b.end || a.order - b.order);
}

// "Dans ce plan · 19:55 → 21:05 · 1 h 10" (board
// `TimelinePanelNoSelection`): [clock] writes a minute of the night as the
// page writes its hours.
export function timelinePlanSlotLine(locale, { start, end }, clock) {
  return `${message(locale, "plannerTargetInPlan")} · ${clock(start)} → ${clock(end)} · ${timelineDurationLabel(end - start, locale)}`;
}
