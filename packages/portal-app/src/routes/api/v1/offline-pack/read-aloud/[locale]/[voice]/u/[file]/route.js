import { optionalDeviceV1Access } from "../../../../../../../../../lib/v1/access.js";
import { v1Error } from "../../../../../../../../../lib/v1/response.js";
import { installedReadAloudUnit } from "../../../../../../../../../lib/read-aloud.server.js";
import { packFileResponse } from "portal/offline-pack/file-response.js";

const unitFile = /^([0-9a-f]{32})\.m4a$/u;

function readAloudNotFound() {
  return v1Error(
    Object.assign(
      new Error("No such spoken unit is installed on this portal."),
      { code: "offline_pack_read_aloud_not_found", status: 404 },
    ),
  );
}

/**
 * `GET /v1/offline-pack/read-aloud/{locale}/{voice}/u/{id}.m4a`: one unit of
 * the `read-aloud` component of `GET /v1/offline-pack`
 * (portal-app/lib/offline-pack.server.js), the paragraph a neural voice
 * spoke at generation time, `read-aloud/<voice>/<locale>/u/<id>.m4a` of the
 * static data (`{voice}` is the manifest's `voiceVersion`). Guest access,
 * like the manifest: public, portal-wide data. The `ETag` is the SHA-256 of
 * the bytes, the digest the language manifest states; `Range` is honoured
 * and `Cache-Control: no-transform` is set (`packFileResponse`). The address
 * holds the content's hash, so the answer is `immutable`.
 *
 * Whitelist: the id is 32 hexadecimal digits and the language manifest must
 * list it (`installedReadAloudUnit`); anything else is `404`, and nothing
 * else of the path reaches the filesystem.
 */
export async function GET(request, { params }) {
  const { locale, voice, file } = await params;
  const match = unitFile.exec(String(file));
  if (!match) return readAloudNotFound();

  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;

  const installed = await installedReadAloudUnit({
    locale: String(locale),
    voice: String(voice),
    unit: match[1],
  });
  if (!installed) return readAloudNotFound();

  const etag = `"sha256-${installed.sha256}"`;
  const header = request.headers.get("if-none-match");
  if (header?.split(",").some((candidate) => candidate.trim() === etag))
    return new Response(null, { status: 304, headers: { ETag: etag } });
  return packFileResponse(request, {
    body: { path: installed.path, size: installed.bytes },
    etag,
    contentType: "audio/mp4",
    cacheControl: "public, max-age=2592000, immutable",
  });
}
