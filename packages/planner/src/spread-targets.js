/**
 * "Répartir les cibles": puts the targets of a plan that share part of the
 * night one after the other, each in its own window of visibility, so that no
 * two overlap. A target that finds no room becomes "plus le temps ce soir" (a
 * zero-length slot that stays in the plan).
 *
 * Pure and free: the placement is the planner's own (`plannedItemPlacement`),
 * asked target by target against what is already placed, so "Répartir" and the
 * placement of an added target agree on what a good place is. Nothing is
 * invented and nothing is deleted.
 *
 * What it does, in order:
 *
 *  1. the targets whose slot overlaps another's are the ones to look at; the
 *     others stay exactly where they are and are the first thing the others
 *     must avoid;
 *  2. those targets are taken the most constrained first (the narrowest window
 *     of visibility tonight), the earliest slot first among equals;
 *  3. a target whose slot is free of what is already placed keeps it; the
 *     others are placed by the planner's cascade — at their best moment if it
 *     is free, else in the free stretch of their window nearest to it, the
 *     duration shortened to the stretch when that is all there is, never below
 *     the target's own minimum;
 *  4. a target the cascade could only place on top of another has no room:
 *     "plus le temps ce soir".
 *
 * A target with no window of visibility (the exception a person added on
 * purpose, a framing without coordinates) is not moved: the others go round
 * it.
 */
import { noTimeTonightKey } from "./schedule.js";
import {
  placementMinimumMinutes,
  plannedItemPlacement,
} from "./item-placement.js";
import { cardWithinNightSpan } from "./night-span.js";

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

// The slot of an item as it stands; `null` when it holds none.
function slotOf(item) {
  const start = item?.startMinute;
  if (!isNumber(start) || start < 0) return null;
  const end = item.endMinute;
  if (isNumber(end) && end >= start) return { start, end };
  const span = item.durationMinutes;
  if (isNumber(span) && span > 0) return { start, end: start + span };
  return { start, end: start };
}

// The id of the target an item holds (`targetId`, else its own `id`).
function targetKey(item) {
  if (typeof item?.targetId === "string" && item.targetId) return item.targetId;
  return typeof item?.id === "string" && item.id ? item.id : null;
}

function minutesOfWindows(windows, nightStart, total) {
  if (!Array.isArray(windows)) return 0;
  let sum = 0;
  for (const raw of windows) {
    if (!raw || typeof raw !== "object") continue;
    const from = Date.parse(`${raw.start}`);
    const to = Date.parse(`${raw.end}`);
    if (Number.isNaN(from) || Number.isNaN(to)) continue;
    const a = Math.max(0, (from - nightStart) / 60000);
    const b = Math.min(total, (to - nightStart) / 60000);
    if (b > a) sum += b - a;
  }
  return sum;
}

/**
 * The slots `items` (a plan's items) take once the targets that overlap are
 * spread over the night: `{ slots: [{ id, start, end, noTime }] }`, only the
 * slots that moved, in the plan's order; `noTime` when the target found no room
 * (start = end, where it was).
 *
 * `cards` are the planner's cards of the plan's targets (with their
 * `visibilityWindows`, `series` and `integration`), by target id — what
 * `withHorizonMask` made of them. `night` is `{ start, end }`; `span` the
 * plan's chosen part of the night (the placement stays inside it), when it has
 * one. `frozenIds` are items that may not move.
 */
export function spreadOverlappingItems({
  items = [],
  cards = {},
  night,
  span = null,
  frozenIds = [],
} = {}) {
  const none = { slots: [] };
  const nightStart = Date.parse(`${night?.start}`);
  const nightEnd = Date.parse(`${night?.end}`);
  if (Number.isNaN(nightStart) || Number.isNaN(nightEnd)) return none;
  const total = Math.max(1, (nightEnd - nightStart) / 60000);
  const frozen = new Set(frozenIds);

  // The slots as they stand: an item with no time holds none.
  const slots = new Map();
  for (const item of items) {
    const slot = slotOf(item);
    if (slot && slot.end > slot.start) slots.set(`${item.id}`, slot);
  }
  const order = [...slots.keys()].sort(
    (a, b) =>
      slots.get(a).start - slots.get(b).start ||
      slots.get(a).end - slots.get(b).end,
  );
  const involved = new Set();
  for (let i = 0; i < order.length; i += 1)
    for (let j = i + 1; j < order.length; j += 1) {
      if (slots.get(order[j]).start >= slots.get(order[i]).end) break;
      involved.add(order[i]);
      involved.add(order[j]);
    }
  if (!involved.size) return none;

  const byId = new Map(items.map((item) => [`${item.id}`, item]));
  const cardOf = (id) => {
    const key = targetKey(byId.get(id));
    const card = key === null ? undefined : cards[key];
    return card ? cardWithinNightSpan(card, span) : null;
  };
  const movable = (id) => {
    if (!involved.has(id) || frozen.has(id)) return false;
    const card = cardOf(id);
    return (
      Boolean(card) &&
      minutesOfWindows(card.visibilityWindows, nightStart, total) > 0
    );
  };

  const toPlace = order.filter(movable).sort((a, b) => {
    const wa = minutesOfWindows(cardOf(a).visibilityWindows, nightStart, total);
    const wb = minutesOfWindows(cardOf(b).visibilityWindows, nightStart, total);
    return wa - wb || slots.get(a).start - slots.get(b).start;
  });
  const moving = new Set(toPlace);

  // What is already there for the others to avoid: every slot that does not
  // move, then each target as it is placed.
  const placed = order
    .filter((id) => !moving.has(id))
    .map((id) => ({
      id,
      startMinute: slots.get(id).start,
      endMinute: slots.get(id).end,
      durationMinutes: slots.get(id).end - slots.get(id).start,
    }));
  const collides = (start, end) =>
    placed.some((other) => start < other.endMinute && end > other.startMinute);

  const written = new Map();
  for (const id of toPlace) {
    const now = slots.get(id);
    if (!collides(now.start, now.end)) {
      placed.push({
        id,
        startMinute: now.start,
        endMinute: now.end,
        durationMinutes: now.end - now.start,
      });
      continue;
    }
    const base = cardOf(id);
    // Its own id for the placement: the cascade leaves out of what is busy
    // every item that carries the target's id, which would hide a sibling slot
    // of the same target.
    const card = {
      ...base,
      target: { ...(base.target || {}), id: "\u0000spread" },
    };
    const minimumRaw = card.integration?.minimumMinutes;
    const minimum =
      isNumber(minimumRaw) && minimumRaw > 0
        ? Math.max(minimumRaw, placementMinimumMinutes)
        : placementMinimumMinutes;
    const placement = plannedItemPlacement({
      card,
      night,
      items: placed,
      recommendedMinutes: now.end - now.start,
      minimumMinutes: minimum,
    });
    const start = Math.round(placement.startMinute);
    const end = Math.round(placement.endMinute);
    if (placement.reason === "overlap-fallback" || end <= start) {
      const at = Math.round(now.start);
      written.set(id, { id, start: at, end: at, noTime: true });
      continue;
    }
    placed.push({
      id,
      startMinute: start,
      endMinute: end,
      durationMinutes: end - start,
    });
    if (start !== Math.round(now.start) || end !== Math.round(now.end))
      written.set(id, { id, start, end, noTime: false });
  }
  return {
    slots: items.flatMap((item) => written.get(`${item.id}`) ?? []),
  };
}

/** The ids that found no room. */
export const spreadNoTimeIds = (result) =>
  result.slots.filter((slot) => slot.noTime).map((slot) => slot.id);

/** The slot a spread wrote for an item, or `undefined` when it did not move. */
export const spreadSlotOf = (result, id) =>
  result.slots.find((slot) => slot.id === id);

/** The patch that writes a covered slot: zero-length where it was. */
export const noTimePatch = (at) => ({
  startMinute: at,
  endMinute: at,
  durationMinutes: 0,
  [noTimeTonightKey]: true,
});

/** The patch of a slot put back on the night (the marker goes). */
export const timedPatch = (start, end) => ({
  startMinute: start,
  endMinute: end,
  durationMinutes: end - start,
});

/**
 * `items` with the slots `result` wrote: a target put back on the night loses
 * its "plus le temps ce soir", one with no room gets it.
 */
export function itemsWithSpread(items, result) {
  return items.map((item) => {
    const slot = spreadSlotOf(result, `${item.id}`);
    if (!slot) return item;
    if (slot.noTime) return { ...item, ...noTimePatch(slot.start) };
    const { [noTimeTonightKey]: _marker, ...rest } = item;
    return { ...rest, ...timedPatch(slot.start, slot.end) };
  });
}

/** The planner's cards by the id of their target. */
export const spreadCardsByTarget = (cards = []) =>
  Object.fromEntries(
    cards
      .filter((card) => card?.target?.id != null)
      .map((card) => [`${card.target.id}`, card]),
  );

/**
 * A target added to a night: where it lands, and what the plan becomes.
 *
 * The cascade shortens the newcomer down to its own minimum, not to a few
 * minutes; when that still leaves it no room (it could only be put on top of
 * another) the plan is spread over the night if that places every target,
 * and otherwise the newcomer is the one that yields — "plus le temps ce soir",
 * a zero-length slot that stays in the plan. The exception added on purpose
 * (no window of visibility at all) keeps the cascade's own last resort.
 *
 * `card` is the newcomer's card (through `withHorizonMask`), `item` the plan
 * item built for it (before its slot), `items` the plan's items, `cards` the
 * cards of the plan's targets by target id. Returns `{ items, item, reason,
 * placement, spreadCount }`: the plan's next items, the newcomer as written,
 * the reason (`ideal`, `free-slot`, `shortened`, `overlap-fallback`, and
 * `no-time` when it found no room), the cascade's own placement and how many
 * other targets were moved.
 */
export function placeAddedItem({
  card,
  item,
  items = [],
  cards = {},
  night,
  span = null,
}) {
  const own = card?.integration?.minimumMinutes;
  const placement = plannedItemPlacement({
    card: cardWithinNightSpan(card, span),
    night,
    items,
    ...(isNumber(own) && own > placementMinimumMinutes
      ? { minimumMinutes: own }
      : {}),
  });
  const placed = {
    ...item,
    startMinute: placement.startMinute,
    endMinute: placement.endMinute,
    durationMinutes: placement.durationMinutes,
  };
  const plain = {
    items: [...items, placed],
    item: placed,
    reason: placement.reason,
    placement,
    spreadCount: 0,
  };
  if (
    placement.reason !== "overlap-fallback" ||
    !(card?.visibilityWindows?.length > 0)
  )
    return plain;
  const all = [...items, placed];
  const result = spreadOverlappingItems({
    items: all,
    cards: { ...cards, [`${card.target.id}`]: card },
    night,
    span,
  });
  if (result.slots.length && !spreadNoTimeIds(result).length) {
    const spread = itemsWithSpread(all, result);
    return {
      items: spread,
      item: spread[spread.length - 1],
      reason: "free-slot",
      placement,
      spreadCount: result.slots.filter((slot) => slot.id !== `${placed.id}`)
        .length,
    };
  }
  const yielded = {
    ...placed,
    ...noTimePatch(Math.round(placement.startMinute)),
  };
  return {
    items: [...items, yielded],
    item: yielded,
    reason: "no-time",
    placement,
    spreadCount: 0,
  };
}
