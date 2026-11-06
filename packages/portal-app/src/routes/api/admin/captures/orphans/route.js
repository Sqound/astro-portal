import { CaptureOrphanError } from "portal/captures/orphans.js";
import { captureOrphans } from "../../../../../lib/capture-orphans.server.js";
import { adminActor } from "../../../../../lib/v1/admin-actor.js";
import { v1Json } from "../../../../../lib/v1/response.js";

const refusal = (code, message, status) =>
  v1Json({ error: { code, message } }, { status });

/**
 * GET /api/admin/captures/orphans: the orphans of the capture store, the
 * same report as `scripts/captures-orphans.mjs` without `--apply` — the
 * files no row of their space holds (`orphans`, a `young` one is a file
 * written in the last hour, which an upload may be about to name), those a
 * pending deletion is about to remove (`pending`), and the images whose
 * original the store does not have (`missing`), by space, with totals.
 * Nothing is deleted. `?tenantId=` limits it to one space; `?strays=0`
 * leaves out the spaces the store holds files for and the database does not
 * know (listing a Blob container is long); `?minAge=` is the age, in
 * seconds, under which a file is `young` (3600). Read only, so no CSRF
 * token is asked for.
 */
export async function GET(request) {
  const actor = await adminActor(request);
  if (actor.response) return actor.response;
  const query = new URL(request.url).searchParams;
  const tenantId = query.get("tenantId")?.trim() || null;
  const minAge = query.get("minAge");
  if (minAge !== null && !/^\d{1,9}$/.test(minAge))
    return refusal("invalid_request", "minAge is a number of seconds.", 400);
  try {
    const report = await captureOrphans({
      tenantId,
      strays: query.get("strays") !== "0",
      ...(minAge === null ? {} : { minAgeMs: Number(minAge) * 1000 }),
    });
    if (!report)
      return refusal(
        "capture_storage_unavailable",
        "Capture storage is unavailable.",
        503,
      );
    return v1Json(report);
  } catch (error) {
    if (error instanceof CaptureOrphanError)
      return refusal(error.code, error.message, 501);
    if (/A valid tenant id is required/.test(error?.message || ""))
      return refusal("invalid_request", "tenantId is not a space id.", 400);
    return refusal(
      "capture_storage_unavailable",
      "Capture storage is unavailable.",
      503,
    );
  }
}
