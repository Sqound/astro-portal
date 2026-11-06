// Abell (1966), Properties of Some Old Planetary Nebulae (ApJ 144, 259). The
// article has no data file of its own; the objects are read from the two CDS
// catalogues that name them and position them: the Strasbourg-ESO Catalogue
// of Galactic Planetary Nebulae (Acker et al. 1992, CDS V/84, `main.dat`,
// `diam.dat`), where an Abell planetary is named « A 39 », and the accurate
// J2000 positions of Kerber et al. (2003, CDS J/A+A/408/1029, `table1.dat`),
// keyed by the same usual name.
import { fk4B1950ToFk5J2000 } from "./fk4-fk5.js";
import { fixedNumber, tenths, type NebulaRecord } from "./nebula-record.js";

/** « Abell 39 »: one space, no zero-padding. */
export function abellDesignation(value: unknown): string | null {
  const match = String(value ?? "")
    .trim()
    .match(/^(?:abell[\s\-_.]*|(?:pn[\s\-_.]*)?a[\s]*66[\s\-_.]+)0*(\d+)$/i);
  return match ? `Abell ${match[1]}` : null;
}

/** The Abell designation a record carries, as `barnardKey`. */
export function abellKey(
  target: { designation?: string; aliases?: readonly string[] } | null,
): string | null {
  for (const value of [target?.designation, ...(target?.aliases || [])]) {
    const designation = abellDesignation(value);
    if (designation) return designation;
  }
  return null;
}

/** One planetary nebula of the Strasbourg-ESO catalogue (`main.dat`). */
export type StrasbourgPnRecord = {
  /** « PN G047.0+42.4 ». */
  galacticName: string;
  /** The catalogue's main name, spaces collapsed (« A 39 », « IC 1454 »). */
  name: string;
  /** « Abell 39 » when the main name or the other names say « A 39 ». */
  designation: string | null;
  /** NGC and IC names among the main and other names, in the app's writing. */
  crossIdentifiers: string[];
  /** B1950.0 FK4 brought to J2000. */
  coordinate: { ra: number; dec: number };
};

function collapse(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * One line of `main.dat`: « PNG » (bytes 1-10), the B1950.0 FK4 position
 * (bytes 13-34), the main name (bytes 46-58) and the other names
 * (bytes 115-224, separated by commas). An Abell planetary is « A n » (the
 * 1966 numbering; « A55 n » is Abell's 1955 list and is not used).
 */
export function parseStrasbourgPnRecord(
  line: string,
): StrasbourgPnRecord | null {
  const galactic = String(line ?? "")
    .slice(0, 10)
    .trim();
  const raHours = fixedNumber(line, 13, 14);
  const raMinutes = fixedNumber(line, 16, 17);
  const raSeconds = fixedNumber(line, 19, 23);
  const decDegrees = fixedNumber(line, 25, 26);
  const decMinutes = fixedNumber(line, 28, 29);
  const decSeconds = fixedNumber(line, 31, 34);
  if (
    !/^\d{3}\.\d[+-]\d{2}\.\d$/.test(galactic) ||
    raHours === null ||
    raMinutes === null ||
    decDegrees === null ||
    decMinutes === null
  )
    return null;
  const sign = line.slice(23, 24) === "-" ? -1 : 1;
  const name = collapse(line.slice(45, 58));
  const others = line.slice(114).split(",").map(collapse).filter(Boolean);
  let designation: string | null = null;
  const crossIdentifiers: string[] = [];
  for (const value of [name, ...others]) {
    const abell = value.match(/^A (\d+)$/);
    if (abell && !designation) designation = `Abell ${Number(abell[1])}`;
    const general = value.match(/^(NGC|IC) 0*(\d+)$/);
    if (general) crossIdentifiers.push(`${general[1]} ${general[2]}`);
  }
  return {
    galacticName: `PN G${galactic}`,
    name,
    designation,
    crossIdentifiers: [...new Set(crossIdentifiers)],
    coordinate: fk4B1950ToFk5J2000(
      raHours + raMinutes / 60 + (raSeconds ?? 0) / 3600,
      sign * (decDegrees + decMinutes / 60 + (decSeconds ?? 0) / 3600),
    ),
  };
}

/** One line of `diam.dat`: the optical diameter (arcseconds) in arcminutes. */
export function parseStrasbourgPnDiameter(
  line: string,
): { galacticName: string; apparentSizeArcmin: [number, number] } | null {
  const galactic = String(line ?? "")
    .slice(0, 10)
    .trim();
  const diameter = fixedNumber(line, 14, 19);
  if (!/^\d{3}\.\d[+-]\d{2}\.\d$/.test(galactic) || !diameter || diameter <= 0)
    return null;
  const arcmin = Math.max(0.1, tenths(diameter / 60));
  return {
    galacticName: `PN G${galactic}`,
    apparentSizeArcmin: [arcmin, arcmin],
  };
}

/**
 * One line of Kerber et al.'s `table1.dat`: the usual name (bytes 1-14) and
 * the J2000 position (bytes 30-54), used as it is.
 */
export function parseKerberPnPosition(
  line: string,
): { name: string; coordinate: { ra: number; dec: number } } | null {
  const name = collapse(String(line ?? "").slice(0, 14));
  const raHours = fixedNumber(line, 30, 31);
  const raMinutes = fixedNumber(line, 33, 34);
  const raSeconds = fixedNumber(line, 36, 41);
  const decDegrees = fixedNumber(line, 44, 45);
  const decMinutes = fixedNumber(line, 47, 48);
  const decSeconds = fixedNumber(line, 50, 54);
  if (
    !name ||
    raHours === null ||
    raMinutes === null ||
    decDegrees === null ||
    decMinutes === null
  )
    return null;
  const sign = line.slice(42, 43) === "-" ? -1 : 1;
  return {
    name,
    coordinate: {
      ra: raHours + raMinutes / 60 + (raSeconds ?? 0) / 3600,
      dec: sign * (decDegrees + decMinutes / 60 + (decSeconds ?? 0) / 3600),
    },
  };
}

/**
 * The Abell record of a Strasbourg-ESO planetary: its accurate J2000
 * position when Kerber et al. give one for the same name, else the
 * converted B1950.0 one; its optical diameter when known.
 */
export function abellRecord(
  planetary: StrasbourgPnRecord,
  accuratePosition: { ra: number; dec: number } | null,
  apparentSizeArcmin: readonly [number, number] | null,
): NebulaRecord | null {
  if (!planetary.designation) return null;
  return {
    designation: planetary.designation,
    coordinate: accuratePosition || planetary.coordinate,
    apparentSizeArcmin: apparentSizeArcmin || null,
  };
}
