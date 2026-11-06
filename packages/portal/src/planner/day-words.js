// How the interface languages write a civil date made of a day and a month
// name (« 14. Oktober », « 14 de octubre », « 1º novembre »), for the two
// places that cannot use `Intl.DateTimeFormat` as it is: the night's label
// (`nightDateLabel`, `planner/state.js`) and the two dates of « Durée de la
// nuit » (`planner/night-span-copy.js`). The month names come from the
// platform's calendar data (`Intl`).
//
// One rule per language, read by plain `switch`es (the locale-table guard
// reads objects keyed by locale tags). A language without a rule here returns
// `null` from `civilDayLabel` and reads the English form of its caller.
//  - German: the day is an ordinal, « 14. Oktober »;
//  - Spanish: « 14 de octubre » (the first of the month is « 1 », not « 1.º »);
//  - Italian: « 14 ottobre », the first of the month is « 1º novembre »;
//  - Brazilian Portuguese: « 14 de outubro », the first is « 1º de novembro ».

/** « 14. », « 14 », « 1º »: the day of the month; `null` for English, French, Japanese. */
export function civilDayLabel(locale, day) {
  switch (locale) {
    case "de":
      return `${day}.`;
    case "es":
      return `${day}`;
    case "it":
    case "pt-BR":
      return day === 1 ? "1º" : `${day}`;
    default:
      return null;
  }
}

/** « 14. » + « Oktober » → « 14. Oktober »; « 14 » + « octubre » → « 14 de octubre ». */
export function civilDayMonthLabel(locale, dayLabel, month) {
  switch (locale) {
    case "es":
    case "pt-BR":
      return `${dayLabel} de ${month}`;
    default:
      return `${dayLabel} ${month}`;
  }
}

/**
 * The date `value` (a `Date`, read in UTC): the day, the month when `month`,
 * the year when `year` (« 31. Dezember 2026 », « 31 de diciembre de 2026 »).
 * `null` for a language without a rule.
 */
export function civilDateLabel(
  locale,
  value,
  { month = true, year = false } = {},
) {
  const day = civilDayLabel(locale, value.getUTCDate());
  if (day === null) return null;
  let text = day;
  if (month)
    text = civilDayMonthLabel(
      locale,
      day,
      new Intl.DateTimeFormat(locale, {
        month: "long",
        timeZone: "UTC",
      }).format(value),
    );
  if (year)
    text +=
      locale === "es" || locale === "pt-BR"
        ? ` de ${value.getUTCFullYear()}`
        : ` ${value.getUTCFullYear()}`;
  return text;
}

/** « Nacht vom 14. auf den 15. Oktober 2026 »: the label of a night from its two dates. */
export function civilNightRangeLabel(locale, from, to) {
  switch (locale) {
    case "de":
      return `Nacht vom ${from} auf den ${to}`;
    case "es":
      return `Noche del ${from} al ${to}`;
    case "it":
      return `Notte dal ${from} al ${to}`;
    case "pt-BR":
      return `Noite de ${from} a ${to}`;
    default:
      return null;
  }
}
