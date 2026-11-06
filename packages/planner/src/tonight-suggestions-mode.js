// The photo / visual button of « À voir ce soir » (the same button as the
// app's): the icon shows the mode the list is made for, a click switches to
// the other one. The first time, the mode follows the rule of before (the
// equipment of the night's plan, else « Ma configuration par défaut », else
// photo); once the person clicks, her choice wins and is kept in this
// browser — never sent to a server, never part of a space or of a plan. The
// button never changes a plan of the night: it only says which equipment the
// list (and a plan made from it) is for.
//
// Also the line a visual suggestion carries under its hours, « Mag 5,8 ·
// 16,5′ · Aux jumelles »: the catalogue's magnitude and largest size, and the
// instrument the planner's visual rule (`visualSuitability`) asks for when it
// is applied to binoculars under the place's sky (one magnitude of margin,
// not too small for their magnification, inside their field): those of « Mon
// matériel » first, else the common 7×50 that stands in for « des jumelles »
// (the same rule as the mobile application's).
import { instrumentKindOf } from "portal/equipment/instrument-kind.js";
import { message } from "portal/i18n.js";
import { binocularsProfiles, visualSuitability } from "./planner.js";

export const tonightSuggestionsModeStorageKey =
  "astro-portal:tonight:suggestions-mode:v1";

export const tonightSuggestionsModes = ["imaging", "visual"];

const store = () => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

const listeners = new Set();

/** The mode chosen in this browser, `null` when none was. */
export function readTonightSuggestionsMode(storage = store()) {
  try {
    const value = storage?.getItem(tonightSuggestionsModeStorageKey);
    return tonightSuggestionsModes.includes(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Keeps the choice; answers whether it could be kept. The page is told
 * either way: a choice that cannot be written holds for this page.
 */
export function writeTonightSuggestionsMode(mode, storage = store()) {
  if (!tonightSuggestionsModes.includes(mode)) return false;
  let kept = true;
  try {
    storage.setItem(tonightSuggestionsModeStorageKey, mode);
  } catch {
    kept = false;
  }
  for (const listener of [...listeners]) listener(mode);
  return kept;
}

/**
 * Calls `listener` when the choice changes, in this page or in another tab;
 * answers the function that stops it.
 */
export function subscribeTonightSuggestionsMode(
  listener,
  target = typeof window !== "undefined" ? window : null,
) {
  const onStorage = (event) => {
    if (event?.key === null || event?.key === tonightSuggestionsModeStorageKey)
      listener(readTonightSuggestionsMode());
  };
  listeners.add(listener);
  target?.addEventListener?.("storage", onStorage);
  return () => {
    listeners.delete(listener);
    target?.removeEventListener?.("storage", onStorage);
  };
}

const modeOf = (equipment) =>
  equipment?.mode === "visual" ? "visual" : "imaging";

/**
 * The mode of the list: the person's `chosen` one, else the mode of before —
 * the night's plan's equipment (`planEquipment`), else the default
 * configuration's, else photo.
 */
export function tonightSuggestionsMode({
  chosen = null,
  planEquipment = null,
  defaultConfiguration = null,
}) {
  if (tonightSuggestionsModes.includes(chosen)) return chosen;
  if (planEquipment) return modeOf(planEquipment);
  if (defaultConfiguration) return modeOf(defaultConfiguration);
  return "imaging";
}

/**
 * The equipment the list is made for, of `mode`: `own` (the night's, as
 * before) when it is of that mode; else the equipment of the night's first
 * plan of that mode; else `configurationStart` (the default configuration as
 * a plan starts with it) when it is of that mode; else `inventoryStart` (the
 * inventory's first, or nothing) in that mode. The list is made even without
 * a matching rig.
 */
export function tonightSuggestionsEquipment({
  mode,
  own,
  plans = [],
  configurationStart = null,
  inventoryStart = {},
}) {
  if (own && modeOf(own) === mode) return own;
  for (const plan of plans)
    if (plan?.equipment && modeOf(plan.equipment) === mode)
      return plan.equipment;
  if (configurationStart && modeOf(configurationStart) === mode)
    return configurationStart;
  return { ...(inventoryStart || {}), mode };
}

// The common 7×50 that stands in for « des jumelles » when « Mon matériel »
// holds none.
export const genericBinocularsId = "nikon-aculon-a211-7x50";
export const visualBinocularsMarginMagnitude = 1;

/**
 * The binoculars of « Mon matériel » among `telescopes` (the common models
 * the lists add for everyone are not the person's): `preferredId` when it is
 * one of them, the first one, else the generic 7×50.
 */
export function observingBinoculars(telescopes = [], { preferredId } = {}) {
  const common = new Set(binocularsProfiles.map((profile) => profile.id));
  const own = (Array.isArray(telescopes) ? telescopes : []).filter(
    (profile) =>
      profile &&
      instrumentKindOf(profile) === "binoculars" &&
      !common.has(profile.id),
  );
  return (
    (preferredId != null &&
      own.find((profile) => String(profile.id) === String(preferredId))) ||
    own[0] ||
    binocularsProfiles.find((profile) => profile.id === genericBinocularsId) ||
    binocularsProfiles[0]
  );
}

const positive = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;

/** The target's integrated magnitude, `null` without one. */
export function visualTargetMagnitude(target) {
  const value = target?.integratedMagnitude;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The target's largest apparent size in arc minutes, `null` without one. */
export function visualTargetSizeArcmin(target) {
  const size = target?.apparentSizeArcmin;
  if (typeof size === "number" && Number.isFinite(size) && size > 0)
    return size;
  if (!Array.isArray(size)) return null;
  const parts = size.filter(
    (part) => typeof part === "number" && Number.isFinite(part) && part > 0,
  );
  return parts.length ? Math.max(...parts) : null;
}

/**
 * `binoculars` or `telescope` for `target` under `sky` (`{ sqm,
 * bortleClass }`, null: the dark-sky limit) with `binoculars` (null: the
 * generic 7×50 of `observingBinoculars`); `null` when the rule cannot tell
 * (no magnitude). A planet asks for a telescope.
 */
export function visualInstrumentFor(target, sky = null, binoculars = null) {
  if (!target) return null;
  const used = binoculars || observingBinoculars([]);
  const aperture = positive(used.apertureMm) ?? 50;
  const magnification = positive(used.magnification) ?? 7;
  const verdict = visualSuitability(
    target,
    {
      mode: "visual",
      apertureMm: aperture,
      magnification,
      exitPupilMm: positive(used.exitPupilMm) ?? aperture / magnification,
    },
    { diameter: positive(used.trueFieldDegrees) ?? 6.4 },
    sky,
  );
  if (verdict.reason === "planet") return "telescope";
  const margin = verdict.magnitudeMargin;
  if (typeof margin !== "number" || !Number.isFinite(margin)) return null;
  const framing = verdict.framingRatio;
  const fits =
    verdict.sizeFit !== "small" &&
    (typeof framing !== "number" || framing <= 1);
  return margin >= visualBinocularsMarginMagnitude && fits
    ? "binoculars"
    : "telescope";
}

const fill = (text, values) =>
  Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    text,
  );

/** « Mag 5,8 · 16,5′ · Aux jumelles », `null` when nothing is known. */
export function tonightVisualFactsLine(
  locale,
  target,
  sky = null,
  binoculars = null,
) {
  const magnitude = visualTargetMagnitude(target);
  const size = visualTargetSizeArcmin(target);
  const instrument = visualInstrumentFor(target, sky, binoculars);
  const parts = [];
  if (magnitude !== null)
    parts.push(
      fill(message(locale, "tonightVisualMagnitude"), {
        value: magnitude.toLocaleString(locale, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }),
      }),
    );
  if (size !== null)
    parts.push(`${size.toLocaleString(locale, { maximumFractionDigits: 1 })}′`);
  if (instrument)
    parts.push(
      message(
        locale,
        instrument === "binoculars"
          ? "tonightVisualBinoculars"
          : "tonightVisualTelescope",
      ),
    );
  // Each part holds together (« Aux jumelles », « В телескоп »): the line
  // breaks only between the parts.
  return parts.length
    ? parts.map((part) => part.replaceAll(" ", "\u00a0")).join(" · ")
    : null;
}

/**
 * The line under the title: « Suggestions pour la photo · Maison », or from
 * the second ten « Suggestions 11 à 20 · photo · Maison »; `null` without a
 * place name.
 */
export function tonightSuggestionsModeLine(locale, { mode, tier, placeName }) {
  if (!placeName) return null;
  const visual = mode === "visual";
  if (tier > 1)
    return fill(
      message(
        locale,
        visual
          ? "tonightSuggestionsPositionsVisual"
          : "tonightSuggestionsPositionsPhoto",
      ),
      { from: (tier - 1) * 10 + 1, to: tier * 10, place: placeName },
    );
  return fill(
    message(
      locale,
      visual ? "tonightSuggestionsForVisual" : "tonightSuggestionsForPhoto",
    ),
    { place: placeName },
  );
}
