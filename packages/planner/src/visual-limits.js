// How faint a star the eye reaches, naked or at the eyepiece: the one
// limiting magnitude of the planner (CALIBRATION-SKY-PHOTO-01, 02/11/2026).
//
// The planner had two versions of each limit: the sky map's Bortle table
// (7.8 ... 4.0, `bortle.js`) beside Schaefer's formula on the SQM of the
// visual rule (`planner.js`); the eyepiece view's `table + 5 log10(D / 7)`
// beside the visual rule's exit-pupil darkening. They disagreed by up to 1.3
// magnitudes at both ends of the scale. Every caller now reads this file;
// the phone applications read the same constants and formulas.
//
// Naked eye: NELM = 7.93 - 5 log10(10^(4.316 - SQM/5) + 1) -- Schaefer
// (1990), "Telescopic limiting magnitudes", PASP 102, 212, in the SQM form
// Unihedron publishes. The SQM is the place's own when it is known, else the
// typical SQM of its Bortle class (`sky.sqmByBortle` of
// `eyepiece-view-constants.json`).
//
// At the eyepiece: the exit pupil (aperture / magnification, at most the
// eye's 7 mm) darkens the sky the eye sees by 5 log10(7 / pupil), then the
// aperture gathers 5 log10(aperture / 7) more. Without a sky, the dark-sky
// rule of thumb 2.7 + 5 log10(aperture).
//
// (The app also brightens the sky by the Moon, Krisciunas & Schaefer 1991,
// for its calibration aid; nothing on the web reads the Moon yet.)

import eyepieceViewConstants from "./eyepiece-view-constants.json" with { type: "json" };

/** Schaefer's naked-eye limit under a perfectly dark sky. */
export const schaeferNelmZero = 7.93;

/** The SQM offset of Schaefer's formula. */
export const schaeferNelmSkyOffset = 4.316;

/** The dark-adapted eye's pupil, millimetres. */
export const visualEyePupilMm = 7;

/** The instrument's limit without any sky: 2.7 + 5 log10(aperture). */
export const darkSkyInstrumentZero = 2.7;

const minimumBortle = 1;
const maximumBortle = 9;
const fallbackBortle = 4;

/**
 * Schaefer's naked-eye limiting magnitude under a sky of `skySqm`
 * mag/arcsec².
 * @param {number} skySqm
 * @returns {number}
 */
export function schaeferLimitingMagnitude(skySqm) {
  return (
    schaeferNelmZero -
    5 * Math.log10(10 ** (schaeferNelmSkyOffset - skySqm / 5) + 1)
  );
}

/**
 * The typical SQM of Bortle class `bortleClass` (an integer, clamped to
 * 1-9).
 * @param {number} bortleClass
 * @returns {number}
 */
export function skySqmOfBortle(bortleClass) {
  const index =
    Math.min(maximumBortle, Math.max(minimumBortle, bortleClass)) - 1;
  return eyepieceViewConstants.sky.sqmByBortle[index];
}

/**
 * The sky's SQM: `sqm` when it is a reading (finite, positive), else the
 * typical SQM of `bortle`, else `null`.
 * @param {{sqm?: number|null, bortle?: number|null}} sky
 * @returns {number|null}
 */
export function skySqmOf({ sqm = null, bortle = null } = {}) {
  if (typeof sqm === "number" && Number.isFinite(sqm) && sqm > 0) return sqm;
  if (typeof bortle === "number" && Number.isInteger(bortle))
    return skySqmOfBortle(bortle);
  return null;
}

/**
 * The faintest star the naked eye reaches under the place's sky: its `sqm`,
 * else the typical SQM of its `bortle` class, else of class 4.
 * @param {{sqm?: number|null, bortle?: number|null}} sky
 * @returns {number}
 */
export function nakedEyeLimitingMagnitude({ sqm = null, bortle = null } = {}) {
  return schaeferLimitingMagnitude(
    skySqmOf({ sqm, bortle }) ?? skySqmOfBortle(fallbackBortle),
  );
}

/**
 * The faintest star an instrument of `apertureMm` shows at an exit pupil of
 * `exitPupilMm` (`null`: the eye's 7 mm) under the place's sky (`sqm`, else
 * `bortle`; neither: 2.7 + 5 log10(aperture)). NaN without a positive
 * aperture.
 * @param {{apertureMm: number, sqm?: number|null, bortle?: number|null,
 *   exitPupilMm?: number|null}} input
 * @returns {number}
 */
export function instrumentLimitingMagnitude({
  apertureMm,
  sqm = null,
  bortle = null,
  exitPupilMm = null,
} = {}) {
  if (!(apertureMm > 0)) return Number.NaN;
  const sky = skySqmOf({ sqm, bortle });
  if (sky === null) return darkSkyInstrumentZero + 5 * Math.log10(apertureMm);
  const pupil =
    typeof exitPupilMm === "number" &&
    Number.isFinite(exitPupilMm) &&
    exitPupilMm > 0
      ? Math.min(exitPupilMm, visualEyePupilMm)
      : visualEyePupilMm;
  return (
    schaeferLimitingMagnitude(sky + 5 * Math.log10(visualEyePupilMm / pupil)) +
    5 * Math.log10(apertureMm / visualEyePupilMm)
  );
}
