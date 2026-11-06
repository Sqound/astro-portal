import { timeZoneForCoordinates } from "portal/planner/location.server.js";
import { placeCoordinates } from "portal/planner/state.js";
import { isKnownTimeZone } from "portal/planner/place-time-zone.js";

/**
 * A place is never written without a time zone. One the
 * person gave stays (the repository checks it); otherwise the service reads
 * it from the position (`geo-tz`, the exact boundaries) and writes it. A
 * position the service cannot read a zone for is refused with
 * `422 time_zone_required`: the client asks the person to choose it.
 */
export function placeBodyWithTimeZone(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  if (typeof body.timeZone === "string" && body.timeZone) return body;
  // Coordinates the repository will refuse itself (400).
  if (!placeCoordinates(body)) return body;
  let zone = null;
  try {
    zone = timeZoneForCoordinates(body).timeZone;
  } catch {
    zone = null;
  }
  if (!isKnownTimeZone(zone))
    throw Object.assign(
      new Error(
        "The time zone of this position could not be determined: choose it and write the place again.",
      ),
      { code: "time_zone_required", status: 422 },
    );
  // A zone read by the service is not « chosen ».
  const { timeZoneSource: _chosen, ...rest } = body;
  return { ...rest, timeZone: zone };
}
