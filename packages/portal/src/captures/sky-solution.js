/**
 * The sky solution of an image of a capture (`sky-solution.schema.json`): a typed
 * object, never shown to a person, from which the portal draws the sky
 * annotations alone. It is computed on the person's computer by Astro Sync
 * (ASTAP by default, astrometry.net when chosen, or read without any
 * computation from a header NINA or ASIAIR already solved), or carried over
 * by an import from the old portal; **the server never solves**.
 *
 * It belongs to the image it was computed on — the main image or a variant
 * — and to that image's bytes: Astro Sync sends it with the image's
 * SHA-256, and the service keeps it only while an image of the capture has
 * that digest.
 *
 * Pure: no database, no file. The routes read the image and call these.
 */

/** The version of the solution's layout these rules read and write. */
export const SKY_SOLUTION_SCHEMA_VERSION = 1;

/**
 * Where a solution came from: `header` (a WCS already in the file's header,
 * no computation), `astap`, `astrometry-net`, `import` (the old portal).
 */
export const SKY_SOLUTION_SOURCES = Object.freeze(
  "header astap astrometry-net import".split(" "),
);

/** How far the solved image's proportions may stray from the stored image's. */
export const SKY_SOLUTION_ASPECT_TOLERANCE = 0.01;

const SOURCES = new Set(SKY_SOLUTION_SOURCES);
const PARITIES = new Set(["normal", "mirrored"]);
const MAX_PIXELS = 1_000_000;

/** A refusal of a solution: one machine code and a sentence. */
export class SkySolutionError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "SkySolutionError";
    this.code = code;
    this.status = status;
  }
}

const invalid = (message) =>
  new SkySolutionError("invalid_request", message, 400);

const finite = (value) => typeof value === "number" && Number.isFinite(value);

function inRange(body, key, low, high, { lowOpen = false, highOpen = false }) {
  const value = body[key];
  if (
    !finite(value) ||
    (lowOpen ? value <= low : value < low) ||
    (highOpen ? value >= high : value > high)
  )
    throw invalid(
      `${key} is a number in ${lowOpen ? "(" : "["}${low}, ${high}${highOpen ? ")" : "]"}.`,
    );
  return value;
}

function pixels(body, key) {
  const value = body[key];
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PIXELS)
    throw invalid(`${key} is a whole number of pixels, 1 to ${MAX_PIXELS}.`);
  return value;
}

const KNOWN_KEYS = new Set(
  (
    "schemaVersion source solverVersion raDeg decDeg pixelScaleArcsec " +
    "rotationDeg fieldWidthDeg fieldHeightDeg parity width height solvedAt"
  ).split(" "),
);

/**
 * The solution a client sent, validated field by field and returned in the
 * contract's order (the stored form), or a `SkySolutionError`
 * (`invalid_request`). Unknown fields are refused, so that a client never
 * believes the service kept a field it ignores; `annotationsEnabled` is the
 * owner's switch, never a field a device writes.
 */
export function validateSkySolution(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw invalid("solution is a JSON object.");
  const unknown = Object.keys(body).filter((key) => !KNOWN_KEYS.has(key));
  if (unknown.length) throw invalid(`Unknown field: ${unknown[0]}.`);
  if (body.schemaVersion !== SKY_SOLUTION_SCHEMA_VERSION)
    throw invalid(`schemaVersion is ${SKY_SOLUTION_SCHEMA_VERSION}.`);
  if (!SOURCES.has(body.source))
    throw invalid(`source is one of ${SKY_SOLUTION_SOURCES.join(", ")}.`);
  const solverVersion = body.solverVersion ?? null;
  if (
    solverVersion !== null &&
    (typeof solverVersion !== "string" ||
      !solverVersion.trim() ||
      solverVersion.length > 80)
  )
    throw invalid("solverVersion is a text of 80 characters at most.");
  if (!PARITIES.has(body.parity))
    throw invalid("parity is normal or mirrored.");
  const solvedAt = body.solvedAt;
  if (
    typeof solvedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      solvedAt,
    ) ||
    !Number.isFinite(Date.parse(solvedAt))
  )
    throw invalid("solvedAt is a date and time (RFC 3339).");
  return {
    schemaVersion: SKY_SOLUTION_SCHEMA_VERSION,
    source: body.source,
    solverVersion: solverVersion === null ? null : solverVersion.trim(),
    raDeg: inRange(body, "raDeg", 0, 360, { highOpen: true }),
    decDeg: inRange(body, "decDeg", -90, 90, {}),
    pixelScaleArcsec: inRange(body, "pixelScaleArcsec", 0, 3600, {
      lowOpen: true,
    }),
    rotationDeg: inRange(body, "rotationDeg", 0, 360, { highOpen: true }),
    fieldWidthDeg: inRange(body, "fieldWidthDeg", 0, 180, { lowOpen: true }),
    fieldHeightDeg: inRange(body, "fieldHeightDeg", 0, 180, { lowOpen: true }),
    parity: body.parity,
    width: pixels(body, "width"),
    height: pixels(body, "height"),
    solvedAt: new Date(solvedAt).toISOString(),
  };
}

/**
 * Whether a solution solved at `solution.width` × `solution.height` fits an
 * image of `image.width` × `image.height` (the stored image as shown): the
 * same proportions within `SKY_SOLUTION_ASPECT_TOLERANCE`, so that a
 * solution of a reduced copy is accepted and one of a cropped or turned
 * image is not. `true` while the image's size is unknown (its processing has
 * not read it yet): the service cannot check what it does not know.
 */
export function aspectMatches(solution, image) {
  const width = Number(image?.width);
  const height = Number(image?.height);
  if (!(width > 0 && height > 0)) return true;
  const solved = solution.width / solution.height;
  const stored = width / height;
  return Math.abs(solved - stored) / stored <= SKY_SOLUTION_ASPECT_TOLERANCE;
}

/**
 * The solution as the owner and Astro Sync read it: its fields, the image
 * it belongs to, and the owner's switch.
 */
export function skySolutionResource(stored, { annotationsEnabled }) {
  return {
    ...stored.solution,
    imageId: stored.imageId,
    sha256: stored.sha256,
    annotationsEnabled: Boolean(annotationsEnabled),
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
}

/**
 * The solution as a visitor's gallery reads it (`gallery.schema.json`): the
 * sky only — centre, scale, orientation, field, parity, the size it was
 * solved at — and where the annotations are; never the digest, the solver,
 * nor the dates.
 */
export function publicSkySolution(solution, annotationsUrl) {
  return {
    raDeg: solution.raDeg,
    decDeg: solution.decDeg,
    pixelScaleArcsec: solution.pixelScaleArcsec,
    rotationDeg: solution.rotationDeg,
    fieldWidthDeg: solution.fieldWidthDeg,
    fieldHeightDeg: solution.fieldHeightDeg,
    parity: solution.parity,
    width: solution.width,
    height: solution.height,
    annotations: annotationsUrl,
  };
}
