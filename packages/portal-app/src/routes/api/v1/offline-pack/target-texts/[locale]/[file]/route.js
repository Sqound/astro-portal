import { stat } from "node:fs/promises";

import { optionalDeviceV1Access } from "../../../../../../../lib/v1/access.js";
import { v1Error } from "../../../../../../../lib/v1/response.js";
import { installedTargetTextShard } from "../../../../../../../lib/target-texts-pack.server.js";
import { packFileResponse } from "portal/offline-pack/file-response.js";

const shardFile = /^([0-9]{3})\.json$/u;

function targetTextsNotFound() {
  return v1Error(
    Object.assign(
      new Error(
        "No such shard of catalogue texts is installed on this portal.",
      ),
      { code: "offline_pack_target_texts_not_found", status: 404 },
    ),
  );
}

/**
 * `GET /v1/offline-pack/target-texts/{locale}/{shard}.json`: one shard of the
 * `target-texts` component of `GET /v1/offline-pack`
 * (portal-app/lib/offline-pack.server.js), the file
 * `target-library/texts/<locale>/<shard>.json` of the static-data package
 * (`target-texts-shard.schema.json`). Guest access, like the manifest: public,
 * portal-wide data. The `ETag` is the SHA-256 of the bytes, the digest the
 * manifest states (`"sha256-<hex>"`, like every pack file), `Range` is
 * honoured and `Cache-Control: no-transform` is set (`packFileResponse`); a
 * request through the download host (`ASTRO_PORTAL_DOWNLOAD_ORIGIN`) is
 * answered here as any other.
 *
 * Nothing taken from the path reaches the filesystem: the language must be a
 * shipped one and `<shard>.json` three digits, and the file is the one the
 * folder's index names for that pair (`installedTargetTextShard`). A shard the
 * index does not list, or whose file is not there with the size the index
 * says, is `404` (the manifest does not list it either).
 */
export async function GET(request, { params }) {
  const { locale, file } = await params;
  const match = shardFile.exec(String(file));
  if (!match) return targetTextsNotFound();

  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;

  const installed = await installedTargetTextShard({
    locale: String(locale),
    shard: match[1],
  });
  if (!installed) return targetTextsNotFound();
  let info;
  try {
    info = await stat(installed.path);
  } catch {
    return targetTextsNotFound();
  }
  if (!info.isFile() || info.size !== installed.bytes)
    return targetTextsNotFound();

  const etag = `"sha256-${installed.sha256}"`;
  const header = request.headers.get("if-none-match");
  if (header?.split(",").some((candidate) => candidate.trim() === etag))
    return new Response(null, { status: 304, headers: { ETag: etag } });
  return packFileResponse(request, {
    body: { path: installed.path, size: installed.bytes },
    etag,
    contentType: "application/json",
  });
}
