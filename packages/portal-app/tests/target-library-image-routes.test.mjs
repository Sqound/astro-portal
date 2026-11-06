import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// The two routes that serve the library's thumbnails and visual previews each
// carried a list of file-name prefixes (openngc, barnard, solar-system) that
// did not know the later catalogues. The 2 822 thumbnails and 2 822 previews of
// Sharpless, LDN, LBN and Abell answered 404 from the route, whatever the share
// held. Every catalogue the library knows must have its prefix in both routes.

const directory = await mkdtemp(join(tmpdir(), "astro-image-routes-"));
process.env.ASTRO_PORTAL_TARGET_LIBRARY_DIR = directory;
const bundled = join(directory, "bundled");
process.env.ASTRO_PORTAL_BUNDLED_TARGET_LIBRARY_IMAGES_DIR = bundled;
const sky = join(directory, "sky");
process.env.ASTRO_PORTAL_BUNDLED_SKY_CULTURE_IMAGES_DIR = sky;
const { catalogueOfTargetId, unknownCatalogue } =
  await import("../dist/lib/target-library-media.js");
const images =
  await import("../dist/routes/target-library-images/[file]/route.js");
const previews =
  await import("../dist/routes/target-library-visual-preview-images/[file]/route.js");

// One real-looking identifier per catalogue, as the library's manifests name them.
const identifiers = [
  "openngc-ngc0224",
  "openngc-ic0001",
  "barnard-b33",
  "sharpless-276",
  "ldn-1622",
  "lbn-918",
  "abell-1",
  "solar-system-venus",
];

test.after(() => rm(directory, { recursive: true, force: true }));

const ask = (route, file) =>
  route.GET(new Request("http://127.0.0.1/"), {
    params: Promise.resolve({ file }),
  });

test("every catalogue's thumbnails are served by the image route", async () => {
  await mkdir(join(directory, "images"), { recursive: true });
  for (const id of identifiers) {
    assert.notEqual(catalogueOfTargetId(id), unknownCatalogue, id);
    await writeFile(join(directory, "images", `${id}.jpg`), "jpeg");
    const response = await ask(images, `${id}.jpg`);
    assert.equal(response.status, 200, `${id}.jpg`);
  }
});

test("every catalogue's visual previews are served by the preview route", async () => {
  await mkdir(join(directory, "visual-preview-images"), { recursive: true });
  for (const id of identifiers.filter((id) => !id.startsWith("solar-system"))) {
    await writeFile(
      join(directory, "visual-preview-images", `visual-preview-${id}.jpg`),
      "jpeg",
    );
    const response = await ask(previews, `visual-preview-${id}.jpg`);
    assert.equal(response.status, 200, `visual-preview-${id}.jpg`);
  }
});

test("the routes still refuse names that are no catalogue's, and a missing file is 404", async () => {
  await writeFile(join(directory, "images", "secret-1.jpg"), "jpeg");
  assert.equal((await ask(images, "secret-1.jpg")).status, 404);
  assert.equal((await ask(images, "../abell-1.jpg")).status, 404);
  assert.equal((await ask(images, "abell-999.jpg")).status, 404);
  assert.equal((await ask(images, "abell-1.png")).status, 404);
  assert.equal(
    (await ask(previews, "visual-preview-secret-1.jpg")).status,
    404,
  );
});

test("a picture that ships with the code is served when the runtime folder lacks it, and the runtime folder wins", async () => {
  await mkdir(bundled, { recursive: true });
  await writeFile(join(bundled, "solar-system-sun.jpg"), "shipped");
  await writeFile(join(bundled, "solar-system-mars.jpg"), "shipped");
  await writeFile(join(directory, "images", "solar-system-mars.jpg"), "fresh");
  const sun = await ask(images, "solar-system-sun.jpg");
  assert.equal(sun.status, 200);
  assert.equal(await sun.text(), "shipped");
  assert.equal(
    sun.headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  );
  assert.equal(
    await (await ask(images, "solar-system-mars.jpg")).text(),
    "fresh",
  );
  assert.equal((await ask(images, "solar-system-pluto.jpg")).status, 404);
});

test("the sky pictures of the bright stars and the constellations are served from their own shipped folder, never as visual previews", async () => {
  await mkdir(sky, { recursive: true });
  for (const file of [
    "star-hip-91262.jpg",
    "star-hip-91262-full.jpg",
    "constellation-lyr.jpg",
    "constellation-lyr-naked-lines.jpg",
  ]) {
    await writeFile(join(sky, file), "sky");
    const response = await ask(images, file);
    assert.equal(response.status, 200, file);
    assert.equal(await response.text(), "sky");
  }
  assert.equal(catalogueOfTargetId("star-hip-91262"), "BrightStars");
  assert.equal(catalogueOfTargetId("constellation-lyr"), "Constellations");
  assert.equal((await ask(images, "constellation-xyz.jpg")).status, 404);
  assert.equal(
    (await ask(previews, "visual-preview-constellation-lyr.jpg")).status,
    404,
  );
});
