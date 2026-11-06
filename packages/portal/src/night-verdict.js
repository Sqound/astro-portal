// The verdict of the night (« Cette nuit », both platforms): one level, the
// score on 100 and the facts of one plain sentence, written once here. The
// words live in the message catalogues; this function only says which
// template and which facts.
//
// The level and the score are the forecast's own (`summarizeAstronomyForecast`:
// excellent ≥ 82, favourable ≥ 64, variable ≥ 42, else poor). The facts, in
// the order of the sentence:
// - `darkness`: the dark window, its length in minutes, its start and end;
// - `moon`: `set` when the Moon stays below the horizon over the whole
//   window, `full` when it is up and lit at 90 % or more, else the night
//   band's phrase (`up-all-night`, `up-until`, `up-from`, `up-between`);
// - `clouds`: `clear` under 10 % on average, `covered` when every hour is at
//   80 % or more, else `mean` (the rounded mean);
// - `window` (a variable night): the longest run of hours at 30 % of clouds
//   or less inside the window, and whether clouds follow it.
// A fact that cannot be read is `null`: the sentence leaves it out.

const hourMs = 60 * 60 * 1000;
const minuteMs = 60 * 1000;
// The four levels, by name (an object, not a list: no table of words).
const levels = { excellent: 82, favourable: 64, variable: 42, poor: 0 };

// Instants as the callers hold them: epoch milliseconds or an ISO string.
function instant(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const iso = (milliseconds) => new Date(milliseconds).toISOString();

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function levelOf(forecast, score) {
  if (Object.hasOwn(levels, forecast?.category ?? "")) return forecast.category;
  return score >= 82
    ? "excellent"
    : score >= 64
      ? "favourable"
      : score >= 42
        ? "variable"
        : "poor";
}

function moonFact(moon, start, end) {
  if (!moon || !Array.isArray(moon.up)) return null;
  const overlapping = moon.up
    .map((span) => ({ start: instant(span?.start), end: instant(span?.end) }))
    .filter(
      (span) =>
        span.start !== null &&
        span.end !== null &&
        span.start < end &&
        span.end > start,
    )
    .sort((left, right) => left.start - right.start);
  if (!overlapping.length) return { kind: "set" };
  const illumination = finiteNumber(moon.illumination);
  if (illumination !== null && illumination >= 90) return { kind: "full" };
  const first = overlapping[0];
  const fromStart = first.start <= start;
  const toEnd = first.end >= end;
  if (fromStart && toEnd) return { kind: "up-all-night" };
  if (fromStart) return { kind: "up-until", at: iso(first.end) };
  if (toEnd) return { kind: "up-from", at: iso(first.start) };
  return { kind: "up-between", start: iso(first.start), end: iso(first.end) };
}

function cloudRows(clouds, start, end) {
  return (Array.isArray(clouds) ? clouds : [])
    .map((row) => ({
      time: instant(row?.time),
      cloud: finiteNumber(row?.cloud),
    }))
    .filter((row) => row.time !== null && row.time >= start && row.time <= end)
    .sort((left, right) => left.time - right.time);
}

function cloudsFact(rows) {
  const values = rows.filter((row) => row.cloud !== null);
  if (!values.length) return null;
  const mean = Math.round(
    values.reduce((sum, row) => sum + row.cloud, 0) / values.length,
  );
  if (mean < 10) return { kind: "clear", mean };
  if (values.every((row) => row.cloud >= 80)) return { kind: "covered", mean };
  return { kind: "mean", mean };
}

// The longest run of consecutive hours at 30 % of clouds or less; an hour
// without a value, above 30 % or more than an hour after the previous one
// ends a run; the first of two equal runs wins.
function clearWindow(rows, end) {
  let best = null;
  let run = null;
  for (const row of rows) {
    const clear = row.cloud !== null && row.cloud <= 30;
    if (clear && run && row.time - run.last <= hourMs) {
      run.last = row.time;
      run.count += 1;
    } else if (clear) {
      run = { first: row.time, last: row.time, count: 1 };
    } else {
      run = null;
    }
    if (run && (!best || run.count > best.count)) best = { ...run };
  }
  if (!best) return null;
  const windowEnd = Math.min(best.last + hourMs, end);
  return {
    start: iso(best.first),
    end: iso(windowEnd),
    cloudsAfter: windowEnd < end,
  };
}

/**
 * The verdict of the night.
 *
 * - `forecast`: `summarizeAstronomyForecast`'s result (`score`, `category`),
 *   or `null` without a forecast;
 * - `night`: the dark window `{ start, end }` (epoch milliseconds or ISO);
 * - `moon`: `{ illumination, up: [{ start, end }] }` — the share of the disc
 *   lit (percent) and the stretches when the Moon is above the horizon;
 * - `clouds`: the hourly rows `[{ time, cloud }]` (`hourlyAstronomyForecast`).
 *
 * Returns `{ level, score, kind, facts }`; without a forecast (or a night)
 * `level` and `score` are `null` and `kind` is `unavailable`. `kind` names
 * the template: `excellent`, `favourable`, `variable-window`, `variable`
 * (no clear run) or `poor`.
 */
export function nightVerdict({
  forecast = null,
  night = null,
  moon = null,
  clouds = [],
} = {}) {
  const score = finiteNumber(forecast?.score);
  const start = instant(night?.start);
  const end = instant(night?.end);
  if (score === null || start === null || end === null || end <= start)
    return { level: null, score: null, kind: "unavailable", facts: null };
  const rounded = Math.max(0, Math.min(100, Math.round(score)));
  const level = levelOf(forecast, rounded);
  const rows = cloudRows(clouds, start, end);
  const window = level === "variable" ? clearWindow(rows, end) : null;
  return {
    level,
    score: rounded,
    // Some weather model sees a covered sky while the median sees a clear
    // one (the score is not lowered by it).
    ...(forecast?.uncertain === true
      ? {
          uncertain: true,
          // The model whose mean over the night is the highest, and that
          // mean, to say why.
          ...(forecast.uncertainBy
            ? { uncertainBy: forecast.uncertainBy }
            : {}),
        }
      : {}),
    kind:
      level === "variable" ? (window ? "variable-window" : "variable") : level,
    facts: {
      darkness: {
        minutes: Math.round((end - start) / minuteMs),
        start: iso(start),
        end: iso(end),
      },
      moon: moonFact(moon, start, end),
      clouds: cloudsFact(rows),
      window,
    },
  };
}
