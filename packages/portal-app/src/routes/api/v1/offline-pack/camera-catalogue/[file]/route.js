import { optionalDeviceV1Access } from "../../../../../../lib/v1/access.js";
import { v1Error } from "../../../../../../lib/v1/response.js";
import { installedCameraCatalogue } from "../../../../../../lib/camera-catalogue.server.js";
import { cameraCatalogueFileName } from "portal/offline-pack/camera-catalogue.js";
import { packFileResponse } from "portal/offline-pack/file-response.js";

function cameraCatalogueNotFound() {
  return v1Error(
    Object.assign(
      new Error(
        "No offline-pack camera star catalogue is installed on this portal.",
      ),
      { code: "offline_pack_camera_catalogue_not_found", status: 404 },
    ),
  );
}

/**
 * `GET /v1/offline-pack/camera-catalogue/stars.bin`: the one file of the
 * `camera-catalogue` component of `GET /v1/offline-pack`
 * (portal-app/lib/offline-pack.server.js), the zoned Tycho-2 catalogue a
 * telescope camera's narrow plate solving reads its cone from (CAM-3,
 * CC BY-NC 3.0 IGO, commercial authorisation asked of the ESA). Guest
 * access, like the manifest. The `ETag` is the SHA-256 of the bytes, the
 * component's own `checksum`; `Range` is honoured and `Cache-Control:
 * no-transform` is set, like every pack file (`packFileResponse`). A
 * whitelist of one name: nothing derived from the path segment reaches the
 * filesystem.
 */
export async function GET(request, { params }) {
  const { file } = await params;
  if (file !== cameraCatalogueFileName) return cameraCatalogueNotFound();

  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;

  const installed = await installedCameraCatalogue();
  if (!installed) return cameraCatalogueNotFound();

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
