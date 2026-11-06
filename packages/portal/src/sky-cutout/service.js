/**
 * A square cutout of a mirrored survey (`GET /v1/sky-cutout`): the TAN
 * projection hips2fits makes, north up and east left, cut by the portal from
 * the tiles of its own mirror (`../sky-tiles/mirror.js`), so it shares their
 * cache, their upstream roots (ESASky last for `dss-colour`) and their
 * breakers. The pixels are the tiles' own: no tone curve (unlike the field
 * image of `../target-field-image/`, which imitates hips2fits's `asinh`).
 *
 * A complete cutout (every tile it needed was read) is kept on disk and
 * served immutable; a partial one (a tile missing) is served once and never
 * kept; one with no tile at all answers `unavailable`. A `dss2-red` cutout
 * with no tile at all (the CDS's hosts, its only roots, down and nothing
 * cached) falls back on `dss-colour`, and says so (`surveyId`).
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { skyTileMirror } from "../sky-tiles/mirror.js";
import { skyBackdropSurveys } from "../sky-tiles/surveys.js";
import { cutoutOrder, hipsCutout } from "../target-field-image/cutout.js";

/** The side, in pixels, of every cutout. */
export const skyCutoutSize = 640;

/** The field's bounds, in degrees (the side of the square). */
export const skyCutoutFieldBounds = Object.freeze({
  minimum: 0.02,
  maximum: 20,
});

/** The surveys a cutout is cut from, and where `dss2-red` falls back. */
export const skyCutoutSurveyIds = Object.freeze(["dss-colour", "dss2-red"]);
const fallbackSurveyId = Object.freeze({ "dss2-red": "dss-colour" });

const jpegQuality = 88;

// The same resolution as `sky-tiles/mirror.js`: this package never imports
// the application's `config.server.js`.
export function skyCutoutDirectory() {
  const explicit = process.env.ASTRO_PORTAL_SKY_CUTOUT_DIR;
  if (explicit) return resolve(explicit);
  const serviceDirectory = resolve(
    process.env.ASTRO_PORTAL_SERVICE_DIR || process.cwd(),
  );
  const runtimeDirectory = resolve(
    process.env.ASTRO_PORTAL_RUNTIME_DIR ||
      join(serviceDirectory, ".astro-portal"),
  );
  return join(runtimeDirectory, "sky-cutouts");
}

const decimalsOf = (step) => Math.max(0, Math.round(-Math.log10(step)));

/**
 * The request as the cache keys it: the field to three significant digits,
 * the centre to the power of ten at or under one output pixel, the right
 * ascension in [0, 360). `null` for a value out of bounds.
 */
export function skyCutoutRequest({ surveyId, raDegrees, decDegrees, fov }) {
  if (!skyCutoutSurveyIds.includes(surveyId)) return null;
  const ra = Number(raDegrees);
  const dec = Number(decDegrees);
  const field = Number(fov);
  if (![ra, dec, field].every(Number.isFinite)) return null;
  if (ra < 0 || ra > 360 || dec < -90 || dec > 90) return null;
  if (
    field < skyCutoutFieldBounds.minimum ||
    field > skyCutoutFieldBounds.maximum
  )
    return null;
  const fieldDegrees = Number(field.toPrecision(3));
  const step = 10 ** Math.floor(Math.log10(fieldDegrees / skyCutoutSize));
  const digits = decimalsOf(step);
  const round = (value) =>
    Number((Math.round(value / step) * step).toFixed(digits));
  const wrapped = round(ra) % 360;
  return {
    surveyId,
    raDegrees: wrapped < 0 ? wrapped + 360 : wrapped,
    decDegrees: Math.max(-90, Math.min(90, round(dec))),
    fieldDegrees,
    digits,
  };
}

/** The cache file of a request, under the survey and the field. */
export function skyCutoutRelativePath(request) {
  const { surveyId, raDegrees, decDegrees, fieldDegrees, digits } = request;
  return join(
    surveyId,
    String(fieldDegrees),
    `${raDegrees.toFixed(digits)}_${decDegrees.toFixed(digits)}.jpg`,
  );
}

/** The strong validator of a cutout's bytes. */
export function skyCutoutEtag(bytes) {
  return `"${createHash("sha1").update(bytes).digest("hex").slice(0, 20)}"`;
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

/**
 * The service. Everything it touches is handed in, for the tests:
 * `directory`, `mirror` (a `createSkyTileMirror` instance), `surveys` (the
 * mirror's table), `sharp` (the module).
 */
export function createSkyCutoutService({
  directory = skyCutoutDirectory(),
  mirror = null,
  surveys = skyBackdropSurveys,
  loadSharp = async () => (await import("sharp")).default,
  maximumBuilds = 2,
} = {}) {
  const building = new Map();
  let running = 0;
  const queue = [];
  const mirrorOf = () => mirror ?? skyTileMirror();

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

  // One tile's RGB pixels, or `null` (with the mirror's delay noted) when
  // the mirror could not have it.
  async function tile(sharp, survey, order, pix, outcome) {
    const result = await mirrorOf().ensureTile({
      survey,
      order,
      pix,
      extension: survey.format,
    });
    const bytes =
      result.status === "ready" ? await readOrNull(result.path) : null;
    if (!bytes) {
      outcome.missing += 1;
      if (result.retryAfterSeconds)
        outcome.retryAfterSeconds = Math.max(
          outcome.retryAfterSeconds,
          result.retryAfterSeconds,
        );
      return null;
    }
    try {
      const { data, info } = await sharp(bytes)
        .removeAlpha()
        .toColourspace("srgb")
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (
        info.width === survey.tileWidth &&
        info.height === survey.tileWidth &&
        info.channels === 3
      )
        return data;
    } catch {
      // An unreadable tile counts as a missing one.
    }
    outcome.missing += 1;
    return null;
  }

  async function cut(sharp, request) {
    const survey = surveys[request.surveyId];
    if (!survey) return null;
    const outcome = { missing: 0, retryAfterSeconds: 0 };
    const rgb = await hipsCutout({
      raDegrees: request.raDegrees,
      decDegrees: request.decDegrees,
      fieldDegrees: request.fieldDegrees,
      size: skyCutoutSize,
      order: cutoutOrder(request.fieldDegrees, skyCutoutSize, {
        maximumOrder: survey.maxOrder,
      }),
      loadTile: (order, pix) => tile(sharp, survey, order, pix, outcome),
      parallelLoads: true,
    });
    if (!rgb) return { rgb: null, ...outcome };
    return { rgb, ...outcome };
  }

  async function encode(sharp, rgb) {
    return sharp(Buffer.from(rgb), {
      raw: { width: skyCutoutSize, height: skyCutoutSize, channels: 3 },
    })
      .jpeg({ quality: jpegQuality })
      .toBuffer();
  }

  async function build(request) {
    const path = join(directory, skyCutoutRelativePath(request));
    const stored = await readOrNull(path);
    if (stored) return { status: "ready", complete: true, bytes: stored };
    const sharp = await loadSharp();
    const result = await slot(() => cut(sharp, request));
    if (!result?.rgb)
      return {
        status: "unavailable",
        retryAfterSeconds: result?.retryAfterSeconds || 60,
      };
    const bytes = await encode(sharp, result.rgb);
    const complete = result.missing === 0;
    if (complete) await writeAtomically(path, bytes);
    return { status: "ready", complete, bytes };
  }

  async function single(request) {
    const key = skyCutoutRelativePath(request);
    let pending = building.get(key);
    if (!pending) {
      pending = build(request).finally(() => building.delete(key));
      building.set(key, pending);
    }
    return pending;
  }

  /**
   * The cutout of `request` (`skyCutoutRequest`'s answer):
   * `{ status: "ready", bytes, etag, complete, surveyId, fallback }` or
   * `{ status: "unavailable", retryAfterSeconds }`.
   */
  async function ensure(request) {
    let surveyId = request.surveyId;
    let result = await single(request);
    const fallback = fallbackSurveyId[surveyId];
    if (result.status !== "ready" && fallback) {
      const second = await single({ ...request, surveyId: fallback });
      if (second.status === "ready") {
        result = second;
        surveyId = fallback;
      }
    }
    if (result.status !== "ready") return result;
    return {
      ...result,
      surveyId,
      fallback: surveyId !== request.surveyId,
      etag: skyCutoutEtag(result.bytes),
    };
  }

  return { ensure, directory };
}

let defaultService = null;

/** The process's one service (its single flights are shared). */
export function skyCutoutService() {
  if (!defaultService) defaultService = createSkyCutoutService();
  return defaultService;
}

/** Test seam: drop the memoised service after changing the environment. */
export function resetSkyCutoutService() {
  defaultService = null;
}
