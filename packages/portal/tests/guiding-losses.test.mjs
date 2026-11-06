import assert from "node:assert/strict";
import test from "node:test";

import { guidingLossesFromReport } from "../dist/guiding-losses.js";

// The guiding losses of a night, read from the session analysis Astro
// Sync uploads (session-analysis.schema.json's `report`).

const at = (hm) => `2026-10-10T${hm}.000Z`;
const sample = (time, errorCode = 0) => ({
  timestampUtc: at(time),
  source: "phd2",
  frame: null,
  elapsedSeconds: null,
  raOffsetArcsec: 0.2,
  decOffsetArcsec: 0.2,
  raDurationMs: 0,
  decDurationMs: 0,
  starMass: 30000,
  snr: errorCode ? 2 : 12,
  errorCode,
});
const starLost = (time) => ({
  type: "star-lost",
  timestampUtc: at(time),
  source: "phd2",
  data: { statusText: "SNR too low", precedingFrame: 5 },
});
const report = ({ events = [], guiding = [], endedAt = null } = {}) => ({
  reportVersion: 1,
  generatedAtUtc: at("23:59:00"),
  source: { phd2FilesParsed: 1, asiairFilesParsed: 0, fitsFilesParsed: 0 },
  timeline: {
    startedAt: null,
    endedAt: endedAt
      ? { timestampUtc: at(endedAt), evidence: "PHD2 guiding session end" }
      : null,
    events,
  },
  acquisitionFamilies: [],
  quality: [],
  guiding,
});

test("a loss runs from the star lost to the first sample guiding again", () => {
  assert.deepEqual(
    guidingLossesFromReport(
      report({
        events: [starLost("22:05:00")],
        guiding: [
          sample("22:04:58"),
          sample("22:06:00", 4),
          sample("22:15:00", 4),
          sample("22:25:00"),
          sample("22:25:02"),
        ],
      }),
    ),
    [{ start: at("22:05:00"), end: at("22:25:00") }],
  );
});

test("never found again: the loss ends with the guiding session, else the last sample", () => {
  const guiding = [sample("22:00:00"), sample("22:10:00", 4)];
  assert.deepEqual(
    guidingLossesFromReport(
      report({ events: [starLost("22:05:00")], guiding, endedAt: "22:30:00" }),
    ),
    [{ start: at("22:05:00"), end: at("22:30:00") }],
  );
  assert.deepEqual(
    guidingLossesFromReport(
      report({ events: [starLost("22:05:00")], guiding }),
    ),
    [{ start: at("22:05:00"), end: at("22:10:00") }],
  );
});

test("losses that overlap merge; separate ones stay apart, in time order", () => {
  assert.deepEqual(
    guidingLossesFromReport(
      report({
        events: [
          starLost("23:40:00"),
          starLost("22:05:00"),
          starLost("22:07:00"),
        ],
        guiding: [sample("22:20:00"), sample("23:45:00")],
      }),
    ),
    [
      { start: at("22:05:00"), end: at("22:20:00") },
      { start: at("23:40:00"), end: at("23:45:00") },
    ],
  );
});

test("other timeline events are not guiding losses", () => {
  assert.deepEqual(
    guidingLossesFromReport(
      report({
        events: [
          {
            type: "dither",
            timestampUtc: at("22:00:00"),
            source: "asiair",
            data: {},
          },
          {
            type: "meridian-flip",
            timestampUtc: at("23:00:00"),
            source: "asiair",
            data: {},
          },
        ],
        guiding: [sample("22:30:00")],
      }),
    ),
    [],
  );
});

test("a loss with nothing after it to end it is dropped", () => {
  assert.deepEqual(
    guidingLossesFromReport(report({ events: [starLost("22:05:00")] })),
    [],
  );
  assert.deepEqual(guidingLossesFromReport(null), []);
  assert.deepEqual(guidingLossesFromReport({}), []);
});
