import { galleryMediaPath } from "./gallery-paths.js";

/**
 * A capture of the private gallery in the shape of the public gallery's
 * detail page (the private and the public gallery share the same code, the public gallery
 * being the reference): the page of a capture is one component,
 * `PublicCapturePage`, fed here with the view `capture()` of the private
 * gallery (`private-gallery.js`) — the same fields as
 * `public-capture-view.js` writes (`gallery.schema.json`, `#/$defs/capture`)
 * — whose files go through the gallery's gate (`galleryMediaPath`), never
 * the public routes.
 *
 * Pure. `view` is `{ publicName, capture }` as the service answers; the
 * result has no address of the public gallery and the page that draws it
 * writes none of the private one: the addresses are given to it (`backHref`,
 * `reportPath`).
 */
export function privateCaptureAsPublic({ token, view }) {
  const { capture } = view;
  const image = (imageId = null) =>
    galleryMediaPath(token, capture.id, { imageId });
  return {
    id: capture.id,
    targets: capture.targets ?? [],
    nightMonth: capture.nightMonth ?? null,
    ...(capture.nightMonthEnd ? { nightMonthEnd: capture.nightMonthEnd } : {}),
    // The space's « Nom public », nothing without it.
    signature: view.publicName || null,
    equipment: capture.equipment ?? [],
    skyQuality: capture.skyQuality ?? null,
    image: capture.image ?? null,
    // No file yet (no thumbnail made): the page draws its placeholder.
    media: {
      image: capture.thumbnail ? image() : null,
      thumbnail: capture.thumbnail
        ? galleryMediaPath(token, capture.id, { thumbnail: true })
        : null,
    },
    mainImage: capture.mainImage ?? null,
    variants: (capture.variants ?? []).map((variant) => ({
      ...variant,
      image: variant.image ?? null,
      media: {
        image: image(variant.id),
        thumbnail: galleryMediaPath(token, capture.id, {
          thumbnail: true,
          imageId: variant.id,
        }),
      },
    })),
    ...(capture.metadata ? { metadata: capture.metadata } : {}),
    ...(capture.skySolution ? { skySolution: capture.skySolution } : {}),
    ...(capture.quality ? { quality: capture.quality } : {}),
    ...(capture.progression?.steps?.length
      ? {
          progression: {
            plan: Boolean(capture.progression.plan),
            steps: capture.progression.steps.map((step) => ({
              ...step,
              media: {
                image: image(step.id),
                thumbnail: galleryMediaPath(token, capture.id, {
                  thumbnail: true,
                  imageId: step.id,
                }),
              },
            })),
          },
        }
      : {}),
    ...(capture.nights?.length ? { nights: capture.nights } : {}),
    ...(capture.qualityCharts ? { qualityCharts: capture.qualityCharts } : {}),
  };
}

const monthOf = (value) => {
  const month = String(value || "").slice(0, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null;
};

/**
 * One capture of the private gallery's list in the shape of the public
 * gallery's card (same rule as `privateCaptureAsPublic`): the list is drawn
 * by the public gallery's components (`GalleryList.js`), fed here with the
 * item the service answers (`private-gallery.js` `item()`). The card's tags
 * are the generic ones, « Messier » for a Messier object as the public card
 * says it, then the owner's own (free text, written as typed: the private
 * gallery's alone); the signature is the space's « Nom public »; the
 * thumbnail goes through the gallery's gate (`galleryMediaPath`), `null`
 * where none was made yet (the card draws its placeholder).
 *
 * Pure. `publicName` is the gallery's, `view.publicName`.
 */
export function privateItemAsPublic({ token, item, publicName = null }) {
  const generic = item.tags ?? [];
  const first = item.targets?.[0];
  return {
    id: item.id,
    targets: item.targets ?? [],
    tag: generic[0] ?? null,
    tags: [
      ...new Set([
        ...generic,
        ...(first && /^M\d+$/.test(first.designation) ? ["Messier"] : []),
        ...(item.ownTags ?? []),
      ]),
    ],
    telescope: item.telescope ?? null,
    exposure: null,
    nightMonth: item.nightMonth ?? monthOf(item.night) ?? monthOf(item.addedAt),
    ...(item.nightMonthEnd ? { nightMonthEnd: item.nightMonthEnd } : {}),
    signature: publicName || null,
    media: {
      image: item.thumbnail ? galleryMediaPath(token, item.id) : null,
      thumbnail: item.thumbnail
        ? galleryMediaPath(token, item.id, { thumbnail: true })
        : null,
    },
  };
}
