import { message } from "portal/i18n.js";
import {
  lightMapScaleBrightEndSqm,
  lightMapScaleDarkEndSqm,
  lightMapScaleStep,
  lightMapScaleSteps,
  skyBrightnessScalePosition,
} from "./sky-scale.js";
import {
  placeSkyMeasures,
  skyBrightnessSource,
} from "portal/sky-brightness-source.js";

// The observer's sky background on the web: the values Astro Sync measured on
// their own poses (`GET /v1/place-sky-measures`), kept in this browser for
// offline reading, combined with the value typed in the place's form
// (`skyEntered`) and the model's estimate by the rule of
// `portal/sky-brightness-source.js` and the words of
// the zone, the card and the dialog.

export const placeSkyMeasuresKey = "astro-portal:place-sky-measures:v1";
const measuresPath = "/api/v1/place-sky-measures";

/** The answer kept in this browser, or `null`. */
export function readKeptPlaceSkyMeasures(storage) {
  try {
    const kept = JSON.parse(storage?.getItem(placeSkyMeasuresKey) || "null");
    if (
      !kept ||
      typeof kept !== "object" ||
      !kept.list ||
      !Number.isFinite(Date.parse(kept.fetchedAt))
    )
      return null;
    return { status: "kept", list: kept.list, fetchedAt: kept.fetchedAt };
  } catch {
    return null;
  }
}

function keep(storage, list, fetchedAt) {
  try {
    storage?.setItem(placeSkyMeasuresKey, JSON.stringify({ fetchedAt, list }));
  } catch {
    // A full or blocked storage: the values stay for this page only.
  }
}

/**
 * Reads the route once: `fresh` (kept for later), else the kept answer
 * (`kept`, offline or the route down), else `unavailable`. A person without
 * a web session has nothing measured: `none`, and the kept answer of another
 * session is forgotten.
 */
export async function loadPlaceSkyMeasures({
  fetchImpl = globalThis.fetch,
  storage = null,
  now = () => new Date(),
  signal,
} = {}) {
  let response;
  try {
    response = await fetchImpl(measuresPath, {
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    return readKeptPlaceSkyMeasures(storage) ?? { status: "unavailable" };
  }
  if (response.status === 401 || response.status === 403) {
    try {
      storage?.removeItem(placeSkyMeasuresKey);
    } catch {
      // Nothing kept to forget.
    }
    return { status: "none" };
  }
  try {
    if (!response.ok) throw new Error("measures unavailable");
    const list = await response.json();
    const fetchedAt = now().toISOString();
    keep(storage, list, fetchedAt);
    return { status: "fresh", list, fetchedAt };
  } catch {
    return readKeptPlaceSkyMeasures(storage) ?? { status: "unavailable" };
  }
}

/** The model's estimate as the sky-brightness rule takes it, from the
 * sky-quality route (`{ bortleClass, sqm }`) or a place's estimate
 * (`{ bortle, sqm }`). */
export function skyModelOf(value) {
  if (!value || typeof value !== "object") return null;
  const bortleClass = value.bortleClass ?? value.bortle;
  return bortleClass === undefined && value.sqm === undefined
    ? null
    : { bortleClass, sqm: value.sqm ?? null };
}

/** The sky-brightness rule for [place]: `{ choice, measures }`. */
export function placeSkyBrightness({ place, model, measures }) {
  const read = measures ?? { status: "none" };
  const choice = skyBrightnessSource({
    measures: place?.id ? placeSkyMeasures(read.list, place.id) : [],
    entered: place?.skyEntered ?? null,
    model: skyModelOf(model),
  });
  return { choice: choice.source ? choice : null, measures: read };
}

/**
 * The sky the visual limit reads for a plan's place (`visualSuitability`,
 * VISUAL-SUGGESTIONS-PRECISION-01): `{ sqm, bortleClass }` of the value the
 * sky-brightness rule shows for `place` (measured, else typed in its saved
 * entry of `knownPlaces`, else `model`), or `null` without one.
 */
export function placeVisualSky({
  place,
  model = null,
  measures = null,
  knownPlaces = [],
}) {
  const known = (Array.isArray(knownPlaces) ? knownPlaces : []).find(
    (entry) => entry?.id && entry.id === place?.id,
  );
  const shown = placeSkyBrightness({
    place: known ? { ...place, skyEntered: known.skyEntered } : place,
    model,
    measures,
  }).choice?.shown;
  return shown ? { sqm: shown.sqm, bortleClass: shown.bortleClass } : null;
}

/**
 * The sky the night's note reads (`targetTonightScore`'s `skyQuality`,
 * TARGET-STATS-SKY-PLACE-01, Q4): `{ sqm, bortleClass, source? }` of the
 * value the rule shows (`choice`, from `placeSkyBrightness`), `source` being
 * `measured` or `entered` when a person gave it (the model's estimate says
 * nothing: no key), or `null` without a value.
 */
export function scoreSkyOfChoice(choice) {
  const shown = choice?.shown;
  if (!shown) return null;
  return {
    sqm: shown.sqm ?? null,
    bortleClass: shown.bortleClass,
    ...(choice.source === "measured" || choice.source === "entered"
      ? { source: choice.source }
      : {}),
  };
}

/**
 * [scoreSkyOfChoice] for `place`, as [placeVisualSky] reads it: its measured
 * value, else the one typed in its saved entry of `knownPlaces`, else
 * `model`.
 */
export function placeScoreSky({
  place,
  model = null,
  measures = null,
  knownPlaces = [],
}) {
  const known = (Array.isArray(knownPlaces) ? knownPlaces : []).find(
    (entry) => entry?.id && entry.id === place?.id,
  );
  return scoreSkyOfChoice(
    placeSkyBrightness({
      place: known ? { ...place, skyEntered: known.skyEntered } : place,
      model,
      measures,
    }).choice,
  );
}

/**
 * Whether the place's values are still being read: the measures of the
 * account on their first read, or no value yet while the model's estimate
 * is asked (`modelStatus`, the page's sky-quality read). The preview never
 * shows an interim value (a « Bortle 4 » that becomes a « Bortle 5 » under
 * the eyes): it waits.
 */
export function placeSkyLoading({ choice, measures, modelStatus }) {
  return (
    measures?.status === "loading" || (!choice && modelStatus === "loading")
  );
}

/**
 * What a page gives « Prévisualiser » to say whose sky the disc is seen under
 * (TARGET-STATS-SKY-PLACE-01): the value shown (`sky`, kept for the older
 * callers), the whole `choice` (`skyChoice`, with its source), whether it is
 * still being read, and the place's name and key (the forcing is forgotten
 * when the key changes).
 */
export function previewSkyProps({
  choice = null,
  place = null,
  loading = false,
}) {
  const name =
    String(place?.name ?? "").trim() || String(place?.locality ?? "").trim();
  return {
    sky: choice?.shown ?? null,
    skyChoice: choice ?? null,
    skyLoading: Boolean(loading),
    skyPlaceName: name,
    skyPlaceKey: String(place?.id ?? name),
  };
}

/** "mesuré", "saisi" or "estimation". */
export function skyBrightnessPill(locale, source) {
  return message(
    locale,
    source === "measured"
      ? "skyBrightnessMeasured"
      : source === "entered"
        ? "skyBrightnessEntered"
        : "tonightEstimate",
  );
}

/**
 * The info button's label: the estimate's wording for the model, else "valeur"
 * for a measured or entered value.
 */
export function skyBrightnessInfoLabel(locale, source) {
  return message(
    locale,
    source === "measured" || source === "entered"
      ? "skyBrightnessAboutValue"
      : "tonightSkyInfo",
  );
}

const fill = (template, values) =>
  template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match,
  );

// One decimal, like every other sky value of the product.
const sqmText = (locale, sqm, digits = 1) =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(sqm);

const dateText = (locale, value) => {
  const time = Date.parse(value);
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(time)
    : "";
};

// A night is a calendar day of the place, never moved by a time zone.
const nightText = (locale, night) =>
  /^\d{4}-\d{2}-\d{2}$/.test(night ?? "")
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(Date.parse(`${night}T12:00:00Z`))
    : "";

/**
 * The licensor's own attribution sentence of the VIIRS Nighttime Lights data
 * (Earth Observation Group, CC BY 4.0 requires it as written): kept word for
 * word in English in every language, in the "Sources" section.
 */
export const eogAttribution =
  "This product was made utilizing VIIRS Nighttime Lights (VNL) data produced by the Earth Observation Group, Payne Institute for Public Policy, Colorado School of Mines.";

/**
 * Everything the dialog says of [sky] (`placeSkyBrightness`): which value is
 * shown and why, the three values side by side, the measure's night and
 * poses (and that it was kept, offline), the entry's date, the model's text,
 * how the measure is made — and, last, "Sources": the data and calibration
 * credits, translated, and the licensor's sentence in English.
 */
export function skyBrightnessWords(sky, { locale }) {
  const choice = sky?.choice ?? null;
  const source = choice?.source ?? null;
  const measures = sky?.measures ?? { status: "none" };
  const { measured = null, entered = null, model = null } = choice ?? {};
  const tile = (kind, value) => ({
    kind,
    pill: skyBrightnessPill(locale, kind),
    value: value?.sqm == null ? "—" : sqmText(locale, value.sqm),
    detail: value
      ? `${message(locale, "bortle")} ${value.bortleClass}`
      : "mag/arcsec²",
    chosen: source === kind,
  });
  const measuredLines = measured
    ? [
        fill(
          message(
            locale,
            measured.poseCount === 1
              ? "skyBrightnessMeasuredDetailOne"
              : "skyBrightnessMeasuredDetailMany",
          ),
          {
            date: nightText(locale, measured.night),
            count: measured.poseCount,
          },
        ),
        ...(measured.nightCount > 1
          ? [
              fill(message(locale, "skyBrightnessMeasuredNights"), {
                count: measured.nightCount,
              }),
            ]
          : []),
        ...(measures.status === "kept" && measures.fetchedAt
          ? [
              fill(message(locale, "skyBrightnessMeasuredKept"), {
                date: dateText(locale, measures.fetchedAt),
              }),
            ]
          : []),
      ]
    : [
        message(
          locale,
          measures.status === "loading"
            ? "skyBrightnessMeasuredLoading"
            : measures.status === "unavailable"
              ? "skyBrightnessMeasuredUnavailable"
              : "skyBrightnessMeasuredNone",
        ),
      ];
  return {
    source,
    title: message(locale, "skyBrightnessSheetTitle"),
    pill: skyBrightnessPill(locale, source),
    info: skyBrightnessInfoLabel(locale, source),
    shown: message(
      locale,
      source === "measured"
        ? "skyBrightnessShownMeasured"
        : source === "entered"
          ? "skyBrightnessShownEntered"
          : "skyBrightnessShownModel",
    ),
    tiles: [
      tile("measured", measured),
      tile("entered", entered),
      tile("model", model),
    ],
    sections: [
      {
        kind: "measured",
        title: message(locale, "skyBrightnessMeasuredTitle"),
        lines: measuredLines,
      },
      {
        kind: "entered",
        title: message(locale, "skyBrightnessEnteredTitle"),
        lines: [
          entered?.enteredAt
            ? fill(message(locale, "skyBrightnessEnteredDetail"), {
                date: dateText(locale, entered.enteredAt),
              })
            : message(locale, "skyBrightnessEnteredNone"),
        ],
      },
      {
        kind: "model",
        title: message(locale, "skyBrightnessModelTitle"),
        lines: [
          ...(model ? [] : [message(locale, "skyBrightnessModelNone")]),
          message(locale, "plannerSkyQualityHelp"),
        ],
      },
      {
        kind: "how",
        title: message(locale, "skyBrightnessHowTitle"),
        lines: [message(locale, "skyBrightnessHow")],
      },
    ],
    sources: {
      title: message(locale, "infoSources"),
      lines: [
        message(locale, "skyQualityEogSource"),
        message(locale, "skyQualityCalibrationCredit"),
      ],
      attributions: [eogAttribution],
    },
    close: message(locale, "infoClose"),
  };
}

const sourceWord = (source) =>
  source === "measured"
    ? "Measured"
    : source === "entered"
      ? "Entered"
      : "Model";

/**
 * "Fond de ciel (SQM)", the dialog of the card of "Cette nuit": today's
 * words (`skyBrightnessWords`) with the continuous scale — its ends, the
 * whole figures under it, the value "Ici · 21,0" at its place — and "Le
 * SQM, c’est…".
 */
export function skyBackgroundWords(sky, { locale }) {
  const words = skyBrightnessWords(sky, { locale });
  const sqm = sky?.choice?.shown?.sqm;
  const value = Number.isFinite(sqm) ? sqmText(locale, sqm) : null;
  const dark = sqmText(locale, lightMapScaleDarkEndSqm);
  const bright = sqmText(locale, lightMapScaleBrightEndSqm);
  return {
    ...words,
    title: message(locale, "skyBrightnessSheetTitleSqm"),
    scale: value
      ? {
          here: fill(message(locale, "skyScaleHere"), { value }),
          position: skyBrightnessScalePosition(sqm),
          label: fill(message(locale, "skySqmScaleLabel"), {
            dark,
            bright,
            value,
          }),
          darkEnd: fill(message(locale, "skySqmScaleDarkEnd"), {
            value: dark,
          }),
          brightEnd: fill(message(locale, "skySqmScaleBrightEnd"), {
            value: bright,
          }),
          ticks: [21, 20, 19, 18].map((figure) => ({
            figure,
            position: skyBrightnessScalePosition(figure),
          })),
        }
      : null,
    about: {
      title: message(locale, "skySqmAboutTitle"),
      text: message(locale, "skySqmAbout"),
    },
  };
}

/**
 * "Comment on l’a obtenue": the provenance of the sky background the class
 * is read from, the value and the class's bounds to two decimals; class 1
 * has no upper bound and class 9 no lower one.
 */
export function bortleHowText({ source, sqm, bortle }, { locale }) {
  const step = lightMapScaleStep(bortle);
  const origin = message(locale, `bortleHowSource${sourceWord(source)}`);
  if (!step || !Number.isFinite(sqm)) return origin;
  const values = {
    source: origin,
    sqm: sqmText(locale, sqm),
    bortle,
    low: sqmText(locale, step.brightEdgeSqm, 2),
    high: sqmText(locale, step.darkEdgeSqm, 2),
  };
  return fill(
    message(
      locale,
      bortle === 1
        ? "bortleHowRangeDarkest"
        : bortle === 9
          ? "bortleHowRangeBrightest"
          : "bortleHowRange",
    ),
    values,
  );
}

/**
 * "Classe de Bortle", the dialog of the other card: the figure and the
 * class's full sentence, the nine steps of the light map's scale with the
 * class ringed and "Ici · 4", "L’échelle de Bortle", "Comment on l’a
 * obtenue", "Sources".
 */
export function bortleWords(sky, { locale }) {
  const shown = sky?.choice?.shown ?? null;
  const bortle = Number.isFinite(shown?.bortleClass) ? shown.bortleClass : null;
  const sqm = Number.isFinite(shown?.sqm) ? shown.sqm : null;
  return {
    title: message(locale, "bortleSheetTitle"),
    figure: bortle === null ? "—" : String(bortle),
    sentence:
      bortle === null
        ? message(locale, "plannerSkyQualityUnavailable")
        : message(locale, `tonightBortle${bortle}`),
    scale:
      bortle === null
        ? null
        : {
            here: fill(message(locale, "skyScaleHere"), { value: bortle }),
            label: fill(message(locale, "bortleScaleLabelHere"), { bortle }),
            darkEnd: fill(message(locale, "bortleScaleDarkEnd"), {
              value: sqmText(locale, lightMapScaleDarkEndSqm),
            }),
            brightEnd: fill(message(locale, "bortleScaleBrightEnd"), {
              value: sqmText(locale, lightMapScaleBrightEndSqm),
            }),
            steps: lightMapScaleSteps().map((step) => ({
              bortle: step.bortle,
              colour: step.colour,
              here: step.bortle === bortle,
              labelled: step.bortle % 2 === 1 || step.bortle === bortle,
            })),
          },
    about: {
      title: message(locale, "bortleScaleTitle"),
      text: message(locale, "bortleScaleAbout"),
    },
    how:
      bortle === null || sqm === null
        ? null
        : {
            title: message(locale, "bortleHowTitle"),
            text: bortleHowText(
              { source: sky?.choice?.source ?? null, sqm, bortle },
              { locale },
            ),
          },
    sources: {
      title: message(locale, "infoSources"),
      lines: [
        message(locale, "skyQualityEogSource"),
        message(locale, "skyQualityCalibrationCredit"),
      ],
      attributions: [eogAttribution],
    },
  };
}
