export const astronomicalSeasonIds = [
  "winter",
  "spring",
  "summer",
  "autumn",
] as const;

export type AstronomicalSeason = (typeof astronomicalSeasonIds)[number];

/** Northern-hemisphere astronomical seasons, expressed as civil-date bounds. */
export function astronomicalSeason(date: unknown): AstronomicalSeason | null {
  const match = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const monthText = match[2];
  const dayText = match[3];
  if (!monthText || !dayText) return null;
  const month = Number(monthText);
  const day = Number(dayText);
  if (month < 3 || (month === 12 && day >= 21) || (month === 3 && day < 20))
    return "winter";
  if (month < 6 || (month === 6 && day < 21)) return "spring";
  if (month < 9 || (month === 9 && day < 22)) return "summer";
  if (month < 12 || (month === 12 && day < 21)) return "autumn";
  return "winter";
}
