import { loadPlannerSkyQuality } from "portal/planner/sky-quality.server.js";

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  try {
    const skyQuality = await loadPlannerSkyQuality({
      latitude: params.get("latitude"),
      longitude: params.get("longitude"),
    });
    return Response.json(skyQuality, {
      headers: { "Cache-Control": "private, max-age=86400" },
    });
  } catch (error) {
    return Response.json(
      {
        error: error.code || "provider",
        retryAfterSeconds: error.retryAfterSeconds || 300,
      },
      {
        status: error.code === "coordinates" ? 400 : 503,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(error.retryAfterSeconds || 300),
        },
      },
    );
  }
}
