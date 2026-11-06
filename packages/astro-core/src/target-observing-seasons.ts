type ObservingSeason = "winter" | "spring" | "summer" | "autumn";
type ObservingHemisphere = "north" | "south";
type ObservingSeasonInput = {
  rightAscensionHours?: unknown;
  season?: unknown;
  hemisphere?: unknown;
};

const seasons = new Set<ObservingSeason>([
  "winter",
  "spring",
  "summer",
  "autumn",
]);
const hemispheres = new Set<ObservingHemisphere>(["north", "south"]);

// The centre represents the right ascension culminating around the middle of
// a typical evening in each local astronomical season. This is a catalogue
// discovery aid, not a replacement for the planner's date- and site-specific
// altitude calculation.
const seasonalRightAscensionHours: Record<
  ObservingHemisphere,
  Record<ObservingSeason, number>
> = {
  north: { winter: 6, spring: 12, summer: 18, autumn: 0 },
  south: { summer: 6, autumn: 12, winter: 18, spring: 0 },
};

export const observingSeasons = [...seasons];
export const observingHemispheres = [...hemispheres];

function circularHoursDistance(left: number, right: number): number {
  const distance = Math.abs(left - right) % 24;
  return Math.min(distance, 24 - distance);
}

export function targetIsInObservingSeason({
  rightAscensionHours,
  season,
  hemisphere,
}: ObservingSeasonInput = {}): boolean {
  if (
    typeof season !== "string" ||
    typeof hemisphere !== "string" ||
    !seasons.has(season as ObservingSeason) ||
    !hemispheres.has(hemisphere as ObservingHemisphere)
  )
    return true;
  const ra = Number(rightAscensionHours);
  if (!Number.isFinite(ra)) return false;
  const centre =
    seasonalRightAscensionHours[hemisphere as ObservingHemisphere][
      season as ObservingSeason
    ];
  return circularHoursDistance(ra, centre) <= 3;
}
