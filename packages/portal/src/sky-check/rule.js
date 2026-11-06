/**
 * The rule « signals → outcome → reason » of the sky check, with four
 * outcomes (people and the undetermined are the
 * only images a person of the team has to look at):
 *
 * - `sky` — **the sky or a landscape**: a starry sky, a nebula, the Moon,
 *   the Sun through its filter, a landscape by night or by day, a
 *   landscape under the stars. Public at once when its owner asks.
 * - `person` — **a person** (or a face) is in the image: private until the
 *   team has looked.
 * - `undetermined` — neither the one nor the other with enough confidence
 *   (a file the check could not read, a calibration frame, an animal, a
 *   plate, a room, a doubtful person): private until the team has looked.
 * - `other` — **painted**: a screenshot, a document, a drawing. Unchanged:
 *   its owner reads it as undetermined (`captures/sky-check-verdict.js`).
 *
 * The stored result keeps the three values of `captures.auto_check` and of
 * the contract (`sky`, `undetermined`, `other`): a person is stored as
 * `undetermined` with the reason `person_detected`, so every reader that
 * knows the three values (the rule of a capture's state among
 * them) holds it private until the team looks, as it must
 * (`storedVerdictOf`, `outcomeOf`).
 *
 * In order, the first line that applies:
 *
 * 1. A FITS or XISF file: a calibration frame is `undetermined`; a
 *    celestial coordinate system in its header is `sky` at once; stars that
 *    look like the sky are `sky`; anything else `undetermined`. A camera's
 *    raw file is `undetermined` (its pixels are not read).
 * 2. A raster image (JPEG, PNG, WebP, AVIF, TIFF) the detector of people
 *    (`person-detection.js`) scores at `personScore` or more: `person`.
 * 3. Its stars fill the whole frame evenly, alike in width and profile, on
 *    a dark, smooth, noisy sky (`starsLookLikeTheSky`, measured on the
 *    first set: no file of a person, an object or a landscape gave it):
 *    `sky`. A crowded star field (`isCrowdedStarField`) may lie on a grey
 *    background and have stars of less even width, and a nebula may leave a
 *    band of the frame with fewer stars (`crowdedStarField…`).
 * 4. Painted (`looksPainted`): `other`.
 * 5. Without the detector (switched off, or its model missing): nothing
 *    more is said of a photograph, `undetermined`.
 * 6. A doubtful person (`personDoubtScore` or more): `undetermined`.
 * 7. An animal, a plate or a room (a group of `DETECTION_GROUPS` at
 *    `objectScore` or more): `undetermined`.
 * 8. Otherwise a photograph whose top looks like a sky (`looksLikeAnOpenScene`)
 *    or that is a bright disc or a field on a black background
 *    (`looksLikeAnAstronomicalObject`): `sky`, reason `landscape`.
 * 9. Anything else: `undetermined`.
 *
 * Every threshold was set on the reference set of the measure (kept with
 * its confusion matrix in the private evidence of the project): the person
 * thresholds so that no person in the foreground is ever `sky`, a small
 * silhouette under the stars being allowed to go to the team.
 */

export const SKY_CHECK_RULE_VERSION = "sky-check-3";

/** The four outcomes, in the order of the module comment. */
export const SKY_CHECK_OUTCOMES = Object.freeze([
  "sky",
  "person",
  "undetermined",
  "other",
]);

/** The machine keys of `auto_check_reason`, by outcome. */
export const SKY_CHECK_REASONS = Object.freeze({
  sky: ["wcs_header", "stars_detected", "landscape"],
  person: ["person_detected"],
  undetermined: [
    "check_off",
    "unreadable",
    "too_large",
    "too_slow",
    "unsupported_format",
    "calibration_frame",
    "astro_header",
    "raw_camera_file",
    "too_few_stars",
    "people_unchecked",
    "person_doubt",
    "not_a_landscape",
    "not_recognised",
  ],
  other: ["non_sky_content"],
});

/** The thresholds of the rule (see the module comment). */
export const SKY_CHECK_THRESHOLDS = Object.freeze({
  // Stars, any format.
  minStars: 40,
  minFineCellCoverage: 0.9,
  maxMedianElongation: 1.7,
  minMedianWidthPixels: 1.8,
  maxMedianWidthPixels: 16,
  maxHotPixelsPerStar: 1,
  maxBackgroundLevel: 0.35,
  maxExtendedAreaFraction: 0.2,
  // Stars of a raster image (a photograph a person could be in).
  minStarsPerMegapixel: 500,
  minStripDensityFloor: 0.5,
  minCellDensityFloor: 0.5,
  maxWidthSpread: 0.55,
  maxProfileSpread: 0.8,
  maxTexturedTileFraction: 0.08,
  maxMeanLuma: 0.2,
  minNoiseLevel: 0.004,
  maxEqualNeighbourShare: 0.5,
  // A crowded star field on a grey background: the milestones of a
  // night of 90 frames gave 4 000 to 5 700 stars per megapixel,
  // every fine cell, a mean luma of 0.23 to 0.27.
  crowdedStarFieldDensityFactor: 4,
  crowdedStarFieldMinFineCellCoverage: 1,
  crowdedStarFieldMaxMeanLuma: 0.4,
  crowdedStarFieldMaxEqualNeighbourShare: 0.6,
  // The renders of a crowded field: a « polished » render sharpens the
  // small stars and leaves the large ones (width spread 0.92 to 1.21 on
  // the Veil and the Heart), a large nebula thins the stars of a band of
  // the frame (0.47 to 0.49 on NGC 7000).
  crowdedStarFieldMaxWidthSpread: 1.5,
  crowdedStarFieldMinStripDensityFloor: 0.4,
  // A painted image (screenshot, document, drawing).
  paintedMinEqualNeighbourShare: 0.6,
  paintedMinFlatColourShare: 0.5,
  paintedMinEdgeDensity: 0.02,
  paintedMaxDarkFraction: 0.5,
  paintedMaxStars: 10,
  // People (`person-detection.js`): from `personScore` a person, from
  // `personDoubtScore` a doubt.
  personScore: 0.5,
  personDoubtScore: 0.25,
  // A plate, a room (`objectScore`), an animal (`animalScore`).
  objectScore: 0.4,
  animalScore: 0.75,
  // An open scene: the top third of the image looks like a sky (dark,
  // blue, bright grey; a warm sunset counts for `topWarmWeight`), not like
  // paper or a wall (white), over a ground with some texture.
  minTopSkyShare: 0.6,
  topWarmWeight: 0.5,
  maxTopWhiteShare: 1,
  minBottomTexture: 0.003,
  // A photographed scene: the eight most used exact colours cover at most
  // this share of it, and its brightest pixels reach this luma.
  maxSceneFlatColourShare: 0.75,
  minSceneLuma: 0.12,
  // A starry night: stars by the thousand per megapixel on a dark image.
  starryNightMinStarsPerMegapixel: 2000,
  starryNightMaxMeanLuma: 0.4,
  // An astronomical body on a black background (the Moon, the Sun).
  minDarkFractionForObject: 0.3,
  minObjectLuma: 0.15,
});

/** Stars that look like a field of stars, whatever the format. */
function starsLookShaped(stars, t) {
  const hotPerStar = stars.hotPixelsRejected / Math.max(1, stars.starCount);
  return (
    stars.starCount >= t.minStars &&
    stars.fineCellCoverage >= t.minFineCellCoverage &&
    stars.medianElongation !== null &&
    stars.medianElongation <= t.maxMedianElongation &&
    stars.medianWidthPixels !== null &&
    stars.medianWidthPixels >= t.minMedianWidthPixels &&
    stars.medianWidthPixels <= t.maxMedianWidthPixels &&
    hotPerStar <= t.maxHotPixelsPerStar &&
    stars.backgroundLevel <= t.maxBackgroundLevel &&
    stars.extendedAreaFraction <= t.maxExtendedAreaFraction
  );
}

/**
 * A star field so crowded and so even that no photograph of a person or an
 * object gives it (see the module comment): its background may be grey,
 * its stars of less even width, one band of it thinner.
 */
export function isCrowdedStarField(stars, t = SKY_CHECK_THRESHOLDS) {
  return (
    stars.starsPerMegapixel >=
      t.crowdedStarFieldDensityFactor * t.minStarsPerMegapixel &&
    stars.fineCellCoverage >= t.crowdedStarFieldMinFineCellCoverage &&
    stars.cellDensityFloor >= t.minCellDensityFloor
  );
}

/** The bounds a raster sky must keep (see the module comment). */
function skyBounds(stars, t) {
  return isCrowdedStarField(stars, t)
    ? {
        maxMeanLuma: t.crowdedStarFieldMaxMeanLuma,
        maxEqualNeighbourShare: t.crowdedStarFieldMaxEqualNeighbourShare,
        maxWidthSpread: t.crowdedStarFieldMaxWidthSpread,
        minStripDensityFloor: t.crowdedStarFieldMinStripDensityFloor,
      }
    : {
        maxMeanLuma: t.maxMeanLuma,
        maxEqualNeighbourShare: t.maxEqualNeighbourShare,
        maxWidthSpread: t.maxWidthSpread,
        minStripDensityFloor: t.minStripDensityFloor,
      };
}

/** Whether the stars of these signals are the sky (see the module comment). */
export function starsLookLikeTheSky(signals, t = SKY_CHECK_THRESHOLDS) {
  const stars = signals.stars;
  if (!stars || !starsLookShaped(stars, t)) return false;
  if (signals.format !== "raster") return true;
  const thumbnail = signals.thumbnail;
  if (!thumbnail) return false;
  const bounds = skyBounds(stars, t);
  return (
    stars.starsPerMegapixel >= t.minStarsPerMegapixel &&
    stars.stripDensityFloor >= bounds.minStripDensityFloor &&
    stars.cellDensityFloor >= t.minCellDensityFloor &&
    stars.widthSpread !== null &&
    stars.widthSpread <= bounds.maxWidthSpread &&
    stars.profileSpread !== null &&
    stars.profileSpread <= t.maxProfileSpread &&
    stars.texturedTileFraction <= t.maxTexturedTileFraction &&
    stars.noiseLevel >= t.minNoiseLevel &&
    thumbnail.meanLuma <= bounds.maxMeanLuma &&
    thumbnail.equalNeighbourShare <= bounds.maxEqualNeighbourShare
  );
}

/** A screenshot, a document or a drawing: painted, not photographed. */
export function looksPainted(signals, t = SKY_CHECK_THRESHOLDS) {
  const thumbnail = signals.thumbnail;
  const metadata = signals.metadata;
  if (!thumbnail || !metadata || metadata.hasExif || metadata.astroSoftware)
    return false;
  const starCount = signals.stars ? signals.stars.starCount : 0;
  return (
    starCount < t.paintedMaxStars &&
    thumbnail.equalNeighbourShare >= t.paintedMinEqualNeighbourShare &&
    thumbnail.flatColourShare >= t.paintedMinFlatColourShare &&
    thumbnail.edgeDensity >= t.paintedMinEdgeDensity &&
    thumbnail.darkFraction <= t.paintedMaxDarkFraction
  );
}

/**
 * The classes of the detector (`person-detection.js`, COCO) that are
 * neither the sky nor a landscape, by group: a plate, a fruit, the cup and
 * the cutlery around it; the furniture and the objects of a room; an
 * animal, read only from `animalScore` (rocks, dunes and trees read as a
 * zebra, a giraffe or a bird at lower scores). Vehicles, street furniture,
 * sports gear and what a person carries (a tent reads as an umbrella) are
 * found in landscapes too and are not read. `round`: on a black background
 * the Moon and the Sun read as one of these (« an orange », « a banana »,
 * « a bowl », « a clock »…), not read there.
 */
export const OBJECT_GROUPS = Object.freeze({
  food: [
    "bottle",
    "wine glass",
    "cup",
    "fork",
    "knife",
    "spoon",
    "bowl",
    "banana",
    "apple",
    "sandwich",
    "orange",
    "carrot",
    "hot dog",
    "pizza",
    "donut",
    "cake",
  ],
  indoor: [
    "chair",
    "couch",
    "potted plant",
    "bed",
    "dining table",
    "toilet",
    "tv",
    "laptop",
    "mouse",
    "remote",
    "keyboard",
    "cell phone",
    "microwave",
    "oven",
    "toaster",
    "sink",
    "refrigerator",
    "book",
    "clock",
    "vase",
    "scissors",
    "teddy bear",
    "hair drier",
    "toothbrush",
  ],
  animal: [
    "bird",
    "cat",
    "dog",
    "horse",
    "sheep",
    "cow",
    "elephant",
    "bear",
    "zebra",
    "giraffe",
  ],
  round: [
    "apple",
    "orange",
    "banana",
    "bowl",
    "pizza",
    "donut",
    "cake",
    "clock",
    "frisbee",
    "sports ball",
  ],
});

/**
 * Whether the detector found something that is neither the sky nor a
 * landscape (see `OBJECT_GROUPS`).
 */
function holdsAnObject(signals, t) {
  const classes = signals.people?.classes || {};
  const onBlack =
    (signals.thumbnail?.darkFraction || 0) >= t.minDarkFractionForObject;
  const scoreOf = (name) =>
    onBlack && OBJECT_GROUPS.round.includes(name) ? 0 : classes[name] || 0;
  return (
    [...OBJECT_GROUPS.food, ...OBJECT_GROUPS.indoor].some(
      (name) => scoreOf(name) >= t.objectScore,
    ) || OBJECT_GROUPS.animal.some((name) => scoreOf(name) >= t.animalScore)
  );
}

/** The top third of the photograph looks like a sky (see the module comment). */
export function looksLikeAnOpenScene(signals, t = SKY_CHECK_THRESHOLDS) {
  const thumbnail = signals.thumbnail;
  if (!thumbnail) return false;
  const skyLike =
    (thumbnail.topDarkShare || 0) +
    (thumbnail.topBlueShare || 0) +
    (thumbnail.topGreyShare || 0) +
    (thumbnail.topWarmShare || 0) * t.topWarmWeight;
  return (
    looksPhotographed(thumbnail, t) &&
    skyLike >= t.minTopSkyShare &&
    (thumbnail.topWhiteShare || 0) <= t.maxTopWhiteShare &&
    (thumbnail.bottomTexture || 0) >= t.minBottomTexture
  );
}

/**
 * A photograph of a scene, not a flat image: not painted in a few exact
 * colours, and not a uniform frame (a dark, a flat) with nothing bright.
 */
function looksPhotographed(thumbnail, t) {
  return (
    thumbnail.flatColourShare <= t.maxSceneFlatColourShare &&
    (thumbnail.lumaP99 || 0) >= t.minSceneLuma
  );
}

/** A night full of stars over a landscape (see the module comment). */
export function looksLikeAStarryNight(signals, t = SKY_CHECK_THRESHOLDS) {
  const stars = signals.stars;
  const thumbnail = signals.thumbnail;
  return (
    Boolean(stars && thumbnail) &&
    looksPhotographed(thumbnail, t) &&
    stars.starsPerMegapixel >= t.starryNightMinStarsPerMegapixel &&
    thumbnail.meanLuma <= t.starryNightMaxMeanLuma
  );
}

/** A bright body on a black background (the Moon, the Sun). */
export function looksLikeAnAstronomicalObject(
  signals,
  t = SKY_CHECK_THRESHOLDS,
) {
  const thumbnail = signals.thumbnail;
  return (
    Boolean(thumbnail) &&
    thumbnail.darkFraction >= t.minDarkFractionForObject &&
    (thumbnail.lumaP99 || 0) >= t.minObjectLuma
  );
}

const verdict = (outcome, reason) => ({ outcome, reason });

/**
 * The outcome and its reason for the signals gathered on one file (see the
 * module comment): `{ outcome, reason }`.
 */
export function decideOutcome(signals, t = SKY_CHECK_THRESHOLDS) {
  if (!signals || signals.mode === "off")
    return verdict("undetermined", "check_off");
  if (signals.format === "fits" || signals.format === "xisf") {
    if (signals.frameKind && signals.frameKind !== "light")
      return verdict("undetermined", "calibration_frame");
    if (signals.celestialWcs) return verdict("sky", "wcs_header");
    if (signals.failure) return verdict("undetermined", signals.failure);
    if (starsLookLikeTheSky(signals, t))
      return verdict("sky", "stars_detected");
    return verdict("undetermined", "astro_header");
  }
  if (signals.format === "raw")
    return verdict("undetermined", "raw_camera_file");
  if (signals.failure) return verdict("undetermined", signals.failure);
  if (signals.format !== "raster")
    return verdict("undetermined", "unsupported_format");
  const people = signals.people?.available ? signals.people : null;
  if (people && people.personScore >= t.personScore)
    return verdict("person", "person_detected");
  if (starsLookLikeTheSky(signals, t)) return verdict("sky", "stars_detected");
  if (looksPainted(signals, t)) return verdict("other", "non_sky_content");
  if (!people) return verdict("undetermined", "people_unchecked");
  if (people.personScore >= t.personDoubtScore)
    return verdict("undetermined", "person_doubt");
  if (holdsAnObject(signals, t))
    return verdict("undetermined", "not_a_landscape");
  if (
    looksLikeAnOpenScene(signals, t) ||
    looksLikeAStarryNight(signals, t) ||
    looksLikeAnAstronomicalObject(signals, t)
  )
    return verdict("sky", "landscape");
  return verdict("undetermined", "not_recognised");
}

/**
 * The stored form of an outcome (`captures.auto_check`, the contract's
 * three values): a person is `undetermined`, its reason `person_detected`.
 */
export function storedVerdictOf({ outcome, reason }) {
  return { result: outcome === "person" ? "undetermined" : outcome, reason };
}

/** The outcome of a stored result and its reason (`storedVerdictOf` undone). */
export function outcomeOf(result, reason) {
  if (result === "undetermined" && reason === "person_detected")
    return "person";
  return result ?? null;
}

/**
 * The stored result and its reason for the signals of one file:
 * `{ result, reason, outcome }`.
 */
export function decideSkyCheck(signals, t = SKY_CHECK_THRESHOLDS) {
  const decided = decideOutcome(signals, t);
  return { ...storedVerdictOf(decided), outcome: decided.outcome };
}
