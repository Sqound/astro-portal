import { skyPictureUrl } from "./sky-pictures.js";

/**
 * Resolves the presentation image for a planner target without making the
 * visual-observing variant mandatory. An authorised visual reference always
 * wins in visual mode, followed by the locally generated muted preview; the
 * photographic image remains the last fallback.
 */
export function targetImageVariant(
  target,
  { visualMode = false, fallback } = {},
) {
  const knowledge = target?.knowledge || target || {};
  const photoUrl =
    target?.featured?.imageUrl ||
    knowledge.photoThumbnailUrl ||
    knowledge.thumbnailUrl ||
    // A bright star or a constellation always has its sky picture, even in a
    // plan saved before the catalogue gave its address.
    skyPictureUrl(target) ||
    fallback ||
    null;
  const visualReferenceUrl = knowledge.visualThumbnailUrl || null;
  const visualPreviewUrl = knowledge.visualPreviewThumbnailUrl || null;
  const visualUrl = visualReferenceUrl || visualPreviewUrl;
  const visualCredit = visualReferenceUrl
    ? knowledge.visualImageCredit || null
    : knowledge.visualPreviewImageCredit || null;
  const usesVisual = Boolean(visualMode && visualUrl);

  return {
    url: usesVisual ? visualUrl : photoUrl,
    credit: usesVisual ? visualCredit : knowledge.photoImageCredit || null,
    source: usesVisual ? "visual" : "photo",
  };
}
