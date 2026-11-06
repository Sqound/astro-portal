// Tonight's cloud cover at the suggested places, for "Meilleur cette nuit", on the
// web: the forecast of each suggestion read through the planner's own weather read,
// summarised over the reference place's night (`placeCloudOverNight`),
// `placesForecastBatch` at a time, and kept for the session (the page's memory,
// gone when it is closed).
import { requestAstronomyWeather } from "portal/astronomy-weather.js";
import { placeCloudOverNight } from "./places-weather.js";

/** How many forecasts are asked at the same time. */
export const placesForecastBatch = 5;

/** What the page knows already: the cloud cover read for a position and a night. */
export const placesCloudSession = new Map();

/** The session key of a read: the position as the service rounds it (0.001°) and the night. */
export const placeCloudKey = ({ latitude, longitude }, night) =>
  `${Number(latitude).toFixed(3)},${Number(longitude).toFixed(3)}|${night.start}|${night.end}`;

/**
 * The mean cloud cover of [night] at each of [places] (`{ id, latitude,
 * longitude }`), as `{ [id]: percent }`; a place whose forecast cannot be read
 * is absent. Answers are kept in [session]; a read that failed is asked again
 * next time. [request] reads one position (`requestAstronomyWeather`).
 */
export async function readPlaceClouds({
  places,
  night,
  signal,
  request = requestAstronomyWeather,
  session = placesCloudSession,
  batch = placesForecastBatch,
}) {
  const clouds = {};
  const pending = [];
  for (const place of places) {
    const known = session.get(placeCloudKey(place, night));
    if (Number.isFinite(known)) clouds[place.id] = known;
    else pending.push(place);
  }
  let next = 0;
  const worker = async () => {
    while (next < pending.length && !signal?.aborted) {
      const place = pending[next++];
      let cloud = null;
      try {
        const data = await request(
          { latitude: place.latitude, longitude: place.longitude },
          { signal },
        );
        cloud = placeCloudOverNight({ hourly: data?.hourly, night });
      } catch {
        cloud = null;
      }
      if (cloud === null) continue;
      clouds[place.id] = cloud;
      session.set(placeCloudKey(place, night), cloud);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(batch, pending.length) }, worker),
  );
  return clouds;
}
