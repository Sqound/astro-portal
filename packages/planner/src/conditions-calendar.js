// The calendar of "Conditions à {lieu}": a sliding month from two days
// before the place's night (`plannerCalendarWindow`), the forecast's sixteen
// days as one band (the first eleven reliable, the last five a trend), past
// nights worked out afterwards from the measured weather (`GET
// /v1/weather/history`, one month at a time), the Moon and the sky beyond. Past
// nights are "Planification avancée": without it their cells keep the Moon
// alone.
import {
  forecastDateAvailability,
  summarizeAstronomyForecast,
  hourlyAstronomyForecast,
  weatherCodeForDate,
} from "portal/astronomy-forecast.js";
import {
  plannerCalendarWindow,
  plannerDateAfterDays,
} from "portal/planner/calendar.js";
import { forecastMoonOfNight, planNightSpanSky } from "./planner.js";
import { tonightDate } from "./tonight-overview.js";

/**
 * How many nights back a past day can still be chosen in the planner's date
 * picker: older days are
 * seen, not chosen, to keep the picker readable.
 */
export const conditionsPastChoosableNights = 60;

/**
 * "Today" of the calendar: the night the place is in at `now`, from
 * its time zone or its longitude — never the browser's civil date, so a
 * person in another zone sees the same cell lit as the place's own night.
 * Without coordinates, the UTC date.
 */
export function conditionsToday({ place = null, now = Date.now() } = {}) {
  const latitude = Number(place?.latitude);
  const longitude = Number(place?.longitude);
  const located =
    place &&
    String(place.latitude ?? "").trim() !== "" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);
  return tonightDate({ now, place: located ? place : null });
}

/** `forecast`, `trend`, `past` or `beyond`, seen from the place's night. */
export function conditionsDayKind(date, today) {
  switch (forecastDateAvailability(date, `${today}T12:00:00Z`, today)) {
    case "past":
      return "past";
    case "trend":
      return "trend";
    case "available":
      return "forecast";
    default:
      return "beyond";
  }
}

const geometries = new Map();

/** The night of `date` at `place` (`planNightSpanSky`), kept for the page. */
export function conditionsNight(date, place) {
  const key = `${place?.latitude}|${place?.longitude}|${place?.timeZone}|${date}`;
  if (geometries.has(key)) return geometries.get(key);
  let night = null;
  try {
    const sky = planNightSpanSky({ date }, place);
    night = sky
      ? {
          start: sky.darkStart,
          end: sky.darkEnd,
          darkStart: sky.darkStart,
          moonSeries: sky.moonSeries,
        }
      : null;
  } catch {
    night = null;
  }
  if (geometries.size > 400) geometries.clear();
  geometries.set(key, night);
  return night;
}

/** The night's summary from `payload` (`measured`: the archive's rows). */
export function conditionsNightSummary(date, place, payload, measured = false) {
  const night = conditionsNight(date, place);
  if (!night || !payload?.hourly) return null;
  return summarizeAstronomyForecast({
    hourly: payload.hourly,
    night,
    moon: forecastMoonOfNight(night),
    measured,
  });
}

/** The night's hours for the note's detail. */
export function conditionsNightHours(date, place, payload, measured = false) {
  const night = conditionsNight(date, place);
  if (!night || !payload?.hourly) return [];
  return hourlyAstronomyForecast({
    hourly: payload.hourly,
    night,
    moon: forecastMoonOfNight(night),
    measured,
  });
}

/**
 * The calendar of one window: `forecast` (`{ status, payload }`, status
 * `idle`, `loading`, `ready`, `unavailable` or `offline`), `history`
 * (`YYYY-MM` → `{ status, payload }`), `pastAllowed`. Returns `{ window,
 * today, state, stale, bandVisible, reliableUntil, bandEnd, cells,
 * loadingMonth, failedMonths, pastMonths }`; `cells` maps a date to `{
 * date, kind, score, category, weatherCode, pending, locked }`;
 * `pastMonths` are the months the window needs from the history (none
 * without `pastAllowed`).
 */
export function conditionsCalendar({
  today,
  offset = 0,
  place = null,
  forecast = { status: "idle" },
  history = {},
  pastAllowed = false,
}) {
  const window = plannerCalendarWindow(today, offset);
  if (!window) return null;
  const state = forecast?.status || "idle";
  const cells = {};
  const failed = new Set();
  const needed = new Set();
  let loadingMonth = null;
  let forecastEnd = null;
  for (const date of window.weeks.flat()) {
    if (!date) continue;
    const kind = conditionsDayKind(date, today);
    const cell = { date, kind, score: null, category: null, weatherCode: null };
    if (kind === "past") {
      if (!pastAllowed) {
        cells[date] = { ...cell, locked: true };
        continue;
      }
      const month = date.slice(0, 7);
      needed.add(month);
      const read = history[month];
      if (!read || read.status === "loading") {
        loadingMonth ??= month;
        cells[date] = { ...cell, pending: true };
        continue;
      }
      if (read.status !== "ready") {
        failed.add(month);
        cells[date] = cell;
        continue;
      }
      const summary = conditionsNightSummary(date, place, read.payload, true);
      cells[date] = {
        ...cell,
        score: summary?.score ?? null,
        category: summary?.category ?? null,
        weatherCode: weatherCodeForDate(read.payload?.daily, date),
      };
      continue;
    }
    if (kind === "forecast" || kind === "trend") {
      if (state === "loading") {
        cells[date] = { ...cell, pending: true };
        continue;
      }
      if (state !== "ready") {
        cells[date] = cell;
        continue;
      }
      const summary = conditionsNightSummary(date, place, forecast.payload);
      // A day the provider does not reach (MET Norway, the fallback, answers
      // fewer days) is beyond the forecast: the Moon only.
      if (!summary) {
        cells[date] = { ...cell, kind: "beyond" };
        continue;
      }
      if (!forecastEnd || date > forecastEnd) forecastEnd = date;
      cells[date] = {
        ...cell,
        score: summary?.score ?? null,
        category: summary?.category ?? null,
        weatherCode: weatherCodeForDate(forecast.payload?.daily, date),
      };
      continue;
    }
    cells[date] = cell;
  }
  return {
    window,
    today,
    state,
    stale: Boolean(forecast?.payload?.stale),
    bandVisible: state === "ready",
    reliableUntil: plannerDateAfterDays(today, 10),
    bandEnd:
      forecastEnd && forecastEnd < plannerDateAfterDays(today, 15)
        ? forecastEnd
        : plannerDateAfterDays(today, 15),
    cells,
    loadingMonth,
    failedMonths: [...failed],
    pastMonths: [...needed],
  };
}

/** The offset of the window that shows `date`, counted from `today`. */
export function conditionsOffsetFor(date, today) {
  for (let offset = -240; offset <= 24; offset += 1) {
    const window = plannerCalendarWindow(today, offset);
    if (!window) return 0;
    if (date >= window.firstDate && date <= window.lastDate) return offset;
  }
  return 0;
}

/**
 * Whether past nights carry their note on the web ("Planification
 * avancée"): a private server includes it; where it is sold, the
 * capability the purchase gives (`planner.mosaic`, the one the other
 * "Planification avancée" features read).
 */
export function conditionsPastAllowed({ hosted = false, capabilities = null }) {
  return !hosted || capabilities?.["planner.mosaic"] === true;
}
