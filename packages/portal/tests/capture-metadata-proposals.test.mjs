// A producer's proposals — at the
// upload (`uploadMetadata`), on a capture that exists (`proposed`), on an
// image that exists (`PATCH /v1/captures/{id}/variants/{imageId}`) — never
// overwrite what the owner wrote, update what they proposed and nobody
// touched, add what is missing, delete nothing, and say what they left; the
// same proposal twice changes nothing. What the import meets, copied with
// invented values; the photo's program as `processing.software`.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  photoSoftware,
  readPhotoSoftware,
} from "../dist/sky-check/image-metadata.js";
import { processCapture } from "../dist/captures/capture-processing.js";
import {
  PHONE,
  SYNC,
  WEB,
  contractErrors,
  image,
  withMetadataSpace,
} from "./helpers/metadata-space.mjs";

const dual = {
  filter: "Dual-band",
  frameCount: 38,
  exposureSeconds: 180,
  gain: 100,
};
const clear = { filter: null, frameCount: 20, exposureSeconds: 120, gain: 100 };

test("at the upload: Astro Sync's proposals fill the capture and the image sent, under « astro-sync »; the phone without a producer and the web refused", async () => {
  await withMetadataSpace(async ({ owner, space, send }) => {
    const sent = await send(
      image("sync-stack"),
      {
        sessionId: space.sessionId,
        targetIds: ["m31"],
        source: "stacking",
        calibration: "30 darks · 30 flats · 30 dark-flats",
        acquisition: [dual, clear],
        sensor: { temperatureC: -10, binning: 1 },
        processing: { software: "Siril 1.4.4" },
        variantTitle: "Rendu brut",
        variantDescription: "Les couleurs du capteur, sans retouche de teinte.",
      },
      SYNC,
    );
    assert.equal(sent.status, 201);
    assert.equal(sent.body.skipped, undefined);
    const read = await owner.get({
      tenantId: space.tenantId,
      captureId: sent.body.capture.id,
    });
    const { metadata } = read;
    assert.equal(metadata.calibration.source, "astro-sync");
    assert.equal(metadata.calibration.edited, false);
    assert.equal(metadata.acquisition.own, true);
    assert.equal(metadata.acquisition.source, "astro-sync");
    assert.deepEqual(
      metadata.acquisition.lines.map((line) => [line.filter, line.origin]),
      [
        ["Dual-band", "astro-sync"],
        [null, "astro-sync"],
      ],
    );
    assert.deepEqual(metadata.sensor.value, { temperatureC: -10, binning: 1 });
    assert.equal(metadata.processing.software.value, "Siril 1.4.4");
    const [main] = read.variants;
    assert.equal(main.title, "Rendu brut");
    assert.equal(main.titleSource, "astro-sync");
    assert.equal(main.edited, false);
    assert.deepEqual(
      await contractErrors("capture.schema.json", "uploadResponse", sent.body),
      [],
    );

    await assert.rejects(
      send(image("phone-proposal"), { calibration: "30 darks" }, PHONE),
      (error) => error.code === "invalid_metadata" && error.status === 400,
    );
    const imported = await send(
      image("phone-import"),
      { calibration: "30 darks", metadataSource: "import" },
      PHONE,
    );
    assert.equal(
      (
        await owner.get({
          tenantId: space.tenantId,
          captureId: imported.body.capture.id,
        })
      ).metadata.calibration.source,
      "import",
    );
    await assert.rejects(
      send(image("web-proposal"), { title: "M31" }, WEB),
      (error) => error.code === "invalid_metadata",
    );
    await assert.rejects(
      send(image("too-long"), { calibration: "c".repeat(121) }, SYNC),
      (error) =>
        error.code === "invalid_metadata" &&
        error.body.error.field === "calibration" &&
        error.body.error.limit === 120,
    );
  });
});

test("`proposed` on a capture that exists: an edited value and its line left in `skipped`, an untouched one updated, a missing one added, nothing deleted; twice, nothing changes", async () => {
  await withMetadataSpace(async ({ owner, space, send }) => {
    const { tenantId, userId } = space;
    const captureId = (
      await send(
        image("proposed"),
        {
          sessionId: space.sessionId,
          targetIds: ["m31"],
          calibration: "20 darks",
          processing: { software: "Siril 1.4.3" },
          acquisition: [dual, clear],
        },
        SYNC,
      )
    ).body.capture.id;
    const first = await owner.get({ tenantId, captureId });
    const dualLine = first.metadata.acquisition.lines[0];
    await owner.updateMetadata({
      tenantId,
      userId,
      captureId,
      metadata: { calibration: "30 darks · 30 flats · 30 dark-flats" },
    });
    await owner.updateMetadata({
      tenantId,
      userId,
      captureId,
      metadata: {
        acquisition: {
          line: dualLine.id,
          set: { ...dual, frameCount: 36 },
        },
      },
    });
    const proposal = {
      source: "astro-sync",
      calibration: "40 darks",
      processing: { software: "Siril 1.4.4", steps: "Empilement, étirement" },
      acquisition: [
        { ...dual, frameCount: 42 },
        { ...clear, frameCount: 24 },
        { filter: "Ha", frameCount: 10, exposureSeconds: 300, gain: 100 },
      ],
    };
    const answer = await owner.proposeMetadata({
      tenantId,
      userId,
      captureId,
      proposed: proposal,
    });
    assert.deepEqual(answer.skipped, [
      { field: "calibration", reason: "edited" },
      { field: "acquisition[0]", reason: "edited" },
    ]);
    const { metadata } = answer.capture;
    assert.equal(
      metadata.calibration.value,
      "30 darks · 30 flats · 30 dark-flats",
    );
    assert.equal(metadata.processing.software.value, "Siril 1.4.4");
    assert.equal(metadata.processing.steps.source, "astro-sync");
    assert.deepEqual(
      metadata.acquisition.lines.map((line) => [
        line.filter,
        line.frameCount,
        line.edited,
      ]),
      [
        ["Dual-band", 36, true],
        [null, 24, false],
        ["Ha", 10, false],
      ],
    );
    // The same proposal again: nothing changes, not even a date.
    const again = await owner.proposeMetadata({
      tenantId,
      userId,
      captureId,
      proposed: proposal,
    });
    assert.deepEqual(again.capture.metadata, metadata);
    // Nothing is ever deleted: a proposal without a line keeps it.
    const fewer = await owner.proposeMetadata({
      tenantId,
      userId,
      captureId,
      proposed: {
        source: "astro-sync",
        acquisition: [{ ...clear, frameCount: 24 }],
      },
    });
    assert.equal(fewer.capture.metadata.acquisition.lines.length, 3);
    // A line the owner deleted is not brought back.
    const ha = metadata.acquisition.lines[2];
    await owner.updateMetadata({
      tenantId,
      userId,
      captureId,
      metadata: { acquisition: { line: ha.id, delete: true } },
    });
    const back = await owner.proposeMetadata({
      tenantId,
      userId,
      captureId,
      proposed: proposal,
    });
    assert.ok(
      back.skipped.some(
        (entry) =>
          entry.field === "acquisition[2]" && entry.reason === "deleted",
      ),
    );
    assert.equal(back.capture.metadata.acquisition.lines.length, 2);
    // Cleared by its owner, the calibration takes the last proposal back.
    const cleared = await owner.updateMetadata({
      tenantId,
      userId,
      captureId,
      metadata: { calibration: null },
    });
    assert.deepEqual(
      [cleared.metadata.calibration.value, cleared.metadata.calibration.source],
      ["40 darks", "astro-sync"],
    );
    assert.deepEqual(
      await contractErrors(
        "manage-captures.schema.json",
        "proposedAnswer",
        back,
      ),
      [],
    );
  });
});

test("an image's title proposed at the upload and on an image that exists; never over the owner's title; twice, nothing changes; two variants may share a title", async () => {
  await withMetadataSpace(async ({ owner, space, send }) => {
    const { tenantId, userId } = space;
    const captureId = (
      await send(image("main-image"), { variantTitle: "Rendu naturel" }, SYNC)
    ).body.capture.id;
    for (const label of ["natural-1", "natural-2"])
      await send(
        image(label),
        { captureId, variantTitle: "Rendu naturel — courbe brute" },
        SYNC,
      );
    let read = await owner.get({ tenantId, captureId });
    assert.equal(
      read.variants.filter(
        (variant) => variant.title === "Rendu naturel — courbe brute",
      ).length,
      2,
      "the service does not require titles to be unique",
    );
    const [main] = read.variants;
    const proposed = await owner.proposeVariantText({
      tenantId,
      userId,
      captureId,
      imageId: main.id,
      source: "astro-sync",
      title: "Rendu brut",
      description: "Les couleurs du capteur, sans retouche de teinte.",
    });
    assert.deepEqual(proposed.skipped, []);
    assert.equal(proposed.capture.variants[0].title, "Rendu brut");
    const twice = await owner.proposeVariantText({
      tenantId,
      userId,
      captureId,
      imageId: main.id,
      source: "astro-sync",
      title: "Rendu brut",
      description: "Les couleurs du capteur, sans retouche de teinte.",
    });
    assert.deepEqual(twice.capture.variants, proposed.capture.variants);
    await owner.setVariantText({
      tenantId,
      userId,
      captureId,
      imageId: main.id,
      texts: { title: "Rendu naturel", description: null },
    });
    const left = await owner.proposeVariantText({
      tenantId,
      userId,
      captureId,
      imageId: main.id,
      source: "import",
      title: "Autre rendu",
      description: "Autre description.",
    });
    assert.deepEqual(left.skipped, [
      { field: "variantTitle", reason: "edited" },
      { field: "variantDescription", reason: "edited" },
    ]);
    read = left.capture;
    assert.equal(read.variants[0].title, "Rendu naturel");
    assert.equal(read.variants[0].titleSource, "owner");
    // At an upload too: the image's own texts are never overwritten.
    const resent = await send(
      image("main-image"),
      { variantTitle: "Encore un autre" },
      SYNC,
    );
    assert.equal(resent.body.deduplicated, true);
    assert.equal(
      (await owner.get({ tenantId, captureId })).variants[0].title,
      "Rendu naturel",
    );
  });
});

test("what the import meets: a description joined with its technical text after a blank line (1 482 characters), two lines for two filters, calibration 120 accepted and 121 refused", async () => {
  await withMetadataSpace(async ({ owner, space, send }) => {
    const { tenantId, userId } = space;
    // Invented texts of the lengths measured on real captures (738 + 1 026
    // at most for the longest sheet, 1 482 together).
    const about = "Une nébuleuse en émission au cœur de Céphée. "
      .repeat(16)
      .slice(0, 455);
    const technical = `${"Empilement Siril, deux nuits, rejet sigma. ".repeat(25).slice(0, 1024)}.`;
    const description = `${about}\n\n${technical}`;
    assert.equal([...description].length, 1482);
    const captureId = (
      await send(image("import-sheet"), { stage: "draft" }, PHONE)
    ).body.capture.id;
    const answer = await owner.proposeMetadata({
      tenantId,
      userId,
      captureId,
      proposed: {
        source: "import",
        title: "Nébuleuse du Cœur",
        description,
        acquisition: [
          {
            filter: "Dual-band",
            frameCount: 98,
            exposureSeconds: 180,
            gain: 100,
          },
          {
            filter: "RGB UV/IR-cut",
            frameCount: 89,
            exposureSeconds: 90,
            gain: 100,
          },
        ],
        calibration: "c".repeat(120),
        processing: {
          software: "Siril, GraXpert",
          steps: "Calibration, alignement, empilement",
        },
      },
    });
    const { metadata } = answer.capture;
    assert.equal(metadata.description.value, description);
    assert.equal(metadata.acquisition.lines.length, 2);
    assert.ok(
      metadata.acquisition.lines.every((line) => line.origin === "import"),
    );
    assert.equal(metadata.acquisition.totalSeconds, 98 * 180 + 89 * 90);
    assert.equal(metadata.title.source, "import");
    await assert.rejects(
      owner.proposeMetadata({
        tenantId,
        userId,
        captureId,
        proposed: { source: "import", calibration: "c".repeat(121) },
      }),
      (error) =>
        error.code === "invalid_metadata" &&
        error.field === "calibration" &&
        error.limit === 120,
    );
    // Never a place: a proposal naming one is refused, nothing written.
    await assert.rejects(
      owner.proposeMetadata({
        tenantId,
        userId,
        captureId,
        proposed: { source: "import", place: "Col des Étoiles" },
      }),
      (error) =>
        error.code === "invalid_metadata" && error.field === "proposed.place",
    );
  });
});

/** A tiny TIFF whose IFD0 names its program (`Software`) and its GPS. */
function tiffWithSoftware(software) {
  const text = Buffer.from(`${software}\0`, "latin1");
  const entries = 2;
  const ifdSize = 2 + entries * 12 + 4;
  const softwareOffset = 8 + ifdSize;
  const gpsOffset = softwareOffset + text.length;
  const gps = Buffer.alloc(2 + 12 + 4);
  gps.writeUInt16LE(1, 0);
  gps.writeUInt16LE(0x0002, 2);
  gps.writeUInt16LE(5, 4);
  gps.writeUInt32LE(1, 6);
  gps.writeUInt32LE(0, 10);
  const header = Buffer.alloc(8 + ifdSize);
  header.write("II", 0, "latin1");
  header.writeUInt16LE(42, 2);
  header.writeUInt32LE(8, 4);
  header.writeUInt16LE(entries, 8);
  header.writeUInt16LE(0x0131, 10);
  header.writeUInt16LE(2, 12);
  header.writeUInt32LE(text.length, 14);
  header.writeUInt32LE(softwareOffset, 18);
  header.writeUInt16LE(0x8825, 22);
  header.writeUInt16LE(4, 24);
  header.writeUInt32LE(1, 26);
  header.writeUInt32LE(gpsOffset, 30);
  return Buffer.concat([header, text, gps]);
}

test("the photo: its program read as `processing.software` (« D'après la photo »), never over Astro Sync's; nothing from a cleaned PNG; never a GPS value nor a date", async () => {
  assert.equal(
    photoSoftware({ software: "  Adobe Photoshop 26.0\0" }),
    "Adobe Photoshop 26.0",
  );
  assert.equal(photoSoftware({ software: "x".repeat(121) }), null);
  assert.equal(photoSoftware({ software: null }), null);
  const directory = await mkdtemp(join(tmpdir(), "astro-photo-software-"));
  try {
    const tiff = join(directory, "m31.tif");
    await writeFile(tiff, tiffWithSoftware("Adobe Photoshop 26.0"));
    assert.equal(
      await readPhotoSoftware(tiff, { extension: "tif" }),
      "Adobe Photoshop 26.0",
    );
    // A PNG with IHDR, IDAT and IEND only (the import's cleaned images).
    const png = join(directory, "clean.png");
    await writeFile(
      png,
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from(
          "0000000d49484452000000010000000108020000009077" + "53de",
          "hex",
        ),
        Buffer.from("0000000049454e44ae426082", "hex"),
      ]),
    );
    assert.equal(await readPhotoSoftware(png, { extension: "png" }), null);

    await withMetadataSpace(async ({ owner, store, space, send, driver }) => {
      const { tenantId } = space;
      const capture = (await send(image("photo-only"), {}, WEB)).body.capture;
      const run = (current) =>
        processCapture({
          store,
          tenantId,
          capture: current,
          check: async () => ({
            result: "sky",
            reason: null,
            checkedAt: "2026-10-06T22:00:00.000Z",
          }),
          thumbnail: async () => ({ written: false }),
          dimensions: async () => null,
          software: async () => "Adobe Photoshop 26.0",
          captureStore: {
            withLocalFile: async (_reference, use) => use(tiff),
            remove: async () => {},
          },
        });
      await run(capture);
      const read = await owner.get({ tenantId, captureId: capture.id });
      assert.deepEqual(
        [
          read.metadata.processing.software.value,
          read.metadata.processing.software.source,
        ],
        ["Adobe Photoshop 26.0", "photo"],
      );
      const stored = (
        await driver.query(
          "SELECT processing_json, field_origins_json FROM captures WHERE id = ?",
          [capture.id],
        )
      ).rows[0];
      assert.ok(
        !/gps|latitude|date/i.test(JSON.stringify(stored.processing_json)),
      );
      // Astro Sync's software is never replaced by the photo's.
      const synced = (
        await send(
          image("synced"),
          { processing: { software: "Siril 1.4.4" } },
          SYNC,
        )
      ).body.capture;
      await run(synced);
      assert.equal(
        (await owner.get({ tenantId, captureId: synced.id })).metadata
          .processing.software.value,
        "Siril 1.4.4",
      );
    });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("a line Astro Sync measured names the computer when it sent the name; a typed line never does; nothing else changes", async () => {
  await withMetadataSpace(async ({ owner, space, send }) => {
    const { tenantId, userId } = space;
    const sent = await send(
      image("computer-label"),
      {
        sessionId: space.sessionId,
        targetIds: ["m31"],
        acquisition: [
          { ...dual, computerLabel: "Ordinateur du bureau" },
          clear,
        ],
      },
      SYNC,
    );
    assert.equal(sent.status, 201);
    const { metadata } = await owner.get({
      tenantId,
      captureId: sent.body.capture.id,
    });
    assert.deepEqual(
      metadata.acquisition.lines.map((line) => [
        line.provenance,
        line.computerLabel,
      ]),
      [
        ["measured", "Ordinateur du bureau"],
        ["measured", null],
      ],
    );
    for (const line of metadata.acquisition.lines)
      assert.deepEqual(
        await contractErrors(
          "manage-captures.schema.json",
          "acquisitionLine",
          line,
        ),
        [],
      );
    // A proposal again, with another name, updates the untouched line.
    const again = await owner.proposeMetadata({
      tenantId,
      userId,
      captureId: sent.body.capture.id,
      proposed: {
        source: "astro-sync",
        acquisition: [{ ...dual, computerLabel: "Portable de terrain" }],
      },
    });
    assert.equal(
      again.capture.metadata.acquisition.lines[0].computerLabel,
      "Portable de terrain",
    );
    // 80 characters at most; the owner's own lines carry none.
    await assert.rejects(
      send(
        image("computer-label-long"),
        { acquisition: [{ ...dual, computerLabel: "c".repeat(81) }] },
        SYNC,
      ),
      (error) => error.code === "invalid_metadata",
    );
    await assert.rejects(
      owner.updateMetadata({
        tenantId,
        userId,
        captureId: sent.body.capture.id,
        metadata: {
          acquisition: { add: { ...clear, computerLabel: "Mon PC" } },
        },
      }),
      (error) => error.code === "invalid_metadata",
    );
  });
});
