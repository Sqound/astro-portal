import { handleDataImport } from "../../../../../lib/v1/data-import-service.js";

/**
 * `POST /v1/data-import/preview`: the dry run of « Importer mes données ». The body
 * is the `planastro-export-<date>.zip` of « Exporter mes données »; the answer is
 * the plan of its import into the credential's space — box by box, « à importer »
 * and « déjà présent », and the points to note. Writes nothing. On a private
 * portal and where spaces are open, with the space's offer applied.
 */
export async function POST(request) {
  return handleDataImport(request, "preview");
}
