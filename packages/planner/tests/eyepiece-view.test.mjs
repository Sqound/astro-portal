import assert from "node:assert/strict";
import test from "node:test";
import {
  eyepieceBackground,
  eyepieceDiscLayout,
  eyepieceGrey,
  eyepieceGreyLevel,
  eyepieceNarrowBandPupilPenalty,
  eyepieceRenderFromVerdict,
  eyepieceViewConstants,
  eyepieceViewPixels,
  neutralEyepieceRender,
  paintEyepiecePixels,
} from "../src/eyepiece-view.js";

// The painter's arithmetic, the part the canvas applies to an image's pixels.
// The pixel test runs on a synthetic radial gradient (a bright core fading into
// a flat sky) and holds the stated tolerance: 1 grey level out of 255.

const tolerance = 1;
const size = 32;

function gradient({ sky = 40, core = 250, falloff = 9 } = {}) {
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - 15.5, y - 15.5);
      const value = Math.round(
        sky + (core - sky) * Math.exp(-distance / falloff),
      );
      const index = (y * size + x) * 4;
      rgba.set([value, value, value, 255], index);
    }
  return rgba;
}

const paint = (rgba, render) => {
  const output = new Uint8ClampedArray(rgba.length);
  const background = paintEyepiecePixels(rgba, size, size, render, output);
  return { output, background };
};
const greyAt = (pixels, x, y) => pixels[(y * size + x) * 4];

test("the grey level is the Rec. 601 weighting", () => {
  assert.equal(eyepieceGrey(255, 255, 255), 255);
  assert.equal(eyepieceGrey(255, 0, 0), 76.245);
  assert.equal(eyepieceGrey(0, 255, 0), 149.685);
  assert.equal(eyepieceGrey(0, 0, 255), 29.07);
});

test("the background is the median grey of the border ring", () => {
  const rgba = gradient();
  const ring = [];
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1)
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1)
        ring.push(greyAt(rgba, x, y));
  ring.sort((left, right) => left - right);
  assert.equal(
    eyepieceBackground(rgba, size, size),
    ring[(ring.length - 1) >> 1],
  );
  // A bright core never moves the sky's level: only the ring counts.
  const brighter = gradient({ core: 255, falloff: 3 });
  assert.ok(eyepieceBackground(brighter, size, size) < 45);
});

test("the neutral render gives the source's grey back (pixel test, tolerance 1)", () => {
  const rgba = gradient();
  const { output } = paint(rgba, neutralEyepieceRender());
  for (let index = 0; index < rgba.length; index += 4)
    assert.ok(Math.abs(output[index] - rgba[index]) <= tolerance);
});

test("a photographic image is desaturated first", () => {
  const rgba = new Uint8ClampedArray([
    200, 40, 90, 255, 10, 220, 30, 255, 80, 80, 80, 255, 0, 0, 0, 255,
  ]);
  const { pixels } = eyepieceViewPixels(rgba, 2, 2, neutralEyepieceRender());
  for (let index = 0; index < pixels.length; index += 4) {
    assert.equal(pixels[index], pixels[index + 1]);
    assert.equal(pixels[index], pixels[index + 2]);
    assert.equal(pixels[index + 3], 255);
  }
  assert.equal(pixels[0], Math.round(eyepieceGrey(200, 40, 90)));
});

test("no pixel is ever brighter than its source", () => {
  const rgba = gradient();
  for (const render of [
    { cutoff: 0.2, gain: 0.9, softness: 0.12, discFieldRatio: 1 },
    { cutoff: 0.7, gain: 0.5, softness: 0.42, discFieldRatio: 1 },
    { cutoff: 0.5, gain: 1, softness: 0, discFieldRatio: 1 },
  ]) {
    const { output } = paint(rgba, render);
    for (let index = 0; index < rgba.length; index += 4)
      assert.ok(output[index] <= rgba[index] + tolerance);
  }
});

test("faint extensions fall to the background, the core stays (pixel test)", () => {
  const rgba = gradient();
  const { output, background } = paint(rgba, {
    cutoff: 0.6,
    gain: 1,
    softness: 0.36,
    discFieldRatio: 1,
  });
  // The core keeps its light; a pixel of the faint wing is the sky's grey.
  assert.ok(
    Math.abs(greyAt(output, 15, 15) - greyAt(rgba, 15, 15)) <= tolerance,
  );
  const wing = greyAt(rgba, 15, 26);
  assert.ok(wing > background + 10, "the source shows the wing");
  assert.ok(Math.abs(greyAt(output, 15, 26) - background) <= tolerance);
});

test("the knee is soft: no hard edge between the core and the sky", () => {
  const rgba = gradient({ falloff: 14 });
  const soft = paint(rgba, {
    cutoff: 0.5,
    gain: 1,
    softness: 0.3,
    discFieldRatio: 1,
  }).output;
  const hard = paint(rgba, {
    cutoff: 0.5,
    gain: 1,
    softness: 0,
    discFieldRatio: 1,
  }).output;
  const largestStep = (pixels) => {
    let step = 0;
    for (let x = 16; x < size - 1; x += 1)
      step = Math.max(
        step,
        Math.abs(greyAt(pixels, x, 15) - greyAt(pixels, x + 1, 15)),
      );
    return step;
  };
  assert.ok(
    largestStep(soft) < largestStep(hard),
    `${largestStep(soft)} vs ${largestStep(hard)}`,
  );
});

test("the gain attenuates the signal above the sky, never the sky itself", () => {
  const rgba = gradient();
  const { output, background } = paint(rgba, {
    cutoff: 0,
    gain: 0.5,
    softness: 0,
    discFieldRatio: 1,
  });
  const core = greyAt(rgba, 15, 15);
  assert.ok(
    Math.abs(
      greyAt(output, 15, 15) - (background + 0.5 * (core - background)),
    ) <= tolerance,
  );
  assert.ok(
    Math.abs(greyAt(output, 0, 0) - Math.min(greyAt(rgba, 0, 0), background)) <=
      tolerance,
  );
});

test("a more visible render never darkens a pixel", () => {
  for (let grey = 0; grey <= 255; grey += 5) {
    let previous = -1;
    for (const [cutoff, gain] of [
      [0.9, 0.35],
      [0.7, 0.5],
      [0.5, 0.65],
      [0.3, 0.8],
      [0.04, 1],
    ]) {
      const level = eyepieceGreyLevel(grey, 40, {
        cutoff,
        gain,
        softness: eyepieceViewConstants.render.softnessShare * cutoff,
      });
      assert.ok(level >= previous - 1e-9);
      previous = level;
    }
  }
});

test("the disc layout centres the image, wider than the disc on a narrow field (E3, E4)", () => {
  assert.deepEqual(eyepieceDiscLayout(1), { side: 1, offset: 0 });
  assert.deepEqual(eyepieceDiscLayout(0.5), { side: 2, offset: -0.5 });
  assert.deepEqual(eyepieceDiscLayout(4), { side: 0.25, offset: 0.375 });
  assert.deepEqual(eyepieceDiscLayout(null), { side: 1, offset: 0 });
});

test("the constants file holds every number the rule reads, and nothing is inline", () => {
  const { limitingMagnitude, visibility, render, disc, sourceField, pixels } =
    eyepieceViewConstants;
  for (const value of [
    limitingMagnitude.eyePupilMm,
    ...Object.values(visibility).filter((v) => typeof v === "number"),
    ...Object.values(render).filter((v) => typeof v === "number"),
    disc.minimumFieldRatio,
    ...Object.values(sourceField).filter((v) => typeof v === "number"),
    pixels.borderShare,
  ])
    assert.ok(Number.isFinite(value));
  assert.equal(disc.minimumFieldRatio, 0.5, "E4: never upscaled beyond 2x");
  assert.ok(render.cutoffSlope > 0 && render.gainSlope > 0, "monotonic (E2)");
  assert.ok(
    render.cutoffMinimum <= render.cutoffAtZero &&
      render.cutoffAtZero <= render.cutoffMaximum,
  );
  assert.ok(render.gainMinimum > 0 && render.gainAtZero <= 1);
});

// VISUAL-SIM-03: the render reads the verdict.
const baseRender = {
  cutoff: 0.7,
  gain: 0.54,
  softness: 0.42,
  discFieldRatio: 0.5,
  skyFill: 12,
};
const verdictOf = (status, magnitudeMargin, filterGain = 0) => ({
  status,
  magnitudeMargin,
  filterGain,
});

test("the render from the verdict: a suitable target is never cut above the ceiling, a filter lowers the sky", () => {
  const ceiling = eyepieceViewConstants.verdictRender.visibleCutoffMaximum;
  for (const status of ["suitable"])
    for (const margin of [-1.9, -1, 0, 0.6, 2.1, 5]) {
      const render = eyepieceRenderFromVerdict(
        verdictOf(status, margin),
        baseRender,
      );
      assert.ok(render.cutoff <= ceiling + 1e-12, `${status} ${margin}`);
      assert.ok(render.gain >= 0.3 && render.gain <= 1);
      assert.equal(
        render.softness,
        eyepieceViewConstants.render.softnessShare * render.cutoff,
      );
      assert.equal(render.discFieldRatio, 0.5);
    }
  // The UHC of the Dentelle under Bortle 1 (margin 2.09): the filaments pass, the gain is full.
  const uhc = eyepieceRenderFromVerdict(verdictOf("suitable", 2.0949, 0.5), {
    ...baseRender,
    skyFill: 12,
  });
  assert.ok(uhc.cutoff < 0.12 && uhc.gain > 0.95);
  // A filter's gain lowers the sky by 10 levels a magnitude, never under 12...
  assert.equal(
    eyepieceRenderFromVerdict(verdictOf("difficult", 0.4, 1), {
      ...baseRender,
      skyFill: 30,
    }).skyFill,
    20,
  );
  assert.equal(
    eyepieceRenderFromVerdict(verdictOf("difficult", 0.4, 5), {
      ...baseRender,
      skyFill: 30,
    }).skyFill,
    12,
  );
  // ... and under a bright sky (level 42 or more, Bortle 7-8) never under
  // 80 % of the place's level: grey, not black (rule 2).
  assert.equal(
    eyepieceRenderFromVerdict(verdictOf("difficult", 0.4, 5), {
      ...baseRender,
      skyFill: 54,
    }).skyFill,
    43,
  );
  // « Probablement invisible »: the high cutoff, the stars alone.
  const none = eyepieceRenderFromVerdict(verdictOf("unlikely", -2.32), {
    ...baseRender,
    skyFill: 44,
  });
  assert.ok(none.cutoff > 0.5 && none.gain === 0.3 && none.skyFill === 44);
  // More margin never raises the cutoff nor lowers the gain.
  let previous = null;
  for (const margin of [-3, -2.1, -1, 0, 1, 2, 4]) {
    const render = eyepieceRenderFromVerdict(
      verdictOf(margin < -2 ? "unlikely" : "difficult", margin),
      baseRender,
    );
    if (previous && margin >= -2.1) {
      assert.ok(render.cutoff <= previous.cutoff + 1e-12);
      assert.ok(render.gain >= previous.gain - 1e-12);
    }
    previous = render;
  }
});

test("the render from the verdict: an observer's NGC 6960, 115 mm APO + OIII under Bortle 8", () => {
  const sky = { ...baseRender, skyFill: 54 };
  const verdict = (margin, exitPupilMm) => ({
    status: "difficult",
    magnitudeMargin: margin,
    filterGain: 2,
    filterFamily: "oiii",
    exitPupilMm,
  });
  // Rule 1: « difficilement visible » keeps only the brightest share.
  const thirtyTwo = eyepieceRenderFromVerdict(verdict(0.018, 4.57), sky);
  assert.ok(thirtyTwo.cutoff >= 0.6 && thirtyTwo.gain <= 0.5);
  // Rule 3: 2,1 mm of pupil with a narrow-band filter, almost empty.
  const fifteen = eyepieceRenderFromVerdict(verdict(-0.805, 2.14), sky);
  assert.ok(fifteen.cutoff > 0.75 && fifteen.gain === 0.3);
  assert.ok(fifteen.cutoff > thirtyTwo.cutoff);
  // Rule 2: the sky is grey, not black.
  assert.ok(fifteen.skyFill >= 40 && thirtyTwo.skyFill >= 40);
  // A pupil of 3 mm or more, or no narrow-band filter: no penalty.
  assert.equal(eyepieceNarrowBandPupilPenalty(verdict(0, 3)), 0);
  assert.equal(
    eyepieceNarrowBandPupilPenalty({ ...verdict(0, 2), filterFamily: "lp" }),
    0,
  );
  assert.equal(
    eyepieceNarrowBandPupilPenalty({ ...verdict(0, 2), filterGain: 0 }),
    0,
  );
  assert.ok(
    Math.abs(eyepieceNarrowBandPupilPenalty(verdict(0, 2)) - 1) < 1e-12,
  );
});

test("the render from the verdict: without a margin the render stays as it is", () => {
  assert.equal(
    eyepieceRenderFromVerdict({ status: "unknown", visible: true }, baseRender),
    baseRender,
  );
  assert.equal(eyepieceRenderFromVerdict(null, baseRender), baseRender);
  assert.equal(eyepieceRenderFromVerdict(verdictOf("suitable", 1), null), null);
});
