const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

// Falchi et al. (2016), "The new world atlas of artificial night sky
// brightness", Science Advances 2, e1600377: a 22.0 mag/arcsec² natural
// background is 0.171168465 mcd/m², and luminance converts to magnitudes per
// square arcsecond against a 1.08e8 mcd/m² zero point.
const naturalSkyLuminance = 0.171168465;
const luminanceZeroPoint = 108000000;

export function bortleFromSqm(sqm) {
  if (!Number.isFinite(sqm)) return null;
  if (sqm >= 21.99) return 1;
  if (sqm >= 21.89) return 2;
  if (sqm >= 21.69) return 3;
  if (sqm >= 20.49) return 4;
  if (sqm >= 19.5) return 5;
  if (sqm >= 18.94) return 6;
  if (sqm >= 18.38) return 7;
  if (sqm >= 17) return 8;
  return 9;
}

export function sqmFromArtificialBrightness(value) {
  const artificialBrightness = Number(value);
  if (!Number.isFinite(artificialBrightness) || artificialBrightness < 0)
    return null;
  const sqm =
    Math.log10(
      (artificialBrightness + naturalSkyLuminance) / luminanceZeroPoint,
    ) / -0.4;
  if (!Number.isFinite(sqm) || sqm < 10 || sqm > 22.1) return null;
  return Number(sqm.toFixed(2));
}

// Zenith sky brightness from a PROPAGATED VIIRS radiance, in nW/cm²/sr.
//
// The input is a cell of the prepared raster, NOT a raw VIIRS pixel. Each
// cell holds the upward radiance of everything within 300 km of it, summed
// with the distance kernel in packages/portal/scripts/sky-quality-kernel.mjs
// and divided by that kernel's surface integral — so a uniformly lit region
// keeps its own radiance, and a dark valley downwind of a city carries the
// city's glow instead of the zero the `average_masked` product gives it.
// Feeding a raw pixel radiance to this function is meaningless: inside a city
// it would read far too bright, and in open country far too dark.
//
// Artificial zenith luminance is linear in the light reaching the observer,
// so the conversion is a single constant:
//
//     B_artificial [mcd/m²] = skyQualityLuminancePerRadiance × radiance
//
// Calibration. packages/portal/scripts/calibrate-sky-quality.mjs fits this
// constant against measured zenith sky brightness and prints the residuals;
// the value below is what it returned for the 2' raster built from the 2025
// annual composite, over 486 sites:
//
//   - 104 National Park Service all-sky V-band camera measurements from 2019
//     onwards (public domain), which carry the dark end;
//   - 382 Globe at Night cells (CC BY 4.0), each the median of at least three
//     clear-sky SQM readings in one raster cell, which carry the bright end
//     and everywhere outside the United States.
//
// RMS residual 0.73 mag over the whole set — 0.35 mag over the National Park
// Service subset alone, 0.79 mag over the citizen-science one, which is the
// honest width of a single global constant against meters of unknown
// calibration. Neither measurement file is committed here; that script reads
// or downloads them. Nothing under a non-commercial or share-alike licence
// went into this number.
//
// Changing this constant does NOT require rebuilding the raster: the raster
// stores radiance, and the luminance conversion happens here.
export const skyQualityLuminancePerRadiance = 0.299;

// ── Regional calibration ─────────────────────────────────────────────────
//
// `skyQualityLuminancePerRadiance` above is ONE global constant, fitted on
// measurements that sit almost entirely in dry air (see this file's header
// and docs/SKY_QUALITY_RASTER.md). A validation against Japan showed the
// model reads that sky too dark by a roughly constant factor — the shape of
// a wrong constant, not a geometry problem — so this table lets one region
// at a time carry its own constant instead, without touching the raster or
// the global fit. `packages/portal/scripts/calibrate-sky-quality.mjs`'s
// `--region <id>` option is what fits an entry here; nothing in this file
// invents a number on its own.
//
// Bump `skyQualityCalibrationVersion` whenever a region's constant, or the
// table itself, changes: it is the first half of the `calibration` field of
// `GET /v1/sky-quality` and `/api/planner-sky-quality`
// (`<version>/<region id>`, e.g. `"2026-09/japan"`), which is how a client
// tells an estimate cached under an older calibration apart from a fresh
// one — see the cache key in packages/portal/src/planner/sky-quality.server.js.
export const skyQualityCalibrationVersion = "2026-09";

// Each region is `{ id, polygons, luminancePerRadiance, provenance }`.
//
// `polygons` is a non-empty array of simple rings (no self-intersection),
// each an array of `[latitude, longitude]` vertices; a position matches the
// region when it falls inside ANY of its rings. Deliberately not smoothed at
// the edge: a position on one side of open water reading a different
// constant from a position a few kilometres away, on the other side, is a
// design choice (see docs/SKY_QUALITY_RASTER.md), not a bug. `pointInRing`
// below is the exact even-odd / ray-casting test; a position exactly on an
// edge or vertex is resolved by that test's own tie-break (pinned by the
// `sky-quality-region` fixture), not by a documented rule.
//
// The list is ORDERED: the first matching region wins, so a future overlap
// between two regions resolves by table order rather than by size.
export const skyQualityCalibrationRegions = [
  {
    id: "japan",
    // Hokkaidō down to the Yaeyama islands (Ishigaki, Yonaguni), Tsushima
    // included; a separate small ring for the Ogasawara islands, ~1,000 km
    // further south. Excludes the Korean peninsula, Russia (Vladivostok,
    // southern Sakhalin), mainland China (Shanghai) and Taiwan — see
    // docs/SKY_QUALITY_RASTER.md for the boundary points chosen near each.
    polygons: [
      [
        [45.7, 140.2],
        [45.7, 145.0],
        [42.0, 148.5],
        [35.0, 145.0],
        [28.5, 141.5],
        [24.0, 133.0],
        [22.8, 126.0],
        [22.8, 122.6],
        [26.0, 122.6],
        [29.5, 124.5],
        [32.0, 127.5],
        [33.2, 128.9],
        [34.0, 129.05],
        [35.3, 129.55],
        [37.0, 132.5],
        [40.0, 135.0],
        [43.5, 138.0],
      ],
      [
        [27.9, 142.0],
        [27.9, 142.4],
        [26.5, 142.4],
        [26.5, 142.0],
      ],
    ],
    // `--region japan --input-japan <file>` fitted on the Ministry of the
    // Environment's own nationwide star-watching campaign, restricted to the
    // cells its own positions fall in — see calibrate-sky-quality.mjs's
    // header for what is and is not redistributed.
    luminancePerRadiance: 0.832,
    provenance: {
      source:
        '環境省 星空観察 ("star-watching") nationwide digital-camera ' +
        "campaign, Ministry of the Environment of Japan, with 星空公団; " +
        "site positions read from the 国立環境研究所 環境GIS map layer.",
      license:
        "Fitted constant only: the campaign's own result tables are " +
        "published under 公共データ利用規約（第1.0版）/ PDL1.0 (CC BY 4.0 " +
        "compatible), attribution required. No measurement or position is " +
        "redistributed here — only this fitted constant and its provenance " +
        "— because the copy that carries positions (環境GIS) is under the " +
        "institute's own site policy, which reserves reproduction; a " +
        "request to use it for calibration is pending with the rights " +
        "holder. See docs/SKY_QUALITY_RASTER.md.",
      measurements: 2799,
      cells: 215,
      rms: 0.37,
      bias: 0.05,
      dataThrough: "2019-2025",
    },
  },
];

// Even-odd / ray-casting point-in-polygon test: counts how many times a ray
// cast due "east" (increasing longitude) from the position crosses the
// ring's edges. `ring[i]` to `ring[j]` (`j` trailing `i` by one, wrapping) is
// each edge in turn; an edge counts only when the position's latitude is
// strictly on the "below" side of where that edge crosses the position's
// longitude. The arithmetic must not change, since a position near an edge is
// exactly where a difference would show up.
function pointInRing(latitude, longitude, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lonI] = ring[i];
    const [latJ, lonJ] = ring[j];
    if (lonI > longitude !== lonJ > longitude) {
      const latitudeAtLongitude =
        latI + ((latJ - latI) * (longitude - lonI)) / (lonJ - lonI);
      if (latitude < latitudeAtLongitude) inside = !inside;
    }
  }
  return inside;
}

function pointInAnyRing(latitude, longitude, polygons) {
  for (const ring of polygons)
    if (pointInRing(latitude, longitude, ring)) return true;
  return false;
}

// The same test, for a caller that holds rings of its own: the calibration
// script (a candidate region that is not in the table yet) and the table's
// tests. Not part of the mirrored surface: `skyQualityCalibrationAt` is.
export function skyQualityPointInPolygons(latitude, longitude, polygons) {
  const latitudeValue = Number(latitude);
  const longitudeValue = Number(longitude);
  if (!Number.isFinite(latitudeValue) || !Number.isFinite(longitudeValue))
    return false;
  return pointInAnyRing(latitudeValue, longitudeValue, polygons);
}

/**
 * The calibration region a position falls in, or `{ id: "global", … }` when
 * it matches none — including when latitude/longitude is missing or
 * invalid, so every existing caller that never had a position keeps reading
 * the one global constant.
 */
export function skyQualityCalibrationAt(latitude, longitude) {
  const latitudeValue = Number(latitude);
  const longitudeValue = Number(longitude);
  if (Number.isFinite(latitudeValue) && Number.isFinite(longitudeValue)) {
    for (const region of skyQualityCalibrationRegions) {
      if (pointInAnyRing(latitudeValue, longitudeValue, region.polygons))
        return {
          id: region.id,
          luminancePerRadiance: region.luminancePerRadiance,
        };
    }
  }
  return { id: "global", luminancePerRadiance: skyQualityLuminancePerRadiance };
}

// `latitude`/`longitude` are OPTIONAL: omitted (or invalid), this returns
// exactly what it always has — the global constant — so every existing
// caller and fixture is unaffected. Passed a position, it applies that
// position's regional constant instead, from the table above.
export function sqmFromViirsRadiance(value, latitude, longitude) {
  const radiance = Number(value);
  if (!Number.isFinite(radiance)) return null;
  const { luminancePerRadiance } = skyQualityCalibrationAt(latitude, longitude);
  if (radiance <= 0) return sqmFromArtificialBrightness(0);
  return sqmFromArtificialBrightness(luminancePerRadiance * radiance);
}

// The portal's own `method` label for this conversion — carried in every
// `GET /v1/sky-quality` and `/api/planner-sky-quality` payload's own
// `method` field (packages/portal/src/planner/sky-quality.server.js). A cached payload whose own `method` disagrees
// with this constant was computed by a different conversion entirely, not
// merely an old one — see `skyQualityCalibrationVersion` above for the
// regional-calibration half of the same "does this cached estimate still
// describe what we'd compute today" question.
export const skyQualityEstimateMethod =
  "viirs-propagated-radiance-zenith-sky-brightness";

// Compact 8-bit log encoding of a VIIRS radiance cell, and its exact inverse.
// packages/portal/scripts/prepare-sky-quality-raster.mjs writes the encoded bytes, the portal
// service reads them back; both must agree, so the
// constants live here and are mirrored in the generated manifest.
//
//   encode(R) = round(255 * log10(1 + R / offset) / scale)
//   decode(L) = offset * (10 ** (L * scale / 255) - 1)
//   scale     = log10(1 + maximum / offset)
//
// decode(0) is exactly 0 and decode(255) is exactly `maximum`; the step is a
// constant 0.0208 dex, i.e. 4.9% of (R + offset), which is 0.053 mag/arcsec²
// at worst once the relation above is applied.
//
// `maximum` covers the PROPAGATED field, not the raw composite: a raw cell
// reaches 8191 nW/cm²/sr in the 2025 global average_masked product, but
// summing the surroundings with a distance kernel spreads that out and the
// propagated peak is 1091. Two thousand leaves room for a brighter year, and
// the preparation script warns on any cell that exceeds it rather than
// silently clipping.
export const skyQualityRadianceOffset = 0.01;
export const skyQualityRadianceMaximum = 2000;
export const skyQualityRadianceLevels = 256;
const skyQualityRadianceScale = Math.log10(
  1 + skyQualityRadianceMaximum / skyQualityRadianceOffset,
);

// Generic form of the same log8 encoding, parameterized on `{offset,
// maximum, levels}` instead of the module's own constants above. Used by
// the offline pack's 6' derivation (below), which must re-encode with
// whatever scale the INSTALLED source raster's manifest records — read at
// run time, never assumed to be today's constants, because a future
// revision of this file could change them without the pack derivation
// noticing unless it goes through the manifest. `log8Scale`/`log8Decode`/
// `log8Encode` are the primitives (no object allocation, a precomputed
// `scale`), so a tight loop over millions of cells can reuse one `scale`
// instead of recomputing `Math.log10` and reallocating `{offset, maximum,
// levels}` per cell; `encodeSkyQualityRadiance`/`decodeSkyQualityRadiance`
// above are exactly `encodeLog8Radiance`/`decodeLog8Radiance` applied to
// this module's own constants, so their behaviour (and every existing test
// against them) is unchanged.
function log8Scale(offset, maximum) {
  return Math.log10(1 + maximum / offset);
}

function log8Decode(offset, scale, levels, level) {
  if (level === 0) return 0;
  return offset * (10 ** ((level * scale) / (levels - 1)) - 1);
}

function log8Encode(offset, scale, levels, radiance) {
  if (!(radiance > 0)) return 0;
  const level = Math.round(
    ((levels - 1) * Math.log10(1 + radiance / offset)) / scale,
  );
  if (level <= 0) return 0;
  return level >= levels - 1 ? levels - 1 : level;
}

export function encodeLog8Radiance({ offset, maximum, levels }, value) {
  const radiance = Number(value);
  if (!Number.isFinite(radiance)) return 0;
  return log8Encode(offset, log8Scale(offset, maximum), levels, radiance);
}

export function decodeLog8Radiance({ offset, maximum, levels }, value) {
  const level = Number(value);
  if (!Number.isInteger(level) || level < 0 || level > levels - 1) return null;
  return log8Decode(offset, log8Scale(offset, maximum), levels, level);
}

export function encodeSkyQualityRadiance(value) {
  return encodeLog8Radiance(
    {
      offset: skyQualityRadianceOffset,
      maximum: skyQualityRadianceMaximum,
      levels: skyQualityRadianceLevels,
    },
    value,
  );
}

export function decodeSkyQualityRadiance(value) {
  return decodeLog8Radiance(
    {
      offset: skyQualityRadianceOffset,
      maximum: skyQualityRadianceMaximum,
      levels: skyQualityRadianceLevels,
    },
    value,
  );
}

// ── Offline pack: block-averaged low-resolution variant ─────────────────
//
// 12's offline pack ships a coarser raster (6' by default) instead of the
// full-resolution one the portal serves live: 9x fewer bytes for an estimate
// that is already no sharper than the propagation kernel's own multi-cell
// averaging (packages/portal/scripts/sky-quality-kernel.mjs).
// `deriveSkyQualityPackGrid` is the SINGLE definition of that reduction,
// called both by packages/portal/scripts/prepare-sky-quality-raster.mjs
// (`--pack-arcminutes`, at preparation time) and by
// packages/portal/src/planner/sky-quality.server.js (lazily, memoized on
// disk, the first time a portal needs one) — one algorithm, so the two can
// never disagree about what a "6' raster" is.
//
// Each output cell averages an exact `factor` × `factor` block of source
// cells (the caller guarantees an exact, remainder-free tiling; this
// function only asserts it). The average is over DECODED radiances, never
// over the 8-bit levels — the mean of two log-scaled bytes is not the log of
// their mean radiance — weighted by each source ROW's cell area, the same
// `sin(φ_north) − sin(φ_south)` rule prepare-sky-quality-raster.mjs's own
// resampling uses. A block's rows do not all carry the same weight (a block
// straddling a change of latitude has a taller cell nearer the equator), but
// every column of one row does, so each row's weight is computed once and
// reused across the block's columns.
export function deriveSkyQualityPackGrid(source, encoding, factor) {
  const width = Number(source?.width);
  const height = Number(source?.height);
  const cellSizeDegrees = Number(source?.cellSizeDegrees);
  const north = Number.isFinite(Number(source?.north))
    ? Number(source.north)
    : 90;
  const west = Number.isFinite(Number(source?.west))
    ? Number(source.west)
    : -180;
  const data = source?.data;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    !Number.isFinite(cellSizeDegrees) ||
    cellSizeDegrees <= 0 ||
    !data ||
    data.length !== width * height
  )
    throw new Error("deriveSkyQualityPackGrid: invalid source grid.");
  if (!Number.isInteger(factor) || factor < 1)
    throw new Error(
      `deriveSkyQualityPackGrid: factor must be a positive integer, got ${factor}.`,
    );
  if (width % factor !== 0 || height % factor !== 0)
    throw new Error(
      `deriveSkyQualityPackGrid: ${width}×${height} is not an exact ` +
        `multiple of factor ${factor}.`,
    );
  const offset = Number(encoding?.offset);
  const maximum = Number(encoding?.maximum);
  const levels = Number(encoding?.levels);
  if (
    !Number.isFinite(offset) ||
    offset <= 0 ||
    !Number.isFinite(maximum) ||
    maximum <= offset ||
    !Number.isInteger(levels) ||
    levels < 2
  )
    throw new Error("deriveSkyQualityPackGrid: invalid encoding parameters.");

  const scale = log8Scale(offset, maximum);
  const radians = Math.PI / 180;
  const outWidth = width / factor;
  const outHeight = height / factor;
  const outData = Buffer.alloc(outWidth * outHeight);
  const rowWeight = new Float64Array(factor);
  let populatedCells = 0;

  for (let outRow = 0; outRow < outHeight; outRow += 1) {
    let blockWeight = 0;
    for (let dy = 0; dy < factor; dy += 1) {
      const row = outRow * factor + dy;
      const top = north - row * cellSizeDegrees;
      const bottom = top - cellSizeDegrees;
      const weight = Math.sin(top * radians) - Math.sin(bottom * radians);
      rowWeight[dy] = weight;
      blockWeight += weight * factor;
    }
    const outBase = outRow * outWidth;
    for (let outColumn = 0; outColumn < outWidth; outColumn += 1) {
      let sum = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        const weight = rowWeight[dy];
        if (!(weight > 0)) continue;
        const row = outRow * factor + dy;
        const base = row * width + outColumn * factor;
        for (let dx = 0; dx < factor; dx += 1) {
          const level = data[base + dx];
          if (!level) continue; // decode(0) === 0: nothing to add.
          sum += log8Decode(offset, scale, levels, level) * weight;
        }
      }
      const mean = blockWeight > 0 ? sum / blockWeight : 0;
      const outLevel = log8Encode(offset, scale, levels, mean);
      if (outLevel > 0) populatedCells += 1;
      outData[outBase + outColumn] = outLevel;
    }
  }

  return {
    width: outWidth,
    height: outHeight,
    cellSizeDegrees: cellSizeDegrees * factor,
    north,
    west,
    data: outData,
    populatedCells,
  };
}

// The default offline-pack resolution: 6' is the coarsest
// integer multiple of 2' that keeps the file under the "socle" budget
// (3600 × 1800 = 6 480 000 bytes) while staying a whole number of arc-minutes
// (60 % 6 === 0), so the grid tiles the sphere exactly the way every other
// arcminutes value in this pipeline does.
export const skyQualityPackDefaultArcminutes = 6;

/**
 * Builds `sky-quality/pack/manifest.json` from the installed source raster's
 * OWN manifest: same shape, so a reader of the source manifest accepts it
 * unmodified (it only ever needs `grid.{width,height,cellSizeDegrees,north,
 * west}`, top-level `attribution` and `year`/`source.year`).
 * `grid`, `file`, `checksum`, `generatedAt` and `resampling` are overridden
 * for the derived variant; everything else (`attribution`, `license`,
 * `year`, `encoding`, …) is carried over unchanged. `derivedFrom` is the new
 * field this manifest adds: exactly what the pack was derived from and at
 * what checksum, which is what `ensureSkyQualityPackRaster`
 * (packages/portal/src/planner/sky-quality.server.js) compares against the
 * CURRENTLY installed source raster to decide whether to re-derive.
 */
export function skyQualityPackManifest(
  sourceManifest,
  grid,
  {
    factor,
    checksum,
    file = "raster.bin",
    generatedAt = new Date().toISOString(),
  },
) {
  return {
    ...sourceManifest,
    checksum: `sha256:${checksum}`,
    derivedFrom: {
      checksum: sourceManifest.checksum,
      cellSizeDegrees: sourceManifest.grid.cellSizeDegrees,
      width: sourceManifest.grid.width,
      height: sourceManifest.grid.height,
    },
    file,
    generatedAt,
    grid: {
      bytes: grid.width * grid.height,
      cellSizeDegrees: grid.cellSizeDegrees,
      height: grid.height,
      north: grid.north,
      populatedCells: grid.populatedCells,
      west: grid.west,
      width: grid.width,
    },
    resampling:
      `area-weighted ${factor}×${factor} block mean of decoded ` +
      "radiances from the installed raster (see `derivedFrom`), " +
      "re-encoded with the same log scale recorded under `encoding`.",
  };
}

// A grid is {width, height, north, west, cellSizeDegrees, data}: row 0 is the
// northern edge, column 0 the western edge, and `data` is indexable by
// `row * width + column` (a Buffer on the server, a plain array in fixtures).
// A grid whose width spans a full 360° wraps in longitude; every grid clamps
// in latitude.
function gridGeometry(grid) {
  const width = Number(grid?.width);
  const height = Number(grid?.height);
  const cellSizeDegrees = Number(grid?.cellSizeDegrees);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    !Number.isFinite(cellSizeDegrees) ||
    cellSizeDegrees <= 0 ||
    !grid?.data
  )
    return null;
  const north = Number.isFinite(Number(grid.north)) ? Number(grid.north) : 90;
  const west = Number.isFinite(Number(grid.west)) ? Number(grid.west) : -180;
  return {
    width,
    height,
    cellSizeDegrees,
    north,
    west,
    data: grid.data,
    wraps: Math.abs(width * cellSizeDegrees - 360) < 1e-9,
  };
}

function gridColumn(geometry, column) {
  if (geometry.wraps) {
    const wrapped = column % geometry.width;
    return wrapped < 0 ? wrapped + geometry.width : wrapped;
  }
  return column < 0
    ? 0
    : column > geometry.width - 1
      ? geometry.width - 1
      : column;
}

function gridRow(geometry, row) {
  return row < 0 ? 0 : row > geometry.height - 1 ? geometry.height - 1 : row;
}

function gridRadiance(geometry, row, column) {
  const index =
    gridRow(geometry, row) * geometry.width + gridColumn(geometry, column);
  const level = geometry.data[index];
  return decodeSkyQualityRadiance(level === undefined ? null : Number(level));
}

// Continuous cell coordinates of a position: cell (row, column) is centred on
// north - (row + 0.5) * size and west + (column + 0.5) * size.
function gridPosition(geometry, latitude, longitude) {
  const latitudeValue = Number(latitude);
  const longitudeValue = Number(longitude);
  if (
    !Number.isFinite(latitudeValue) ||
    !Number.isFinite(longitudeValue) ||
    latitudeValue < -90 ||
    latitudeValue > 90 ||
    longitudeValue < -180 ||
    longitudeValue > 180
  )
    return null;
  let east = (longitudeValue - geometry.west) / geometry.cellSizeDegrees - 0.5;
  if (geometry.wraps) {
    east %= geometry.width;
    if (east < 0) east += geometry.width;
  }
  return {
    x: east,
    y: (geometry.north - latitudeValue) / geometry.cellSizeDegrees - 0.5,
  };
}

// The raw cell the position falls in: the service's first lookup, kept as the
// value a bilinear refinement degenerates to at the grid's latitude edges.
export function nearestSkyQualityRadiance(grid, latitude, longitude) {
  const geometry = gridGeometry(grid);
  if (!geometry) return null;
  const position = gridPosition(geometry, latitude, longitude);
  if (!position) return null;
  return gridRadiance(geometry, Math.round(position.y), Math.round(position.x));
}

// Bilinear refinement across the four cells surrounding the position. The
// interpolation runs on decoded radiances, never on encoded levels: the mean
// of two radiances is meaningful, the mean of two log-scaled bytes is not.
export function sampleSkyQualityRadiance(grid, latitude, longitude) {
  const geometry = gridGeometry(grid);
  if (!geometry) return null;
  const position = gridPosition(geometry, latitude, longitude);
  if (!position) return null;
  const column = Math.floor(position.x);
  const row = Math.floor(position.y);
  const columnFraction = position.x - column;
  const rowFraction = position.y - row;
  const northWest = gridRadiance(geometry, row, column);
  const northEast = gridRadiance(geometry, row, column + 1);
  const southWest = gridRadiance(geometry, row + 1, column);
  const southEast = gridRadiance(geometry, row + 1, column + 1);
  if (
    northWest === null ||
    northEast === null ||
    southWest === null ||
    southEast === null
  )
    return null;
  const north = northWest + (northEast - northWest) * columnFraction;
  const south = southWest + (southEast - southWest) * columnFraction;
  return north + (south - north) * rowFraction;
}

export function normalizeSkyQuality(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const bortleClass = Number(value.bortleClass);
  if (!Number.isInteger(bortleClass) || bortleClass < 1 || bortleClass > 9)
    return null;
  const sqm =
    value.sqm === null || value.sqm === undefined ? null : Number(value.sqm);
  return {
    bortleClass,
    sqm: Number.isFinite(sqm) ? sqm : null,
    source: text(value.source),
    method: text(value.method),
    estimated: value.estimated !== false,
    calculatedAt: text(value.calculatedAt),
  };
}
