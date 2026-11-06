// The progression images of a multi-night plan, sent by the resumable
// protocol as Astro Sync sends them: three nights (120 · 209 · 309 frames),
// one capture of the plan, three progression images naming that capture.
// A night never needs a capture of its own.
//
// And the case met on 03/11/2026 (ASYNC-PROGRESSION-NIGHT-01): the space was
// emptied while the uploads of two progression images were still open on
// the capture of the plan it held then. Sending the plan again made a new
// capture; the two images, whose bytes are the same, found their old open
// upload — still aimed at the capture that was gone — and were refused for
// good (`404 capture_not_found`). An open upload follows the capture its
// latest create names, a removed capture closes the uploads aimed at it, and
// a finalize whose capture is gone asks for a new create, never a refusal.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  SYNC,
  at,
  digest,
  image,
  withMetadataSpace,
} from "./helpers/metadata-space.mjs";

const NIGHTS = [
  [1, 120],
  [2, 209],
  [3, 309],
];

const progressionBytes = (night) => image(`plan-night-${night}`, 80);

/** The capture of a multi-night plan, as its image creates it. */
async function planCapture(driver, space, label) {
  const captureId = randomUUID();
  await driver.run(
    `INSERT INTO captures (id, tenant_id, session_id, plan_id, target_id, original_name, sha256, byte_size, status, stage, visibility, created_at, project_id, plan_json)
     VALUES (?, ?, NULL, NULL, 'm31', ?, ?, 100, 'uploaded', 'finalized', 'private', ?, ?, ?)`,
    [
      captureId,
      space.tenantId,
      `${label}_plan_raw.tif`,
      digest(Buffer.from(`${label}-${captureId}`)),
      at,
      randomUUID(),
      JSON.stringify({
        combinedNightIds: ["night-1", "night-2", "night-3"],
        totalsByFilter: [],
      }),
    ],
  );
  await driver.run(
    "INSERT INTO capture_targets (capture_id, target_id, position) VALUES (?, 'm31', 0)",
    [captureId],
  );
  return captureId;
}

/** The create step Astro Sync sends for the progression image of `night`. */
function progressionDeclaration(space, captureId, night, frames) {
  const bytes = progressionBytes(night);
  return {
    tenantId: space.tenantId,
    userId: space.userId,
    caller: SYNC,
    originalName: `Sh2-103_plan_night-0${night}_${frames}-frames.jpg`,
    sha256: digest(bytes),
    byteSize: bytes.length,
    contentType: "image/jpeg",
    captureId,
    role: "progression",
    progressionFrames: frames,
    targetIds: ["m31"],
    source: "astro-sync",
  };
}

async function* once(buffer) {
  yield buffer;
}

/** Create, every byte, but no finalize: an upload left open. */
async function openUpload(uploads, space, captureId, night, frames) {
  const created = await uploads.createUpload(
    progressionDeclaration(space, captureId, night, frames),
  );
  const bytes = progressionBytes(night);
  if (created.body.offset < bytes.length)
    await uploads.putUploadChunk({
      tenantId: space.tenantId,
      userId: space.userId,
      uploadId: created.body.uploadId,
      declaredOffset: created.body.offset,
      declaredContentLength: bytes.length - created.body.offset,
      bodyChunks: once(bytes.subarray(created.body.offset)),
    });
  return created;
}

/** The whole resumable sending of one progression image. */
async function sendProgression(uploads, space, captureId, night, frames) {
  const created = await openUpload(uploads, space, captureId, night, frames);
  return await uploads.finalizeUpload({
    tenantId: space.tenantId,
    userId: space.userId,
    uploadId: created.body.uploadId,
    caller: SYNC,
  });
}

async function progressionOf(owner, space, captureId) {
  const detail = await owner.get({ ...space, captureId });
  return detail.progression.map((step) => [step.originalName, step.frameCount]);
}

const EXPECTED = [
  ["Sh2-103_plan_night-01_120-frames.jpg", 120],
  ["Sh2-103_plan_night-02_209-frames.jpg", 209],
  ["Sh2-103_plan_night-03_309-frames.jpg", 309],
];

test("three nights, one capture of the plan: every progression image joins it, by its night and its frames", async () => {
  await withMetadataSpace(async ({ driver, uploads, owner, space }) => {
    const captureId = await planCapture(driver, space, "Sh2-103");
    for (const [night, frames] of NIGHTS) {
      const finalized = await sendProgression(
        uploads,
        space,
        captureId,
        night,
        frames,
      );
      assert.equal(finalized.status, 200, JSON.stringify(finalized.body));
      assert.equal(finalized.body.captureId, captureId);
    }
    assert.deepEqual(await progressionOf(owner, space, captureId), EXPECTED);
  });
});

test("a space emptied while two progression uploads were open: sending the plan again joins all three to the new capture", async () => {
  await withMetadataSpace(async ({ driver, uploads, owner, space }) => {
    const former = await planCapture(driver, space, "Sh2-103");
    // Nights 1 and 2 were on their way, every byte received, no finalize.
    await openUpload(uploads, space, former, 1, 120);
    await openUpload(uploads, space, former, 2, 209);
    // The space is emptied from the web.
    await owner.remove({ tenantId: space.tenantId, captureId: former });

    const captureId = await planCapture(driver, space, "Sh2-103");
    for (const [night, frames] of NIGHTS) {
      const finalized = await sendProgression(
        uploads,
        space,
        captureId,
        night,
        frames,
      );
      assert.equal(finalized.status, 200, JSON.stringify(finalized.body));
      assert.equal(finalized.body.captureId, captureId);
    }
    assert.deepEqual(await progressionOf(owner, space, captureId), EXPECTED);
  });
});

test("an open upload left on a capture that is gone (before this fix) follows the capture its latest create names", async () => {
  await withMetadataSpace(async ({ driver, uploads, owner, space }) => {
    const former = await planCapture(driver, space, "Sh2-103");
    const left = await openUpload(uploads, space, former, 1, 120);
    // The capture went without closing its open uploads: the rows a
    // service before this fix left behind.
    await driver.run("DELETE FROM capture_targets WHERE capture_id = ?", [
      former,
    ]);
    await driver.run("DELETE FROM captures WHERE id = ?", [former]);

    const captureId = await planCapture(driver, space, "Sh2-103");
    const again = await uploads.createUpload(
      progressionDeclaration(space, captureId, 1, 120),
    );
    // The same upload, its bytes kept: nothing to send again.
    assert.equal(again.body.uploadId, left.body.uploadId);
    assert.equal(again.body.offset, progressionBytes(1).length);
    const finalized = await uploads.finalizeUpload({
      tenantId: space.tenantId,
      userId: space.userId,
      uploadId: again.body.uploadId,
      caller: SYNC,
    });
    assert.equal(finalized.status, 200, JSON.stringify(finalized.body));
    assert.equal(finalized.body.captureId, captureId);
    assert.deepEqual(await progressionOf(owner, space, captureId), [
      EXPECTED[0],
    ]);
  });
});

test("a finalize whose capture is gone asks for a new create (409 upload_capture_gone), never a refusal of the image", async () => {
  await withMetadataSpace(async ({ driver, uploads, owner, space }) => {
    const former = await planCapture(driver, space, "Sh2-103");
    const left = await openUpload(uploads, space, former, 2, 209);
    await driver.run("DELETE FROM capture_targets WHERE capture_id = ?", [
      former,
    ]);
    await driver.run("DELETE FROM captures WHERE id = ?", [former]);

    await assert.rejects(
      uploads.finalizeUpload({
        tenantId: space.tenantId,
        userId: space.userId,
        uploadId: left.body.uploadId,
        caller: SYNC,
      }),
      (error) => error.code === "upload_capture_gone" && error.status === 409,
    );

    // A new create for the capture of the plan sends it, its bytes kept.
    const captureId = await planCapture(driver, space, "Sh2-103");
    const again = await uploads.createUpload(
      progressionDeclaration(space, captureId, 2, 209),
    );
    assert.equal(again.body.uploadId, left.body.uploadId);
    assert.equal(again.body.offset, progressionBytes(2).length);
    const finalized = await uploads.finalizeUpload({
      tenantId: space.tenantId,
      userId: space.userId,
      uploadId: again.body.uploadId,
      caller: SYNC,
    });
    assert.equal(finalized.status, 200, JSON.stringify(finalized.body));
    assert.equal(finalized.body.captureId, captureId);
    assert.deepEqual(await progressionOf(owner, space, captureId), [
      EXPECTED[1],
    ]);
    // A capture the space does not hold stays an error of the request.
    await assert.rejects(
      uploads.createUpload(progressionDeclaration(space, randomUUID(), 3, 309)),
      (error) => error.code === "capture_not_found" && error.status === 404,
    );
  });
});
