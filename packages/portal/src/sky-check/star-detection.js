/**
 * Finding the stars of a frame. The background and its
 * noise by tiles (median and median absolute deviation from the lower
 * quartile, smoothed over the neighbouring tiles), a threshold a few noise
 * widths over it, the connected groups of pixels above it (8-connectivity),
 * a weighted centroid and the second moments of each (width and
 * elongation); single hot pixels and large saturated blobs dropped. The
 * defaults suit a frame of about 2000 px on its long side.
 *
 * Added for the sky check, beside the port: the count of every star (not
 * only the brightest kept), their spread over a finer grid, and the share
 * of the frame's area that stands over the threshold.
 */

export const STAR_DETECTION_DEFAULTS = Object.freeze({
  tileSize: 32,
  thresholdSigma: 5,
  maxStars: 4000,
  minArea: 1,
  hotPixelSharpness: 0.25,
  maxSaturatedArea: 60,
  maxStarArea: 400,
  shapeStars: 25,
  cloudFraction: 0.15,
});

function median(values) {
  if (!values.length) return Number.NaN;
  const sorted = Float64Array.from(values).sort();
  const middle = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** A 3 × 3 median over the tile grid. */
function medianFilter(grid, columns, rows) {
  const out = new Float64Array(grid.length);
  const window = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      window.length = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const r = row + dy;
        if (r < 0 || r >= rows) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const c = column + dx;
          if (c >= 0 && c < columns) window.push(grid[r * columns + c]);
        }
      }
      out[row * columns + column] = median(window);
    }
  }
  return out;
}

function fitQuadratic(levels, columns, rows, used) {
  const n = 6;
  const a = Array.from({ length: n }, () => new Float64Array(n + 1));
  for (let index = 0; index < levels.length; index += 1) {
    if (!used[index]) continue;
    const u = ((index % columns) / (columns - 1)) * 2 - 1;
    const v = (Math.floor(index / columns) / (rows - 1)) * 2 - 1;
    const basis = [1, u, v, u * u, u * v, v * v];
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) a[i][j] += basis[i] * basis[j];
      a[i][n] += basis[i] * levels[index];
    }
  }
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1)
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    if (Math.abs(a[pivot][column]) < 1e-12) return null;
    [a[column], a[pivot]] = [a[pivot], a[column]];
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = a[row][column] / a[column][column];
      for (let k = column; k <= n; k += 1) a[row][k] -= factor * a[column][k];
    }
  }
  return Array.from({ length: n }, (_, i) => a[i][n] / a[i][i]);
}

function evaluate(c, index, columns, rows) {
  const u = ((index % columns) / (columns - 1)) * 2 - 1;
  const v = (Math.floor(index / columns) / (rows - 1)) * 2 - 1;
  return (
    c[0] + c[1] * u + c[2] * v + c[3] * u * u + c[4] * u * v + c[5] * v * v
  );
}

/** The share of tiles standing over a smooth surface (a lit cloud). */
function cloudFraction(levels, columns, rows, noise) {
  if (columns < 4 || rows < 4) return 0;
  let coefficients = null;
  const used = new Array(levels.length).fill(true);
  for (let pass = 0; pass < 5; pass += 1) {
    coefficients = fitQuadratic(levels, columns, rows, used);
    if (!coefficients) return 0;
    const residuals = Array.from(
      levels,
      (level, index) => level - evaluate(coefficients, index, columns, rows),
    );
    const kept = residuals.filter((_, index) => used[index]).map(Math.abs);
    const spread = Math.max(1e-6, median(kept) * 1.4826);
    for (let index = 0; index < levels.length; index += 1)
      used[index] = residuals[index] <= 2 * spread;
  }
  let standing = 0;
  for (let index = 0; index < levels.length; index += 1)
    if (
      levels[index] - evaluate(coefficients, index, columns, rows) >
      0.5 * noise
    )
      standing += 1;
  return standing / levels.length;
}

/** The background and noise by tiles, interpolated between tile centres. */
function measureBackground(frame, tileSize) {
  const { width, height, pixels } = frame;
  const columns = Math.max(1, Math.ceil(width / tileSize));
  const rows = Math.max(1, Math.ceil(height / tileSize));
  const levels = new Float64Array(columns * rows);
  const noises = new Float64Array(columns * rows);
  const sample = new Float32Array(tileSize * tileSize);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      let count = 0;
      const y1 = Math.min(height, (row + 1) * tileSize);
      const x1 = Math.min(width, (column + 1) * tileSize);
      for (let y = row * tileSize; y < y1; y += 1)
        for (let x = column * tileSize + (y & 1); x < x1; x += 2)
          sample[count++] = pixels[y * width + x];
      if (count === 0) {
        sample[count++] =
          pixels[Math.min(pixels.length - 1, row * tileSize * width)];
      }
      const values = sample.subarray(0, count).sort();
      const middle = values[count >> 1];
      const lowerQuartile = values[count >> 2];
      levels[row * columns + column] = middle;
      noises[row * columns + column] = Math.max(
        frame.noiseFloor ?? 0.5,
        (middle - lowerQuartile) / 0.6745,
      );
    }
  }
  const smoothLevels = medianFilter(levels, columns, rows);
  const smoothNoises = medianFilter(noises, columns, rows);
  const medianLevel = median(smoothLevels);
  const medianNoise = median(smoothNoises);
  const interpolate = (grid, x, y) => {
    const gx = Math.min(Math.max((x + 0.5) / tileSize - 0.5, 0), columns - 1);
    const gy = Math.min(Math.max((y + 0.5) / tileSize - 0.5, 0), rows - 1);
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const xa = Math.min(columns - 1, x0 + 1);
    const ya = Math.min(rows - 1, y0 + 1);
    const fx = gx - x0;
    const fy = gy - y0;
    const top =
      grid[y0 * columns + x0] * (1 - fx) + grid[y0 * columns + xa] * fx;
    const bottom =
      grid[ya * columns + x0] * (1 - fx) + grid[ya * columns + xa] * fx;
    return top * (1 - fy) + bottom * fy;
  };
  return {
    columns,
    rows,
    levels: smoothLevels,
    noises: smoothNoises,
    rawNoises: noises,
    medianLevel,
    medianNoise,
    cloudFraction: cloudFraction(smoothLevels, columns, rows, medianNoise),
    levelAt: (x, y) => interpolate(smoothLevels, x, y),
    noiseAt: (x, y) => interpolate(smoothNoises, x, y),
    fillRow(y, levelRow, noiseRow) {
      for (let x = 0; x < width; x += 1) {
        levelRow[x] = interpolate(smoothLevels, x, y);
        noiseRow[x] = interpolate(smoothNoises, x, y);
      }
    },
  };
}

/** The centroid, flux, width and elongation of a star around its peak. */
function measureStar(frame, background, peakX, peakY, radius, labels, label) {
  const { width, height, pixels } = frame;
  let centreX = peakX + 0.5;
  let centreY = peakY + 0.5;
  let flux = 0;
  let peak = 0;
  let mxx = 0;
  let myy = 0;
  let mxy = 0;
  for (let pass = 0; pass < 2; pass += 1) {
    const cx = Math.floor(centreX);
    const cy = Math.floor(centreY);
    let sum = 0;
    let sumX = 0;
    let sumY = 0;
    let sumXX = 0;
    let sumYY = 0;
    let sumXY = 0;
    peak = 0;
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      if (y < 0 || y >= height) continue;
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        if (x < 0 || x >= width) continue;
        // The core of a neighbouring star is not this star's light (a
        // crowded field otherwise reads two blended stars as one elongated
        // star).
        const owner = labels[y * width + x];
        if (owner !== 0 && owner !== label) continue;
        const above = pixels[y * width + x] - background.levelAt(x, y);
        if (above <= background.noiseAt(x, y)) continue;
        const px = x + 0.5;
        const py = y + 0.5;
        sum += above;
        sumX += above * px;
        sumY += above * py;
        sumXX += above * px * px;
        sumYY += above * py * py;
        sumXY += above * px * py;
        if (above > peak) peak = above;
      }
    }
    if (sum <= 0) return null;
    centreX = sumX / sum;
    centreY = sumY / sum;
    flux = sum;
    mxx = sumXX / sum - centreX * centreX;
    myy = sumYY / sum - centreY * centreY;
    mxy = sumXY / sum - centreX * centreY;
  }
  let halfMaximum = 0;
  const cx = Math.floor(centreX);
  const cy = Math.floor(centreY);
  const reach = radius + 2;
  for (let y = cy - reach; y <= cy + reach; y += 1) {
    if (y < 0 || y >= height) continue;
    for (let x = cx - reach; x <= cx + reach; x += 1) {
      if (x < 0 || x >= width) continue;
      const owner = labels[y * width + x];
      if (owner !== 0 && owner !== label) continue;
      if (pixels[y * width + x] - background.levelAt(x, y) >= peak / 2)
        halfMaximum += 1;
    }
  }
  const trace = mxx + myy;
  const spread = Math.sqrt(
    Math.max(0, ((mxx - myy) * (mxx - myy)) / 4 + mxy * mxy),
  );
  const major = Math.max(1e-6, trace / 2 + spread);
  const minor = Math.max(1e-6, trace / 2 - spread);
  return {
    x: centreX,
    y: centreY,
    flux,
    peak,
    widthPixels: 2 * Math.sqrt(halfMaximum / Math.PI),
    elongation: Math.sqrt(major / minor),
  };
}

/** Counts stars per cell of a `columns × rows` grid. */
function cellCounts(stars, width, height, columns, rows) {
  const counts = new Array(columns * rows).fill(0);
  for (const star of stars) {
    const column = Math.min(
      columns - 1,
      Math.max(0, Math.floor((star.x / width) * columns)),
    );
    const row = Math.min(
      rows - 1,
      Math.max(0, Math.floor((star.y / height) * rows)),
    );
    counts[row * columns + column] += 1;
  }
  return counts;
}

/**
 * Finds the stars of `frame` (`{ width, height, pixels: Float32Array,
 * saturation }`, linear or display units) and measures what they say
 * about it. `deadline` (a `performance.now()` time) stops a slow frame:
 * the answer then carries `timedOut: true`.
 */
export function detectStars(frame, options = {}, deadline = Infinity) {
  const settings = { ...STAR_DETECTION_DEFAULTS, ...options };
  const { width, height, pixels } = frame;
  const background = measureBackground(frame, settings.tileSize);
  // 0: under the threshold; -1: over it, not yet grouped; n > 0: group n.
  const mask = new Int32Array(width * height);
  const levelRow = new Float64Array(width);
  const noiseRow = new Float64Array(width);
  let maskedPixels = 0;
  for (let y = 0; y < height; y += 1) {
    if ((y & 63) === 0 && performance.now() > deadline)
      return { timedOut: true };
    background.fillRow(y, levelRow, noiseRow);
    const offset = y * width;
    for (let x = 0; x < width; x += 1) {
      if (
        pixels[offset + x] - levelRow[x] >
        settings.thresholdSigma * noiseRow[x]
      ) {
        mask[offset + x] = -1;
        maskedPixels += 1;
      }
    }
  }
  const saturation = frame.saturation * 0.98;
  const stars = [];
  let hotPixels = 0;
  let blobs = 0;
  let extended = 0;
  let extendedArea = 0;
  const stack = new Int32Array(width * height);
  let label = 0;
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] !== -1) continue;
    label += 1;
    if ((stars.length & 255) === 0 && performance.now() > deadline)
      return { timedOut: true };
    let top = 0;
    stack[top++] = start;
    mask[start] = label;
    let area = 0;
    let saturatedArea = 0;
    let peakIndex = start;
    let peakValue = -Infinity;
    while (top > 0) {
      const index = stack[--top];
      area += 1;
      const value = pixels[index];
      if (value >= saturation) saturatedArea += 1;
      if (value > peakValue) {
        peakValue = value;
        peakIndex = index;
      }
      const px = index % width;
      const py = (index - px) / width;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = py + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = px + dx;
          if (nx < 0 || nx >= width) continue;
          const neighbour = ny * width + nx;
          if (mask[neighbour] === -1) {
            mask[neighbour] = label;
            stack[top++] = neighbour;
          }
        }
      }
    }
    if (area < settings.minArea) continue;
    if (saturatedArea > settings.maxSaturatedArea) {
      blobs += 1;
      extendedArea += area;
      continue;
    }
    if (area > settings.maxStarArea) {
      // A large group that is not saturated: nebula, a lit cloud, a
      // landscape's bright part — never a star.
      extended += 1;
      extendedArea += area;
      continue;
    }
    const peakX = peakIndex % width;
    const peakY = (peakIndex - peakX) / width;
    const peakLevel = background.levelAt(peakX, peakY);
    const peakAbove = peakValue - peakLevel;
    if (area <= 2 && peakValue < saturation) {
      let strongest = 0;
      for (const [sx, sy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = peakX + sx;
        const ny = peakY + sy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const above = pixels[ny * width + nx] - peakLevel;
        if (above > strongest) strongest = above;
      }
      if (strongest < settings.hotPixelSharpness * peakAbove) {
        hotPixels += 1;
        continue;
      }
    }
    const radius = Math.min(12, Math.max(3, Math.ceil(Math.sqrt(area) * 1.2)));
    const star = measureStar(
      frame,
      background,
      peakX,
      peakY,
      radius,
      mask,
      label,
    );
    if (star) stars.push({ ...star, area, saturated: saturatedArea > 0 });
  }
  const count = stars.length;
  const coarse = cellCounts(stars, width, height, 4, 3);
  const fine = cellCounts(stars, width, height, 8, 6);
  const sortedCoarse = [...coarse].sort((a, b) => a - b);
  const clear = sortedCoarse[(sortedCoarse.length * 3) >> 2];
  const emptyCellFraction =
    clear < 6
      ? 0
      : coarse.filter((value) => value < clear / 6).length / coarse.length;
  stars.sort((a, b) => b.flux - a.flux);
  const shaped = stars
    .filter((star) => !star.saturated)
    .slice(0, settings.shapeStars);
  const megapixels = (width * height) / 1e6;
  // How alike the stars are: one optical system gives every star the same
  // spread of light, so their widths and their peak-to-flux ratios vary
  // little; the bright points of a textured scene (leaves, rocks, a face)
  // vary a lot. Interquartile range over the median, on up to 300 of the
  // brightest unsaturated stars.
  const sample = stars.filter((star) => !star.saturated).slice(0, 300);
  const spread = (values) => {
    if (values.length < 10) return null;
    const sorted = Float64Array.from(values).sort();
    const quartile = (share) => sorted[Math.floor(share * (sorted.length - 1))];
    const middle = quartile(0.5);
    return middle > 0 ? (quartile(0.75) - quartile(0.25)) / middle : null;
  };
  // The share of tiles whose own noise stands well over the frame's: a
  // textured scene, where the sky between the stars is smooth.
  const noiseMedian = background.medianNoise;
  let textured = 0;
  for (const value of background.rawNoises)
    if (value > 3 * noiseMedian) textured += 1;
  return {
    timedOut: false,
    starCount: count,
    starsPerMegapixel: count / megapixels,
    // The share of the 8 × 6 cells holding at least two stars: stars spread
    // over the whole frame, or only over a part of it.
    fineCellCoverage: fine.filter((value) => value >= 2).length / fine.length,
    // The emptiest cells against the typical one (8 × 6 cells): the stars
    // of a telescope's field fill the frame evenly; a foreground (a
    // landscape, a person, a building) leaves cells nearly empty.
    cellDensityFloor: (() => {
      const sorted = [...fine].sort((a, b) => a - b);
      const typical = sorted[sorted.length >> 1];
      return typical > 0
        ? sorted[Math.floor(sorted.length * 0.1)] / typical
        : 0;
    })(),
    // The share of the 4 × 3 cells holding at least one star.
    coarseCellCoverage:
      coarse.filter((value) => value >= 1).length / coarse.length,
    emptyCellFraction,
    // The emptiest of 16 horizontal and 16 vertical strips against the
    // typical strip: a horizon, the ground under a person or a wall at
    // any edge leaves a strip without stars; a telescope's field does not.
    stripDensityFloor: (() => {
      const rowsOf = new Array(16).fill(0);
      const columnsOf = new Array(16).fill(0);
      for (const star of stars) {
        rowsOf[Math.min(15, Math.floor((star.y / height) * 16))] += 1;
        columnsOf[Math.min(15, Math.floor((star.x / width) * 16))] += 1;
      }
      const all = [...rowsOf, ...columnsOf].sort((a, b) => a - b);
      const typical = all[all.length >> 1];
      return typical > 0 ? all[0] / typical : 0;
    })(),
    medianWidthPixels:
      shaped.length < 3 ? null : median(shaped.map((star) => star.widthPixels)),
    medianElongation:
      shaped.length < 3 ? null : median(shaped.map((star) => star.elongation)),
    backgroundLevel: background.medianLevel / frame.saturation,
    noiseLevel: background.medianNoise / frame.saturation,
    cloudFraction: background.cloudFraction,
    hotPixelsRejected: hotPixels,
    blobsRejected: blobs,
    extendedGroups: extended,
    // The share of the frame over the threshold that is not a star.
    extendedAreaFraction: extendedArea / (width * height),
    maskedFraction: maskedPixels / (width * height),
    widthSpread: spread(sample.map((star) => star.widthPixels)),
    profileSpread: spread(sample.map((star) => star.peak / star.flux)),
    texturedTileFraction: textured / background.rawNoises.length,
    // The share of the stars in the top half of the frame: about one half
    // for a telescope's field, near all of them over a landscape.
    topHalfStarShare: count
      ? stars.filter((star) => star.y < height / 2).length / count
      : null,
    stars: stars.slice(0, settings.maxStars),
  };
}
