// A target proposed to an eyepiece that needs a filter to be seen (an
// emission nebula, a planetary nebula) stays in the suggestions and says so:
// "Filtre conseillé : UHC / OIII". The filters come from the catalogue's own
// data, the very ones the rest of the planner reads
// (`recommendedFilterFamilies`: the target's
// `observingGuide.visualFilterFamilies` when the catalogue gives it, the
// family of its type otherwise). A galaxy, a cluster or a star is broadband:
// nothing is written.
import { message } from "portal/i18n.js";
import { filterFamilyName } from "./filters-section.js";
import { recommendedFilterFamilies } from "./filters.js";
import { visualBestPairText } from "./visual-pairs.js";
import { fill } from "./wind-section.js";

// How many filters the line names at most: the two the catalogue puts first.
export const visualFilterAdviceMaxFamilies = 2;

const known = new Set(["dual", "ha", "oiii", "sii", "uhc", "hb"]);

// The narrowband or light-pollution families a visual observer should put in
// front of the eyepiece for `target`, most useful first; empty when the target
// needs none (broadband) or the catalogue says nothing.
export function visualFilterAdviceFamilies(target) {
  return (recommendedFilterFamilies(target, "visual") || [])
    .filter((family) => known.has(family))
    .slice(0, visualFilterAdviceMaxFamilies);
}

// The line, or `null` when the target needs no filter.
export function visualFilterAdviceText(locale, target) {
  const families = visualFilterAdviceFamilies(target);
  if (!families.length) return null;
  return fill(message(locale, "tonightFilterAdvice"), {
    filters: families
      .map((family) => filterFamilyName(locale, family) || family)
      .join(" / "),
  });
}

// The line of a suggested card (VISUAL-SIM-02b): what its best pair says
// (« Visible avec un filtre OIII », `card.visual.pair.advice` of `planNight`,
// « · pas dans votre matériel » for a generic profile), else the filter the
// target needs; `null` when neither has anything to say.
export function visualCardAdviceText(locale, card) {
  const advice = card?.visual?.pair?.advice ?? null;
  const pair = visualBestPairText(locale, advice);
  if (pair)
    return advice.generic === true
      ? `${pair} · ${message(locale, "visualPairNotOwned")}`
      : pair;
  return visualFilterAdviceText(locale, card?.target);
}
