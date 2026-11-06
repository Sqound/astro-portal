// The contract is packages/astro-contracts/schemas/session-package/.
// Service-level coverage for POST /v1/sessions/{id}/imports/preview and
// .../imports/confirm, on the exact pattern of upload-resources.test.mjs's
// own coverage of the resumable protocol. Run against a scratch SQLite
// database always; the import adds no PostgreSQL-specific behaviour (the
// session_package_imports migration uses one dialect-neutral `common`
// block), so unlike upload-resources-resumable.test.mjs this suite does not
// also gate a run against ASTRO_PORTAL_TEST_DATABASE_URL.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createSessionPackageImportService } from "../dist/api/session-package-import.js";
import { createUploadResourceService } from "../dist/api/upload-resources.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { createObservationSessionRepository } from "../dist/persistence/observation-session-repository.js";
import { createCaptureRepository } from "../dist/persistence/capture-repository.js";

const initialTime = "2026-09-25T20:00:00.000Z";
const unlimitedCapabilities = {
  "planner.multiple": true,
  "planner.mosaic": true,
  "pointing.solve": true,
  "sync.plan_limit": 0,
  "gallery.private": true,
  "capture.variant_limit": 4,
  "analysis.logs": false,
  "analysis.progression": false,
  "storage.max_file_bytes": 50 * 1024 * 1024,
  "storage.quota_bytes": 5 * 1024 * 1024 * 1024,
  "portal.invitations": false,
  "capture.count_limit": 9007199254740991,
  "capture.public": true,
  "history.retention_days": 90,
};

const cliProducedManifestPath = new URL(
  "../../astro-contracts/schemas/session-package/examples/manifest.cli-produced.json",
  import.meta.url,
);

function readOnlyProvider() {
  return {
    async capabilitiesFor() {
      return {};
    },
    async writeAccessFor() {
      return { readOnly: true, reason: "subscription_expired" };
    },
  };
}

const sha256Hex = (buffer) => createHash("sha256").update(buffer).digest("hex");

function manifestJsonFor(assets, extra = {}) {
  return JSON.stringify({
    packageVersion: 1,
    generatedAt: initialTime,
    ...extra,
    assets,
  });
}

function checksumsTextFor(entries) {
  return (
    entries.map(([sha256, path]) => `${sha256}  ${path}`).join("\n") + "\n"
  );
}

async function seedTenant(driver, tenantId, timestamp = initialTime) {
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, `Observatory ${tenantId}`, timestamp],
  );
}

async function withHarness(fn) {
  const directory = await mkdtemp(join(tmpdir(), "astro-session-import-"));
  const previousCaptures = process.env.ASTRO_PORTAL_CAPTURES_DIR;
  process.env.ASTRO_PORTAL_CAPTURES_DIR = join(directory, "captures");
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    const tenantId = randomUUID();
    await seedTenant(driver, tenantId);

    const sessions = await createObservationSessionRepository({ driver });
    const { resource: sessionResource } = await sessions.createSession({
      tenantId,
      startedAt: initialTime,
      timestamp: initialTime,
    });
    const sessionId = sessionResource.id;

    const captures = await createCaptureRepository({ driver });
    const uploads = await createUploadResourceService({
      driver,
      capabilities: unlimitedCapabilities,
      now: () => initialTime,
    });

    /** Seeds a capture directly, standing in for "already uploaded through POST /v1/uploads" ahead of the import. */
    async function seedCapture({
      bytes,
      attachToSession = true,
      originalName = "seeded.tif",
    }) {
      const sha256 = sha256Hex(bytes);
      const result = await captures.insertCaptureWithTargets({
        id: randomUUID(),
        tenantId,
        sessionId: attachToSession ? sessionId : null,
        originalName,
        sha256,
        byteSize: bytes.length,
        status: "uploaded",
        createdAt: initialTime,
      });
      return { sha256, bytes, capture: result.capture };
    }

    async function service(overrides = {}) {
      return createSessionPackageImportService({
        driver,
        dialect: "sqlite",
        now: () => initialTime,
        ...overrides,
      });
    }

    async function rowCounts() {
      const [captureCount, importCount, sessionRow] = await Promise.all([
        driver.query("SELECT COUNT(*) AS n FROM captures"),
        driver.query("SELECT COUNT(*) AS n FROM session_package_imports"),
        driver.query(
          "SELECT package_documents_json FROM observation_sessions WHERE id = ?",
          [sessionId],
        ),
      ]);
      const documents = sessionRow.rows[0]?.package_documents_json
        ? JSON.parse(sessionRow.rows[0].package_documents_json)
        : [];
      return {
        captures: Number(captureCount.rows[0].n),
        imports: Number(importCount.rows[0].n),
        documents: documents.length,
      };
    }

    await fn({
      driver,
      tenantId,
      sessionId,
      seedCapture,
      service,
      rowCounts,
      uploads,
    });
  } finally {
    await driver.close();
    if (previousCaptures === undefined)
      delete process.env.ASTRO_PORTAL_CAPTURES_DIR;
    else process.env.ASTRO_PORTAL_CAPTURES_DIR = previousCaptures;
    await rm(directory, { force: true, recursive: true });
  }
}

// --- invalid checksum ------------------------------------------------------

test("preview rejects an inline document asset whose bytes do not hash to checksums.sha256", async () => {
  await withHarness(async ({ tenantId, sessionId, service }) => {
    const svc = await service();
    const content = Buffer.from("altitude,azimuth\n10,20\n");
    const wrongSha256 = sha256Hex(Buffer.from("not the same bytes at all"));
    const manifestJson = manifestJsonFor([
      {
        path: "metrics/quality.csv",
        kind: "metric-log",
        bytes: content.length,
        addedAt: initialTime,
      },
    ]);
    const checksums = checksumsTextFor([[wrongSha256, "metrics/quality.csv"]]);

    await assert.rejects(
      () =>
        svc.preview({
          tenantId,
          sessionId,
          manifestJson,
          checksums,
          documents: { "metrics/quality.csv": content.toString("base64") },
        }),
      (error) => {
        assert.equal(error.code, "checksum_mismatch");
        assert.equal(error.status, 422);
        return true;
      },
    );
  });
});

// --- path traversal ---------------------------------------------------------

test("preview rejects a manifest asset path that traverses out of the package", async () => {
  await withHarness(async ({ tenantId, sessionId, service }) => {
    const svc = await service();
    const manifestJson = manifestJsonFor([
      {
        path: "images/../../etc/passwd",
        kind: "image",
        bytes: 41943040,
        addedAt: initialTime,
      },
    ]);
    const checksums = checksumsTextFor([
      ["a".repeat(64), "images/../../etc/passwd"],
    ]);

    await assert.rejects(
      () => svc.preview({ tenantId, sessionId, manifestJson, checksums }),
      (error) => {
        assert.equal(error.code, "invalid_path");
        assert.equal(error.status, 400);
        return true;
      },
    );
  });
});

// --- a capture's other image (WEB.17b.6) -------------------------------------

test("preview matches a package image that is a variant of a capture by its own size", async () => {
  await withHarness(
    async ({ driver, tenantId, sessionId, service, seedCapture }) => {
      const svc = await service();
      const main = await seedCapture({
        bytes: Buffer.from("the main image of the capture, a first size"),
      });
      const other = Buffer.from(
        "another image of the same capture, longer than the main one",
      );
      const otherSha = sha256Hex(other);
      const captures = await createCaptureRepository({ driver });
      await captures.addVariant({
        tenantId,
        captureId: main.capture.id,
        sha256: otherSha,
        byteSize: other.length,
        originalName: "variante.tif",
      });
      const manifestJson = manifestJsonFor([
        {
          path: "images/final/image.tif",
          kind: "image",
          bytes: main.bytes.length,
          addedAt: initialTime,
        },
        {
          path: "images/final/variante.tif",
          kind: "image",
          bytes: other.length,
          addedAt: initialTime,
        },
      ]);
      const checksums = checksumsTextFor([
        [main.sha256, "images/final/image.tif"],
        [otherSha, "images/final/variante.tif"],
      ]);
      const result = await svc.preview({
        tenantId,
        sessionId,
        manifestJson,
        checksums,
      });
      assert.equal(result.body.recognized.assetCount, 2);

      // A size that is neither the variant's nor the main's is still refused.
      const wrong = manifestJsonFor([
        {
          path: "images/final/variante.tif",
          kind: "image",
          bytes: main.bytes.length,
          addedAt: initialTime,
        },
      ]);
      await assert.rejects(
        () =>
          svc.preview({
            tenantId,
            sessionId,
            manifestJson: wrong,
            checksums: checksumsTextFor([
              [otherSha, "images/final/variante.tif"],
            ]),
          }),
        (error) => error.code === "checksum_mismatch",
      );
    },
  );
});

// --- preview persists nothing ------------------------------------------------

test("preview of a valid package persists nothing", async () => {
  await withHarness(
    async ({ tenantId, sessionId, service, seedCapture, rowCounts }) => {
      const svc = await service();
      const { sha256, bytes } = await seedCapture({
        bytes: Buffer.from("synthetic capture bytes for preview"),
      });
      const manifestJson = manifestJsonFor([
        {
          path: "images/frame-0001.fits",
          kind: "image",
          bytes: bytes.length,
          addedAt: initialTime,
        },
      ]);
      const checksums = checksumsTextFor([[sha256, "images/frame-0001.fits"]]);

      const before = await rowCounts();
      const result = await svc.preview({
        tenantId,
        sessionId,
        manifestJson,
        checksums,
      });
      const after = await rowCounts();

      assert.equal(result.status, 200);
      assert.equal(result.body.alreadyImported, false);
      assert.equal(result.body.recognized.assetCount, 1);
      assert.equal(result.body.recognized.totalBytes, bytes.length);
      assert.deepEqual(result.body.recognized.byKind, {
        image: { count: 1, bytes: bytes.length },
      });
      assert.equal(result.body.visibility, "private");
      assert.deepEqual(before, after);
    },
  );
});

test("preview reports asset_not_uploaded for an image asset never uploaded", async () => {
  await withHarness(async ({ tenantId, sessionId, service }) => {
    const svc = await service();
    const bytes = Buffer.from("never uploaded");
    const manifestJson = manifestJsonFor([
      {
        path: "images/frame-0001.fits",
        kind: "image",
        bytes: bytes.length,
        addedAt: initialTime,
      },
    ]);
    const checksums = checksumsTextFor([
      [sha256Hex(bytes), "images/frame-0001.fits"],
    ]);

    await assert.rejects(
      () => svc.preview({ tenantId, sessionId, manifestJson, checksums }),
      (error) => {
        assert.equal(error.code, "asset_not_uploaded");
        assert.equal(error.status, 409);
        return true;
      },
    );
  });
});

// --- double confirm is idempotent -------------------------------------------

test("confirm is idempotent by manifest fingerprint: a second confirm changes nothing", async () => {
  await withHarness(
    async ({ tenantId, sessionId, service, seedCapture, rowCounts }) => {
      const svc = await service();
      const { sha256, bytes } = await seedCapture({
        bytes: Buffer.from("synthetic capture bytes for confirm"),
      });
      const documentContent = Buffer.from("frame,fwhm\n1,2.3\n");
      const manifestJson = manifestJsonFor([
        {
          path: "images/frame-0001.fits",
          kind: "image",
          bytes: bytes.length,
          addedAt: initialTime,
        },
        {
          path: "metrics/quality.csv",
          kind: "metric-log",
          bytes: documentContent.length,
          addedAt: initialTime,
        },
      ]);
      const checksums = checksumsTextFor([
        [sha256, "images/frame-0001.fits"],
        [sha256Hex(documentContent), "metrics/quality.csv"],
      ]);
      const documents = {
        "metrics/quality.csv": documentContent.toString("base64"),
      };

      const first = await svc.confirm({
        tenantId,
        userId: randomUUID(),
        sessionId,
        manifestJson,
        checksums,
        documents,
      });
      assert.equal(first.status, 200);
      assert.equal(first.body.alreadyImported, false);
      assert.equal(first.body.assetCount, 2);
      assert.equal(first.body.capturesLinked, 1);
      assert.equal(first.body.documentsAttached, 1);

      const afterFirst = await rowCounts();
      assert.equal(afterFirst.imports, 1);
      assert.equal(afterFirst.documents, 1);

      const second = await svc.confirm({
        tenantId,
        userId: randomUUID(),
        sessionId,
        manifestJson,
        checksums,
        documents,
      });
      assert.equal(second.status, 200);
      assert.equal(second.body.alreadyImported, true);
      assert.equal(second.body.importedAt, first.body.importedAt);
      assert.equal(second.body.assetCount, first.body.assetCount);
      assert.equal(second.body.bytes, first.body.bytes);

      const afterSecond = await rowCounts();
      assert.deepEqual(afterSecond, afterFirst);
    },
  );
});

// --- entitlement_read_only ---------------------------------------------------

test("confirm refuses with entitlement_read_only and writes nothing", async () => {
  await withHarness(
    async ({ tenantId, sessionId, service, seedCapture, rowCounts }) => {
      const svc = await service({ entitlementProvider: readOnlyProvider() });
      const { sha256, bytes } = await seedCapture({
        bytes: Buffer.from("synthetic capture bytes, read-only account"),
      });
      const manifestJson = manifestJsonFor([
        {
          path: "images/frame-0001.fits",
          kind: "image",
          bytes: bytes.length,
          addedAt: initialTime,
        },
      ]);
      const checksums = checksumsTextFor([[sha256, "images/frame-0001.fits"]]);

      const before = await rowCounts();
      await assert.rejects(
        () =>
          svc.confirm({
            tenantId,
            userId: randomUUID(),
            sessionId,
            manifestJson,
            checksums,
          }),
        (error) => {
          assert.equal(error.code, "entitlement_read_only");
          assert.equal(error.status, 403);
          return true;
        },
      );
      const after = await rowCounts();
      assert.deepEqual(before, after);
    },
  );
});

// --- a package produced by the Rust CLI --------------------------------------

test("imports the manifest recorded from astro-sync-cli's package command", async () => {
  await withHarness(
    async ({ tenantId, sessionId, service, seedCapture, rowCounts }) => {
      const manifestJson = await readFile(cliProducedManifestPath, "utf8");
      const manifest = JSON.parse(manifestJson);
      assert.equal(
        manifest.assets.length,
        5,
        "fixture drifted from its recording",
      );

      // The fixture's assets are declared, not the real astro-sync-cli run's
      // actual bytes (the repository does not carry those binaries):
      // synthesize content of exactly each asset's declared size and hash
      // that.
      const reconstructed = new Map(
        manifest.assets.map((asset) => [
          asset.path,
          Buffer.alloc(asset.bytes, asset.path.charCodeAt(0)),
        ]),
      );
      const checksums = checksumsTextFor(
        manifest.assets.map((asset) => [
          sha256Hex(reconstructed.get(asset.path)),
          asset.path,
        ]),
      );

      const documents = {};
      for (const asset of manifest.assets) {
        if (asset.kind === "image" || asset.kind === "progression") {
          await seedCapture({
            bytes: reconstructed.get(asset.path),
            originalName: asset.path,
          });
        } else {
          documents[asset.path] = reconstructed
            .get(asset.path)
            .toString("base64");
        }
      }

      const svc = await service();
      const preview = await svc.preview({
        tenantId,
        sessionId,
        manifestJson,
        checksums,
        documents,
      });
      assert.equal(preview.status, 200);
      assert.equal(preview.body.recognized.assetCount, 5);
      assert.equal(preview.body.recognized.byKind.image.count, 2);
      assert.equal(preview.body.recognized.byKind["metric-log"].count, 2);
      assert.equal(preview.body.recognized.byKind.other.count, 1);

      const before = await rowCounts();
      const confirm = await svc.confirm({
        tenantId,
        userId: randomUUID(),
        sessionId,
        manifestJson,
        checksums,
        documents,
      });
      assert.equal(confirm.status, 200);
      assert.equal(confirm.body.alreadyImported, false);
      assert.equal(confirm.body.capturesLinked, 2);
      assert.equal(confirm.body.documentsAttached, 3);

      const after = await rowCounts();
      assert.equal(after.imports, before.imports + 1);
      assert.equal(after.documents, before.documents + 3);
      // No capture was recopied: the two image assets were already seeded above.
      assert.equal(after.captures, before.captures);
    },
  );
});
