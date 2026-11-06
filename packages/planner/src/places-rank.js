// Suggested places, the drive-time estimate and "Meilleur cette nuit": two
// pure rules, offline, never a network call.
//
// The drive time is an estimate and is always said as one: the straight-line
// distance of the screens, times 1.3 for the road, at 50 km/h. No routing
// service is called and no key exists; the "Trajet" button opens the maps
// application, whose route is the exact one.
//
// "Meilleur cette nuit" ranks the suggestions by tonight's weather at the
// reference place's night (50), their sky (30) and the drive (20). The three
// facts are shown on every row; the sum is only the order, never a number on
// a screen.
import { skyScalePosition } from "./places-rules.js";

/** The road is this many times the straight line. */
export const driveRoadFactor = 1.3;
/** The average speed of the drive, in km/h. */
export const driveSpeedKmh = 50;
/** The estimate is rounded to this many minutes. */
export const driveRoundingMinutes = 5;
/** Below this many minutes the estimate reads "moins de 5 min". */
export const driveShortMinutes = 5;
/** The estimate of the largest search radius (100 km): the drive points' scale. */
export const driveFarthestMinutes = 156;

/** The points each fact weighs in "Meilleur cette nuit" (sum 100). */
export const placeRankWeights = Object.freeze({
  weather: 50,
  sky: 30,
  drive: 20,
});

const sameBelow = 1e-9;

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * The drive in minutes before rounding, from a straight-line distance in
 * kilometres; `null` for a distance that is not a number or is negative.
 */
export function driveMinutesFor(distanceKm) {
  if (!finite(distanceKm) || distanceKm < 0) return null;
  return ((distanceKm * driveRoadFactor) / driveSpeedKmh) * 60;
}

/**
 * The drive-time estimate of a straight-line distance: `{ minutes }`, rounded
 * to 5 minutes; `0` means "moins de 5 min" (under five minutes, however
 * short), `null` an unusable distance. 18 km → 30, 100 km → 155.
 */
export function driveTimeEstimate(distanceKm) {
  const exact = driveMinutesFor(distanceKm);
  if (exact === null) return { minutes: null };
  if (exact < driveShortMinutes) return { minutes: 0 };
  return {
    minutes: Math.round(exact / driveRoundingMinutes) * driveRoundingMinutes,
  };
}

const validNight = (night) =>
  night &&
  typeof night === "object" &&
  Number.isFinite(Date.parse(night.start)) &&
  Number.isFinite(Date.parse(night.end));

const earlier = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

/**
 * [places] — `{ id, distanceKm, sqm }` each, the distance from the reference
 * place and the estimated zenith SQM (either may be missing) — in the order
 * of "Meilleur cette nuit".
 *
 * [forecasts] maps a place's id to `{ cloud }`, the mean cloud cover in
 * percent over the reference place's astronomical night
 * (`summarizeAstronomyForecast(...).cloud`), or to `null`; [referenceNight] is
 * that night, `{ start, end }`. Without a readable night, or for a place
 * without a forecast, the weather is unknown: the place is listed after the
 * ranked ones, by its sky and its drive alone, and hides none of them.
 *
 * Returns `{ night, anyForecast, ranked }`; each entry of `ranked`: `{ id,
 * rank, hasForecast, cloud, minutes, weatherPoints, skyPoints, drivePoints,
 * total }` — `minutes` the rounded estimate of `driveTimeEstimate`, the points
 * out of 50, 30 and 20. Ties: nearer first, then by id.
 */
export function placeNightRank({ places, forecasts, referenceNight } = {}) {
  const night = validNight(referenceNight)
    ? { start: referenceNight.start, end: referenceNight.end }
    : null;
  const entries = (Array.isArray(places) ? places : []).map((place) => {
    const cloud = finite(forecasts?.[place?.id]?.cloud)
      ? clamp(forecasts[place.id].cloud, 0, 100)
      : null;
    const hasForecast = night !== null && cloud !== null;
    const exact = driveMinutesFor(place?.distanceKm);
    const weatherPoints = hasForecast
      ? (placeRankWeights.weather * (100 - cloud)) / 100
      : null;
    const skyPoints = finite(place?.sqm)
      ? placeRankWeights.sky * skyScalePosition(place.sqm)
      : 0;
    const drivePoints =
      exact === null
        ? 0
        : placeRankWeights.drive *
          clamp(1 - exact / driveFarthestMinutes, 0, 1);
    return {
      id: place?.id,
      distanceKm: finite(place?.distanceKm) ? place.distanceKm : Infinity,
      hasForecast,
      cloud: hasForecast ? cloud : null,
      minutes: driveTimeEstimate(place?.distanceKm).minutes,
      weatherPoints,
      skyPoints,
      drivePoints,
      total: (weatherPoints ?? 0) + skyPoints + drivePoints,
    };
  });
  entries.sort((left, right) => {
    if (left.hasForecast !== right.hasForecast)
      return left.hasForecast ? -1 : 1;
    const difference = right.total - left.total;
    if (Math.abs(difference) > sameBelow) return difference;
    if (left.distanceKm !== right.distanceKm) {
      if (right.distanceKm === Infinity) return -1;
      if (left.distanceKm === Infinity) return 1;
      const nearer = left.distanceKm - right.distanceKm;
      if (Math.abs(nearer) > sameBelow) return nearer;
    }
    return earlier(String(left.id), String(right.id));
  });
  return {
    night,
    anyForecast: entries.some((entry) => entry.hasForecast),
    ranked: entries.map((entry, index) => ({
      id: entry.id,
      rank: index + 1,
      hasForecast: entry.hasForecast,
      cloud: entry.cloud,
      minutes: entry.minutes,
      weatherPoints: entry.weatherPoints,
      skyPoints: entry.skyPoints,
      drivePoints: entry.drivePoints,
      total: entry.total,
    })),
  };
}
