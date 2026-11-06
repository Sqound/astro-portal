import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { schemaErrors } from "./schema-assert.mjs";

// session-analysis.schema.json (report v2) has no single root shape
// -- $defs.report, $defs.resource and $defs.createResponse are each validated on their own, the same
// multi-shape layout api/session.schema.json already uses. assertValid/assertInvalid
// (schema-assert.mjs) default their internal $ref root to the schema object passed in, which would
// break a same-document "#/$defs/..." ref if that object were a bare $defs entry rather than the whole
// file -- so this file resolves refs against the WHOLE document explicitly instead of importing those
// two helpers.

const document = JSON.parse(
  await readFile(
    new URL("../schemas/api/session-analysis.schema.json", import.meta.url),
    "utf8",
  ),
);

function assertValidDef(defName, value) {
  const errors = schemaErrors({ $ref: `#/$defs/${defName}` }, value, document);
  if (errors.length)
    throw new Error(`Expected valid, got:\n${errors.join("\n")}`);
}

function assertInvalidDef(defName, value) {
  const errors = schemaErrors({ $ref: `#/$defs/${defName}` }, value, document);
  if (errors.length === 0)
    throw new Error("Expected the sample to be rejected, but it validated.");
}

function validReport() {
  return {
    reportVersion: 2,
    producer: "astro-sync",
    generatedAtUtc: "2026-10-08T09:12:00Z",
    source: {
      phd2FilesParsed: 1,
      asiairFilesParsed: 0,
      fitsFilesParsed: 1,
      ninaFilesParsed: 1,
    },
    pixelScaleArcsec: 3.1,
    timeline: {
      startedAt: {
        timestampUtc: "2026-10-07T21:10:00.000Z",
        evidence: "PHD2 guiding session start in PHD2_GuideLog.txt",
      },
      endedAt: {
        timestampUtc: "2026-10-08T04:30:00.000Z",
        evidence: "PHD2 guiding session end in PHD2_GuideLog.txt",
      },
      events: [
        {
          type: "autofocus-result",
          timestampUtc: "2026-10-07T23:00:00.000Z",
          source: "nina",
          data: { succeeded: true },
        },
      ],
    },
    acquisitionSteps: [
      {
        key: "ngc7000-ha-180",
        targetHint: "NGC 7000",
        filter: "Ha",
        frameCount: 40,
        exposureSeconds: 180,
        gain: 100,
        binning: "1x1",
        sensorTempC: -10,
      },
    ],
    quality: [
      {
        timestampUtc: "2026-10-07T21:20:00.000Z",
        stepKey: "ngc7000-ha-180",
        filter: "Ha",
        exposureSeconds: 180,
        gain: 100,
        rmsTotalArcsec: 0.8,
        rmsRaArcsec: 0.5,
        rmsDecArcsec: 0.6,
        guidingSampleCount: 120,
        skyBackgroundAdu: 512.4,
        skyBackgroundNoiseAdu: 11.2,
        starCount: 850,
        fwhmPixels: 2.6,
        eccentricity: 0.42,
        sourcePath: "lights/frame-0001.fits",
      },
    ],
    guiding: [
      {
        timestampUtc: "2026-10-07T21:20:01.000Z",
        source: "phd2",
        frame: 1,
        elapsedSeconds: 1.2,
        raOffsetArcsec: -0.04,
        decOffsetArcsec: 0.6,
        raDurationMs: 0,
        decDurationMs: 0,
        starMass: 30000,
        snr: 12.5,
        errorCode: 0,
      },
    ],
    guidingSeries: [
      {
        start: "2026-10-07T21:20:00.000Z",
        end: "2026-10-07T21:22:00.000Z",
        rmsRa: 0.5,
        rmsDec: 0.6,
        rmsTotal: 0.78,
        samples: 60,
      },
    ],
  };
}

function resource(report = validReport()) {
  return {
    id: "6f5ad3b2-4c1d-4a8e-9b7f-2d3c4e5f6a7b",
    sessionId: "1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b",
    reportVersion: 2,
    createdAt: "2026-10-08T09:12:00Z",
    originDeviceId: null,
    deviceName: "Astro Sync",
    report,
  };
}

test("report v2 accepts a fully populated report (steps, step keys, the two carried measures, the scale, the series, NINA)", () => {
  assertValidDef("report", validReport());
});

test("report v2 accepts the import's report: no samples, no paths, no scale", () => {
  const report = validReport();
  delete report.guiding;
  delete report.pixelScaleArcsec;
  delete report.quality[0].sourcePath;
  report.producer = "import";
  report.source = {
    phd2FilesParsed: 0,
    asiairFilesParsed: 0,
    fitsFilesParsed: 0,
  };
  assertValidDef("report", report);
});

test("report v2 refuses the report v1 and its acquisitionFamilies", () => {
  assertInvalidDef("report", { ...validReport(), reportVersion: 1 });
  const families = validReport();
  delete families.acquisitionSteps;
  families.acquisitionFamilies = [];
  assertInvalidDef("report", families);
});

test("report v2 refuses a report without producer, a step without frames or with a filter beyond 40 characters", () => {
  const anonymous = validReport();
  delete anonymous.producer;
  assertInvalidDef("report", anonymous);
  const noFrames = validReport();
  noFrames.acquisitionSteps[0].frameCount = 0;
  assertInvalidDef("report", noFrames);
  const longFilter = validReport();
  longFilter.acquisitionSteps[0].filter = "x".repeat(41);
  assertInvalidDef("report", longFilter);
});

test("report v2 refuses a quality row without its stepKey, and a score-like field anywhere (the evidence rule)", () => {
  const noKey = validReport();
  delete noKey.quality[0].stepKey;
  assertInvalidDef("report", noKey);
  assertInvalidDef("report", { ...validReport(), qualityScore: 87 });
  const scoredRow = validReport();
  scoredRow.guiding[0].score = 0.9;
  assertInvalidDef("report", scoredRow);
  const scoredSlice = validReport();
  scoredSlice.guidingSeries[0].grade = "A";
  assertInvalidDef("report", scoredSlice);
});

test("report v2 refuses a timeline boundary with no evidence", () => {
  const report = validReport();
  delete report.timeline.startedAt.evidence;
  assertInvalidDef("report", report);
});

test("resource: the night's one analysis with its device, no analysisVersion", () => {
  assertValidDef("resource", resource());
  assertInvalidDef("resource", { ...resource(), analysisVersion: 1 });
  assertInvalidDef("resource", { ...resource(), reportVersion: 1 });
});

test("createResponse: the analysis, whether it replaced one, the steps proposed and the corrected ones kept", () => {
  assertValidDef("createResponse", {
    analysis: resource(),
    replaced: true,
    steps: { proposed: 3, keptEdited: 1 },
  });
  assertInvalidDef("createResponse", { analysis: resource(), replaced: true });
});

test("assertInvalidDef itself fails loudly when a sample unexpectedly validates", () => {
  assert.throws(() => assertInvalidDef("report", validReport()));
});

// ——— report v3 (w61) ———

function validReportV3() {
  const { guiding: _raw, ...rest } = validReport();
  return {
    ...rest,
    reportVersion: 3,
    quality: rest.quality.map((row) => ({
      ...row,
      rejected: true,
      rejectReason: "unregistered",
    })),
    guidingTrace: {
      intervalSeconds: 10,
      startUtc: "2026-10-07T21:20:00.000Z",
      scaleArcsecPerPx: 6.88,
      guidedSeconds: 20,
      samples: 6,
      rms: { raArcsec: 0.5, decArcsec: 0.6, totalArcsec: 0.78, samples: 3 },
      points: [
        {
          t: 0,
          n: 3,
          out: 0,
          ra: 0.12,
          dec: -0.3,
          raPeak: 0.4,
          decPeak: -0.6,
          raPulseMs: 120,
          decPulseMs: -40,
        },
        {
          t: 10,
          n: 3,
          out: 3,
          ra: 4.1,
          dec: -2.2,
          raPeak: 6,
          decPeak: -3,
          raPulseMs: null,
          decPulseMs: null,
        },
      ],
      markers: [
        { type: "dither", at: "2026-10-07T21:20:10.000Z", end: null },
        {
          type: "settle",
          at: "2026-10-07T21:20:10.000Z",
          end: "2026-10-07T21:20:20.000Z",
        },
      ],
    },
    logClock: {
      phd2: "+02:00",
      asiair: "+02:00",
      nina: null,
      detected: true,
      phd2From: "asiair",
    },
  };
}

test("report v3 accepts the trace of 10 s, the clocks of the logs and the frames the stacking left out", () => {
  assertValidDef("report", validReportV3());
  // The v2 already stored stays valid.
  assertValidDef("report", validReport());
});

test("report v3 refuses a denser trace, an unknown marker or reason, a stray field", () => {
  const dense = validReportV3();
  dense.guidingTrace.intervalSeconds = 1;
  assertInvalidDef("report", dense);
  const marker = validReportV3();
  marker.guidingTrace.markers[0].type = "spike";
  assertInvalidDef("report", marker);
  const reason = validReportV3();
  reason.quality[0].rejectReason = "bad";
  assertInvalidDef("report", reason);
  const stray = validReportV3();
  stray.guidingTrace.points[0].score = 1;
  assertInvalidDef("report", stray);
  const clock = validReportV3();
  clock.logClock.phd2 = "2h";
  assertInvalidDef("report", clock);
  assertInvalidDef("report", { ...validReportV3(), reportVersion: 4 });
});
