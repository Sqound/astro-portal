import { createPublicGalleryRepository } from "../persistence/public-gallery-repository.js";
import { createSkySolutionRepository } from "../persistence/sky-solution-repository.js";
import { captureStore } from "../uploads/capture-store.js";
import { ensureSharedCopy } from "../uploads/derived-images.js";
import { skyAnnotations } from "../sky-annotations/annotations.js";
import { fieldRadiusDeg } from "../sky-annotations/projection.js";
import { magnitudeLimit } from "../sky-annotations/star-batches.js";
import {
  SkySolutionError,
  aspectMatches,
  skySolutionResource,
  validateSkySolution,
} from "./sky-solution.js";
import { captureSessionLiveSql } from "../persistence/capture-session-visibility.js";

/**
 * The sky solutions of the captures: Astro Sync writes the
 * solution of an image by its device token, the owner deletes it from the
 * web, Astro Sync fetches the original of an image to solve it (the
 * captures sent from the phone and the web included), and a visitor's
 * gallery reads the annotations the portal draws alone. Framework-free like
 * the other resource services: a route adapter authenticates and turns a
 * `SkySolutionError` into the v1 error envelope.
 */

const SHA256 = /^[0-9a-f]{64}$/;

const captureNotFound = () =>
  new SkySolutionError("capture_not_found", "Capture not found.", 404);
const imageNotFound = () =>
  new SkySolutionError("image_not_found", "Image not found.", 404);
const solutionNotFound = () =>
  new SkySolutionError(
    "sky_solution_not_found",
    "This image has no sky solution.",
    404,
  );
const imageChanged = () =>
  new SkySolutionError(
    "image_changed",
    "No image of this capture has these bytes any more: the capture changed since the solution was computed.",
    409,
  );

async function imageSizeOf(path) {
  try {
    const { default: sharp } = await import("sharp");
    const { width, height } = await sharp(path).metadata();
    return Number.isSafeInteger(width) && Number.isSafeInteger(height)
      ? { width, height }
      : null;
  } catch {
    return null;
  }
}

const parseList = (text) => {
  try {
    const value = JSON.parse(text || "[]");
    return Array.isArray(value)
      ? value.filter((item) => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

const catalogueEntry = (row) => ({
  id: row.id,
  designation: row.designation,
  aliases: parseList(row.aliases_json),
  raDeg: row.ra_hours == null ? NaN : Number(row.ra_hours) * 15,
  decDeg: row.dec_degrees == null ? NaN : Number(row.dec_degrees),
  sizeArcmin: (() => {
    try {
      return JSON.parse(row.apparent_size_arcmin_json || "null");
    } catch {
      return null;
    }
  })(),
});

export async function createCaptureSkySolutionService({
  driver,
  now = () => new Date().toISOString(),
  // The stars (`{ raDeg, decDeg, vmag, label, named }`) the annotations
  // place: the HYG catalogue the server has installed
  // (`sky-annotations/hyg-stars-source.js`), `null` while it is not — the
  // answers then say `starsAvailable: false`.
  stars = async () => null,
  sharedCopy = ensureSharedCopy,
  imageSize = imageSizeOf,
  // Where the files are (`uploads/capture-store.js`).
  captureStore: givenCaptureStore = null,
} = {}) {
  if (!driver) throw new Error("The sky solutions need a database.");
  const db = driver;
  const files = () => givenCaptureStore || captureStore();
  const store = await createSkySolutionRepository({ driver });
  const gallery = await createPublicGalleryRepository({ driver });

  const captureRow = async (tenantId, captureId) =>
    (
      await db.query(
        `SELECT id, sky_annotations FROM captures WHERE id = ? AND tenant_id = ?
           AND ${captureSessionLiveSql()}`,
        [String(captureId ?? ""), tenantId],
      )
    ).rows[0] || null;

  /** One image of a capture of the space (`imageId`), its main one otherwise. */
  async function imageOf(tenantId, captureId, imageId) {
    const capture = await captureRow(tenantId, captureId);
    if (!capture) throw captureNotFound();
    const image = (
      await db.query(
        imageId
          ? "SELECT * FROM capture_variants WHERE tenant_id = ? AND capture_id = ? AND id = ?"
          : "SELECT * FROM capture_variants WHERE tenant_id = ? AND capture_id = ? AND is_main = 1",
        imageId
          ? [tenantId, capture.id, String(imageId)]
          : [tenantId, capture.id],
      )
    ).rows[0];
    if (!image) throw imageNotFound();
    return { capture, image };
  }

  const resource = (stored, capture) =>
    skySolutionResource(stored, {
      annotationsEnabled: Number(capture.sky_annotations) === 1,
    });

  /** The catalogue entries a field may hold: a band of declination, a few hundred rows. */
  async function objectsNear(solution) {
    const radius = fieldRadiusDeg(solution) + 0.5;
    const rows = (
      await db.query(
        `SELECT id, designation, aliases_json, ra_hours, dec_degrees,
           apparent_size_arcmin_json
         FROM target_catalogue_entries
         WHERE source_present = 1 AND ra_hours IS NOT NULL
           AND dec_degrees IS NOT NULL AND dec_degrees BETWEEN ? AND ?
           AND (type_key IS NULL OR (type_key <> ? AND type_key <> ?))`,
        [
          Math.max(-90, solution.decDeg - radius),
          Math.min(90, solution.decDeg + radius),
          "Étoile",
          "Système solaire",
        ],
      )
    ).rows;
    return rows.map(catalogueEntry);
  }

  async function targetsOf(captureId) {
    return (
      await db.query(
        `SELECT e.id, e.designation, e.aliases_json, e.ra_hours, e.dec_degrees,
           e.apparent_size_arcmin_json
         FROM capture_targets ct
         JOIN target_catalogue_entries e ON e.id = ct.target_id
         WHERE ct.capture_id = ? ORDER BY ct.position`,
        [captureId],
      )
    ).rows.map(catalogueEntry);
  }

  /**
   * The annotations of one shown image, in the pixels of the copy a gallery
   * serves, or `null` (no solution of those bytes, a size the solution does
   * not fit, the owner's switch off — `solutions` is empty then).
   */
  async function annotationsOfImage({
    tenantId,
    captureId,
    shown,
    solutions,
    magnitude,
  }) {
    const stored = shown.id ? solutions.get(shown.id) : null;
    if (!stored || stored.sha256 !== shown.sha256) return null;
    let size = null;
    try {
      const { path } = await sharedCopy({
        tenantId,
        sha256: shown.sha256,
        originalName: shown.name,
        captureStore: files(),
      });
      size = path
        ? await imageSize(path)
        : await files().withLocalFile(
            { tenantId, sha256: shown.sha256, file: "shared" },
            imageSize,
          );
    } catch {
      size = null;
    }
    if (!size || !aspectMatches(stored.solution, size)) return null;
    const catalogue = await stars();
    return {
      image: size,
      // Whether this server has the star catalogue: without it the
      // annotations hold the catalogue's objects only, and the viewer says so
      // instead of offering a selector of magnitude that changes nothing.
      starsAvailable: Array.isArray(catalogue),
      annotations: skyAnnotations({
        solution: stored.solution,
        width: size.width,
        height: size.height,
        targets: await targetsOf(captureId),
        objects: await objectsNear(stored.solution),
        stars: catalogue ?? [],
        magnitude: magnitudeLimit(magnitude),
      }),
    };
  }

  return {
    async close() {
      await gallery.close?.();
    },

    /**
     * `PUT /v1/captures/{id}/sky-solution` (a device token of the space):
     * `{ sha256, solution }`. The digest names the image the solution was
     * computed on — the main image or a variant —; a digest no image of the
     * capture holds is `409 image_changed`; proportions that differ from
     * the stored image's are `422 sky_solution_aspect_mismatch`.
     * Idempotent: the same solution again changes nothing. Answers `{
     * skySolution, created, changed }`.
     */
    async put({ tenantId, captureId, body }) {
      const input =
        body && typeof body === "object" && !Array.isArray(body) ? body : {};
      const extra = Object.keys(input).filter(
        (key) => key !== "sha256" && key !== "solution",
      );
      if (extra.length)
        throw new SkySolutionError(
          "invalid_request",
          "Send sha256 and solution only.",
        );
      const sha256 =
        typeof input.sha256 === "string" ? input.sha256.toLowerCase() : "";
      if (!SHA256.test(sha256))
        throw new SkySolutionError(
          "invalid_request",
          "sha256 is the image's SHA-256, 64 hexadecimal characters.",
        );
      const solution = validateSkySolution(input.solution);
      const capture = await captureRow(tenantId, captureId);
      if (!capture) throw captureNotFound();
      const image = (
        await db.query(
          "SELECT * FROM capture_variants WHERE tenant_id = ? AND capture_id = ? AND sha256 = ?",
          [tenantId, capture.id, sha256],
        )
      ).rows[0];
      if (!image) throw imageChanged();
      if (!aspectMatches(solution, image))
        throw new SkySolutionError(
          "sky_solution_aspect_mismatch",
          "The solved image does not have the proportions of the image stored: solve the image as it was sent.",
          422,
        );
      const written = await store.put({
        tenantId,
        captureId: capture.id,
        imageId: image.id,
        sha256,
        solution,
        at: now(),
      });
      if (!written) throw imageChanged();
      const stored = await store.forImage(tenantId, capture.id, image.id);
      return {
        skySolution: resource(stored, capture),
        created: written.created,
        changed: written.changed,
      };
    },

    /** The solution of an image (`imageId`, the main one otherwise), or 404. */
    async get({ tenantId, captureId, imageId = null }) {
      const { capture, image } = await imageOf(tenantId, captureId, imageId);
      const stored = await store.forImage(tenantId, capture.id, image.id);
      if (!stored) throw solutionNotFound();
      return { skySolution: resource(stored, capture) };
    },

    /** Deletes the solution of an image (`imageId`, the main one otherwise), or 404. */
    async remove({ tenantId, captureId, imageId = null }) {
      const { capture, image } = await imageOf(tenantId, captureId, imageId);
      if (!(await store.remove(tenantId, capture.id, image.id)))
        throw solutionNotFound();
      return { deleted: true, imageId: image.id };
    },

    /**
     * `GET /v1/captures/{id}/sky-solution/annotations` (the phone's
     * full-screen viewer): the annotations of one image (`imageId`, the main
     * one otherwise) of a capture of the owner's own space, in the pixels of
     * the copy the gallery serves — the very answer of `galleryAnnotations`,
     * whether the capture is public or not and whatever the owner's switch
     * says (the switch only decides what a visitor sees). 404
     * `sky_solution_not_found` while the image has no solution of its own
     * bytes or no size a solution fits.
     */
    async ownerAnnotations({ tenantId, captureId, imageId = null, magnitude }) {
      const { capture, image } = await imageOf(tenantId, captureId, imageId);
      const stored = await store.forImage(tenantId, capture.id, image.id);
      if (!stored) throw solutionNotFound();
      const found = await annotationsOfImage({
        tenantId,
        captureId: capture.id,
        shown: {
          id: image.id,
          sha256: image.sha256,
          name: image.original_name,
        },
        solutions: new Map([[image.id, stored]]),
        magnitude,
      });
      if (!found) throw solutionNotFound();
      return found;
    },

    /**
     * The original of an image of a capture of the space (`imageId`, the
     * main one otherwise), for Astro Sync to solve it: `{ reference, path,
     * imageId, sha256, originalName, byteSize }` — `reference` names it in
     * the capture store, `path` is its path on this machine when the store
     * is the disk (`null` otherwise). Whatever sent the image — the phone,
     * the web, Astro Sync.
     */
    async original({ tenantId, captureId, imageId = null }) {
      const { image } = await imageOf(tenantId, captureId, imageId);
      const reference = { tenantId, sha256: image.sha256, file: "original" };
      return {
        reference,
        path: files().pathOf?.(reference) ?? null,
        imageId: image.id,
        sha256: image.sha256,
        originalName: image.original_name,
        byteSize: Number(image.byte_size),
        source: image.source ?? null,
      };
    },

    /**
     * Where a solver may look first for a capture of the space: the first
     * of its targets with a position (`{ raDeg, decDeg }`), or `null`.
     */
    async hints({ tenantId, captureId }) {
      const capture = await captureRow(tenantId, captureId);
      if (!capture) throw captureNotFound();
      const target = (await targetsOf(capture.id)).find(
        (entry) =>
          Number.isFinite(entry.raDeg) && Number.isFinite(entry.decDeg),
      );
      return target ? { raDeg: target.raDeg, decDeg: target.decDeg } : null;
    },

    /**
     * `GET /v1/gallery/{id}/annotations`: the annotations of the image a
     * visitor sees (`imageId` a public variant, the main image otherwise),
     * in the pixels of the copy the gallery serves, while the capture is
     * public, the image shown, a solution of that image stored and the
     * owner's switch on; `null` otherwise (the route's one 404).
     */
    async galleryAnnotations({ captureId, imageId = null, magnitude }) {
      const row = await gallery.getPublic(captureId);
      if (!row) return null;
      const { mainImageId, solutions } = await store.galleryOf(row.id);
      let shown = {
        id: mainImageId,
        sha256: row.sha256,
        name: row.originalName,
      };
      if (imageId && imageId !== mainImageId) {
        const variant = (await gallery.shownVariants(row.id)).find(
          (entry) => entry.id === imageId,
        );
        if (!variant) return null;
        shown = {
          id: variant.id,
          sha256: variant.sha256,
          name: variant.originalName,
        };
      }
      return annotationsOfImage({
        tenantId: row.tenantId,
        captureId: row.id,
        shown,
        solutions,
        magnitude,
      });
    },

    /**
     * The annotations of one image the private gallery's capture page shows —
     * the gate and the choice of the image are the gallery service's
     * (`shownImage`) —, under the same rules as `galleryAnnotations`: a
     * solution of that image stored, its bytes the image's, the owner's switch
     * on; `null` otherwise.
     */
    async privateGalleryAnnotations({ tenantId, captureId, image, magnitude }) {
      const { solutions } = await store.galleryOf(captureId);
      return annotationsOfImage({
        tenantId,
        captureId,
        shown: {
          id: image.id,
          sha256: image.sha256,
          name: image.originalName,
        },
        solutions,
        magnitude,
      });
    },
  };
}
