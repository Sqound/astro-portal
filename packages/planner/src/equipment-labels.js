import { message } from "portal/i18n.js";

// How the entries of the equipment lists are named on screen. The three
// built-in entries of the Reducer / Barlow selector -- "no reducer, no Barlow"
// (id "none"), "Réducteur 0,8×" (id "reducer") and "Barlow 2×" (id "barlow") --
// are written in French in the data (`opticalModifiers` of `planner.js`, the
// inventory's own "none" entry) because that data is what a plan stores and
// what the API exchanges with this page (`modifierId: "none"`).
// Their name is therefore never what a screen shows: the screen writes it in
// the language of the interface, by id (so that "Aucun" is not shown in an
// English or a Japanese interface; the same for the two others). An entry the
// person made keeps the name they typed: it has an id of its own.

export const noModifierId = "none";
export const reducerModifierId = "reducer";
export const barlowModifierId = "barlow";

const builtInModifierKeys = {
  [noModifierId]: "plannerModifierNone",
  [reducerModifierId]: "plannerModifierReducer",
  [barlowModifierId]: "plannerModifierBarlow",
};

// The name of a reducer / Barlow entry for a screen: the built-in entries say
// "None", "Aucun", "なし" (and "Reducer 0.8×", "Barlow 2×"); every other entry
// keeps its own name (a product's name is not translated).
export function modifierName(locale, profile) {
  if (!profile) return "";
  const key = Object.hasOwn(builtInModifierKeys, profile.id)
    ? builtInModifierKeys[profile.id]
    : null;
  return key ? message(locale, key) : profile.name;
}

// `profiles` as a list of choices to draw. Nothing but the name of the
// built-in entries changes, and `profiles` itself is never touched.
export function modifierChoices(locale, profiles = []) {
  return profiles.map((profile) =>
    Object.hasOwn(builtInModifierKeys, profile.id)
      ? { ...profile, name: modifierName(locale, profile) }
      : profile,
  );
}
