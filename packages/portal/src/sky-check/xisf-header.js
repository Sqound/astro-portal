/**
 * The header of an XISF file (PixInsight's format), read just far enough
 * for the sky check: the signature `XISF0100`, the length of the XML
 * header (a little-endian 32-bit number at byte 8), and, in that XML, the
 * kind of frame (`imageType` of the `Image` element, or an `IMAGETYP`
 * FITS keyword) and whether an astrometric solution is recorded (the
 * `PCL:AstrometricSolution:*` properties, or celestial `CTYPE` keywords).
 * The pixels are never read: they may be compressed, and the header says
 * what the check needs. The XML is matched, not parsed: a bounded read of
 * a known vocabulary.
 */

import { frameKindOfText } from "./fits-header.js";

/** The largest XML header read (bytes); a longer one is not read. */
export const XISF_MAX_HEADER_BYTES = 1 << 20;

const SIGNATURE = "XISF0100";

/** Whether these leading bytes open an XISF file. */
export function isXisfHead(head) {
  const bytes = Buffer.isBuffer(head) ? head : Buffer.from(head || []);
  return bytes.length >= 16 && bytes.toString("latin1", 0, 8) === SIGNATURE;
}

/** The length of the XML header, from the first 16 bytes, or `null`. */
export function xisfHeaderLength(head) {
  if (!isXisfHead(head)) return null;
  return head.readUInt32LE(8);
}

const attribute = (element, name) => {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(element);
  return match ? match[1] : null;
};

/** The value of a `FITSKeyword` element named `name`, unquoted. */
function keywordValue(xml, name) {
  const pattern = /<FITSKeyword\b[^>]*>/gi;
  for (const match of xml.matchAll(pattern)) {
    if ((attribute(match[0], "name") || "").toUpperCase() !== name) continue;
    const value = attribute(match[0], "value");
    return value === null ? null : value.replace(/^'|'$/g, "").trim();
  }
  return null;
}

/**
 * What the XML header of an XISF file says: `{ ok: true, frameKind,
 * astrometric }` or `{ ok: false, error }` (`not_xisf`, `too_long`,
 * `truncated`, `no_image`).
 */
export function parseXisfHeader(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (!isXisfHead(buffer)) return { ok: false, error: "not_xisf" };
  const length = buffer.readUInt32LE(8);
  if (length > XISF_MAX_HEADER_BYTES) return { ok: false, error: "too_long" };
  if (buffer.length < 16 + length) return { ok: false, error: "truncated" };
  const xml = buffer.toString("utf8", 16, 16 + length);
  const image = /<Image\b[^>]*>/i.exec(xml);
  if (!image) return { ok: false, error: "no_image" };
  const frameKind =
    frameKindOfText(attribute(image[0], "imageType")) ??
    frameKindOfText(keywordValue(xml, "IMAGETYP")) ??
    frameKindOfText(keywordValue(xml, "FRAME"));
  const ctype1 = (keywordValue(xml, "CTYPE1") || "").toUpperCase();
  const ctype2 = (keywordValue(xml, "CTYPE2") || "").toUpperCase();
  const astrometric =
    /\bid\s*=\s*"PCL:AstrometricSolution:(?:ReferenceCelestialCoordinates|LinearTransformationMatrix)"/i.test(
      xml,
    ) ||
    (/^RA--/.test(ctype1) &&
      /^DEC-/.test(ctype2) &&
      keywordValue(xml, "CRVAL1") !== null &&
      keywordValue(xml, "CRVAL2") !== null);
  return { ok: true, frameKind, astrometric };
}
