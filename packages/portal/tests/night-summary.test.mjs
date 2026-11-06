// The summaries of a night computed at read time from its report v2, held to
// values computed by hand on the fixture `fixtures/night/report-v2.mjs`.
import assert from "node:assert/strict";
import test from "node:test";
import {
  guidingSeries,
  guidingSummary,
  median,
  qualitySummary,
} from "../dist/sessions/night-summary.js";
import { importedReport, nightReport } from "./fixtures/night/report-v2.mjs";

test("median: odd, even, nulls ignored, none", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, null, 3, 2]), 2.5);
  assert.equal(median([null, undefined, Number.NaN]), null);
  assert.equal(median([]), null);
});

test("quality of the night and by step: medians, FWHM in arcseconds with the report's scale (« 2,7 px · 8,4″ »)", () => {
  const summary = qualitySummary(nightReport());
  assert.equal(summary.pixelScaleArcsec, 3.1);
  assert.deepEqual(summary.night, {
    fwhmPixels: 2.7,
    fwhmArcsec: 8.37,
    eccentricity: 0.46,
    skyBackgroundAdu: 1005,
    skyBackgroundNoiseAdu: 11,
    starCount: 850,
    // The frame whose header held no measure is not counted.
    measuredFrames: 6,
  });
  assert.deepEqual(
    summary.byStep.map((step) => [
      step.stepKey,
      step.filter,
      step.exposureSeconds,
      step.fwhmPixels,
      step.fwhmArcsec,
      step.eccentricity,
      step.measuredFrames,
    ]),
    [
      ["ngc7000-ha-180", "Ha", 180, 2.6, 8.06, 0.42, 3],
      ["ngc7000-oiii-180", "OIII", 180, 3.1, 9.61, 0.55, 2],
      ["m31-120", null, 120, 2, 6.2, 0.3, 1],
    ],
  );
});

test("quality without the scale: FWHM in pixels only", () => {
  const summary = qualitySummary(nightReport({ pixelScaleArcsec: null }));
  assert.equal(summary.pixelScaleArcsec, null);
  assert.equal(summary.night.fwhmPixels, 2.7);
  assert.equal(summary.night.fwhmArcsec, null);
  assert.ok(summary.byStep.every((step) => step.fwhmArcsec === null));
});

test("the old portal's two measures are carried where the producer gave them, null elsewhere", () => {
  const { byStep } = qualitySummary(nightReport());
  assert.deepEqual(
    byStep.map((step) => [step.skyBackgroundNoiseAdu, step.starCount]),
    [
      [11, 850],
      [null, null],
      [null, null],
    ],
  );
});

test("each step of the summary names the night's step proposed under its key", () => {
  const steps = [
    { id: "step-ha", stepKey: "ngc7000-ha-180" },
    { id: "step-manual", stepKey: null },
  ];
  const { byStep } = qualitySummary(nightReport(), steps);
  assert.deepEqual(
    byStep.map((step) => step.stepId),
    ["step-ha", null, null],
  );
});

test("guiding from the raw samples: RMS over the night, guided duration, the events counted", () => {
  assert.deepEqual(guidingSummary(nightReport()), {
    rmsRaArcsec: 0.707,
    rmsDecArcsec: 0.245,
    rmsTotalArcsec: 0.748,
    guidedSeconds: 150,
    samples: 6,
    dithers: 2,
    starLost: 0,
    settleTimeouts: 1,
    autofocusRuns: 2,
    autofocusSucceeded: 1,
    meridianFlips: 1,
    guideScaleArcsecPerPx: null,
  });
});

test("the guiding series: slices of 2 minutes computed from the samples", () => {
  assert.deepEqual(guidingSeries(nightReport()), [
    {
      start: "2026-10-07T21:10:00.000Z",
      end: "2026-10-07T21:12:00.000Z",
      rmsRa: 0.5,
      rmsDec: 0.3,
      rmsTotal: 0.583,
      samples: 4,
    },
    {
      start: "2026-10-07T21:12:00.000Z",
      end: "2026-10-07T21:12:30.000Z",
      rmsRa: 1,
      rmsDec: 0,
      rmsTotal: 1,
      samples: 2,
    },
  ]);
});

test("guiding from the import's slices (no samples): weighted by their samples, the slices kept as they were", () => {
  const report = importedReport();
  assert.deepEqual(guidingSummary(report), {
    rmsRaArcsec: 0.687,
    rmsDecArcsec: 0.363,
    rmsTotalArcsec: 0.777,
    guidedSeconds: 240,
    samples: 100,
    dithers: 2,
    starLost: 0,
    settleTimeouts: 1,
    autofocusRuns: 2,
    autofocusSucceeded: 1,
    meridianFlips: 1,
    guideScaleArcsecPerPx: null,
  });
  assert.deepEqual(
    guidingSeries(report).map((slice) => [slice.rmsTotal, slice.samples]),
    [
      [0.72, 60],
      [0.85, 40],
    ],
  );
});

test("a night with nothing to summarize: null summaries, an empty series", () => {
  const empty = nightReport({
    quality: [],
    guiding: [],
    timeline: { startedAt: null, endedAt: null, events: [] },
  });
  assert.equal(qualitySummary(empty), null);
  assert.equal(guidingSummary(empty), null);
  assert.deepEqual(guidingSeries(empty), []);
  // Events alone (a night with NINA's log but no guide log): counted, no RMS.
  const eventsOnly = nightReport({ guiding: [] });
  const summary = guidingSummary(eventsOnly);
  assert.equal(summary.rmsTotalArcsec, null);
  assert.equal(summary.guidedSeconds, 0);
  assert.equal(summary.dithers, 2);
});

// ——— w61: the report v3, the trace, the frames, the nights together ———

import {
  dithersOf,
  guidingTraceOf,
  nightsCumulative,
  posesSummary,
  zoneOf,
} from "../dist/sessions/night-summary.js";
import { nightReportV3 } from "./fixtures/night/report-v3.mjs";

test("a dither PHD2 and the ASIAIR both logged counts once, also in a stored report v2", () => {
  const report = nightReport();
  const phd2 = report.timeline.events.filter((e) => e.type === "dither");
  // The ASIAIR logged each dither four seconds after PHD2, and one alone.
  const asiair = phd2.map((e) => ({
    ...e,
    source: "asiair",
    timestampUtc: new Date(Date.parse(e.timestampUtc) + 4000).toISOString(),
  }));
  const lone = {
    ...asiair[0],
    timestampUtc: new Date(
      Date.parse(asiair[0].timestampUtc) + 1_800_000,
    ).toISOString(),
  };
  report.timeline.events.push(...asiair, lone);
  assert.equal(dithersOf(report.timeline.events).length, 3);
  assert.equal(guidingSummary(report).dithers, 3);
});

test("the report v3: its own RMS, its trace as sent, the guide camera's scale", () => {
  const report = nightReportV3();
  const summary = guidingSummary(report);
  assert.equal(summary.rmsRaArcsec, 0.6);
  assert.equal(summary.rmsDecArcsec, 0.8);
  assert.equal(summary.rmsTotalArcsec, 1);
  assert.equal(summary.guideScaleArcsecPerPx, 6.88);
  const trace = guidingTraceOf(report);
  assert.equal(trace.points.length, 4);
  assert.equal(trace.points[0].raPulseMs, 120);
  assert.equal(trace.points[1].out, 3, "the settle stays a settle");
  assert.deepEqual(
    trace.markers.map((m) => m.type),
    ["dither", "settle"],
  );
});

test("a report v2's raw samples become a trace of 10 s without the corrections' direction", () => {
  const trace = guidingTraceOf(nightReport());
  assert.ok(trace.points.length > 0);
  assert.ok(
    trace.points.every((p, i, all) => i === 0 || p.t >= all[i - 1].t + 10),
  );
  assert.ok(
    trace.points.every((p) => p.raPulseMs === null && p.decPulseMs === null),
  );
  assert.equal(trace.scaleArcsecPerPx, null);
  assert.ok(trace.markers.some((m) => m.type === "dither"));
  assert.equal(trace.samples, nightReport().guiding.length);
  // An import has no sample: no trace.
  assert.equal(guidingTraceOf(importedReport()), null);
});

test("the frames of a night: kept, left out by reason and by filter, with their time", () => {
  const poses = posesSummary(nightReportV3());
  assert.equal(poses.total, 7);
  assert.equal(poses.rejected, 2);
  assert.equal(poses.kept, 5);
  assert.equal(poses.rejectedKnown, true);
  assert.deepEqual(poses.byReason, { unregistered: 1, clouds: 1 });
  const ha = poses.byFilter.find((f) => f.filter === "Ha");
  assert.deepEqual(
    [ha.total, ha.kept, ha.rejected, ha.keptSeconds],
    [3, 2, 1, 360],
  );
  // A report v2 never said which frames were left out: all kept, said so.
  const v2 = posesSummary(nightReport());
  assert.equal(v2.rejected, 0);
  assert.equal(v2.rejectedKnown, false);
});

test("the nights of a plan together: RMS weighted by the guided time, frames summed", () => {
  const cumulative = nightsCumulative([
    {
      guiding: {
        rmsRaArcsec: 0.5,
        rmsDecArcsec: 0.4,
        guidedSeconds: 3600,
        dithers: 10,
      },
      poses: {
        total: 10,
        kept: 9,
        rejected: 1,
        totalSeconds: 1800,
        keptSeconds: 1620,
      },
    },
    {
      guiding: {
        rmsRaArcsec: 1,
        rmsDecArcsec: 0.8,
        guidedSeconds: 10800,
        dithers: 30,
      },
      poses: {
        total: 30,
        kept: 30,
        rejected: 0,
        totalSeconds: 5400,
        keptSeconds: 5400,
      },
    },
    // A night without guiding counts in the nights only.
    { guiding: null, poses: null },
  ]);
  assert.equal(cumulative.nights, 3);
  assert.equal(cumulative.guidedNights, 2);
  // √((3600·0.25 + 10800·1) / 14400) = 0.901
  assert.equal(cumulative.rmsRaArcsec, 0.901);
  assert.equal(cumulative.rmsDecArcsec, 0.721);
  assert.equal(cumulative.rmsTotalArcsec, 1.154);
  assert.equal(cumulative.guidedSeconds, 14400);
  assert.equal(cumulative.dithers, 40);
  assert.deepEqual(cumulative.poses, {
    total: 40,
    kept: 39,
    rejected: 1,
    totalSeconds: 7200,
    keptSeconds: 7020,
  });
});

test("the place's zone and its offset at the night's start (summer, winter, half hours, none)", () => {
  assert.deepEqual(zoneOf("Europe/Paris", "2026-08-10T20:00:00Z"), {
    timeZone: "Europe/Paris",
    utcOffsetMinutes: 120,
  });
  assert.equal(
    zoneOf("Europe/Paris", "2026-12-10T20:00:00Z").utcOffsetMinutes,
    60,
  );
  assert.equal(
    zoneOf("Asia/Kolkata", "2026-08-10T20:00:00Z").utcOffsetMinutes,
    330,
  );
  assert.equal(zoneOf("UTC", "2026-08-10T20:00:00Z").utcOffsetMinutes, 0);
  assert.deepEqual(zoneOf(null, "2026-08-10T20:00:00Z"), {
    timeZone: null,
    utcOffsetMinutes: null,
  });
  assert.deepEqual(zoneOf("Not/AZone", "2026-08-10T20:00:00Z"), {
    timeZone: null,
    utcOffsetMinutes: null,
  });
});
