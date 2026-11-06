import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DATA_EXPORT_FILES,
  DATA_EXPORT_FORMAT_VERSION,
  DATA_EXPORT_PARTS,
  DATA_EXPORT_README,
  parseDataExportReadme,
} from "../data-export/rules.js";
import { schemaErrors } from "./schema-check.js";
import { ZipReadError, ZipTooLargeError, readZip } from "./zip-reader.js";

/**
 * « Importer mes données »: the reading of the file of « Exporter mes
 * données » — `planastro-export-<AAAA-MM-JJ>.zip`, one JSON per box and a
 * README naming the format version. The README is read first: version 1
 * only, any other refused with its number. Each JSON present is checked
 * against its schema (`packages/astro-contracts/schemas/export/`); one that
 * breaks it refuses the file and names its box. A file the format does not
 * name is ignored and reported; a box whose JSON is not there is « absent
 * du fichier ».
 */

export class DataImportError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "DataImportError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const notAnExport = (message, details = {}) =>
  new DataImportError("not_an_export", message, { status: 400, ...details });

// packages/portal and packages/astro-contracts are sibling directories, as `session-events/registry.js`
// already relies on: the schemas are read
// from their own package, next to this module's, whatever the working
// directory (built with `join`, never `new URL(…, import.meta.url)`, which
// bundlers try to resolve as an asset).
export function dataExportSchemaDirectory() {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "astro-contracts",
    "schemas",
    "export",
  );
}

let cachedSchemas = null;

function exportSchemas() {
  if (!cachedSchemas) {
    const directory = dataExportSchemaDirectory();
    const read = (name) =>
      JSON.parse(
        readFileSync(
          join(directory, `data-export-${name}.schema.json`),
          "utf8",
        ),
      );
    cachedSchemas = { readme: read("readme") };
    for (const part of DATA_EXPORT_PARTS) cachedSchemas[part] = read(part);
  }
  return cachedSchemas;
}

const PART_OF_FILE = new Map(
  Object.entries(DATA_EXPORT_FILES).map(([part, file]) => [file, part]),
);

/**
 * What a file holds: `{ formatVersion, exportedAt, documents, absent,
 * unknownFiles }` — `documents` the JSON of each box present, by box,
 * `absent` the boxes the file does not carry, `unknownFiles` the names the
 * format does not know (ignored). Throws `DataImportError`:
 * `not_an_export` (not a ZIP, no README, a damaged entry, a JSON that is
 * not one or breaks its schema — with its `part`), `unsupported_format_version`
 * (with `formatVersion`), `payload_too_large` (inflated content above
 * `limit`).
 */
export function readDataExport(bytes, { limit } = {}) {
  let entries;
  try {
    entries = readZip(bytes, limit ? { limit } : {});
  } catch (error) {
    if (error instanceof ZipTooLargeError)
      throw new DataImportError(
        "payload_too_large",
        "The file's content exceeds what this portal reads.",
        { status: 413 },
      );
    if (error instanceof ZipReadError)
      throw notAnExport(
        error.reason === "damaged"
          ? "An entry of the archive is damaged."
          : "This file is not a PlanAstro export.",
        {
          reason: error.reason,
          ...(error.entry ? { entry: error.entry } : {}),
        },
      );
    throw error;
  }

  const readme = entries.get(DATA_EXPORT_README);
  if (!readme)
    throw notAnExport("This file is not a PlanAstro export (no README.md).");
  const front = parseDataExportReadme(readme.toString("utf8"));
  if (!front)
    throw notAnExport("This file is not a PlanAstro export (README.md).");
  if (front.formatVersion !== DATA_EXPORT_FORMAT_VERSION)
    throw new DataImportError(
      "unsupported_format_version",
      `This file follows format version ${front.formatVersion}; this portal reads version ${DATA_EXPORT_FORMAT_VERSION}.`,
      { status: 422, formatVersion: front.formatVersion },
    );
  const schemas = exportSchemas();
  if (schemaErrors(schemas.readme, front).length)
    throw notAnExport("This file is not a PlanAstro export (README.md).");

  const documents = {};
  const unknownFiles = [];
  for (const [name, data] of entries) {
    if (name === DATA_EXPORT_README) continue;
    const part = PART_OF_FILE.get(name);
    if (!part) {
      unknownFiles.push(name);
      continue;
    }
    let document;
    try {
      document = JSON.parse(data.toString("utf8"));
    } catch {
      throw notAnExport(`${name} is not JSON.`, { part });
    }
    const errors = schemaErrors(schemas[part], document);
    if (errors.length)
      throw notAnExport(`${name} does not follow its schema.`, {
        part,
        errors: errors.slice(0, 5),
      });
    documents[part] = document;
  }
  return {
    formatVersion: front.formatVersion,
    exportedAt: front.exportedAt,
    documents,
    absent: DATA_EXPORT_PARTS.filter((part) => !documents[part]),
    unknownFiles,
  };
}
