// The best pair (eyepiece, filter) for a target at the eyepiece
// (VISUAL-SIM-02a, stage 3).
//
// The verdict of the eyepiece and filters chosen is the one of
// `visualSuitability`; the best pair tries, on the telescope chosen, every
// eyepiece and every filter of « Mon matériel » (no filter included) and,
// only when none of them shows the target (« suitable »), goes on with the
// generic profiles the app proposes (`genericVisual` of the common bundle:
// Plössl 32, 25 and 10 mm, OIII, UHC and Hβ filters), said « pas dans votre
// matériel » (`generic`): the owner's own equipment first, the equipment the
// app proposes only when it has nothing suited.
//
// Pairs are ranked by status (suitable, difficult, unknown, unlikely); among
// suitable pairs by the fewest generic items, then the smallest size penalty
// (a small planetary nebula is not sent to the lowest magnification), then
// the largest margin; among the others by the largest margin first. The pair
// chosen wins when it is as good as the best: the advice never redoes the
// choice.
import { message } from "portal/i18n.js";
import commonEquipmentData from "./common-equipment-profiles.json" with { type: "json" };
import { eyepieceNarrowBandPupilPenalty } from "./eyepiece-view.js";
import { filterFamilyName } from "./filters-section.js";
import { filterFamily } from "./filters.js";
import { visualProfileFilter, visualSuitability } from "./planner.js";
import { fill } from "./wind-section.js";

export const visualPairRule = Object.freeze({
  statusRank: Object.freeze({
    suitable: 3,
    difficult: 2,
    unknown: 1,
    unlikely: 0,
  }),
});

const genericVisual = commonEquipmentData.genericVisual || {};

/** The generic eyepieces the app proposes (`generic: true`). */
export const genericVisualEyepieces = Object.freeze(
  (genericVisual.eyepieceIds || [])
    .map((id) =>
      (commonEquipmentData.eyepieces || []).find((entry) => entry.id === id),
    )
    .filter(Boolean)
    .map(({ id, name, focalLengthMm, apparentFieldDegrees }) =>
      Object.freeze({
        id,
        name,
        focalLengthMm,
        apparentFieldDegrees,
        generic: true,
      }),
    ),
);

/** The generic visual filters the app proposes (`generic: true`). */
export const genericVisualFilters = Object.freeze(
  (genericVisual.filters || []).map((filter) =>
    Object.freeze({ ...filter, generic: true }),
  ),
);

const positive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

// The settings an eyepiece gives: its focal length, both ends of a zoom.
function eyepieceSettings(eyepiece) {
  const minimum = positive(eyepiece?.minFocalLengthMm);
  const maximum = positive(eyepiece?.maxFocalLengthMm);
  if (minimum && maximum && maximum > minimum) {
    const wide = positive(eyepiece.minApparentFieldDegrees);
    const narrow = positive(eyepiece.maxApparentFieldDegrees);
    return [
      {
        eyepiece,
        focalLengthMm: maximum,
        apparentFieldDegrees: wide ?? positive(eyepiece.apparentFieldDegrees),
      },
      {
        eyepiece,
        focalLengthMm: minimum,
        apparentFieldDegrees: narrow ?? positive(eyepiece.apparentFieldDegrees),
      },
    ];
  }
  const focal = positive(eyepiece?.focalLengthMm);
  return focal
    ? [
        {
          eyepiece,
          focalLengthMm: focal,
          apparentFieldDegrees: positive(eyepiece.apparentFieldDegrees),
        },
      ]
    : [];
}

// The visual profile of `profile`'s telescope with an eyepiece setting and
// a filter (or none).
function pairProfile(profile, setting, filter) {
  const base = setting
    ? (() => {
        const magnification =
          Number(profile.focalLengthMm) / setting.focalLengthMm;
        return {
          eyepieceFocalLengthMm: setting.focalLengthMm,
          apparentFieldDegrees: setting.apparentFieldDegrees ?? Number.NaN,
          magnification,
          exitPupilMm: Number(profile.apertureMm) / magnification,
          visualFieldDiameterDegrees:
            (setting.apparentFieldDegrees ?? Number.NaN) / magnification,
        };
      })()
    : {};
  return {
    ...profile,
    ...base,
    filters: filter ? [filter.name] : [],
    filterProfiles: filter ? [filter] : [],
    unresolvedFilterIds: [],
  };
}

const eyepieceOut = (setting, chosen) =>
  setting
    ? {
        id: setting.eyepiece?.id ?? null,
        name: setting.eyepiece?.name ?? null,
        focalLengthMm: setting.focalLengthMm,
        generic: setting.eyepiece?.generic === true,
      }
    : chosen;

const filterOut = (filter) =>
  filter
    ? {
        id: filter.id ?? null,
        name: filter.name ?? null,
        family: filterFamily(filter),
        generic: filter.generic === true,
      }
    : null;

const rankOf = (verdict) =>
  visualPairRule.statusRank[verdict?.status] ??
  visualPairRule.statusRank.unknown;
// The margin a pair is ranked by: the verdict's, less what a narrow-band
// filter costs under a 3 mm exit pupil, so that « Idéal » does not
// propose the eyepiece that gives a pupil too small for it.
const marginOf = (verdict) =>
  Number.isFinite(verdict?.magnitudeMargin)
    ? verdict.magnitudeMargin - eyepieceNarrowBandPupilPenalty(verdict)
    : -Infinity;

// Better first: the status; among « suitable » pairs, the fewest generic
// items, the smallest size penalty, the largest margin; among the others, the
// largest margin first (what brings the target closest), then the fewest
// generic items and the smallest size penalty; the order of the candidates
// on a tie.
function compare(left, right) {
  const rank = rankOf(right.verdict) - rankOf(left.verdict);
  if (rank) return rank;
  const generic = left.genericCount - right.genericCount;
  const share =
    (Number(left.verdict.sizeShare) || 0) -
    (Number(right.verdict.sizeShare) || 0);
  const leftMargin = marginOf(left.verdict);
  const rightMargin = marginOf(right.verdict);
  const margin =
    leftMargin === rightMargin ? 0 : rightMargin > leftMargin ? 1 : -1;
  return (
    (left.verdict.status === "suitable"
      ? generic || share || margin
      : margin || generic || share) || left.index - right.index
  );
}

function bestOf(candidates, chosen) {
  const sorted = [...candidates].sort(compare);
  const top = sorted[0];
  if (!top) return null;
  // The pair chosen wins when it is as good as the best one: « suitable »
  // like it, with no more generic items.
  return chosen &&
    rankOf(chosen.verdict) === rankOf(top.verdict) &&
    (chosen.verdict.status === "suitable" ||
      marginOf(chosen.verdict) >= marginOf(top.verdict)) &&
    chosen.genericCount <= top.genericCount
    ? chosen
    : top;
}

const uniqueById = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = item?.id ?? item?.name;
    if (key == null) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function pairOut(candidate, chosenEyepiece) {
  const verdict = candidate.verdict;
  return {
    eyepiece: eyepieceOut(candidate.setting, chosenEyepiece),
    filter: filterOut(candidate.filter),
    status: verdict.status,
    visible: verdict.visible,
    magnitudeMargin: Number.isFinite(verdict.magnitudeMargin)
      ? verdict.magnitudeMargin
      : null,
    magnification: Number.isFinite(verdict.magnification)
      ? verdict.magnification
      : null,
    exitPupilMm: Number.isFinite(verdict.exitPupilMm)
      ? verdict.exitPupilMm
      : null,
    generic: candidate.genericCount > 0,
    chosen: candidate.isChosen === true,
  };
}

/**
 * The verdict of the pair chosen and of the best pair for `target`:
 * - `profile`: the visual profile resolved for the telescope, eyepiece and
 *   filters chosen (`resolveEquipment`);
 * - `eyepieces`, `filters`: those of « Mon matériel » (profiles, as
 *   `equipmentProfilesFromInventory` lists them); the profile's own filters
 *   are added;
 * - `sky`: `{ sqm, bortleClass }` of the place (or forced), `null` unknown;
 * - `generic`: `false` keeps to « Mon matériel ».
 * Binoculars keep their own magnification: only their filters are tried.
 *
 * `{ chosen, best, bestVerdict, own, ownVerdict, advice }`: `chosen` is the
 * verdict of the pair chosen (`visualSuitability`), `bestVerdict` and
 * `ownVerdict` those of the two pairs below; `best` and `own` are
 * `{ eyepiece, filter, status,
 * visible, magnitudeMargin, magnification, exitPupilMm, generic, chosen }`
 * (the best pair, and the best of « Mon matériel »); `advice` is `{ key,
 * status, eyepieceFocalLengthMm, filterFamily, generic }`, `key` being
 * `chosen` (the choice is the best), `filter`, `eyepiece`, `pair` (what to
 * change) or `none` (nothing shows the target). `null` out of visual mode or
 * for a planet.
 */
export function visualBestPair({
  target,
  profile,
  eyepieces = [],
  filters = [],
  sky = null,
  generic = true,
} = {}) {
  if (!target || profile?.mode !== "visual") return null;
  const chosenVerdict = visualSuitability(target, profile, undefined, sky);
  if (chosenVerdict.reason === "planet") return null;
  const binoculars =
    profile.instrumentKind === "binoculars" ||
    !(positive(profile.focalLengthMm) && positive(profile.apertureMm));
  const chosenFilters = Array.isArray(profile.filterProfiles)
    ? profile.filterProfiles
    : [];
  const chosenEyepiece = {
    id: null,
    name: null,
    focalLengthMm: positive(profile.eyepieceFocalLengthMm),
    generic: false,
  };
  const ownFilters = uniqueById([
    ...chosenFilters,
    ...(Array.isArray(filters) ? filters : []),
  ]);
  // The settings of « Mon matériel » but the one chosen.
  const ownSettings = binoculars
    ? []
    : (Array.isArray(eyepieces) ? eyepieces : [])
        .flatMap(eyepieceSettings)
        .filter(
          (setting) => setting.focalLengthMm !== chosenEyepiece.focalLengthMm,
        );
  let index = 0;
  const evaluate = (setting, filter, genericCount, isChosen = false) => ({
    setting,
    filter,
    genericCount,
    isChosen,
    index: index++,
    verdict: visualSuitability(
      target,
      pairProfile(profile, setting, filter),
      undefined,
      sky,
    ),
  });
  // The pair chosen: its eyepiece as resolved, the filter of its own the
  // verdict puts in front of it (`visualProfileFilter`), or none.
  const chosenFamily = visualProfileFilter(target, profile).family;
  const chosen = {
    setting: null,
    filter:
      chosenFamily === null
        ? null
        : chosenFilters.find(
            (filter) => filterFamily(filter) === chosenFamily,
          ) || { name: chosenFamily, family: chosenFamily },
    genericCount: 0,
    isChosen: true,
    index: index++,
    verdict: chosenVerdict,
  };
  const ownCandidates = [chosen];
  for (const setting of [null, ...ownSettings])
    for (const filter of [null, ...ownFilters])
      if (setting || filter !== chosen.filter)
        ownCandidates.push(evaluate(setting, filter, 0));
  const own = bestOf(ownCandidates, chosen);
  let best = own;
  if (generic && own.verdict.status !== "suitable") {
    const genericSettings = binoculars
      ? []
      : genericVisualEyepieces
          .flatMap(eyepieceSettings)
          .filter(
            (setting) =>
              setting.focalLengthMm !== chosenEyepiece.focalLengthMm &&
              !ownSettings.some(
                (own) => own.focalLengthMm === setting.focalLengthMm,
              ),
          );
    const ownFamilies = new Set(ownFilters.map(filterFamily));
    const genericFilters = genericVisualFilters.filter(
      (filter) => !ownFamilies.has(filter.family),
    );
    const candidates = [...ownCandidates];
    for (const setting of [null, ...ownSettings, ...genericSettings])
      for (const filter of [null, ...ownFilters, ...genericFilters]) {
        const count =
          (setting?.eyepiece?.generic ? 1 : 0) + (filter?.generic ? 1 : 0);
        if (count) candidates.push(evaluate(setting, filter, count));
      }
    const top = bestOf(candidates, chosen);
    if (rankOf(top.verdict) > rankOf(own.verdict)) best = top;
  }
  const bestOut = pairOut(best, chosenEyepiece);
  const sameEyepiece = best.setting === null;
  const chosenFamilies = chosen.filter ? [filterFamily(chosen.filter)] : [];
  const sameFilter = best.filter
    ? chosenFamilies.includes(filterFamily(best.filter))
    : !chosen.filter;
  const key =
    rankOf(best.verdict) === visualPairRule.statusRank.unlikely
      ? "none"
      : best === chosen || (sameEyepiece && sameFilter)
        ? "chosen"
        : sameEyepiece
          ? "filter"
          : sameFilter || !best.filter
            ? "eyepiece"
            : "pair";
  return {
    chosen: chosenVerdict,
    best: bestOut,
    bestVerdict: best.verdict,
    own: pairOut(own, chosenEyepiece),
    ownVerdict: own.verdict,
    advice: {
      key,
      status: best.verdict.status,
      eyepieceFocalLengthMm: bestOut.eyepiece?.focalLengthMm ?? null,
      filterFamily: bestOut.filter?.family ?? null,
      generic: bestOut.generic,
    },
  };
}

/**
 * The eyepieces, filters and telescopes of « Mon matériel » (`{ eyepieces,
 * filters, telescopes }`)
 * of the owner's profile sets (`equipmentProfilesFromInventory`), what
 * `visualBestPair`, `planNight` (`visualInventory`) and the preview try.
 */
export function visualInventoryOf(profileSets) {
  return {
    eyepieces: Array.isArray(profileSets?.eyepieces)
      ? profileSets.eyepieces
      : [],
    filters: Array.isArray(profileSets?.filters) ? profileSets.filters : [],
    // The owner's telescopes: the photo advice names the one whose focal
    // length frames the target (VISUAL-SIM-02b).
    telescopes: Array.isArray(profileSets?.telescopes)
      ? profileSets.telescopes
      : [],
  };
}

const decimal = (value, locale) =>
  Number(value).toLocaleString(locale, { maximumFractionDigits: 1 });

/**
 * The line of the advice: « Visible avec un filtre OIII », « Visible au
 * 32 mm », « Visible au 32 mm avec un filtre OIII » (« Plus facile … » when
 * the best pair stays difficult); `null` when the choice is the best or
 * nothing shows the target.
 */
export function visualBestPairText(locale, advice) {
  if (!advice || !["filter", "eyepiece", "pair"].includes(advice.key))
    return null;
  const visible = advice.status === "suitable";
  const keyOf = {
    filter: visible ? "visualPairVisibleFilter" : "visualPairEasierFilter",
    eyepiece: visible
      ? "visualPairVisibleEyepiece"
      : "visualPairEasierEyepiece",
    pair: visible ? "visualPairVisiblePair" : "visualPairEasierPair",
  }[advice.key];
  return fill(message(locale, keyOf), {
    filter:
      filterFamilyName(locale, advice.filterFamily) || advice.filterFamily,
    focal: decimal(advice.eyepieceFocalLengthMm, locale),
  });
}
