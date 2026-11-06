import assert from "node:assert/strict";
import test from "node:test";
import {
  downloadOrigin,
  downloadOriginEtag,
  withDownloadOrigin,
} from "../dist/lib/download-origin.server.js";

// The heavy downloads on a download origin (a cache in front of the
// service, `downloads.example` for instance) when
// ASTRO_PORTAL_DOWNLOAD_ORIGIN names one; nothing changes without it.

const manifest = {
  v: 1,
  components: [
    {
      id: "target-index",
      revision: "abc",
      urlTemplate: "/v1/target-index?locale={locale}&offset={offset}",
    },
    {
      id: "sky-quality",
      revision: "sha256:ff",
      files: [
        { url: "/v1/offline-pack/sky-quality/manifest.json", bytes: null },
        { url: "/v1/offline-pack/sky-quality/raster.bin", bytes: 6480000 },
      ],
    },
    {
      id: "target-texts",
      kind: "text-shards",
      revision: "0123456789abcdef",
      urlTemplate: "/v1/offline-pack/target-texts/{locale}/{shard}.json",
      locales: { fr: [{ shard: "000", bytes: 1 }] },
    },
    {
      id: "sky-backdrop",
      revision: null,
      archiveUrlTemplate:
        "/v1/sky-tiles/{survey}/Norder{order}/Chunk{chunkOrder}/{chunkPix}.tar",
      tileUrlTemplate:
        "/v1/sky-tiles/{survey}/Norder{order}/Dir{dir}/Npix{pix}.{format}",
    },
  ],
};

test("the origin: https without a path, http on a loopback address only", () => {
  assert.equal(downloadOrigin({}), null);
  assert.equal(
    downloadOrigin({
      ASTRO_PORTAL_DOWNLOAD_ORIGIN: " https://dl.example.test/ ",
    }),
    "https://dl.example.test",
  );
  assert.equal(
    downloadOrigin({ ASTRO_PORTAL_DOWNLOAD_ORIGIN: "http://127.0.0.1:8788" }),
    "http://127.0.0.1:8788",
  );
  for (const bad of [
    "http://dl.example.test",
    "https://dl.example.test/files",
    "dl.example.test",
  ])
    assert.throws(() => downloadOrigin({ ASTRO_PORTAL_DOWNLOAD_ORIGIN: bad }));
});

test("the manifest gives its files and tiles on the origin, the catalogue stays", () => {
  const rewritten = withDownloadOrigin(manifest, "https://dl.example.test");
  const [index, quality, texts, backdrop] = rewritten.components;
  assert.equal(index.urlTemplate, manifest.components[0].urlTemplate);
  assert.deepEqual(
    quality.files.map((file) => file.url),
    [
      "https://dl.example.test/api/v1/offline-pack/sky-quality/manifest.json?rev=sha256%3Aff",
      "https://dl.example.test/api/v1/offline-pack/sky-quality/raster.bin?rev=sha256%3Aff",
    ],
  );
  assert.equal(quality.files[1].bytes, 6480000);
  // The shards of the catalogue texts: one template on the origin under the
  // component's revision, the rest of the component untouched.
  assert.equal(
    texts.urlTemplate,
    "https://dl.example.test/api/v1/offline-pack/target-texts/{locale}/{shard}.json?rev=0123456789abcdef",
  );
  assert.deepEqual(texts.locales, manifest.components[2].locales);
  assert.equal(
    backdrop.tileUrlTemplate,
    "https://dl.example.test/api/v1/sky-tiles/{survey}/Norder{order}/Dir{dir}/Npix{pix}.{format}",
  );
  assert.match(
    backdrop.archiveUrlTemplate,
    /^https:\/\/dl\.example\.test\/api\/v1\/sky-tiles\//,
  );
  // Pure: the cached manifest is not touched.
  assert.equal(
    manifest.components[1].files[0].url,
    "/v1/offline-pack/sky-quality/manifest.json",
  );
  assert.equal(
    manifest.components[2].urlTemplate,
    "/v1/offline-pack/target-texts/{locale}/{shard}.json",
  );
  assert.equal(withDownloadOrigin(manifest, null), manifest);
});

test("another origin, another ETag", () => {
  assert.equal(downloadOriginEtag('"abc"', null), '"abc"');
  const one = downloadOriginEtag('"abc"', "https://dl.example.test");
  assert.match(one, /^"abc-dl[0-9a-z]+"$/);
  assert.notEqual(one, downloadOriginEtag('"abc"', "https://dl2.example.test"));
});
