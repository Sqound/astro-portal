import { observerAt, sunAltitudeAt } from "astro-core/sun-altitude.js";

/**
 * The instant the gallery's sky map draws, and the place it is drawn for.
 *
 * The map is a picture of the sky the captures sit on, not a clock: it is
 * always a night sky, whatever the hour of the person looking at it. The
 * engine's own default is « now » at a place of its own, which in daylight
 * is a blue sky with the Sun and Venus. So the map sets both itself: a
 * mid-northern place, and the middle of the astronomical night (the Sun
 * lower than 18° under the horizon) that is on at that place or comes next.
 *
 * Pure: the instant is read from `now`, the engine is not touched here.
 */

/** Where the sky is drawn from (a mid-northern place: it has a night all year). */
export const SKY_MAP_PLACE = Object.freeze({ latitude: 45, longitude: 0 });

/** The Sun's altitude, in degrees, at or under which the sky is astronomically dark. */
export const ASTRONOMICAL_NIGHT_ALTITUDE = -18;

const STEP_MS = 10 * 60 * 1000;
const HORIZON_MS = 36 * 60 * 60 * 1000;

/**
 * The instant the map shows: `now` when it already is astronomical night at
 * `place`, else the middle of the next night (from its dusk to its dawn).
 * Where no night comes within 36 hours (a polar summer), the darkest moment
 * of that stretch: the Sun is then as low as it gets, never a bright sky.
 *
 * Returns `{ instant, kind }`, `kind` being `"now"`, `"mid-night"` or
 * `"darkest"`. A `now` that is not a date reads as the present.
 */
export function nightInstantFor(place = SKY_MAP_PLACE, now = new Date()) {
  const start = Number.isFinite(new Date(now).getTime())
    ? new Date(now).getTime()
    : Date.now();
  const observer = observerAt(place.latitude, place.longitude);
  const dark = (time) =>
    sunAltitudeAt(time, observer) <= ASTRONOMICAL_NIGHT_ALTITUDE;
  if (dark(start)) return { instant: new Date(start), kind: "now" };
  let dusk = null;
  let darkest = { time: start, altitude: sunAltitudeAt(start, observer) };
  for (let time = start; time <= start + HORIZON_MS; time += STEP_MS) {
    const altitude = sunAltitudeAt(time, observer);
    if (altitude < darkest.altitude) darkest = { time, altitude };
    if (dusk === null) {
      if (altitude <= ASTRONOMICAL_NIGHT_ALTITUDE) dusk = time;
    } else if (altitude > ASTRONOMICAL_NIGHT_ALTITUDE) {
      return {
        instant: new Date(dusk + Math.round((time - dusk) / 2)),
        kind: "mid-night",
      };
    }
  }
  return { instant: new Date(darkest.time), kind: "darkest" };
}

/** Whether the Sun is at least 18° under the horizon at `instant` for `place`. */
export function isAstronomicalNight(instant, place = SKY_MAP_PLACE) {
  return (
    sunAltitudeAt(instant, observerAt(place.latitude, place.longitude)) <=
    ASTRONOMICAL_NIGHT_ALTITUDE
  );
}

/**
 * What a change of the captures shown does to the markers the engine
 * already holds: the sources to add and the ones to take away. A filter
 * changes only these; the sky under them is never rebuilt.
 */
export function markerChanges(heldSources, groups) {
  const wanted = new Set(groups.map((group) => group.source));
  const held = new Set(heldSources);
  return {
    add: groups.filter((group) => !held.has(group.source)),
    remove: [...held].filter((source) => !wanted.has(source)),
  };
}

/**
 * A key that changes when what the map draws changes: the sources, their
 * places on the sky and the captures they carry. The gallery hands the map
 * a new array at every render; two with the same key are the same map.
 */
export function groupsKey(groups) {
  return JSON.stringify(
    groups.map((group) => [
      group.source,
      group.coordinate.ra,
      group.coordinate.dec,
      group.targets.map((target) => [
        target.id,
        target.title,
        target.href,
        target.imageUrl,
        target.previewUrl,
      ]),
    ]),
  );
}
