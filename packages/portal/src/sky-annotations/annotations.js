import { skyToPixel } from "./projection.js";
import {
  DEFAULT_ANNOTATION_MAGNITUDE,
  LABEL_MAGNITUDE_LIMIT,
  magnitudeLimit,
  starBatchOf,
} from "./star-batches.js";

/**
 * The sky annotations of an image, drawn by the portal alone from the
 * image's sky solution, its own target catalogue and the HYG stars: the list
 * `PlateOverlay` reads (`components/plate-solving/PlateOverlay.js`), in the
 * pixels of the copy shown —
 *
 * - `{ type: "ngc", names, name, pixelx, pixely, radius, target: true }`
 *   for each target of the capture in the field, first;
 * - then the two largest other catalogue objects in the field (`type:
 *   "ngc"`, without `target`), as the overlay keeps two secondary objects;
 * - then the stars to `magnitude`, brightest first (`type: "bright"`,
 *   `names: [label]`, `radius: 0`, `vmag`), at most the ceiling of the batch
 *   of that magnitude (`star-batches.js`; `maxStars` overrides it). A star
 *   without a label to show — fainter than `LABEL_MAGNITUDE_LIMIT` and
 *   known by a number only, or by none — is a point: `names: []`.
 *
 * No `wcsinfo`, no `plot-constellations`, no subprocess. Pure.
 */

export { DEFAULT_ANNOTATION_MAGNITUDE };
/** The secondary catalogue objects one answer lists (as `PlateOverlay` draws). */
export const SECONDARY_OBJECTS = 2;

const inFrame = (point, width, height) =>
  point &&
  point.x >= 0 &&
  point.x <= width &&
  point.y >= 0 &&
  point.y <= height;

const round = (value) => Math.round(value * 100) / 100;

/** The radius in output pixels of an object of `sizeArcmin` (its major axis). */
function radiusOf(sizeArcmin, solution, scale) {
  const major = Array.isArray(sizeArcmin) ? Number(sizeArcmin[0]) : NaN;
  if (!(major > 0)) return 0;
  return round(((major * 60) / 2 / solution.pixelScaleArcsec) * scale);
}

function objectAnnotation(entry, solution, scale, width, height) {
  if (!Number.isFinite(entry.raDeg) || !Number.isFinite(entry.decDeg))
    return null;
  const point = skyToPixel(solution, entry.raDeg, entry.decDeg, scale);
  if (!inFrame(point, width, height)) return null;
  const names = [entry.designation, ...(entry.aliases || [])].filter(
    (name, index, all) =>
      typeof name === "string" && name.trim() && all.indexOf(name) === index,
  );
  if (!names.length) return null;
  return {
    type: "ngc",
    names,
    name: names[0],
    pixelx: round(point.x),
    pixely: round(point.y),
    radius: radiusOf(entry.sizeArcmin, solution, scale),
  };
}

/**
 * The annotations of an image of `width` × `height` pixels (the copy shown;
 * the same proportions as the solved image) from its `solution`:
 * `targets` and `objects` are catalogue entries `{ id, designation,
 * aliases, raDeg, decDeg, sizeArcmin }` (`targets` the capture's own, in
 * their order; `objects` any others near the field), `stars` are
 * `{ raDeg, decDeg, vmag, label, named }` (`label` may be empty: a point).
 */
export function skyAnnotations({
  solution,
  width = solution.width,
  height = solution.height,
  targets = [],
  objects = [],
  stars = [],
  magnitude = DEFAULT_ANNOTATION_MAGNITUDE,
  maxStars = null,
}) {
  const scale = width / solution.width;
  const own = new Set();
  const annotations = [];
  for (const target of targets) {
    const annotation = objectAnnotation(target, solution, scale, width, height);
    if (!annotation || own.has(target.id)) continue;
    own.add(target.id);
    annotations.push({ ...annotation, target: true });
  }
  const secondary = [];
  for (const entry of objects) {
    if (own.has(entry.id)) continue;
    const annotation = objectAnnotation(entry, solution, scale, width, height);
    if (annotation) secondary.push(annotation);
  }
  secondary.sort(
    (left, right) =>
      right.radius - left.radius || left.name.localeCompare(right.name),
  );
  annotations.push(...secondary.slice(0, SECONDARY_OBJECTS));
  const limit = magnitudeLimit(magnitude);
  const ceiling =
    maxStars === null ? starBatchOf(limit).max : Math.max(0, maxStars);
  const listed = [];
  for (const star of stars) {
    if (!(Number.isFinite(star.vmag) && star.vmag <= limit)) continue;
    const point = skyToPixel(solution, star.raDeg, star.decDeg, scale);
    if (!inFrame(point, width, height)) continue;
    const labelled =
      Boolean(star.label) && (star.named || star.vmag <= LABEL_MAGNITUDE_LIMIT);
    listed.push({
      type: "bright",
      names: labelled ? [star.label] : [],
      pixelx: round(point.x),
      pixely: round(point.y),
      radius: 0,
      vmag: star.vmag,
    });
  }
  listed.sort(
    (left, right) =>
      left.vmag - right.vmag ||
      (left.names[0] ?? "").localeCompare(right.names[0] ?? "") ||
      left.pixelx - right.pixelx ||
      left.pixely - right.pixely,
  );
  annotations.push(...listed.slice(0, ceiling));
  return annotations;
}

// A minimal CSV reader: quoted fields, no embedded line breaks (HYG has none).
function csvFields(line) {
  return [...line.matchAll(/(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g)].map(
    (match) => (match[1] ?? match[2] ?? "").replaceAll('""', '"'),
  );
}

/**
 * The reader of the lines of an HYG v4.1 CSV (HYG v4.1 — David Nash,
 * astronexus.com, CC BY-SA 4.0), from its header line: a function turning a
 * line into `{ raDeg, decDeg, vmag, label, named }`, or `null` (an empty or
 * unreadable line, the Sun), `null` itself when the header lacks the
 * columns. `named` is a star with a name of its own — the proper name, else
 * the Bayer–Flamsteed designation, which is then the `label` —; otherwise
 * the `label` is the HD or HIP number (the old portal's choice), and empty
 * for a star known by none: it is kept, as a point of the image. Columns
 * are found by name.
 */
export function hygStarReader(headerLine) {
  const header = csvFields(headerLine ?? "");
  const at = (name) => header.indexOf(name);
  const columns = {
    ra: at("ra"),
    dec: at("dec"),
    mag: at("mag"),
    proper: at("proper"),
    bf: at("bf"),
    hd: at("hd"),
    hip: at("hip"),
  };
  if (columns.ra < 0 || columns.dec < 0 || columns.mag < 0) return null;
  const field = (fields, name) =>
    columns[name] >= 0 ? (fields[columns[name]] ?? "").trim() : "";
  return (line) => {
    if (!line) return null;
    const fields = csvFields(line);
    const proper = field(fields, "proper");
    if (proper === "Sol") return null;
    const hd = field(fields, "hd");
    const hip = field(fields, "hip");
    const name = proper || field(fields, "bf");
    const label = name || (hd ? `HD ${hd}` : hip ? `HIP ${hip}` : "");
    const raDeg = Number(fields[columns.ra]) * 15;
    const decDeg = Number(fields[columns.dec]);
    const vmag = Number(fields[columns.mag]);
    if (
      !Number.isFinite(raDeg) ||
      !Number.isFinite(decDeg) ||
      !Number.isFinite(vmag)
    )
      return null;
    return {
      raDeg: ((raDeg % 360) + 360) % 360,
      decDeg,
      vmag,
      label,
      named: Boolean(name),
    };
  };
}

/** The stars of an HYG v4.1 CSV text (see `hygStarReader`); none when it is not one. */
export function hygStarsFromCsv(csv) {
  const lines = String(csv || "").split(/\r?\n/);
  const read = hygStarReader(lines[0]);
  if (!read) return [];
  const stars = [];
  for (let index = 1; index < lines.length; index += 1) {
    const star = read(lines[index]);
    if (star) stars.push(star);
  }
  return stars;
}
