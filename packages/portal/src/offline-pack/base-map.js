import { createHash } from "node:crypto";

import {
  defaultLocale,
  localeEntry,
  shippedLocales,
} from "astro-contracts/locales";

/**
 * The offline background of the light-pollution map: land, lakes,
 * coastlines, country borders and populated places of Natural Earth
 * (1:10m), public domain, in one compact file the phone draws under the
 * OpenStreetMap tiles it has already seen. OpenStreetMap itself is never
 * embedded (its tile usage policy forbids bulk downloads, and no ODbL data
 * is ever packed); online, the map's background is OpenStreetMap alone.
 *
 * Natural Earth terms of use (read on 13/10/2026,
 * naturalearthdata.com/about/terms-of-use): « All versions of Natural Earth
 * raster + vector map data found on this website are in the public
 * domain. » No credit is required; the component carries « Made with
 * Natural Earth. » all the same, as every pack component names its source.
 *
 * A `file-set` component, optional (`required: false`): a pack without it
 * leaves the light map offline on its plain dark background, with the line
 * « Hors ligne : fond de carte non téléchargé. » and the way to download it.
 *
 * The `PNEB` layout, version 1, little-endian:
 * - header (24 bytes): `PNEB`, u16 version, u16 cell size in degrees,
 *   u32 polygon count, u32 line count, u32 place count, u32 language count;
 * - the language tags, each u8 length + ASCII;
 * - each polygon: u8 layer (1 land, 2 lake), u16 ring count, then per ring
 *   u32 point count and the points as int32 longitude, int32 latitude in
 *   1e-5 degree (the first ring is the outer one);
 * - each line: u8 layer (3 coastline, 4 border), u32 point count, points;
 * - each place: int32 longitude, int32 latitude, u8 minimum zoom × 10,
 *   u8 name count, then per name u8 language index, u16 byte length, UTF-8.
 *
 * Land and coastlines are cut along a grid of `cellDegrees` so that a map
 * draws only the pieces of the view (a continent is not one path).
 */

export const baseMapComponentId = "base-map";
export const baseMapFileName = "natural-earth.bin";
export const baseMapAttribution = "Made with Natural Earth.";
export const baseMapLicense = "Public domain (Natural Earth)";
export const baseMapCellDegrees = 10;

/**
 * The name languages kept, in the order of their index in the file: the
 * shipped locales of the registry, English first. The file carries the tags
 * in its header, so a reader never lists them.
 */
export function baseMapLanguages() {
  const tags = shippedLocales();
  const first = defaultLocale();
  return [first, ...tags.filter((tag) => tag !== first)];
}

/**
 * The Natural Earth property that holds the names of a locale's language:
 * `NAME_` and the ISO 639-1 code in capitals, `NAME_ZHT` for Traditional
 * Chinese. Derived from the registry entry, so no table of languages
 * is kept here.
 */
function nameField(tag) {
  const entry = localeEntry(tag);
  if (!entry) return null;
  return `NAME_${entry.script === "Hant" ? `${entry.language}T` : entry.language}`.toUpperCase();
}

export const baseMapLayers = Object.freeze({
  land: 1,
  lake: 2,
  coastline: 3,
  border: 4,
});

const scale = 1e5;

// Sutherland–Hodgman against one edge of an axis-aligned box.
function clipRingEdge(ring, inside, cross) {
  const out = [];
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const previous = ring[(index + ring.length - 1) % ring.length];
    const currentIn = inside(current);
    const previousIn = inside(previous);
    if (currentIn) {
      if (!previousIn) out.push(cross(previous, current));
      out.push(current);
    } else if (previousIn) out.push(cross(previous, current));
  }
  return out;
}

/** A closed ring (`[lon, lat]` points, last ≠ first) cut to a box. */
export function clipRing(ring, west, south, east, north) {
  const atX = (x) => (a, b) => [
    x,
    a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]),
  ];
  const atY = (y) => (a, b) => [
    a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]),
    y,
  ];
  let points = ring;
  points = clipRingEdge(points, (p) => p[0] >= west, atX(west));
  points = clipRingEdge(points, (p) => p[0] <= east, atX(east));
  points = clipRingEdge(points, (p) => p[1] >= south, atY(south));
  points = clipRingEdge(points, (p) => p[1] <= north, atY(north));
  return points;
}

/** A line cut to a box: the pieces inside it (Liang–Barsky per segment). */
export function clipLine(line, west, south, east, north) {
  const pieces = [];
  let piece = [];
  const flush = () => {
    if (piece.length >= 2) pieces.push(piece);
    piece = [];
  };
  for (let index = 1; index < line.length; index += 1) {
    const [x0, y0] = line[index - 1];
    const [x1, y1] = line[index];
    const dx = x1 - x0;
    const dy = y1 - y0;
    let t0 = 0;
    let t1 = 1;
    let visible = true;
    for (const [p, q] of [
      [-dx, x0 - west],
      [dx, east - x0],
      [-dy, y0 - south],
      [dy, north - y0],
    ]) {
      if (p === 0) {
        if (q < 0) visible = false;
      } else {
        const r = q / p;
        if (p < 0) t0 = Math.max(t0, r);
        else t1 = Math.min(t1, r);
      }
    }
    if (!visible || t0 > t1) {
      flush();
      continue;
    }
    const start = [x0 + t0 * dx, y0 + t0 * dy];
    const end = [x0 + t1 * dx, y0 + t1 * dy];
    const last = piece[piece.length - 1];
    if (!last || last[0] !== start[0] || last[1] !== start[1]) {
      flush();
      piece.push(start);
    }
    piece.push(end);
    if (t1 < 1) flush();
  }
  flush();
  return pieces;
}

const openRing = (ring) => {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first && last && first[0] === last[0] && first[1] === last[1]
    ? ring.slice(0, -1)
    : ring;
};

function boxOf(points) {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const [x, y] of points) {
    if (x < west) west = x;
    if (x > east) east = x;
    if (y < south) south = y;
    if (y > north) north = y;
  }
  return { west, east, south, north };
}

// The cells of the grid a box touches.
function* cellsOf(box, cell) {
  for (
    let west = Math.floor(box.west / cell) * cell;
    west < box.east;
    west += cell
  )
    for (
      let south = Math.floor(box.south / cell) * cell;
      south < box.north;
      south += cell
    )
      yield [west, south, west + cell, south + cell];
}

const polygonsOf = (geometry) =>
  geometry?.type === "Polygon"
    ? [geometry.coordinates]
    : geometry?.type === "MultiPolygon"
      ? geometry.coordinates
      : [];

const linesOf = (geometry) =>
  geometry?.type === "LineString"
    ? [geometry.coordinates]
    : geometry?.type === "MultiLineString"
      ? geometry.coordinates
      : [];

/**
 * The background of four Natural Earth GeoJSON collections: `land`,
 * `lakes`, `coastline`, `borders` (admin-0 boundary lines on land) and
 * `places` (populated places). Land and coastlines are cut along the grid.
 */
export function baseMapFromNaturalEarth(
  { land, lakes, coastline, borders, places },
  { cellDegrees = baseMapCellDegrees } = {},
) {
  const polygons = [];
  for (const feature of land?.features ?? [])
    for (const rings of polygonsOf(feature.geometry)) {
      const outer = openRing(rings[0]);
      const holes = rings.slice(1).map(openRing);
      for (const [west, south, east, north] of cellsOf(
        boxOf(outer),
        cellDegrees,
      )) {
        const cut = clipRing(outer, west, south, east, north);
        if (cut.length < 3) continue;
        const cutHoles = holes
          .map((hole) => clipRing(hole, west, south, east, north))
          .filter((hole) => hole.length >= 3);
        polygons.push({ layer: baseMapLayers.land, rings: [cut, ...cutHoles] });
      }
    }
  for (const feature of lakes?.features ?? [])
    for (const rings of polygonsOf(feature.geometry))
      polygons.push({
        layer: baseMapLayers.lake,
        rings: rings.map(openRing).filter((ring) => ring.length >= 3),
      });
  const lines = [];
  for (const feature of coastline?.features ?? [])
    for (const line of linesOf(feature.geometry))
      for (const [west, south, east, north] of cellsOf(
        boxOf(line),
        cellDegrees,
      ))
        for (const piece of clipLine(line, west, south, east, north))
          lines.push({ layer: baseMapLayers.coastline, points: piece });
  for (const feature of borders?.features ?? [])
    for (const line of linesOf(feature.geometry))
      lines.push({ layer: baseMapLayers.border, points: line });
  const languages = baseMapLanguages();
  const named = [];
  for (const feature of places?.features ?? []) {
    const [longitude, latitude] = feature.geometry?.coordinates ?? [];
    const properties = feature.properties ?? {};
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    const english = properties.NAME_EN || properties.NAME;
    if (!english) continue;
    const names = [];
    languages.forEach((language, index) => {
      const value =
        language === defaultLocale()
          ? english
          : properties[nameField(language)];
      if (typeof value !== "string" || !value.trim()) return;
      // Only what differs from the English name is kept.
      if (index > 0 && value === english) return;
      names.push([index, value.trim()]);
    });
    const minimumZoom = Number(properties.MIN_ZOOM);
    named.push({
      longitude,
      latitude,
      minimumZoom: Number.isFinite(minimumZoom) ? minimumZoom : 10,
      names,
    });
  }
  // Stable bytes: the most important places first.
  named.sort(
    (a, b) =>
      a.minimumZoom - b.minimumZoom ||
      a.longitude - b.longitude ||
      a.latitude - b.latitude,
  );
  return { cellDegrees, polygons, lines, places: named, languages };
}

/** The `PNEB` bytes of a background. */
export function encodeBaseMap({
  cellDegrees,
  polygons,
  lines,
  places,
  languages = baseMapLanguages(),
}) {
  const chunks = [];
  const header = Buffer.alloc(24);
  header.write("PNEB", 0, "ascii");
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(cellDegrees, 6);
  header.writeUInt32LE(polygons.length, 8);
  header.writeUInt32LE(lines.length, 12);
  header.writeUInt32LE(places.length, 16);
  header.writeUInt32LE(languages.length, 20);
  chunks.push(header);
  for (const language of languages)
    chunks.push(Buffer.from([language.length]), Buffer.from(language, "ascii"));
  const pointsBuffer = (points) => {
    const buffer = Buffer.alloc(4 + points.length * 8);
    buffer.writeUInt32LE(points.length, 0);
    points.forEach(([x, y], index) => {
      buffer.writeInt32LE(Math.round(x * scale), 4 + index * 8);
      buffer.writeInt32LE(Math.round(y * scale), 8 + index * 8);
    });
    return buffer;
  };
  for (const { layer, rings } of polygons) {
    const head = Buffer.alloc(3);
    head.writeUInt8(layer, 0);
    head.writeUInt16LE(rings.length, 1);
    chunks.push(head, ...rings.map(pointsBuffer));
  }
  for (const { layer, points } of lines)
    chunks.push(Buffer.from([layer]), pointsBuffer(points));
  for (const { longitude, latitude, minimumZoom, names } of places) {
    const head = Buffer.alloc(10);
    head.writeInt32LE(Math.round(longitude * scale), 0);
    head.writeInt32LE(Math.round(latitude * scale), 4);
    head.writeUInt8(
      Math.max(0, Math.min(255, Math.round(minimumZoom * 10))),
      8,
    );
    head.writeUInt8(names.length, 9);
    chunks.push(head);
    for (const [index, value] of names) {
      const bytes = Buffer.from(value, "utf8");
      const nameHead = Buffer.alloc(3);
      nameHead.writeUInt8(index, 0);
      nameHead.writeUInt16LE(bytes.length, 1);
      chunks.push(nameHead, bytes);
    }
  }
  return Buffer.concat(chunks);
}

/**
 * The manifest entry of the background, or `null` (component absent)
 * without bytes. `revision` and the file's `checksum` are digests of the
 * actual bytes.
 *
 * @param {{ bytes: Buffer | Uint8Array | null | undefined, fileUrl?: string }} input
 */
export function baseMapPackComponent({
  bytes,
  fileUrl = `base-map/${baseMapFileName}`,
}) {
  if (!bytes || bytes.length === 0) return null;
  const checksum = createHash("sha256").update(bytes).digest("hex");
  return {
    id: baseMapComponentId,
    kind: "file-set",
    required: false,
    revision: `sha256:${checksum}`,
    estimatedBytes: bytes.length,
    files: [
      {
        name: baseMapFileName,
        url: fileUrl,
        bytes: bytes.length,
        checksum: `sha256:${checksum}`,
      },
    ],
    attribution: baseMapAttribution,
    license: baseMapLicense,
  };
}
