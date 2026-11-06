// Portable form of the detailed map's screen projection, extracted from the
// engine-bound helpers in `components/PlannerNightSkyMap.js` so the same
// numbers can be replayed outside a WebGL canvas. The formulas are
// unchanged: a stereographic mapping of the view-frame vector, scaled by
// `tan(fov / 4)` on each axis, with the wider axis widened by the aspect
// ratio exactly as the renderer does.

const degree = Math.PI / 180;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export const defaultMapFovDegrees = 120;
// The map zooms in a good deal further than the default field. 0.25° is 15
// arcminutes across the map's shorter axis. Below the finest tiles of the
// detailed survey the engine stretches the deepest tile it has -- the
// backdrop grows soft, it is never left blank.
export const minimumMapFovDegrees = 0.25;
export const maximumMapFovDegrees = 170;

export function clampMapFov(degrees) {
  const value = number(degrees);
  if (!Number.isFinite(value)) return defaultMapFovDegrees;
  return Math.min(maximumMapFovDegrees, Math.max(minimumMapFovDegrees, value));
}

// The zoom buttons multiply the current field by a fixed factor and clamp it;
// pinch passes the two-finger distance ratio through the same gate.
export function zoomedMapFov(currentDegrees, factor) {
  const current = number(currentDegrees);
  const ratio = number(factor);
  if (!Number.isFinite(current) || !Number.isFinite(ratio))
    return defaultMapFovDegrees;
  return clampMapFov(current * ratio);
}

// A two-finger pinch: spreading the fingers narrows the field, bringing them
// together widens it. `startFovDegrees` and `startDistance` are what the
// gesture began with, `distance` is the current finger distance. The result
// goes through the same gate as the zoom buttons and the wheel, so the three
// stop at exactly the same bounds.
export function pinchedMapFov(startFovDegrees, startDistance, distance) {
  const start = number(startFovDegrees);
  const from = number(startDistance);
  const to = number(distance);
  if (!(start > 0) || !(from > 0) || !(to > 0)) return clampMapFov(start);
  return clampMapFov(start * (from / to));
}

// The readout's own rounding. A tenth of a degree is right for a wide field
// but would turn 0.25° into 0.3° (a sixth too wide), so below one degree the
// value keeps a hundredth -- 0.6 arcminute, finer than the readout prints.
export function roundedMapFov(degrees) {
  const value = number(degrees);
  if (!Number.isFinite(value)) return Number.NaN;
  return value < 1
    ? Math.round(value * 100) / 100
    : Math.round(value * 10) / 10;
}

// Arcminutes under one degree ("15′"), degrees from there up ("2.4°"). The
// switch is on the *rounded* arcminutes: 0.995° would print "60′", which is a
// degree written the long way.
export function formatMapFov(degrees, locale = "en") {
  const value = number(degrees);
  if (!Number.isFinite(value)) return "—";
  if (value < 1) {
    const arcminutes = Math.round(value * 60);
    if (arcminutes < 60)
      return `${new Intl.NumberFormat(locale, {
        maximumFractionDigits: 0,
      }).format(Math.max(1, arcminutes))}′`;
  }
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value < 1 ? 1 : value)}°`;
}

export function fieldAxes(fovDegrees, width, height) {
  const fov = clampMapFov(fovDegrees) * degree;
  const aspect = number(width) / number(height);
  if (!Number.isFinite(aspect) || aspect <= 0) return null;
  const fovy = aspect < 1 ? 4 * Math.atan(Math.tan(fov / 4) / aspect) : fov;
  const fovx = aspect < 1 ? fov : 4 * Math.atan(Math.tan(fov / 4) * aspect);
  return { fovx, fovy };
}

function unitVector(ra, dec) {
  const raRadians = number(ra) * degree;
  const decRadians = number(dec) * degree;
  return [
    Math.cos(decRadians) * Math.cos(raRadians),
    Math.cos(decRadians) * Math.sin(raRadians),
    Math.sin(decRadians),
  ];
}

// The view frame looks down its negative Z axis, so the centre direction maps
// to [0, 0, -1]; east and north span the screen plane and carry the map
// rotation. This replaces the engine's ICRF → VIEW conversion for a J2000
// viewport that has no horizon orientation of its own.
function viewBasis(center, rollDegrees) {
  const ra = number(center?.ra) * degree;
  const dec = number(center?.dec) * degree;
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
  const forward = unitVector(number(center.ra), number(center.dec));
  const east = [-Math.sin(ra), Math.cos(ra), 0];
  const north = [
    -Math.sin(dec) * Math.cos(ra),
    -Math.sin(dec) * Math.sin(ra),
    Math.cos(dec),
  ];
  const roll = number(rollDegrees || 0) * degree;
  const cosine = Math.cos(roll);
  const sine = Math.sin(roll);
  return {
    forward,
    x: east.map((value, index) => value * cosine + north[index] * sine),
    y: north.map((value, index) => value * cosine - east[index] * sine),
  };
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

// Screen coordinates in the renderer's own [-1, 1] space: (0, 0) is the view
// centre, +x is to the right and +y is up. `null` means the point is behind
// the camera or outside the drawn margin, exactly as in the web overlay.
export function projectSkyPoint({
  center,
  coordinate,
  fovDegrees = defaultMapFovDegrees,
  rollDegrees = 0,
  width,
  height,
} = {}) {
  const basis = viewBasis(center, rollDegrees);
  const axes = fieldAxes(fovDegrees, width, height);
  if (!basis || !axes) return null;
  const ra = number(coordinate?.ra);
  const dec = number(coordinate?.dec);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
  const target = unitVector(ra, dec);
  const view = [
    dot(target, basis.x),
    dot(target, basis.y),
    -dot(target, basis.forward),
  ];
  const x = view[0] / (1 - view[2]) / Math.tan(axes.fovx / 4);
  const y = view[1] / (1 - view[2]) / Math.tan(axes.fovy / 4);
  if (!Number.isFinite(x) || !Number.isFinite(y) || view[2] >= 0) return null;
  if (Math.abs(x) > 1.13 || Math.abs(y) > 1.13) return null;
  return { x, y };
}

// The equipment rectangle (or circular eyepiece field) drawn over the map:
// the same tangent ratios the renderer syncs into the overlay's inline style
// every frame, plus their pixel sizes and the metadata visibility threshold.
export const equipmentMetadataMinimumPixels = { width: 150, height: 84 };

export function equipmentFieldRatios({
  field,
  fovDegrees = defaultMapFovDegrees,
  width,
  height,
} = {}) {
  const fieldWidth = number(field?.width);
  const fieldHeight = number(field?.height);
  const axes = fieldAxes(fovDegrees, width, height);
  if (!(fieldWidth > 0 && fieldHeight > 0) || !axes) return null;
  const horizontal =
    Math.tan((fieldWidth * degree) / 4) / Math.tan(axes.fovx / 4);
  const vertical =
    Math.tan((fieldHeight * degree) / 4) / Math.tan(axes.fovy / 4);
  if (
    !Number.isFinite(horizontal) ||
    !Number.isFinite(vertical) ||
    horizontal <= 0 ||
    vertical <= 0
  )
    return null;
  const pixelWidth = horizontal * number(width);
  const pixelHeight = vertical * number(height);
  return {
    horizontal,
    vertical,
    pixelWidth,
    pixelHeight,
    shape: field?.shape === "circle" ? "circle" : "rectangle",
    metadataVisible:
      pixelWidth >= equipmentMetadataMinimumPixels.width &&
      pixelHeight >= equipmentMetadataMinimumPixels.height,
  };
}

// Whether a catalogue object falls inside the displayed instrument field —
// the test that decides which known objects a new framing proposes.
export function pointInEquipmentField({
  center,
  coordinate,
  field,
  fovDegrees = defaultMapFovDegrees,
  rollDegrees = 0,
  width,
  height,
} = {}) {
  const ratios = equipmentFieldRatios({ field, fovDegrees, width, height });
  if (!ratios) return false;
  const point = projectSkyPoint({
    center,
    coordinate,
    fovDegrees,
    rollDegrees,
    width,
    height,
  });
  if (!point) return false;
  if (ratios.shape === "circle")
    return (
      (point.x / ratios.horizontal) ** 2 + (point.y / ratios.vertical) ** 2 <= 1
    );
  return (
    Math.abs(point.x) <= ratios.horizontal &&
    Math.abs(point.y) <= ratios.vertical
  );
}

export function angularDistanceDegrees(left, right) {
  const raDifference = (number(left?.ra) - number(right?.ra)) * degree;
  const leftDec = number(left?.dec) * degree;
  const rightDec = number(right?.dec) * degree;
  const cosine =
    Math.sin(leftDec) * Math.sin(rightDec) +
    Math.cos(leftDec) * Math.cos(rightDec) * Math.cos(raDifference);
  return Math.acos(Math.min(1, Math.max(-1, cosine))) / degree;
}
