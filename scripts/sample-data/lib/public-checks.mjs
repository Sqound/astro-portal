// What may leave a space and be seen by everyone, checked after the fact:
// the public gallery of a running service, read without any credential, and
// a lot of captures prepared for an import, read before anything is sent.
// One rule for both, eager on purpose: a false positive stops and asks a
// person to look; a false negative would publish a place. Findings name
// where and which rule, never the value.

import { readFileSync } from "node:fs";
import { inspectImage, sniffImage } from "./images.mjs";
import {
  LOCATION_KEY,
  fold,
  isPlainObject,
  jsonFindings,
  prepareForbidden,
  textHasCoordinateNear,
  textRules,
} from "./patterns.mjs";

/** Keys that name a place, a person, a space, a device or a file of origin. */
export const PRIVATE_KEY =
  /^(?:place|places|location|locations|locality|known_?place|place_?name|address|street|city|town|commune|country|e_?mail|emails?|space_?id|tenant_?id|user_?id|owner_?id|organi[sz]ation_?id|member_?id|device_?id|installation_?id|original_?name|file_?name|time_?zone|sky_?entered)$/i;

/** A calendar day, in the forms a date is written. */
const DAY = /(?<!\d)\d{4}[-/.]\d{2}[-/.]\d{2}(?!\d)/;

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

/**
 * Where a decimal number may stand in the public gallery: the J2000 position
 * of a target (`targets[n].ra`, `targets[n].dec`), the integration of an
 * exposure, and the sky
 * solution of an image — the centre, scale, rotation and field of the sky it
 * shows, in the capture and in a public variant — with the annotations the
 * gallery draws from it, in the pixels of the file served. All of it is a
 * place in the sky; none is a place on the Earth. Anywhere else a decimal
 * could be a coordinate.
 */
const DECIMAL_ALLOWED = new RegExp(
  [
    String.raw`(?:^|\.)targets\[\d+\]\.(?:ra|dec)$`,
    String.raw`(?:^|\.)exposure\.(?:seconds|totalSeconds)$`,
    String.raw`(?:^|\.)skySolution\.(?:raDeg|decDeg|pixelScaleArcsec|rotationDeg|fieldWidthDeg|fieldHeightDeg)$`,
    String.raw`^annotations\[\d+\]\.(?:pixelx|pixely|radius|vmag)$`,
  ].join("|"),
);

/**
 * Every problem in one JSON answer of the public gallery: a key that names
 * a place, a person, a space or a file; a text with a coordinate, an
 * altitude and azimuth, a path, an e-mail or network address, a URL, a day or
 * a forbidden word; a decimal number outside a target's position; a place
 * object; a pair of numbers near a forbidden point; a signature other than
 * the expected one.
 */
export function galleryJsonFindings(
  value,
  { forbid = [], points = [], signature = null } = {},
) {
  const findings = [];
  const add = (path, rule) => findings.push({ path, rule });
  const walk = (node, path) => {
    if (typeof node === "string") {
      for (const rule of textRules(node, { forbid })) add(path, rule);
      if (DAY.test(node)) add(path, "day");
      for (const near of points)
        if (textHasCoordinateNear(node, near))
          add(path, "near-forbidden-point");
      return;
    }
    if (isNumber(node)) {
      if (!Number.isInteger(node) && !DECIMAL_ALLOWED.test(path))
        add(path, "decimal-number");
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (!isPlainObject(node)) return;
    for (const [key, item] of Object.entries(node)) {
      const here = path ? `${path}.${key}` : key;
      if (LOCATION_KEY.test(key)) add(here, "location-key");
      else if (PRIVATE_KEY.test(key)) add(here, "private-key");
      if (key === "signature" && signature !== null && item !== signature)
        add(here, "signature-not-the-expected-one");
      if (key === "nightMonth" && item !== null && !/^\d{4}-\d{2}$/.test(item))
        add(here, "night-not-a-month");
      walk(item, here);
    }
  };
  walk(value, "");
  // The rules of the sample data too (a place object, a near point).
  for (const near of points.length ? points : [null])
    for (const finding of jsonFindings(value, { forbid, near }))
      if (
        finding.rule === "place-not-the-sample-place" ||
        finding.rule === "near-forbidden-point"
      )
        add(finding.path, finding.rule);
  return dedupe(findings);
}

/**
 * Every problem in a lot prepared for an import (its manifest): the rules
 * of the sample data (a coordinate, a place object, a location key, a path,
 * an e-mail, a forbidden word…), any key naming a place or a time zone,
 * and a place that is anything else than `{ "name": "", "bortle": n }`.
 */
export function lotFindings(manifest, { forbid = [], points = [] } = {}) {
  const findings = [];
  const add = (path, rule) => findings.push({ path, rule });
  for (const near of points.length ? points : [null])
    for (const finding of jsonFindings(manifest, { forbid, near }))
      add(finding.path, finding.rule);
  const walk = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (!isPlainObject(node)) return;
    for (const [key, item] of Object.entries(node)) {
      const here = path ? `${path}.${key}` : key;
      if (
        /^(?:locality|known_?place|time_?zone|sky_?entered|address|street|horizon\w*)$/i.test(
          key,
        )
      )
        add(here, "private-key");
      if (key === "location") {
        const keys = isPlainObject(item) ? Object.keys(item).sort() : null;
        const shape =
          keys &&
          item.name === "" &&
          keys.every((name) => name === "name" || name === "bortle") &&
          (item.bortle === undefined ||
            (Number.isInteger(item.bortle) &&
              item.bortle >= 1 &&
              item.bortle <= 9));
        if (!shape) add(here, "place-not-reduced");
      }
      walk(item, here);
    }
  };
  walk(manifest, "");
  return dedupe(findings);
}

/** The chunks of a WebP file that are not its picture: EXIF, XMP, unknown. */
function inspectWebp(bytes) {
  const problems = [];
  if (bytes.length < 12 || bytes.toString("latin1", 8, 12) !== "WEBP")
    return ["malformed: not a WebP file"];
  const kept = new Set([
    "VP8 ",
    "VP8L",
    "VP8X",
    "ALPH",
    "ANIM",
    "ANMF",
    "ICCP",
  ]);
  let position = 12;
  while (position + 8 <= bytes.length) {
    const type = bytes.toString("latin1", position, position + 4);
    const size = bytes.readUInt32LE(position + 4);
    if (!kept.has(type)) problems.push(`webp chunk ${type.trim()}`);
    position += 8 + size + (size % 2);
  }
  return problems;
}

/**
 * What a served or prepared image still carries that it must not: any
 * metadata block (EXIF and its GPS, XMP, IPTC, comments, text). Only the
 * structure is read: the pixels are never searched, and never looked at.
 */
export function imageFindings(bytes) {
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF")
    return inspectWebp(bytes).map((rule) => ({ path: "", rule }));
  if (!sniffImage(bytes)) return [{ path: "", rule: "not-an-image" }];
  return inspectImage(bytes).problems.map((rule) => ({ path: "", rule }));
}

function dedupe(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.path}\u0000${finding.rule}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The forbidden words of a file outside the repository: one per line,
 * `#` starts a comment. Never printed, never written.
 */
export function forbiddenWordsFromFile(path) {
  return prepareForbidden(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*/, "").trim())
      .filter(Boolean),
  );
}

/** `true` when a folded text holds one of the prepared words. */
export function holdsForbiddenWord(text, prepared) {
  const folded = fold(text);
  return prepared.some((word) => folded.includes(word));
}

/** One line per finding: where and which rule, never the value. */
export function formatPublicFinding(where, finding) {
  return `${where}${finding.path ? ` ${finding.path}` : ""}: ${finding.rule}`;
}
