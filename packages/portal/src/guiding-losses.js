/**
 * The guiding losses of a night: every stretch from the guide star lost to
 * the guiding found again, read from a session analysis
 * (`session-analysis.schema.json`'s `report`, what Astro Sync derives from
 * the PHD2/ASIAIR logs). Pure; the service runs it on the latest version of
 * a session's analysis and shows the result only to an account with
 * `analysis.logs`, as the `guidingLosses` the night's summary counts.
 *
 * Rules: a loss starts at a `star-lost` event of the timeline and ends at
 * the first guiding sample after it with no error (`errorCode` 0) — the
 * guiding found again; with none, at the end of the guiding session
 * (`timeline.endedAt`), else at the last guiding sample. Losses that touch
 * or overlap are merged; a loss of no duration is dropped. Returns
 * `[{ start, end }]` (ISO 8601 UTC), in time order.
 */
export function guidingLossesFromReport(report) {
  const parse = (value) =>
    typeof value === "string" ? Date.parse(value) : Number.NaN;
  const events = Array.isArray(report?.timeline?.events)
    ? report.timeline.events
    : [];
  const samples = (Array.isArray(report?.guiding) ? report.guiding : [])
    .map((row) => ({ at: parse(row?.timestampUtc), ok: row?.errorCode === 0 }))
    .filter((row) => Number.isFinite(row.at))
    .sort((left, right) => left.at - right.at);
  const endedAt = parse(report?.timeline?.endedAt?.timestampUtc);
  const fallbackEnd = Number.isFinite(endedAt)
    ? endedAt
    : samples.length
      ? samples[samples.length - 1].at
      : Number.NaN;

  const spans = events
    .filter((event) => event?.type === "star-lost")
    .map((event) => parse(event.timestampUtc))
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
    .map((start) => {
      const found = samples.find((sample) => sample.at > start && sample.ok);
      return [start, found ? found.at : fallbackEnd];
    })
    .filter(([start, end]) => Number.isFinite(end) && end > start);

  const merged = [];
  for (const [start, end] of spans) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged.map(([start, end]) => ({
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  }));
}
