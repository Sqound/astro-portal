// The advice on a magnification: is the view through this telescope and this
// eyepiece within what the instrument can show, or does it magnify past its
// resolution (a dark, blurred image with no more detail), or so little that
// part of the light misses the eye?
//
// The rule is pure; the `magnification-advice` fixture holds every client to
// it. All the figures follow from the aperture alone:
//
// - resolution (Dawes limit) = 116 arcsec / aperture in mm;
// - the magnification that makes that resolution visible to the eye is about
//   aperture / 2;
// - the useful maximum is about 2 x the aperture in mm (an exit pupil of
//   0.5 mm): past it the image only gets dimmer and softer;
// - the advice warns from 1.5 x the aperture ("near-limit"), says "beyond"
//   past 2 x and "far-beyond" past 2.5 x;
// - an exit pupil wider than 7 mm (the eye's pupil, dark-adapted) wastes the
//   light that falls outside it: "low-power".
//
// Any missing input answers `null`.

export const magnificationAdviceConstants = Object.freeze({
  usefulPerMm: 2,
  nearLimitPerMm: 1.5,
  farBeyondPerMm: 2.5,
  resolvingPerMm: 0.5,
  lowPowerPupilMm: 7,
  dawesArcsec: 116,
});

const positive = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
const round = (value, decimals) => {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
};

/**
 * The advice for `magnification` through a telescope of `apertureMm`, or
 * `null` without both.
 *
 * - `level`: `ok`, `near-limit` (over 1.5 x the aperture), `beyond` (over
 *   2 x), `far-beyond` (over 2.5 x) or `low-power` (exit pupil over 7 mm);
 * - `exitPupilMm`: aperture / magnification;
 * - `usefulMaxMagnification`: 2 x the aperture, down to the ten;
 * - `resolvingMagnification`: aperture / 2, down to the unit;
 * - `dawesArcsec`: 116 / aperture, with two decimals.
 */
export function magnificationAdvice(apertureMm, magnification) {
  const k = magnificationAdviceConstants;
  const aperture = positive(apertureMm);
  const power = positive(magnification);
  if (aperture === null || power === null) return null;
  const exitPupilMm = aperture / power;
  let level = "ok";
  if (power > k.farBeyondPerMm * aperture) level = "far-beyond";
  else if (power > k.usefulPerMm * aperture) level = "beyond";
  else if (power > k.nearLimitPerMm * aperture) level = "near-limit";
  else if (exitPupilMm > k.lowPowerPupilMm) level = "low-power";
  return {
    level,
    exitPupilMm,
    usefulMaxMagnification: Math.floor((k.usefulPerMm * aperture) / 10) * 10,
    resolvingMagnification: Math.floor(k.resolvingPerMm * aperture),
    dawesArcsec: round(k.dawesArcsec / aperture, 2),
  };
}
