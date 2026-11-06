import { optionalDeviceV1Access } from "../../../../../lib/v1/access.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";
import { searchPlannerPlaces } from "portal/planner/location.server.js";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 240;

/**
 * Public free-text address search: the same throttled, cached Photon lookup
 * (searchPlannerPlaces) the web planner's location route performs for its
 * "search" operation — identical minimum length, result cap and 30-minute
 * cache, since both call the same function. A supplied bearer must still be
 * valid — see optionalDeviceV1Access. Unlike place resolution, a provider
 * outage here has no degraded result to fall back to, so it answers 503.
 */
export async function GET(request) {
  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  const params = new URL(request.url).searchParams;
  const length = (params.get("q") || "").trim().length;
  if (length < MIN_QUERY_LENGTH || length > MAX_QUERY_LENGTH)
    return v1Error(
      Object.assign(
        new Error("Enter an address or place name (2–240 characters)."),
        { code: "invalid_request", status: 400 },
      ),
    );
  try {
    const results = await searchPlannerPlaces(
      params.get("q"),
      params.get("locale") || "en",
    );
    return v1Json({ results });
  } catch (error) {
    return v1Error(
      Object.assign(new Error("Address search is temporarily unavailable."), {
        code: "place_search_unavailable",
        status: 503,
      }),
    );
  }
}
