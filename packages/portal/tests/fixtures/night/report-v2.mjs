// A synthetic report v2 of one night
// at the Col des Étoiles (invented data: NGC 7000 in Ha and
// OIII, M31 without filter), whose summaries are known by hand — the
// medians of the quality rows, the guiding RMS of two 2-minute slices, and
// the events counted. Used by the summaries, the analysis service and the
// routes of the night.

export const NIGHT_START = "2026-10-07T21:10:00.000Z";

const at = (seconds) =>
  new Date(Date.parse(NIGHT_START) + seconds * 1000).toISOString();

function guidingSample(seconds, ra, dec, frame) {
  return {
    timestampUtc: at(seconds),
    source: "phd2",
    frame,
    elapsedSeconds: seconds,
    raOffsetArcsec: ra,
    decOffsetArcsec: dec,
    raDurationMs: 0,
    decDurationMs: 0,
    starMass: 12000,
    snr: 30,
    errorCode: null,
  };
}

function qualityRow(seconds, stepKey, filter, exposureSeconds, measures) {
  return {
    timestampUtc: at(seconds),
    stepKey,
    filter,
    exposureSeconds,
    gain: 100,
    fwhmPixels: null,
    eccentricity: null,
    skyBackgroundAdu: null,
    ...measures,
  };
}

const event = (seconds, type, data = {}) => ({
  type,
  timestampUtc: at(seconds),
  source: "phd2",
  data,
});

/** The report Astro Sync would send; `changes` override its fields. */
export function nightReport(changes = {}) {
  return {
    reportVersion: 2,
    producer: "astro-sync",
    generatedAtUtc: "2026-10-08T09:12:00.000Z",
    source: {
      phd2FilesParsed: 1,
      asiairFilesParsed: 0,
      fitsFilesParsed: 7,
      ninaFilesParsed: 1,
    },
    pixelScaleArcsec: 3.1,
    timeline: {
      startedAt: {
        timestampUtc: NIGHT_START,
        evidence: "PHD2 guiding session start in the guide log",
      },
      endedAt: {
        timestampUtc: at(4 * 3600),
        evidence: "PHD2 guiding session end in the guide log",
      },
      events: [
        event(300, "dither"),
        event(900, "dither"),
        event(905, "settle-timeout"),
        event(1200, "autofocus"),
        event(1260, "autofocus-result", { succeeded: true }),
        event(2400, "autofocus"),
        event(2460, "autofocus-result", { succeeded: false }),
        event(3600, "meridian-flip"),
      ],
    },
    acquisitionSteps: [
      {
        key: "ngc7000-ha-180",
        targetHint: "NGC 7000",
        filter: "Ha",
        frameCount: 3,
        exposureSeconds: 180,
        gain: 100,
        binning: "1x1",
        sensorTempC: -10,
      },
      {
        key: "ngc7000-oiii-180",
        targetHint: "NGC7000",
        filter: "OIII",
        frameCount: 2,
        exposureSeconds: 180,
        gain: 100,
      },
      {
        key: "m31-120",
        targetHint: "M 31",
        filter: null,
        frameCount: 2,
        exposureSeconds: 120,
        gain: 100,
      },
    ],
    quality: [
      ...[
        [2.4, 0.4, 1000, 10, 800],
        [2.6, 0.42, 1010, 11, 850],
        [2.8, 0.5, 1020, 12, 900],
      ].map(([fwhm, ecc, bg, noise, stars], index) =>
        qualityRow(600 + index * 200, "ngc7000-ha-180", "Ha", 180, {
          fwhmPixels: fwhm,
          eccentricity: ecc,
          skyBackgroundAdu: bg,
          skyBackgroundNoiseAdu: noise,
          starCount: stars,
        }),
      ),
      ...[
        [3.0, 0.5, 900],
        [3.2, 0.6, 910],
      ].map(([fwhm, ecc, bg], index) =>
        qualityRow(1400 + index * 200, "ngc7000-oiii-180", "OIII", 180, {
          fwhmPixels: fwhm,
          eccentricity: ecc,
          skyBackgroundAdu: bg,
        }),
      ),
      qualityRow(3000, "m31-120", null, 120, {
        fwhmPixels: 2.0,
        eccentricity: 0.3,
        skyBackgroundAdu: 1500,
      }),
      // A frame whose header held no measure: counted nowhere.
      qualityRow(3200, "m31-120", null, 120, {}),
    ],
    guiding: [
      guidingSample(0, 0.5, 0.3, 1),
      guidingSample(30, -0.5, -0.3, 2),
      guidingSample(60, 0.5, 0.3, 3),
      guidingSample(90, -0.5, -0.3, 4),
      guidingSample(120, 1, 0, 5),
      guidingSample(150, -1, 0, 6),
    ],
    ...changes,
  };
}

/** The same night as the import of the old portal sends it: no samples, the slices as they were. */
export function importedReport(changes = {}) {
  const { guiding: _guiding, ...report } = nightReport();
  return {
    ...report,
    producer: "import",
    source: { phd2FilesParsed: 0, asiairFilesParsed: 0, fitsFilesParsed: 0 },
    guidingSeries: [
      {
        start: at(0),
        end: at(120),
        rmsRa: 0.6,
        rmsDec: 0.4,
        rmsTotal: 0.72,
        samples: 60,
      },
      {
        start: at(120),
        end: at(240),
        rmsRa: 0.8,
        rmsDec: 0.3,
        rmsTotal: 0.85,
        samples: 40,
      },
    ],
    ...changes,
  };
}
