// `GET /v1/projects/{projectId}/analyses` (w61): the nights of a
// multi-night plan, night by night and together, from each night's own read
// — and the galleries' trace, which reads a report v3's points as it read a
// report v2's raw samples.
import assert from "node:assert/strict";
import test from "node:test";
import { projectAnalysesBody } from "../dist/api/project-analyses.js";
import { galleryQualityCharts } from "../dist/captures/gallery-nights.js";
import {
  guidingSummary,
  posesSummary,
  qualitySummary,
} from "../dist/sessions/night-summary.js";
import { nightReport } from "./fixtures/night/report-v2.mjs";
import { nightReportV3 } from "./fixtures/night/report-v3.mjs";

const read = (report, startedAt, zone) => ({
  night: { startedAt: { value: startedAt, source: "night" } },
  qualitySummary: report ? qualitySummary(report) : null,
  guidingSummary: report ? guidingSummary(report) : null,
  posesSummary: report ? posesSummary(report) : null,
  zone,
});

test("the nights of a plan: each night's summaries, its zone, and the nights together", async () => {
  const paris = { timeZone: "Europe/Paris", utcOffsetMinutes: 120 };
  const reads = {
    a: read(nightReport(), "2026-08-07T20:30:00Z", paris),
    b: read(nightReportV3(), "2026-08-10T20:35:00Z", paris),
    c: read(null, "2026-08-12T21:18:00Z", paris),
  };
  const body = await projectAnalysesBody({
    tenantId: "space",
    projectId: "plan-1",
    projectNights: async () => ({
      nights: [
        { sessionId: "a", eveningDate: "2026-08-07" },
        { sessionId: "b", eveningDate: "2026-08-10" },
        { sessionId: "c", eveningDate: "2026-08-12" },
        // A plan of one night not run yet has no session: not listed.
        { sessionId: null, eveningDate: "2026-08-20" },
        { sessionId: "gone", eveningDate: "2026-08-21" },
      ],
    }),
    readNight: async ({ sessionId }) => {
      if (!(sessionId in reads)) throw new Error("session_not_found");
      return reads[sessionId];
    },
  });
  assert.equal(body.projectId, "plan-1");
  assert.deepEqual(
    body.nights.map((n) => [n.sessionId, n.analysed]),
    [
      ["a", true],
      ["b", true],
      ["c", false],
      ["gone", false],
    ],
  );
  assert.deepEqual(body.nights[1].zone, paris);
  assert.equal(body.nights[1].startedAt, "2026-08-10T20:35:00Z");
  assert.equal(body.nights[1].posesSummary.rejected, 2);
  assert.equal(body.cumulative.nights, 2, "the analysed nights");
  assert.equal(body.cumulative.guidedNights, 2);
  assert.equal(body.cumulative.poses.total, 14);
  assert.equal(body.cumulative.poses.rejected, 2);
  // Weighted by the guided time of each night.
  const [a, b] = [reads.a.guidingSummary, reads.b.guidingSummary];
  assert.equal(b.guidedSeconds, 40, "the v3's own guided time");
  const ra = Math.sqrt(
    (a.guidedSeconds * a.rmsRaArcsec ** 2 +
      b.guidedSeconds * b.rmsRaArcsec ** 2) /
      (a.guidedSeconds + b.guidedSeconds),
  );
  assert.equal(body.cumulative.rmsRaArcsec, Math.round(ra * 1000) / 1000);
  assert.equal(body.cumulative.guidedSeconds, a.guidedSeconds + 40);
});

test("the galleries' guiding trace reads a report v3's points", () => {
  const charts = galleryQualityCharts([nightReportV3()]);
  const night = charts.sessionTelemetry[0];
  assert.ok(night.guideSeries.length > 0, "the trace of the v3 is drawn");
  assert.equal(night.summary.rmsTotalArcsec, 1);
});
