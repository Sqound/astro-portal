import { optionalDeviceV1Access } from "../../../../../lib/v1/access.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";
import { providerReadFailure } from "../../../../../lib/v1/provider-response.js";
import { loadAstronomyWeatherHistory } from "portal/astronomy-weather.server.js";

/**
 * The measured weather of one month: the public read the
 * calendar's past nights are worked out from, over the same rules as
 * `GET /v1/weather` (a shared cache, a stale answer rather than a refusal,
 * `503` with `Retry-After` otherwise). The device never dials the archive.
 */
export async function GET(request) {
  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  const params = new URL(request.url).searchParams;
  try {
    const history = await loadAstronomyWeatherHistory({
      latitude: params.get("latitude"),
      longitude: params.get("longitude"),
      month: params.get("month"),
    });
    return v1Json(history, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    if (error?.code === "month")
      return v1Error(
        Object.assign(
          new Error(
            "A month query parameter (YYYY-MM, not in the future) is required.",
          ),
          { code: "invalid_request", status: 400 },
        ),
      );
    return providerReadFailure(
      error,
      "weather_unavailable",
      "Weather providers are temporarily unavailable.",
    );
  }
}
