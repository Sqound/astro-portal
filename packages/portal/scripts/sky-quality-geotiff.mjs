/*
 * Minimal streaming GeoTIFF reader, written for one job: walking a VIIRS
 * Nighttime Lights annual composite (86400 × 33600 float32, EPSG:4326) strip
 * by strip without ever holding the image in memory. It is deliberately not a
 * general GeoTIFF library — it decodes only what GDAL writes for this
 * product and refuses anything else with an explicit message, so a surprise
 * is a clear error rather than silently wrong radiances.
 *
 * Supported: classic TIFF and BigTIFF, little- and big-endian, one sample per
 * pixel, uncompressed / LZW / Deflate / PackBits, predictors 1 (none),
 * 2 (horizontal differencing) and 3 (floating point), strips and tiles,
 * 8/16/32-bit integers and 32/64-bit IEEE floats, GDAL_NODATA.
 *
 * Anything outside that can be normalised first:
 *   gdal_translate -b 1 -co TILED=NO -co COMPRESS=DEFLATE in.tif out.tif
 */
import { open } from "node:fs/promises";
import { inflateSync } from "node:zlib";

const tags = {
  imageWidth: 256,
  imageLength: 257,
  bitsPerSample: 258,
  compression: 259,
  stripOffsets: 273,
  samplesPerPixel: 277,
  rowsPerStrip: 278,
  stripByteCounts: 279,
  planarConfiguration: 284,
  predictor: 317,
  tileWidth: 322,
  tileLength: 323,
  tileOffsets: 324,
  tileByteCounts: 325,
  sampleFormat: 339,
  modelPixelScale: 33550,
  modelTiepoint: 33922,
  gdalNoData: 42113,
};

const typeSizes = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
  16: 8,
  17: 8,
  18: 8,
};

class GeoTiffError extends Error {}

export async function openGeoTiff(path) {
  const handle = await open(path, "r");
  try {
    const reader = await readDirectory(handle);
    return { ...reader, close: () => handle.close() };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function readAt(handle, offset, length) {
  const buffer = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const { bytesRead } = await handle.read(
      buffer,
      read,
      length - read,
      offset + read,
    );
    if (!bytesRead) throw new GeoTiffError("Unexpected end of file.");
    read += bytesRead;
  }
  return buffer;
}

async function readDirectory(handle) {
  const header = await readAt(handle, 0, 16);
  const order = header.toString("latin1", 0, 2);
  if (order !== "II" && order !== "MM")
    throw new GeoTiffError("Not a TIFF file (bad byte-order mark).");
  const little = order === "II";
  const magic = little ? header.readUInt16LE(2) : header.readUInt16BE(2);
  const big = magic === 43;
  if (magic !== 42 && magic !== 43)
    throw new GeoTiffError(`Not a TIFF file (version ${magic}).`);
  if (big) {
    const offsetSize = little ? header.readUInt16LE(4) : header.readUInt16BE(4);
    if (offsetSize !== 8)
      throw new GeoTiffError(`Unsupported BigTIFF offset size ${offsetSize}.`);
  }

  const number = (buffer, offset, size, signed = false) => {
    if (size === 1)
      return signed ? buffer.readInt8(offset) : buffer.readUInt8(offset);
    if (size === 2)
      return little
        ? signed
          ? buffer.readInt16LE(offset)
          : buffer.readUInt16LE(offset)
        : signed
          ? buffer.readInt16BE(offset)
          : buffer.readUInt16BE(offset);
    if (size === 4)
      return little
        ? signed
          ? buffer.readInt32LE(offset)
          : buffer.readUInt32LE(offset)
        : signed
          ? buffer.readInt32BE(offset)
          : buffer.readUInt32BE(offset);
    const value = little
      ? buffer.readBigUInt64LE(offset)
      : buffer.readBigUInt64BE(offset);
    return Number(value);
  };
  const float = (buffer, offset, size) =>
    size === 4
      ? little
        ? buffer.readFloatLE(offset)
        : buffer.readFloatBE(offset)
      : little
        ? buffer.readDoubleLE(offset)
        : buffer.readDoubleBE(offset);

  const directoryOffset = big ? number(header, 8, 8) : number(header, 4, 4);
  const countSize = big ? 8 : 2;
  const entrySize = big ? 20 : 12;
  const inlineSize = big ? 8 : 4;
  const countBuffer = await readAt(handle, directoryOffset, countSize);
  const entryCount = number(countBuffer, 0, countSize);
  if (!entryCount || entryCount > 4096)
    throw new GeoTiffError(`Implausible directory entry count ${entryCount}.`);
  const entries = await readAt(
    handle,
    directoryOffset + countSize,
    entryCount * entrySize,
  );

  const fields = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    const base = index * entrySize;
    const tag = number(entries, base, 2);
    const type = number(entries, base + 2, 2);
    const count = big
      ? number(entries, base + 4, 8)
      : number(entries, base + 4, 4);
    const typeSize = typeSizes[type];
    if (!typeSize) continue;
    const byteLength = typeSize * count;
    const valueOffset = base + (big ? 12 : 8);
    const payload =
      byteLength <= inlineSize
        ? entries.subarray(valueOffset, valueOffset + byteLength)
        : // eslint-disable-next-line no-await-in-loop
          await readAt(
            handle,
            number(entries, valueOffset, inlineSize),
            byteLength,
          );
    fields.set(tag, { type, count, payload });
  }

  const values = (tag) => {
    const field = fields.get(tag);
    if (!field) return null;
    const size = typeSizes[field.type];
    const result = [];
    for (let index = 0; index < field.count; index += 1) {
      const offset = index * size;
      if (field.type === 2)
        result.push(field.payload.toString("latin1", offset, offset + 1));
      else if (field.type === 11 || field.type === 12)
        result.push(float(field.payload, offset, size));
      else if (field.type === 5 || field.type === 10)
        result.push(
          number(field.payload, offset, 4) /
            number(field.payload, offset + 4, 4),
        );
      else
        result.push(
          number(
            field.payload,
            offset,
            size,
            field.type === 6 ||
              field.type === 8 ||
              field.type === 9 ||
              field.type === 17,
          ),
        );
    }
    return result;
  };
  const value = (tag, fallback = null) => {
    const list = values(tag);
    return list && list.length ? list[0] : fallback;
  };

  const width = value(tags.imageWidth);
  const height = value(tags.imageLength);
  if (!width || !height) throw new GeoTiffError("Missing image dimensions.");
  const samplesPerPixel = value(tags.samplesPerPixel, 1);
  if (samplesPerPixel !== 1)
    throw new GeoTiffError(
      `Only single-band images are supported (found ${samplesPerPixel}); ` +
        "extract one band with `gdal_translate -b 1`.",
    );
  const planar = value(tags.planarConfiguration, 1);
  if (planar !== 1 && planar !== 2)
    throw new GeoTiffError(`Unsupported planar configuration ${planar}.`);
  const bitsPerSample = value(tags.bitsPerSample, 8);
  if (![8, 16, 32, 64].includes(bitsPerSample))
    throw new GeoTiffError(`Unsupported bit depth ${bitsPerSample}.`);
  const sampleFormat = value(tags.sampleFormat, 1);
  if (![1, 2, 3].includes(sampleFormat))
    throw new GeoTiffError(`Unsupported sample format ${sampleFormat}.`);
  if (sampleFormat === 3 && bitsPerSample !== 32 && bitsPerSample !== 64)
    throw new GeoTiffError("Floating-point samples must be 32 or 64 bits.");
  const compression = value(tags.compression, 1);
  if (![1, 5, 8, 32773, 32946].includes(compression))
    throw new GeoTiffError(
      `Unsupported compression ${compression}; re-write the file with ` +
        "`gdal_translate -co COMPRESS=DEFLATE`.",
    );
  const predictor = value(tags.predictor, 1);
  if (![1, 2, 3].includes(predictor))
    throw new GeoTiffError(`Unsupported predictor ${predictor}.`);

  const scale = values(tags.modelPixelScale);
  const tiepoint = values(tags.modelTiepoint);
  if (!scale || scale.length < 2 || !tiepoint || tiepoint.length < 6)
    throw new GeoTiffError(
      "Missing ModelPixelScale/ModelTiepoint; this reader needs a plain " +
        "north-up EPSG:4326 GeoTIFF.",
    );
  const noDataText = values(tags.gdalNoData);
  const noDataValue = noDataText
    ? Number(noDataText.join("").trim())
    : Number.NaN;

  const bytesPerSample = bitsPerSample / 8;
  const decodeBlock = (raw, blockWidth, blockRows) => {
    const rowBytes = blockWidth * bytesPerSample;
    const expanded = decompress(raw, compression, rowBytes * blockRows);
    if (predictor === 2)
      applyHorizontalPredictor(
        expanded,
        blockWidth,
        blockRows,
        bitsPerSample,
        little,
        sampleFormat,
      );
    else if (predictor === 3)
      applyFloatingPredictor(expanded, blockWidth, blockRows, bytesPerSample);
    return expanded;
  };
  // One reusable buffer: a 86401-wide composite would otherwise allocate a
  // 691 KB Float64Array for each of its 33601 rows. The callback consumes the
  // values synchronously, so reuse is safe.
  let sampleBuffer = new Float64Array(0);
  const readSamples = (bytes, rowIndex, blockWidth, count) => {
    if (sampleBuffer.length !== count) sampleBuffer = new Float64Array(count);
    const result = sampleBuffer;
    const base = rowIndex * blockWidth * bytesPerSample;
    const floatingPredictor = predictor === 3;
    for (let index = 0; index < count; index += 1) {
      const offset = base + index * bytesPerSample;
      result[index] = readSample(
        bytes,
        offset,
        bitsPerSample,
        sampleFormat,
        // The floating-point predictor leaves the bytes in little-endian
        // order regardless of the file's own byte order (libtiff's fpAcc).
        floatingPredictor ? true : little,
      );
    }
    return result;
  };

  const tileWidth = value(tags.tileWidth);
  const tileLength = value(tags.tileLength);
  const tiled = Boolean(tileWidth && tileLength);

  async function readRows(onRow, onBand = () => {}) {
    if (tiled) {
      const offsets = values(tags.tileOffsets);
      const counts = values(tags.tileByteCounts);
      const across = Math.ceil(width / tileWidth);
      const down = Math.ceil(height / tileLength);
      for (let tileRow = 0; tileRow < down; tileRow += 1) {
        for (let tileColumn = 0; tileColumn < across; tileColumn += 1) {
          const index = tileRow * across + tileColumn;
          // eslint-disable-next-line no-await-in-loop
          const raw = await readAt(handle, offsets[index], counts[index]);
          const bytes = decodeBlock(raw, tileWidth, tileLength);
          const startColumn = tileColumn * tileWidth;
          const usableColumns = Math.min(tileWidth, width - startColumn);
          for (let row = 0; row < tileLength; row += 1) {
            const sourceRow = tileRow * tileLength + row;
            if (sourceRow >= height) break;
            onRow(
              sourceRow,
              startColumn,
              readSamples(bytes, row, tileWidth, usableColumns),
            );
          }
        }
        onBand(Math.min(height, (tileRow + 1) * tileLength) - 1);
      }
      return;
    }
    const offsets = values(tags.stripOffsets);
    const counts = values(tags.stripByteCounts);
    const rowsPerStrip = Math.min(value(tags.rowsPerStrip, height), height);
    const strips = Math.ceil(height / rowsPerStrip);
    for (let strip = 0; strip < strips; strip += 1) {
      const firstRow = strip * rowsPerStrip;
      const rows = Math.min(rowsPerStrip, height - firstRow);
      // eslint-disable-next-line no-await-in-loop
      const raw = await readAt(handle, offsets[strip], counts[strip]);
      const bytes = decodeBlock(raw, width, rows);
      for (let row = 0; row < rows; row += 1)
        onRow(firstRow + row, 0, readSamples(bytes, row, width, width));
      onBand(firstRow + rows - 1);
    }
  }

  return {
    width,
    height,
    noData: Number.isFinite(noDataValue) ? noDataValue : null,
    model: {
      // ModelTiepoint ties raster point (I, J) to (X, Y); the VNL composite
      // ties (0.5, 0.5) — the centre of the first pixel — to (180W, 75N), so
      // the upper-left corner of that pixel is half a cell further out.
      origin: {
        x: tiepoint[3] - tiepoint[0] * scale[0],
        y: tiepoint[4] + tiepoint[1] * scale[1],
      },
      scale: { x: scale[0], y: scale[1] },
    },
    readRows,
  };
}

function readSample(bytes, offset, bitsPerSample, sampleFormat, little) {
  if (sampleFormat === 3)
    return bitsPerSample === 32
      ? little
        ? bytes.readFloatLE(offset)
        : bytes.readFloatBE(offset)
      : little
        ? bytes.readDoubleLE(offset)
        : bytes.readDoubleBE(offset);
  const signed = sampleFormat === 2;
  if (bitsPerSample === 8)
    return signed ? bytes.readInt8(offset) : bytes.readUInt8(offset);
  if (bitsPerSample === 16)
    return little
      ? signed
        ? bytes.readInt16LE(offset)
        : bytes.readUInt16LE(offset)
      : signed
        ? bytes.readInt16BE(offset)
        : bytes.readUInt16BE(offset);
  if (bitsPerSample === 32)
    return little
      ? signed
        ? bytes.readInt32LE(offset)
        : bytes.readUInt32LE(offset)
      : signed
        ? bytes.readInt32BE(offset)
        : bytes.readUInt32BE(offset);
  return Number(
    little ? bytes.readBigInt64LE(offset) : bytes.readBigInt64BE(offset),
  );
}

function decompress(raw, compression, expectedLength) {
  if (compression === 1) return raw;
  if (compression === 8 || compression === 32946) return inflateSync(raw);
  if (compression === 5) return decodeLzw(raw, expectedLength);
  return decodePackBits(raw, expectedLength);
}

// TIFF LZW (Section 13): 9-bit codes growing to 12, with the "early change"
// off-by-one every writer since 1992 implements.
function decodeLzw(raw, expectedLength) {
  const output = Buffer.alloc(expectedLength);
  let written = 0;
  const dictionary = new Array(4096);
  let next = 258;
  let codeLength = 9;
  let previous = null;
  let bitBuffer = 0;
  let bitCount = 0;
  let position = 0;

  const reset = () => {
    next = 258;
    codeLength = 9;
    previous = null;
  };
  const emit = (bytes) => {
    if (written + bytes.length > expectedLength) {
      bytes.copy(output, written, 0, expectedLength - written);
      written = expectedLength;
      return;
    }
    bytes.copy(output, written);
    written += bytes.length;
  };
  const entry = (code) => {
    if (code < 256) return Buffer.from([code]);
    return dictionary[code];
  };

  reset();
  while (written < expectedLength) {
    while (bitCount < codeLength) {
      if (position >= raw.length) return output;
      bitBuffer = (bitBuffer << 8) | raw[position];
      position += 1;
      bitCount += 8;
    }
    const code =
      (bitBuffer >> (bitCount - codeLength)) & ((1 << codeLength) - 1);
    bitCount -= codeLength;
    if (code === 256) {
      reset();
      continue;
    }
    if (code === 257) break;
    if (previous === null) {
      const bytes = entry(code);
      if (!bytes) throw new GeoTiffError("Corrupt LZW stream.");
      emit(bytes);
      previous = bytes;
      continue;
    }
    let bytes = entry(code);
    if (!bytes) bytes = Buffer.concat([previous, previous.subarray(0, 1)]);
    emit(bytes);
    if (next < 4096) {
      dictionary[next] = Buffer.concat([previous, bytes.subarray(0, 1)]);
      next += 1;
    }
    previous = bytes;
    if (next + 1 >= 1 << codeLength && codeLength < 12) codeLength += 1;
  }
  return output;
}

function decodePackBits(raw, expectedLength) {
  const output = Buffer.alloc(expectedLength);
  let written = 0;
  let position = 0;
  while (position < raw.length && written < expectedLength) {
    const header = raw.readInt8(position);
    position += 1;
    if (header >= 0) {
      const count = header + 1;
      raw.copy(output, written, position, position + count);
      position += count;
      written += count;
      continue;
    }
    if (header === -128) continue;
    const count = 1 - header;
    output.fill(raw[position], written, written + count);
    position += 1;
    written += count;
  }
  return output;
}

function applyHorizontalPredictor(
  bytes,
  blockWidth,
  blockRows,
  bitsPerSample,
  little,
  sampleFormat,
) {
  const bytesPerSample = bitsPerSample / 8;
  const rowBytes = blockWidth * bytesPerSample;
  for (let row = 0; row < blockRows; row += 1) {
    const base = row * rowBytes;
    for (let column = 1; column < blockWidth; column += 1) {
      const offset = base + column * bytesPerSample;
      const previous = offset - bytesPerSample;
      if (bitsPerSample === 8) {
        bytes[offset] = (bytes[offset] + bytes[previous]) & 0xff;
        continue;
      }
      const sum =
        readSample(bytes, offset, bitsPerSample, sampleFormat, little) +
        readSample(bytes, previous, bitsPerSample, sampleFormat, little);
      writeInteger(bytes, offset, bitsPerSample, little, sum);
    }
  }
}

function writeInteger(bytes, offset, bitsPerSample, little, value) {
  if (bitsPerSample === 16) {
    const wrapped = value & 0xffff;
    if (little) bytes.writeUInt16LE(wrapped, offset);
    else bytes.writeUInt16BE(wrapped, offset);
    return;
  }
  const wrapped = value >>> 0;
  if (little) bytes.writeUInt32LE(wrapped, offset);
  else bytes.writeUInt32BE(wrapped, offset);
}

// libtiff's fpAcc: byte-wise accumulation with the sample stride, then the
// byte planes are de-interleaved back into little-endian samples.
function applyFloatingPredictor(bytes, blockWidth, blockRows, bytesPerSample) {
  const rowBytes = blockWidth * bytesPerSample;
  const scratch = Buffer.alloc(rowBytes);
  for (let row = 0; row < blockRows; row += 1) {
    const base = row * rowBytes;
    for (let index = 1; index < rowBytes; index += 1)
      bytes[base + index] =
        (bytes[base + index] + bytes[base + index - 1]) & 0xff;
    bytes.copy(scratch, 0, base, base + rowBytes);
    for (let sample = 0; sample < blockWidth; sample += 1)
      for (let byte = 0; byte < bytesPerSample; byte += 1)
        bytes[base + sample * bytesPerSample + byte] =
          scratch[(bytesPerSample - byte - 1) * blockWidth + sample];
  }
}
