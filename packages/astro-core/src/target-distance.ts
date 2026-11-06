// The distance of a target, « quand connue, sinon absente »: three
// layers, never a value invented.
//
//   1. `published` — the curated table (`target-distances.json`) has the
//      object: its value wins. It is the checked one, with its reference.
//   2. `parallax`  — an open or globular cluster, a planetary nebula or a
//      nebula whose OpenNGC `Pax` is at least 0.5 mas: 1 / Pax. Never for a
//      galaxy (their `Pax` is noise), never below 0.5 mas (beyond about
//      2 kpc the inversion of a parallax bites: no value).
//   3. `redshift`  — a galaxy whose radial velocity is 1 000 km/s or more:
//      Hubble's law at 70 km/s/Mpc. An **estimation** (see
//      [distanceIsEstimate]): the word is mandatory wherever it is shown.
//   4. otherwise `null`: no value, and no tile on the screens.
//
// Pure: no I/O, no table imported — the caller passes the curated table, so
// the import script, the service and the tests all read the rule one way.

/** The layer a distance comes from (the order above, strongest first). */
export type TargetDistanceSource = "published" | "parallax" | "redshift";

export type TargetDistance = {
  /** Light-years, rounded to the significant digits of its layer. */
  lightYears: number;
  source: TargetDistanceSource;
  /**
   * `published`: the table's reference (« Author Year, journal/catalogue »).
   * `parallax`: the OpenNGC column it comes from. `redshift`: the law.
   */
  reference: string;
};

/** One entry of the curated table (`target-distances.json`). */
export type CuratedDistance = {
  id: string;
  value: number;
  unit: DistanceUnit;
  reference: string;
  url: string;
  retrievedAt: string;
};

export const distanceUnits = ["ly", "kly", "Mly", "pc", "kpc", "Mpc"] as const;
export type DistanceUnit = (typeof distanceUnits)[number];

/** The fields of an import record the rule reads. */
export type TargetDistanceRecord = {
  designation?: string | null;
  typeKey?: string | null;
  parallaxMas?: number | null;
  radialVelocityKmS?: number | null;
};

/** Light-years in one parsec (IAU 2012: 648000/π au; 1 ly = 9.4607304725808e15 m). */
export const lightYearsPerParsec = 3.261563777;

/** The Hubble constant of the redshift layer, km/s/Mpc. */
export const hubbleConstantKmPerSecondPerMegaparsec = 70;

/** Below this parallax (mas) the inversion is not trusted: no value. */
export const minimumParallaxMas = 0.5;

/** Below this radial velocity (km/s) local motions dominate: no value. */
export const minimumRadialVelocityKmS = 1000;

const parsecsPerUnit: Readonly<Record<DistanceUnit, number>> = {
  ly: 1 / lightYearsPerParsec,
  kly: 1000 / lightYearsPerParsec,
  Mly: 1e6 / lightYearsPerParsec,
  pc: 1,
  kpc: 1e3,
  Mpc: 1e6,
};

// Object types whose OpenNGC `Pax` is the parallax of the object (or of its
// exciting star or cluster), as the catalogue's French type keys write them.
const parallaxTypes: ReadonlySet<string> = new Set([
  "Amas ouvert",
  "Amas globulaire",
  "Nébuleuse planétaire",
  "Nébuleuse en émission",
  "Nébuleuse en réflexion",
  "Nébuleuse sombre",
]);

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Rounds `value` to `digits` significant digits. */
export function roundSignificant(value: number, digits: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  const scale = 10 ** (digits - 1 - Math.floor(Math.log10(Math.abs(value))));
  return Math.round(value * scale) / scale;
}

/**
 * The number of significant digits a published value is written with
 * (`2.54` → 3, `0.77` → 2, `1344` → 4, `770` → 2: trailing zeros of an
 * integer are not counted, as « 770 kpc » is a two-digit value).
 */
export function significantDigits(value: number): number {
  const text = String(Math.abs(value));
  if (/e/i.test(text)) return 3;
  const digits = text.replace(".", "").replace(/^0+/, "");
  const stripped = text.includes(".") ? digits : digits.replace(/0+$/, "");
  return Math.max(1, stripped.length);
}

/** A curated entry converted to light-years, in the digits it is published with. */
export function curatedLightYears(entry: CuratedDistance): number | null {
  const factor = parsecsPerUnit[entry.unit];
  const value = finite(entry.value);
  if (factor === undefined || value === null || value <= 0) return null;
  const lightYears = value * factor * lightYearsPerParsec;
  const converted = entry.unit === "ly" ? value : lightYears;
  return Math.round(roundSignificant(converted, significantDigits(value)));
}

/** True when the distance is modelled, not measured: wording « estimation ». */
export function distanceIsEstimate(
  source: TargetDistanceSource | string | null | undefined,
): boolean {
  return source === "redshift";
}

/** The curated table as a map keyed by the library's designation. */
export function curatedDistanceMap(
  entries: readonly CuratedDistance[],
): Map<string, CuratedDistance> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

export const parallaxReference = "OpenNGC Pax (Gaia), 1/Pax";
export const redshiftReference = "OpenNGC RadVel, Hubble's law at 70 km/s/Mpc";

/**
 * The distance of `record`, or `null` when no layer has one.
 * `curated` maps the library's designation to its curated entry.
 */
export function targetDistance(
  record: TargetDistanceRecord,
  curated: ReadonlyMap<string, CuratedDistance> | null = null,
): TargetDistance | null {
  const entry = record.designation
    ? curated?.get(record.designation)
    : undefined;
  if (entry) {
    const lightYears = curatedLightYears(entry);
    if (lightYears !== null)
      return { lightYears, source: "published", reference: entry.reference };
  }
  const parallax = finite(record.parallaxMas);
  if (
    parallax !== null &&
    parallax >= minimumParallaxMas &&
    record.typeKey &&
    parallaxTypes.has(record.typeKey)
  ) {
    return {
      lightYears: Math.round(
        roundSignificant((1000 / parallax) * lightYearsPerParsec, 3),
      ),
      source: "parallax",
      reference: parallaxReference,
    };
  }
  const velocity = finite(record.radialVelocityKmS);
  if (
    velocity !== null &&
    velocity >= minimumRadialVelocityKmS &&
    record.typeKey === "Galaxie"
  ) {
    return {
      lightYears: Math.round(
        roundSignificant(
          (velocity / hubbleConstantKmPerSecondPerMegaparsec) *
            1e6 *
            lightYearsPerParsec,
          2,
        ),
      ),
      source: "redshift",
      reference: redshiftReference,
    };
  }
  return null;
}
