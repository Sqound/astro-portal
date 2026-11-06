import { deviceOrSessionReadV1Access } from "../../../../../lib/v1/access.js";
import {
  dataExportFailure,
  requireDataExportService,
} from "../../../../../lib/v1/data-export-service.js";
import { v1Json } from "../../../../../lib/v1/response.js";

/**
 * `GET /v1/data-export/summary[?date=AAAA-MM-JJ]`: the counts of the six
 * boxes of « Exporter mes données » for the credential's own space, and
 * the bytes each adds to the file — what the web section shows before the
 * export (api/data-export.schema.json `summary`).
 */
export async function GET(request) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    return v1Json(
      await (
        await requireDataExportService()
      ).summary({
        tenantId: access.tenantId,
        date: new URL(request.url).searchParams.get("date"),
      }),
    );
  } catch (error) {
    return dataExportFailure(error);
  }
}
