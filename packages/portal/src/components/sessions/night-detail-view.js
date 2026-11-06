// What the page of a night writes and draws, worked out from the service's answers
// without React — so a test reads it without rendering: the title and the
// lines of the header, the night's fields as one line each, the steps and
// their total, the figures of « Qualité » and « Guidage », and the geometry
// of the charts drawn over the whole night (inline SVG, no chart library:
// the planner's own way). Hours are told in the place's time zone when the
// page has resolved one, else in UTC (the rule of the place without a time zone):
// the date row then says « UTC ».

import { message } from "../../i18n.js";
import { clockText, durationText } from "../../written-forms.js";
import { debriefTimeZone } from "./debrief-decision.js";
import { dithersOf } from "../../sessions/night-summary.js";

export const NBSP = " ";

function fill(template, values) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value ?? "")),
    template,
  );
}

/** A message of the catalogue with its `{name}` values filled. */
export const say = (locale, key, values = {}) =>
  fill(message(locale, key), values);

const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const instant = (value) => {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** « 2,6 », « 0,42 », « 905 »: a number in the page's language. */
export function numberText(value, locale, digits = 1) {
  const number = finite(value);
  if (number === null) return "—";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number);
}

/** « 21:08 »: an instant's clock in UTC. */
export const utcClock = (value) => clockText(value, "UTC");

const capitalised = (label, locale) =>
  label ? label[0].toLocaleUpperCase(locale) + label.slice(1) : label;

/** « mer. 7 oct. »: an instant's day in UTC, short. */
export function utcDay(value, locale, { year = false } = {}) {
  const at = instant(value);
  if (at === null) return "";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(at);
}

/** « 8 oct. »: an instant's day in UTC, without its weekday. */
export function utcShortDay(value, locale) {
  const at = instant(value);
  if (at === null) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(at);
}

/**
 * The calendar date of the night (`YYYY-MM-DD`): the plan's when it has one;
 * otherwise the evening of the start, from the place's longitude when it is
 * known (the local solar time, never a time zone), else the start's UTC day.
 */
export function nightDateOf({ planDate = null, startedAt, longitude = null }) {
  if (typeof planDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(planDate))
    return planDate.slice(0, 10);
  const at = instant(startedAt);
  if (at === null) return null;
  const shift = finite(longitude) === null ? 0 : (longitude / 15) * 3600000;
  // Before local noon, the night is the previous evening's.
  return new Date(at + shift - 12 * 3600000).toISOString().slice(0, 10);
}

/**
 * « 2 h 00 », « 1 h 54 », « 45 min »: an integration (poses × exposition) in
 * hours and minutes — whole hours keep their « 00 » in French.
 */
export function integrationText(seconds, locale) {
  const minutes = Math.round((finite(seconds) ?? 0) / 60);
  const written = durationText(minutes, locale);
  if (String(locale).startsWith("fr") && minutes >= 60 && minutes % 60 === 0)
    return `${written}${NBSP}00`;
  return written;
}

/**
 * « mer. 7 oct. »: an instant's day in `timeZone` (the place's, UTC when it
 * has none), short.
 */
export function zonedDay(value, locale, timeZone, { year = false } = {}) {
  const at = instant(value);
  if (at === null) return "";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" } : {}),
    timeZone: debriefTimeZone(timeZone),
  }).format(at);
}

/**
 * The date row of « La nuit »: « Mer. 7 oct. 2026 · 23:08 → 05:48 », the day
 * of the end when it differs (« jeu. 8 oct. »). The hours are the place's
 * (`timeZone`, an IANA name) and `zone` is `null`; without a zone they are
 * UTC and `zone` is « UTC », written once.
 */
export function nightDateRow(night, locale, timeZone = null) {
  const zone = debriefTimeZone(timeZone);
  const utc = zone === "UTC";
  const clock = (value) => clockText(value, zone);
  const start = night?.startedAt?.value ?? null;
  const end = night?.finishedAt?.value ?? null;
  const main = [
    capitalised(zonedDay(start, locale, zone, { year: true }), locale),
    end ? `${clock(start)} → ${clock(end)}` : clock(start),
  ]
    .filter(Boolean)
    .join(" · ");
  const endDay =
    end && zonedDay(end, locale, zone) !== zonedDay(start, locale, zone)
      ? zonedDay(end, locale, zone)
      : null;
  return { main, endDay, zone: utc ? message(locale, "nightPageUtc") : null };
}

/** « Col des Étoiles · 21:08 → 03:48 · 3 cibles »: the header's line. */
export function nightHeaderLine(
  { place, startedAt, finishedAt, targetCount },
  locale,
) {
  const hours = finishedAt
    ? `${utcClock(startedAt)} → ${utcClock(finishedAt)}`
    : utcClock(startedAt);
  return [
    place || null,
    startedAt ? hours : null,
    targetCount
      ? say(
          locale,
          targetCount === 1
            ? "nightSummaryTargetCountOne"
            : "nightSummaryTargetCountOther",
          { count: targetCount },
        )
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * « Askar 50P · ZWO ASI533MC Pro · ZWO AM5N · filtre Dual-band »: the
 * night's equipment in one line, names resolved through `names` (an
 * identifier with no name is never shown).
 */
export function equipmentLine(equipment, names = {}, locale) {
  if (!equipment || typeof equipment !== "object") return "";
  const name = (id) => (id && names[id]) || null;
  const filters = (equipment.filterIds ?? []).map(name).filter(Boolean);
  return [
    name(equipment.telescopeId),
    name(equipment.cameraId),
    name(equipment.mountId),
    filters.length
      ? say(locale, "nightPageFilterPrefix", { name: filters.join(", ") })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The steps' total: frames and integration (seconds). */
export function stepsTotal(steps = []) {
  return steps.reduce(
    (total, step) => ({
      frames: total.frames + (finite(step.frameCount) ?? 0),
      seconds: total.seconds + (finite(step.integrationSeconds) ?? 0),
    }),
    { frames: 0, seconds: 0 },
  );
}

/** « 120 poses », « 1 pose ». */
export const framesText = (count, locale) =>
  say(locale, count === 1 ? "nightPageFramesOne" : "nightPageFramesOther", {
    count,
  });

/** The step's filter, « Sans filtre » when it has none (free text, never normalized). */
export const filterText = (filter, locale) =>
  typeof filter === "string" && filter.trim()
    ? filter
    : message(locale, "nightPageNoFilter");

/** « 180 s », « 0,5 s ». */
export function exposureText(seconds, locale) {
  const value = finite(seconds);
  if (value === null) return "—";
  const digits = Number.isInteger(value) ? 0 : 1;
  return `${numberText(value, locale, digits)}${NBSP}${message(locale, "nightPageSeconds")}`;
}

/** « 2,6 px · 8,1″ », « 2,6 px » without the scale. */
export function fwhmText(pixels, arcsec, locale) {
  if (finite(pixels) === null) return "—";
  const px = `${numberText(pixels, locale, 1)}${NBSP}px`;
  return finite(arcsec) === null
    ? px
    : `${px} · ${numberText(arcsec, locale, 1)}″`;
}

/** « 905 ADU ». */
export const aduText = (value, locale) =>
  finite(value) === null ? "—" : `${numberText(value, locale, 0)}${NBSP}ADU`;

/** « 0,68″ ». */
export const arcsecText = (value, locale) =>
  finite(value) === null ? "—" : `${numberText(value, locale, 2)}″`;

/** Whether the quality summary holds at least one measured frame. */
export const hasQuality = (summary) =>
  Boolean(summary?.night && (summary.night.measuredFrames ?? 0) > 0);

/** Whether the guiding summary holds guiding (a series or an RMS). */
export const hasGuiding = (summary, series = []) =>
  Boolean(
    summary && (series.length > 0 || finite(summary.rmsTotalArcsec) !== null),
  );

/**
 * « 6 h 30 guidées · 15 dithers · 3 mises au point réussies sur 3 · 1
 * retournement au méridien · aucune stabilisation expirée »: the counts of
 * the old screen, in one line (a count of nothing is left out, except the
 * expired settles, said « aucune »).
 */
export function guidingCountsLine(summary, locale) {
  if (!summary) return "";
  const plural = (count, one, other, values = {}) =>
    say(locale, count === 1 ? one : other, { count, ...values });
  const minutes = Math.round((finite(summary.guidedSeconds) ?? 0) / 60);
  const parts = [];
  if (minutes > 0)
    parts.push(
      say(locale, "nightPageGuided", {
        duration: durationText(minutes, locale),
      }),
    );
  parts.push(
    plural(
      summary.dithers ?? 0,
      "nightPageDithersOne",
      "nightPageDithersOther",
    ),
  );
  if ((summary.autofocusRuns ?? 0) > 0)
    parts.push(
      say(
        locale,
        summary.autofocusSucceeded === 1
          ? "nightPageFocusOne"
          : "nightPageFocusOther",
        {
          succeeded: summary.autofocusSucceeded ?? 0,
          runs: summary.autofocusRuns,
        },
      ),
    );
  if ((summary.meridianFlips ?? 0) > 0)
    parts.push(
      plural(summary.meridianFlips, "nightPageFlipsOne", "nightPageFlipsOther"),
    );
  const settles = summary.settleTimeouts ?? 0;
  parts.push(
    settles === 0
      ? message(locale, "nightPageSettleNone")
      : plural(settles, "nightPageSettleOne", "nightPageSettleOther"),
  );
  return parts.join(" · ");
}

const GUIDING_SOURCE_NAMES = { phd2: "PHD2", asiair: "ASIAIR", nina: "NINA" };

/**
 * « PHD2 », « ASIAIR »: the logs the guiding came from — the sources of its
 * samples; without samples (an import), the logs the report read.
 */
export function guidingSources(report) {
  const sampled = [
    ...new Set(
      (Array.isArray(report?.guiding) ? report.guiding : [])
        .map((sample) => GUIDING_SOURCE_NAMES[sample?.source])
        .filter(Boolean),
    ),
  ];
  if (sampled.length) return sampled.join(", ");
  // The report v3's trace is PHD2's samples, reduced.
  if (report?.guidingTrace?.points?.length) return "PHD2";
  const source = report?.source ?? {};
  return [
    source.phd2FilesParsed > 0 ? "PHD2" : null,
    source.asiairFilesParsed > 0 ? "ASIAIR" : null,
    source.ninaFilesParsed > 0 ? "NINA" : null,
  ]
    .filter(Boolean)
    .join(", ");
}

// ---- The charts over the whole night ---------------------------------------

/** The night's time axis: `x(t)` from `start` to `end` over `width`. */
export function timeAxis(start, end, width, left = 0, zone = null) {
  let from = instant(start);
  let to = instant(end);
  if (from === null || to === null) return null;
  if (to <= from) to = from + 60000;
  return {
    from,
    to,
    // The place's zone (IANA): the hours are the place's; UTC without one.
    zone: typeof zone === "string" && zone && zone !== "UTC" ? zone : null,
    x: (t) => left + ((t - from) / (to - from)) * width,
  };
}

/** The clock of an instant on an axis: the place's hours, UTC without a zone. */
export function axisClock(axis, t) {
  return axis?.zone
    ? clockText(t, axis.zone)
    : utcClock(new Date(t).toISOString());
}

/**
 * The full hours inside the night (« 22:00 », « 23:00 »…), the place's when
 * the axis has its zone (a zone half an hour off UTC has its own full hours).
 */
export function hourTicks(axis) {
  if (!axis) return [];
  const ticks = [];
  const step = 15 * 60000;
  for (let t = Math.ceil(axis.from / step) * step; t <= axis.to; t += step) {
    const label = axisClock(axis, t);
    if (label.endsWith(":00")) ticks.push({ t, label });
  }
  return ticks;
}

/**
 * The bands of the targets above a chart: each passage of the night, named,
 * clipped to the axis.
 */
export function targetBands(passages = [], axis, titleOf = (id) => id) {
  if (!axis) return [];
  return passages
    .map((passage) => {
      const start = instant(passage.start);
      const end = instant(passage.end) ?? axis.to;
      if (start === null) return null;
      const from = Math.max(axis.from, start);
      const to = Math.min(axis.to, end);
      if (to <= from) return null;
      return {
        key: `${passage.startEventId ?? passage.start}`,
        from,
        to,
        label:
          titleOf(passage.targetId ?? passage.targetLabel) ??
          passage.targetLabel ??
          passage.targetId ??
          "",
      };
    })
    .filter(Boolean);
}

/** One measure of every frame over the night: `{ t, value }`, in time order. */
export function framePoints(rows = [], measure) {
  return rows
    .map((row) => ({
      t: instant(row?.timestampUtc),
      value: finite(row?.[measure]),
    }))
    .filter((point) => point.t !== null && point.value !== null)
    .sort((a, b) => a.t - b.t);
}

/** A strip's vertical range: the points' min and max, padded. */
export function valueRange(points, { floor = null } = {}) {
  if (!points.length) return null;
  let low = Math.min(...points.map((point) => point.value));
  let high = Math.max(...points.map((point) => point.value));
  if (high === low) {
    high += 0.5;
    low -= 0.5;
  }
  const pad = (high - low) * 0.15;
  low -= pad;
  high += pad;
  if (floor !== null) low = Math.max(floor, low);
  return { low, high };
}

/**
 * The polylines of a guiding series (`guidingSeries` of the service, slices
 * of 2 minutes): one path per run of consecutive slices — a gap longer than
 * two slices (the meridian flip, a pause) breaks the line.
 */
export function seriesPaths(series = [], field, axis, y) {
  if (!axis) return [];
  const paths = [];
  let current = [];
  let last = null;
  for (const slice of series) {
    const start = instant(slice?.start);
    const end = instant(slice?.end) ?? start;
    const value = finite(slice?.[field]);
    if (start === null || value === null) continue;
    const middle = (start + end) / 2;
    if (last !== null && start - last > 5 * 60000) {
      if (current.length) paths.push(current);
      current = [];
    }
    current.push(`${axis.x(middle).toFixed(1)},${y(value).toFixed(1)}`);
    last = end;
  }
  if (current.length) paths.push(current);
  return paths.map((points) => points.join(" "));
}

/** The guiding events drawn on the chart: dithers, autofocus runs, flips. */
export function guidingMarks(report, axis) {
  if (!axis) return { dithers: [], focus: [], flips: [] };
  const events = Array.isArray(report?.timeline?.events)
    ? report.timeline.events
    : [];
  const inside = (list) =>
    list
      .map((event) => instant(event.timestampUtc))
      .filter((t) => t !== null && t >= axis.from && t <= axis.to);
  const placed = (type) =>
    inside(events.filter((event) => event?.type === type));
  return {
    // One triangle per dither: a report v2 holds it twice (PHD2, ASIAIR).
    dithers: inside(dithersOf(events)),
    focus: placed("autofocus"),
    flips: placed("meridian-flip"),
  };
}
