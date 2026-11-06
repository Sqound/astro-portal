import {
  skyCutoutRequest,
  skyCutoutService,
  skyCutoutSize,
} from "portal/sky-cutout/service.js";
import { skyTileMirrorEnabled } from "portal/sky-tiles/mirror.js";
import { v1Error } from "../../../../lib/v1/response.js";

// `GET /api/v1/sky-cutout?survey=dss-colour|dss2-red&ra=&dec=&fov=`
// (degrees; `fov` the side of the square, 0.02 to 20): a 640 px JPEG of the
// survey around (`ra`, `dec`), TAN, north up and east left, cut by the
// portal from its own tile mirror (`portal/sky-cutout/service.js`) with the
// tiles' own pixels. A complete cutout is immutable; a partial one (a tile
// the mirror could not have) is served for a minute; none at all answers
// 503 with `Retry-After`. `X-Sky-Cutout-Survey` names the survey actually
// served (`dss2-red` falls back on `dss-colour` when none of its tiles
// comes). The mirror's lever (`ASTRO_PORTAL_SKY_TILE_MIRROR=off`) turns this
// off too. No device authentication: like the tiles, nothing here is
// personal.

const immutable = "public, max-age=31536000, immutable";
const partial = "public, max-age=60";
// A fallback is served briefly: the survey asked for may come back.
const substituted = "public, max-age=300";

function failure(status, code, message, headers = {}) {
  const response = v1Error(Object.assign(new Error(message), { code, status }));
  for (const [name, value] of Object.entries(headers))
    response.headers.set(name, value);
  return response;
}

export async function GET(request) {
  if (!skyTileMirrorEnabled())
    return failure(
      404,
      "sky_cutout_disabled",
      "Sky cutouts are disabled on this portal.",
    );
  const query = new URL(request.url).searchParams;
  const read = (name) => {
    const value = query.get(name);
    return value === null || value.trim() === "" ? Number.NaN : Number(value);
  };
  const cutout = skyCutoutRequest({
    surveyId: query.get("survey") ?? "dss-colour",
    raDegrees: read("ra"),
    decDegrees: read("dec"),
    fov: read("fov"),
  });
  if (!cutout)
    return failure(
      400,
      "sky_cutout_request_invalid",
      "survey must be dss-colour or dss2-red, ra 0-360, dec -90-90 and fov 0.02-20 degrees.",
    );
  let result;
  try {
    result = await skyCutoutService().ensure(cutout);
  } catch {
    result = { status: "unavailable", retryAfterSeconds: 60 };
  }
  if (result.status !== "ready")
    return failure(
      503,
      "sky_cutout_unavailable",
      "No tile of the survey could be had for this field.",
      { "Retry-After": String(Math.max(1, result.retryAfterSeconds || 60)) },
    );
  const cacheControl = !result.complete
    ? partial
    : result.fallback
      ? substituted
      : immutable;
  const headers = {
    "Cache-Control": cacheControl,
    ETag: result.etag,
    "X-Sky-Cutout-Survey": result.surveyId,
    "X-Sky-Cutout-Complete": String(result.complete),
    "X-Sky-Cutout-Size": String(skyCutoutSize),
  };
  if (request.headers.get("if-none-match") === result.etag)
    return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : result.bytes, {
    headers: {
      ...headers,
      "Content-Type": "image/jpeg",
      "Content-Length": String(result.bytes.length),
    },
  });
}

export const HEAD = GET;
