// The light-pollution layer of the horizon map: the estimated sky brightness by
// direction around the place (`GET /v1/sky-quality/direction`,
// `skyBrightnessByDirection`), drawn as a translucent warm wash under the
// targets, in both projections. The drawing is a display option (the switch);
// the ranking of the targets reads the same grid through the same functions,
// switch on or off (`bright-zone.js`).
//
// The colour scale is ABSOLUTE, in mag/arcsec² (the default): a sky at 21.6 or
// darker is not tinted at all, then a warm ramp — the colours of the gradient,
// gold to brick — reaches its strongest at 18.0 and brighter. A warm
// translucent wash, never the violet of the mask nor the solid dots of the
// targets.

import {
  horizonCircularRadius,
  horizonCircularCentre,
} from "./horizon-projection.js";

/** At this value and darker, the layer is transparent. */
export const horizonLightDarkSqm = 21.6;
/** At this value and brighter, the layer is at its strongest. */
export const horizonLightBrightSqm = 18.0;

// The ramp's stops, `at` the fraction of the way from the dark end to the
// bright one. Colours: the gradient (#e0a85e, #de783c, #c44a34);
// alphas: the dome, at most 0.46, so the grid and the targets stay
// readable through it.
export const horizonLightRamp = Object.freeze([
  Object.freeze({ at: 0, red: 224, green: 168, blue: 94, alpha: 0 }),
  Object.freeze({ at: 0.3, red: 224, green: 168, blue: 94, alpha: 0.12 }),
  Object.freeze({ at: 0.62, red: 222, green: 120, blue: 60, alpha: 0.28 }),
  Object.freeze({ at: 1, red: 196, green: 74, blue: 52, alpha: 0.46 }),
]);

// The legend "Ciel plus sombre → Ciel plus clair": its own strip,
// more opaque than the layer so it reads on its own.
export const horizonLightLegendGradient =
  "linear-gradient(90deg, #0c120e 0%, rgba(224,168,94,0.35) 30%, rgba(222,120,60,0.6) 62%, rgba(196,74,52,0.85) 100%)";

const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * The layer's colour for a sky brightness: `{ red, green, blue, alpha }`
 * (channels 0–255, alpha 0–1 to the thousandth), or null where the layer is
 * transparent (21.6 and darker) or the value is unusable.
 */
export function horizonLightColor(sqm) {
  const value = finite(sqm);
  if (value === null || value >= horizonLightDarkSqm) return null;
  const t = Math.min(
    1,
    (horizonLightDarkSqm - value) /
      (horizonLightDarkSqm - horizonLightBrightSqm),
  );
  let index = 1;
  while (index < horizonLightRamp.length - 1 && horizonLightRamp[index].at < t)
    index += 1;
  const low = horizonLightRamp[index - 1];
  const high = horizonLightRamp[index];
  const f = (t - low.at) / (high.at - low.at);
  const mix = (a, b) => a + (b - a) * f;
  return {
    red: Math.round(mix(low.red, high.red)),
    green: Math.round(mix(low.green, high.green)),
    blue: Math.round(mix(low.blue, high.blue)),
    alpha: Math.round(mix(low.alpha, high.alpha) * 1000) / 1000,
  };
}

function gridShape(grid) {
  const step = finite(grid?.azimuthStepDegrees);
  const altitudes = Array.isArray(grid?.altitudes) ? grid.altitudes : null;
  const rows = Array.isArray(grid?.sqm) ? grid.sqm : null;
  if (!step || step <= 0 || !altitudes?.length || !rows) return null;
  if (rows.length !== altitudes.length) return null;
  const columns = rows[0]?.length;
  if (
    !columns ||
    rows.some((row) => !Array.isArray(row) || row.length !== columns)
  )
    return null;
  if (altitudes.some((altitude) => finite(altitude) === null)) return null;
  return { step, altitudes, rows, columns };
}

/**
 * The grid's brightness at one direction, read bilinearly: between the two
 * altitudes around `altitude` (clamped to the grid's lowest and highest) and
 * the two azimuth columns around `azimuth` (wrapping through north). Rounded
 * to the hundredth, like the grid. Null when the grid is unusable or a
 * neighbouring value is missing.
 */
export function horizonLightSqmAt(grid, azimuth, altitude) {
  const shape = gridShape(grid);
  const az = finite(azimuth);
  const alt = finite(altitude);
  if (!shape || az === null || alt === null) return null;
  const { step, altitudes, rows, columns } = shape;
  const lowest = altitudes[0];
  const highest = altitudes.at(-1);
  const clamped = Math.min(highest, Math.max(lowest, alt));
  let row = 0;
  while (row < altitudes.length - 2 && altitudes[row + 1] < clamped) row += 1;
  const nextRow = Math.min(row + 1, altitudes.length - 1);
  const span = altitudes[nextRow] - altitudes[row];
  const rowFraction = span > 0 ? (clamped - altitudes[row]) / span : 0;
  let wrapped = az % 360;
  if (wrapped < 0) wrapped += 360;
  const position = wrapped / step;
  const column = Math.floor(position) % columns;
  const nextColumn = (column + 1) % columns;
  const columnFraction = position - Math.floor(position);
  const values = [
    rows[row][column],
    rows[row][nextColumn],
    rows[nextRow][column],
    rows[nextRow][nextColumn],
  ].map(finite);
  if (values.some((value) => value === null)) return null;
  const [a, b, c, d] = values;
  const low = a + (b - a) * columnFraction;
  const high = c + (d - c) * columnFraction;
  return Math.round((low + (high - low) * rowFraction) * 100) / 100;
}

/**
 * The layer as RGBA pixels (non-premultiplied, the layout of `ImageData`),
 * `width` × `height`, covering the plot's own user space: the 200 × 200 dome
 * (zenith at the centre, horizon on the 86 radius, `rotation` turning it like
 * `horizonCircularPoint`) or the 360 × 90 azimuth × altitude rectangle.
 * Outside the dome, and where the sky is dark, the pixels are transparent.
 */
export function horizonLightLayerPixels(
  grid,
  { projection = "circular", rotation = 0, width, height } = {},
) {
  const circular = projection === "circular";
  const w = Math.max(1, Math.round(width ?? (circular ? 200 : 360)));
  const h = Math.max(1, Math.round(height ?? (circular ? 200 : 90)));
  const pixels = new Uint8ClampedArray(w * h * 4);
  if (!gridShape(grid)) return { width: w, height: h, pixels };
  const scaleX = (circular ? 200 : 360) / w;
  const scaleY = (circular ? 200 : 90) / h;
  const turn = finite(rotation) ?? 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const px = (x + 0.5) * scaleX;
      const py = (y + 0.5) * scaleY;
      let azimuth;
      let altitude;
      if (circular) {
        const dx = px - horizonCircularCentre;
        const dy = py - horizonCircularCentre;
        const radius = Math.hypot(dx, dy);
        if (radius > horizonCircularRadius) continue;
        altitude = 90 - (radius / horizonCircularRadius) * 90;
        azimuth = (Math.atan2(dy, dx) * 180) / Math.PI + 90 - turn;
      } else {
        azimuth = px;
        altitude = 90 - py;
      }
      const color = horizonLightColor(
        horizonLightSqmAt(grid, azimuth, altitude),
      );
      if (!color) continue;
      const offset = (y * w + x) * 4;
      pixels[offset] = color.red;
      pixels[offset + 1] = color.green;
      pixels[offset + 2] = color.blue;
      pixels[offset + 3] = Math.round(color.alpha * 255);
    }
  }
  return { width: w, height: h, pixels };
}

/**
 * What the switch "Pollution lumineuse par direction" can do, from the
 * state of the grid's request: `ready` (drawn when on), `loading` (on, the
 * grid is on its way), `unavailable` (the switch is disabled and says why:
 * no raster on the server, or no place). Off by default.
 */
export function horizonLightLayerState({ enabled = false, request } = {}) {
  const status = request?.status ?? "idle";
  if (status === "unavailable" || status === "no-place")
    return { enabled: false, available: false, drawn: false, reason: status };
  return {
    enabled: Boolean(enabled),
    available: true,
    drawn: Boolean(enabled) && status === "ready",
    loading: Boolean(enabled) && status === "loading",
    reason: null,
  };
}

const compassPoints = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/**
 * Where the layer is strongest, for the plot's spoken description: the
 * compass point (`N`, `NE`, … `NW`) of the brightest azimuth of the grid's
 * lowest row, or null when the whole low sky is dark (no tint at all).
 */
export function horizonLightStrongestDirection(grid) {
  const shape = gridShape(grid);
  if (!shape) return null;
  const row = shape.rows[0];
  let best = null;
  row.forEach((value, column) => {
    const sqm = finite(value);
    if (sqm !== null && (best === null || sqm < best.sqm))
      best = { sqm, column };
  });
  if (!best || best.sqm >= horizonLightDarkSqm) return null;
  return compassPoints[Math.round((best.column * shape.step) / 45) % 8];
}
