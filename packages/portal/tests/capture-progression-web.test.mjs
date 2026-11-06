// The owner's detail of
// a capture shows « Progression de la nuit », the milestones Astro Sync
// stacked, in a strip from the first to the last, each with its frames.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { CaptureProgression } =
  await import("portal/components/manage/CaptureProgression.js");
const { capturesCopy, capturesCopyFor } =
  await import("portal/components/manage/captures-copy.js");

const plain = (text) => String(text).replace(/[  ]/g, " ");
const textOf = (markup) =>
  plain(
    markup
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim(),
  );

const captureId = "2e7d9b31-4c06-4a8f-91b3-5f8c0d2a6e47";
const steps = [1, 23, 45, 68, 90].map((frameCount, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index + 1}`,
  sha256: String(index + 1).repeat(64),
  byteSize: 2_200_000,
  originalName: `milestone_0${index + 1}.jpg`,
  frameCount,
  createdAt: "2026-10-12T09:00:00.000Z",
  thumbnail: index !== 4,
}));

test("« Progression de la nuit »: the milestones in a strip, from the first to the last, with their frames", () => {
  const markup = renderToStaticMarkup(
    createElement(CaptureProgression, {
      capture: { id: captureId, progression: steps },
      copy: capturesCopyFor("fr"),
    }),
  );
  assert.match(textOf(markup), /^Progression de la nuit Les jalons/);
  assert.match(textOf(markup), /1 pose 23 poses 45 poses 68 poses 90 poses$/);
  // Each milestone is served by the media route of its image.
  assert.equal((markup.match(/<li /g) ?? []).length, 5);
  assert.ok(
    markup.includes(
      `/api/v1/manage/captures/${captureId}/media?variant=thumbnail&amp;imageId=${steps[0].id}`,
    ),
    markup,
  );
  assert.ok(markup.includes('alt="Jalon 1 — 1 pose"'), markup);
  assert.ok(markup.includes('alt="Jalon 4 — 68 poses"'), markup);
  // A milestone without its thumbnail yet keeps its place and its frames.
  assert.equal((markup.match(/<img /g) ?? []).length, 4);
});

test("no progression: no zone", () => {
  for (const progression of [undefined, []])
    assert.equal(
      renderToStaticMarkup(
        createElement(CaptureProgression, {
          capture: { id: captureId, progression },
          copy: capturesCopyFor("fr"),
        }),
      ),
      "",
    );
});

test("the zone speaks the ten languages", () => {
  const locales = Object.keys(capturesCopy);
  assert.equal(locales.length, 10);
  for (const locale of locales) {
    const copy = capturesCopyFor(locale);
    for (const key of ["progressionZone", "progressionLine"])
      assert.equal(typeof copy[key], "string", `${locale} ${key}`);
    assert.match(copy.progressionFrames(90), /90/, locale);
    assert.match(copy.progressionStep(5, 90), /5.*90/, locale);
  }
});

test("the image of a multi-night plan: « Progression de l’empilement », one image after each night, by the frames stacked so far", () => {
  const nights = [120, 209, 309].map((frameCount, index) => ({
    id: `00000000-0000-4000-8000-00000000010${index + 1}`,
    sha256: String(index + 1).repeat(64),
    byteSize: 2_200_000,
    originalName: `night_0${index + 1}.jpg`,
    frameCount,
    createdAt: "2026-10-26T09:00:00.000Z",
    thumbnail: true,
  }));
  const render = (capture, locale) =>
    renderToStaticMarkup(
      createElement(CaptureProgression, {
        capture,
        copy: capturesCopyFor(locale),
      }),
    );
  const plan = render(
    {
      id: captureId,
      projectId: "5d0c6b1e-2f4a-4c8e-9b7d-3a1f0e6c2b90",
      progression: nights,
    },
    "fr",
  );
  assert.match(
    textOf(plan),
    /^Progression de l’empilement Le cumul de l’image/,
  );
  assert.match(textOf(plan), /120 poses 209 poses 309 poses$/);
  assert.ok(plan.includes('alt="Après la nuit 1 — 120 poses"'), plan);
  assert.ok(plan.includes('alt="Après la nuit 3 — 309 poses"'), plan);
  assert.doesNotMatch(plan, /Progression de la nuit|Jalon/);
  assert.match(
    textOf(
      render({ id: captureId, projectId: "p", progression: nights }, "en"),
    ),
    /^Stacking progress /,
  );
  // The capture of a night keeps its words.
  const night = render(
    { id: captureId, projectId: null, progression: nights },
    "fr",
  );
  assert.match(textOf(night), /^Progression de la nuit Les jalons/);
  assert.ok(night.includes('alt="Jalon 2 — 209 poses"'), night);
  const absent = render({ id: captureId, progression: nights }, "fr");
  assert.match(textOf(absent), /^Progression de la nuit/);
});

test("the plan words speak the ten languages, and differ from the night's", () => {
  for (const locale of Object.keys(capturesCopy)) {
    const copy = capturesCopyFor(locale);
    for (const key of ["progressionPlanZone", "progressionPlanLine"]) {
      assert.equal(typeof copy[key], "string", `${locale} ${key}`);
      assert.ok(copy[key].length > 3, `${locale} ${key}`);
    }
    assert.notEqual(copy.progressionPlanZone, copy.progressionZone, locale);
    assert.match(copy.progressionPlanStep(2, 209), /2.*209/, locale);
    assert.match(copy.progressionPlanStep(2, null), /2/, locale);
  }
});
