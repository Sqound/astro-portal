// What a plan's card of "Cette nuit" writes
// of the plan's telescope, so that two plans with no name of their own can be
// told apart.
import { telescopeProfiles } from "./planner.js";

/**
 * The name of the telescope the plan chose: the element of "Mon matériel"
 * (or of the default equipment) it points at; `null` when the plan chose
 * none, or names one no list holds.
 */
export function tonightPlanTelescope(profileSets, equipment) {
  const id = equipment?.telescopeId;
  if (typeof id !== "string" || !id.trim()) return null;
  const found = [
    ...(profileSets?.telescopes || []),
    ...(profileSets?.commonTelescopes || telescopeProfiles),
  ].find((profile) => profile?.id === id);
  const name = found?.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

/** Whether the plan is an evening at the eyepiece (`equipment.mode`). */
export function tonightPlanIsVisual(equipment) {
  return equipment?.mode === "visual";
}
