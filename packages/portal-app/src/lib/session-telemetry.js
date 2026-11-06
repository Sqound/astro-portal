function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 2) {
  const number = finite(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function rms(values) {
  const numbers = values.map(finite).filter((value) => value !== null);
  if (!numbers.length) return null;
  return Math.sqrt(
    numbers.reduce((sum, value) => sum + value ** 2, 0) / numbers.length,
  );
}

function mean(values) {
  const numbers = values.map(finite).filter((value) => value !== null);
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function localDate(date, seconds, utcOffset) {
  const base = Date.parse(`${date.replace(" ", "T")}${utcOffset}`);
  return Number.isFinite(base)
    ? new Date(base + seconds * 1000).toISOString()
    : null;
}

function median(values) {
  const numbers = values
    .map(finite)
    .filter((value) => value !== null)
    .sort((a, b) => a - b);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2
    ? numbers[middle]
    : (numbers[middle - 1] + numbers[middle]) / 2;
}

/**
 * Reads a PHD2 guide log without retaining source file names or private paths.
 * Distances are converted from guide-camera pixels using the scale declared in
 * the log itself. The returned series is deliberately bucketed for the portal.
 */
export function parsePHD2GuideLog(
  source,
  { maxPoints = 60, utcOffset = "+00:00", fromUtc = null, toUtc = null } = {},
) {
  const lines = String(source || "").split(/\r?\n/);
  const scale = finite(
    lines
      .find((line) => line.startsWith("Pixel scale = "))
      ?.match(/Pixel scale = ([0-9.]+) arc-sec\/px/)?.[1],
  );
  const rows = [];
  let guidingStartedAt = null;
  const hasSettlingState = lines.some((line) =>
    line.startsWith("INFO: SETTLING STATE CHANGE"),
  );
  let isSettling = false;
  let isSettled = !hasSettlingState;
  for (const line of lines) {
    if (line.startsWith("Guiding Begins at ")) {
      guidingStartedAt = line.replace("Guiding Begins at ", "").trim();
      isSettling = false;
      isSettled = !hasSettlingState;
      continue;
    }
    if (line === "INFO: SETTLING STATE CHANGE, Settling started") {
      isSettling = true;
      isSettled = false;
      continue;
    }
    if (line === "INFO: SETTLING STATE CHANGE, Settling complete") {
      isSettling = false;
      isSettled = true;
      continue;
    }
    if (!/^\d+,/.test(line)) continue;
    if (isSettling || !isSettled) continue;
    const values = line.split(",");
    if (values.length < 18 || values[17].trim() !== "0") continue;
    const seconds = finite(values[1]);
    const raPixels = finite(values[5]);
    const decPixels = finite(values[6]);
    const dateUtc =
      guidingStartedAt && seconds !== null
        ? localDate(guidingStartedAt, seconds, utcOffset)
        : null;
    if (seconds === null || raPixels === null || decPixels === null || !dateUtc)
      continue;
    if ((fromUtc && dateUtc < fromUtc) || (toUtc && dateUtc > toUtc)) continue;
    rows.push({ seconds, dateUtc, raPixels, decPixels });
  }
  if (!rows.length || scale === null) return null;

  const bucketSize = Math.max(1, Math.ceil(rows.length / maxPoints));
  const series = [];
  for (let start = 0; start < rows.length; start += bucketSize) {
    const points = rows.slice(start, start + bucketSize);
    const raPixels = rms(points.map((point) => point.raPixels));
    const decPixels = rms(points.map((point) => point.decPixels));
    const raOffsetPixels = mean(points.map((point) => point.raPixels));
    const decOffsetPixels = mean(points.map((point) => point.decPixels));
    series.push({
      fromUtc: points[0].dateUtc,
      toUtc: points.at(-1).dateUtc,
      dateUtc: points[Math.floor(points.length / 2)].dateUtc,
      raArcsec: round(raOffsetPixels * scale),
      decArcsec: round(decOffsetPixels * scale),
      rmsRaArcsec: round(raPixels * scale),
      rmsDecArcsec: round(decPixels * scale),
      rmsTotalArcsec: round(Math.hypot(raPixels, decPixels) * scale),
      sampleCount: points.length,
    });
  }
  const raPixels = rms(rows.map((point) => point.raPixels));
  const decPixels = rms(rows.map((point) => point.decPixels));
  return {
    startUtc: rows[0].dateUtc,
    endUtc: rows.at(-1).dateUtc,
    guideScaleArcsecPerPixel: round(scale, 3),
    summary: {
      rmsRaArcsec: round(raPixels * scale),
      rmsDecArcsec: round(decPixels * scale),
      rmsTotalArcsec: round(Math.hypot(raPixels, decPixels) * scale),
      sampleCount: rows.length,
    },
    guideSeries: series,
  };
}

function parseAutorunDate(line, utcOffset) {
  const match = String(line).match(
    /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2}:\d{2})/,
  );
  if (!match) return null;
  return new Date(
    `${match[1]}-${match[2]}-${match[3]}T${match[4]}${utcOffset}`,
  ).toISOString();
}

/** Extracts only user-facing observing events from an ASIAIR Autorun log. */
export function parseAsiairAutorunLog(source, { utcOffset = "+00:00" } = {}) {
  const events = [];
  let ditherCount = 0;
  let settleCount = 0;
  let settleTimeoutCount = 0;
  let autofocusCount = 0;
  let autofocusSuccessCount = 0;
  let meridianFlipCount = 0;
  for (const line of String(source || "").split(/\r?\n/)) {
    const dateUtc = parseAutorunDate(line, utcOffset);
    if (!dateUtc) continue;
    if (/\[Guide\] Dither(?:\s|$)/.test(line) && !/Dither Settle/.test(line)) {
      ditherCount += 1;
      events.push({ dateUtc, type: "dither" });
    }
    if (/Dither Settle/.test(line)) {
      settleCount += 1;
      events.push({ dateUtc, type: "settle" });
    }
    if (/settle timeout/i.test(line)) {
      settleTimeoutCount += 1;
      events.push({ dateUtc, type: "settle-timeout" });
    }
    const autofocus = line.match(
      /\[AutoFocus\|Begin\].*?temperature\s+(-?[0-9.]+)℃/i,
    );
    if (autofocus) {
      autofocusCount += 1;
      events.push({
        dateUtc,
        type: "autofocus",
        temperatureC: round(autofocus[1], 1),
      });
    }
    if (/\[AutoFocus\|End\].*succeeded/i.test(line)) {
      autofocusSuccessCount += 1;
      events.push({ dateUtc, type: "autofocus-success" });
    }
    if (/\[Meridian Flip\|End\].*succeeded/i.test(line)) {
      meridianFlipCount += 1;
      events.push({ dateUtc, type: "meridian-flip" });
    }
  }
  return {
    events,
    summary: {
      ditherCount,
      settleCount,
      settleTimeoutCount,
      autofocusCount,
      autofocusSuccessCount,
      meridianFlipCount,
    },
  };
}

function finiteSeries(series) {
  return (Array.isArray(series) ? series : []).filter(
    (point) =>
      Number.isFinite(Date.parse(point?.dateUtc)) &&
      Number.isFinite(Number(point?.rmsTotalArcsec)),
  );
}

/** Removes untrusted/private details before a telemetry session reaches the UI. */
export function normalizeSessionTelemetry(value) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.sessions))
    return [];
  return value.sessions
    .map((session) => {
      const guideSeries = finiteSeries(session.guideSeries)
        .slice(0, 60)
        .map((point) => ({
          fromUtc: point.fromUtc,
          toUtc: point.toUtc,
          dateUtc: point.dateUtc,
          raArcsec: round(point.raArcsec),
          decArcsec: round(point.decArcsec),
          rmsRaArcsec: round(point.rmsRaArcsec),
          rmsDecArcsec: round(point.rmsDecArcsec),
          rmsTotalArcsec: round(point.rmsTotalArcsec),
          sampleCount: Math.max(1, Math.round(Number(point.sampleCount) || 1)),
        }));
      if (!guideSeries.length) return null;
      const summary = session.summary || {};
      return {
        id: String(session.id || "")
          .replace(/[^A-Za-z0-9._-]/g, "")
          .slice(0, 96),
        startUtc: String(session.startUtc || guideSeries[0].fromUtc),
        endUtc: String(session.endUtc || guideSeries.at(-1).toUtc),
        timeZone: session.timeZone === "Asia/Tokyo" ? "Asia/Tokyo" : "UTC",
        guideScaleArcsecPerPixel: round(session.guideScaleArcsecPerPixel, 3),
        summary: {
          rmsRaArcsec: round(summary.rmsRaArcsec),
          rmsDecArcsec: round(summary.rmsDecArcsec),
          rmsTotalArcsec: round(summary.rmsTotalArcsec),
          sampleCount: Math.max(
            0,
            Math.round(Number(summary.sampleCount) || 0),
          ),
          ditherCount: Math.max(
            0,
            Math.round(Number(summary.ditherCount) || 0),
          ),
          settleCount: Math.max(
            0,
            Math.round(Number(summary.settleCount) || 0),
          ),
          settleTimeoutCount: Math.max(
            0,
            Math.round(Number(summary.settleTimeoutCount) || 0),
          ),
          autofocusCount: Math.max(
            0,
            Math.round(Number(summary.autofocusCount) || 0),
          ),
          autofocusSuccessCount: Math.max(
            0,
            Math.round(Number(summary.autofocusSuccessCount) || 0),
          ),
          meridianFlipCount: Math.max(
            0,
            Math.round(Number(summary.meridianFlipCount) || 0),
          ),
        },
        guideSeries,
        events: (Array.isArray(session.events) ? session.events : [])
          .filter((event) => Number.isFinite(Date.parse(event?.dateUtc)))
          .filter((event) =>
            [
              "dither",
              "settle",
              "settle-timeout",
              "autofocus",
              "autofocus-success",
              "meridian-flip",
            ].includes(event?.type),
          )
          .slice(0, 200)
          .map((event) => ({
            dateUtc: event.dateUtc,
            type: event.type,
            ...(finite(event.temperatureC) !== null
              ? { temperatureC: round(event.temperatureC, 1) }
              : {}),
          })),
      };
    })
    .filter(
      (session) => session?.id && Number.isFinite(Date.parse(session.startUtc)),
    )
    .sort((left, right) => left.startUtc.localeCompare(right.startUtc));
}

export function mergeSessionTelemetry(...collections) {
  const sessions = collections.flat(2).filter(Boolean);
  const unique = new Map(sessions.map((session) => [session.id, session]));
  return [...unique.values()].sort((left, right) =>
    left.startUtc.localeCompare(right.startUtc),
  );
}
