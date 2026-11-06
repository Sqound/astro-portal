import { normaliseMeridianLimit } from "./constraints.js";
import { availabilityWindow } from "./recommendations.js";

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

// An item's effective [start, end] minutes: the stored minutes when present,
// otherwise the card's own availability window; an end with no stored start
// still defaults its duration to 60 minutes. Always clamped to the night.
export function plannedWindow(item, card, night) {
  const availability = availabilityWindow(card, night);
  const start = clamp(
    Number.isFinite(item.startMinute) ? item.startMinute : availability.start,
    0,
    availability.total,
  );
  const end = clamp(
    Number.isFinite(item.endMinute)
      ? item.endMinute
      : Math.min(availability.end, start + (item.durationMinutes || 60)),
    start,
    availability.total,
  );
  return {
    ...availability,
    availability,
    start,
    end: Math.max(start, end),
  };
}

export const scheduleSnapMinutes = 8;

// Used by the end handle, which only ever changes the end; the start handle
// has its own rule (`scheduleStartUpdate`) and moving the whole slot its own
// (`scheduleWindowShift`).
export function snapToScheduleEdge(value, itemId, schedule, minimum, maximum) {
  const bounded = clamp(value, minimum, maximum);
  const edges = schedule
    .filter((entry) => entry.item.id !== itemId)
    .flatMap((entry) => [entry.window.start, entry.window.end])
    .filter((edge) => edge >= minimum && edge <= maximum);
  const closest = edges.reduce(
    (current, edge) =>
      !current || Math.abs(edge - bounded) < Math.abs(current - bounded)
        ? edge
        : current,
    null,
  );
  return closest !== null && Math.abs(closest - bounded) <= scheduleSnapMinutes
    ? { value: closest, snapped: true }
    : { value: bounded, snapped: false };
}

// A target culminates as it crosses the local meridian. The planner samples
// the sky every ten minutes, so interpolate around an interior altitude peak
// to place the scheduling marker between those samples when possible.
export function meridianTransit(card, night) {
  const series = Array.isArray(card?.series) ? card.series : [];
  if (series.length < 3) return null;
  const peakIndex = series.reduce(
    (bestIndex, point, index) =>
      Number(point?.altitude) > Number(series[bestIndex]?.altitude)
        ? index
        : bestIndex,
    0,
  );
  if (peakIndex === 0 || peakIndex === series.length - 1) return null;
  const before = series[peakIndex - 1];
  const peak = series[peakIndex];
  const after = series[peakIndex + 1];
  const beforeAltitude = Number(before?.altitude);
  const peakAltitude = Number(peak?.altitude);
  const afterAltitude = Number(after?.altitude);
  const peakTime = new Date(peak?.time).getTime();
  const beforeTime = new Date(before?.time).getTime();
  const afterTime = new Date(after?.time).getTime();
  const nightStart = new Date(night?.start).getTime();
  const nightEnd = new Date(night?.end).getTime();
  if (
    ![
      beforeAltitude,
      peakAltitude,
      afterAltitude,
      peakTime,
      beforeTime,
      afterTime,
      nightStart,
      nightEnd,
    ].every(Number.isFinite) ||
    peakAltitude <= 0
  )
    return null;
  const denominator = beforeAltitude - 2 * peakAltitude + afterAltitude;
  const offset =
    denominator < 0
      ? clamp((0.5 * (beforeAltitude - afterAltitude)) / denominator, -0.5, 0.5)
      : 0;
  const curveA = denominator / 2;
  const curveB = (afterAltitude - beforeAltitude) / 2;
  const transitAltitude = clamp(
    peakAltitude + curveA * offset ** 2 + curveB * offset,
    0,
    90,
  );
  const transitTime =
    offset < 0
      ? peakTime + offset * (peakTime - beforeTime)
      : peakTime + offset * (afterTime - peakTime);
  const total = Math.round((nightEnd - nightStart) / 60000);
  const minute = Math.round((transitTime - nightStart) / 60000);
  if (!Number.isFinite(total) || minute < 0 || minute > total) return null;
  return { minute, altitude: transitAltitude };
}

// MERIDIAN-LIMIT-02a. How long a flip takes is NOT measured yet: 8 minutes is
// a PROVISIONAL value (MERIDIAN-LIMIT-02b measures it on the AM5N / SynScan
// bench). Fixtures name it `provisional`; do not treat it as a datum.
export const meridianFlipMinutesProvisional = 8;

// Only a mount that may have to flip at the meridian carries the setting: the
// equatorial, the hybrid, and a mount whose kind is not known (a mount typed
// by hand: the person who enters an N says it flips). An alt-az mount, a
// tracker and a smart telescope's built-in mount never flip.
export function mountFlipsAtMeridian(mount) {
  if (!mount) return false;
  if (String(mount.id ?? "").startsWith("integrated-")) return false;
  return mount.kind !== "altaz" && mount.kind !== "tracker";
}

// Cut a slot at the meridian: the slot keeps its bounds, a mark is placed at
// meridian + N, and the flip duration is taken off the useful time. Pure and
// shared with the mobile application.
//
//   window: { start, end } in minutes of the night.
//   mount:  { kind, meridianLimitMinutes } of the plan's mount, or null.
//   safety: the plan's mountSafety; `meridianCut` (default on) and
//           `meridianLimitMinutes` (the plan's own value, over the mount's).
//   options.flipMinutes: the flip's duration (provisional default above).
//
// Returns null when nothing is cut: not a flipping mount, no N, the cut is
// off, the target does not culminate in the night, or the slot ends before /
// starts after meridian + N (a slot that starts after it is reached by a
// GoTo on the right side).
export function meridianCut(window, card, night, mount, safety, options) {
  if (!mountFlipsAtMeridian(mount)) return null;
  if (safety?.meridianCut === false) return null;
  const own = normaliseMeridianLimit(safety?.meridianLimitMinutes);
  const limit = own ?? normaliseMeridianLimit(mount.meridianLimitMinutes);
  if (limit === null) return null;
  const transit = meridianTransit(card, night);
  if (!transit) return null;
  const start = Number(window?.start);
  const end = Number(window?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const mark = transit.minute + limit;
  if (!(start < mark && end > mark)) return null;
  const flipRaw = Number(options?.flipMinutes);
  const flipMinutes =
    Number.isFinite(flipRaw) && flipRaw >= 0
      ? flipRaw
      : meridianFlipMinutesProvisional;
  return {
    transitMinute: transit.minute,
    limitMinutes: limit,
    markMinute: mark,
    flipMinutes,
    flipEndMinute: Math.min(mark + flipMinutes, end),
    usefulMinutes: Math.max(0, end - start - flipMinutes),
    inherited: own === null,
  };
}

// Where an item's window overlaps the other items' windows, merged: the
// editor draws these stretches. An overlap changes nothing in what a handle
// does (the left handle is always the start, the right one always the end).
export function overlapSegments(entry, schedule) {
  return schedule
    .filter((other) => other.item.id !== entry.item.id)
    .map((other) => ({
      start: Math.max(entry.window.start, other.window.start),
      end: Math.min(entry.window.end, other.window.end),
    }))
    .filter((segment) => segment.end > segment.start)
    .sort((left, right) => left.start - right.start)
    .reduce((segments, segment) => {
      const previous = segments.at(-1);
      if (previous && segment.start <= previous.end) {
        previous.end = Math.max(previous.end, segment.end);
      } else {
        segments.push(segment);
      }
      return segments;
    }, []);
}

// The left handle: it always changes the start, never the end -- even while
// the slot overlaps another target's (the former
// "shift the whole window" mode switched meaning without any sign and
// blocked the start of a late target). Bounded by the night's start and by
// the end less the minimum duration; snaps to another target's edge within
// `snapMinutes`.
export function scheduleStartUpdate({
  value,
  itemId,
  schedule,
  window,
  snapMinutes = scheduleSnapMinutes,
  minimumDuration = 5,
}) {
  const maximum = Math.max(0, window.end - minimumDuration);
  const bounded = clamp(value, 0, maximum);
  const edges = schedule
    .filter((entry) => entry.item.id !== itemId)
    .flatMap((entry) => [entry.window.start, entry.window.end])
    .filter((edge) => edge >= 0 && edge <= maximum);
  const closest = edges.reduce(
    (current, edge) =>
      current === null || Math.abs(edge - bounded) < Math.abs(current - bounded)
        ? edge
        : current,
    null,
  );
  const snapped =
    closest !== null && Math.abs(closest - bounded) <= snapMinutes;
  return { snapped, patch: { startMinute: snapped ? closest : bounded } };
}

// Moving the whole slot (a long press on the selected range, then a drag;
// on the web, pressing and dragging the range): `value` is the start the
// finger asks for. The duration is kept; the slot stays inside the night;
// either of its edges snaps to another target's edge within `snapMinutes`
// (its start on that edge, or its end on it). `snappedEdge` says which.
export function scheduleWindowShift({
  value,
  itemId,
  schedule,
  window,
  total,
  snapMinutes = scheduleSnapMinutes,
}) {
  const duration = Math.max(0, window.end - window.start);
  const maximum = Math.max(0, total - duration);
  const bounded = clamp(value, 0, maximum);
  const candidates = schedule
    .filter((entry) => entry.item.id !== itemId)
    .flatMap((entry) => [entry.window.start, entry.window.end])
    .flatMap((edge) => [
      { start: edge, edge: "start" },
      { start: edge - duration, edge: "end" },
    ])
    .filter((candidate) => candidate.start >= 0 && candidate.start <= maximum);
  const closest = candidates.reduce(
    (current, candidate) =>
      current === null ||
      Math.abs(candidate.start - bounded) < Math.abs(current.start - bounded)
        ? candidate
        : current,
    null,
  );
  const snapped =
    closest !== null && Math.abs(closest.start - bounded) <= snapMinutes;
  const startMinute = snapped ? closest.start : bounded;
  return {
    snapped,
    snappedEdge: snapped ? closest.edge : null,
    patch: { startMinute, endMinute: startMinute + duration },
  };
}

// The bounds, in minutes from the start of the night, the extend button (↔)
// may reach: the plan's chosen span (`{ start, end }`,
// instants) brought into [0, total] when it chose one, else the whole night.
// A span that cannot be read, or that is empty once clamped, is the whole
// night.
export function scheduleExtendBounds({ nightStart, total, span = null }) {
  const origin = Date.parse(nightStart ?? "");
  const spanStart = Date.parse(span?.start ?? "");
  const spanEnd = Date.parse(span?.end ?? "");
  if (![origin, spanStart, spanEnd].every(Number.isFinite))
    return { start: 0, end: total };
  const minutes = (instant) => Math.round((instant - origin) / 60000);
  const start = clamp(minutes(spanStart), 0, total);
  const end = clamp(minutes(spanEnd), 0, total);
  return end > start ? { start, end } : { start: 0, end: total };
}

// The extend button (↔): the slot grows to the room it has, from the end of
// the target before it to the start of the target after it, or to the
// start / the end of the night (`bounds`, `scheduleExtendBounds`) where
// nothing lies on that side. It never shrinks: an edge already past a bound
// stays. A target that overlaps the slot bounds neither side. Returns the
// patch to write. (Earlier ↔ copied the card's usable window instead, and a
// slot the placement had already shaped to it came back unchanged.)
export function scheduleExtendPatch({ itemId, window, schedule, bounds }) {
  let lower = bounds.start;
  let upper = bounds.end;
  for (const entry of schedule) {
    if (entry.item.id === itemId) continue;
    if (entry.window.end <= window.start && entry.window.end > lower)
      lower = entry.window.end;
    if (entry.window.start >= window.end && entry.window.start < upper)
      upper = entry.window.start;
  }
  const startMinute = Math.min(lower, window.start);
  const endMinute = Math.max(upper, window.end);
  return {
    startMinute,
    endMinute,
    durationMinutes: endMinute - startMinute,
  };
}

// The stage-5 frise
// puts every slot of the plan on one row. The slots are painted by start, then
// by end, then in list order, so that of two slots that overlap the later lies
// over the earlier (and takes the touch); `entries` are `{ item, window }`.
export function scheduleRowOrder(entries) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (first, second) =>
        first.entry.window.start - second.entry.window.start ||
        first.entry.window.end - second.entry.window.end ||
        first.index - second.index,
    )
    .map(({ entry }) => entry);
}

// The order number of the night of each slot (1, 2…), in the order of the row:
// what the blocks carry in place of their name in the display "numbers" (the
// numbering of the suggestions' sheet). Read from the plan as it is written, so
// that the numbers stay still while a slot is dragged.
export function scheduleOrderNumbers(entries) {
  return new Map(
    scheduleRowOrder(entries).map((entry, rank) => [entry.item.id, rank + 1]),
  );
}

// Whether a block of [widthPixels] is wide enough to carry its name and its
// duration (its two paddings taken off): a 20 minute block of a long night is a
// block, nothing else.
export const scheduleBlockContentMinWidth = 18;
export function scheduleBlockCarriesContent(widthPixels) {
  return widthPixels - 12 >= scheduleBlockContentMinWidth;
}

// "Laissé": block by block, the target's
// name when it fits whole, otherwise its number (the one of the "numbers"
// display), never a name cut to "M…"; nothing when not even the number fits.
// The room is the block less its 1 px frame and its padding (12.16 px); the number, which has no padding of its own
// there, needs the block less the frame. [measure] returns the width in
// pixels of a text in the name's font (the page measures with a canvas);
// without it (a server render) nothing can be measured and the older rule
// stands: the name when the block carries content, otherwise nothing.
export const scheduleBlockFramePixels = 2;
export const scheduleBlockPaddingPixels = 12.16;
export function scheduleBlockMark({ name, number, widthPixels, measure }) {
  if (typeof measure !== "function") {
    return scheduleBlockCarriesContent(widthPixels) ? "name" : "none";
  }
  const fits = (text, room) => room > 0 && measure(String(text)) <= room + 0.01;
  const nameRoom =
    widthPixels - scheduleBlockFramePixels - scheduleBlockPaddingPixels;
  if (name && fits(name, nameRoom)) return "name";
  if (
    number != null &&
    fits(number, widthPixels - 2 * scheduleBlockFramePixels)
  )
    return "number";
  return "none";
}

// Moving a target onto another. The neighbour in the
// way **resists** (the dragged slot advances at a slope falling from 1 to
// 0.35 over the neighbour's compressible length), is compressed to
// `placementEscapeMinutes`, then **escapes** to the biggest free stretch of the
// night (on a tie, in the direction of the gesture), over another target if it
// must; with no free stretch it is compressed on to `placementFloorMinutes`
// and then covered ("plus le temps ce soir": it leaves the frise but is
// never deleted), and the next one resists in its turn. Everything is
// reversible while the finger is down: backing off undoes the scene.
//
// The engine is pure and works in minutes from the start of the night; the
// animation belongs to the screen.
export const placementEscapeMinutes = 10;
export const placementFloorMinutes = 5;
export const placementSlope = 0.35;
// Backing off by this much from the minute a neighbour escaped at brings it back.
export const placementBackMargin = 2;

// The resisted advance o(x) = x - x^2 / (2 S) of the dragged slot after the
// finger went x minutes over a neighbour: slope 1 at 0, `slope` at `reach`,
// where o(reach) = `length` (the neighbour's compressible length).
function resistanceCurve(length, slope = placementSlope) {
  const k = 1 - slope;
  const span = length / (k - (k * k) / 2);
  return { span, reach: k * span };
}

function resisted(x, span) {
  return x - (x * x) / (2 * span);
}

// The free stretches of [lo, hi] at least `minimum` long between `occupied`
// ({ start, end }).
export function freeStretches(occupied, lo, hi, minimum) {
  const stretches = [];
  let cursor = lo;
  for (const entry of [...occupied].sort((a, b) => a.start - b.start)) {
    if (entry.start - cursor >= minimum - 1e-9)
      stretches.push({ start: cursor, end: entry.start });
    cursor = Math.max(cursor, entry.end);
  }
  if (hi - cursor >= minimum - 1e-9) stretches.push({ start: cursor, end: hi });
  return stretches;
}

// One pass in the +1 direction. `items` are `{ id, start, end, side, fixed }`
// (`side` "ahead" of the gesture is pushed, "behind" is not; `fixed` never
// moves); `moving` is `{ duration }`; `finger` the start the finger asks for.
// Returns `{ hop }` when a neighbour must escape first, else the layout.
function solveForward(items, moving, finger, lo, hi, hiEnd, floorStart = lo) {
  const duration = moving.duration;
  const fingerEnd = finger + duration;
  const ahead = items
    .filter((item) => item.side === "ahead" && !item.fixed)
    .sort((a, b) => a.start - b.start);
  const layout = {};
  for (const item of items)
    layout[item.id] = { start: item.start, end: item.end, state: "solid" };
  let lag = 0;
  let lead = fingerEnd;
  const reachable = ahead.filter((item) => item.start < hiEnd);
  for (let index = 0; index < reachable.length; index += 1) {
    const item = reachable[index];
    const length = item.end - item.start;
    const x = fingerEnd - lag - item.start;
    if (x <= 0) {
      lead = fingerEnd - lag;
      break;
    }
    const wall = index === reachable.length - 1 && fingerEnd >= hiEnd - 2;
    const compressible = Math.max(0, length - placementEscapeMinutes);
    const first = resistanceCurve(compressible);
    if (!wall && x < first.reach) {
      const start = item.start + resisted(x, first.span);
      layout[item.id] = { start, end: item.end, state: "compressed" };
      lead = start;
      break;
    }
    const hop = escapeOf(item, items, layout, finger, fingerEnd, lo, hi);
    if (hop) return { hop };
    if (wall) {
      layout[item.id] = {
        start: item.start,
        end: item.start,
        state: "covered",
      };
      lead = fingerEnd - lag;
      break;
    }
    const second = resistanceCurve(
      placementEscapeMinutes - placementFloorMinutes,
    );
    const y = x - first.reach;
    if (y < second.reach) {
      const start = item.start + compressible + resisted(y, second.span);
      layout[item.id] = { start, end: item.end, state: "squeezed" };
      lead = start;
      break;
    }
    lag = Math.max(0, lag + first.reach + second.reach - length);
    layout[item.id] = { start: item.start, end: item.start, state: "covered" };
    lead = fingerEnd - lag;
  }
  // A neighbour that escaped behind the dragged slot may be reached by the
  // slot's own lag (it is held back by the next one): it yields its end.
  const start = lead - duration;
  for (const item of items) {
    if (item.side !== "behind" || item.fixed || item.end <= start) continue;
    if (item.start >= finger || layout[item.id].state === "covered") continue;
    layout[item.id] = {
      start: item.start,
      end: Math.max(item.start + placementFloorMinutes, start),
      state: "compressed",
    };
  }
  if (start < floorStart - 1e-9) {
    // held back before the floor (the start of the night, "now", the end of
    // a fixed slot): the neighbour holding it yields -- covered if it cannot
    const delta = floorStart - start;
    for (const [id, entry] of Object.entries(layout))
      if (entry.state === "compressed" || entry.state === "squeezed") {
        const moved = entry.start + delta;
        layout[id] =
          moved > entry.end - placementFloorMinutes
            ? { start: entry.start, end: entry.start, state: "covered" }
            : { ...entry, start: moved };
      }
    return { layout, start: floorStart, lead: floorStart + duration };
  }
  return { layout, start, lead };
}

// Where a neighbour that cannot be compressed any more escapes to: the
// biggest free stretch of the night on either side of it (its own slot, the
// finger's, the others' as they stand are taken), the right one on a tie
// (the direction of the gesture); `null` when no stretch is `minimum` long.
function escapeOf(item, items, layout, finger, fingerEnd, lo, hi) {
  const occupied = [
    { start: finger - placementBackMargin, end: fingerEnd },
    { start: item.start, end: item.end },
    ...items
      .filter((other) => other.id !== item.id)
      .map((other) =>
        layout[other.id].state === "covered"
          ? { start: other.start, end: other.end }
          : layout[other.id],
      ),
  ];
  const stretches = freeStretches(occupied, lo, hi, placementEscapeMinutes);
  const centre = (item.start + item.end) / 2;
  const right = stretches.filter((s) => (s.start + s.end) / 2 > centre);
  const left = stretches.filter((s) => (s.start + s.end) / 2 <= centre);
  const biggest = (list) =>
    list.reduce((best, s) => Math.max(best, s.end - s.start), 0);
  const roomRight = biggest(right);
  const roomLeft = biggest(left);
  if (roomRight < placementEscapeMinutes && roomLeft < placementEscapeMinutes)
    return null;
  const length = item.end - item.start;
  const room = { left: roomLeft, right: roomRight };
  if (roomRight >= roomLeft) {
    const target = right
      .filter((s) => s.end - s.start >= roomRight - 1e-9)
      .sort((a, b) => a.start - b.start)[0];
    const size = Math.min(length, target.end - target.start);
    return {
      id: item.id,
      toward: "right",
      room,
      to: { start: target.start, end: target.start + size },
    };
  }
  const target = left
    .filter((s) => s.end - s.start >= roomLeft - 1e-9)
    .sort((a, b) => b.end - a.end)[0];
  const size = Math.min(length, target.end - target.start);
  return {
    id: item.id,
    toward: "left",
    room,
    to: { start: target.end - size, end: target.end },
  };
}

// A drag of one slot: `items` are the plan's slots `{ id, start, end,
// fixed? }` as they stand when the finger goes down (a `fixed` one -- the
// target in progress, one that is past -- is never moved, compressed or
// crossed), `movingId` the slot dragged, `lo` and `hi` the part of the night
// it may take (`lo` is "now" during the night). `update(fingerStart)`
// answers, for the start the finger asks for, where every slot is:
// `{ direction, start, end, items: { [id]: { start, end, state } }, hops,
// resisting }` with `state` one of `solid`, `compressed`, `squeezed`,
// `covered`; `hops` lists the neighbours that escaped during this update
// (`{ id, toward, room, from, to }`). Nothing is rounded: `placementCommit`
// does, at the release.
export function createPlacementGesture({
  items,
  movingId,
  lo = 0,
  hi,
  added = false,
}) {
  const origin = items.map((item) => ({ ...item }));
  const dragged = origin.find((item) => item.id === movingId);
  const duration = dragged.end - dragged.start;
  const others = origin.filter((item) => item.id !== movingId);
  const mirror = (item) => ({
    ...item,
    start: lo + hi - item.end,
    end: lo + hi - item.start,
  });
  let direction = null;
  let current = [];
  let stack = [];
  // How far the finger may go: not through a fixed slot, not out of the night.
  const fixedAhead = others
    .filter((item) => item.fixed && item.start >= dragged.end - 1e-9)
    .map((item) => item.start);
  const fixedBehind = others
    .filter((item) => item.fixed && item.end <= dragged.start + 1e-9)
    .map((item) => item.end);
  const upper = Math.min(hi, ...fixedAhead) - duration;
  const lower = Math.max(lo, ...fixedBehind);

  // The side of each neighbour for a gesture of direction `next`: "ahead" is
  // pushed. A slot being added also pushes what it already covers.
  function reset(next) {
    direction = next;
    stack = [];
    current = others.map((item) => {
      let ahead = false;
      if (next === 1)
        ahead = added ? item.end > dragged.start : item.start >= dragged.start;
      if (next === -1)
        ahead = added ? item.start < dragged.end : item.end <= dragged.end;
      return { ...item, side: ahead ? "ahead" : "behind" };
    });
  }

  // One pass of the scene for a finger of the +1 view (`flip`: mirrored).
  function advance(flip, viewFinger, hops) {
    const viewEnd = viewFinger + duration;
    const hiEnd = flip ? lo + hi - lower : Math.min(hi, ...fixedAhead);
    const view = () => current.map((item) => (flip ? mirror(item) : item));
    while (
      stack.length &&
      viewEnd < stack[stack.length - 1].trigger - placementBackMargin
    )
      current = stack.pop().before;
    for (let pass = 0; pass < 8; pass += 1) {
      const solved = solveForward(
        view(),
        { duration },
        viewFinger,
        lo,
        hi,
        hiEnd,
        flip ? lo + hi - (upper + duration) : lower,
      );
      if (!solved.hop) return solved;
      const hop = solved.hop;
      const to = flip
        ? { start: lo + hi - hop.to.end, end: lo + hi - hop.to.start }
        : hop.to;
      const entry = current.find((item) => item.id === hop.id);
      const escaped = {
        id: hop.id,
        toward: flip ? (hop.toward === "right" ? "left" : "right") : hop.toward,
        room: flip ? { left: hop.room.right, right: hop.room.left } : hop.room,
        from: { start: entry.start, end: entry.end },
        to,
      };
      stack.push({
        trigger: viewEnd,
        before: current.map((item) => ({ ...item })),
        hop: escaped,
      });
      hops.push(escaped);
      entry.start = to.start;
      entry.end = to.end;
      entry.side = hop.toward === "right" ? "ahead" : "behind";
    }
    return null;
  }

  function update(rawFinger) {
    const finger = clamp(rawFinger, lower, Math.max(lower, upper));
    const asked = finger > dragged.start ? 1 : finger < dragged.start ? -1 : 0;
    // A slot being added has no past place to go back to: where it is put
    // already pushes what it covers.
    const next = asked === 0 && added ? 1 : asked;
    const fresh = next !== direction;
    if (fresh) reset(next);
    const hops = [];
    if (next === 0) return result(0, dragged.start, hops, false);
    const flip = next === -1;
    const viewFinger = flip ? lo + hi - (finger + duration) : finger;
    if (added && fresh) {
      // The slot came onto what it covers: its neighbours resist and escape
      // as if it had been pushed in from where it first touched them.
      const viewStart = flip ? lo + hi - dragged.end : dragged.start;
      const touched = current
        .map((item) => (flip ? mirror(item) : item))
        .filter(
          (item) =>
            item.side === "ahead" &&
            item.start < viewStart + duration &&
            item.end > viewStart,
        )
        .map((item) => item.start);
      const from = Math.max(lo, Math.min(viewStart, ...touched) - duration);
      for (let at = from; at < viewFinger; at += 1) advance(flip, at, hops);
    }
    const solved = advance(flip, viewFinger, hops);
    if (!solved) return result(next, dragged.start, hops, false);
    const layout = {};
    for (const [id, q] of Object.entries(solved.layout))
      layout[id] = flip
        ? { ...q, start: lo + hi - q.end, end: lo + hi - q.start }
        : q;
    const start = flip ? lo + hi - (solved.start + duration) : solved.start;
    return result(next, start, hops, true, layout);
  }

  function result(dir, start, hops, solved, layout) {
    const slots =
      layout ??
      Object.fromEntries(
        current.map((item) => [
          item.id,
          { start: item.start, end: item.end, state: "solid" },
        ]),
      );
    const states = Object.values(slots).map((slot) => slot.state);
    return {
      direction: dir,
      start,
      // "now" can leave less room than the slot's duration: the end stays
      // in the night (the former `shiftWindow` pushed it past the night's end).
      end: Math.min(hi, start + duration),
      items: slots,
      hops,
      // every escape in force (those of this update and of the earlier ones
      // the finger has not backed off from yet)
      hopped: stack.map((entry) => entry.hop),
      resisting:
        solved && states.some((s) => s === "compressed" || s === "squeezed"),
      covered: Object.keys(slots).filter((id) => slots[id].state === "covered"),
    };
  }

  return { update, origin, movingId };
}

// What a release writes: whole minutes, no slot under `placementFloorMinutes`
// (the covered ones carry no interval: `covered`), the dragged slot's own
// duration kept.
export function placementCommit(gesture, result) {
  const duration = result.end - result.start;
  const start = Math.round(result.start);
  const items = {};
  const covered = [];
  for (const [id, slot] of Object.entries(result.items)) {
    if (slot.state === "covered") {
      covered.push(id);
      continue;
    }
    const first = Math.round(slot.start);
    items[id] = {
      start: first,
      end: Math.max(first + placementFloorMinutes, Math.round(slot.end)),
    };
  }
  return {
    moving: { start, end: start + Math.round(duration) },
    items,
    covered,
  };
}

// Replays a path of finger starts through one gesture: the fixtures of
// conformity (`schedule-placement`) and the tests on real nights read it.
export function schedulePlacementRun({
  items,
  movingId,
  lo = 0,
  hi,
  path,
  added = false,
}) {
  const gesture = createPlacementGesture({ items, movingId, lo, hi, added });
  return path.map((finger) => {
    const result = gesture.update(finger);
    return { finger, ...result, commit: placementCommit(gesture, result) };
  });
}

// What a slot written with no time tonight carries (the
// contract's zero-length slot, `plan.schema.json`): the frise does not draw
// it, the plan keeps it.
export const noTimeTonightKey = "noTimeTonight";

export function itemHasNoTimeTonight(item) {
  return item?.[noTimeTonightKey] === true;
}

// The slots of a schedule (`[{ item, window }]`) the engine works on: those
// with room (a zero-length one has none to give or take) and none written with
// no time; `fixed` names the ones that never move (the dragged one is never).
export function placementSlotsOf(schedule, movingId, fixed = []) {
  return schedule
    .filter(
      (entry) =>
        !itemHasNoTimeTonight(entry.item) &&
        (entry.item.id === movingId || entry.window.end > entry.window.start),
    )
    .map((entry) => ({
      id: entry.item.id,
      start: entry.window.start,
      end: entry.window.end,
      fixed: entry.item.id !== movingId && fixed.includes(entry.item.id),
    }));
}

// What a scene of the engine does to the plan, in the terms the screens draw:
// `others` the patches of the neighbours (by item id), `origins` where the
// touched ones were, `lines` what to say (`kind`: `shortened`, `movedLeft`,
// `movedRight`, `noTime`). `origin` is the slots as the gesture found them.
export function placementReading({ scene, commit, origin, asked }) {
  const before = new Map(origin.map((slot) => [slot.id, slot]));
  const hopped = new Map(scene.hopped.map((hop) => [hop.id, hop]));
  const others = {};
  const origins = {};
  const lines = [];
  for (const [id, place] of Object.entries(scene.items)) {
    const was = before.get(id);
    if (!was) continue;
    const from = { start: Math.round(was.start), end: Math.round(was.end) };
    if (place.state === "covered") {
      others[id] = {
        startMinute: from.start,
        endMinute: from.start,
        durationMinutes: 0,
        [noTimeTonightKey]: true,
      };
      origins[id] = from;
      lines.push({
        id,
        kind: "noTime",
        from,
        to: { start: from.start, end: from.start },
      });
      continue;
    }
    const now = commit.items[id];
    if (!now || (now.start === from.start && now.end === from.end)) continue;
    others[id] = {
      startMinute: now.start,
      endMinute: now.end,
      durationMinutes: now.end - now.start,
    };
    origins[id] = from;
    const hop = hopped.get(id);
    lines.push({
      id,
      kind: hop
        ? hop.toward === "left"
          ? "movedLeft"
          : "movedRight"
        : "shortened",
      from,
      to: { start: now.start, end: now.end },
    });
  }
  const duration = scene.end - scene.start;
  return {
    others,
    preview: {
      fingerStart: asked,
      fingerEnd: asked + duration,
      start: commit.moving.start,
      end: commit.moving.end,
      resisting: scene.resisting,
      origins,
      lines,
    },
  };
}
