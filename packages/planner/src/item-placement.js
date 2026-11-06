// Where a freshly added target lands on the night's timeline.
//
// Until this module existed, adding a target always dropped it at the start
// of its own availability window for a flat 60 minutes (`plannedPlanItem`),
// which ignored both the recommended integration time and everything already
// on the plan: two targets rising together were stacked on top of each other
// and the observer had to drag them apart by hand.
//
// The rule this module implements is a cascade. Each step is a test; when a
// step cannot be satisfied it is abandoned and the next one is tried.
//
//   0. Quality window. The periods of the night during which the target
//      satisfies the planner's existing per-sample predicate -- above the
//      effective minimum altitude, above the horizon profile, clear of the
//      mount's zenith-avoidance cone and cable sector, far enough from the
//      moon. This is NOT a second definition of visibility: it is read
//      straight off `card.visibilityWindows`, which `withHorizonMask`
//      produces by running `plannerPointConstraint` over every sample and
//      interpolating the crossings (`constraints.js`). A target with no
//      quality window at all this night has none here either.
//   1. Ideal position, free. The interval of the recommended duration D,
//      lying wholly inside the quality window, whose mean altitude is
//      highest. For the single-peaked altitude curve of a real target this
//      is the interval centred on culmination, pushed inwards where the
//      quality window or the night truncates it. If nothing on the plan
//      overlaps it, it is taken as is -> reason "ideal".
//   2. Free slot, full duration. Otherwise, among the gaps left inside the
//      quality window by the items already planned, those that can still
//      host D in full; the one whose centre sits closest to the ideal
//      position wins -> reason "free-slot".
//   3. Free slot, shortened. Otherwise, the longest such gap, provided it is
//      at least Dmin long; the duration shrinks to fit it -> reason
//      "shortened".
//   4. Overlap anyway. Otherwise -- no usable gap at all -- the collision is
//      simply accepted; the schedule editor already draws and reports
//      overlaps (`overlapSegments`) -> reason "overlap-fallback". What gets
//      placed depends on why no quality window could host D in full:
//        - some quality window exists but none is wide enough for D (this is
//          the same case step 1's `ideal` fallback already covers -- see
//          below): the placement shrinks to D' = the width of whichever
//          quality window can host D' at the highest mean altitude (ties:
//          earliest), positioned inside that window exactly like the ideal
//          position of step 1 (centred on culmination, pushed inwards by the
//          window's own edges). The result always lies wholly inside a
//          quality window -- a target with no room anywhere used to land at the
//          start of the night with its full recommended duration, spilling
//          for the most part outside its own quality window, because the old
//          rule centred the untouched D on the best window and then clamped
//          the result to the night, which for a D much longer than the
//          window pins the start to 0 rather than shortening the interval;
//        - no quality window at all this night: the ideal position is
//          undefined, so this step falls back to exactly what the planner
//          did before this module existed: availability start, capped at 60
//          minutes.
//
// Determinism. Every tie is broken the same way on every platform:
//   - candidate starts are whole minutes (the schedule editor itself rounds
//     pointer positions to whole minutes), optionally thinned to a coarser
//     `gridMinutes` step measured from the start of the night, with the two
//     ends of the admissible range always kept as candidates;
//   - equal mean altitudes keep the earliest start;
//   - equal distances to the ideal position keep the earliest start;
//   - equally long gaps keep the one closest to the ideal, then the
//     earliest.
// Quality windows are rounded inwards (ceil the start, floor the end) so a
// placement reported as inside the quality window really is inside it, and
// occupied intervals are rounded outwards (floor the start, ceil the end) so
// a placement reported as collision-free really is.
//
// Dmin is the schedule editor's own floor of five minutes
// (`scheduleStartUpdate`'s `minimumDuration`), not the photometric
// `suggestedIntegration().minimumMinutes`: the rule is "if there is not
// enough room for the recommended time, reduce it", with no floor of its
// own, so the only defensible floor is the shortest interval the editor
// already lets an observer keep.
//
// Deliberately not decided here: "not too close to the zenith" is enforced
// only through the mount's zenith-avoidance setting. When mount safety is
// off, no hidden zenith rule is applied -- the ideal position may sit exactly
// at culmination.

import { availabilityWindow, nightMinutes } from "./recommendations.js";

export const placementMinimumMinutes = 5;
export const placementDefaultMinutes = 60;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function mergeIntervals(intervals) {
  return intervals
    .slice()
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .reduce((merged, interval) => {
      const previous = merged.at(-1);
      if (previous && interval.start <= previous.end) {
        previous.end = Math.max(previous.end, interval.end);
      } else {
        merged.push({ start: interval.start, end: interval.end });
      }
      return merged;
    }, []);
}

// What is left of `window` once every occupied interval is cut out of it.
export function freeWithin(window, busy) {
  const slots = [];
  let cursor = window.start;
  for (const interval of busy) {
    if (interval.end <= cursor) continue;
    if (interval.start >= window.end) break;
    if (interval.start > cursor)
      slots.push({ start: cursor, end: interval.start });
    cursor = Math.max(cursor, interval.end);
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) slots.push({ start: cursor, end: window.end });
  return slots;
}

function collidesWith(interval, busy) {
  return busy.some(
    (other) => interval.start < other.end && interval.end > other.start,
  );
}

// Whole-minute starts in [lowest, highest], thinned to `grid` but always
// keeping both ends so a range narrower than one grid step still has
// candidates.
function candidateStarts(lowest, highest, grid) {
  if (highest < lowest) return [];
  if (highest === lowest) return [lowest];
  const starts = [lowest];
  const step = grid > 1 ? grid : 1;
  const first = grid > 1 ? Math.ceil(lowest / step) * step : lowest + step;
  for (let value = first; value < highest; value += step)
    if (value > lowest) starts.push(value);
  starts.push(highest);
  return starts;
}

// The altitude curve read as piecewise linear between samples, flat-extended
// past either end of the sampled span.
function meanAltitude(samples, start, end) {
  if (!samples.length) return 0;
  const first = samples[0];
  const last = samples.at(-1);
  if (end <= start) {
    if (start <= first.minute) return first.altitude;
    if (start >= last.minute) return last.altitude;
    for (let index = 0; index + 1 < samples.length; index += 1) {
      const left = samples[index];
      const right = samples[index + 1];
      if (start > right.minute) continue;
      const span = right.minute - left.minute;
      return span > 0
        ? left.altitude +
            ((right.altitude - left.altitude) * (start - left.minute)) / span
        : left.altitude;
    }
    return last.altitude;
  }
  let area = 0;
  for (let index = 0; index + 1 < samples.length; index += 1) {
    const left = samples[index];
    const right = samples[index + 1];
    const from = Math.max(start, left.minute);
    const to = Math.min(end, right.minute);
    if (to <= from) continue;
    const span = right.minute - left.minute;
    const slope = span > 0 ? (right.altitude - left.altitude) / span : 0;
    const fromAltitude = left.altitude + slope * (from - left.minute);
    const toAltitude = left.altitude + slope * (to - left.minute);
    area += ((fromAltitude + toAltitude) / 2) * (to - from);
  }
  if (start < first.minute)
    area += first.altitude * (Math.min(end, first.minute) - start);
  if (end > last.minute)
    area += last.altitude * (end - Math.max(start, last.minute));
  return area / (end - start);
}

function placementResult(start, duration, reason) {
  return {
    startMinute: start,
    endMinute: start + duration,
    durationMinutes: duration,
    reason,
  };
}

/**
 * Where a target being added to the plan should land tonight.
 *
 * `card` is a recommendation card that has already been through
 * `withHorizonMask` (so it carries `visibilityWindows`, `series` and
 * `integration`), `night` is the planned night's `{start, end}`, and `items`
 * is the active plan's current items. `gridMinutes` thins the candidate
 * starts; 1 (the default) means every whole minute, which is what the
 * schedule editor's own pointer rounding allows.
 *
 * Returns `{startMinute, endMinute, durationMinutes, reason}` with `reason`
 * one of "ideal", "free-slot", "shortened", "overlap-fallback". The reason is
 * for the caller's benefit only -- nothing about it is written to the plan
 * document.
 */
export function plannedItemPlacement({
  card,
  night,
  items = [],
  gridMinutes = 1,
  recommendedMinutes,
  minimumMinutes = placementMinimumMinutes,
} = {}) {
  const total = nightMinutes(night);
  const nightStart = new Date(night?.start).getTime();
  const grid =
    Number.isFinite(Number(gridMinutes)) && Number(gridMinutes) > 1
      ? Math.floor(Number(gridMinutes))
      : 1;
  const minimum = clamp(
    Math.round(Number(minimumMinutes)) || placementMinimumMinutes,
    1,
    total,
  );
  const suggested = Number.isFinite(Number(recommendedMinutes))
    ? Number(recommendedMinutes)
    : card?.integration?.available
      ? Number(card.integration.recommendedMinutes)
      : Number.NaN;
  const duration = clamp(
    Math.round(
      Number.isFinite(suggested) && suggested > 0
        ? suggested
        : placementDefaultMinutes,
    ),
    Math.min(minimum, total),
    total,
  );

  const quality = mergeIntervals(
    (Array.isArray(card?.visibilityWindows) ? card.visibilityWindows : [])
      .map((window) => ({
        start: clamp(
          Math.ceil((new Date(window?.start).getTime() - nightStart) / 60000),
          0,
          total,
        ),
        end: clamp(
          Math.floor((new Date(window?.end).getTime() - nightStart) / 60000),
          0,
          total,
        ),
      }))
      .filter(
        (window) =>
          Number.isFinite(window.start) &&
          Number.isFinite(window.end) &&
          window.end > window.start,
      ),
  );
  const samples = (Array.isArray(card?.series) ? card.series : [])
    .map((point) => ({
      minute: (new Date(point?.time).getTime() - nightStart) / 60000,
      altitude: Number(point?.altitude),
    }))
    .filter(
      (point) =>
        Number.isFinite(point.minute) && Number.isFinite(point.altitude),
    );
  const addedId = card?.target?.id;
  const busy = mergeIntervals(
    (Array.isArray(items) ? items : [])
      .filter((item) => item && item.id !== addedId)
      .map((item) => {
        const start = Number(item.startMinute);
        const stored = Number(item.endMinute);
        const span = Number(item.durationMinutes);
        return {
          start: clamp(Math.floor(start), 0, total),
          end: clamp(
            Math.ceil(
              Number.isFinite(stored)
                ? stored
                : start +
                    (Number.isFinite(span) && span > 0
                      ? span
                      : placementDefaultMinutes),
            ),
            0,
            total,
          ),
        };
      })
      .filter(
        (interval) =>
          Number.isFinite(interval.start) &&
          Number.isFinite(interval.end) &&
          interval.end > interval.start,
      ),
  );

  // The ideal position: highest mean altitude among the intervals of the
  // recommended duration that fit inside a quality window. When no quality
  // window is wide enough for the full duration D, only step 4 can ever use
  // `ideal` (steps 1 and 2 both require the whole duration to fit inside the
  // quality window), and what it gets is the D'-long interval of highest mean
  // altitude among the windows that are too short for D -- which, since every
  // one of them is shorter than D, D' = min(D, window length) is simply that
  // window's own length, so the "interval of D' within the window" collapses
  // to the window itself. Comparing candidates by that D'-duration mean
  // altitude is therefore the same as comparing whole quality windows by
  // their own mean altitude. The result is always wholly inside a quality
  // window, unlike centring the untouched D on the window and clamping to the
  // night, which is what this used to do and could push the start as far as
  // the beginning of the night for a D much longer than the window.
  const hostable = quality.filter(
    (window) => window.end - window.start >= duration,
  );
  let ideal = null;
  if (hostable.length) {
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const window of hostable)
      for (const start of candidateStarts(
        window.start,
        window.end - duration,
        grid,
      )) {
        const score = meanAltitude(samples, start, start + duration);
        if (score > bestScore) {
          bestScore = score;
          ideal = { start, end: start + duration };
        }
      }
  } else if (quality.length) {
    let bestWindow = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const window of quality) {
      const score = meanAltitude(samples, window.start, window.end);
      if (score > bestScore) {
        bestScore = score;
        bestWindow = window;
      }
    }
    ideal = { start: bestWindow.start, end: bestWindow.end };
  }

  // Step 1 -- the ideal position, collision-free.
  if (ideal && hostable.length && !collidesWith(ideal, busy))
    return placementResult(ideal.start, duration, "ideal");

  const free = quality.flatMap((window) => freeWithin(window, busy));
  const idealCentre = ideal ? (ideal.start + ideal.end) / 2 : 0;

  // Step 2 -- a gap that still holds the full recommended duration.
  const roomy = free.filter((slot) => slot.end - slot.start >= duration);
  if (roomy.length) {
    let chosen = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const slot of roomy)
      for (const start of candidateStarts(
        slot.start,
        slot.end - duration,
        grid,
      )) {
        const distance = Math.abs(start + duration / 2 - idealCentre);
        if (distance < bestDistance) {
          bestDistance = distance;
          chosen = start;
        }
      }
    return placementResult(chosen, duration, "free-slot");
  }

  // Step 3 -- the longest usable gap, with the duration shortened to fit.
  const usable = free.filter((slot) => slot.end - slot.start >= minimum);
  if (usable.length) {
    let chosen = null;
    for (const slot of usable) {
      if (!chosen) {
        chosen = slot;
        continue;
      }
      const length = slot.end - slot.start;
      const chosenLength = chosen.end - chosen.start;
      if (length > chosenLength) {
        chosen = slot;
        continue;
      }
      if (length < chosenLength) continue;
      if (
        Math.abs((slot.start + slot.end) / 2 - idealCentre) <
        Math.abs((chosen.start + chosen.end) / 2 - idealCentre)
      )
        chosen = slot;
    }
    const span = Math.min(duration, chosen.end - chosen.start);
    const start = clamp(
      Math.round(idealCentre - span / 2),
      chosen.start,
      chosen.end - span,
    );
    return placementResult(start, span, "shortened");
  }

  // Step 4 -- nothing fits; overlap on purpose at the ideal position.
  if (ideal)
    return placementResult(
      ideal.start,
      ideal.end - ideal.start,
      "overlap-fallback",
    );
  const availability = availabilityWindow(card, night);
  const start = availability.start;
  const end = Math.max(
    start,
    Math.min(availability.end, start + placementDefaultMinutes),
  );
  return placementResult(start, end - start, "overlap-fallback");
}
