import {
  Body,
  Illumination,
  MoonPhase,
  Observer,
  SearchRiseSet,
} from "astronomy-engine";

const PHASE_NAMES = [
  "new",
  "waxingCrescent",
  "firstQuarter",
  "waxingGibbous",
  "full",
  "waningGibbous",
  "lastQuarter",
  "waningCrescent",
] as const;

type LunarPhaseName = (typeof PHASE_NAMES)[number];
type LunarPhase = {
  illumination: number;
  name: LunarPhaseName;
  phaseDegrees: number;
};
type LunarPhasePathOptions = {
  size?: number;
  radius?: number;
  steps?: number;
};
type Point = readonly [number, number];

function dateAtNoonUtc(value: unknown): Date {
  if (value instanceof Date) return value;
  return new Date(`${String(value || "")}T12:00:00Z`);
}

export function lunarPhaseForDate(value: unknown): LunarPhase | null {
  const date = dateAtNoonUtc(value);
  if (!Number.isFinite(date.getTime())) return null;

  const phaseDegrees = ((MoonPhase(date) % 360) + 360) % 360;
  const phaseIndex = Math.floor(((phaseDegrees + 22.5) % 360) / 45);

  const name = PHASE_NAMES[phaseIndex];
  if (!name) return null;
  return {
    illumination: Math.round(
      Illumination(Body.Moon, date).phase_fraction * 100,
    ),
    name,
    phaseDegrees,
  };
}

/**
 * The instant the Moon sets between `start` and `end` (ISO), seen from a
 * place (latitude, longitude in degrees), or `null` when it does not set
 * in that span (already down, or setting after it). It serves
 * « Illuminée à 12 %, couchée à 23:10 » on the owner's detail of a capture,
 * for the night's span; the place never leaves the owner's reading.
 */
export function moonSetBetween({
  latitude,
  longitude,
  start,
  end,
}: {
  latitude: unknown;
  longitude: unknown;
  start: unknown;
  end: unknown;
}): string | null {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const from = new Date(String(start ?? ""));
  const until = new Date(String(end ?? ""));
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180 ||
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(until.getTime()) ||
    until.getTime() <= from.getTime()
  )
    return null;
  const days = (until.getTime() - from.getTime()) / 86_400_000;
  const found = SearchRiseSet(
    Body.Moon,
    new Observer(lat, lon, 0),
    -1,
    from,
    Math.min(days, 2),
  );
  if (!found || found.date.getTime() > until.getTime()) return null;
  return found.date.toISOString();
}

function point(x: number, y: number): string {
  return `${x.toFixed(3)} ${y.toFixed(3)}`;
}

export function lunarPhasePath(
  phaseDegrees: unknown,
  options: LunarPhasePathOptions = {},
): string {
  const size = options.size ?? 24;
  const radius = options.radius ?? 9;
  const steps = options.steps ?? 24;
  const center = size / 2;
  const phase = ((Number(phaseDegrees) % 360) + 360) % 360;
  const waxing = phase <= 180;
  const terminatorScale = waxing
    ? Math.cos((phase * Math.PI) / 180)
    : -Math.cos((phase * Math.PI) / 180);
  const verticalPoints = Array.from({ length: steps + 1 }, (_, index) => {
    const y = -radius + (2 * radius * index) / steps;
    const limb = Math.sqrt(Math.max(0, radius ** 2 - y ** 2));
    return { limb, y };
  });
  const limbPoints: Point[] = verticalPoints.map(({ limb, y }) =>
    waxing ? [center + limb, center + y] : [center - limb, center + y],
  );
  const terminatorPoints: Point[] = [...verticalPoints]
    .reverse()
    .map(({ limb, y }) => [center + terminatorScale * limb, center + y]);
  const [first, ...remaining] = [...limbPoints, ...terminatorPoints];

  return `M ${point(...first!)} L ${remaining.map((entry) => point(...entry)).join(" L ")} Z`;
}
