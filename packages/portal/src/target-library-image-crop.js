/**
 * A declared crop of a target-library source image.
 *
 * NASA's picture of Venus, PIA23791, is a comparison board: two discs side by
 * side, the natural view on the left and the contrast-enhanced one on the
 * right, with a white vertical rule between them. Shown as it is, the card
 * reads as a double image with a stroke across it. The source record
 * (`astro-core/solar-system-image-sources.js`) declares the crop it wants,
 * `crop: "left-half"`, and the import
 * (`scripts/import-solar-system-images.mjs`) applies it here, with `sharp`,
 * to the file it downloads: same source, same licence, same pipeline, and
 * the file stays out of the repository like every other picture.
 *
 * `sharp` is loaded when a crop is applied, never when this module loads.
 */

export const targetLibraryImageCrops = ["left-half"];

// Never trim more than this share of the half to find the picture's rule.
const maximumRuleShare = 0.1;
// A column whose every pixel is at least this bright (of 255) is the
// picture's white rule, or its anti-aliased edge; no planet's disc reaches
// it from the top of the picture to the bottom.
const ruleBrightness = 128;

/**
 * `image` (a JPEG or PNG buffer) cut as `crop` says, as a JPEG buffer.
 *
 * `left-half`: the left half of the picture, without the part of the
 * picture's white rule that falls in it (the rule is centred on the middle,
 * so a plain halving keeps its left half): the columns at the cut whose
 * pixels are all bright are dropped. A picture without a rule is simply
 * halved.
 */
export async function cropTargetLibraryImage(image, crop) {
  if (!targetLibraryImageCrops.includes(crop))
    throw new Error(`Unknown image crop: ${crop}`);
  const { default: sharp } = await import("sharp");
  const { width, height } = await sharp(image).metadata();
  const half = Math.floor(width / 2);
  const { data, info } = await sharp(image)
    .extract({ left: 0, top: 0, width: half, height })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const isRule = (column) => {
    for (let row = 0; row < info.height; row += 1)
      if (data[row * info.width + column] < ruleBrightness) return false;
    return true;
  };
  let kept = half;
  const limit = Math.floor(half * (1 - maximumRuleShare));
  while (kept > limit && isRule(kept - 1)) kept -= 1;
  return sharp(image)
    .extract({ left: 0, top: 0, width: kept, height })
    .jpeg({ quality: 90 })
    .toBuffer();
}
