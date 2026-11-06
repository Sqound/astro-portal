/**
 * A minimal, dependency-free streaming multipart/form-data reader for
 * `POST /v1/uploads`. No multipart-parsing library is a dependency of
 * this repository, and the requirement is specific enough (exactly two
 * named parts, `metadata` then `file`) that hand-rolling a small,
 * memory-bounded parser is simpler than adopting a general one.
 *
 * The file part is never buffered whole: bytes are handed to the caller as
 * they arrive, and only the last `boundary.length`-ish bytes are ever held
 * in memory while scanning for the next delimiter. This is what lets the
 * route hash and count a multi-hundred-megabyte file without loading it.
 */

const CRLFCRLF = Buffer.from("\r\n\r\n", "latin1");

export class MultipartError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MultipartError";
    this.code = code;
  }
}

function toBuffer(chunk) {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
}

export function multipartBoundary(contentType) {
  const match = /boundary=(?:"([^"]*)"|([^;]+))/i.exec(
    String(contentType || ""),
  );
  if (!match) return null;
  const boundary = (match[1] ?? match[2] ?? "").trim();
  return boundary || null;
}

/**
 * Reads from `iterator` (an async iterator over Buffer/Uint8Array chunks)
 * until `delimiter` appears in the accumulated bytes. Calls `onData(chunk)`
 * for every span of bytes confirmed NOT to be part of the delimiter, so at
 * most `delimiter.length - 1` bytes are ever held back waiting for more
 * input — the only bound on memory beyond that is whatever `onData` itself
 * retains. Returns the bytes immediately following the delimiter that were
 * already available.
 */
async function scanUntilDelimiter(iterator, carryIn, delimiter, onData) {
  let held = carryIn;
  for (;;) {
    const index = held.indexOf(delimiter);
    if (index !== -1) {
      if (index > 0) await onData(held.subarray(0, index));
      return held.subarray(index + delimiter.length);
    }
    const safe = held.length - (delimiter.length - 1);
    if (safe > 0) {
      await onData(held.subarray(0, safe));
      held = held.subarray(safe);
    }
    const { value, done } = await iterator.next();
    if (done)
      throw new MultipartError(
        "invalid_request",
        "The multipart body ended before its closing boundary.",
      );
    const next = toBuffer(value);
    held = held.length ? Buffer.concat([held, next]) : next;
  }
}

/** Ensures at least `n` bytes are buffered, reading more if there are not. */
async function ensureBuffered(iterator, held, n) {
  let buffer = held;
  while (buffer.length < n) {
    const { value, done } = await iterator.next();
    if (done)
      throw new MultipartError(
        "invalid_request",
        "The multipart body ended unexpectedly.",
      );
    const next = toBuffer(value);
    buffer = buffer.length ? Buffer.concat([buffer, next]) : next;
  }
  return buffer;
}

function parseContentDisposition(value) {
  const result = { name: null, filename: null };
  for (const segment of String(value || "")
    .split(";")
    .slice(1)) {
    const eq = segment.indexOf("=");
    if (eq === -1) continue;
    const key = segment.slice(0, eq).trim().toLowerCase();
    let raw = segment.slice(eq + 1).trim();
    if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
    raw = raw.replace(/\\(.)/g, "$1");
    if (key === "name") result.name = raw;
    if (key === "filename") result.filename = raw;
  }
  return result;
}

function parseHeaderBlock(block) {
  const headers = {};
  for (const line of block.toString("latin1").split("\r\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    headers[line.slice(0, colon).trim().toLowerCase()] = line
      .slice(colon + 1)
      .trim();
  }
  const disposition = parseContentDisposition(headers["content-disposition"]);
  return {
    name: disposition.name,
    filename: disposition.filename,
    contentType: headers["content-type"] || null,
  };
}

async function readPartHeaders(iterator, carry, maxHeaderBytes) {
  const chunks = [];
  let total = 0;
  const nextCarry = await scanUntilDelimiter(
    iterator,
    carry,
    CRLFCRLF,
    (chunk) => {
      total += chunk.length;
      if (total > maxHeaderBytes)
        throw new MultipartError(
          "invalid_request",
          "A multipart part's headers exceed the allowed size.",
        );
      chunks.push(Buffer.from(chunk));
    },
  );
  return {
    headers: parseHeaderBlock(Buffer.concat(chunks)),
    carry: nextCarry,
  };
}

/** The two bytes right after a boundary marker: "--" (final) or "\r\n" (more parts). */
async function readBoundaryContinuation(iterator, carry) {
  const buffered = await ensureBuffered(iterator, carry, 2);
  const marker = buffered.subarray(0, 2).toString("latin1");
  return { final: marker === "--", carry: buffered.subarray(2) };
}

/**
 * Drives the exact two-part protocol api/v1.md describes for
 * `POST /v1/uploads`: a `metadata` JSON part, then a `file` part — no more,
 * no fewer, `metadata` first. This is a hard structural cap on the number of
 * multipart parts (exactly two, by name and order), not a configurable
 * limit that a crafted request could raise.
 *
 * `onMetadata(jsonText)` is awaited to completion before the `file` part is
 * read at all, so a caller can refuse an oversized or unentitled upload
 * (quota, size, plan/target validation) purely from the metadata, before a
 * single byte of the image is read or any file touches disk. `onFileChunk`
 * is called with each streamed chunk of the file part's bytes, in order,
 * never the whole file at once.
 */
export async function readTwoPartUpload(
  bodyChunks,
  contentType,
  { maxMetadataBytes = 65536, maxHeaderBytes = 16384, onMetadata, onFileChunk },
) {
  const boundary = multipartBoundary(contentType);
  if (!boundary)
    throw new MultipartError(
      "invalid_request",
      "A multipart/form-data Content-Type with a boundary is required.",
    );
  const iterator = bodyChunks[Symbol.asyncIterator]
    ? bodyChunks[Symbol.asyncIterator]()
    : bodyChunks;
  const openingDelimiter = Buffer.from(`--${boundary}`, "latin1");
  const innerDelimiter = Buffer.from(`\r\n--${boundary}`, "latin1");

  // Preamble, up to and including the first boundary line. Anything before
  // it is discarded per RFC 2046; a well-formed client sends none.
  let carry = await scanUntilDelimiter(
    iterator,
    Buffer.alloc(0),
    openingDelimiter,
    () => {},
  );
  let continuation = await readBoundaryContinuation(iterator, carry);
  if (continuation.final)
    throw new MultipartError("invalid_request", "The multipart body is empty.");
  carry = continuation.carry;

  const metadataPart = await readPartHeaders(iterator, carry, maxHeaderBytes);
  if (metadataPart.headers.name !== "metadata")
    throw new MultipartError(
      "invalid_request",
      'The first multipart part must be named "metadata".',
    );
  const metadataChunks = [];
  let metadataBytes = 0;
  carry = await scanUntilDelimiter(
    iterator,
    metadataPart.carry,
    innerDelimiter,
    (chunk) => {
      metadataBytes += chunk.length;
      if (metadataBytes > maxMetadataBytes)
        throw new MultipartError(
          "invalid_request",
          "The metadata part exceeds the allowed size.",
        );
      metadataChunks.push(Buffer.from(chunk));
    },
  );
  await onMetadata(Buffer.concat(metadataChunks).toString("utf8"));

  continuation = await readBoundaryContinuation(iterator, carry);
  if (continuation.final)
    throw new MultipartError(
      "invalid_request",
      'A "file" part is required after "metadata".',
    );
  carry = continuation.carry;

  const filePart = await readPartHeaders(iterator, carry, maxHeaderBytes);
  if (filePart.headers.name !== "file")
    throw new MultipartError(
      "invalid_request",
      'The second multipart part must be named "file".',
    );
  carry = await scanUntilDelimiter(
    iterator,
    filePart.carry,
    innerDelimiter,
    onFileChunk,
  );

  continuation = await readBoundaryContinuation(iterator, carry);
  if (!continuation.final)
    throw new MultipartError(
      "invalid_request",
      "The multipart body carries more than the two parts this route accepts.",
    );

  return {
    originalFilename: filePart.headers.filename,
    fileContentType: filePart.headers.contentType,
  };
}
