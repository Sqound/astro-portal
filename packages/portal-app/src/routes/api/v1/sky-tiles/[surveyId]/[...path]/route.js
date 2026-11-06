import { packFileResponse } from "portal/offline-pack/file-response.js";
import { parseSkyTileRequestPath } from "portal/sky-tiles/geometry.js";
import {
  skyTileMirror,
  skyTileMirrorEnabled,
} from "portal/sky-tiles/mirror.js";
import {
  skyBackdropArchiveChunkDelta,
  skyBackdropSurveys,
} from "portal/sky-tiles/surveys.js";

import { v1Json } from "../../../../../../lib/v1/response.js";

// Tiles are immutable — a HiPS survey's own guarantee — so the client never
// has to revalidate one; `properties` is the one file this mirror expects
// to change over time (design doc §5).
const immutableCacheControl = "public, max-age=31536000, immutable";
const propertiesCacheControl = "public, max-age=2592000"; // 30 days

const surveyIdPattern = /^[a-z0-9-]+$/;

/**
 * The v1 error envelope, plus — additively — `code` and `retryAfterSeconds`
 * at the top of the body, where a client's pack transport reads them (and a
 * building archive's `done`/`total`). Nested only under `error`, a building
 * archive would be read as "upstream unavailable", whose retries a client
 * gives up on.
 */
function skyTilesError(
  status,
  code,
  message,
  { retryAfterSeconds, extra } = {},
) {
  const headers = {};
  const seconds = retryAfterSeconds
    ? Math.max(1, Math.round(retryAfterSeconds))
    : null;
  if (seconds) headers["Retry-After"] = String(seconds);
  return v1Json(
    {
      error: { code, message },
      code,
      ...(seconds ? { retryAfterSeconds: seconds } : {}),
      ...extra,
    },
    { status, headers },
  );
}

function contentTypeFor(extension) {
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "tar") return "application/x-tar";
  return "text/plain; charset=utf-8";
}

/**
 * Streams `{ path, size }` off disk (never buffering the whole file — an
 * archive can be tens of megabytes) with a strong `ETag` and honours
 * `If-None-Match`, exactly like every other binary response this mirror
 * serves — and `Range`, with `Cache-Control: no-transform`, like every
 * offline-pack file (`packFileResponse`,
 * packages/portal/src/offline-pack/file-response.js): an interrupted
 * archive download resumes where it stopped instead of starting over.
 */
async function streamedFileResponse(
  request,
  mirror,
  { path, size },
  { contentType, cacheControl, ifNoneMatch },
) {
  const etag = await mirror.fileEtag(path);
  if (ifNoneMatch === etag)
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": cacheControl },
    });
  return packFileResponse(request, {
    body: { path, size },
    etag,
    contentType,
    cacheControl,
  });
}

/**
 * The self-hosted HiPS tile mirror: a mobile device fetches its offline-pack sky backdrop
 * from *this* route, never in bulk from the CDS, which fetches from the CDS
 * on this route's behalf, once, and caches the result. `surveyId` is
 * resolved **only** through the server-side `skyBackdropSurveys` table
 * (`packages/portal/src/sky-tiles/surveys.js`) — never concatenated from the
 * request — and `[...path]` is fully validated by `parseSkyTileRequestPath`
 * before anything touches the filesystem or the network, on the same model
 * as `portal-app/routes/api/stellarium/milkyway/[...path]/route.js`'s regex allowlist.
 *
 * No device authentication: like that Stellarium proxy, and like the tiles
 * themselves, nothing served here is personal to a device or a user.
 */
export async function GET(request, { params }) {
  if (!skyTileMirrorEnabled())
    return skyTilesError(
      404,
      "sky_tiles_mirror_disabled",
      "The sky-tile mirror is disabled on this portal.",
    );

  const { surveyId, path } = await params;
  const survey =
    typeof surveyId === "string" &&
    surveyIdPattern.test(surveyId) &&
    Object.prototype.hasOwnProperty.call(skyBackdropSurveys, surveyId)
      ? skyBackdropSurveys[surveyId]
      : null;
  if (!survey)
    return skyTilesError(
      404,
      "sky_tiles_survey_unknown",
      "Unknown sky-tile survey.",
    );

  const parsed = parseSkyTileRequestPath(
    path,
    survey,
    skyBackdropArchiveChunkDelta,
  );
  if (!parsed)
    return skyTilesError(
      404,
      "sky_tiles_path_invalid",
      "Invalid sky-tile mirror path.",
    );

  const mirror = skyTileMirror();
  const ifNoneMatch = request.headers.get("if-none-match");

  try {
    if (parsed.kind === "tile") {
      const result = await mirror.ensureTile({
        survey,
        order: parsed.order,
        pix: parsed.pix,
        extension: parsed.extension,
      });
      if (result.status === "unavailable")
        return skyTilesError(
          503,
          result.code,
          "The sky-tile mirror could not reach the upstream survey.",
          {
            retryAfterSeconds: result.retryAfterSeconds,
          },
        );
      return await streamedFileResponse(request, mirror, result, {
        contentType: contentTypeFor(parsed.extension),
        cacheControl: immutableCacheControl,
        ifNoneMatch,
      });
    }

    if (parsed.kind === "archive") {
      const result = await mirror.ensureArchive({
        survey,
        order: parsed.order,
        chunkOrder: parsed.chunkOrder,
        chunkPix: parsed.chunkPix,
        addresses: parsed.addresses,
      });
      if (result.status === "building")
        return skyTilesError(
          503,
          result.code,
          "The sky-tile archive is being built from the upstream survey.",
          {
            retryAfterSeconds: result.retryAfterSeconds,
            extra: {
              progress: {
                done: result.done,
                total: result.total,
                upstreamRemaining: result.upstreamRemaining,
              },
              done: result.done,
              total: result.total,
            },
          },
        );
      if (result.status === "unavailable")
        return skyTilesError(
          503,
          result.code,
          "The sky-tile mirror could not reach the upstream survey.",
          {
            retryAfterSeconds: result.retryAfterSeconds,
          },
        );
      return await streamedFileResponse(request, mirror, result, {
        contentType: contentTypeFor("tar"),
        cacheControl: immutableCacheControl,
        ifNoneMatch,
      });
    }

    // parsed.kind === "properties"
    const result = await mirror.ensureProperties({ survey });
    if (result.status === "unavailable")
      return skyTilesError(
        503,
        result.code,
        "The sky-tile mirror could not reach the upstream survey.",
        {
          retryAfterSeconds: result.retryAfterSeconds,
        },
      );
    return await streamedFileResponse(request, mirror, result, {
      contentType: "text/plain; charset=utf-8",
      cacheControl: propertiesCacheControl,
      ifNoneMatch,
    });
  } catch {
    return skyTilesError(
      503,
      "sky_tiles_upstream_unavailable",
      "The sky-tile mirror could not reach the upstream survey.",
      {
        retryAfterSeconds: 60,
      },
    );
  }
}
