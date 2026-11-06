/**
 * The one rule for the minutes and the hours of a session: the web and
 * the phone must write the same figures for the same night.
 *
 * - **An instant is cut to its minute, never rounded**: the hour a screen
 *   writes for an event is the hour of the minute it happened in (21:09:50
 *   reads 21:09). Place-local zones are whole minutes, so cutting the UTC
 *   instant and cutting the place's clock give the same minute.
 * - **A duration is a count of those minutes**: the whole minutes between
 *   the two cut instants, so « 21:09 → 21:11 » is always « 2 min » and a
 *   figure can never contradict the hours printed beside it.
 * - **A target counts as « done »** when the night did not give it up and it
 *   was not taken out of the session; the tile says « done », not « targets ».
 *
 * `debrief-summary.js` computes every span of the night on this grid; the
 * `session-figures` fixture pins the figures.
 */

export const MINUTE_MS = 60_000;

const instantMs = (instant) =>
  instant instanceof Date
    ? instant.getTime()
    : typeof instant === "number"
      ? instant
      : typeof instant === "string"
        ? Date.parse(instant)
        : Number.NaN;

/** The minute (since the epoch) an instant falls in, or `null`. */
export function sessionMinuteOf(instant) {
  const ms = instantMs(instant);
  return Number.isFinite(ms) ? Math.floor(ms / MINUTE_MS) : null;
}

/**
 * The whole minutes between two instants on the grid; `null` when one cannot
 * be read, 0 when the end is not after the start.
 */
export function sessionSpanMinutes(start, end) {
  const from = sessionMinuteOf(start);
  const to = sessionMinuteOf(end);
  if (from === null || to === null) return null;
  return Math.max(0, to - from);
}

const gridSpans = (spans) =>
  (Array.isArray(spans) ? spans : [])
    .map((span) => [sessionMinuteOf(span?.[0]), sessionMinuteOf(span?.[1])])
    .filter(([from, to]) => from !== null && to !== null && to > from);

/** Overlapping or touching spans merged, in order. */
function merged(spans) {
  const out = [];
  for (const [from, to] of [...spans].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}

/**
 * What a target counted, on the grid: `minutes` is the sum of its passages
 * (`[[start, end], …]`) with the pauses (`[[start, end], …]`) inside them
 * taken out, `pausedMinutes` the pauses taken out -- « 7 min · pause de 2 min
 * déduite ». Every span is cut to its minutes first.
 */
export function sessionCountedMinutes(passages, pauses) {
  const stops = merged(gridSpans(pauses));
  let total = 0;
  let paused = 0;
  for (const [from, to] of merged(gridSpans(passages))) {
    total += to - from;
    for (const [stopFrom, stopTo] of stops)
      paused += Math.max(0, Math.min(to, stopTo) - Math.max(from, stopFrom));
  }
  return { minutes: Math.max(0, total - paused), pausedMinutes: paused };
}

/**
 * The number written on the « targets done » tile: the targets that are
 * neither given up (`skipped`) nor taken out (`removed`). `entries` are
 * `{ state, outcome }`.
 */
export function sessionTargetsDoneCount(entries) {
  return (Array.isArray(entries) ? entries : []).filter(
    (entry) => entry?.state !== "removed" && entry?.outcome !== "skipped",
  ).length;
}
