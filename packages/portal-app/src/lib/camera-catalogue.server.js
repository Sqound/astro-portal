import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import {
  cameraCatalogueFileName,
  cameraCataloguePackComponent,
  cameraCatalogueSourceFileName,
} from "portal/offline-pack/camera-catalogue.js";

import { staticDataDir } from "./config.server.js";

/*
 * The camera star catalogue of the offline pack (`camera-catalogue`, CAM-3;
 * optional, asked for by the person, the source credited): one `PSTZ` file,
 * installed next to the other static data as
 * `<static data>/camera-catalogue/stars.bin` with its provenance
 * `source.json` (`scripts/build-camera-catalogue.mjs`, Tycho-2, CC BY-NC 3.0
 * IGO). A portal without the file lists no such component; the phone then
 * says the camera's stars are missing.
 */

export const cameraCatalogueUrl = `/v1/offline-pack/camera-catalogue/${cameraCatalogueFileName}`;

export const cameraCatalogueDirectory = () =>
  join(staticDataDir, "camera-catalogue");

export const cameraCataloguePath = () =>
  join(cameraCatalogueDirectory(), cameraCatalogueFileName);

let kept = null;

async function readSource() {
  try {
    const source = JSON.parse(
      await readFile(
        join(cameraCatalogueDirectory(), cameraCatalogueSourceFileName),
        "utf8",
      ),
    );
    return source && typeof source === "object" ? source : null;
  } catch {
    return null;
  }
}

/**
 * What the installed file is: `{ path, size, checksum, component }`, kept
 * while its size and modification time do not move; `null` when the portal
 * has none, or a file that is not a catalogue. Never more than a `stat` on a
 * request that finds it unchanged (the file is 18 MB: read once).
 */
export async function installedCameraCatalogue() {
  const path = cameraCataloguePath();
  let info;
  try {
    info = await stat(path);
  } catch {
    kept = null;
    return null;
  }
  if (!info.isFile() || info.size === 0) return null;
  if (kept && kept.size === info.size && kept.mtimeMs === info.mtimeMs)
    return kept.component ? kept : null;
  let bytes;
  try {
    bytes = await readFile(path);
  } catch {
    return null;
  }
  kept = {
    path,
    size: info.size,
    mtimeMs: info.mtimeMs,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    component: cameraCataloguePackComponent({
      bytes,
      source: await readSource(),
      fileUrl: cameraCatalogueUrl,
    }),
  };
  return kept.component ? kept : null;
}
