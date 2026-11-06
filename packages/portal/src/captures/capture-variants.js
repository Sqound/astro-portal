import { generatedTextsOfRow } from "./image-texts.js";

/**
 * The images of a capture: a
 * capture has **one main image** and **variants** — never a history, never
 * a « go back ». Technical name `variants` (as `capture.variant_limit`);
 * the word on screen is « variante », « image principale ».
 *
 * This module holds the resource of an image and the rules of the owner's
 * gestures, one function per rule, so that a later change of rule
 * changes one of them alone. The persistence (`capture_variants`) is the
 * capture repository's; the gestures are the owner's service's
 * (`owner-captures.js`), from the web session only.
 */

/** The sources of an image (`capture_variants.source`). */
export const VARIANT_SOURCES = Object.freeze([
  "phone",
  "web",
  "astro-sync",
  "stacking",
]);

/**
 * The roles an image of a capture may have besides the main image and the
 * variants (`capture_variants.role`):
 * `progression`, a milestone of the night Astro Sync stacked, the history
 * of the capture — never its main image, never a variant, never counted
 * against `capture.variant_limit`, private, shown on the capture's page
 * only.
 */
export const VARIANT_ROLES = Object.freeze(["progression"]);

/** Whether an image of a capture is one of its progression images. */
export const isProgressionImage = (image) =>
  (image?.role ?? null) === "progression";

/**
 * A new image sent for an existing capture never becomes its main image by
 * itself (the image online is kept; its owner chooses).
 */
export const NEW_IMAGE_IS_MAIN = false;

/**
 * One image of a capture as the owner's routes write it
 * (`capture-variant.schema.json`). Its file is found by the space and its
 * digest, like every original. `row.auto_check` is already the result as
 * its owner reads it: the capture repository, which holds the verdict of the
 * automatic check, reads it before calling this function.
 */
export function variantResource(row) {
  return {
    id: row.id,
    main: Number(row.is_main) === 1,
    sha256: row.sha256,
    byteSize: Number(row.byte_size),
    originalName: row.original_name,
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    source: row.source ?? null,
    // A variant's own visibility; the main image follows its capture.
    public: Number(row.is_public) === 1,
    automaticCheck: row.auto_check ?? null,
    createdAt: row.created_at,
    // The owner's optional title and description of the image (only what
    // he typed); `null` reads the generated text, else « by default ».
    title: row.title ?? null,
    description: row.description ?? null,
    // The texts a producer generated in the ten languages, kept apart
    // (`image-texts.js`); only those the image has.
    ...generatedTextsOfRow(row),
    // Where the title came from (`astro-sync`, `import`, `owner`; `null`
    // while there is none) and whether the owner wrote the title or the
    // description (a proposal never changes them afterwards).
    titleSource: row.title_source ?? null,
    edited: Boolean(row.edited_at),
    // `progression` for a milestone of the night (see `VARIANT_ROLES`),
    // `null` for the main image and the variants; the light frames a
    // milestone stacks.
    role: row.role ?? null,
    frameCount: row.frame_count == null ? null : Number(row.frame_count),
    // The quality of the stacked image as Astro Sync measured it
    // (`imageQuality`), `null` when none was; read without a capability.
    quality: storedImageQuality(row.quality_json),
  };
}

/**
 * The quality of a stacked image (`capture.schema.json` `imageQuality`)
 * as `capture_variants.quality_json` keeps it: `null` for an image that
 * has none or a value that does not read.
 */
export function storedImageQuality(json) {
  if (typeof json !== "string" || !json) return null;
  try {
    const value = JSON.parse(json);
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

/**
 * The bounds of an image's title and description, in characters.
 */
export const VARIANT_TEXT_LIMITS = Object.freeze({
  title: 90,
  description: 280,
});

/** Characters, as a person counts them (a code point each). */
export const textLength = (text) => [...String(text ?? "")].length;

/**
 * The title or the description as stored: the spaces at both ends trimmed,
 * nothing else changed (the text a person types is never normalised); a
 * blank one is `null`, which gives the image its name by default back.
 */
export function storedVariantText(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

/**
 * Why a title or a description is refused (`null` when it is accepted):
 * `unknown_field`, `not_text` (neither a string nor `null`), `too_long`.
 */
export function variantTextProblem(field, value) {
  if (!Object.hasOwn(VARIANT_TEXT_LIMITS, field)) return "unknown_field";
  if (value !== null && typeof value !== "string") return "not_text";
  const stored = storedVariantText(value);
  if (stored !== null && textLength(stored) > VARIANT_TEXT_LIMITS[field])
    return "too_long";
  return null;
}

/**
 * The rank of arrival of each image of a capture (« the number is the
 * arrival rank of the image in the capture, the first one sent is 1,
 * computed at display time, never stored »): `Map<id, rank>`, oldest
 * first, the identifier breaking a tie. `images` are every image of the
 * capture, `{ id, createdAt }`.
 */
export function arrivalRanks(images) {
  const ordered = [...images].sort(
    (left, right) =>
      String(left.createdAt ?? left.created_at).localeCompare(
        String(right.createdAt ?? right.created_at),
      ) || String(left.id).localeCompare(String(right.id)),
  );
  return new Map(ordered.map((image, index) => [image.id, index + 1]));
}

const refusal = (code, message, status = 409) => ({ code, message, status });

/**
 * Whether a visitor (the public gallery, the private gallery) sees an
 * image: the main one as its capture is shown; a variant while it is
 * public and its capture is public.
 */
export function shownToVisitors({ capture, image }) {
  if (image.main) return true;
  return image.public === true && capture.visibility === "public";
}

/**
 * « Utiliser comme image principale »: any image of the capture whose own
 * automatic check has passed (the check belongs to each image, answer 4).
 * `null` when allowed.
 */
export function mainImageRefusal({ image }) {
  if (image.main) return null;
  if (isProgressionImage(image))
    return refusal(
      "progression_image",
      "A progression image is the history of its capture: it is never its main image.",
    );
  if (image.automaticCheck !== "sky")
    return refusal(
      "variant_check_not_passed",
      "This image has not passed its automatic check: it cannot be the main image.",
    );
  return null;
}

/**
 * A variant's own visibility: the main image follows its capture
 * (`main_image`); public only while its capture is public
 * (`capture_not_public`) and after its own check
 * (`variant_check_not_passed`). Back to private: always.
 */
export function variantVisibilityRefusal({ capture, image, shown }) {
  if (image.main)
    return refusal(
      "main_image",
      "The main image follows the visibility of its capture.",
    );
  if (!shown) return null;
  if (isProgressionImage(image))
    return refusal(
      "progression_image",
      "A progression image is the history of its capture: it stays private.",
    );
  if (capture.visibility !== "public")
    return refusal(
      "capture_not_public",
      "A variant is public only while its capture is public.",
    );
  if (image.automaticCheck !== "sky")
    return refusal(
      "variant_check_not_passed",
      "This image has not passed its automatic check.",
    );
  return null;
}

/**
 * Deleting an image: never the main one alone (answer 3: choose another
 * main image first, or delete the capture) — so never the last one either.
 */
export function variantDeletionRefusal({ image }) {
  return image.main
    ? refusal(
        "main_image",
        "The main image of a capture is not deleted alone: choose another main image first, or delete the capture.",
      )
    : null;
}
