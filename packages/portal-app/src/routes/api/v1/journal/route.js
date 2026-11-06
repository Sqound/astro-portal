import { eitherV1Access } from "../../../../lib/v1/access.js";
import {
  catalogueNightsOfPrivateServer,
  journalFailure,
  requireJournalService,
} from "../../../../lib/v1/journal-service.js";
import { capabilitiesOfAccess } from "../../../../lib/v1/access-capabilities.js";
import { v1Json } from "../../../../lib/v1/response.js";
import { validatedJournalQuery } from "portal/api/journal.js";

/**
 * GET /v1/journal?year=&instrument=&season=&outcome=&multiNightOnly=&cursor=&limit=
 * — the Journal (`journal.schema.json`): the sessions of the
 * space, the most recent night first, by cursor, with the groups of the finished
 * multi-night plans, the years and instruments of the filters and the figures of
 * the header. A read **never held by a right**: either credential, no capability,
 * any profile, the read-only window of an ended subscription included. On a private
 * server the nights of the operator's catalogue that match no session are listed as
 * read-only sessions of origin `import`.
 *
 * The answer carries the header `X-Astro-Gallery-Statistics`: `open` when the
 * caller's profile grants `gallery.private` — the statistics by target and by
 * instrument need that capability —, else `held`. A page that draws a figure
 * of those statistics (« Mon matériel » says how many nights a tube has seen)
 * reads it rather than guessing; a profile that cannot be read says nothing
 * (the page then draws nothing of them).
 */
export async function GET(request) {
  const access = await eitherV1Access(request);
  if (access.response) return access.response;
  try {
    const url = new URL(request.url);
    const service = await requireJournalService();
    // Validate the query before reading the catalogue.
    validatedJournalQuery(url.searchParams);
    const body = await service.read({
      tenantId: access.tenantId,
      query: url.searchParams,
      catalogueNights: await catalogueNightsOfPrivateServer(),
    });
    let statistics = null;
    try {
      statistics =
        (await capabilitiesOfAccess(access))?.["gallery.private"] === true
          ? "open"
          : "held";
    } catch {
      statistics = null;
    }
    return v1Json(body, {
      headers: statistics ? { "X-Astro-Gallery-Statistics": statistics } : {},
    });
  } catch (error) {
    return journalFailure(error);
  }
}
