import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { optionalDeviceV1Access } from "../../../../../../lib/v1/access.js";
import { v1Error } from "../../../../../../lib/v1/response.js";
import {
  ensureSkyQualityPackRaster,
  skyQualityRasterDirectory,
} from "portal/planner/sky-quality.server.js";
import { packFileResponse } from "portal/offline-pack/file-response.js";

const manifestFileName = "manifest.json";
const rasterFileName = "raster.bin";
// Strict whitelist: exactly these two names, nothing derived from the path
// segment is ever concatenated into a filesystem path.
const allowedFiles = new Map([
  [manifestFileName, "application/json"],
  [rasterFileName, "application/octet-stream"],
]);

function offlinePackSkyQualityNotFound() {
  return v1Error(
    Object.assign(
      new Error(
        "No offline-pack sky-quality raster is installed on this portal.",
      ),
      { code: "offline_pack_sky_quality_not_found", status: 404 },
    ),
  );
}

function ifNoneMatchHits(request, etag) {
  const header = request.headers.get("if-none-match");
  if (!header) return false;
  return header.split(",").some((candidate) => candidate.trim() === etag);
}

/**
 * `GET /v1/offline-pack/sky-quality/manifest.json` and `.../raster.bin`:
 * the two files the `sky-quality` component of `GET /v1/offline-pack`
 * (portal-app/lib/offline-pack.server.js) links to. Guest access, exactly like the
 * manifest route: this is public, portal-wide data, never personal to a
 * device.
 *
 * `ensureSkyQualityPackRaster` (packages/portal/src/planner/sky-quality.server.js)
 * is called here too — not only from the manifest route — so a client that
 * fetches a file route directly (skipping `GET /v1/offline-pack`) still
 * gets a freshly derived pack rather than a stale or missing one.
 *
 * Both responses stream from disk rather than holding the file in memory.
 * `raster.bin` is served `Content-Encoding: gzip` from a precomputed
 * `raster.bin.gz` sitting next to it when the client accepts gzip
 * (`Vary: Accept-Encoding` is always set so a cache never conflates the
 * two); the `ETag` is always the SHA-256 of the UNCOMPRESSED bytes, exactly
 * `sky-quality`'s own `revision`/`files[].checksum` in the manifest, so a
 * client can verify integrity after decompressing regardless of which
 * encoding it received.
 *
 * Both honour `Range` over the uncompressed bytes and carry
 * `Cache-Control: no-transform` — see `packFileResponse`
 * (packages/portal/src/offline-pack/file-response.js): a transforming
 * proxy could otherwise answer a resumption with the whole compressed body.
 */
export async function GET(request, { params }) {
  const { file } = await params;
  const contentType = allowedFiles.get(file);
  if (!contentType) return offlinePackSkyQualityNotFound();

  const access = await optionalDeviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;

  const installed = await ensureSkyQualityPackRaster();
  if (!installed) return offlinePackSkyQualityNotFound();

  const packDirectory = join(skyQualityRasterDirectory(), "pack");

  if (file === manifestFileName) {
    let bytes;
    try {
      bytes = await readFile(join(packDirectory, manifestFileName));
    } catch {
      return offlinePackSkyQualityNotFound();
    }
    const etag = `"sha256-${createHash("sha256").update(bytes).digest("hex")}"`;
    if (ifNoneMatchHits(request, etag))
      return new Response(null, { status: 304, headers: { ETag: etag } });
    return packFileResponse(request, {
      body: { bytes },
      etag,
      contentType,
    });
  }

  // raster.bin — the digest is the pack manifest's own `checksum`
  // (`sha256:<hex>`, computed once at derivation time), falling back to
  // hashing the bytes on the spot only if that field is ever missing or
  // malformed (e.g. a hand-installed pack raster with no manifest checksum).
  const rasterPath = join(packDirectory, rasterFileName);
  let info;
  try {
    info = await stat(rasterPath);
  } catch {
    return offlinePackSkyQualityNotFound();
  }
  const recordedChecksum = installed.manifest?.checksum;
  const digestHex =
    typeof recordedChecksum === "string" &&
    recordedChecksum.startsWith("sha256:")
      ? recordedChecksum.slice("sha256:".length)
      : createHash("sha256")
          .update(await readFile(rasterPath))
          .digest("hex");
  const etag = `"sha256-${digestHex}"`;
  if (ifNoneMatchHits(request, etag))
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, Vary: "Accept-Encoding" },
    });

  let gzip = null;
  try {
    const gzipInfo = await stat(`${rasterPath}.gz`);
    gzip = { path: `${rasterPath}.gz`, size: gzipInfo.size };
  } catch {
    // No precomputed .gz (e.g. a pack raster dropped in by hand): identity
    // only, rather than failing the request.
  }
  const response = packFileResponse(request, {
    body: { path: rasterPath, size: info.size },
    etag,
    contentType,
    gzip,
  });
  // Always, even without a .gz: a cache must never conflate the encodings.
  response.headers.set("Vary", "Accept-Encoding");
  return response;
}
