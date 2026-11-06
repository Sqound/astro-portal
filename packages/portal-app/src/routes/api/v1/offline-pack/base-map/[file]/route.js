import { optionalDeviceV1Access } from "../../../../../../lib/v1/access.js";
import { v1Error } from "../../../../../../lib/v1/response.js";
import { installedBaseMap } from "../../../../../../lib/base-map.server.js";
import { baseMapFileName } from "portal/offline-pack/base-map.js";
import { packFileResponse } from "portal/offline-pack/file-response.js";

function baseMapNotFound() {
  return v1Error(
    Object.assign(
      new Error("No offline-pack map background is installed on this portal."),
      { code: "offline_pack_base_map_not_found", status: 404 },
    ),
  );
}

/**
 * `GET /v1/offline-pack/base-map/natural-earth.bin`: the one file of the
 * `base-map` component of `GET /v1/offline-pack`
 * (portal-app/lib/offline-pack.server.js), the offline background of the
 * light-pollution map (Natural Earth, public domain). Guest access, like the
 * manifest: public, portal-wide data. The `ETag` is the SHA-256 of the
 * bytes, the component's own `checksum`; `Range` is honoured and
 * `Cache-Control: no-transform` is set, like every pack file
 * (`packFileResponse`). A whitelist of one name: nothing derived from the
 * path segment reaches the filesystem.
 */
export async function GET(request, { params }) {
  const { file } = await params;
  if (file !== baseMapFileName) return baseMapNotFound();

  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;

  const installed = await installedBaseMap();
  if (!installed) return baseMapNotFound();

  const etag = `"sha256-${installed.checksum}"`;
  const header = request.headers.get("if-none-match");
  if (header?.split(",").some((candidate) => candidate.trim() === etag))
    return new Response(null, { status: 304, headers: { ETag: etag } });
  return packFileResponse(request, {
    body: { path: installed.path, size: installed.size },
    etag,
    contentType: "application/octet-stream",
  });
}
