// Lynds (1965), Catalogue of Bright Nebulae — CDS/VizieR VII/9,
// `catalog.dat`. Fixed columns from the ReadMe.
import { fk4B1950ToFk5J2000 } from "./fk4-fk5.js";
import { fixedNumber, type NebulaRecord } from "./nebula-record.js";

/** « LBN 437 »: one space, no zero-padding. */
export function lbnDesignation(value: unknown): string | null {
  const match = String(value ?? "")
    .trim()
    .match(/^lbn[\s\-_.]*0*(\d+)$/i);
  return match ? `LBN ${match[1]}` : null;
}

/** The LBN designation a record carries, as `barnardKey`. */
export function lbnKey(
  target: { designation?: string; aliases?: readonly string[] } | null,
): string | null {
  for (const value of [target?.designation, ...(target?.aliases || [])]) {
    const designation = lbnDesignation(value);
    if (designation) return designation;
  }
  return null;
}

/** The other name the source gives in bytes 61-68, in the app's writing. */
export function lbnOtherName(line: string): string | null {
  const text = String(line ?? "")
    .slice(60, 68)
    .trim();
  const match = text.match(/^(NGC|IC|S)\s*0*(\d+)$/i);
  if (!match) return null;
  const prefix = match[1]!.toUpperCase();
  return prefix === "S" ? `Sh2-${match[2]}` : `${prefix} ${match[2]}`;
}

/**
 * One line of `catalog.dat`: the « Seq » number of the publication
 * (bytes 2-5), the B1950.0 FK4 position (bytes 21-33, whole minutes of right
 * ascension) brought to J2000, the largest and smallest dimensions in
 * arcminutes (bytes 36-43), unknown when zero.
 */
export function parseLbnRecord(line: string): NebulaRecord | null {
  const number = fixedNumber(line, 2, 5);
  const raHours = fixedNumber(line, 21, 22);
  const raMinutes = fixedNumber(line, 24, 25);
  const decDegrees = fixedNumber(line, 29, 30);
  const decMinutes = fixedNumber(line, 32, 33);
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
  const major = fixedNumber(line, 36, 39);
  const minor = fixedNumber(line, 41, 43);
  return {
    designation: `LBN ${number}`,
    coordinate: fk4B1950ToFk5J2000(
      raHours + raMinutes / 60,
      sign * (decDegrees + decMinutes / 60),
    ),
    apparentSizeArcmin:
      major && major > 0 ? [major, minor && minor > 0 ? minor : major] : null,
  };
}
