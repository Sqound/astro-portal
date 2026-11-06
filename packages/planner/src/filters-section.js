// The words of "Owned filters" and "Advice for tonight" in the web
// planner's equipment stage (components `components/OwnedFilters.js` and
// `components/FilterAdvice.js`): the family lines, the names a new filter is
// given, and the sentences of the advice, worded from the keys
// `filterAdviceForNight` returns. Kept apart from the components so they are
// tested without rendering.
import { message } from "portal/i18n.js";
import { clock, fill } from "./wind-section.js";

// The families of the family picker, in the order of the catalogue.
export const ownedFilterFamilyChoices = Object.freeze([
  "dual",
  "ha",
  "oiii",
  "sii",
  "hb",
  "uhc",
  "broadband",
]);

const familyKeys = {
  dual: "plannerFilterFamilyDual",
  ha: "plannerFilterFamilyHa",
  oiii: "plannerFilterFamilyOiii",
  sii: "plannerFilterFamilySii",
  uhc: "plannerFilterFamilyUhc",
  hb: "plannerFilterFamilyHb",
  broadband: "plannerFilterFamilyBroadband",
  solar: "plannerFilterFamilySolar",
};

// The family's noun as the sentences use it ("double bande", "Hα", "UV/IR
// cut"); `null` for a family the planner does not know.
export function filterFamilyName(locale, family) {
  return familyKeys[family] ? message(locale, familyKeys[family]) : null;
}

// The same with a capital: the name a new filter is given.
export function filterFamilyDefaultName(locale, family) {
  const name = filterFamilyName(locale, family) || "";
  return name ? name[0].toUpperCase() + name.slice(1) : name;
}

// The second line of a filter's row: "Bande étroite, pour l’émission",
// "Large bande · toutes cibles"…
export function ownedFilterLine(locale, family) {
  if (family === "dual") return message(locale, "plannerOwnedFilterLineDual");
  if (["ha", "oiii", "sii", "hb"].includes(family))
    return fill(message(locale, "plannerOwnedFilterLineNarrow"), {
      band: filterFamilyName(locale, family),
    });
  if (family === "broadband")
    return message(locale, "plannerOwnedFilterLineBroadband");
  if (family === "uhc") return message(locale, "plannerOwnedFilterLineUhc");
  return message(locale, "plannerOwnedFilterLineUnknown");
}

export function filterAdviceTitle(locale, tonight) {
  return message(
    locale,
    tonight
      ? "plannerFilterAdviceTitleTonight"
      : "plannerFilterAdviceTitleNight",
  );
}

// The sentence of one advice item of `filterAdviceForNight`.
export function filterAdviceSentence({ locale, item, timeZone }) {
  const family =
    filterFamilyName(locale, item.filterFamily) || String(item.filterFamily);
  const bodyKey = {
    "moon-up-narrowband": "plannerFilterAdviceNarrowband",
    "moon-up-narrowband-missing": "plannerFilterAdviceNarrowbandMissing",
    "moon-down-broadband": "plannerFilterAdviceBroadband",
    "moon-dim-broadband": "plannerFilterAdviceBroadband",
  }[item.key];
  const advice = fill(
    message(locale, bodyKey || "plannerFilterAdviceBroadbandMissing"),
    { family },
  );
  const time = (value) => clock(Date.parse(value), locale, timeZone);
  if (item.key.startsWith("moon-dim"))
    return fill(message(locale, "plannerFilterAdviceDim"), { advice });
  const moon = item.key.startsWith("moon-up") ? "Up" : "Down";
  const span =
    { start: "Start", end: "End", middle: "Middle" }[item.span] || "Whole";
  return fill(message(locale, `plannerFilterAdvice${moon}${span}`), {
    advice,
    time:
      moon === "Up" ? time(item.span === "start" ? item.to : item.from) : "",
    from: time(item.from),
    to: time(item.to),
  });
}
