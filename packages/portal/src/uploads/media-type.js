/**
 * What a file a person sent is served as. A file's
 * name is whatever its sender typed: it never decides how a browser treats
 * the bytes. Only the file's first bytes do, and only raster image formats
 * recognised by their signature are ever served as images. Everything else
 * — SVG, HTML, XML, text, FITS, XISF, a camera's raw file, anything unknown
 * — is served as `application/octet-stream` and as an attachment, so a
 * browser saves it instead of rendering it on the portal's origin, where a
 * script would run with the session of whoever opened the link.
 *
 * Every answer that serves such a file also carries `nosniff` (the browser
 * never second-guesses the type) and a content policy that forbids every
 * load and sandboxes the document, so even an image opened as a page cannot
 * run anything.
 */

import { open } from "node:fs/promises";

/** How many leading bytes the checks below look at. */
export const MEDIA_HEAD_BYTES = 4096;

/** The headers every answer serving a person's file carries. */
export const USER_FILE_SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
});

const startsWith = (head, bytes, offset = 0) =>
  head.length >= offset + bytes.length &&
  bytes.every((byte, index) => head[offset + index] === byte);

const ascii = (text) => [...text].map((character) => character.charCodeAt(0));

/** The ISO-BMFF `ftyp` brands of an AVIF image (still or sequence). */
function isAvif(head) {
  if (!startsWith(head, ascii("ftyp"), 4)) return false;
  const boxSize = head.readUInt32BE(0);
  const end = Math.min(head.length, boxSize >= 16 ? boxSize : 16);
  for (let offset = 8; offset + 4 <= end; offset += 4) {
    if (offset === 12) continue; // minor version, not a brand
    const brand = head.toString("latin1", offset, offset + 4);
    if (brand === "avif" || brand === "avis") return true;
  }
  return false;
}

/**
 * The raster image type these bytes are, or `null`. JPEG, PNG, WebP, AVIF
 * and TIFF (with BigTIFF) are the image formats the portal shows; GIF is not
 * one of them and is served like any other file.
 */
export function rasterImageTypeOf(head) {
  const bytes = Buffer.isBuffer(head) ? head : Buffer.from(head || []);
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8))
    return "image/webp";
  if (isAvif(bytes)) return "image/avif";
  if (
    startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) ||
    startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a]) ||
    startsWith(bytes, [0x49, 0x49, 0x2b, 0x00]) ||
    startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2b])
  )
    return "image/tiff";
  return null;
}

/** The leading text of a markup document, whatever its byte-order mark. */
function leadingText(bytes) {
  if (startsWith(bytes, [0xff, 0xfe]))
    return bytes.subarray(2).toString("utf16le");
  if (startsWith(bytes, [0xfe, 0xff])) {
    const body = Buffer.from(bytes.subarray(2, 2 + ((bytes.length - 2) & ~1)));
    return body.swap16().toString("utf16le");
  }
  const start = startsWith(bytes, [0xef, 0xbb, 0xbf]) ? 3 : 0;
  return bytes.subarray(start).toString("latin1");
}

const activeMarkers = [
  /<svg[\s>/]/,
  /<!doctype\s+html/,
  /<html[\s>/]/,
  /<(?:head|body|script|iframe|object|embed|frameset)[\s>/]/,
  /http:\/\/www\.w3\.org\/1999\/xhtml/,
  /http:\/\/www\.w3\.org\/2000\/svg/,
];

/**
 * `"svg"`/`"html"` when these leading bytes open an SVG or HTML (or XHTML)
 * document — a markup file a browser would run scripts in — `null`
 * otherwise. A plain XML file (a capture program's sequence, a sidecar) is
 * not one: it is accepted and served as an attachment like any other file.
 */
export function activeDocumentKindOf(head) {
  const bytes = Buffer.isBuffer(head) ? head : Buffer.from(head || []);
  const text = leadingText(bytes.subarray(0, MEDIA_HEAD_BYTES)).toLowerCase();
  const trimmed = text.replace(/^[\s\u0000]+/, "");
  if (!trimmed.startsWith("<")) return null;
  if (!activeMarkers.some((marker) => marker.test(text))) return null;
  return /<svg[\s>/]|http:\/\/www\.w3\.org\/2000\/svg/.test(text)
    ? "svg"
    : "html";
}

/** The first `MEDIA_HEAD_BYTES` of a file (fewer when it is shorter). */
export async function readFileHead(path, length = MEDIA_HEAD_BYTES) {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** A `Content-Disposition: attachment` value that never breaks its header. */
export function attachmentDisposition(fileName) {
  const base =
    String(fileName || "")
      .split(/[\\/]/)
      .pop()
      // Control and format characters (a right-to-left override would
      // disguise the extension) never reach a header.
      .replace(
        /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
        "",
      )
      .trim()
      .slice(0, 200) || "file";
  const fallback = base.replace(/[^\x20-\x7e]/g, "_").replace(/["\\;]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(base)}`;
}

/**
 * The headers that serve a person's file: its type decided by its bytes,
 * an attachment unless it is a raster image, and the security headers
 * above. `Cache-Control` is always explicit: an image is kept an hour by
 * the viewer's browser only (never a shared cache), so a page of images
 * does not download them again at each display; a download is never kept.
 */
export function userFileHeaders({
  head,
  fileName,
  imageCacheControl = "private, max-age=3600",
  attachmentCacheControl = "private, no-store",
}) {
  const image = rasterImageTypeOf(head);
  return {
    "Content-Type": image || "application/octet-stream",
    ...(image
      ? {}
      : { "Content-Disposition": attachmentDisposition(fileName) }),
    "Cache-Control": image ? imageCacheControl : attachmentCacheControl,
    ...USER_FILE_SECURITY_HEADERS,
  };
}
