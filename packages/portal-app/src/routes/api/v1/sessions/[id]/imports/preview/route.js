import { deviceOrSessionWriteV1Access } from "../../../../../../../lib/v1/access.js";
import {
  requireSessionPackageImportService,
  sessionPackageImportFailure,
} from "../../../../../../../lib/v1/session-package-import-service.js";
import { v1Error, v1Json } from "../../../../../../../lib/v1/response.js";
import { readJsonBody } from "portal/api/json-body.js";
import { syntheticSessionRefusal } from "../../../../../../../lib/v1/synthetic-session.js";

/**
 * `POST /v1/sessions/{id}/imports/preview` (the contract is `packages/astro-contracts/schemas/session-package/`). Either
 * credential, like `POST /v1/uploads` (a paired Astro Sync device, or the
 * portal's own web session for the "Import a session package" UI action) —
 * see `access.js`'s own doc comment on why uploads/imports use the
 * `deviceOrSessionWriteV1Access` write variant rather than
 * `eitherV1WriteAccess`'s default `synchronize: true`: sending a package is
 * not plan/session synchronization.
 *
 * Body (`application/json`): `manifestJson` (the exact raw text of
 * `manifest.json`), `checksums` (the exact raw text of `checksums.sha256`),
 * and `documents` (an optional `{ [path]: base64 }` map carrying the inline
 * bytes of every metric-log/event-log/other asset — image/progression
 * assets are never inlined here, see `session-package-import.js`'s own
 * comment on why). Validates, checks idempotency, and reports exactly what
 * would be imported. Persists nothing.
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
    const result = await service.preview({
      tenantId: access.tenantId,
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
