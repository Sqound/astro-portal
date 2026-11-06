import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import {
  solveCatalogueFileName,
  solveCataloguePackComponent,
} from "portal/offline-pack/solve-catalogue.js";

import { staticDataDir } from "./config.server.js";

/*
 * The deep star catalogue of the offline pack (`solve-catalogue`; embedded for every profile that can aim, the
 * source credited): one `PSTR` file, installed next to the other static data
 * as `<static data>/solve-catalogue/stars.bin` (built from a copy of HYG
 * v4.1, CC BY-SA 4.0). A portal without the file lists no such component, and
 * a client keeps its telephoto aiming disabled with its reason.
 */

export const solveCatalogueUrl = `/v1/offline-pack/solve-catalogue/${solveCatalogueFileName}`;

export const solveCatalogueDirectory = () =>
  join(staticDataDir, "solve-catalogue");

export const solveCataloguePath = () =>
  join(solveCatalogueDirectory(), solveCatalogueFileName);

let kept = null;

/**
 * What the installed file is: `{ path, size, checksum, component }`, kept
 * while its size and modification time do not move; `null` when the portal
 * has none. Never more than a `stat` on a request that finds it unchanged.
 */
export async function installedSolveCatalogue() {
  const path = solveCataloguePath();
  let info;
  try {
    info = await stat(path);
  } catch {
    kept = null;
    return null;
  }
  if (!info.isFile() || info.size === 0) return null;
  if (kept && kept.size === info.size && kept.mtimeMs === info.mtimeMs)
    return kept;
  let bytes;
  try {
    bytes = await readFile(path);
  } catch {
    return null;
  }
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const starCount = bytes.length >= 12 ? bytes.readUInt32LE(8) : undefined;
  kept = {
    path,
    size: info.size,
    mtimeMs: info.mtimeMs,
    checksum,
    component: solveCataloguePackComponent({
      bytes,
      fileUrl: solveCatalogueUrl,
      starCount,
    }),
  };
  return kept;
}
