import { optionalDeviceV1Access } from "../../../../lib/v1/access.js";
import { v1Json } from "../../../../lib/v1/response.js";
import { providerReadFailure } from "../../../../lib/v1/provider-response.js";
import { loadPlannerSkyQuality } from "portal/planner/sky-quality.server.js";

/**
 * Public sky-quality proxy: the same monthly-cached VIIRS-derived estimate
 * the web planner reads. A supplied bearer must still be valid — see
 * optionalDeviceV1Access.
 */
export async function GET(request) {
  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  const params = new URL(request.url).searchParams;
  try {
    const skyQuality = await loadPlannerSkyQuality({
      latitude: params.get("latitude"),
      longitude: params.get("longitude"),
    });
    return v1Json(skyQuality, {
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
