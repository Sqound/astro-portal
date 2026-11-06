import { message } from "portal/i18n.js";
import {
  bundledPlannerFilters,
  cameraProfiles,
  eyepieceProfiles,
  mountProfiles,
  opticalModifiers,
  telescopeProfiles,
} from "./planner.js";

// The equipment pickers of the web planner for a signed-in person: "Mon
// matériel", the space's own items, then "Matériel par défaut", the
// administration's list, for the telescope, the camera, the eyepiece, the
// modifier, the mount and the filters. "Masquer le matériel par défaut"
// (the space's option) leaves "Mon matériel" alone; with nothing of one's
// own as well, the field says so and offers « Définir mon matériel ». A
// visitor keeps today's lists. Pure functions, testable without the page.

/**
 * What the default group holds when the service names none (a portal older
 * than the default list): the profiles bundled with the planner, as before.
 */
export const bundledDefaultEquipmentProfiles = Object.freeze({
  telescopes: telescopeProfiles,
  cameras: cameraProfiles,
  eyepieces: eyepieceProfiles,
  modifiers: opticalModifiers.filter((profile) => profile.id !== "none"),
  filters: bundledPlannerFilters,
  mounts: mountProfiles,
});

/**
 * The groups of the select of one kind, in order: "Mon matériel" (the
 * space's own), then "Matériel par défaut" (none when `hidden`); a group
 * with nothing is left out with its label.
 */
export function equipmentChoiceGroups(
  locale,
  { mine = [], defaults = [], hidden = false } = {},
) {
  const groups = [];
  if (mine.length)
    groups.push({
      key: "mine",
      label: message(locale, "plannerGroupMine"),
      profiles: mine,
    });
  if (!hidden && defaults.length)
    groups.push({
      key: "default",
      label: message(locale, "plannerGroupDefault"),
      profiles: defaults,
    });
  return groups;
}

/**
 * The defaults hidden and nothing of one's own for this kind — the field gives
 * way to the line "Ajoutez votre matériel dans votre espace." and « Définir
 * mon matériel ».
 */
export const equipmentHiddenAndEmpty = ({ hidden = false, mine = [] } = {}) =>
  Boolean(hidden) && mine.length === 0;

/** The page of "Mon espace" → "Matériel". */
export const mySpaceEquipmentPath = (locale) =>
  `/${encodeURIComponent(locale)}/manage/equipment`;

/**
 * The option a select must still name when the search or the hidden
 * defaults leave the chosen profile out: it stays the select's value.
 */
export function chosenOutsideGroups(value, known = [], groups = []) {
  if (!value || value === "none") return null;
  const shown = groups.some((group) =>
    group.profiles.some((profile) => profile.id === value),
  );
  return shown ? null : known.find((profile) => profile.id === value) || null;
}
