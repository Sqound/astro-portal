import { Body, Equator, Horizon, Observer } from "astronomy-engine";

/**
 * An observer on Earth, for [sunAltitudeAt]: build it once and read the Sun
 * at as many instants as needed (an hourly series over years).
 */
export function observerAt(
  latitude: number,
  longitude: number,
  elevation = 0,
): Observer {
  return new Observer(latitude, longitude, elevation);
}

/**
 * The Sun's geometric altitude in degrees (no refraction) at an instant, for
 * an observer: the same ephemeris `night-window.ts` searches its twilight
 * crossings with, read at one instant. `NaN` for an instant that is not a
 * date, so a caller counting dark hours never counts a broken one.
 */
export function sunAltitudeAt(
  instant: Date | number,
  observer: Observer,
): number {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(date.getTime())) return Number.NaN;
  const equator = Equator(Body.Sun, date, observer, true, true);
  return Horizon(date, observer, equator.ra, equator.dec).altitude;
}
