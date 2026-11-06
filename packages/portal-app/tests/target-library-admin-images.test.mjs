import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createTargetCatalogueRepository } from "../dist/lib/target-library-database.server.js";

// The administration's save checked an image's file name against a list of
// prefixes that stopped at OpenNGC, Barnard and the Solar System; saving an
// Abell, a Sharpless, an LDN or an LBN, whose own images the library names,
// failed with « Invalid dss image filename ».

const target = (id, designation, catalogue) => ({
  id,
  designation,
  aliases: [designation],
  commonNames: [],
  typeKey: "Nébuleuse en émission",
  constellationKey: "Persée",
  coordinate: { ra: 4, dec: 36 },
  apparentSizeArcmin: [10, 10],
  catalogues: [catalogue],
  catalogue,
});

test("the administration saves a target of each catalogue with its own images", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-admin-images-"));
  const repository = await createTargetCatalogueRepository({
    databasePath: join(directory, "catalogue.sqlite"),
  });
  try {
    const catalogues = [
      ["sharpless-276", "Sh2-276", "Sharpless"],
      ["ldn-1622", "LDN 1622", "LDN"],
      ["lbn-918", "LBN 918", "LBN"],
      ["abell-1", "Abell 1", "Abell"],
    ];
    await repository.synchronize({
      library: {
        source: "Test",
        targets: catalogues.map(([id, name, catalogue]) =>
          target(id, name, catalogue),
        ),
      },
      images: Object.fromEntries(
        catalogues.map(([id]) => [id, { file: `${id}.jpg`, source: "DSS" }]),
      ),
      visualPreviewImages: Object.fromEntries(
        catalogues.map(([id]) => [
          id,
          { file: `visual-preview-${id}.jpg`, source: "Preview" },
        ]),
      ),
      sourceRevision: "r86",
    });
    for (const [id] of catalogues) {
      const entry = await repository.get(id);
      assert.equal(entry.dssImage.file, `${id}.jpg`);
      const saved = await repository.save({ ...entry, isBest: true });
      assert.equal(saved.dssImage.file, `${id}.jpg`, id);
    }
    const entry = await repository.get("abell-1");
    await assert.rejects(
      repository.save({ ...entry, dssImage: { file: "mystery-1.jpg" } }),
      /Invalid dss image filename/,
    );
  } finally {
    await repository.close?.();
    await rm(directory, { recursive: true, force: true });
  }
});
