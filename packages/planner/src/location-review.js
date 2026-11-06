// The location-review flag `applyNightPlace` sets on a plan
// (`packages/portal/src/planner/state.js`) is a byte-for-byte
// tested rule (the fixtures under `packages/astro-contracts/fixtures/`) and
// must never grow a field those fixtures do not produce. The annotation and
// clearing this file adds therefore sit outside that rule entirely, at its
// call sites in `PlannerPage.js` (`commitPlaceChange` for the annotation;
// `add`, `addFraming`, `remove`, `updateItem` and the banner's own close
// button for the clearing).

// `location` is the only reason currently produced -- it is the sole trigger
// `applyNightPlace` itself ever applies -- but `date` and `equipment` are
// reserved for a future producer.
export const LocationReviewReason = Object.freeze({
  location: "location",
  date: "date",
  equipment: "equipment",
});

/**
 * Records why `applyNightPlace` newly flagged a plan for review, so the
 * schedule stage's banner can explain the cause instead of only reporting
 * that a review is owed.
 *
 * `before` is the state as it stood immediately before the call, `after` is
 * what `applyNightPlace` returned from it: a plan whose `locationReview`
 * reads `true` in `after` but not in `before` was just flagged by this
 * specific move (a location change, the only trigger that rule itself ever
 * applies); one already flagged keeps whichever reason it was first given,
 * and a plan `after` did not flag passes through as the exact same
 * reference. Returns `after` itself, unchanged, when nothing needed
 * annotating, so a state update that touched no reviewed plan records no
 * spurious difference in undo history.
 *
 * @param {{plans?: Array<object>}} before
 * @param {{plans?: Array<object>}} after
 * @returns {{plans?: Array<object>}}
 */
export function withLocationReviewReason(before, after) {
  const reviewedBefore = new Map(
    (before.plans || []).map((plan) => [plan.id, plan.locationReview === true]),
  );
  const reasonsBefore = new Map(
    (before.plans || []).map((plan) => [plan.id, plan.locationReviewReason]),
  );
  let changed = false;
  const plans = (after.plans || []).map((plan) => {
    if (!plan || plan.locationReview !== true) return plan;
    const wasFlagged = reviewedBefore.get(plan.id) || false;
    const reason = wasFlagged
      ? reasonsBefore.get(plan.id) || LocationReviewReason.location
      : LocationReviewReason.location;
    if (plan.locationReviewReason === reason) return plan;
    changed = true;
    return { ...plan, locationReviewReason: reason };
  });
  return changed ? { ...after, plans } : after;
}

/**
 * Drops a plan's `locationReview`/`locationReviewReason` pair -- the
 * schedule banner's own closing "x", and every edit of a scheduled interval
 * (add, remove, move, resize): once the observer has touched the schedule,
 * the review the banner was asking for is done. Returns the exact same
 * `plan` reference when there is nothing to clear, so a write that never
 * touched a flagged plan records no spurious difference in its own undo
 * entry.
 *
 * @param {object|null|undefined} plan
 * @returns {object|null|undefined}
 */
export function clearLocationReview(plan) {
  if (
    !plan ||
    (plan.locationReview !== true && plan.locationReviewReason == null)
  )
    return plan;
  const next = { ...plan };
  delete next.locationReview;
  delete next.locationReviewReason;
  return next;
}
