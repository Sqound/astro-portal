import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

/**
 * The HTTP response for one offline-pack file — the sky-quality raster and
 * its manifest, a sky-backdrop tile or archive — shared by
 * `GET /v1/offline-pack/sky-quality/{file}` and `GET /v1/sky-tiles/...`.
 *
 * A plain Next route answers a `Range: bytes=1000-1999` request `200` with
 * the whole body — a phone that lost its
 * connection half-way could never resume, it could only start over — and
 * nothing kept Next's own compression (or any intermediary) away from bytes
 * whose size and digest the manifest already states. So, for every pack
 * file:
 *
 * - `Accept-Ranges: bytes`, and one byte range is honoured: `206` with
 *   `Content-Range`, or `416` with `Content-Range: bytes *\/<size>` when it
 *   starts past the end (a partial file left by an older revision). Several
 *   ranges, a malformed header, or an `If-Range` naming another version get
 *   the whole file (RFC 9110 §14.2, §13.1.5) — always something usable.
 * - A range always addresses the **uncompressed** file — the bytes the
 *   manifest's `bytes`/`checksum` describe and a client's partial file holds
 *   (a client decodes gzip as it downloads) — so a `206` is never encoded.
 *   Only a whole-file answer may use `gzip` (the precomputed raster
 *   `.gz`), when the client accepts it.
 * - `Cache-Control: no-transform`: Next's compression middleware skips a
 *   response carrying it, and so must any proxy — a transformed body would
 *   carry a `Content-Length` and ranges the manifest never described.
 *
 * [body] is either `{ path, size }` (streamed from disk), `{ open, size }`
 * (`open(start, end)` resolves to a readable stream of that inclusive range, read from the
 * capture store when the answer is consumed) or `{ bytes }` (a small file already in
 * memory). [gzip], when given, is `{ path, size }` of a precomputed gzip variant of the
 * same bytes.
 */
export function packFileResponse(
  request,
  { body, etag, contentType, cacheControl, gzip = null },
) {
  const size = body.bytes ? body.bytes.length : body.size;
  const headers = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": withNoTransform(cacheControl),
    ETag: etag,
  };
  if (gzip) headers.Vary = "Accept-Encoding";

  const rangeHeader = request.headers.get("range");
  if (rangeHeader && ifRangeMatches(request, etag)) {
    const range = parseByteRange(rangeHeader, size);
    if (range === unsatisfiable)
      return new Response(null, {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${size}` },
      });
    if (range)
      return new Response(slice(body, range.start, range.end), {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
          "Content-Length": String(range.end - range.start + 1),
        },
      });
  }

  // A caching proxy in front of the download host (`x-astro-download-proxy`)
  // keeps one copy and answers ranges from it: it must hold the identity
  // bytes, and a proxy may rewrite the Accept-Encoding of its requests.
  if (
    gzip &&
    clientAcceptsGzip(request) &&
    !request.headers.get("x-astro-download-proxy")
  )
    return new Response(Readable.toWeb(createReadStream(gzip.path)), {
      status: 200,
      headers: {
        ...headers,
        "Content-Encoding": "gzip",
        "Content-Length": String(gzip.size),
      },
    });
  return new Response(slice(body, 0, size - 1), {
    status: 200,
    headers: { ...headers, "Content-Length": String(size) },
  });
}

const unsatisfiable = Symbol("unsatisfiable");
/** What `parseByteRange` answers for a range past the end (`416`). */
export const RANGE_UNSATISFIABLE = unsatisfiable;

/**
 * One `bytes=<first>-<last>`, `bytes=<first>-` or `bytes=-<suffix>` range
 * resolved against [size]: `{ start, end }` (inclusive), `unsatisfiable`,
 * or `null` for anything to ignore (absent, malformed, several ranges, an
 * inverted range).
 */
export function parseByteRange(header, size) {
  if (typeof header !== "string") return null;
  const match = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (!match) return null;
  const [, first, last] = match;
  if (first === "" && last === "") return null;
  if (first === "") {
    const suffix = Number(last);
    if (suffix === 0 || size === 0) return unsatisfiable;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(first);
  if (start >= size) return unsatisfiable;
  const end = last === "" ? size - 1 : Math.min(Number(last), size - 1);
  if (end < start) return null;
  return { start, end };
}

function ifRangeMatches(request, etag) {
  const ifRange = request.headers.get("if-range");
  // A date, a weak validator or another version: the whole file.
  return !ifRange || ifRange.trim() === etag;
}

function withNoTransform(cacheControl) {
  if (!cacheControl) return "no-transform";
  return /\bno-transform\b/i.test(cacheControl)
    ? cacheControl
    : `${cacheControl}, no-transform`;
}

function slice(body, start, end) {
  if (body.bytes) return body.bytes.subarray(start, end + 1);
  if (end < start) return null;
  if (body.open) return openedLater(() => body.open(start, end));
  return Readable.toWeb(createReadStream(body.path, { start, end }));
}

/** Gzip negotiation only, no other coding: a bare "gzip" or
 * "gzip;q=<nonzero>" accepts it, "gzip;q=0" and everything else does not. */
export function clientAcceptsGzip(request) {
  const header = request.headers.get("accept-encoding");
  if (!header) return false;
  return header.split(",").some((entry) => {
    const [coding, ...params] = entry.trim().split(";");
    if (coding.trim().toLowerCase() !== "gzip") return false;
    const qParam = params
      .map((param) => param.trim())
      .find((param) => param.startsWith("q="));
    if (!qParam) return true;
    const quality = Number(qParam.slice(2));
    return !(Number.isFinite(quality) && quality === 0);
  });
}

/**
 * A web stream whose source is opened at its first read (`open()` resolves
 * to a Node readable stream): the answer is built at once, the store is
 * read only when the body is.
 */
function openedLater(open) {
  let reader = null;
  return new ReadableStream({
    async pull(controller) {
      reader ||= Readable.toWeb(await open()).getReader();
      const { value, done } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader?.cancel(reason);
    },
  });
}
