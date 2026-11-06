// The targets another plan of the same night already holds.
//
// Several plans the same night are several rigs: a second photo plan is for a
// second camera, so proposing it the targets the first photo plan holds would
// send both rigs to the same sky. A visual plan is another matter: an evening
// at the eyepiece and a night of exposures may well share a target. So a
// suggestion for a plan leaves out the targets of the other plans of that
// night of the SAME nature (photo with photo, visual with visual) and only
// those. One rule for every suggestion entry of the night.

/** Whether a plan is a visual one: its equipment's mode. */
export const planIsVisual = (plan) => plan?.equipment?.mode === "visual";

/**
 * The ids of the targets held by the plans of `plans` that are of `date`, of
 * the nature `visual` (true: visual, false: photo), other than `exceptPlanId`.
 * A plan that was abandoned or archived holds nothing. Sorted, no duplicates.
 */
export function targetIdsTakenOnNight(
  plans,
  { date, visual = false, exceptPlanId = null } = {},
) {
  if (!date) return [];
  const taken = new Set();
  for (const plan of plans || []) {
    // A plan with no date of its own is one the caller already chose for the
    // night.
    if (!plan || (plan.date != null && plan.date !== date)) continue;
    if (exceptPlanId !== null && plan.id === exceptPlanId) continue;
    if (plan.status === "abandoned" || plan.status === "archived") continue;
    if (planIsVisual(plan) !== Boolean(visual)) continue;
    for (const item of plan.items || []) {
      const id = item?.id ?? item?.target?.id;
      if (id !== undefined && id !== null) taken.add(String(id));
    }
  }
  return [...taken].sort();
}
