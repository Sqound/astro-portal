// Lynds (1962), Catalogue of Dark Nebulae — CDS/VizieR VII/7A,
// `ldn`. Fixed columns from the ReadMe.
import { fk4B1950ToFk5J2000 } from "./fk4-fk5.js";
import { fixedNumber, tenths, type NebulaRecord } from "./nebula-record.js";

/** « LDN 1622 »: one space, no zero-padding. */
export function ldnDesignation(value: unknown): string | null {
  const match = String(value ?? "")
    .trim()
    .match(/^ldn[\s\-_.]*0*(\d+)$/i);
  return match ? `LDN ${match[1]}` : null;
}

/** The LDN designation a record carries, as `barnardKey`. */
export function ldnKey(
  target: { designation?: string; aliases?: readonly string[] } | null,
): string | null {
  for (const value of [target?.designation, ...(target?.aliases || [])]) {
    const designation = ldnDesignation(value);
    if (designation) return designation;
  }
  return null;
}

/**
 * One line of `ldn`. The four clouds without an LDN number (the end of the
 * file) have no designation and are not records. Position B1950.0 FK4
 * (bytes 6-21) brought to J2000; the source gives an area in square degrees
 * (bytes 37-43), turned into the diameter of the disc of that area; an area of
 * zero is an unknown size.
 */
export function parseLdnRecord(line: string): NebulaRecord | null {
  const number = fixedNumber(line, 1, 4);
  const raHours = fixedNumber(line, 6, 7);
  const raMinutes = fixedNumber(line, 9, 12);
  const decDegrees = fixedNumber(line, 17, 18);
  const decMinutes = fixedNumber(line, 20, 21);
  if (
    number === null ||
    number < 1 ||
    raHours === null ||
    raMinutes === null ||
    decDegrees === null ||
    decMinutes === null
  )
    return null;
  const sign = line.slice(15, 16) === "-" ? -1 : 1;
  const area = fixedNumber(line, 37, 43);
  const diameter =
    area && area > 0 ? tenths(2 * Math.sqrt(area / Math.PI) * 60) : null;
  return {
    designation: `LDN ${number}`,
    coordinate: fk4B1950ToFk5J2000(
      raHours + raMinutes / 60,
      sign * (decDegrees + decMinutes / 60),
    ),
    apparentSizeArcmin: diameter ? [diameter, diameter] : null,
  };
}
