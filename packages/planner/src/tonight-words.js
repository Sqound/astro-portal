// The words of "Cette nuit" on the web (component
// `components/TonightPage.js`): everything the page
// writes, from `tonightOverview` (`tonight-overview.js`), in the place's
// time. Kept apart from the component so they are tested without rendering.
import { localizedPlanName } from "./quick-plan-messages.js";
import { message } from "portal/i18n.js";
import { statusWord } from "portal/components/status/status-tones.js";
import { nightStory } from "portal/night-story.js";
import {
  cloudUncertainMedianPercent,
  forecastModelLabels,
} from "portal/astronomy-forecast.js";
import { darknessLabelKey } from "./darkness-setting.js";
import { durationText, scoreOn100 } from "portal/written-forms.js";
import { clock, fill } from "./wind-section.js";
import {
  forecastHourScore,
  forecastLossShares,
  forecastScoreCurves,
  forecastScoreFactors,
  moonWeight,
} from "portal/astronomy-forecast.js";

const familyKeys = {
  dual: "plannerFilterFamilyDual",
  ha: "plannerFilterFamilyHa",
  oiii: "plannerFilterFamilyOiii",
  sii: "plannerFilterFamilySii",
  hb: "plannerFilterFamilyHb",
};

const planStateTones = Object.freeze({
  executed: "executed",
  partial: "partial",
  abandoned: "abandoned",
});

/**
 * The tone of the badge a plan of tonight wears, `null` for a plan that has
 * no state to say (planned: « Prêt » speaks for it). An archived plan is not
 * one of tonight's.
 */
export const tonightPlanStateTone = (status) => planStateTones[status] ?? null;

/** "Mer. 14 oct.": the night's date, short, with a capital. */
export function tonightDateLabel(date, locale) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  if (!match) return "";
  const label = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
  );
  return label ? label[0].toLocaleUpperCase(locale) + label.slice(1) : label;
}

/** "mer. 14 oct.": the date of the sticky bar's first line, as
 * `TonightStickyHeader` writes it after the place: no capital. */
export function tonightStickyDate(date, locale) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  if (!match) return "";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
  );
}

// A hundredth of a pixel: a place section that close to the line has left
// the screen.
const STICKY_SUB_PIXEL = 0.01;

/** Whether the place section has gone under the header: its bottom edge,
 * in px from the top of the viewport, on or above the line. */
export function tonightStickyPlaceHidden({ placeBottom, line }) {
  return (
    Number.isFinite(placeBottom) &&
    Number.isFinite(line) &&
    placeBottom <= line + STICKY_SUB_PIXEL
  );
}

const countKey = (count, none, one, many) =>
  count === 0 ? none : count === 1 ? one : many;

/**
 * Line 2 of the sticky bar: tonight's plans, then the length of the night
 * chosen by the darkness threshold — "Plan de 4 cibles prévu · 9 h 44 de
 * nuit", "Aucun plan ce soir · …", "2 plans · 9 cibles prévues · …".
 * `minutes` null leaves the length out.
 */
export function tonightStickyLine({ plans = [], minutes = null }, locale) {
  const targets = plans.reduce(
    (sum, plan) => sum + (Number(plan?.targetCount) || 0),
    0,
  );
  const say = (key, values) => fill(message(locale, key), values);
  const planned =
    plans.length === 0
      ? message(locale, "tonightStickyNoPlan")
      : plans.length === 1
        ? say(
            countKey(
              targets,
              "tonightStickyPlanNone",
              "tonightStickyPlanOne",
              "tonightStickyPlanMany",
            ),
            { count: targets },
          )
        : `${say("tonightStickyPlans", { count: plans.length })} · ${say(
            countKey(
              targets,
              "tonightStickyTargetsNone",
              "tonightStickyTargetsOne",
              "tonightStickyTargetsMany",
            ),
            { count: targets },
          )}`;
  if (!Number.isFinite(minutes)) return planned;
  return `${planned} · ${say("tonightStickyNight", {
    duration: durationText(minutes, locale),
  })}`;
}

const stickyLevelKeys = {
  excellent: "plannerForecastExcellent",
  favourable: "plannerForecastFavourable",
  variable: "plannerForecastVariable",
  poor: "plannerForecastPoor",
};

/**
 * The words of the sticky bar of "Cette nuit": the place, the date, line
 * 2, the score — `ready` with its level, value and short word
 * ("Favorable"), `waiting` (the star), `unavailable` ("Sans note") — and
 * the bar's name, "Revenir en haut de la page : …". Null without a place.
 */
export function tonightStickyWords(overview, { locale, verdict, placeName }) {
  if (overview?.state !== "ready") return null;
  const date = tonightStickyDate(overview.date, locale);
  const line = tonightStickyLine(
    { plans: overview.plans || [], minutes: overview.night?.minutes ?? null },
    locale,
  );
  const state = verdict?.state ?? "unavailable";
  return {
    place: placeName,
    date,
    line,
    label: fill(message(locale, "tonightStickyBackToTop"), {
      place: placeName,
      date,
      line,
    }),
    // The place part of the bar opens the place's details, "Camping du
    // Lac Noir, mer. 14 oct. : voir le lieu".
    placeOpen: fill(message(locale, "tonightPlaceOpen"), {
      place: placeName,
      date,
    }),
    score: {
      state,
      level: state === "ready" ? verdict.level : null,
      value: state === "ready" ? verdict.score : null,
      word:
        state === "ready"
          ? message(locale, stickyLevelKeys[verdict.level])
          : null,
      none: message(locale, "tonightStickyNoScore"),
    },
  };
}

/** The even hours of the timeline, `{ at, label }` with `at` in 0–1. */
export function tonightTimelineTicks(timeline, timeZone) {
  const start = Date.parse(timeline?.start ?? "");
  const end = Date.parse(timeline?.end ?? "");
  if (!(end > start)) return [];
  const hour = 3600000;
  const ticks = [];
  for (let at = Math.ceil(start / hour) * hour; at <= end; at += hour) {
    const label = clock(at, "en-GB", timeZone);
    const [hours, minutes] = label.split(":").map(Number);
    if (minutes !== 0 || hours % 2) continue;
    ticks.push({ at: (at - start) / (end - start), label });
  }
  return ticks;
}

function moonLine(moon, locale, at) {
  switch (moon?.event) {
    case "sets":
      return fill(message(locale, "tonightMoonSets"), { time: at(moon.at) });
    case "rises":
      return fill(message(locale, "tonightMoonRises"), { time: at(moon.at) });
    case "up":
      return message(locale, "tonightMoonUp");
    default:
      return message(locale, "tonightMoonDown");
  }
}

function timelineMoonLabel(timeline, locale, at) {
  const first = timeline?.moonUp?.[0];
  if (!first) return null;
  const fromStart = Date.parse(first.start) <= Date.parse(timeline.start);
  const toEnd = Date.parse(first.end) >= Date.parse(timeline.end);
  if (fromStart && toEnd) return message(locale, "tonightMoonUpAllNight");
  if (fromStart)
    return fill(message(locale, "tonightMoonUpUntil"), {
      time: at(first.end),
    });
  if (toEnd)
    return fill(message(locale, "tonightMoonUpFrom"), {
      time: at(first.start),
    });
  return fill(message(locale, "tonightMoonUpBetween"), {
    start: at(first.start),
    end: at(first.end),
  });
}

// The verdict of the night (`nightVerdict`, `portal/night-verdict.js`),
// the same four levels, words and sentences everywhere.
const verdictLevelKeys = {
  excellent: "tonightVerdictExcellent",
  favourable: "tonightVerdictFavourable",
  variable: "tonightVerdictVariable",
  poor: "tonightVerdictPoor",
};
const verdictLevels = Object.keys(verdictLevelKeys);
const verdictRanges = {
  excellent: [82, 100],
  favourable: [64, 81],
  variable: [42, 63],
  poor: [0, 41],
};

const capital = (key) => key.charAt(0).toUpperCase() + key.slice(1);

/**
 * Where `slot` lies on a curve of one point per hour at
 * `times` (evenly spaced), as shares of its width; `null` with fewer than
 * two hours.
 */
export function tonightSlotShare(times, slot) {
  const values = (times || [])
    .map((time) => (typeof time === "number" ? time : Date.parse(time)))
    .filter(Number.isFinite);
  if (values.length < 2 || !slot) return null;
  const first = values[0];
  const span = values.at(-1) - first;
  if (span <= 0) return null;
  const share = (value) =>
    Math.max(0, Math.min(1, (Date.parse(value) - first) / span));
  return { from: share(slot.start), to: share(slot.end) };
}

/**
 * The story of the span the
 * verdict reads — its dark night, or the chosen slot —, told from the
 * forecast's `hours` by `nightStory` (`portal/night-story.js`).
 */
export function tonightVerdictStory(verdict, hours = []) {
  const darkness = verdict?.facts?.darkness;
  return nightStory({
    hours,
    night: darkness ? { start: darkness.start, end: darkness.end } : null,
  });
}

/**
 * The card's sentence: the catalogue's sentence of the story's shape,
 * its reason another message — never assembled from words; `null` without a
 * shape, or without the reason a shape needs.
 */
export function tonightStorySentence(story, locale) {
  if (!story?.shape) return null;
  if (story.shape !== "steadyGood" && !story.reason) return null;
  return fill(message(locale, `tonightStory${capital(story.shape)}`), {
    reason: story.reason
      ? message(locale, `tonightStoryReason${capital(story.reason)}`)
      : "",
  });
}

/**
 * "Par tiers de nuit": the three thirds
 * — the part, its hours, its score and level, its reason in two words —, or
 * `null` when a third has no score.
 */
export function tonightStoryThirds(story, { locale, at }) {
  const thirds = story?.thirds || [];
  if (
    thirds.length !== 3 ||
    !thirds.every((third) => Number.isFinite(third.score))
  )
    return null;
  return {
    title: message(locale, "tonightStoryThirds"),
    parts: thirds.map((third) => {
      const reason =
        third.quality === "good" || !third.reason
          ? "none"
          : third.reason === "rain" && third.quality === "mixed"
            ? "rainLight"
            : third.reason;
      return {
        part: third.part,
        name: message(locale, `tonightStoryPart${capital(third.part)}`),
        hours: fill(message(locale, "tonightSlotRange"), {
          start: at(third.start),
          end: at(third.end),
        }),
        score: third.score,
        level: tonightLevelOfScore(third.score),
        reason: message(locale, `tonightStoryThirdReason${capital(reason)}`),
      };
    }),
  };
}

/**
 * The path of the hours' scores drawn as a
 * filigree behind the card, in a `width` × `height` box — one point per
 * hour, curves with flat tangents, 100 near the top and 0 near the bottom;
 * `null` with fewer than two hours.
 */
export function verdictFiligreePath(scores, width = 358, height = 96) {
  if (!scores || scores.length < 2) return null;
  const margin = (height * 4) / 96;
  const span = height - 2 * margin;
  const points = scores.map((score, index) => [
    (width * index) / (scores.length - 1),
    margin + (span * (100 - Math.max(0, Math.min(100, score)))) / 100,
  ]);
  const round = (value) => Math.round(value * 10) / 10;
  let line = `M${round(points[0][0])} ${round(points[0][1])}`;
  for (let index = 1; index < points.length; index += 1) {
    const [x0, y0] = points[index - 1];
    const [x1, y1] = points[index];
    const middle = round((x0 + x1) / 2);
    line += ` C${middle} ${round(y0)} ${middle} ${round(y1)} ${round(x1)} ${round(y1)}`;
  }
  return { line, area: `${line} L${width} ${height} L0 ${height} Z` };
}

/**
 * The curve of a tile of the night: the samples `[{ time, value }]` of its
 * quantity over the dark night as values from 0 (bottom) to 1 (top) inside
 * `domain` (`{ lo, hi }`); `null` without two samples (one hour is not a
 * curve).
 */
export function tileCurveValues(samples, domain) {
  if (!Array.isArray(samples) || samples.length < 2) return null;
  const span = domain.hi - domain.lo;
  return samples.map((sample) =>
    span <= 0 ? 0 : Math.min(1, Math.max(0, (sample.value - domain.lo) / span)),
  );
}

/**
 * The instants of a tile's curve: the epoch milliseconds of its samples,
 * one per point of [tileCurveValues]; `null` without two samples.
 */
export function tileCurveTimes(samples) {
  if (!Array.isArray(samples) || samples.length < 2) return null;
  return samples.map((sample) => Date.parse(sample.time));
}

/**
 * Where `nowMs` stands among the curve's `times` as a fractional index (2.5:
 * half way between the third and the fourth point), `null` unless it lies
 * strictly inside the drawn range: no dot at the edges, none outside.
 */
export function tileCurveIndexAt(times, nowMs) {
  if (!Array.isArray(times) || times.length < 2) return null;
  if (!Number.isFinite(nowMs)) return null;
  if (!(nowMs > times[0]) || !(nowMs < times[times.length - 1])) return null;
  for (let index = 1; index < times.length; index += 1) {
    if (nowMs > times[index]) continue;
    const from = times[index - 1];
    const to = times[index];
    return index - 1 + (to === from ? 0 : (nowMs - from) / (to - from));
  }
  return null;
}

/**
 * The point `[x, y]` of the curve [tileCurvePath] draws, at the fractional
 * `index` (see [tileCurveIndexAt]), in the same `width` x `height` box: on the
 * very cubic between the two neighbouring hours, so a dot rides the line and
 * not the chord. `null` outside the curve.
 */
export function tileCurvePoint(
  values,
  index,
  width = 160,
  height = 80,
  margin = height * 0.06,
) {
  if (!values || values.length < 2) return null;
  const span = height - 2 * margin;
  return curvePointOn(
    values.map((value, position) => [
      (width * position) / (values.length - 1),
      margin + span * (1 - Math.min(1, Math.max(0, value))),
    ]),
    index,
  );
}

/**
 * The same for any curve drawn through `points` (`[x, y]`, in order) with
 * flat tangents at each point, as [tileCurvePath], [verdictFiligreePath] and
 * "Heure par heure" draw theirs; `null` outside the curve.
 */
export function curvePointOn(points, index) {
  if (!points || points.length < 2 || index < 0 || index > points.length - 1) {
    return null;
  }
  const segment = Math.min(Math.floor(index), points.length - 2);
  const [x0, y0] = points[segment];
  const [x1, y1] = points[segment + 1];
  const x = x0 + (x1 - x0) * (index - segment);
  // x(t) rises with t (controls at the middle x): bisect for the t that
  // reaches x; y is then a smoothstep of t (flat tangents at each hour).
  const middle = (x0 + x1) / 2;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 32; step += 1) {
    const t = (low + high) / 2;
    const u = 1 - t;
    const reached =
      u * u * u * x0 +
      3 * u * u * t * middle +
      3 * u * t * t * middle +
      t * t * t * x1;
    if (reached < x) low = t;
    else high = t;
  }
  const t = (low + high) / 2;
  return [x, y0 + (y1 - y0) * (3 * t * t - 2 * t * t * t)];
}

/**
 * The point of the card's filigree ([verdictFiligreePath]) at the fractional
 * `index` of its scores, in the same `width` × `height` box.
 */
export function verdictFiligreePoint(scores, index, width = 358, height = 96) {
  if (!scores || scores.length < 2) return null;
  return tileCurvePoint(
    scores.map((score) => score / 100),
    index,
    width,
    height,
    (height * 4) / 96,
  );
}

/**
 * The point of a polyline through `points` (`[x, y]`) at the fractional
 * `index`: on the straight segment between two hours, as "Poids heure par
 * heure" draws it; `null` outside it.
 */
export function polylinePointOn(points, index) {
  if (!points || points.length < 2 || index < 0 || index > points.length - 1) {
    return null;
  }
  const segment = Math.min(Math.floor(index), points.length - 2);
  const part = index - segment;
  const [x0, y0] = points[segment];
  const [x1, y1] = points[segment + 1];
  return [x0 + (x1 - x0) * part, y0 + (y1 - y0) * part];
}

// The ranges the tiles draw in: a percentage 0–100; wind and visibility from
// 0 to their own top, at least 30 km/h and 10 km (a calm night stays low);
// the Moon's altitude with the horizon always inside, at least 20° of range.
const percentDomain = { lo: 0, hi: 100 };
const openDomain = (samples, floor) => ({
  lo: 0,
  hi: Math.max(floor, ...(samples ?? []).map((sample) => sample.value)),
});
function moonDomain(samples) {
  const values = (samples ?? []).map((sample) => sample.value);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  return { lo, hi: hi - lo < 20 ? lo + 20 : hi };
}

/**
 * The path of a tile's watermark curve in a `width` × `height` box: one point
 * per value evenly spaced, joined by curves with flat tangents at each hour
 * (the score card's filigree, `verdictFiligreePath`); `values` run from 0
 * (bottom) to 1 (top).
 */
export function tileCurvePath(values, width = 160, height = 80) {
  if (!values || values.length < 2) return null;
  const margin = height * 0.06;
  const span = height - 2 * margin;
  const points = values.map((value, index) => [
    (width * index) / (values.length - 1),
    margin + span * (1 - Math.min(1, Math.max(0, value))),
  ]);
  const round = (value) => Math.round(value * 10) / 10;
  let line = `M${round(points[0][0])} ${round(points[0][1])}`;
  for (let index = 1; index < points.length; index += 1) {
    const [x0, y0] = points[index - 1];
    const [x1, y1] = points[index];
    const middle = round((x0 + x1) / 2);
    line += ` C${middle} ${round(y0)} ${middle} ${round(y1)} ${round(x1)} ${round(y1)}`;
  }
  return { line, area: `${line} L${width} ${height} L0 ${height} Z` };
}

/** The level of a score on 100 (the bounds 82, 64, 42). */
export function tonightLevelOfScore(score) {
  return score >= 82
    ? "excellent"
    : score >= 64
      ? "favourable"
      : score >= 42
        ? "variable"
        : "poor";
}

/**
 * The forecast's horizon in days (`forecastDateAvailability`): sixteen days,
 * the last five a trend.
 */
export const tonightForecastHorizonDays = 15;

/**
 * The state of the card "Note de la nuit" while
 * it has no score — `{ waiting: true }`, or `{ reason }` with `offline`,
 * `unreachable`, `noService`, `beyondRange` (then `night` and
 * `availableFrom`, `YYYY-MM-DD`) or `pastNight`. `forecast` is the page's read
 * (`{ status, failure }`), `availability` that of `forecastDateAvailability`.
 * `past` says the plan's night is over (the
 * planner's rule for "il y a 4 jours", `planDaysAgo`): the reason alone, no
 * forecast to wait for or retry. "Cette nuit" never passes it.
 */
export function tonightVerdictStatus(
  forecast,
  { date, availability, past = false },
) {
  if (past) return { reason: "pastNight" };
  if (availability === "beyond-range") {
    const night = Date.parse(`${date}T12:00:00Z`);
    return {
      reason: "beyondRange",
      night: date,
      availableFrom: Number.isFinite(night)
        ? new Date(night - tonightForecastHorizonDays * 86400000)
            .toISOString()
            .slice(0, 10)
        : null,
    };
  }
  if (!forecast || forecast.status === "loading") return { waiting: true };
  // A service that answered with nothing for the night: the card says so, but
  // it is not "Service indisponible" (`answered`).
  if (forecast.status === "ready")
    return { reason: "unreachable", answered: true };
  return {
    reason:
      forecast.failure === "no_service"
        ? "noService"
        : forecast.failure === "network_error"
          ? "offline"
          : "unreachable",
  };
}

function shortDate(date, locale) {
  const instant = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(instant)) return date || "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(instant);
}

const reasonKeys = {
  offline: "tonightVerdictReasonOffline",
  unreachable: "tonightVerdictReasonUnreachable",
  noService: "tonightVerdictReasonNoService",
  beyondRange: "tonightVerdictReasonBeyondRange",
  pastNight: "tonightVerdictReasonPastNight",
};

/** The one line of reason under "Note de la nuit indisponible". */
export function tonightVerdictReason(status, locale) {
  const reason = reasonKeys[status?.reason] ? status.reason : "unreachable";
  // "… viendra le 14 oct." — a date that ends with its own point closes
  // the sentence.
  return fill(message(locale, reasonKeys[reason]), {
    night: shortDate(status?.night, locale),
    from: shortDate(status?.availableFrom, locale),
  }).replace(/\.\.$/, ".");
}

/**
 * The hour the sheet works through ("À 02:00 : …"): the lowest score of
 * the night, the earliest when several tie.
 */
export function tonightWorkedHour(hours) {
  let best = null;
  for (const hour of hours || []) {
    if (!Number.isFinite(hour?.score)) continue;
    if (best === null || hour.score < best.score) best = hour;
  }
  return best;
}

function decimal(value, digits, locale) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(value);
}

// The six factors of the sheet, in the order of its columns: the keys of
// their words, the ticks of the weight-by-value chart (its first and last
// are the axis' ends) and the dashed "valeur linéaire" (the value where the
// weight is full, then the value where a straight fall would reach 0; the
// Moon has none).
const sheetFactors = {
  cloud: {
    column: "tonightScoreColumnClouds",
    section: "tonightScoreColumnClouds",
    rule: "tonightScoreFactorCloudsRule",
    chart: "tonightScoreChartClouds",
    legend: "tonightScoreLegendClouds",
    axis: "tonightScoreAxisCloud",
    ticks: [0, 10, 20, 30, 40, 60],
    linear: [0, 60],
  },
  rain: {
    column: "tonightScoreColumnRain",
    section: "tonightScoreFactorRain",
    rule: "tonightScoreFactorRainRule",
    chart: "tonightScoreChartRain",
    legend: "tonightScoreLegendRain",
    axis: "tonightScoreAxisRain",
    ticks: [0, 10, 20, 40, 60, 80],
    linear: [0, 80],
  },
  moon: {
    column: "tonightScoreColumnMoon",
    section: "tonightScoreColumnMoon",
    rule: "tonightScoreFactorMoonRule",
    chart: "tonightScoreChartMoon",
    legend: "tonightScoreLegendMoon",
    axis: "tonightScoreAxisMoon",
    ticks: [0, 15, 30, 45, 60],
    linear: null,
  },
  visibility: {
    column: "tonightScoreColumnVisibility",
    section: "tonightScoreColumnVisibility",
    rule: "tonightScoreFactorVisibilityRule",
    chart: "tonightScoreChartVisibility",
    legend: "tonightScoreLegendVisibility",
    axis: "tonightScoreAxisVisibility",
    ticks: [0, 1, 2, 5, 10],
    linear: [10, 0],
  },
  wind: {
    column: "tonightScoreColumnWind",
    section: "tonightScoreFactorWind",
    rule: "tonightScoreFactorWindRule",
    chart: "tonightScoreChartWind",
    legend: "tonightScoreLegendWind",
    axis: "tonightScoreAxisWind",
    ticks: [0, 25, 45, 60, 75, 90],
    linear: [25, 90],
  },
  humidity: {
    column: "tonightScoreColumnHumidity",
    section: "tonightScoreColumnHumidity",
    rule: "tonightScoreFactorHumidityRule",
    chart: "tonightScoreChartHumidity",
    legend: "tonightScoreLegendHumidity",
    axis: "tonightScoreAxisHumidity",
    ticks: [60, 70, 80, 90, 100],
    linear: [90, 100],
  },
};

// The points lost that the table shows under a value: from 3 on.
const shownLoss = 3;

function weightAt(curve, value) {
  if (value <= curve[0][0]) return curve[0][1];
  for (let index = 1; index < curve.length; index += 1) {
    const [x1, y1] = curve[index];
    if (value <= x1) {
      const [x0, y0] = curve[index - 1];
      return y0 + ((y1 - y0) * (value - x0)) / (x1 - x0);
    }
  }
  return curve[curve.length - 1][1];
}

// The curve of a factor over its chart's axis: the break points inside it,
// and its two ends.
function curvePoints(key, ticks) {
  const curve = forecastScoreCurves[key];
  const [from, to] = [ticks[0], ticks[ticks.length - 1]];
  const xs = [
    from,
    ...curve.map(([x]) => x).filter((x) => x > from && x < to),
    to,
  ];
  return xs.map((x) => ({
    x,
    weight: Math.round(weightAt(curve, x) * 10) / 10,
  }));
}

const finite = (value) => (Number.isFinite(value) ? value : null);

// The instant of an hour's `time` (epoch milliseconds or an ISO string), in
// milliseconds; `null` when unreadable.
function instantMs(value) {
  const ms = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

// What one hour says of each factor, in numbers: the value the forecast
// gives (the cover that counts, the chance of rain, the Moon's altitude, the
// visibility in km, the wind that counts, the humidity).
function hourReading(hour) {
  const scored = forecastHourScore(hour);
  const wind = finite(hour.wind);
  const gust = finite(hour.gust);
  const retained =
    gust === null
      ? wind
      : wind === null
        ? gust * 0.7
        : Math.max(wind, gust * 0.7);
  const visibility =
    finite(hour.visibilityKm) ??
    (Number.isFinite(hour.visibility) ? hour.visibility / 1000 : null);
  return {
    scored,
    values: {
      cloud: finite(scored?.cover),
      rain: finite(hour.precipitation),
      moon: finite(hour.moonAltitude),
      visibility,
      wind: retained,
      humidity: finite(hour.humidity),
    },
  };
}

function workedHourWords(hour, { locale, at }) {
  if (!hour) return null;
  const say = (key, values = {}) => fill(message(locale, key), values);
  const percent = (value) => say("tonightPercent", { value });
  const { scored, values } = hourReading(hour);
  const weight = (key) =>
    Number.isFinite(scored?.factors?.[key])
      ? decimal(scored.factors[key] / 100, 2, locale)
      : null;
  const parts = [];
  const add = (key, text, value) => {
    const w = weight(key);
    if (w !== null && value !== null)
      parts.push(say(text.key, { ...text.values, weight: w }));
  };
  add(
    "cloud",
    {
      key: "tonightScoreWorkedCloud",
      values: { cover: percent(Math.round(values.cloud)) },
    },
    values.cloud,
  );
  add(
    "rain",
    {
      key: "tonightScoreWorkedRain",
      values: { rain: percent(Math.round(values.rain)) },
    },
    values.rain,
  );
  if (weight("moon") !== null)
    parts.push(
      say("tonightScoreWorkedMoon", {
        moon: moonCell(hour, { locale }),
        weight: weight("moon"),
      }),
    );
  add(
    "visibility",
    {
      key: "tonightScoreWorkedVisibility",
      values: { distance: kilometres(values.visibility, locale) },
    },
    values.visibility,
  );
  if (weight("wind") !== null && Number.isFinite(hour.wind))
    parts.push(
      Number.isFinite(hour.gust)
        ? say("tonightScoreWorkedWindGust", {
            wind: Math.round(hour.wind),
            gust: Math.round(hour.gust),
            weight: weight("wind"),
          })
        : say("tonightScoreWorkedWind", {
            wind: Math.round(hour.wind),
            weight: weight("wind"),
          }),
    );
  add(
    "humidity",
    {
      key: "tonightScoreWorkedHumidity",
      values: { humidity: percent(Math.round(values.humidity)) },
    },
    values.humidity,
  );
  return {
    at: say("tonightScoreWorkedAt", { time: at(hour.time) }),
    body: say("tonightScoreWorkedBody", {
      parts: parts.join(message(locale, "tonightScoreListSeparator")),
    }),
    result: say("tonightScoreWorkedResult", { score: hour.score }),
  };
}

function kilometres(value, locale) {
  return Number.isInteger(value) ? String(value) : decimal(value, 1, locale);
}

// The Moon's cell: "couchée" once set, "32°" when up, "—" when the
// forecast does not carry the Moon.
function moonCell(hour, { locale }) {
  const altitude = finite(hour.moonAltitude);
  if (altitude === null) return "—";
  return altitude <= 0
    ? message(locale, "tonightScoreMoonSet")
    : `${Math.round(altitude)}°`;
}

// The text of a factor's cell for an hour: the value the forecast gives.
function factorCell(key, hour, values, { locale }) {
  const say = (name, fields = {}) => fill(message(locale, name), fields);
  const percent = (value) => say("tonightPercent", { value });
  if (key === "moon") return moonCell(hour, { locale });
  if (key === "wind")
    return (
      [hour.wind, hour.gust]
        .filter(Number.isFinite)
        .map(Math.round)
        .join(" · ") || "—"
    );
  const value = values[key];
  if (value === null) return "—";
  if (key === "visibility")
    return say("tonightScoreCellVisibility", {
      distance: kilometres(value, locale),
    });
  return percent(Math.round(value));
}

// What is written under an hour's point on a factor's course through the
// night: the value, short.
function courseLabel(key, hour, values, { locale }) {
  const percent = (value) => fill(message(locale, "tonightPercent"), { value });
  const value = values[key];
  if (key === "moon") {
    const altitude = finite(hour.moonAltitude);
    return altitude !== null && altitude > 0 ? `${Math.round(altitude)}°` : "—";
  }
  if (value === null) return "—";
  if (key === "cloud" || key === "rain") return percent(Math.round(value));
  if (key === "visibility") return kilometres(value, locale);
  return String(Math.round(value));
}

function factorSection(key, { locale, at, rows, shares }) {
  const meta = sheetFactors[key];
  const say = (name, fields = {}) => fill(message(locale, name), fields);
  const share = shares?.factors?.[key];
  const [from, to] = [meta.ticks[0], meta.ticks[meta.ticks.length - 1]];
  const course = rows.map((row) => ({
    time: at(row.hour.time),
    ms: instantMs(row.hour.time),
    weight: finite(row.scored?.factors?.[key]),
    label: courseLabel(key, row.hour, row.values, { locale }),
    level: tonightLevelOfScore(row.hour.score),
  }));
  const known = course.filter((point) => point.weight !== null);
  const lowest = known.reduce(
    (low, point) => (low === null || point.weight < low.weight ? point : low),
    null,
  );
  const mean = known.length
    ? known.reduce((total, point) => total + point.weight, 0) /
      known.length /
      100
    : null;
  let chart;
  if (key === "moon") {
    const lit = rows
      .map((row) => finite(row.hour.moonIllumination))
      .find((value) => value !== null);
    const phase = lit === undefined ? null : Math.round(lit);
    const line = (percentLit) =>
      [0, 30, 60].map((x) => ({
        x,
        weight: Math.round(moonWeight(x, percentLit) * 1000) / 10,
      }));
    chart = {
      ticks: meta.ticks,
      phase,
      curve: phase === null ? null : line(phase),
      references: [100, 50, 25].map((percentLit) => ({
        label: say("tonightPercent", { value: percentLit }),
        points: line(percentLit),
      })),
      linear: null,
      dots: rows
        .filter(
          (row) =>
            Number.isFinite(row.scored?.factors?.moon) && row.values.moon > 0,
        )
        .map((row) => ({
          x: Math.min(to, row.values.moon),
          weight: row.scored.factors.moon,
        })),
    };
  } else {
    chart = {
      ticks: meta.ticks,
      curve: curvePoints(key, meta.ticks),
      references: [],
      linear: meta.linear
        ? [
            { x: meta.linear[0], weight: 100 },
            { x: meta.linear[1], weight: 0 },
          ]
        : null,
      dots: rows
        .filter(
          (row) =>
            row.values[key] !== null &&
            Number.isFinite(row.scored?.factors?.[key]),
        )
        .map((row) => ({
          x: Math.min(to, Math.max(from, row.values[key])),
          weight: row.scored.factors[key],
        })),
    };
  }
  const moonPhase = key === "moon" ? chart.phase : null;
  return {
    key,
    name: message(locale, meta.section),
    share: share ? share.share : 0,
    part: share ? lossText("tonightScoreLossShareOf", share, locale) : null,
    rule: message(locale, meta.rule),
    chartTitle: message(locale, meta.chart),
    axis: {
      x: message(locale, meta.axis),
      y: message(locale, "tonightScoreAxisWeight"),
    },
    chart,
    legend: {
      weight:
        key === "moon" && moonPhase === null
          ? null
          : say(meta.legend, { phase: moonPhase }),
      linear: meta.linear ? message(locale, "tonightScoreLegendLinear") : null,
      hours: message(locale, "tonightScoreLegendHours"),
    },
    course: {
      title: message(locale, "tonightScoreChartWeights"),
      axis: {
        x: message(locale, "tonightScoreAxisHour"),
        y: message(locale, "tonightScoreAxisWeight"),
      },
      points: course,
      mean:
        mean === null
          ? null
          : say("tonightScoreWeightMean", {
              mean: decimal(mean, 2, locale),
              time: lowest.time,
              low: decimal(lowest.weight / 100, 2, locale),
            }),
    },
  };
}

// "60 % · −31": the share of the loss and the points a factor takes.
function lossText(key, entry, locale) {
  const points = entry.points;
  return fill(message(locale, key), {
    part: Math.round(entry.share),
    points:
      points <= 0
        ? "0"
        : points < 1
          ? message(locale, "tonightScoreLossLessThanOne")
          : `\u2212${Math.round(points)}`,
  });
}

// "Uncertain score: ICON gives 49 % cloud on average over the night, whereas
// the models' median stays under 20 %"; the general note when the verdict
// does not name the model.
function uncertainNightWhy(by, locale) {
  if (!by || typeof by.model !== "string" || !Number.isFinite(by.cover))
    return message(locale, "plannerForecastUncertainNote");
  return fill(message(locale, "plannerForecastUncertainNightWhy"), {
    model: forecastModelLabels[by.model] || by.model,
    cover: Math.round(by.cover),
    limit: cloudUncertainMedianPercent,
  });
}

/**
 * The words of the sheet behind ⓘ, in its order: the
 * level and the score, the card's sentence, "Heure par heure" (the six
 * factors' columns), "Comment la note est calculée" (the product, where the
 * lost points come from, the worked hour, one section per factor), "Les
 * quatre niveaux", "Sources".
 */
export function tonightScoreSheetWords(
  verdict,
  { locale, at, hours = [], updated = null },
) {
  const say = (key, values = {}) => fill(message(locale, key), values);
  const level = verdictLevels.includes(verdict?.level) ? verdict.level : null;
  const scored = (hours || []).filter((hour) => Number.isFinite(hour?.score));
  const rows = scored.map((hour) => ({ hour, ...hourReading(hour) }));
  const shares = forecastLossShares(scored);
  const lost = shares && shares.lost > 0 ? shares : null;
  return {
    title: message(locale, "tonightVerdictSheetTitle"),
    level,
    word: level ? message(locale, verdictLevelKeys[level]) : null,
    score: level ? verdict.score : null,
    sentence: level
      ? tonightStorySentence(tonightVerdictStory(verdict, hours), locale)
      : null,
    // The night's "incertaine" tag in the verdict's own text, with the
    // model that makes it (the general note when it is not named).
    uncertain:
      level && verdict?.uncertain === true
        ? {
            word: message(locale, "plannerForecastUncertain"),
            why: uncertainNightWhy(verdict.uncertainBy, locale),
          }
        : null,
    thirds: level
      ? tonightStoryThirds(tonightVerdictStory(verdict, hours), { locale, at })
      : null,
    hourly: scored.length
      ? {
          title: message(locale, "tonightScoreHourly"),
          // When the hours were forecast (or "Mesuré"), under the title;
          // `null` says nothing.
          updated,
          label: say("tonightScoreHourlyLabel", {
            hours: scored
              .map((hour) => `${at(hour.time)} ${hour.score}`)
              .join(message(locale, "tonightScoreListSeparator")),
          }),
          columns: {
            hour: message(locale, "tonightScoreColumnHour"),
            score: message(locale, "tonightScoreColumnScore"),
            factors: forecastScoreFactors.map((key) => ({
              key,
              name: message(locale, sheetFactors[key].column),
            })),
          },
          rows: rows.map(({ hour, scored: result, values }) => ({
            // The hour itself, for its detail (a touch on the row).
            hour,
            time: at(hour.time),
            ms: instantMs(hour.time),
            score: hour.score,
            level: tonightLevelOfScore(hour.score),
            cells: forecastScoreFactors.map((key) => {
              const points = result?.losses?.[key];
              return {
                key,
                text: factorCell(key, hour, values, { locale }),
                lost:
                  Number.isFinite(points) && Math.round(points) >= shownLoss
                    ? Math.round(points)
                    : null,
              };
            }),
          })),
          mean:
            scored.length === 1
              ? say("tonightScoreMeanOne", { score: verdict?.score })
              : say("tonightScoreMeanMany", {
                  count: scored.length,
                  score: verdict?.score,
                }),
        }
      : null,
    how: {
      title: message(locale, "tonightVerdictInfo"),
      intro: message(locale, "tonightScoreHowIntro"),
      loss: lost
        ? {
            title: say("tonightScoreLossTitle", { points: lost.lost }),
            rows: forecastScoreFactors.map((key) => ({
              key,
              name: message(locale, sheetFactors[key].section),
              share: lost.factors[key].share,
              text: lossText(
                "tonightScoreLossShare",
                lost.factors[key],
                locale,
              ),
            })),
          }
        : null,
      noAverage: message(locale, "tonightScoreNoAverage"),
      worked: workedHourWords(tonightWorkedHour(scored), { locale, at }),
      factors: scored.length
        ? forecastScoreFactors.map((key) =>
            factorSection(key, { locale, at, rows, shares }),
          )
        : [],
      notCounted: message(locale, "tonightScoreNotCounted"),
    },
    levels: {
      title: message(locale, "tonightScoreLevels"),
      list: verdictLevels.map((entry) => ({
        level: entry,
        word: message(locale, verdictLevelKeys[entry]),
        range: fill(message(locale, "tonightVerdictRange"), {
          low: verdictRanges[entry][0],
          high: verdictRanges[entry][1],
        }),
      })),
    },
    sources: [
      message(locale, "tonightScoreSourceForecast"),
      message(locale, "tonightScoreSourceFallback"),
    ],
    close: message(locale, "infoClose"),
  };
}

/**
 * "Mis à jour à 06:51" ("Estimation de 06:51" for a kept copy) from
 * `{ fetchedAt, stale }`, `null` without a read time.
 */
export function forecastUpdatedWords(forecastUpdated, { locale, at }) {
  if (
    !forecastUpdated ||
    !Number.isFinite(Date.parse(forecastUpdated.fetchedAt))
  )
    return null;
  return fill(
    message(
      locale,
      forecastUpdated.stale === true
        ? "plannerForecastEstimateFrom"
        : "plannerForecastRefreshedAt",
    ),
    { time: at(forecastUpdated.fetchedAt) },
  );
}

/**
 * The words of the card "Note de la nuit": ready — the level, its word,
 * the score, the sentence and the hours' scores of the filigree;
 * waiting — "Calcul de la note de la nuit…"; unavailable — "Note de la
 * nuit indisponible", the reason, and "Réessayer" or "Choisir" when
 * they can help; the sheet behind ⓘ.
 */
export function tonightVerdictWords(
  verdict,
  {
    locale,
    at,
    loading = false,
    status = null,
    hours = [],
    placeName = "",
    updated = null,
  },
) {
  const level = verdictLevels.includes(verdict?.level) ? verdict.level : null;
  const state =
    status ?? (loading ? { waiting: true } : { reason: "unreachable" });
  const reason = reasonKeys[state.reason] ? state.reason : "unreachable";
  return {
    title: message(locale, "tonightVerdictTitle"),
    state: level ? "ready" : state.waiting ? "waiting" : "unavailable",
    level,
    word: level ? message(locale, verdictLevelKeys[level]) : null,
    score: level ? verdict.score : null,
    // The "incertaine" tag, with the sentence that explains it.
    uncertain: level ? verdict?.uncertain === true : false,
    uncertainWord: message(locale, "plannerForecastUncertain"),
    uncertainInfo: message(locale, "plannerForecastUncertainNote"),
    sentence: level
      ? tonightStorySentence(tonightVerdictStory(verdict, hours), locale)
      : null,
    scores: (hours || [])
      .filter((hour) => Number.isFinite(hour?.score))
      .map((hour) => hour.score),
    // The instant of each score, for the dot of the present.
    times: (hours || [])
      .filter((hour) => Number.isFinite(hour?.score))
      .map((hour) => instantMs(hour.time)),
    info: message(locale, "tonightVerdictInfo"),
    waiting: {
      title: message(locale, "tonightVerdictLoading"),
      line: placeName
        ? fill(message(locale, "tonightVerdictLoadingDetail"), {
            place: placeName,
          })
        : null,
    },
    unavailable: {
      title: message(locale, "tonightVerdictUnavailable"),
      reason: tonightVerdictReason({ ...state, reason }, locale),
      retry:
        reason === "offline" || reason === "unreachable"
          ? message(locale, "tonightVerdictRetry")
          : null,
      choose:
        reason === "noService"
          ? message(locale, "tonightVerdictChooseService")
          : null,
    },
    dialog: tonightScoreSheetWords(verdict, { locale, at, hours, updated }),
  };
}

/**
 * The badge "Service indisponible" and its dialog: the
 * reason, the last good time (or that none came), and "Réessayer". The
 * hourly strip's title is there because its box stays too.
 */
export function tonightWeatherDownWords({
  locale,
  offline = false,
  lastGoodAt = null,
}) {
  return {
    badge: message(locale, "tonightWeatherUnavailable"),
    hourlyTitle: message(locale, "tonightHourlyForecastTitle"),
    reason: message(
      locale,
      offline
        ? "tonightVerdictReasonOffline"
        : "tonightVerdictReasonUnreachable",
    ),
    // Unknown on a page that does not keep the last good answer: the line is
    // left out rather than saying that none ever came.
    lastGood: lastGoodAt
      ? fill(message(locale, "tonightWeatherLastGood"), { time: lastGoodAt })
      : null,
    retry: message(locale, "tonightVerdictRetry"),
    close: message(locale, "infoClose"),
  };
}

const weatherNoteKeys = {
  nautical: "tonightWeatherNoteNautical",
  civil: "tonightWeatherNoteCivil",
};

/**
 * Every word of the page, from `overview`, in `locale`, at the place's
 * `timeZone`. `loading` says which reads are still under way
 * (`{ weather, skyQuality, candidates }`); `verdictStatus` is the card's
 * state while it has no score (`tonightVerdictStatus`), `verdictHours` the
 * forecast's rows over the dark night (the filigree and the sheet);
 * `skySource` where the sky background comes from (`measured`, `entered`,
 * else the model's), the subtitle of its card.
 */
export function tonightWords(
  overview,
  {
    locale,
    timeZone,
    loading = {},
    verdictStatus = null,
    verdictHours = [],
    skySource = null,
    lastGoodAt = null,
    forecastUpdated = null,
  },
) {
  const at = (value) => (value ? clock(value, locale, timeZone) : "—");
  const place = overview?.place;
  const words = {
    title: message(locale, "tonightPageTitle"),
    placeAndDate: message(locale, "tonightPlaceAndDate"),
    placeName: place ? place.name || place.locality || "" : "",
    date: tonightDateLabel(overview?.date, locale),
    change: message(locale, "tonightChangePlace"),
    // The name and the date are one button, "Camping du Lac Noir, Mer. 14
    // oct. : voir le lieu", that opens the place's details.
    placeOpen: place
      ? fill(message(locale, "tonightPlaceOpen"), {
          place: place.name || place.locality || "",
          date: tonightDateLabel(overview?.date, locale),
        })
      : "",
    choosePlacePrompt: message(locale, "tonightChoosePlacePrompt"),
    choosePlace: message(locale, "tonightChoosePlace"),
    nightZone: message(locale, "tonightNight"),
    night: null,
    tiles: [],
    weatherNote: "",
    skyQuality: null,
    plansTitle: message(
      locale,
      (overview?.plans?.length ?? 0) > 1
        ? "tonightPlansTitleMany"
        : "tonightPlansTitleOne",
    ),
    noPlan: message(locale, "tonightNoPlan"),
    newPlan: message(locale, "tonightNewPlan"),
    openPlan: message(locale, "tonightOpenPlan"),
    plans: (overview?.plans ?? []).map((plan) => {
      const count = plan.targetCount;
      const targets =
        count === 0
          ? message(locale, "tonightPlanTargetsNone")
          : count === 1
            ? message(locale, "tonightPlanTargetsOne")
            : fill(message(locale, "tonightPlanTargetsMany"), { count });
      const tone = tonightPlanStateTone(plan.status);
      return {
        id: plan.id,
        name: plan.name
          ? localizedPlanName(locale, plan.name, overview?.date)
          : message(locale, "plannerPlan"),
        // The plan's state, when it has one to say: « Abandonné » on a plan
        // cancelled (it stays, to be launched again), as on the phone.
        state: tone ? { tone, label: statusWord(locale, tone) } : null,
        summary:
          // An empty slot (the plan born of a free run) promises no span; the
          // count alone is written.
          plan.start &&
          plan.end &&
          Date.parse(plan.end) > Date.parse(plan.start)
            ? fill(message(locale, "tonightPlanSpan"), {
                targets,
                start: at(plan.start),
                end: at(plan.end),
              })
            : targets,
        targets: plan.targets,
        targetCount: count,
      };
    }),
    toSee: message(locale, "tonightToSee"),
    toSeeEmpty: message(
      locale,
      overview?.state !== "ready"
        ? "tonightSuggestionsNoPlace"
        : loading.candidates
          ? "tonightToSeeLoading"
          : "tonightToSeeEmpty",
    ),
    toSeeLoading: overview?.state === "ready" && Boolean(loading.candidates),
    candidates: [],
    verdict: null,
    sticky: null,
    weatherDown: null,
  };
  if (overview?.state !== "ready") return words;
  words.verdict = tonightVerdictWords(overview.verdict, {
    locale,
    at,
    loading: Boolean(loading.weather),
    status: verdictStatus,
    hours: verdictHours,
    placeName: place ? place.name || place.locality || "" : "",
    // When the forecast was read, under "Heure par heure" of the sheet
    // ("Mis à jour à 06:51", an estimate when it is a kept copy).
    updated: forecastUpdatedWords(forecastUpdated, { locale, at }),
  });
  // The bar that keeps the place in sight once the page has scrolled.
  words.sticky = tonightStickyWords(overview, {
    locale,
    verdict: words.verdict,
    placeName: words.placeName,
  });

  // The card's line — "Créneau idéal : 19:00–23:00"
  // with "Utiliser ce créneau", or "Créneau choisi : …" with "Toute la
  // nuit".
  const slot = overview.slot || null;
  if (words.verdict.state === "ready") {
    const ideal = slot
      ? null
      : nightStory({ hours: verdictHours, night: overview.night }).ideal;
    const shown = slot || ideal;
    words.verdict.slot = shown
      ? {
          kind: slot ? "chosen" : "ideal",
          label: message(
            locale,
            slot ? "tonightSlotChosen" : "tonightSlotIdeal",
          ),
          range: fill(message(locale, "tonightSlotRange"), {
            start: at(shown.start),
            end: at(shown.end),
          }),
          link: message(
            locale,
            slot ? "tonightSlotWholeNight" : "tonightSlotUse",
          ),
          start: shown.start,
          end: shown.end,
        }
      : null;
    words.verdict.hint = message(locale, "tonightVerdictCardHint");
    words.verdict.excluded = slot
      ? tonightSlotShare(
          (verdictHours || [])
            .filter((hour) => Number.isFinite(hour?.score))
            .map((hour) => hour.time),
          slot,
        )
      : null;
  }
  const darkness = message(locale, darknessLabelKey(overview.night.darkness));
  const lower = darkness ? darkness[0].toLowerCase() + darkness.slice(1) : "";
  const timeline = overview.timeline;
  const moonLabel = timelineMoonLabel(timeline, locale, at);
  const slotMinutes = slot
    ? Math.round((Date.parse(slot.end) - Date.parse(slot.start)) / 60000)
    : null;
  words.night = {
    label: slot
      ? fill(message(locale, "tonightSlotLabel"), { threshold: lower })
      : darkness,
    window: `${at(slot?.start ?? overview.night.start)} → ${at(slot?.end ?? overview.night.end)}`,
    duration: slot
      ? fill(message(locale, "tonightSlotDuration"), {
          duration: durationText(slotMinutes, locale),
        })
      : fill(message(locale, "tonightDarkDuration"), {
          duration: durationText(overview.night.minutes, locale),
        }),
    darkness,
    slot: slot
      ? {
          follows: message(locale, "tonightSlotFollows"),
          wholeNight: message(locale, "tonightSlotWholeNight"),
        }
      : null,
    choose: message(locale, "tonightSlotChoose"),
    moonLabel,
    description: [
      fill(message(locale, "tonightTimelineLabel"), {
        dusk: at(timeline.darkStart),
        darkness: lower,
        start: at(timeline.darkStart),
        end: at(timeline.darkEnd),
      }),
      ...(moonLabel ? [`${moonLabel}.`] : []),
    ].join(" "),
    ticks: tonightTimelineTicks(timeline, timeZone),
  };

  const weather = overview.weather;
  const unavailable = loading.weather
    ? ""
    : message(locale, "tonightForecastUnavailable");
  const percent = (value) => fill(message(locale, "tonightPercent"), { value });
  const cloud = weather?.cloud;
  const rain = weather?.precipitation;
  const wind = weather?.wind;
  const dew = weather?.dew;
  const visibility = weather?.visibility;
  const series = weather?.series;
  const dewLevel = {
    high: "tonightDewHigh",
    moderate: "tonightDewModerate",
  }[dew?.level];
  // One decimal, the locale's separator: "10,4 km".
  const decimal = (value) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  const km = (value) =>
    fill(message(locale, "tonightVisibilityValue"), { value: decimal(value) });
  // Without a forecast the forecast tiles are not drawn — the one line
  // "Prévision indisponible" stands once, in the verdict's section — and the
  // Moon tile, which needs no forecast, stays. Five forecast tiles, each
  // with the values of its watermark curve (`curve`, 0 to 1) at the hourly
  // strip's own hours; the dew tile draws the strip's humidity.
  //
  // When the forecast did not come
  // (no connection, or the service does not answer) the five tiles are not
  // left out: each stays, its detail line the badge "Service indisponible".
  const reason = verdictStatus?.reason;
  const weatherDown =
    !weather &&
    !loading.weather &&
    !verdictStatus?.answered &&
    (reason === "offline" || reason === "unreachable")
      ? tonightWeatherDownWords({
          locale,
          offline: reason === "offline",
          lastGoodAt: lastGoodAt ? at(lastGoodAt) : null,
        })
      : null;
  words.weatherDown = weatherDown;
  const forecastTiles = weather
    ? [
        {
          key: "clouds",
          label: message(locale, "tonightClouds"),
          value: cloud ? percent(cloud.mean) : "—",
          detail: cloud
            ? fill(message(locale, "tonightCloudPeak"), {
                value: cloud.max,
                time: at(cloud.maxAt),
              })
            : unavailable,
          curve: tileCurveValues(series?.cloud, percentDomain),
          curveTimes: tileCurveTimes(series?.cloud),
        },
        {
          key: "precipitation",
          label: message(locale, "tonightPrecipitation"),
          value: rain ? percent(rain.mean) : "—",
          detail: !rain
            ? unavailable
            : rain.max === 0
              ? message(locale, "tonightPrecipitationNone")
              : fill(message(locale, "tonightCloudPeak"), {
                  value: rain.max,
                  time: at(rain.maxAt),
                }),
          curve: tileCurveValues(series?.precipitation, percentDomain),
          curveTimes: tileCurveTimes(series?.precipitation),
        },
        {
          key: "wind",
          label: message(locale, "tonightWind"),
          value: wind
            ? fill(message(locale, "tonightSpeed"), { value: wind.mean })
            : "—",
          detail: !wind
            ? unavailable
            : wind.gust === null
              ? message(locale, "tonightGustsUnknown")
              : fill(message(locale, "tonightGusts"), { value: wind.gust }),
          curve: tileCurveValues(series?.wind, openDomain(series?.wind, 30)),
          curveTimes: tileCurveTimes(series?.wind),
        },
        {
          key: "dew",
          label: message(locale, "tonightDew"),
          value: dew ? message(locale, dewLevel || "tonightDewLow") : "—",
          detail: !dew
            ? unavailable
            : dew.level === "low" || !dew.from
              ? message(locale, "tonightDewAllNight")
              : fill(message(locale, "tonightDewFrom"), { time: at(dew.from) }),
          curve: tileCurveValues(series?.humidity, percentDomain),
          curveTimes: tileCurveTimes(series?.humidity),
        },
        {
          key: "visibility",
          label: message(locale, "tonightVisibility"),
          value: visibility ? km(visibility.mean) : "—",
          detail: !visibility
            ? unavailable
            : fill(message(locale, "tonightVisibilityLowest"), {
                value: decimal(visibility.min),
                time: at(visibility.minAt),
              }),
          curve: tileCurveValues(
            series?.visibility,
            openDomain(series?.visibility, 10),
          ),
          curveTimes: tileCurveTimes(series?.visibility),
        },
      ]
    : weatherDown
      ? [
          ["clouds", "tonightClouds"],
          ["precipitation", "tonightPrecipitation"],
          ["wind", "tonightWind"],
          ["dew", "tonightDew"],
          ["visibility", "tonightVisibility"],
        ].map(([key, label]) => ({
          key,
          label: message(locale, label),
          value: "—",
          detail: "",
          curve: [],
          down: true,
        }))
      : [];
  words.tiles = [
    ...forecastTiles,
    {
      key: "moon",
      label: message(locale, "tonightMoon"),
      value:
        overview.moon.illumination === null
          ? "—"
          : percent(overview.moon.illumination),
      detail: moonLine(overview.moon, locale, at),
      curve: tileCurveValues(
        overview.moon.altitude,
        moonDomain(overview.moon.altitude),
      ),
      curveTimes: tileCurveTimes(overview.moon.altitude),
    },
  ];
  words.weatherNote = weather
    ? message(
        locale,
        weatherNoteKeys[overview.night.darkness] ||
          "tonightWeatherNoteAstronomical",
      )
    : "";

  // Two cards
  // drawn like the tiles — "Fond de ciel" (the SQM, its unit small, the
  // provenance "mesuré / saisi / estimé" as the subtitle) and "Bortle"
  // (the figure, the short sky type as the subtitle; the full sentence is in
  // its dialog, the figure now before it).
  const quality = overview.skyQuality;
  const missing = message(
    locale,
    loading.skyQuality
      ? "plannerSkyQualityLoading"
      : "plannerSkyQualityUnavailable",
  );
  const sqm = Number.isFinite(quality?.sqm) ? quality.sqm : null;
  const bortle = Number.isFinite(quality?.bortleClass)
    ? quality.bortleClass
    : null;
  const card = ({ label, value, unit, detail, about }) => ({
    label,
    value,
    unit,
    detail,
    about,
    // The estimate is still being asked: the tile shows the loading star where
    // the figure will be.
    waiting: detail === missing && Boolean(loading.skyQuality),
    name: fill(message(locale, "tonightSkyCardLabel"), {
      title: label,
      value: unit ? `${value} ${unit}` : value,
      detail,
      about,
    }),
  });
  words.skyQuality = {
    title: message(locale, "tonightSkyQuality"),
    sqm: card({
      label: message(locale, "tonightSkyBackground"),
      value:
        sqm === null
          ? "—"
          : new Intl.NumberFormat(locale, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }).format(sqm),
      unit: sqm === null ? null : "mag/arcsec²",
      detail:
        sqm === null
          ? missing
          : message(
              locale,
              skySource === "measured"
                ? "skyBrightnessMeasured"
                : skySource === "entered"
                  ? "skyBrightnessEntered"
                  : "skyBrightnessEstimated",
            ),
      about: message(locale, "tonightSkyBackgroundAbout"),
    }),
    bortle: card({
      label: message(locale, "bortle"),
      value: bortle === null ? "—" : String(bortle),
      unit: null,
      detail:
        bortle === null
          ? missing
          : message(locale, `tonightBortleShort${bortle}`),
      about: message(locale, "tonightBortleAbout"),
    }),
  };

  words.candidates = overview.candidates.map((candidate) => {
    const note =
      candidate.note.kind === "moon-down"
        ? message(locale, "tonightMoonSet")
        : candidate.note.kind === "filter" && familyKeys[candidate.note.family]
          ? message(locale, familyKeys[candidate.note.family])
          : message(locale, "tonightMoonRisen");
    return {
      id: candidate.id,
      score:
        scoreOn100(candidate.score) === null
          ? ""
          : `${scoreOn100(candidate.score)}/100`,
      designation: candidate.designation,
      name: candidate.name,
      window:
        candidate.windowStart && candidate.windowEnd
          ? fill(message(locale, "tonightCandidateWindow"), {
              start: at(candidate.windowStart),
              end: at(candidate.windowEnd),
            })
          : "",
      altitude:
        candidate.maxAltitude === null
          ? ""
          : fill(message(locale, "tonightCulminates"), {
              altitude: candidate.maxAltitude,
              note,
            }),
    };
  });
  return words;
}
