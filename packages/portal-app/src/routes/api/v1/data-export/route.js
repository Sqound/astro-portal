import {
  DATA_EXPORT_PARTS,
  dataExportParts,
} from "portal/data-export/rules.js";
import { deviceOrSessionReadV1Access } from "../../../../lib/v1/access.js";
import {
  dataExportFailure,
  requireDataExportService,
} from "../../../../lib/v1/data-export-service.js";
import { v1Json } from "../../../../lib/v1/response.js";

const invalid = (message) =>
  v1Json({ error: { code: "invalid_request", message } }, { status: 400 });

/**
 * `GET /v1/data-export?parts=plans,places,equipment,framings,journal,sky-measurements&date=AAAA-MM-JJ`
 * (« Exporter mes données »): the ZIP of the ticked boxes of the credential's own space — one JSON per
 * box and a README naming the format version — named `planastro-export-<date>.zip` with the browser's
 * date (the service's UTC date when absent). Free, on every composition; a device bearer or a web
 * session. `400` `invalid_request` for a box that is not one, no box, or a date that is not a day.
 */
export async function GET(request) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  const query = new URL(request.url).searchParams;
  const parts = query.has("parts")
    ? dataExportParts(query.get("parts"))
    : [...DATA_EXPORT_PARTS];
  if (!parts) return invalid("parts names a box that is not one.");
  if (!parts.length) return invalid("Tick at least one box (parts).");
  try {
    const archive = await (
      await requireDataExportService()
    ).archive({
      tenantId: access.tenantId,
      parts,
      date: query.get("date"),
    });
    return new Response(archive.bytes, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/zip",
        "Content-Length": String(archive.bytes.length),
        "Content-Disposition": `attachment; filename="${archive.filename}"`,
      },
    });
  } catch (error) {
    return dataExportFailure(error);
  }
}
