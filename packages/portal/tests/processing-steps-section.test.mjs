// The « Traitement » section of the public capture page reads the software
// and the steps of a processing Astro Sync made, each step on its own line
// with its parameters (the pipeline, the alignment, the level match, the
// weights of the combination...).
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { PublicCapturePage, processingSteps, publicCaptureRows } =
  await import("portal/components/detail/PublicCapturePage.js");

const STEPS =
  "pipeline raw · alignment Siril 2-pass affine · level match aperture r=11.5 px scales 1.012/0.998/1 · weighted_mean 2 nights weights 0.552/0.448 · no data 0.8 % · 180 lights";
const capture = {
  id: "00000000-0000-4000-8000-000000000041",
  targets: [{ id: "ic1805", designation: "IC 1805", aliases: [] }],
  tag: "Nébuleuse",
  tags: [],
  exposure: null,
  nightMonth: null,
  media: { image: "/m", thumbnail: "/t" },
  equipment: [],
  image: { width: 4000, height: 2670 },
  variants: [],
  metadata: {
    acquisition: [],
    processing: { software: "Astro Sync 0.1.0 · Siril 1.4.4", steps: STEPS },
    filters: [],
  },
};

test("the steps are split on their separator, one per line", () => {
  assert.deepEqual(processingSteps(STEPS).slice(0, 3), [
    "pipeline raw",
    "alignment Siril 2-pass affine",
    "level match aperture r=11.5 px scales 1.012/0.998/1",
  ]);
  assert.deepEqual(processingSteps("raw"), ["raw"]);
  assert.deepEqual(processingSteps(null), []);
});

test("the section shows the software, the pipeline and each step with its parameters", () => {
  const rows = publicCaptureRows(capture, "en").find(
    (section) => section.section === "processing",
  ).rows;
  assert.deepEqual(rows, [
    ["Software", "Astro Sync 0.1.0 · Siril 1.4.4"],
    ["Steps", STEPS],
  ]);
  const markup = renderToStaticMarkup(
    createElement(PublicCapturePage, { capture, locale: "en" }),
  );
  assert.match(markup, /<ol class="processing-steps">/);
  for (const step of processingSteps(STEPS))
    assert.ok(markup.includes(`<li>${step}</li>`), step);
  assert.match(markup, /Astro Sync 0\.1\.0 · Siril 1\.4\.4/);
  // A single step stays a plain line.
  const single = {
    ...capture,
    metadata: {
      ...capture.metadata,
      processing: { software: "Siril", steps: "Calibration, stack" },
    },
  };
  assert.doesNotMatch(
    renderToStaticMarkup(
      createElement(PublicCapturePage, { capture: single, locale: "en" }),
    ),
    /processing-steps/,
  );
});
