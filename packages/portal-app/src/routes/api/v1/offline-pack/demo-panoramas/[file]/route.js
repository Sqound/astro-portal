import { optionalDeviceV1Access } from "../../../../../../lib/v1/access.js";
import { v1Error } from "../../../../../../lib/v1/response.js";
import { installedDemoPanoramaFile } from "../../../../../../lib/demo-panoramas.server.js";
import { packFileResponse } from "portal/offline-pack/file-response.js";

function demoPanoramaNotFound() {
  return v1Error(
    Object.assign(
      new Error("No such demo panorama file is installed on this portal."),
      { code: "offline_pack_demo_panorama_not_found", status: 404 },
    ),
  );
}

/**
 * `GET /v1/offline-pack/demo-panoramas/{manifest.json | <id>.jpg |
 * <id>.webp | <id>-512.jpg}`: the files of the demo-mode panorama pack
 * (portal-app/lib/demo-panoramas.server.js), the 360° backgrounds the demo
 * build of the phone shows in place of the camera of the horizon survey
 * (Poly Haven, CC0 1.0). Guest access, like the offline-pack manifest:
 * public, portal-wide data. The `ETag` is the SHA-256 of the bytes (the
 * `sha256` of the manifest's entry for a panorama); `Range` is honoured and
 * `Cache-Control: no-transform` is set, like every pack file
 * (`packFileResponse`). A name is served only when it is `manifest.json` or
 * one the installed manifest lists: nothing derived from the path segment
 * reaches the filesystem otherwise.
 */
export async function GET(request, { params }) {
  const { file } = await params;
  const installed = await installedDemoPanoramaFile(file);
  if (!installed) return demoPanoramaNotFound();

  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;

  const etag = `"sha256-${installed.checksum}"`;
  const header = request.headers.get("if-none-match");
  if (header?.split(",").some((candidate) => candidate.trim() === etag))
    return new Response(null, { status: 304, headers: { ETag: etag } });
  return packFileResponse(request, {
    body: { path: installed.path, size: installed.size },
    etag,
    contentType: installed.contentType,
  });
}
