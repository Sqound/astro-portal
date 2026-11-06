import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  catalogueOfTargetId,
  checkTargetLibraryMedia,
  checkTargetLibraryMediaOverHttp,
  logTargetLibraryMedia,
  readTargetLibraryMediaLayers,
  targetLibraryMediaLine,
} from "../dist/lib/target-library-media.js";

// A manifest may name images its folder does not hold, and nothing says so.
// The check compares what the four manifests name with what their folders
// hold, per catalogue.

const runScript = promisify(execFile);
const script = fileURLToPath(
  new URL("../../../scripts/check-target-library-media.mjs", import.meta.url),
);

// The previews' files carry their layer's prefix, as the real ones do.
const fileOf = (layer, id) =>
  `${layer === "visual-preview-images" ? "visual-preview-" : ""}${id}.jpg`;
const manifest = (layer, entries) =>
  JSON.stringify({
    attribution: {},
    images: Object.fromEntries(
      entries.map((id) => [id, { file: fileOf(layer, id) }]),
    ),
  });

// A library folder as the service has it: four manifests, four folders.
async function withLibrary(callback, { skip = [] } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "astro-library-media-"));
  try {
    const named = {
      images: ["abell-1", "abell-2", "ldn-1622", "solar-system-venus"],
      "visual-preview-images": ["abell-1", "sharpless-276"],
      "curated-photo-images": ["openngc-ngc0224"],
      "visual-images": [],
    };
    for (const [layer, ids] of Object.entries(named)) {
      await mkdir(join(directory, layer), { recursive: true });
      await writeFile(join(directory, `${layer}.json`), manifest(layer, ids));
      for (const id of ids)
        if (!skip.includes(`${layer}/${id}`))
          await writeFile(join(directory, layer, fileOf(layer, id)), "x");
    }
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("a complete folder passes: nothing missing, every file counted", async () => {
  await withLibrary(async (directory) => {
    const { layers } = await readTargetLibraryMediaLayers({ directory });
    const report = await checkTargetLibraryMedia({ layers });
    assert.equal(report.missing, 0);
    assert.equal(report.checked, 7);
    assert.equal(report.byCatalogue.Abell.checked, 3);
    assert.equal(report.byCatalogue["Système solaire"].checked, 1);
    assert.equal(
      targetLibraryMediaLine(report),
      "target-library media: 0 missing",
    );
  });
});

test("a missing file is found and counted per catalogue and per layer", async () => {
  await withLibrary(
    async (directory) => {
      const { layers } = await readTargetLibraryMediaLayers({ directory });
      const report = await checkTargetLibraryMedia({ layers });
      assert.equal(report.missing, 3);
      assert.deepEqual(report.byCatalogue.Abell, { checked: 3, missing: 2 });
      assert.deepEqual(report.byCatalogue.Sharpless, {
        checked: 1,
        missing: 1,
      });
      assert.equal(report.byCatalogue.LDN.missing, 0);
      const byName = Object.fromEntries(report.layers.map((l) => [l.name, l]));
      assert.equal(byName.images.missing, 1);
      assert.equal(byName["visual-preview-images"].missing, 2);
      assert.deepEqual(byName["visual-preview-images"].examples, [
        "abell-1: visual-preview-abell-1.jpg",
        "sharpless-276: visual-preview-sharpless-276.jpg",
      ]);
    },
    {
      skip: [
        "images/abell-2",
        "visual-preview-images/abell-1",
        "visual-preview-images/sharpless-276",
      ],
    },
  );
});

test("a file the route would refuse by its name is missing too, though it is there", async () => {
  await withLibrary(async (directory) => {
    await writeFile(
      join(directory, "images.json"),
      JSON.stringify({ images: { "mystery-1": { file: "mystery-1.jpg" } } }),
    );
    await writeFile(join(directory, "images", "mystery-1.jpg"), "x");
    const { layers } = await readTargetLibraryMediaLayers({ directory });
    const report = await checkTargetLibraryMedia({ layers });
    assert.equal(report.missing, 1);
    assert.deepEqual(report.layers[0].examples, [
      "mystery-1: mystery-1.jpg (name refused by the route)",
    ]);
  });
});

test("a folder that does not exist holds nothing: all its files are missing", async () => {
  const report = await checkTargetLibraryMedia({
    layers: [
      {
        name: "images",
        directory: join(tmpdir(), "astro-no-such-folder-r86"),
        entries: { "abell-1": { file: "abell-1.jpg" } },
      },
    ],
  });
  assert.equal(report.missing, 1);
});

test("a demo visual image is never served, so never counted", async () => {
  const report = await checkTargetLibraryMedia({
    layers: [
      {
        name: "visual-images",
        directory: tmpdir(),
        entries: {
          "openngc-ngc1976": { file: "demo-r86-absent.jpg", kind: "demo" },
        },
      },
    ],
  });
  assert.equal(report.checked, 0);
  assert.equal(report.missing, 0);
});

test("the catalogue comes from the library's field, else from the identifier", async () => {
  assert.equal(catalogueOfTargetId("abell-65"), "Abell");
  assert.equal(catalogueOfTargetId("lbn-918"), "LBN");
  assert.equal(catalogueOfTargetId("solar-system-mars"), "Système solaire");
  const report = await checkTargetLibraryMedia({
    layers: [
      {
        name: "images",
        directory: tmpdir(),
        entries: { "openngc-m0031": { file: "absent-r86.jpg" } },
      },
    ],
    catalogueOf: (id) => (id === "openngc-m0031" ? "Messier" : undefined),
  });
  assert.deepEqual(report.byCatalogue, { Messier: { checked: 1, missing: 1 } });
});

test("the load's log line says how many are missing, and where", async () => {
  assert.equal(
    targetLibraryMediaLine({ missing: 0, byCatalogue: {} }),
    "target-library media: 0 missing",
  );
  assert.equal(
    targetLibraryMediaLine({
      missing: 2822,
      byCatalogue: {
        Abell: { checked: 150, missing: 150 },
        LDN: { checked: 3316, missing: 2000 },
        IC: { checked: 10583, missing: 0 },
      },
    }),
    "target-library media: 2822 missing (LDN 2000, Abell 150)",
  );
});

test("the load logs one line: info when complete, a warning when files are missing", async () => {
  const lines = [];
  const log = {
    info: (line) => lines.push(["info", line]),
    warn: (line) => lines.push(["warn", line]),
  };
  await withLibrary(async (directory) => {
    const { layers } = await readTargetLibraryMediaLayers({ directory });
    await logTargetLibraryMedia({ layers, log });
  });
  await withLibrary(
    async (directory) => {
      const { layers } = await readTargetLibraryMediaLayers({ directory });
      await logTargetLibraryMedia({ layers, log });
    },
    { skip: ["images/ldn-1622"] },
  );
  assert.deepEqual(lines, [
    ["info", "target-library media: 0 missing"],
    ["warn", "target-library media: 1 missing (LDN 1)"],
  ]);
});

test("by default the line goes to stderr in the app's log format, never to stdout", async () => {
  const calls = [];
  const saved = { log: console.log, info: console.info, error: console.error };
  console.log = (...args) => calls.push(["stdout", ...args]);
  console.info = (...args) => calls.push(["stdout", ...args]);
  console.error = (...args) => calls.push(["stderr", ...args]);
  try {
    await withLibrary(async (directory) => {
      const { layers } = await readTargetLibraryMediaLayers({ directory });
      await logTargetLibraryMedia({ layers });
    });
  } finally {
    Object.assign(console, saved);
  }
  assert.deepEqual(calls, [
    [
      "stderr",
      "[Astro Portal] info target-library.media: target-library media: 0 missing",
    ],
  ]);
});

test("a check that cannot run never throws into the library's load", async () => {
  const warnings = [];
  const report = await logTargetLibraryMedia({
    layers: [{ name: "images", directory: tmpdir(), entries: null }, null],
    log: { info() {}, warn: (line) => warnings.push(line) },
  });
  assert.equal(report, null);
  assert.match(warnings[0], /^target-library media: check failed/);
});

test("the script exits 0 on a complete folder and 1 when a file is missing", async () => {
  await withLibrary(async (directory) => {
    const { stdout } = await runScript(process.execPath, [
      script,
      "--dir",
      directory,
    ]);
    assert.match(stdout, /target-library media: 0 missing/);
  });
  await withLibrary(
    async (directory) => {
      await assert.rejects(
        runScript(process.execPath, [script, "--dir", directory]),
        (error) => {
          assert.equal(error.code, 1);
          assert.match(error.stdout, /Abell +3 +1/);
          assert.match(
            error.stdout,
            /target-library media: 1 missing \(Abell 1\)/,
          );
          return true;
        },
      );
    },
    { skip: ["images/abell-2"] },
  );
});

test("the script exits 2 when a manifest cannot be read", async () => {
  await withLibrary(async (directory) => {
    await writeFile(join(directory, "images.json"), "{ not json");
    await assert.rejects(
      runScript(process.execPath, [script, "--dir", directory]),
      (error) => {
        assert.equal(error.code, 2);
        assert.match(error.stdout, /UNREADABLE images\.json/);
        return true;
      },
    );
  });
});

// A service that answers the library's routes from a folder, 404 for the rest.
async function withService(directory, callback) {
  const folders = {
    "/target-library-images/": "images",
    "/target-library-visual-preview-images/": "visual-preview-images",
    "/target-library-curated-images/": "curated-photo-images",
    "/target-library-visual-images/": "visual-images",
  };
  const server = createServer(async (request, response) => {
    const route = Object.keys(folders).find((prefix) =>
      request.url.startsWith(prefix),
    );
    let found = false;
    if (route && request.method === "HEAD")
      try {
        await access(
          join(
            directory,
            folders[route],
            decodeURIComponent(request.url.slice(route.length)),
          ),
        );
        found = true;
      } catch {}
    response.writeHead(found ? 200 : 404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("asked of a running service, a 404 counts as missing, per catalogue", async () => {
  await withLibrary(
    async (directory) => {
      await withService(directory, async (baseUrl) => {
        const { layers } = await readTargetLibraryMediaLayers({ directory });
        const report = await checkTargetLibraryMediaOverHttp({
          layers,
          baseUrl,
        });
        assert.equal(report.checked, 7);
        assert.equal(report.missing, 2);
        assert.deepEqual(report.byCatalogue.Abell, { checked: 3, missing: 1 });
        assert.deepEqual(report.byCatalogue.LDN, { checked: 1, missing: 1 });
        const only = await checkTargetLibraryMediaOverHttp({
          layers,
          baseUrl,
          only: ["Abell"],
        });
        assert.equal(only.checked, 3);
        assert.equal(only.missing, 1);
        await assert.rejects(
          runScript(process.execPath, [
            script,
            "--dir",
            directory,
            "--url",
            baseUrl,
            "--only",
            "Abell",
          ]),
          (error) => {
            assert.equal(error.code, 1);
            assert.match(
              error.stdout,
              /target-library media: 1 missing \(Abell 1\)/,
            );
            return true;
          },
        );
        const { stdout } = await runScript(process.execPath, [
          script,
          "--dir",
          directory,
          "--url",
          baseUrl,
          "--only",
          "Sharpless",
        ]);
        assert.match(stdout, /target-library media: 0 missing/);
      });
    },
    { skip: ["images/abell-2", "images/ldn-1622"] },
  );
});

test("a file in a folder the route falls back to (`alsoIn`) is not missing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-media-also-in-"));
  try {
    const shipped = join(directory, "shipped");
    await mkdir(join(directory, "images"), { recursive: true });
    await mkdir(shipped);
    await writeFile(join(shipped, "solar-system-sun.jpg"), "x");
    const entries = {
      "solar-system-sun": { file: "solar-system-sun.jpg" },
      "solar-system-mars": { file: "solar-system-mars.jpg" },
    };
    const layer = {
      name: "images",
      entries,
      directory: join(directory, "images"),
    };
    const without = await checkTargetLibraryMedia({ layers: [layer] });
    assert.equal(without.missing, 2);
    const withShipped = await checkTargetLibraryMedia({
      layers: [{ ...layer, alsoIn: [shipped] }],
    });
    assert.equal(withShipped.missing, 1);
    assert.deepEqual(withShipped.layers[0].examples, [
      "solar-system-mars: solar-system-mars.jpg",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
