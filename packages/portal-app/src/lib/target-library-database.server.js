import { randomUUID } from "node:crypto";
import {
  createDatabaseDriver,
  databaseDriver,
} from "portal/persistence/database.js";
import { applyMigrations } from "portal/persistence/migration-runner.js";
import {
  targetCurationForTargets,
  targetCurationVersion,
} from "./target-library-curation.js";
import { writeTargetCatalogueSeed } from "./target-library-seed.server.js";
import { targetDistanceOf } from "./target-distance-record.js";
import { targetLookupKey, targetLookupKeys } from "portal/target-library.js";
import { isPublishedPagesResearch } from "./target-text-pages.js";
import { hemisphereVisibility } from "astro-core/target-hemispheres.js";
import { constellationAt } from "astro-core/constellation-at.js";
import { canonicalConstellationKey } from "astro-core/constellations.js";
import { isVisualReferenceFilename } from "./visual-reference.js";
import {
  targetLibraryImageFilePattern,
  targetLibraryPreviewFilePattern,
} from "./target-library-media.js";
import { sortedInSlices, yieldToEventLoop } from "./cooperative.server.js";
import {
  correctedSourceTarget,
  selectionModeBitsOf,
  selectionModesOf,
  targetSelectionModeCollections,
  targetSelectionModes,
} from "astro-core/target-selection.js";

const now = () => new Date().toISOString();
const stateId = "target-library";
const relationStateId = "target-library-relations-v1";
// The two editorial selections are disjoint (TARGET-SELECTIONS-TAGS-01):
// « Étendues » no longer holds « Essentielles ». The two mode collections
// hold the targets of a selection proposed in that mode (a target of a
// selection in neither is read as both, `astro-core/target-selection.js`).
const collectionDefinitions = [
  {
    id: "extended",
    title: {
      fr: "Étendues",
      en: "Extended",
      ja: "拡張",
      de: "Erweitert",
      es: "Ampliadas",
      it: "Estese",
      "pt-BR": "Ampliadas",
      "zh-Hans": "扩展",
      "zh-Hant": "擴充",
      ru: "Расширенные",
    },
    description: {
      fr: "Cibles de plus, au-delà des Essentielles, pour le visuel et l’astrophotographie.",
      en: "More targets, beyond the Essentials, for visual observing and astrophotography.",
      ja: "主要セレクション以外の、眼視と天体写真向けの追加の天体です。",
      de: "Weitere Ziele über die Grundauswahl hinaus, für die visuelle Beobachtung und die Astrofotografie.",
      es: "Más objetivos, además de los esenciales, para la observación visual y la astrofotografía.",
      it: "Altri target, oltre agli essenziali, per l’osservazione visuale e l’astrofotografia.",
      "pt-BR":
        "Mais alvos, além dos essenciais, para observação visual e astrofotografia.",
      "zh-Hans": "精选之外的更多目标，适用于目视观测与天文摄影。",
      "zh-Hant": "精選之外的更多目標，適用於目視觀測與天文攝影。",
      ru: "Дополнительные цели помимо ключевых, для визуальных наблюдений и астрофотографии.",
    },
    parent: null,
  },
  {
    id: "essential",
    title: {
      fr: "Essentielles",
      en: "Essentials",
      ja: "主要",
      de: "Grundauswahl",
      es: "Esenciales",
      it: "Essenziali",
      "pt-BR": "Essenciais",
      "zh-Hans": "精选",
      "zh-Hant": "精選",
      ru: "Ключевые",
    },
    description: {
      fr: "Cibles remarquables en visuel et astrophotographie.",
      en: "Notable visual and astrophotography targets.",
      ja: "眼視と天体写真で注目すべき天体です。",
      de: "Bemerkenswerte Ziele für die visuelle Beobachtung und die Astrofotografie.",
      es: "Objetivos destacados para la observación visual y la astrofotografía.",
      it: "Target notevoli per l’osservazione visuale e l’astrofotografia.",
      "pt-BR": "Alvos notáveis para observação visual e astrofotografia.",
      "zh-Hans": "目视观测与天文摄影中值得关注的目标。",
      "zh-Hant": "目視觀測與天文攝影中值得關注的目標。",
      ru: "Примечательные цели для визуальных наблюдений и астрофотографии.",
    },
    parent: null,
  },
  {
    id: "mode-visual",
    title: {
      fr: "Visuel",
      en: "Visual",
      ja: "眼視",
      de: "Visuell",
      es: "Visual",
      it: "Visuale",
      "pt-BR": "Visual",
      "zh-Hans": "目视",
      "zh-Hant": "目視",
      ru: "Визуально",
    },
    description: {
      fr: "Cibles des sélections proposées en observation visuelle.",
      en: "Targets of the selections proposed for visual observing.",
      ja: "眼視観測で提案するセレクションの天体です。",
      de: "Ziele der Auswahlen, die für die visuelle Beobachtung vorgeschlagen werden.",
      es: "Objetivos de las selecciones propuestos para la observación visual.",
      it: "Target delle selezioni proposti per l’osservazione visuale.",
      "pt-BR": "Alvos das seleções propostos para observação visual.",
      "zh-Hans": "精选中推荐用于目视观测的目标。",
      "zh-Hant": "精選中推薦用於目視觀測的目標。",
      ru: "Цели подборок, предлагаемые для визуальных наблюдений.",
    },
    parent: null,
  },
  {
    id: "mode-photo",
    title: {
      fr: "Photo",
      en: "Photo",
      ja: "写真",
      de: "Foto",
      es: "Foto",
      it: "Foto",
      "pt-BR": "Foto",
      "zh-Hans": "摄影",
      "zh-Hant": "攝影",
      ru: "Фото",
    },
    description: {
      fr: "Cibles des sélections proposées en astrophotographie.",
      en: "Targets of the selections proposed for astrophotography.",
      ja: "天体写真で提案するセレクションの天体です。",
      de: "Ziele der Auswahlen, die für die Astrofotografie vorgeschlagen werden.",
      es: "Objetivos de las selecciones propuestos para la astrofotografía.",
      it: "Target delle selezioni proposti per l’astrofotografia.",
      "pt-BR": "Alvos das seleções propostos para astrofotografia.",
      "zh-Hans": "精选中推荐用于天文摄影的目标。",
      "zh-Hant": "精選中推薦用於天文攝影的目標。",
      ru: "Цели подборок, предлагаемые для астрофотографии.",
    },
    parent: null,
  },
];

/** The collections of a target's selection and modes (`writeMemberships`). */
function membershipCollections(entry) {
  return [
    ...(entry.isExtended ? ["extended"] : []),
    ...(entry.isBest ? ["essential"] : []),
    ...selectionModesOf(entry.modes).map(
      (mode) => targetSelectionModeCollections[mode],
    ),
  ];
}

/** The modes a target's memberships name. */
const modesOfMemberships = (memberships) =>
  targetSelectionModes.filter((mode) =>
    memberships.has(targetSelectionModeCollections[mode]),
  );

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function stringify(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

function finite(value, minimum = -Infinity, maximum = Infinity) {
  // A number (every value a row holds): no text to trim.
  if (typeof value === "number")
    return Number.isFinite(value) && value >= minimum && value <= maximum
      ? value
      : null;
  if (value === null || value === undefined || String(value).trim() === "")
    return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum
    ? number
    : null;
}

function text(value, maximum = 4000) {
  return String(value || "")
    .trim()
    .slice(0, maximum);
}

function stringArray(value, maximum = 500) {
  const input = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[\n,]/)
        .map((item) => item.trim());
  return [
    ...new Set(input.map((item) => text(item, 240)).filter(Boolean)),
  ].slice(0, maximum);
}

function jsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function url(value) {
  const candidate = text(value, 2000);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

// The same names the image routes serve (one list of catalogue prefixes).
const imageFilePatterns = {
  dss: targetLibraryImageFilePattern,
  premium: /^noirlab-[a-z0-9_.-]+\.jpg$/i,
  visual: isVisualReferenceFilename,
  visualPreview: targetLibraryPreviewFilePattern,
};

function imageRecord(value, kind) {
  if (!value || typeof value !== "object") return null;
  const file = text(value.file, 300);
  if (!file) return null;
  const validFile =
    kind === "visual"
      ? imageFilePatterns.visual(file)
      : imageFilePatterns[kind].test(file);
  if (!validFile) throw new Error(`Invalid ${kind} image filename.`);
  const result = {
    ...jsonObject(value),
    file,
  };
  for (const key of ["source", "credit", "license", "title", "survey"]) {
    const normalized = text(value[key], 2000);
    if (normalized) result[key] = normalized;
    else delete result[key];
  }
  for (const key of ["sourceUrl", "assetUrl", "licenseUrl"]) {
    const normalized = url(value[key]);
    if (normalized) result[key] = normalized;
    else delete result[key];
  }
  return result;
}

function sourceImage(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function authorisedVisualImage(value) {
  const image = sourceImage(value);
  // Older private runtime packages included one generated demonstration in the
  // visual-reference slot. It must not outrank the dedicated preview layer.
  return image?.kind === "demo" ? null : image;
}

/**
 * The constellation key a source target is stored under: the IAU abbreviation
 * (`Lyr`), whatever spelling the source gave (« Lyre », « Se1 », « Car »); a
 * target the source gives none, with a position, is placed by the IAU
 * boundaries (`constellationAt`). The Solar System's bodies keep their own
 * key and a value that names no constellation is kept as it came.
 */
export function importedConstellationKey(target) {
  const given = text(target.constellationKey, 160);
  if (given) return canonicalConstellationKey(given) ?? given;
  const ra = finite(target.coordinate?.ra, 0, 24);
  const dec = finite(target.coordinate?.dec, -90, 90);
  if (target.catalogue === "Système solaire" || ra === null || dec === null)
    return null;
  return constellationAt(ra * 15, dec);
}

function sourceTarget(
  target,
  images,
  premiumImages,
  visualImages,
  visualPreviewImages,
  curation,
) {
  const sourceRecord = jsonObject(target.source);
  const decDegrees = finite(target.coordinate?.dec, -90, 90);
  const visibility = hemisphereVisibility(decDegrees);
  const isSolarSystemTarget = target.catalogue === "Système solaire";
  return {
    id: text(target.id, 200),
    designation: text(target.designation, 240),
    aliases: stringArray(target.aliases),
    commonNames: stringArray(target.commonNames),
    typeKey: text(target.typeKey, 160) || null,
    constellationKey: importedConstellationKey(target),
    raHours: finite(target.coordinate?.ra, 0, 24),
    decDegrees,
    apparentSizeArcmin: Array.isArray(target.apparentSizeArcmin)
      ? target.apparentSizeArcmin
          .map((value) => finite(value, 0, 100_000))
          .filter((value) => value !== null)
          .slice(0, 2)
      : null,
    magnitude: finite(target.magnitude, -40, 60),
    surfaceBrightness: finite(target.surfaceBrightness, -10, 60),
    catalogues: stringArray(target.catalogues, 40),
    catalogue: text(target.catalogue, 160) || "OpenNGC",
    dssImage: sourceImage(target.dssImage || images[target.id]),
    premiumImage: sourceImage(target.premiumImage || premiumImages[target.id]),
    visualImage: authorisedVisualImage(
      target.visualImage || visualImages[target.id],
    ),
    visualPreviewImage: sourceImage(
      target.visualPreviewImage || visualPreviewImages[target.id],
    ),
    isBest:
      typeof target.isBest === "boolean"
        ? target.isBest
        : curation.best.has(target.id),
    isExtended:
      typeof target.isExtended === "boolean"
        ? target.isExtended
        : curation.extended.has(target.id),
    modes: Array.isArray(target.modes)
      ? selectionModesOf(target.modes)
      : (curation.modes?.get(target.id) ?? []),
    visibleFromNorthernHemisphere: isSolarSystemTarget
      ? true
      : visibility.visibleFromNorthernHemisphere,
    visibleFromSouthernHemisphere: isSolarSystemTarget
      ? true
      : visibility.visibleFromSouthernHemisphere,
    editorial: jsonObject(target.editorial),
    overrides: jsonObject(target.overrides),
    source: Object.keys(sourceRecord).length ? sourceRecord : target,
  };
}

const sourceEditableFields = [
  "designation",
  "aliases",
  "commonNames",
  "typeKey",
  "constellationKey",
  "raHours",
  "decDegrees",
  "apparentSizeArcmin",
  "magnitude",
  "surfaceBrightness",
  "catalogues",
  "catalogue",
  "dssImage",
  "premiumImage",
  "visualImage",
  "visualPreviewImage",
];

function appliedSourceOverrides(entry, value) {
  const overrides = jsonObject(value);
  const next = { ...entry };
  for (const key of sourceEditableFields) {
    if (Object.hasOwn(overrides, key))
      next[key] =
        key === "constellationKey"
          ? (canonicalConstellationKey(overrides[key]) ?? overrides[key])
          : overrides[key];
  }
  return next;
}

function sourceOverridesFor(entry) {
  return Object.fromEntries(
    sourceEditableFields.map((key) => [key, entry[key]]),
  );
}

function optionalDistance(entry) {
  const distance = targetDistanceOf(entry);
  return distance ? { distance } : {};
}

function entryFromRow(row, relations = {}) {
  if (!row) return null;
  const ra = finite(row.ra_hours, 0, 24);
  const dec = finite(row.dec_degrees, -90, 90);
  const media = relations.mediaByTarget?.get(row.id) || {};
  const memberships = relations.membershipsByTarget?.get(row.id) || new Set();
  const source = parseJson(row.source_json, {});
  return {
    id: row.id,
    designation: row.designation,
    aliases: parseJson(row.aliases_json, []),
    commonNames: parseJson(row.common_names_json, []),
    typeKey: row.type_key || null,
    constellationKey: row.constellation_key || null,
    coordinate: ra === null || dec === null ? null : { ra, dec },
    apparentSizeArcmin: parseJson(row.apparent_size_arcmin_json, null),
    magnitude: row.magnitude ?? null,
    surfaceBrightness: row.surface_brightness ?? null,
    catalogues: parseJson(row.catalogues_json, []),
    catalogue: row.catalogue,
    dssImage: media.dss ?? parseJson(row.dss_image_json, null),
    premiumImage: media.premium ?? parseJson(row.premium_image_json, null),
    visualImage: media.visual ?? parseJson(row.visual_image_json, null),
    visualPreviewImage: media["visual-preview"] || null,
    isBest: memberships.has("essential") || Boolean(row.is_best),
    isExtended: memberships.has("extended") || Boolean(row.is_extended),
    modes: modesOfMemberships(memberships),
    visibleFromNorthernHemisphere: Boolean(
      row.visible_from_northern_hemisphere,
    ),
    visibleFromSouthernHemisphere: Boolean(
      row.visible_from_southern_hemisphere,
    ),
    editorial: parseJson(row.editorial_json, {}),
    source,
    // The records of the two kinds of entry the application writes itself
    // (the bright stars and the constellations) travel with the entry.
    ...(source.stellar ? { stellar: source.stellar } : {}),
    ...(source.constellationInfo
      ? { constellationInfo: source.constellationInfo }
      : {}),
    sourcePresent: Boolean(row.source_present),
    sourceRevision: row.source_revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function editableTarget(input, stored) {
  if (!input || typeof input !== "object")
    throw new Error("Target is required.");
  const designation = text(input.designation, 240);
  if (!designation) throw new Error("Designation is required.");
  const coordinate = input.coordinate || {};
  const ra = finite(coordinate.ra, 0, 24);
  const dec = finite(coordinate.dec, -90, 90);
  if ((ra === null) !== (dec === null))
    throw new Error(
      "Right ascension and declination must be supplied together.",
    );
  const apparentSize = Array.isArray(input.apparentSizeArcmin)
    ? input.apparentSizeArcmin
        .map((value) => finite(value, 0, 100_000))
        .filter((value) => value !== null)
        .slice(0, 2)
    : null;
  const editorial = jsonObject(input.editorial);
  const isBest = Boolean(input.isBest);
  const visibility = hemisphereVisibility(dec);
  const catalogue = text(input.catalogue, 160) || "OpenNGC";
  const isSolarSystemTarget = catalogue === "Système solaire";
  return {
    id: stored.id,
    designation,
    aliases: stringArray(input.aliases),
    commonNames: stringArray(input.commonNames),
    typeKey: text(input.typeKey, 160) || null,
    constellationKey: importedConstellationKey({
      constellationKey: input.constellationKey,
      catalogue,
      coordinate: { ra, dec },
    }),
    raHours: ra,
    decDegrees: dec,
    apparentSizeArcmin: apparentSize?.length ? apparentSize : null,
    magnitude: finite(input.magnitude, -40, 60),
    surfaceBrightness: finite(input.surfaceBrightness, -10, 60),
    catalogues: stringArray(input.catalogues, 40),
    catalogue,
    dssImage: imageRecord(input.dssImage, "dss"),
    premiumImage: imageRecord(input.premiumImage, "premium"),
    visualImage: imageRecord(input.visualImage, "visual"),
    visualPreviewImage: imageRecord(input.visualPreviewImage, "visualPreview"),
    isBest,
    // The two selections are disjoint: an Essential is not also Extended.
    isExtended: !isBest && Boolean(input.isExtended),
    modes: selectionModesOf(input.modes),
    visibleFromNorthernHemisphere: isSolarSystemTarget
      ? true
      : visibility.visibleFromNorthernHemisphere,
    visibleFromSouthernHemisphere: isSolarSystemTarget
      ? true
      : visibility.visibleFromSouthernHemisphere,
    editorial,
  };
}

async function selectionCounts(db) {
  const row = (
    await db.query(
      `SELECT COUNT(*) AS total,
      SUM(CASE WHEN is_best = 1 THEN 1 ELSE 0 END) AS best,
      SUM(CASE WHEN is_extended = 1 THEN 1 ELSE 0 END) AS extended
     FROM target_catalogue_entries WHERE source_present = 1`,
    )
  ).rows[0];
  return {
    total: Number(row?.total || 0),
    best: Number(row?.best || 0),
    extended: Number(row?.extended || 0),
  };
}

/** The ASCII-only lower case SQLite's `lower()` applies. */
const asciiLower = (value) =>
  String(value).replace(/[A-Z]+/g, (letters) => letters.toLowerCase());

/** The designation order of the catalogue: numeric collation, `en`. */
const designationCollator = new Intl.Collator("en", { numeric: true });

/** Rows written, read or updated per statement batch or transaction. */
const sliceLength = 500;

/** The `IN (…)` lists are cut to this many values. */
const inListLength = 500;

/** Rows of `target_texts` written by one statement. */
const textRowsPerStatement = 500;

// PostgreSQL advisory locks (one database, several processes): the import of
// the texts' shards (tried: a process that does not get it skips), the
// catalogue's import, its derived data and its search text (waited for: the
// process that gets it second finds the work done).
const textsImportLockKey = 7_341_201;
const catalogueImportLockKey = 7_341_202;
const catalogueDeriveLockKey = 7_341_203;
const catalogueSearchLockKey = 7_341_204;

function chunks(values, length = inListLength) {
  const result = [];
  for (let start = 0; start < values.length; start += length)
    result.push(values.slice(start, start + length));
  return result;
}

const placeholders = (count) =>
  Array.from({ length: count }, () => "?").join(", ");

/**
 * What the curation (`targetCurationForTargets`) reads of a source target:
 * its lookup keys' fields and the fields of its score. Kept for every target
 * of an import (a few hundred bytes each) instead of the targets themselves.
 */
function curationProjection(target) {
  return {
    id: target.id,
    source:
      target.source && typeof target.source === "object" ? {} : target.source,
    designation: target.designation,
    title: target.title,
    stellarium: target.stellarium?.source
      ? { source: target.stellarium.source }
      : undefined,
    objects: target.objects,
    aliases: target.aliases,
    commonNames: target.commonNames,
    catalogues: target.catalogues,
    typeKey: target.typeKey,
    apparentSizeArcmin: target.apparentSizeArcmin,
    magnitude: target.magnitude,
    surfaceBrightness: target.surfaceBrightness,
  };
}

/** The lookup keys of a stored target (`targetLookupKeys` of the entry the
 * row hydrates to), without the one its `source` object gives every row
 * (`String({})`), which the reads answer apart (`firstByLookupKey`). */
const storedLookupKeys = (entry) => [
  ...new Set(
    targetLookupKeys({
      id: entry.id,
      designation: entry.designation,
      aliases: entry.aliases,
      commonNames: entry.commonNames,
    }),
  ),
];

/** The key `targetLookupKeys` derives from any `source` object. */
export const objectSourceLookupKey = targetLookupKey(String({}));

/**
 * The columns of a compact catalogue row (`poolRows`): what filtering,
 * counting and ordering a catalogue page reads, without the JSON of the
 * images, the editorial texts or the source record.
 */
const poolColumns = `e.id, e.designation, e.aliases_json, e.common_names_json,
  e.type_key, e.constellation_key, e.ra_hours, e.dec_degrees,
  e.apparent_size_arcmin_json, e.magnitude, e.catalogues_json, e.catalogue,
  e.is_best, e.is_extended, e.visible_from_northern_hemisphere,
  e.visible_from_southern_hemisphere, e.has_premium_image, e.designation_rank,
  COALESCE((SELECT SUM(CASE m.collection_id
      WHEN '${targetSelectionModeCollections.visual}' THEN 1
      WHEN '${targetSelectionModeCollections.photo}' THEN 2 ELSE 0 END)
    FROM target_collection_memberships m WHERE m.target_id = e.id), 0)
    AS selection_modes`;

/**
 * A compact row as the target object the catalogue's filters read. Its JSON
 * fields (aliases, common names, size, catalogues) are parsed when first
 * read: a page reads all the rows of its pool and most of those fields of
 * none of them.
 */
class PoolTarget {
  #json;
  constructor(row) {
    const ra = finite(row.ra_hours, 0, 24);
    const dec = finite(row.dec_degrees, -90, 90);
    this.#json = {
      aliases: row.aliases_json,
      commonNames: row.common_names_json,
      apparentSizeArcmin: row.apparent_size_arcmin_json,
      catalogues: row.catalogues_json,
    };
    this.id = row.id;
    this.designation = row.designation;
    this.typeKey = row.type_key || null;
    this.constellationKey = row.constellation_key || null;
    this.coordinate = ra === null || dec === null ? null : { ra, dec };
    this.magnitude = row.magnitude ?? null;
    this.catalogue = row.catalogue;
    this.isBest = Boolean(row.is_best);
    this.isExtended = Boolean(row.is_extended);
    // The modes' memberships, as their bits (`poolColumns`).
    this.modes = selectionModesOf(Number(row.selection_modes) || 0);
    this.visibleFromNorthernHemisphere = Boolean(
      row.visible_from_northern_hemisphere,
    );
    this.visibleFromSouthernHemisphere = Boolean(
      row.visible_from_southern_hemisphere,
    );
    // Only its presence is read (`plannerCandidateScore`, the index's
    // `premium` column); the record itself is the full entry's.
    this.premiumImage = row.has_premium_image ? true : null;
    this.designationRank = Number(row.designation_rank);
    if (row.query_match !== undefined)
      this.queryMatch = Boolean(Number(row.query_match));
  }
  #values = new Map();
  #parsed(name, fallback) {
    if (!this.#values.has(name))
      this.#values.set(name, parseJson(this.#json[name], fallback));
    return this.#values.get(name);
  }
  get aliases() {
    return this.#parsed("aliases", []);
  }
  get commonNames() {
    return this.#parsed("commonNames", []);
  }
  get apparentSizeArcmin() {
    return this.#parsed("apparentSizeArcmin", null);
  }
  get catalogues() {
    return this.#parsed("catalogues", []);
  }
}

const poolTarget = (row) => new PoolTarget(row);

/**
 * What the raw mode keeps of a source target for the catalogue's filters,
 * orders and search: its own fields, as the source wrote them (`premiumImage`
 * reduced to its presence; `source` to its kind, for the lookup keys).
 */
function rawPoolProjection(target) {
  return {
    id: target.id,
    designation: target.designation,
    aliases: target.aliases,
    commonNames: target.commonNames,
    typeKey: target.typeKey,
    constellationKey: target.constellationKey,
    coordinate: target.coordinate,
    apparentSizeArcmin: target.apparentSizeArcmin,
    magnitude: target.magnitude,
    catalogues: target.catalogues,
    catalogue: target.catalogue,
    isBest: target.isBest,
    isExtended: target.isExtended,
    modes: target.modes,
    visibleFromNorthernHemisphere: target.visibleFromNorthernHemisphere,
    visibleFromSouthernHemisphere: target.visibleFromSouthernHemisphere,
    premiumImage: target.premiumImage ? true : null,
    source:
      target.source && typeof target.source === "object" ? {} : target.source,
    title: target.title,
    objects: target.objects,
    stellarium: target.stellarium?.source
      ? { source: target.stellarium.source }
      : undefined,
  };
}

/**
 * The images of a source target in the raw mode, as the catalogue read from
 * the files presented them: those of the seed's own record of the target
 * (`record`; a visual reference or a preview, else the runtime manifest's),
 * or, without one (the runtime library, the fallback, a Solar System body the
 * seed does not hold), the runtime manifests' alone.
 */
function rawImagesOf(target, sources, record) {
  const own = (value) => (record && value ? value : null);
  return {
    dss: record ? own(record.dssImage) : sources.images?.[target.id] || null,
    premium: record
      ? own(record.premiumImage)
      : sources.premiumImages?.[target.id] || null,
    visual:
      (record?.visualImage?.kind === "demo"
        ? null
        : own(record?.visualImage)) ||
      sources.visualImages?.[target.id] ||
      null,
    preview:
      own(record?.visualPreviewImage) ||
      sources.visualPreviewImages?.[target.id] ||
      null,
  };
}

/** The raw images of an entry the raw mode hydrated. */
const rawImagesByEntry = new WeakMap();
export const rawImagesOfEntry = (entry) => rawImagesByEntry.get(entry) || null;

/**
 * The catalogue keeps metadata only. Every operation crosses the same async
 * driver boundary, so neither the catalogue nor its callers select SQLite or
 * PostgreSQL-specific APIs.
 *
 * Nothing here holds the catalogue whole. The import takes the source's
 * targets as they come (an array or an async iterable: the seed is
 * streamed) and writes them by slices; the reads ask the database for the
 * rows they need (`poolRows`, compact; `entriesByIds`, whole) through the
 * columns and tables the derivation keeps (`deriveAll`, migration 93).
 */
export async function createTargetCatalogueRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = databaseUrl ? "postgres" : "sqlite",
  curate = true,
  raw = false,
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);
  const sqlDialect = db.dialect || dialect;
  const bumpRevision = async (driver = db) => {
    await driver.run(
      `UPDATE target_catalogue_state
       SET revision = revision + 1, updated_at = ? WHERE id = ?`,
      [now(), stateId],
    );
  };
  const ensureCollections = async (driver = db) => {
    const insert = `INSERT INTO target_collections (
        id, title_json, description_json, parent_collection_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title_json = excluded.title_json,
        description_json = excluded.description_json,
        parent_collection_id = excluded.parent_collection_id,
        updated_at = excluded.updated_at`;
    const timestamp = now();
    for (const collection of collectionDefinitions)
      await driver.run(insert, [
        collection.id,
        stringify(collection.title, {}),
        stringify(collection.description, {}),
        collection.parent,
        timestamp,
        timestamp,
      ]);
  };
  const writeMemberships = async (driver, entry, timestamp = now()) => {
    await driver.run(
      "DELETE FROM target_collection_memberships WHERE target_id = ?",
      [entry.id],
    );
    const addMembership = `INSERT INTO target_collection_memberships (
        collection_id, target_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?)`;
    for (const collection of membershipCollections(entry))
      await driver.run(addMembership, [
        collection,
        entry.id,
        timestamp,
        timestamp,
      ]);
  };
  const writeRelations = async (
    driver,
    entry,
    timestamp = now(),
    { memberships = true, known = null } = {},
  ) => {
    const media = {
      dss: entry.dssImage,
      premium: entry.premiumImage,
      visual: entry.visualImage,
      "visual-preview": entry.visualPreviewImage,
    };
    const upsertMedia = `INSERT INTO target_media (
        id, target_id, variant, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(target_id, variant) DO UPDATE SET
        metadata_json = excluded.metadata_json, updated_at = excluded.updated_at`;
    const deleteMedia =
      "DELETE FROM target_media WHERE target_id = ? AND variant = ?";
    // `known` (the import, which read the rows of a slice at once): what the
    // database already holds of this target, `{ media: { variant: metadata },
    // memberships: Set }`, kept up to date here. Without it every variant
    // and the memberships are written blind, a statement each; with it only
    // what differs is written — one round trip per target instead of up to
    // eight, which is what the import of 17,000 targets on a database a
    // network away costs minutes for.
    for (const [variant, metadata] of Object.entries(media)) {
      const stored = known?.media[variant];
      if (metadata) {
        if (
          known &&
          stored !== undefined &&
          stringify(stored, {}) === stringify(metadata, {})
        )
          continue;
        await driver.run(upsertMedia, [
          randomUUID(),
          entry.id,
          variant,
          stringify(metadata, {}),
          timestamp,
          timestamp,
        ]);
        if (known) known.media[variant] = metadata;
      } else if (!known || stored !== undefined) {
        await driver.run(deleteMedia, [entry.id, variant]);
        if (known) delete known.media[variant];
      }
    }
    if (memberships) {
      const wanted = new Set(membershipCollections(entry));
      if (
        known &&
        known.memberships.size === wanted.size &&
        [...wanted].every((collection) => known.memberships.has(collection))
      )
        return;
      await writeMemberships(driver, entry, timestamp);
      if (known) {
        known.memberships.clear();
        for (const collection of wanted) known.memberships.add(collection);
      }
    }
  };
  const relationsFor = async (driver, rows) => {
    const ids = rows.map((row) => row.id);
    const relationRows = async (table, columns) => {
      const found = [];
      for (const slice of chunks(ids))
        found.push(
          ...(
            await driver.query(
              `SELECT ${columns} FROM ${table} WHERE target_id IN (${placeholders(slice.length)})`,
              slice,
            )
          ).rows,
        );
      return found;
    };
    const mediaByTarget = new Map();
    for (const row of await relationRows(
      "target_media",
      "target_id, variant, metadata_json",
    )) {
      const media = mediaByTarget.get(row.target_id) || {};
      media[row.variant] = parseJson(row.metadata_json, null);
      mediaByTarget.set(row.target_id, media);
    }
    const membershipsByTarget = new Map();
    for (const row of await relationRows(
      "target_collection_memberships",
      "target_id, collection_id",
    )) {
      const memberships = membershipsByTarget.get(row.target_id) || new Set();
      memberships.add(row.collection_id);
      membershipsByTarget.set(row.target_id, memberships);
    }
    return { mediaByTarget, membershipsByTarget };
  };
  const hydrate = async (driver, rows) => {
    const relations = await relationsFor(driver, rows);
    return rows.map((row) => entryFromRow(row, relations));
  };
  const catalogueRevisionNow = async () =>
    (
      await db.query(
        "SELECT revision FROM target_catalogue_state WHERE id = ?",
        [stateId],
      )
    ).rows[0]?.revision ?? null;
  const ensureRelations = async () => {
    await ensureCollections();
    const alreadyNormalized = (
      await db.query(
        "SELECT id FROM target_catalogue_relation_state WHERE id = ?",
        [relationStateId],
      )
    ).rows[0];
    if (alreadyNormalized) return;
    // The shared catalogue only: a space's personal targets have no
    // collection nor image of the catalogue.
    const rows = (
      await db.query(
        "SELECT * FROM target_catalogue_entries WHERE space_id IS NULL",
      )
    ).rows;
    await db.transaction(async (transaction) => {
      const timestamp = now();
      for (const row of rows)
        await writeRelations(transaction, entryFromRow(row), timestamp);
      await transaction.run(
        "INSERT INTO target_catalogue_relation_state (id, normalized_at) VALUES (?, ?)",
        [relationStateId, timestamp],
      );
    });
  };
  await ensureRelations();
  // Once per version of the default selections (`targetCurationVersion`,
  // `sky-data/target-selection.json`): a catalogue that holds targets
  // already, curated by an earlier version, takes the selections and modes
  // of this one — every shared target's, an earlier edit in Administration
  // included (the curated list of 03/11/2026 replaces the lists of the earlier
  // version). A database with no target yet only records the version: its
  // first import keeps the source's flags and curates the targets without
  // any, as ever. Without curation (`curate: false`), nothing.
  const ensureSelectionVersion = async () => {
    if (!curate) return;
    const versionId = `target-selection-${targetCurationVersion}`;
    const applied = (
      await db.query(
        "SELECT id FROM target_catalogue_relation_state WHERE id = ?",
        [versionId],
      )
    ).rows[0];
    if (applied) return;
    await db.transaction(async (transaction) => {
      // Several processes on one PostgreSQL database: one applies it, the
      // others find it applied.
      if (sqlDialect !== "sqlite")
        await transaction.query("SELECT pg_advisory_xact_lock(?)", [
          catalogueImportLockKey,
        ]);
      if (
        (
          await transaction.query(
            "SELECT id FROM target_catalogue_relation_state WHERE id = ?",
            [versionId],
          )
        ).rows[0]
      )
        return;
      const rows = (
        await transaction.query(
          `SELECT id, designation, aliases_json, common_names_json
           FROM target_catalogue_entries
           WHERE space_id IS NULL AND source_present = 1`,
        )
      ).rows;
      const curation = rows.length
        ? targetCurationForTargets(
            rows.map((row) => ({
              id: row.id,
              designation: row.designation,
              aliases: parseJson(row.aliases_json, []),
              commonNames: parseJson(row.common_names_json, []),
            })),
          )
        : null;
      const timestamp = now();
      if (curation) {
        const collections = collectionDefinitions.map(({ id }) => id);
        await transaction.run(
          `DELETE FROM target_collection_memberships
           WHERE collection_id IN (${placeholders(collections.length)})
             AND target_id IN (
               SELECT id FROM target_catalogue_entries WHERE space_id IS NULL
             )`,
          collections,
        );
        await transaction.run(
          `UPDATE target_catalogue_entries SET is_best = 0, is_extended = 0
           WHERE space_id IS NULL AND (is_best = 1 OR is_extended = 1)`,
        );
        const memberships = [];
        for (const [tier, ids] of [
          ["essential", curation.best],
          ["extended", curation.extended],
        ]) {
          for (const slice of chunks([...ids]))
            await transaction.run(
              `UPDATE target_catalogue_entries
               SET ${tier === "essential" ? "is_best" : "is_extended"} = 1
               WHERE id IN (${placeholders(slice.length)})`,
              slice,
            );
          for (const id of ids)
            for (const collection of membershipCollections({
              id,
              isBest: tier === "essential",
              isExtended: tier === "extended",
              modes: curation.modes.get(id),
            }))
              memberships.push([collection, id, timestamp, timestamp]);
        }
        for (const part of chunks(memberships, 200))
          await transaction.run(
            `INSERT INTO target_collection_memberships (
               collection_id, target_id, created_at, updated_at
             ) VALUES ${part.map(() => "(?, ?, ?, ?)").join(", ")}`,
            part.flat(),
          );
        await bumpRevision(transaction);
      }
      await transaction.run(
        "INSERT INTO target_catalogue_relation_state (id, normalized_at) VALUES (?, ?)",
        [versionId, timestamp],
      );
    });
  };
  await ensureSelectionVersion();
  // The raw mode (`raw`, the private store of a process without a database,
  // `target-library-store.server.js`): the catalogue answers what it answered
  // when it read the source files without a database — each target as the
  // source wrote it, its images as the source and the runtime manifests give
  // them, its flags as given, its order the source's. The source's records
  // are kept in a table of their own; the derived data and the reads follow
  // them instead of the normalized columns.
  if (raw)
    await db.run(`CREATE TABLE IF NOT EXISTS target_catalogue_raw (
      id TEXT PRIMARY KEY,
      entry_json TEXT NOT NULL,
      pool_json TEXT NOT NULL,
      images_json TEXT NOT NULL
    )`);

  const sourceUpsert = `INSERT INTO target_catalogue_entries (
      id, designation, aliases_json, common_names_json, type_key,
      constellation_key, ra_hours, dec_degrees, apparent_size_arcmin_json,
      magnitude, surface_brightness, catalogues_json, catalogue,
      dss_image_json, premium_image_json, visual_image_json,
      is_best, is_extended, visible_from_northern_hemisphere,
      visible_from_southern_hemisphere, editorial_json, overrides_json,
      source_json, source_present,
      source_revision, created_at, updated_at, catalogue_sequence
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      designation = excluded.designation,
      aliases_json = excluded.aliases_json,
      common_names_json = excluded.common_names_json,
      type_key = excluded.type_key,
      constellation_key = excluded.constellation_key,
      ra_hours = excluded.ra_hours,
      dec_degrees = excluded.dec_degrees,
      apparent_size_arcmin_json = excluded.apparent_size_arcmin_json,
      magnitude = excluded.magnitude,
      surface_brightness = excluded.surface_brightness,
      catalogues_json = excluded.catalogues_json,
      catalogue = excluded.catalogue,
      dss_image_json = excluded.dss_image_json,
      premium_image_json = excluded.premium_image_json,
      visual_image_json = excluded.visual_image_json,
      visible_from_northern_hemisphere = excluded.visible_from_northern_hemisphere,
      visible_from_southern_hemisphere = excluded.visible_from_southern_hemisphere,
      source_json = excluded.source_json,
      source_present = 1,
      source_revision = excluded.source_revision,
      updated_at = excluded.updated_at`;

  /** What the source upsert preserves from the stored rows of `ids`. */
  const storedSourceContext = async (driver, ids) => {
    const stored = new Map();
    for (const slice of chunks(ids))
      for (const row of (
        await driver.query(
          `SELECT id, overrides_json, editorial_json, is_best, is_extended
           FROM target_catalogue_entries WHERE id IN (${placeholders(slice.length)})`,
          slice,
        )
      ).rows)
        stored.set(row.id, {
          overrides: parseJson(row.overrides_json, {}),
          editorial: parseJson(row.editorial_json, {}),
          isBest: Boolean(row.is_best),
          isExtended: Boolean(row.is_extended),
        });
    return stored;
  };

  // The source's own flags are taken as they are; a target without them is
  // curated (`targetCurationForTargets`), which needs the whole source and
  // is therefore applied once every target is written.
  const noCuration = { best: new Set(), extended: new Set(), modes: new Map() };

  /** The media and memberships the slice read for `id` (see writeRelations),
   * created empty for a target the database does not hold yet. */
  const knownRelationsOf = (relations, id) => {
    if (!relations) return null;
    let media = relations.mediaByTarget.get(id);
    if (!media) relations.mediaByTarget.set(id, (media = {}));
    let memberships = relations.membershipsByTarget.get(id);
    if (!memberships)
      relations.membershipsByTarget.set(id, (memberships = new Set()));
    return { media, memberships };
  };

  const upsertSourceTarget = async (driver, target, context) => {
    const { sources, revision, timestamp } = context;
    const sourceEntry = sourceTarget(
      target,
      sources.images,
      sources.premiumImages,
      sources.visualImages,
      sources.visualPreviewImages,
      noCuration,
    );
    const stored = context.stored.get(sourceEntry.id);
    const entry = appliedSourceOverrides(sourceEntry, stored?.overrides);
    if (!entry.id || !entry.designation) return;
    if (entry.catalogue !== "Système solaire")
      Object.assign(entry, hemisphereVisibility(entry.decDegrees));
    const storedEditorial = stored?.editorial;
    // A stored editorial is an edit and stays (the upsert below never
    // writes the column over an existing row), except under published pages
    // (the long catalogue texts the data package carries): the instance
    // takes the package's pages when their revision differs from the stored
    // ones (also when it has no editorial of its own), and keeps its other
    // editorial fields. Pages the package no longer carries in its seed
    // (tier A moved to the shards, `target_texts`) leave the stored
    // editorial too, so that the shards are what is read.
    const published = entry.editorial?.catalogueResearch;
    const storedPages = isPublishedPagesResearch(
      storedEditorial?.catalogueResearch,
    );
    const takesPages =
      Boolean(stored) &&
      isPublishedPagesResearch(published) &&
      storedEditorial?.catalogueResearch?.pagesRevision !==
        published.pagesRevision;
    const dropsPages =
      Boolean(stored) && storedPages && !isPublishedPagesResearch(published);
    if (stored) {
      if (takesPages)
        entry.editorial = {
          ...storedEditorial,
          catalogueResearch: published,
        };
      else if (dropsPages) {
        const { catalogueResearch: ignoredPages, ...rest } = storedEditorial;
        entry.editorial = rest;
      } else entry.editorial = storedEditorial;
    }
    // A seed exported under an earlier version of the default selections
    // (`library.selectionVersion`, its header's) gives flags of that version:
    // a new target is curated from the file instead. Without curation (the
    // raw mode) the flags are the source's, whatever its version.
    const ownFlags = !curate || context.currentFlags();
    const sourceFlags = {
      best:
        ownFlags && typeof target.isBest === "boolean" ? target.isBest : null,
      extended:
        ownFlags && typeof target.isExtended === "boolean"
          ? target.isExtended
          : null,
      modes:
        ownFlags && Array.isArray(target.modes)
          ? selectionModesOf(target.modes)
          : null,
    };
    // A new target without its own flags waits for the curation.
    const curated =
      !stored && (sourceFlags.best === null || sourceFlags.extended === null);
    if (curated)
      context.curated.set(entry.id, { ...sourceFlags, sourceId: target.id });
    // A stored target keeps its modes as it keeps its flags: those its
    // memberships hold.
    const known = knownRelationsOf(context.relations, entry.id);
    const flags = stored
      ? {
          isBest: stored.isBest,
          isExtended: stored.isExtended,
          modes: known ? modesOfMemberships(known.memberships) : [],
        }
      : {
          isBest: Boolean(sourceFlags.best),
          isExtended: Boolean(sourceFlags.extended),
          modes: sourceFlags.modes ?? [],
        };
    await driver.run(sourceUpsert, [
      entry.id,
      entry.designation,
      stringify(entry.aliases, []),
      stringify(entry.commonNames, []),
      entry.typeKey,
      entry.constellationKey,
      entry.raHours,
      entry.decDegrees,
      stringify(entry.apparentSizeArcmin, null),
      entry.magnitude,
      entry.surfaceBrightness,
      stringify(entry.catalogues, []),
      entry.catalogue,
      stringify(entry.dssImage, null),
      stringify(entry.premiumImage, null),
      stringify(entry.visualImage, null),
      flags.isBest ? 1 : 0,
      flags.isExtended ? 1 : 0,
      entry.visibleFromNorthernHemisphere ? 1 : 0,
      entry.visibleFromSouthernHemisphere ? 1 : 0,
      stringify(entry.editorial, {}),
      stringify(entry.overrides, {}),
      stringify(entry.source, {}),
      revision,
      timestamp,
      timestamp,
      stored ? null : context.nextSequence(),
    ]);
    if (takesPages || dropsPages)
      await driver.run(
        "UPDATE target_catalogue_entries SET editorial_json = ? WHERE id = ?",
        [stringify(entry.editorial, {}), entry.id],
      );
    // Existing collection choices are editable and intentionally preserved
    // by the source upsert. New entries have no prior row, so retain their
    // source membership (or, without one, the curation's, written later).
    await writeRelations(driver, { ...entry, ...flags }, timestamp, {
      memberships: !curated,
      known,
    });
    if (raw)
      await driver.run(
        `INSERT INTO target_catalogue_raw (id, entry_json, pool_json, images_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET entry_json = excluded.entry_json,
           pool_json = excluded.pool_json, images_json = excluded.images_json`,
        [
          entry.id,
          JSON.stringify(target),
          JSON.stringify(rawPoolProjection(target)),
          JSON.stringify(
            rawImagesOf(target, sources, context.ownImages?.(target) ?? null),
          ),
        ],
      );
  };

  const recordSynchronizedState = async (
    driver,
    revision,
    timestamp,
    metadata,
  ) => {
    await driver.run(
      `INSERT INTO target_catalogue_state (id, source_revision, revision, synced_at, updated_at, metadata_json)
       VALUES (?, ?, 1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         source_revision = excluded.source_revision,
         revision = target_catalogue_state.revision + 1,
         synced_at = excluded.synced_at,
         updated_at = excluded.updated_at,
         metadata_json = excluded.metadata_json`,
      [stateId, revision, timestamp, timestamp, stringify(metadata, {})],
    );
  };

  /** The first sequence a new row takes: one past the highest. */
  const firstFreeSequence = async (driver) =>
    Number(
      (
        await driver.query(
          "SELECT MAX(catalogue_sequence) AS highest FROM target_catalogue_entries",
        )
      ).rows[0]?.highest || 0,
    ) + 1;

  /**
   * The import itself. The targets come one at a time (`targets` is an array
   * or an async iterable) and are written by slices of `sliceLength`: the
   * import keeps, besides the slice, only what the curation needs of each
   * target (`curationProjection`). PostgreSQL keeps one transaction (its
   * driver never holds the event loop). SQLite (`node:sqlite`, synchronous)
   * writes each slice in a transaction of its own, the event loop handed back
   * in between — one transaction for the real catalogue held it 1.1 s
   * locally, far longer on a network file system, whose health
   * probe may give up after 1 s — and ends with one transaction that retires
   * what the source no longer has (every row the slices did not stamp with
   * this revision) and records the revision. Until then the state still names
   * the previous revision, so a reader keeps waiting for this import
   * (`loadedLibrary`) and an interrupted import is simply done again,
   * idempotently. A source that turns out invalid midway (an iterable that
   * throws) leaves the state as it was.
   */
  const synchronizeSource = async ({
    library,
    images,
    premiumImages,
    visualImages,
    visualPreviewImages,
    revision,
    ownImages,
  }) => {
    const timestamp = now();
    const sources = {
      images,
      premiumImages,
      visualImages,
      visualPreviewImages,
    };
    const projections = [];
    const curatedFlags = new Map();
    // A library that names the version of the selections it was exported
    // under (a seed) gives its own flags only under the current one; any
    // other library gives them as ever.
    const currentFlags = () =>
      typeof library.selectionVersion !== "function" ||
      library.selectionVersion() === targetCurationVersion;
    const metadataOf = () =>
      typeof library.metadata === "function"
        ? library.metadata()
        : {
            source: library.source ?? null,
            license: library.license ?? null,
            importedAt: library.importedAt ?? null,
            url: library.url ?? null,
          };
    const slices = async function* () {
      let slice = [];
      for await (const target of library.targets) {
        // Every target is stored, and answered, under the IAU abbreviation of
        // its constellation, in the raw mode (a process without a database)
        // as in the database.
        // The corrections of the source records (`sky-data/target-
        // corrections.json`), whatever the source: an administrator's own
        // edit of a field still wins (`appliedSourceOverrides`).
        const corrected = correctedSourceTarget(target);
        corrected.constellationKey = importedConstellationKey(corrected);
        projections.push(curationProjection(corrected));
        slice.push(corrected);
        if (slice.length >= sliceLength) {
          yield slice;
          slice = [];
        }
      }
      if (slice.length) yield slice;
    };
    const writeSlice = async (driver, slice, context) => {
      const ids = slice.map((target) => text(target.id, 200)).filter(Boolean);
      context.stored = await storedSourceContext(driver, ids);
      // The media and memberships those rows already hold, read at once:
      // only what differs is written (see writeRelations).
      context.relations = await relationsFor(
        driver,
        ids.map((id) => ({ id })),
      );
      for (const target of slice)
        await upsertSourceTarget(driver, target, context);
    };
    /** The curation's flags of the new targets that had none of their own. */
    const writeCuratedFlags = async (driver, curation) => {
      for (const [id, given] of curatedFlags) {
        // Without curation (the private store of a process without a
        // database, `target-library-store.server.js`), a flag the source
        // does not give is false, as the catalogue read from the files
        // always took it.
        const isBest =
          given.best ?? (curate && curation.best.has(given.sourceId));
        const isExtended =
          given.extended ?? (curate && curation.extended.has(given.sourceId));
        const modes =
          given.modes ??
          (curate ? (curation.modes.get(given.sourceId) ?? []) : []);
        await driver.run(
          "UPDATE target_catalogue_entries SET is_best = ?, is_extended = ? WHERE id = ?",
          [isBest ? 1 : 0, isExtended ? 1 : 0, id],
        );
        await writeMemberships(
          driver,
          { id, isBest, isExtended, modes },
          timestamp,
        );
      }
    };
    let curation;
    if (sqlDialect !== "sqlite") {
      await db.transaction(async (transaction) => {
        await transaction.run(
          "UPDATE target_catalogue_entries SET source_present = 0",
        );
        let sequence = await firstFreeSequence(transaction);
        const context = {
          sources,
          revision,
          timestamp,
          curated: curatedFlags,
          currentFlags,
          ownImages,
          nextSequence: () => sequence++,
        };
        for await (const slice of slices())
          await writeSlice(transaction, slice, context);
        curation = targetCurationForTargets(projections);
        await writeCuratedFlags(transaction, curation);
        await recordSynchronizedState(
          transaction,
          revision,
          timestamp,
          metadataOf(),
        );
      });
    } else {
      let sequence = await firstFreeSequence(db);
      const context = {
        sources,
        revision,
        timestamp,
        curated: curatedFlags,
        currentFlags,
        ownImages,
        nextSequence: () => sequence++,
      };
      for await (const slice of slices()) {
        await yieldToEventLoop();
        await db.transaction((transaction) =>
          writeSlice(transaction, slice, context),
        );
      }
      curation = targetCurationForTargets(projections);
      await yieldToEventLoop();
      await db.transaction(async (transaction) => {
        await writeCuratedFlags(transaction, curation);
        await transaction.run(
          "UPDATE target_catalogue_entries SET source_present = 0 WHERE source_revision <> ?",
          [revision],
        );
        await recordSynchronizedState(
          transaction,
          revision,
          timestamp,
          metadataOf(),
        );
      });
    }
    const counts = curation.counts;
    projections.length = 0;
    await serialized(catalogueDeriveLockKey, deriveAll);
    return {
      changed: true,
      counts: await selectionCounts(db),
      curation: counts,
    };
  };

  /**
   * Sets integer `columns` of rows: `rows` are `[...values, id]`. SQLite (in
   * the process) one statement per row; PostgreSQL one statement per 500
   * rows (`UPDATE … FROM (VALUES …)`), not one round trip per row.
   */
  const updateRows = async (driver, columns, rows) => {
    if (sqlDialect === "sqlite") {
      const sql = `UPDATE target_catalogue_entries SET ${columns
        .map((column) => `${column} = ?`)
        .join(", ")} WHERE id = ?`;
      for (const values of rows) await driver.run(sql, values);
      return;
    }
    for (const part of chunks(rows, sliceLength))
      await driver.run(
        `UPDATE target_catalogue_entries AS entry SET ${columns
          .map((column) => `${column} = v.${column}`)
          .join(", ")}
         FROM (VALUES ${part
           .map(
             () => `(${columns.map(() => "?::integer").join(", ")}, ?::text)`,
           )
           .join(", ")}) AS v(${columns.join(", ")}, id)
         WHERE entry.id = v.id`,
        part.flat(),
      );
  };

  /**
   * The lookup keys, catalogues and flags of the rows of `ids` (all of them
   * when null), as the rows stand: read a slice at a time, written back by
   * slices, nothing kept.
   */
  const deriveRows = async (ids = null) => {
    if (ids === null) {
      await db.run("DELETE FROM target_catalogue_lookup_keys");
      await db.run("DELETE FROM target_catalogue_names");
    } else
      for (const slice of chunks(ids)) {
        await db.run(
          `DELETE FROM target_catalogue_lookup_keys WHERE target_id IN (${placeholders(slice.length)})`,
          slice,
        );
        await db.run(
          `DELETE FROM target_catalogue_names WHERE target_id IN (${placeholders(slice.length)})`,
          slice,
        );
      }
    const premiumMedia = new Map(
      (
        await db.query(
          "SELECT target_id, metadata_json FROM target_media WHERE variant = 'premium'",
        )
      ).rows.map((row) => [row.target_id, parseJson(row.metadata_json, null)]),
    );
    const columns = `e.id, e.designation, e.aliases_json, e.common_names_json,
      e.catalogues_json, e.premium_image_json, e.editorial_json, e.source_json,
      e.has_premium_image, e.has_distance, e.has_published_pages${
        raw ? ", r.entry_json" : ""
      }`;
    const from = `target_catalogue_entries e${
      raw ? " JOIN target_catalogue_raw r ON r.id = e.id" : ""
    }`;
    const slices = async function* () {
      if (ids !== null) {
        for (const slice of chunks(ids))
          yield (
            await db.query(
              `SELECT ${columns} FROM ${from}
               WHERE e.source_present = 1 AND e.id IN (${placeholders(slice.length)})`,
              slice,
            )
          ).rows;
        return;
      }
      let last = null;
      for (;;) {
        const slice = (
          await db.query(
            `SELECT ${columns} FROM ${from}
             WHERE e.source_present = 1 ${last === null ? "" : "AND e.id > ?"}
             ORDER BY e.id LIMIT ?`,
            last === null ? [sliceLength] : [last, sliceLength],
          )
        ).rows;
        if (!slice.length) return;
        last = slice[slice.length - 1].id;
        yield slice;
      }
    };
    for await (const slice of slices()) {
      const keys = [];
      const names = [];
      const flags = [];
      for (const row of slice) {
        const entry = {
          id: row.id,
          designation: row.designation,
          aliases: parseJson(row.aliases_json, []),
          commonNames: parseJson(row.common_names_json, []),
        };
        // Raw: the keys, catalogues and distance of the source's record.
        const rawEntry = raw ? parseJson(row.entry_json, {}) : null;
        for (const key of raw
          ? [...new Set(targetLookupKeys(rawEntry))]
          : storedLookupKeys(entry))
          keys.push([key, row.id]);
        for (const catalogue of new Set(
          raw
            ? Array.isArray(rawEntry.catalogues)
              ? rawEntry.catalogues
              : []
            : parseJson(row.catalogues_json, []),
        ))
          names.push([row.id, String(catalogue)]);
        const premium =
          premiumMedia.get(row.id) ?? parseJson(row.premium_image_json, null);
        const next = [
          premium ? 1 : 0,
          targetDistanceOf(
            raw ? rawEntry : { source: parseJson(row.source_json, {}) },
          )
            ? 1
            : 0,
          isPublishedPagesResearch(
            parseJson(row.editorial_json, {})?.catalogueResearch,
          )
            ? 1
            : 0,
        ];
        const stored = [
          row.has_premium_image,
          row.has_distance,
          row.has_published_pages,
        ].map(Number);
        if (next.some((value, index) => value !== stored[index]))
          flags.push([...next, row.id]);
      }
      await db.transaction(async (transaction) => {
        for (const part of chunks(keys, 200))
          await transaction.run(
            `INSERT INTO target_catalogue_lookup_keys (lookup_key, target_id)
             VALUES ${part.map(() => "(?, ?)").join(", ")}
             ON CONFLICT DO NOTHING`,
            part.flat(),
          );
        for (const part of chunks(names, 200))
          await transaction.run(
            `INSERT INTO target_catalogue_names (target_id, catalogue)
             VALUES ${part.map(() => "(?, ?)").join(", ")}
             ON CONFLICT DO NOTHING`,
            part.flat(),
          );
        await updateRows(
          transaction,
          ["has_premium_image", "has_distance", "has_published_pages"],
          flags,
        );
      });
      await yieldToEventLoop();
    }
  };

  /**
   * The two orders of the catalogue (`storage_rank`, `designation_rank`):
   * every present row's designation and sequence read (a few dozen bytes
   * each), sorted, and the ranks that moved written.
   */
  const rankAll = async () => {
    const rows = [];
    let last = null;
    for (;;) {
      const slice = (
        await db.query(
          `SELECT e.id, e.designation, e.catalogue_sequence, e.storage_rank,
             e.designation_rank${raw ? ", r.pool_json" : ""}
           FROM target_catalogue_entries e${
             raw ? " JOIN target_catalogue_raw r ON r.id = e.id" : ""
           }
           WHERE e.source_present = 1 ${last === null ? "" : "AND e.id > ?"}
           ORDER BY e.id LIMIT ?`,
          last === null ? [2000] : [last, 2000],
        )
      ).rows;
      if (!slice.length) break;
      last = slice[slice.length - 1].id;
      for (const row of slice) {
        const source = raw ? parseJson(row.pool_json, {}) : row;
        rows.push({
          id: row.id,
          // Raw: the source's own order (its sequence) and designation.
          key: raw
            ? Buffer.alloc(0)
            : Buffer.from(asciiLower(row.designation), "utf8"),
          designation: String(source.designation || source.id || row.id),
          sequence: Number(row.catalogue_sequence),
          storedStorage:
            row.storage_rank === null ? null : Number(row.storage_rank),
          storedDesignation:
            row.designation_rank === null ? null : Number(row.designation_rank),
        });
      }
      await yieldToEventLoop();
    }
    const storage = await sortedInSlices(
      rows,
      (left, right) =>
        Buffer.compare(left.key, right.key) || left.sequence - right.sequence,
    );
    storage.forEach((row, index) => {
      row.storageRank = index;
    });
    const designations = await sortedInSlices(
      [...storage],
      (left, right) =>
        designationCollator.compare(left.designation, right.designation) ||
        left.storageRank - right.storageRank,
    );
    designations.forEach((row, index) => {
      row.designationRank = index;
    });
    const changed = rows.filter(
      (row) =>
        row.storageRank !== row.storedStorage ||
        row.designationRank !== row.storedDesignation,
    );
    for (const part of chunks(changed, sliceLength)) {
      await db.transaction((transaction) =>
        updateRows(
          transaction,
          ["storage_rank", "designation_rank"],
          part.map((row) => [row.storageRank, row.designationRank, row.id]),
        ),
      );
      await yieldToEventLoop();
    }
    await db.run(
      `UPDATE target_catalogue_entries SET storage_rank = NULL, designation_rank = NULL
       WHERE source_present = 0 AND (storage_rank IS NOT NULL OR designation_rank IS NOT NULL)`,
    );
    return changed.length;
  };

  /** Records that the derived data describe the catalogue's revision now. */
  const markDerived = async () =>
    await db.run(
      "UPDATE target_catalogue_state SET derived_revision = revision WHERE id = ?",
      [stateId],
    );

  /**
   * The derived columns and tables of migration 93, for the catalogue as it
   * stands: rebuilt after every import and whenever the catalogue's revision
   * moved without them (`ensureDerived`).
   */
  const deriveAll = async () => {
    // Rows written before the sequence existed take it in their first
    // order (SQLite's `rowid`; their creation on PostgreSQL).
    const highest = (await firstFreeSequence(db)) - 1;
    if (sqlDialect === "sqlite")
      await db.run(
        "UPDATE target_catalogue_entries SET catalogue_sequence = ? + rowid WHERE catalogue_sequence IS NULL AND library_source = 'catalogue'",
        [highest],
      );
    else
      await db.run(
        `UPDATE target_catalogue_entries AS entry
         SET catalogue_sequence = ordered.position + ?
         FROM (
           SELECT id, row_number() OVER (ORDER BY created_at, id) AS position
           FROM target_catalogue_entries
           WHERE catalogue_sequence IS NULL AND library_source = 'catalogue'
         ) AS ordered
         WHERE entry.id = ordered.id`,
        [highest],
      );
    await deriveRows();
    await rankAll();
    await markDerived();
  };

  let synchronizing = null;
  // Runs `work` alone, after any synchronization or import in progress, in
  // the same slot `synchronize` uses.
  const exclusively = async (work) => {
    while (synchronizing) await synchronizing.catch(() => {});
    const pending = work();
    synchronizing = pending;
    try {
      return await pending;
    } finally {
      if (synchronizing === pending) synchronizing = null;
    }
  };

  /**
   * Runs `work` while this process holds the PostgreSQL advisory lock `key`,
   * taken in a transaction of its own (on a connection of its own) and
   * released when that transaction ends, whatever `work` does. `wait`: wait
   * for the lock; else give up at once (`{ locked: false }`).
   */
  const withPostgresLock = async (key, work, { wait }) => {
    let outcome = { locked: false };
    await db.transaction(async (holder) => {
      if (wait) await holder.query("SELECT pg_advisory_xact_lock(?)", [key]);
      else if (
        !(
          await holder.query("SELECT pg_try_advisory_xact_lock(?) AS locked", [
            key,
          ])
        ).rows[0]?.locked
      )
        return;
      outcome = { locked: true, value: await work() };
    });
    return outcome;
  };
  /** `work` alone among the processes sharing a PostgreSQL database (SQLite:
   * one process, nothing to share). */
  const serialized = async (key, work) =>
    sqlDialect === "sqlite"
      ? await work()
      : (await withPostgresLock(key, work, { wait: true })).value;

  /** The state row, its metadata parsed. */
  const catalogueState = async () => {
    const row = (
      await db.query("SELECT * FROM target_catalogue_state WHERE id = ?", [
        stateId,
      ])
    ).rows[0];
    return row
      ? {
          ...row,
          revision: Number(row.revision),
          derived_revision:
            row.derived_revision === null || row.derived_revision === undefined
              ? null
              : Number(row.derived_revision),
          metadata: parseJson(row.metadata_json, null),
        }
      : null;
  };

  let deriving = null;
  /** The derived data brought up to the catalogue's revision, once. */
  const ensureDerived = async () => {
    for (;;) {
      if (synchronizing) {
        await synchronizing.catch(() => {});
        continue;
      }
      const state = await catalogueState();
      if (!state || state.derived_revision === state.revision) return state;
      if (deriving) {
        await deriving.catch(() => {});
        continue;
      }
      deriving = exclusively(() =>
        // Another process may have derived meanwhile: checked again under
        // the lock.
        serialized(catalogueDeriveLockKey, async () => {
          const current = await catalogueState();
          if (current && current.derived_revision !== current.revision)
            await deriveAll();
        }),
      ).finally(() => {
        deriving = null;
      });
      await deriving;
    }
  };

  // ---- Search text --------------------------------------------------------

  const searching = new Map();
  /**
   * The folded search text of every target in `locale`, as `compute(target)`
   * gives it (`{ folded, compact }`), rebuilt when `stamp` (the catalogue's
   * revision and the rules' digest) is not the one it was built for.
   */
  const ensureSearch = async (locale, stamp, compute) => {
    const current = (
      await db.query(
        "SELECT stamp FROM target_catalogue_search_state WHERE locale = ?",
        [locale],
      )
    ).rows[0]?.stamp;
    if (current === stamp) return;
    const key = `${locale}\u0000${stamp}`;
    if (!searching.has(key))
      searching.set(
        key,
        exclusively(() =>
          serialized(catalogueSearchLockKey, async () => {
            const built = (
              await db.query(
                "SELECT stamp FROM target_catalogue_search_state WHERE locale = ?",
                [locale],
              )
            ).rows[0]?.stamp;
            if (built === stamp) return;
            await db.run(
              "DELETE FROM target_catalogue_search WHERE locale = ?",
              [locale],
            );
            let last = null;
            for (;;) {
              const slice = (
                await db.query(
                  `SELECT e.id, e.designation, e.aliases_json,
                   e.common_names_json, e.type_key, e.constellation_key${
                     raw ? ", r.pool_json" : ""
                   }
                 FROM target_catalogue_entries e${
                   raw ? " JOIN target_catalogue_raw r ON r.id = e.id" : ""
                 }
                 WHERE e.source_present = 1 ${last === null ? "" : "AND e.id > ?"}
                 ORDER BY e.id LIMIT ?`,
                  last === null ? [sliceLength] : [last, sliceLength],
                )
              ).rows;
              if (!slice.length) break;
              last = slice[slice.length - 1].id;
              const values = slice.map((row) => {
                const { folded, compact } = compute(
                  raw
                    ? parseJson(row.pool_json, {})
                    : {
                        id: row.id,
                        designation: row.designation,
                        aliases: parseJson(row.aliases_json, []),
                        commonNames: parseJson(row.common_names_json, []),
                        typeKey: row.type_key || null,
                        constellationKey: row.constellation_key || null,
                      },
                );
                return [locale, row.id, folded, compact];
              });
              await db.transaction(async (transaction) => {
                for (const part of chunks(values, 100))
                  await transaction.run(
                    `INSERT INTO target_catalogue_search (locale, target_id, folded, compact)
                   VALUES ${part.map(() => "(?, ?, ?, ?)").join(", ")}`,
                    part.flat(),
                  );
              });
              await yieldToEventLoop();
            }
            await db.run(
              `INSERT INTO target_catalogue_search_state (locale, stamp, built_at)
             VALUES (?, ?, ?)
             ON CONFLICT(locale) DO UPDATE SET stamp = excluded.stamp, built_at = excluded.built_at`,
              [locale, stamp, now()],
            );
          }),
        ).finally(() => searching.delete(key)),
      );
    await searching.get(key);
  };

  // ---- Reads ---------------------------------------------------------------

  /** `instr` in SQLite, `strpos` in PostgreSQL: the 1-based position of a
   * substring, 0 when absent — on characters, as JavaScript's `includes`. */
  const position = (haystack) =>
    sqlDialect === "sqlite"
      ? `instr(${haystack}, ?)`
      : `strpos(${haystack}, ?)`;

  /**
   * The SQL of a pool: `filter` names what the rows must satisfy. Every
   * condition here selects *at least* the rows the catalogue's own rules
   * (`target-library.server.js`) keep — the season and the planner's band
   * are widened a little, the rest is exact — and those rules are applied
   * again to what comes back, so that a page is what it always was.
   */
  const poolQuery = (requested = {}) => {
    // Raw: the normalized columns may differ from the source's records, so
    // only the exact conditions (the search, the identifiers) are asked of
    // the database; the rules decide the rest.
    const filter = raw
      ? { search: requested.search, ids: requested.ids }
      : requested;
    const clauses = ["e.source_present = 1", "e.designation_rank IS NOT NULL"];
    const values = [];
    let join = raw ? "JOIN target_catalogue_raw r ON r.id = e.id" : "";
    const columns = [
      raw ? "r.pool_json, e.id, e.designation_rank" : poolColumns,
    ];
    if (filter.search) {
      join +=
        " LEFT JOIN target_catalogue_search s ON s.target_id = e.id AND s.locale = ?";
      values.push(filter.search.locale);
      const compact = filter.search.compact
        ? ` OR ${position("s.compact")} > 0`
        : "";
      const match = `(${position("s.folded")} > 0${compact})`;
      const matchValues = [
        filter.search.needle,
        ...(filter.search.compact ? [filter.search.compact] : []),
      ];
      if (filter.search.asColumn) {
        columns.push(`CASE WHEN ${match} THEN 1 ELSE 0 END AS query_match`);
        values.unshift(...matchValues);
      } else {
        clauses.push(
          filter.search.orSolarSystem
            ? `(${match} OR e.catalogue = 'Système solaire')`
            : match,
        );
        values.push(...matchValues);
      }
    }
    if (filter.ids) {
      if (!filter.ids.length) clauses.push("1 = 0");
      else {
        clauses.push(`e.id IN (${placeholders(filter.ids.length)})`);
        values.push(...filter.ids);
      }
    }
    if (filter.typeKey) {
      clauses.push("e.type_key = ?");
      values.push(filter.typeKey);
    }
    if (filter.constellationKey) {
      clauses.push("e.constellation_key = ?");
      values.push(filter.constellationKey);
    }
    if (filter.catalogue) {
      clauses.push(
        "e.id IN (SELECT target_id FROM target_catalogue_names WHERE catalogue = ?)",
      );
      values.push(filter.catalogue);
    }
    if (filter.selection === "best") clauses.push("e.is_best = 1");
    if (filter.selection === "extended") clauses.push("e.is_extended = 1");
    // A planner's « Étendues »: the two selections together.
    if (filter.selection === "either")
      clauses.push("(e.is_best = 1 OR e.is_extended = 1)");
    if (filter.hemisphere === "north")
      clauses.push(
        "(e.visible_from_northern_hemisphere = 1 OR e.catalogue = 'Système solaire')",
      );
    if (filter.hemisphere === "south")
      clauses.push(
        "(e.visible_from_southern_hemisphere = 1 OR e.catalogue = 'Système solaire')",
      );
    if (filter.rightAscension) {
      // Hours within `halfWidth` of `centre`, around the clock.
      const { centre, halfWidth } = filter.rightAscension;
      const low = centre - halfWidth;
      const high = centre + halfWidth;
      const ranges = [[Math.max(0, low), Math.min(24, high)]];
      if (low < 0) ranges.push([24 + low, 24]);
      if (high > 24) ranges.push([0, high - 24]);
      clauses.push(
        `(e.catalogue = 'Système solaire' OR ${ranges
          .map(() => "(e.ra_hours >= ? AND e.ra_hours <= ?)")
          .join(" OR ")})`,
      );
      for (const range of ranges) values.push(...range);
    }
    if (filter.declination) {
      const { minimum, maximum, orSolarSystem } = filter.declination;
      clauses.push(
        `((e.ra_hours IS NOT NULL AND e.dec_degrees >= ? AND e.dec_degrees <= ?)${
          orSolarSystem ? " OR e.catalogue = 'Système solaire'" : ""
        })`,
      );
      values.push(minimum, maximum);
    }
    return {
      sql: `SELECT ${columns.join(", ")} FROM target_catalogue_entries e ${join}
        WHERE ${clauses.join(" AND ")}`,
      values,
    };
  };

  /** A pool row as its target: the source's record in the raw mode. */
  const rowTarget = (row) =>
    raw
      ? {
          ...parseJson(row.pool_json, {}),
          designationRank: Number(row.designation_rank),
          ...(row.query_match === undefined
            ? {}
            : { queryMatch: Boolean(Number(row.query_match)) }),
        }
      : poolTarget(row);

  /** The whole entries of `rows` (raw mode: the source's records, their
   * images kept aside for `rawImagesOfEntry`). */
  const wholeOf = async (rows) => {
    if (!raw) return await hydrate(db, rows);
    const ids = rows.map((row) => row.id);
    const records = new Map();
    for (const slice of chunks(ids))
      for (const record of (
        await db.query(
          `SELECT id, entry_json, images_json FROM target_catalogue_raw
           WHERE id IN (${placeholders(slice.length)})`,
          slice,
        )
      ).rows)
        records.set(record.id, record);
    return ids.map((id) => {
      const record = records.get(id);
      if (!record) return null;
      const entry = parseJson(record.entry_json, null);
      if (entry) rawImagesByEntry.set(entry, parseJson(record.images_json, {}));
      return entry;
    });
  };

  return {
    /** Whether the catalogue answers as from its source files (see `raw`). */
    raw,
    async close() {
      if (ownsDriver) await db.close();
    },
    async state() {
      return (
        (
          await db.query("SELECT * FROM target_catalogue_state WHERE id = ?", [
            stateId,
          ])
        ).rows[0] || null
      );
    },
    /** The state with its metadata, the derived data brought up to date. */
    ensureDerived,
    /** Records the source's credit line (`metadata`) on the state. */
    async recordMetadata(metadata) {
      await db.run(
        "UPDATE target_catalogue_state SET metadata_json = ? WHERE id = ?",
        [stringify(metadata, {}), stateId],
      );
    },
    catalogueState,
    /** The search text of `locale`, built for `stamp` (see `ensureSearch`). */
    ensureSearch,
    /**
     * The compact rows matching `filter` (see `poolQuery`), in the
     * catalogue's designation order, as target objects (`poolTarget`). A
     * slice (`limit`, `offset`) or all of them; SQLite reads them a slice
     * at a time, the event loop handed back in between.
     */
    async poolRows(filter = {}, { limit = null, offset = 0 } = {}) {
      const { sql, values } = poolQuery(filter);
      if (limit !== null)
        return (
          await db.query(
            `${sql} ORDER BY e.designation_rank LIMIT ? OFFSET ?`,
            [...values, limit, offset],
          )
        ).rows.map(rowTarget);
      const targets = [];
      let last = -1;
      for (;;) {
        const slice = (
          await db.query(
            `${sql} AND e.designation_rank > ? ORDER BY e.designation_rank LIMIT ?`,
            [...values, last, 2000],
          )
        ).rows;
        for (const row of slice) targets.push(rowTarget(row));
        if (slice.length < 2000) return targets;
        last = Number(slice[slice.length - 1].designation_rank);
        await yieldToEventLoop();
      }
    },
    /** How many rows match `filter`. */
    async poolCount(filter = {}) {
      const { sql, values } = poolQuery(filter);
      return Number(
        (
          await db.query(
            `SELECT COUNT(*) AS count FROM (${sql}) AS pool`,
            values,
          )
        ).rows[0]?.count || 0,
      );
    },
    /** The whole entries of `ids`, in that order (an absent one skipped). */
    /**
     * `lean`: without the texts of the editorial record (`catalogueResearch`,
     * the long pages of a package that keeps them in its seed), for answers
     * that print none of them (an index row, a planner candidate): a page of
     * a thousand rows then holds no page of text.
     */
    async entriesByIds(ids, { lean = false } = {}) {
      const wanted = [...new Set(ids.map(String))];
      const found = new Map();
      const editorial =
        lean && !raw
          ? sqlDialect === "sqlite"
            ? ", json_remove(editorial_json, '$.catalogueResearch') AS editorial_json"
            : ", (editorial_json::jsonb - 'catalogueResearch')::text AS editorial_json"
          : "";
      for (const slice of chunks(wanted)) {
        const rows = (
          await db.query(
            `SELECT *${editorial} FROM target_catalogue_entries
             WHERE source_present = 1 AND id IN (${placeholders(slice.length)})`,
            slice,
          )
        ).rows;
        const entries = await wholeOf(rows);
        rows.forEach((row, index) => {
          const entry = entries[index];
          if (!entry) return;
          if (lean && raw && entry.editorial?.catalogueResearch) {
            const { catalogueResearch: ignored, ...rest } = entry.editorial;
            entry.editorial = rest;
          }
          found.set(row.id, entry);
        });
      }
      return ids.map((id) => found.get(String(id))).filter(Boolean);
    },
    /**
     * The first target (in the catalogue's storage order) one of whose lookup
     * keys is `key`, whole, or null. Every stored target has the key a
     * `source` object gives (`objectSourceLookupKey`): for it, the first
     * target of the catalogue.
     */
    async firstByLookupKey(key) {
      const rows =
        key === objectSourceLookupKey && !raw
          ? (
              await db.query(
                `SELECT * FROM target_catalogue_entries
                 WHERE source_present = 1 AND storage_rank IS NOT NULL
                 ORDER BY storage_rank LIMIT 1`,
              )
            ).rows
          : (
              await db.query(
                `SELECT e.* FROM target_catalogue_lookup_keys k
                 JOIN target_catalogue_entries e ON e.id = k.target_id
                 WHERE k.lookup_key = ? AND e.source_present = 1
                 ORDER BY e.storage_rank LIMIT 1`,
                [key],
              )
            ).rows;
      return rows.length ? ((await wholeOf(rows))[0] ?? null) : null;
    },
    /** The identifiers of the targets having any of `keys`. */
    async idsWithLookupKeys(keys) {
      const ids = new Set();
      for (const slice of chunks([...new Set(keys)]))
        for (const row of (
          await db.query(
            `SELECT DISTINCT k.target_id FROM target_catalogue_lookup_keys k
             JOIN target_catalogue_entries e ON e.id = k.target_id
             WHERE e.source_present = 1
               AND k.lookup_key IN (${placeholders(slice.length)})`,
            slice,
          )
        ).rows)
          ids.add(row.target_id);
      return ids;
    },
    /** The catalogues the targets belong to (`catalogues` of each). */
    async catalogueNames() {
      return (
        await db.query(
          `SELECT DISTINCT n.catalogue FROM target_catalogue_names n
           JOIN target_catalogue_entries e ON e.id = n.target_id
           WHERE e.source_present = 1`,
        )
      ).rows.map((row) => row.catalogue);
    },
    /** Whether some target carries a distance. */
    async hasDistances() {
      return (
        (
          await db.query(
            "SELECT 1 AS present FROM target_catalogue_entries WHERE source_present = 1 AND has_distance = 1 LIMIT 1",
          )
        ).rows.length > 0
      );
    },
    /**
     * The image records of one variant (`dss`, `premium`, `visual`,
     * `visual-preview`) of every target, `[{ id, catalogue, image }]`, as the
     * full entry reads them (the relation first, then the legacy column).
     */
    async mediaOf(variant) {
      if (raw) {
        const key = {
          dss: "dss",
          premium: "premium",
          visual: "visual",
          "visual-preview": "preview",
        }[variant];
        return (
          await db.query(
            `SELECT e.id, e.catalogue, r.images_json
             FROM target_catalogue_entries e
             JOIN target_catalogue_raw r ON r.id = e.id
             WHERE e.source_present = 1`,
          )
        ).rows
          .map((row) => ({
            id: row.id,
            catalogue: row.catalogue,
            image: parseJson(row.images_json, {})[key] || null,
          }))
          .filter((row) => row.image);
      }
      const column = {
        dss: "dss_image_json",
        premium: "premium_image_json",
        visual: "visual_image_json",
      }[variant];
      const rows = (
        await db.query(
          `SELECT e.id, e.catalogue, m.metadata_json
             ${column ? `, e.${column} AS legacy_json` : ""}
           FROM target_catalogue_entries e
           LEFT JOIN target_media m ON m.target_id = e.id AND m.variant = ?
           WHERE e.source_present = 1 AND (m.metadata_json IS NOT NULL${
             column
               ? ` OR (e.${column} IS NOT NULL AND e.${column} <> 'null')`
               : ""
           })`,
          [variant],
        )
      ).rows;
      return rows
        .map((row) => ({
          id: row.id,
          catalogue: row.catalogue,
          image:
            parseJson(row.metadata_json, null) ??
            (column ? parseJson(row.legacy_json, null) : null),
        }))
        .filter((row) => row.image);
    },
    /** The identifiers whose stored editorial carries published pages, in
     * the designation order. */
    async publishedPagesIds() {
      return (
        await db.query(
          `SELECT id FROM target_catalogue_entries
           WHERE source_present = 1 AND has_published_pages = 1
           ORDER BY designation_rank`,
        )
      ).rows.map((row) => row.id);
    },
    /** The designation ranks of `ids` (`Map<id, rank>`). */
    async designationRanks(ids) {
      const ranks = new Map();
      for (const slice of chunks([...new Set(ids)]))
        for (const row of (
          await db.query(
            `SELECT id, designation_rank FROM target_catalogue_entries
             WHERE source_present = 1 AND designation_rank IS NOT NULL
               AND id IN (${placeholders(slice.length)})`,
            slice,
          )
        ).rows)
          ranks.set(row.id, Number(row.designation_rank));
      return ranks;
    },
    /**
     * Every entry, whole, `sliceLength` at a time in the catalogue's storage
     * order (an export; nothing in the service reads the catalogue whole).
     */
    async *entries() {
      await ensureDerived();
      let last = -1;
      for (;;) {
        const rows = (
          await db.query(
            `SELECT * FROM target_catalogue_entries
             WHERE source_present = 1 AND storage_rank > ?
             ORDER BY storage_rank LIMIT ?`,
            [last, sliceLength],
          )
        ).rows;
        if (!rows.length) return;
        last = Number(rows[rows.length - 1].storage_rank);
        yield* await hydrate(db, rows);
        await yieldToEventLoop();
      }
    },
    /**
     * Every entry, whole, in one array: for the operator's scripts that
     * match the whole catalogue against files (visual references). Nothing
     * in the service calls it.
     */
    async all() {
      const entries = [];
      for await (const entry of this.entries()) entries.push(entry);
      return entries;
    },
    /**
     * The tier C pages (`target_texts`): the shards imported, as
     * `Map<"locale/shard", revision>`.
     */
    async textShardRevisions() {
      const rows = (
        await db.query("SELECT locale, shard, revision FROM target_text_shards")
      ).rows;
      return new Map(
        rows.map((row) => [`${row.locale}/${row.shard}`, row.revision]),
      );
    },
    /**
     * Makes the rows of one shard (one language) what the shard file holds:
     * a target's row is written when its revision differs (or it came from
     * another shard), a row of the shard whose target is no longer in the
     * file is deleted, and the shard's own revision is recorded, all in one
     * transaction. `entries` are the shard's entries (`target-text-shards.js`),
     * each stored whole as the row's content. One
     * shard at a time, and never during a catalogue synchronization: the
     * database has one driver.
     */
    async importTextShard({ locale, shard, revision, entries }) {
      return await exclusively(async () => {
        const timestamp = now();
        const counts = { written: 0, kept: 0, retired: 0 };
        await db.transaction(async (transaction) => {
          const stored = new Map(
            (
              await transaction.query(
                "SELECT target_id, revision FROM target_texts WHERE locale = ? AND shard = ?",
                [locale, shard],
              )
            ).rows.map((row) => [row.target_id, row.revision]),
          );
          // One row per target (a later entry of the same target wins, as
          // when the rows were written one by one).
          const byId = new Map();
          for (const entry of entries) byId.set(entry.id, entry);
          const changed = [];
          for (const [id, entry] of byId) {
            if (stored.get(id) === entry.revision) counts.kept += 1;
            else changed.push(entry);
          }
          // Written by statements of `textRowsPerStatement` rows: a shard of
          // tier C is about five hundred rows, one or two round trips to
          // PostgreSQL instead of one per row.
          for (const part of chunks(changed, textRowsPerStatement)) {
            await transaction.run(
              `INSERT INTO target_texts (
                 target_id, locale, shard, tier, revision, content, updated_at
               ) VALUES ${part.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ")}
               ON CONFLICT(target_id, locale) DO UPDATE SET
                 shard = excluded.shard,
                 tier = excluded.tier,
                 revision = excluded.revision,
                 content = excluded.content,
                 updated_at = excluded.updated_at`,
              part.flatMap((entry) => [
                entry.id,
                locale,
                shard,
                entry.tier,
                entry.revision,
                JSON.stringify(entry),
                timestamp,
              ]),
            );
            counts.written += part.length;
          }
          const retired = [...stored.keys()].filter((id) => !byId.has(id));
          for (const part of chunks(retired, textRowsPerStatement)) {
            await transaction.run(
              `DELETE FROM target_texts WHERE locale = ? AND shard = ?
                 AND target_id IN (${placeholders(part.length)})`,
              [locale, shard, ...part],
            );
            counts.retired += part.length;
          }
          await transaction.run(
            `INSERT INTO target_text_shards (locale, shard, revision, targets, imported_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(locale, shard) DO UPDATE SET
               revision = excluded.revision,
               targets = excluded.targets,
               imported_at = excluded.imported_at`,
            [locale, shard, revision, entries.length, timestamp],
          );
        });
        return counts;
      });
    },
    /**
     * Runs the import of the texts' shards (`work`) unless another process
     * runs it: on PostgreSQL, where several processes share one database, the
     * one that takes the advisory lock `textsImportLockKey` imports and the
     * others skip (`{ skipped: true }`) and read what it writes; on SQLite
     * (one process) the import simply runs, a shard at a time
     * (`importTextShard`).
     */
    async withTextsImportLock(work) {
      if (sqlDialect === "sqlite")
        return { skipped: false, value: await work() };
      const outcome = await withPostgresLock(textsImportLockKey, work, {
        wait: false,
      });
      return outcome.locked
        ? { skipped: false, value: outcome.value }
        : { skipped: true };
    },
    /**
     * Forgets the imported shards that are not in `keep` (a set of
     * `"locale/shard"`): their rows and their record. Returns the number of
     * shards forgotten.
     */
    async retireTextShards(keep) {
      return await exclusively(async () => {
        const recorded = (
          await db.query("SELECT locale, shard FROM target_text_shards")
        ).rows.filter((row) => !keep.has(`${row.locale}/${row.shard}`));
        for (const row of recorded)
          await db.transaction(async (transaction) => {
            await transaction.run(
              "DELETE FROM target_texts WHERE locale = ? AND shard = ?",
              [row.locale, row.shard],
            );
            await transaction.run(
              "DELETE FROM target_text_shards WHERE locale = ? AND shard = ?",
              [row.locale, row.shard],
            );
          });
        return recorded.length;
      });
    },
    /** The languages a target has stored text in, with tier and revision. */
    async textLocales(id) {
      return (
        await db.query(
          "SELECT locale, tier, revision FROM target_texts WHERE target_id = ?",
          [text(id, 200)],
        )
      ).rows;
    },
    /** The stored text of a target in one language: `{ tier, revision, entry }`. */
    async text(id, locale) {
      const row = (
        await db.query(
          "SELECT tier, revision, content FROM target_texts WHERE target_id = ? AND locale = ?",
          [text(id, 200), text(locale, 35)],
        )
      ).rows[0];
      return row
        ? {
            tier: row.tier,
            revision: row.revision,
            entry: parseJson(row.content, null),
          }
        : null;
    },
    /**
     * The stored text of the targets of tiers A and B in one language, for the
     * offline pack (tier C never travels in it): `Map<targetId, { tier,
     * revision, page }>`. About six hundred rows, a few megabytes.
     */
    async packTexts(locale) {
      const rows = (
        await db.query(
          "SELECT target_id, tier, revision, content FROM target_texts WHERE locale = ? AND tier IN ('A', 'B') ORDER BY target_id",
          [text(locale, 35)],
        )
      ).rows;
      return new Map(
        rows.map((row) => [
          row.target_id,
          {
            tier: row.tier,
            revision: row.revision,
            entry: parseJson(row.content, null),
          },
        ]),
      );
    },
    /**
     * Where the import of the stored texts stands: changes whenever a shard
     * is imported or forgotten. What the memoized offline-pack bundles and
     * the catalogue fingerprint are keyed on besides the catalogue.
     */
    async textsStamp() {
      const row = (
        await db.query(
          "SELECT COUNT(*) AS count, MAX(imported_at) AS latest FROM target_text_shards",
        )
      ).rows[0];
      return `${Number(row?.count || 0)}:${row?.latest || ""}`;
    },
    /** How many rows the table holds (a diagnostic and a test seam). */
    async textCount() {
      return Number(
        (await db.query("SELECT COUNT(*) AS count FROM target_texts")).rows[0]
          .count,
      );
    },
    /** Whether the table holds any target at all (a new database holds none). */
    async hasEntries() {
      return (
        (
          await db.query(
            "SELECT 1 AS present FROM target_catalogue_entries LIMIT 1",
          )
        ).rows.length > 0
      );
    },
    /**
     * Imports `library` (`targets`: an array or an async iterable of source
     * targets; `source`, `license`, `importedAt`, `url`, or `metadata()`
     * giving them at the end) under `sourceRevision`, unless the catalogue
     * already holds that revision.
     */
    async synchronize({
      library,
      images = {},
      premiumImages = {},
      visualImages = {},
      visualPreviewImages = {},
      sourceRevision,
      ownImages = null,
    }) {
      if (
        !Array.isArray(library?.targets) &&
        typeof library?.targets?.[Symbol.asyncIterator] !== "function"
      )
        throw new Error("Target library is invalid.");
      const revision = text(sourceRevision, 500);
      if (!revision) throw new Error("Target library revision is required.");
      // One import at a time: a second caller (another request finding the
      // same new source) waits for the one in progress, then finds it done.
      while (synchronizing) await synchronizing.catch(() => {});
      const current = await this.state();
      if (current?.source_revision === revision)
        return { changed: false, counts: await selectionCounts(db) };
      // On PostgreSQL every process may find the same new source: the one
      // that gets the lock imports it, the others then find it imported.
      const pending = serialized(catalogueImportLockKey, async () => {
        if ((await catalogueState())?.source_revision === revision)
          return { changed: false, counts: await selectionCounts(db) };
        return await synchronizeSource({
          library,
          images,
          premiumImages,
          visualImages,
          visualPreviewImages,
          revision,
          ownImages,
        });
      });
      synchronizing = pending;
      try {
        return await pending;
      } finally {
        if (synchronizing === pending) synchronizing = null;
      }
    },
    async get(id) {
      const row = (
        await db.query(
          "SELECT * FROM target_catalogue_entries WHERE id = ? AND source_present = 1",
          [text(id, 200)],
        )
      ).rows[0];
      return row ? (await hydrate(db, [row]))[0] : null;
    },
    async list({ query = "", selection = "", offset = 0, limit = 48 } = {}) {
      const normalizedQuery = text(query, 160).toLowerCase();
      const safeSelection = ["best", "extended"].includes(selection)
        ? selection
        : "";
      const clauses = ["source_present = 1"];
      const values = [];
      if (safeSelection === "best") clauses.push("is_best = 1");
      if (safeSelection === "extended") clauses.push("is_extended = 1");
      if (normalizedQuery) {
        clauses.push(
          "(lower(designation) LIKE ? OR lower(aliases_json) LIKE ? OR lower(common_names_json) LIKE ?)",
        );
        const match = `%${normalizedQuery.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
        values.push(match, match, match);
      }
      const where = clauses.join(" AND ");
      const safeLimit = Math.max(
        1,
        Math.min(96, Math.floor(Number(limit) || 48)),
      );
      const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
      const total = (
        await db.query(
          `SELECT COUNT(*) AS count FROM target_catalogue_entries WHERE ${where}`,
          values,
        )
      ).rows[0].count;
      const rows = (
        await db.query(
          `SELECT * FROM target_catalogue_entries
         WHERE ${where}
         ORDER BY is_best DESC, is_extended DESC, lower(designation)
         LIMIT ? OFFSET ?`,
          [...values, safeLimit, safeOffset],
        )
      ).rows;
      return {
        total: Number(total || 0),
        offset: safeOffset,
        limit: safeLimit,
        entries: await hydrate(db, rows),
        counts: await selectionCounts(db),
      };
    },
    async save(input) {
      const stored = await this.get(input?.id);
      if (!stored) throw new Error("Target was not found.");
      const entry = editableTarget(input, stored);
      const timestamp = now();
      const update = `UPDATE target_catalogue_entries SET
          designation = ?, aliases_json = ?, common_names_json = ?, type_key = ?,
          constellation_key = ?, ra_hours = ?, dec_degrees = ?,
          apparent_size_arcmin_json = ?, magnitude = ?, surface_brightness = ?,
          catalogues_json = ?, catalogue = ?, dss_image_json = ?,
          premium_image_json = ?, visual_image_json = ?, is_best = ?,
          is_extended = ?, visible_from_northern_hemisphere = ?,
          visible_from_southern_hemisphere = ?, editorial_json = ?,
          overrides_json = ?, updated_at = ?
         WHERE id = ? AND source_present = 1`;
      await exclusively(async () => {
        await db.transaction(async (transaction) => {
          await transaction.run(update, [
            entry.designation,
            stringify(entry.aliases, []),
            stringify(entry.commonNames, []),
            entry.typeKey,
            entry.constellationKey,
            entry.raHours,
            entry.decDegrees,
            stringify(entry.apparentSizeArcmin, null),
            entry.magnitude,
            entry.surfaceBrightness,
            stringify(entry.catalogues, []),
            entry.catalogue,
            stringify(entry.dssImage, null),
            stringify(entry.premiumImage, null),
            stringify(entry.visualImage, null),
            entry.isBest ? 1 : 0,
            entry.isExtended ? 1 : 0,
            entry.visibleFromNorthernHemisphere ? 1 : 0,
            entry.visibleFromSouthernHemisphere ? 1 : 0,
            stringify(entry.editorial, {}),
            stringify(sourceOverridesFor(entry), {}),
            timestamp,
            entry.id,
          ]);
          await writeRelations(transaction, entry, timestamp);
          await bumpRevision(transaction);
        });
        // The edited target's keys, catalogues and flags; the orders only
        // when its designation moved.
        await serialized(catalogueDeriveLockKey, async () => {
          await deriveRows([entry.id]);
          if (entry.designation !== stored.designation) await rankAll();
          await markDerived();
        });
      });
      return await this.get(entry.id);
    },
    async applyEditorialResearch(profiles, { replace = false } = {}) {
      if (!Array.isArray(profiles))
        throw new Error("Editorial research profiles must be an array.");
      const update = `UPDATE target_catalogue_entries
         SET editorial_json = ?, updated_at = ?
         WHERE id = ? AND source_present = 1`;
      const timestamp = now();
      let updated = 0;
      let skipped = 0;
      await db.transaction(async (transaction) => {
        for (const profile of profiles) {
          const id = text(profile?.id, 200);
          if (!id || !jsonObject(profile?.research)) continue;
          const row = (
            await transaction.query(
              "SELECT id, editorial_json FROM target_catalogue_entries WHERE id = ? AND source_present = 1",
              [id],
            )
          ).rows[0];
          if (!row) continue;
          const editorial = parseJson(row.editorial_json, {});
          if (editorial.catalogueResearch && !replace) {
            skipped += 1;
            continue;
          }
          await transaction.run(update, [
            stringify(
              { ...editorial, catalogueResearch: profile.research },
              {},
            ),
            timestamp,
            id,
          ]);
          updated += 1;
        }
        if (updated) await bumpRevision(transaction);
      });
      return { updated, skipped };
    },
    async exportSeed({ source, directory } = {}) {
      const entries = this.entries();
      async function* exported() {
        for await (const entry of entries)
          yield {
            id: entry.id,
            designation: entry.designation,
            aliases: entry.aliases,
            commonNames: entry.commonNames,
            typeKey: entry.typeKey,
            constellationKey: entry.constellationKey,
            coordinate: entry.coordinate,
            apparentSizeArcmin: entry.apparentSizeArcmin,
            magnitude: entry.magnitude,
            surfaceBrightness: entry.surfaceBrightness,
            catalogues: entry.catalogues,
            catalogue: entry.catalogue,
            dssImage: entry.dssImage,
            premiumImage: entry.premiumImage,
            visualImage: entry.visualImage,
            visualPreviewImage: entry.visualPreviewImage,
            isBest: entry.isBest,
            isExtended: entry.isExtended,
            modes: entry.modes,
            visibleFromNorthernHemisphere: entry.visibleFromNorthernHemisphere,
            visibleFromSouthernHemisphere: entry.visibleFromSouthernHemisphere,
            editorial: entry.editorial,
            // The distance travels on the entry itself, whole, not only
            // inside `source` — a reader of the seed needs it, not only the
            // table.
            ...optionalDistance(entry),
            source: entry.source,
          };
      }
      return writeTargetCatalogueSeed({
        entries: exported(),
        source,
        selectionVersion: targetCurationVersion,
        directory,
      });
    },
  };
}

let sharedRepository = null;
let sharedConfigurationKey = null;

/**
 * The process's catalogue repository on its configured database, or null
 * without one. Created once: callers arriving together (the fill at start,
 * the first catalogue read) share the creation, whose migrations and
 * collection writes run in a transaction of the single driver.
 */
export async function targetCatalogueRepository(
  databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH,
) {
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  const configurationKey = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (!sharedRepository || sharedConfigurationKey !== configurationKey) {
    if (sharedRepository)
      throw new Error(
        "Target catalogue database configuration cannot change during a process.",
      );
    sharedConfigurationKey = configurationKey;
    sharedRepository = createTargetCatalogueRepository({
      databasePath,
      databaseUrl,
      driver: databaseDriver({
        ASTRO_PORTAL_DATABASE_PATH: databasePath,
        ASTRO_PORTAL_DATABASE_URL: databaseUrl,
      }),
      dialect: databaseUrl ? "postgres" : "sqlite",
    }).catch((error) => {
      sharedRepository = null;
      sharedConfigurationKey = null;
      throw error;
    });
  }
  return await sharedRepository;
}

export const targetCatalogueStateId = stateId;
export { targetCurationVersion };
