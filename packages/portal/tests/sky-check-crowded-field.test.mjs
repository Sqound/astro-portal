import assert from "node:assert/strict";
import test from "node:test";
import {
  SKY_CHECK_RULE_VERSION,
  SKY_CHECK_THRESHOLDS,
  decideSkyCheck,
  isCrowdedStarField,
} from "../dist/sky-check/rule.js";

// A crowded star field stretched on a grey background, rendered with stars
// of uneven width or crossed by a nebula, is still the sky by its stars;
// nothing else changes.

// The fifth milestone of a night of 90 frames (ASI533MC), autostretched
// by Siril on its default grey background, as the portal measured it.
const greyMilestone = {
  format: "raster",
  extension: "jpg",
  frameKind: null,
  celestialWcs: false,
  failure: null,
  metadata: { hasExif: false, astroSoftware: false },
  stars: {
    starCount: 22701,
    starsPerMegapixel: 5675.3,
    fineCellCoverage: 1,
    coarseCellCoverage: 1,
    cellDensityFloor: 0.777,
    stripDensityFloor: 0.809,
    medianWidthPixels: 3.1,
    medianElongation: 1.2,
    backgroundLevel: 0.2431,
    noiseLevel: 0.01744,
    hotPixelsRejected: 0,
    extendedAreaFraction: 0.01,
    widthSpread: 0.254,
    profileSpread: 0.328,
    texturedTileFraction: 0.014,
  },
  thumbnail: { meanLuma: 0.27, equalNeighbourShare: 0.0815 },
};

const withStars = (stars) => ({
  ...greyMilestone,
  stars: { ...greyMilestone.stars, ...stars },
});

test("the rule's version says the tolerance", () => {
  assert.equal(SKY_CHECK_RULE_VERSION, "sky-check-3");
  assert.equal(SKY_CHECK_THRESHOLDS.crowdedStarFieldDensityFactor, 4);
  assert.equal(SKY_CHECK_THRESHOLDS.crowdedStarFieldMaxMeanLuma, 0.4);
  assert.equal(
    SKY_CHECK_THRESHOLDS.crowdedStarFieldMaxEqualNeighbourShare,
    0.6,
  );
  assert.equal(SKY_CHECK_THRESHOLDS.crowdedStarFieldMaxWidthSpread, 1.5);
  assert.equal(SKY_CHECK_THRESHOLDS.crowdedStarFieldMinStripDensityFloor, 0.4);
});

test("a crowded star field on a grey background is the sky", () => {
  assert.equal(isCrowdedStarField(greyMilestone.stars), true);
  assert.deepEqual(decideSkyCheck(greyMilestone), {
    result: "sky",
    reason: "stars_detected",
    outcome: "sky",
  });
  // Up to the bounds of the tolerance.
  assert.equal(
    decideSkyCheck({
      ...greyMilestone,
      thumbnail: { meanLuma: 0.4, equalNeighbourShare: 0.6 },
    }).result,
    "sky",
  );
  assert.equal(
    decideSkyCheck({
      ...greyMilestone,
      thumbnail: { meanLuma: 0.41, equalNeighbourShare: 0.08 },
    }).result,
    "undetermined",
  );
});

test("a polished render (stars of uneven width) and a nebula across a band of the frame stay the sky in a crowded field", () => {
  // The Veil and the Heart « polished »: width spread 0.92 and
  // 1.21; NGC 7000: the emptiest band at 0.47 to 0.49 of the typical one.
  for (const stars of [
    { widthSpread: 0.92 },
    { widthSpread: 1.21 },
    { widthSpread: 1.5 },
    { stripDensityFloor: 0.47 },
    { stripDensityFloor: 0.4 },
  ])
    assert.equal(
      decideSkyCheck(withStars(stars)).reason,
      "stars_detected",
      JSON.stringify(stars),
    );
  for (const stars of [{ widthSpread: 1.51 }, { stripDensityFloor: 0.39 }])
    assert.notEqual(
      decideSkyCheck(withStars(stars)).reason,
      "stars_detected",
      JSON.stringify(stars),
    );
  // Outside a crowded field, the bounds of a sparse field stay.
  const sparse = { starsPerMegapixel: 1500 };
  assert.notEqual(
    decideSkyCheck(withStars({ ...sparse, widthSpread: 0.6 })).reason,
    "stars_detected",
  );
  assert.notEqual(
    decideSkyCheck(withStars({ ...sparse, stripDensityFloor: 0.45 })).reason,
    "stars_detected",
  );
});

test("the tolerance needs every one of its three conditions", () => {
  // The first milestone: one frame, its densest and emptiest cells too far
  // apart (0.39 < 0.5). Without the person detector's signals, a
  // photograph that is not a field of stars is never a landscape.
  assert.equal(
    decideSkyCheck(withStars({ cellDensityFloor: 0.39 })).reason,
    "people_unchecked",
  );
  // Dense, but not four times the minimum.
  assert.equal(
    decideSkyCheck(
      withStars({
        starsPerMegapixel:
          SKY_CHECK_THRESHOLDS.crowdedStarFieldDensityFactor *
            SKY_CHECK_THRESHOLDS.minStarsPerMegapixel -
          1,
      }),
    ).result,
    "undetermined",
  );
  // A fine cell without a star.
  assert.equal(
    decideSkyCheck(withStars({ fineCellCoverage: 0.99 })).result,
    "undetermined",
  );
  // The rest of the rule stays: stars of one optical system.
  assert.equal(
    decideSkyCheck(withStars({ profileSpread: 0.81 })).result,
    "undetermined",
  );
});
