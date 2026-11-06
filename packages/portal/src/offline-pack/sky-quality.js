import { createHash } from "node:crypto";

import { ensureSkyQualityPackRaster } from "../planner/sky-quality.server.js";

const skyQualityPackFileName = "raster.bin";
const skyQualityPackManifestName = "manifest.json";

/**
 * The offline pack's own downloadable light-pollution raster component: the 6'
 * derivation of the installed source raster, lazily produced and disk-memoized by
 * `ensureSkyQualityPackRaster` (`../planner/sky-quality.server.js`). Shared
 * between `GET /v1/offline-pack` (`portal-app/lib/offline-pack.server.js`) and
 * a static pack, which only differ in where the two files this
 * component links to are actually served from — `manifestUrl`/`rasterUrl` default
 * to the live route's own paths and are overridden to the
 * static pack's own relative file paths.
 *
 * Returns `null` (component absent) when there is no source raster installed
 * AND nothing already on disk under `<static-data>/sky-quality/pack/`; the
 * live 2' raster used for the Bortle/SQM estimate is a separate file and is
 * never involved here — an instance (or a static-data package) with an
 * active source raster but no *pack* raster yet derives one on this very
 * call.
 */
export async function skyQualityPackComponent({
  manifestUrl = "/v1/offline-pack/sky-quality/manifest.json",
  rasterUrl = "/v1/offline-pack/sky-quality/raster.bin",
} = {}) {
  const installed = await ensureSkyQualityPackRaster();
  if (!installed) return null;
  const { manifest, raster } = installed;
  // No fixed checksum list: the file is whatever the derivation last wrote, so
  // the digest is computed against the actual bytes every time, exactly like
  // the HiPS archives' own `ETag`.
  const checksum = createHash("sha256").update(raster).digest("hex");
  return {
    id: "sky-quality",
    kind: "file-set",
    required: true,
    revision: `sha256:${checksum}`,
    estimatedBytes: raster.length,
    files: [
      { name: skyQualityPackManifestName, url: manifestUrl },
      {
        name: skyQualityPackFileName,
        url: rasterUrl,
        bytes: raster.length,
        checksum: `sha256:${checksum}`,
      },
    ],
    attribution:
      typeof manifest?.attribution === "string" ? manifest.attribution : null,
    license: typeof manifest?.license === "string" ? manifest.license : null,
    year: Number.isInteger(manifest?.year) ? manifest.year : null,
  };
}
