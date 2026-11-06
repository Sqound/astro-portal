import { loadAstronomyWeather } from "portal/astronomy-weather.server.js";

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  try {
    const weather = await loadAstronomyWeather({
      latitude: params.get("latitude"),
      longitude: params.get("longitude"),
    });
    return Response.json(weather, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (error) {
    return Response.json(
      {
        error: error.code || "provider",
        retryAfterSeconds: error.retryAfterSeconds || 60,
      },
      {
        status: error.code === "coordinates" ? 400 : 503,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(error.retryAfterSeconds || 60),
        },
      },
    );
  }
}
