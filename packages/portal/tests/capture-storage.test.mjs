import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CaptureStorageError,
  capturePathFor,
  capturesDirectory,
  captureFileExists,
  createCaptureSink,
} from "../dist/uploads/capture-storage.js";

async function withCapturesDir(fn) {
  const directory = await mkdtemp(join(tmpdir(), "astro-captures-"));
  const previous = process.env.ASTRO_PORTAL_CAPTURES_DIR;
  process.env.ASTRO_PORTAL_CAPTURES_DIR = directory;
  try {
    await fn(directory);
  } finally {
    if (previous === undefined) delete process.env.ASTRO_PORTAL_CAPTURES_DIR;
    else process.env.ASTRO_PORTAL_CAPTURES_DIR = previous;
    await rm(directory, { force: true, recursive: true });
  }
}

test("capturesDirectory honors ASTRO_PORTAL_CAPTURES_DIR", async () => {
  await withCapturesDir(async (directory) => {
    assert.equal(capturesDirectory(), directory);
  });
});

test("capturePathFor is content-addressed and never touches the original name", async () => {
  await withCapturesDir((directory) => {
    const sha256 =
      "3b1f0d6c9a8e4725d0c1b2a39f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c";
    const path = capturePathFor("tenant-1", sha256);
    assert.equal(path, join(directory, "tenant-1", "3b", "1f", sha256));
  });
});

test("capturePathFor rejects a malformed sha256 or tenant id", async () => {
  await withCapturesDir(() => {
    assert.throws(() => capturePathFor("tenant-1", "not-a-digest"));
    assert.throws(() => capturePathFor("../escape", "a".repeat(64)));
  });
});

async function collect(sink, chunks) {
  for (const chunk of chunks) await sink.write(chunk);
  return sink.finish();
}

test("createCaptureSink writes atomically via a .part sibling and no other file", async () => {
  await withCapturesDir(async (directory) => {
    const bytes = Buffer.from("the quick brown fox jumps over the lazy dog");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const tenantId = randomUUID();
    const sink = createCaptureSink({
      tenantId,
      declaredSha256: sha256,
      maxBytes: 1024,
    });
    const result = await collect(sink, [
      bytes.subarray(0, 10),
      bytes.subarray(10),
    ]);
    assert.equal(result.sha256, sha256);
    assert.equal(result.byteSize, bytes.length);
    assert.equal(await captureFileExists(tenantId, sha256), true);
    assert.deepEqual(await readFile(result.path), bytes);

    // No .part or other stray file left behind next to the final one.
    const siblingDir = join(
      directory,
      tenantId,
      sha256.slice(0, 2),
      sha256.slice(2, 4),
    );
    assert.deepEqual(await readdir(siblingDir), [sha256]);
  });
});

test("createCaptureSink never creates a directory or file before the first write", async () => {
  await withCapturesDir(async (directory) => {
    createCaptureSink({
      tenantId: randomUUID(),
      declaredSha256: "a".repeat(64),
      maxBytes: 10,
    });
    // Give any accidental async work a turn before asserting nothing exists.
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(await readdir(directory), []);
  });
});

test("createCaptureSink aborts and cleans up past maxBytes without ever writing the final path", async () => {
  await withCapturesDir(async (directory) => {
    const tenantId = randomUUID();
    const declaredSha256 = "a".repeat(64);
    const sink = createCaptureSink({ tenantId, declaredSha256, maxBytes: 5 });
    await sink.write(Buffer.from("12345"));
    await assert.rejects(sink.write(Buffer.from("6")), (error) => {
      assert.ok(error instanceof CaptureStorageError);
      assert.equal(error.code, "file_too_large");
      return true;
    });
    assert.equal(await captureFileExists(tenantId, declaredSha256), false);
    let entries;
    try {
      entries = await readdir(join(directory, tenantId), { recursive: true });
    } catch {
      entries = []; // the directory may not even have been created
    }
    // The fan-out directories may remain (harmless, empty), but no ".part"
    // leftover and no file at the final content-addressed path.
    assert.deepEqual(
      entries.filter(
        (entry) => entry.includes(".") || entry === declaredSha256,
      ),
      [],
    );
  });
});

test("createCaptureSink abort never leaves a .part behind, even with the file open still in flight", async () => {
  await withCapturesDir(async (directory) => {
    const tenantId = randomUUID();
    for (let round = 0; round < 50; round += 1) {
      const sink = createCaptureSink({
        tenantId,
        declaredSha256: "b".repeat(64),
        maxBytes: 1024,
      });
      await sink.write(Buffer.from("x"));
      await sink.abort();
    }
    const entries = await readdir(join(directory, tenantId), {
      recursive: true,
    });
    assert.deepEqual(
      entries.filter((entry) => entry.endsWith(".part")),
      [],
    );
  });
});

test("createCaptureSink rejects on a checksum mismatch and leaves nothing behind", async () => {
  await withCapturesDir(async () => {
    const tenantId = randomUUID();
    const declaredSha256 = "a".repeat(64); // wrong on purpose
    const sink = createCaptureSink({
      tenantId,
      declaredSha256,
      maxBytes: 1024,
    });
    await sink.write(
      Buffer.from("actual bytes that do not hash to a-repeated"),
    );
    await assert.rejects(sink.finish(), (error) => {
      assert.ok(error instanceof CaptureStorageError);
      assert.equal(error.code, "checksum_mismatch");
      return true;
    });
    assert.equal(await captureFileExists(tenantId, declaredSha256), false);
  });
});

test("two concurrent sinks for identical bytes both succeed and leave one file", async () => {
  await withCapturesDir(async () => {
    const bytes = Buffer.from("identical content uploaded twice at once");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const tenantId = randomUUID();
    const [first, second] = await Promise.all([
      collect(
        createCaptureSink({ tenantId, declaredSha256: sha256, maxBytes: 1024 }),
        [bytes],
      ),
      collect(
        createCaptureSink({ tenantId, declaredSha256: sha256, maxBytes: 1024 }),
        [bytes],
      ),
    ]);
    assert.equal(first.path, second.path);
    assert.deepEqual(await readFile(first.path), bytes);
  });
});
