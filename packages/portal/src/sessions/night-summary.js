/**
 * The summaries of a night, computed by the service at read time from the
 * night's analysis (report v2, `session-analysis.schema.json`) and never
 * stored: the screens (the web, the phone, Astro Sync's
 * resume) read them as they are instead of recomputing from the raw rows.
 *
 * - `qualitySummary(report, steps)`: medians of the measured frames for the
 *   night and by step — FWHM in pixels, and in arcseconds when the report
 *   knows the scale (« 2,6 px · 8,1″ ») —, eccentricity, sky background,
 *   and the background noise and star count when the producer gave them;
 *   `measuredFrames`, the frames holding at least one measure.
 * - `guidingSummary(report)`: root-mean-square in right ascension,
 *   declination and total over the night (arcseconds), guided duration,
 *   samples, dithers, expired settles, focus runs launched and succeeded,
 *   meridian flips.
 * - `guidingSeries(report)`: the night's guiding by slices of 2 minutes —
 *   the report's own `guidingSeries` when it has one (the import's), or
 *   computed from its raw samples.
 * - `guidingTraceOf(report)`: the night's guiding at one point per 10 s with
 *   the corrections and the markers — the report v3's own `guidingTrace`,
 *   or rebuilt from a report v2's raw samples (no direction of the
 *   corrections: `raPulseMs`/`decPulseMs` null; the samples of a settle
 *   found from the events).
 * - `posesSummary(report)`: frames kept and left out by the stacking, by
 *   reason and by filter, with their exposure time.
 * - `nightsCumulative(nights)`: the nights of a multi-night plan together
 *   (RMS weighted by the guided time, frames and times summed).
 * - `zoneOf(timeZone, at)`: the place's zone and its offset at an instant
 *   (`utcOffsetMinutes`), for the readers that cannot read a zone's rules.
 *
 * Dithers are counted once (`dithersOf`): a report v2 holds each dither
 * twice when PHD2 and the ASIAIR both logged it.
 *
 * Pure, JSON in, JSON out; null when the night has nothing to summarize.
 */

export const GUIDING_SLICE_SECONDS = 120;

const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const round = (value, digits = 3) =>
  value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;

/** The median of the finite values, null when there is none. */
export function median(values) {
  const sorted = values
    .map(finite)
    .filter((value) => value !== null)
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

// The measures of a frame (an object, never a positional list).
const MEASURES = Object.keys({
  fwhmPixels: true,
  eccentricity: true,
  skyBackgroundAdu: true,
  skyBackgroundNoiseAdu: true,
  starCount: true,
});

function figures(rows, scale) {
  const fwhmPixels = median(rows.map((row) => row.fwhmPixels));
  return {
    fwhmPixels: round(fwhmPixels),
    fwhmArcsec:
      fwhmPixels !== null && scale !== null ? round(fwhmPixels * scale) : null,
    eccentricity: round(median(rows.map((row) => row.eccentricity))),
    skyBackgroundAdu: round(median(rows.map((row) => row.skyBackgroundAdu))),
    skyBackgroundNoiseAdu: round(
      median(rows.map((row) => row.skyBackgroundNoiseAdu)),
    ),
    starCount: round(median(rows.map((row) => row.starCount)), 1),
    measuredFrames: rows.filter((row) =>
      MEASURES.some((measure) => finite(row[measure]) !== null),
    ).length,
  };
}

/**
 * `{ pixelScaleArcsec, night, byStep: [{ stepKey, stepId, filter,
 * exposureSeconds, ...figures }] }`, or null without a quality row. A
 * step's `stepId` is the night's step proposed under that key (null when
 * the step was deleted, or never written because a corrected one stands
 * for it).
 */
export function qualitySummary(report, steps = []) {
  const rows = Array.isArray(report?.quality) ? report.quality : [];
  if (!rows.length) return null;
  const scale = finite(report.pixelScaleArcsec);
  const proposed = Array.isArray(report.acquisitionSteps)
    ? report.acquisitionSteps
    : [];
  const keys = [
    ...proposed.map((step) => step.key),
    ...rows.map((row) => row.stepKey),
  ].filter((key, index, all) => key && all.indexOf(key) === index);
  const byStep = keys
    .map((key) => {
      const stepRows = rows.filter((row) => row.stepKey === key);
      if (!stepRows.length) return null;
      const step = proposed.find((entry) => entry.key === key);
      const night = steps.find((entry) => entry.stepKey === key);
      return {
        stepKey: key,
        stepId: night?.id ?? null,
        filter: step ? (step.filter ?? null) : (stepRows[0].filter ?? null),
        exposureSeconds: step
          ? step.exposureSeconds
          : finite(stepRows[0].exposureSeconds),
        ...figures(stepRows, scale),
      };
    })
    .filter(Boolean);
  return { pixelScaleArcsec: scale, night: figures(rows, scale), byStep };
}

/**
 * The night's quality as the Journal and the capture's page read it (one
 * source for both): `{ skyBackground, fwhm, eccentricity, measuredFrames }`
 * — the medians of the night's measured frames, in ADU, arcseconds and 0–1 —
 * or `null` when the report says nothing of the quality (no measure at all).
 * `measuredFrames` is the number of frames the medians were measured on.
 */
export function sessionQualityOf(report, steps = []) {
  const night = qualitySummary(report, steps)?.night;
  if (!night) return null;
  const quality = {
    skyBackground: night.skyBackgroundAdu ?? null,
    fwhm: night.fwhmArcsec ?? null,
    eccentricity: night.eccentricity ?? null,
  };
  // A report with no measure at all says nothing about the quality.
  if (Object.values(quality).every((value) => value === null)) return null;
  return { ...quality, measuredFrames: night.measuredFrames ?? null };
}

const time = (value) => {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** Root-mean-square about the mean (PHD2's RMS), null without a value. */
function rms(values) {
  const list = values.map(finite).filter((value) => value !== null);
  if (!list.length) return null;
  const mean = list.reduce((sum, value) => sum + value, 0) / list.length;
  return Math.sqrt(
    list.reduce((sum, value) => sum + (value - mean) ** 2, 0) / list.length,
  );
}

const total = (ra, dec) =>
  ra === null || dec === null ? null : Math.sqrt(ra * ra + dec * dec);

/** The slices of the night's guiding (`guidingSlice` of the report). */
export function guidingSeries(report) {
  // A report that carries its slices (even none: every frame was left out of
  // the statistics) is not recomputed from its raw samples.
  if (Array.isArray(report?.guidingSeries))
    return report.guidingSeries.map((slice) => ({
      start: slice.start,
      end: slice.end,
      rmsRa: round(finite(slice.rmsRa)),
      rmsDec: round(finite(slice.rmsDec)),
      rmsTotal: round(finite(slice.rmsTotal)),
      samples: slice.samples,
    }));
  const samples = (Array.isArray(report?.guiding) ? report.guiding : [])
    .map((sample) => ({ ...sample, at: time(sample.timestampUtc) }))
    .filter((sample) => sample.at !== null)
    .sort((a, b) => a.at - b.at);
  if (!samples.length) return [];
  const origin = samples[0].at;
  const last = samples.at(-1).at;
  const width = GUIDING_SLICE_SECONDS * 1000;
  const buckets = new Map();
  for (const sample of samples) {
    const index = Math.floor((sample.at - origin) / width);
    if (!buckets.has(index)) buckets.set(index, []);
    buckets.get(index).push(sample);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, list]) => {
      const ra = rms(list.map((sample) => sample.raOffsetArcsec));
      const dec = rms(list.map((sample) => sample.decOffsetArcsec));
      return {
        start: new Date(origin + index * width).toISOString(),
        end: new Date(
          Math.min(origin + (index + 1) * width, last),
        ).toISOString(),
        rmsRa: round(ra),
        rmsDec: round(dec),
        rmsTotal: round(total(ra, dec)),
        samples: list.length,
      };
    });
}

/** RMS of several slices, each weighted by its samples. */
function combined(series, field) {
  const parts = series.filter(
    (slice) => finite(slice[field]) !== null && slice.samples > 0,
  );
  const count = parts.reduce((sum, slice) => sum + slice.samples, 0);
  if (!count) return null;
  return Math.sqrt(
    parts.reduce((sum, slice) => sum + slice.samples * slice[field] ** 2, 0) /
      count,
  );
}

/**
 * `{ rmsRaArcsec, rmsDecArcsec, rmsTotalArcsec, guidedSeconds, samples,
 * dithers, settleTimeouts, autofocusRuns, autofocusSucceeded,
 * meridianFlips }`, or null when the report has neither guiding nor any
 * guiding event.
 */
export function guidingSummary(report) {
  const series = guidingSeries(report);
  const events = Array.isArray(report?.timeline?.events)
    ? report.timeline.events
    : [];
  const count = (type, test = () => true) =>
    events.filter((event) => event?.type === type && test(event)).length;
  const counts = {
    dithers: dithersOf(events).length,
    starLost: starLossesOf(events).length,
    settleTimeouts: count("settle-timeout"),
    autofocusRuns: count("autofocus"),
    autofocusSucceeded: count(
      "autofocus-result",
      (event) => event.data?.succeeded === true,
    ),
    meridianFlips: count("meridian-flip"),
  };
  const trace = isObject(report?.guidingTrace) ? report.guidingTrace : null;
  if (
    !series.length &&
    !(trace?.points?.length > 0) &&
    !Object.values(counts).some(Boolean)
  )
    return null;
  const raw = Array.isArray(report?.guiding) ? report.guiding : [];
  let ra;
  let dec;
  if (trace && finite(trace.rms?.raArcsec) !== null) {
    // The report v3 gives the night's RMS over the samples that count.
    ra = finite(trace.rms.raArcsec);
    dec = finite(trace.rms.decArcsec);
  } else if (raw.length && !Array.isArray(report.guidingSeries)) {
    ra = rms(raw.map((sample) => sample.raOffsetArcsec));
    dec = rms(raw.map((sample) => sample.decOffsetArcsec));
  } else {
    ra = combined(series, "rmsRa");
    dec = combined(series, "rmsDec");
  }
  const totalFromSeries = combined(series, "rmsTotal");
  const seriesSeconds = Math.round(
    series.reduce(
      (sum, slice) =>
        sum +
        (slice.samples > 0
          ? Math.max(0, (time(slice.end) ?? 0) - (time(slice.start) ?? 0))
          : 0),
      0,
    ) / 1000,
  );
  return {
    rmsRaArcsec: round(ra),
    rmsDecArcsec: round(dec),
    rmsTotalArcsec: round(total(ra, dec) ?? totalFromSeries),
    // The report v3 says its guided time and the samples of its RMS.
    guidedSeconds:
      trace && Number.isInteger(trace.guidedSeconds)
        ? trace.guidedSeconds
        : seriesSeconds,
    samples:
      trace && Number.isInteger(trace.rms?.samples)
        ? trace.rms.samples
        : series.reduce((sum, slice) => sum + slice.samples, 0),
    ...counts,
    guideScaleArcsecPerPx: trace ? finite(trace.scaleArcsecPerPx) : null,
  };
}

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Two dithers of PHD2 and the ASIAIR closer than this are one (ms). */
export const SAME_DITHER_MS = 30_000;
/** Lost-star markers closer than this are one loss (ms). */
const SAME_LOSS_MS = 30_000;

const eventsOf = (report) =>
  Array.isArray(report?.timeline?.events) ? report.timeline.events : [];

/**
 * The night's dithers, one per dither: an ASIAIR (or NINA) dither within
 * 30 s of a PHD2 dither is the same one told twice — PHD2's is kept. A
 * report v2 holds both; a report v3 already only one.
 */
export function dithersOf(events) {
  const all = (Array.isArray(events) ? events : []).filter(
    (event) => event?.type === "dither" && time(event.timestampUtc) !== null,
  );
  const phd2 = all
    .filter((event) => event.source === "phd2")
    .map((event) => time(event.timestampUtc));
  return all.filter(
    (event) =>
      event.source === "phd2" ||
      !phd2.some(
        (at) => Math.abs(at - time(event.timestampUtc)) <= SAME_DITHER_MS,
      ),
  );
}

/** The star losses: the `star-lost` events, those within 30 s one loss. */
function starLossesOf(events) {
  const times = (Array.isArray(events) ? events : [])
    .filter((event) => event?.type === "star-lost")
    .map((event) => time(event.timestampUtc))
    .filter((at) => at !== null)
    .sort((a, b) => a - b);
  const losses = [];
  let last = null;
  for (const at of times) {
    if (last === null || at - last > SAME_LOSS_MS) losses.push(at);
    last = at;
  }
  return losses;
}

const iso = (ms) => new Date(ms).toISOString();

/**
 * The markers of a trace from the night's events (the report v3 gives its
 * own): one dither per dither, the settle from the dither to PHD2's
 * verdict, the star losses, the pauses to their resume, the meridian flips,
 * the focus runs to their result.
 */
export function traceMarkersOf(events) {
  const timed = (Array.isArray(events) ? events : [])
    .map((event) => ({ event, at: time(event?.timestampUtc) }))
    .filter((entry) => entry.at !== null)
    .sort((a, b) => a.at - b.at);
  const nextAfter = (from, test, within = Infinity) =>
    timed.find(
      (entry) =>
        entry.at >= from && entry.at - from <= within && test(entry.event),
    )?.at ?? null;
  const settleEnd = (event) =>
    event.type === "dither-settle" &&
    ["complete", "failed"].includes(event.data?.outcome);
  const marker = (type, at, end = null) => ({
    type,
    at: iso(at),
    end: end !== null && end > at ? iso(end) : null,
  });
  const markers = [];
  for (const event of dithersOf(timed.map((entry) => entry.event))) {
    const at = time(event.timestampUtc);
    markers.push(marker("dither", at));
    const end = nextAfter(at, settleEnd, 10 * 60_000);
    if (end !== null) markers.push(marker("settle", at, end));
  }
  for (const at of starLossesOf(timed.map((entry) => entry.event)))
    markers.push(marker("star-lost", at));
  for (const { event, at } of timed) {
    if (event.type === "pause")
      markers.push(
        marker(
          "pause",
          at,
          nextAfter(at, (e) => e.type === "resume"),
        ),
      );
    else if (event.type === "meridian-flip")
      markers.push(marker("meridian-flip", at));
    else if (event.type === "autofocus")
      markers.push(
        marker(
          "autofocus",
          at,
          nextAfter(at, (e) => e.type === "autofocus-result", 60 * 60_000),
        ),
      );
  }
  return markers.sort((a, b) => time(a.at) - time(b.at));
}

/** The width of a window of the trace, seconds. */
export const TRACE_INTERVAL_SECONDS = 10;

const peak = (values) =>
  values.reduce(
    (kept, value) => (Math.abs(value) > Math.abs(kept) ? value : kept),
    0,
  );

/**
 * The night's guiding at one point per 10 s: the report v3's
 * `guidingTrace` as it was sent, or one rebuilt from a report v2's raw
 * samples (`raPulseMs`/`decPulseMs` null: the v2 does not say which way the
 * corrections went; `out` counts the samples between a dither and PHD2's
 * verdict on its settle); `null` without guiding samples (an import, a
 * night without PHD2).
 */
export function guidingTraceOf(report) {
  if (isObject(report?.guidingTrace)) {
    const trace = report.guidingTrace;
    return {
      intervalSeconds: trace.intervalSeconds,
      startUtc: trace.startUtc,
      scaleArcsecPerPx: finite(trace.scaleArcsecPerPx),
      guidedSeconds: trace.guidedSeconds,
      samples: trace.samples,
      rms: trace.rms,
      points: Array.isArray(trace.points) ? trace.points : [],
      markers: Array.isArray(trace.markers) ? trace.markers : [],
    };
  }
  const samples = (Array.isArray(report?.guiding) ? report.guiding : [])
    .map((sample) => ({
      at: time(sample?.timestampUtc),
      ra: finite(sample?.raOffsetArcsec),
      dec: finite(sample?.decOffsetArcsec),
    }))
    .filter(
      (sample) =>
        sample.at !== null && sample.ra !== null && sample.dec !== null,
    )
    .sort((a, b) => a.at - b.at);
  if (!samples.length) return null;
  const markers = traceMarkersOf(eventsOf(report));
  const settles = markers
    .filter((m) => m.type === "settle" && m.end)
    .map((m) => [time(m.at), time(m.end)]);
  const settling = (at) => settles.some(([from, to]) => at >= from && at <= to);
  const width = TRACE_INTERVAL_SECONDS * 1000;
  const origin = Math.floor(samples[0].at / width) * width;
  const windows = new Map();
  for (const sample of samples) {
    const slot = Math.floor((sample.at - origin) / width);
    if (!windows.has(slot)) windows.set(slot, []);
    windows.get(slot).push(sample);
  }
  const mean = (values) =>
    values.reduce((sum, v) => sum + v, 0) / values.length;
  const points = [...windows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([slot, list]) => ({
      t: slot * TRACE_INTERVAL_SECONDS,
      n: list.length,
      out: list.filter((sample) => settling(sample.at)).length,
      ra: round(mean(list.map((s) => s.ra)), 2),
      dec: round(mean(list.map((s) => s.dec)), 2),
      raPeak: round(peak(list.map((s) => s.ra)), 2),
      decPeak: round(peak(list.map((s) => s.dec)), 2),
      raPulseMs: null,
      decPulseMs: null,
    }));
  const summary = guidingSummary(report);
  return {
    intervalSeconds: TRACE_INTERVAL_SECONDS,
    startUtc: iso(origin),
    scaleArcsecPerPx: null,
    guidedSeconds: points.length * TRACE_INTERVAL_SECONDS,
    samples: samples.length,
    rms: {
      raArcsec: summary?.rmsRaArcsec ?? null,
      decArcsec: summary?.rmsDecArcsec ?? null,
      totalArcsec: summary?.rmsTotalArcsec ?? null,
      samples: summary?.samples ?? 0,
    },
    points,
    markers,
  };
}

/**
 * The frames of the night: `{ total, kept, rejected, rejectedKnown,
 * totalSeconds, keptSeconds, byReason: { reason: count }, byFilter: [{
 * filter, total, kept, rejected, keptSeconds }] }`, or null without a
 * quality row. `rejectedKnown` is false for a report v2 (it never said which
 * frames the stacking left out: all count as kept).
 */
export function posesSummary(report) {
  const rows = Array.isArray(report?.quality) ? report.quality : [];
  if (!rows.length) return null;
  const seconds = (row) => finite(row.exposureSeconds) ?? 0;
  const byReason = {};
  const filters = new Map();
  let kept = 0;
  let keptSeconds = 0;
  let totalSeconds = 0;
  for (const row of rows) {
    const rejected = row.rejected === true;
    totalSeconds += seconds(row);
    if (rejected) {
      const reason =
        typeof row.rejectReason === "string" ? row.rejectReason : "manual";
      byReason[reason] = (byReason[reason] ?? 0) + 1;
    } else {
      kept += 1;
      keptSeconds += seconds(row);
    }
    const key = row.filter ?? null;
    const entry = filters.get(key) ?? {
      filter: key,
      total: 0,
      kept: 0,
      rejected: 0,
      keptSeconds: 0,
    };
    entry.total += 1;
    if (rejected) entry.rejected += 1;
    else {
      entry.kept += 1;
      entry.keptSeconds += seconds(row);
    }
    filters.set(key, entry);
  }
  return {
    total: rows.length,
    kept,
    rejected: rows.length - kept,
    rejectedKnown: rows.some((row) => typeof row.rejected === "boolean"),
    totalSeconds: round(totalSeconds, 1),
    keptSeconds: round(keptSeconds, 1),
    byReason,
    byFilter: [...filters.values()].map((entry) => ({
      ...entry,
      keptSeconds: round(entry.keptSeconds, 1),
    })),
  };
}

/**
 * Several nights together (a multi-night plan): each `{ guiding, poses }`
 * (`guidingSummary`, `posesSummary`, either null). The RMS of each axis is
 * weighted by each night's guided time (√(Σ tᵢ·rmsᵢ² / Σ tᵢ)), the total
 * from the two axes; frames and times are summed.
 */
export function nightsCumulative(nights) {
  const list = Array.isArray(nights) ? nights : [];
  const guided = list
    .map((night) => night?.guiding)
    .filter(
      (guiding) =>
        guiding &&
        finite(guiding.rmsRaArcsec) !== null &&
        finite(guiding.rmsDecArcsec) !== null &&
        guiding.guidedSeconds > 0,
    );
  const weight = guided.reduce((sum, g) => sum + g.guidedSeconds, 0);
  const axis = (field) =>
    weight
      ? Math.sqrt(
          guided.reduce((sum, g) => sum + g.guidedSeconds * g[field] ** 2, 0) /
            weight,
        )
      : null;
  const ra = axis("rmsRaArcsec");
  const dec = axis("rmsDecArcsec");
  const poses = list.map((night) => night?.poses).filter(Boolean);
  const sum = (field) => poses.reduce((total, p) => total + (p[field] ?? 0), 0);
  return {
    nights: list.length,
    guidedNights: guided.length,
    rmsRaArcsec: round(ra),
    rmsDecArcsec: round(dec),
    rmsTotalArcsec: round(total(ra, dec)),
    guidedSeconds: weight,
    dithers: list.reduce((total, n) => total + (n?.guiding?.dithers ?? 0), 0),
    poses: poses.length
      ? {
          total: sum("total"),
          kept: sum("kept"),
          rejected: sum("rejected"),
          totalSeconds: round(sum("totalSeconds"), 1),
          keptSeconds: round(sum("keptSeconds"), 1),
        }
      : null,
  };
}

/**
 * The place's zone at an instant: `{ timeZone, utcOffsetMinutes }` — the
 * offset east of UTC the zone has then (`+120` for Paris in summer), for the
 * readers without a zone database (the phone). Both null for an unknown
 * zone or instant.
 */
export function zoneOf(timeZone, at) {
  const epoch = typeof at === "number" ? at : time(at);
  if (typeof timeZone !== "string" || !timeZone || epoch === null)
    return { timeZone: null, utcOffsetMinutes: null };
  try {
    const name = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    })
      .formatToParts(new Date(epoch))
      .find((part) => part.type === "timeZoneName")?.value;
    const match = /GMT(?:([+-])(\d{2}):(\d{2}))?/.exec(name ?? "");
    if (!match) return { timeZone: null, utcOffsetMinutes: null };
    const minutes = match[1]
      ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
      : 0;
    return { timeZone, utcOffsetMinutes: minutes };
  } catch {
    return { timeZone: null, utcOffsetMinutes: null };
  }
}
