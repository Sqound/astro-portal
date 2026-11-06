/**
 * The quality of an image in a gallery (the statistics are shown on the private
 * and on the public gallery alike, and one switch for each says whether to show
 * them). What Astro Sync measured on a stacked image
 * (`capture_variants.quality_json`, `imageQuality` of `capture.schema.json`)
 * is read by a gallery only while the owner's switch of that gallery is on:
 * `captures.quality_private` (on by default) for the private gallery,
 * `captures.quality_public` for the public one (on for a capture created
 * from now on, off for the captures created before, which keep their
 * owner's choice).
 */

import { publicImageQuality } from "./public-capture-view.js";

const COLUMN = Object.freeze({
  private: "quality_private",
  public: "quality_public",
});

/**
 * Whether the owner's switch of that gallery (`audience`: `public` or
 * `private`) is on for the capture: the quality of its images and its nights
 * (`gallery-nights.js`) are shown only then.
 */
export async function qualityShownIn(driver, captureId, audience) {
  const column = COLUMN[audience];
  if (!column) return false;
  const capture = (
    await driver.query(`SELECT ${column} AS shown FROM captures WHERE id = ?`, [
      String(captureId ?? ""),
    ])
  ).rows[0];
  return Boolean(capture) && Number(capture.shown) === 1;
}

/**
 * What a gallery may read of the quality of a capture's images: `{ main,
 * byImage }`, `main` the main image's quality (or `null`), `byImage` a
 * `Map<imageId, quality>` of the images that have one. Both are empty while
 * the gallery's switch is off. `driver` is a database driver, `audience`
 * `private` or `public`; the caller checked the capture is one the gallery
 * shows.
 */
export async function galleryQualityOf(driver, captureId, audience) {
  const none = { main: null, byImage: new Map() };
  if (!(await qualityShownIn(driver, captureId, audience))) return none;
  const id = String(captureId ?? "");
  const byImage = new Map();
  let main = null;
  for (const row of (
    await driver.query(
      `SELECT id, is_main, quality_json FROM capture_variants
       WHERE capture_id = ? AND role IS NULL AND quality_json IS NOT NULL`,
      [id],
    )
  ).rows) {
    const quality = publicImageQuality(row.quality_json);
    if (!quality) continue;
    byImage.set(row.id, quality);
    if (Number(row.is_main) === 1) main = quality;
  }
  return { main, byImage };
}
