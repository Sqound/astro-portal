/**
 * The field image of a target: the survey around it at the true field of
 * an eyepiece (the full-field rendering), so the eyepiece view
 * draws sky from edge to edge instead of the target's square thumbnail on a
 * grey disc.
 *
 * The portal cuts it once, processes it the way the visual preview
 * thumbnails are processed (`scripts/import-visual-preview-images.mjs`:
 * grey levels, brightness 58 %, contrast -15 %), keeps it on disk and serves
 * it immutable: the application never calls the CDS itself (the person's
 * address, the CDS's outages, its data-use terms), and two plans whose
 * fields round to the same value share one image (`eyepieceFieldImage` in
 * `packages/planner/src/eyepiece-view.js` asks for the E24 values only).
 *
 * The cut: hips2fits on the CDS's two hosts, as the importer of the
 * thumbnails does (same survey, TAN, 512 px, `asinh`); when neither
 * answers, the portal cuts the field itself from the tiles of the same
 * HiPS (`cutout.js`), the ESAC mirror first, with the tone curve fitted on
 * hips2fits (`tone.js`). No image is ever made up: a field nobody could cut
 * answers `unavailable` and the application keeps the thumbnail.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { cutoutOrder, hipsCutout, hipsTilePath } from "./cutout.js";
import { hips2fitsToneCurves } from "./tone.js";

// ------------------------------------------------------------ configuration
// The same resolution as `sky-tiles/mirror.js`: this package never imports
// the application's `config.server.js`.

export function targetFieldImageDirectory() {
  const explicit = process.env.ASTRO_PORTAL_TARGET_FIELD_IMAGE_DIR;
  if (explicit) return resolve(explicit);
  const serviceDirectory = resolve(
    process.env.ASTRO_PORTAL_SERVICE_DIR || process.cwd(),
  );
  const runtimeDirectory = resolve(
    process.env.ASTRO_PORTAL_RUNTIME_DIR ||
      join(serviceDirectory, ".astro-portal"),
  );
  return join(runtimeDirectory, "target-field-images");
}

/** `ASTRO_PORTAL_TARGET_FIELD_IMAGES=off`: the lever of an instance that
 * has not settled the DSS data-use question for these derived images (the
 * same as `ASTRO_PORTAL_SKY_TILE_MIRROR=off` for the tiles). */
export function targetFieldImagesEnabled() {
  return process.env.ASTRO_PORTAL_TARGET_FIELD_IMAGES !== "off";
}

/** The survey, its hips2fits hosts and the roots of its tiles. */
export const targetFieldImageSurvey = Object.freeze({
  hipsId: "CDS/P/DSS2/color",
  hips2fitsEndpoints: Object.freeze([
    "https://alasky.cds.unistra.fr/hips-image-services/hips2fits",
    "https://alaskybis.cds.unistra.fr/hips-image-services/hips2fits",
  ]),
  // The ESAC mirror first: the cutout is only made when hips2fits did not
  // answer, and then the CDS's own tile hosts rarely do either.
  // `properties` of the ESAC root: creator_did ivo://CDS/P/DSS2/color,
  // order 9, 512 px JPEG tiles (read 2026-10-29).
  tileRoots: Object.freeze([
    "https://skies.esac.esa.int/DSSColor/",
    "https://alasky.cds.unistra.fr/DSS/DSSColor/",
    "https://alaskybis.cds.unistra.fr/DSS/DSSColor/",
  ]),
  credit: "Simulation visuelle · DSS2",
  license: "DSS data-use terms; commercial use requires a license",
});

/** The side, in pixels, of a field image (the thumbnails' own). */
export const targetFieldImageSize = 512;

const userAgentFallback =
  "astro-portal/1.0 (target field image; +https://github.com/sqound/astro-portal)";
const luma = [0.2126, 0.7152, 0.0722];
// ImageMagick's `-colorspace Gray -modulate 58,0,100 -brightness-contrast
// 0x-15` of the visual preview thumbnails is, on a grey level, the line
// 0.4927 x + 19.65 (fitted on the portal's own thumbnails of NGC 7822, M32,
// NGC 7380 and NGC 7635: mean difference 0.3 grey level).
const previewSlope = 0.4927;
const previewIntercept = 19.65;
const previewQuality = 88;

const hostPause = 5 * 60 * 1000;
const failurePause = 60 * 1000;

/** The file name of a target's folder: its id, readable and safe. */
export function targetFieldImageFolder(targetId) {
  const id = String(targetId);
  const safe = id.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
  if (safe === id && !safe.startsWith(".")) return safe;
  const digest = createHash("sha1").update(id).digest("hex").slice(0, 10);
  return `${safe.replace(/^\.+/, "_")}-${digest}`;
}

async function writeAtomically(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content);
  await rename(temporary, path);
}

async function readOrNull(path) {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

/** The strong validator of a field image's bytes. */
export function targetFieldImageEtag(bytes) {
  return `"${createHash("sha1").update(bytes).digest("hex").slice(0, 20)}"`;
}

/**
 * The service. Everything it touches is handed in, for the tests:
 * `directory`, `fetch`, `sharp` (the module), `now`, the survey.
 */
export function createTargetFieldImageService({
  directory = targetFieldImageDirectory(),
  fetch: fetchImpl = globalThis.fetch,
  loadSharp = async () => (await import("sharp")).default,
  survey = targetFieldImageSurvey,
  timeoutMs = Number(process.env.ASTRO_PORTAL_UPSTREAM_TIMEOUT_MS) || 15000,
  userAgent = process.env.ASTRO_PORTAL_UPSTREAM_USER_AGENT || userAgentFallback,
  now = Date.now,
  maximumBuilds = 2,
} = {}) {
  const pausedHosts = new Map();
  const failedFields = new Map();
  const building = new Map();
  let running = 0;
  const queue = [];

  const hostOf = (url) => new URL(url).host;
  const hostPaused = (url) => (pausedHosts.get(hostOf(url)) ?? 0) > now();
  const pauseHost = (url) => pausedHosts.set(hostOf(url), now() + hostPause);

  async function download(url) {
    if (hostPaused(url)) return null;
    try {
      const response = await fetchImpl(url, {
        headers: { "user-agent": userAgent },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        if (response.status >= 500) pauseHost(url);
        return null;
      }
      if (!response.headers.get("content-type")?.startsWith("image/"))
        return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      return bytes.length > 500 ? bytes : null;
    } catch {
      // A host that does not answer at all is left alone for a while, so a
      // page of thumbnails does not wait for it once per image.
      pauseHost(url);
      return null;
    }
  }

  async function rgbOf(sharp, bytes) {
    const { data, info } = await sharp(bytes)
      .removeAlpha()
      .toColourspace("srgb")
      .resize(targetFieldImageSize, targetFieldImageSize, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return info.channels === 3 ? data : null;
  }

  async function fromHips2fits(sharp, { raDegrees, decDegrees, fieldDegrees }) {
    const parameters = new URLSearchParams({
      hips: survey.hipsId,
      format: "jpg",
      ra: String(raDegrees),
      dec: String(decDegrees),
      fov: String(fieldDegrees),
      width: String(targetFieldImageSize),
      height: String(targetFieldImageSize),
      projection: "TAN",
      stretch: "asinh",
    });
    for (const endpoint of survey.hips2fitsEndpoints) {
      const bytes = await download(`${endpoint}?${parameters}`);
      if (bytes) return { rgb: await rgbOf(sharp, bytes), via: endpoint };
    }
    return null;
  }

  async function tile(sharp, order, pix) {
    const relative = hipsTilePath(order, pix);
    const cached = join(directory, "tiles", relative);
    let bytes = await readOrNull(cached);
    if (!bytes)
      for (const root of survey.tileRoots) {
        bytes = await download(`${root}${relative}`);
        if (bytes) {
          await writeAtomically(cached, bytes);
          break;
        }
      }
    if (!bytes) return null;
    const { data, info } = await sharp(bytes)
      .removeAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    return info.width === 512 && info.height === 512 && info.channels === 3
      ? data
      : null;
  }

  async function fromTiles(sharp, { raDegrees, decDegrees, fieldDegrees }) {
    const rgb = await hipsCutout({
      raDegrees,
      decDegrees,
      fieldDegrees,
      size: targetFieldImageSize,
      order: cutoutOrder(fieldDegrees, targetFieldImageSize),
      loadTile: (order, pix) => tile(sharp, order, pix),
    });
    if (!rgb) return null;
    for (let index = 0; index < rgb.length; index += 1)
      rgb[index] = Math.round(hips2fitsToneCurves[index % 3][rgb[index]]);
    return { rgb, via: "tiles" };
  }

  async function preview(sharp, rgb) {
    return sharp(Buffer.from(rgb), {
      raw: {
        width: targetFieldImageSize,
        height: targetFieldImageSize,
        channels: 3,
      },
    })
      .recomb([luma, luma, luma])
      .extractChannel(0)
      .linear(previewSlope, previewIntercept)
      .toColourspace("b-w")
      .jpeg({ quality: previewQuality })
      .toBuffer();
  }

  async function slot(work) {
    if (running >= maximumBuilds)
      await new Promise((resolveSlot) => queue.push(resolveSlot));
    running += 1;
    try {
      return await work();
    } finally {
      running -= 1;
      queue.shift()?.();
    }
  }

  async function build(request, path) {
    const sharp = await loadSharp();
    const cut =
      (await fromHips2fits(sharp, request)) ??
      (await fromTiles(sharp, request));
    if (!cut?.rgb) return null;
    const bytes = await preview(sharp, cut.rgb);
    await writeAtomically(path, bytes);
    return bytes;
  }

  /**
   * The field image of `targetId` at `fieldDegrees` around `raDegrees`,
   * `decDegrees`: `{ status: "ready", bytes, etag }` from the disk or newly
   * cut, or `{ status: "unavailable", retryAfterSeconds }`.
   */
  async function ensure({ targetId, raDegrees, decDegrees, fieldDegrees }) {
    const path = join(
      directory,
      targetFieldImageFolder(targetId),
      `${fieldDegrees}.jpg`,
    );
    const stored = await readOrNull(path);
    if (stored)
      return {
        status: "ready",
        bytes: stored,
        etag: targetFieldImageEtag(stored),
      };
    const failedUntil = failedFields.get(path) ?? 0;
    if (failedUntil > now())
      return {
        status: "unavailable",
        retryAfterSeconds: Math.ceil((failedUntil - now()) / 1000),
      };
    let pending = building.get(path);
    if (!pending) {
      pending = slot(() =>
        build({ raDegrees, decDegrees, fieldDegrees }, path),
      ).finally(() => building.delete(path));
      building.set(path, pending);
    }
    let bytes = null;
    try {
      bytes = await pending;
    } catch {
      bytes = null;
    }
    if (!bytes) {
      failedFields.set(path, now() + failurePause);
      return {
        status: "unavailable",
        retryAfterSeconds: failurePause / 1000,
      };
    }
    return { status: "ready", bytes, etag: targetFieldImageEtag(bytes) };
  }

  return { ensure, directory };
}

let defaultService = null;

/** The process's one service (its caches and pauses are shared). */
export function targetFieldImageService() {
  if (!defaultService) defaultService = createTargetFieldImageService();
  return defaultService;
}

/** Test seam: drop the memoised service after changing the environment. */
export function resetTargetFieldImageService() {
  defaultService = null;
}
