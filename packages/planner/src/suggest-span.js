// The part of a night a suggestion is made in. A night that is running is
// suggested from now, never from its dusk: what is already past is not
// proposed as if it were still to come. Both are pure; the span is `{ start, end }` in ISO-8601, the shape
// `autoFillNight` reads as `span`.

const instant = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * `span` (or, without one, the night's end) narrowed to begin at `from` (epoch
 * milliseconds): the span's own start when it is later, its end (the night's)
 * kept. `span` as it was when the night cannot be read.
 */
export function suggestionSpanFrom(span, night, from) {
  const spanStart = instant(span?.start);
  const end = instant(span?.end) ?? instant(night?.end);
  if (end === null) return span ?? null;
  const floor = instant(from);
  if (floor === null) return span ?? null;
  const start = spanStart !== null && spanStart > floor ? spanStart : floor;
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  };
}

/**
 * The span a suggestion of a night that may be running is made in: from `now`
 * to the night's end while the night runs, `null` (the whole night) before it
 * starts, and also once it is over, where nothing is left to come. `night` is
 * the dark night, `{ start, end }`.
 */
export function suggestionSpanFromNow(night, now = Date.now()) {
  const start = instant(night?.start);
  const end = instant(night?.end);
  const at = instant(now);
  if (start === null || end === null || at === null) return null;
  if (!(at > start) || !(at < end)) return null;
  return suggestionSpanFrom(null, night, at);
}

/**
 * `span` as a suggestion of the plan's night should use it at `now`: narrowed
 * to begin at `now` when `night` (the dark night, `{ start, end }`) is running,
 * as it is otherwise (a night to come, or over: the past is not proposed as if
 * it were still to come, nor a future night cut short).
 */
export function suggestionSpanAt(span, night, now = Date.now()) {
  const start = instant(night?.start);
  const end = instant(night?.end);
  const at = instant(now);
  if (start === null || end === null || at === null) return span ?? null;
  if (!(at > start) || !(at < end)) return span ?? null;
  return suggestionSpanFrom(span, night, at);
}
