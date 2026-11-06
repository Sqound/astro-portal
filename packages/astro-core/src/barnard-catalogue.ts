type BarnardTarget = {
  designation?: string;
  aliases?: readonly string[];
};
type BarnardRecord = {
  designation: string;
  coordinate: { ra: number; dec: number };
  apparentSizeArcmin: readonly [number, number] | null;
};

function numberInField(
  line: string,
  firstByte: number,
  lastByte: number,
): number | null {
  const value = Number(line.slice(firstByte - 1, lastByte).trim());
  return Number.isFinite(value) ? value : null;
}

export function barnardDesignation(value: unknown): string | null {
  const match = String(value || "")
    .trim()
    .match(/^B?0*(\d+)([a-z])?$/i);
  if (!match) return null;
  const number = match[1];
  if (!number) return null;
  return `B${Number(number)}${match[2]?.toLowerCase() || ""}`;
}

export function barnardKey(
  target: BarnardTarget | null | undefined,
): string | null {
  for (const value of [target?.designation, ...(target?.aliases || [])]) {
    if (!/^B/i.test(String(value || "").trim())) continue;
    const designation = barnardDesignation(value);
    if (designation) return designation;
  }
  return null;
}

export function parseBarnardRecord(line: string): BarnardRecord | null {
  const designation = barnardDesignation(line.slice(1, 5));
  const raHours = numberInField(line, 23, 24);
  const raMinutes = numberInField(line, 26, 27);
  const raSeconds = numberInField(line, 29, 30) || 0;
  const decDegrees = numberInField(line, 34, 35);
  const decMinutes = numberInField(line, 37, 38);
  const sign = line.slice(32, 33) === "-" ? -1 : 1;
  if (
    !designation ||
    raHours === null ||
    raMinutes === null ||
    decDegrees === null ||
    decMinutes === null
  )
    return null;
  const diameter = numberInField(line, 40, 44);
  return {
    designation,
    coordinate: {
      ra: raHours + raMinutes / 60 + raSeconds / 3600,
      dec: sign * (decDegrees + decMinutes / 60),
    },
    apparentSizeArcmin: diameter === null ? null : [diameter, diameter],
  };
}
