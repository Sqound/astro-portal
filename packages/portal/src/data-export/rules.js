/**
 * « Exporter mes données »: the rule that turns what a space (or a phone)
 * holds into the files of `planastro-export-<AAAA-MM-JJ>.zip` — one JSON per
 * ticked box and a `README.md` naming the format version. Pinned by
 * the fixtures `data-export` and `data-export-summary`.
 *
 * The rule never reads a database: its caller hands it a `source` already
 * gathered — the service from its repositories (`./service.js`), a client
 * from its local data — in this shape (every list may be
 * absent, which reads as empty):
 *
 * - `plans`: the plans, each the planner's plan (`id`, `date`, `name`,
 *   `items`, …) with the resource's own id as `resourceId` when there is one;
 * - `nights`: the planner's nights (the planner document's `nights`, each
 *   `{ id, date, location, … }` as the planner keeps it — the night a plan
 *   names by its `nightId`); a client that keeps none of its own sends an
 *   empty list;
 * - `projects`: the multi-night plans, as their resources;
 * - `places`: the personal places, each with its own horizon (`horizonMask`);
 * - `horizonProfiles`: the horizons recorded apart from a place;
 * - `equipment`: the owner's equipment inventory;
 * - `framings`: the saved framings;
 * - `sessions`: the nights executed, each with its `events`;
 * - `debriefs`: the debriefings, `{ planId, outcome, decidedAt, targets }`;
 * - `skyMeasurements`: the measured sky backgrounds, `{ placeId, measures }`.
 *
 * Identifiers are kept as they are: the import of a private portal finds a
 * record by its identifier and never overwrites one already there.
 */

export const DATA_EXPORT_FORMAT_VERSION = 1;

/** The file of each box inside the ZIP, in the order of the screen. */
export const DATA_EXPORT_FILES = Object.freeze({
  plans: "plans.json",
  places: "places.json",
  equipment: "equipment.json",
  framings: "framings.json",
  journal: "journal.json",
  "sky-measurements": "sky-measurements.json",
});

/** The six boxes, in the order of the screen and of the file. */
export const DATA_EXPORT_PARTS = Object.freeze(Object.keys(DATA_EXPORT_FILES));

export const DATA_EXPORT_README = "README.md";

/** The line of the README (and of the ⓘ) on the private gallery's images. */
export const DATA_EXPORT_GALLERY_LINE =
  "Les images de la galerie privée restent dans l’espace : elles ne sont pas dans le fichier.";

const list = (value) =>
  Array.isArray(value)
    ? value.filter(
        (entry) => entry && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];

/**
 * The boxes asked for, in the canonical order, each once; `null` when one
 * of them is not a box (the caller answers « invalid request »). A string is
 * read as the query's comma-separated list.
 */
export function dataExportParts(value) {
  const asked =
    typeof value === "string"
      ? value
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
      : Array.isArray(value)
        ? value.map((part) => String(part))
        : [];
  if (asked.some((part) => !DATA_EXPORT_PARTS.includes(part))) return null;
  return DATA_EXPORT_PARTS.filter((part) => asked.includes(part));
}

/** `planastro-export-2026-10-05.zip`, or `null` for a date that is not one. */
export function dataExportFilename(date) {
  const text = String(date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== text
  )
    return null;
  return `planastro-export-${text}.zip`;
}

/**
 * Whether a place's own horizon was recorded: a mask that is on and lifts
 * the horizon somewhere (a flat mask hides nothing and was never drawn).
 */
function recordedHorizon(mask) {
  if (!mask || typeof mask !== "object" || mask.enabled !== true) return false;
  return list(mask.points).some(
    (point) => typeof point.altitude === "number" && point.altitude > 0,
  );
}

/**
 * The counts of the six boxes: « Plans · dont 1 plan multi-nuits · 12 »
 * (the multi-night plans are among the plans), « 4 lieux, 3 horizons
 * relevés », « 5 », « 7 », « 18 nuits », « 6 mesures ».
 */
export function dataExportCounts(source = {}) {
  const projects = list(source?.projects).length;
  const places = list(source?.places);
  return {
    plans: {
      count: list(source?.plans).length + projects,
      multiNight: projects,
    },
    places: {
      count: places.length,
      horizons:
        places.filter((place) => recordedHorizon(place.horizonMask)).length +
        list(source?.horizonProfiles).length,
    },
    equipment: { count: list(source?.equipment).length },
    framings: { count: list(source?.framings).length },
    journal: { count: list(source?.sessions).length },
    "sky-measurements": {
      count: list(source?.skyMeasurements).reduce(
        (total, place) => total + list(place.measures).length,
        0,
      ),
    },
  };
}

function partContent(part, source) {
  switch (part) {
    case "plans":
      return {
        plans: list(source.plans),
        nights: list(source.nights),
        projects: list(source.projects),
      };
    case "places":
      return {
        places: list(source.places),
        horizonProfiles: list(source.horizonProfiles),
      };
    case "equipment":
      return { equipment: list(source.equipment) };
    case "framings":
      return { framings: list(source.framings) };
    case "journal":
      return {
        sessions: list(source.sessions).map((session) => ({
          ...session,
          events: list(session.events),
        })),
        debriefs: list(source.debriefs),
      };
    default:
      return {
        places: list(source.skyMeasurements).map((place) => ({
          ...place,
          measures: list(place.measures),
        })),
      };
  }
}

/** The instant of the export as the files write it, or `null`. */
function exportInstant(value) {
  const stamp = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isNaN(stamp.getTime()) ? null : stamp.toISOString();
}

const README_LINES = {
  plans: [
    "Plans (plans d’une nuit et plans multi-nuits)",
    "Plans (one-night plans and multi-night plans)",
  ],
  places: ["Lieux et horizons relevés", "Places and recorded horizons"],
  equipment: ["Matériel", "Equipment"],
  framings: ["Cadrages", "Framings"],
  journal: [
    "Journal et bilans (sessions exécutées, leurs événements, leurs bilans)",
    "Journal and debriefings (sessions executed, their events, their debriefings)",
  ],
  "sky-measurements": ["Fond de ciel mesuré", "Measured sky background"],
};

/**
 * The README of the file. Its first lines are read by a machine (the
 * import of a private portal): `formatVersion: 1`, the instant of the export
 * and the boxes present, one `key: value` each, then a blank line; the rest
 * is for the person who opens it.
 */
export function dataExportReadme({ parts, exportedAt } = {}) {
  const present = dataExportParts(parts) || [];
  const files = present.map(
    (part) => `- ${DATA_EXPORT_FILES[part]} — ${README_LINES[part][0]}`,
  );
  const filesEn = present.map(
    (part) => `- ${DATA_EXPORT_FILES[part]} — ${README_LINES[part][1]}`,
  );
  return [
    `formatVersion: ${DATA_EXPORT_FORMAT_VERSION}`,
    `exportedAt: ${exportInstant(exportedAt) ?? ""}`,
    `parts: ${present.join(", ")}`,
    "",
    "# PlanAstro — mes données",
    "",
    "Ce fichier .zip contient un fichier JSON par élément coché, décrit par son schéma (format version 1) :",
    "",
    ...files,
    "",
    DATA_EXPORT_GALLERY_LINE,
    "",
    "Il se charge tel quel dans un portail privé PlanAstro.",
    "",
    "---",
    "",
    "This .zip file holds one JSON file per ticked item, each described by its schema (format version 1):",
    "",
    ...filesEn,
    "",
    "The private gallery’s images stay in the space: they are not in the file.",
    "",
    "It loads as it is into a private PlanAstro portal.",
    "",
  ].join("\n");
}

/**
 * The README's first lines as an object (`export/data-export-readme.schema.json`),
 * or `null` when the text does not start with them.
 */
export function parseDataExportReadme(text) {
  const lines = String(text ?? "").split("\n");
  const fields = {};
  for (const line of lines) {
    if (!line.trim()) break;
    const match = /^([A-Za-z]+): ?(.*)$/.exec(line);
    if (!match) return null;
    fields[match[1]] = match[2];
  }
  const version = Number(fields.formatVersion);
  if (!Number.isInteger(version) || !fields.exportedAt) return null;
  return {
    formatVersion: version,
    exportedAt: fields.exportedAt,
    parts: String(fields.parts ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  };
}

/**
 * The files of the export: the README first, then one JSON per ticked box,
 * in the order of the boxes. A box with nothing is still a file (its lists
 * are empty); an unticked box is no file at all.
 */
export function dataExportDocuments({ parts, exportedAt, source } = {}) {
  const present = dataExportParts(parts) || [];
  const instant = exportInstant(exportedAt);
  const data = source && typeof source === "object" ? source : {};
  return {
    files: [
      {
        name: DATA_EXPORT_README,
        text: dataExportReadme({ parts: present, exportedAt: instant }),
      },
      ...present.map((part) => ({
        name: DATA_EXPORT_FILES[part],
        document: {
          formatVersion: DATA_EXPORT_FORMAT_VERSION,
          part,
          exportedAt: instant,
          ...partContent(part, data),
        },
      })),
    ],
  };
}

/** A file's bytes as they are written: JSON with two spaces and a newline. */
export function dataExportFileText(file) {
  return typeof file.text === "string"
    ? file.text
    : `${JSON.stringify(file.document, null, 2)}\n`;
}
