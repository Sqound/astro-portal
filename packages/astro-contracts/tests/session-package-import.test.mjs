import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertInvalid, assertValid } from "./schema-assert.mjs";

const schema = JSON.parse(
  await readFile(
    new URL(
      "../schemas/api/session-package-import.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("session-package-import.schema.json declares a 2020-12 $schema and a stable $id", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(
    schema.$id,
    "https://astroportal.invalid/schemas/api/session-package-import.schema.json",
  );
});

test("accepts a preview/confirm request with and without inline documents", () => {
  assertValid(schema, {
    manifestJson: '{"packageVersion":1}',
    checksums: "abc  images/frame-0001.fits\n",
  });
  assertValid(schema, {
    manifestJson: '{"packageVersion":1}',
    checksums: "abc  metrics/quality.csv\n",
    documents: { "metrics/quality.csv": "YWx0aXR1ZGU=" },
  });
});

test("rejects a request missing checksums or carrying an unknown field", () => {
  assertInvalid(schema, { manifestJson: "{}" });
  assertInvalid(schema, {
    manifestJson: "{}",
    checksums: "abc  a\n",
    manifestPath: "manifest.json",
  });
});

test("accepts a clean preview response, with and without a prior import", () => {
  const recognized = {
    assetCount: 2,
    totalBytes: 84,
    byKind: {
      image: { count: 1, bytes: 64 },
      "metric-log": { count: 1, bytes: 20 },
    },
  };
  assertValid(schema, {
    manifestSha256: "a".repeat(64),
    alreadyImported: false,
    recognized,
    warnings: [],
    visibility: "private",
  });
  assertValid(schema, {
    manifestSha256: "a".repeat(64),
    alreadyImported: true,
    previousImport: {
      sessionId: "8a25c9d2-7f0b-4b3a-9c9e-2f7e6f0b1a3d",
      importedAt: "2026-09-25T20:00:00.000Z",
      assetCount: 2,
      bytes: 84,
    },
    recognized,
    warnings: [
      {
        code: "capture_session_unset",
        path: "images/frame-0001.fits",
        message: "…",
      },
    ],
    visibility: "private",
  });
});

test("rejects a preview response naming a public visibility", () => {
  assertInvalid(schema, {
    manifestSha256: "a".repeat(64),
    alreadyImported: false,
    recognized: { assetCount: 1, totalBytes: 1, byKind: {} },
    warnings: [],
    visibility: "public",
  });
});

test("accepts a first confirm response and an idempotent replay", () => {
  const first = {
    manifestSha256: "a".repeat(64),
    alreadyImported: false,
    sessionId: "8a25c9d2-7f0b-4b3a-9c9e-2f7e6f0b1a3d",
    importedAt: "2026-09-25T20:00:00.000Z",
    assetCount: 2,
    bytes: 84,
    capturesLinked: 1,
    documentsAttached: 1,
    warnings: [],
  };
  assertValid(schema, first);
  const { capturesLinked, documentsAttached, ...replay } = first;
  assertValid(schema, { ...replay, alreadyImported: true });
});

test("rejects a confirm response missing sessionId or importedAt", () => {
  assertInvalid(schema, {
    manifestSha256: "a".repeat(64),
    alreadyImported: false,
    assetCount: 1,
    bytes: 1,
    warnings: [],
  });
});

test("accepts every route-specific refusal code", () => {
  for (const code of [
    "invalid_request",
    "invalid_path",
    "checksum_mismatch",
    "asset_not_uploaded",
    "session_not_found",
    "entitlement_read_only",
  ])
    assertValid(schema, { error: { code, message: "…" } });
  assertInvalid(schema, {
    error: { code: "storage_quota_reached", message: "…" },
  });
});
