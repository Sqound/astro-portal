import { planNightGeometry } from "./planner.js";
import { meridianTransit } from "./schedule.js";
import { planetBody } from "./solar-system-position.js";
import { plannerPointConstraint, visibilityWindows } from "./constraints.js";
import {
  horizonAltitude,
  normaliseHorizonMask,
} from "portal/planner/horizon-mask.js";

// One night of one or several targets at a place: for each, the windows the
// planner itself would call usable that night — above the minimum altitude,
// clear of the place's horizon mask, outside the Moon limit of the filters.
// Nothing here is a second ephemeris: the night, the Moon and every
// ten-minute sample come from the planner's own `planNightGeometry`, and the
// constraints from `plannerPointConstraint`/`visibilityWindows`, the very
// functions a night plan uses. Free: the season of one target (`seasonWindow`)
// and a target's night (`targetNightFacts`) read it, and so do the
// multi-night plans.

const MINUTE_MS = 60000;
const DAY_MS = 86400000;

/** The planner's own defaults (`planNight`). */
export const projectDefaultMinAltitude = 30;
export const projectDefaultMoonSeparation = 25;

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** An instant rounded to the nearest whole minute, ISO-8601 UTC. */
export function minuteInstant(value) {
  const ms = typeof value === "number" ? value : Date.parse(value);
  return new Date(Math.round(ms / MINUTE_MS) * MINUTE_MS).toISOString();
}

/** `YYYY-MM-DD` plus `days` days. */
export function projectDateAfter(date, days) {
  const value = Date.parse(`${date}T12:00:00Z`);
  return new Date(value + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, two `YYYY-MM-DD` dates. */
export function projectDaysBetween(from, to) {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS,
  );
}

export function validProjectDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return false;
  const value = Date.parse(`${date}T12:00:00Z`);
  // A calendar day that exists: "2026-02-30" is refused, not rolled over.
  return (
    Number.isFinite(value) &&
    new Date(value).toISOString().slice(0, 10) === date
  );
}

/**
 * The Moon limit of a plan: the separation its filters ask for. Like
 * `planNight`, the plan works with the most tolerant of its filters (the one
 * with the smallest separation); a filter without its own value takes the
 * plan's `moonSeparationMinimum`, and a plan without filters takes that
 * value alone.
 */
export function projectMoonSeparation(constraints, filters) {
  const base =
    finiteNumber(constraints?.moonSeparationMinimum) ??
    projectDefaultMoonSeparation;
  const byFilter =
    constraints?.moonSeparationMinimumByFilter &&
    typeof constraints.moonSeparationMinimumByFilter === "object"
      ? constraints.moonSeparationMinimumByFilter
      : {};
  const values = (Array.isArray(filters) ? filters : [])
    .filter((filter) => typeof filter === "string" && filter)
    .map((filter) => finiteNumber(byFilter[filter]) ?? base);
  return values.length ? Math.min(...values) : base;
}

export function projectMinAltitude(constraints) {
  return finiteNumber(constraints?.minAltitude) ?? projectDefaultMinAltitude;
}

/** The target's `{ ra, dec }` in degrees, or `null`. */
export function projectTargetCoordinate(target) {
  const ra = finiteNumber(target?.coordinate?.ra);
  const dec = finiteNumber(target?.coordinate?.dec);
  return ra === null || dec === null ? null : { ra, dec };
}

/** The place of a plan as the planner's `location`. */
export function projectLocation(place) {
  const latitude = finiteNumber(place?.latitude);
  const longitude = finiteNumber(place?.longitude);
  if (latitude === null || longitude === null) return null;
  const location = {
    latitude,
    longitude,
    elevation: finiteNumber(place?.elevation) ?? 0,
  };
  if (typeof place.timeZone === "string" && place.timeZone)
    location.timeZone = place.timeZone;
  return location;
}

function minutesOf(windows) {
  return windows.reduce(
    (sum, window) =>
      sum + (Date.parse(window.end) - Date.parse(window.start)) / MINUTE_MS,
    0,
  );
}

function roundedWindows(windows) {
  return windows
    .map((window) => ({
      start: minuteInstant(window.start),
      end: minuteInstant(window.end),
    }))
    .filter((window) => Date.parse(window.end) > Date.parse(window.start));
}

function constrainedWindows(series, context) {
  const constrained = series.map((point) => ({
    time: point.time,
    altitude: point.altitude,
    azimuth: point.azimuth,
    moonSeparation: point.moonSeparation,
    ...plannerPointConstraint({
      point,
      profileAltitude: context.maskEnabled
        ? horizonAltitude(context.mask, point.azimuth)
        : 0,
      horizonEnabled: context.maskEnabled,
      minAltitude: context.minAltitude,
      moonSeparationMinimum: context.moonSeparationMinimum,
    }),
  }));
  return roundedWindows(
    visibilityWindows(constrained, {
      minAltitude: context.minAltitude,
      moonSeparationMinimum: context.moonSeparationMinimum,
    }),
  );
}

/**
 * The Moon above the horizon during the night, from the planner's ten-minute
 * Moon track: `[{ start, end }]`, each edge interpolated linearly between the
 * two samples around it, rounded to the minute.
 */
export function moonUpIntervals(moonSeries) {
  const intervals = [];
  let start = null;
  for (let index = 0; index < moonSeries.length; index += 1) {
    const point = moonSeries[index];
    const up = point.altitude > 0;
    const previous = moonSeries[index - 1];
    if (up && start === null) {
      start = previous ? crossing(previous, point) : Date.parse(point.time);
    }
    if (!up && start !== null) {
      intervals.push([start, crossing(previous, point)]);
      start = null;
    }
  }
  if (start !== null && moonSeries.length)
    intervals.push([start, Date.parse(moonSeries.at(-1).time)]);
  return roundedWindows(
    intervals.map(([from, to]) => ({ start: from, end: to })),
  );
}

function crossing(before, after) {
  const from = Date.parse(before.time);
  const to = Date.parse(after.time);
  const span = before.altitude - after.altitude;
  const ratio =
    Number.isFinite(span) && span !== 0
      ? Math.min(1, Math.max(0, before.altitude / span))
      : 1;
  return Math.trunc(from + (to - from) * ratio);
}

/**
 * When the target is highest during the night, from the planner's
 * ten-minute samples: its meridian transit (`meridianTransit`, interpolated
 * between the samples) when it culminates inside the night, else the
 * highest sample (the night's first or last one for a target rising or
 * setting all night); rounded to the minute, `null` without samples. The
 * assisted allocation centres a night's share on it.
 */
function seriesPeak(series, geometry) {
  const transit = meridianTransit(
    { series },
    { start: geometry.start, end: geometry.end },
  );
  if (transit)
    return minuteInstant(
      Date.parse(geometry.start) + transit.minute * MINUTE_MS,
    );
  let best = null;
  for (const point of series) {
    const altitude = Number(point?.altitude);
    if (!Number.isFinite(altitude)) continue;
    if (best === null || altitude > best.altitude)
      best = { altitude, time: point.time };
  }
  return best ? minuteInstant(best.time) : null;
}

/**
 * One night for a set of plans, each with one target.
 *
 * `plans`: `[{ key, target: { coordinate: { ra, dec } }, constraints,
 * filters, planet? }]` — `target.coordinate` in degrees (J2000), `constraints`
 * the plan's (`minAltitude`, `moonSeparationMinimum`,
 * `moonSeparationMinimumByFilter`), `filters` the filter names of its
 * equipment. `planet`, the `solar-system-…` id of a planet, puts the planet's
 * own place of that night (astronomy-engine, at every ten-minute sample) in
 * place of the coordinate. `place`: `{ latitude, longitude, timeZone?,
 * elevation?, horizonMask? }`.
 *
 * Returns `null` when the place or the date cannot give a night, else
 * `{ start, end, darkMinutes, moonIllumination, moonSeries, plans: [{ key,
 * usableMinutes, seasonMinutes, windows, peak, reason }] }`: `windows` are
 * the usable windows rounded to the minute; `seasonMinutes` the same without
 * the Moon's limit (what the season alone allows); `peak` when the target is
 * highest that night (`seriesPeak`, `null` without a target coordinate);
 * `reason`, only when nothing
 * is usable, says what stood in the way: `moon`, `horizon` or `altitude`
 * (`null` when the plan has no usable target coordinate).
 */
export function projectNight({ date, place, darkness, plans }) {
  const location = projectLocation(place);
  if (!location || !validProjectDate(date)) return null;
  const entries = (Array.isArray(plans) ? plans : []).map((plan) => {
    const body = planetBody(plan?.planet);
    return {
      plan,
      body,
      coordinate: body ? null : projectTargetCoordinate(plan?.target),
    };
  });
  const targets = entries
    .filter((entry) => entry.coordinate)
    .map((entry) => ({
      id: entry.plan.key,
      source: entry.plan.key,
      coordinate: entry.coordinate,
    }));
  const planets = entries
    .filter((entry) => entry.body)
    .map((entry) => ({
      body: entry.body,
      name: entry.plan.key,
      apparentSizeArcmin: [0, 0],
      imageUrl: "",
    }));
  const geometry = planNightGeometry({
    date,
    location,
    targets,
    planetReferences: { planets },
    darkness,
  });
  if (!geometry) return null;
  const mask = normaliseHorizonMask(place?.horizonMask);
  const start = minuteInstant(geometry.start);
  const end = minuteInstant(geometry.end);
  return {
    start,
    end,
    darkMinutes: Math.round((Date.parse(end) - Date.parse(start)) / MINUTE_MS),
    moonIllumination: geometry.moonIllumination,
    moonSeries: geometry.moonSeries,
    plans: entries.map(({ plan, coordinate, body }) => {
      const candidate =
        coordinate || body
          ? geometry.candidates.find(
              (entry) => entry.target.source === plan.key,
            )
          : null;
      if (!candidate)
        return {
          key: plan.key,
          usableMinutes: 0,
          seasonMinutes: 0,
          windows: [],
          peak: null,
          reason: null,
        };
      const minAltitude = projectMinAltitude(plan.constraints);
      const context = {
        mask,
        maskEnabled: Boolean(mask.enabled),
        minAltitude,
      };
      const windows = constrainedWindows(candidate.series, {
        ...context,
        moonSeparationMinimum: projectMoonSeparation(
          plan.constraints,
          plan.filters,
        ),
      });
      const seasonWindows = constrainedWindows(candidate.series, {
        ...context,
        moonSeparationMinimum: 0,
      });
      const usableMinutes = Math.round(minutesOf(windows));
      const seasonMinutes = Math.round(minutesOf(seasonWindows));
      let reason = null;
      if (!usableMinutes)
        reason = seasonMinutes
          ? "moon"
          : candidate.series.some((point) => point.altitude >= minAltitude)
            ? "horizon"
            : "altitude";
      return {
        key: plan.key,
        usableMinutes,
        seasonMinutes,
        windows,
        peak: seriesPeak(candidate.series, geometry),
        reason,
      };
    }),
  };
}
