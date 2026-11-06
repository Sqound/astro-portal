/**
 * The progression of a capture in the galleries: the milestones Astro Sync
 * stacked (`capture_variants.role = 'progression'`), the history of the
 * capture, from the first (one frame) to the last. They are shown with the
 * capture wherever the capture is shown — the public gallery for a public
 * capture, the private gallery for a capture it shows — without a switch of
 * their own, and served by the galleries' media routes with `imageId`.
 * They are never the main image nor a variant.
 *
 * For the image of a multi-night plan (`captures.project_id`), each
 * milestone is the image stacked after one night: `plan` is then true and
 * the page says « Après la nuit N ».
 */

/**
 * `{ plan, steps }`: `steps` `[{ id, sha256, originalName, frameCount,
 * width, height }]` from the fewest frames to the most (the oldest first
 * for the same count); empty when the capture has none. `driver` is a
 * database driver; the caller checked the gallery shows the capture.
 */
export async function galleryProgressionOf(driver, captureId) {
  const id = String(captureId ?? "");
  const capture = (
    await driver.query("SELECT project_id FROM captures WHERE id = ?", [id])
  ).rows[0];
  if (!capture) return { plan: false, steps: [] };
  const steps = (
    await driver.query(
      `SELECT id, sha256, original_name, frame_count, width, height
       FROM capture_variants
       WHERE capture_id = ? AND role = 'progression' AND archived_at IS NULL
       ORDER BY frame_count ASC, created_at ASC, id ASC`,
      [id],
    )
  ).rows.map((row) => ({
    id: String(row.id),
    sha256: row.sha256,
    originalName: row.original_name,
    frameCount:
      Number.isInteger(Number(row.frame_count)) && Number(row.frame_count) > 0
        ? Number(row.frame_count)
        : null,
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
  }));
  return { plan: Boolean(capture.project_id), steps };
}

/** One milestone in a gallery's view: its frames, its pixel size, its two files. */
export function galleryProgressionStep(step, media) {
  const width = Number(step.width);
  const height = Number(step.height);
  return {
    id: step.id,
    frameCount: step.frameCount,
    image:
      Number.isInteger(width) &&
      width > 0 &&
      Number.isInteger(height) &&
      height > 0
        ? { width, height }
        : null,
    media,
  };
}
