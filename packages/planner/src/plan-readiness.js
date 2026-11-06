import { placeCoordinates } from "portal/planner/state.js";
import { planStatus } from "./planner.js";

// "Prêt" or "Brouillon": a pending plan is ready when it has a place with
// coordinates, a date and at least one target placed on the night; any other
// pending plan is a draft. A plan that is no longer pending carries neither
// word: the library and the sheet of the web say "Brouillon" where they
// said "Planifié".

/** Whether [plan] is a pending plan not yet ready to be lived. */
export function planIsDraft(plan) {
  if (planStatus(plan) !== "pending") return false;
  const placed =
    Array.isArray(plan?.items) &&
    plan.items.some((item) => typeof item?.startMinute === "number");
  const date = String(plan?.date ?? "");
  return !(placeCoordinates(plan?.location) && date !== "" && placed);
}

/**
 * The tags of [plan] as the screens draw them: the library's tags, with
 * "planned" read as "draft" while the plan is one.
 */
export function planDisplayTags(plan, tags) {
  return planIsDraft(plan)
    ? tags.map((tag) => (tag === "planned" ? "draft" : tag))
    : tags;
}
