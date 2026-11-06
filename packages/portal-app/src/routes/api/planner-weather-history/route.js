import { loadAstronomyWeatherHistory } from "portal/astronomy-weather.server.js";

// The web planner's read of the measured weather of one month, the same cache as `GET /v1/weather/history`.
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  try {
    const history = await loadAstronomyWeatherHistory({
      latitude: params.get("latitude"),
      longitude: params.get("longitude"),
      month: params.get("month"),
    });
    return Response.json(history, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    const invalid = error.code === "coordinates" || error.code === "month";
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
