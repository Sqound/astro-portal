import { publishChange } from "../api/change-bus.js";

/**
 * The sky solutions of the images of a space's captures (migration
 * `capture-sky-solutions`): one row per image
 * (`capture_sky_solutions.image_id`, the main image or a variant), keyed to
 * that image's digest, and the owner's switch of each capture
 * (`captures.sky_annotations`). Every read and write is bounded by the
 * space: another space's capture or image is exactly as absent as one that
 * does not exist. The caller validates the solution
 * (`captures/sky-solution.js`).
 */

const parse = (row) => ({
  imageId: row.image_id,
  captureId: row.capture_id,
  sha256: row.sha256,
  source: row.source,
  solution: JSON.parse(row.solution_json),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function createSkySolutionRepository({ driver }) {
  if (!driver) throw new Error("The sky solutions need a database.");
  const db = driver;

  return {
    /** The solution of one image of a capture of the space, or `null`. */
    async forImage(tenantId, captureId, imageId) {
      const row = (
        await db.query(
          `SELECT * FROM capture_sky_solutions
           WHERE tenant_id = ? AND capture_id = ? AND image_id = ?`,
          [tenantId, String(captureId ?? ""), String(imageId ?? "")],
        )
      ).rows[0];
      return row ? parse(row) : null;
    },

    /** The solutions of the images of one capture: `Map<imageId, solution>`. */
    async forCapture(tenantId, captureId) {
      const found = new Map();
      for (const row of (
        await db.query(
          "SELECT * FROM capture_sky_solutions WHERE tenant_id = ? AND capture_id = ?",
          [tenantId, String(captureId ?? "")],
        )
      ).rows)
        found.set(row.image_id, parse(row));
      return found;
    },

    /**
     * What a visitor's gallery may read of a capture's solutions (the
     * caller checked the capture is public): its main image's id and, while
     * the owner's switch is on, the solutions of its images
     * (`Map<imageId, solution>`); an empty map while the switch is off.
     */
    async galleryOf(captureId) {
      const id = String(captureId ?? "");
      const capture = (
        await db.query("SELECT sky_annotations FROM captures WHERE id = ?", [
          id,
        ])
      ).rows[0];
      const main = (
        await db.query(
          "SELECT id FROM capture_variants WHERE capture_id = ? AND is_main = 1",
          [id],
        )
      ).rows[0];
      const solutions = new Map();
      if (capture && Number(capture.sky_annotations) === 1)
        for (const row of (
          await db.query(
            "SELECT * FROM capture_sky_solutions WHERE capture_id = ?",
            [id],
          )
        ).rows)
          solutions.set(row.image_id, parse(row));
      return { mainImageId: main?.id ?? null, solutions };
    },

    /**
     * Writes the solution of one image, idempotent by digest: the same
     * solution sent again for the same bytes changes nothing (`changed:
     * false`); another one for the same bytes replaces it (a solver run
     * again). The image must still be the capture's and still hold these
     * bytes, checked in the same transaction: `{ created, changed }`, or
     * `null` when it is not (the capture changed meanwhile).
     */
    async put({ tenantId, captureId, imageId, sha256, solution, at }) {
      const text = JSON.stringify(solution);
      const result = await db.transaction(async (tx) => {
        const image = (
          await tx.query(
            `SELECT id FROM capture_variants
             WHERE tenant_id = ? AND capture_id = ? AND id = ? AND sha256 = ?`,
            [tenantId, captureId, imageId, sha256],
          )
        ).rows[0];
        if (!image) return null;
        const held = (
          await tx.query(
            "SELECT solution_json FROM capture_sky_solutions WHERE image_id = ?",
            [imageId],
          )
        ).rows[0];
        if (held && held.solution_json === text)
          return { created: false, changed: false };
        if (held) {
          await tx.run(
            `UPDATE capture_sky_solutions
             SET solution_json = ?, source = ?, sha256 = ?, updated_at = ?
             WHERE image_id = ?`,
            [text, solution.source, sha256, at, imageId],
          );
          return { created: false, changed: true };
        }
        await tx.run(
          `INSERT INTO capture_sky_solutions
             (image_id, capture_id, tenant_id, sha256, solution_json, source,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [imageId, captureId, tenantId, sha256, text, solution.source, at, at],
        );
        return { created: true, changed: true };
      });
      if (result?.changed) publishChange({ tenantId, domains: ["captures"] });
      return result;
    },

    /** Deletes the solution of one image; whether one was deleted. */
    async remove(tenantId, captureId, imageId) {
      const result = await db.run(
        "DELETE FROM capture_sky_solutions WHERE tenant_id = ? AND capture_id = ? AND image_id = ?",
        [tenantId, String(captureId ?? ""), String(imageId ?? "")],
      );
      const deleted = result.rowCount === 1;
      if (deleted) publishChange({ tenantId, domains: ["captures"] });
      return deleted;
    },

    /** The owner's switch of a capture of the space; whether it was written. */
    async setAnnotationsEnabled(tenantId, captureId, enabled) {
      const result = await db.run(
        "UPDATE captures SET sky_annotations = ? WHERE id = ? AND tenant_id = ?",
        [enabled ? 1 : 0, String(captureId ?? ""), tenantId],
      );
      const written = result.rowCount === 1;
      if (written) publishChange({ tenantId, domains: ["captures"] });
      return written;
    },
  };
}
