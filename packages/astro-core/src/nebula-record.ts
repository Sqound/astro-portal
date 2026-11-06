// What every nebula catalogue parser returns: the designation in its canonical
// writing, the J2000 position (hours, degrees) and the apparent size in
// arcminutes, `null` when the source has none.
export type NebulaRecord = {
  designation: string;
  coordinate: { ra: number; dec: number };
  apparentSizeArcmin: readonly [number, number] | null;
};

/** A number in the fixed columns `firstByte`..`lastByte` (1-based), or null. */
export function fixedNumber(
  line: string,
  firstByte: number,
  lastByte: number,
): number | null {
  const text = String(line ?? "")
    .slice(firstByte - 1, lastByte)
    .trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** A size rounded to a tenth of an arcminute, as the catalogue stores it. */
export function tenths(value: number): number {
  return Math.round(value * 10) / 10;
}
