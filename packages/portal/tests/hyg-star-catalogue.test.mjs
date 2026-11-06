// The HYG star catalogue of the sky annotations: put in place by the server
// (fetched, checked against its SHA-256, kept where the annotations read it)
// and read without ever keeping an empty answer.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  HYG_CATALOG_SHA256,
  HYG_CATALOG_URL,
  ensureHygCatalog,
  hygDownloadEnabled,
} from "../dist/sky-annotations/hyg-catalog-install.js";
import { createHygStarsSource } from "../dist/sky-annotations/hyg-stars-source.js";

const CSV = [
  "id,hip,hd,hr,gl,bf,proper,ra,dec,dist,pmra,pmdec,rv,mag",
  "1,3881,4881,,,,,0.83,41.08,1,0,0,0,7.1",
  "2,,,,,,Mirach,1.16,35.62,1,0,0,0,2.05",
  "3,,,,,,,1.3,40.2,1,0,0,0,11.2",
].join("\n");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

async function inDirectory(fn) {
  const directory = await mkdtemp(join(tmpdir(), "astro-hyg-"));
  try {
    await fn(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

/** A `fetch` answering `text` (or an error status), counting its calls. */
function fakeFetch(text, { status = 200 } = {}) {
  const calls = [];
  const fetchImplementation = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(status === 200 ? text : "nope", { status });
  };
  return { fetchImplementation, calls };
}

test("the catalogue is fetched from the author's repository, at a fixed commit, against a fixed SHA-256", () => {
  assert.match(
    HYG_CATALOG_URL,
    /^https:\/\/raw\.githubusercontent\.com\/astronexus\/HYG-Database\/[0-9a-f]{40}\/hyg\/CURRENT\/hygdata_v41\.csv$/,
  );
  assert.match(HYG_CATALOG_SHA256, /^[0-9a-f]{64}$/);
});

test("a missing catalogue is fetched, verified and put in place; the folder is made; no partial file stays", async () => {
  await inDirectory(async (directory) => {
    const path = join(directory, "astrometry", "catalogs", "hyg_v41.csv");
    const { fetchImplementation, calls } = fakeFetch(CSV);
    const outcome = await ensureHygCatalog({
      path,
      url: "https://example.test/hyg.csv",
      sha256: sha256(CSV),
      fetchImplementation,
      enabled: true,
    });
    assert.deepEqual(outcome, { status: "installed", bytes: CSV.length });
    assert.equal(await readFile(path, "utf8"), CSV);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://example.test/hyg.csv");
    assert.deepEqual(await readdir(join(directory, "astrometry", "catalogs")), [
      "hyg_v41.csv",
    ]);
  });
});

test("a file with another digest, an error answer or a failed transfer installs nothing and leaves nothing", async () => {
  await inDirectory(async (directory) => {
    const path = join(directory, "catalogs", "hyg_v41.csv");
    const wrong = await ensureHygCatalog({
      path,
      sha256: sha256("another file"),
      fetchImplementation: fakeFetch(CSV).fetchImplementation,
      enabled: true,
    });
    assert.equal(wrong.status, "failed");
    assert.match(wrong.reason, /SHA-256/);
    const refused = await ensureHygCatalog({
      path,
      sha256: sha256(CSV),
      fetchImplementation: fakeFetch(CSV, { status: 404 }).fetchImplementation,
      enabled: true,
    });
    assert.deepEqual(refused, {
      status: "failed",
      reason: "the source answered 404",
    });
    const down = await ensureHygCatalog({
      path,
      sha256: sha256(CSV),
      fetchImplementation: async () => {
        throw new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } });
      },
      enabled: true,
    });
    assert.deepEqual(down, { status: "failed", reason: "ENOTFOUND" });
    assert.deepEqual(await readdir(join(directory, "catalogs")), []);
  });
});

test("a catalogue already there is kept without a request; the download can be switched off; force fetches again", async () => {
  await inDirectory(async (directory) => {
    const path = join(directory, "hyg_v41.csv");
    const fetched = fakeFetch(CSV);
    const settings = {
      path,
      sha256: sha256(CSV),
      fetchImplementation: fetched.fetchImplementation,
    };
    assert.deepEqual(await ensureHygCatalog({ ...settings, enabled: false }), {
      status: "disabled",
    });
    await writeFile(path, "operator's own copy");
    assert.deepEqual(await ensureHygCatalog({ ...settings, enabled: true }), {
      status: "present",
    });
    assert.equal(fetched.calls.length, 0);
    assert.equal(await readFile(path, "utf8"), "operator's own copy");
    const again = await ensureHygCatalog({
      ...settings,
      enabled: true,
      force: true,
    });
    assert.equal(again.status, "installed");
    assert.equal(await readFile(path, "utf8"), CSV);
  });
});

test("ASTRO_PORTAL_HYG_DOWNLOAD=off (or 0, false, no) stops the download; anything else leaves it on", () => {
  for (const value of ["off", "OFF", "0", "false", "no", " off "])
    assert.equal(
      hygDownloadEnabled({ ASTRO_PORTAL_HYG_DOWNLOAD: value }),
      false,
    );
  for (const value of [undefined, "", "on", "1", "true"])
    assert.equal(
      hygDownloadEnabled({ ASTRO_PORTAL_HYG_DOWNLOAD: value }),
      true,
    );
});

test("without the file the source answers null, says so once, remembers nothing, and finds the file when it comes", async () => {
  await inDirectory(async (directory) => {
    const path = join(directory, "hyg_v41.csv");
    const lines = [];
    let reads = 0;
    const stars = createHygStarsSource({
      path,
      read: async (...rest) => {
        reads += 1;
        return readFile(...rest);
      },
      log: (line) => lines.push(line),
    });
    assert.equal(await stars(), null);
    assert.equal(await stars(), null);
    assert.equal(reads, 2, "the disk is asked again: no empty answer is kept");
    assert.equal(lines.length, 1, "one warning");
    assert.equal(lines[0].level, "warning");
    assert.equal(lines[0].event, "sky-annotations.stars-unavailable");
    assert.match(lines[0].message, /ENOENT/);
    // A file that is not HYG is no catalogue either.
    await writeFile(path, "<html>an error page</html>");
    assert.equal(await stars(), null);
    assert.equal(lines.length, 1);
    // The catalogue arrives while the server runs.
    await writeFile(path, CSV);
    const found = await stars();
    assert.deepEqual(
      found.map((star) => [star.label, star.named]),
      [
        ["HD 4881", false],
        ["Mirach", true],
        ["", false],
      ],
    );
    assert.equal(lines.at(-1).event, "sky-annotations.stars-available");
    // Read once it was read.
    const readsBefore = reads;
    await rm(path);
    assert.equal(await stars(), found);
    assert.equal(reads, readsBefore);
  });
});

test("the whole catalogue is read in slices, and two requests at once read it once", async () => {
  await inDirectory(async (directory) => {
    const path = join(directory, "hyg_v41.csv");
    const rows = Array.from(
      { length: 9000 },
      (_, index) =>
        `${index},${index + 1},,,,,,1.5,10,1,0,0,0,${5 + (index % 8)}`,
    );
    await writeFile(
      path,
      ["id,hip,hd,hr,gl,bf,proper,ra,dec,dist,pmra,pmdec,rv,mag", ...rows].join(
        "\n",
      ),
    );
    let reads = 0;
    const stars = createHygStarsSource({
      path,
      read: async (...rest) => {
        reads += 1;
        return readFile(...rest);
      },
    });
    const [first, second] = await Promise.all([stars(), stars()]);
    assert.equal(first.length, 9000);
    assert.equal(first, second);
    assert.equal(reads, 1);
  });
});
