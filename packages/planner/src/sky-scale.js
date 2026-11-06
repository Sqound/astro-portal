// The numbered scale of the sky's light pollution: nine steps, one per Bortle
// class. In the core, where "Cette nuit" draws it in the Bortle dialog and the
// continuous scale of the sky background takes its colours; the geographic
// light map, when a shell registers one, re-exports it.
//
// The geographic map no longer wears the horizon map's brown ramp (12 % → 46 %,
// transparent from 21,6), which hid every dark class. It wears its own
// range, blue → magenta, one token per class at the middle of the class,
// the colour interpolated continuously between the middles
// (`lightMapColor`), and ONE opacity for every class (`lightMapLayerAlpha`,
// 65 %, adjustable by a setting of the map). Each step of the scale is its
// token at that opacity over the map's dark base, so the legend shows what
// the map shows. Red mode has its own tokens of increasing lightness
// (`lightMapRampNight`): under the night filter every hue is one red, so
// only the lightness can carry the class. The horizon map keeps its own
// ramp (`horizon-light-layer.js`).
//
// The class bounds are those of `bortleFromSqm` (`portal/sky-quality.js`). The
// scale's ends are the first and last bound to one decimal: 22,0 and 17,0.
// Class 9 has no lower bound; its middle is taken at 16.5.

/** The sky the scale starts from (class 1's upper end). */
export const lightMapScaleDarkEndSqm = 22.0;
/** The sky the scale ends at (class 8's lower bound; class 9 is brighter). */
export const lightMapScaleBrightEndSqm = 17.0;

// [class, the dark edge (the larger mag/arcsec²), the bright edge (the smaller)]
const classBounds = Object.freeze([
  [1, 22.0, 21.99],
  [2, 21.99, 21.89],
  [3, 21.89, 21.69],
  [4, 21.69, 20.49],
  [5, 20.49, 19.5],
  [6, 19.5, 18.94],
  [7, 18.94, 18.38],
  [8, 18.38, 17.0],
  [9, 17.0, 16.0],
]);

/** The dark base the transparent classes read as (the map's own dark). */
export const lightMapScaleBase = Object.freeze({
  red: 12,
  green: 18,
  blue: 14,
});

/** The day tokens, one per class (1 → 9), at the middle of the class. */
export const lightMapRamp = Object.freeze([
  "#2a4fd6",
  "#2f67e4",
  "#2f86e8",
  "#25b0d8",
  "#34c28a",
  "#9acb3c",
  "#f0c232",
  "#ef6a2e",
  "#cf2fa8",
]);

/** The red-mode tokens, one per class, of increasing lightness. */
export const lightMapRampNight = Object.freeze([
  "#5c1412",
  "#741a17",
  "#8e211d",
  "#a82a24",
  "#c2342c",
  "#da4338",
  "#ee5c4c",
  "#f9806e",
  "#ffb3a4",
]);

/** The layer's one opacity, every class alike (65 %). */
export const lightMapLayerAlpha = 0.65;

/** The setting of the map: 30 % to 100 % by 5 %. */
export const lightMapLayerAlphaRange = Object.freeze({
  minimum: 0.3,
  maximum: 1,
  step: 0.05,
});

/**
 * A wanted opacity brought into the setting's range and onto its 5 % steps;
 * anything unusable is the default 65 %.
 */
export function lightMapLayerAlphaOf(value) {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number))
    return lightMapLayerAlpha;
  const { minimum, maximum, step } = lightMapLayerAlphaRange;
  const clamped = Math.min(maximum, Math.max(minimum, number));
  return Math.round(Math.round(clamped / step) * step * 100) / 100;
}

const channels = (hex) => ({
  red: parseInt(hex.slice(1, 3), 16),
  green: parseInt(hex.slice(3, 5), 16),
  blue: parseInt(hex.slice(5, 7), 16),
});

const classMiddle = ([, upper, lower]) =>
  Math.round(((upper + lower) / 2) * 1000) / 1000;

/**
 * The layer's opaque colour for a sky brightness (mag/arcsec²):
 * `{ red, green, blue }`, interpolated between the tokens of the two class
 * middles around it; darker than class 1's middle is class 1's token,
 * brighter than class 9's is class 9's (magenta). `null` for an unusable
 * value. `night: true` reads the red-mode tokens.
 */
export function lightMapColor(sqm, { night = false } = {}) {
  const value = typeof sqm === "number" ? sqm : Number.NaN;
  if (!Number.isFinite(value)) return null;
  const ramp = night ? lightMapRampNight : lightMapRamp;
  const middles = classBounds.map(classMiddle);
  if (value >= middles[0]) return channels(ramp[0]);
  const last = middles.length - 1;
  if (value <= middles[last]) return channels(ramp[last]);
  let index = 1;
  while (index < last && middles[index] > value) index += 1;
  const dark = channels(ramp[index - 1]);
  const bright = channels(ramp[index]);
  const f =
    (middles[index - 1] - value) / (middles[index - 1] - middles[index]);
  const mix = (a, b) => Math.round(a + (b - a) * f);
  return {
    red: mix(dark.red, bright.red),
    green: mix(dark.green, bright.green),
    blue: mix(dark.blue, bright.blue),
  };
}

const hex = (channel) => channel.toString(16).padStart(2, "0");

/**
 * One step of the scale for a Bortle class (1 to 9): its bounds in
 * mag/arcsec², its middle, its `token`, and the opaque `colour` the legend
 * draws — the token at the layer's opacity (`alpha`, 65 % by default) over
 * the map's dark base, which is what the map shows there.
 */
export function lightMapScaleStep(
  bortle,
  { alpha = lightMapLayerAlpha, night = false } = {},
) {
  const index = classBounds.findIndex(([value]) => value === bortle);
  if (index < 0) return null;
  const [, upper, lower] = classBounds[index];
  const token = (night ? lightMapRampNight : lightMapRamp)[index];
  const top = channels(token);
  const opacity = lightMapLayerAlphaOf(alpha);
  const mix = (a, b) => Math.round(a * opacity + b * (1 - opacity));
  const red = mix(top.red, lightMapScaleBase.red);
  const green = mix(top.green, lightMapScaleBase.green);
  const blue = mix(top.blue, lightMapScaleBase.blue);
  return {
    bortle,
    darkEdgeSqm: upper,
    brightEdgeSqm: lower,
    middleSqm: classMiddle(classBounds[index]),
    wordKey: `bortleWord${bortle}`,
    token,
    colour: `#${hex(red)}${hex(green)}${hex(blue)}`,
    red,
    green,
    blue,
  };
}

/** The nine steps, darkest first. */
export const lightMapScaleSteps = (options) =>
  classBounds.map(([bortle]) => lightMapScaleStep(bortle, options));

/**
 * Where a sky background sits on the continuous scale, 0 (22,0, the darkest
 * sky) to 1 (17,0, the city sky), clamped.
 */
export function skyBrightnessScalePosition(sqm) {
  const position =
    (lightMapScaleDarkEndSqm - sqm) /
    (lightMapScaleDarkEndSqm - lightMapScaleBrightEndSqm);
  return Math.min(1, Math.max(0, position));
}

/**
 * The continuous scale's gradient (CSS), from the dark base to the nine
 * steps' colours, each at its middle's place.
 */
export function skyBrightnessScaleGradient() {
  const base = lightMapScaleBase;
  const stops = [
    `#${hex(base.red)}${hex(base.green)}${hex(base.blue)} 0%`,
    ...lightMapScaleSteps().map(
      (step) =>
        `${step.colour} ${Math.round(skyBrightnessScalePosition(step.middleSqm) * 1000) / 10}%`,
    ),
  ];
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}
