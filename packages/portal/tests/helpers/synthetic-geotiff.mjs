import { deflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";

/**
 * Write a small, deterministic, north-up EPSG:4326 float32 GeoTIFF.
 *
 * The real VIIRS composite needs an EOG account, so the whole raster pipeline
 * — read, area-weighted resample, 8-bit log encode, manifest, service — is
 * exercised against a synthetic image instead. The radiance field
 * is a fixed analytic pattern over a fictional patch of the globe, never a
 * real place.
 */
export function syntheticRadiance(row, column, { width, height }) {
  const centreRow = height / 2;
  const centreColumn = width / 2;
  const distance =
    ((row - centreRow) ** 2 + (column - centreColumn) ** 2) /
    (2 * (width / 12) ** 2);
  const town =
    0.6 *
    Math.exp(
      -(
        ((row - height * 0.25) ** 2 + (column - width * 0.75) ** 2) /
        (2 * (width / 30) ** 2)
      ),
    );
  return Math.fround(0.04 + 60 * Math.exp(-distance) + town);
}

const entrySize = 12;

export async function writeSyntheticGeoTiff(
  path,
  {
    width = 960,
    height = 960,
    west = -4,
    north = 2,
    cellSizeDegrees = 1 / 240,
    rowsPerStrip = 16,
    compression = 1,
    predictor = 1,
    noData = null,
    sample = syntheticRadiance,
  } = {},
) {
  const rowBytes = width * 4;
  const strips = Math.ceil(height / rowsPerStrip);
  const payloads = [];
  for (let strip = 0; strip < strips; strip += 1) {
    const rows = Math.min(rowsPerStrip, height - strip * rowsPerStrip);
    const block = Buffer.alloc(rowBytes * rows);
    for (let row = 0; row < rows; row += 1)
      for (let column = 0; column < width; column += 1)
        block.writeFloatLE(
          sample(strip * rowsPerStrip + row, column, { width, height }),
          row * rowBytes + column * 4,
        );
    if (predictor === 3) applyFloatingPredictor(block, width, rows);
    payloads.push(compression === 1 ? block : deflateSync(block));
  }

  const nodataText =
    noData === null ? null : `${noData}${String.fromCharCode(0)}`;
  const fields = [
    [256, 4, 1, [width]],
    [257, 4, 1, [height]],
    [258, 3, 1, [32]],
    [259, 3, 1, [compression]],
    [262, 3, 1, [1]],
    [273, 4, strips, []],
    [277, 3, 1, [1]],
    [278, 4, 1, [rowsPerStrip]],
    [279, 4, strips, payloads.map((payload) => payload.length)],
    [284, 3, 1, [1]],
    [317, 3, 1, [predictor]],
    [339, 3, 1, [3]],
    [33550, 12, 3, [cellSizeDegrees, cellSizeDegrees, 0]],
    [33922, 12, 6, [0, 0, 0, west, north, 0]],
    ...(nodataText ? [[42113, 2, nodataText.length, nodataText]] : []),
  ];

  // Header, then the strips, then the directory and its out-of-line values.
  const dataOffset = 8;
  const stripOffsets = [];
  let cursor = dataOffset;
  for (const payload of payloads) {
    stripOffsets.push(cursor);
    cursor += payload.length;
  }
  if (cursor % 2) cursor += 1;
  const directoryOffset = cursor;
  fields.find((field) => field[0] === 273)[3] = stripOffsets;

  const typeSizes = { 2: 1, 3: 2, 4: 4, 12: 8 };
  const inline = (type, count) => typeSizes[type] * count <= 4;
  let extraOffset = directoryOffset + 2 + fields.length * entrySize + 4;
  const extras = [];
  const directory = Buffer.alloc(2 + fields.length * entrySize + 4);
  directory.writeUInt16LE(fields.length, 0);
  fields.forEach(([tag, type, count, values], index) => {
    const base = 2 + index * entrySize;
    directory.writeUInt16LE(tag, base);
    directory.writeUInt16LE(type, base + 2);
    directory.writeUInt32LE(count, base + 4);
    const payload = encodeValues(type, count, values);
    if (inline(type, count)) {
      payload.copy(directory, base + 8);
      return;
    }
    directory.writeUInt32LE(extraOffset, base + 8);
    extras.push(payload);
    extraOffset += payload.length + (payload.length % 2);
  });

  const parts = [Buffer.from([0x49, 0x49, 0x2a, 0x00]), Buffer.alloc(4)];
  parts[1].writeUInt32LE(directoryOffset, 0);
  parts.push(...payloads);
  if ((dataOffset + payloads.reduce((total, one) => total + one.length, 0)) % 2)
    parts.push(Buffer.alloc(1));
  parts.push(directory);
  for (const extra of extras) {
    parts.push(extra);
    if (extra.length % 2) parts.push(Buffer.alloc(1));
  }
  await writeFile(path, Buffer.concat(parts));
  return { width, height, west, north, cellSizeDegrees, strips };
}

function encodeValues(type, count, values) {
  if (type === 2) return Buffer.from(String(values), "latin1");
  const size = { 3: 2, 4: 4, 12: 8 }[type];
  const buffer = Buffer.alloc(Math.max(4, size * count));
  for (let index = 0; index < count; index += 1) {
    const value = values[index] ?? 0;
    if (type === 3) buffer.writeUInt16LE(value, index * size);
    else if (type === 4) buffer.writeUInt32LE(value, index * size);
    else buffer.writeDoubleLE(value, index * size);
  }
  return size * count <= 4 ? buffer.subarray(0, 4) : buffer;
}

// The inverse of libtiff's fpAcc: de-interleave the sample bytes into byte
// planes (most significant first), then take the byte-wise difference.
function applyFloatingPredictor(block, width, rows) {
  const rowBytes = width * 4;
  for (let row = 0; row < rows; row += 1) {
    const base = row * rowBytes;
    const planes = Buffer.alloc(rowBytes);
    for (let sample = 0; sample < width; sample += 1)
      for (let byte = 0; byte < 4; byte += 1)
        planes[(4 - byte - 1) * width + sample] =
          block[base + sample * 4 + byte];
    for (let index = rowBytes - 1; index > 0; index -= 1)
      planes[index] = (planes[index] - planes[index - 1]) & 0xff;
    planes.copy(block, base);
  }
}
