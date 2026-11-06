import {
  authEnabled,
  authService,
  pairingMode,
} from "../../../../../lib/auth.server.js";
import {
  createRateLimiter,
  requestOrigin,
} from "../../../../../lib/rate-limit.server.js";
import {
  v1Error,
  v1Json,
  v1NotFound,
  v1Unavailable,
} from "../../../../../lib/v1/response.js";
import { readJsonBody } from "portal/api/json-body.js";

// A network origin that failed ten device claims in
// ten minutes is refused until the oldest failure is ten minutes old — the
// right code included. Pairing a phone takes one successful claim, which
// is never counted; guessing an eight-character code takes billions of
// failures.
const failedClaims = createRateLimiter({ windowMs: 10 * 60_000, max: 10 });

function rateLimited(retryAfterSeconds) {
  return v1Json(
    {
      error: {
        code: "pairing_rate_limited",
        message:
          "Too many failed pairing attempts from this network. Try again later.",
      },
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function POST(request) {
  if (!authEnabled()) return v1Unavailable();
  // Devices are paired with a code on a private server signing in by
  // password only; wherever a person signs in by e-mail code, a device
  // signs in by itself (docs/PRIVATE_NOTEBOOK_AUTH.md).
  if (!pairingMode()) return v1NotFound();
  const origin = requestOrigin(request);
  const limit = failedClaims.check(origin);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    failedClaims.record(origin);
    return v1Error(error, {
      code: "invalid_request",
      message: "A JSON pairing request is required.",
      status: 400,
    });
  }
  try {
    const clientInstanceIdHeader = request.headers
      .get("x-astro-client-instance")
      ?.trim();
    return v1Json(
      await authService().claimDevicePairing({
        ...(body || {}),
        originClientInstanceId: clientInstanceIdHeader
          ? clientInstanceIdHeader.slice(0, 200)
          : null,
      }),
      { status: 201 },
    );
  } catch (error) {
    // A space already at its ceiling of devices is not a guess.
    if (error?.code !== "device_limit_reached") failedClaims.record(origin);
    return v1Error(error, {
      code: "pairing_unavailable",
      message: "Pairing code is invalid, expired, or already claimed.",
      status: 409,
    });
  }
}
