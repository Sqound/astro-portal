// What counts as a leak, in one place: the exporter refuses to write a value
// these patterns match, and the verifier looks for the same patterns in a
// finished set. A pattern here is deliberately eager: a false positive stops
// an export and asks a person to look; a false negative would publish.
import { SAMPLE_PLACE } from "./constants.mjs";

// ---------------------------------------------------------------- forbidden words

/** Lower-case, accents removed: "Église" and "eglise" are the same word. */
export function fold(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Turns the words of the command line into what is searched for. Refuses a
 * word too short to mean anything: it would stop every export.
 */
export function prepareForbidden(words) {
  const prepared = [];
  for (const word of words || []) {
    const folded = fold(String(word).trim());
    if (folded.length < 3)
      throw new Error(
        "A forbidden word must have at least 3 characters (it is searched as a substring).",
      );
    if (!prepared.includes(folded)) prepared.push(folded);
  }
  return prepared;
}

/** How many forbidden words occur in the text (never their content). */
export function forbiddenWordCount(text, prepared) {
  if (!prepared?.length) return 0;
  const folded = fold(text);
  let count = 0;
  for (const word of prepared) if (folded.includes(word)) count += 1;
  return count;
}

/** The same search in raw bytes (the bytes of an image, an archive). */
export function forbiddenWordInBytes(bytes, prepared) {
  if (!prepared?.length) return 0;
  const lowered = Buffer.from(bytes.toString("latin1").toLowerCase(), "latin1");
  let count = 0;
  for (const word of prepared) {
    const needle = Buffer.from(word, "utf8");
    if (bytes.includes(needle) || lowered.includes(needle)) count += 1;
  }
  return count;
}

// ---------------------------------------------------------------- text patterns

const KEYWORD = String.raw`(?:site(?:lat|lon|long|elev)\w*|lat(?:itude)?|lon(?:g(?:itude)?)?|lng|site|location|gps|coord(?:inate)?s?)`;
const DECIMAL = String.raw`[-+]?\d{1,3}\.\d{2,}`;
const DMS = String.raw`\d{1,3}\s*°\s*\d{1,2}\s*['′]\s*\d{1,2}(?:\.\d+)?\s*(?:["″]|'')?`;

const POSIX_ROOTS = [
  "Users",
  "home",
  "Volumes",
  "mnt",
  "media",
  "private",
  "var",
  "tmp",
  "opt",
  "root",
  "storage",
  "sdcard",
  "srv",
  "Library",
  "etc",
];

const coordinatePatterns = [
  // a keyword, then a decimal with at least two digits: "lat 43.71", "site: 43.7123"
  new RegExp(String.raw`\b${KEYWORD}\b[^\n\d+-]{0,30}${DECIMAL}`, "i"),
  // the decimal first: "43.7123 (latitude)"
  new RegExp(String.raw`${DECIMAL}[^\n\d]{0,20}\b${KEYWORD}\b`, "i"),
  // a decimal followed by a hemisphere letter: "43.7123 N", "7.4567°E"
  /(?<![\d.])\d{1,3}\.\d{2,}\s*°?\s*[NSEW]\b/,
  // two degrees-minutes-seconds values in a row (a declination alone stays)
  new RegExp(String.raw`${DMS}\s*[NSEW]?[\s,;/]+${DMS}`),
  // "43 52 12 N 7 6 34 E"
  /\b\d{1,3}\s+\d{1,2}\s+\d{1,2}(?:\.\d+)?\s*[NS]\b[\s,;/]*\d{1,3}\s+\d{1,2}\s+\d{1,2}(?:\.\d+)?\s*[EW]\b/,
  // a keyword then degrees and minutes
  new RegExp(
    String.raw`\b${KEYWORD}\b[^\n\d]{0,30}\d{1,3}\s*[°d:\s]\s*\d{1,2}\s*['′m:\s]`,
    "i",
  ),
  // a bare pair "43.7123, 7.4567"
  /(?<![\d.])[-+]?\d{1,2}\.\d{3,}\s*[,;/ ]\s*[-+]?\d{1,3}\.\d{3,}(?![\d.])/,
];

const altitudeAzimuthPatterns = [
  // Together with the UTC time and a right ascension, an altitude and an
  // azimuth give the site back to a few kilometres.
  /\b(?:alt(?:itude)?|az(?:imuth)?|airmass|zenith\s+angle|hour\s+angle|sidereal\s+time|LST)\b[^\n\d]{0,20}[-+]?\d/i,
  /\bHA\s*[=:]\s*[-+]?\d/,
];

const pathPatterns = [
  new RegExp(String.raw`(?:^|[\s"'=(:,;\[])/(?:${POSIX_ROOTS.join("|")})/`),
  /(?:^|[\s"'=(:,;[])~\//,
  /(?<![A-Za-z0-9])[A-Za-z]:[\\/](?![\\/]{2})/,
  /(?:^|[\s"'=(])\\\\[^\\\s]+\\/,
];

const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;

const ipv4Pattern =
  /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.]*\d)/g;
const ipv6Patterns = [
  /(?<![0-9A-Za-z:])(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}(?![0-9A-Za-z:])/i,
  /(?<![0-9A-Za-z])(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6})?::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6})?(?![0-9A-Za-z])/i,
];
const macPattern =
  /(?<![0-9A-Za-z:])[0-9a-f]{2}(?::[0-9a-f]{2}){5}(?![0-9A-Za-z:])/i;

const urlPattern = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/i;

function anyMatch(patterns, text) {
  return patterns.some((pattern) => pattern.test(text));
}

function hasIpAddress(text) {
  for (const match of text.matchAll(ipv4Pattern)) {
    const before = text.slice(Math.max(0, match.index - 12), match.index);
    // "version 2.6.13.4" is a version, not an address.
    if (/(?:\bv|version|ver\.?)\s*$/i.test(before)) continue;
    return true;
  }
  return anyMatch(ipv6Patterns, text) || macPattern.test(text);
}

/**
 * The text rules a value can break, by name, without their content. `forbid`
 * is the prepared list (see prepareForbidden).
 */
export function textRules(text, { forbid = [], allowUrls = false } = {}) {
  const value = String(text);
  const rules = [];
  if (forbiddenWordCount(value, forbid)) rules.push("forbidden-word");
  if (anyMatch(coordinatePatterns, value)) rules.push("coordinate");
  if (anyMatch(altitudeAzimuthPatterns, value)) rules.push("altitude-azimuth");
  if (anyMatch(pathPatterns, value)) rules.push("path");
  if (emailPattern.test(value)) rules.push("email");
  if (hasIpAddress(value)) rules.push("network-address");
  if (!allowUrls && urlPattern.test(value)) rules.push("url");
  return rules;
}

// ---------------------------------------------------------------- distance

const EARTH_RADIUS_KM = 6371.0088;

export function distanceKm(latitudeA, longitudeA, latitudeB, longitudeB) {
  const radians = Math.PI / 180;
  const dLat = (latitudeB - latitudeA) * radians;
  const dLon = (longitudeB - longitudeA) * radians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latitudeA * radians) *
      Math.cos(latitudeB * radians) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Parses `lat,lon,km` of the command line (the point is never stored). */
export function parseNear(value) {
  const parts = String(value)
    .split(",")
    .map((part) => Number(part.trim()));
  if (
    parts.length !== 3 ||
    parts.some((part) => !Number.isFinite(part)) ||
    Math.abs(parts[0]) > 90 ||
    Math.abs(parts[1]) > 180 ||
    !(parts[2] > 0)
  )
    throw new Error(
      "--forbid-near expects <latitude>,<longitude>,<kilometres>, e.g. 43.7,7.4,20.",
    );
  return { latitude: parts[0], longitude: parts[1], kilometres: parts[2] };
}

const isSamplePlace = (latitude, longitude) =>
  Math.abs(latitude - Number(SAMPLE_PLACE.latitude)) < 1e-9 &&
  Math.abs(longitude - Number(SAMPLE_PLACE.longitude)) < 1e-9;

function pairIsNear(a, b, near) {
  for (const [latitude, longitude] of [
    [a, b],
    [b, a],
  ]) {
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    if (isSamplePlace(latitude, longitude)) continue;
    if (
      distanceKm(latitude, longitude, near.latitude, near.longitude) <
      near.kilometres
    )
      return true;
  }
  return false;
}

/** Whether two decimals written next to each other in a text are near the point. */
export function textHasCoordinateNear(text, near) {
  if (!near) return false;
  const tokens = [];
  for (const match of String(text).matchAll(/(?<![\d.])[-+]?\d{1,3}\.\d{2,}/g))
    tokens.push({
      value: Number(match[0]),
      start: match.index,
      end: match.index + match[0].length,
    });
  for (let index = 0; index + 1 < tokens.length; index += 1) {
    const gap = String(text).slice(tokens[index].end, tokens[index + 1].start);
    if (gap.length > 12 || /\d/.test(gap)) continue;
    if (pairIsNear(tokens[index].value, tokens[index + 1].value, near))
      return true;
  }
  return false;
}

// ---------------------------------------------------------------- JSON walk

const LATITUDE_KEYS = /^(?:lat|latitude|sitelat\w*)$/i;
const LONGITUDE_KEYS = /^(?:lon|lng|long|longitude|sitelong\w*|sitelon\w*)$/i;
/** Keys that name a terrestrial position or elevation, anywhere. */
export const LOCATION_KEY =
  /^(?:(?:site_?)?(?:lat|lon|lng|long|latitude|longitude|elevation|elev)(?:_?(?:deg|degrees?|m|meters?|metres?))?|gps\w*|site_?(?:lat|lon|long|elev)\w*|time_?zone)$/i;
/** Keys that hold a horizon (it draws a site), an image address or a thumbnail. */
export const DROPPED_KEY =
  /^(?:horizonmask|horizonprofiles?|unassignedhorizonprofiles|currenthorizonmask|\w*image_?url|previewimageurl|\w*thumbnail\w*)$/i;

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** An object that has both a latitude and a longitude key: a place. */
export function isPlaceObject(value) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.some((key) => LATITUDE_KEYS.test(key)) &&
    keys.some((key) => LONGITUDE_KEYS.test(key))
  );
}

export function isSamplePlaceObject(value) {
  if (!isPlaceObject(value)) return false;
  const expected = { ...SAMPLE_PLACE };
  const keys = Object.keys(value);
  return (
    keys.every((key) => key in expected) &&
    Object.entries(expected).every(
      ([key, wanted]) => String(value[key]) === String(wanted),
    )
  );
}

function numberOf(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value)))
    return Number(value);
  return null;
}

/**
 * Every problem in a JSON value, with its path and the rule (never its
 * content): forbidden words, text patterns, location keys, dropped keys, a
 * place that is not the sample place, a coordinate near the forbidden point.
 * `plain: true` skips the keys the exporter itself removes (it scans after).
 */
export function jsonFindings(
  value,
  { forbid = [], allowUrls = false, near = null } = {},
) {
  const findings = [];
  const add = (path, rule) => findings.push({ path, rule });
  const walk = (node, path) => {
    if (typeof node === "string") {
      for (const rule of textRules(node, { forbid, allowUrls }))
        add(path, rule);
      if (textHasCoordinateNear(node, near)) add(path, "near-forbidden-point");
      return;
    }
    if (Array.isArray(node)) {
      if (
        near &&
        node.length === 2 &&
        node.every((item) => typeof item === "number") &&
        pairIsNear(node[0], node[1], near)
      )
        add(path, "near-forbidden-point");
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (!isPlainObject(node)) return;
    if (isPlaceObject(node)) {
      if (!isSamplePlaceObject(node)) add(path, "place-not-the-sample-place");
      return;
    }
    const entries = Object.entries(node);
    if (near) {
      const latitudeKey = entries.find(([key]) => LATITUDE_KEYS.test(key));
      const longitudeKey = entries.find(([key]) => LONGITUDE_KEYS.test(key));
      if (latitudeKey && longitudeKey) {
        const latitude = numberOf(latitudeKey[1]);
        const longitude = numberOf(longitudeKey[1]);
        if (
          latitude !== null &&
          longitude !== null &&
          distanceKm(latitude, longitude, near.latitude, near.longitude) <
            near.kilometres
        )
          add(path, "near-forbidden-point");
      }
    }
    for (const [key, item] of entries) {
      const here = path ? `${path}.${key}` : key;
      if (forbiddenWordCount(key, forbid)) add(here, "forbidden-word-in-key");
      if (LOCATION_KEY.test(key)) add(here, "location-key");
      if (DROPPED_KEY.test(key)) add(here, "dropped-key");
      walk(item, here);
    }
  };
  walk(value, "");
  return findings;
}
