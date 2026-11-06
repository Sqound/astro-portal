// Which Bortle class the sky map draws its star field at, and how
// faint a star each class lets through.
//
// The map used to hard-code `core.bortle_index = 4`
// (`PlannerNightSkyMap.js`), so an inner-city observer and a desert one got
// exactly the same sky. The planner already models the observing place's own
// light pollution (`requestPlannerSkyQuality` -> `bortleFromSqm`,
// `packages/portal/src/sky-quality.js`), and the map's control bar now also
// offers a manual override.
//
// ## The limit
//
// CALIBRATION-SKY-PHOTO-01 (02/11/2026): the limit is the planner's one
// naked-eye limit, Schaefer's formula on the class's typical SQM
// (`visual-limits.js`), the visual rule's. It used to be the table John
// Bortle published with the scale ("The Bortle Dark-Sky Scale", *Sky &
// Telescope*, February 2001), 1.2 to 1.3 magnitudes fainter at both ends:
//
//   | Class | Typical SQM | Bortle's table (before) | Schaefer (now) |
//   |-------|-------------|-------------------------|----------------|
//   | 1     | 22.0        | 7.8                     | 6.62           |
//   | 2     | 21.9        | 7.3                     | 6.58           |
//   | 3     | 21.8        | 6.8                     | 6.53           |
//   | 4     | 21.1        | 6.3                     | 6.17           |
//   | 5     | 20.0        | 5.8                     | 5.49           |
//   | 6     | 19.2        | 5.5                     | 4.92           |
//   | 7     | 18.7        | 5.0                     | 4.54           |
//   | 8     | 17.7        | 4.5                     | 3.71           |
//   | 9     | 16.5        | 4.0                     | 2.65           |
//
// The magnitude is not what the web's own map cuts its star field at --
// Stellarium Web does that itself, from the properties `engineSkyBrightness`
// below hands it -- but it is what the picker shows beside each class, so the
// observer reads what a class actually means rather than a bare number.

import { nakedEyeLimitingMagnitude } from "./visual-limits.js";

/**
 * The class the map falls back to when the place has no modelled sky
 * quality: a rural/suburban transition sky, the middle of the scale as
 * observed rather than the middle of its numbering.
 */
export const defaultBortleClass = 4;

/** The lowest and highest classes the scale defines. */
export const minimumBortleClass = 1;
export const maximumBortleClass = 9;

/**
 * Every class of the scale, in order, for a picker to walk.
 * @returns {number[]}
 */
export function bortleClasses() {
  return Array.from(
    { length: maximumBortleClass - minimumBortleClass + 1 },
    (_, index) => minimumBortleClass + index,
  );
}

/**
 * The faintest star visible under a Bortle `bortleClass` sky (Schaefer on
 * the class's typical SQM, `visual-limits.js`).
 *
 * Anything outside 1-9 is clamped rather than refused: the class can reach
 * this from a modelled estimate, and a sky is never darker than class 1 nor
 * brighter than class 9.
 *
 * @param {unknown} bortleClass
 * @returns {number}
 */
export function bortleLimitingMagnitude(bortleClass) {
  return nakedEyeLimitingMagnitude({
    bortle: normalizedBortleClass(bortleClass),
  });
}

/**
 * `value` as a class of the scale, or `null` when it is not one at all.
 *
 * A non-integer, a non-number and a value outside 1-9 are all refused here,
 * so a malformed stored estimate falls through to the default instead of
 * silently becoming class 1 or 9.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function bortleClassOrNull(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < minimumBortleClass || parsed > maximumBortleClass) return null;
  return parsed;
}

function normalizedBortleClass(value) {
  // `Number(null)` is 0, which would clamp to class 1 -- the darkest sky on
  // the scale -- for a value that simply is not one. An absent or unreadable
  // class is the default's sky, not the best one.
  if (value === null || value === undefined || value === "")
    return defaultBortleClass;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultBortleClass;
  return Math.min(
    maximumBortleClass,
    Math.max(minimumBortleClass, Math.round(parsed)),
  );
}

/**
 * The class the map actually draws with: the observer's own explicit
 * choice from the map's control bar when they have made one, otherwise
 * the place's modelled estimate, otherwise `defaultBortleClass`.
 *
 * `manual` is deliberately allowed to be `null`: that is the picker's own
 * "the place's own class" entry, not an absent value.
 *
 * @param {object} [options]
 * @param {unknown} [options.manual] the observer's explicit choice.
 * @param {unknown} [options.place] the place's modelled class.
 * @returns {number}
 */
export function mapBortleClass({ manual, place } = {}) {
  return (
    bortleClassOrNull(manual) ?? bortleClassOrNull(place) ?? defaultBortleClass
  );
}

// ## Why the class is not written straight into `core.bortle_index`
//
// In the bundled engine revision (`docs/STELLARIUM.md`, `e7201246`),
// `core.bortle_index` drives two unrelated things at once.
//
//  * `core.c` shrinks every star's point radius by
//    `star_linear_scale + 3/11 - bortle_index/11`. That is the light
//    pollution this map wants to show.
//  * `modules/dss.c` multiplies the whole survey layer's alpha by
//    `(9 - bortle_index) / 6`, then drops the layer entirely once the alpha
//    falls under `3/255` -- without even requesting its tiles. At class 8
//    the factor is 1/6, at class 9 it is exactly zero.
//
// So writing the observer's real class into `bortle_index` erases the DSS
// backdrop for anyone under a city sky, which is precisely the observer who
// most needs to see what a camera would actually record there. The survey is
// photographic reference data for framing, not a simulation of the naked
// eye: it must look the same from a desert and from a balcony.
//
// The engine therefore keeps seeing the class the survey layer is calibrated
// for, and the star extinction is reproduced exactly through
// `star_linear_scale`, which the engine exposes for that purpose. Both
// values below feed `core` directly; nothing else in the engine reads
// `bortle_index` (its third reader, `modules/atmosphere.c`, is inert because
// the planner map hides the atmosphere).

/**
 * The Bortle class the engine itself is told about. Class 4 is the value the
 * map hard-coded before the class became a parameter, so the survey backdrop
 * keeps exactly the brightness it had then, at every class.
 */
export const surveyBortleIndex = 4;

/** The engine's own default `core.star_linear_scale` (upstream `core.c`). */
export const defaultStarLinearScale = 0.8;

/**
 * How the engine must be driven to draw a `bortleClass` sky.
 *
 * `starLinearScale` offsets the pinned `bortleIndex` by exactly the term
 * `core.c` derives from the class, so the star field is the one the class
 * calls for while the survey layer stays at its class-4 brightness.
 *
 * @param {unknown} bortleClass
 * @returns {{bortleIndex: number, starLinearScale: number}}
 */
export function engineSkyBrightness(bortleClass) {
  const value = normalizedBortleClass(bortleClass);
  return {
    bortleIndex: surveyBortleIndex,
    starLinearScale: defaultStarLinearScale + (surveyBortleIndex - value) / 11,
  };
}
