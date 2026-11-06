import { Body, Observer, SearchAltitude } from "astronomy-engine";

// Astronomical night, -18°, is the default and the planner's own definition
// of a night. The threshold is now a parameter (`sunAltitudeDegrees`), so a
// plan may choose nautical (-12°) or civil (-6°) darkness; without it, every
// result is exactly what it was.
const ASTRONOMICAL_TWILIGHT_ALTITUDE = -18;

/**
 * The three darkness thresholds a plan may choose (its `darkness` property),
 * as the Sun's altitude in degrees. `astronomical` is the default.
 */
export const darknessThresholds = Object.freeze({
  astronomical: -18,
  nautical: -12,
  civil: -6,
});

export type Darkness = keyof typeof darknessThresholds;

/**
 * The Sun's altitude at sunset and sunrise: its centre 0.8333° below the
 * horizon (refraction and the solar disc's radius), the same value the mobile
 * planner's `plannerSunsetUtc` already searches for.
 */
export const SUNRISE_SUNSET_ALTITUDE = -0.8333;

/**
 * The Sun's altitude for a darkness name; anything else — absent, unknown —
 * reads as astronomical (-18°).
 */
export function darknessAltitude(darkness: unknown): number {
  return typeof darkness === "string" &&
    Object.prototype.hasOwnProperty.call(darknessThresholds, darkness)
    ? darknessThresholds[darkness as Darkness]
    : ASTRONOMICAL_TWILIGHT_ALTITUDE;
}

/** A finite number of degrees, or -18 for anything else. */
function thresholdOrDefault(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : ASTRONOMICAL_TWILIGHT_ALTITUDE;
}
// The same search radius `planNightGeometry` has always used, both for the
// descending crossing after noon and for the ascending one after it.
const CROSSING_SEARCH_LIMIT_DAYS = 1.2;

export type AstronomicalNightWindowInput = {
  /** A civil date, `YYYY-MM-DD`, read in `timeZone`. */
  date: unknown;
  /** Degrees; a number or a numeric string (a plan's payload sends either). */
  latitude?: unknown;
  /** Degrees; a number or a numeric string. */
  longitude?: unknown;
  /** Metres above sea level; defaults to 0 when absent or not numeric. */
  elevation?: unknown;
  /** An IANA zone name; an absent or unusable one is read as `"UTC"`. */
  timeZone?: unknown;
  /**
   * The Sun's altitude, in degrees, that bounds the night: -18 (the
   * default, astronomical), -12 (nautical), -6 (civil) — see
   * `darknessThresholds` — or `SUNRISE_SUNSET_ALTITUDE` for sunset and
   * sunrise. Anything but a finite number reads as -18.
   */
  sunAltitudeDegrees?: unknown;
};

export type AstronomicalNightWindow = {
  /** The first descending crossing of solar altitude -18° (astronomical dusk), ISO-8601. */
  start: string;
  /** The first ascending crossing of -18° after `start` (astronomical dawn), ISO-8601. */
  end: string;
};

/**
 * The offset, in minutes, `timeZone` sits at east of UTC at `date`.
 */
function offsetMinutes(date: Date, timeZone: string): number {
  const zone = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = zone?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "+" ? minutes : -minutes;
}

/** The civil date's UTC noon-of-`hour` instant, in milliseconds, or `null` when `dateString` does not parse as `YYYY-MM-DD`. */
function civilDateUtcMillis(dateString: unknown, hour: number): number | null {
  const [year, month, day] = String(dateString || "")
    .split("-")
    .map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  return Date.UTC(year as number, (month as number) - 1, day as number, hour);
}

/**
 * Turns a wall-clock time in an IANA zone into a real UTC Date.
 *
 * It anchors this module's own -18° search at local civil noon. The
 * "following noon" substituted when there is no such crossing (a polar day or
 * night) is a planner decision, not this module's: see
 * `astronomicalNightWindow` below.
 */
export function zonedDate(
  dateString: unknown,
  hour: number,
  timeZone: string,
): Date | null {
  const base = civilDateUtcMillis(dateString, hour);
  if (base === null) return null;
  let value = new Date(base);
  // A second pass accounts for a possible daylight-saving transition.
  value = new Date(base - offsetMinutes(value, timeZone) * 60000);
  return new Date(base - offsetMinutes(value, timeZone) * 60000);
}

/**
 * Falls back to `"UTC"` for an absent or unusable IANA zone. It is also used
 * outside any night calculation (to validate a timezone before display).
 */
export function validTimeZone(value: unknown): string {
  try {
    Intl.DateTimeFormat("en-US", {
      timeZone: value as string | undefined,
    }).format();
    return value as string;
  } catch {
    return "UTC";
  }
}

/**
 * The IANA names this module treats as an explicit "UTC, zero offset"
 * rather than looking up through ICU — `Etc/UTC` is what `geo-tz`/the place
 * resolver hand back for real, `UTC` is the bare alias some already-stored
 * places still carry. Node/browser ICU accepts both directly (unlike the
 * mobile client's bundled `package:timezone` database, which refuses the
 * bare `UTC` name), but they are still special-cased here so both platforms
 * apply the exact same rule rather than each depending on its own ICU/tz
 * database's behavior for that one name.
 */
const EXPLICIT_UTC_NAMES = new Set(["UTC", "Etc/UTC"]);

/** Whether ICU actually resolves `zone` as a time zone — as opposed to `validTimeZone`, which folds an unresolvable name into the display string `"UTC"`. */
function isRecognizedTimeZone(zone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}

/**
 * A same-Earth, database-free guess at a UTC offset from `longitude` alone:
 * local mean solar time, `longitude / 15` hours, rounded to the nearest
 * whole hour and clamped to ±12 h. `0` when `longitude` is not a finite
 * number.
 */
export function longitudeOffsetMinutes(longitude: number): number {
  if (!Number.isFinite(longitude)) return 0;
  const hours = Math.max(-12, Math.min(12, Math.round(longitude / 15)));
  return hours * 60;
}

/**
 * [zonedDate], but for a place with no usable IANA zone at all — absent,
 * or a name ICU does not recognize. Anchors on [longitudeOffsetMinutes]
 * instead of assuming UTC (mobile/web parity): a plan
 * viewed from anywhere on Earth must not anchor its night far from this
 * place's own evening. An *explicit* `"UTC"`/`"Etc/UTC"` is still a true
 * zero offset, not a longitude guess — see [EXPLICIT_UTC_NAMES].
 */
function longitudeAnchoredDate(
  dateString: unknown,
  hour: number,
  offsetMinutesValue: number,
): Date | null {
  const base = civilDateUtcMillis(dateString, hour);
  return base === null ? null : new Date(base - offsetMinutesValue * 60000);
}

/**
 * [zonedDate] when `timeZone` is a real, ICU-recognized IANA name (DST-correct,
 * exactly as before); otherwise [longitudeAnchoredDate] — a true zero offset
 * for an explicit `"UTC"`/`"Etc/UTC"` ([EXPLICIT_UTC_NAMES]), and
 * [longitudeOffsetMinutes] for anything else with no usable zone (absent, or
 * unrecognized). Shared by [astronomicalNightWindow] below and by the
 * client's interactive timeline, so the timeline and the server's
 * authoritative `nightStartAt`/`nightEndAt` never derive a different night
 * for the same zoneless place.
 */
export function zonedDateOrLongitudeAnchor(
  dateString: unknown,
  hour: number,
  timeZone: unknown,
  longitude: number,
): Date | null {
  const zone =
    typeof timeZone === "string" && timeZone.length > 0 ? timeZone : null;
  if (zone && !EXPLICIT_UTC_NAMES.has(zone) && isRecognizedTimeZone(zone)) {
    return zonedDate(dateString, hour, zone);
  }
  const offset =
    zone && EXPLICIT_UTC_NAMES.has(zone)
      ? 0
      : longitudeOffsetMinutes(longitude);
  return longitudeAnchoredDate(dateString, hour, offset);
}

function boundedCoordinate(value: unknown, bound: number): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < -bound || parsed > bound) return null;
  return parsed;
}

function elevationOrSeaLevel(value: unknown): number {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type NightAltitudeCrossingsInput = {
  latitude: number;
  longitude: number;
  elevation: number;
  /** The instant the descending search starts from — local civil noon. */
  anchor: Date;
  /** The Sun's altitude searched for; -18 (astronomical) when absent. */
  sunAltitudeDegrees?: number;
};

export type NightAltitudeCrossings = {
  /** The first descending crossing of -18° after `anchor`, or `null`. */
  dusk: Date | null;
  /** The first ascending crossing of -18° after `dusk`, or `null` when `dusk` is `null` too. */
  dawn: Date | null;
};

/**
 * The raw descending-then-ascending -18° solar-altitude search — astronomical
 * dusk, then the next astronomical dawn — with no input validation and no
 * polar fallback. `astronomicalNightWindow` below is one reading of it (both
 * crossings present, or `null`).
 *
 * It is exported, and not just an implementation detail of
 * `astronomicalNightWindow`, because a caller needs this exact search for its
 * own polar substitution (noon and the following noon, applied at its call
 * site). Re-deriving the crossings there with a second, textually different
 * implementation would be a duplication, so it imports this function instead.
 */
export function nightAltitudeCrossings({
  latitude,
  longitude,
  elevation,
  anchor,
  sunAltitudeDegrees,
}: NightAltitudeCrossingsInput): NightAltitudeCrossings {
  const observer = new Observer(latitude, longitude, elevation);
  const altitude = thresholdOrDefault(sunAltitudeDegrees);
  const dusk =
    SearchAltitude(
      Body.Sun,
      observer,
      -1,
      anchor,
      CROSSING_SEARCH_LIMIT_DAYS,
      altitude,
    )?.date ?? null;
  const dawn = dusk
    ? (SearchAltitude(
        Body.Sun,
        observer,
        1,
        dusk,
        CROSSING_SEARCH_LIMIT_DAYS,
        altitude,
      )?.date ?? null)
    : null;
  return { dusk, dawn };
}

/**
 * The astronomical night (Sun below -18°) that starts on the evening of
 * `date`, at the given place — the planner's own definition of a night,
 * shared here so the server can honour it.
 * See `packages/astro-contracts/schemas/api/v1.md`, "The night boundaries of
 * a plan".
 *
 * The computation: anchor at local civil noon of `date` in `timeZone`, when
 * it names a real, ICU-recognized IANA zone; find the first descending
 * crossing of solar altitude -18° after that noon (astronomical dusk); find
 * the first ascending crossing of -18° after that (astronomical dawn). An
 * *explicit* `"UTC"`/`"Etc/UTC"` anchors at a true zero offset; a place with
 * no usable zone at all — absent, or a name ICU does not recognize — anchors
 * on its own longitude instead (`zonedDateOrLongitudeAnchor`;
 * mobile/web parity), never on the server's own zone, so the
 * night stays close to that place's own evening wherever the request comes
 * from.
 *
 * Returns `null`, rather than a value, in every case the definition cannot
 * produce one:
 * - `date` is missing;
 * - `latitude` or `longitude` is missing, not numeric (a numeric string such
 *   as `"45.2"` is accepted — a plan's payload may send either), or outside
 *   its physical range ([-90, 90] / [-180, 180]);
 * - the Sun never crosses -18° for that night at that place — polar summer
 *   (no dusk) or polar winter (dusk with no dawn within the search window).
 *
 * This function never substitutes a placeholder for a night it could not
 * find: the planner's own noon-to-following-noon substitution for the polar
 * case is a caller decision — see `planNightGeometry` — and stays out of
 * this shared definition on purpose, so a caller that must not invent a
 * night (the server deriving `nightStartAt`/`nightEndAt`) gets a plain
 * `null` instead of an implicit fallback it would have to know to undo.
 */
export function astronomicalNightWindow(
  input: AstronomicalNightWindowInput,
): AstronomicalNightWindow | null {
  if (!input?.date) return null;
  const latitude = boundedCoordinate(input.latitude, 90);
  const longitude = boundedCoordinate(input.longitude, 180);
  if (latitude === null || longitude === null) return null;
  const elevation = elevationOrSeaLevel(input.elevation);
  const anchor = zonedDateOrLongitudeAnchor(
    input.date,
    12,
    input.timeZone,
    longitude,
  );
  if (!anchor) return null;
  const { dusk, dawn } = nightAltitudeCrossings({
    latitude,
    longitude,
    elevation,
    anchor,
    sunAltitudeDegrees: thresholdOrDefault(input.sunAltitudeDegrees),
  });
  if (!dusk || !dawn || dawn <= dusk) return null;
  return { start: dusk.toISOString(), end: dawn.toISOString() };
}

export type TwilightWindows = {
  /** Sunset and the following sunrise (`SUNRISE_SUNSET_ALTITUDE`), or `null`. */
  sun: { sunset: string; sunrise: string } | null;
  /** The civil (-6°), nautical (-12°) and astronomical (-18°) nights, each or `null`. */
  civil: AstronomicalNightWindow | null;
  nautical: AstronomicalNightWindow | null;
  astronomical: AstronomicalNightWindow | null;
};

/**
 * Every boundary of the evening of `date` at a place, for the twilight
 * setting and the timeline of the night: sunset and sunrise, then the
 * civil, nautical and astronomical nights — each read by
 * `astronomicalNightWindow` with its own threshold, so each is `null`
 * exactly when that function would be (no such crossing that night, or an
 * unusable input). `sunAltitudeDegrees` in `input` is ignored.
 */
export function twilightWindows(
  input: AstronomicalNightWindowInput,
): TwilightWindows {
  const at = (sunAltitudeDegrees: number) =>
    astronomicalNightWindow({ ...input, sunAltitudeDegrees });
  const sun = at(SUNRISE_SUNSET_ALTITUDE);
  return {
    sun: sun ? { sunset: sun.start, sunrise: sun.end } : null,
    civil: at(darknessThresholds.civil),
    nautical: at(darknessThresholds.nautical),
    astronomical: at(darknessThresholds.astronomical),
  };
}
