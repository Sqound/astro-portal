import { isShippedLocale } from "astro-contracts/locales";
import { plannerTargetCandidates } from "../../../lib/target-library.server.js";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const locale = isShippedLocale(url.searchParams.get("locale"))
      ? url.searchParams.get("locale")
      : "en";
    return Response.json(
      await plannerTargetCandidates({
        locale,
        latitude: url.searchParams.get("latitude"),
        minimumAltitude: url.searchParams.get("minimumAltitude"),
        selection: url.searchParams.get("selection"),
        mode: url.searchParams.get("mode") || "",
        limit: url.searchParams.get("limit"),
        catalogues: url.searchParams.get("catalogues") || "",
      }),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
