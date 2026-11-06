import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

/**
 * Content-coding for JSON documents a route builds and memoizes itself —
 * the catalogue index pages (`GET /v1/target-index`): left uncompressed they
 * weigh several times what gzip makes of them. Next's own compression does not
 * apply to these responses behind `server.mjs`, so the route negotiates
 * `Accept-Encoding` itself.
 *
 * Pack FILES are deliberately not concerned: they keep `no-transform` and
 * their byte ranges (`packages/portal/src/offline-pack/file-response.js`).
 *
 * A strong `ETag` names one representation (RFC 9110 §8.8.3), so each coding
 * carries its own — the identity tag with `-gzip` or `-br` inside the quotes
 * — and `If-None-Match` is compared against all of them: the document behind
 * every representation is the same, so whichever one a client kept is still
 * current.
 */

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

const codings = ["br", "gzip"];

/** The coding to answer [acceptEncoding] with: `br`, `gzip` or `null`
 * (identity) — the highest weight wins, `br` on a tie. */
export function preferredContentCoding(acceptEncoding) {
  if (!acceptEncoding) return null;
  const weights = new Map();
  for (const part of String(acceptEncoding).split(",")) {
    const [name, ...parameters] = part.trim().toLowerCase().split(";");
    if (!name) continue;
    let weight = 1;
    for (const parameter of parameters) {
      const [key, value] = parameter.trim().split("=");
      if (key === "q") weight = Number(value);
    }
    if (!Number.isFinite(weight)) weight = 0;
    weights.set(name === "x-gzip" ? "gzip" : name, weight);
  }
  const weightOf = (name) =>
    weights.has(name) ? weights.get(name) : (weights.get("*") ?? 0);
  let best = null;
  for (const coding of codings) {
    const weight = weightOf(coding);
    if (weight > 0 && (best === null || weight > weightOf(best))) best = coding;
  }
  return best;
}

/** The `ETag` of [etag]'s representation in [coding]. */
export function codedEtag(etag, coding) {
  if (!coding) return etag;
  return etag.endsWith('"') ? `${etag.slice(0, -1)}-${coding}"` : etag;
}

/** Whether [ifNoneMatch] names any representation of the document whose
 * identity `ETag` is [etag] (weak comparison, RFC 9110 §13.1.2). */
export function etagMatchesAnyCoding(ifNoneMatch, etag) {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === "*") return true;
  const known = new Set([
    etag,
    ...codings.map((coding) => codedEtag(etag, coding)),
  ]);
  return ifNoneMatch
    .split(",")
    .map((tag) => tag.trim().replace(/^W\//, ""))
    .some((tag) => known.has(tag));
}

/** Above this many characters an uncompressed body is sent in pieces. */
export const streamedBodyMinimumCharacters = 1024 * 1024;
const streamedBodyPieceCharacters = 256 * 1024;

/**
 * A response built from a string copies it to bytes whole, once per request.
 * A knowledge bundle is tens of MB, and a client downloading its pack asks
 * for several at once: the copies would weigh as much as the bundles
 * themselves. A large body is
 * therefore encoded piece by piece as the connection takes it. A piece never
 * ends between the two halves of a surrogate pair, which would encode as two
 * replacement characters.
 */
export function identityBody(
  json,
  {
    minimum = streamedBodyMinimumCharacters,
    piece = streamedBodyPieceCharacters,
  } = {},
) {
  if (json.length < minimum) return json;
  const encoder = new TextEncoder();
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= json.length) {
        controller.close();
        return;
      }
      let end = Math.min(json.length, offset + piece);
      const last = json.charCodeAt(end - 1);
      if (end < json.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
      controller.enqueue(encoder.encode(json.slice(offset, end)));
      offset = end;
    },
  });
}

const encodings = new WeakMap();

/** [document]'s JSON in [coding], compressed once per memoized document (on
 * the thread pool, never on the event loop). */
export function encodedDocument(document, coding) {
  let byCoding = encodings.get(document);
  if (!byCoding) {
    byCoding = new Map();
    encodings.set(document, byCoding);
  }
  let encoded = byCoding.get(coding);
  if (!encoded) {
    const bytes = Buffer.from(document.json, "utf8");
    encoded =
      coding === "br"
        ? brotliAsync(bytes, {
            params: {
              [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
              [constants.BROTLI_PARAM_QUALITY]: 8,
              [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
            },
          })
        : gzipAsync(bytes);
    byCoding.set(coding, encoded);
    encoded.catch(() => byCoding.delete(coding));
  }
  return encoded;
}

/**
 * The response for a memoized JSON [document] (`{ json, etag }`), negotiated
 * against [request]'s `Accept-Encoding`, `304` when `If-None-Match` names any
 * of its representations. [headers] are the route's own (`Cache-Control`).
 */
export async function negotiatedJsonResponse(request, document, headers) {
  const coding = preferredContentCoding(request.headers.get("accept-encoding"));
  const etag = codedEtag(document.etag, coding);
  const common = { ...headers, ETag: etag, Vary: "Accept-Encoding" };
  if (etagMatchesAnyCoding(request.headers.get("if-none-match"), document.etag))
    return new Response(null, { status: 304, headers: common });
  if (!coding)
    return new Response(identityBody(document.json), {
      status: 200,
      headers: {
        ...common,
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(document.json)),
      },
    });
  const body = await encodedDocument(document, coding);
  return new Response(body, {
    status: 200,
    headers: {
      ...common,
      "Content-Type": "application/json",
      "Content-Encoding": coding,
      "Content-Length": String(body.length),
    },
  });
}
