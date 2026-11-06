import { createRateLimiter, requestOrigin } from "../rate-limit.server.js";
import { v1Json } from "./response.js";

/**
 * The caps of a route open without a space: per anonymous device
 * and per network origin, over a sliding window (an hour by default),
 * checked for a device with no space or a web visitor only — a space's
 * device or session keeps the limits it had. Returns a check
 * `(request, access) => Response | null`: `429` with the route's `code` and
 * `Retry-After` once a cap is reached, else `null` and the call counted.
 */
export function createWithoutSpaceLimits({
  perDevice,
  perOrigin,
  windowMs = 60 * 60_000,
  maxKeys = 5_000,
  code,
  message,
}) {
  const devices = createRateLimiter({ windowMs, max: perDevice, maxKeys });
  const origins = createRateLimiter({ windowMs, max: perOrigin, maxKeys });
  return function check(request, access) {
    if (!access?.anonymousDeviceId && !access?.visitor) return null;
    const keys = [
      ...(access.anonymousDeviceId
        ? [[devices, access.anonymousDeviceId]]
        : []),
      [origins, access.visitor?.origin ?? requestOrigin(request)],
    ];
    for (const [limiter, key] of keys) {
      const verdict = limiter.check(key);
      if (!verdict.allowed)
        return v1Json(
          { error: { code, message } },
          {
            status: 429,
            headers: { "Retry-After": String(verdict.retryAfterSeconds) },
          },
        );
    }
    for (const [limiter, key] of keys) limiter.record(key);
    return null;
  };
}
