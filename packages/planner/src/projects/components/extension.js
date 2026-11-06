import { loadContinuingSuggestions } from "./suggest-continuing.js";
import { MultiNightLibraryView } from "./MultiNightLibrary.js";
import { CreateDialog } from "./MultiNightDialogs.js";
import { NightPlanSlot } from "./NightPlan.js";
import {
  DebriefLink,
  PlanBand,
  PlanMenu,
  TimelineAction,
} from "./MultiNightPlanParts.js";

/**
 * The multi-night plans on the web, the open core's: every shell registers them
 * at `planner.projects` — the open-source composition (`apps/portal-oss`) opens
 * them to its person.
 *
 * - `LibraryView`: the multi-night side of the plans library — the list,
 *   and from it one plan's detail, its calendar ("Nuits à venir") and its
 *   progress ("Avancement du plan"): the three views route among
 *   themselves, so they are one member;
 * - `CreateDialog`: "Un plan multi-nuits" chosen behind "Nouveau plan";
 * - `TimelineAction`: the open card of a target on the night's schedule
 *   ("Suivre sur plusieurs nuits" and its dialog, or "Détacher");
 * - `PlanMenu`: "Actions du plan" ("Transformer", "Rattacher" and
 *   their dialogs);
 * - `PlanBand`: "Plan multi-nuits : NGC 7000" above a plan holding a
 *   night of one;
 * - `DebriefLink`: the debriefing's way to a multi-night plan's progress;
 * - `NightPlanSlot`: the row "Plan multi-nuits" of the page of a night of
 *   the journal ("Rattacher à un plan multi-nuits", "Détacher de ce
 *   plan"), drawn by the page through its shell.
 *
 * Every member receives the planner's `host` (`PlannerPage.js`), except
 * `DebriefLink`, which the debriefing draws with its plan and summary, and
 * `NightPlanSlot`, which the page of a night draws with its night.
 */
export const plannerProjects = Object.freeze({
  loadContinuingSuggestions,
  LibraryView: MultiNightLibraryView,
  CreateDialog,
  TimelineAction,
  PlanMenu,
  PlanBand,
  DebriefLink,
  NightPlanSlot,
});
