import { optionalDeviceV1Access } from "../../../../../lib/v1/access.js";
import { v1Json } from "../../../../../lib/v1/response.js";
import { providerReadFailure } from "../../../../../lib/v1/provider-response.js";
import { loadPlannerSkyDirection } from "portal/planner/sky-quality.server.js";

/**
 * Public read: the estimated sky brightness by direction around a place
 * (`skyBrightnessByDirection`, model `line-of-sight-v1`), from the same
 * installed raster as `GET /v1/sky-quality`. The coordinates are rounded to
 * 0.01° before computing and never echoed back. A supplied bearer must
 * still be valid — see optionalDeviceV1Access. Without a raster: `503`
 * `sky_quality_unavailable` with `Retry-After`, like `GET /v1/sky-quality`.
 */
export async function GET(request) {
  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  const params = new URL(request.url).searchParams;
  try {
    const direction = await loadPlannerSkyDirection({
      latitude: params.get("latitude"),
      longitude: params.get("longitude"),
    });
    return v1Json(direction, {
      headers: { "Cache-Control": "private, max-age=86400" },
    });
  } catch (error) {
    return providerReadFailure(
      error,
      "sky_quality_unavailable",
      "The sky-quality estimate is temporarily unavailable.",
    );
  }
}
