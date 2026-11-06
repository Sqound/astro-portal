import { optionalDeviceV1Access } from "../../../../lib/v1/access.js";
import { v1Json } from "../../../../lib/v1/response.js";
import { providerReadFailure } from "../../../../lib/v1/provider-response.js";
import { loadAstronomyWeather } from "portal/astronomy-weather.server.js";

/**
 * Public forecast proxy: the same process-shared, fallback-aware cache the
 * web planner reads, so a paired device never dials a weather provider
 * directly. A supplied bearer must still be valid — see optionalDeviceV1Access.
 */
export async function GET(request) {
  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  const params = new URL(request.url).searchParams;
  try {
    const weather = await loadAstronomyWeather({
      latitude: params.get("latitude"),
      longitude: params.get("longitude"),
    });
    return v1Json(weather, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (error) {
    return providerReadFailure(
      error,
      "weather_unavailable",
      "Weather providers are temporarily unavailable.",
    );
  }
}
