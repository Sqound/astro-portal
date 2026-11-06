"use client";

import { PlannerPage } from "./PlannerPage.js";
// The multi-night plans, the open core's.
import "../projects/components/register.js";

// The planner of the open core, shown to everyone whatever they bought: the
// planner is the product. What a profile does not carry (several plans,
// mosaics) is held back inside it, from the capabilities it is given; what a
// shell adds (mosaics, offers) is registered at the planner's named points
// (`portal/planner/extensions.js`), never in place of the planner.
export function PlannerSurface({ capabilities, ...props }) {
  return <PlannerPage capabilities={capabilities} {...props} />;
}
