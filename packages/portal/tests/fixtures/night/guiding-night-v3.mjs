// The night of 10 to 11 August 2026 (Sh2-103, a colour camera, 90 frames of
// 90 s, the meridian flip at 01:00), reduced for the tests and the captures of
// SESSION-GUIDING-STATS-01: the real values of its PHD2 log at one point per
// 10 s from 22:40 to 02:00 (place's hours, UTC+2), the corrections with their
// direction, the settles after each dither, frame 59 left out by the stacking
// (not aligned), and the figures of the three nights of the plan (7, 10 and 12
// August), with no place and no coordinate. Stored compact
// into `guiding-night-v3.json`, whose arrays are expanded here.
import { readFileSync } from "node:fs";
import { nightsCumulative } from "../../../dist/sessions/night-summary.js";

const raw = JSON.parse(
  readFileSync(new URL("./guiding-night-v3.json", import.meta.url), "utf8"),
);

/** The night's bounds as the page has them, and the place's zone. */
export const NIGHT = {
  start: raw.night.from,
  end: raw.night.to,
  timeZone: raw.night.timeZone,
};

/**
 * The report v3 as Astro Sync sends it; `changes` override its fields.
 */
export function guidingNightReport(changes = {}) {
  const report = structuredClone(raw.report);
  report.guidingTrace.points = report.guidingTrace.points.map(
    ([t, n, out, ra, dec, raPulseMs, decPulseMs]) => ({
      t,
      n,
      out,
      ra,
      dec,
      raPeak: ra,
      decPeak: dec,
      raPulseMs,
      decPulseMs,
    }),
  );
  report.quality = report.quality.map(
    ([
      timestampUtc,
      exposureSeconds,
      sensorTempC,
      rmsTotalArcsec,
      rejected,
    ]) => ({
      timestampUtc,
      stepKey: "sh2-103-90",
      filter: null,
      exposureSeconds,
      gain: 100,
      sensorTempC,
      fwhmPixels: null,
      eccentricity: null,
      skyBackgroundAdu: null,
      rmsTotalArcsec,
      rejected: rejected === 1,
      rejectReason: rejected === 1 ? "unregistered" : null,
    }),
  );
  return { ...report, ...changes };
}

/**
 * The answer of `GET /v1/projects/{projectId}/analyses` for the plan of the
 * three nights: `sessionIds` names them (the 7, the 10, the 12 August).
 * `missing` lists the indexes of nights sent without an analysis.
 */
export function planNightsBody({
  projectId = "project-sh2-103",
  sessionIds = ["night-07", "night-10", "night-12"],
  missing = [],
} = {}) {
  const nights = raw.nights.map((night, index) => {
    const analysed = !missing.includes(index);
    const rejected = night.total - night.kept;
    return {
      sessionId: sessionIds[index],
      eveningDate: night.eveningDate,
      startedAt: `${night.eveningDate}T20:40:00.000Z`,
      zone: { timeZone: "Europe/Paris", utcOffsetMinutes: 120 },
      analysed,
      guidingSummary: analysed
        ? {
            rmsRaArcsec: night.rmsRa,
            rmsDecArcsec: night.rmsDec,
            rmsTotalArcsec: night.rmsTotal,
            guidedSeconds: night.guidedSeconds,
            samples: 0,
            dithers: 0,
            starLost: 0,
            settleTimeouts: 0,
            autofocusRuns: 0,
            autofocusSucceeded: 0,
            meridianFlips: 0,
            guideScaleArcsecPerPx: 6.88,
          }
        : null,
      posesSummary: analysed
        ? {
            total: night.total,
            kept: night.kept,
            rejected,
            rejectedKnown: true,
            totalSeconds: night.total * night.exposureSeconds,
            keptSeconds: night.kept * night.exposureSeconds,
            byReason: rejected ? { [night.rejectReason]: rejected } : {},
            byFilter: [],
          }
        : null,
      fwhmPixels: null,
      eccentricity: null,
    };
  });
  // The service's own cumulative (RMS weighted by the guided time).
  return {
    projectId,
    nights,
    cumulative: nightsCumulative(
      nights
        .filter((night) => night.analysed)
        .map((night) => ({
          guiding: night.guidingSummary,
          poses: night.posesSummary,
        })),
    ),
  };
}
