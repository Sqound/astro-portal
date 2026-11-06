// The protocol itself is packages/astro-contracts/schemas/api/uploads.md.
// Service-level coverage for the resumable upload protocol — createUpload, putUploadChunk,
// getUploadStatus, finalizeUpload, purgeExpiredUploads — on the exact
// pattern of upload-resources.test.mjs's own coverage of the legacy
// single-request receiveUpload. Run against a scratch SQLite database
// always, and against the dedicated PostgreSQL test database only when
// ASTRO_PORTAL_TEST_DATABASE_URL is already set (never constructed here).
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  UploadResourceError,
  createUploadResourceService,
} from "../dist/api/upload-resources.js";
import {
  captureFileExists,
  uploadPartByteSize,
} from "../dist/uploads/capture-storage.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";

const initialTime = "2026-09-20T20:00:00.000Z";
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

function readOnlyProvider(capabilities) {
  return {
    async capabilitiesFor() {
      return capabilities;
    },
    async writeAccessFor() {
      return { readOnly: true, reason: "subscription_expired" };
    },
  };
}

async function seedTenant(driver, tenantId) {
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, `Observatory ${tenantId}`, initialTime],
  );
}

/** A body async-iterable that yields exactly `bytes`, in one or more pieces. */
async function* bytesOnce(buffer) {
  yield buffer;
}

/** Simulates a connection dropped mid-chunk: yields a partial prefix, then throws. */
async function* interruptedAfter(buffer, prefixLength) {
  yield buffer.subarray(0, prefixLength);
  throw new Error("simulated connection drop");
}

async function exerciseResumableUploads(driver) {
  const directory = await mkdtemp(join(tmpdir(), "astro-upload-resumable-"));
  const previousCaptures = process.env.ASTRO_PORTAL_CAPTURES_DIR;
  process.env.ASTRO_PORTAL_CAPTURES_DIR = join(directory, "captures");
  try {
    // --- creation, and the exact envelope shape -----------------------
    {
      const tenantId = randomUUID();
      await seedTenant(driver, tenantId);
      const service = await createUploadResourceService({
        driver,
        capabilities: unlimitedCapabilities,
        now: () => initialTime,
        chunkSizeBytes: 1024,
      });
      const fileBytes = Buffer.from("synthetic capture bytes for creation");
      const sha256 = createHash("sha256").update(fileBytes).digest("hex");
      const created = await service.createUpload({
        tenantId,
        userId: randomUUID(),
        originalName: "m31.tif",
        sha256,
        byteSize: fileBytes.length,
        contentType: "image/tiff",
      });
      assert.equal(created.status, 201);
      assert.equal(created.body.completed, false);
      assert.equal(created.body.offset, 0);
      assert.equal(created.body.byteSize, fileBytes.length);
      assert.equal(created.body.chunkSize, 1024);
      assert.ok(created.body.uploadId);
      assert.ok(created.body.expiresAt);
      assert.equal(created.body.captureId, undefined);

      // Re-creating the exact same declared upload while it is still
      // mid-transfer answers the SAME session, not a competing one.
      const recreated = await service.createUpload({
        tenantId,
        userId: randomUUID(),
        originalName: "m31.tif",
        sha256,
        byteSize: fileBytes.length,
        contentType: "image/tiff",
      });
      assert.equal(recreated.status, 200);
      assert.equal(recreated.body.uploadId, created.body.uploadId);
      assert.equal(recreated.body.offset, 0);
    }

    // --- chunks in order, offset mismatch, resume after interruption --
    {
      const tenantId = randomUUID();
      await seedTenant(driver, tenantId);
      const service = await createUploadResourceService({
        driver,
        capabilities: unlimitedCapabilities,
        now: () => initialTime,
        chunkSizeBytes: 8,
      });
      const fileBytes = Buffer.from("0123456789ABCDEFGHIJ"); // 20 bytes, 8+8+4
      const sha256 = createHash("sha256").update(fileBytes).digest("hex");
      const created = await service.createUpload({
        tenantId,
        userId: null,
        originalName: "chunks.bin",
        sha256,
        byteSize: fileBytes.length,
      });
      const uploadId = created.body.uploadId;

      const first = await service.putUploadChunk({
        tenantId,
        uploadId,
        declaredOffset: 0,
        declaredContentLength: 8,
        bodyChunks: bytesOnce(fileBytes.subarray(0, 8)),
      });
      assert.equal(first.status, 200);
      assert.equal(first.body.offset, 8);
      assert.equal(first.body.completed, false);

      // A wrong offset is refused with the server's own current offset,
      // not the client's stale guess.
      await assert.rejects(
        service.putUploadChunk({
          tenantId,
          uploadId,
          declaredOffset: 5,
          declaredContentLength: 8,
          bodyChunks: bytesOnce(fileBytes.subarray(8, 16)),
        }),
        (error) => {
          assert.ok(error instanceof UploadResourceError);
          assert.equal(error.code, "upload_offset_mismatch");
          assert.equal(error.status, 409);
          assert.equal(error.body.offset, 8);
          return true;
        },
      );

      // A connection dropped mid-chunk leaves the previous, durable offset
      // untouched — no torn write.
      await assert.rejects(
        service.putUploadChunk({
          tenantId,
          uploadId,
          declaredOffset: 8,
          declaredContentLength: 8,
          bodyChunks: interruptedAfter(fileBytes.subarray(8, 16), 3),
        }),
      );
      const afterInterruption = await service.getUploadStatus({
        tenantId,
        uploadId,
      });
      assert.equal(
        afterInterruption.body.offset,
        8,
        "the interrupted chunk left no partial bytes",
      );

      // Resuming with the SAME chunk, sent whole, succeeds.
      const second = await service.putUploadChunk({
        tenantId,
        uploadId,
        declaredOffset: 8,
        declaredContentLength: 8,
        bodyChunks: bytesOnce(fileBytes.subarray(8, 16)),
      });
      assert.equal(second.body.offset, 16);

      const third = await service.putUploadChunk({
        tenantId,
        uploadId,
        declaredOffset: 16,
        declaredContentLength: 4,
        bodyChunks: bytesOnce(fileBytes.subarray(16, 20)),
      });
      assert.equal(third.body.offset, 20);
      assert.equal(
        third.body.completed,
        false,
        "PUT never finalizes on its own",
      );

      // --- finalize with the correct digest: one capture -------------
      const finalized = await service.finalizeUpload({
        tenantId,
        uploadId,
        userId: null,
      });
      assert.equal(finalized.status, 200);
      assert.equal(finalized.body.completed, true);
      assert.ok(finalized.body.captureId);
      assert.equal(finalized.body.capture.sha256, sha256);
      assert.equal(finalized.body.capture.byteSize, 20);
      assert.equal(finalized.body.deduplicated, false);

      // Idempotent: finalizing again replays the same result, no new row.
      const finalizedAgain = await service.finalizeUpload({
        tenantId,
        uploadId,
        userId: null,
      });
      assert.equal(finalizedAgain.status, 200);
      assert.equal(finalizedAgain.body.captureId, finalized.body.captureId);
      const count = (
        await driver.query(
          "SELECT COUNT(*) AS count FROM captures WHERE sha256 = ?",
          [sha256],
        )
      ).rows[0].count;
      assert.equal(Number(count), 1);

      // --- re-creating an upload for the now-finalized sha256 ---------
      const recreatedAfterFinalize = await service.createUpload({
        tenantId,
        userId: null,
        originalName: "chunks.bin",
        sha256,
        byteSize: fileBytes.length,
      });
      assert.equal(recreatedAfterFinalize.status, 200);
      assert.equal(recreatedAfterFinalize.body.completed, true);
      assert.equal(
        recreatedAfterFinalize.body.captureId,
        finalized.body.captureId,
      );
      const countAfterRecreate = (
        await driver.query(
          "SELECT COUNT(*) AS count FROM captures WHERE sha256 = ?",
          [sha256],
        )
      ).rows[0].count;
      assert.equal(Number(countAfterRecreate), 1, "never a doublon");
    }

    // --- a false digest: 422, and nothing created -----------------------
    {
      const tenantId = randomUUID();
      await seedTenant(driver, tenantId);
      const service = await createUploadResourceService({
        driver,
        capabilities: unlimitedCapabilities,
        now: () => initialTime,
        chunkSizeBytes: 1024,
      });
      const declaredBytes = Buffer.from("declared bytes, never actually sent");
      // Same length as `declaredBytes`, one byte corrupted — a hash mismatch
      // that is not also a byteSize mismatch, isolating the code path under
      // test.
      const sentBytes = Buffer.from(declaredBytes);
      sentBytes[0] ^= 0xff;
      const declaredSha256 = createHash("sha256")
        .update(declaredBytes)
        .digest("hex");
      const created = await service.createUpload({
        tenantId,
        userId: null,
        originalName: "corrupt.bin",
        sha256: declaredSha256,
        byteSize: declaredBytes.length,
      });
      const uploadId = created.body.uploadId;
      await service.putUploadChunk({
        tenantId,
        uploadId,
        declaredOffset: 0,
        declaredContentLength: sentBytes.length,
        bodyChunks: bytesOnce(sentBytes),
      });
      await assert.rejects(
        service.finalizeUpload({ tenantId, uploadId, userId: null }),
        (error) => {
          assert.ok(error instanceof UploadResourceError);
          assert.equal(error.code, "upload_hash_mismatch");
          assert.equal(error.status, 422);
          return true;
        },
      );
      const captureCount = (
        await driver.query(
          "SELECT COUNT(*) AS count FROM captures WHERE sha256 = ?",
          [declaredSha256],
        )
      ).rows[0].count;
      assert.equal(Number(captureCount), 0, "a hash mismatch creates nothing");
      assert.equal(
        false,
        await captureFileExists(tenantId, declaredSha256),
        "the bad bytes are never published",
      );

      // The session resets to accept a full re-upload from zero.
      const afterMismatch = await service.getUploadStatus({
        tenantId,
        uploadId,
      });
      assert.equal(afterMismatch.body.offset, 0);
      assert.equal(afterMismatch.body.completed, false);
      assert.equal(await uploadPartByteSize(tenantId, uploadId), 0);
    }

    // --- size over the per-file limit: 413 before any byte --------------
    {
      const tenantId = randomUUID();
      await seedTenant(driver, tenantId);
      const service = await createUploadResourceService({
        driver,
        capabilities: {
          ...unlimitedCapabilities,
          "storage.max_file_bytes": 100,
        },
        now: () => initialTime,
      });
      const sha256 = "a".repeat(64);
      await assert.rejects(
        service.createUpload({
          tenantId,
          userId: null,
          originalName: "too-big.tif",
          sha256,
          byteSize: 200,
        }),
        (error) => {
          assert.ok(error instanceof UploadResourceError);
          assert.equal(error.code, "file_too_large");
          assert.equal(error.status, 413);
          assert.ok(error.body.storage);
          return true;
        },
      );
      const rows = (
        await driver.query(
          "SELECT COUNT(*) AS count FROM upload_sessions WHERE tenant_id = ?",
          [tenantId],
        )
      ).rows[0].count;
      assert.equal(
        Number(rows),
        0,
        "no session is allocated before the refusal",
      );
    }

    // --- entitlement_read_only refuses creation --------------------------
    {
      const tenantId = randomUUID();
      await seedTenant(driver, tenantId);
      const service = await createUploadResourceService({
        driver,
        entitlementProvider: readOnlyProvider(unlimitedCapabilities),
        now: () => initialTime,
      });
      const sha256 = "b".repeat(64);
      await assert.rejects(
        service.createUpload({
          tenantId,
          userId: randomUUID(),
          originalName: "after-cancellation.tif",
          sha256,
          byteSize: 1024,
        }),
        (error) => {
          assert.ok(error instanceof UploadResourceError);
          assert.equal(error.code, "entitlement_read_only");
          assert.equal(error.status, 403);
          return true;
        },
      );
      const rows = (
        await driver.query(
          "SELECT COUNT(*) AS count FROM upload_sessions WHERE tenant_id = ?",
          [tenantId],
        )
      ).rows[0].count;
      assert.equal(Number(rows), 0);
    }

    // --- expiry and purge -------------------------------------------------
    {
      const tenantId = randomUUID();
      await seedTenant(driver, tenantId);
      let clock = initialTime;
      const service = await createUploadResourceService({
        driver,
        capabilities: unlimitedCapabilities,
        now: () => clock,
      });
      const sha256 = "c".repeat(64);
      const created = await service.createUpload({
        tenantId,
        userId: null,
        originalName: "will-expire.tif",
        sha256,
        byteSize: 10,
      });
      await service.putUploadChunk({
        tenantId,
        uploadId: created.body.uploadId,
        declaredOffset: 0,
        declaredContentLength: 5,
        bodyChunks: bytesOnce(Buffer.from("hello")),
      });

      // 73 hours later: past the 72-hour window.
      clock = new Date(
        new Date(initialTime).getTime() + 73 * 3600_000,
      ).toISOString();

      // `purgeExpiredUploads` is a global sweep, not scoped to this
      // tenant — earlier scenarios above may have left their own expired,
      // still in-progress rows (a reset-after-hash-mismatch session, for
      // instance) sharing the same `now`. This block only asserts on the
      // ONE session it created itself, by id, below.
      const purgedCount = await service.purgeExpiredUploads(clock);
      assert.ok(purgedCount >= 1);
      assert.equal(
        await uploadPartByteSize(tenantId, created.body.uploadId),
        0,
        "the part file is removed with the row",
      );

      // A fresh GET on the purged id is a 404, not a resurrected session.
      await assert.rejects(
        service.getUploadStatus({ tenantId, uploadId: created.body.uploadId }),
        (error) => {
          assert.equal(error.code, "upload_not_found");
          assert.equal(error.status, 404);
          return true;
        },
      );

      // Re-creating for the same sha256 starts a brand new session at
      // offset zero rather than resuming the purged one.
      const recreated = await service.createUpload({
        tenantId,
        userId: null,
        originalName: "will-expire.tif",
        sha256,
        byteSize: 10,
      });
      assert.equal(recreated.status, 201);
      assert.equal(recreated.body.offset, 0);
      assert.notEqual(recreated.body.uploadId, created.body.uploadId);
    }
  } finally {
    if (previousCaptures === undefined)
      delete process.env.ASTRO_PORTAL_CAPTURES_DIR;
    else process.env.ASTRO_PORTAL_CAPTURES_DIR = previousCaptures;
    await rm(directory, { force: true, recursive: true });
  }
}

test("resumable uploads on a scratch SQLite database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-resumable-db-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    await exerciseResumableUploads(driver);
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "resumable uploads on the dedicated PostgreSQL test database",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const databaseUrl = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(databaseUrl))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const resetSchema = async () => {
      const driver = PostgresDriver.open(databaseUrl);
      try {
        await driver.run("DROP SCHEMA public CASCADE");
        await driver.run("CREATE SCHEMA public");
      } finally {
        await driver.close();
      }
    };
    let driver;
    try {
      await resetSchema();
      driver = createDatabaseDriver({ databaseUrl });
      await applyMigrations(driver, "postgres");
      await exerciseResumableUploads(driver);
    } finally {
      if (driver) await driver.close();
      await resetSchema();
    }
  },
);
