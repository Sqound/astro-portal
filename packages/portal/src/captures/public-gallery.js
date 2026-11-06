import {
  captureMetadata,
  readMetadataInputs,
} from "./capture-metadata-reading.js";
import { normalizeSearch } from "../i18n.js";
import { createPublicGalleryRepository } from "../persistence/public-gallery-repository.js";
import { createSkySolutionRepository } from "../persistence/sky-solution-repository.js";
import { skyBrightnessSource } from "../sky-brightness-source.js";
import { captureStore } from "../uploads/capture-store.js";
import { ensureSharedCopy } from "../uploads/derived-images.js";
import { imageSizeOf, sharedCopySize } from "./shared-image-size.js";
import {
  EQUIPMENT_KIND,
  PUBLIC_GALLERY_TAGS,
  publicProgressionStep,
  publicVariant,
  selectedEquipment,
  publicGalleryCapture,
  publicGalleryItem,
} from "./public-capture-view.js";
import { publicSkySolution } from "./sky-solution.js";
import { galleryQualityOf } from "./gallery-quality.js";
import { galleryNightStatisticsOf } from "./gallery-nights.js";
import { galleryProgressionOf } from "./gallery-progression.js";
import { captureSessionLiveSql } from "../persistence/capture-session-visibility.js";

/** Where a visitor reads the sky annotations of an image. */
const annotationsUrl = (captureId, imageId) =>
  `/api/v1/gallery/${encodeURIComponent(captureId)}/annotations${
    imageId ? `?imageId=${encodeURIComponent(imageId)}` : ""
  }`;

/**
 * The public gallery of the home page: the public captures of every
 * space, read from the database
 * (`persistence/public-gallery-repository.js`), each as the strict view
 * model of `public-capture-view.js`. Behind the three routes
 * `GET /api/v1/gallery`, `GET /api/v1/gallery/{captureId}` and
 * `GET /api/v1/gallery/{captureId}/media`, the same in both shells.
 *
 * No capability is read on this path (a capture of a space with few capabilities may be
 * public). A capture that is not public — private, unknown, removed after
 * reports, refused, of a closed space, unfinished — is `null` here,
 * whatever the reason, so that its route answers the same 404 as for an
 * identifier that never existed.
 *
 * Framework-free like the other resource services: the route adapters give
 * the request's language and turn `null` into the 404.
 */

export const GALLERY_PAGE_DEFAULT = 24;
export const GALLERY_PAGE_MAX = 48;

const pageLimit = (limit) =>
  Math.min(
    GALLERY_PAGE_MAX,
    Math.max(1, Math.trunc(Number(limit)) || GALLERY_PAGE_DEFAULT),
  );

const plain = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

/**
 * The sky quality of the place of a plan, as the planner decides it (the
 * measured nights at the place, then the value the observer typed, then the
 * modelled estimate), as a Bortle class and its source. The place's
 * coordinates are read here, by the estimate, and go no further.
 */
async function skyQualityOf({ location, measures, model }) {
  const place = plain(location);
  let modelled = null;
  if (place.latitude !== undefined && place.longitude !== undefined)
    try {
      modelled = await model({
        latitude: place.latitude,
        longitude: place.longitude,
      });
    } catch {
      modelled = null;
    }
  const chosen = skyBrightnessSource({
    measures,
    entered: place.skyEntered,
    model: modelled,
  });
  if (chosen.shown?.bortleClass)
    return { bortle: chosen.shown.bortleClass, source: chosen.source };
  // The class a place may carry itself (as the owner's detail reads it,
  // `capture-detail.js`).
  const bortle = Number(place.bortle);
  return Number.isInteger(bortle) && bortle >= 1 && bortle <= 9
    ? { bortle, source: "model" }
    : null;
}

/**
 * A public capture's metadata as a visitor reads it
 * (`capture-metadata.js`, audience `visitor`): never the place, the notes,
 * an origin, `edited` nor `finalizedAt`.
 */
async function visitorMetadata(driver, row) {
  const capture = (
    await driver.query(
      `SELECT * FROM captures WHERE id = ? AND tenant_id = ?
         AND archived_at IS NULL AND ${captureSessionLiveSql()}`,
      [row.id, row.tenantId],
    )
  ).rows[0];
  if (!capture) return null;
  const targetIds = (
    await driver.query(
      "SELECT target_id FROM capture_targets WHERE capture_id = ? ORDER BY position",
      [capture.id],
    )
  ).rows.map((entry) => entry.target_id);
  return captureMetadata(
    await readMetadataInputs(driver, row.tenantId, capture, targetIds),
    { audience: "visitor" },
  );
}

export async function createPublicGalleryService({
  driver,
  // The modelled sky quality at a position (`{ bortleClass, sqm }`), or a
  // throw when the raster is not installed: the planner's own loader in
  // the application, a stub in the tests.
  skyQuality = async () => null,
  sharedCopy = ensureSharedCopy,
  imageSize = imageSizeOf,
  // Where the files are (`uploads/capture-store.js`).
  captureStore: givenCaptureStore = null,
} = {}) {
  if (!driver) throw new Error("The public gallery needs a database.");
  const files = () => givenCaptureStore || captureStore();
  const store = await createPublicGalleryRepository({ driver });
  const skies = await createSkySolutionRepository({ driver });

  /** The catalogue, plans and equipment of `rows`, read once. */
  async function context(rows) {
    const targetIds = await store.targetIdsOf(rows.map((row) => row.id));
    const entries = await store.catalogueEntries(
      [...targetIds.values()].flat(),
    );
    const plans = await store.plansOf(rows);
    const ownPlan = (row) => {
      const plan = row.planId ? plans.get(row.planId) : null;
      return plan && plan.tenantId === row.tenantId ? plan : null;
    };
    const equipment = await store.equipmentOf(
      rows.flatMap((row) => selectedEquipment(ownPlan(row)?.equipment)),
    );
    const targetsOf = (row) =>
      (targetIds.get(row.id) || []).map(
        (id) => entries.get(id) || { id, designation: id },
      );
    const equipmentOf = (row) =>
      selectedEquipment(ownPlan(row)?.equipment)
        .map((id) => equipment.get(id))
        .filter(
          (entry) =>
            entry &&
            EQUIPMENT_KIND[entry.type] &&
            (entry.tenantId === row.tenantId || entry.scope === "default"),
        )
        .map((entry) => ({
          kind: EQUIPMENT_KIND[entry.type],
          name: entry.name,
        }));
    return { targetsOf, equipmentOf, ownPlan };
  }

  const item = (row, { targetsOf, equipmentOf }, locale) =>
    publicGalleryItem({
      row,
      targets: targetsOf(row),
      telescope:
        equipmentOf(row).find((entry) => entry.kind === "telescope")?.name ??
        null,
      locale,
    });

  const searchable = (capture, locale) =>
    normalizeSearch(
      capture.targets
        .flatMap((target) => [
          target.designation,
          target.name,
          ...target.aliases,
        ])
        .filter(Boolean)
        .join(" "),
      locale,
    );

  return {
    async close() {
      await store.close?.();
    },

    /**
     * A page of the home gallery: `captures` (the cards), `total` (after the
     * filters), `publicTotal` (every public capture: « 6 / 6 captures
     * publiques »), `nextOffset` (`null` at the end) and `tags` (the generic
     * tags of the public captures, in the gallery's order).
     */
    async list({
      locale = "en",
      query = "",
      tag = "",
      offset = 0,
      limit,
      newestFirst = true,
      all = false,
    } = {}) {
      const rows = await store.listPublic({ newestFirst });
      const read = await context(rows);
      const captures = rows.map((row) => item(row, read, locale));
      const tags = PUBLIC_GALLERY_TAGS.filter((candidate) =>
        captures.some((capture) => capture.tag === candidate),
      );
      const needle = normalizeSearch(String(query || "").trim(), locale);
      const found = captures.filter(
        (capture) =>
          (!tag || capture.tag === tag) &&
          (!needle || searchable(capture, locale).includes(needle)),
      );
      const start = Math.max(0, Math.trunc(Number(offset)) || 0);
      const size = all ? Math.max(found.length, 1) : pageLimit(limit);
      return {
        captures: found.slice(start, start + size),
        total: found.length,
        publicTotal: captures.length,
        nextOffset: start + size < found.length ? start + size : null,
        tags,
      };
    },

    /** One public capture for its detail page, or `null`. */
    async get({ captureId, locale = "en" }) {
      const row = await store.getPublic(captureId);
      if (!row) return null;
      const read = await context([row]);
      const plan = read.ownPlan(row);
      const location = plan?.location ?? null;
      const image = await sharedCopySize({
        sharedCopy,
        captureStore: files(),
        tenantId: row.tenantId,
        sha256: row.sha256,
        originalName: row.originalName,
        imageSize,
      });
      // The sky solution of the
      // image shown — the main one, each public variant — only while it
      // exists and the owner's switch is on; absent otherwise, so that the
      // page is the one of before. A variant without a solution has none,
      // and does not hide the main image's.
      const sky = await skies.galleryOf(row.id);
      const solutionOf = (imageId, sha256) => {
        const stored = imageId ? sky.solutions.get(imageId) : null;
        return stored && stored.sha256 === sha256 ? stored.solution : null;
      };
      // The quality of each image, only while the owner's switch
      // « Afficher la qualité en public » is on.
      const quality = await galleryQualityOf(driver, row.id, "public");
      const variants = (await store.shownVariants(row.id)).map((image) => {
        const shown = {
          ...publicVariant(row.id, image),
          ...(quality.byImage.has(image.id)
            ? { quality: quality.byImage.get(image.id) }
            : {}),
        };
        const solution = solutionOf(image.id, image.sha256);
        return solution
          ? {
              ...shown,
              skySolution: publicSkySolution(
                solution,
                annotationsUrl(row.id, image.id),
              ),
            }
          : shown;
      });
      const mainSolution = solutionOf(sky.mainImageId, row.sha256);
      const capture = publicGalleryCapture({
        row,
        variants,
        mainImage: await store.mainImageNames(row.id),
        targets: read.targetsOf(row),
        equipment: read.equipmentOf(row),
        skyQuality: location
          ? await skyQualityOf({
              location,
              measures: await store.placeMeasures(
                row.tenantId,
                plain(location).id,
              ),
              model: skyQuality,
            })
          : null,
        image,
        locale,
        metadata: await visitorMetadata(driver, row),
        quality: quality.main,
        // The milestones, shown with the capture (no switch of their own).
        progression: await (async () => {
          const found = await galleryProgressionOf(driver, row.id);
          return {
            plan: found.plan,
            steps: found.steps.map((step) =>
              publicProgressionStep(row.id, step),
            ),
          };
        })(),
        // The nights' values and charts, under the switch of the quality.
        ...(await galleryNightStatisticsOf(driver, row.id, "public")),
      });
      return mainSolution
        ? {
            ...capture,
            skySolution: publicSkySolution(
              mainSolution,
              annotationsUrl(row.id, null),
            ),
          }
        : capture;
    },

    /**
     * Where the published file of a public capture is: the shared copy written
     * by the processing after the upload (no EXIF, XMP nor IPTC, so no
     * position; 4096 px at most), never the original; `variant: "thumbnail"`
     * its thumbnail, or the shared copy while it has none.
     * `{ file, tenantId, sha256, variant }` (`file` names it in the capture
     * store), or `null`.
     */
    async media({ captureId, variant = "image", imageId = null }) {
      const shown = await store.getPublic(captureId);
      if (!shown) return null;
      // Another image of the capture (`imageId`).
      let row = shown;
      if (imageId) {
        // A variant its owner made public, or a milestone of the capture.
        const image =
          (await store.shownVariants(shown.id)).find(
            (entry) => entry.id === imageId,
          ) ??
          (await galleryProgressionOf(driver, shown.id)).steps.find(
            (entry) => entry.id === imageId,
          );
        if (!image) return null;
        row = {
          ...shown,
          sha256: image.sha256,
          originalName: image.originalName,
        };
      }
      if (variant === "thumbnail") {
        if (
          await files()
            .stat({
              tenantId: row.tenantId,
              sha256: row.sha256,
              file: "thumbnail",
            })
            .catch(() => null)
        )
          return {
            file: "thumbnail",
            tenantId: row.tenantId,
            sha256: row.sha256,
            variant: "thumbnail",
          };
      }
      try {
        await sharedCopy({
          tenantId: row.tenantId,
          sha256: row.sha256,
          originalName: row.originalName,
          captureStore: files(),
        });
        return {
          file: "shared",
          tenantId: row.tenantId,
          sha256: row.sha256,
          variant: "image",
        };
      } catch {
        return null;
      }
    },
  };
}
