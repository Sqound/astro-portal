import { message } from "portal/i18n.js";
import { durationText } from "portal/components/sessions/night-summary-view.js";
import { normaliseHorizonMask } from "portal/planner/horizon-mask.js";
import { projectDateAfter, projectNight } from "./project-night.js";
import { innerPlanetIds, planetIdOf } from "./solar-system-position.js";
import {
  seasonDefaultMinimumMinutes,
  seasonInnerPlanetMinAltitude,
  seasonMinimumMinutes,
  seasonNight,
  seasonVenusMinimumMinutes,
  seasonSubject,
} from "./season-window.js";

// The words and figures of the "Saison" card (`components/SeasonCard.js`),
// shared by the page of a multi-night plan and the sheet of a target. Free:
// plain functions of a `seasonWindow` result, a locale and the rules the
// season was computed from.
// The words are the catalogues' `multiNightSeason…`,
// `multiNightChart…`, `multiNightLegend…`, `multiNightComputedHere` and
// `multiNightRule…`.

/** The chart draws eight weeks. */
export const seasonChartNights = 56;

/** `{name}` → `values.name`, every occurrence. */
export function seasonFill(template, values = {}) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value ?? "")),
    String(template ?? ""),
  );
}

/** A catalogue sentence of the card, filled. */
export function seasonWord(locale, key, values = {}) {
  return seasonFill(message(locale, key), values);
}

/**
 * The branch of an ICU `{count, plural, =0{…} one{…} other{…}}` message for
 * `count`: an exact `=N` branch, else the language's own plural category
 * (Russian's one, few, many), else `other`; `{count}` filled.
 */
export function seasonPlural(locale, template, count) {
  const body = String(template).slice(String(template).indexOf("plural,") + 7);
  const branches = [
    ...body.matchAll(
      /(=\d+|zero|one|two|few|many|other)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g,
    ),
  ];
  const category = new Intl.PluralRules(locale).select(count);
  const chosen =
    branches.find(([, name]) => name === `=${count}`) ||
    branches.find(([, name]) => name === category) ||
    branches.find(([, name]) => name === "other");
  return chosen ? chosen[2].replaceAll("{count}", String(count)) : "";
}

const dateOf = (iso) => new Date(`${iso}T12:00:00Z`);

/** "4 h 10", "12 h", "50 min": the one duration writing (U4). */
export function seasonDuration(locale, minutes) {
  return durationText(locale, minutes);
}

/** "5 novembre", "28 septembre" — a day and its month. */
export function seasonDayMonth(locale, iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(dateOf(iso));
}

/** "5 nov.", "28 sept." */
export function seasonDayMonthShort(locale, iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(dateOf(iso));
}

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * The Moon's limit as the season and the calendar apply it: "Lune à moins
 * de 30° exclue" — the most tolerant of the `filters`, else the
 * `constraints`' own separation (25° without any). The Moon is limited by its
 * distance to the target, never by its illumination (question 2).
 */
export function seasonMoonRule(locale, { constraints, filters = [] } = {}) {
  const byFilter = constraints?.moonSeparationMinimumByFilter;
  if (byFilter && typeof byFilter === "object" && filters.length) {
    let name = null;
    let smallest = null;
    for (const filter of filters) {
      const value = finite(byFilter[filter]);
      if (value !== null && (smallest === null || value < smallest)) {
        smallest = value;
        name = String(filter);
      }
    }
    if (smallest !== null)
      return seasonWord(locale, "multiNightRuleMoonFilter", {
        moon: Math.round(smallest),
        filter: name,
      });
  }
  const moon = finite(constraints?.moonSeparationMinimum);
  return seasonWord(locale, "multiNightRuleMoon", {
    moon: Math.round(moon ?? 25),
  });
}

/**
 * The whole line after "Calculé sur cet appareil :": the minimum height,
 * the horizon mask when the place has one, the Moon's limit.
 */
export function seasonRulesLine(
  locale,
  { constraints, filters = [], place, target = null },
) {
  const maskOn = normaliseHorizonMask(place?.horizonMask).enabled;
  const planet = planetIdOf(target);
  const inner = innerPlanetIds.includes(planet);
  return [
    seasonWord(locale, "multiNightRuleAltitude", {
      altitude: inner
        ? seasonInnerPlanetMinAltitude
        : Math.round(constraints?.minAltitude ?? 30),
    }),
    ...(maskOn ? [seasonWord(locale, "multiNightRuleMask")] : []),
    // A planet is not troubled by the Moon; Mercury and Venus have their own
    // rule: 10°, the Sun at −6° or lower, half an hour (ten minutes for Mercury)
    // in the evening or in the morning.
    ...(planet
      ? [
          seasonWord(locale, "multiNightRulePlanetMoon"),
          ...(inner
            ? [
                seasonWord(locale, "multiNightRulePlanetInner", {
                  threshold: seasonDuration(
                    locale,
                    seasonMinimumMinutes(target),
                  ),
                }),
              ]
            : []),
        ]
      : [seasonMoonRule(locale, { constraints, filters })]),
  ].join(seasonWord(locale, "multiNightRuleSeparator"));
}

/**
 * Why the season ends after the night before `dayAfter`: `mask` when the
 * place's horizon mask is what takes the night below the threshold, `low`
 * when the target is too low anyway.
 */
export function seasonEndCause({
  place,
  target,
  constraints,
  filters = [],
  dayAfter,
}) {
  if (!place || !normaliseHorizonMask(place.horizonMask).enabled) return "low";
  const subject = seasonSubject({ target, constraints, filters });
  if (!subject) return "low";
  const night = projectNight({
    date: dayAfter,
    place: { ...place, horizonMask: null },
    darkness: subject.darkness,
    plans: [subject.plan],
  });
  if (!night) return "low";
  return seasonNight(subject, night).season >= subject.minimumMinutes
    ? "mask"
    : "low";
}

// ---------------------------------------------------------------------
// The year view of the card
// ---------------------------------------------------------------------

/** Chinese and Japanese write a month as its number and "月". */
const cjk = (locale) => /^(ja|zh)/.test(String(locale));

const monthOf = (iso) => Number(String(iso).slice(5, 7));

/**
 * The month of a day written for a sentence ("octobre", "октября" — the
 * form after a part of the month — "10月"), by the platform's date
 * formatting; never typed here.
 */
export function seasonMonthName(locale, iso) {
  if (cjk(locale)) return `${monthOf(iso)}月`;
  return (
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    })
      .formatToParts(dateOf(iso))
      .find((part) => part.type === "month")?.value ?? ""
  );
}

/** The month of the axis: an initial ("O"), "10月" in Chinese and Japanese. */
export function seasonMonthInitial(locale, iso) {
  if (cjk(locale)) return `${monthOf(iso)}月`;
  return new Intl.DateTimeFormat(locale, {
    month: "narrow",
    timeZone: "UTC",
  }).format(dateOf(iso));
}

/** `early` (days 1 to 10), `mid` (11 to 20) or `late` of the month of a day. */
export function seasonMonthPart(iso) {
  const day = Number(String(iso).slice(8, 10));
  return day <= 10 ? "early" : day <= 20 ? "mid" : "late";
}

/** The branch of an ICU `{part, select, early{…} mid{…} late{…} other{…}}`. */
export function seasonSelect(template, value) {
  const body = String(template).slice(String(template).indexOf("select,") + 7);
  const branches = [...body.matchAll(/(\w+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)];
  const chosen =
    branches.find(([, name]) => name === value) ||
    branches.find(([, name]) => name === "other");
  return chosen ? chosen[2] : "";
}

/** "de fin août", "à mi-janvier", "début novembre": a day in its month. */
export function seasonYearPoint(locale, key, iso) {
  return seasonSelect(
    message(locale, `multiNightSeasonYear${key}`),
    seasonMonthPart(iso),
  ).replaceAll("{month}", seasonMonthName(locale, iso));
}

/**
 * The twelve months of a year view, in order: `{ date (the 1st), offset (the
 * day of the window it begins on), days, label (the axis) }`.
 */
export function seasonYearMonths(locale, year) {
  const months = [];
  let offset = 0;
  while (offset < year.days) {
    const date = projectDateAfter(year.start, offset);
    const [y, m] = [Number(date.slice(0, 4)), Number(date.slice(5, 7))];
    const days = Math.min(
      new Date(Date.UTC(y, m, 0)).getUTCDate(),
      year.days - offset,
    );
    months.push({
      date,
      offset,
      days,
      label: seasonMonthInitial(locale, date),
    });
    offset += days;
  }
  return months;
}

/** "Usable hours per week, over the twelve months starting in October." */
export function seasonYearCaption(locale, year) {
  return seasonWord(locale, "multiNightSeasonYearChartLabel", {
    from: seasonMonthName(locale, year.start),
  });
}

/**
 * The year in one sentence: "Exploitable de fin août à mi-janvier ; le mieux
 * début novembre.", "Exploitable toute l’année ; …", or why it never is.
 * `inner` tells that the target is Mercury or Venus (their own reason);
 * `minimumMinutes` is the planet's own threshold (`seasonMinimumMinutes`,
 * Venus's when it is left out).
 */
export function seasonYearSentence(
  locale,
  year,
  {
    inner = false,
    minimumMinutes = inner
      ? seasonVenusMinimumMinutes
      : seasonDefaultMinimumMinutes,
  } = {},
) {
  const threshold = seasonDuration(locale, minimumMinutes);
  if (year.state === "never")
    return seasonWord(
      locale,
      inner ? "multiNightSeasonYearNeverInner" : "multiNightSeasonYearNever",
      { threshold },
    );
  const best = year.best
    ? seasonYearPoint(locale, "At", projectDateAfter(year.best.start, 3))
    : "";
  if (year.state === "allYear")
    return seasonWord(locale, "multiNightSeasonYearAllYear", { best });
  const periods = year.periods
    .map((period) => {
      const [from, to] = [
        seasonYearPoint(locale, "From", period.from),
        seasonYearPoint(locale, "To", period.to),
      ];
      const same =
        period.from.slice(0, 7) === period.to.slice(0, 7) &&
        seasonMonthPart(period.from) === seasonMonthPart(period.to);
      return same
        ? seasonYearPoint(locale, "At", period.from)
        : seasonWord(locale, "multiNightSeasonYearRange", { from, to });
    })
    .join(seasonWord(locale, "multiNightRuleSeparator"));
  return seasonWord(locale, "multiNightSeasonYearPeriods", { periods, best });
}

/** Whether the year view's target is Mercury or Venus. */
export function seasonYearInner(target) {
  return innerPlanetIds.includes(planetIdOf(target));
}
