"use client";

import { registerPlannerExtension } from "portal/planner/extensions.js";
import { plannerProjects } from "./extension.js";

// The multi-night plans are the open core's (the server never
// restricts them): the surfaces of the planner, of "Cette nuit", of the page
// of a night and of the debriefing register their views at `planner.projects`
// as they load, on every shell — the open-source composition included, which
// registers nothing of its own. A shell that registers the same views again adds
// nothing (`registerPlannerExtension` keeps one of each).
registerPlannerExtension("planner.projects", plannerProjects);
