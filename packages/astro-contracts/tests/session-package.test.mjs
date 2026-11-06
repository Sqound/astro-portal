import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertInvalid, assertValid } from "./schema-assert.mjs";

const sessionPackageDirectory = new URL(
  "../schemas/session-package/",
  import.meta.url,
);
const readJson = async (relativePath) =>
  JSON.parse(
    await readFile(new URL(relativePath, sessionPackageDirectory), "utf8"),
  );

const schema = await readJson("manifest.schema.json");

test("manifest.schema.json declares a 2020-12 $schema and a stable $id", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(
    schema.$id,
    "https://astroportal.invalid/schemas/session-package/manifest.schema.json",
  );
});

test("accepts the recorded minimal-package fixture (one image asset)", async () => {
  const minimal = await readJson("examples/manifest.minimal.json");
  assertValid(schema, minimal);
});

test("accepts a manifest actually produced by astro-sync-cli's package command", async () => {
  // Recorded from a real `astro-sync package` run (astro-sync/) against a
  // neutral fixture folder -- proof that the Rust producer's output, not
  // just hand-written examples, satisfies this schema.
  const cliProduced = await readJson("examples/manifest.cli-produced.json");
  assertValid(schema, cliProduced);
  assert.equal(cliProduced.assets.length, 5);
  assert.equal(cliProduced.producer.name, "astro-sync-cli");
});

test("rejects the recorded fixture whose asset path traverses out of the package", async () => {
  const invalid = await readJson("examples/manifest.invalid-path.json");
  assertInvalid(schema, invalid);
});

test("accepts an optional session block, producer, and multiple assets", () => {
  assertValid(schema, {
    packageVersion: 1,
    generatedAt: "2026-09-20T21:04:00Z",
    producer: { name: "astro-sync-cli", version: "0.1.0" },
    session: {
      label: "2026-09-20 — M31",
      startedAt: "2026-09-20T18:30:00Z",
      finishedAt: "2026-09-21T02:10:00Z",
    },
    assets: [
      {
        path: "images/frame-0001.fits",
        kind: "image",
        bytes: 41943040,
        capturedAt: "2026-09-20T19:12:03Z",
        addedAt: "2026-09-20T21:03:58Z",
      },
      {
        path: "metrics/quality.csv",
        kind: "metric-log",
        bytes: 2048,
        capturedAt: null,
        addedAt: "2026-09-20T21:03:59Z",
        mimeType: "text/csv",
      },
    ],
  });
});

test("rejects a manifest missing required fields, an empty assets array, or an unknown packageVersion", () => {
  assertInvalid(schema, {
    generatedAt: "2026-09-20T21:04:00Z",
    assets: [],
  });
  assertInvalid(schema, {
    packageVersion: 1,
    generatedAt: "2026-09-20T21:04:00Z",
    assets: [],
  });
  assertInvalid(schema, {
    packageVersion: 2,
    generatedAt: "2026-09-20T21:04:00Z",
    assets: [
      {
        path: "images/frame-0001.fits",
        kind: "image",
        bytes: 1,
        addedAt: "2026-09-20T21:03:58Z",
      },
    ],
  });
});

test("rejects an asset with an absolute path, a Windows drive path, or a missing required field", () => {
  const baseAsset = {
    kind: "image",
    bytes: 1,
    addedAt: "2026-09-20T21:03:58Z",
  };
  const withPath = (path) => ({
    packageVersion: 1,
    generatedAt: "2026-09-20T21:04:00Z",
    assets: [{ ...baseAsset, path }],
  });
  assertInvalid(schema, withPath("/etc/passwd"));
  assertInvalid(schema, withPath("C:/observatory/secret.fits"));
  assertInvalid(schema, withPath("images/./frame.fits"));
  assertInvalid(schema, withPath(".."));
  assertInvalid(schema, {
    packageVersion: 1,
    generatedAt: "2026-09-20T21:04:00Z",
    assets: [{ kind: "image", bytes: 1, addedAt: "2026-09-20T21:03:58Z" }],
  });
});

test("rejects a session block or a manifest carrying an id/tenant field it was never given room for", () => {
  assertInvalid(schema, {
    packageVersion: 1,
    generatedAt: "2026-09-20T21:04:00Z",
    session: { id: "8a25c9d2-7f0b-4b3a-9c9e-2f7e6f0b1a3d" },
    assets: [
      {
        path: "images/frame-0001.fits",
        kind: "image",
        bytes: 1,
        addedAt: "2026-09-20T21:03:58Z",
      },
    ],
  });
  assertInvalid(schema, {
    packageVersion: 1,
    generatedAt: "2026-09-20T21:04:00Z",
    tenantId: "acme-observatory",
    assets: [
      {
        path: "images/frame-0001.fits",
        kind: "image",
        bytes: 1,
        addedAt: "2026-09-20T21:03:58Z",
      },
    ],
  });
});
