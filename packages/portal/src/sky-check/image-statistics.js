/**
 * What a small colour thumbnail (nearest-neighbour, so flat colours stay
 * exact) says about an image beyond its stars: how bright and how
 * colourful it is, how much of it is flat colour (a screenshot, a
 * document, a drawing), how many sharp edges it holds, and whether its top
 * is brighter and bluer than its bottom (a sky over a landscape).
 */

export function thumbnailStatistics({ width, height, channels, data }) {
  const count = width * height;
  let lumaSum = 0;
  let saturationSum = 0;
  let vivid = 0;
  let bright = 0;
  let dark = 0;
  const luma = new Float32Array(count);
  const colours = new Map();
  for (let index = 0; index < count; index += 1) {
    const at = index * channels;
    const r = data[at] / 255;
    const g = data[at + 1] / 255;
    const b = data[at + 2] / 255;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luma[index] = y;
    lumaSum += y;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max > 0 ? (max - min) / max : 0;
    saturationSum += saturation;
    if (saturation > 0.5 && max > 0.25) vivid += 1;
    if (y > 0.6) bright += 1;
    if (y < 0.1) dark += 1;
    const key = (data[at] << 16) | (data[at + 1] << 8) | data[at + 2];
    colours.set(key, (colours.get(key) || 0) + 1);
  }
  const frequencies = [...colours.values()].sort((a, b) => b - a);
  const topEight = frequencies
    .slice(0, 8)
    .reduce((sum, value) => sum + value, 0);
  let edges = 0;
  let pairs = 0;
  let equalNeighbours = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const here = luma[y * width + x];
      if (x + 1 < width) {
        pairs += 1;
        if (Math.abs(here - luma[y * width + x + 1]) > 0.15) edges += 1;
        const at = (y * width + x) * channels;
        if (
          data[at] === data[at + channels] &&
          data[at + 1] === data[at + channels + 1] &&
          data[at + 2] === data[at + channels + 2]
        )
          equalNeighbours += 1;
      }
      if (y + 1 < height) {
        pairs += 1;
        if (Math.abs(here - luma[(y + 1) * width + x]) > 0.15) edges += 1;
      }
    }
  }
  const third = Math.max(1, Math.floor(height / 3));
  const band = (from, to) => {
    let sum = 0;
    let blue = 0;
    let n = 0;
    for (let y = from; y < to; y += 1)
      for (let x = 0; x < width; x += 1) {
        const at = (y * width + x) * channels;
        sum += luma[y * width + x];
        blue += (data[at + 2] - data[at]) / 255;
        n += 1;
      }
    return { luma: sum / n, blue: blue / n };
  };
  const top = band(0, third);
  const bottom = band(height - third, height);
  // How smooth a band is (the mean step of luma between neighbours): a sky
  // is smooth, the ground under it is not.
  const texture = (from, to) => {
    let sum = 0;
    let n = 0;
    for (let y = from; y < to; y += 1)
      for (let x = 0; x + 1 < width; x += 1) {
        sum += Math.abs(luma[y * width + x] - luma[y * width + x + 1]);
        n += 1;
      }
    return n ? sum / n : 0;
  };
  // What the top third is made of: dark (a night), blue (a day, a dusk,
  // a twilight), bright grey (an overcast day), white (paper, a wall, a
  // burnt sky), warm (a sunset).
  let topDark = 0;
  let topBlue = 0;
  let topGrey = 0;
  let topWhite = 0;
  let topWarm = 0;
  for (let y = 0; y < third; y += 1)
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * channels;
      const r = data[at];
      const g = data[at + 1];
      const b = data[at + 2];
      const y0 = luma[y * width + x];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max > 0 ? (max - min) / max : 0;
      if (y0 < 0.12) topDark += 1;
      else if (y0 > 0.92 && saturation < 0.1) topWhite += 1;
      else if (b > r && b >= g) topBlue += 1;
      else if (saturation < 0.15 && y0 > 0.5) topGrey += 1;
      else if (r > b && y0 > 0.3) topWarm += 1;
    }
  const topPixels = Math.max(1, third * width);
  const sortedLuma = Float32Array.from(luma).sort();
  const lumaAt = (share) =>
    sortedLuma[Math.min(count - 1, Math.floor(share * (count - 1)))];
  return {
    meanLuma: lumaSum / count,
    meanSaturation: saturationSum / count,
    vividFraction: vivid / count,
    brightFraction: bright / count,
    darkFraction: dark / count,
    // The share of the pixels painted in the eight most used exact colours.
    flatColourShare: topEight / count,
    distinctColourRatio: colours.size / count,
    // The share of side-by-side pixels of exactly the same colour: painted
    // areas (a drawing, a screenshot, a clipped black background), where
    // a photograph's noise makes neighbours differ.
    equalNeighbourShare: equalNeighbours / Math.max(1, height * (width - 1)),
    edgeDensity: pairs ? edges / pairs : 0,
    topMinusBottomLuma: top.luma - bottom.luma,
    topBlueness: top.blue,
    topTexture: texture(0, third),
    bottomTexture: texture(height - third, height),
    topDarkShare: topDark / topPixels,
    topBlueShare: topBlue / topPixels,
    topGreyShare: topGrey / topPixels,
    topWhiteShare: topWhite / topPixels,
    topWarmShare: topWarm / topPixels,
    lumaMedian: lumaAt(0.5),
    lumaP99: lumaAt(0.99),
  };
}
