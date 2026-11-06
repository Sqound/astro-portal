// What the card "Meilleure période / À éviter" says and draws
// from what the service answered (`place-climate-trend.schema.json`): pure, no
// React, no network.
//
// The words are the catalogues' (`conditionsTrend*`); the months are the locale's own (`Intl`), never written. The
// numbers are not worked out again here: the service chose the periods, this
// only reads them (the one exception is the amplitude of a year without a
// season, the lowest and the highest month, which the service does not give).
import { message } from "portal/i18n.js";

const MONTHS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

// Languages that write a month as a number and a counter (一月, 1月): their
// narrow form is the number alone, which stays legible under a bar.
const NUMERIC_MONTH_LANGUAGES = /^(ja|zh)/;

const monthDate = (month) => new Date(Date.UTC(2026, month - 1, 15, 12));

/** "mai", "August": the month's name in `locale`. */
export const trendMonthName = (locale, month) =>
  new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(
    monthDate(month),
  );

/** The one-character label under a bar ("J", "5"). */
export function trendMonthInitial(locale, month) {
  if (NUMERIC_MONTH_LANGUAGES.test(locale)) return String(month);
  return new Intl.DateTimeFormat(locale, {
    month: "narrow",
    timeZone: "UTC",
  }).format(monthDate(month));
}

/** "62 %" in the locale's own way (a fine no-break space in French). */
export const trendPercent = (locale, share) =>
  new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(Math.round(share) / 100);

const startsWithVowel = (text) => /^[aeiouyàâéèêîôû]/i.test(text);

/**
 * "de mai à août" (`conditionsTrendRange`), "d’avril à août" where French
 * elides: the elided form is a key of its own, as for the history line.
 */
export function trendRangeWords(locale, from, to) {
  const start = trendMonthName(locale, from);
  const elided = startsWithVowel(start);
  const text = message(
    locale,
    elided ? "conditionsTrendRangeElided" : "conditionsTrendRange",
  );
  return text
    .replaceAll("{from}", start)
    .replaceAll("{to}", trendMonthName(locale, to));
}

/** Is `month` inside the window `{ from, to }` (it may cross the year-end)? */
export const monthInPeriod = (period, month) =>
  Boolean(period) &&
  (period.from <= period.to
    ? month >= period.from && month <= period.to
    : month >= period.from || month <= period.to);

/**
 * The run of months without a dark night (`clearShare: null`: a polar
 * summer), `{ from, to }`, or `null`. The year is a circle: a run that
 * crosses the year-end is one run.
 */
export function noDarkPeriod(months) {
  const empty = new Set(
    months.filter((month) => month.clearShare === null).map((m) => m.month),
  );
  if (!empty.size || empty.size === 12) return null;
  const previous = (month) => (month === 1 ? 12 : month - 1);
  const next = (month) => (month === 12 ? 1 : month + 1);
  const from = MONTHS.find(
    (month) => empty.has(month) && !empty.has(previous(month)),
  );
  let to = from;
  while (empty.has(next(to))) to = next(to);
  return { from, to };
}

/**
 * The card's content from a ready answer:
 * `{ kind, best, worst, noDark, bars, low, high }`.
 *
 * - `kind` `"distinct"`: a best and a worst period (two lines);
 * - `"flat"`: no net season (one sentence with the amplitude, no period
 *   designated, the bars all neutral);
 * - `"none"`: not enough history (one sentence).
 *
 * `bars` is twelve `{ month, share, tone }` (`tone`: `best`, `worst`, `rest`,
 * `empty` for a month without a dark night, never `worst`).
 */
export function conditionsTrendModel(trend) {
  const months = trend.months;
  const noDark = noDarkPeriod(months);
  const shares = months
    .map((month) => month.clearShare)
    .filter((share) => share !== null);
  const model = {
    kind: "none",
    best: null,
    worst: null,
    noDark,
    low: shares.length ? Math.round(Math.min(...shares)) : null,
    high: shares.length ? Math.round(Math.max(...shares)) : null,
    bars: [],
  };
  if (trend.trend === "distinct" && trend.best && trend.worst) {
    model.kind = "distinct";
    model.best = trend.best;
    model.worst = trend.worst;
  } else if (trend.trend === "flat" && shares.length) {
    model.kind = "flat";
  }
  model.bars = months.map((month) => ({
    month: month.month,
    share: month.clearShare,
    tone:
      month.clearShare === null
        ? "empty"
        : model.kind === "distinct" && monthInPeriod(model.best, month.month)
          ? "best"
          : model.kind === "distinct" && monthInPeriod(model.worst, month.month)
            ? "worst"
            : "rest",
  }));
  return model;
}

/** "Pas de saison nette : ciel dégagé 31 à 52 % …" */
export const trendFlatWords = (locale, model) =>
  message(locale, "conditionsTrendFlat")
    .replaceAll("{low}", String(model.low))
    .replaceAll("{high}", String(model.high));

/** "Pas de nuit noire : de mai à juillet" (the high latitudes). */
export const trendNoDarkWords = (locale, period) =>
  message(locale, "conditionsTrendNoDark").replaceAll(
    "{range}",
    trendRangeWords(locale, period.from, period.to),
  );

/** The sample the locked inset draws, plausible and flagged as a sample. */
export const SAMPLE_CONDITIONS_TREND = Object.freeze({
  status: "ready",
  trend: "distinct",
  best: Object.freeze({ from: 5, to: 8, clearShare: 62 }),
  worst: Object.freeze({ from: 11, to: 1, clearShare: 18 }),
  months: Object.freeze(
    [18, 27, 34, 45, 58, 64, 66, 60, 47, 35, 20, 16].map((share, index) =>
      Object.freeze({
        month: index + 1,
        nightHours: 1000,
        clearHours: share * 10,
        clearShare: share,
        goodNights: 0,
        nights: 0,
      }),
    ),
  ),
});
