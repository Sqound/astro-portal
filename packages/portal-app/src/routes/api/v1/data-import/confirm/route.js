import { handleDataImport } from "../../../../../lib/v1/data-import-service.js";

/**
 * `POST /v1/data-import/confirm`: the import itself — the same body and the
 * same plan as the dry run, written in one transaction: every record « à
 * importer » enters, or none. A record already there is never overwritten nor
 * merged; a second import of the same file writes nothing. On a private portal
 * and where spaces are open; there the offer's limits are applied by archiving.
 */
export async function POST(request) {
  return handleDataImport(request, "confirm");
}
