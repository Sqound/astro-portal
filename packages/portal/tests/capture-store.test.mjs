import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  capturePathFor,
  sharedCopyPathFor,
  thumbnailPathFor,
  uploadPartPathFor,
} from "../dist/uploads/capture-storage.js";
import {
  captureStore,
  captureStoreKind,
  captureStoreProblems,
  clearCaptureStores,
  registerCaptureStore,
} from "../dist/uploads/capture-store.js";

// The storage seam and the disk store (four gestures: write a
// chunk, finalize, read, remove), on a temporary captures directory.

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const tenantId = "space-camille";

async function withCapturesDir(fn) {
  const directory = await mkdtemp(join(tmpdir(), "astro-capture-store-"));
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

const textOf = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

test("the seam answers the disk store by default and names an unknown kind as a startup problem", () => {
  clearCaptureStores();
  assert.equal(captureStoreKind({}), "disk");
  assert.equal(captureStore({}).kind, "disk");
  assert.deepEqual(captureStoreProblems({}), []);
  const unknown = { ASTRO_PORTAL_CAPTURE_STORE: "object-store" };
  assert.match(captureStoreProblems(unknown)[0], /object-store/);
  assert.throws(() => captureStore(unknown), /not a capture store/);
  assert.throws(
    () => registerCaptureStore("disk", { create: () => ({}) }),
    /core's own/,
  );
});

test("a registered kind is built once per key and says its own problems", () => {
  clearCaptureStores();
  let built = 0;
  registerCaptureStore("memory", {
    create: (env) => ({ kind: "memory", built: ++built, name: env.NAME }),
    key: (env) => env.NAME,
    problems: (env) => (env.NAME ? [] : ["NAME is required"]),
  });
  try {
    const env = { ASTRO_PORTAL_CAPTURE_STORE: "Memory", NAME: "a" };
    assert.equal(captureStore(env).built, 1);
    assert.equal(captureStore(env).built, 1);
    assert.equal(captureStore({ ...env, NAME: "b" }).built, 2);
    assert.deepEqual(
      captureStoreProblems({ ASTRO_PORTAL_CAPTURE_STORE: "memory" }),
      ["NAME is required"],
    );
  } finally {
    clearCaptureStores();
  }
});

test("disk store, gestures 1 and 2: chunks written at their offset, then finalized into the content-addressed tree", async () => {
  await withCapturesDir(async () => {
    const store = captureStore({});
    const bytes = Buffer.from("M31 · Col des Étoiles · 45° N 30° O");
    const sha256 = digest(bytes);
    const upload = { tenantId, uploadId: randomUUID() };
    assert.equal(await store.stagedBytes(upload), 0);
    assert.equal(await store.write(upload, bytes.subarray(0, 10), 0), 10);
    await assert.rejects(
      store.write(upload, bytes.subarray(10), 4),
      (error) => error.code === "upload_offset_mismatch" && error.offset === 10,
    );
    await store.write(upload, bytes.subarray(10), 10);
    assert.equal(await store.stagedBytes(upload), bytes.length);
    assert.equal(
      store.stagedPathOf(upload),
      uploadPartPathFor(tenantId, upload.uploadId),
    );
    assert.deepEqual(await store.stagedDigest(upload), {
      sha256,
      byteSize: bytes.length,
    });
    assert.deepEqual(await store.stagedHead(upload, 3), bytes.subarray(0, 3));
    await assert.rejects(
      store.finalize({ ...upload, sha256, byteSize: bytes.length + 1 }),
      (error) => error.code === "checksum_mismatch",
    );
    const published = await store.finalize({
      ...upload,
      sha256,
      byteSize: bytes.length,
    });
    assert.equal(published.path, capturePathFor(tenantId, sha256));
    assert.deepEqual(await readFile(published.path), bytes);
    assert.equal(await store.stagedBytes(upload), 0);
    // Finalizing again: the bytes are published, nothing to do.
    assert.equal(
      (await store.finalize({ ...upload, sha256, byteSize: bytes.length }))
        .byteSize,
      bytes.length,
    );
  });
});

test("disk store, gesture 3: a range read, the head, a path on this machine; an absent file is null", async () => {
  await withCapturesDir(async () => {
    const store = captureStore({});
    const bytes = Buffer.from("0123456789abcdef");
    const sha256 = digest(bytes);
    const sink = store.sink({ tenantId, sha256, maxBytes: 100 });
    await sink.write(bytes);
    await sink.finish();
    const original = { tenantId, sha256, file: "original" };
    assert.equal((await store.stat(original)).size, bytes.length);
    const range = await store.read(original, { start: 4, end: 7 });
    assert.equal(range.size, bytes.length);
    assert.equal(await textOf(range.stream), "4567");
    assert.equal(
      await textOf((await store.read(original)).stream),
      "0123456789abcdef",
    );
    assert.deepEqual(await store.head(original, 2), Buffer.from("01"));
    assert.equal(
      await store.withLocalFile(original, (path) => path),
      capturePathFor(tenantId, sha256),
    );
    const thumbnail = { tenantId, sha256, file: "thumbnail" };
    assert.equal(await store.stat(thumbnail), null);
    assert.equal(await store.read(thumbnail), null);
    assert.equal(await store.head(thumbnail), null);
  });
});

test("disk store, gesture 4: derived files put beside the original, removed alone or with it, then the space", async () => {
  await withCapturesDir(async () => {
    const store = captureStore({});
    const bytes = Buffer.from("NGC 7000");
    const sha256 = digest(bytes);
    const sink = store.sink({ tenantId, sha256, maxBytes: 100 });
    await sink.write(bytes);
    await sink.finish();
    for (const file of ["thumbnail", "shared"])
      await store.put({ tenantId, sha256, file }, (temporary) =>
        writeFile(temporary, file),
      );
    assert.equal(
      await readFile(thumbnailPathFor(tenantId, sha256), "utf8"),
      "thumbnail",
    );
    assert.equal(
      await readFile(sharedCopyPathFor(tenantId, sha256), "utf8"),
      "shared",
    );
    await store.remove({ tenantId, sha256, file: "derived" });
    assert.equal(await store.stat({ tenantId, sha256, file: "shared" }), null);
    assert.ok(await store.stat({ tenantId, sha256, file: "original" }));
    await store.remove({ tenantId, sha256 });
    assert.equal(
      await store.stat({ tenantId, sha256, file: "original" }),
      null,
    );
    assert.equal(await store.spaceHolds(tenantId), true);
    await store.removeSpace(tenantId);
    assert.equal(await store.spaceHolds(tenantId), false);
    assert.throws(() => store.pathOf({ tenantId: "../x", sha256 }), /tenant/);
  });
});
