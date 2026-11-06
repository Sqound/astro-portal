// Sharpless (1959), Catalogue of H II Regions — CDS/VizieR VII/20,
// `catalog.dat`. Fixed columns from the ReadMe.
import { fk4B1900ToFk5J2000 } from "./fk4-fk5.js";
import { fixedNumber, type NebulaRecord } from "./nebula-record.js";

/** « Sh2-155 »: the hyphen of the catalogue, no zero-padding. */
export function sharplessDesignation(value: unknown): string | null {
  const match = String(value ?? "")
    .trim()
    .match(/^sh\s*2[\s\-_.]*0*(\d+)$/i);
  return match ? `Sh2-${match[1]}` : null;
}

/** The Sharpless designation a record carries, as `barnardKey`. */
export function sharplessKey(
  target: { designation?: string; aliases?: readonly string[] } | null,
): string | null {
  for (const value of [target?.designation, ...(target?.aliases || [])]) {
    const designation = sharplessDesignation(value);
    if (designation) return designation;
  }
  return null;
}

/**
 * One line of `catalog.dat`. The published position is the B1900.0 one
 * (bytes 21-34; the B1950.0 columns were computed later and are not in the
 * publication), brought to J2000 by `fk4B1900ToFk5J2000`. The size is the
 * maximum diameter in arcminutes (bytes 49-52), unknown when blank or zero.
 */
export function parseSharplessRecord(line: string): NebulaRecord | null {
  const number = fixedNumber(line, 1, 4);
  const raHours = fixedNumber(line, 21, 22);
  const raMinutes = fixedNumber(line, 23, 24);
  const raDeciSeconds = fixedNumber(line, 25, 27);
  const decDegrees = fixedNumber(line, 29, 30);
  const decMinutes = fixedNumber(line, 31, 32);
  const decSeconds = fixedNumber(line, 33, 34);
  if (
    number === null ||
    number < 1 ||
    raHours === null ||
    raMinutes === null ||
    decDegrees === null ||
    decMinutes === null
  )
    return null;
  const sign = line.slice(27, 28) === "-" ? -1 : 1;
  const coordinate = fk4B1900ToFk5J2000(
    raHours + raMinutes / 60 + (raDeciSeconds ?? 0) / 36000,
    sign * (decDegrees + decMinutes / 60 + (decSeconds ?? 0) / 3600),
  );
  const diameter = fixedNumber(line, 49, 52);
  return {
    designation: `Sh2-${number}`,
    coordinate,
    apparentSizeArcmin: diameter && diameter > 0 ? [diameter, diameter] : null,
  };
}
