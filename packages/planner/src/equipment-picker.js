import { message } from "portal/i18n.js";
import { mySpaceEquipmentPath } from "./equipment-groups.js";
import { filterFamilyDefaultName } from "./filters-section.js";
import { sitePath } from "portal/safe-redirect.js";
import { signInHrefFor } from "portal/sign-in-href.js";

// The words of the equipment pickers of the web planner (search field, the
// menus « Marque » and « Type », the count line, « Aucun résultat », « Définir
// mon matériel ») for each category, and where « Définir mon matériel »
// leads. The rule of what is shown is `equipment-search.js`; this file only
// says it. Pure functions, testable without the page.

const capitalised = (text) =>
  text
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

const keys = {
  telescope: {
    search: "plannerTelescopeSearch",
    field: "plannerTelescope",
    count: "plannerEquipmentCountTelescopes",
    notFound: "plannerEquipmentNotFoundTelescope",
  },
  camera: {
    search: "plannerEquipmentSearchCamera",
    field: "plannerCamera",
    count: "plannerEquipmentCountCameras",
    notFound: "plannerEquipmentNotFoundCamera",
  },
  eyepiece: {
    search: "plannerEquipmentSearchEyepiece",
    field: "plannerEyepiece",
    count: "plannerEquipmentCountEyepieces",
    notFound: "plannerEquipmentNotFoundEyepiece",
  },
  modifier: {
    search: "plannerEquipmentSearchModifier",
    field: "plannerOpticalModifier",
    count: "plannerEquipmentCountModifiers",
    notFound: "plannerEquipmentNotFoundModifier",
  },
  filter: {
    search: "plannerFiltersSearch",
    field: "plannerFilters",
    count: "plannerEquipmentCountFilters",
    notFound: "plannerEquipmentNotFoundFilter",
  },
  mount: { field: "plannerMount" },
};

/** The categories whose picker searches and filters (a mount does not). */
export const searchableEquipmentCategories = Object.freeze(
  Object.keys(keys).filter((category) => keys[category].search),
);

/** The placeholder of the search field: « Rechercher un oculaire ». */
export const equipmentSearchLabel = (locale, category) =>
  keys[category]?.search ? message(locale, keys[category].search) : "";

/** The name of the field: « Oculaire ». */
export const equipmentFieldLabel = (locale, category) =>
  keys[category] ? message(locale, keys[category].field) : "";

/**
 * The branch of an ICU `{count, plural, one{# …} other{# …}}` text for
 * `count` in the language's own plural (Russian's few and many), with `#`
 * written in the locale's figures.
 */
export function icuPlural(locale, template, count) {
  const text = String(template ?? "");
  const body = text.slice(text.indexOf("plural,") + 7);
  const branches = [
    ...body.matchAll(
      /(=\d+|zero|one|two|few|many|other)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g,
    ),
  ];
  const category = new Intl.PluralRules(locale).select(count);
  const chosen =
    branches.find(([, name]) => name === `=${count}`) ||
    branches.find(([, name]) => name === category) ||
    branches.find(([, name]) => name === "other");
  return chosen
    ? chosen[2].replaceAll("#", new Intl.NumberFormat(locale).format(count))
    : String(count);
}

/** The count line: « 15 oculaires », « 1 télescope ». */
export const equipmentCountText = (locale, category, count) =>
  keys[category]?.count
    ? icuPlural(locale, message(locale, keys[category].count), count)
    : "";

/** « Vous ne trouvez pas votre oculaire ? Déclarez-le dans Mon matériel… » */
export const equipmentNotFoundText = (locale, category) =>
  keys[category]?.notFound ? message(locale, keys[category].notFound) : "";

/**
 * The name of a value of « Type »: « Lunette », « Ultra grand champ (80° et
 * plus) »; a filter's family (« Double bande », « Solaire »). A value the
 * catalogues do not name is written as it is.
 */
export function equipmentKindLabel(locale, category, kind) {
  if (category === "filter")
    return filterFamilyDefaultName(locale, kind) || String(kind);
  const key = `plannerKind${capitalised(category)}${capitalised(String(kind))}`;
  const text = message(locale, key);
  return text && text !== key ? text : String(kind);
}

// The kinds whose full name is long (an optical formula of two names, a
// field of view with its degrees), and the key of their short name; every
// other kind keeps its full name.
const shortKindKeys = {
  telescope: {
    cassegrain: "plannerKindTelescopeCassegrainShort",
    smart: "plannerKindTelescopeSmartShort",
  },
  eyepiece: {
    standard: "plannerKindEyepieceStandardShort",
    "wide-field": "plannerKindEyepieceWideFieldShort",
    "ultra-wide-field": "plannerKindEyepieceUltraWideFieldShort",
  },
};

/**
 * The name of the chosen value of « Type » in its closed menu: « Ultra grand
 * champ » for « Ultra grand champ (80° et plus) », the full name of every
 * kind that has no short one. The open menu lists the full names.
 */
export function equipmentKindShortLabel(locale, category, kind) {
  const key = shortKindKeys[category]?.[kind];
  const text = key ? message(locale, key) : "";
  return text && text !== key
    ? text
    : equipmentKindLabel(locale, category, kind);
}

/** A menu's line: « Tele Vue (33) ». */
export const equipmentMenuOptionLabel = (locale, label, count) =>
  `${label} (${new Intl.NumberFormat(locale).format(count)})`;

/**
 * Where « Définir mon matériel » leads: for a person signed in to a space,
 * « Mon espace » → « Matériel » (the page of « Gérer mon matériel »); for a
 * visitor, the sign-in page of the service (where a space is created), which
 * brings the person back to that page once signed in. `auth` is the shape of
 * `GET /api/auth/status` (`signInPath`, `method`).
 */
export function defineEquipmentHref({ locale, signedIn, auth = {} }) {
  const equipmentPage = mySpaceEquipmentPath(locale);
  if (signedIn) return equipmentPage;
  return signInHrefFor(
    { signInPath: auth?.signInPath, method: auth?.method },
    sitePath(equipmentPage) || `/${locale}`,
  );
}
