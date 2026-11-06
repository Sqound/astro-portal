import { optionalDeviceV1Access } from "../../../../lib/v1/access.js";
import { v1Error } from "../../../../lib/v1/response.js";
import {
  targetIndexDocument,
  targetIndexIncludes,
  targetIndexMaximumPageSize,
} from "../../../../lib/target-library.server.js";
import { targetFavoriteRepository } from "../../../../lib/target-favorite-repository.server.js";
import { negotiatedJsonResponse } from "../../../../lib/content-coding.server.js";
import {
  favoriteFilterIds,
  invalidRequest,
  targetSelectionFrom,
} from "../../../../lib/v1/targets-query.js";

function libraryFailure(error) {
  return v1Error(error, {
    code: "target_library_unavailable",
    message: "The target library is unavailable.",
    status: 503,
  });
}

/**
 * `include=extended` asks for the web planner's own pool shape rather than a
 * plain page: the page, plus every extended editorial target the same filters
 * and ranking kept, so the Étendues selection is complete instead of cut off
 * at the page boundary. `rows` may then be longer than `limit`, which is why
 * the parameter has to be asked for rather than inferred.
 */
function requestedInclude(value) {
  if (value === null || value === "") return "";
  if (!targetIndexIncludes.includes(value))
    throw invalidRequest(
      `include must be one of ${targetIndexIncludes.join(", ")}.`,
    );
  return value;
}

/**
 * The compact columnar index of the shared catalogue.
 *
 * Same catalogue, same filters, same orderings and the same refusals as
 * `GET /v1/targets`; a fraction of the bytes, because a row carries what a
 * planning candidate needs and not the target's knowledge article, observing
 * prose or image credits. A client that needs those fetches the one target it
 * is showing through `GET /v1/targets/{targetId}`.
 *
 * A portal predating this route answers `404`. That is the whole negotiation:
 * a client that gets one falls back to `GET /v1/targets` and the page size
 * that route allows.
 */
export async function GET(request) {
  // Reading the shared catalogue is not plan synchronization.
  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  const url = new URL(request.url);
  const favoritesOnly = url.searchParams.get("favorites") === "1";
  const favoriteMode = url.searchParams.get("favoriteMode") || "";
  try {
    if (favoritesOnly && !access.userId)
      return v1Error(
        Object.assign(new Error("Device authentication required."), {
          code: "device_authentication_required",
          status: 401,
        }),
      );
    // The device's favorites are read for the one request that asks for them.
    // Every other request is the shared catalogue's answer, the same bytes for
    // a guest, an anonymous device and a paired one.
    let favorites = null;
    if (favoritesOnly) {
      const repository = await targetFavoriteRepository();
      if (!repository)
        throw Object.assign(new Error("Favorite storage is unavailable."), {
          code: "favorite_storage_unavailable",
          status: 503,
        });
      favorites = await repository.favoriteTargetIdsByMode(access.userId);
    }
    const document = await targetIndexDocument({
      ...targetSelectionFrom(url),
      offset: url.searchParams.get("offset") || 0,
      limit: url.searchParams.get("limit") || targetIndexMaximumPageSize,
      include: requestedInclude(url.searchParams.get("include")),
      targetIds: favoritesOnly
        ? favoriteFilterIds(favorites, favoriteMode)
        : null,
    });
    // The index is a pure function of the catalogue revision and the query,
    // so a revalidation is worth far more here than anywhere else on this
    // API: 720 rows the client already holds cost one `304` and no decoding
    // at all. The `Cache-Control` policy is `GET /v1/targets`' own for the
    // shared catalogue — public and briefly cacheable, for a guest as for a
    // device, since the answer is the same — and `no-store` for a request
    // that names favorites (`favorites=1`, `favoriteMode`), which is one
    // device's. That is also what lets the edge (Cloudflare) keep the answer.
    //
    // Sent gzip- or brotli-encoded when the client accepts it (≈3.7 MB for
    // the whole catalogue uncompressed, ≈0.5 MB gzipped), each coding with
    // its own ETag; see `negotiatedJsonResponse`.
    const cacheControl =
      favoritesOnly || favoriteMode ? "no-store" : "public, max-age=300";
    return await negotiatedJsonResponse(request, document, {
      "Cache-Control": cacheControl,
    });
  } catch (error) {
    return libraryFailure(error);
  }
}
