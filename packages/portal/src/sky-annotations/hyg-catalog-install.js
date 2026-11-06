import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * The HYG star catalogue the sky annotations name their stars with, put in
 * place by the server itself (the start of the service, background warm-up
 * `hyg-catalogue`) or by `scripts/install-hyg-catalog.mjs`.
 *
 * HYG v4.1 — David Nash, astronexus.com, https://github.com/astronexus/
 * HYG-Database —, licence CC BY-SA 4.0. The file is fetched from the
 * repository of the catalogue's author at a fixed commit and checked
 * against its SHA-256 before it takes its place: the bytes of another file
 * (a changed upstream, an error page, a cut transfer) are never kept.
 */

/** Where the catalogue is fetched from: the author's repository, one commit. */
export const HYG_CATALOG_URL =
  "https://raw.githubusercontent.com/astronexus/HYG-Database/e4fd9c95381c6b5f34e465259cb4d2e1a7ff2e09/hyg/CURRENT/hygdata_v41.csv";
/** The SHA-256 of `hygdata_v41.csv` at that commit. */
export const HYG_CATALOG_SHA256 =
  "d9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd";
export const HYG_CATALOG_BYTES = 33_932_548;
export const HYG_CATALOG_LICENCE =
  "HYG Database v4.1, David Nash (astronexus.com), CC BY-SA 4.0";

/** `ASTRO_PORTAL_HYG_DOWNLOAD=off` keeps the server from fetching the file. */
export function hygDownloadEnabled(env = process.env) {
  return !/^(?:off|0|false|no)$/i.test(
    String(env.ASTRO_PORTAL_HYG_DOWNLOAD ?? "").trim(),
  );
}

async function sizeOf(path) {
  try {
    const found = await stat(path);
    return found.isFile() ? found.size : null;
  } catch {
    return null;
  }
}

/**
 * Makes sure the catalogue is at `path`. Returns `{ status, ... }`:
 * `"present"` (a file is there; it is the operator's, it is not checked),
 * `"installed"` (fetched, verified, put in place: `bytes`), `"disabled"`
 * (`enabled` false), `"failed"` (`reason`; nothing is left at `path`).
 * Never throws. `force` fetches again over a file already there.
 */
export async function ensureHygCatalog({
  path,
  url = HYG_CATALOG_URL,
  sha256 = HYG_CATALOG_SHA256,
  fetchImplementation = globalThis.fetch,
  enabled = hygDownloadEnabled(),
  force = false,
  timeoutMs = 10 * 60 * 1000,
} = {}) {
  if (!path) return { status: "failed", reason: "no path" };
  if (!force && (await sizeOf(path))) return { status: "present" };
  if (!enabled) return { status: "disabled" };
  // Its own name: two servers sharing a volume may fetch at the same time.
  const partial = `${path}.${randomUUID()}.part`;
  try {
    await mkdir(dirname(path), { recursive: true });
    const response = await fetchImplementation(url, {
      headers: { Accept: "text/csv, text/plain, */*" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok || !response.body)
      throw new Error(`the source answered ${response.status}`);
    const hash = createHash("sha256");
    let bytes = 0;
    await pipeline(
      Readable.fromWeb(response.body),
      new Transform({
        transform(chunk, _encoding, done) {
          hash.update(chunk);
          bytes += chunk.length;
          done(null, chunk);
        },
      }),
      createWriteStream(partial, { mode: 0o644 }),
    );
    const digest = hash.digest("hex");
    if (digest !== sha256)
      throw new Error(
        `the file received (${bytes} bytes) does not have the expected SHA-256`,
      );
    await rename(partial, path);
    return { status: "installed", bytes };
  } catch (error) {
    await rm(partial, { force: true }).catch(() => {});
    return {
      status: "failed",
      reason: error?.cause?.code || error?.message || String(error),
    };
  }
}
