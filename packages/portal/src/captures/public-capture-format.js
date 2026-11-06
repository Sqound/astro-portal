/**
 * How the public gallery writes a public capture: its title, its second
 * line and the month of its night. Pure and free of the catalogue, so
 * that the page in the browser reads it without the catalogue's tables
 * (`public-capture-view.js` builds the data on the server and re-exports
 * these).
 */

/**
 * « Octobre 2026 », « October 2026 », « 2026年10月 »: the month of the night
 * as a card and the detail page write it, its first letter upper-cased
 * (« Octobre 2026 » at the head of a line).
 */
export function formatNightMonth(month, locale = "en") {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  if (!match) return null;
  const text = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

// The languages whose range format is numeric (« 2026/08～2026/09 »): the
// two months are written out in full instead, as a single month is.
const WRITTEN_OUT_RANGES = new Set(["ja", "zh"]);

/**
 * The months of the nights a capture combines: « Août 2026 » for one month,
 * « Août – septembre 2026 » for a period (« Décembre 2026 – janvier 2027 »
 * across a year), in the language's own range format. `end` is the last
 * month when it differs from `start` (the image of a multi-night plan),
 * else `null`; a month that is not one reads as none.
 */
export function formatNightMonths(start, end = null, locale = "en") {
  const first = formatNightMonth(start, locale);
  const last = end && end !== start ? formatNightMonth(end, locale) : null;
  if (!first || !last) return first;
  const dates = [start, end].map((month) => {
    const [year, number] = month.split("-").map(Number);
    return new Date(Date.UTC(year, number - 1, 1));
  });
  const format = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const text = WRITTEN_OUT_RANGES.has(String(locale).split("-")[0])
    ? `${first}\u2009–\u2009${last}`
    : format.formatRange(dates[0], dates[1]);
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/**
 * The title of a capture as the card and the detail page write it:
 * « M31 — Galaxie d’Andromède », the other targets after « · », or the word
 * of a capture without a target (`noTarget`, « Sans cible »).
 */
export function publicCaptureTitle(capture, noTarget) {
  const [first, ...others] = capture?.targets ?? [];
  if (!first) return noTarget;
  const head = first.name
    ? `${first.designation} — ${first.name}`
    : first.designation;
  return [head, ...others.map((target) => target.designation)].join(" · ");
}

/** The second line of a card, « M31 · NGC 224 ». */
export function publicCaptureAliases(capture) {
  const first = capture?.targets?.[0];
  if (!first) return "";
  const line = [
    ...new Set([first.designation, ...(first.aliases ?? [])].filter(Boolean)),
  ].join(" · ");
  // A target known by its designation alone: the title already says it (alone
  // or before its name), the line under would say it a second time.
  return line === first.designation ? "" : line;
}
