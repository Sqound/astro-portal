import { message } from "portal/i18n.js";
import {
  bundledDefaultEquipmentProfiles,
  equipmentHiddenAndEmpty,
} from "./equipment-groups.js";
import { modifierChoices } from "./equipment-labels.js";
import {
  cameraProfiles,
  defaultEquipmentProfiles,
  equipmentProfilesFromInventory,
  eyepieceProfiles,
  opticalModifiers,
  telescopeProfiles,
} from "./planner.js";

// The lists of the equipment pickers of a page that is not the planner
// (« À voir ce soir »), built as the planner builds its own: for a person
// signed in to a space, « Mon matériel » (the items of `GET /api/equipment`)
// then « Matériel par défaut » (its `defaults`, the bundled catalogue for a
// portal that names none; empty while the space hides them, a chosen one
// still named); for a visitor, the catalogue without a heading. Also the
// profile sets the page resolves the chosen equipment with. Pure functions.

const withoutNone = (list) => list.filter((profile) => profile.id !== "none");

/**
 * `{ lists, profiles }`: `lists[category]` is `{ mine, defaults, known,
 * defaultsLabelled, hidden }` for "telescope", "camera", "eyepiece" and
 * "modifier"; `profiles` the sets `resolveEquipment` reads (the own
 * telescopes, then `commonTelescopes`, every camera, eyepiece and modifier).
 * `defaults` is `null` while the service has not named its list.
 */
export function equipmentPickerLists({
  locale,
  signedIn = false,
  inventory = [],
  defaults = null,
  hideDefaults = false,
}) {
  if (!signedIn) {
    const modifiers = modifierChoices(locale, withoutNone(opticalModifiers));
    const lists = (list, known = list) => ({
      mine: [],
      defaults: list,
      known,
      defaultsLabelled: false,
      hidden: false,
    });
    return {
      lists: {
        telescope: lists(telescopeProfiles),
        camera: lists(cameraProfiles),
        eyepiece: lists(eyepieceProfiles),
        modifier: lists(modifiers, modifierChoices(locale, opticalModifiers)),
      },
      profiles: {
        telescopes: telescopeProfiles,
        commonTelescopes: [],
        cameras: cameraProfiles,
        eyepieces: eyepieceProfiles,
        modifiers: opticalModifiers,
      },
    };
  }
  const own = equipmentProfilesFromInventory(inventory || []);
  const fallback = Array.isArray(defaults)
    ? defaultEquipmentProfiles(defaults)
    : bundledDefaultEquipmentProfiles;
  const shown = (list) => (hideDefaults ? [] : list);
  const lists = (mine, all) => ({
    mine,
    defaults: shown(all),
    known: [...mine, ...all],
    defaultsLabelled: true,
    hidden: Boolean(hideDefaults),
  });
  const ownModifiers = withoutNone(own.modifiers);
  return {
    lists: {
      telescope: lists(own.telescopes, fallback.telescopes),
      camera: lists(own.cameras, fallback.cameras),
      eyepiece: lists(own.eyepieces, fallback.eyepieces),
      modifier: lists(
        modifierChoices(locale, ownModifiers),
        modifierChoices(locale, fallback.modifiers),
      ),
    },
    profiles: {
      ...own,
      telescopes: own.telescopes,
      commonTelescopes: fallback.telescopes,
      cameras: [...own.cameras, ...fallback.cameras],
      eyepieces: [...own.eyepieces, ...fallback.eyepieces],
      modifiers: [...own.modifiers, ...fallback.modifiers],
    },
  };
}

/**
 * The props of the `EquipmentPicker` of one field over `lists` (see
 * `equipmentPickerLists`): « Aucun » first for the reducer, the notice of
 * the defaults hidden with nothing of one's own, and « Définir mon
 * matériel » (`define`) when nothing matches.
 */
export function equipmentPickerPropsFrom(lists, { locale, define = null }) {
  return (category, value) => {
    const list = lists[category];
    const hiddenEmpty =
      category !== "modifier" &&
      !value &&
      equipmentHiddenAndEmpty({ hidden: list.hidden, mine: list.mine });
    return {
      locale,
      category,
      value: value ?? null,
      mine: list.mine,
      defaults: list.defaults,
      known: list.known,
      defaultsLabelled: list.defaultsLabelled,
      leading:
        category === "modifier"
          ? [{ id: "none", label: message(locale, "plannerModifierNone") }]
          : [],
      hiddenEmpty,
      define: hiddenEmpty ? null : define,
    };
  };
}
