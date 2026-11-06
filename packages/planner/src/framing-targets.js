// What lies under a framing: creating a framing aimed at M31 offers M31, and a
// list of everything that lies under the frame.
//
// Where a target is "under the frame". The frame is what the map draws: a
// rectangle (or the circle of an eyepiece) of the field's own size, turned by
// the framing's angle, in the map's own stereographic projection -- or, for a
// mosaic, the rectangle of the whole surface it covers. A target is under it
// when
//   * its centre is inside the frame, or
//   * its apparent extent reaches into the frame -- M31 measures 190', so a
//     0.4 degree frame laid on a spiral arm a degree from its nucleus still has
//     M31 under it. The catalogue gives a size and no position angle, so the
//     extent is taken as the disc of the widest axis: it may name an object
//     the frame only grazes, never miss one it contains.
//
// In which order: the target a search put forward, if it is under the frame;
// then those whose centre is inside before those the frame only touches;
// within each, the well-known ones (Messier and Caldwell objects, anything with
// a name of its own) before the obscure designations; then the nearest to the
// centre. At most `framingSuggestionLimit`.

export const framingSuggestionLimit = 5;

const DEGREE = Math.PI / 180;

const finite = (value) => value != null && Number.isFinite(Number(value));

// The frame of a framing on the sky, ready to say whether a target is under
// it. `null` for a frame with no centre or no size.
export function framingFootprint({ center, field, angleDegrees = 0 } = {}) {
  if (!finite(center?.ra) || !finite(center?.dec)) return null;
  const width = Number(field?.width);
  const height = Number(field?.height);
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width * height))
    return null;
  const ra = Number(center.ra) * DEGREE;
  const dec = Number(center.dec) * DEGREE;
  const forward = [
    Math.cos(dec) * Math.cos(ra),
    Math.cos(dec) * Math.sin(ra),
    Math.sin(dec),
  ];
  const east = [-Math.sin(ra), Math.cos(ra), 0];
  const north = [
    -Math.sin(dec) * Math.cos(ra),
    -Math.sin(dec) * Math.sin(ra),
    Math.cos(dec),
  ];
  // The framing's angle is N.I.N.A.'s position angle: where the top of the
  // picture points, counted from the north towards the east. At 0° the top
  // is the north and the width runs east-west; at 90° the top is the east;
  // on the north-up, east-left map, 30° turns the top of the frame to the
  // left, counter-clockwise.
  const angle =
    (Number.isFinite(Number(angleDegrees)) ? Number(angleDegrees) : 0) * DEGREE;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const halfWidth = Math.tan((width * DEGREE) / 4);
  const halfHeight = Math.tan((height * DEGREE) / 4);
  const circle = field?.shape === "circle";
  const planeRadius = circle
    ? Math.max(halfWidth, halfHeight)
    : Math.hypot(halfWidth, halfHeight);
  return {
    centreDec: Number(center.dec),
    forward,
    // Across the picture: the east at 0°, the south at 90°.
    xAxis: east.map((value, index) => value * cosine - north[index] * sine),
    // Up the picture: the north at 0°, the east at 90°.
    yAxis: north.map((value, index) => value * cosine + east[index] * sine),
    halfWidth,
    halfHeight,
    circle,
    // A little over the true radius: this only ever rejects.
    reachDegrees: ((2 * Math.atan(planeRadius)) / DEGREE) * 1.02 + 1e-6,
  };
}

const dot = (left, right) =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

// Where a target at `ra`/`dec` (degrees) stands to the frame: `null` when it
// is not under it, otherwise `{ centreInside, distanceDegrees }`.
// `radiusDegrees` is the reach of its own extent (half its widest axis).
export function framingPlacement(frame, ra, dec, radiusDegrees = 0) {
  if (!frame || !Number.isFinite(ra) || !Number.isFinite(dec)) return null;
  if (Math.abs(dec - frame.centreDec) > frame.reachDegrees + radiusDegrees)
    return null;
  const raRadians = ra * DEGREE;
  const decRadians = dec * DEGREE;
  const cosDec = Math.cos(decRadians);
  const target = [
    cosDec * Math.cos(raRadians),
    cosDec * Math.sin(raRadians),
    Math.sin(decRadians),
  ];
  const along = dot(target, frame.forward);
  // The antipode of the frame's centre has no place on the map.
  const denominator = 1 + along;
  if (denominator < 1e-9) return null;
  const x = dot(target, frame.xAxis) / denominator;
  const y = dot(target, frame.yAxis) / denominator;
  const distanceDegrees = Math.acos(Math.min(1, Math.max(-1, along))) / DEGREE;
  if (distanceDegrees - radiusDegrees > frame.reachDegrees) return null;
  const inside = frame.circle
    ? (x / frame.halfWidth) ** 2 + (y / frame.halfHeight) ** 2 <= 1
    : Math.abs(x) <= frame.halfWidth && Math.abs(y) <= frame.halfHeight;
  if (inside) return { centreInside: true, distanceDegrees };
  if (!(radiusDegrees > 0)) return null;
  // The nearest point of the frame, and how far that is on the sky: the
  // projection is conformal, so a length on the map is a length on the sky
  // times `2 / (1 + rho^2)` at the target.
  let qx;
  let qy;
  if (frame.circle) {
    const reach = Math.hypot(x / frame.halfWidth, y / frame.halfHeight);
    qx = x / reach;
    qy = y / reach;
  } else {
    qx = Math.min(frame.halfWidth, Math.max(-frame.halfWidth, x));
    qy = Math.min(frame.halfHeight, Math.max(-frame.halfHeight, y));
  }
  const gap = (Math.hypot(x - qx, y - qy) * 2) / (1 + x * x + y * y) / DEGREE;
  if (gap > radiusDegrees) return null;
  return { centreInside: false, distanceDegrees };
}

// Half the widest axis of a target's apparent size, in degrees -- the disc its
// extent is taken as.
function extentRadiusDegrees(sizeArcmin) {
  if (!Array.isArray(sizeArcmin)) return 0;
  let widest = 0;
  for (const value of sizeArcmin)
    if (typeof value === "number" && Number.isFinite(value) && value > widest)
      widest = value;
  return widest / 2 / 60;
}

const text = (value) => (value == null ? "" : String(value).trim());

const messierOrCaldwell = /^(?:m|messier|c|caldwell)\s*0*\d+$/i;
// A name that is only a catalogue designation again: letters then a number
// ("NGC 1499", "Sh2-155", "PGC 2557").
const bareDesignation = /^[A-Za-z]{1,8}[\s-]*\d/;

// How well known a target is: 0 for a Messier or Caldwell object and for
// anything with a name of its own, 1 for the obscure designations.
export function framingTargetNotoriety(target) {
  const designation = text(target?.designation);
  const labels = [
    designation,
    ...(Array.isArray(target?.objects) ? target.objects.map(text) : []),
  ];
  if (labels.some((label) => messierOrCaldwell.test(label))) return 0;
  for (const name of [text(target?.name), text(target?.title)])
    if (name && name !== designation && !bareDesignation.test(name)) return 0;
  return 1;
}

const label = (target) => text(target?.designation) || text(target?.title);

const placed = (frame, candidate) => {
  const ra = candidate?.coordinate?.ra;
  const dec = candidate?.coordinate?.dec;
  if (typeof ra !== "number" || typeof dec !== "number") return null;
  const placement = framingPlacement(
    frame,
    ra,
    dec,
    extentRadiusDegrees(candidate.apparentSizeArcmin),
  );
  return placement ? { target: candidate, placement } : null;
};

// The catalogue targets under the frame of `center`/`field`/`angleDegrees`,
// best first, at most `limit`. `candidates` are planner-candidate targets (a
// position in degrees under `coordinate`, a size in `apparentSizeArcmin`).
// `featured` is the target a search put forward: if it is under the frame it
// comes first whatever it is next to (it need not be among the candidates).
export function framingTargetsUnderFrame({
  center,
  field,
  angleDegrees = 0,
  candidates = [],
  featured = null,
  limit = framingSuggestionLimit,
} = {}) {
  const frame = framingFootprint({ center, field, angleDegrees });
  if (!frame) return [];
  const found = [];
  for (const candidate of candidates) {
    const ranked = placed(frame, candidate);
    if (ranked) found.push(ranked);
  }
  const featuredId = featured?.id;
  if (featured && featuredId != null) {
    if (!found.some((ranked) => ranked.target.id === featuredId)) {
      const extra = placed(frame, featured);
      if (extra) found.push(extra);
    }
  }
  const isFeatured = (ranked) =>
    featuredId != null && ranked.target.id === featuredId;
  found.sort((left, right) => {
    if (isFeatured(left) !== isFeatured(right))
      return isFeatured(left) ? -1 : 1;
    if (left.placement.centreInside !== right.placement.centreInside)
      return left.placement.centreInside ? -1 : 1;
    const byFame =
      framingTargetNotoriety(left.target) -
      framingTargetNotoriety(right.target);
    if (byFame !== 0) return byFame;
    const byDistance =
      left.placement.distanceDegrees - right.placement.distanceDegrees;
    if (byDistance !== 0) return byDistance;
    const byName = label(left.target).localeCompare(label(right.target), "en", {
      numeric: true,
    });
    if (byName !== 0) return byName;
    return String(left.target.id).localeCompare(String(right.target.id));
  });
  return found.slice(0, limit).map((ranked) => ranked.target);
}
