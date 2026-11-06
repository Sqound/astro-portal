// Red night mode of the web, pinned by the conformance fixture
// `night-mode-matrix` (`packages/astro-contracts/fixtures/spec/`).
//
// One global filter at the root of the page: the whole screen is collapsed
// onto the red channel alone (green and blue silenced, alpha untouched),
// scaled so that a full white never produces more than a chosen relative
// luminance. The colour matrix below is applied by an SVG `feColorMatrix`
// (`NightModeFilterDefs`) in sRGB.
//
// The setting belongs to the device (this browser): `localStorage`, never synchronised and never part of a plan. Every
// read and write is guarded: a storage that refuses leaves the page in day
// mode, working.

// Rec. 709 relative luminance shares of the red, green and blue primaries
// (they sum to 1): two colours that read equally bright by day still do at
// night, rather than a channel drop turning a bright cyan black.
const redShare = 0.2126;
const greenShare = 0.7152;
const blueShare = 0.0722;

// The slider's bounds and default, as relative luminance of a full white:
// about 1.5 % to 12 %; 4.55 % is what the filter always was before the
// slider existed (an sRGB 0.5 red for a white input).
export const nightModeMinRelativeLuminance = 0.015;
export const nightModeMaxRelativeLuminance = 0.12;
export const nightModeDefaultRelativeLuminance = 0.0455;

// The preference keys.
export const nightModePreferenceKey = "nightSession.nightMode";
export const nightModeIntensityPreferenceKey =
  "nightSession.nightModeIntensity";

// What the page carries: `data-night-mode="on"` on `<html>` (read by the
// style sheet, set before the first paint), and the identifiers of the SVG
// filter that holds the matrix.
export const nightModeAttribute = "data-night-mode";
export const nightModeFilterId = "astro-night-mode-filter";
export const nightModeMatrixId = "astro-night-mode-matrix";

// The standard sRGB encode: a linear-light fraction back to the value a
// screen expects.
function linearToSrgb(channel) {
  if (channel <= 0.0031308) return channel * 12.92;
  return 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

const clampNumber = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), maximum);

/**
 * The 20 numbers of the colour matrix (4 rows of 5, the last column being the
 * offset) for a target maximum relative luminance — what a full white maps
 * to. The intensity is clamped to the slider's bounds first. The red output
 * carries the luminance shares of the three input channels; the green and
 * blue outputs are zero at every intensity; alpha is untouched.
 */
export function nightModeColorMatrixForIntensity(relativeLuminance) {
  const clamped = clampNumber(
    relativeLuminance,
    nightModeMinRelativeLuminance,
    nightModeMaxRelativeLuminance,
  );
  const linearRed = clamped / redShare;
  const redOutputScale = clampNumber(linearToSrgb(linearRed), 0, 1);
  // prettier-ignore
  return [
    redShare * redOutputScale, greenShare * redOutputScale, blueShare * redOutputScale, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/** The matrix as the `values` attribute of an SVG `feColorMatrix`. */
export function nightModeFilterValues(relativeLuminance) {
  return nightModeColorMatrixForIntensity(relativeLuminance).join(" ");
}

/** What the slider announces: `round(value × 100)`, in percent. */
export function nightModeIntensityPercent(relativeLuminance) {
  return Math.round(relativeLuminance * 100);
}

/** An intensity read from storage: anything outside the bounds is the default. */
export function normalizeNightModeIntensity(value) {
  return typeof value === "number" &&
    value >= nightModeMinRelativeLuminance &&
    value <= nightModeMaxRelativeLuminance
    ? value
    : nightModeDefaultRelativeLuminance;
}

/** This browser's `localStorage`, or null when it refuses to be reached. */
export function deviceStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readJson(storage, key) {
  try {
    const raw = storage?.getItem(key);
    return raw === null || raw === undefined ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * The device's setting: off unless an explicit `true` was written (the web
 * never starts the mode by itself); the intensity is the default when absent,
 * malformed or out of bounds. Never throws.
 */
export function readNightMode(storage = deviceStorage()) {
  return {
    enabled: readJson(storage, nightModePreferenceKey) === true,
    intensity: normalizeNightModeIntensity(
      readJson(storage, nightModeIntensityPreferenceKey),
    ),
  };
}

/** Writes the mode; false when the storage refused. */
export function writeNightModeEnabled(enabled, storage = deviceStorage()) {
  try {
    storage.setItem(nightModePreferenceKey, JSON.stringify(Boolean(enabled)));
    return true;
  } catch {
    return false;
  }
}

/** Writes the intensity (clamped to the slider's bounds); false when refused. */
export function writeNightModeIntensity(value, storage = deviceStorage()) {
  try {
    storage.setItem(
      nightModeIntensityPreferenceKey,
      JSON.stringify(
        clampNumber(
          Number(value),
          nightModeMinRelativeLuminance,
          nightModeMaxRelativeLuminance,
        ),
      ),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Puts the page in the given state: the attribute on `<html>` that the style
 * sheet reads, and the matrix of the SVG filter. Used by the control (and by
 * the `storage` event, another tab following this one).
 */
export function applyNightMode(
  { enabled, intensity },
  documentRoot = globalThis.document,
) {
  if (!documentRoot) return;
  const root = documentRoot.documentElement;
  if (enabled) root.setAttribute(nightModeAttribute, "on");
  else root.removeAttribute(nightModeAttribute);
  documentRoot
    .getElementById(nightModeMatrixId)
    ?.setAttribute("values", nightModeFilterValues(intensity));
}

// The first-paint script of the root layout: reads the same two keys and
// does what `applyNightMode` does, before the page is drawn, so that a page
// opened in night mode never flashes white. It runs as plain text in the
// page (no import is possible there), so the rule is repeated in it; the
// test `packages/portal/tests/night-mode.test.mjs` runs it in a sandbox and
// compares its matrix with `nightModeColorMatrixForIntensity` over the whole
// slider. Any failure (a refusing storage, a damaged value) leaves the page
// in day mode.
export const nightModeBootScript = `(function(){try{
var s=window.localStorage;
if(JSON.parse(s.getItem(${JSON.stringify(nightModePreferenceKey)}))!==true)return;
var v=null;
try{v=JSON.parse(s.getItem(${JSON.stringify(nightModeIntensityPreferenceKey)}));}catch(e){}
if(typeof v!=="number"||!(v>=${nightModeMinRelativeLuminance}&&v<=${nightModeMaxRelativeLuminance}))v=${nightModeDefaultRelativeLuminance};
var l=v/${redShare};
var c=l<=0.0031308?l*12.92:1.055*Math.pow(l,1/2.4)-0.055;
c=Math.min(Math.max(c,0),1);
var m=document.getElementById(${JSON.stringify(nightModeMatrixId)});
if(m)m.setAttribute("values",[${redShare}*c,${greenShare}*c,${blueShare}*c,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0].join(" "));
document.documentElement.setAttribute(${JSON.stringify(nightModeAttribute)},"on");
}catch(e){}})();`;
