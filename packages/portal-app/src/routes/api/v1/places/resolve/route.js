import { optionalDeviceV1Access } from "../../../../../lib/v1/access.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";
import { resolvePlannerPlace } from "portal/planner/location.server.js";

/**
 * Public place resolution: the same time zone, elevation and (optional)
 * reverse-geocode lookup the web planner's location route performs for a
 * chosen or GPS point. A provider outage degrades the result (see
 * resolvePlannerPlace) rather than failing the request. A supplied bearer
 * must still be valid — see optionalDeviceV1Access.
 */
export async function GET(request) {
  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  const params = new URL(request.url).searchParams;
  try {
    const result = await resolvePlannerPlace(
      {
        latitude: params.get("latitude"),
        longitude: params.get("longitude"),
        elevation: params.get("elevation"),
      },
      params.get("locale") || "en",
      params.get("reverse") === "1",
    );
    return v1Json(result);
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "Valid latitude and longitude query parameters are required.",
      status: 400,
    });
  }
}
