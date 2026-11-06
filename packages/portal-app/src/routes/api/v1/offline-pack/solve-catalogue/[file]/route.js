import { optionalDeviceV1Access } from "../../../../../../lib/v1/access.js";
import { v1Error } from "../../../../../../lib/v1/response.js";
import { installedSolveCatalogue } from "../../../../../../lib/solve-catalogue.server.js";
import { solveCatalogueFileName } from "portal/offline-pack/solve-catalogue.js";
import { packFileResponse } from "portal/offline-pack/file-response.js";

function solveCatalogueNotFound() {
  return v1Error(
    Object.assign(
      new Error(
        "No offline-pack deep star catalogue is installed on this portal.",
      ),
      { code: "offline_pack_solve_catalogue_not_found", status: 404 },
    ),
  );
}

/**
 * `GET /v1/offline-pack/solve-catalogue/stars.bin`: the one file of the
 * `solve-catalogue` component of `GET /v1/offline-pack`
 * (portal-app/lib/offline-pack.server.js), the deep star catalogue the
 * phone's telephoto plate solving builds its narrow index from (HYG v4.1,
 * CC BY-SA 4.0). Guest access, like the manifest: public, portal-wide data.
 * The `ETag` is the SHA-256 of the bytes, the component's own `checksum`;
 * `Range` is honoured and `Cache-Control: no-transform` is set, like every
 * pack file (`packFileResponse`). A whitelist of one name: nothing derived
 * from the path segment reaches the filesystem.
 */
export async function GET(request, { params }) {
  const { file } = await params;
  if (file !== solveCatalogueFileName) return solveCatalogueNotFound();

  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;

  const installed = await installedSolveCatalogue();
  if (!installed) return solveCatalogueNotFound();

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
