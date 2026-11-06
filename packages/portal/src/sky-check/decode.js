/**
 * The pixels the sky check looks at, bounded: one grey plane reduced to
 * about `longSide` pixels on its long side, and, for a raster image, a
 * small colour thumbnail.
 *
 * - A raster image (JPEG, PNG, WebP, AVIF, TIFF) is decoded with `sharp`,
 *   loaded only when a file is decoded (`await import`), never at start.
 * - A FITS file's primary data unit is read like Astro Sync reads it
 *   (`analysis/sky.rs`, `read_fits_image`): integer or float `BITPIX`,
 *   `BZERO`/`BSCALE`, a colour sensor's raw frame (`BAYERPAT`) summed into
 *   2 × 2 superpixels; then binned on the fly, row by row, so the whole
 *   frame is never held in memory. A tile-compressed file or an empty
 *   primary unit is not read.
 */

import { open } from "node:fs/promises";
import { fitsAcquisitionFacts, fitsNumber } from "./fits-header.js";

export class DecodeError extends Error {
  constructor(reason, message) {
    super(message || reason);
    this.reason = reason;
  }
}

/** The grey plane of a raster image and its colour thumbnail. */
export async function decodeRaster(
  path,
  { longSide, maxPixels, timeoutSeconds },
) {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    throw new DecodeError("unreadable", "sharp is not installed");
  }
  const options = {
    limitInputPixels: maxPixels,
    sequentialRead: true,
    failOn: "none",
    pages: 1,
  };
  let metadata;
  try {
    metadata = await sharp(path, options).metadata();
  } catch (error) {
    const text = String(error?.message || error);
    if (/pixel limit/i.test(text)) throw new DecodeError("too_large", text);
    throw new DecodeError("unreadable", text);
  }
  if (!metadata.width || !metadata.height) throw new DecodeError("unreadable");
  if (metadata.width * metadata.height > maxPixels)
    throw new DecodeError("too_large");
  const deep =
    metadata.depth && metadata.depth !== "uchar" && metadata.depth !== "char";
  const resize = {
    width: longSide,
    height: longSide,
    fit: "inside",
    withoutEnlargement: true,
    kernel: "mitchell",
  };
  try {
    const grey = await sharp(path, options)
      .timeout({ seconds: timeoutSeconds })
      .resize(resize)
      .toColourspace(deep ? "grey16" : "b-w")
      .raw(deep ? { depth: "ushort" } : {})
      .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = grey.info;
    const sixteen = grey.info.depth === "ushort";
    const count = width * height;
    const bytes = Buffer.from(grey.data);
    const source = sixteen
      ? new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2)
      : bytes;
    if (source.length < count * channels) throw new DecodeError("unreadable");
    const pixels = new Float32Array(count);
    for (let index = 0; index < count; index += 1)
      pixels[index] = source[index * channels];
    const saturation = sixteen ? 65535 : 255;
    const colour = await sharp(path, options)
      .timeout({ seconds: timeoutSeconds })
      .resize({ width: 256, height: 256, fit: "inside", kernel: "nearest" })
      .removeAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      frame: {
        width,
        height,
        pixels,
        saturation,
        noiseFloor: (0.5 * saturation) / 255,
      },
      thumbnail: {
        width: colour.info.width,
        height: colour.info.height,
        channels: colour.info.channels,
        data: colour.data,
      },
      source: {
        width: metadata.width,
        height: metadata.height,
        depth: metadata.depth || "uchar",
      },
    };
  } catch (error) {
    if (error instanceof DecodeError) throw error;
    const text = String(error?.message || error);
    if (/timeout/i.test(text)) throw new DecodeError("too_slow", text);
    throw new DecodeError("unreadable", text);
  }
}

const BYTES_PER_VALUE = { 8: 1, 16: 2, 32: 4, [-32]: 4, 64: 8, [-64]: 8 };

/**
 * The grey plane of a FITS file's primary data unit, binned so that its
 * long side is at most `longSide` (after the 2 × 2 superpixels of a colour
 * sensor's raw frame). The planes of a cube (a colour stack, up to four
 * planes) are summed.
 */
export async function decodeFits(
  path,
  header,
  { longSide, maxPixels, deadline },
) {
  const facts = fitsAcquisitionFacts(header.cards);
  if (facts.tileCompressed)
    throw new DecodeError("unreadable", "tile-compressed");
  if (!facts.axes) throw new DecodeError("unreadable", "empty primary unit");
  const bytesPerValue = BYTES_PER_VALUE[facts.bitpix];
  if (!bytesPerValue) throw new DecodeError("unreadable", "unsupported BITPIX");
  const width = facts.width;
  const height = facts.height;
  const planes = facts.planes;
  if (
    !(width > 0 && height > 0) ||
    facts.axes > 3 ||
    !(planes >= 1 && planes <= 4)
  )
    throw new DecodeError("unreadable", "not a two-dimensional image");
  if (width * height * planes > maxPixels) throw new DecodeError("too_large");
  const bzero = fitsNumber(header.cards, "BZERO") ?? 0;
  const bscale = fitsNumber(header.cards, "BSCALE") ?? 1;
  const superpixel = facts.bayer ? 2 : 1;
  const baseWidth = Math.floor(width / superpixel);
  const baseHeight = Math.floor(height / superpixel);
  const bin = Math.max(
    1,
    Math.ceil(Math.max(baseWidth, baseHeight) / longSide),
  );
  const outWidth = Math.floor(baseWidth / bin);
  const outHeight = Math.floor(baseHeight / bin);
  if (!outWidth || !outHeight) throw new DecodeError("unreadable", "too small");
  const step = superpixel * bin;
  const pixels = new Float32Array(outWidth * outHeight);
  const rowBytes = width * bytesPerValue;
  const handle = await open(path, "r");
  let maximum = -Infinity;
  let minimum = Infinity;
  try {
    const { size } = await handle.stat();
    if (size < header.dataOffset + rowBytes * height * planes)
      throw new DecodeError("unreadable", "truncated data unit");
    const block = Buffer.alloc(rowBytes * step);
    for (let plane = 0; plane < planes; plane += 1) {
      for (let outRow = 0; outRow < outHeight; outRow += 1) {
        if (performance.now() > deadline) throw new DecodeError("too_slow");
        const position =
          header.dataOffset + (plane * height + outRow * step) * rowBytes;
        const { bytesRead } = await handle.read(
          block,
          0,
          block.length,
          position,
        );
        if (bytesRead < block.length)
          throw new DecodeError("unreadable", "truncated");
        for (let dy = 0; dy < step; dy += 1) {
          const rowStart = dy * rowBytes;
          for (let outColumn = 0; outColumn < outWidth; outColumn += 1) {
            let sum = 0;
            for (let dx = 0; dx < step; dx += 1) {
              const at = rowStart + (outColumn * step + dx) * bytesPerValue;
              let raw;
              switch (facts.bitpix) {
                case 8:
                  raw = block[at];
                  break;
                case 16:
                  raw = block.readInt16BE(at);
                  break;
                case 32:
                  raw = block.readInt32BE(at);
                  break;
                case 64:
                  raw = Number(block.readBigInt64BE(at));
                  break;
                case -32:
                  raw = block.readFloatBE(at);
                  break;
                default:
                  raw = block.readDoubleBE(at);
              }
              const value = bzero + bscale * raw;
              if (Number.isFinite(value)) {
                sum += value;
                if (value > maximum) maximum = value;
                if (value < minimum) minimum = value;
              }
            }
            pixels[outRow * outWidth + outColumn] += sum;
          }
        }
      }
    }
  } finally {
    await handle.close();
  }
  // Bring the plane to a non-negative scale whose saturation is the
  // brightest summed pixel (a float frame has no fixed full scale).
  const summed = step * step * planes;
  for (let index = 0; index < pixels.length; index += 1)
    pixels[index] -= minimum * summed;
  const integer = facts.bitpix > 0;
  const saturation = Math.max(1e-9, (maximum - minimum) * summed);
  return {
    frame: {
      width: outWidth,
      height: outHeight,
      pixels,
      saturation,
      noiseFloor: integer ? 0.5 * Math.max(1, bscale) : 1e-9,
    },
    thumbnail: null,
    source: {
      width,
      height,
      depth: `bitpix${facts.bitpix}`,
      planes,
      bayer: facts.bayer,
      bin,
    },
  };
}
