import { message } from "../i18n.js";
import { imageDescriptionText, imageTitleText } from "./image-texts.js";

/**
 * The name of an image of a capture: its owner's
 * title, else the title a producer generated in the reader's language
 * (`image-texts.js`), or by default « Image principale » for the main image
 * and « Variante N » for a variant, N its rank of arrival in the capture —
 * computed at display, never stored. One rule for the owner's detail and the
 * two galleries; the phone reads the same (`captureImageName`).
 *
 * `image`: `{ title, generatedTitle, main, arrivalRank }`.
 */
export function imageName(image, locale = "en") {
  const title = imageTitleText(image, locale);
  if (title) return title;
  if (image?.main) return message(locale, "imageMainDefault");
  return defaultVariantName(image?.arrivalRank, locale);
}

/** « Variante 2 »: a variant's name by default. */
export const defaultVariantName = (rank, locale = "en") =>
  message(locale, "imageVariantDefault").replace(
    "{rank}",
    String(Number.isInteger(rank) && rank > 0 ? rank : 1),
  );

/** The description a reader of `locale` reads of an image, or `null`. */
export const imageDescription = (image, locale = "en") =>
  imageDescriptionText(image, locale);

/**
 * The images of a capture's page in the galleries: the main image, then
 * every public variant, each by its name, with its description in the
 * reader's language. `capture` carries `mainImage` and `variants` as the public
 * gallery and the private gallery write them; `null` when there is no
 * public variant (one image: no arrows, no dots).
 */
export function shownImages(capture, locale = "en") {
  const variants = Array.isArray(capture?.variants) ? capture.variants : [];
  const main = {
    id: capture?.mainImage?.id ?? "main",
    main: true,
    title: capture?.mainImage?.title ?? null,
    description: capture?.mainImage?.description ?? null,
    generatedTitle: capture?.mainImage?.generatedTitle ?? null,
    generatedDescription: capture?.mainImage?.generatedDescription ?? null,
    arrivalRank: capture?.mainImage?.arrivalRank ?? 1,
    // The sky solution of the main image (the view carries it only while
    // it exists and the owner's switch is on).
    skySolution: capture?.skySolution ?? null,
    // The quality of the main image (the view carries it only while
    // the owner's switch of the gallery is on).
    quality: capture?.quality ?? null,
  };
  const images = [
    main,
    ...variants.map((variant) => ({ ...variant, main: false })),
  ].map((image) => ({
    ...image,
    name: imageName(image, locale),
    description: imageDescription(image, locale),
  }));
  return { images, several: variants.length > 0 };
}
