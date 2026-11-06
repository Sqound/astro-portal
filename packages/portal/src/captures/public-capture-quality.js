import { message } from "../i18n.js";

/**
 * The rows of the « Qualité » section of a capture's page (the statistics are
 * shown on the private and the public gallery alike, with a switch for each),
 * for the image shown — the same words
 * and units as the owner's zone « Qualité des captures › Cette image »
 * (`CaptureSessionQuality.js`): the FWHM of the stars in arc seconds and in
 * pixels, the eccentricity, the stars measured, on what it was measured, by
 * which tool and when. `quality` is `imageQuality` of `gallery.schema.json`,
 * present in the view only while the owner's switch of the gallery is on;
 * `[]` without it. Pure, so that a test reads what the page draws.
 */

const finite = (value) => typeof value === "number" && Number.isFinite(value);

const decimals = (value, locale, digits) =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

/** « 2,40″ · 3,1 px »: the arc seconds when the scale is known, the pixels always. */
function fwhmText(quality, locale) {
  return [
    finite(quality.fwhmArcsec)
      ? `${decimals(quality.fwhmArcsec, locale, 2)}″`
      : null,
    finite(quality.fwhmPixels)
      ? `${decimals(quality.fwhmPixels, locale, 1)} px`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** « 8 oct. 2026 »: the day of the measure, in UTC like the rest of the gallery. */
function measuredDay(value, locale) {
  const time = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) return null;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(time));
}

export function publicQualityRows(quality, locale = "en") {
  if (!quality || typeof quality !== "object") return [];
  const tool =
    quality.tool?.name && quality.tool?.version
      ? `${quality.tool.name} ${quality.tool.version}`
      : null;
  return [
    [message(locale, "qualityFwhm"), fwhmText(quality, locale)],
    [
      message(locale, "qualityEccentricity"),
      finite(quality.eccentricity)
        ? decimals(quality.eccentricity, locale, 2)
        : null,
    ],
    [
      message(locale, "qualityStarsMeasured"),
      Number.isInteger(quality.starCount)
        ? new Intl.NumberFormat(locale).format(quality.starCount)
        : null,
    ],
    [
      message(locale, "qualityMeasuredOn"),
      quality.measuredOn === "stretched"
        ? message(locale, "qualityMeasuredOnStretched")
        : quality.measuredOn === "linear"
          ? message(locale, "qualityMeasuredOnLinear")
          : null,
    ],
    [message(locale, "qualityTool"), tool],
    [
      message(locale, "qualityMeasuredAt"),
      measuredDay(quality.measuredAt, locale),
    ],
  ].filter(([, value]) => value);
}
