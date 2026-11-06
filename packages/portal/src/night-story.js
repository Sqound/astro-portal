// The story of the night: what the night will be like and when, as three small
// facts the catalogues turn into one sentence — the shape the three thirds of
// the night make, the reason of the worst one, and the ideal slot. Written
// once here. The words live in the message catalogues: nothing of the
// sentence is assembled from words here.
//
// The rule, step by step:
// 1. the night (the astronomical night, or the chosen slot) is cut into three
//    equal spans; an hour belongs to the third that holds its middle;
// 2. a third's score is the mean of its hours' scores; its quality is `good`
//    from 64, `mixed` from 42, else `poor`;
// 3. the night is steady when the largest gap between the thirds is under 12
//    points or the three have the same quality: `steadyGood`, `steadyMixed`,
//    `steadyPoor` from the mean of its hours;
// 4. otherwise the shape is the best quality and where it is (`start`,
//    `middle`, `end`, `startMiddle`, `middleEnd`, `edges`): 12 shapes;
// 5. the reason is the factor with the greatest share of the loss
//    (`forecastLossShares`, −ln(weight)) in the worst third (the earliest if
//    equal), or over the whole night for a steady mixed or poor one; none for
//    `steadyGood`;
// 6. the ideal slot is the longest run of consecutive hours scored 64 or
//    more, two hours at least, its end brought back to the end of the night;
//    the first of two equal runs; none when it covers 90 % of the night;
// 7. fewer than three scored hours, or a third without any: steady shapes
//    only.

import {
  forecastLossShares,
  forecastScoreFactors,
} from "./astronomy-forecast.js";

const hourMs = 60 * 60 * 1000;

// The bounds of the qualities (the card's levels: favourable 64, variable 42).
export const nightStoryQualityBounds = Object.freeze({ good: 64, mixed: 42 });
// A gap between the thirds under this many points is a steady night.
export const nightStorySteadyGap = 12;
// The ideal slot: at least this many hours, hidden from this share of the
// night.
export const nightStoryIdealMinimumHours = 2;
export const nightStoryIdealHiddenShare = 0.9;

// The reason of each factor of the score (`forecastScoreFactors`).
const reasons = Object.freeze({
  cloud: "clouds",
  rain: "rain",
  moon: "moon",
  visibility: "mist",
  wind: "wind",
  humidity: "dew",
});
const parts = ["start", "middle", "end"];
const steadyShapes = Object.freeze({
  good: "steadyGood",
  mixed: "steadyMixed",
  poor: "steadyPoor",
});
// Where the best quality is, by the thirds that hold it (start, middle, end).
const positions = Object.freeze({
  100: "Start",
  "010": "Middle",
  "001": "End",
  110: "StartMiddle",
  "011": "MiddleEnd",
  101: "Edges",
});

function instant(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const iso = (milliseconds) => new Date(milliseconds).toISOString();

function scoreOf(hour) {
  const score = hour?.score;
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}

function qualityOf(score) {
  return score >= nightStoryQualityBounds.good
    ? "good"
    : score >= nightStoryQualityBounds.mixed
      ? "mixed"
      : "poor";
}

const mean = (values) =>
  values.reduce((total, value) => total + value, 0) / values.length;

// The factor that takes the greatest share of the loss over [hours] (the
// first of the factors' order when two are equal), `null` when nothing is
// lost.
function reasonOf(hours) {
  const shares = forecastLossShares(hours);
  if (!shares || !(shares.lost > 0)) return null;
  let best = null;
  for (const key of forecastScoreFactors) {
    const share = shares.factors[key]?.share ?? 0;
    if (share > 0 && (best === null || share > shares.factors[best].share))
      best = key;
  }
  return best === null ? null : reasons[best];
}

function idealSlot(rows, start, end) {
  let best = null;
  let run = null;
  for (const row of rows) {
    const good =
      row.score !== null && row.score >= nightStoryQualityBounds.good;
    if (good && run && row.time - run.last <= hourMs) {
      run = { ...run, last: row.time, count: run.count + 1 };
    } else if (good) {
      run = { first: row.time, last: row.time, count: 1 };
    } else {
      run = null;
    }
    if (run && (!best || run.count > best.count)) best = run;
  }
  if (!best || best.count < nightStoryIdealMinimumHours) return null;
  const slotEnd = Math.min(best.last + hourMs, end);
  if (slotEnd - best.first >= nightStoryIdealHiddenShare * (end - start))
    return null;
  return { start: iso(best.first), end: iso(slotEnd) };
}

/**
 * The story of the night.
 *
 * - `hours`: the rows of `hourlyAstronomyForecast` over the night (`time` in
 *   epoch milliseconds or ISO, `score`, and the values `forecastHourScore`
 *   reads);
 * - `night`: the span to tell `{ start, end }` — the astronomical night, or
 *   the chosen slot.
 *
 * Returns `{ shape, reason, ideal, thirds }`: `shape` one of the 15 shapes,
 * `reason` one of `clouds`, `rain`, `mist`, `wind`, `dew`, `moon` or `null`,
 * `ideal` `{ start, end }` (ISO) or `null`, `thirds` the three parts `{ part,
 * start, end, hours, score, quality, reason }` (`score` and `quality` `null`
 * for a third without an hour). Without a night or a scored hour, `shape` is
 * `null`.
 */
export function nightStory({ hours = [], night = null } = {}) {
  const start = instant(night?.start);
  const end = instant(night?.end);
  const none = { shape: null, reason: null, ideal: null, thirds: [] };
  if (start === null || end === null || end <= start) return none;
  const rows = (Array.isArray(hours) ? hours : [])
    .map((hour) => ({ hour, time: instant(hour?.time), score: scoreOf(hour) }))
    .filter((row) => row.time !== null && row.time >= start && row.time <= end)
    .sort((left, right) => left.time - right.time);
  const scored = rows.filter((row) => row.score !== null);
  if (!scored.length) return none;

  const span = (end - start) / 3;
  const thirds = parts.map((part, index) => ({
    part,
    start: start + span * index,
    end: index === 2 ? end : start + span * (index + 1),
    rows: [],
  }));
  for (const row of scored) {
    const index = Math.floor((row.time + hourMs / 2 - start) / span);
    thirds[Math.max(0, Math.min(2, index))].rows.push(row);
  }
  for (const third of thirds) {
    // Rounded first: the quality is the one of the figure the sheet shows.
    third.score = third.rows.length
      ? Math.round(mean(third.rows.map((row) => row.score)))
      : null;
    third.quality = third.score === null ? null : qualityOf(third.score);
  }

  const nightQuality = qualityOf(
    Math.round(mean(scored.map((row) => row.score))),
  );
  const complete =
    scored.length >= 3 && thirds.every((third) => third.score !== null);
  let shape;
  let told = null;
  if (complete) {
    const values = thirds.map((third) => third.score);
    const gap = Math.max(...values) - Math.min(...values);
    const qualities = new Set(thirds.map((third) => third.quality));
    if (gap >= nightStorySteadyGap && qualities.size > 1) {
      const best = qualities.has("good") ? "good" : "mixed";
      const where = thirds
        .map((third) => (third.quality === best ? "1" : "0"))
        .join("");
      shape = `${best}${positions[where]}`;
      told = thirds.reduce((worst, third) =>
        third.score < worst.score ? third : worst,
      );
    }
  }
  shape ??= steadyShapes[nightQuality];
  const reason =
    shape === "steadyGood"
      ? null
      : reasonOf((told ? told.rows : scored).map((row) => row.hour));

  return {
    shape,
    reason,
    ideal: idealSlot(scored, start, end),
    thirds: thirds.map((third) => ({
      part: third.part,
      start: iso(Math.round(third.start)),
      end: iso(Math.round(third.end)),
      hours: third.rows.length,
      score: third.score,
      quality: third.quality,
      reason:
        third.score === null || third.quality === "good"
          ? null
          : reasonOf(third.rows.map((row) => row.hour)),
    })),
  };
}
