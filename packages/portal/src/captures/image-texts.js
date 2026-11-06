import { matchDeviceLocale, shippedLocales } from "astro-contracts/locales";

/**
 * The texts of an image of a capture: the owner's own `title` and
 * `description` (only what he typed, `null` while he typed none) and, apart,
 * the texts a producer generated for it in the ten languages
 * (`generatedTitle`, `generatedDescription`: Astro Sync's name of the
 * processing and its settings, the pipeline's description). One rule shows
 * them everywhere (`capture-variant.schema.json`): the owner's text, else
 * the generated text in the reader's language, else English, else the name
 * by default (`image-names.js`) or nothing.
 */

/**
 * The languages a generated text is written in: the locale registry's, read
 * when asked (a registry replaced for a test is followed).
 */
export const generatedTextLocales = () => shippedLocales();

/** The bounds of a generated text in each language, in characters. */
export const GENERATED_TEXT_LIMITS = Object.freeze({
  generatedTitle: 90,
  generatedDescription: 280,
});

const characters = (text) => [...String(text)].length;

/**
 * Why a generated text is refused (`null` when it is accepted): an object
 * keyed by the ten tags, English required, each a text of 1 to `limit`
 * characters once its outer spaces are trimmed.
 */
export function generatedTextProblem(value, limit) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return "not_object";
  if (!Object.hasOwn(value, "en")) return "english_missing";
  for (const [tag, text] of Object.entries(value)) {
    if (!generatedTextLocales().includes(tag)) return "unknown_locale";
    if (typeof text !== "string" || !text.trim()) return "not_text";
    if (characters(text.trim()) > limit) return "too_long";
  }
  return null;
}

/**
 * A generated text as stored: its entries trimmed, in the order of
 * `generatedTextLocales()` (the same proposal twice stores the same text).
 * Call after `generatedTextProblem` answered `null`.
 */
export function storedGeneratedText(value) {
  const stored = {};
  for (const tag of generatedTextLocales())
    if (typeof value?.[tag] === "string" && value[tag].trim())
      stored[tag] = value[tag].trim();
  return stored;
}

/**
 * A generated text from its column (`capture_variants.generated_title_json`,
 * `generated_description_json`): `null` for none or a value that does not
 * read.
 */
export function generatedTextOf(json) {
  if (!json) return null;
  let value = json;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stored = storedGeneratedText(value);
  return Object.keys(stored).length ? stored : null;
}

/**
 * The entry of a generated text a reader of `locale` reads: the tag the
 * registry's device rule matches (`pt` → `pt-BR`, `zh-TW` → `zh-Hant`),
 * else English; `null` when the text has neither.
 */
export function generatedTextFor(generated, locale = "en") {
  if (!generated || typeof generated !== "object") return null;
  const tag = matchDeviceLocale(String(locale ?? "")) ?? "en";
  const pick = (key) =>
    typeof generated[key] === "string" && generated[key].trim()
      ? generated[key].trim()
      : null;
  return pick(tag) ?? pick("en");
}

const ownText = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/**
 * The title a reader of `locale` reads of an image, before the name by
 * default: the owner's, else the generated one in its language; `null`
 * when the image has neither. `image`: `{ title, generatedTitle }`.
 */
export const imageTitleText = (image, locale = "en") =>
  ownText(image?.title) ?? generatedTextFor(image?.generatedTitle, locale);

/**
 * The description a reader of `locale` reads of an image: the owner's,
 * else the generated one in its language; `null` when it has neither.
 */
export const imageDescriptionText = (image, locale = "en") =>
  ownText(image?.description) ??
  generatedTextFor(image?.generatedDescription, locale);

/**
 * The generated texts of an image's row as an answer carries them: only
 * those it has (an answer without them reads as before).
 */
export function generatedTextsOfRow(row) {
  const title = generatedTextOf(row?.generated_title_json);
  const description = generatedTextOf(row?.generated_description_json);
  return {
    ...(title ? { generatedTitle: title } : {}),
    ...(description ? { generatedDescription: description } : {}),
  };
}

/** The generated texts an image already read carries: only those it has. */
export const generatedTexts = (image) => ({
  ...(image?.generatedTitle ? { generatedTitle: image.generatedTitle } : {}),
  ...(image?.generatedDescription
    ? { generatedDescription: image.generatedDescription }
    : {}),
});
