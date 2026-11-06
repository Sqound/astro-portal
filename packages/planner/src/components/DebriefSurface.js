"use client";

import { DebriefScreen } from "portal/components/sessions/DebriefScreen.js";
import { NightTargetsPicker } from "./NightTargetsPicker.js";
// The multi-night plans, the open core's.
import "../projects/components/register.js";

// The debriefing with the planner's search in its "Ajouter une cible": `portal`
// draws the moment and does not import the planner, so the shell that does is
// here, as `NightSessionSurface` is for the page of a session.
export function DebriefSurface(props) {
  return <DebriefScreen {...props} TargetsPicker={NightTargetsPicker} />;
}
