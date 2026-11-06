import { observerAt, sunAltitudeAt } from "astro-core/sun-altitude.js";
import { measuredRainThresholdMm } from "./astronomy-forecast.js";

/**
 * The weather trend of a place: which
 * part of the year is, over the last ten years, the best for the night sky
 * there and which is best avoided. Pure logic: the archive's hourly series
 * of ten full years goes in, twelve monthly shares of clear night hours and
 * the two periods come out. The fetching, the cache and the route are the
 * service's (`place-climate-trend.server.js`).
 *
 * The definitions, each one a choice that is written here and nowhere else:
 *
 * - A night hour is an hour at which the Sun is below -12° (nautical
 *   darkness) at the place. The altitude comes from the ephemeris the
 *   planner's night window uses (`astro-core/sun-altitude.js`), not from a
 *   rule of thumb, so a polar place has no night hour in its summer.
 * - A night belongs to the civil month of its *evening*. Evenings are taken
 *   on the place's local solar time (longitude / 15 h from UTC, no time
 *   zone: a place has none in this product) and a night runs from local
 *   solar noon to the next one, like the planner's.
 * - A clear hour has a cloud cover of at most 30 % and, when the archive
 *   says so, less than 0.1 mm of rain (the planner's measured-rain
 *   threshold).
 * - A good night has at least four clear night hours, consecutive or not
 *   (the cover of an hour is a snapshot: asking for the hours to follow
 *   each other would count a night of broken cloud as lost although a
 *   session of stacked short exposures survives it). A night shorter than
 *   four hours is good when all of its hours are clear.
 * - The best period is the window of two to four consecutive months (the
 *   year is circular: November to February is one window) with the highest
 *   share of clear night hours, the worst the lowest one that does not
 *   overlap it. Among the windows within a point of the extreme the longest
 *   wins: "June to September" is worth more to a reader than "July and
 *   August" when they are as clear as each other. A month with too few
 *   night hours (a polar summer) is in no window.
 * - A gap under ten points between the best and the worst period is no
 *   trend: `worst` is `null` and `trend` says `flat`.
 */

export const climateTrendYearCount = 10;
// The Sun's altitude under which the hour is a night hour.
export const nightSunAltitudeDegrees = -12;
export const clearCloudCoverMaximum = 30;
export const goodNightClearHours = 4;
// A month with less than this many night hours a year (about half an hour a
// night) is not a month of the sky: it takes no part in the windows.
export const minimumNightHoursPerYear = 15;
// A year has data when it has this many nights known to the hour; fewer
// years with data than `minimumYearsWithData` and nothing is said.
export const minimumNightsOfAYearWithData = 60;
export const minimumYearsWithData = 5;
export const climateWindowLengths = Object.freeze([2, 3, 4]);
export const climateWindowToleranceShare = 1;
export const climateTrendGapShare = 10;

const hourMs = 3600_000;
const dayMs = 24 * hourMs;
// Local mean solar time runs 4 minutes ahead of UTC per degree of longitude.
const solarOffsetMsPerDegree = 4 * 60_000;
// The coordinates of a place are rounded to this step, which is also the key
// of the cache: the archive's grid is coarser than that.
export const climatePlaceStepDegrees = 0.05;

/** A coordinate rounded to the step of the cache (two decimals, no -0). */
export function roundClimateCoordinate(value) {
  const rounded = Math.round(Number(value) / climatePlaceStepDegrees);
  return Number((rounded * climatePlaceStepDegrees).toFixed(2)) + 0;
}

/** The key of a place in the cache, `lat:lon` rounded to the step. */
export function climatePlaceKey({ latitude, longitude }) {
  return `${roundClimateCoordinate(latitude).toFixed(2)}:${roundClimateCoordinate(longitude).toFixed(2)}`;
}

/** The ten years finished before `now` (UTC): `{ from, to }`. */
export function climateTrendYears(now = new Date()) {
  const to = new Date(now).getUTCFullYear() - 1;
  return { from: to - climateTrendYearCount + 1, to };
}

/** One request to the Open-Meteo archive for the ten years of a place. */
export function placeClimateArchiveUrl({ latitude, longitude, years }) {
  const parameters = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    start_date: `${years.from}-01-01`,
    end_date: `${years.to}-12-31`,
    timezone: "GMT",
    timeformat: "unixtime",
    hourly: "cloud_cover,precipitation",
  });
  return `https://archive-api.open-meteo.com/v1/archive?${parameters}`;
}

const finite = (value) =>
  value !== null && value !== undefined && Number.isFinite(Number(value));

const instant = (value) => {
  if (typeof value === "number") return value * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * What one dark hour of the series says: `null` for an hour the archive does
 * not hold (or holds without a cloud cover), otherwise whether it is clear.
 */
function hourClearness(hourly, index) {
  if (index === undefined) return null;
  const cover = hourly.cloud_cover?.[index];
  if (!finite(cover)) return null;
  const rain = hourly.precipitation?.[index];
  return (
    Number(cover) <= clearCloudCoverMaximum &&
    !(finite(rain) && Number(rain) >= measuredRainThresholdMm)
  );
}

/** The twelve months of the series, evening by evening. */
function monthlyNights({ hourly, latitude, longitude, years }) {
  const position = new Map();
  (hourly?.time || []).forEach((time, index) => {
    const stamp = instant(time);
    if (stamp !== null) position.set(stamp, index);
  });
  const observer = observerAt(latitude, longitude);
  const solarOffset = longitude * solarOffsetMsPerDegree;
  const nights = new Map();
  // From the first of January to the second day after the last of December:
  // the night that starts on the last evening ends the day after.
  const start = Date.UTC(years.from, 0, 1);
  const end = Date.UTC(years.to + 1, 0, 3);
  for (let stamp = start; stamp < end; stamp += hourMs) {
    // The evening is the local solar date of the hour minus twelve hours:
    // a night runs from one local solar noon to the next.
    const evening = Math.floor((stamp + solarOffset - 12 * hourMs) / dayMs);
    const eveningDate = new Date(evening * dayMs);
    const year = eveningDate.getUTCFullYear();
    if (year < years.from || year > years.to) continue;
    if (sunAltitudeAt(stamp, observer) >= nightSunAltitudeDegrees) continue;
    let night = nights.get(evening);
    if (!night) {
      night = {
        month: eveningDate.getUTCMonth(),
        year,
        dark: 0,
        clear: 0,
        missing: 0,
      };
      nights.set(evening, night);
    }
    const clear = hourClearness(hourly, position.get(stamp));
    if (clear === null) night.missing++;
    else {
      night.dark++;
      if (clear) night.clear++;
    }
  }
  return nights;
}

function monthTotals(nights) {
  const months = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    nightHours: 0,
    clearHours: 0,
    clearShare: null,
    goodNights: 0,
    nights: 0,
  }));
  const knownNights = new Map();
  for (const night of nights.values()) {
    const month = months[night.month];
    month.nightHours += night.dark;
    month.clearHours += night.clear;
    // A night with an hour missing is partly known: its hours count, the
    // night itself does not (it may have been a good one or not).
    if (night.missing === 0 && night.dark > 0) {
      knownNights.set(night.year, (knownNights.get(night.year) || 0) + 1);
      month.nights++;
      if (night.clear >= Math.min(goodNightClearHours, night.dark))
        month.goodNights++;
    }
  }
  for (const month of months)
    if (month.nightHours > 0)
      month.clearShare = round1((month.clearHours / month.nightHours) * 100);
  const yearsWithData = [...knownNights.values()].filter(
    (count) => count >= minimumNightsOfAYearWithData,
  ).length;
  return { months, yearsWithData };
}

/** Every window of two to four eligible consecutive months, year circular. */
function candidateWindows(months, yearsWithData) {
  const eligible = months.map(
    (month) => month.nightHours / yearsWithData >= minimumNightHoursPerYear,
  );
  const windows = [];
  for (const length of climateWindowLengths)
    for (let start = 0; start < 12; start++) {
      const indices = Array.from(
        { length },
        (_, offset) => (start + offset) % 12,
      );
      if (!indices.every((index) => eligible[index])) continue;
      const night = indices.reduce(
        (sum, index) => sum + months[index].nightHours,
        0,
      );
      const clear = indices.reduce(
        (sum, index) => sum + months[index].clearHours,
        0,
      );
      windows.push({
        start,
        length,
        indices,
        from: start + 1,
        to: ((start + length - 1) % 12) + 1,
        share: (clear / night) * 100,
      });
    }
  return windows;
}

// The longest window within the tolerance of the extreme, then the most
// extreme, then the earliest in the year.
function pickWindow(windows, direction) {
  if (!windows.length) return null;
  const sign = direction === "best" ? 1 : -1;
  const extreme = Math.max(...windows.map((window) => sign * window.share));
  return windows
    .filter(
      (window) => sign * window.share >= extreme - climateWindowToleranceShare,
    )
    .sort(
      (left, right) =>
        right.length - left.length ||
        sign * right.share - sign * left.share ||
        left.start - right.start,
    )[0];
}

const periodOf = (window) => ({
  from: window.from,
  to: window.to,
  clearShare: round1(window.share),
});

/**
 * The best and the worst period of twelve monthly totals (`months` as
 * `reducePlaceClimateTrend` builds them, `yearsWithData` the number of years
 * with enough nights known). `trend` is `distinct` (both periods), `flat` (a
 * best period only: the gap is too small to call the other one worth
 * avoiding) or `insufficient` (too few years or months to say anything).
 */
export function climatePeriods(months, yearsWithData) {
  if (yearsWithData < minimumYearsWithData)
    return { trend: "insufficient", best: null, worst: null };
  const windows = candidateWindows(months, yearsWithData);
  const best = pickWindow(windows, "best");
  if (!best) return { trend: "insufficient", best: null, worst: null };
  const apart = windows.filter(
    (window) => !window.indices.some((index) => best.indices.includes(index)),
  );
  const worst = pickWindow(apart, "worst");
  if (!worst || best.share - worst.share < climateTrendGapShare)
    return { trend: "flat", best: periodOf(best), worst: null };
  return { trend: "distinct", best: periodOf(best), worst: periodOf(worst) };
}

/**
 * The trend of a place from the archive's hourly series of ten full years.
 *
 * `hourly` is the archive's `hourly` object (`time`, in Unix seconds or ISO
 * text, `cloud_cover` in %, and `precipitation` in mm when it has it);
 * `years` is `{ from, to }`, full calendar years. An hour the series lacks
 * (or holds without a cloud cover) is skipped: the shares are those of the
 * hours known.
 *
 * Returns `{ years, yearsWithData, months, best, worst, trend, computedAt }`
 * with `months` the twelve civil months:
 * - `nightHours`, `clearHours`: the night hours (Sun under -12°) and the
 *   clear ones among them, summed over `years`;
 * - `clearShare`: the clear share in %, or `null` for a month with no night
 *   hour;
 * - `nights`, `goodNights`: the nights whose every night hour is known, and
 *   the good ones among them, summed over `years`.
 */
export function reducePlaceClimateTrend({
  hourly,
  latitude,
  longitude,
  years,
  computedAt = new Date(),
}) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    !Number.isInteger(years?.from) ||
    !Number.isInteger(years?.to) ||
    years.to < years.from
  )
    throw new TypeError("A place and a span of years are required.");
  const { months, yearsWithData } = monthTotals(
    monthlyNights({ hourly, latitude: lat, longitude: lon, years }),
  );
  return {
    years: [years.from, years.to],
    yearsWithData,
    months,
    ...climatePeriods(months, yearsWithData),
    computedAt: new Date(computedAt).toISOString(),
  };
}
