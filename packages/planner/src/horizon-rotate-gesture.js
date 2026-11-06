// The vertical drag that turns the circular sky of the horizon map. About 180° over the map's height,
// snapped to 5° like the slider "Orientation de la carte", kept in [-180,
// 180]; the two side bands of 48 px leave a vertical drag to the page.

/** The width of each side band that never turns the map. */
export const horizonRotateBandWidth = 48;

/** Whether a finger landing at `x` on a map `width` wide may turn it. */
export function horizonRotateStartsInCentre(x, width) {
  return x >= horizonRotateBandWidth && x <= width - horizonRotateBandWidth;
}

/** The orientation after a vertical drag of `dy` on a map `height` high. */
export function horizonRotationForDrag({ startRotation, dy, height }) {
  const raw = Number(startRotation) + (dy / (height > 0 ? height : 1)) * 180;
  const snapped = Math.round(raw / 5) * 5;
  const wrapped = ((((snapped + 180) % 360) + 360) % 360) - 180;
  // `+ 0` turns a -0 into 0.
  return (wrapped === -180 && snapped > 0 ? 180 : wrapped) + 0;
}
