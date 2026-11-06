import { anonymousOrEitherV1Access } from "../../../../../lib/v1/access.js";
import { capabilitiesOfAccess } from "../../../../../lib/v1/access-capabilities.js";
import { createWithoutSpaceLimits } from "../../../../../lib/v1/without-space-limits.js";
import { planResourceFailure } from "../../../../../lib/v1/plan-resource-service.js";
import { v1Json } from "../../../../../lib/v1/response.js";
import { providerReadFailure } from "../../../../../lib/v1/provider-response.js";
import { loadPlaceClimateTrend } from "portal/place-climate-trend.server.js";

/** The capability the trend asks. */
const CLIMATE_TREND_CAPABILITY = "planner.mosaic";

// A phone with no space: 120 trends an hour per anonymous device
// and 600 per network origin; a trend is read once a year per place.
const withoutSpaceLimits = createWithoutSpaceLimits({
  perDevice: 120,
  perOrigin: 600,
  code: "climate_trend_rate_limited",
  message: "Too many trends were asked from this device: try again later.",
});

/**
 * The weather trend of a place: the best and the
 * worst period of the year there, from ten years of the measured weather.
 * An addition a profile may hold back: a device or a web session of the person is required
 * (`401`), and the profile must hold `planner.mosaic` (`403
 * capability_required`, naming it). A private server never restricts what it serves: its open-source profile opens `planner.mosaic`, so its
 * owner is served the trend too. The conditions of a place and the plan's accuracy are never gated. The archive is read once
 * a year per place by the service (`place-climate-trend.server.js`); a first
 * reading that takes long answers `202` `{ "status": "computing" }` with a
 * `Retry-After`, and `503` `weather_unavailable` is the archive's failure
 * when nothing was ever kept.
 *
 * The trend reads nothing personal: a device
 * with no space is answered by its anonymous bearer, `planner.mosaic` then
 * coming from the purchases it proved (`403 capability_required`
 * without one).
 */
export async function GET(request) {
  const access = await anonymousOrEitherV1Access(request, {
    synchronize: false,
  });
  if (access.response) return access.response;
  const limited = withoutSpaceLimits(request, access);
  if (limited) return limited;
  try {
    const capabilities = await capabilitiesOfAccess(access);
    if (capabilities?.[CLIMATE_TREND_CAPABILITY] !== true)
      return v1Json(
        {
          error: {
            code: "capability_required",
            message:
              "The weather trend of a place needs a right this profile does not hold.",
          },
          capability: CLIMATE_TREND_CAPABILITY,
        },
        { status: 403 },
      );
  } catch (error) {
    return planResourceFailure(error);
  }
  const params = new URL(request.url).searchParams;
  try {
    const answer = await loadPlaceClimateTrend({
      latitude: params.get("latitude"),
      longitude: params.get("longitude"),
    });
    if (answer.status === "computing")
      return v1Json(
        { status: "computing" },
        {
          status: 202,
          headers: { "Retry-After": String(answer.retryAfterSeconds) },
        },
      );
    return v1Json(
      { status: "ready", ...answer.trend },
      {
        headers: {
          "Cache-Control": answer.trend.stale
            ? "private, max-age=300"
            : "private, max-age=86400",
        },
      },
    );
  } catch (error) {
    return providerReadFailure(
      error,
      "weather_unavailable",
      "Weather providers are temporarily unavailable.",
    );
  }
}
