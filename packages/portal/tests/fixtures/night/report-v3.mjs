// A synthetic report v3 of the same invented night as `report-v2.mjs`: no
// raw samples but the trace of 10 s (corrections with their direction, the
// samples out of the statistics, the markers), the clocks of the logs, one
// dither per dither, and two frames the stacking left out.
import { NIGHT_START, nightReport } from "./report-v2.mjs";

const at = (seconds) =>
  new Date(Date.parse(NIGHT_START) + seconds * 1000).toISOString();

const point = (t, n, out, ra, dec, raPulseMs, decPulseMs) => ({
  t,
  n,
  out,
  ra,
  dec,
  raPeak: ra * 2,
  decPeak: dec * 2,
  raPulseMs,
  decPulseMs,
});

export function nightReportV3(changes = {}) {
  const v2 = nightReport();
  const { guiding: _raw, ...rest } = v2;
  return {
    ...rest,
    reportVersion: 3,
    quality: v2.quality.map((row, index) => ({
      ...row,
      rejected: index === 1 || index === 5,
      rejectReason:
        index === 1 ? "unregistered" : index === 5 ? "clouds" : null,
    })),
    guidingTrace: {
      intervalSeconds: 10,
      startUtc: NIGHT_START,
      scaleArcsecPerPx: 6.88,
      guidedSeconds: 40,
      samples: 12,
      rms: { raArcsec: 0.6, decArcsec: 0.8, totalArcsec: 1, samples: 9 },
      points: [
        point(0, 3, 0, 0.2, -0.1, 120, -40),
        point(10, 3, 3, 4.5, -3.2, 0, 0),
        point(20, 3, 0, -0.3, 0.1, -80, 30),
        point(40, 3, 0, 0.1, 0.2, 60, null),
      ],
      markers: [
        { type: "dither", at: at(10), end: null },
        { type: "settle", at: at(10), end: at(19) },
      ],
    },
    guidingSeries: [
      {
        start: NIGHT_START,
        end: at(120),
        rmsRa: 0.6,
        rmsDec: 0.8,
        rmsTotal: 1,
        samples: 9,
      },
    ],
    logClock: {
      phd2: "+02:00",
      asiair: "+02:00",
      nina: null,
      detected: true,
      phd2From: "asiair",
    },
    ...changes,
  };
}
