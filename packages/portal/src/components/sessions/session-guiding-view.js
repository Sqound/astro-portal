// SESSION-GUIDING-STATS-01 — what the sections « Guidage » and « Poses »
// of the page of a session, and « Les nuits de cette image » of the owner's
// page of a capture, draw and write, worked out from the service's answers
// without React, so a test reads it without rendering:
//
// - the trace of the night (`guidingTrace` of `GET /v1/sessions/{id}`: one
//   point per 10 s, the corrections with their direction, the samples out of
//   the statistics, the markers) as instants, its settles as runs (a window
//   whose samples are all out — `out == n` — is a settle, never a spike);
// - the window of the chart (the whole night by default: the session's hours
//   and the trace's, together), its hour ticks in the place's zone, the scale
//   of the offsets in ″ or in guide-camera pixels (″ ÷ `scaleArcsecPerPx`);
// - the frames of the night (`analysis.report.quality[]`), their filters, the
//   ones the stacking left out (only when the report says so:
//   `posesSummary.rejectedKnown`), the table by filter;
// - the nights of a multi-night plan (`GET /v1/projects/{id}/analyses`).
//
// The hours are the place's (`zone`, an IANA name), UTC without one, like
// every hour of the page. The phone draws the same: the rules here
// are the ones it reproduces.

import { message } from "../../i18n.js";
import { clockText, durationText } from "../../written-forms.js";
import { traceMarkersOf } from "../../sessions/night-summary.js";

export const NBSP = "\u00a0";

const fill = (template, values) =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value ?? "")),
    template,
  );
const say = (locale, key, values = {}) => fill(message(locale, key), values);

/**
 * `say` for a text whose words agree with one number: an ICU
 * `{name, plural, =1{…} one{…} other{…}}` (French « 1 nuit sur 3 », « 2 nuits
 * sur 3 ») takes the branch of `number` in the language's own plural, `#`
 * written in its figures; a text without `plural,` is filled as it is.
 */
export function sayCounted(locale, key, number, values = {}) {
  const text = message(locale, key);
  if (!text.includes("plural,")) return fill(text, values);
  const body = text.slice(text.indexOf("plural,") + 7);
  const branches = [
    ...body.matchAll(
      /(=\d+|zero|one|two|few|many|other)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g,
    ),
  ];
  const category = new Intl.PluralRules(locale).select(number);
  const chosen =
    branches.find(([, name]) => name === `=${number}`) ||
    branches.find(([, name]) => name === category) ||
    branches.find(([, name]) => name === "other");
  if (!chosen) return fill(text, values);
  return fill(
    chosen[2].replaceAll("#", new Intl.NumberFormat(locale).format(number)),
    values,
  );
}

const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const instant = (value) => {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** The place's zone, `null` for UTC (the clocks then read UTC). */
export const chartZone = (zone) =>
  typeof zone === "string" && zone && zone !== "UTC" ? zone : null;

/** « 23:04 » in the place's hours (UTC without a zone). */
export const zonedClock = (t, zone) => clockText(t, chartZone(zone) ?? "UTC");

/** « 00:16:10 »: the clock with its seconds, in the place's hours. */
export function zonedClockSeconds(t, zone) {
  const at = finite(t);
  if (at === null) return "—";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: chartZone(zone) ?? "UTC",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(at));
    const part = (type, modulo = 60) =>
      String(
        (Number(parts.find((entry) => entry.type === type)?.value) || 0) %
          modulo,
      ).padStart(2, "0");
    return `${part("hour", 24)}:${part("minute")}:${part("second")}`;
  } catch {
    return zonedClock(at, null);
  }
}

/** A number in the reader's language with a true minus (U+2212). */
export function figureText(value, locale, digits = 2, { signed = false } = {}) {
  const number = finite(value);
  if (number === null) return "—";
  const text = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(number));
  const rounded = Number(Math.abs(number).toFixed(digits));
  const sign = rounded === 0 ? "" : number < 0 ? "−" : signed ? "+" : "";
  return `${sign}${text}`;
}

/** The two units of the curve: arc seconds (the default) and guide pixels. */
export const GUIDING_UNITS = ["arcsec", "px"];

/**
 * A value of the trace in the chosen unit: ″ as sent, pixels of the guide
 * camera as ″ ÷ the guide scale; `null` in pixels without a scale.
 */
export function inUnit(value, unit, scale) {
  const number = finite(value);
  if (number === null) return null;
  if (unit !== "px") return number;
  const divisor = finite(scale);
  return divisor && divisor > 0 ? number / divisor : null;
}

/** « 0,89″ », « 0,13 px ». */
export function unitText(
  value,
  unit,
  locale,
  { digits = 2, signed = false } = {},
) {
  const number = finite(value);
  if (number === null) return "—";
  const text = figureText(number, locale, digits, { signed });
  return unit === "px" ? `${text}${NBSP}px` : `${text}″`;
}

// ---- The trace ------------------------------------------------------------

/**
 * The trace as instants: `{ interval, from, to, points[{ at, n, out, ra, dec,
 * raPeak, decPeak, raPulseMs, decPulseMs, settle }], markers[{ type, at, end
 * }], pulsesKnown, scale, rms, guidedSeconds, samples }`, `null` without a
 * point. `pulsesKnown` is false for a trace the service rebuilt from a report
 * v2 (no direction of the corrections: the bars are not drawn).
 */
export function traceOf(trace) {
  if (!trace || typeof trace !== "object") return null;
  const start = instant(trace.startUtc);
  if (start === null) return null;
  const interval =
    finite(trace.intervalSeconds) && trace.intervalSeconds > 0
      ? trace.intervalSeconds
      : 10;
  const points = (Array.isArray(trace.points) ? trace.points : [])
    .filter(
      (point) =>
        finite(point?.t) !== null &&
        finite(point?.ra) !== null &&
        finite(point?.dec) !== null,
    )
    .map((point) => {
      const n = finite(point.n) ?? 0;
      const out = finite(point.out) ?? 0;
      return {
        at: start + point.t * 1000,
        n,
        out,
        ra: point.ra,
        dec: point.dec,
        raPeak: finite(point.raPeak),
        decPeak: finite(point.decPeak),
        raPulseMs: finite(point.raPulseMs),
        decPulseMs: finite(point.decPulseMs),
        // Every sample of the window out of the statistics: a settle.
        settle: n > 0 && out >= n,
      };
    })
    .sort((a, b) => a.at - b.at);
  if (!points.length) return null;
  const markers = (Array.isArray(trace.markers) ? trace.markers : [])
    .map((marker) => ({
      type: marker?.type,
      at: instant(marker?.at),
      end: instant(marker?.end),
    }))
    .filter((marker) => typeof marker.type === "string" && marker.at !== null)
    .sort((a, b) => a.at - b.at);
  return {
    interval,
    from: points[0].at,
    to: points[points.length - 1].at + interval * 1000,
    points,
    markers,
    pulsesKnown: points.some(
      (point) => point.raPulseMs !== null || point.decPulseMs !== null,
    ),
    scale: finite(trace.scaleArcsecPerPx),
    rms: trace.rms ?? null,
    guidedSeconds: finite(trace.guidedSeconds),
    samples: finite(trace.samples),
  };
}

/**
 * The window of the whole night: the session's hours and the trace's
 * together (a guide log can start before the first frame or run after the
 * last one; it is drawn whole). `null` when nothing is dated.
 */
export function nightWindow(bounds, trace = null) {
  const starts = [instant(bounds?.start), trace?.from ?? null].filter(
    (value) => value !== null,
  );
  const ends = [instant(bounds?.end), trace?.to ?? null].filter(
    (value) => value !== null,
  );
  if (!starts.length) return null;
  const from = Math.min(...starts);
  let to = ends.length ? Math.max(...ends) : from;
  if (to <= from) to = from + 60_000;
  return { from, to };
}

/** Runs of consecutive settle windows: `[{ from, to }]`. */
export function settleRuns(trace) {
  if (!trace) return [];
  const width = trace.interval * 1000;
  const runs = [];
  let current = null;
  for (const point of trace.points) {
    if (point.settle) {
      if (current && point.at - current.to <= width * 1.5)
        current.to = point.at + width;
      else {
        current = { from: point.at, to: point.at + width };
        runs.push(current);
      }
    } else current = null;
  }
  // The settles the markers name (from the dither to PHD2's verdict) join them.
  for (const marker of trace.markers)
    if (marker.type === "settle" && marker.end !== null)
      runs.push({ from: marker.at, to: marker.end });
  runs.sort((a, b) => a.from - b.from);
  const merged = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && run.from <= last.to) last.to = Math.max(last.to, run.to);
    else merged.push({ ...run });
  }
  return merged;
}

/**
 * The pieces of one curve (`field` `ra` or `dec`) inside the window, in the
 * unit: the line breaks at a settle (never drawn as a spike), at a hole of
 * more than two windows, and outside the window. `[[{ at, value }]]`.
 */
export function curveRuns(trace, field, window, unit = "arcsec") {
  if (!trace || !window) return [];
  const width = trace.interval * 1000;
  const runs = [];
  let run = [];
  let last = null;
  for (const point of trace.points) {
    if (point.at + width < window.from || point.at > window.to) {
      if (run.length) runs.push(run);
      run = [];
      last = null;
      continue;
    }
    const value = inUnit(point[field], unit, trace.scale);
    const broken =
      point.settle ||
      value === null ||
      (last !== null && point.at - last > width * 2.5);
    if (broken && run.length) {
      runs.push(run);
      run = [];
    }
    if (!point.settle && value !== null) run.push({ at: point.at, value });
    last = point.at;
  }
  if (run.length) runs.push(run);
  return runs;
}

// ---- Smoothing -------------------------------------------------------------

/** The smoothing window of the whole-night view, in seconds. */
export const SMOOTH_SECONDS = 30;

/** Smoothed over a window longer than this (an hour): below it the raw curve. */
export const SMOOTH_ABOVE_MS = 3_600_000;

/** True when the window is wide enough for the smoothed curve (over an hour). */
export const smoothingApplies = (window) =>
  Boolean(window) && window.to - window.from > SMOOTH_ABOVE_MS;

/**
 * The runs of `curveRuns` smoothed by a centred moving average of about
 * `seconds` (3 points of 10 s by default). A mean, not a median: a median of
 * three drops a lone spike altogether, a mean keeps a third of it, and the
 * raw curve stays drawn faintly under it, so a true loss of the star is still
 * seen; a run never borrows from another (settles and holes break the line).
 */
export function smoothRuns(runs, interval, seconds = SMOOTH_SECONDS) {
  const count = Math.max(1, Math.round(seconds / Math.max(1, interval)));
  const half = Math.floor(count / 2);
  if (!half) return runs;
  return runs.map((run) =>
    run.map((point, index) => {
      const from = Math.max(0, index - half);
      const to = Math.min(run.length - 1, index + half);
      let sum = 0;
      for (let at = from; at <= to; at += 1) sum += run[at].value;
      return { at: point.at, value: sum / (to - from + 1) };
    }),
  );
}

// ---- Labels of the events -------------------------------------------------

/** Width of a label in pixels, for 10 px text. */
export const labelWidth = (text) => Math.ceil(String(text).length * 5.8) + 4;

/**
 * Places labels on at most `lines` lines: `labels[{ key, from, to }]` (pixel
 * extent, in priority order); a label goes on the first line where it touches
 * no label already placed (`gap` pixels apart), else it is hidden. Returns
 * `{ placed[{ ...label, line }], hidden[...], lines }`, `lines` the number of
 * lines used.
 */
export function placeLabels(labels, { lines = 2, gap = 6 } = {}) {
  const rows = Array.from({ length: lines }, () => []);
  const placed = [];
  const hidden = [];
  for (const label of labels) {
    const row = rows.findIndex((taken) =>
      taken.every(
        (other) => label.from >= other.to + gap || label.to <= other.from - gap,
      ),
    );
    if (row < 0) hidden.push(label);
    else {
      rows[row].push(label);
      placed.push({ ...label, line: row });
    }
  }
  placed.sort((a, b) => a.from - b.from);
  return {
    placed,
    hidden,
    lines: rows.reduce(
      (used, taken, index) => (taken.length ? index + 1 : used),
      0,
    ),
  };
}

/**
 * The labels of the pauses: a pause wide enough on screen to carry its text
 * has its own; the narrower ones lying close to each other (less than
 * `reach` pixels apart) make one « 5 pauses · 9 min »; a lone narrow pause
 * has none (its hatch and its bubble tell it). `pauses[{ from, to }]` in
 * instants, `toX` their pixel, `textOf(minutes)`, `groupText(count, minutes)`.
 * Returns `[{ key, kind: "pause" | "group", from, to, centre, text, pauses }]`
 * with the pixel extent of the label centred on the pause or the group.
 */
export function pauseLabels(pauses, { toX, textOf, groupText, reach = 48 }) {
  const minutes = (pause) =>
    Math.max(1, Math.round((pause.to - pause.from) / 60_000));
  const labels = [];
  let cluster = [];
  const flush = () => {
    if (cluster.length > 1) {
      const first = toX(cluster[0].from);
      const last = toX(cluster[cluster.length - 1].to);
      const total = cluster.reduce((sum, pause) => sum + minutes(pause), 0);
      const text = groupText(cluster.length, total);
      const half = labelWidth(text) / 2;
      const centre = (first + last) / 2;
      labels.push({
        key: `group-${cluster[0].from}`,
        kind: "group",
        from: centre - half,
        to: centre + half,
        centre,
        text,
        pauses: cluster,
      });
    }
    cluster = [];
  };
  for (const pause of pauses) {
    const text = textOf(minutes(pause));
    const width = toX(pause.to) - toX(pause.from);
    if (width >= labelWidth(text) + 4) {
      flush();
      const centre = (toX(pause.from) + toX(pause.to)) / 2;
      const half = labelWidth(text) / 2;
      labels.push({
        key: `pause-${pause.from}`,
        kind: "pause",
        from: centre - half,
        to: centre + half,
        centre,
        text,
        pauses: [pause],
      });
      continue;
    }
    const last = cluster[cluster.length - 1];
    if (last && toX(pause.from) - toX(last.to) > reach) flush();
    cluster.push(pause);
  }
  flush();
  return labels;
}

const STEPS = [0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10];

/**
 * The vertical scale of the offsets: symmetric around zero, its top from the
 * 99th percentile of the calm windows (a dither's excursion is a settle, not
 * part of the scale; a value beyond the top is drawn on the edge). `{ top,
 * step, ticks }` in the unit.
 */
export function offsetScale(trace, window, unit = "arcsec") {
  const values = [];
  for (const point of trace?.points ?? []) {
    if (point.settle) continue;
    if (window && (point.at < window.from || point.at > window.to)) continue;
    for (const field of ["ra", "dec"]) {
      const value = inUnit(point[field], unit, trace.scale);
      if (value !== null) values.push(Math.abs(value));
    }
  }
  values.sort((a, b) => a - b);
  const high = values.length
    ? values[Math.min(values.length - 1, Math.floor(values.length * 0.99))]
    : 0;
  const floor = unit === "px" ? 0.1 : 0.5;
  const reach = Math.max(floor, high * 1.15);
  const step = STEPS.find((candidate) => reach / candidate <= 3) ?? 10;
  const top = Math.ceil(reach / step - 1e-9) * step;
  const ticks = [];
  for (let value = step; value <= top + 1e-9; value += step)
    ticks.push(Number(value.toFixed(4)), Number((-value).toFixed(4)));
  return { top, step, ticks: ticks.sort((a, b) => b - a) };
}

/**
 * The top of the correction bars (ms): the 95th percentile of the pulses
 * sent in the window, so that one long pulse does not flatten the others;
 * a longer one is drawn to the edge.
 */
export function pulseTop(trace, window) {
  const values = [];
  for (const point of trace?.points ?? []) {
    if (window && (point.at < window.from || point.at > window.to)) continue;
    for (const field of ["raPulseMs", "decPulseMs"])
      if (point[field]) values.push(Math.abs(point[field]));
  }
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  return Math.max(
    50,
    values[Math.min(values.length - 1, Math.floor(values.length * 0.95))],
  );
}

const TICK_MINUTES = [1, 5, 10, 15, 30, 60, 120, 180, 240];

/**
 * The hour ticks of a window, in the place's hours: every 15 minutes over a
 * night at full width (5 minutes zoomed on half an hour), fewer when the
 * chart is narrow — at least `spacing` pixels between two labels. `[{ t,
 * label, whole }]`, `whole` on the full hours (drawn bolder).
 */
export function windowTicks(window, zone, width = 1000, spacing = 64) {
  if (!window) return [];
  const minutes = (window.to - window.from) / 60_000;
  const step =
    TICK_MINUTES.find(
      (candidate) => (minutes / candidate) * spacing <= width,
    ) ?? 240;
  const ticks = [];
  const first = Math.ceil(window.from / 60_000) * 60_000;
  for (let t = first; t <= window.to; t += 60_000) {
    const label = zonedClock(t, zone);
    const [hours, mins] = label.split(":").map(Number);
    const ofDay = hours * 60 + mins;
    if (ofDay % step === 0) ticks.push({ t, label, whole: mins === 0 });
  }
  return ticks;
}

/** The point of the trace nearest to an instant, inside the window. */
export function pointNear(trace, t, window = null) {
  let best = null;
  for (const point of trace?.points ?? []) {
    if (window && (point.at < window.from || point.at > window.to)) continue;
    const middle = point.at + (trace.interval * 1000) / 2;
    if (
      !best ||
      Math.abs(middle - t) < Math.abs(best.at + (trace.interval * 1000) / 2 - t)
    )
      best = point;
  }
  return best;
}

/** « 203 ms O »: a correction and its direction (east and north positive). */
export function pulseText(ms, axis, locale) {
  const value = finite(ms);
  if (value === null) return null;
  if (Math.round(value) === 0)
    return message(locale, "sessionGuidingTipNoCorrection");
  const direction =
    axis === "ra"
      ? value > 0
        ? "sessionGuidingEast"
        : "sessionGuidingWest"
      : value > 0
        ? "sessionGuidingNorth"
        : "sessionGuidingSouth";
  return say(locale, "sessionGuidingTipCorrection", {
    ms: new Intl.NumberFormat(locale).format(Math.round(Math.abs(value))),
    direction: message(locale, direction),
  });
}

/**
 * The bubble of a point: `{ head, lines[{ axis, text }] }` — « 00:16:10 ·
 * moyenne sur 10 s (3 mesures) », « AD +0,72″ · correction 203 ms O »…
 */
export function pointTip(point, trace, { locale, zone, unit = "arcsec" }) {
  if (!point || !trace) return null;
  const head = say(
    locale,
    point.n === 1 ? "sessionGuidingTipHeadOne" : "sessionGuidingTipHeadOther",
    {
      time: zonedClockSeconds(point.at, zone),
      seconds: trace.interval,
      count: point.n,
    },
  );
  const lines = ["ra", "dec"].map((axis) => {
    const value = unitText(
      inUnit(point[axis], unit, trace.scale),
      unit,
      locale,
      {
        signed: true,
      },
    );
    const pulse = trace.pulsesKnown
      ? pulseText(
          point[axis === "ra" ? "raPulseMs" : "decPulseMs"] ?? 0,
          axis,
          locale,
        )
      : null;
    return {
      axis,
      text: [
        `${message(locale, axis === "ra" ? "nightPageLegendRa" : "nightPageLegendDec")} ${value}`,
        pulse,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });
  return {
    head,
    lines,
    settle: point.settle ? message(locale, "sessionGuidingTipSettle") : null,
  };
}

/** The markers of the night: the trace's own, else read from the report's events. */
export function nightMarkers(trace, report) {
  if (trace?.markers?.length) return trace.markers;
  const events = Array.isArray(report?.timeline?.events)
    ? report.timeline.events
    : [];
  return traceMarkersOf(events)
    .map((marker) => ({
      type: marker.type,
      at: instant(marker.at),
      end: instant(marker.end),
    }))
    .filter((marker) => marker.at !== null);
}

/**
 * The pauses to hatch and the meridian flips to draw: a pause from its start
 * to its resume; a meridian flip (begin to end) is a pause of the guiding
 * too, its dashed line at its end — the moment the mount is on the other
 * side, « Retournement 01:11 ».
 */
export function pausesAndFlips(markers) {
  const pauses = [];
  const flips = [];
  for (const marker of markers ?? []) {
    if (marker.type === "pause" && marker.end !== null)
      pauses.push({ from: marker.at, to: marker.end });
    else if (marker.type === "meridian-flip") {
      flips.push(marker.end ?? marker.at);
      if (marker.end !== null) pauses.push({ from: marker.at, to: marker.end });
    }
  }
  pauses.sort((a, b) => a.from - b.from);
  const merged = [];
  for (const pause of pauses) {
    const last = merged[merged.length - 1];
    if (last && pause.from <= last.to) last.to = Math.max(last.to, pause.to);
    else merged.push({ ...pause });
  }
  return { pauses: merged, flips };
}

/** The markers of one kind, as instants: dithers, star losses, focus runs. */
export const markerTimes = (markers, type) =>
  (markers ?? [])
    .filter((marker) => marker.type === type)
    .map((marker) => marker.at);

/**
 * The line of facts under the figures: « 44 dithers · aucune perte d’étoile ·
 * 1 retournement au méridien · 20 stabilisations expirées · échelle de
 * guidage 6,88″/px · image 4,08″/px ».
 */
export function guidingFactsLine(
  summary,
  { locale, scale = null, imageScale = null },
) {
  if (!summary) return "";
  const plural = (count, one, other) =>
    say(locale, count === 1 ? one : other, { count });
  const parts = [
    plural(
      summary.dithers ?? 0,
      "nightPageDithersOne",
      "nightPageDithersOther",
    ),
  ];
  const lost = summary.starLost ?? 0;
  parts.push(
    lost === 0
      ? message(locale, "sessionGuidingStarLostNone")
      : plural(
          lost,
          "sessionGuidingStarLostOne",
          "sessionGuidingStarLostOther",
        ),
  );
  if ((summary.meridianFlips ?? 0) > 0)
    parts.push(
      plural(summary.meridianFlips, "nightPageFlipsOne", "nightPageFlipsOther"),
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
  const settles = summary.settleTimeouts ?? 0;
  parts.push(
    settles === 0
      ? message(locale, "nightPageSettleNone")
      : plural(settles, "nightPageSettleOne", "nightPageSettleOther"),
  );
  const guide = finite(scale) ?? finite(summary.guideScaleArcsecPerPx);
  if (guide !== null)
    parts.push(
      say(locale, "sessionGuidingScale", {
        scale: figureText(guide, locale, 2),
      }),
    );
  if (finite(imageScale) !== null)
    parts.push(
      say(locale, "sessionGuidingImageScale", {
        scale: figureText(imageScale, locale, 2),
      }),
    );
  return parts.join(" · ");
}

/** « 2 h 56 »: the guided time. */
export const guidedText = (seconds, locale) =>
  finite(seconds) === null || seconds <= 0
    ? "—"
    : durationText(Math.round(seconds / 60), locale);

// ---- The frames -------------------------------------------------------------

const FILTER_TONES = [
  [/^(l|lum|luminance|clear)$/, "l"],
  [/^(r|red|rouge)$/, "r"],
  [/^(g|green|vert)$/, "g"],
  [/^(b|blue|bleu)$/, "b"],
  [/^(h|ha|halpha|hα)$/, "ha"],
  [/^(o|o3|oiii)$/, "oiii"],
  [/^(s|s2|sii)$/, "sii"],
];

/**
 * The colour family of a filter (fixed, never by rank): L, R, G, B, Hα, OIII,
 * SII, `none` for a frame without a filter (a colour camera), `other` for
 * every other filter (dual-band, light pollution…).
 */
export function filterTone(filter) {
  if (filter === null || filter === undefined || filter === "") return "none";
  const key = String(filter)
    .toLowerCase()
    .replace(/[^a-z0-9α]/g, "");
  if (!key || key === "none" || key === "nofilter") return "none";
  return FILTER_TONES.find(([pattern]) => pattern.test(key))?.[1] ?? "other";
}

/** « Hα », « Sans filtre »: a filter's name in a table or a bubble. */
export function filterName(filter, locale) {
  const tone = filterTone(filter);
  if (tone === "none") return message(locale, "sessionPosesNoFilter");
  if (tone === "ha") return "Hα";
  return String(filter);
}

const median = (values) => {
  const list = values
    .filter((value) => finite(value) !== null)
    .sort((a, b) => a - b);
  if (!list.length) return null;
  const middle = Math.floor(list.length / 2);
  return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
};

/**
 * The frames of the night, in order: `[{ index, at, end, exposureSeconds,
 * filter, tone, gain, sensorTempC, rejected, rejectReason, rmsArcsec,
 * fwhmPixels, eccentricity }]`. `rejected` stays false when the report does not
 * say which frames the stacking left out (`rejectedKnown` false: a report v2).
 */
export function posesOf(report, { rejectedKnown = true } = {}) {
  const rows = Array.isArray(report?.quality) ? report.quality : [];
  return rows
    .map((row) => ({ row, at: instant(row?.timestampUtc) }))
    .filter((entry) => entry.at !== null)
    .sort((a, b) => a.at - b.at)
    .map(({ row, at }, index) => {
      const exposure = finite(row.exposureSeconds) ?? 0;
      const rejected = rejectedKnown && row.rejected === true;
      return {
        index: index + 1,
        at,
        end: at + exposure * 1000,
        exposureSeconds: exposure,
        filter: row.filter ?? null,
        tone: filterTone(row.filter),
        gain: finite(row.gain),
        sensorTempC: finite(row.sensorTempC),
        rejected,
        rejectReason: rejected
          ? typeof row.rejectReason === "string"
            ? row.rejectReason
            : "manual"
          : null,
        rmsArcsec: finite(row.rmsTotalArcsec),
        fwhmPixels: finite(row.fwhmPixels),
        eccentricity: finite(row.eccentricity),
      };
    });
}

const REASON_KEYS = {
  unregistered: "sessionPosesReasonUnregistered",
  dawn: "sessionPosesReasonDawn",
  sky: "sessionPosesReasonSky",
  clouds: "sessionPosesReasonClouds",
  trailed: "sessionPosesReasonTrailed",
  wide: "sessionPosesReasonWide",
  manual: "sessionPosesReasonManual",
};

/** « non alignée », « aube »…: why the stacking left a frame out. */
export const reasonText = (reason, locale) =>
  message(locale, REASON_KEYS[reason] ?? "sessionPosesReasonManual");

/** « 90 s », « 3 min »: an exposure. */
export function exposureText(seconds, locale) {
  const value = finite(seconds);
  if (value === null) return "—";
  return say(locale, "sessionPosesSeconds", {
    value: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
      value,
    ),
  });
}

/** « −10,1 °C ». */
export const celsiusText = (value, locale) =>
  finite(value) === null
    ? "—"
    : say(locale, "sessionPosesCelsius", {
        value: figureText(value, locale, 1),
      });

/** The sensor over the night: its median and half its spread. */
export function sensorOf(poses) {
  const temps = poses
    .map((pose) => pose.sensorTempC)
    .filter((value) => value !== null);
  if (!temps.length) return null;
  return {
    median: median(temps),
    spread: (Math.max(...temps) - Math.min(...temps)) / 2,
  };
}

/** One value when all the frames share it, else null. */
const shared = (values) => {
  const known = values.filter((value) => value !== null && value !== undefined);
  return known.length && known.every((value) => value === known[0])
    ? known[0]
    : null;
};

/**
 * The table by filter (and exposure): `[{ key, filter, tone, exposureSeconds,
 * gain, total, kept, rejected, reasons{}, keptSeconds, sensorTempC,
 * fwhmPixels, eccentricity }]`, in the order the filters were first shot.
 */
export function posesByFilter(poses) {
  const groups = new Map();
  for (const pose of poses) {
    const key = `${pose.filter ?? ""}\u0000${pose.exposureSeconds}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pose);
  }
  return [...groups.entries()].map(([key, list]) => {
    const reasons = {};
    for (const pose of list)
      if (pose.rejected)
        reasons[pose.rejectReason] = (reasons[pose.rejectReason] ?? 0) + 1;
    const kept = list.filter((pose) => !pose.rejected);
    return {
      key,
      filter: list[0].filter,
      tone: list[0].tone,
      exposureSeconds: list[0].exposureSeconds,
      gain: shared(list.map((pose) => pose.gain)),
      total: list.length,
      kept: kept.length,
      rejected: list.length - kept.length,
      reasons,
      keptSeconds: kept.reduce((sum, pose) => sum + pose.exposureSeconds, 0),
      sensorTempC: median(list.map((pose) => pose.sensorTempC)),
      fwhmPixels: median(list.map((pose) => pose.fwhmPixels)),
      eccentricity: median(list.map((pose) => pose.eccentricity)),
    };
  });
}

/** « 1 non alignée », « 14 aube · 1 non alignée ». */
export function reasonsLine(byReason, locale) {
  return Object.entries(byReason ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([reason, count]) =>
        `${new Intl.NumberFormat(locale).format(count)} ${reasonText(reason, locale)}`,
    )
    .join(" · ");
}

/** The bubble of a frame: « Pose 59 · 00:48:27 · 90 s · Sans filtre · −10,1 °C · … ». */
export function poseTip(pose, { locale, zone }) {
  return [
    say(locale, "sessionPosesTipPose", { index: pose.index }),
    zonedClockSeconds(pose.at, zone),
    exposureText(pose.exposureSeconds, locale),
    filterName(pose.filter, locale),
    pose.sensorTempC !== null ? celsiusText(pose.sensorTempC, locale) : null,
    pose.rmsArcsec !== null
      ? say(locale, "sessionPosesTipRms", {
          value: `${figureText(pose.rmsArcsec, locale, 2)}″`,
        })
      : null,
    pose.rejected
      ? say(locale, "sessionPosesTipRejected", {
          reason: reasonText(pose.rejectReason, locale),
        })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// ---- The nights of a multi-night plan --------------------------------------

/** « 7–8 août »: the evening of a night and the morning after. */
export function eveningSpan(eveningDate, locale) {
  if (
    typeof eveningDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(eveningDate)
  )
    return null;
  const start = new Date(`${eveningDate}T12:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 86_400_000);
  const format = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return typeof format.formatRange === "function"
    ? format.formatRange(start, end)
    : `${format.format(start)} – ${format.format(end)}`;
}

/**
 * The view of « Les nuits de cette image »: `{ summary, nights[{ sessionId,
 * span, analysed, rms…, kept, total, keptSeconds, share }], cumulative,
 * single }` from the answer of `GET /v1/projects/{id}/analyses`; `null`
 * without a night.
 */
export function planNightsView(body, locale) {
  const nights = Array.isArray(body?.nights) ? body.nights : [];
  if (!nights.length) return null;
  const lines = nights.map((night) => {
    const guiding = night.guidingSummary ?? null;
    const poses = night.posesSummary ?? null;
    return {
      sessionId: night.sessionId,
      span:
        eveningSpan(night.eveningDate, locale) ??
        eveningSpan(night.startedAt?.slice?.(0, 10), locale) ??
        "—",
      analysed: night.analysed === true,
      rmsTotal: finite(guiding?.rmsTotalArcsec),
      rmsRa: finite(guiding?.rmsRaArcsec),
      rmsDec: finite(guiding?.rmsDecArcsec),
      guidedSeconds: finite(guiding?.guidedSeconds),
      kept: finite(poses?.kept),
      total: finite(poses?.total),
      keptSeconds: finite(poses?.keptSeconds) ?? 0,
      zone: night.zone?.timeZone ?? null,
    };
  });
  const cumulative = body?.cumulative ?? {};
  const keptAll = lines.reduce((sum, line) => sum + line.keptSeconds, 0);
  for (const line of lines)
    line.share = keptAll > 0 ? line.keptSeconds / keptAll : 0;
  const analysed = lines.filter((line) => line.analysed).length;
  const poses = cumulative.poses ?? null;
  const parts = [];
  if (finite(cumulative.rmsTotalArcsec) !== null)
    parts.push(
      say(locale, "captureNightsRms", {
        value: `${figureText(cumulative.rmsTotalArcsec, locale, 2)}″`,
      }),
    );
  if (poses && finite(poses.total))
    parts.push(
      sayCounted(locale, "captureNightsPoses", poses.kept ?? 0, {
        kept: new Intl.NumberFormat(locale).format(poses.kept ?? 0),
        total: new Intl.NumberFormat(locale).format(poses.total),
      }),
    );
  parts.push(
    analysed < lines.length
      ? sayCounted(locale, "captureNightsAnalysed", analysed, {
          analysed,
          count: lines.length,
        })
      : say(
          locale,
          lines.length === 1
            ? "captureNightsCountOne"
            : "captureNightsCountOther",
          { count: lines.length },
        ),
  );
  if (poses && finite(poses.keptSeconds) && poses.keptSeconds > 0)
    parts.push(durationText(Math.round(poses.keptSeconds / 60), locale));
  return {
    summary: parts.join(" · "),
    nights: lines,
    cumulative: {
      rmsTotal: finite(cumulative.rmsTotalArcsec),
      rmsRa: finite(cumulative.rmsRaArcsec),
      rmsDec: finite(cumulative.rmsDecArcsec),
      kept: finite(poses?.kept),
      total: finite(poses?.total),
      keptSeconds: finite(poses?.keptSeconds) ?? 0,
    },
    single: lines.length === 1,
  };
}

/** The path of a session's page. */
export const sessionPath = (locale, sessionId) =>
  `/${locale}/sessions/${encodeURIComponent(sessionId)}`;
