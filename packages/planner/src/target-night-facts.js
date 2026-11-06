import { moonHorizontalTrack, planNightGeometry } from "./planner.js";
import { plannerPointConstraint, visibilityWindows } from "./constraints.js";
import {
  horizonAltitude,
  normaliseHorizonMask,
} from "portal/planner/horizon-mask.js";
import {
  projectLocation,
  projectMinAltitude,
  projectMoonSeparation,
  projectTargetCoordinate,
  validProjectDate,
} from "./project-night.js";

// A target's night, for the sheet of a target ("Statistiques de la cible")
// and for the lists that ask which targets are high that night. Free and
// pure: JSON in, JSON out. Nothing here is a second ephemeris: the night and
// every ten-minute sample come from the planner's own `planNightGeometry`,
// the constraints from `plannerPointConstraint`/`visibilityWindows` (the
// functions `projectNight` already calls), the mask from `horizon-mask.js`.

const DAY_MS = 86400000;
// One sidereal day, in solar days (360° of sidereal rotation per 360.9856°
// of Earth rotation per solar day).
const SIDEREAL_RATE = 360.98564736629;

/** The longest list `visibleThatNight` returns when asked for more. */
export const visibleThatNightMaximum = 200;
/** What `visibleThatNight` keeps when it is not told how many. */
export const visibleThatNightDefaultLimit = 20;

/**
 * Whether the target is a body of the Solar System. Its night is read from
 * the coordinate of the day the caller puts on it; it has no season
 * (`targetSeason` answers `null`: its coordinate is not fixed).
 */
export function targetIsSolarSystem(target) {
  return (
    target?.solarSystem === true ||
    (typeof target?.id === "string" && target.id.startsWith("solar-system-"))
  );
}

function stateOf(point) {
  if (point.horizonBlocked) return "masked";
  if (point.low) return "below-minimum";
  return "above";
}

function spanOf(window) {
  return Date.parse(window.end) - Date.parse(window.start);
}

/**
 * One target's night at one place.
 *
 * Arguments: `target` (`{ coordinate: { ra, dec } }`, degrees J2000; a
 * body of the Solar System carries the coordinate of the day), `place`
 * (`{ latitude, longitude, timeZone?, elevation?, horizonMask? }`), `date`
 * (`YYYY-MM-DD`, the evening), `constraints` (`minAltitude` 30,
 * `moonSeparationMinimum` 25), `darkness` (the twilight threshold,
 * astronomical by default).
 *
 * Returns `null` without a usable place, date or coordinate, else:
 *
 * - `night`: `{ from, to }`, the dark night, ISO-8601 UTC;
 * - `series`: the planner's ten-minute samples, `{ time, altitude, azimuth,
 *   state }` — `state` is `masked` (under the place's horizon mask),
 *   `below-minimum` (clear of the mask, under the minimum altitude) or
 *   `above`;
 * - `bestWindow`: `{ from, to }`, the longest window the planner calls
 *   usable (above the minimum, clear of the mask, outside the Moon limit) —
 *   the very window "À voir ce soir" writes for the same target, place and
 *   date — or `null`;
 * - `culmination`: `{ altitude, time }`, the highest sample of the night;
 * - `noWindow`: when no sample is `above`, why: `masked` (the target
 *   reaches the minimum altitude but only behind the mask) or
 *   `below-minimum` (it never reaches it); `null` otherwise, including a
 *   night whose only obstacle is the Moon.
 */
export function targetNightFacts(args = {}) {
  return targetNightFactsAndSamples(args)?.facts ?? null;
}

/**
 * `targetNightFacts` together with the planner's own ten-minute samples of the
 * night (`{ time, altitude, azimuth, moonSeparation }`), the series
 * `targetNightPath` reads: "Statistiques de la cible" draws the target's
 * movement over the horizon mask from the very samples its
 * curve comes from, so the two never disagree. `{ facts, samples, moon }`
 * (`moon`: the Moon's `{ time, altitude, azimuth }` at the same instants), or
 * `null`.
 */
export function targetNightFactsAndSamples({
  target,
  place,
  date,
  constraints,
  darkness,
} = {}) {
  const location = projectLocation(place);
  const coordinate = projectTargetCoordinate(target);
  if (!location || !coordinate || !validProjectDate(date)) return null;
  const geometry = planNightGeometry({
    date,
    location,
    targets: [{ id: "night", source: "night", coordinate }],
    planetReferences: { planets: [] },
    darkness,
  });
  const candidate = geometry?.candidates.find(
    (entry) => entry.target.id === "night",
  );
  if (!candidate) return null;
  const mask = normaliseHorizonMask(place?.horizonMask);
  const minAltitude = projectMinAltitude(constraints);
  const moonSeparationMinimum = projectMoonSeparation(constraints, []);
  const constrained = candidate.series.map((point) => ({
    time: point.time,
    altitude: point.altitude,
    azimuth: point.azimuth,
    moonSeparation: point.moonSeparation,
    ...plannerPointConstraint({
      point,
      profileAltitude: mask.enabled ? horizonAltitude(mask, point.azimuth) : 0,
      horizonEnabled: Boolean(mask.enabled),
      minAltitude,
      moonSeparationMinimum,
    }),
  }));
  const windows = visibilityWindows(constrained, {
    minAltitude,
    moonSeparationMinimum,
  });
  const longest = windows.reduce(
    (best, window) => (spanOf(window) > spanOf(best) ? window : best),
    windows[0],
  );
  let top = constrained[0];
  for (const point of constrained)
    if (point.altitude > top.altitude) top = point;
  const state = constrained.map(stateOf);
  let noWindow = null;
  if (!state.includes("above"))
    noWindow = constrained.some((point) => point.altitude >= minAltitude)
      ? "masked"
      : "below-minimum";
  return {
    facts: {
      night: { from: geometry.start, to: geometry.end },
      series: constrained.map((point, index) => ({
        time: point.time,
        altitude: point.altitude,
        azimuth: point.azimuth,
        state: state[index],
      })),
      bestWindow: longest ? { from: longest.start, to: longest.end } : null,
      culmination: { altitude: top.altitude, time: top.time },
      noWindow,
    },
    samples: constrained.map((point) => ({
      time: point.time,
      altitude: point.altitude,
      azimuth: point.azimuth,
      moonSeparation: point.moonSeparation,
    })),
    // The Moon's own place at the same instants (the polar map draws its
    // track, "Écart avec la Lune" its two extreme separations).
    moon: moonHorizontalTrack({
      location,
      times: constrained.map((point) => point.time),
    }),
  };
}

// Greenwich mean sidereal time, in degrees, at an instant (Meeus, chapter 12).
function siderealDegrees(ms) {
  const days = ms / DAY_MS + 2440587.5 - 2451545;
  const centuries = days / 36525;
  return (
    280.46061837 +
    SIDEREAL_RATE * days +
    0.000387933 * centuries * centuries -
    (centuries * centuries * centuries) / 38710000
  );
}

function wrapHalfTurn(degrees) {
  const value = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return value === -180 ? 180 : value;
}

// The altitude, in degrees, of a point of declination `dec` at hour angle
// `hourAngle`, from a latitude (no refraction: this is the first pass).
function altitudeAt(latitudeRad, dec, hourAngle) {
  const decRad = (dec * Math.PI) / 180;
  const hourRad = (hourAngle * Math.PI) / 180;
  const sine =
    Math.sin(latitudeRad) * Math.sin(decRad) +
    Math.cos(latitudeRad) * Math.cos(decRad) * Math.cos(hourRad);
  return (Math.asin(Math.min(1, Math.max(-1, sine))) * 180) / Math.PI;
}

// The closed-form height of a row over `[fromMs, toMs]`: its meridian height
// when it transits inside, else its height at the end that is nearer the
// transit (the higher of the two). Precession is ignored (a minute of time):
// the exact pass below settles the values.
function estimateOf(row, latitudeRad, longitude, fromMs, toMs) {
  const rightAscension = row.ra * 15;
  const atFrom = wrapHalfTurn(
    siderealDegrees(fromMs) + longitude - rightAscension,
  );
  const transitMs = fromMs + (-atFrom / SIDEREAL_RATE) * DAY_MS;
  for (const candidate of [
    transitMs,
    transitMs + (360 / SIDEREAL_RATE) * DAY_MS,
  ])
    if (candidate >= fromMs && candidate <= toMs)
      return { altitude: altitudeAt(latitudeRad, row.dec, 0), at: candidate };
  const atTo = wrapHalfTurn(siderealDegrees(toMs) + longitude - rightAscension);
  const start = altitudeAt(latitudeRad, row.dec, atFrom);
  const end = altitudeAt(latitudeRad, row.dec, atTo);
  return end > start
    ? { altitude: end, at: toMs }
    : { altitude: start, at: fromMs };
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * The targets that are high that night.
 *
 * Arguments: `targets` (catalogue rows `{ id, ra, dec }` — `ra` in hours as
 * the catalogue index gives it, `dec` in degrees), `place` (its
 * `horizonMask` included), `date` (`YYYY-MM-DD`, the evening), `from` /
 * `to` (ISO instants restricting the judgement to part of the dark night:
 * a session's start and end), `minimumAltitude` (30), `limit` (20, at most
 * 200), `darkness`.
 *
 * A closed-form pass first (the meridian height from the declination and the
 * latitude, the transit instant; a target that transits outside the
 * interval is judged at the nearer end), then the exact ten-minute samples
 * of the planner for the highest few, with the place's mask and the minimum
 * height applied sample by sample. Returns `[{ targetId, maxAltitude, at }]`,
 * the highest first: `maxAltitude` the highest sample that is above the
 * minimum and clear of the mask, `at` its instant. `[]` without a usable
 * place or date.
 */
export function visibleThatNight({
  targets,
  place,
  date,
  from,
  to,
  minimumAltitude = 30,
  limit = visibleThatNightDefaultLimit,
  darkness,
} = {}) {
  const location = projectLocation(place);
  if (!location || !validProjectDate(date) || !Array.isArray(targets))
    return [];
  const minimum = finite(minimumAltitude) ? minimumAltitude : 30;
  const count = Math.min(
    visibleThatNightMaximum,
    Math.max(1, finite(limit) ? Math.trunc(limit) : 20),
  );
  const night = planNightGeometry({
    date,
    location,
    targets: [],
    planetReferences: { planets: [] },
    darkness,
  });
  if (!night) return [];
  const fromMs = Math.max(
    Date.parse(night.start),
    typeof from === "string" ? Date.parse(from) || -Infinity : -Infinity,
  );
  const toMs = Math.min(
    Date.parse(night.end),
    typeof to === "string" ? Date.parse(to) || Infinity : Infinity,
  );
  if (!(toMs > fromMs)) return [];
  const mask = normaliseHorizonMask(place?.horizonMask);
  const latitudeRad = (location.latitude * Math.PI) / 180;
  const estimates = [];
  for (const row of targets) {
    if (
      !row ||
      typeof row.id !== "string" ||
      !finite(row.ra) ||
      !finite(row.dec)
    )
      continue;
    const estimate = estimateOf(
      row,
      latitudeRad,
      location.longitude,
      fromMs,
      toMs,
    );
    // A degree and a half of slack: refraction and precession are not
    // modelled by this pass.
    if (estimate.altitude >= minimum - 1.5)
      estimates.push({
        row,
        altitude: estimate.altitude,
        index: estimates.length,
      });
  }
  estimates.sort(
    (left, right) => right.altitude - left.altitude || left.index - right.index,
  );
  const found = [];
  const batch = Math.max(count * 2, 24);
  for (let start = 0; start < estimates.length; start += batch) {
    // The next candidate cannot beat what is held once the held list is full
    // and the candidate's estimate (plus the slack) is under its last height.
    if (
      found.length >= count &&
      estimates[start].altitude + 1.5 <
        found.sort(byHeight)[count - 1].maxAltitude
    )
      break;
    const chunk = estimates.slice(start, start + batch);
    const geometry = planNightGeometry({
      date,
      location,
      targets: chunk.map((entry, position) => ({
        id: `t${position}`,
        source: `t${position}`,
        coordinate: { ra: entry.row.ra * 15, dec: entry.row.dec },
      })),
      planetReferences: { planets: [] },
      darkness,
    });
    if (!geometry) return [];
    chunk.forEach((entry, position) => {
      const candidate = geometry.candidates.find(
        (item) => item.target.id === `t${position}`,
      );
      let best = null;
      for (const point of candidate?.series ?? []) {
        const at = Date.parse(point.time);
        if (at < fromMs || at > toMs || point.altitude < minimum) continue;
        if (
          mask.enabled &&
          point.altitude < horizonAltitude(mask, point.azimuth)
        )
          continue;
        if (best === null || point.altitude > best.altitude) best = point;
      }
      if (best)
        found.push({
          targetId: entry.row.id,
          maxAltitude: best.altitude,
          at: best.time,
          order: entry.index,
        });
    });
  }
  return found
    .sort(byHeight)
    .slice(0, count)
    .map(({ targetId, maxAltitude, at }) => ({ targetId, maxAltitude, at }));
}

function byHeight(left, right) {
  return right.maxAltitude - left.maxAltitude || left.order - right.order;
}
