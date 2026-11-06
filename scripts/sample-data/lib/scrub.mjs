// The structural half of the anonymisation of a JSON value: every place
// becomes the sample place, a horizon, a coordinate key, an image address is
// removed, every identifier is renumbered. Free text is not touched here: it
// is searched afterwards (patterns.mjs), and a hit stops the export.
import { SAMPLE_PLACE } from "./constants.mjs";
import {
  DROPPED_KEY,
  LOCATION_KEY,
  isPlaceObject,
  isPlainObject,
} from "./patterns.mjs";

/** Counts what the tool changed, by name (never a value). */
export class Report {
  #counts = new Map();
  add(key, amount = 1) {
    this.#counts.set(key, (this.#counts.get(key) || 0) + amount);
  }
  get(key) {
    return this.#counts.get(key) || 0;
  }
  toObject() {
    return Object.fromEntries(
      [...this.#counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  }
}

/** The one public place, as a fresh object. */
export const samplePlace = () => ({ ...SAMPLE_PLACE });

/**
 * A copy of `value` in which every place is the sample place, no horizon,
 * coordinate key or image address remains, and every known identifier is
 * replaced. `context` is `{ ids, report }`.
 */
export function scrubValue(value, context) {
  const { ids, report } = context;
  const walk = (node) => {
    if (typeof node === "string") {
      const replaced = ids.replaceString(node);
      if (replaced !== node) report.add("identifier-renumbered");
      return replaced;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (!isPlainObject(node)) return node;
    if (isPlaceObject(node)) {
      report.add("place-replaced");
      return samplePlace();
    }
    const copy = {};
    for (const [key, item] of Object.entries(node)) {
      if (DROPPED_KEY.test(key)) {
        report.add("horizon-or-image-key-removed");
        continue;
      }
      if (LOCATION_KEY.test(key)) {
        report.add("location-key-removed");
        continue;
      }
      copy[key] = walk(item);
    }
    return copy;
  };
  return walk(value);
}

/**
 * The paths of the frames an analysis report names (the `sourcePath` of its
 * quality rows, report v2) are the machine of the person who made them:
 * each distinct path becomes `frames/frame-NNNN.fits`, by order of first
 * appearance.
 */
export function scrubAnalysisReport(report, context) {
  const paths = new Map();
  const placeholder = (path) => {
    if (!paths.has(path)) {
      paths.set(
        path,
        `frames/frame-${String(paths.size + 1).padStart(4, "0")}.fits`,
      );
      context.report.add("frame-path-renamed");
    }
    return paths.get(path);
  };
  const copy = structuredClone(report);
  if (Array.isArray(copy?.quality))
    for (const row of copy.quality)
      if (typeof row?.sourcePath === "string")
        row.sourcePath = placeholder(row.sourcePath);
  return copy;
}

function sortedCopy(value) {
  if (Array.isArray(value)) return value.map(sortedCopy);
  if (isPlainObject(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortedCopy(value[key])]),
    );
  return value;
}

/** Compact JSON with sorted keys: the form the core itself stores plans in. */
export function stableStringify(value) {
  return JSON.stringify(sortedCopy(value));
}

/**
 * JSON for a person to read in a diff: two-space indentation, and any object
 * or array whose compact form is short stays on one line.
 */
export function formatJson(value, indent = "", width = 100) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const compact = JSON.stringify(value);
  if (compact.length + indent.length <= width) return compact;
  const inner = `${indent}  `;
  if (Array.isArray(value))
    return `[\n${value.map((item) => inner + formatJson(item, inner, width)).join(",\n")}\n${indent}]`;
  const entries = Object.entries(value);
  return `{\n${entries
    .map(
      ([key, item]) =>
        `${inner}${JSON.stringify(key)}: ${formatJson(item, inner, width)}`,
    )
    .join(",\n")}\n${indent}}`;
}
