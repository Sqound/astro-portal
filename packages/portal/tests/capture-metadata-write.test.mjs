// The owner's hand writes one field per request —
// `null` gives it back to its source —, changes the capture's night for
// another night of the space, chooses its equipment among the space's;
// from a paired device (a device token) only the five fields a device writes; and
// nothing is written in the read-only window of an ended subscription.
import assert from "node:assert/strict";
import test from "node:test";
import { OPEN_SOURCE_PROFILE } from "../dist/capabilities/profiles.js";
import { staticProfile } from "../dist/capabilities/provider.js";
import {
  SYNC,
  WEB,
  image,
  profile,
  withMetadataSpace,
} from "./helpers/metadata-space.mjs";

const refused = (code, status) => (error) => {
  assert.equal(error.code, code, error.message);
  if (status) assert.equal(error.status, status);
  return true;
};

async function m31(send, space, caller = WEB) {
  return (
    await send(
      image(`m31-${Math.random()}`),
      { sessionId: space.sessionId, targetIds: ["m31"] },
      caller,
    )
  ).body.capture.id;
}

test("one field per request: set, then null back to its source; two fields refused; the limit named", async () => {
  await withMetadataSpace(async ({ owner, space, send }) => {
    const { tenantId, userId } = space;
    const captureId = await m31(send, space);
    const write = (metadata, by = "web") =>
      owner.updateMetadata({ tenantId, userId, captureId, metadata, by });
    const titled = await write({ title: "M31 — première nuit d’automne" });
    assert.deepEqual(
      { ...titled.metadata.title, at: Boolean(titled.metadata.title.at) },
      {
        value: "M31 — première nuit d’automne",
        source: "owner",
        at: true,
        edited: true,
      },
    );
    const untitled = await write({ title: null });
    assert.deepEqual(untitled.metadata.title, {
      value: null,
      source: null,
      at: null,
      edited: false,
    });
    await assert.rejects(
      write({ title: "a", description: "b" }),
      refused("invalid_metadata", 400),
    );
    await assert.rejects(write({ notes: "n".repeat(4001) }), (error) => {
      assert.equal(error.code, "invalid_metadata");
      assert.equal(error.field, "notes");
      assert.equal(error.limit, 4000);
      return true;
    });
    const noted = await write({ notes: "Rosée sur la lunette vers 2 h." });
    assert.equal(noted.metadata.notes.edited, true);
    // Through the owner's PATCH body, as the manage route sends it.
    const described = await owner.update({
      tenantId,
      userId,
      captureId,
      changes: { metadata: { description: "Première nuit d’automne au col." } },
    });
    assert.equal(
      described.metadata.description.value,
      "Première nuit d’automne au col.",
    );
  });
});

test("an acquisition line corrected, added and deleted; the night's steps read until the first correction", async () => {
  await withMetadataSpace(async ({ owner, space, send }) => {
    const { tenantId, userId } = space;
    const captureId = await m31(send, space);
    const write = (metadata) =>
      owner.updateMetadata({ tenantId, userId, captureId, metadata });
    const before = await owner.get({ tenantId, captureId });
    assert.equal(before.metadata.acquisition.own, false);
    const [dual] = before.metadata.acquisition.lines;
    const corrected = await write({
      acquisition: {
        line: dual.id,
        set: {
          filter: "Dual-band",
          frameCount: 36,
          exposureSeconds: 180,
          gain: 100,
        },
      },
    });
    assert.equal(corrected.metadata.acquisition.own, true);
    assert.deepEqual(
      corrected.metadata.acquisition.lines.map((line) => [
        line.frameCount,
        line.edited,
      ]),
      [
        [36, true],
        [20, false],
      ],
    );
    assert.equal(corrected.metadata.acquisition.totalSeconds, 36 * 180 + 2400);
    const added = await write({
      acquisition: {
        add: { filter: "Ha", frameCount: 10, exposureSeconds: 300, gain: null },
      },
    });
    assert.equal(added.metadata.acquisition.lines.length, 3);
    const extra = added.metadata.acquisition.lines[2];
    assert.equal(extra.origin, "owner");
    const removed = await write({
      acquisition: { line: extra.id, delete: true },
    });
    assert.equal(removed.metadata.acquisition.lines.length, 2);
    await assert.rejects(
      write({
        acquisition: {
          line: dual.id,
          set: { filter: "Dual-band", frameCount: 36, exposureSeconds: 0 },
        },
      }),
      (error) => error.field === "acquisition.exposureSeconds",
    );
    await assert.rejects(
      write({ acquisition: { line: "nowhere", delete: true } }),
      refused("acquisition_line_not_found", 404),
    );
    const back = await write({ acquisition: null });
    assert.equal(back.metadata.acquisition.own, false);
    assert.equal(back.metadata.acquisition.lines.length, 2);
  });
});

test("« Changer la nuit de la capture »: another night of the space; another space's night and equipment are not found", async () => {
  await withMetadataSpace(async ({ owner, space, other, send }) => {
    const { tenantId, userId } = space;
    const captureId = await m31(send, space);
    const write = (metadata) =>
      owner.updateMetadata({ tenantId, userId, captureId, metadata });
    const moved = await write({ sessionId: space.otherSessionId });
    assert.equal(moved.sessionId, space.otherSessionId);
    assert.equal(moved.metadata.sessionId, space.otherSessionId);
    assert.equal(moved.metadata.acquisition.lines.length, 0);
    await assert.rejects(
      write({ sessionId: other.sessionId }),
      refused("session_not_found", 404),
    );
    const camera = await write({
      "equipment.cameraId": space.equipment.otherCamera,
    });
    assert.equal(
      camera.metadata.equipment.camera.value.name,
      "Caméra de guidage",
    );
    assert.equal(camera.metadata.equipment.camera.edited, true);
    const filters = await write({
      "equipment.filterIds": [space.equipment.filter],
    });
    assert.deepEqual(
      filters.metadata.equipment.filters.value.map((entry) => entry.name),
      ["Dual-band"],
    );
    await assert.rejects(
      write({ "equipment.cameraId": other.equipment.camera }),
      refused("equipment_not_found", 404),
    );
    await assert.rejects(
      owner.updateMetadata({
        tenantId: other.tenantId,
        userId: other.userId,
        captureId,
        metadata: { title: "x" },
      }),
      refused("capture_not_found", 404),
    );
  });
});

test("from the phone (a device token as the owner's hand): every field of `deviceMetadataField`, `edited`; the capture's session web only", async () => {
  await withMetadataSpace(async ({ owner, space, send }) => {
    const { tenantId, userId } = space;
    const captureId = await m31(send, space, SYNC);
    const phone = (metadata) =>
      owner.updateMetadata({
        tenantId,
        userId,
        captureId,
        metadata,
        by: "device",
      });
    for (const metadata of [
      { title: "M31 au col" },
      { description: "Une nuit d’automne." },
      { notes: "Rosée." },
      { calibration: "30 darks · 30 flats" },
      {
        acquisition: {
          add: { filter: "L", frameCount: 5, exposureSeconds: 60, gain: 0 },
        },
      },
    ]) {
      const [field] = Object.keys(metadata);
      const read = await phone(metadata);
      const value =
        field === "acquisition"
          ? read.metadata.acquisition
          : read.metadata[field];
      assert.equal(value.edited, true, field);
    }
    // The phone also writes the equipment (`deviceMetadataField`), the sensor
    // and the processing.
    for (const [metadata, read] of [
      [
        { "equipment.cameraId": space.equipment.camera },
        (capture) => capture.metadata.equipment.camera,
      ],
      [
        { sensor: { temperatureC: -10, binning: 1 } },
        (capture) => capture.metadata.sensor,
      ],
      [
        { "processing.software": "Siril 1.4.4" },
        (capture) => capture.metadata.processing.software,
      ],
      [
        { "processing.steps": "Empilement" },
        (capture) => capture.metadata.processing.steps,
      ],
    ])
      assert.equal(read(await phone(metadata)).edited, true);
    await assert.rejects(
      phone({ sessionId: space.otherSessionId }),
      refused("web_session_required", 403),
    );
  });
});

test("the image's title and description by the owner: one request for both, `title_source: owner`, `edited`; blank both gives the image back", async () => {
  await withMetadataSpace(async ({ owner, space, send }) => {
    const { tenantId, userId } = space;
    const captureId = await m31(send, space);
    const [main] = (await owner.get({ tenantId, captureId })).variants;
    const named = await owner.setVariantText({
      tenantId,
      userId,
      captureId,
      imageId: main.id,
      texts: {
        title: "Rendu brut",
        description: "Les couleurs du capteur, sans retouche de teinte.",
      },
    });
    const [image1] = named.variants;
    assert.equal(image1.title, "Rendu brut");
    assert.equal(image1.titleSource, "owner");
    assert.equal(image1.edited, true);
    await assert.rejects(
      owner.setVariantText({
        tenantId,
        userId,
        captureId,
        imageId: main.id,
        texts: { title: "é".repeat(91), description: "ok" },
      }),
      (error) => error.field === "title" && error.limit === 90,
    );
    const cleared = await owner.setVariantText({
      tenantId,
      userId,
      captureId,
      imageId: main.id,
      texts: { title: null, description: null },
    });
    assert.equal(cleared.variants[0].titleSource, null);
    assert.equal(cleared.variants[0].edited, false);
  });
});

test("read only (an ended subscription): every write of the metadata refused with entitlement_read_only, producers included; the reading kept", async () => {
  const readOnly = {
    ...staticProfile(profile()),
    writeAccessFor: async () => ({ readOnly: true }),
  };
  await withMetadataSpace(
    async ({ owner, space, driver }) => {
      const { tenantId, userId } = space;
      // A capture written straight in the table: the upload itself is
      // refused in the read-only window.
      const captureId = "00000000-0000-4000-8000-0000000000c1";
      await driver.run(
        "INSERT INTO captures (id, tenant_id, session_id, original_name, sha256, byte_size, status, stage, created_at) VALUES (?, ?, ?, 'M31_final.jpg', ?, 14, 'uploaded', 'finalized', ?)",
        [
          captureId,
          tenantId,
          space.sessionId,
          "e".repeat(64),
          "2026-10-06T21:02:00.000Z",
        ],
      );
      await driver.run(
        "INSERT INTO capture_variants (id, capture_id, tenant_id, sha256, byte_size, original_name, is_main, is_public, created_at) VALUES ('image-ro', ?, ?, ?, 14, 'M31_final.jpg', 1, 0, ?)",
        [captureId, tenantId, "e".repeat(64), "2026-10-06T21:02:00.000Z"],
      );
      const ro = refused("entitlement_read_only", 403);
      await assert.rejects(
        owner.updateMetadata({
          tenantId,
          userId,
          captureId,
          metadata: { title: "x" },
        }),
        ro,
      );
      await assert.rejects(
        owner.proposeMetadata({
          tenantId,
          userId,
          captureId,
          proposed: { source: "astro-sync", calibration: "30 darks" },
        }),
        ro,
      );
      await assert.rejects(
        owner.proposeVariantText({
          tenantId,
          userId,
          captureId,
          imageId: "image-ro",
          source: "astro-sync",
          title: "Rendu brut",
        }),
        ro,
      );
      await assert.rejects(
        owner.setVariantText({
          tenantId,
          userId,
          captureId,
          imageId: "image-ro",
          texts: { title: "Rendu brut" },
        }),
        ro,
      );
      const read = await owner.get({ tenantId, captureId });
      assert.equal(read.metadata.acquisition.lines.length, 2);
    },
    { entitlementProvider: readOnly },
  );
  // A private server never enters that window.
  assert.equal(
    (await staticProfile(OPEN_SOURCE_PROFILE).writeAccessFor?.(null))
      ?.readOnly ?? false,
    false,
  );
});

test("the list says when the 90 days of reading end and whether a payment failed; nothing of it outside the window", async () => {
  const window = (access) => ({
    ...staticProfile(profile()),
    writeAccessFor: async () => access,
  });
  const listOf = async (access) => {
    let page;
    await withMetadataSpace(
      async ({ owner, space }) => {
        page = await owner.list({
          tenantId: space.tenantId,
          userId: space.userId,
        });
      },
      { entitlementProvider: window(access) },
    );
    return page;
  };
  const ended = await listOf({
    readOnly: true,
    readOnlyUntil: "2027-01-11T12:00:00.000Z",
  });
  assert.equal(ended.readOnly, true);
  assert.equal(ended.readOnlyUntil, "2027-01-11T12:00:00.000Z");
  assert.equal("paymentFailed" in ended, false);
  const failed = await listOf({
    readOnly: true,
    readOnlyUntil: "2027-01-16T12:00:00.000Z",
    paymentFailed: true,
  });
  assert.equal(failed.paymentFailed, true);
  const live = await listOf({ readOnly: false });
  assert.equal(live.readOnly, false);
  assert.equal("readOnlyUntil" in live, false);
  assert.equal("paymentFailed" in live, false);
});
