import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// The media routes stream a capture's file from the capture store
// (`capturedFileResponse`): its headers, `304`, and one byte range — what the
// owner's download (`?download=1`) relies on to resume.

const directory = await mkdtemp(join(tmpdir(), "astro-captured-file-"));
process.env.ASTRO_PORTAL_CAPTURES_DIR = directory;
const { capturedFileResponse } = await import("../dist/lib/media.server.js");
const { captureStore } = await import("portal/uploads/capture-store.js");
const { attachmentDisposition, userFileHeaders } =
  await import("portal/uploads/media-type.js");

test.after(() => rm(directory, { recursive: true, force: true }));

const tenantId = "space-camille";
const tiff = Buffer.concat([
  Buffer.from([0x49, 0x49, 0x2a, 0x00]),
  Buffer.from(" NGC 7000 · Col des Étoiles"),
]);
const sha256 = createHash("sha256").update(tiff).digest("hex");
const reference = { tenantId, sha256, file: "original" };
const request = (headers = {}) =>
  new Request("http://127.0.0.1:9304/media", { headers });

async function stored() {
  const store = captureStore({});
  if (!(await store.stat(reference))) {
    const sink = store.sink({ tenantId, sha256, maxBytes: 1024 });
    await sink.write(tiff);
    await sink.finish();
  }
  const headers = userFileHeaders({
    head: await store.head(reference),
    fileName: "NGC 7000.tiff",
    imageCacheControl: "private, no-store",
  });
  headers["Content-Disposition"] = attachmentDisposition("NGC 7000.tiff");
  return headers;
}

test("the whole file: its type from its bytes, the attachment, the length, ranges announced", async () => {
  const response = await capturedFileResponse(
    reference,
    await stored(),
    request(),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/tiff");
  assert.equal(
    response.headers.get("content-disposition"),
    `attachment; filename="NGC 7000.tiff"; filename*=UTF-8''NGC%207000.tiff`,
  );
  assert.equal(response.headers.get("content-length"), String(tiff.length));
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(
    response.headers.get("content-security-policy"),
    "default-src 'none'; sandbox",
  );
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), tiff);
});

test("one byte range: 206 with its Content-Range; past the end: 416; several ranges: the whole file", async () => {
  const headers = await stored();
  const part = await capturedFileResponse(
    reference,
    headers,
    request({ range: "bytes=4-9" }),
  );
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("content-range"), `bytes 4-9/${tiff.length}`);
  assert.equal(part.headers.get("content-length"), "6");
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), tiff.subarray(4, 10));
  const suffix = await capturedFileResponse(
    reference,
    headers,
    request({ range: "bytes=-3" }),
  );
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), tiff.subarray(-3));
  const past = await capturedFileResponse(
    reference,
    headers,
    request({ range: `bytes=${tiff.length}-` }),
  );
  assert.equal(past.status, 416);
  assert.equal(past.headers.get("content-range"), `bytes */${tiff.length}`);
  const several = await capturedFileResponse(
    reference,
    headers,
    request({ range: "bytes=0-1,4-5" }),
  );
  assert.equal(several.status, 200);
});

test("If-Modified-Since: 304 without a body; an absent file: 404 with the security headers", async () => {
  const headers = await stored();
  const first = await capturedFileResponse(reference, headers, request());
  const again = await capturedFileResponse(
    reference,
    headers,
    request({ "if-modified-since": first.headers.get("last-modified") }),
  );
  assert.equal(again.status, 304);
  const absent = await capturedFileResponse(
    { tenantId, sha256, file: "thumbnail" },
    headers,
    request(),
  );
  assert.equal(absent.status, 404);
  assert.equal(absent.headers.get("x-content-type-options"), "nosniff");
});
