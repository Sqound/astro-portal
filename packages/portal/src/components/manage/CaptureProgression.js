"use client";

import { captureMediaPath } from "./captures-client.js";

/**
 * The zone « Progression de la nuit » of the owner's detail: the milestones
 * Astro Sync stacked during the night of the capture — its history, never
 * among its variants — in a strip from the first (one frame) to the last,
 * each with the frames it stacks. Absent while the capture has none. Read
 * only: a progression image is never the main image nor a variant; the
 * galleries show it with the capture (`captures/gallery-progression.js`).
 *
 * The image of a multi-night plan (it names its plan, `projectId`) has no
 * night of its own: its progression is the image stacked after each night,
 * the frames being those stacked up to that night. The zone is then
 * « Progression de l’empilement » and each step says the night it follows.
 */
export function CaptureProgression({ capture, copy }) {
  const steps = capture.progression ?? [];
  if (!steps.length) return null;
  const ofPlan = Boolean(capture.projectId);
  const zone = ofPlan ? copy.progressionPlanZone : copy.progressionZone;
  const line = ofPlan ? copy.progressionPlanLine : copy.progressionLine;
  const stepLabel = ofPlan ? copy.progressionPlanStep : copy.progressionStep;
  return (
    <section className="capture-zone capture-progression" aria-label={zone}>
      <h3 className="capture-zone-title">{zone}</h3>
      <p className="capture-zone-line capture-progression-line">{line}</p>
      <ol className="capture-progression-strip">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className="capture-progression-step"
            data-image-id={step.id}
          >
            <span className="capture-progression-thumbnail">
              {step.thumbnail ? (
                <img
                  src={captureMediaPath(capture.id, {
                    thumbnail: true,
                    imageId: step.id,
                  })}
                  alt={stepLabel(index + 1, step.frameCount)}
                  loading="lazy"
                  decoding="async"
                />
              ) : null}
            </span>
            <span className="capture-progression-frames">
              {step.frameCount ? copy.progressionFrames(step.frameCount) : ""}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
