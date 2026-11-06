// The image of a multi-night plan takes progression images like any capture:
// the stacked image after each night, sent in any order, read from the first
// night to the last by the frames stacked so far (120 · 209 · 309), kept out
// of the variants; the public page shows it with the capture, in that order,
// as a plan's progression.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  SYNC,
  at,
  image,
  withMetadataSpace,
} from "./helpers/metadata-space.mjs";

test("the progression of a plan image is read by the frames stacked so far, whatever the order sent", async () => {
  await withMetadataSpace(async ({ driver, owner, gallery, space, send }) => {
    // The image of a plan: a capture of no night that names its plan.
    const captureId = randomUUID();
    await driver.run(
      `INSERT INTO captures (id, tenant_id, session_id, plan_id, target_id, original_name, sha256, byte_size, status, stage, visibility, created_at, project_id, plan_json)
       VALUES (?, ?, NULL, NULL, 'm31', 'plan.tif', ?, 100, 'uploaded', 'finalized', 'public', ?, ?, ?)`,
      [
        captureId,
        space.tenantId,
        captureId.replaceAll("-", "").repeat(2),
        at,
        randomUUID(),
        JSON.stringify({ combinedNightIds: [], totalsByFilter: [] }),
      ],
    );
    await driver.run(
      "INSERT INTO capture_targets (capture_id, target_id, position) VALUES (?, 'm31', 0)",
      [captureId],
    );
    for (const [night, frames] of [
      [3, 309],
      [1, 120],
      [2, 209],
    ]) {
      const sent = await send(
        image(`night-${night}`, 60),
        {
          captureId,
          role: "progression",
          progressionFrames: frames,
          originalName: `night_0${night}.jpg`,
          source: "astro-sync",
        },
        SYNC,
      );
      assert.equal(sent.status, 201, JSON.stringify(sent.body));
    }
    const detail = await owner.get({ ...space, captureId });
    assert.ok(detail.projectId, "the capture names its plan");
    assert.deepEqual(
      detail.progression.map((step) => [step.originalName, step.frameCount]),
      [
        ["night_01.jpg", 120],
        ["night_02.jpg", 209],
        ["night_03.jpg", 309],
      ],
    );
    assert.equal(detail.variants.length, 0);
    // The public page shows the progression with the capture, a plan's,
    // in the same order, and never among the variants.
    const publicView = await gallery.get({ captureId, locale: "fr" });
    assert.ok(publicView);
    assert.equal(publicView.progression.plan, true);
    assert.deepEqual(
      publicView.progression.steps.map((step) => step.frameCount),
      [120, 209, 309],
    );
    assert.equal(
      (publicView.variants ?? []).some((variant) => variant.role),
      false,
    );
  });
});
