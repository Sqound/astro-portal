import { loadPlaceClimateTrend } from "portal/place-climate-trend.server.js";
import { authEnabled, authService } from "../../../lib/auth.server.js";
import { plannerCapabilitiesForSession } from "../../../lib/planner-capabilities.server.js";

// The web planner's read of the weather trend of a place, the same cache as
// `GET /v1/places/climate-trend`, and the same right: « Planification
// avancée » (`planner.mosaic`), `401` without a session,
// `403 capability_required` without the capability. A private server's
// profile opens it (the server never restricts).
const CAPABILITY = "planner.mosaic";

async function refusalFor(request) {
  let session = null;
  if (authEnabled()) {
    try {
      session = await authService().requireSession(request.headers);
    } catch {
      return Response.json(
        { error: "authentication_required" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  const capabilities = await plannerCapabilitiesForSession(session);
  if (capabilities?.[CAPABILITY] === true) return null;
  return Response.json(
    { error: "capability_required", capability: CAPABILITY },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request) {
  const refusal = await refusalFor(request);
  if (refusal) return refusal;
  const params = new URL(request.url).searchParams;
  try {
    const answer = await loadPlaceClimateTrend({
      latitude: params.get("latitude"),
      longitude: params.get("longitude"),
    });
    if (answer.status === "computing")
      return Response.json(
        { status: "computing" },
        {
          status: 202,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(answer.retryAfterSeconds),
          },
        },
      );
    return Response.json(
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
    const invalid = error.code === "coordinates";
    return Response.json(
      {
        error: error.code || "provider",
        retryAfterSeconds: error.retryAfterSeconds || 60,
      },
      {
        status: invalid ? 400 : 503,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(error.retryAfterSeconds || 60),
        },
      },
    );
  }
}
