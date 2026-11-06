/**
 * « Is this an image of the sky or of a landscape, and is anybody in it? »
 * — the automatic check of a capture, run alone and cheaply on the server,
 * with four outcomes (`rule.js`):
 *
 * - `sky`: the sky or a landscape, publishable at once;
 * - `person`: a person seems to be in the image (stored `undetermined`,
 *   reason `person_detected`): the team looks first;
 * - `undetermined`: a calibration frame, a raw file, a file that could not
 *   be read, or neither a sky nor a landscape with enough confidence: the
 *   team looks first;
 * - `other`: painted (a screenshot, a document, a drawing).
 *
 * The header is read from the file's first bytes; the pixels are decoded
 * only for a raster image `rasterImageTypeOf` recognises or a FITS file
 * whose primary data unit can be read, bounded in size and in time (a file
 * beyond the bound is `undetermined`, with its reason). A raster image is
 * also shown to the person detector (`person-detection.js`). With the
 * setting `ASTRO_PORTAL_SKY_CHECK=off`, every file is `undetermined`.
 *
 * The processing of the captures (`captures/capture-processing.js`) runs it
 * after each upload; it never enters the static import graph of
 * `server.mjs` (`sharp` is loaded only when a file is decoded, ONNX Runtime
 * and the model only when an image is shown to the detector).
 */

import { open, stat } from "node:fs/promises";
import { extname } from "node:path";
import { rasterImageTypeOf, readFileHead } from "../uploads/media-type.js";
import { DecodeError, decodeFits, decodeRaster } from "./decode.js";
import {
  FITS_BLOCK_BYTES,
  FITS_MAX_HEADER_BLOCKS,
  fitsAcquisitionFacts,
  fitsCelestialWcs,
  isFitsHead,
  parseFitsHeader,
} from "./fits-header.js";
import {
  RAW_EXTENSIONS,
  metadataSignals,
  readImageMetadata,
} from "./image-metadata.js";
import { thumbnailStatistics } from "./image-statistics.js";
import {
  SKY_CHECK_RULE_VERSION,
  decideSkyCheck,
  starsLookLikeTheSky,
} from "./rule.js";
import { detectStars } from "./star-detection.js";
import {
  XISF_MAX_HEADER_BYTES,
  isXisfHead,
  parseXisfHeader,
} from "./xisf-header.js";

export { SKY_CHECK_RULE_VERSION, decideSkyCheck } from "./rule.js";
export { SKY_CHECK_REASONS } from "./rule.js";

/** The bounds and the mode, overridable one by one through `settings`. */
export const SKY_CHECK_DEFAULTS = Object.freeze({
  mode: "auto",
  /** The long side of the grey plane the stars are found on. */
  longSide: 2000,
  /** Pixels of the source image (or FITS plane × planes) decoded at most. */
  maxPixels: 120_000_000,
  /** Bytes of a file whose pixels are read at most. */
  maxFileBytes: 256 * 1024 * 1024,
  /** Wall-clock time of one check at most, milliseconds. */
  timeLimitMs: 15_000,
  /** Whether people are looked for (off: no photograph passes as a landscape). */
  people: true,
  /** The tiles of the person detector (an 832-pixel copy in four). */
  personTiles: true,
  /** The person score from which the tiles are not looked at. */
  personStopAt: 0.5,
  /** Another copy of the person detector's model (tests). */
  personModelPath: undefined,
});

/** The settings from the environment (`ASTRO_PORTAL_SKY_CHECK`: `auto` · `off`). */
export function skyCheckSettingsFromEnv(env = process.env) {
  const value = String(env.ASTRO_PORTAL_SKY_CHECK || "auto")
    .trim()
    .toLowerCase();
  return { mode: value === "off" ? "off" : "auto" };
}

/** A random-access reader over an open file. */
function fileReader(handle, size) {
  return {
    size,
    async readAt(offset, length) {
      const start = Math.max(0, offset);
      const bounded = Math.max(0, Math.min(length, size - start));
      const buffer = Buffer.alloc(bounded);
      if (!bounded) return buffer;
      const { bytesRead } = await handle.read(buffer, 0, bounded, start);
      return buffer.subarray(0, bytesRead);
    },
  };
}

async function readBytes(path, length) {
  return readFileHead(path, length);
}

/** The numbers the verdict keeps from a star detection. */
function starSignals(detection) {
  if (!detection) return null;
  const round = (value, digits = 3) =>
    value === null || value === undefined || !Number.isFinite(value)
      ? null
      : Number(value.toFixed(digits));
  return {
    starCount: detection.starCount,
    starsPerMegapixel: round(detection.starsPerMegapixel, 1),
    fineCellCoverage: round(detection.fineCellCoverage),
    coarseCellCoverage: round(detection.coarseCellCoverage),
    cellDensityFloor: round(detection.cellDensityFloor),
    stripDensityFloor: round(detection.stripDensityFloor),
    emptyCellFraction: round(detection.emptyCellFraction),
    medianWidthPixels: round(detection.medianWidthPixels, 2),
    medianElongation: round(detection.medianElongation, 2),
    backgroundLevel: round(detection.backgroundLevel, 4),
    noiseLevel: round(detection.noiseLevel, 5),
    cloudFraction: round(detection.cloudFraction),
    hotPixelsRejected: detection.hotPixelsRejected,
    blobsRejected: detection.blobsRejected,
    extendedGroups: detection.extendedGroups,
    extendedAreaFraction: round(detection.extendedAreaFraction, 4),
    maskedFraction: round(detection.maskedFraction, 4),
    widthSpread: round(detection.widthSpread),
    profileSpread: round(detection.profileSpread),
    texturedTileFraction: round(detection.texturedTileFraction),
    topHalfStarShare: round(detection.topHalfStarShare),
  };
}

/**
 * The person detector, loaded by its package name at run time: never
 * bundled with the routes (Next.js would bundle ONNX Runtime and lose the
 * model next to this package), always this package's own file, which finds
 * its model in `models/` beside `dist/`.
 */
const PERSON_DETECTION_MODULE = "portal/sky-check/person-detection.js";

/**
 * What the person detector says of a raster image (`person-detection.js`),
 * rounded; `{ available: false, reason }` when it cannot run, `null` when
 * it is switched off. A failure of the detector never fails the check: it
 * is a signal, and the rule then lets no photograph pass as a landscape.
 */
async function peopleSignals(path, settings, deadline) {
  if (!settings.people) return null;
  try {
    const sharp = (await import("sharp")).default;
    const { detectPeople } = await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ PERSON_DETECTION_MODULE
    );
    const found = await detectPeople(path, {
      sharp,
      maxPixels: settings.maxPixels,
      timeoutSeconds: Math.max(
        1,
        Math.ceil((deadline - performance.now()) / 1000),
      ),
      modelPath: settings.personModelPath,
      tiles: settings.personTiles,
      stopAt: settings.personStopAt,
      deadline,
    });
    if (!found.available) return found;
    return {
      available: true,
      personScore: Number(found.personScore.toFixed(3)),
      personAreaFraction: Number(found.personAreaFraction.toFixed(4)),
      personCount: found.personCount,
      classes: roundAll(found.classes, 3),
      views: found.views,
      milliseconds: found.milliseconds,
    };
  } catch (error) {
    return {
      available: false,
      reason: String(error?.message || error).slice(0, 80),
    };
  }
}

function roundAll(object, digits = 4) {
  if (!object) return null;
  return Object.fromEntries(
    Object.entries(object).map(([key, value]) => [
      key,
      typeof value === "number" ? Number(value.toFixed(digits)) : value,
    ]),
  );
}

/**
 * Gathers the signals of one file: its format, its header facts, its
 * metadata classes and, when its pixels are decoded, its stars and its
 * colours. Never throws: a failure is a signal (`failure`).
 */
async function gatherSignals(
  { path, originalName, byteSize },
  settings,
  deadline,
) {
  const extension = extname(String(originalName || path || ""))
    .slice(1)
    .toLowerCase();
  const signals = {
    format: "unknown",
    extension: extension || null,
    byteSize: byteSize ?? null,
    frameKind: null,
    celestialWcs: false,
    acquisition: null,
    metadata: null,
    stars: null,
    thumbnail: null,
    people: null,
    decoded: null,
    failure: null,
  };
  let head;
  try {
    head = await readBytes(path, FITS_BLOCK_BYTES * FITS_MAX_HEADER_BLOCKS);
  } catch {
    signals.failure = "unreadable";
    return signals;
  }
  if (!head.length) {
    signals.failure = "unreadable";
    return signals;
  }
  let size = byteSize ?? null;
  if (size === null) {
    try {
      size = (await stat(path)).size;
    } catch {
      size = null;
    }
  }

  if (isFitsHead(head)) {
    signals.format = "fits";
    const header = parseFitsHeader(head);
    if (!header.ok) {
      signals.failure = "unreadable";
      return signals;
    }
    const facts = fitsAcquisitionFacts(header.cards);
    signals.frameKind = facts.frameKind;
    signals.celestialWcs = Boolean(fitsCelestialWcs(header.cards));
    signals.acquisition = {
      exposureClass:
        facts.exposureSeconds === null
          ? "none"
          : facts.exposureSeconds < 1
            ? "short"
            : "long",
      hasObject: facts.hasObject,
      hasTelescope: facts.hasTelescope,
      hasInstrument: facts.hasInstrument,
      hasPointing: facts.hasPointing,
      bayer: facts.bayer,
    };
    // A calibration frame or a solved frame is answered from its header:
    // the pixels add nothing.
    if (signals.frameKind && signals.frameKind !== "light") return signals;
    if (signals.celestialWcs) return signals;
    if (size !== null && size > settings.maxFileBytes) {
      signals.failure = "too_large";
      return signals;
    }
    try {
      const started = performance.now();
      const decoded = await decodeFits(path, header, {
        longSide: settings.longSide,
        maxPixels: settings.maxPixels,
        deadline,
      });
      const detection = detectStars(decoded.frame, {}, deadline);
      if (detection.timedOut) {
        signals.failure = "too_slow";
        return signals;
      }
      signals.stars = starSignals(detection);
      signals.decoded = {
        width: decoded.frame.width,
        height: decoded.frame.height,
        milliseconds: Math.round(performance.now() - started),
      };
    } catch (error) {
      signals.failure =
        error instanceof DecodeError ? error.reason : "unreadable";
    }
    return signals;
  }

  if (isXisfHead(head)) {
    signals.format = "xisf";
    const length = head.readUInt32LE(8);
    if (length > XISF_MAX_HEADER_BYTES) {
      signals.failure = "too_large";
      return signals;
    }
    let bytes = head;
    if (head.length < 16 + length) {
      try {
        bytes = await readBytes(path, 16 + length);
      } catch {
        signals.failure = "unreadable";
        return signals;
      }
    }
    const header = parseXisfHeader(bytes);
    if (!header.ok) {
      signals.failure = "unreadable";
      return signals;
    }
    signals.frameKind = header.frameKind;
    signals.celestialWcs = header.astrometric;
    return signals;
  }

  const type = rasterImageTypeOf(head);
  const tiffLike =
    head.length >= 4 &&
    (head.toString("latin1", 0, 2) === "II" ||
      head.toString("latin1", 0, 2) === "MM");
  if (!type && !tiffLike) return signals;

  let handle;
  try {
    handle = await open(path, "r");
    const { size: fileSize } = await handle.stat();
    const metadata = await readImageMetadata(fileReader(handle, fileSize), {
      type: type ?? null,
      extension,
    });
    signals.metadata = metadataSignals(metadata);
  } catch {
    signals.metadata = null;
  } finally {
    await handle?.close();
  }

  if (signals.metadata?.raw || RAW_EXTENSIONS.has(extension)) {
    signals.format = "raw";
    return signals;
  }
  if (!type) return signals;
  signals.format = "raster";
  if (size !== null && size > settings.maxFileBytes) {
    signals.failure = "too_large";
    return signals;
  }
  try {
    const started = performance.now();
    const remaining = Math.max(
      1,
      Math.ceil((deadline - performance.now()) / 1000),
    );
    const decoded = await decodeRaster(path, {
      longSide: settings.longSide,
      maxPixels: settings.maxPixels,
      timeoutSeconds: remaining,
    });
    if (performance.now() > deadline) {
      signals.failure = "too_slow";
      return signals;
    }
    const detection = detectStars(decoded.frame, {}, deadline);
    if (detection.timedOut) {
      signals.failure = "too_slow";
      return signals;
    }
    signals.stars = starSignals(detection);
    signals.thumbnail = roundAll(thumbnailStatistics(decoded.thumbnail));
    // A field of stars is looked at whole only: its tiles would only show
    // more stars, and take the time of four more looks.
    signals.people = await peopleSignals(
      path,
      {
        ...settings,
        personTiles: settings.personTiles && !starsLookLikeTheSky(signals),
      },
      deadline,
    );
    signals.decoded = {
      width: decoded.frame.width,
      height: decoded.frame.height,
      milliseconds: Math.round(performance.now() - started),
    };
  } catch (error) {
    signals.failure =
      error instanceof DecodeError ? error.reason : "unreadable";
  }
  return signals;
}

/**
 * Checks one capture file. `settings` overrides `SKY_CHECK_DEFAULTS` (and
 * `mode: "off"` answers `undetermined` for every file without reading
 * it). Answers the verdict that is stored:
 *
 * `{ result, reason, outcome, checkedAt, ruleVersion, signals,
 * milliseconds }` — `result` is `sky`, `undetermined` or `other`
 * (`captures.auto_check`), `reason` a machine key (`auto_check_reason`),
 * `outcome` one of the four of the rule (`person` is stored as
 * `undetermined`, `person_detected`), `checkedAt` an ISO time
 * (`auto_check_at`); `signals` are the figures behind the result, for the
 * evidence only.
 */
export async function checkCaptureFile({
  path,
  originalName,
  byteSize,
  settings,
} = {}) {
  const resolved = { ...SKY_CHECK_DEFAULTS, ...(settings || {}) };
  const started = performance.now();
  const deadline = started + resolved.timeLimitMs;
  let signals;
  if (resolved.mode === "off") {
    signals = { mode: "off" };
  } else {
    signals = await gatherSignals(
      { path, originalName, byteSize },
      resolved,
      deadline,
    );
    if (!signals.failure && performance.now() > deadline)
      signals.failure = "too_slow";
  }
  const { result, reason, outcome } = decideSkyCheck(signals);
  return {
    result,
    reason,
    outcome,
    checkedAt: new Date().toISOString(),
    ruleVersion: SKY_CHECK_RULE_VERSION,
    signals,
    milliseconds: Math.round(performance.now() - started),
  };
}
