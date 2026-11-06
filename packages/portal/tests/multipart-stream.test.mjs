import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  MultipartError,
  multipartBoundary,
  readTwoPartUpload,
} from "../dist/uploads/multipart-stream.js";

const boundary = "astro-portal-test-boundary-9f2c";

function buildBody({
  metadata,
  fileBytes,
  fileName = "m31.tif",
  fileContentType = "image/tiff",
  extraPart = null,
  omitFilePart = false,
}) {
  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\n`, "latin1"));
  parts.push(
    Buffer.from(
      `Content-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n`,
      "latin1",
    ),
  );
  parts.push(Buffer.from(JSON.stringify(metadata), "utf8"));
  parts.push(Buffer.from(`\r\n--${boundary}\r\n`, "latin1"));
  if (!omitFilePart) {
    parts.push(
      Buffer.from(
        `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${fileContentType}\r\n\r\n`,
        "latin1",
      ),
    );
    parts.push(fileBytes);
    parts.push(Buffer.from(`\r\n--${boundary}`, "latin1"));
  }
  if (extraPart) {
    parts.push(Buffer.from(`\r\n`, "latin1"));
    parts.push(
      Buffer.from(
        `Content-Disposition: form-data; name="${extraPart.name}"\r\n\r\n${extraPart.value}`,
        "latin1",
      ),
    );
    parts.push(Buffer.from(`\r\n--${boundary}`, "latin1"));
  }
  parts.push(Buffer.from("--\r\n", "latin1"));
  return Buffer.concat(parts);
}

/** Feeds a Buffer to the parser in fixed-size chunks, deliberately small
 * enough to routinely split a boundary marker across two reads. */
async function* chunked(buffer, size) {
  for (let offset = 0; offset < buffer.length; offset += size)
    yield buffer.subarray(offset, Math.min(offset + size, buffer.length));
}

async function drive(body, chunkSize) {
  const metadataCalls = [];
  const fileChunks = [];
  const result = await readTwoPartUpload(
    chunked(body, chunkSize),
    `multipart/form-data; boundary=${boundary}`,
    {
      onMetadata: async (text) => {
        metadataCalls.push(text);
      },
      onFileChunk: (chunk) => {
        fileChunks.push(Buffer.from(chunk));
      },
    },
  );
  return {
    metadata: JSON.parse(metadataCalls[0]),
    fileBytes: Buffer.concat(fileChunks),
    ...result,
  };
}

test("multipartBoundary reads quoted and unquoted boundary parameters", () => {
  assert.equal(
    multipartBoundary('multipart/form-data; boundary="abc-123"'),
    "abc-123",
  );
  assert.equal(
    multipartBoundary("multipart/form-data; boundary=abc-123"),
    "abc-123",
  );
  assert.equal(multipartBoundary("application/json"), null);
});

test("readTwoPartUpload reassembles metadata and file bytes across arbitrary chunk sizes", async () => {
  const fileBytes = Buffer.from(
    Array.from({ length: 5000 }, (_, index) => index % 256),
  );
  const body = buildBody({
    metadata: {
      originalName: "m31.tif",
      sha256: "a".repeat(64),
      byteSize: 5000,
    },
    fileBytes,
  });
  // Chunk sizes chosen to land mid-boundary at different offsets, including
  // sizes smaller than the boundary marker itself.
  for (const chunkSize of [1, 2, 3, 7, 16, 64, 4096, body.length]) {
    const result = await drive(body, chunkSize);
    assert.deepEqual(result.metadata, {
      originalName: "m31.tif",
      sha256: "a".repeat(64),
      byteSize: 5000,
    });
    assert.deepEqual(result.fileBytes, fileBytes);
    assert.equal(result.originalFilename, "m31.tif");
    assert.equal(result.fileContentType, "image/tiff");
    assert.equal(
      createHash("sha256").update(result.fileBytes).digest("hex"),
      createHash("sha256").update(fileBytes).digest("hex"),
    );
  }
});

test("readTwoPartUpload accepts an empty file part", async () => {
  const body = buildBody({
    metadata: {
      originalName: "empty.tif",
      sha256: "b".repeat(64),
      byteSize: 0,
    },
    fileBytes: Buffer.alloc(0),
  });
  const result = await drive(body, 32);
  assert.equal(result.fileBytes.length, 0);
});

test("readTwoPartUpload calls onMetadata before ever touching the file part", async () => {
  const fileBytes = Buffer.from("file-bytes");
  const body = buildBody({
    metadata: { originalName: "m31.tif", sha256: "a".repeat(64), byteSize: 10 },
    fileBytes,
  });
  const order = [];
  const fileChunks = [];
  await readTwoPartUpload(
    chunked(body, 8),
    `multipart/form-data; boundary=${boundary}`,
    {
      onMetadata: async (text) => {
        order.push("metadata");
        assert.deepEqual(JSON.parse(text), {
          originalName: "m31.tif",
          sha256: "a".repeat(64),
          byteSize: 10,
        });
        // A capability refusal thrown here must prevent any file-part read.
      },
      onFileChunk: (chunk) => {
        order.push("file");
        fileChunks.push(Buffer.from(chunk));
      },
    },
  );
  assert.equal(order[0], "metadata");
  assert.deepEqual(Buffer.concat(fileChunks), fileBytes);
});

test("readTwoPartUpload refuses before reading the file part when onMetadata throws", async () => {
  const body = buildBody({
    metadata: { originalName: "m31.tif", sha256: "a".repeat(64), byteSize: 10 },
    fileBytes: Buffer.from("file-bytes"),
  });
  let fileChunkSeen = false;
  await assert.rejects(
    readTwoPartUpload(
      chunked(body, 8),
      `multipart/form-data; boundary=${boundary}`,
      {
        onMetadata: async () => {
          throw new Error("storage_quota_reached");
        },
        onFileChunk: () => {
          fileChunkSeen = true;
        },
      },
    ),
    /storage_quota_reached/,
  );
  assert.equal(fileChunkSeen, false);
});

test("readTwoPartUpload rejects a first part that is not named metadata", async () => {
  const body = buildBody({
    metadata: { originalName: "m31.tif", sha256: "a".repeat(64), byteSize: 3 },
    fileBytes: Buffer.from("abc"),
  })
    .toString("latin1")
    .replace('name="metadata"', 'name="notes"');
  await assert.rejects(
    readTwoPartUpload(
      chunked(Buffer.from(body, "latin1"), 16),
      `multipart/form-data; boundary=${boundary}`,
      { onMetadata: async () => {}, onFileChunk: () => {} },
    ),
    (error) => {
      assert.ok(error instanceof MultipartError);
      assert.equal(error.code, "invalid_request");
      return true;
    },
  );
});

test("readTwoPartUpload rejects a missing file part", async () => {
  const body = buildBody({
    metadata: { originalName: "m31.tif", sha256: "a".repeat(64), byteSize: 3 },
    fileBytes: Buffer.alloc(0),
    omitFilePart: true,
  });
  await assert.rejects(
    readTwoPartUpload(
      chunked(body, 16),
      `multipart/form-data; boundary=${boundary}`,
      {
        onMetadata: async () => {},
        onFileChunk: () => {},
      },
    ),
    (error) => {
      assert.ok(error instanceof MultipartError);
      assert.equal(error.code, "invalid_request");
      return true;
    },
  );
});

test("readTwoPartUpload rejects a third part after file", async () => {
  const body = buildBody({
    metadata: { originalName: "m31.tif", sha256: "a".repeat(64), byteSize: 3 },
    fileBytes: Buffer.from("abc"),
    extraPart: { name: "extra", value: "surprise" },
  });
  await assert.rejects(
    readTwoPartUpload(
      chunked(body, 16),
      `multipart/form-data; boundary=${boundary}`,
      {
        onMetadata: async () => {},
        onFileChunk: () => {},
      },
    ),
    (error) => {
      assert.ok(error instanceof MultipartError);
      assert.equal(error.code, "invalid_request");
      return true;
    },
  );
});

test("readTwoPartUpload rejects an oversized metadata part before it ever completes", async () => {
  const body = buildBody({
    metadata: {
      originalName: "m31.tif",
      sha256: "a".repeat(64),
      byteSize: 3,
      note: "x".repeat(200),
    },
    fileBytes: Buffer.from("abc"),
  });
  await assert.rejects(
    readTwoPartUpload(
      chunked(body, 16),
      `multipart/form-data; boundary=${boundary}`,
      {
        maxMetadataBytes: 50,
        onMetadata: async () => {},
        onFileChunk: () => {},
      },
    ),
    (error) => {
      assert.ok(error instanceof MultipartError);
      assert.equal(error.code, "invalid_request");
      return true;
    },
  );
});

test("readTwoPartUpload requires a boundary parameter", async () => {
  await assert.rejects(
    readTwoPartUpload(
      chunked(Buffer.from("irrelevant"), 4),
      "multipart/form-data",
      {
        onMetadata: async () => {},
        onFileChunk: () => {},
      },
    ),
    (error) => {
      assert.ok(error instanceof MultipartError);
      assert.equal(error.code, "invalid_request");
      return true;
    },
  );
});
