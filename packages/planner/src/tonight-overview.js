// "Cette nuit", the night at a glance: one function assembles what the
// overview shows from sources that already exist — the sky of the night
// (`planNightSpanSky`), the hourly forecast (`hourlyAstronomyForecast`),
// the place's sky quality, tonight's plans and the planner's scored
// candidates (`targetTonightScore`) — so that every screen
// shows the same numbers. It computes no astronomy of its own beyond reading
// the Moon's altitude series and each plan's night (`planNightWindow`); it
// formats nothing (instants stay ISO-8601 UTC, the screens write them in
// the place's time).
//
// Every rule it composes has its own fixtures.
import { nightDewRisk } from "portal/dew-risk.js";
import { forecastDateAvailability } from "portal/astronomy-forecast.js";
import { nightVerdict } from "portal/night-verdict.js";
import { filterFamily, narrowbandFilterFamilies } from "./filters.js";
import { planNightWindow } from "./planner.js";
import { compareTonightScores } from "./target-score.js";

// How many targets "À voir ce soir" lists.
export const tonightCandidateCount = 3;
// How many of the planner's ranked candidates are planned and scored for
// it: the planner's own first instalment.
export const tonightCandidatePoolSize = 48;

const minute = 60000;

const instant = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const iso = (milliseconds) => new Date(milliseconds).toISOString();
const finite = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));
const roundToMinute = (milliseconds) =>
  Math.round(milliseconds / minute) * minute;

function placeHasCoordinates(place) {
  return Boolean(place && finite(place.latitude) && finite(place.longitude));
}

// The hours of the forecast that belong to the dark night: a row is the hour
// that starts at its `time`.
function nightRows(hourly, start, end) {
  return (Array.isArray(hourly) ? hourly : []).filter((row) => {
    const time = instant(row?.time);
    return time !== null && time >= start && time <= end;
  });
}

function mean(values) {
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

// The hours of `rows` that carry `key`, as `{ time, value }` samples (ISO-8601
// time) in the rows' order: a tile's watermark curve, at the hourly strip's
// own hours.
function samples(rows, key) {
  return rows
    .filter((row) => finite(row[key]) && instant(row.time) !== null)
    .map((row) => ({ time: iso(instant(row.time)), value: Number(row[key]) }));
}

const oneDecimal = (value) => Math.round(value * 10) / 10;

/**
 * The weather tiles: clouds (mean and peak with its hour), precipitation
 * (mean and strongest probability with its hour), wind (mean and gusts), dew (level
 * and first hour), visibility (mean, lowest hour in km), each `null` when
 * the forecast does not carry it. `series` holds the hourly samples every
 * tile draws behind its text: `cloud`, `wind`, `humidity` (the strip's figure for
 * the dew tile), `precipitation`, `visibility`. `null` altogether without a single
 * usable hour.
 */
// The tiles' values over the chosen slot, their curves over the whole
// dark night.
function slotWeather(whole, slot) {
  if (!whole || !slot) return whole;
  return { ...slot, series: whole.series };
}

export function tonightWeather(hourly, { start, end }) {
  const rows = nightRows(hourly, instant(start), instant(end));
  const clouds = rows.filter((row) => finite(row.cloud));
  const winds = rows.filter((row) => finite(row.wind));
  const gusts = rows.filter((row) => finite(row.gust));
  if (!clouds.length && !winds.length) return null;
  let cloud = null;
  if (clouds.length) {
    const max = Math.max(...clouds.map((row) => Number(row.cloud)));
    const peak = clouds.find((row) => Number(row.cloud) === max);
    cloud = {
      mean: mean(clouds.map((row) => Number(row.cloud))),
      max: Math.round(max),
      maxAt: iso(instant(peak.time)),
    };
  }
  let wind = null;
  if (winds.length) {
    const gust = gusts.length
      ? Math.round(Math.max(...gusts.map((row) => Number(row.gust))))
      : null;
    wind = { mean: mean(winds.map((row) => Number(row.wind))), gust };
  }
  const risk = nightDewRisk(rows);
  const from = instant(risk?.from);
  const dew = risk
    ? { level: risk.level, from: from === null ? null : iso(from) }
    : null;
  const series = {
    cloud: samples(rows, "cloud"),
    wind: samples(rows, "wind"),
    humidity: samples(rows, "humidity"),
    precipitation: samples(rows, "precipitation"),
    visibility: samples(rows, "visibilityKm"),
  };
  let precipitation = null;
  if (series.precipitation.length) {
    const peak = series.precipitation.reduce((best, sample) =>
      sample.value > best.value ? sample : best,
    );
    precipitation = {
      mean: mean(series.precipitation.map((sample) => sample.value)),
      max: Math.round(peak.value),
      maxAt: peak.time,
    };
  }
  let visibility = null;
  if (series.visibility.length) {
    const low = series.visibility.reduce((best, sample) =>
      sample.value < best.value ? sample : best,
    );
    visibility = {
      mean: oneDecimal(
        series.visibility.reduce((sum, sample) => sum + sample.value, 0) /
          series.visibility.length,
      ),
      min: oneDecimal(low.value),
      minAt: low.time,
    };
  }
  return { cloud, wind, dew, precipitation, visibility, series };
}

// The Moon's altitude samples between `from` and `to` (the dark night), the
// Moon tile's curve.
function moonAltitude(series, from, to) {
  return (Array.isArray(series) ? series : [])
    .map((point) => ({
      time: instant(point?.time),
      value: Number(point?.altitude),
    }))
    .filter(
      (point) =>
        point.time !== null &&
        Number.isFinite(point.value) &&
        point.time >= from &&
        point.time <= to,
    )
    .sort((left, right) => left.time - right.time)
    .map((point) => ({ time: iso(point.time), value: point.value }));
}

/**
 * The stretches of `series` (`[{ time, altitude }]`, the Moon's altitude)
 * when the Moon is above the horizon, each `{ start, end }` (ISO-8601, to
 * the minute), the crossings read between two samples by linear
 * interpolation. A stretch that reaches an end of the series starts or ends
 * there.
 */
export function moonUpIntervals(series) {
  const points = (Array.isArray(series) ? series : [])
    .map((point) => ({
      time: instant(point?.time),
      altitude: Number(point?.altitude),
    }))
    .filter((point) => point.time !== null && Number.isFinite(point.altitude))
    .sort((left, right) => left.time - right.time);
  const intervals = [];
  let start = null;
  points.forEach((point, index) => {
    const up = point.altitude > 0;
    if (index === 0) {
      if (up) start = point.time;
      return;
    }
    const previous = points[index - 1];
    const wasUp = previous.altitude > 0;
    if (up === wasUp) return;
    const crossing = roundToMinute(
      previous.time +
        ((point.time - previous.time) * (0 - previous.altitude)) /
          (point.altitude - previous.altitude),
    );
    if (up) start = crossing;
    else {
      intervals.push({ start: iso(start), end: iso(crossing) });
      start = null;
    }
  });
  if (start !== null && points.length)
    intervals.push({ start: iso(start), end: iso(points.at(-1).time) });
  return intervals;
}

/**
 * What the Moon does over the dark night: `sets` (above the horizon when the
 * night starts, below before it ends), `rises`, `up` (all night), `down`
 * (all night); `at` the instant of the setting or the rising, else `null`.
 */
export function tonightMoonEvent(intervals, { start, end }) {
  const nightStart = instant(start);
  const nightEnd = instant(end);
  const spans = intervals.map((interval) => ({
    start: instant(interval.start),
    end: instant(interval.end),
  }));
  const current = spans.find(
    (span) => span.start <= nightStart && span.end > nightStart,
  );
  if (current)
    return current.end < nightEnd
      ? { event: "sets", at: iso(current.end) }
      : { event: "up", at: null };
  const rising = spans.find(
    (span) => span.start > nightStart && span.start < nightEnd,
  );
  return rising
    ? { event: "rises", at: iso(rising.start) }
    : { event: "down", at: null };
}

// "IC 1396", "M31": how a plan's target is named on its chip — the
// timeline's short label (a saved framing keeps its own name).
export function planTargetLabel(item) {
  const target = item?.target;
  if (target && typeof target === "object") {
    const title = String(
      target.title || target.designation || target.objects?.[0] || "",
    ).trim();
    if (target.plannerSource === "framing" || target.framing) return title;
    return String(target.objects?.[0] || target.catalogue || title).trim();
  }
  for (const key of ["title", "name", "object"])
    if (typeof item?.[key] === "string" && item[key].trim())
      return item[key].trim();
  // A planet has no coordinates to freeze (`frozenPlanTarget`): its plan item
  // keeps only its id, `planner-planet-neptune`, and the planner's own name.
  const planet = /^planner-planet-(.+)$/.exec(String(item?.id ?? ""));
  if (planet) return planet[1].charAt(0).toUpperCase() + planet[1].slice(1);
  return "";
}

/**
 * How many targets a plan holds — the one count of the planner, the plan's
 * sheet, the plan rows and "Cette nuit": a target planned in several slots is
 * one target.
 */
export function planTargetCount(plan) {
  const items = Array.isArray(plan?.items) ? plan.items : [];
  const labels = new Set();
  for (const item of items) {
    const label = planTargetLabel(item);
    if (label) labels.add(label);
  }
  const unnamedSlotted = items.filter((item) => {
    const start = Number(item?.startMinute);
    const end = Number(item?.endMinute);
    return !planTargetLabel(item) && Number.isFinite(start) && end > start;
  }).length;
  return labels.size + unnamedSlotted || items.length;
}

/**
 * A plan of tonight as its card shows it: its name and status, how many
 * targets it schedules, from the first interval's start to the last one's
 * end (`null` without an interval or a night), and its targets' labels.
 * The minutes of an interval count from the start of the plan's dark night.
 */
export function tonightPlanCard(plan, place = null) {
  const items = Array.isArray(plan?.items) ? plan.items : [];
  let window = null;
  try {
    window = planNightWindow(plan, plan?.location ?? place);
  } catch {
    window = null;
  }
  const origin = instant(window?.darkStart);
  const starts = items
    .map((item) => Number(item?.startMinute))
    .filter(Number.isFinite);
  const ends = items
    .map((item) => Number(item?.endMinute))
    .filter(Number.isFinite);
  const labels = [];
  for (const item of items) {
    const label = planTargetLabel(item);
    if (label && !labels.includes(label)) labels.push(label);
  }
  // Each target of the plan — its place in
  // the plan's items (the frise's block `item-<index>`), its id, its label,
  // its names, the catalogue card it froze and its slot — in the order of
  // the night, the items without a slot after.
  const planItems = [];
  items.forEach((item, index) => {
    const target = item?.target;
    const label = planTargetLabel(item);
    if (!target || typeof target !== "object" || !label) return;
    const startMinute = Number(item?.startMinute);
    const endMinute = Number(item?.endMinute);
    const slotted =
      origin !== null &&
      Number.isFinite(startMinute) &&
      Number.isFinite(endMinute) &&
      endMinute > startMinute;
    const names = tonightTargetNames(target);
    planItems.push({
      index,
      key: `item-${index}`,
      id:
        target.id === undefined || target.id === null
          ? null
          : String(target.id),
      label,
      designation: names.designation || label,
      name: names.name,
      target,
      start: slotted ? iso(origin + startMinute * minute) : null,
      end: slotted ? iso(origin + endMinute * minute) : null,
      minutes: slotted ? Math.round(endMinute - startMinute) : null,
    });
  });
  const ordered = [
    ...planItems
      .filter((item) => item.start)
      .sort(
        (a, b) =>
          Date.parse(a.start) - Date.parse(b.start) || a.index - b.index,
      ),
    ...planItems.filter((item) => !item.start),
  ];
  return {
    id: plan?.id ?? null,
    name: String(plan?.name || "").trim(),
    status: plan?.status ?? null,
    // One list for the count and for what the frise draws: the named targets
    // (once each) and the items with a slot that have no name; "N cibles
    // au-delà" only ever counts targets of that list.
    targetCount: planTargetCount(plan),
    start:
      origin !== null && starts.length
        ? iso(origin + Math.min(...starts) * minute)
        : null,
    end:
      origin !== null && ends.length
        ? iso(origin + Math.max(...ends) * minute)
        : null,
    targets: labels,
    items: ordered,
  };
}

// Whether any of `plans` (plan cards, or the plans of the words) has a target
// placed: the one condition under which the icon that switches the plans
// between their labels and a frise has something to switch. Without a placed
// target the icon keeps its place, disabled, so that the heading does not
// move.
export function tonightPlansHavePlacedTarget(plans) {
  return (plans ?? []).some((plan) => Number(plan?.targetCount) > 0);
}

// The card's best window: the visibility window the card shows (the one
// matching its usable span), else its first, else its usable span.
function bestWindow(card) {
  const windows = Array.isArray(card?.visibilityWindows)
    ? card.visibilityWindows
    : [];
  const primary =
    windows.find(
      (window) =>
        window.start === card.usableStart && window.end === card.usableEnd,
    ) || windows[0];
  const start = instant(primary?.start ?? card?.usableStart);
  const end = instant(primary?.end ?? card?.usableEnd);
  return start !== null && end !== null && end > start ? { start, end } : null;
}

// "M31" and "Galaxie d’Andromède": the designation, then the common name
// (a title already written "M31 — Galaxie d’Andromède" gives it once).
export function tonightTargetNames(target) {
  const designation = String(target?.designation || "").trim();
  let title = String(target?.title || target?.name || "").trim();
  for (const separator of [" — ", " - ", " · "])
    if (designation && title.startsWith(`${designation}${separator}`))
      title = title.slice(designation.length + separator.length).trim();
  if (designation)
    return { designation, name: title && title !== designation ? title : null };
  return {
    designation: title || String(target?.objects?.[0] || ""),
    name: null,
  };
}

/**
 * The note after "Hauteur max": `moon-down` when the Moon stays below the
 * horizon over the whole window ("Lune couchée"), else the narrowband
 * family of the card's filter ("double bande"), else `moon-up`.
 */
export function tonightCandidateNote(card, window, intervals) {
  const spans = intervals.map((interval) => ({
    start: instant(interval.start),
    end: instant(interval.end),
  }));
  const moonDuring =
    window &&
    spans.some((span) => span.start < window.end && span.end > window.start);
  if (window && !moonDuring) return { kind: "moon-down" };
  const family = filterFamily(card?.filter);
  if (family && narrowbandFilterFamilies.includes(family))
    return { kind: "filter", family };
  return { kind: "moon-up" };
}

/**
 * Everything "Cette nuit" shows.
 *
 * - `place`: the overview's place (`{ name, latitude, longitude, timeZone,
 *   … }`) or `null`;
 * - `date`: the night's civil date, `YYYY-MM-DD`;
 * - `night`: `planNightSpanSky({ date, darkness }, place)` — the dark night
 *   (`darkStart`/`darkEnd`), sunset, sunrise, the timeline's scale and the
 *   Moon's altitude series;
 * - `plans`: tonight's plans, as stored;
 * - `hourly`: the rows of `hourlyAstronomyForecast` over the dark night,
 *   empty without a forecast;
 * - `moonSeries`: the Moon's altitude (default: `night.moonSeries`);
 * - `moonIllumination`: the share of the disc lit, in percent;
 * - `skyQuality`: `{ bortleClass, sqm }` of the place, or `null`;
 * - `darkness`: the threshold the night is read at (default:
 *   `night.darkness`);
 * - `candidates`: `[{ card, score }]`, the planner's planned and masked
 *   cards with their `targetTonightScore`, in the planner's order;
 * - `forecast`: `summarizeAstronomyForecast` over the
 *   dark night, `null` without a forecast.
 *
 * Returns `{ state, place, date, night, timeline, weather, moon,
 * skyQuality, plans, candidates, verdict }`; `state` is `no-place`
 * (nothing but the plans can be said) or `ready`; `verdict` is
 * `nightVerdict`'s (`portal/night-verdict.js`), `null` without a night.
 */
export function tonightOverview({
  place = null,
  date = null,
  night = null,
  plans = [],
  hourly = [],
  moonSeries,
  moonIllumination = null,
  skyQuality = null,
  darkness,
  candidates = [],
  forecast = null,
  slot = null,
} = {}) {
  const planCards = (Array.isArray(plans) ? plans : []).map((plan) =>
    tonightPlanCard(plan, place),
  );
  const darkStart = instant(night?.darkStart);
  const darkEnd = instant(night?.darkEnd);
  if (
    !placeHasCoordinates(place) ||
    darkStart === null ||
    darkEnd === null ||
    darkEnd <= darkStart
  )
    return {
      state: "no-place",
      place: placeHasCoordinates(place) ? place : null,
      date,
      night: null,
      timeline: null,
      weather: null,
      moon: null,
      skyQuality: null,
      plans: planCards,
      candidates: [],
      verdict: null,
    };
  const bounds = { start: darkStart, end: darkEnd };
  // The chosen slot `{ start, end }` — the verdict and the
  // tiles' values read it, the tiles' curves keep the whole dark night.
  const slotStart = instant(slot?.start);
  const slotEnd = instant(slot?.end);
  const chosen =
    slotStart !== null && slotEnd !== null && slotEnd > slotStart
      ? { start: slotStart, end: slotEnd }
      : null;
  const intervals = moonUpIntervals(moonSeries ?? night.moonSeries);
  const moon = {
    illumination: finite(moonIllumination)
      ? Math.round(Number(moonIllumination))
      : null,
    ...tonightMoonEvent(intervals, bounds),
    altitude: moonAltitude(moonSeries ?? night.moonSeries, darkStart, darkEnd),
  };
  const ranked = (Array.isArray(candidates) ? candidates : [])
    .filter((entry) => entry?.card?.target)
    .map((entry, index) => ({ ...entry, index }))
    .sort(
      (left, right) =>
        compareTonightScores(left.score, right.score) ||
        left.index - right.index,
    )
    .slice(0, tonightCandidateCount)
    .map(({ card, score }) => {
      const window = bestWindow(card);
      const altitude = Number(card.maxAltitude ?? card.best?.altitude);
      return {
        id: card.target.id ?? null,
        ...tonightTargetNames(card.target),
        windowStart: window ? iso(window.start) : null,
        windowEnd: window ? iso(window.end) : null,
        maxAltitude: Number.isFinite(altitude) ? Math.round(altitude) : null,
        note: tonightCandidateNote(card, window, intervals),
        card,
        score: score ?? null,
      };
    });
  return {
    state: "ready",
    place,
    date,
    night: {
      darkness: darkness || night.darkness || "astronomical",
      start: iso(darkStart),
      end: iso(darkEnd),
      minutes: Math.round((darkEnd - darkStart) / minute),
    },
    timeline: {
      start: night.scaleStart ?? iso(darkStart),
      end: night.scaleEnd ?? iso(darkEnd),
      sunset: night.sunset ?? null,
      sunrise: night.sunrise ?? null,
      darkStart: iso(darkStart),
      darkEnd: iso(darkEnd),
      moonUp: intervals,
    },
    weather: slotWeather(
      tonightWeather(hourly, bounds),
      chosen ? tonightWeather(hourly, chosen) : null,
    ),
    slot: chosen ? { start: iso(chosen.start), end: iso(chosen.end) } : null,
    moon,
    skyQuality: finite(skyQuality?.bortleClass)
      ? {
          bortleClass: Math.round(Number(skyQuality.bortleClass)),
          sqm: finite(skyQuality.sqm)
            ? Math.round(Number(skyQuality.sqm) * 10) / 10
            : null,
          estimate: true,
        }
      : null,
    plans: planCards,
    candidates: ranked,
    verdict: nightVerdict({
      forecast,
      night: chosen || bounds,
      moon: { illumination: moon.illumination, up: intervals },
      clouds: hourly,
    }),
  };
}

// The civil date (YYYY-MM-DD) at `now` (epoch milliseconds) on the place's
// clock: its time zone, else its longitude (an hour per 15°), else UTC.
export function placeCivilDate(now, place) {
  const zone = typeof place?.timeZone === "string" ? place.timeZone : "";
  if (zone) {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(now));
    } catch {
      // An unknown zone: the longitude below.
    }
  }
  const longitude = Number(place?.longitude);
  const hours = Number.isFinite(longitude)
    ? Math.max(-12, Math.min(12, Math.round(longitude / 15)))
    : 0;
  return iso(now + hours * 3600000).slice(0, 10);
}

const dayBefore = (date) =>
  iso(Date.parse(`${date}T12:00:00.000Z`) - 86400000).slice(0, 10);

/**
 * The civil date of the night being lived at `now` (epoch milliseconds) at
 * `place`: the previous evening's until that night's dawn, then today's —
 * the same day boundary as tonight's plans.
 */
export function tonightDate({ now = Date.now(), place = null } = {}) {
  const today = placeCivilDate(now, place);
  if (!placeHasCoordinates(place)) return today;
  const yesterday = dayBefore(today);
  try {
    const window = planNightWindow({ date: yesterday }, place);
    const end = instant(window?.darkEnd);
    if (end !== null && now < end) return yesterday;
  } catch {
    // A place whose night cannot be computed: today.
  }
  return today;
}

/**
 * The night the planner opens on once its place is known. `date` is the night
 * the page took before that -- by default the civil date of the browser's own
 * zone (`zone`), the only date it can have without a place. Between midnight
 * and dawn that is the next night, not the one being lived: the night in
 * progress lasts until dawn (`tonightDate`), as on "Cette nuit". A night to come the person chose, or any night that already holds a
 * plan (`planDates`), is kept; a night that is over and holds nothing (a date
 * kept from the visit of another day) is not a place to land.
 */
export function openingNightDate({
  date,
  place,
  zone = "",
  now = Date.now(),
  planDates = [],
} = {}) {
  if (!placeHasCoordinates(place) || planDates.includes(date)) return date;
  const tonight = tonightDate({ now, place });
  const untouched = placeCivilDate(now, zone ? { timeZone: zone } : null);
  // The default date, or a night that is over and holds nothing (a date kept
  // from a visit of another day): the night in progress.
  return date === untouched || date < tonight ? tonight : date;
}

/**
 * `forecastDateAvailability` of the night `date`, counted from the night the
 * `place` is in at `now` (`tonightDate`) and not from the UTC date: a place
 * west of Greenwich is in the night of the previous UTC date from its evening
 * to its dawn, a place far east already in the next one's (REV.simfixa.3).
 * Without coordinates the UTC date, as before.
 */
export function placeForecastAvailability({
  date,
  now = Date.now(),
  place = null,
} = {}) {
  const instant = new Date(now).getTime();
  return forecastDateAvailability(
    date,
    instant,
    placeHasCoordinates(place) ? tonightDate({ now: instant, place }) : null,
  );
}

/**
 * `placeForecastAvailability` is `available` or `trend` (a
 * night 11 to 15 days out reads its weather, as a trend).
 */
export function placeForecastIsNear(args) {
  const availability = placeForecastAvailability(args);
  return availability === "available" || availability === "trend";
}

// A plan put away leaves "Cette nuit": never one of the night's plans, never
// what chooses its place. An abandoned plan stays, with its badge, so that it
// can be launched again (the phone's rule, `chooseTonightNight`).
const putAwayStatuses = new Set(["archived"]);
const darknessNames = ["astronomical", "nautical", "civil"];

/**
 * The place a night made for a new plan starts at -- the
 * current place of "Cette nuit" (`tonightSubject`), never the place of the
 * last plan the planner opened. `null` without a usable place (the night then
 * keeps the planner's own, as before).
 */
export function newPlanPlace({
  document = null,
  now = Date.now(),
  darkness = "astronomical",
} = {}) {
  const { place } = tonightSubject({ document, now, darkness });
  return placeHasCoordinates(place) ? place : null;
}

/**
 * The plans of the night being lived: those dated with the night their
 * own place is in at `now` (`tonightDate` of the plan's location), whatever
 * their status. A plan of the evening to come at a place already in the small
 * hours of the night before is not tonight's.
 */
export function tonightPlansOfTheirNight({
  now = Date.now(),
  plans = [],
} = {}) {
  return (Array.isArray(plans) ? plans : []).filter(
    (plan) =>
      plan &&
      typeof plan.date === "string" &&
      plan.date === tonightDate({ now, place: plan.location ?? null }),
  );
}

/**
 * The night "Cette nuit" shows: the one `place` is in at `now`,
 * counted from its time zone or, without one, from its longitude, never from
 * a plan's date nor from the device's zone — a device in the morning in Tokyo
 * showing a place in France reads the night of the evening before. `plans` are
 * the candidates of tonight (`tonightPlansOfTheirNight`); only those of that
 * night are kept (`planIds`, in the order given). Without a place yet, the
 * first plan's date, else the UTC date.
 */
export function tonightSubjectNight({
  now = Date.now(),
  place = null,
  plans = [],
} = {}) {
  const own = tonightPlansOfTheirNight({ now, plans });
  const date = placeHasCoordinates(place)
    ? tonightDate({ now, place })
    : (own[0]?.date ?? placeCivilDate(now, null));
  return {
    date,
    planIds: own.filter((plan) => plan.date === date).map((plan) => plan.id),
  };
}

/** The coordinates of `place` as a comparable key (5 decimals), or `null`. */
export function nightPlaceKey(place) {
  if (!placeHasCoordinates(place)) return null;
  return `${Number(place.latitude).toFixed(5)},${Number(place.longitude).toFixed(5)}`;
}

/** Whether two places are the same place of a night (their coordinates). */
export const sameNightPlace = (left, right) =>
  nightPlaceKey(left) !== null && nightPlaceKey(left) === nightPlaceKey(right);

/**
 * When a choice made with "Changer" ends: the next local noon of `place`
 * after `now` (epoch milliseconds), in epoch milliseconds.
 */
export function tonightChoiceUntil(now, place) {
  const zone = typeof place?.timeZone === "string" ? place.timeZone : "";
  let minutes = null;
  if (zone) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(now));
      minutes =
        Number(parts.find((part) => part.type === "hour")?.value) * 60 +
        Number(parts.find((part) => part.type === "minute")?.value);
    } catch {
      // An unknown zone: the longitude below.
    }
  }
  if (minutes === null || !Number.isFinite(minutes)) {
    const longitude = Number(place?.longitude);
    const hours = Number.isFinite(longitude)
      ? Math.max(-12, Math.min(12, Math.round(longitude / 15)))
      : 0;
    const utc = new Date(now);
    minutes =
      (((utc.getUTCHours() + hours) * 60 + utc.getUTCMinutes()) % 1440) + 1440;
    minutes %= 1440;
  }
  const untilNoon = (720 - minutes + 1440) % 1440 || 1440;
  return Math.floor(now / 60000) * 60000 + untilNoon * 60000;
}

/**
 * What "Cette nuit" is about, from a planner document (`{ plans,
 * location, knownLocations }`): tonight's plans (a pending one first),
 * the overview's place (`chosen`, else tonight's plan's, else the planner's
 * place, else the one of the document's active night, else the default place,
 * else the place saved last), the night's date (the night that place
 * is in: `tonightSubjectNight`), its darkness (the plan's, else `darkness`,
 * the browser's preference) and the plan whose settings rank "À voir ce
 * soir" (`settings`, `null` without one).
 */

export function tonightSubject({
  document = null,
  now = Date.now(),
  chosen = null,
  darkness = "astronomical",
  defaultPlace = null,
  knownPlaces = null,
} = {}) {
  const open = (Array.isArray(document?.plans) ? document.plans : []).filter(
    (plan) => plan && !putAwayStatuses.has(plan.status),
  );
  const candidates = tonightPlansOfTheirNight({ now, plans: open });
  const isPending = (plan) => (plan.status ?? "pending") === "pending";
  // The plans of the current night come first, a pending one first among them,
  // then by date and by name — never by the order the plans were written.
  const ordered = [
    ...candidates.filter(isPending),
    ...candidates.filter((plan) => !isPending(plan)),
  ];
  // The places of a signed-in space live in the service, not in the document
  // (`knownPlaces`); the document's own active night holds the place it was
  // planned at; the place marked as the default one comes before the one saved
  // last.
  const known = (
    Array.isArray(knownPlaces)
      ? knownPlaces
      : Array.isArray(document?.knownLocations)
        ? document.knownLocations
        : []
  ).filter(placeHasCoordinates);
  const activeNight = Array.isArray(document?.nights)
    ? (document.nights.find((night) => night?.id === document.activeNightId) ??
      document.nights.at(-1))
    : null;
  const fallback =
    (placeHasCoordinates(defaultPlace) && defaultPlace) || known.at(-1) || null;
  // Which place the night is at, in order — "Changer" while its choice
  // holds; the plans of the current night (the default place when one of
  // them is there, else the first); the next plan that starts within 24
  // hours, with ITS night; the planner's own place; the default place.
  let place = (placeHasCoordinates(chosen) && chosen) || null;
  let nightDate = null;
  if (!place) {
    const own = ordered
      .filter((plan) => placeHasCoordinates(plan.location))
      .sort(
        (a, b) =>
          Number(!isPending(a)) - Number(!isPending(b)) ||
          String(a.date).localeCompare(String(b.date)) ||
          String(a.id).localeCompare(String(b.id)),
      );
    // Only a place the person marked as the default stays: "the place saved
    // last" is an order of writes, which decides nothing here.
    const atFallback = placeHasCoordinates(defaultPlace)
      ? own.find((plan) => sameNightPlace(plan.location, defaultPlace))
      : null;
    const source = atFallback ?? own[0] ?? null;
    if (source) {
      place = source.location;
      nightDate = source.date;
    } else {
      const next = open
        .filter(
          (plan) =>
            isPending(plan) &&
            placeHasCoordinates(plan.location) &&
            typeof plan.date === "string",
        )
        .map((plan) => ({
          plan,
          start: Date.parse(planNightWindow(plan, plan.location)?.start ?? ""),
        }))
        .filter(
          ({ start }) =>
            Number.isFinite(start) &&
            start > now &&
            start <= now + 24 * 3600000,
        )
        .sort((a, b) => a.start - b.start)[0];
      // Another place than the default one: its night. The default place
      // stays when the plan is there (its own night comes in its turn).
      if (next && !(fallback && sameNightPlace(next.plan.location, fallback))) {
        place = next.plan.location;
        nightDate = next.plan.date;
      }
    }
  }
  place =
    place ||
    (placeHasCoordinates(document?.location) && document.location) ||
    (placeHasCoordinates(activeNight?.location) && activeNight.location) ||
    fallback ||
    null;
  const date =
    nightDate ?? tonightSubjectNight({ now, place, plans: ordered }).date;
  // The plans of THE night: its date and its place (a plan of another place
  // for that date is for the planner's band, not for this night).
  const pool = nightDate
    ? [...open.filter(isPending), ...open.filter((plan) => !isPending(plan))]
    : ordered;
  const tonight = pool.filter(
    (plan) =>
      plan.date === date &&
      (!placeHasCoordinates(place) ||
        !placeHasCoordinates(plan.location) ||
        sameNightPlace(plan.location, place)),
  );
  const placed =
    tonight.find((plan) => placeHasCoordinates(plan.location)) || null;
  return {
    place,
    date,
    darkness: darknessNames.includes(placed?.darkness)
      ? placed.darkness
      : darknessNames.includes(darkness)
        ? darkness
        : "astronomical",
    plans: tonight,
    settings: placed,
  };
}
