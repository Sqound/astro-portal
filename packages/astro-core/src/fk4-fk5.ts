// Old catalogue positions brought to J2000.
//
// The nebula catalogues (Sharpless 1959, Lynds 1962 and 1965, the
// Strasbourg-ESO planetary nebulae) give their positions in the FK4 system,
// at the equinox B1900.0 or B1950.0, or in IAU 1958 galactic coordinates.
// The app reads J2000 (FK5). A plain precession from 1950 to 2000 is not the
// right transformation: FK4 and FK5 differ by the equinox correction, by the
// elliptic terms of aberration (« E-terms », up to 0.34″) baked into every
// FK4 mean place, and by a slow rotation. The standard transformation
// (Standish 1982, Aoki et al. 1983, as SLALIB's `sla_FK45Z` implements it for
// an object without proper motion in FK5) is written here: remove the
// E-terms, apply the 6 × 3 matrix, allow for the fictitious proper motion of
// FK4 at the epoch. A B1900.0 position is first precessed within FK4 to
// B1950.0 with Newcomb's precession (`sla_PREBN`). A galactic position is
// turned into its B1950.0 FK4 direction (IAU 1958 definition, `sla_GE50`) and
// then follows the same path.
//
// Reference value held by the tests: 3C 273, B1950.0 FK4 12h 26m 33.246s,
// +02° 19′ 43.30″, gives J2000 12h 29m 06.70s, +02° 03′ 08.6″ (to 0.1″).

type Vector = readonly [number, number, number];

/** A J2000 equatorial position: right ascension in hours, declination in degrees. */
export type EquatorialJ2000 = { ra: number; dec: number };

const twoPi = Math.PI * 2;
const degree = Math.PI / 180;
const arcsecond = degree / 3600;
// Radians per arcsecond per century, as SLALIB's PMF.
const perCentury = (100 * 60 * 60 * 360) / twoPi;

// E-terms of aberration (radians) and their rate of change (arcsec/century).
const eTerms: Vector = [-1.62557e-6, -0.31919e-6, -0.13843e-6];
const eTermRates: Vector = [1.245e-3, -1.58e-3, -0.659e-3];

// FK4 → FK5: the position rows then the velocity rows of the 6 × 3 matrix.
const fk4ToFk5: readonly Vector[] = [
  [0.9999256782, -0.0111820611, -0.0048579477],
  [0.011182061, 0.9999374784, -0.0000271765],
  [0.0048579479, -0.0000271474, 0.9999881997],
  [-0.000551, -0.238565, 0.435739],
  [0.238514, -0.002667, -0.008541],
  [-0.435623, 0.012254, 0.002117],
];

// B1950.0 FK4 equatorial → IAU 1958 galactic (rows), as SLALIB's EG50.
const fk4ToGalactic: readonly Vector[] = [
  [-0.066988739415, -0.872755765852, -0.483538914632],
  [0.492728466075, -0.45034695802, 0.744584633283],
  [-0.867600811151, -0.188374601723, 0.460199784784],
];

function cartesian(longitude: number, latitude: number): Vector {
  const cosLatitude = Math.cos(latitude);
  return [
    Math.cos(longitude) * cosLatitude,
    Math.sin(longitude) * cosLatitude,
    Math.sin(latitude),
  ];
}

function spherical(vector: Vector): EquatorialJ2000 {
  const [x, y, z] = vector;
  const angle = Math.atan2(y, x);
  const rightAscension = angle < 0 ? angle + twoPi : angle;
  const declination = Math.atan2(z, Math.hypot(x, y));
  return { ra: rightAscension / (15 * degree), dec: declination / degree };
}

function multiply(matrix: readonly Vector[], vector: Vector): Vector {
  return matrix.map(
    (row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2],
  ) as unknown as Vector;
}

function transpose(matrix: readonly Vector[]): Vector[] {
  return [0, 1, 2].map(
    (column) =>
      [matrix[0]![column]!, matrix[1]![column]!, matrix[2]![column]!] as const,
  );
}

// Besselian epoch → Julian epoch (SLALIB's EPB2D then EPJ).
function julianEpochOfBesselian(besselianEpoch: number): number {
  const modifiedJulianDate =
    15019.81352 + (besselianEpoch - 1900) * 365.242198781;
  return 2000 + (modifiedJulianDate - 51544.5) / 365.25;
}

// The FK5 J2000 direction of an E-term-free FK4 B1950.0 vector (the second
// half of `sla_FK45Z`, at the observation epoch `besselianEpoch`).
function fk5FromFk4WithoutETerms(
  vector: Vector,
  besselianEpoch: number,
): EquatorialJ2000 {
  const six = fk4ToFk5.map(
    (row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2],
  );
  const years = (julianEpochOfBesselian(besselianEpoch) - 2000) / perCentury;
  return spherical([
    six[0]! + years * six[3]!,
    six[1]! + years * six[4]!,
    six[2]! + years * six[5]!,
  ]);
}

/**
 * B1950.0 FK4 → J2000 FK5 for an object without proper motion
 * (`sla_FK45Z`). Right ascension in hours, declination in degrees; the
 * observation epoch defaults to 1950.0, which is what the catalogues give.
 */
export function fk4B1950ToFk5J2000(
  raHours: number,
  decDegrees: number,
  besselianEpoch = 1950,
): EquatorialJ2000 {
  const position = cartesian(raHours * 15 * degree, decDegrees * degree);
  const shift = (besselianEpoch - 1950) / perCentury;
  const terms = eTerms.map(
    (value, index) => value + shift * eTermRates[index]!,
  ) as unknown as Vector;
  const projection =
    position[0] * terms[0] + position[1] * terms[1] + position[2] * terms[2];
  const withoutETerms = position.map(
    (value, index) => value - terms[index]! + projection * value,
  ) as unknown as Vector;
  return fk5FromFk4WithoutETerms(withoutETerms, besselianEpoch);
}

/**
 * Newcomb's precession within FK4 between two Besselian equinoxes
 * (`sla_PREBN`), applied to a position: right ascension in hours,
 * declination in degrees.
 */
export function precessFk4(
  raHours: number,
  decDegrees: number,
  fromEquinox: number,
  toEquinox: number,
): EquatorialJ2000 {
  const bigT = (fromEquinox - 1850) / 100;
  const t = (toEquinox - fromEquinox) / 100;
  const scale = t * arcsecond;
  const w = 2303.5548 + (1.3972 + 0.000059 * bigT) * bigT;
  const zeta = (w + (0.30242 - 0.000269 * bigT + 0.017996 * t) * t) * scale;
  const z = (w + (1.09478 + 0.000387 * bigT + 0.018324 * t) * t) * scale;
  const theta =
    (2005.1125 +
      (-0.85294 - 0.000365 * bigT) * bigT +
      (-0.42647 - 0.000365 * bigT - 0.041802 * t) * t) *
    scale;
  // R3(−z) · R2(θ) · R3(−ζ), rotations of the axes.
  const rotateZ = (angle: number): Vector[] => [
    [Math.cos(angle), Math.sin(angle), 0],
    [-Math.sin(angle), Math.cos(angle), 0],
    [0, 0, 1],
  ];
  const rotateY = (angle: number): Vector[] => [
    [Math.cos(angle), 0, -Math.sin(angle)],
    [0, 1, 0],
    [Math.sin(angle), 0, Math.cos(angle)],
  ];
  const position = cartesian(raHours * 15 * degree, decDegrees * degree);
  return spherical(
    multiply(
      rotateZ(-z),
      multiply(rotateY(theta), multiply(rotateZ(-zeta), position)),
    ),
  );
}

/** B1900.0 FK4 → J2000 FK5: Newcomb's precession to B1950.0, then FK4 → FK5. */
export function fk4B1900ToFk5J2000(
  raHours: number,
  decDegrees: number,
): EquatorialJ2000 {
  const b1950 = precessFk4(raHours, decDegrees, 1900, 1950);
  return fk4B1950ToFk5J2000(b1950.ra, b1950.dec);
}

/**
 * IAU 1958 galactic coordinates (degrees) → J2000 FK5. The galactic frame is
 * defined on E-term-free B1950.0 FK4 directions (`sla_GE50` adds the E-terms
 * that `sla_FK45Z` removes), so the vector goes straight to the FK4 → FK5
 * matrix.
 */
export function galacticToFk5J2000(
  longitudeDegrees: number,
  latitudeDegrees: number,
): EquatorialJ2000 {
  const galactic = cartesian(
    longitudeDegrees * degree,
    latitudeDegrees * degree,
  );
  return fk5FromFk4WithoutETerms(
    multiply(transpose(fk4ToGalactic), galactic),
    1950,
  );
}

/** Angular separation of two J2000 positions, in arcminutes. */
export function separationArcmin(
  left: EquatorialJ2000,
  right: EquatorialJ2000,
): number {
  const a = cartesian(left.ra * 15 * degree, left.dec * degree);
  const b = cartesian(right.ra * 15 * degree, right.dec * degree);
  const cross = Math.hypot(
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  );
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return (Math.atan2(cross, dot) / degree) * 60;
}
