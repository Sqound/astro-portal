import { deviceOrSessionWriteV1Access } from "../../../../../../../lib/v1/access.js";
import {
  requireSessionPackageImportService,
  sessionPackageImportFailure,
} from "../../../../../../../lib/v1/session-package-import-service.js";
import { v1Error, v1Json } from "../../../../../../../lib/v1/response.js";
import { readJsonBody } from "portal/api/json-body.js";
import { syntheticSessionRefusal } from "../../../../../../../lib/v1/synthetic-session.js";

/**
 * `POST /v1/sessions/{id}/imports/confirm`. Same body shape and access rule
 * as `.../imports/preview`; this one persists. Idempotent by manifest
 * fingerprint (migration 26's `session_package_imports`,
 * `UNIQUE(tenant_id, manifest_sha256)`): re-confirming the same
 * `manifestJson`/`checksums` bytes writes nothing new and replays the first
 * result.
 */
export async function POST(request, { params }) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  let body;
  try {
    body = await readJsonBody(request, { limit: 32 * 1024 * 1024 });
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "A JSON request body is required.",
      status: 400,
    });
  }
  try {
    const { id } = await params;
    const synthetic = syntheticSessionRefusal(id, { write: true });
    if (synthetic) return synthetic;
    const service = await requireSessionPackageImportService();
    const result = await service.confirm({
      tenantId: access.tenantId,
      userId: access.userId,
      sessionId: id,
      manifestJson: body?.manifestJson,
      checksums: body?.checksums,
      documents: body?.documents,
    });
    return v1Json(result.body, { status: result.status });
  } catch (error) {
    return sessionPackageImportFailure(error);
  }
}
