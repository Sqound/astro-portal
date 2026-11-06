import { catalogueDesignation } from "astro-core/catalogue-designation.js";
import { PUBLIC_GALLERY_TAGS, publicGalleryTag } from "./generic-tags.js";
import { targetLabel } from "./capture-detail.js";
import { galleryProgressionStep } from "./gallery-progression.js";
import { generatedTexts } from "./image-texts.js";

export {
  formatNightMonth,
  formatNightMonths,
  publicCaptureAliases,
  publicCaptureTitle,
} from "./public-capture-format.js";

/**
 * What the public gallery says of one capture (`HomeGalleryWide`,
 * `PublicCapture`), built after the strict view model the publications had:
 * the reader gives the rows, this module picks, field by field, the few
 * things a visitor may read, and nothing it does not name ever leaves
 * (`gallery.schema.json`, `additionalProperties: false` at every level).
 * Never the place, its name nor its coordinates, the day of the night, an
 * e-mail address, a space or a person, the original file name, a device
 * (the signature is the space's « Nom public », nothing without it).
 *
 * Pure: no database, no file. `publicGalleryItem` is a card of the home
 * page; `publicGalleryCapture` the detail page, the card plus the
 * equipment by kind, the sky quality and the pixel size of the published
 * file.
 */

const MEDIA_ROOT = "/api/v1/gallery";

// The generic tags (`generic-tags.js`, the one vocabulary of the web and the
// phone): derived from the object type of the capture's first target, never a
// free word; a capture without a catalogue target is « Grand champ ». The
// French words are the catalogue's stable keys, translated by the page
// (`GalleryPage.js`, `localizedTag`).
export { PUBLIC_GALLERY_TAGS, publicGalleryTag };

/** `YYYY-MM` of an ISO date or timestamp, or `null`. */
export function nightMonth(value) {
  const match =
    typeof value === "string" ? /^(\d{4})-(\d{2})(?:-|$)/.exec(value) : null;
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : null;
}

/**
 * The month, or the period, of the nights a capture combines (the image of a
 * multi-night plan): `{ nightMonth }` for one month, `{ nightMonth,
 * nightMonthEnd }` from the first to the last month when they differ, `null`
 * without a night. Months only: never a day, never a place.
 */
export function nightMonthsOf(dates = []) {
  const months = dates
    .map((date) => nightMonth(date))
    .filter(Boolean)
    .sort();
  if (!months.length) return null;
  const first = months[0];
  const last = months[months.length - 1];
  return last === first
    ? { nightMonth: first }
    : { nightMonth: first, nightMonthEnd: last };
}

/**
 * The order of the home gallery: the date of the night (the session's
 * start, otherwise the upload's `created_at`), newest first, then the id;
 * `newestFirst: false` is « Inverser le tri par date ».
 */
export function comparePublicCaptures(
  left,
  right,
  { newestFirst = true } = {},
) {
  const byNight = String(left.nightAt ?? "").localeCompare(
    String(right.nightAt ?? ""),
  );
  const order = byNight || String(left.id).localeCompare(String(right.id));
  return newestFirst ? -order : order;
}

const parseList = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const finiteOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const textOrNull = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** One target of the catalogue as the gallery reads it. */
export function publicTarget(entry, locale) {
  const label = targetLabel(entry, locale);
  const aliases = parseList(entry.aliases_json ?? entry.aliases)
    .map((alias) => catalogueDesignation(alias))
    .filter((alias) => alias && alias !== label.designation);
  const ra = finiteOrNull(entry.ra_hours);
  const dec = finiteOrNull(entry.dec_degrees);
  return {
    id: String(entry.id),
    designation: label.designation,
    name: label.name,
    // The second line, « M31 · NGC 224 »: the designation and its first alias
    // of the catalogue.
    aliases: [...new Set(aliases)].slice(0, 1),
    type: textOrNull(entry.type_key),
    constellation: textOrNull(entry.constellation_key),
    // Right ascension in degrees, as the sky map and the detail page read it.
    ra: ra === null ? null : ra * 15,
    dec,
  };
}

const isMessier = (entry) =>
  parseList(entry.catalogues_json ?? entry.catalogues).some(
    (name) => String(name).toLowerCase() === "messier",
  ) || /^M\d+$/.test(catalogueDesignation(entry.designation ?? ""));

/**
 * One card of the home gallery. `row` is the capture as the repository
 * reads it (`id`, `nightAt`, `publicName`); `targets` its catalogue
 * entries in their order; `telescope` the name of the night's telescope or
 * lens, or `null`.
 */
export function publicGalleryItem({
  row,
  targets = [],
  telescope = null,
  locale = "en",
}) {
  const read = targets.map((entry) => publicTarget(entry, locale));
  const first = targets[0] ?? null;
  // A personal target of the space carries its own generic label,
  // chosen by its owner among the same tags.
  const personal = first?.library_source === "personal";
  const tag = personal
    ? PUBLIC_GALLERY_TAGS.includes(first.gallery_label)
      ? first.gallery_label
      : "Grand champ"
    : publicGalleryTag(first?.type_key, { hasTarget: Boolean(first) });
  const tags = [
    ...(tag ? [tag] : []),
    ...(first && !personal && isMessier(first) ? ["Messier"] : []),
  ];
  const id = String(row.id);
  return {
    id,
    targets: read,
    tag,
    tags,
    telescope: textOrNull(telescope),
    // No capture carries its exposure today (no column, no source): the
    // card and the panel draw the line only when a later source fills it.
    exposure: null,
    // The month of the night; for the image of a multi-night plan, the
    // months of the nights it combines (`nightDates`), not of its upload.
    ...(nightMonthsOf(row.nightDates) ?? {
      nightMonth: nightMonth(row.nightAt) ?? nightMonth(row.createdAt),
    }),
    signature: textOrNull(row.publicName),
    media: {
      image: `${MEDIA_ROOT}/${encodeURIComponent(id)}/media`,
      thumbnail: `${MEDIA_ROOT}/${encodeURIComponent(id)}/media?variant=thumbnail`,
    },
  };
}

const EQUIPMENT_KINDS = ["telescope", "camera", "mount", "filter"];

/**
 * The kind a row of the equipment table is shown under (one rule for the
 * public gallery and the private one): a lens is a telescope.
 */
export const EQUIPMENT_KIND = Object.freeze({
  telescope: "telescope",
  lens: "telescope",
  camera: "camera",
  mount: "mount",
  filter: "filter",
});

const plainObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

/** The equipment identifiers a plan's selection names. */
export function selectedEquipment(selection) {
  const chosen = plainObject(selection);
  const ids = [chosen.telescopeId, chosen.cameraId, chosen.mountId];
  if (Array.isArray(chosen.filterIds)) ids.push(...chosen.filterIds);
  return ids.filter((id) => typeof id === "string" && id);
}

/**
 * The equipment of a night as the detail page draws it: `[{ kind, name }]`
 * of the four kinds, a name that says something, in the order
 * « Télescope », « Caméra », « Monture », « Filtre ».
 */
export function publicEquipment(equipment = []) {
  return equipment
    .filter(
      (item) => EQUIPMENT_KINDS.includes(item?.kind) && textOrNull(item?.name),
    )
    .map((item) => ({ kind: item.kind, name: item.name.trim() }))
    .sort(
      (left, right) =>
        EQUIPMENT_KINDS.indexOf(left.kind) -
        EQUIPMENT_KINDS.indexOf(right.kind),
    );
}

/**
 * The detail page: the card, plus the equipment of the night by kind
 * (« Télescope », « Caméra », « Monture », « Filtre », in that order), the
 * sky quality of the place as a Bortle class and its source — never the
 * place — and the pixel size of the published file.
 */
/**
 * One variant of a public
 * capture that its owner made public, as a visitor reads it — its two
 * files (`?imageId=` of the media route; `variant=thumbnail` is the size)
 * and its pixel size, nothing else (no name, no source, no date).
 */
export function publicVariant(captureId, image) {
  const base = `${MEDIA_ROOT}/${encodeURIComponent(String(captureId))}/media`;
  const query = `imageId=${encodeURIComponent(String(image.id))}`;
  const width = Number(image.width);
  const height = Number(image.height);
  return {
    id: String(image.id),
    media: {
      image: `${base}?${query}`,
      thumbnail: `${base}?variant=thumbnail&${query}`,
    },
    image:
      Number.isInteger(width) &&
      width > 0 &&
      Number.isInteger(height) &&
      height > 0
        ? { width, height }
        : null,
    // Its owner's names — the name in the band under the image, and the
    // description.
    ...imageNames(image),
  };
}

/**
 * One milestone of a public capture's progression as a visitor reads it: its
 * frames, its pixel size and its two files (`?imageId=` of the media route).
 */
export function publicProgressionStep(captureId, step) {
  const base = `${MEDIA_ROOT}/${encodeURIComponent(String(captureId))}/media`;
  const query = `imageId=${encodeURIComponent(String(step.id))}`;
  return galleryProgressionStep(step, {
    image: `${base}?${query}`,
    thumbnail: `${base}?variant=thumbnail&${query}`,
  });
}

/**
 * The names a visitor reads of an image — its owner's title and
 * description (`null`: « by default », none), the texts a producer
 * generated in the ten languages and its rank of arrival, the number of its
 * name by default; nothing else (no date, file nor count).
 */
export function imageNames(image) {
  const rank = Number(image?.arrivalRank);
  return {
    title: image?.title ?? null,
    description: image?.description ?? null,
    // The texts a producer generated in the ten languages, shown in the
    // visitor's language while the owner typed none (`image-texts.js`).
    ...generatedTexts(image),
    arrivalRank: Number.isInteger(rank) && rank >= 1 ? rank : 1,
  };
}

/**
 * The quality of an image as a gallery says it (`gallery.schema.json`
 * `imageQuality`): the figures Astro Sync measured and the sentence that says
 * on what, by what and when — nothing else. `stored` is the text or the object
 * `capture_variants.quality_json` holds; `null` for a value that does not
 * read.
 */
export function publicImageQuality(stored) {
  let value = stored;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fwhmPixels = finiteOrNull(value.fwhmPixels);
  const starCount = Number(value.starCount);
  if (fwhmPixels === null || fwhmPixels <= 0) return null;
  if (!Number.isInteger(starCount) || starCount < 0) return null;
  const name = textOrNull(value.tool?.name);
  const version = textOrNull(value.tool?.version);
  const eccentricity = finiteOrNull(value.eccentricity);
  const fwhmArcsec = finiteOrNull(value.fwhmArcsec);
  return {
    fwhmPixels,
    fwhmArcsec: fwhmArcsec !== null && fwhmArcsec > 0 ? fwhmArcsec : null,
    eccentricity:
      eccentricity !== null && eccentricity >= 0 && eccentricity <= 1
        ? eccentricity
        : null,
    starCount,
    measuredOn: value.measuredOn === "stretched" ? "stretched" : "linear",
    measuredAt: textOrNull(value.measuredAt),
    tool: name && version ? { name, version } : null,
  };
}

export function publicGalleryCapture({
  row,
  variants = [],
  mainImage = null,
  targets = [],
  equipment = [],
  skyQuality = null,
  image = null,
  locale = "en",
  // The capture's metadata for a visitor (`capture-metadata.js`).
  metadata = null,
  // The main image's quality, only while the owner's public switch is on
  // (`gallery-quality.js`); absent otherwise.
  quality = null,
  // The milestones of the capture (`gallery-progression.js`), each with
  // its files: `{ plan, steps }`; absent without a milestone.
  progression = null,
  // The nights' values and charts, under the same switch as `quality`
  // (`gallery-nights.js`); absent while it is off or no night says anything.
  nights = [],
  qualityCharts = null,
}) {
  const kinds = publicEquipment(equipment);
  const telescope = kinds.find((item) => item.kind === "telescope")?.name;
  const bortle = Number(skyQuality?.bortle);
  const width = Number(image?.width);
  const height = Number(image?.height);
  return {
    ...publicGalleryItem({ row, targets, telescope, locale }),
    equipment: kinds,
    skyQuality:
      Number.isInteger(bortle) && bortle >= 1 && bortle <= 9
        ? {
            bortle,
            source: ["measured", "entered", "model"].includes(
              skyQuality?.source,
            )
              ? skyQuality.source
              : "model",
          }
        : null,
    image:
      Number.isInteger(width) &&
      width > 0 &&
      Number.isInteger(height) &&
      height > 0
        ? { width, height }
        : null,
    // The main image's names (the first image of the page).
    ...(mainImage
      ? { mainImage: { id: String(mainImage.id), ...imageNames(mainImage) } }
      : {}),
    // The main image first (above), then the variants its owner made
    // public, newest first.
    variants,
    // The title and the description, the acquisition, the calibration,
    // the sensor, the processing, the filters and the Moon — never the
    // place, the notes, an origin.
    ...(metadata ? { metadata } : {}),
    ...(quality ? { quality } : {}),
    ...(progression?.steps?.length
      ? {
          progression: {
            plan: Boolean(progression.plan),
            steps: progression.steps,
          },
        }
      : {}),
    ...(nights.length ? { nights } : {}),
    ...(qualityCharts ? { qualityCharts } : {}),
  };
}
