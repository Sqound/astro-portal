import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import {
  baseMapFileName,
  baseMapPackComponent,
} from "portal/offline-pack/base-map.js";

import { staticDataDir } from "./config.server.js";

/*
 * The offline background of the light-pollution map (`base-map`): Natural Earth 1:10m, public domain, in the `PNEB`
 * layout, installed next to the other static data as
 * `<static data>/base-map/natural-earth.bin`. A portal without the file
 * lists no such component, and a client's map keeps its plain dark
 * background offline, with the way to download it.
 */

export const baseMapUrl = `/v1/offline-pack/base-map/${baseMapFileName}`;

export const baseMapDirectory = () => join(staticDataDir, "base-map");

export const baseMapPath = () => join(baseMapDirectory(), baseMapFileName);

let kept = null;

/**
 * What the installed file is: `{ path, size, checksum, component }`, kept
 * while its size and modification time do not move; `null` when the portal
 * has none. Never more than a `stat` on a request that finds it unchanged.
 */
export async function installedBaseMap() {
  const path = baseMapPath();
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
  kept = {
    path,
    size: info.size,
    mtimeMs: info.mtimeMs,
    checksum,
    component: baseMapPackComponent({ bytes, fileUrl: baseMapUrl }),
  };
  return kept;
}
