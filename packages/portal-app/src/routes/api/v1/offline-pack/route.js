import { optionalDeviceV1Access } from "../../../../lib/v1/access.js";
import { v1Error, v1Json } from "../../../../lib/v1/response.js";
import {
  OfflinePackPreparingError,
  offlinePackDocument,
} from "../../../../lib/offline-pack.server.js";
import {
  downloadOrigin,
  downloadOriginEtag,
  withDownloadOrigin,
} from "../../../../lib/download-origin.server.js";

function offlinePackFailure(error) {
  return v1Error(error, {
    code: "offline_pack_unavailable",
    message: "The offline pack manifest is unavailable.",
    status: 503,
  });
}

/**
 * Nothing to answer with yet — a portal computing its very first manifest:
 * `503` with `Retry-After`, the v1 error envelope, and — where the phone's
 * pack transport reads them for a pack file — `code` and
 * `retryAfterSeconds` at the top of the body too.
 */
function offlinePackPreparing(error) {
  return v1Json(
    {
      error: { code: error.code, message: error.message },
      code: error.code,
      retryAfterSeconds: error.retryAfterSeconds,
    },
    {
      status: 503,
      headers: { "Retry-After": String(error.retryAfterSeconds) },
    },
  );
}

/**
 * What this self-hosted portal can serve for an offline pack: components,
 * revisions, sizes and URL templates, in one round trip — never a fixed
 * list, since every instance differs in what it has installed (a
 * light-pollution pack raster, an enabled HiPS tile mirror) and in its own
 * catalogue's size and revision. A client fetches this once, compares
 * `catalogue.revision` against what it already downloaded, and only then
 * decides which components to fetch or re-fetch.
 *
 * Never a minute's wait (`portal-app/lib/offline-pack.server.js`): while a
 * component is recomputed in the background, the answer is the last
 * manifest this portal knows (`X-Offline-Pack-Freshness: stale`,
 * `Cache-Control: no-cache`), its sky backdrop always current; with none at
 * all, a `503` with `Retry-After`.
 *
 * No data here is personal to a device or a user — it is the same
 * capability announcement for every caller — so this only calls
 * `optionalDeviceV1Access` to refuse a credential it cannot honor, exactly
 * as `GET /v1/target-index` does; a guest is fully served.
 *
 * A portal predating this route answers `404`. That is the whole
 * negotiation: a client that gets one keeps composing its pack from the
 * individual routes it already knew about.
 */
export async function GET(request) {
  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  try {
    const document = await offlinePackDocument();
    // The heavy files on the download origin when one is configured.
    const origin = downloadOrigin();
    const etag = downloadOriginEtag(document.etag, origin);
    const json = origin
      ? JSON.stringify(withDownloadOrigin(JSON.parse(document.json), origin))
      : document.json;
    const cacheControl = document.fresh ? "public, max-age=60" : "no-cache";
    const headers = {
      ETag: etag,
      "Cache-Control": cacheControl,
      "X-Offline-Pack-Freshness": document.fresh ? "fresh" : "stale",
    };
    if (request.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers });
    return new Response(json, {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (
      error instanceof OfflinePackPreparingError ||
      error?.code === "offline_pack_preparing"
    )
      return offlinePackPreparing(error);
    return offlinePackFailure(error);
  }
}
