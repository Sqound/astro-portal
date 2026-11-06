import { horizonPoint } from "./horizon-projection.js";
import {
  aboveHorizonPoints,
  pathPointAt,
  targetPathSummaryState,
  windowPoints,
} from "./target-path-summary.js";

// The horizon map's path mode: the
// whole night of one chosen target drawn on the horizon map, in either of its
// projections, from the night path (`targetNightPath`,
// `target-path.js`) — never a second computation of it.
//
// - `horizonPathTargetId`: which target the mode draws.
// - `horizonPathSummary`: the lines of the card "Trajet de <cible>".
// - `horizonPathLayer`: the drawing, in the projection's own user space
//   (`horizon-projection.js`: 200 × 200 for the dome, 360 × 90 for the
//   linear plot), for `components/HorizonPathLayer.js`.
//
// The first two are rules; the third is drawing.

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

/**
 * The target the path mode draws, among `targetIds` (the plan's targets, in
 * the plan's order): the one chosen last (`pathTargetId`) while it is still
 * in the plan, else the map's selected target when it is in the plan, else
 * the plan's first target; null for a plan with no target.
 */
export function horizonPathTargetId({
  targetIds = [],
  pathTargetId = null,
  selectedTargetId = null,
} = {}) {
  const ids = (Array.isArray(targetIds) ? targetIds : []).filter(
    nonEmptyString,
  );
  if (nonEmptyString(pathTargetId) && ids.includes(pathTargetId))
    return pathTargetId;
  if (nonEmptyString(selectedTargetId) && ids.includes(selectedTargetId))
    return selectedTargetId;
  return ids[0] ?? null;
}

// Every point of the path, above the horizon or not, in time order, once.
function allPoints(path) {
  const points = [];
  for (const segment of Array.isArray(path?.segments) ? path.segments : [])
    for (const point of segment.points || [])
      if (points.at(-1)?.time !== point.time) points.push(point);
  return points;
}

/**
 * The instant the target goes under `minAltitude` for the rest of the night
 * (linear on the altitude between two points, the technique of
 * `visibilityWindows`), or null when it ends the night above it or never
 * rises above it.
 */
function belowMinimumFromOf(points, minAltitude) {
  let from = null;
  for (let index = 1; index < points.length; index += 1) {
    const before = points[index - 1].altitude - minAltitude;
    const after = points[index].altitude - minAltitude;
    if (before >= 0 && after < 0) {
      const fromMs = Date.parse(points[index - 1].time);
      const toMs = Date.parse(points[index].time);
      const ratio = before / (before - after);
      from = new Date(
        Math.trunc(fromMs + (toMs - fromMs) * ratio),
      ).toISOString();
    } else if (before < 0 && after >= 0) from = null;
  }
  return from;
}

/**
 * The card "Trajet de <cible>": `never-up` when the target stays under the
 * horizon all night ("<target> does not rise tonight"), else `normal`
 * with the culmination (time, whole degrees), every stretch hidden by the
 * mask (`masked`: "Derrière le masque de … à …") and the instant it goes
 * under the minimum altitude for good (`belowMinimumFrom`: "Sous la hauteur
 * minimale dès …"), each null or empty when the night does not give it.
 */
export function horizonPathSummary(path, { minAltitude = 0 } = {}) {
  if (targetPathSummaryState(path) === "never-up")
    return {
      state: "never-up",
      culmination: null,
      masked: [],
      belowMinimumFrom: null,
    };
  const minimum = Number.isFinite(Number(minAltitude))
    ? Number(minAltitude)
    : 0;
  const culmination =
    path.culmination && path.culmination.altitude >= 0
      ? {
          time: path.culmination.time,
          altitude: Math.round(path.culmination.altitude),
        }
      : null;
  return {
    state: "normal",
    culmination,
    masked: path.segments
      .filter((segment) => segment.state === "masked")
      .map((segment) => ({ start: segment.start, end: segment.end })),
    belowMinimumFrom: belowMinimumFromOf(allPoints(path), minimum),
  };
}

const coordinateDigits = 2;

function coordinate(value) {
  return Number(value.toFixed(coordinateDigits));
}

function wrapped(value) {
  return ((value % 360) + 360) % 360;
}

function projectPoint(point, projection, rotation) {
  const position = horizonPoint(
    projection,
    projection === "linear" ? wrapped(point.azimuth) : point.azimuth,
    point.altitude,
    rotation,
  );
  return { x: coordinate(position.x), y: coordinate(position.y) };
}

/**
 * `points` as the polylines of one projection. The dome draws one line; the
 * linear plot breaks it where the target crosses north (azimuth 360° → 0° or
 * back), closing the line on one edge and reopening it on the other at the
 * interpolated altitude, so no stroke crosses the whole plot.
 */
export function horizonPathPolylines(points, { projection, rotation = 0 }) {
  if (projection !== "linear")
    return points.length
      ? [points.map((point) => projectPoint(point, projection, rotation))]
      : [];
  const lines = [];
  let line = [];
  points.forEach((point, index) => {
    const azimuth = wrapped(point.azimuth);
    const previous = points[index - 1];
    if (previous) {
      const from = wrapped(previous.azimuth);
      const delta = ((azimuth - from + 540) % 360) - 180;
      if (from + delta < 0 || from + delta >= 360) {
        const edge = from + delta < 0 ? 0 : 360;
        const ratio = delta ? (edge - from) / delta : 0;
        const altitude =
          previous.altitude + (point.altitude - previous.altitude) * ratio;
        // The edge itself, never wrapped: 360° closes the line on the right.
        const y = projectPoint({ azimuth: 0, altitude }, "linear", rotation).y;
        line.push({ x: edge, y });
        lines.push(line);
        line = [{ x: edge === 0 ? 360 : 0, y }];
      }
    }
    line.push(projectPoint({ ...point, azimuth }, "linear", rotation));
  });
  if (line.length) lines.push(line);
  return lines.filter((candidate) => candidate.length > 1);
}

function polylineData(points) {
  return points
    .map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`)
    .join(" ");
}

function strokeKind(state) {
  if (state === "masked") return "masked";
  if (state === "below-minimum") return "below-minimum";
  return "visible";
}

function distance(left, right, scale) {
  return Math.hypot((left.x - right.x) * scale.x, (left.y - right.y) * scale.y);
}

// The size, in pixels, of an hour label unless the caller measured its own:
// "19:00" at 11 px.
const defaultLabelSize = Object.freeze({ width: 34, height: 13 });

/**
 * The direction (a unit vector, in pixels) the path takes at `position`, from
 * the nearest vertex of any stroke; `{ x: 1, y: 0 }` without a stroke.
 */
function pathDirectionAt(strokes, position, scale) {
  let best = { x: 1, y: 0 };
  let bestDistance = Infinity;
  for (const stroke of strokes) {
    const points = stroke.points;
    points.forEach((point, index) => {
      const gap = distance(point, position, scale);
      if (gap >= bestDistance) return;
      const before = points[Math.max(index - 1, 0)];
      const after = points[Math.min(index + 1, points.length - 1)];
      const dx = (after.x - before.x) * scale.x;
      const dy = (after.y - before.y) * scale.y;
      const length = Math.hypot(dx, dy);
      if (!length) return;
      bestDistance = gap;
      best = { x: dx / length, y: dy / length };
    });
  }
  return best;
}

/**
 * Where the centre of an hour label of `size` goes, as a pixel offset from
 * its dot ("posées à l'écart du trait"): beside the dot, on the normal of the
 * path, on the side away from the dome's centre or above the stroke on the
 * linear plot, so the glyphs never sit on the stroke they name. The preferred
 * side first, then the other one, each a little farther out if need be; the
 * first box that is inside the plot (`bounds`, in pixels from the plot's top
 * left corner), clear of the `avoid` rectangles (the clock and the mask's
 * badge laid over the plot) and of every vertex of the path (`strokes`, in
 * pixels) wins; with none free there is no label (`null`), as the collision
 * rule drops a label that has no room. `at` is the dot's pixel position.
 */
function labelOffset({
  at,
  direction,
  size,
  circular,
  centre,
  bounds,
  dotRadius,
  strokes,
  avoid,
}) {
  let normal = { x: -direction.y, y: direction.x };
  const away = circular
    ? { x: at.x - centre.x, y: at.y - centre.y }
    : { x: 0, y: -1 };
  if (normal.x * away.x + normal.y * away.y < 0)
    normal = { x: -normal.x, y: -normal.y };
  const boxAt = (n, extra) => {
    const extent =
      (Math.abs(n.x) * size.width + Math.abs(n.y) * size.height) / 2;
    const reach = dotRadius + 4 + extra + extent;
    const x = at.x + n.x * reach;
    const y = at.y + n.y * reach;
    return {
      offset: { x: n.x * reach, y: n.y * reach },
      left: x - size.width / 2,
      top: y - size.height / 2,
    };
  };
  const inside = (box) =>
    box.left >= 2 &&
    box.top >= 2 &&
    box.left + size.width <= bounds.width - 2 &&
    box.top + size.height <= bounds.height - 2;
  const hits = (box, rectangle, margin) =>
    box.left < rectangle.x + rectangle.width + margin &&
    box.left + size.width > rectangle.x - margin &&
    box.top < rectangle.y + rectangle.height + margin &&
    box.top + size.height > rectangle.y - margin;
  const free = (box) =>
    inside(box) &&
    !avoid.some((rectangle) => hits(box, rectangle, 0)) &&
    !strokes.some((point) =>
      hits(box, { x: point.x, y: point.y, width: 0, height: 0 }, 1),
    );
  const opposite = { x: -normal.x, y: -normal.y };
  for (const extra of [0, 6, 12])
    for (const side of [normal, opposite]) {
      const box = boxAt(side, extra);
      if (free(box)) return pixelOffset(box.offset);
    }
  // No room: the label is left out, the dot stays (the collision rule).
  return null;
}

function pixelOffset(offset) {
  return { x: coordinate(offset.x), y: coordinate(offset.y) };
}

/**
 * The drawing of one target's night on the horizon map, in the user space of
 * `projection` (`circular` or `linear`, turned by `rotation` like the map):
 *
 * - `strokes`: the path above the horizon, one entry per polyline, `kind`
 *   `visible` (fine, solid), `masked` (dashed) or `below-minimum` (dotted, in
 *   the colour of the minimum altitude line);
 * - `window`: the best window drawn over it;
 * - `ticks`: the full hours of the night the target is up for (`HH:00`),
 * each `labelled` when it is one hour in two, counted from the path's first
 * full hour (e.g. 19:00, 21:00, 23:00, 01:00, 03:00; counted from the path so
 * the labels do not move with the time slider) and its label would not sit
 * within `labelGap` pixels of the current marker, a mask crossing or an earlier
 * labelled hour (the plot's `scale`, pixels per user unit on each axis, turns
 * user units into pixels); `label` is the offset in pixels from the dot to the
 * centre of the label of `labelSize`, beside the dot on the normal of the path
 * (`anchor`, kept, only tells the side of the dot); `avoid` lists the
 * rectangles (pixels, from the plot's top left corner) the labels keep clear
 * of, the clock and the mask's badge;
 * - `crossings`: the instants it clears the mask and goes back behind it;
 * - `start`, `end`: where the drawn path begins and ends;
 * - `current`: the target at `sampleTime` (the map's time slider), null when
 *   it is under the horizon then.
 */
export function horizonPathLayer(
  path,
  {
    projection = "circular",
    rotation = 0,
    sampleTime = null,
    scale = { x: 1, y: 1 },
    labelGap = 22,
    labelSize = defaultLabelSize,
    dotRadius = 4,
    avoid = [],
  } = {},
) {
  const circular = projection !== "linear";
  const view = { projection: circular ? "circular" : "linear", rotation };
  const above = path ? aboveHorizonPoints(path) : [];
  const strokes = (path?.segments || [])
    .filter((segment) => segment.state !== "below-horizon")
    .flatMap((segment) =>
      horizonPathPolylines(segment.points, view).map((points) => ({
        kind: strokeKind(segment.state),
        points,
        d: polylineData(points),
      })),
    );
  const window = horizonPathPolylines(
    windowPoints(above, path?.bestWindow),
    view,
  ).map((points) => ({ points, d: polylineData(points) }));
  const at = (time) => {
    const point = pathPointAt(above, Date.parse(time));
    return point
      ? { ...projectPoint(point, view.projection, rotation), time }
      : null;
  };
  const crossings = [
    ...(path?.maskEnabled ? path.clearsMaskAt : []).map((time) => ({
      time,
      kind: "clears",
    })),
    ...(path?.maskEnabled ? path.backBehindMaskAt : []).map((time) => ({
      time,
      kind: "back",
    })),
  ]
    .map(({ time, kind }) => {
      const point = at(time);
      return point ? { ...point, kind } : null;
    })
    .filter(Boolean);
  const sampled =
    sampleTime && Number.isFinite(Date.parse(sampleTime))
      ? pathPointAt(above, Date.parse(sampleTime))
      : null;
  const current = sampled
    ? {
        ...projectPoint(sampled, view.projection, rotation),
        time: new Date(Date.parse(sampleTime)).toISOString(),
      }
    : null;
  const pixelScale = {
    x: Number(scale?.x) || 1,
    y: Number(scale?.y) || 1,
  };
  const size = {
    width: Number(labelSize?.width) || defaultLabelSize.width,
    height: Number(labelSize?.height) || defaultLabelSize.height,
  };
  const bounds = circular
    ? { width: 200 * pixelScale.x, height: 200 * pixelScale.y }
    : { width: 360 * pixelScale.x, height: 90 * pixelScale.y };
  const toPixels = (point) => ({
    x: point.x * pixelScale.x,
    y: point.y * pixelScale.y,
  });
  const strokePixels = strokes.flatMap((stroke) => stroke.points.map(toPixels));
  // The current marker's time and the crossings' pills are laid over the
  // plot as well: their boxes are kept clear of the hours too.
  const keepClear = [...avoid];
  if (current) {
    const at = toPixels(current);
    keepClear.push({
      x: at.x + 11,
      y: at.y - 8,
      width: size.width + 4,
      height: size.height,
    });
  }
  for (const crossing of crossings) {
    const at = toPixels(crossing);
    keepClear.push({
      x: at.x + 4,
      y: at.y - size.height - 12,
      width: size.width + 12,
      height: size.height + 8,
    });
  }
  const obstacles = [current, ...crossings].filter(Boolean);
  const labelled = [];
  const ticks = (path?.hourTicks || [])
    .filter((tick) => tick.altitude >= 0)
    .map((tick, index) => {
      const position = projectPoint(tick, view.projection, rotation);
      const candidate =
        index % 2 === 0 &&
        [...obstacles, ...labelled].every(
          (other) => distance(position, other, pixelScale) >= labelGap,
        );
      const label = candidate
        ? labelOffset({
            at: toPixels(position),
            direction: pathDirectionAt(strokes, position, pixelScale),
            size,
            circular,
            centre: toPixels({ x: 100, y: 100 }),
            bounds,
            dotRadius,
            strokes: strokePixels,
            avoid: keepClear,
          })
        : null;
      const free = Boolean(label);
      if (free) labelled.push(position);
      const anchor = circular
        ? position.x < 100
          ? "end"
          : "start"
        : position.x < 40
          ? "start"
          : "end";
      return {
        ...position,
        time: tick.time,
        labelled: free,
        anchor,
        label,
      };
    });
  const first = above[0];
  const last = above.at(-1);
  return {
    projection: view.projection,
    viewBox: circular ? "0 0 200 200" : "0 0 360 90",
    strokes,
    window,
    ticks,
    crossings,
    start: first ? projectPoint(first, view.projection, rotation) : null,
    end: last ? projectPoint(last, view.projection, rotation) : null,
    current,
  };
}

/**
 * The offset of `timeZone` from UTC at `instant`, in minutes (`+330` for
 * India): what `targetNightPath`'s `tickOffsetMinutes` needs so the hour
 * ticks fall on the place's own full hours. An unusable zone reads as UTC.
 */
export function zoneOffsetMinutes(instant, timeZone) {
  const ms = typeof instant === "string" ? Date.parse(instant) : instant;
  if (!Number.isFinite(ms)) return 0;
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: typeof timeZone === "string" && timeZone ? timeZone : "UTC",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(ms));
  } catch {
    return 0;
  }
  const part = (type) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  const wall = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
  );
  return Math.round((wall - Math.floor(ms / 60000) * 60000) / 60000);
}
