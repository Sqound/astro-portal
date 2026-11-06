import { planCaptureFieldsOf } from "../persistence/plan-capture-fields.js";
import {
  guidingSeries,
  guidingSummary,
  median,
  sessionQualityOf,
} from "../sessions/night-summary.js";

/**
 * The guiding samples of a report as `{ at, ra, dec, weight }`: the raw
 * samples of a report v2, or the points of a report v3's trace (one per 10
 * s, weighted by the samples each holds).
 */
function guideSamplesOf(report) {
  const raw = Array.isArray(report?.guiding) ? report.guiding : [];
  if (raw.length)
    return raw.map((sample) => ({
      at: time(sample?.timestampUtc),
      ra: finite(sample?.raOffsetArcsec),
      dec: finite(sample?.decOffsetArcsec),
      weight: 1,
    }));
  const trace = report?.guidingTrace;
  const start = time(trace?.startUtc);
  if (start === null || !Array.isArray(trace?.points)) return [];
  return trace.points.map((point) => ({
    at: start + (finite(point?.t) ?? 0) * 1000,
    ra: finite(point?.ra),
    dec: finite(point?.dec),
    weight: Math.max(1, finite(point?.n) ?? 1),
  }));
}
import { qualityShownIn } from "./gallery-quality.js";

/**
 * The quality charts of a capture in the galleries — the catalogue's
 * « Qualité des captures » (`components/quality/CaptureQuality.js`): the
 * sky background, the FWHM and the eccentricity frame after frame, and
 * « Guidage et journal de la nuit » (the guiding trace with its RMS band,
 * the dithers, the settles, the focus runs, the meridian flips) — fed by the
 * analyses of the nights the capture combines (its session, or the nights
 * the image of a multi-night plan combines, `plan_json.combinedNightIds`),
 * read with the Journal's own functions (`sessions/night-summary.js`).
 *
 * Beside them, what does not move through the night is said in rows
 * (`galleryNight`): the medians of the frames and the guiding's RMS and
 * meridian flips.
 *
 * Shown under the same switch as the quality of the images
 * (`captures.quality_public` for the public gallery, `quality_private` for
 * the private one). Never a date, a clock time or a place: every time is the
 * minutes since the night's first measure, and a night is « Nuit 1 »,
 * « Nuit 2 » in their order.
 */

const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const round = (value, digits = 3) =>
  value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;
const time = (value) => {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
const minutes = (at, origin) => round((at - origin) / 60_000, 1);

/** The charts' points at most (the catalogue's 48 and 36 for the quality). */
const QUALITY_POINTS_ONE_NIGHT = 48;
const QUALITY_POINTS_SEVERAL_NIGHTS = 36;
const GUIDE_POINTS = 120;

function parsed(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The first moment the report knows of: its measures, its guiding. */
function originOf(report) {
  const times = [
    ...(Array.isArray(report?.quality) ? report.quality : []).map((row) =>
      time(row?.timestampUtc),
    ),
    ...guideSamplesOf(report).map((sample) => sample.at),
    ...guidingSeries(report).map((slice) => time(slice.start)),
  ].filter((value) => value !== null);
  return times.length ? Math.min(...times) : null;
}

/** Groups `points` (in order) into at most `count` buckets. */
function buckets(points, count) {
  const size = Math.max(1, Math.ceil(points.length / count));
  const groups = [];
  for (let start = 0; start < points.length; start += size)
    groups.push(points.slice(start, start + size));
  return groups;
}

/**
 * The measured frames of one night: `{ night, minute }` (minutes since the
 * night's first measure), the sky background in ADU, the FWHM in pixels,
 * the eccentricity.
 */
function framesOf(report, night, origin) {
  return (Array.isArray(report?.quality) ? report.quality : [])
    .map((row) => ({
      at: time(row?.timestampUtc),
      background: finite(row?.skyBackgroundAdu),
      fwhmPixels: finite(row?.fwhmPixels),
      eccentricity: finite(row?.eccentricity),
    }))
    .filter(
      (row) =>
        row.at !== null &&
        (row.background !== null ||
          row.fwhmPixels !== null ||
          row.eccentricity !== null),
    )
    .sort((left, right) => left.at - right.at)
    .map(({ at, ...row }) => ({ ...row, night, minute: minutes(at, origin) }));
}

/**
 * The night's guiding as the catalogue's trace: the Journal's slices
 * (`guidingSeries`) with their RMS, and the mean offset in RA and Dec of the
 * samples of each slice (the trace's two lines: the raw samples of a report
 * v2, the points of a report v3's trace); empty without either.
 */
function guideSeriesOf(report, origin) {
  const slices = guidingSeries(report).filter(
    (slice) =>
      time(slice.start) !== null &&
      time(slice.end) !== null &&
      finite(slice.rmsTotal) !== null,
  );
  const raw = guideSamplesOf(report).filter(
    (sample) => sample.at !== null && sample.ra !== null && sample.dec !== null,
  );
  if (!slices.length || !raw.length) return [];
  const mean = (inside, field) =>
    inside.reduce((sum, sample) => sum + sample[field] * sample.weight, 0) /
    inside.reduce((sum, sample) => sum + sample.weight, 0);
  const points = slices
    .map((slice) => {
      const from = time(slice.start);
      const to = time(slice.end);
      const inside = raw.filter(
        (sample) => sample.at >= from && sample.at <= to,
      );
      if (!inside.length) return null;
      return {
        from,
        to,
        ra: mean(inside, "ra"),
        dec: mean(inside, "dec"),
        rms: slice.rmsTotal,
        samples: slice.samples || inside.length,
      };
    })
    .filter(Boolean);
  return buckets(points, GUIDE_POINTS).map((group) => {
    const samples = group.reduce((sum, point) => sum + point.samples, 0) || 1;
    const weighted = (field) =>
      group.reduce((sum, point) => sum + point[field] * point.samples, 0) /
      samples;
    return {
      fromMinute: minutes(group[0].from, origin),
      toMinute: minutes(group.at(-1).to, origin),
      raArcsec: round(weighted("ra")),
      decArcsec: round(weighted("dec")),
      rmsTotalArcsec: round(
        Math.sqrt(
          group.reduce(
            (sum, point) => sum + point.samples * point.rms ** 2,
            0,
          ) / samples,
        ),
      ),
      sampleCount: group.reduce((sum, point) => sum + point.samples, 0),
    };
  });
}

/** The night's events the catalogue draws: meridian flips and focus runs. */
function eventsOf(report, origin) {
  const events = Array.isArray(report?.timeline?.events)
    ? report.timeline.events
    : [];
  return events
    .filter((event) => ["meridian-flip", "autofocus"].includes(event?.type))
    .map((event) => {
      const at = time(event.timestampUtc);
      const temperature = finite(Number(event.data?.temperatureC));
      return at === null
        ? null
        : {
            type: event.type,
            minute: minutes(at, origin),
            ...(event.type === "autofocus" && temperature !== null
              ? { temperatureC: temperature }
              : {}),
          };
    })
    .filter(Boolean);
}

/**
 * The charts of the nights `reports` (one analysis report per night, in
 * their order), in the catalogue's shape: `{ frameCount, summary, series,
 * sessionTelemetry }` — `series` empty without a measured frame,
 * `sessionTelemetry` empty without guiding; `null` when there is neither.
 * Pure, so that a test reads it.
 */
export function galleryQualityCharts(reports) {
  const nights = (Array.isArray(reports) ? reports : []).filter(
    (report) => report && typeof report === "object",
  );
  let offset = 0;
  const frames = [];
  const sessionTelemetry = [];
  for (const [index, report] of nights.entries()) {
    const origin = originOf(report);
    if (origin === null) continue;
    const night = index + 1;
    const own = framesOf(report, night, origin);
    // One axis for the nights of a plan: each night after the one before.
    frames.push(
      ...own.map((frame) => ({ ...frame, minute: frame.minute + offset })),
    );
    const guide = guideSeriesOf(report, origin);
    const events = eventsOf(report, origin);
    const summary = guidingSummary(report);
    const end = Math.max(
      own.at(-1)?.minute ?? 0,
      guide.at(-1)?.toMinute ?? 0,
      ...events.map((event) => event.minute),
    );
    if (summary)
      sessionTelemetry.push({
        id: `night-${night}`,
        night,
        durationMinutes: Math.round(end),
        summary: {
          rmsRaArcsec: finite(summary.rmsRaArcsec),
          rmsDecArcsec: finite(summary.rmsDecArcsec),
          rmsTotalArcsec: finite(summary.rmsTotalArcsec),
          ditherCount: summary.dithers ?? 0,
          settleTimeoutCount: summary.settleTimeouts ?? 0,
          autofocusCount: summary.autofocusRuns ?? 0,
          autofocusSuccessCount: summary.autofocusSucceeded ?? 0,
          meridianFlipCount: summary.meridianFlips ?? 0,
        },
        guideSeries: guide,
        events,
      });
    offset += end + 1;
  }
  const grouped = buckets(
    frames,
    nights.length > 1
      ? QUALITY_POINTS_SEVERAL_NIGHTS
      : QUALITY_POINTS_ONE_NIGHT,
  ).map((group) => ({
    night: group[0].night,
    fromMinute: group[0].minute,
    toMinute: group.at(-1).minute,
    background: median(group.map((frame) => frame.background)),
    fwhmPixels: round(median(group.map((frame) => frame.fwhmPixels))),
    eccentricity: round(median(group.map((frame) => frame.eccentricity))),
    frameCount: group.length,
  }));
  // The sky background relative to the darkest point of the series, as the
  // catalogue drew it (« évolution relative »).
  const backgrounds = grouped
    .map((point) => point.background)
    .filter((value) => value !== null && value > 0);
  const darkest = backgrounds.length ? Math.min(...backgrounds) : null;
  const series = frames.length
    ? grouped.map(({ background, ...point }) => ({
        ...point,
        backgroundRelativePercent:
          background !== null && darkest
            ? round((background / darkest) * 100, 1)
            : null,
      }))
    : [];
  if (!series.length && !sessionTelemetry.length) return null;
  return {
    frameCount: frames.length,
    summary: {
      medianFwhmPixels: round(median(frames.map((frame) => frame.fwhmPixels))),
      medianEccentricity: round(
        median(frames.map((frame) => frame.eccentricity)),
      ),
    },
    series,
    sessionTelemetry,
  };
}

// ——— the values that do not move through the night ———

/** What a gallery says of one night's report, or `null` when it says nothing. */
export function galleryNight(report) {
  if (!report || typeof report !== "object") return null;
  const quality = sessionQualityOf(report, []);
  const guiding = guidingSummary(report);
  const rms = guiding
    ? {
        rmsTotalArcsec: finite(guiding.rmsTotalArcsec),
        rmsRaArcsec: finite(guiding.rmsRaArcsec),
        rmsDecArcsec: finite(guiding.rmsDecArcsec),
        meridianFlips: Number.isInteger(guiding.meridianFlips)
          ? guiding.meridianFlips
          : 0,
      }
    : null;
  const night = {
    skyBackgroundAdu: finite(quality?.skyBackground),
    fwhmArcsec: finite(quality?.fwhm),
    eccentricity: finite(quality?.eccentricity),
    measuredFrames: Number.isInteger(quality?.measuredFrames)
      ? quality.measuredFrames
      : null,
    guiding:
      rms && (rms.rmsTotalArcsec !== null || rms.meridianFlips > 0)
        ? rms
        : null,
  };
  const says =
    night.skyBackgroundAdu !== null ||
    night.fwhmArcsec !== null ||
    night.eccentricity !== null ||
    night.guiding !== null;
  return says ? night : null;
}

/**
 * What a gallery says of the nights of the capture (`audience`: `public` or
 * `private`): `{ nights, qualityCharts }` — `nights` the rows of each night
 * (`galleryNight`), `qualityCharts` the charts (`galleryQualityCharts`) —,
 * both empty while that gallery's switch is off or no night was analysed.
 * The caller checked the gallery shows the capture.
 */
export async function galleryNightStatisticsOf(driver, captureId, audience) {
  const none = { nights: [], qualityCharts: null };
  if (!(await qualityShownIn(driver, captureId, audience))) return none;
  const capture = (
    await driver.query(
      "SELECT tenant_id, session_id, project_id, plan_json FROM captures WHERE id = ?",
      [String(captureId ?? "")],
    )
  ).rows[0];
  if (!capture) return none;
  const ids = capture.project_id
    ? planCaptureFieldsOf(capture.plan_json).combinedNightIds
    : [capture.session_id].filter(Boolean);
  const unique = [...new Set(ids.map(String))];
  if (!unique.length) return none;
  const reports = (
    await driver.query(
      `SELECT s.id, s.started_at, a.report_json
       FROM observation_sessions s
       JOIN session_analyses a ON a.session_id = s.id AND a.tenant_id = s.tenant_id
       WHERE s.tenant_id = ? AND s.deleted_at IS NULL
         AND s.id IN (${unique.map(() => "?").join(", ")})`,
      [capture.tenant_id, ...unique],
    )
  ).rows
    .sort(
      (left, right) =>
        String(left.started_at ?? "").localeCompare(
          String(right.started_at ?? ""),
        ) || String(left.id).localeCompare(String(right.id)),
    )
    .map((row) => parsed(row.report_json));
  return {
    nights: reports.map(galleryNight).filter(Boolean),
    qualityCharts: galleryQualityCharts(reports),
  };
}
