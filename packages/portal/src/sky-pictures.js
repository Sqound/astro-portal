import {
  skyCultureImageKind,
  skyCultureImageUrl,
} from "astro-core/sky-culture-images.js";
import { message } from "./i18n.js";

/**
 * The pictures of the bright stars and of the constellations on the web: the
 * application's sky map, pre-rendered and served beside the other target
 * pictures (`astro-core/sky-culture-images.js`). A bright star is ringed in
 * gold on the lines of its constellation; a constellation shows its lines
 * and its drawing, and its bare sky for « Prévisualiser ». The same picture
 * in the photo and the visual mode: it is a map, not a photograph, so it
 * never takes the eyepiece's disc.
 */

/** The catalogue id of a target's sky picture, or null when it has none. */
export function skyPictureIdOf(target) {
  for (const candidate of [
    target?.id,
    target?.targetId,
    target?.catalogueId,
    target?.knowledge?.id,
    target?.target?.id,
  ])
    if (skyCultureImageKind(candidate)) return candidate;
  return null;
}

/** `"star"`, `"constellation"` or null. */
export function skyPictureKindOf(target) {
  return skyCultureImageKind(skyPictureIdOf(target));
}

/** The address of one variant of a target's sky picture, or null. */
export function skyPictureUrl(target, variant = "thumbnail") {
  return skyCultureImageUrl(skyPictureIdOf(target), variant);
}

/** The picture the full-screen viewer shows: the large one for a sky
 * picture, else the image the thumbnail showed. */
export function skyPictureViewerUrl(target, url) {
  return skyPictureUrl(target, "full") || url;
}

/** The credit of the constellations' drawings, in the page's language. */
export function skyCultureArtCredit(locale) {
  return message(locale, "skyCultureArtCredit");
}

const counted = (locale, key, count) => {
  const category = new Intl.PluralRules(locale).select(count);
  const suffix = { one: "One", few: "Few" }[category] || "";
  return message(locale, `${key}${suffix}`).replace(
    "{count}",
    new Intl.NumberFormat(locale).format(count),
  );
};

/**
 * The subtitle of a bright star or of a constellation on the catalogue's
 * card, else null (the card keeps « type · constellation »):
 * « Étoile brillante · Lyre · mag. 0,0 » and « Constellation · 1 étoile
 * brillante · 43 cibles » (a count of zero, or one the answer does not
 * carry, is left out).
 */
export function skyCatalogueMetaLine(target, locale) {
  const kind = skyPictureKindOf(target);
  if (!kind) return null;
  if (kind === "constellation") {
    const info = target?.constellationInfo || {};
    const stars = Number(info.brightStarCount) || 0;
    const targets = Number(info.targetCount) || 0;
    return [
      target?.type,
      stars > 0
        ? counted(locale, "catalogueConstellationBrightStars", stars)
        : null,
      targets > 0
        ? counted(locale, "catalogueConstellationTargets", targets)
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const magnitude = Number(target?.magnitude);
  return [
    target?.type,
    target?.constellation,
    target?.magnitude !== null &&
    target?.magnitude !== undefined &&
    Number.isFinite(magnitude)
      ? message(locale, "targetPhotoViewerMagnitude").replace(
          "{value}",
          new Intl.NumberFormat(locale, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }).format(magnitude),
        )
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
