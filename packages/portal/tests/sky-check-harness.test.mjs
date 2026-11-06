import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import sharp from "sharp";

const run = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const harness = join(repository, "scripts/sky-check/measure.mjs");

test("the harness measures a tiny manifest and names files by identifier only", async () => {
  const folder = await mkdtemp(join(tmpdir(), "sky-check-set-"));
  try {
    const width = 800;
    const height = 600;
    let state = 5;
    // A dark sky with its noise (a drawing of stars has none).
    const pixels = Buffer.alloc(width * height);
    for (let index = 0; index < pixels.length; index += 1) {
      state = (state * 1103515245 + 12345) % 2 ** 31;
      pixels[index] = 14 + (state % 9);
    }
    for (let star = 0; star < 700; star += 1) {
      state = (state * 1103515245 + 12345) % 2 ** 31;
      const x = 3 + (state % (width - 6));
      state = (state * 1103515245 + 12345) % 2 ** 31;
      const y = 3 + (state % (height - 6));
      for (let dy = -2; dy <= 2; dy += 1)
        for (let dx = -2; dx <= 2; dx += 1)
          pixels[(y + dy) * width + x + dx] = Math.max(
            pixels[(y + dy) * width + x + dx],
            Math.round(200 * Math.exp(-(dx * dx + dy * dy) / 2)),
          );
    }
    await writeFile(
      join(folder, "secret-holiday-name.png"),
      await sharp(pixels, { raw: { width, height, channels: 1 } })
        .png()
        .toBuffer(),
    );
    await writeFile(join(folder, "notes.txt"), "not an image");
    const manifest = join(folder, "manifest.json");
    await writeFile(
      manifest,
      JSON.stringify({
        files: [
          {
            id: "t-01",
            file: "secret-holiday-name.png",
            subclass: "synthetic-field",
            expected: "sky",
          },
          {
            id: "t-02",
            file: "notes.txt",
            subclass: "text",
            expected: "undetermined",
            acceptable: ["undetermined", "other"],
          },
        ],
      }),
    );
    const out = join(folder, "results.json");
    const summary = join(folder, "summary.md");
    await run(process.execPath, [
      harness,
      "--set",
      folder,
      "--manifest",
      manifest,
      "--out",
      out,
      "--summary",
      summary,
      "--label",
      "test",
    ]);
    const text = await readFile(out, "utf8");
    const written = JSON.parse(text);
    assert.equal(written.ruleVersion, "sky-check-3");
    assert.deepEqual(
      written.results.map((entry) => [entry.id, entry.result, entry.ok]),
      [
        ["t-01", "sky", true],
        ["t-02", "undetermined", true],
      ],
    );
    assert.equal(written.summary.files, 2);
    assert.equal(written.summary.nonSkyAnsweredSky, 0);
    assert.equal(written.table["synthetic-field"].sky.sky, 1);
    assert.ok(
      written.results.every(
        (entry) => entry.peakRssMb > 0 && entry.milliseconds >= 0,
      ),
    );
    assert.doesNotMatch(text, /secret-holiday-name|notes\.txt/);
    assert.doesNotMatch(
      text,
      new RegExp(folder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.match(
      await readFile(summary, "utf8"),
      /\| synthetic-field \| sky \| 1 \| 0 \| 0 \|/,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
