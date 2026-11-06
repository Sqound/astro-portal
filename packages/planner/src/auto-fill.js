// "Remplir la nuit automatiquement": a night's worth of targets proposed for
// the free time of a plan, to be read and then applied.
//
// Deterministic and pure (JSON in, JSON out): the same inputs give the same
// proposal everywhere. It adds no
// placement rule of its own: every target goes through the cascade of
// `plannedItemPlacement` (`item-placement.js`), one at a time, against what
// the plan already holds and what the proposal has placed so far.
//
// The rule, in order:
//   1. The candidates are the planner's pool for the plan's place, night and
//      equipment, without the targets already in the plan, each with its
//      score of the night (`targetTonightScore`, `target-score.js`) or none.
//   2. They are sorted by the share of the score's own maximum (compared by
//      cross-multiplication, never a rounded percent), a candidate without a
//      score last; ties go to the earlier culmination, then to the id.
//   3. Inside the plan's night window (the custom span when there is one) and
//      its free time, each candidate is placed by the cascade, with a floor
//      of `minimumMinutes` (45) for its slot: a candidate the cascade can
//      only overlap, or shorten below the floor, is skipped. At most
//      `maximumTargets` (6) are placed. A slot lasts the target's recommended
//      time, between `minimumMinutes` and `maximumSlotMinutes` (180). Nothing
//      already in the plan moves.
//   4. Each placed target says why (`reason`: the best thing about its
//      place, from its culmination, the dew and the dusk); each free slot of
//      `freeSlotMinimumMinutes` or more that is left says why it is empty.
//
// The placement ("Idéal | Rapproché"): the rule above is "Idéal",
// and what a caller gets without the option. With `placement: "chained"`
// ("Rapproché", honoured only for `layout: "night"`) the targets are laid
// one after the other (`chained` below): from the start of the window,
// at each step the best-ranked target that can start where the previous one
// ends, else the best-ranked one that rises within
// `chainedWaitMaximumMinutes` (10); a wait is never longer than that. When
// nothing follows within it, the chain stops there and says why (the free
// slot and the shortfall `no-follower`). Each item's score is then the one
// of its own slot (`targetSlotScore`) and a target placed after another says
// so (`reason.kind` "follows").
//
// « Observation confortable » (`comfort`, visual suggestions only): the
// heights at which the eyepiece is easy to reach with the plan's instrument
// (`observationComfortRange`, `observation-comfort.js`). A preference, never
// a filter: the targets that pass through that range tonight come first
// (after the continuing group), the others follow in their own order; and
// each target is placed while it is inside the range when it can be, else
// where it would be without the switch.
//
// The periods of the night (`spans`, SUGGEST-FILTERS-01: « Début », « Milieu »,
// « Fin » of the filters, `suggestionPeriodSpans`): a list of `{ start, end }`
// that narrows the window to the stretches it holds — « Début + Fin » is two
// of them, the middle of the night left out. They are cut by the window (the
// span), the window becomes their hull and the gaps between them are busy:
// nothing is placed there, nothing there is called free. Each candidate is
// seen inside them only (its visibility windows cut, `cardWithinSpans`) and
// scored over them (`targetWindowsScore`: a target high for twenty minutes in
// the period is worth less). The proposal says which stretches it used
// (`spans`, empty when none is left: « Début » chosen at 22:40). Absent or not
// a list: the whole window, as before.
//
// « Ignorer le masque d'horizon » is the candidates' own (made without the
// mask); a card that carries `maskHidden` (`[{ start, end }]`, the stretches
// it spends behind the mask, `maskHiddenWindows`) has its proposed item say
// the first of them inside its best window (the list) or its slot
// (`maskHidden: { start, end }`, `null` when none falls there).
//
// The words are not here: a reason is `{ kind, ... }` and its sentence is
// written by `auto-fill-copy.js`.
import {
  compareCandidates,
  rankSuggestionCandidates,
  suggestionRule,
} from "./suggestion-ranking.js";
import { filterFamily, recommendedFilterFamilies } from "./filters.js";
import {
  freeWithin,
  mergeIntervals,
  plannedItemPlacement,
} from "./item-placement.js";
import { cardWithinNightSpan, nightSpanMoonIntervals } from "./night-span.js";
import { nightMinutes, recommendationTypeFor } from "./recommendations.js";
import { meridianTransit } from "./schedule.js";
import { cardWithinSpans } from "./suggest-filters.js";
import { targetSlotScore, targetWindowsScore } from "./target-score.js";

// The settings of the rule, written once (and logged so that it can be
// judged: "is this a typical good night for you?").
export const autoFillRule = Object.freeze({
  // The shortest slot a proposed target gets, in minutes.
  minimumMinutes: 45,
  // The longest: a target's recommended time is capped there, so that a night
  // holds several targets rather than one that wants all of it.
  maximumSlotMinutes: 180,
  // The most targets a proposal holds.
  maximumTargets: 6,
  // A free slot shorter than this is not listed (nor counted).
  freeSlotMinimumMinutes: 15,
  // "Haute dès la nuit": placed within this many minutes of the start of the
  // window, and at least this high at its start.
  duskToleranceMinutes: 15,
  highFromDuskDegrees: 40,
  // A free slot under this mean cloud cover (percent) is called cloudy.
  cloudyPercent: 70,
  // "Rapproché": every wait between two chained targets is listed, however
  // short, so that the timeline draws it (even a 7-minute wait).
  chainedGapMinimumMinutes: 1,
  // "Rapproché": the longest wait between a target and the next.
  chainedWaitMaximumMinutes: 10,
});

const minuteMs = 60000;
const hourMs = 3600000;

const finite = (value) => typeof value === "number" && Number.isFinite(value);
// Half up.
const round = (value) => Math.floor(value + 0.5);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const iso = (ms) => new Date(ms).toISOString();

function instant(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// The night's window in minutes after the start of the dark night: the whole
// night, or the custom span rounded inwards; `null` when it cannot be read.
function windowOf(night, span) {
  const start = instant(night?.start);
  const end = instant(night?.end);
  if (start === null || end === null || !(end > start)) return null;
  const total = nightMinutes(night);
  let from = 0;
  let to = total;
  const spanStart = instant(span?.start);
  const spanEnd = instant(span?.end);
  if (spanStart !== null && spanEnd !== null && spanEnd > spanStart) {
    from = clamp(Math.ceil((spanStart - start) / minuteMs), 0, total);
    to = clamp(Math.floor((spanEnd - start) / minuteMs), 0, total);
  }
  return { nightStart: start, total, start: from, end: to };
}

// What the plan's items occupy, in whole minutes rounded outwards.
function busyOf(items, total) {
  const busy = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || !finite(item.startMinute)) continue;
    const length =
      finite(item.durationMinutes) && item.durationMinutes > 0
        ? item.durationMinutes
        : 60;
    const stop = finite(item.endMinute)
      ? item.endMinute
      : item.startMinute + length;
    const start = clamp(Math.floor(item.startMinute), 0, total);
    const end = clamp(Math.ceil(stop), 0, total);
    if (end > start) busy.push({ start, end });
  }
  return mergeIntervals(busy);
}

/**
 * The free time of a plan's night, for the entry "Remplir la nuit": the
 * stretches of the night's window (the custom span, else the dark night) that
 * the plan's items leave free and that last `minimumMinutes` or more.
 * `[{ startMinute, endMinute, minutes }]`, earliest first; empty when the
 * night cannot be read.
 */
export function autoFillFreeSlots({
  night,
  span,
  items,
  minimumMinutes = autoFillRule.minimumMinutes,
} = {}) {
  const window = windowOf(night, span);
  if (!window) return [];
  return freeWithin(
    { start: window.start, end: window.end },
    busyOf(items, window.total),
  )
    .filter((slot) => slot.end - slot.start >= minimumMinutes)
    .map((slot) => ({
      startMinute: slot.start,
      endMinute: slot.end,
      minutes: slot.end - slot.start,
    }));
}

// The altitude samples as `{ minute, altitude }` after the start of the night,
// in time order.
function altitudeSamples(card, nightStart) {
  return (Array.isArray(card?.series) ? card.series : [])
    .map((point) => {
      const time = instant(point?.time);
      return {
        minute: time === null ? Number.NaN : (time - nightStart) / minuteMs,
        altitude: point?.altitude,
      };
    })
    .filter((point) => Number.isFinite(point.minute) && finite(point.altitude))
    .sort((left, right) => left.minute - right.minute);
}

// The altitude curve read as straight lines between samples, flat past
// either end.
function altitudeAt(samples, minute) {
  if (!samples.length) return 0;
  if (minute <= samples[0].minute) return samples[0].altitude;
  for (let index = 1; index < samples.length; index += 1) {
    const before = samples[index - 1];
    const after = samples[index];
    if (minute > after.minute) continue;
    const gap = after.minute - before.minute;
    return gap > 0
      ? before.altitude +
          ((after.altitude - before.altitude) * (minute - before.minute)) / gap
      : after.altitude;
  }
  return samples.at(-1).altitude;
}

// The highest point of the curve between `start` and `end` (minutes), the
// earliest on a tie.
function peakWithin(samples, start, end) {
  const minutes = [
    start,
    ...samples
      .map((point) => point.minute)
      .filter((minute) => minute > start && minute < end),
    end,
  ];
  let best = null;
  for (const minute of minutes) {
    const altitude = altitudeAt(samples, minute);
    if (best === null || altitude > best.altitude) best = { minute, altitude };
  }
  return best;
}

// When the target culminates tonight, in minutes: the interpolated transit,
// else the highest sample of the night; infinity without a curve.
function culminationOf(card, night, samples, total) {
  const transit = meridianTransit(card, night);
  if (transit) return transit;
  let best = null;
  for (const point of samples)
    if (
      point.minute >= 0 &&
      point.minute <= total &&
      (best === null || point.altitude > best.altitude)
    )
      best = point;
  return best
    ? { minute: best.minute, altitude: best.altitude, peak: true }
    : null;
}

// The forecast's rows (`hourlyAstronomyForecast`), in time order.
function hourlyRows(hourly) {
  return (Array.isArray(hourly) ? hourly : [])
    .map((row) => ({ row, time: instant(row?.time) }))
    .filter((entry) => entry.time !== null)
    .sort((left, right) => left.time - right.time);
}

const isDew = (row) => row?.dewRisk === "moderate" || row?.dewRisk === "high";

function overlapping(rows, from, to) {
  return rows.filter(({ time }) => time < to && time + hourMs > from);
}

// Where the altitude curve (straight lines between samples) is inside
// `comfort`'s range, in minutes; merged, earliest first.
function comfortIntervals(samples, comfort) {
  const low = finite(comfort?.minAltitude)
    ? comfort.minAltitude
    : Number.NEGATIVE_INFINITY;
  const high = finite(comfort?.maxAltitude)
    ? comfort.maxAltitude
    : Number.POSITIVE_INFINITY;
  const intervals = [];
  for (let index = 1; index < samples.length; index += 1) {
    const before = samples[index - 1];
    const after = samples[index];
    const gap = after.minute - before.minute;
    if (!(gap > 0)) continue;
    const rise = after.altitude - before.altitude;
    let from = 0;
    let to = 1;
    if (rise === 0) {
      if (before.altitude < low || before.altitude > high) continue;
    } else {
      const atLow = (low - before.altitude) / rise;
      const atHigh = (high - before.altitude) / rise;
      from = Math.max(0, Math.min(atLow, atHigh));
      to = Math.min(1, Math.max(atLow, atHigh));
    }
    if (!(to > from)) continue;
    intervals.push({
      start: before.minute + from * gap,
      end: before.minute + to * gap,
    });
  }
  const merged = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end)
      last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

// The whole minutes of `rooms` inside `intervals` (rounded inwards).
function roomsWithin(rooms, intervals) {
  const inside = [];
  for (const room of rooms)
    for (const interval of intervals) {
      const start = Math.max(room.start, Math.ceil(interval.start));
      const end = Math.min(room.end, Math.floor(interval.end));
      if (end > start) inside.push({ start, end });
    }
  return mergeIntervals(inside);
}

// The quality windows of a card in minutes (rounded inwards, like the
// cascade does), inside the span.
function qualityMinutes(card, window) {
  return (Array.isArray(card?.visibilityWindows) ? card.visibilityWindows : [])
    .map((entry) => {
      const start = instant(entry?.start);
      const end = instant(entry?.end);
      return start === null || end === null
        ? null
        : {
            start: clamp(
              Math.ceil((start - window.nightStart) / minuteMs),
              0,
              window.total,
            ),
            end: clamp(
              Math.floor((end - window.nightStart) / minuteMs),
              0,
              window.total,
            ),
          };
    })
    .filter((entry) => entry !== null && entry.end > entry.start);
}

function targetOf(target) {
  return {
    id: String(target.id),
    designation:
      typeof target.designation === "string" ? target.designation : "",
    title: typeof target.title === "string" ? target.title : "",
  };
}

// Whether the observer has a dual-band filter and the target is one it is
// advised for.
function dualBand(target, mode, ownedFilters) {
  const advised = recommendedFilterFamilies(target, mode);
  if (!Array.isArray(advised) || !advised.includes("dual")) return false;
  return (Array.isArray(ownedFilters) ? ownedFilters : []).some(
    (filter) => filterFamily(filter) === "dual",
  );
}

/**
 * The proposal for the free time of a night.
 *
 * - `candidates`: `[{ card, score }]`, the planner's pool (cards that went
 *   through `withHorizonMask`), `score` the card's `targetTonightScore`
 *   (only `total` and `max` are read) or `null`;
 * - `night`: the dark night, `{ start, end }`: the plan's minutes count from
 *   its start; `span`: the plan's custom span `{ start, end }`, or `null`;
 * - `items`: the plan's items (never moved, and their targets are left out);
 * - `hourly`: the rows of `hourlyAstronomyForecast` (`time`, `cloud`,
 *   `dewRisk`); `moonSeries`: `[{ time, altitude }]`;
 * - `ownedFilters`, `mode`: the filters the observer has and the plan's mode,
 *   for "en double bande".
 *
 * Returns `{ window, items, free, imagingMinutes, freeMinutes }`, or `null`
 * when the night cannot be read:
 * - `window`: `{ start, end, startMinute, endMinute }`;
 * - `items`, by start: `{ target: { id, designation, title }, start, end,
 *   startMinute, endMinute, durationMinutes, maxAltitude, placement, reason }`
 *   — `placement` is the cascade's (`ideal`, `free-slot`, `shortened`),
 *   `maxAltitude` the highest altitude in whole degrees inside the slot and
 *   `reason` `{ kind, ... }`: `culmination-before-dew` and `meridian`
 *   (`time`), `high-from-dusk` (`altitude`, `dualBand`), `best-window`
 *   (`altitude`, `time`), `follows` (`altitude`: "Rapproché" only, a target
 *   placed after another and not holding its culmination);
 * - `free`, by start: `{ start, end, startMinute, endMinute, minutes, reason }`
 *   — `reason` `{ kind }` among `short`, `clouds` (`cloud`), `no-target`,
 *   `limit`, `dew`, `moon`, `nothing`, and `no-follower` (`wait`: "Rapproché"
 *   only, where the chain stopped because nothing followed within the wait);
 * - `imagingMinutes`: what the proposed items last; `freeMinutes`: what the
 *   listed free slots last.
 */
export function autoFillNight(options = {}) {
  const {
    candidates,
    night,
    span,
    items,
    hourly,
    moonSeries,
    ownedFilters,
    mode,
    count = 6,
    kept = [],
    excluded = [],
    history = [],
    continuing = [],
    excludeCaptured = false,
    noteNow = null,
    date,
    tier = 1,
    seed,
    only,
    layout = "night",
    placement,
    comfort = null,
    spans,
  } = options;
  const enhanced = [
    "count",
    "kept",
    "excluded",
    "history",
    "continuing",
    "excludeCaptured",
    "tier",
    "seed",
    "only",
    "layout",
  ].some((key) => Object.hasOwn(options, key));
  const requested =
    count === "all" ? "all" : Number.isInteger(count) && count > 0 ? count : 6;
  const maximum = enhanced
    ? layout === "list"
      ? 10
      : requested === "all"
        ? Infinity
        : requested
    : autoFillRule.maximumTargets;
  const minimum =
    enhanced && mode === "visual"
      ? suggestionRule.visualMinutes
      : autoFillRule.minimumMinutes;
  // "Rapproché": absent, or anything but "chained", is "Idéal", the
  // placement of every other caller; the independent list never chains.
  const chained = enhanced && layout === "night" && placement === "chained";
  const window = windowOf(night, span);
  if (!window) return null;
  const { nightStart, total } = window;
  // SUGGEST-FILTERS-01: the periods chosen, inside the window; the window is
  // their hull, the gaps between them busy.
  const periods = Array.isArray(spans) ? periodMinutes(spans, window) : null;
  if (periods) {
    window.start = periods.length ? periods[0].start : window.start;
    window.end = periods.length
      ? periods[periods.length - 1].end
      : window.start;
  }
  const periodSpans = periods
    ? periods.map((period) => ({
        start: iso(nightStart + period.start * minuteMs),
        end: iso(nightStart + period.end * minuteMs),
      }))
    : null;
  const periodGaps = periods
    ? freeWithin({ start: window.start, end: window.end }, periods)
    : [];
  // « Observation confortable »: the suggestions of a visual plan only.
  const comfortable =
    enhanced &&
    mode === "visual" &&
    comfort !== null &&
    typeof comfort === "object" &&
    (finite(comfort.minAltitude) || finite(comfort.maxAltitude));
  const keptItems = enhanced && layout !== "list" ? kept : [];
  const planBusy = mergeIntervals([
    ...busyOf(
      layout === "list" && enhanced ? [] : [...(items ?? []), ...keptItems],
      total,
    ),
    ...periodGaps,
  ]);
  const planned = new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => item?.id)
      .filter((id) => typeof id === "string" || typeof id === "number")
      .map(String),
  );
  const rows = hourlyRows(hourly);

  // 1 and 2. The pool and its order.
  const seen = new Set();
  let pool = [];
  for (const entry of Array.isArray(candidates) ? candidates : []) {
    // SUGGEST-FILTERS-01: the target as it is inside the periods chosen.
    const card = periodSpans
      ? cardWithinSpans(entry?.card, periodSpans)
      : entry?.card;
    const rawId = card?.target?.id;
    if (typeof rawId !== "string" && typeof rawId !== "number") continue;
    const id = String(rawId);
    if (planned.has(id) || seen.has(id)) continue;
    seen.add(id);
    const samples = altitudeSamples(card, nightStart);
    const culmination = culminationOf(card, night, samples, total);
    // The minutes of its quality windows (inside the span) where it is in
    // the comfortable range; it is comfortable tonight when one of them
    // holds the shortest slot.
    const comfortRooms = comfortable
      ? roomsWithin(
          qualityMinutes(cardWithinNightSpan(card, span), window)
            .map((entry) => ({
              start: Math.max(entry.start, window.start),
              end: Math.min(entry.end, window.end),
            }))
            .filter((entry) => entry.end > entry.start),
          comfortIntervals(samples, comfort),
        )
      : null;
    pool.push({
      id,
      card,
      samples,
      transit: culmination && !culmination.peak ? culmination : null,
      culmination: culmination ? culmination.minute : Number.POSITIVE_INFINITY,
      score:
        entry.score && finite(entry.score.total) && finite(entry.score.max)
          ? periodSpans
            ? targetWindowsScore({
                score: entry.score,
                card,
                windows: card.visibilityWindows,
              })
            : { total: entry.score.total, max: entry.score.max }
          : null,
      // The whole score (with its criteria), for the score at a real slot.
      scoreSource: entry.score ?? null,
      comfortRooms,
      comfortable: comfortRooms
        ? comfortRooms.some((room) => room.end - room.start >= minimum)
        : false,
    });
  }
  pool.sort(compareCandidates);

  const ranking = enhanced
    ? rankSuggestionCandidates(pool, {
        items: items ?? [],
        kept: keptItems,
        excluded,
        history,
        continuing,
        mode,
        excludeCaptured,
        noteNow,
        // The night's own date (the age of the last time is counted to it).
        date: date ?? new Date(nightStart).toISOString().slice(0, 10),
        // A request over the ticked targets keeps the order of the
        // proposal they were ticked in.
        penalise: !Array.isArray(only),
        tier,
        seed,
      })
    : null;
  if (ranking) pool = ranking.pool;
  const strict = ranking?.strict ?? pool;
  const recommendedFor = (candidate) => {
    if (enhanced && mode === "visual") return suggestionRule.visualMinutes;
    const integration = candidate.card.integration;
    const advised =
      integration?.available && finite(Number(integration.recommendedMinutes))
        ? Number(integration.recommendedMinutes)
        : Number.NaN;
    return clamp(
      round(advised > 0 ? advised : 60),
      autoFillRule.minimumMinutes,
      autoFillRule.maximumSlotMinutes,
    );
  };
  const medianSlots = strict
    .slice(0, 10)
    .map(recommendedFor)
    .sort((a, b) => a - b);
  const slotMinutes =
    mode === "visual"
      ? suggestionRule.visualMinutes
      : medianSlots.length
        ? clamp(
            round(medianSlots[Math.floor((medianSlots.length - 1) / 2)] / 15) *
              15,
            45,
            180,
          )
        : 60;
  const estimate = {
    count: Math.floor(
      freeWithin({ start: window.start, end: window.end }, planBusy)
        .filter((slot) => slot.end - slot.start >= minimum)
        .reduce((sum, slot) => sum + slot.end - slot.start, 0) / slotMinutes,
    ),
    slotMinutes,
  };
  const onlyIds = Array.isArray(only) ? new Set(only.map(String)) : null;
  // Application re-runs the cascade in strict ranking order over precisely
  // the ticked ids. It does not fetch substitute targets from another tier.
  const applyPool = onlyIds
    ? strict.filter((candidate) => onlyIds.has(candidate.id))
    : pool;

  // 3. One at a time through the cascade.
  const busyItems = (intervals) =>
    intervals.map((interval, index) => ({
      id: `busy-${index}`,
      startMinute: interval.start,
      endMinute: interval.end,
    }));
  const placedBusy = [];
  const placed = [];
  // The types of the kept targets of a decade (ten targets), from which the
  // cap of each type in that decade counts.
  const keptTypeCounts = (decade) => {
    const counts = new Map();
    for (const item of keptItems.slice(decade * 10, (decade + 1) * 10)) {
      const entry = (candidates ?? []).find(
        (entry) =>
          String(entry?.card?.target?.id) ===
          String(item.id ?? item.target?.id),
      );
      const type = item.type ?? recommendationTypeFor(entry?.card?.target);
      if (type) counts.set(type, (counts.get(type) || 0) + 1);
    }
    return counts;
  };
  let typeCounts = new Map();
  let decade = -1;
  // One target through the cascade, free of the plan and of `busy`: its
  // placement, or `null` when the night has no room for it.
  const tryPlace = (candidate, busy) => {
    const recommended = recommendedFor(candidate);
    const placeIn = (card) =>
      plannedItemPlacement({
        card,
        night,
        items: busyItems(
          layout === "list" && enhanced
            ? []
            : mergeIntervals([...planBusy, ...busy]),
        ),
        recommendedMinutes: recommended,
        minimumMinutes: minimum,
      });
    const refused = (placement) =>
      placement.reason === "overlap-fallback" ||
      placement.durationMinutes < minimum ||
      placement.startMinute < window.start ||
      placement.endMinute > window.end;
    // « Observation confortable »: first inside the comfortable minutes, by
    // the same cascade; where it would be without the switch otherwise.
    const comfortPlacement = candidate.comfortRooms?.length
      ? placeIn({
          ...cardWithinNightSpan(candidate.card, span),
          visibilityWindows: candidate.comfortRooms.map((room) => ({
            start: iso(nightStart + room.start * minuteMs),
            end: iso(nightStart + room.end * minuteMs),
          })),
        })
      : null;
    const placement =
      comfortPlacement && !refused(comfortPlacement)
        ? comfortPlacement
        : placeIn(cardWithinNightSpan(candidate.card, span));
    return refused(placement) ? null : placement;
  };
  const overCap = (candidate, counts) =>
    enhanced &&
    candidate.type &&
    (counts.get(candidate.type) || 0) >= suggestionRule.maximumPerType;
  // "Idéal": one at a time through the cascade ("Rapproché" chains below).
  for (const candidate of chained ? [] : applyPool) {
    if (placed.length + keptItems.length >= maximum) break;
    if (enhanced) {
      const nextDecade = Math.floor(
        (placed.length + keptItems.length) / suggestionRule.tierSize,
      );
      if (decade !== nextDecade) {
        decade = nextDecade;
        typeCounts = keptTypeCounts(decade);
      }
      if (overCap(candidate, typeCounts)) continue;
    }
    const placement = tryPlace(candidate, placedBusy);
    if (!placement) continue;
    placedBusy.push({ start: placement.startMinute, end: placement.endMinute });
    placed.push({ candidate, placement });
    if (enhanced && candidate.type)
      typeCounts.set(candidate.type, (typeCounts.get(candidate.type) || 0) + 1);
  }
  // A night better filled is worth more than a pure ranking: when the cascade in ranking order places fewer targets than
  // asked — a better-ranked target took the evening's slot of one whose
  // window closes early —, the best-ranked set that the night can hold is
  // placed again with the target whose window closes first going first. The
  // ranking keeps its place in the order shown and in the rank; the set
  // wins only when it holds more targets. The independent list (`list`)
  // and « Rapproché » keep their own rules.
  const wanted = Math.min(maximum - keptItems.length, applyPool.length);
  if (
    enhanced &&
    layout !== "list" &&
    !chained &&
    Number.isFinite(wanted) &&
    placed.length < wanted
  ) {
    const closes = (candidate) => {
      const ends = qualityMinutes(
        cardWithinNightSpan(candidate.card, span),
        window,
      )
        .map((entry) => Math.min(entry.end, window.end))
        .filter((end) => end > window.start);
      return ends.length ? Math.max(...ends) : window.end;
    };
    // The set in one order: its placements, or `null` when one finds no room.
    const inOrder = (order) => {
      const busy = [];
      const out = [];
      for (const candidate of order) {
        const placement = tryPlace(candidate, busy);
        if (!placement) return null;
        busy.push({ start: placement.startMinute, end: placement.endMinute });
        out.push({ candidate, placement });
      }
      return out;
    };
    // The window that closes first goes first; a small set (five targets at
    // most) also tries its other orders, close-first ones first, since a slot
    // taken at its best moment can leave a neighbour no room.
    const placeAll = (set) => {
      const first = set
        .map((candidate, index) => ({
          candidate,
          index,
          close: closes(candidate),
        }))
        .sort(
          (left, right) => left.close - right.close || left.index - right.index,
        )
        .map(({ candidate }) => candidate);
      const direct = inOrder(first);
      if (direct || first.length > 5) return direct;
      const permute = (head, rest) => {
        if (!rest.length)
          return head.length === first.length ? inOrder(head) : null;
        for (let index = 0; index < rest.length; index += 1) {
          const found = permute(
            [...head, rest[index]],
            [...rest.slice(0, index), ...rest.slice(index + 1)],
          );
          if (found) return found;
        }
        return null;
      };
      return permute([], first);
    };
    const counts = keptTypeCounts(
      Math.floor(keptItems.length / suggestionRule.tierSize),
    );
    let chosen = [];
    let best = null;
    for (const candidate of applyPool.slice(0, wanted + 8)) {
      if (chosen.length >= wanted) break;
      if (overCap(candidate, counts)) continue;
      const tried = placeAll([...chosen, candidate]);
      if (!tried) continue;
      chosen = [...chosen, candidate];
      best = tried;
      if (enhanced && candidate.type)
        counts.set(candidate.type, (counts.get(candidate.type) || 0) + 1);
    }
    if (best && best.length > placed.length) {
      // Kept in ranking order, as the cascade gives them.
      const rank = new Map(
        applyPool.map((candidate, index) => [candidate, index]),
      );
      best.sort(
        (left, right) => rank.get(left.candidate) - rank.get(right.candidate),
      );
      placed.splice(0, placed.length, ...best);
      placedBusy.splice(
        0,
        placedBusy.length,
        ...best.map(({ placement }) => ({
          start: placement.startMinute,
          end: placement.endMinute,
        })),
      );
    }
  }
  // "Rapproché": a greedy chain over the ranked pool. From the start
  // of the window, at each step the best-ranked target that can start at the
  // cursor (inside its quality window, free of the plan), else the
  // best-ranked one that can start within `chainedWaitMaximumMinutes` of it;
  // its slot is the suggestion's own, cut at the end of its window down to
  // the minimum only. The plan's items and the kept targets stay where they
  // are and are links of the chain: one reached hands the cursor its end.
  // When nothing follows within the wait the chain hops over the next plan
  // item, else it stops there (`stoppedAt`) and says why. Two exceptions:
  // the first target of a window that starts free may start later (no target
  // is waited for), and the ticked targets of `only` are never dropped for
  // the wait (the person chose them): the next one starts at its earliest.
  let stoppedAt = null;
  if (chained) {
    const wait = autoFillRule.chainedWaitMaximumMinutes;
    // Where each target is visible inside the span, and free of the plan.
    let rest = applyPool.map((candidate) => ({
      candidate,
      slot: recommendedFor(candidate),
      rooms: mergeIntervals(
        qualityMinutes(cardWithinNightSpan(candidate.card, span), window)
          .map((entry) => ({
            start: Math.max(entry.start, window.start),
            end: Math.min(entry.end, window.end),
          }))
          .filter((entry) => entry.end > entry.start),
      ).flatMap((entry) => freeWithin(entry, planBusy)),
    }));
    // « Observation confortable »: the same rooms, inside the range.
    for (const entry of rest)
      entry.comfortRooms = entry.candidate.comfortRooms
        ? roomsWithin(entry.rooms, entry.candidate.comfortRooms)
        : null;
    // The earliest slot of a target from `cursor`: the first room that holds
    // the slot, or at least the minimum; `null` when none is left.
    const earliestIn = (rooms, slot, cursor) => {
      for (const room of rooms) {
        if (room.end <= cursor) continue;
        const from = Math.max(room.start, cursor);
        const length = room.end - from;
        if (length < slot && length < minimum) continue;
        return {
          from,
          to: from + Math.min(slot, length),
          reason: length >= slot ? "chained" : "shortened",
        };
      }
      return null;
    };
    // « Observation confortable »: the earliest comfortable slot when it
    // starts within the wait, else the earliest slot.
    const earliestFrom = ({ slot, rooms, comfortRooms }, cursor) => {
      const easy = comfortRooms ? earliestIn(comfortRooms, slot, cursor) : null;
      return easy && easy.from - cursor <= wait
        ? { ...easy, comfortable: true }
        : earliestIn(rooms, slot, cursor);
    };
    let cursor = window.start;
    let anchored = false;
    while (placed.length + keptItems.length < maximum) {
      const inside = planBusy.find(
        (busy) => busy.start <= cursor && cursor < busy.end,
      );
      if (inside) {
        cursor = inside.end;
        anchored = true;
        continue;
      }
      const nextDecade = Math.floor(
        (placed.length + keptItems.length) / suggestionRule.tierSize,
      );
      if (decade !== nextDecade) {
        decade = nextDecade;
        typeCounts = keptTypeCounts(decade);
      }
      // In rank order, the targets still open, with their earliest slot.
      const options = [];
      for (const entry of rest) {
        const { type } = entry.candidate;
        if (
          type &&
          (typeCounts.get(type) || 0) >= suggestionRule.maximumPerType
        )
          continue;
        const slot = earliestFrom(entry, cursor);
        if (slot) options.push({ entry, ...slot });
      }
      if (!options.length) break;
      const nextBusy = planBusy.find((busy) => busy.start >= cursor);
      let anchor = cursor;
      if (!options.some((option) => option.from - cursor <= wait)) {
        const earliest = Math.min(...options.map((option) => option.from));
        if (anchored && !onlyIds) {
          if (nextBusy) {
            cursor = nextBusy.end;
            continue;
          }
          stoppedAt = cursor;
          break;
        }
        if (nextBusy && nextBusy.start < earliest) {
          cursor = nextBusy.end;
          anchored = true;
          continue;
        }
        anchor = earliest;
      }
      // « Observation confortable »: a target in its comfortable range at
      // this link of the chain first, in rank order; else as without it.
      const chosen =
        options.find(
          (option) => option.comfortable && option.from - anchor <= wait,
        ) ??
        options.find((option) => option.from === anchor) ??
        options.find((option) => option.from - anchor <= wait);
      placed.push({
        candidate: chosen.entry.candidate,
        placement: {
          startMinute: chosen.from,
          endMinute: chosen.to,
          reason: chosen.reason,
        },
        follows: placed.length > 0,
      });
      placedBusy.push({ start: chosen.from, end: chosen.to });
      const { type } = chosen.entry.candidate;
      if (type) typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
      rest = rest.filter((entry) => entry !== chosen.entry);
      cursor = chosen.to;
      anchored = true;
    }
  }
  // TONIGHT-SCORE-WINDOW-01: the rank of each target in the proposal (« 12ᵉ »
  // on the list's later pages), in the order it was placed, before the list
  // is laid out by its start.
  if (enhanced && layout === "list")
    placed.forEach((entry, index) => {
      entry.rank = (ranking?.position?.from ?? 1) + index;
    });
  placed.sort(
    (left, right) => left.placement.startMinute - right.placement.startMinute,
  );

  // 4a. Why each target is where it is.
  const dewEntry = rows.find(({ row }) => isDew(row));
  const dewMinute = dewEntry ? (dewEntry.time - nightStart) / minuteMs : null;
  // The score of the target at its slot, "Rapproché" only; "Idéal" keeps
  // the night's.
  // With periods, never above the score over the periods.
  const scoreAt = (candidate, from, to) => {
    if (!chained || !candidate.score) return candidate.score;
    const slot = targetSlotScore({
      score: candidate.scoreSource,
      card: candidate.card,
      start: nightStart + from * minuteMs,
      end: nightStart + to * minuteMs,
    });
    return periods && slot
      ? { total: Math.min(slot.total, candidate.score.total), max: slot.max }
      : slot;
  };
  const proposedItem = ({ candidate, placement, follows = false, rank }) => {
    const start = placement.startMinute;
    const end = placement.endMinute;
    const peak = peakWithin(candidate.samples, start, end);
    const maxAltitude = round(peak.altitude);
    const transit = candidate.transit;
    let reason;
    if (transit && transit.minute >= start && transit.minute <= end) {
      reason =
        dewMinute !== null && transit.minute < dewMinute
          ? {
              kind: "culmination-before-dew",
              time: iso(nightStart + transit.minute * minuteMs),
            }
          : {
              kind: "meridian",
              time: iso(nightStart + transit.minute * minuteMs),
            };
    } else if (
      start - window.start <= autoFillRule.duskToleranceMinutes &&
      altitudeAt(candidate.samples, start) >= autoFillRule.highFromDuskDegrees
    ) {
      reason = {
        kind: "high-from-dusk",
        altitude: round(altitudeAt(candidate.samples, start)),
        dualBand: dualBand(candidate.card.target, mode, ownedFilters),
      };
    } else if (follows) {
      reason = { kind: "follows", altitude: maxAltitude };
    } else {
      reason = {
        kind: "best-window",
        altitude: maxAltitude,
        time: iso(nightStart + round(peak.minute) * minuteMs),
      };
    }
    const extra = enhanced
      ? {
          score: scoreAt(candidate, start, end),
          type: candidate.type ?? null,
          group: candidate.group ?? "night",
          progress: candidate.progress ?? null,
          tier: candidate.tier ?? 1,
          lowered: candidate.lowered ?? false,
          // The last time of a target already done, when there is one.
          ...(candidate.previous ? { previous: candidate.previous } : {}),
          kept: false,
          // « Observation confortable »: whether the slot is in the range.
          ...(comfortable
            ? {
                comfortable: (candidate.comfortRooms ?? []).some(
                  (room) => room.start <= start && end <= room.end,
                ),
              }
            : {}),
        }
      : {};
    if (enhanced && layout === "list") {
      extra.rank = rank ?? null;
      const best = qualityMinutes(
        cardWithinNightSpan(candidate.card, span),
        window,
      )
        .map((entry) => ({
          start: Math.max(window.start, entry.start),
          end: Math.min(window.end, entry.end),
        }))
        .filter((entry) => entry.end > entry.start)
        .sort(
          (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
        )[0];
      extra.bestWindow = best
        ? {
            start: iso(nightStart + best.start * minuteMs),
            end: iso(nightStart + best.end * minuteMs),
            startMinute: best.start,
            endMinute: best.end,
          }
        : null;
      // The list's height is the maximum inside its best window, not the
      // independently placed imaging slot.
      if (best)
        extra.maxAltitude = round(
          peakWithin(candidate.samples, best.start, best.end).altitude,
        );
    }
    // SUGGEST-FILTERS-01: the mask ignored, when the target spends part of
    // its best window (the list) or of its slot behind it.
    if (enhanced && Array.isArray(candidate.card.maskHidden)) {
      const best = extra.bestWindow;
      extra.maskHidden = hiddenWithin(
        candidate.card.maskHidden,
        nightStart + (best ? best.startMinute : start) * minuteMs,
        nightStart + (best ? best.endMinute : end) * minuteMs,
      );
    }
    return {
      target: targetOf(candidate.card.target),
      start: iso(nightStart + start * minuteMs),
      end: iso(nightStart + end * minuteMs),
      startMinute: start,
      endMinute: end,
      durationMinutes: end - start,
      maxAltitude,
      placement: placement.reason,
      reason,
      ...extra,
    };
  };
  const proposed = placed.map(proposedItem);
  for (const keptItem of keptItems) {
    const id = String(keptItem.id ?? keptItem.target?.id);
    const entry = (Array.isArray(candidates) ? candidates : []).find(
      (entry) => String(entry?.card?.target?.id) === id,
    );
    let base = {
      score: null,
      type: null,
      group: "night",
      progress: null,
      tier: 1,
      lowered: false,
      maxAltitude: null,
      placement: null,
      reason: null,
    };
    if (entry?.card?.target) {
      const samples = altitudeSamples(entry.card, nightStart);
      const culmination = culminationOf(entry.card, night, samples, total);
      const continuingItem = continuing.find(
        (row) => String(row.id) === id && row.acquiredMinutes < row.goalMinutes,
      );
      base = proposedItem({
        candidate: {
          id,
          card: entry.card,
          score: entry.score
            ? { total: entry.score.total, max: entry.score.max }
            : null,
          scoreSource: entry.score ?? null,
          samples,
          transit: culmination && !culmination.peak ? culmination : null,
          type: recommendationTypeFor(entry.card.target) || null,
          group: continuingItem ? "continue" : "night",
          progress: continuingItem
            ? {
                acquiredMinutes: continuingItem.acquiredMinutes,
                goalMinutes: continuingItem.goalMinutes,
                projectName: continuingItem.projectName ?? "",
              }
            : null,
        },
        placement: {
          startMinute: keptItem.startMinute,
          endMinute: keptItem.endMinute,
          reason: keptItem.placement ?? "ideal",
        },
      });
    }
    proposed.push({
      ...base,
      target: base.target ?? { id, designation: "", title: "" },
      start: iso(nightStart + keptItem.startMinute * minuteMs),
      end: iso(nightStart + keptItem.endMinute * minuteMs),
      durationMinutes: keptItem.endMinute - keptItem.startMinute,
      ...keptItem,
      kept: true,
    });
  }
  if (enhanced && layout !== "list")
    proposed.sort((a, b) => a.startMinute - b.startMinute);

  // 4b. Why each free slot is left.
  const remaining = freeWithin(
    { start: window.start, end: window.end },
    mergeIntervals([
      ...planBusy,
      ...(enhanced && layout === "list" ? [] : placedBusy),
    ]),
  );
  const gapMinimum = chained
    ? autoFillRule.chainedGapMinimumMinutes
    : autoFillRule.freeSlotMinimumMinutes;
  const left = remaining.filter((slot) => slot.end - slot.start >= gapMinimum);
  const limitReached = proposed.length >= maximum;
  const takenIds = new Set(placed.map(({ candidate }) => candidate.id));
  // Whether a candidate (not placed, when `unplacedOnly`) is up for the
  // shortest slot or longer inside `slot`.
  const visibleIn = (slot, unplacedOnly) =>
    pool.some(
      (candidate) =>
        !(unplacedOnly && takenIds.has(candidate.id)) &&
        qualityMinutes(cardWithinNightSpan(candidate.card, span), window).some(
          (entry) =>
            Math.min(entry.end, slot.end) - Math.max(entry.start, slot.start) >=
            minimum,
        ),
    );
  const free = left.map((slot) => {
    const from = nightStart + slot.start * minuteMs;
    const to = nightStart + slot.end * minuteMs;
    const minutes = slot.end - slot.start;
    const covering = overlapping(rows, from, to);
    const clouds = covering.filter(({ row }) => finite(row.cloud));
    const cloud = clouds.length
      ? clouds.reduce((sum, { row }) => sum + row.cloud, 0) / clouds.length
      : null;
    let reason;
    if (minutes < minimum) reason = { kind: "short" };
    // "Rapproché": where the chain stopped, nothing following within the wait.
    else if (slot.start === stoppedAt)
      reason = {
        kind: "no-follower",
        wait: autoFillRule.chainedWaitMaximumMinutes,
      };
    else if (cloud !== null && cloud >= autoFillRule.cloudyPercent)
      reason = { kind: "clouds", cloud: round(cloud) };
    else if (!enhanced && !visibleIn(slot, false))
      reason = { kind: "no-target" };
    else if (limitReached && visibleIn(slot, true)) reason = { kind: "limit" };
    else if (covering.some(({ row }) => isDew(row))) reason = { kind: "dew" };
    // "Après 21:09, Lune levée" is only said of a stretch the Moon is up
    // over from end to end; a stretch the Moon leaves before the night ends
    // (it sets at 01:49, the night runs to 04:31) is not "Lune levée" --
    // the sentence would be false for what follows moonset.
    else if (
      nightSpanMoonIntervals(moonSeries, from, to).reduce(
        (sum, period) =>
          sum + (Date.parse(period.end) - Date.parse(period.start)) / minuteMs,
        0,
      ) >= minutes
    )
      reason = { kind: "moon" };
    else if (enhanced && !visibleIn(slot, false))
      reason = { kind: "no-target" };
    else reason = { kind: "nothing" };
    return {
      start: iso(from),
      end: iso(to),
      startMinute: slot.start,
      endMinute: slot.end,
      minutes,
      reason,
    };
  });

  let extra = {};
  if (enhanced) {
    const freeMinutes = remaining.reduce(
      (sum, slot) => sum + slot.end - slot.start,
      0,
    );
    // The stretch where the chain stopped, else the longest free one.
    const longest =
      free.find((slot) => slot.reason.kind === "no-follower") ??
      free
        .filter((slot) => slot.minutes >= minimum)
        .sort(
          (a, b) => b.minutes - a.minutes || a.startMinute - b.startMinute,
        )[0];
    const shortfall =
      requested !== "all" &&
      proposed.length < (layout === "list" ? 10 : requested)
        ? longest
          ? {
              ...longest.reason,
              start: longest.start,
              startMinute: longest.startMinute,
              minutes: longest.minutes,
            }
          : { kind: "short", freeMinutes, minimumMinutes: minimum }
        : null;
    extra = {
      requested: layout === "list" ? 10 : requested,
      placed: proposed.length,
      shortfall,
      position: ranking.position,
      estimate,
      captured: ranking.captured,
    };
  }

  return {
    window: {
      start: iso(nightStart + window.start * minuteMs),
      end: iso(nightStart + window.end * minuteMs),
      startMinute: window.start,
      endMinute: window.end,
    },
    items: proposed,
    free,
    imagingMinutes: proposed.reduce(
      (sum, entry) => sum + entry.durationMinutes,
      0,
    ),
    freeMinutes: free.reduce((sum, entry) => sum + entry.minutes, 0),
    ...extra,
    // SUGGEST-FILTERS-01: the stretches the periods left (empty: none).
    ...(periods
      ? {
          spans: periods.map((period) => ({
            start: iso(nightStart + period.start * minuteMs),
            end: iso(nightStart + period.end * minuteMs),
            startMinute: period.start,
            endMinute: period.end,
          })),
        }
      : {}),
  };
}

// SUGGEST-FILTERS-01: `spans` in whole minutes after the start of the night
// (the start rounded up, the end down, as `windowOf`), cut by the window,
// merged, earliest first.
function periodMinutes(spans, window) {
  return mergeIntervals(
    spans
      .map((entry) => {
        const start = instant(entry?.start);
        const end = instant(entry?.end);
        if (start === null || end === null) return null;
        return {
          start: clamp(
            Math.ceil((start - window.nightStart) / minuteMs),
            window.start,
            window.end,
          ),
          end: clamp(
            Math.floor((end - window.nightStart) / minuteMs),
            window.start,
            window.end,
          ),
        };
      })
      .filter((entry) => entry !== null && entry.end > entry.start),
  );
}

// The first of `hidden` (`[{ start, end }]`, ISO) inside `[from, to]` (ms),
// cut to it: `{ start, end }` in ISO, `null` when none falls there.
function hiddenWithin(hidden, from, to) {
  for (const entry of hidden) {
    const start = Math.max(instant(entry?.start) ?? Infinity, from);
    const end = Math.min(instant(entry?.end) ?? -Infinity, to);
    if (end > start) return { start: iso(start), end: iso(end) };
  }
  return null;
}
