import {
  horizonCardinals,
  horizonCircularCardinalPoint,
  horizonCircularPoint,
  horizonCircularRadiusFor,
  horizonProjectionGeometry,
} from "./horizon-projection.js";
import { targetPathKeyHours } from "./target-path.js";

// What the movement summary of a target shows, from its night path
// (`targetNightPath`, `target-path.js`), kept apart from the dialog
// (`components/TargetPathSummary.js`) so it is testable without rendering:
// the state of the summary, the lines of "Résumé du trajet", and the
// drawing in the horizon projection's own user space (200 × 200, zenith at
// the centre, horizon on the edge, north up — `horizon-projection.js`), the
// space the horizon map's path mode draws in too.

const pathDigits = 2;
const tickProbeMs = 5 * 60000;

function coordinate(value) {
  return Number(value.toFixed(pathDigits));
}

function projected(point, rotation) {
  const position = horizonCircularPoint(
    point.azimuth,
    point.altitude,
    rotation,
  );
  return { x: coordinate(position.x), y: coordinate(position.y) };
}

function polyline(points) {
  return points
    .map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`)
    .join(" ");
}

/** The summary's state: `normal`, `no-window` or `never-up` (never above the horizon). */
export function targetPathSummaryState(path) {
  if (!path?.segments?.length) return "never-up";
  if (path.segments.every((segment) => segment.state === "below-horizon"))
    return "never-up";
  return path.bestWindow ? "normal" : "no-window";
}

/**
 * The lines of "Résumé du trajet", in this order, each present only
 * when the night gives it: `clears` and `back` (the mask crossings, several
 * when a notch splits the night), `culmination`, `moon` (`{ min, max }`, from
 * `moon` = `targetNightMoon`'s result); `no-mask` in place
 * of the two crossings when the place has no mask.
 */
export function targetPathSummaryRows(path, { moon = null } = {}) {
  if (targetPathSummaryState(path) === "never-up") return [];
  const rows = [];
  if (!path.maskEnabled) rows.push({ kind: "no-mask" });
  else if (path.clearsMaskAt.length)
    rows.push({ kind: "clears", times: path.clearsMaskAt });
  if (path.culmination && path.culmination.altitude >= 0)
    rows.push({
      kind: "culmination",
      time: path.culmination.time,
      altitude: Math.round(path.culmination.altitude),
    });
  if (path.maskEnabled && path.backBehindMaskAt.length)
    rows.push({ kind: "back", times: path.backBehindMaskAt });
  // The Moon's two extreme separations over the night shown
  // (`targetNightMoon`), never the angle at one instant; nothing when the
  // Moon is down all night.
  if (moon?.separation)
    rows.push({
      kind: "moon",
      min: moon.separation.min,
      max: moon.separation.max,
    });
  return rows;
}

/**
 * Every point of the path above the horizon, in time order, once (shared with
 * the horizon map's path mode, `horizon-path-mode.js`).
 */
export function aboveHorizonPoints(path) {
  const points = [];
  for (const segment of path.segments) {
    if (segment.state === "below-horizon") continue;
    for (const point of segment.points)
      if (points.at(-1)?.time !== point.time) points.push(point);
  }
  return points;
}

/** The path at instant `ms`, interpolated between its two neighbours; null outside it. */
export function pathPointAt(points, ms) {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    const from = Date.parse(previous.time);
    const to = Date.parse(next.time);
    if (ms < from || ms > to) continue;
    const ratio = to > from ? (ms - from) / (to - from) : 0;
    const delta = ((next.azimuth - previous.azimuth + 540) % 360) - 180;
    return {
      time: new Date(ms).toISOString(),
      altitude: previous.altitude + (next.altitude - previous.altitude) * ratio,
      azimuth: (((previous.azimuth + delta * ratio) % 360) + 360) % 360,
    };
  }
  return null;
}

/** The points of `points` inside `window` (`{ start, end }`), its bounds interpolated. */
export function windowPoints(points, window) {
  if (!window) return [];
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  const inside = points.filter((point) => {
    const at = Date.parse(point.time);
    return at > start && at < end;
  });
  return [
    pathPointAt(points, start),
    ...inside,
    pathPointAt(points, end),
  ].filter(Boolean);
}

// A chevron on the path, a third of the way along what is visible, pointing
// the way the target moves.
function directionArrow(points, rotation) {
  const drawn = points.map((point) => projected(point, rotation));
  if (drawn.length < 3) return null;
  const index = Math.max(1, Math.floor(drawn.length / 3));
  const tip = drawn[index];
  const tail = drawn[index - 1];
  const dx = tip.x - tail.x;
  const dy = tip.y - tail.y;
  const length = Math.hypot(dx, dy);
  if (!length) return null;
  const ux = dx / length;
  const uy = dy / length;
  const size = 4;
  const wing = (sign) => ({
    x: coordinate(tip.x - ux * size + -uy * size * 0.8 * sign),
    y: coordinate(tip.y - uy * size + ux * size * 0.8 * sign),
  });
  return { d: polyline([wing(1), tip, wing(-1)]) };
}

function labelled(point, rotation, extra) {
  const position = projected(point, rotation);
  return {
    ...position,
    // A label goes on the outer side of its point, never over the centre.
    anchor: position.x < 100 ? "start" : "end",
    ...extra,
  };
}

/**
 * The drawing of a night path in the horizon projection's user space: the
 * mask (filled), the altitude rings of 30° and 60°, the path split into
 * `visible` (solid) and `masked` (dashed) stretches, the best window drawn
 * over it, a direction chevron, the start, the end, the mask crossings and
 * the culmination.
 */
export function targetPathDrawing(
  path,
  { mask = null, rotation = 0, moon = null } = {},
) {
  const geometry = horizonProjectionGeometry({
    projection: "circular",
    rotation,
    mask,
  });
  const above = path ? aboveHorizonPoints(path) : [];
  const strokes = (path?.segments || [])
    .filter((segment) => segment.state !== "below-horizon")
    .map((segment) => {
      const points = segment.points.map((point) => projected(point, rotation));
      return {
        kind: segment.state === "masked" ? "masked" : "visible",
        d: polyline(points),
        points,
      };
    })
    .filter((stroke) => stroke.d.includes("L"));
  const best = windowPoints(above, path?.bestWindow).map((point) =>
    projected(point, rotation),
  );
  const first = above[0];
  const last = above.at(-1);
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
      const point = pathPointAt(above, Date.parse(time));
      return point ? labelled(point, rotation, { time, kind }) : null;
    })
    .filter(Boolean);
  const culmination =
    path?.culmination && path.culmination.altitude >= 0
      ? {
          ...projected(path.culmination, rotation),
          time: path.culmination.time,
          altitude: Math.round(path.culmination.altitude),
        }
      : null;
  // The horizon, the culmination and the end are always written, and between
  // two of them one more full hour when the stretch lasts 3 h or more.
  const keyHours = path
    ? targetPathKeyHours(path)
    : { horizon: null, hours: [] };
  // The horizon is written once: a mask crossing at that very instant
  // already carries its hour.
  const horizon =
    keyHours.horizon &&
    !crossings.some(
      (crossing) =>
        Math.abs(
          Date.parse(crossing.time) - Date.parse(keyHours.horizon.time),
        ) < 60000,
    )
      ? labelled(keyHours.horizon, rotation, { time: keyHours.horizon.time })
      : null;
  const ticks = keyHours.hours.map((tick) => {
    const at = Date.parse(tick.time);
    const before = projected(
      pathPointAt(above, at - tickProbeMs) || tick,
      rotation,
    );
    const after = projected(
      pathPointAt(above, at + tickProbeMs) || tick,
      rotation,
    );
    const length = Math.hypot(after.x - before.x, after.y - before.y);
    return {
      ...projected(tick, rotation),
      time: tick.time,
      // The unit vector of the path where the hour falls.
      dx: length ? coordinate((after.x - before.x) / length) : 1,
      dy: length ? coordinate((after.y - before.y) / length) : 0,
    };
  });
  const moonRuns = (moon?.runs || []).map((run) =>
    run.map((point) => projected(point, rotation)),
  );
  return {
    viewBox: "0 0 200 200",
    centre: 100,
    radius: horizonCircularRadiusFor(0),
    rings: [30, 60].map((altitude) => ({
      altitude,
      radius: coordinate(horizonCircularRadiusFor(altitude)),
    })),
    mask: geometry.mask
      ? {
          area: `${polyline(geometry.mask.profile)} ${geometry.mask.closure
            .map((point) => `L${point.x} ${point.y}`)
            .join(" ")} Z`,
          outline: polyline(geometry.mask.profile),
        }
      : null,
    strokes,
    window: best.length > 1 ? polyline(best) : null,
    arrow: directionArrow(above, rotation),
    start: first ? projected(first, rotation) : null,
    end:
      last && path?.end === last.time
        ? labelled(last, rotation, { time: last.time })
        : null,
    crossings,
    horizon,
    culmination,
    // The full hours between two of the three always-written ones (at
    // most two), and the Moon track above the horizon (the first
    // point carries the Moon's symbol).
    ticks,
    moon: moonRuns.length
      ? {
          runs: moonRuns.map((run) => polyline(run)),
          marker: moonRuns[0][0],
        }
      : null,
    vertices: [
      ...strokes.flatMap((stroke) => stroke.points),
      ...moonRuns.flat(),
    ],
    cardinals: horizonCardinals.map(({ azimuth, label }) => {
      const point = horizonCircularCardinalPoint(azimuth, rotation);
      return { label, x: coordinate(point.x), y: coordinate(point.y) };
    }),
  };
}

// ---------------------------------------------------------------------------
// The hour marks of the drawing: a small stroke across the path at every full
// hour, and the hour written beside it when it fits. A label is whole or
// absent: it is never cut, never laid over another label, a marker, the
// grid's own words or the path itself.

/** The size, in user units, the hour labels are written at. */
export const tickLabelSize = 6.6;

// What a digit-and-colon label measures, in em (tabular figures).
const labelWidthEm = 0.62;
const plotLimit = { min: -12, max: 212 };

function textRect(text, x, baseline, anchor, size, widthEm = labelWidthEm) {
  const width = String(text).length * size * widthEm;
  const left =
    anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
  return {
    left,
    right: left + width,
    top: baseline - size * 0.82,
    bottom: baseline + size * 0.28,
  };
}

function overlaps(a, b, margin = 0.8) {
  return !(
    a.right + margin <= b.left ||
    b.right + margin <= a.left ||
    a.bottom + margin <= b.top ||
    b.bottom + margin <= a.top
  );
}

function disc(x, y, radius) {
  return {
    left: x - radius,
    right: x + radius,
    top: y - radius,
    bottom: y + radius,
  };
}

/**
 * The drawing's ticks with the place of their hour label: `label` is
 * `{ x, y, text }` (`text-anchor: middle`, `y` the baseline) or `null` when
 * the hour has no room. `words` gives the texts the drawing writes already
 * (`time(instant)`, `end(instant)`, `zenith`) so their boxes are kept clear.
 */
export function targetPathTickLabels(drawing, words) {
  const size = tickLabelSize;
  const centre = drawing.centre;
  const taken = [];
  const keep = (rect) => taken.push(rect);
  for (const ring of drawing.rings)
    keep(
      textRect(
        `${ring.altitude}°`,
        centre - 2.5,
        centre - ring.radius + 3.5,
        "end",
        6.4,
      ),
    );
  keep(textRect(words.zenith || "", centre + 4, centre - 4, "start", 6.4, 0.6));
  for (const cardinal of drawing.cardinals)
    keep(textRect("W", cardinal.x, cardinal.y + 3.5, "middle", 8.4, 0.8));
  if (drawing.start) keep(disc(drawing.start.x, drawing.start.y, 4));
  for (const crossing of drawing.crossings) {
    keep(disc(crossing.x, crossing.y, 4.4));
    keep(
      textRect(
        words.time(crossing.time),
        crossing.x + (crossing.anchor === "start" ? 5 : -5),
        crossing.y - 4,
        crossing.anchor,
        7.2,
      ),
    );
  }
  if (drawing.horizon) {
    const { x, y, time, anchor } = drawing.horizon;
    keep(disc(x, y, 4.4));
    keep(
      textRect(
        words.time(time),
        x + (anchor === "start" ? 5 : -5),
        y - 4,
        anchor,
        7.2,
      ),
    );
  }
  if (drawing.culmination) {
    const { x, y, time, altitude } = drawing.culmination;
    keep(disc(x, y, 7));
    keep(
      textRect(`${words.time(time)} · ${altitude}°`, x, y + 13, "middle", 7.2),
    );
  }
  if (drawing.end) {
    keep(disc(drawing.end.x, drawing.end.y, 5));
    keep(
      textRect(
        words.end(drawing.end.time),
        drawing.end.x,
        drawing.end.y - 7,
        "middle",
        7.2,
      ),
    );
  }
  if (drawing.moon) keep(disc(drawing.moon.marker.x, drawing.moon.marker.y, 5));
  const vertices = drawing.vertices || [];
  const free = (box, own) =>
    box.left >= plotLimit.min &&
    box.right <= plotLimit.max &&
    box.top >= plotLimit.min &&
    box.bottom <= plotLimit.max &&
    !taken.some((other) => overlaps(box, other)) &&
    !drawing.ticks.some(
      (other, index) =>
        index !== own &&
        overlaps(box, disc(other.x, other.y, tickHalfLength), 0.4),
    ) &&
    !vertices.some(
      (point) =>
        point.x >= box.left - 1 &&
        point.x <= box.right + 1 &&
        point.y >= box.top - 1 &&
        point.y <= box.bottom + 1,
    );
  return drawing.ticks.map((tick, own) => {
    const text = words.time(tick.time);
    const width = text.length * size * labelWidthEm;
    const height = size * 1.1;
    let normal = { x: -tick.dy, y: tick.dx };
    // The side away from the dome's centre first.
    if (normal.x * (tick.x - centre) + normal.y * (tick.y - centre) < 0)
      normal = { x: -normal.x, y: -normal.y };
    for (const extra of [0, 4, 8]) {
      for (const side of [normal, { x: -normal.x, y: -normal.y }]) {
        const extent =
          (Math.abs(side.x) * width) / 2 + (Math.abs(side.y) * height) / 2;
        const reach = tickHalfLength + 1.5 + extra + extent;
        const x = tick.x + side.x * reach;
        const y = tick.y + side.y * reach;
        const baseline = y + size * 0.36;
        const box = textRect(text, x, baseline, "middle", size);
        if (!free(box, own)) continue;
        keep(box);
        return {
          ...tick,
          label: { x: coordinate(x), y: coordinate(baseline), text },
        };
      }
    }
    return { ...tick, label: null };
  });
}

/** Half the length of the stroke across the path at a full hour, in user units. */
export const tickHalfLength = 3.4;
