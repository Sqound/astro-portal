import {
  projectDateAfter,
  projectDaysBetween,
  projectNight,
  projectTargetCoordinate,
  validProjectDate,
} from "./project-night.js";
import { innerPlanetIds, planetIdOf } from "./solar-system-position.js";
import { targetIsSolarSystem } from "./target-night-facts.js";

/** The longest season a call computes (a year of nights). */
export const seasonWindowMaximumNights = 366;

/** Below this many usable minutes a night no longer counts ("moins de 3 h par nuit"). */
export const seasonDefaultMinimumMinutes = 180;

/**
 * Mercury and Venus have a rule of their own: they
 * never leave the Sun far enough for three hours at 30° in the night, so a
 * night is usable when the planet stays at least `seasonInnerPlanetMinAltitude`
 * degrees above the place's horizon mask, with the Sun at −6° or lower (the
 * end of civil twilight), for `seasonVenusMinimumMinutes` (Venus) or
 * `seasonMercuryMinimumMinutes` (Mercury) minutes in the evening or in the
 * morning (the better of the two counts). Mercury never leaves the Sun far
 * enough for half an hour above 10° at mid latitudes (the thresholds are ten
 * minutes for Mercury, half an hour for Venus).
 */
export const seasonInnerPlanetMinAltitude = 10;
export const seasonMercuryMinimumMinutes = 10;
export const seasonVenusMinimumMinutes = 30;
export const seasonInnerPlanetDarkness = "civil";

/** The minutes a night must give for `target`'s season (180; 10 for Mercury, 30 for Venus). */
export function seasonMinimumMinutes(target) {
  const planet = planetIdOf(target);
  if (planet === "solar-system-mercury") return seasonMercuryMinimumMinutes;
  if (planet === "solar-system-venus") return seasonVenusMinimumMinutes;
  return seasonDefaultMinimumMinutes;
}

/**
 * What a season is worked out for: the one plan `projectNight` is given, the
 * twilight threshold of its night, whether it is Mercury or Venus (`inner`)
 * and the minutes a night must give (`minimumMinutes`), or `null` when the
 * target gives nothing to work with (no coordinate and not a planet).
 *
 * A fixed target is judged by its coordinate, the Moon's limit of its
 * filters included. A planet is judged by its own place of each night, with
 * no Moon limit (a bright planet does not suffer from the Moon). Mercury and
 * Venus are judged by their own rule, see `seasonInnerPlanetMinAltitude`: 10°
 * whatever the plan's minimum height, the civil night, and the better of the
 * evening and the morning (`seasonNight`).
 */
export function seasonSubject({
  target,
  constraints,
  filters = [],
  darkness,
} = {}) {
  const planet = planetIdOf(target);
  if (planet) {
    const inner = innerPlanetIds.includes(planet);
    return {
      planet,
      inner,
      minimumMinutes: seasonMinimumMinutes(target),
      darkness: inner ? seasonInnerPlanetDarkness : darkness,
      plan: {
        key: "season",
        target,
        planet,
        constraints: {
          ...constraints,
          moonSeparationMinimum: 0,
          ...(inner ? { minAltitude: seasonInnerPlanetMinAltitude } : {}),
        },
        filters: [],
      },
    };
  }
  if (!projectTargetCoordinate(target)) return null;
  return {
    planet: null,
    inner: false,
    minimumMinutes: seasonDefaultMinimumMinutes,
    darkness,
    plan: { key: "season", target, constraints, filters },
  };
}

const MINUTE_MS = 60000;

/**
 * The better of the evening and the morning: the night, from `start` to
 * `end` (whole-minute instants), is cut in two at its middle, and the
 * windows' minutes are counted on each side. A planet that sets in the
 * evening or rises before the morning twilight never has both.
 */
export function seasonBestSideMinutes(start, end, windows) {
  const from = Date.parse(start) / MINUTE_MS;
  const to = Date.parse(end) / MINUTE_MS;
  const middle = from + Math.floor((to - from) / 2);
  let evening = 0;
  let morning = 0;
  for (const window of windows) {
    const [first, last] = [
      Date.parse(window.start) / MINUTE_MS,
      Date.parse(window.end) / MINUTE_MS,
    ];
    evening += Math.max(0, Math.min(last, middle) - Math.max(first, from));
    morning += Math.max(0, Math.min(last, to) - Math.max(first, middle));
  }
  return Math.max(evening, morning);
}

/**
 * What one night (a `projectNight` result for `subject.plan`) gives:
 * `{ usable, season }`, the plan's `usableMinutes` and `seasonMinutes`, or,
 * for Mercury and Venus, the better of the evening and the morning in both.
 */
export function seasonNight(subject, night) {
  const own = night.plans[0];
  if (!subject.inner)
    return { usable: own.usableMinutes, season: own.seasonMinutes };
  const best = seasonBestSideMinutes(night.start, night.end, own.windows);
  return { usable: best, season: best };
}

/**
 * The season of a target, computed on the device and
 * offline: for each of the coming `nights` nights from `from`, the minutes
 * the target is usable (above the plan's minimum altitude, clear of the
 * place's horizon mask, outside the Moon limit of the plan's filters), and
 * when the season ends.
 *
 * Arguments: `target` (`{ coordinate: { ra, dec } }`, degrees J2000, or a
 * planet: `{ id: "solar-system-jupiter" }`, see `seasonSubject`),
 * `place` (the plan's place, its `horizonMask` included), `constraints` (the
 * plan's), `filters` (the filter names of its equipment), `darkness` (the
 * night's twilight threshold, astronomical by default), `from`
 * (`YYYY-MM-DD`, the first night), `nights` (60), `minimumMinutes` (180, or
 * 30 for Mercury and Venus).
 *
 * Returns `null` without a usable place, date or target coordinate, else:
 *
 * - `nights`: `[{ date, usableMinutes, seasonMinutes, moonIllumination }]` —
 *   `seasonMinutes` is the night without the Moon's limit, what the season
 *   alone allows; `moonIllumination` in percent at nightfall;
 * - `state`: `ends` when the season ends inside the computed nights, `none`
 *   when no night reaches `minimumMinutes`, `continues` when the last night
 *   still does;
 * - `workableUntil`: with `ends`, the last night whose `seasonMinutes`
 *   reach `minimumMinutes` (a full Moon in the middle does not end a
 *   season: the Moon's nights come back, the season's do not); else `null`;
 * - `weeksLeft`: whole weeks from `from` to `workableUntil` with `ends`,
 *   `0` with `none`, `null` with `continues`.
 */
export function seasonWindow({
  target,
  place,
  constraints,
  filters = [],
  darkness,
  from,
  nights = 60,
  minimumMinutes,
} = {}) {
  const count = typeof nights === "number" ? Math.trunc(nights) : NaN;
  const subject = seasonSubject({ target, constraints, filters, darkness });
  const minimum =
    minimumMinutes === undefined
      ? (subject?.minimumMinutes ?? NaN)
      : typeof minimumMinutes === "number"
        ? minimumMinutes
        : NaN;
  if (
    !validProjectDate(from) ||
    !Number.isFinite(count) ||
    count < 1 ||
    count > seasonWindowMaximumNights ||
    !Number.isFinite(minimum)
  )
    return null;
  if (!subject) return null;
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const date = projectDateAfter(from, index);
    const night = projectNight({
      date,
      place,
      darkness: subject.darkness,
      plans: [subject.plan],
    });
    if (!night) return null;
    const minutes = seasonNight(subject, night);
    result.push({
      date,
      usableMinutes: minutes.usable,
      seasonMinutes: minutes.season,
      moonIllumination: night.moonIllumination,
    });
  }
  const workable = result.filter((night) => night.seasonMinutes >= minimum);
  if (!workable.length)
    return { nights: result, state: "none", workableUntil: null, weeksLeft: 0 };
  if (result.at(-1).seasonMinutes >= minimum)
    return {
      nights: result,
      state: "continues",
      workableUntil: null,
      weeksLeft: null,
    };
  const workableUntil = workable.at(-1).date;
  return {
    nights: result,
    state: "ends",
    workableUntil,
    weeksLeft: Math.floor(projectDaysBetween(from, workableUntil) / 7),
  };
}

/** The nights a target's season is worked out over (about four months). */
export const targetSeasonNights = 120;

/**
 * The season of one target without a plan: `seasonWindow` with the
 * planner's own defaults — a minimum height of 30° unless `constraints`
 * says otherwise, the place's horizon mask, the Moon limit of the context's
 * `filters` (25° without any), 120 nights, the card's 3 h threshold.
 * Free: it reads no capability. A planet is worked out night by night from
 * its own ephemeris. The Sun and the Moon have no season card: `null`, the
 * same answer as a missing place, date or coordinate (`targetIsSolarSystem`
 * tells the first apart).
 */
export function targetSeason({
  target,
  place,
  constraints,
  filters = [],
  darkness,
  from,
} = {}) {
  if (targetIsSolarSystem(target) && !planetIdOf(target)) return null;
  return seasonWindow({
    target,
    place,
    constraints,
    filters,
    darkness,
    from,
    nights: targetSeasonNights,
    minimumMinutes: seasonMinimumMinutes(target),
  });
}

// ---------------------------------------------------------------------
// The year
// ---------------------------------------------------------------------

/** `YYYY-MM-DD` of the first day of `date`'s month. */
function monthStart(date) {
  return `${date.slice(0, 7)}-01`;
}

/** The mean of `sum` over `count`, rounded half up. */
function meanMinutes(sum, count) {
  return Math.floor(sum / count + 0.5);
}

/**
 * The year of a target: when, over the
 * twelve months from the first day of `from`'s month, the target is usable.
 * The rules are the season's (`seasonSubject`: the minimum height, the
 * place's horizon mask, the astronomical night, the Moon's limit of the
 * filters; a planet: its own place of each night, no Moon limit) and so is the
 * threshold (`seasonMinimumMinutes` per night). Free; it reads no
 * capability. Heavy enough (every night of the year) to be asked for only
 * when the year is looked at, never when a sheet opens.
 *
 * Arguments: those of `targetSeason` (`from` is today).
 *
 * Returns `null` without a usable place, date or target (the Sun and the
 * Moon included), else:
 *
 * - `start`: the first day of the month of `from`; `days`: the days to the
 *   same day a year later; `today`: the day of `from` in them (from 0);
 * - `weeks`: `[{ start, nights, usableMinutes, seasonMinutes, workable }]`,
 *   one per run of seven nights from `start` (the last one is shorter);
 *   `usableMinutes` is the mean of the week's nights (the Moon's limit
 *   included, what the bar draws), `seasonMinutes` the same without the
 *   Moon's limit, and `workable` tells that the week reaches the threshold
 *   on `seasonMinutes` (a full Moon does not end a season);
 * - `state`: `allYear` (every week is workable), `never` (none is), else
 *   `periods`;
 * - `periods`: `[{ from, to }]`, the first and the last night of each run of
 *   workable weeks that reaches the threshold; a run that goes on from the
 *   end of the year to its beginning is one period (`from` after `to`);
 *   `[]` with `never`, one period with `allYear`;
 * - `best`: `{ start, end, usableMinutes }`, the full week with the highest
 *   mean (the first of equals; the short last week never wins on a night or
 *   two), `null` when nothing is usable.
 */
export function targetSeasonYear({
  target,
  place,
  constraints,
  filters = [],
  darkness,
  from,
} = {}) {
  if (!validProjectDate(from)) return null;
  if (targetIsSolarSystem(target) && !planetIdOf(target)) return null;
  const subject = seasonSubject({ target, constraints, filters, darkness });
  if (!subject) return null;
  const start = monthStart(from);
  const end = `${Number(from.slice(0, 4)) + 1}-${from.slice(5, 7)}-01`;
  const days = projectDaysBetween(start, end);
  const nights = [];
  for (let index = 0; index < days; index += 1) {
    const date = projectDateAfter(start, index);
    const night = projectNight({
      date,
      place,
      darkness: subject.darkness,
      plans: [subject.plan],
    });
    if (!night) return null;
    const minutes = seasonNight(subject, night);
    nights.push({ date, usable: minutes.usable, season: minutes.season });
  }
  const weeks = [];
  const reaching = [];
  for (let first = 0; first < days; first += 7) {
    const slice = nights.slice(first, first + 7);
    const usable = slice.reduce((sum, night) => sum + night.usable, 0);
    const season = slice.reduce((sum, night) => sum + night.season, 0);
    weeks.push({
      start: slice[0].date,
      nights: slice.length,
      usableMinutes: meanMinutes(usable, slice.length),
      seasonMinutes: meanMinutes(season, slice.length),
      workable: season >= subject.minimumMinutes * slice.length,
    });
    reaching.push(
      slice.filter((night) => night.season >= subject.minimumMinutes),
    );
  }
  let periods = [];
  for (let index = 0; index < weeks.length; index += 1) {
    if (!weeks[index].workable) continue;
    let last = index;
    while (last + 1 < weeks.length && weeks[last + 1].workable) last += 1;
    periods.push({
      from: reaching[index][0].date,
      to: reaching[last].at(-1).date,
    });
    index = last;
  }
  const state = !periods.length
    ? "never"
    : weeks.every((week) => week.workable)
      ? "allYear"
      : "periods";
  if (
    state === "periods" &&
    periods.length > 1 &&
    weeks[0].workable &&
    weeks.at(-1).workable
  )
    periods = [
      ...periods.slice(1, -1),
      { from: periods.at(-1).from, to: periods[0].to },
    ];
  let best = null;
  weeks.forEach((week, index) => {
    if (week.nights === 7 && week.usableMinutes > (best?.usableMinutes ?? 0))
      best = {
        start: week.start,
        end: projectDateAfter(week.start, week.nights - 1),
        usableMinutes: week.usableMinutes,
        index,
      };
  });
  if (best) delete best.index;
  return {
    start,
    days,
    today: projectDaysBetween(start, from),
    state,
    weeks,
    periods,
    best,
  };
}
