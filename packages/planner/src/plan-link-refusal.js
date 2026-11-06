// The refusals of a plan write for a link to a multi-night plan: `PUT
// /api/plans` answers `403 multi_night_not_active` (naming `planner.mosaic`)
// without "Planification avancée", `404 project_not_found` when the multi-night
// plan no longer exists, `409 target_mismatch` when the item is not of its
// target; the 404 and the 409 name the item (`planItemId`). The service writes
// nothing of a refused document: the page reverts the link to what the service
// holds, keeps the rest of the edit (the next autosave writes it), and says why
// — the box of "Planification avancée" for the 403, a sentence for the others.

/** The codes the page reads as a refused link. */
export const LINK_REFUSAL_CODES = Object.freeze([
  "multi_night_not_active",
  "project_not_found",
  "target_mismatch",
]);

/** Whether `failure` (the page's error of a write) is a refused link. */
export const isLinkRefusal = (failure) =>
  LINK_REFUSAL_CODES.includes(failure?.code);

const keyOf = (planId, itemId) => `${planId}\u0000${itemId}`;

/**
 * The links the service holds: a map `plan id + item id` → the multi-night
 * plan the item is attached to (`null` when it is not), from the document
 * `GET /api/plans` answers (`{ plans, … }`).
 */
export function keptProjectLinks(document) {
  const kept = new Map();
  for (const plan of document?.plans ?? [])
    for (const item of plan.items ?? [])
      kept.set(keyOf(plan.id, item.id), item.projectId || null);
  return kept;
}

/**
 * `plans` with the refused links reverted to `kept`: only the item the
 * refusal names (404, 409), or — the 403 names none — every item whose link
 * differs from the service's. An item the service does not hold has no link
 * to go back to: it loses the refused one. Answers `{ plans, itemIds }`,
 * `itemIds` being the items whose link went back (the same `plans` when none).
 */
export function revertRefusedLinks(plans, refusal, kept) {
  const only = refusal?.planItemId ?? null;
  const itemIds = [];
  const next = plans.map((plan) => {
    let changed = false;
    const items = (plan.items ?? []).map((item) => {
      if (only && item.id !== only) return item;
      const now = item.projectId || null;
      const had = kept.get(keyOf(plan.id, item.id)) ?? null;
      if (now === had) return item;
      changed = true;
      itemIds.push(item.id);
      const { projectId: _refused, ...rest } = item;
      return had ? { ...rest, projectId: had } : rest;
    });
    return changed ? { ...plan, items } : plan;
  });
  return { plans: itemIds.length ? next : plans, itemIds };
}
