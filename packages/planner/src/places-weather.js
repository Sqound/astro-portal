// Tonight's night and cloud cover at a place that may not be saved yet, for
// "Meilleur cette nuit" of the suggestions. "Voir la météo de ce soir" of
// the detail is gone: "Conditions" replaces it.
import { summarizeAstronomyForecast } from "portal/astronomy-forecast.js";
import { planNightSpanSky } from "./planner.js";
import { tonightDate } from "./tonight-overview.js";

/**
 * The night "Meilleur cette nuit" is about: the astronomical night of the
 * reference place (`{ start, end }`, ISO instants), `null` when it cannot be
 * computed there. A place without a time zone takes the night of its own
 * longitude, like everywhere else.
 */
export function placesReferenceNight({ place, now = Date.now() }) {
  try {
    const date = tonightDate({ now, place });
    const sky = planNightSpanSky({ date, darkness: "astronomical" }, place);
    return sky?.darkStart && sky?.darkEnd
      ? { start: sky.darkStart, end: sky.darkEnd }
      : null;
  } catch {
    return null;
  }
}

/**
 * The mean cloud cover over [night], in percent, of a forecast (the body of
 * the planner's weather read), or `null` when the forecast does not cover it.
 */
export function placeCloudOverNight({ hourly, night }) {
  const cloud = summarizeAstronomyForecast({ hourly, night })?.cloud;
  return Number.isFinite(cloud) ? cloud : null;
}
