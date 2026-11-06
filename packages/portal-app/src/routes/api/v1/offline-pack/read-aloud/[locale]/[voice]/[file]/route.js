import { optionalDeviceV1Access } from "../../../../../../../../lib/v1/access.js";
import { v1Error } from "../../../../../../../../lib/v1/response.js";
import { installedReadAloudManifest } from "../../../../../../../../lib/read-aloud.server.js";
import { readAloudManifestFileName } from "portal/offline-pack/read-aloud.js";
import { packFileResponse } from "portal/offline-pack/file-response.js";

function readAloudNotFound() {
  return v1Error(
    Object.assign(
      new Error("No such spoken-reading manifest is installed on this portal."),
      { code: "offline_pack_read_aloud_not_found", status: 404 },
    ),
  );
}

/**
 * `GET /v1/offline-pack/read-aloud/{locale}/{voice}/manifest.json`: the
 * language manifest of the `read-aloud` component (the fiches of each level
 * and their units, `read-aloud-manifest.schema.json`), the file the
 * generator deposited. The component of `GET /v1/offline-pack` gives its
 * address and digest. Guest access; `ETag` = the SHA-256 of the bytes;
 * `Range` honoured; `no-transform`. A whitelist of one file name.
 */
export async function GET(request, { params }) {
  const { locale, voice, file } = await params;
  if (file !== readAloudManifestFileName) return readAloudNotFound();

  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;

  const installed = await installedReadAloudManifest({
    locale: String(locale),
    voice: String(voice),
  });
  if (!installed) return readAloudNotFound();

  const etag = `"sha256-${installed.checksum}"`;
  const header = request.headers.get("if-none-match");
  if (header?.split(",").some((candidate) => candidate.trim() === etag))
    return new Response(null, { status: 304, headers: { ETag: etag } });
  return packFileResponse(request, {
    body: { path: installed.path, size: installed.bytes },
    etag,
    contentType: "application/json",
  });
}
