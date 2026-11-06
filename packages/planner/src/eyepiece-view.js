import { bortleFromSqm } from "portal/sky-quality.js";
import { bortleClassOrNull } from "./bortle.js";
import { instrumentLimitingMagnitude } from "./visual-limits.js";
import constants from "./eyepiece-view-constants.json" with { type: "json" };

// The eyepiece view: in visual mode, the picture of a target is drawn for
// the observer's own telescope, eyepiece and sky -- a SIMULATION, said as
// one, never a promise of what the eye will see.
//
// The rule is pure. Its constants sit in
// `eyepiece-view-constants.json`, never inline.
//
// - magnification = telescope focal length / eyepiece focal length;
// - true field = apparent field / magnification;
// - exit pupil = aperture / magnification;
// - limiting magnitude = naked-eye limit of the place's Bortle class
//   + 5 * log10(aperture / 7 mm);
// - contrast = sky brightness (mag/arcsec^2) - the target's surface
//   brightness (integrated magnitude spread over its apparent size, the way
//   `suggestedIntegration` computes it);
// - render = the four numbers the painter applies.
//
// Any missing input answers `null`: the caller keeps today's image.

export const eyepieceViewConstants = constants;

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const positive = (value) => {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
};
const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

// The eyepiece's focal length and apparent field: a zoom eyepiece uses the
// selected focal length (clamped to its range) and the apparent field
// interpolated between its two ends, exactly as `resolveEquipment` does.
function eyepieceOptics(eyepiece) {
  const zoomMinimum = positive(eyepiece?.minFocalLengthMm);
  const zoomMaximum = positive(eyepiece?.maxFocalLengthMm);
  const zoom =
    zoomMinimum !== null && zoomMaximum !== null && zoomMaximum >= zoomMinimum;
  const requested =
    finite(eyepiece?.selectedFocalLengthMm) ?? finite(eyepiece?.focalLengthMm);
  const focalLengthMm = zoom
    ? requested === null
      ? null
      : clamp(requested, zoomMinimum, zoomMaximum)
    : positive(eyepiece?.focalLengthMm);
  if (focalLengthMm === null || !(focalLengthMm > 0)) return null;
  const apparentMinimum = positive(eyepiece?.minApparentFieldDegrees);
  const apparentMaximum = positive(eyepiece?.maxApparentFieldDegrees);
  const ratio =
    zoom && zoomMaximum > zoomMinimum
      ? (focalLengthMm - zoomMinimum) / (zoomMaximum - zoomMinimum)
      : 0;
  const apparentFieldDegrees =
    apparentMinimum !== null &&
    apparentMaximum !== null &&
    apparentMaximum >= apparentMinimum
      ? apparentMaximum - (apparentMaximum - apparentMinimum) * ratio
      : positive(eyepiece?.apparentFieldDegrees);
  if (apparentFieldDegrees === null) return null;
  return { focalLengthMm, apparentFieldDegrees };
}

/**
 * The surface brightness of a target, in mag/arcsec^2: its integrated
 * magnitude spread over the ellipse of its apparent size (the formula of
 * `suggestedIntegration` in `planner.js`), or `null` without both.
 */
export function eyepieceSurfaceBrightness(target) {
  const magnitude = finite(target?.integratedMagnitude);
  const size = target?.apparentSizeArcmin;
  if (magnitude === null || !Array.isArray(size)) return null;
  const major = positive(size[0]);
  const minor = positive(size[1]);
  if (major === null || minor === null) return null;
  return magnitude + 2.5 * Math.log10(Math.PI * (major * 30) * (minor * 30));
}

/**
 * The field of sky, in degrees, the stored thumbnail covers: the record's
 * own field when it carries one, else the rule the importer requested the
 * cutout with.
 */
export function eyepieceSourceField(target) {
  const stored = positive(target?.imageFieldDegrees);
  if (stored !== null) return stored;
  const field = constants.sourceField;
  const sizes = Array.isArray(target?.apparentSizeArcmin)
    ? target.apparentSizeArcmin.map(positive).filter((size) => size !== null)
    : [];
  const largest = sizes.length ? Math.max(...sizes) : 0;
  return clamp(
    largest ? (largest / 60) * field.sizeMargin : field.defaultDegrees,
    field.minimumDegrees,
    field.maximumDegrees,
  );
}

/** The render that changes nothing: the image as it is, in the disc. */
export function neutralEyepieceRender(discFieldRatio = 1) {
  return { cutoff: 0, gain: 1, softness: 0, discFieldRatio };
}

/**
 * The grey, 0-255, the disc is filled with: the level of the place's sky
 * (`sky.sqm`, else the Bortle class's typical value), the reference dark
 * sky without either.
 */
export function eyepieceSkyFill(sky) {
  const s = constants.sky;
  const bortleClass = bortleClassOrNull(sky?.bortleClass);
  const sqm =
    finite(sky?.sqm) ??
    (bortleClass === null ? null : s.sqmByBortle[bortleClass - 1]) ??
    s.referenceSqm;
  return Math.round(
    clamp(
      s.fillFloor + s.fillSlopePerMag * (s.referenceSqm - sqm),
      s.fillFloor,
      s.fillCeiling,
    ),
  );
}

/**
 * The disc drawn without a setting (`kind: "default"`): grey levels at the
 * default field, on the reference dark sky, claiming no simulation.
 */
export function defaultEyepieceRender() {
  return { ...neutralEyepieceRender(), skyFill: eyepieceSkyFill(null) };
}

/**
 * The field, in degrees, the portal's field image is asked at for a true
 * field: the smallest of `fieldImage.fieldsDegrees` at least as wide (the
 * widest beyond them), so the image covers the disc and nearby plans share
 * it; `null` without a true field.
 */
export function eyepieceFieldRequest(trueFieldDegrees) {
  const field = positive(trueFieldDegrees);
  if (field === null) return null;
  const fields = constants.fieldImage.fieldsDegrees;
  return fields.find((value) => value >= field) ?? fields[fields.length - 1];
}

/**
 * The field image of `targetId` for a true field: the field asked for and
 * the portal's path (`fieldImage.path`, the field in `fov`), or `null`
 * without an id or a true field.
 */
export function eyepieceFieldImage(targetId, trueFieldDegrees) {
  const id = typeof targetId === "string" ? targetId.trim() : "";
  const fieldDegrees = eyepieceFieldRequest(trueFieldDegrees);
  if (!id || fieldDegrees === null) return null;
  const path = constants.fieldImage.path.replace(
    "{id}",
    encodeURIComponent(id),
  );
  return { fieldDegrees, path: `${path}?fov=${fieldDegrees}` };
}

/**
 * The survey cut-out of the target sheet's preview in photo mode: its field
 * (`fovDegrees`, square) and the sensor's frame as shares of its side
 * (`frameWidth`, `frameHeight`, over 1 when the frame is wider than the
 * widest cut-out). `field` is the imaging field (`fieldOfView`, degrees),
 * `sizeArcmin` the target's apparent size; `null` without a field.
 */
export function targetPreviewPhotoField(field, sizeArcmin) {
  const width = positive(field?.width);
  const height = positive(field?.height);
  if (width === null || height === null) return null;
  const { frameShare, sizeMargin, maximumDegrees } = constants.photoPreview;
  const sizes = Array.isArray(sizeArcmin)
    ? sizeArcmin.map(positive).filter((value) => value !== null)
    : [];
  const largest = sizes.length ? Math.max(...sizes) / 60 : 0;
  const wanted = Math.max(
    Math.max(width, height) / frameShare,
    largest * sizeMargin,
  );
  const step =
    constants.fieldImage.fieldsDegrees.find((value) => value >= wanted) ??
    maximumDegrees;
  const fovDegrees = Math.min(maximumDegrees, step);
  return {
    fovDegrees,
    frameWidth: width / fovDegrees,
    frameHeight: height / fovDegrees,
  };
}

/**
 * How many times `sizeArcmin`'s largest side is the eyepiece's true field
 * (`fieldDegrees`), with one decimal; `null` when the target fits (the
 * ratio rounds to 1 or less) or a value is missing.
 */
export function targetPreviewFieldRatio(sizeArcmin, fieldDegrees) {
  const field = positive(fieldDegrees);
  const sizes = Array.isArray(sizeArcmin)
    ? sizeArcmin.map(positive).filter((value) => value !== null)
    : [];
  if (field === null || !sizes.length) return null;
  const ratio = Math.round((Math.max(...sizes) / 60 / field) * 10) / 10;
  return ratio > 1 ? ratio : null;
}

/**
 * The simulated eyepiece view of `target` through `telescope` and
 * `eyepiece` under `sky`, or `null` when an input is missing.
 *
 * @param {object} input
 * @param {{apertureMm: number, focalLengthMm: number}} input.telescope the
 *   effective focal length (a Barlow or reducer already applied).
 * @param {{focalLengthMm: number, apparentFieldDegrees: number,
 *   minFocalLengthMm?: number, maxFocalLengthMm?: number,
 *   minApparentFieldDegrees?: number, maxApparentFieldDegrees?: number,
 *   selectedFocalLengthMm?: number}} input.eyepiece
 * @param {{sqm?: number, bortleClass?: number}} input.sky the place's sky
 *   (measured, else entered, else the estimate).
 * @param {{integratedMagnitude?: number, apparentSizeArcmin?: number[],
 *   imageFieldDegrees?: number}} input.target
 */
export function eyepieceView({ telescope, eyepiece, sky, target } = {}) {
  const apertureMm = positive(telescope?.apertureMm);
  const telescopeFocalLengthMm = positive(telescope?.focalLengthMm);
  const optics = eyepieceOptics(eyepiece);
  if (apertureMm === null || telescopeFocalLengthMm === null || !optics)
    return null;
  if (!target || typeof target !== "object") return null;
  const sqm = finite(sky?.sqm);
  const bortleClass =
    bortleClassOrNull(sky?.bortleClass) ??
    (sqm === null ? null : bortleFromSqm(sqm));
  if (bortleClass === null) return null;

  const magnification = telescopeFocalLengthMm / optics.focalLengthMm;
  const trueFieldDegrees = optics.apparentFieldDegrees / magnification;
  const exitPupilMm = apertureMm / magnification;
  // The one instrument limit (`visual-limits.js`, the planner's visual
  // rule): the place's SQM, else its class's, dimmed by the exit pupil.
  const limitingMagnitude = instrumentLimitingMagnitude({
    apertureMm,
    sqm,
    bortle: bortleClass,
    exitPupilMm,
  });
  const surfaceBrightness = eyepieceSurfaceBrightness(target);
  const contrast =
    sqm === null || surfaceBrightness === null ? null : sqm - surfaceBrightness;
  const discFieldRatio = Math.max(
    constants.disc.minimumFieldRatio,
    trueFieldDegrees / eyepieceSourceField(target),
  );
  const skyFill = eyepieceSkyFill(sky);
  // The field image covers the true field: its own field is the one asked
  // for, the source field of a target that carries it.
  const fieldDegrees = eyepieceFieldRequest(trueFieldDegrees);

  return {
    magnification,
    trueFieldDegrees,
    exitPupilMm,
    limitingMagnitude,
    contrast,
    render: {
      ...(contrast === null
        ? neutralEyepieceRender(discFieldRatio)
        : eyepieceRender({
            contrast,
            limitingMagnitude,
            exitPupilMm,
            integratedMagnitude: finite(target.integratedMagnitude),
            discFieldRatio,
          })),
      skyFill,
    },
    fieldImage: {
      fieldDegrees,
      discFieldRatio: Math.max(
        constants.disc.minimumFieldRatio,
        trueFieldDegrees /
          eyepieceSourceField({ imageFieldDegrees: fieldDegrees }),
      ),
    },
  };
}

/**
 * How visible the target's extended light is, in magnitudes: the
 * contrast, raised by the instrument's reach and lowered by a dim exit
 * pupil and by a target fainter than the instrument's limit.
 */
export function eyepieceVisibility({
  contrast,
  limitingMagnitude,
  exitPupilMm,
  integratedMagnitude,
}) {
  const v = constants.visibility;
  const pupil = clamp(
    Number(exitPupilMm),
    v.pupilMinimumMm,
    v.pupilReferenceMm,
  );
  const pupilLoss = 5 * Math.log10(v.pupilReferenceMm / pupil);
  const marginShortfall =
    integratedMagnitude === null || integratedMagnitude === undefined
      ? 0
      : Math.max(0, integratedMagnitude - limitingMagnitude + v.marginGrace);
  return (
    contrast +
    v.limitingMagnitudeWeight *
      (limitingMagnitude - v.limitingMagnitudeReference) -
    v.pupilWeight * pupilLoss -
    v.marginWeight * marginShortfall
  );
}

/** The four numbers the painter applies, from the visibility. */
export function eyepieceRender({
  contrast,
  limitingMagnitude,
  exitPupilMm,
  integratedMagnitude = null,
  discFieldRatio = 1,
}) {
  const r = constants.render;
  const visibility = eyepieceVisibility({
    contrast,
    limitingMagnitude,
    exitPupilMm,
    integratedMagnitude,
  });
  const cutoff = clamp(
    r.cutoffAtZero - r.cutoffSlope * visibility,
    r.cutoffMinimum,
    r.cutoffMaximum,
  );
  const gain = clamp(r.gainAtZero + r.gainSlope * visibility, r.gainMinimum, 1);
  return { cutoff, gain, softness: r.softnessShare * cutoff, discFieldRatio };
}

/**
 * The render the visual verdict asks for (VISUAL-SIM-03): one model for the
 * sentence and the picture. `verdict` is `visualSuitability`'s (`status`,
 * `magnitudeMargin`, `filterGain`), `render` the disc's as `eyepieceView`
 * made it (`skyFill`, `discFieldRatio`). The cutoff falls and the gain rises
 * with the margin, the cutoff held at `visibleCutoffMaximum` while the target
 * is visible (never a black disc), the sky level lowered by the filter's gain,
 * the stars untouched; `unlikely` keeps the high cutoff (the stars alone).
 * Without a margin (`unknown`, not visual, a planet) the render is returned
 * as it is. See `verdictRender` in `eyepiece-view-constants.json`.
 */
export function eyepieceRenderFromVerdict(verdict, render) {
  const margin = finite(verdict?.magnitudeMargin);
  if (margin === null || !render) return render;
  const v = constants.verdictRender;
  const penalty = eyepieceNarrowBandPupilPenalty(verdict);
  const visibility = v.marginWeight * margin + v.marginOffset - penalty;
  let cutoff = clamp(
    v.cutoffAtZero - v.cutoffSlope * visibility,
    v.cutoffMinimum,
    v.cutoffMaximum,
  );
  if (verdict.status !== "unlikely")
    cutoff = Math.min(cutoff, v.visibleCutoffMaximum);
  else cutoff = Math.max(cutoff, v.difficultCutoffMinimum);
  let gain = clamp(
    v.gainAtZero + v.gainSlope * (margin - penalty + v.gainMarginOffset),
    v.gainMinimum,
    1,
  );
  // « Difficilement visible »: only the brightest share of the target stays,
  // a vague patch (a poor pupil with a narrow-band filter empties it more).
  if (verdict.status === "difficult") {
    cutoff = clamp(
      Math.max(
        cutoff,
        v.difficultCutoffMinimum + v.pupilCutoffPerMagnitude * penalty,
      ),
      v.cutoffMinimum,
      v.cutoffMaximum,
    );
    gain = Math.min(gain, Math.max(v.gainMinimum, v.difficultGainMaximum));
  }
  const filtered = Math.round(
    v.skyFillPerFilterMagnitude * Math.max(0, finite(verdict.filterGain) ?? 0),
  );
  const level = finite(render.skyFill);
  let skyFill = null;
  if (level !== null) {
    skyFill = Math.max(v.skyFillFloor, level - filtered);
    // A bright sky stays grey whatever the filter: it dims it, never blacks it.
    if (level >= v.skyKeepFrom)
      skyFill = Math.max(skyFill, Math.round(level * v.skyKeepShare));
  }
  return {
    ...render,
    cutoff,
    gain,
    softness: constants.render.softnessShare * cutoff,
    ...(skyFill === null ? {} : { skyFill }),
  };
}

/**
 * Magnitudes of visibility a narrow-band filter (that helps: a gain above
 * 0) costs for an exit pupil under 3 mm, 1 per mm under;
 * 0 without such a filter or pupil. Read from the verdict's `filterFamily`,
 * `filterGain` and `exitPupilMm`.
 */
export function eyepieceNarrowBandPupilPenalty(verdict) {
  const v = constants.verdictRender;
  const pupil = finite(verdict?.exitPupilMm);
  if (
    pupil === null ||
    !(finite(verdict?.filterGain) > 0) ||
    !v.narrowBandFamilies.includes(verdict?.filterFamily)
  )
    return 0;
  return v.pupilPenaltyPerMm * Math.max(0, v.pupilBandMinimumMm - pupil);
}

const solarSystemPattern = /planet/i;

/** Whether `target` belongs to the solar system: today's image stays. */
export function eyepieceSolarSystemTarget(target) {
  const id = String(target?.id || "");
  if (id.startsWith("solar-system-")) return true;
  if (target?.kind === "planet") return true;
  return (Array.isArray(target?.tags) ? target.tags : []).some((tag) =>
    solarSystemPattern.test(String(tag)),
  );
}

/**
 * The target as the rule reads it, from a planner card's target or a
 * catalogue entry: its integrated magnitude, its apparent size, and the
 * field of its stored image when the record carries one.
 */
export function eyepieceViewTarget(target) {
  if (!target || typeof target !== "object") return null;
  const knowledge =
    target.knowledge && typeof target.knowledge === "object"
      ? target.knowledge
      : {};
  const magnitude =
    finite(target.integratedMagnitude) ??
    finite(target.magnitude) ??
    finite(knowledge.integratedMagnitude) ??
    finite(knowledge.magnitude);
  const size = Array.isArray(target.apparentSizeArcmin)
    ? target.apparentSizeArcmin
    : Array.isArray(knowledge.apparentSizeArcmin)
      ? knowledge.apparentSizeArcmin
      : null;
  const field =
    positive(target.imageFieldDegrees) ?? positive(knowledge.imageFieldDegrees);
  return {
    integratedMagnitude: magnitude,
    apparentSizeArcmin: size,
    ...(field === null ? {} : { imageFieldDegrees: field }),
  };
}

/**
 * The eyepiece and sky inputs of the rule from a resolved equipment profile
 * (`resolveEquipment`: the effective focal length, the eyepiece focal length
 * a zoom is set to, its interpolated apparent field) and a place's sky
 * (`{ sqm, bortleClass }`), or `null` when the plan is not visual or a value
 * is missing.
 */
export function eyepieceViewSetting(profile, sky) {
  if (profile?.mode !== "visual") return null;
  const telescope = {
    apertureMm: positive(profile.apertureMm),
    focalLengthMm: positive(profile.focalLengthMm),
  };
  const eyepiece = {
    focalLengthMm: positive(profile.eyepieceFocalLengthMm),
    apparentFieldDegrees: positive(profile.apparentFieldDegrees),
  };
  const sqm = finite(sky?.sqm);
  const bortleClass = bortleClassOrNull(sky?.bortleClass);
  if (
    telescope.apertureMm === null ||
    telescope.focalLengthMm === null ||
    eyepiece.focalLengthMm === null ||
    eyepiece.apparentFieldDegrees === null ||
    (sqm === null && bortleClass === null)
  )
    return null;
  return {
    telescope,
    eyepiece,
    sky: {
      ...(sqm === null ? {} : { sqm }),
      ...(bortleClass === null ? {} : { bortleClass }),
    },
  };
}

/**
 * What the picture of `target` is in visual mode for `setting`
 * (`eyepieceViewSetting`): `null` keeps today's image (no setting, a solar
 * system target, no image); `reference` an authorised visual reference shown
 * as it is in the disc; `simulation` the drawn eyepiece view. A simulation
 * of a target with an id carries its field image (`fieldImage`: the field
 * asked for, the render's `discFieldRatio` for it, the portal's `path`),
 * drawn instead of the thumbnail when the portal serves it; `null` without
 * an id.
 */
export function eyepieceViewFor(target, setting, { imageSource } = {}) {
  if (!setting || !target || eyepieceSolarSystemTarget(target)) return null;
  const knowledge = target.knowledge || target;
  const reference = imageSource === "visual" && knowledge.visualThumbnailUrl;
  if (reference) return { kind: "reference", render: neutralEyepieceRender() };
  const view = eyepieceView({ ...setting, target: eyepieceViewTarget(target) });
  if (!view) return null;
  const image = eyepieceFieldImage(
    typeof target.id === "string" ? target.id : knowledge.id,
    view.trueFieldDegrees,
  );
  return {
    kind: "simulation",
    ...view,
    fieldImage: image ? { ...view.fieldImage, path: image.path } : null,
  };
}

/**
 * The thumbnail of a visual plan is a disc always, never
 * the colour photo. `eyepieceViewFor`'s answer when it has one; else (no
 * setting, a value missing, a solar-system target) the image in grey levels
 * at the default field, `kind: "default"`, which claims no simulation.
 * `null` only for a photo plan (`visualMode` false).
 */
export function eyepieceViewOrDefault(
  target,
  setting,
  { visualMode, imageSource } = {},
) {
  if (!visualMode) return null;
  return (
    eyepieceViewFor(target, setting, { imageSource }) ?? {
      kind: "default",
      render: defaultEyepieceRender(),
    }
  );
}

// ## The painter's arithmetic
//
// Grey level, background and knee are computed here once; the painter
// (`components/EyepieceViewImage.js`) applies exactly this to the image's pixels.

const smoothstep = (edge0, edge1, x) => {
  if (!(edge1 > edge0)) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** The grey level of one RGB pixel, 0-255. */
export function eyepieceGrey(red, green, blue) {
  return (299 * red + 587 * green + 114 * blue) / 1000;
}

/** The median grey of the image's border ring, the sky's own level. */
export function eyepieceBackground(rgba, width, height) {
  const ring = Math.max(
    1,
    Math.round(Math.min(width, height) * constants.pixels.borderShare),
  );
  const values = [];
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      if (x >= ring && y >= ring && x < width - ring && y < height - ring)
        continue;
      const index = (y * width + x) * 4;
      values.push(eyepieceGrey(rgba[index], rgba[index + 1], rgba[index + 2]));
    }
  if (!values.length) return 0;
  values.sort((left, right) => left - right);
  return values[(values.length - 1) >> 1];
}

const hasSkyFill = (render) =>
  render.skyFill !== null &&
  render.skyFill !== undefined &&
  Number.isFinite(render.skyFill);

/**
 * One grey level through the render, against `background`. With a sky
 * level (`render.skyFill`), the image's sky is carried onto it: the light
 * above the background stretched to the same white, what is below kept at
 * `pixels.belowSkyShare` of its depth; without, the image's own level, the
 * light above it never brighter than it was.
 */
export function eyepieceGreyLevel(grey, background, render) {
  const signal = Math.max(0, grey - background);
  const span = Math.max(1, 255 - background);
  const normalized = signal / span;
  const knee =
    render.cutoff > 0
      ? smoothstep(render.cutoff - render.softness, render.cutoff, normalized)
      : 1;
  if (!hasSkyFill(render))
    return Math.min(grey, background + render.gain * signal * knee);
  const fill = render.skyFill;
  const below = Math.min(0, grey - background);
  return clamp(
    fill +
      (render.gain * signal * knee * (255 - fill)) / span +
      below *
        Math.min(1, fill / Math.max(background, 1)) *
        constants.pixels.belowSkyShare,
    0,
    255,
  );
}

/**
 * The soft edge at one pixel of a `width` x `height` image, 0-1: 1 inside,
 * falling to 0 at the border along the superellipse of `edge`.
 */
export function eyepieceEdgeWeight(x, y, width, height) {
  const across = Math.abs((x + 0.5) / width - 0.5);
  const down = Math.abs((y + 0.5) / height - 0.5);
  const squared = across * across;
  const squaredDown = down * down;
  const radius = Math.sqrt(
    Math.sqrt(squared * squared + squaredDown * squaredDown),
  );
  return 1 - smoothstep(0.5 - constants.edge.fade, 0.5, radius);
}

/**
 * Writes the eyepiece view of an RGBA image into `output` (grey levels,
 * opaque), and answers the background grey of the image. The disc around a
 * smaller image is filled with `render.skyFill` (the background without
 * it); with `softEdge` (a thumbnail smaller than the field) the image
 * fades into that level at its border.
 */
export function paintEyepiecePixels(
  rgba,
  width,
  height,
  render,
  output,
  { softEdge = false } = {},
) {
  const background = eyepieceBackground(rgba, width, height);
  const fill = hasSkyFill(render) ? render.skyFill : background;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const grey = eyepieceGrey(rgba[index], rgba[index + 1], rgba[index + 2]);
      const level = eyepieceGreyLevel(grey, background, render);
      const value = Math.round(
        softEdge
          ? fill + (level - fill) * eyepieceEdgeWeight(x, y, width, height)
          : level,
      );
      output[index] = value;
      output[index + 1] = value;
      output[index + 2] = value;
      output[index + 3] = 255;
    }
  return Math.round(background);
}

/**
 * `paintEyepiecePixels` as plain data, for the shared fixtures: the
 * background and the output pixels.
 */
export function eyepieceViewPixels(rgba, width, height, render, options) {
  const output = new Array(width * height * 4).fill(0);
  const background = paintEyepiecePixels(
    rgba,
    width,
    height,
    render,
    output,
    options ?? {},
  );
  return { background, pixels: output };
}

/**
 * The shading over a disc filled at the sky's level: the stops of one
 * radial gradient of black from the centre (`offset` 0) to the edge (1),
 * its opacity `alpha` the vignette and the field stop's ring together
 * (`disc.vignette`, `disc.ring`). The painters lay it over the image.
 */
export function eyepieceDiscShading() {
  const { vignette, ring } = constants.disc;
  const offsets = new Set([0, 1]);
  for (const band of [vignette, ring])
    for (let step = 0; step <= band.steps; step += 1)
      offsets.add(band.from + ((band.to - band.from) * step) / band.steps);
  return [...offsets]
    .sort((left, right) => left - right)
    .map((offset) => {
      const darkening =
        vignette.strength * smoothstep(vignette.from, vignette.to, offset);
      const stop = ring.strength * smoothstep(ring.from, ring.to, offset);
      return { offset, alpha: 1 - (1 - darkening) * (1 - stop) };
    });
}

/**
 * Where the image sits in a disc of diameter 1: its side
 * (`1 / discFieldRatio`, wider than the disc when the true field is the
 * narrower, smaller when it is the wider) and its offset, centred.
 */
export function eyepieceDiscLayout(discFieldRatio) {
  const ratio = positive(discFieldRatio) ?? 1;
  const side = 1 / ratio;
  return { side, offset: (1 - side) / 2 };
}
