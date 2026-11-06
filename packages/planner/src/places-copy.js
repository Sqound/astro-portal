// The words of the places screens on the web, from the catalogue of
// `portal/i18n.js`. The plural
// forms are separate keys (`…Zero`, `…One`, `…Many`).
import { lowersMidSentence, message } from "portal/i18n.js";
import { fillMessage } from "./night-span-copy.js";
import {
  formatMagnitude,
  formatMagnitudeFine,
  formatMetres,
  formatPlaceDistance,
  magnitudePluralCount,
} from "./places-rules.js";
import { durationText } from "portal/written-forms.js";

/** A message with its `{name}` placeholders filled. */
export const placesText = (locale, key, values = {}) =>
  fillMessage(message(locale, key), values);

const capital = (word) => word[0].toUpperCase() + word.slice(1);

/** "Camping": a kind, alone. */
export const placeKindLabel = (locale, kind) =>
  message(locale, `placesKind${capital(kind)}`);

/** "Campings": a kind, as the chip of the filter says it. */
export const placeKindsLabel = (locale, kind) =>
  message(locale, `placesKinds${capital(kind)}`);

const pluralKey = (prefix, count) =>
  `${prefix}${count === 0 ? "Zero" : count === 1 ? "One" : "Many"}`;

/** "4 lieux", "Aucun lieu". */
export const placesCountLabel = (locale, count) =>
  placesText(locale, pluralKey("placesCount", count), { count });

/** "5 lieux trouvés". */
export const placesFoundLabel = (locale, count) =>
  placesText(locale, pluralKey("placesFound", count), { count });

/** "4 lieux · distances à vol d’oiseau depuis votre position" */
export const placesMineCountLabel = (locale, count, fromPosition) =>
  `${placesCountLabel(locale, count)} · ${message(
    locale,
    fromPosition ? "placesFromPosition" : "placesFromDefault",
  )}`;

/** "Bortle 4 · 20,9 mag/arcsec² ·" — "estimation" follows, in its own tag. */
export const placesSkyValuesLabel = (locale, sky, { fine = false } = {}) =>
  placesText(locale, "placesSkyValues", {
    bortle: sky.bortle,
    sqm: (fine ? formatMagnitudeFine : formatMagnitude)(sky.sqm, locale),
  });

/**
 * "−3,5", "+0,6", "≈ 0": the badge of a gap of sky, the figure
 * in the language's own decimals.
 */
export function skyDeltaBadgeLabel(locale, comparison) {
  if (comparison.kind === "comparable")
    return message(locale, "placesDeltaBadgeComparable");
  return placesText(
    locale,
    comparison.kind === "darker"
      ? "placesDeltaBadgeDarker"
      : "placesDeltaBadgeBrighter",
    { value: formatMagnitude(comparison.delta, locale) },
  );
}

/**
 * The label of the gap chip on a card of the list: [skyDeltaBadgeLabel], but a
 * comparable sky says "Ciel comparable" — a bare "≈ 0" named nothing.
 * The explanation keeps the enlarged figure,
 * its own title says the words.
 */
export function skyDeltaChipLabel(locale, comparison) {
  return comparison.kind === "comparable"
    ? message(locale, "placesComparable")
    : skyDeltaBadgeLabel(locale, comparison);
}

/**
 * The sentence of the gap with its reference, the title of the explanation:
 * "3,5 magnitudes plus sombre que Jardin de la maison", "Ciel
 * comparable". [reference] is `{ name, placeId }`; a reference without a
 * place id is the browser's position.
 */
export function skyDeltaTitle(locale, comparison, reference) {
  if (comparison.kind === "comparable")
    return message(locale, "placesComparable");
  return skyComparisonSentence(
    locale,
    comparison,
    referenceNameInSentence(locale, reference),
  );
}

/**
 * The name of a reference as a sentence carries it. The device's own position
 * ("Votre position") reads as a common noun in a sentence, in the languages
 * whose capitals are for names only (the registry's `midSentenceCase`): "1,6 magnitude plus sombre que votre
 * position", "à vol d’oiseau de votre position". A saved place keeps its
 * own name.
 */
export function referenceNameInSentence(locale, reference) {
  const name = reference?.name;
  if (reference?.placeId == null && name && lowersMidSentence(locale))
    return name[0].toLowerCase() + name.slice(1);
  return name;
}

/** What the explanation says of the reference (the sentence that was behind the ⓘ of the list's line). */
export const skyDeltaExplanation = (locale, reference, referenceSky) =>
  reference.placeId == null
    ? placesText(locale, "placesCompareExplainPosition", {
        sqm: formatMagnitude(referenceSky.sqm, locale),
      })
    : placesText(locale, "placesCompareExplainPlace", {
        place: reference.name,
        sqm: formatMagnitude(referenceSky.sqm, locale),
      });

/** "0.8 magnitude darker than Col des Mélèzes", in the detail's card. */
export function skyComparisonSentence(locale, comparison, place) {
  if (comparison.kind === "comparable")
    return placesText(locale, "placeComparableTo", { place });
  const form =
    magnitudePluralCount(locale, comparison.delta) === 1 ? "One" : "Many";
  return placesText(
    locale,
    `${comparison.kind === "darker" ? "placeDarkerThanText" : "placeBrighterThanText"}${form}`,
    { value: formatMagnitude(comparison.delta, locale), place },
  );
}

const accessKeys = {
  yes: "placeAccessYes",
  permissive: "placeAccessPermissive",
  private: "placeAccessPrivate",
  no: "placeAccessNo",
  customers: "placeAccessCustomers",
};

/** The `fee` of the source, in words; anything else as it is. */
export const feeLabel = (locale, fee) =>
  fee === "yes"
    ? message(locale, "placeFeeYes")
    : fee === "no"
      ? message(locale, "placeFeeNo")
      : fee;

/** The `access` keyword of the source, in words; anything else as it is. */
export const accessLabel = (locale, access) =>
  accessKeys[access] ? message(locale, accessKeys[access]) : access;

/** "1 octobre 2026": the day a result was read. */
export function placesDateLabel(locale, instant) {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
      new Date(instant),
    );
  } catch {
    return String(instant).slice(0, 10);
  }
}

/** "18 km", in the page's own words. */
export const placesDistanceLabel = (locale, km) =>
  formatPlaceDistance(km, locale);

/** "1 720 m". */
export const placesAltitudeLabel = (locale, metres) =>
  placesText(locale, "placeAltitudeValue", {
    metres: formatMetres(metres, locale),
  });

/**
 * A drive estimate in words, without "en voiture": "≈ 30 min",
 * "≈ 1 h 10", "moins de 5 min" (`0`).
 */
export function driveDurationLabel(locale, minutes) {
  if (!(minutes > 0)) return message(locale, "placesDriveUnderFive");
  return placesText(locale, "placesDriveApprox", {
    duration: durationText(minutes, locale),
  });
}

/** A drive estimate with its means: "≈ 30 min en voiture". */
export const driveByCarLabel = (locale, minutes) =>
  placesText(locale, "placesByCar", {
    duration: driveDurationLabel(locale, minutes),
  });

/**
 * "Nuages 12 % en moyenne cette nuit": the one fact "Meilleur cette
 * nuit" ranks by that the two lines above it do not already say (the Bortle
 * class is on the sky line, the drive time on the kind line), never a score.
 * "Prévision indisponible" where the place has no forecast.
 */
export function placeRankFactsLabel(locale, entry) {
  return entry.hasForecast && Number.isFinite(entry.cloud)
    ? placesText(locale, "placesFactCloud", { cloud: Math.round(entry.cloud) })
    : message(locale, "placesForecastUnavailable");
}

/**
 * The caption of the suggested places: `line` is the one line of data warning
 * that stays under the counter — "Classés selon la météo de cette nuit, le ciel
 * et le temps de trajet (estimations)." when "Meilleur cette nuit" ranks, else
 * "Distances à vol d’oiseau. Temps de trajet estimés." — and `paragraphs` are
 * what is behind the ⓘ: the distances and the drive times when the reference's
 * sky is known (what the gap "3,5 magnitudes plus sombre" means moved to the
 * explanation of the gap badge, `skyDeltaExplanation`); else "Distances à vol
 * d’oiseau depuis {lieu}. Temps de trajet estimés.". `detail` is the same text
 * in one string.
 */
export function placesCaptionWords(
  locale,
  { reference, referenceSky = null, ranked = false },
) {
  const paragraphs = referenceSky
    ? [
        `${message(locale, "placesDistancesNote")} ${message(locale, "placesDriveTimeNote")}`,
      ]
    : [
        `${placesText(locale, "placesDistancesFrom", { place: reference.name })} ${message(locale, "placesDriveTimeNote")}`,
      ];
  return {
    line: ranked
      ? message(locale, "placesBestTonightCaption")
      : `${message(locale, "placesDistancesNote")} ${message(locale, "placesDriveTimeNote")}`,
    title: message(locale, "placesTabSuggested"),
    paragraphs,
    detail: paragraphs.join(" "),
  };
}

/**
 * "Nuit du 12 octobre": how a plan that uses a place is named in the rows of
 * its sheet and of the refusal (the service gives `{ planId, name, planDate,
 * status }`); the plan's own name when it has no date.
 */
export function usagePlanLabel(locale, plan) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(plan?.planDate ?? ""))
    ? new Date(`${plan.planDate}T12:00:00Z`)
    : null;
  if (!date || Number.isNaN(date.getTime())) return String(plan?.name ?? "");
  return placesText(locale, "nightSummaryNightOf", {
    date: new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(date),
  });
}

/** "plan à exécuter", "exécuté"…: the state of a plan that uses a place. */
export function usagePlanStatusLabel(locale, status) {
  const key = {
    active: "placeUsageToRun",
    executed: "plannerPlanStatusExecuted",
    partial: "plannerPlanStatusPartial",
    abandoned: "plannerPlanStatusAbandoned",
    archived: "plannerPlanStatusArchived",
  }[status];
  if (!key) return "";
  const word = message(locale, key);
  return status === "active" ? word : word.toLocaleLowerCase(locale);
}

/** "40 m": a distance between two places of mine, from the duplicate rule. */
export const duplicateDistanceLabel = (locale, metres) =>
  metres < 1000
    ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(metres)} m`
    : formatPlaceDistance(metres / 1000, locale);

/** "Deux lieux semblent identiques : "X" et "Y", à 40 m l’un de l’autre." */
export const placesDuplicateLine = (locale, first, second, metres) =>
  placesText(locale, "placesDuplicateLine", {
    first,
    second,
    distance: duplicateDistanceLabel(locale, metres),
  });
