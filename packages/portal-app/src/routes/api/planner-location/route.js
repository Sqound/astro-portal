import {
  resolvePlannerPlace,
  searchPlannerPlaces,
} from "portal/planner/location.server.js";
import { readBodyText } from "portal/api/json-body.js";

export async function POST(request) {
  try {
    // The custom Next server / reverse proxy may use an internal request URL.
    // Fetch Metadata distinguishes browser cross-site requests without rejecting
    // the portal's own public origin. This endpoint reads no private user data.
    if (request.headers.get("sec-fetch-site") === "cross-site")
      return Response.json(
        { error: "Cross-origin request rejected." },
        { status: 403 },
      );
    const raw = await readBodyText(request);
    if (raw.length > 2000) throw new Error("Location request is too large.");
    const body = JSON.parse(raw);
    const result =
      body.operation === "search"
        ? { results: await searchPlannerPlaces(body.query, body.locale) }
        : body.operation === "resolve"
          ? await resolvePlannerPlace(body, body.locale, Boolean(body.reverse))
          : null;
    if (!result) throw new Error("Unknown location operation.");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
