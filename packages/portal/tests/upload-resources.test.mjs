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
import { captureFileExists } from "../dist/uploads/capture-storage.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";

const initialTime = "2026-09-20T20:00:00.000Z";
const boundary = "astro-portal-upload-test-boundary";
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
const openSourceCapabilities = {
  ...unlimitedCapabilities,
  "storage.max_file_bytes": 0,
  "storage.quota_bytes": 0,
};

function buildBody({ metadata, fileBytes }) {
  const parts = [
    Buffer.from(`--${boundary}\r\n`, "latin1"),
    Buffer.from(
      'Content-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n',
      "latin1",
    ),
    Buffer.from(JSON.stringify(metadata), "utf8"),
    Buffer.from(`\r\n--${boundary}\r\n`, "latin1"),
    Buffer.from(
      'Content-Disposition: form-data; name="file"; filename="capture.tif"\r\nContent-Type: image/tiff\r\n\r\n',
      "latin1",
    ),
    fileBytes,
    Buffer.from(`\r\n--${boundary}--\r\n`, "latin1"),
  ];
  return Buffer.concat(parts);
}

async function* chunked(buffer, size = 4096) {
  for (let offset = 0; offset < buffer.length; offset += size)
    yield buffer.subarray(offset, Math.min(offset + size, buffer.length));
}

const contentType = () => `multipart/form-data; boundary=${boundary}`;

async function seedTenant(driver, tenantId, targetIds = []) {
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, `Observatory ${tenantId}`, initialTime],
  );
  for (const targetId of targetIds)
    await driver.run(
      `INSERT INTO target_catalogue_entries (
         id, designation, aliases_json, common_names_json, catalogues_json,
         catalogue, source_json, source_revision, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        targetId,
        targetId,
        "[]",
        "[]",
        '["OpenNGC"]',
        "OpenNGC",
        "{}",
        "test-v1",
        initialTime,
        initialTime,
      ],
    );
}

async function withService(fn) {
  const directory = await mkdtemp(join(tmpdir(), "astro-upload-resources-"));
  const previousCaptures = process.env.ASTRO_PORTAL_CAPTURES_DIR;
  process.env.ASTRO_PORTAL_CAPTURES_DIR = join(directory, "captures");
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    await fn({ driver, directory });
  } finally {
    await driver.close();
    if (previousCaptures === undefined)
      delete process.env.ASTRO_PORTAL_CAPTURES_DIR;
    else process.env.ASTRO_PORTAL_CAPTURES_DIR = previousCaptures;
    await rm(directory, { force: true, recursive: true });
  }
}

test("receiveUpload creates, deduplicates with target union, and lists", async () => {
  await withService(async ({ driver }) => {
    const tenantId = randomUUID();
    await seedTenant(driver, tenantId, ["m31", "ngc224"]);
    const service = await createUploadResourceService({
      driver,
      capabilities: unlimitedCapabilities,
      now: () => initialTime,
    });

    const fileBytes = Buffer.from("synthetic capture bytes, not a real image");
    const sha256 = createHash("sha256").update(fileBytes).digest("hex");
    const body = buildBody({
      metadata: {
        originalName: "m31-final.tif",
        sha256,
        byteSize: fileBytes.length,
        targetIds: ["m31"],
      },
      fileBytes,
    });

    const first = await service.receiveUpload({
      tenantId,
      userId: randomUUID(),
      contentType: contentType(),
      bodyChunks: chunked(body),
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.deduplicated, false);
    assert.deepEqual(first.body.capture.targetIds, ["m31"]);
    assert.equal(first.body.capture.status, "uploaded");
    assert.equal(first.body.capture.visibility, "private");
    assert.equal(first.body.storage.usedBytes, fileBytes.length);
    assert.equal(await captureFileExists(tenantId, sha256), true);

    // Same bytes, one more target: dedup, union, targetsAdded: 1.
    const secondBody = buildBody({
      metadata: {
        originalName: "renamed-on-replay.tif",
        sha256,
        byteSize: fileBytes.length,
        targetIds: ["m31", "ngc224"],
      },
      fileBytes,
    });
    const second = await service.receiveUpload({
      tenantId,
      userId: randomUUID(),
      contentType: contentType(),
      bodyChunks: chunked(secondBody, 3), // small chunks to exercise streaming
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.deduplicated, true);
    assert.equal(second.body.targetsAdded, 1);
    assert.deepEqual(second.body.capture.targetIds, ["m31", "ngc224"]);
    assert.equal(second.body.capture.id, first.body.capture.id);
    assert.equal(second.body.capture.originalName, "m31-final.tif");
    // Used bytes unchanged: still a single stored file.
    assert.equal(second.body.storage.usedBytes, fileBytes.length);

    const list = await service.listCaptures({ tenantId, limit: 50 });
    assert.equal(list.captures.length, 1);
    assert.deepEqual(list.captures[0].targetIds, ["m31", "ngc224"]);

    const filtered = await service.listCaptures({
      tenantId,
      targetId: "ngc224",
    });
    assert.equal(filtered.captures.length, 1);
    const filteredMiss = await service.listCaptures({
      tenantId,
      targetId: "m45",
    });
    assert.equal(filteredMiss.captures.length, 0);

    await service.close();
  });
});

test("receiveUpload refuses a zero quota before writing any file", async () => {
  await withService(async ({ driver }) => {
    const tenantId = randomUUID();
    await seedTenant(driver, tenantId);
    const service = await createUploadResourceService({
      driver,
      capabilities: openSourceCapabilities,
      now: () => initialTime,
    });
    const fileBytes = Buffer.from("some bytes");
    const sha256 = createHash("sha256").update(fileBytes).digest("hex");
    const body = buildBody({
      metadata: { originalName: "x.tif", sha256, byteSize: fileBytes.length },
      fileBytes,
    });
    await assert.rejects(
      service.receiveUpload({
        tenantId,
        userId: randomUUID(),
        contentType: contentType(),
        bodyChunks: chunked(body),
      }),
      (error) => {
        assert.ok(error instanceof UploadResourceError);
        assert.equal(error.code, "storage_quota_reached");
        assert.equal(error.status, 409);
        assert.deepEqual(error.body.storage, {
          usedBytes: 0,
          quotaBytes: 0,
          maxFileBytes: 0,
          captureCount: 0,
          captureCountLimit: 9007199254740991,
          // `Capture.variant_limit` beside the count's.
          variantLimit: 4,
        });
        return true;
      },
    );
    assert.equal(await captureFileExists(tenantId, sha256), false);
    await service.close();
  });
});

test("receiveUpload refuses a declared size over the per-file limit before reading the file", async () => {
  await withService(async ({ driver }) => {
    const tenantId = randomUUID();
    await seedTenant(driver, tenantId);
    const service = await createUploadResourceService({
      driver,
      capabilities: { ...unlimitedCapabilities, "storage.max_file_bytes": 10 },
      now: () => initialTime,
    });
    const fileBytes = Buffer.from("this is more than ten bytes of content");
    const sha256 = createHash("sha256").update(fileBytes).digest("hex");
    const body = buildBody({
      metadata: { originalName: "big.tif", sha256, byteSize: fileBytes.length },
      fileBytes,
    });
    await assert.rejects(
      service.receiveUpload({
        tenantId,
        userId: randomUUID(),
        contentType: contentType(),
        bodyChunks: chunked(body),
      }),
      (error) => {
        assert.ok(error instanceof UploadResourceError);
        assert.equal(error.code, "file_too_large");
        assert.equal(error.status, 413);
        return true;
      },
    );
    assert.equal(await captureFileExists(tenantId, sha256), false);
    await service.close();
  });
});

test("receiveUpload aborts mid-stream once real bytes exceed the limit, even if declared size lied", async () => {
  await withService(async ({ driver }) => {
    const tenantId = randomUUID();
    await seedTenant(driver, tenantId);
    const service = await createUploadResourceService({
      driver,
      capabilities: { ...unlimitedCapabilities, "storage.max_file_bytes": 10 },
      now: () => initialTime,
    });
    const fileBytes = Buffer.from("this is much more than ten bytes for real");
    const sha256 = createHash("sha256").update(fileBytes).digest("hex");
    const body = buildBody({
      // Declares a small size the capability check would accept...
      metadata: { originalName: "lie.tif", sha256, byteSize: 5 },
      fileBytes, // ...but the real stream is much larger.
    });
    await assert.rejects(
      service.receiveUpload({
        tenantId,
        userId: randomUUID(),
        contentType: contentType(),
        bodyChunks: chunked(body, 4),
      }),
      (error) => {
        assert.ok(error instanceof UploadResourceError);
        assert.equal(error.code, "file_too_large");
        return true;
      },
    );
    assert.equal(await captureFileExists(tenantId, sha256), false);
    await service.close();
  });
});

test("receiveUpload refuses a declared checksum that disagrees with the real bytes, and writes nothing", async () => {
  await withService(async ({ driver }) => {
    const tenantId = randomUUID();
    await seedTenant(driver, tenantId);
    const service = await createUploadResourceService({
      driver,
      capabilities: unlimitedCapabilities,
      now: () => initialTime,
    });
    const fileBytes = Buffer.from("actual content");
    const wrongSha256 = "0".repeat(64);
    const body = buildBody({
      metadata: {
        originalName: "wrong.tif",
        sha256: wrongSha256,
        byteSize: fileBytes.length,
      },
      fileBytes,
    });
    await assert.rejects(
      service.receiveUpload({
        tenantId,
        userId: randomUUID(),
        contentType: contentType(),
        bodyChunks: chunked(body),
      }),
      (error) => {
        assert.ok(error instanceof UploadResourceError);
        assert.equal(error.code, "checksum_mismatch");
        assert.equal(error.status, 400);
        return true;
      },
    );
    assert.equal(await captureFileExists(tenantId, wrongSha256), false);
    const actualSha256 = createHash("sha256").update(fileBytes).digest("hex");
    assert.equal(await captureFileExists(tenantId, actualSha256), false);

    const rows = (
      await driver.query(
        "SELECT COUNT(*) AS count FROM captures WHERE tenant_id = ?",
        [tenantId],
      )
    ).rows[0].count;
    assert.equal(Number(rows), 0);
    await service.close();
  });
});

test("receiveUpload enforces the quota by accumulation across two uploads", async () => {
  await withService(async ({ driver }) => {
    const tenantId = randomUUID();
    await seedTenant(driver, tenantId);
    const service = await createUploadResourceService({
      driver,
      capabilities: {
        ...unlimitedCapabilities,
        "storage.quota_bytes": 15,
        "storage.max_file_bytes": 100,
      },
      now: () => initialTime,
    });
    const first = Buffer.from("1234567890"); // 10 bytes
    const firstSha = createHash("sha256").update(first).digest("hex");
    const firstResult = await service.receiveUpload({
      tenantId,
      userId: randomUUID(),
      contentType: contentType(),
      bodyChunks: chunked(
        buildBody({
          metadata: { originalName: "a.tif", sha256: firstSha, byteSize: 10 },
          fileBytes: first,
        }),
      ),
    });
    assert.equal(firstResult.status, 201);

    const second = Buffer.from("123456"); // 6 bytes; 10 + 6 > 15
    const secondSha = createHash("sha256").update(second).digest("hex");
    await assert.rejects(
      service.receiveUpload({
        tenantId,
        userId: randomUUID(),
        contentType: contentType(),
        bodyChunks: chunked(
          buildBody({
            metadata: { originalName: "b.tif", sha256: secondSha, byteSize: 6 },
            fileBytes: second,
          }),
        ),
      }),
      (error) => {
        assert.ok(error instanceof UploadResourceError);
        assert.equal(error.code, "storage_quota_reached");
        return true;
      },
    );
    assert.equal(await captureFileExists(tenantId, secondSha), false);
    await service.close();
  });
});

test("receiveUpload isolates two tenants: same bytes, two captures, two files", async () => {
  await withService(async ({ driver }) => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    await seedTenant(driver, tenantA);
    await seedTenant(driver, tenantB);
    const service = await createUploadResourceService({
      driver,
      capabilities: unlimitedCapabilities,
      now: () => initialTime,
    });
    const fileBytes = Buffer.from("shared bytes across two tenants");
    const sha256 = createHash("sha256").update(fileBytes).digest("hex");
    const body = () =>
      buildBody({
        metadata: {
          originalName: "shared.tif",
          sha256,
          byteSize: fileBytes.length,
        },
        fileBytes,
      });

    const resultA = await service.receiveUpload({
      tenantId: tenantA,
      userId: randomUUID(),
      contentType: contentType(),
      bodyChunks: chunked(body()),
    });
    const resultB = await service.receiveUpload({
      tenantId: tenantB,
      userId: randomUUID(),
      contentType: contentType(),
      bodyChunks: chunked(body()),
    });
    assert.equal(resultA.status, 201);
    assert.equal(resultB.status, 201);
    assert.notEqual(resultA.body.capture.id, resultB.body.capture.id);
    assert.equal(await captureFileExists(tenantA, sha256), true);
    assert.equal(await captureFileExists(tenantB, sha256), true);

    const listA = await service.listCaptures({ tenantId: tenantA });
    const listB = await service.listCaptures({ tenantId: tenantB });
    assert.equal(listA.captures.length, 1);
    assert.equal(listB.captures.length, 1);
    assert.notEqual(listA.captures[0].id, listB.captures[0].id);
    await service.close();
  });
});

test("receiveUpload rejects an unknown plan or target before reading the file", async () => {
  await withService(async ({ driver }) => {
    const tenantId = randomUUID();
    await seedTenant(driver, tenantId);
    const service = await createUploadResourceService({
      driver,
      capabilities: unlimitedCapabilities,
      now: () => initialTime,
    });
    const fileBytes = Buffer.from("bytes");
    const sha256 = createHash("sha256").update(fileBytes).digest("hex");

    await assert.rejects(
      service.receiveUpload({
        tenantId,
        userId: randomUUID(),
        contentType: contentType(),
        bodyChunks: chunked(
          buildBody({
            metadata: {
              originalName: "x.tif",
              sha256,
              byteSize: fileBytes.length,
              planId: randomUUID(),
            },
            fileBytes,
          }),
        ),
      }),
      (error) => {
        assert.ok(error instanceof UploadResourceError);
        assert.equal(error.code, "plan_not_found");
        return true;
      },
    );
    assert.equal(await captureFileExists(tenantId, sha256), false);

    await assert.rejects(
      service.receiveUpload({
        tenantId,
        userId: randomUUID(),
        contentType: contentType(),
        bodyChunks: chunked(
          buildBody({
            metadata: {
              originalName: "x.tif",
              sha256,
              byteSize: fileBytes.length,
              targetIds: ["does-not-exist"],
            },
            fileBytes,
          }),
        ),
      }),
      (error) => {
        assert.ok(error instanceof UploadResourceError);
        assert.equal(error.code, "target_not_found");
        return true;
      },
    );
    assert.equal(await captureFileExists(tenantId, sha256), false);
    await service.close();
  });
});
