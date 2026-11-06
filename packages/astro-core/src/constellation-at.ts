import { constellationBoundaryParallels } from "./constellation-boundaries.js";

// The IAU constellation that holds a point of the sky.
//
// The boundaries are Delporte's, drawn along meridians and parallels of the
// equinox of the beginning of 1875 (Besselian epoch B1875.0), as the IAU
// adopted them in 1930. A catalogue position is J2000.0, so it is first
// precessed to B1875.0 (the IAU 1976 angles, from J2000.0 to the Julian Date
// of the epoch); reading the boundaries as if they were J2000.0 puts 45 of
// the 695 stars of the constellation lines in the wrong constellation (five
// stars are in the neighbour either way, the lines being drawn across the
// boundary). The precession model (IAU 1976, from the equinox of J2000.0
// to that of B1875.0) differs by up to ten seconds of arc from the
// FK4-based chain that Roman's table (and `astronomy-engine`'s
// `Constellation`) uses: on 400 000 random points the two agree on all but 58
// (0.015 %), every one of them within ten seconds of arc of a boundary. A point
// that close to a boundary may be given to the neighbour.
//
// The rule uses the parallels only: the constellation of a point is the one
// that has an odd number of parallels above the point (towards the north
// pole, over the point's right ascension), the constellation that holds the
// pole counting one more. A parallel covers `[start, end)` of right ascension,
// so a point on a meridian belongs to the constellation east of it, and a
// point on a parallel to the one north of it. The boundaries tile the sphere:
// every point has exactly one constellation.

/** The Julian Date of Besselian epoch B1875.0. */
export const constellationBoundaryEpochJulianDate = 2405889.25855;

/** The constellation of the north celestial pole (Ursa Minor). */
const polarConstellation = "UMi";

const secondsPerTurn = 86400;
const radiansPerDegree = Math.PI / 180;
const radiansPerArcSecond = Math.PI / (180 * 3600);

const julianCenturies =
  (constellationBoundaryEpochJulianDate - 2451545.0) / 36525;

const zeta =
  (2306.2181 * julianCenturies +
    0.30188 * julianCenturies ** 2 +
    0.017998 * julianCenturies ** 3) *
  radiansPerArcSecond;
const zed =
  (2306.2181 * julianCenturies +
    1.09468 * julianCenturies ** 2 +
    0.018203 * julianCenturies ** 3) *
  radiansPerArcSecond;
const theta =
  (2004.3109 * julianCenturies -
    0.42665 * julianCenturies ** 2 -
    0.041833 * julianCenturies ** 3) *
  radiansPerArcSecond;

/**
 * A J2000.0 position precessed to the equinox of B1875.0:
 * `[right ascension in seconds of time, declination in seconds of arc]`.
 */
export function precessToBoundaryEpoch(
  rightAscensionDegrees: number,
  declinationDegrees: number,
): [number, number] {
  const alpha = rightAscensionDegrees * radiansPerDegree;
  const delta = declinationDegrees * radiansPerDegree;
  const a = Math.cos(delta) * Math.sin(alpha + zeta);
  const b =
    Math.cos(theta) * Math.cos(delta) * Math.cos(alpha + zeta) -
    Math.sin(theta) * Math.sin(delta);
  const c =
    Math.sin(theta) * Math.cos(delta) * Math.cos(alpha + zeta) +
    Math.cos(theta) * Math.sin(delta);
  const rightAscension = (Math.atan2(a, b) + zed) / radiansPerDegree;
  const declination =
    Math.asin(Math.max(-1, Math.min(1, c))) / radiansPerDegree;
  return [(((rightAscension % 360) + 360) % 360) * 240, declination * 3600];
}

/**
 * The IAU abbreviation (`Lyr`, `UMa`, `CrB`…) of the constellation that holds
 * the J2000.0 position, or `null` when a coordinate is not a finite number
 * or the declination is outside −90°…+90°.
 */
export function constellationAt(
  rightAscensionDegrees: number,
  declinationDegrees: number,
): string | null {
  if (
    typeof rightAscensionDegrees !== "number" ||
    typeof declinationDegrees !== "number" ||
    !Number.isFinite(rightAscensionDegrees) ||
    !Number.isFinite(declinationDegrees) ||
    declinationDegrees < -90 ||
    declinationDegrees > 90
  )
    return null;
  const [rightAscension, declination] = precessToBoundaryEpoch(
    rightAscensionDegrees,
    declinationDegrees,
  );
  for (const [key, parallels] of Object.entries(
    constellationBoundaryParallels,
  )) {
    let above = key === polarConstellation ? 1 : 0;
    for (let index = 0; index + 2 < parallels.length; index += 3) {
      if ((parallels[index] ?? 0) <= declination) continue;
      const start = parallels[index + 1] ?? 0;
      const span =
        ((parallels[index + 2] ?? 0) - start + secondsPerTurn) % secondsPerTurn;
      if ((rightAscension - start + secondsPerTurn) % secondsPerTurn < span)
        above += 1;
    }
    if (above % 2 === 1) return key;
  }
  return null;
}
