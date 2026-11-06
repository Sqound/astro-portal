/**
 * The targets of a plan that overlap in time. A plan with such targets is not
 * launched until it is edited; the web launches nothing (no execution page),
 * so it only flags the saved plan.
 */

/**
 * An item's time slot — `startMinute`/`endMinute`, falling back to
 * `durationMinutes` for a missing end (the contract's `slotStart`/`slotEnd`
 * rule); `null` when it carries none. A zero-length slot ("plus le temps ce
 * soir") is a slot that holds no time.
 */
export function planItemSlot(item) {
  const start = item?.startMinute;
  if (typeof start !== "number" || !Number.isFinite(start) || start < 0)
    return null;
  const end = item.endMinute;
  if (typeof end === "number" && Number.isFinite(end) && end >= start)
    return { start, end };
  const duration = item.durationMinutes;
  if (typeof duration === "number" && Number.isFinite(duration) && duration > 0)
    return { start, end: start + duration };
  return { start, end: start };
}

/**
 * Every pair of [items] (a plan's `items`) whose slots intersect, earlier slot
 * first, with the shared stretch. Touching slots do not overlap; an item with
 * no slot or a zero-length one overlaps nothing.
 */
export function planItemOverlaps(items) {
  const slots = [];
  for (const item of items || []) {
    const id = item?.id == null ? "" : String(item.id);
    const slot = planItemSlot(item);
    if (!id || !slot || slot.end <= slot.start) continue;
    slots.push({ id, ...slot });
  }
  slots.sort((a, b) => a.start - b.start || a.end - b.end);
  const overlaps = [];
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      if (slots[j].start >= slots[i].end) break;
      overlaps.push({
        firstId: slots[i].id,
        secondId: slots[j].id,
        start: slots[j].start,
        end: Math.min(slots[i].end, slots[j].end),
      });
    }
  }
  return overlaps;
}
