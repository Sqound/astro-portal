// What made an image -- its software and its steps -- is kept with the image
// by its producer (`variantProcessing` at the upload, `processing` on the
// image route). The capture shows the steps of its MAIN image: they follow it
// when the owner picks another image, never over what the owner wrote.
import assert from "node:assert/strict";
import test from "node:test";
import {
  SYNC,
  at,
  contractErrors,
  image,
  withMetadataSpace,
} from "./helpers/metadata-space.mjs";

const OLD = {
  software: "Astro Sync 1.0.0 · Siril 1.4.4",
  steps:
    "pipeline natural (raw) · alignment Siril 2-pass affine · weighted_mean 3 nights",
};
const NEW = {
  software: "Astro Sync 1.0.0 · Siril 1.4.4",
  steps:
    "pipeline dualband (dualband-correction) · alignment stars (astroalign) · dualband_reference 3 nights",
};
const FINISHED = {
  software: NEW.software,
  steps: `${NEW.steps} · contrast strong · colour 40 · soft stars 85`,
};

const stepsOf = async (owner, tenantId, captureId) =>
  (await owner.get({ tenantId, captureId })).metadata.processing.steps;

test("an image keeps its own steps; the capture shows its main image's, and those follow the main image", async () => {
  await withMetadataSpace(async ({ owner, store, space, send }) => {
    const { tenantId, userId } = space;
    // The first image creates the capture: its steps are the capture's and its own.
    const first = await send(
      image("old-fusion"),
      {
        sessionId: space.sessionId,
        targetIds: ["m31"],
        source: "stacking",
        processing: OLD,
        variantProcessing: OLD,
      },
      SYNC,
    );
    assert.equal(first.status, 201);
    const captureId = first.body.capture.id;
    assert.deepEqual(
      await contractErrors("capture.schema.json", "uploadResponse", first.body),
      [],
    );
    assert.equal((await stepsOf(owner, tenantId, captureId)).value, OLD.steps);

    // A new fusion arrives as an image of the capture, with its own steps and
    // its finished twin: the capture still says how its main image was made.
    const second = await send(
      image("new-fusion", 300),
      { captureId, source: "stacking", variantProcessing: NEW },
      SYNC,
    );
    const twin = await send(
      image("new-fusion-finished", 310),
      { captureId, source: "stacking", variantProcessing: FINISHED },
      SYNC,
    );
    assert.equal(second.status, 201);
    assert.equal(twin.status, 201);
    assert.equal(
      (await stepsOf(owner, tenantId, captureId)).value,
      OLD.steps,
      "an image sent as a variant never overwrites how the capture was made",
    );
    const variants = (await owner.get({ tenantId, captureId })).variants;
    assert.equal(variants.length, 3);

    // The owner picks the new fusion as the main image: the steps follow.
    for (const id of [second.body.variant.id, twin.body.variant.id])
      await store.recordVariantCheck(tenantId, id, {
        result: "sky",
        reason: null,
        at,
      });
    await owner.setMainImage({
      tenantId,
      userId,
      captureId,
      imageId: second.body.variant.id,
    });
    const afterNew = await stepsOf(owner, tenantId, captureId);
    assert.equal(afterNew.value, NEW.steps);
    assert.equal(afterNew.source, "astro-sync");
    // And the finished twin: its steps say the finish; the plain one's do not.
    await owner.setMainImage({
      tenantId,
      userId,
      captureId,
      imageId: twin.body.variant.id,
    });
    assert.equal(
      (await stepsOf(owner, tenantId, captureId)).value,
      FINISHED.steps,
    );
    await owner.setMainImage({
      tenantId,
      userId,
      captureId,
      imageId: second.body.variant.id,
    });
    assert.equal(
      (await stepsOf(owner, tenantId, captureId)).value,
      NEW.steps,
      "back on the plain image: no finish in the steps",
    );
  });
});

test("the steps the owner wrote stay when another image becomes the main one", async () => {
  await withMetadataSpace(async ({ owner, store, space, send }) => {
    const { tenantId, userId } = space;
    const first = await send(
      image("owner-first"),
      {
        sessionId: space.sessionId,
        targetIds: ["m31"],
        source: "stacking",
        processing: OLD,
        variantProcessing: OLD,
      },
      SYNC,
    );
    const captureId = first.body.capture.id;
    const second = await send(
      image("owner-second", 300),
      { captureId, source: "stacking", variantProcessing: NEW },
      SYNC,
    );
    await owner.updateMetadata({
      tenantId,
      userId,
      captureId,
      metadata: { "processing.steps": "Mon traitement à la main" },
    });
    await store.recordVariantCheck(tenantId, second.body.variant.id, {
      result: "sky",
      reason: null,
      at,
    });
    await owner.setMainImage({
      tenantId,
      userId,
      captureId,
      imageId: second.body.variant.id,
    });
    const steps = await stepsOf(owner, tenantId, captureId);
    assert.equal(steps.value, "Mon traitement à la main");
    assert.equal(steps.source, "owner");
  });
});

test("an image sent before the steps were kept leaves the capture's as they are when it becomes the main one", async () => {
  await withMetadataSpace(async ({ owner, store, space, send }) => {
    const { tenantId, userId } = space;
    const first = await send(
      image("kept-first"),
      {
        sessionId: space.sessionId,
        targetIds: ["m31"],
        source: "stacking",
        processing: OLD,
      },
      SYNC,
    );
    const captureId = first.body.capture.id;
    const second = await send(
      image("kept-second", 300),
      { captureId, source: "stacking" },
      SYNC,
    );
    await store.recordVariantCheck(tenantId, second.body.variant.id, {
      result: "sky",
      reason: null,
      at,
    });
    await owner.setMainImage({
      tenantId,
      userId,
      captureId,
      imageId: second.body.variant.id,
    });
    assert.equal((await stepsOf(owner, tenantId, captureId)).value, OLD.steps);
  });
});

test("on the image route: `processing` is the image's own, shown by the capture only while it is the main one", async () => {
  await withMetadataSpace(async ({ owner, space, send }) => {
    const { tenantId, userId } = space;
    const first = await send(
      image("route-first"),
      { sessionId: space.sessionId, targetIds: ["m31"], source: "stacking" },
      SYNC,
    );
    const captureId = first.body.capture.id;
    const mainId = first.body.variant?.id
      ? first.body.variant.id
      : (await owner.get({ tenantId, captureId })).variants.find((v) => v.main)
          .id;
    const second = await send(
      image("route-second", 300),
      { captureId, source: "stacking" },
      SYNC,
    );
    // On a variant: kept with it, the capture unchanged.
    let answer = await owner.proposeVariantText({
      tenantId,
      userId,
      captureId,
      imageId: second.body.variant.id,
      source: "astro-sync",
      processing: NEW,
    });
    assert.deepEqual(answer.skipped, []);
    assert.equal(answer.capture.metadata.processing.steps.value, null);
    // On the main image: the capture says it too.
    answer = await owner.proposeVariantText({
      tenantId,
      userId,
      captureId,
      imageId: mainId,
      source: "astro-sync",
      processing: OLD,
    });
    assert.equal(answer.capture.metadata.processing.steps.value, OLD.steps);
    assert.equal(answer.capture.metadata.processing.steps.source, "astro-sync");
    // The same proposal twice changes nothing; a malformed one is refused.
    const again = await owner.proposeVariantText({
      tenantId,
      userId,
      captureId,
      imageId: mainId,
      source: "astro-sync",
      processing: OLD,
    });
    assert.deepEqual(again.skipped, []);
    await assert.rejects(
      owner.proposeVariantText({
        tenantId,
        userId,
        captureId,
        imageId: mainId,
        source: "astro-sync",
        processing: { steps: "x".repeat(501) },
      }),
      (error) => error.code === "invalid_metadata",
    );
    await assert.rejects(
      send(
        image("route-refused", 310),
        { captureId, source: "stacking", variantProcessing: { colour: 4 } },
        SYNC,
      ),
      (error) =>
        error.code === "invalid_metadata" &&
        error.body.error.field === "variantProcessing",
    );
  });
});
