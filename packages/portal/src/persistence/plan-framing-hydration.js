/**
 * The single hydrate/dehydrate pair for a plan item's `framingId` reference
 * Pure and DB-free on purpose, so it is exercised on its own
 * (`packages/portal/tests/plan-framing-hydration.test.mjs`) instead of only
 * through a full plan write.
 *
 * STORED form (what `dehydratePlanItems` produces, and what a plan write
 * actually persists): `target` is reduced to
 * `{ id: framingId, plannerSource: "framing", framingId }`. Any other
 * `target`/`target.framing` content a client sent alongside `framingId` is
 * discarded here — a plan write is never a backdoor to edit a framing.
 *
 * SERVED form (what `hydratePlanItems` produces for every read): `target` is
 * replaced by the framing's own `savedFramingTarget` shape (the framing's
 * current `name` overlays `title`/`designation` so a rename is visible
 * immediately even on a `locked` framing, without ever touching the frozen
 * payload), plus `framingId`, `framingRevision` and `framingState`.
 *
 * An item whose `target.framing` exists WITHOUT `framingId` (data written
 * before framings had ids) is left completely alone by both functions: it
 * is a tolerated read-only relic, never treated as a library framing.
 */

function itemFramingId(item) {
  if (typeof item?.framingId === "string" && item.framingId.trim())
    return item.framingId.trim();
  return null;
}

/** Every distinct `framingId` an item list references (items with a
 * `framingId` only). */
export function referencedFramingIds(items) {
  const ids = new Set();
  for (const item of items || []) {
    const framingId = itemFramingId(item);
    if (framingId) ids.add(framingId);
  }
  return [...ids];
}

/** The form a plan write actually stores: the `target` of an item with a
 * `framingId` is reduced to the bare reference, regardless of what the
 * client also sent. An item with no `framingId` is returned unchanged,
 * legacy relics included. */
export function dehydratePlanItems(items) {
  return (items || []).map((item) => {
    const framingId = itemFramingId(item);
    if (!framingId) return item;
    return {
      ...item,
      framingId,
      target: { id: framingId, plannerSource: "framing", framingId },
    };
  });
}

/**
 * The form every read serves. `framingRecordsById` maps a `framingId` to
 * `{ target, name, revision, state }` (`framing-repository.js`'s
 * `loadFramingHydrationRecords`). A `framingId` absent from the map (the
 * framing was deleted, or the caller did not load it) leaves the item's
 * stored bare-reference target untouched rather than throwing — the same
 * "never plant anything" tolerance as for legacy relics.
 */
export function hydratePlanItems(items, framingRecordsById) {
  return (items || []).map((item) => {
    const framingId = itemFramingId(item);
    if (!framingId) return item;
    const record = framingRecordsById?.get(framingId);
    if (!record) return item;
    const target = {
      ...record.target,
      id: framingId,
      designation: record.name,
      title: record.name,
      plannerSource: "framing",
      framingId,
      framingRevision: record.revision,
      framingState: record.state,
    };
    return { ...item, framingId, target };
  });
}
