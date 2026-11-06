import { canonicalObjectType } from "astro-core/catalog-taxonomy.js";

/**
 * The generic tags of a capture (the default tag is at least the type of the
 * target): the one
 * vocabulary of the web and the phone. A generic tag has a **key** (the
 * contract's word: `galaxy`, `nebula`, …; `gallery.schema.json` →
 * `$defs.tag["x-keys"]`) and a **stored value**, the catalogue's French word
 * (« Nébuleuse »): the value is what `capture_tags`, `target_catalogue_entries
 * .gallery_label` and every v1 answer have always carried, so storage and
 * wire stay as they were; the key names the word in the code and in the
 * catalogues. A page translates the value (`gallery-tags.js` `localizedTag`);
 * an owner's own tag is written as it is.
 *
 * Pure: no database, no file.
 */
export const GENERIC_TAGS = Object.freeze(
  [
    {
      key: "galaxy",
      value: "Galaxie",
      types: ["Galaxie"],
    },
    {
      key: "nebula",
      value: "Nébuleuse",
      types: [
        "Nébuleuse en émission",
        "Nébuleuse en réflexion",
        "Nébuleuse planétaire",
        "Nébuleuse sombre",
        "Rémanent de supernova",
      ],
    },
    {
      key: "cluster",
      value: "Amas",
      types: ["Amas globulaire", "Amas ouvert"],
    },
    { key: "moon", value: "Lune", types: ["Lune"] },
    { key: "planet", value: "Planète", types: ["Planète", "Planète naine"] },
    { key: "sun", value: "Soleil", types: ["Soleil"] },
    // A star and a comet had no generic tag.
    { key: "star", value: "Étoile", types: ["Étoile", "Étoile brillante"] },
    { key: "comet", value: "Comète", types: ["Comète"] },
    // A capture without a target.
    { key: "wide_field", value: "Grand champ", types: [] },
  ].map((tag) => Object.freeze({ ...tag, types: Object.freeze(tag.types) })),
);

/**
 * « Messier »: a generic word too (the public card says it of a target of
 * the Messier catalogue) but never a type's default, nor a label a personal
 * target takes.
 */
export const MESSIER_TAG = Object.freeze({ key: "messier", value: "Messier" });

/** Every word `localizedTag` translates, the default ones first. */
export const GENERIC_TAG_WORDS = Object.freeze([
  ...GENERIC_TAGS.map((tag) => tag.value),
  MESSIER_TAG.value,
]);

/**
 * The generic tags of the galleries, in their order (the public gallery's
 * filter bar, a personal target's label): the stored values.
 */
export const PUBLIC_GALLERY_TAGS = Object.freeze(
  GENERIC_TAGS.map((tag) => tag.value),
);

const TAG_OF_TYPE = new Map(
  GENERIC_TAGS.flatMap((tag) => tag.types.map((type) => [type, tag.value])),
);

/** Whether a stored word is one of the generic tags (« Messier » included). */
export const isGenericTag = (word) => GENERIC_TAG_WORDS.includes(word);

/** The contract's key of a stored generic word, or `null`. */
export function genericTagKey(word) {
  if (word === MESSIER_TAG.value) return MESSIER_TAG.key;
  return GENERIC_TAGS.find((tag) => tag.value === word)?.key ?? null;
}

/** The stored word of a contract's key, or `null`. */
export function genericTagValue(key) {
  if (key === MESSIER_TAG.key) return MESSIER_TAG.value;
  return GENERIC_TAGS.find((tag) => tag.key === key)?.value ?? null;
}

/** The generic tag of a catalogue type (`null` for a type without one). */
export function publicGalleryTag(typeKey, { hasTarget = true } = {}) {
  if (!hasTarget) return "Grand champ";
  if (typeof typeKey !== "string" || !typeKey) return null;
  return TAG_OF_TYPE.get(canonicalObjectType(typeKey)) ?? null;
}

/**
 * The generic tag a capture takes by default, from its first target's row of
 * the library (`type_key`, `library_source`, `gallery_label`): the target's
 * type for a catalogue target, the label its owner chose for a personal one,
 * « Grand champ » without a target; `null` for a type without a generic tag.
 */
export function defaultGenericTag(entry) {
  if (!entry) return "Grand champ";
  if (entry.library_source === "personal")
    return PUBLIC_GALLERY_TAGS.includes(entry.gallery_label)
      ? entry.gallery_label
      : "Grand champ";
  return publicGalleryTag(entry.type_key);
}
