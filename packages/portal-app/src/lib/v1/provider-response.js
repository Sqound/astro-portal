import { v1Error } from "./response.js";

/**
 * Shared by the weather and sky-quality proxies: both underlying caches
 * throw an internal code ("coordinates" for bad input, "provider" or
 * "rate_limit" for an outage/cooldown, each with retryAfterSeconds) that is
 * not the public v1 vocabulary. v1Error prefers an error's own `.code`, so
 * this builds a fresh error carrying the v1-facing code instead of relying
 * on its options fallback.
 */
export function providerReadFailure(
  error,
  unavailableCode,
  unavailableMessage,
) {
  if (error?.code === "coordinates")
    return v1Error(
      Object.assign(
        new Error(
          "Valid latitude and longitude query parameters are required.",
        ),
        { code: "invalid_request", status: 400 },
      ),
    );
  const response = v1Error(
    Object.assign(new Error(unavailableMessage), {
      code: unavailableCode,
      status: 503,
    }),
  );
  if (Number.isInteger(error?.retryAfterSeconds))
    response.headers.set("Retry-After", String(error.retryAfterSeconds));
  return response;
}
