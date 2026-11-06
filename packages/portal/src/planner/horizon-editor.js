// The geometry and the edits of the web horizon editor
// (`components/planner/PlannerHorizonEditor.js`), kept apart from React so
// they can be tested. The SVG user space is the editor's own: 200 × 200
// centred on (100, 100) for the circular plot (the altitude-0 ring has a
// radius of 86), 360 × 90 for the linear one.
//
// With one point every 10° the handles are too close for each to own a hit
// area: a pointer takes the nearest handle within reach of a finger, and,
// when none is that close, the direction under it.
import {
  horizonMaskPointCount,
  horizonMaskStep,
  normaliseHorizonMask,
} from "./horizon-mask.js";
import { plannerFlowMessage } from "./flow-messages.js";

export const horizonEditorDiscRadius = 86;

// How far from a handle, in screen pixels, a pointer still takes it: half of
// a 44 px touch target.
export const horizonEditorGrabRadius = 22;

// How far past the circular plot's disc, in user units, a pointer may still
// start a drag (the square's corners are not the plot).
export const horizonEditorOutsideTolerance = 7;

// How far, sideways, a pointer must travel from the held handle before the
// point it is heading to is taken instead, in screen pixels at the pointer.
// A stretch of the held point is rarely a straight vertical line: below this
// a little wobble keeps the same point.
export const horizonEditorSwitchLateralPx = 12;

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

// Where one point of the profile is drawn.
export function horizonEditorPosition(point, projection, rotation = 0) {
  const azimuth = Number(point?.azimuth) || 0;
  const altitude = clamp(Number(point?.altitude) || 0, 0, 90);
  if (projection !== "circular") return { x: azimuth, y: 90 - altitude };
  const angle = ((azimuth + Number(rotation || 0) - 90) * Math.PI) / 180;
  const radius = ((90 - altitude) / 90) * horizonEditorDiscRadius;
  return {
    x: 100 + Math.cos(angle) * radius,
    y: 100 + Math.sin(angle) * radius,
  };
}

// Whether a pointer at `local` (user units) may start a drag at all.
export function horizonEditorInReach(local, projection) {
  if (projection !== "circular") return true;
  return (
    Math.hypot(local.x - 100, local.y - 100) <=
    horizonEditorDiscRadius + horizonEditorOutsideTolerance
  );
}

// The index of the direction under a pointer, whatever its altitude.
export function horizonEditorDirectionAt(local, projection, rotation = 0) {
  const azimuth =
    projection === "circular"
      ? (Math.atan2(local.y - 100, local.x - 100) * 180) / Math.PI +
        90 -
        Number(rotation || 0)
      : local.x;
  const wrapped = ((azimuth % 360) + 360) % 360;
  return Math.round(wrapped / horizonMaskStep) % horizonMaskPointCount;
}

// The handle drawn within reach of a pointer (the nearest one), or null.
// `scaleX` and `scaleY` turn user units into screen pixels (the linear plot
// is stretched).
export function grabbedHorizonHandle(
  points,
  local,
  { projection = "circular", rotation = 0, scaleX = 1, scaleY = 1 } = {},
) {
  let nearest = null;
  let best = Infinity;
  points.forEach((point, index) => {
    const position = horizonEditorPosition(point, projection, rotation);
    const distance = Math.hypot(
      (position.x - local.x) * scaleX,
      (position.y - local.y) * scaleY,
    );
    if (distance < best) {
      best = distance;
      nearest = index;
    }
  });
  return nearest !== null && best <= horizonEditorGrabRadius ? nearest : null;
}

// The handle a pointer takes, and keeps for the whole gesture: the nearest
// one within reach, else the direction under the pointer.
export function nearestHorizonHandle(points, local, options = {}) {
  return (
    grabbedHorizonHandle(points, local, options) ??
    horizonEditorDirectionAt(local, options.projection, options.rotation)
  );
}

// The altitude a pointer at `local` gives the handle it holds: only the
// distance from the centre (circular) or the height (linear) counts, the
// handle slides along its own direction.
export function horizonEditorAltitudeAt(local, projection) {
  return projection === "circular"
    ? 90 -
        (Math.hypot(local.x - 100, local.y - 100) / horizonEditorDiscRadius) *
          90
    : 90 - local.y;
}

// The mask with one point at a new altitude, a whole degree between 0° and
// 90°; the other points are left exactly as they were. The point moved by
// hand is surveyed at `at` (`surveyedAt`).
export function withHorizonPointAltitude(
  mask,
  index,
  altitude,
  at = new Date(),
) {
  const draft = normaliseHorizonMask(mask);
  const value = Math.round(clamp(Number(altitude) || 0, 0, 90));
  return {
    ...draft,
    points: draft.points.map((point, position) =>
      position === index
        ? { ...point, altitude: value, surveyedAt: at.toISOString() }
        : point,
    ),
  };
}

// « − » / « + »: one degree down or up, from the point's whole degree.
export function steppedHorizonMask(mask, index, delta) {
  const draft = normaliseHorizonMask(mask);
  const point = draft.points[index];
  if (!point) return draft;
  return withHorizonPointAltitude(
    mask,
    index,
    Math.round(point.altitude) + Math.sign(Number(delta) || 0),
  );
}

// The azimuth under a pointer, degrees in [0, 360).
export function horizonEditorAzimuthAt(local, projection, rotation = 0) {
  const azimuth =
    projection === "circular"
      ? (Math.atan2(local.y - 100, local.x - 100) * 180) / Math.PI +
        90 -
        Number(rotation || 0)
      : local.x;
  return ((azimuth % 360) + 360) % 360;
}

// The point a pointer is heading to instead of the held one, or null while it
// still stretches the held point: the point under the pointer must
// differ from the held one and the pointer must be
// `horizonEditorSwitchLateralPx` away from it sideways -- the hysteresis that
// lets a vertical stretch wobble. Sideways is measured on the screen: along
// the azimuth axis (linear), along the arc at the pointer's radius
// (circular).
export function horizonEditorHeadedTo(
  points,
  held,
  local,
  { projection = "circular", rotation = 0, scaleX = 1 } = {},
) {
  const under = horizonEditorDirectionAt(local, projection, rotation);
  if (under === held || !points[held]) return null;
  const difference =
    ((((horizonEditorAzimuthAt(local, projection, rotation) -
      Number(points[held].azimuth) +
      540) %
      360) +
      360) %
      360) -
    180;
  const pixelsPerDegree =
    projection === "circular"
      ? (Math.hypot(local.x - 100, local.y - 100) * scaleX * Math.PI) / 180
      : scaleX;
  return Math.abs(difference) * pixelsPerDegree >= horizonEditorSwitchLateralPx
    ? under
    : null;
}

// The zenith zone of the circular plot: above this altitude the pointer's
// azimuth means nothing (the centre is the zenith), and leaving the zone on
// the other side of the sky is a stroke through the zenith, not a drawing.
export const horizonEditorZenithZoneAltitude = 75;

// How far the azimuth must have turned, in degrees, between the last frame
// outside the zone and the first one out of it again, for the stroke to have
// gone through the zenith.
const zenithCrossingTurn = 90;

const inZenithZone = (local, projection) =>
  projection === "circular" &&
  horizonEditorAltitudeAt(local, projection) > horizonEditorZenithZoneAltitude;

// Whether the straight move from `from` to `to` passes through the zenith
// zone (a fast stroke may jump over it between two frames).
function segmentThroughZenith(from, to, projection) {
  if (projection !== "circular" || !from) return false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length2 = dx * dx + dy * dy;
  const t = length2
    ? clamp(((100 - from.x) * dx + (100 - from.y) * dy) / length2, 0, 1)
    : 0;
  return inZenithZone({ x: from.x + dx * t, y: from.y + dy * t }, projection);
}

// The state of a gesture for the zenith rule, from where the pointer went
// down: whether it is in the zenith zone, its azimuth the last time it was
// outside it, and whether the stroke went through the zenith (it then draws
// nothing more until the pointer is lifted).
export function horizonEditorGestureStart(local, projection, rotation = 0) {
  const inZenith = inZenithZone(local, projection);
  return {
    inZenith,
    outsideAzimuth: inZenith
      ? null
      : horizonEditorAzimuthAt(local, projection, rotation),
    throughZenith: false,
  };
}

// One frame of a drag: the held point after the frame and the altitude
// every point touched in the frame takes. Without a switch only the held
// point follows the pointer's height; with one, the point the pointer heads
// to -- and every point passed over since the previous frame, each at the
// height of the pointer where it crossed that point's azimuth -- is attracted
// to the pointer, so a whole horizon is drawn in one gesture.
//
// With `options.gesture` (`horizonEditorGestureStart`), the circular plot's
// zenith rule: in the zenith zone the pointer stretches the held point only;
// out of it again on the other side of the sky (the azimuth turned by more
// than 90°), the stroke is cancelled -- `cancelled` is true once, the caller
// gives back the mask of the gesture's start, and every later frame of the
// gesture changes nothing. Silent: no message. The returned `gesture` is the
// state for the next frame.
export function horizonEditorDragStep(
  points,
  held,
  previous,
  local,
  options = {},
) {
  const projection = options.projection ?? "circular";
  const rotation = options.rotation ?? 0;
  let gesture = options.gesture ?? null;
  if (gesture) {
    if (gesture.throughZenith)
      return { held, updates: [], gesture, cancelled: false };
    const inZenith = inZenithZone(local, projection);
    const crossed =
      !inZenith &&
      (gesture.inZenith || segmentThroughZenith(previous, local, projection));
    if (crossed && gesture.outsideAzimuth !== null) {
      const now = horizonEditorAzimuthAt(local, projection, rotation);
      const turn =
        ((((now - gesture.outsideAzimuth + 540) % 360) + 360) % 360) - 180;
      if (Math.abs(turn) > zenithCrossingTurn)
        return {
          held,
          updates: [],
          gesture: { ...gesture, inZenith, throughZenith: true },
          cancelled: true,
        };
    }
    if (inZenith)
      return {
        held,
        updates: [
          { index: held, altitude: horizonEditorAltitudeAt(local, projection) },
        ],
        gesture: { ...gesture, inZenith: true },
        cancelled: false,
      };
    gesture = {
      ...gesture,
      inZenith: false,
      outsideAzimuth: horizonEditorAzimuthAt(local, projection, rotation),
    };
  }
  const next = horizonEditorHeadedTo(points, held, local, options);
  if (next === null) {
    return {
      held,
      updates: [
        { index: held, altitude: horizonEditorAltitudeAt(local, projection) },
      ],
      gesture,
      cancelled: false,
    };
  }
  const count = points.length;
  const forward = (next - held + count) % count;
  const direction = forward <= count - forward ? 1 : -1;
  const steps = direction === 1 ? forward : count - forward;
  const from = previous ?? local;
  const updates = [];
  for (let step = 1; step <= steps; step += 1) {
    const fraction = step / steps;
    updates.push({
      index: (((held + direction * step) % count) + count) % count,
      altitude: horizonEditorAltitudeAt(
        {
          x: from.x + (local.x - from.x) * fraction,
          y: from.y + (local.y - from.y) * fraction,
        },
        projection,
      ),
    });
  }
  return { held: next, updates, gesture, cancelled: false };
}

// The mask with several points at new altitudes (whole degrees, 0 to 90),
// each surveyed at `at`.
export function withHorizonPointAltitudes(mask, updates, at = new Date()) {
  const draft = normaliseHorizonMask(mask);
  const byIndex = new Map(
    updates.map(({ index, altitude }) => [
      index,
      Math.round(clamp(Number(altitude) || 0, 0, 90)),
    ]),
  );
  return {
    ...draft,
    points: draft.points.map((point, position) =>
      byIndex.has(position)
        ? {
            ...point,
            altitude: byIndex.get(position),
            surveyedAt: at.toISOString(),
          }
        : point,
    ),
  };
}

// The crown of the surveyed sectors, on the edge of the circular plot,
// between the altitude-0 ring (86) and the cardinal letters (95).
export const horizonEditorCrownRadius = 88.6;

const crownPoint = (degrees) => {
  const angle = (degrees * Math.PI) / 180;
  return {
    x: 100 + Math.cos(angle) * horizonEditorCrownRadius,
    y: 100 + Math.sin(angle) * horizonEditorCrownRadius,
  };
};
const crownArc = (startDegrees, sweepDegrees) => {
  const start = crownPoint(startDegrees);
  const end = crownPoint(startDegrees + sweepDegrees);
  const r = horizonEditorCrownRadius;
  return `M${start.x.toFixed(2)} ${start.y.toFixed(2)} A${r} ${r} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
};

// One entry per point of the profile: whether its 10° sector (centred on its
// azimuth) was surveyed, and the SVG paths that draw it on the crown -- one
// arc a hair short of the sector when surveyed, three dashes when it is to
// survey. It turns with the map (`rotation`).
export function horizonEditorCrownSegments(points, rotation = 0) {
  return points.map((point, index) => {
    const surveyed = typeof point?.surveyedAt === "string";
    const start =
      (Number(point?.azimuth) || 0) - 5 + Number(rotation || 0) - 90;
    return {
      index,
      surveyed,
      paths: surveyed
        ? [crownArc(start + 0.6, 8.8)]
        : [0, 1, 2].map((dash) => crownArc(start + 0.8 + dash * 3.2, 1.8)),
    };
  });
}

// « Relevé le 16 octobre 2026 » for a point with a survey date (the day at
// the place's time zone when it is known), « À relever » otherwise.
export function horizonEditorSurveyedLabel(point, locale, timeZone) {
  const at = point?.surveyedAt ? new Date(point.surveyedAt) : null;
  if (!at || Number.isNaN(at.getTime()))
    return plannerFlowMessage(locale, "horizonToSurvey");
  const options = { day: "numeric", month: "long", year: "numeric" };
  let date;
  try {
    date = new Intl.DateTimeFormat(locale, {
      ...options,
      ...(timeZone ? { timeZone } : {}),
    }).format(at);
  } catch {
    date = new Intl.DateTimeFormat(locale, options).format(at);
  }
  return plannerFlowMessage(locale, "horizonSurveyedOn").replace(
    "{date}",
    locale === "fr" ? date.replace(/ (?=\S+ \d{4}$)/, "\u00a0") : date,
  );
}
