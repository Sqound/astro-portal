// The web fusion modal's own logic ("Deux versions de ce plan"),
// kept out of `PlannerPage.js` so it can be tested without a DOM.
//
// The Résultat is a list of entries `{ side, item }`: `item` is a deep copy
// of a plan item taken from one of the two versions, `side` says which one
// ("browser" or "other"), so each version's timeline can show whether its
// own copy of a target is the one in the Résultat. A plan holds a target at
// most once (items are keyed by target id), so the Résultat does too.
import { plannedWindow } from "./schedule.js";

// The settings half of the modal: one rule for the web and the server,
// kept in `portal` because the server's resolve route composes the
// merged plan with it too.
export {
  mergePlanFields,
  planFieldChoicesFor,
  planFieldDifferences,
  planFieldRowIds,
  planFieldRows,
  planFieldSideLocal,
  planFieldSideOther,
  samePlanFieldValue,
} from "portal/planner/plan-fields.js";

export const mergeSideBrowser = "browser";
export const mergeSideOther = "other";

const copy = (value) => JSON.parse(JSON.stringify(value));

/**
 * How a version's timeline draws its copy of [itemId]:
 * - "selected": this very copy is in the Résultat (a second click removes it);
 * - "replaced": the other version's copy of the same target is there (a
 *   click swaps it for this one);
 * - "available": the target is not in the Résultat (a click adds it).
 */
export function mergeSlotState(entries, side, itemId) {
  const entry = entries.find((candidate) => candidate.item.id === itemId);
  if (!entry) return "available";
  return entry.side === side ? "selected" : "replaced";
}

/**
 * A click on a target of one version's timeline: adds it, removes it when this
 * same copy is already in the Résultat (so the observer can always change their
 * mind), or swaps in this copy when the other version's copy of the same target
 * is there. The entry keeps its place in the list.
 */
export function toggleMergeEntry(entries, side, item) {
  const index = entries.findIndex((entry) => entry.item.id === item.id);
  if (index >= 0 && entries[index].side === side)
    return entries.filter((_, position) => position !== index);
  const entry = { side, item: copy(item) };
  if (index >= 0)
    return entries.map((current, position) =>
      position === index ? entry : current,
    );
  return [...entries, entry];
}

/** The small cross on a Résultat target, or the editor's own bin. */
export function removeMergeEntry(entries, itemId) {
  return entries.filter((entry) => entry.item.id !== itemId);
}

/**
 * An interval edit on a Résultat target: [patch] is exactly what the planner's
 * own interval editor emits (`startMinute`, `endMinute`, or both when the whole
 * window moves), merged as-is — the same write the plan editor's `updateItem`
 * does. Never checked against the other targets: an overlap is shown, never
 * refused.
 */
export function updateMergeEntryWindow(entries, itemId, patch) {
  return entries.map((entry) =>
    entry.item.id === itemId
      ? { ...entry, item: { ...entry.item, ...patch } }
      : entry,
  );
}

/** "Garder la version de ce navigateur" / "Garder l'autre version". */
export function wholeVersionEntries(items, side) {
  return (items || []).map((item) => ({ side, item: copy(item) }));
}

/** What the Résultat saves: the plan items, in the Résultat's order. */
export function mergeResultItems(entries) {
  return entries.map((entry) => entry.item);
}

/**
 * Each item's effective window on [night] (`plannedWindow`, the plan
 * editor's own placement), as `{ id, start, end }` night minutes. Items
 * whose target has no card tonight are left out, exactly like the plan's
 * own timeline leaves them out.
 */
export function mergeWindows(items, night) {
  if (!night) return [];
  const cardsById = new Map(
    (night.cards || []).map((card) => [card.target.id, card]),
  );
  return (items || [])
    .map((item) => {
      const card = cardsById.get(item.id);
      if (!card) return null;
      const window = plannedWindow(item, card, night);
      return { id: item.id, start: window.start, end: window.end };
    })
    .filter(Boolean);
}

/** The summed duration of [windows], in minutes (the timelines' totals). */
export function mergeTotalMinutes(windows) {
  return windows.reduce(
    (sum, window) => sum + Math.max(0, window.end - window.start),
    0,
  );
}

/**
 * Every pair of [windows] that overlaps, with the shared stretch, sorted by
 * its start: what the Résultat flags (never refuses) so the observer can
 * decide whether to keep both targets running at once or to adjust one.
 */
export function mergeOverlaps(windows) {
  const overlaps = [];
  windows.forEach((first, index) => {
    windows.slice(index + 1).forEach((second) => {
      const start = Math.max(first.start, second.start);
      const end = Math.min(first.end, second.end);
      if (end > start)
        overlaps.push({ firstId: first.id, secondId: second.id, start, end });
    });
  });
  return overlaps.sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
}

/**
 * Stacks one version's targets on as few lanes as possible so two
 * overlapping targets of the same version never hide each other on its
 * timeline (each stays visible and clickable). Greedy by start time:
 * `{ lanes: Map(id → lane), count }`.
 */
export function mergeRailLanes(windows) {
  const laneEnds = [];
  const lanes = new Map();
  [...windows]
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .forEach((window) => {
      let lane = laneEnds.findIndex((end) => end <= window.start);
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(window.end);
      } else laneEnds[lane] = window.end;
      lanes.set(window.id, lane);
    });
  return { lanes, count: Math.max(1, laneEnds.length) };
}
