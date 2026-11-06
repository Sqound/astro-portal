import {
  clientInstanceIdFrom,
  eitherV1Access,
  eitherV1WriteAccess,
} from "../../../../../../lib/v1/access.js";
import {
  requireSessionAnalysisService,
  sessionAnalysisFailure,
} from "../../../../../../lib/v1/session-analysis-resource-service.js";
import { v1Error, v1Json } from "../../../../../../lib/v1/response.js";
import { readJsonBody } from "portal/api/json-body.js";
import { syntheticSessionRefusal } from "../../../../../../lib/v1/synthetic-session.js";

/**
 * `POST /v1/sessions/{id}/analyses`: the body is the report v2 on its own
 * (`session-analysis.schema.json`, `$defs.report`). It REPLACES the night's
 * analysis and the steps the previous one proposed that nobody corrected
 * (a corrected step stays, marked); an empty report is refused (422
 * `analysis_empty`). Gated by `analysis.logs` (403 `analysis_not_entitled`)
 * and a running subscription. Answers 201 `{ analysis, replaced, steps }`.
 */
export async function POST(request, { params }) {
  const access = await eitherV1WriteAccess(request);
  if (access.response) return access.response;
  let body;
  try {
    body = await readJsonBody(request, { limit: 16 * 1024 * 1024 });
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "A JSON report body is required.",
      status: 400,
    });
  }
  try {
    const { id } = await params;
    const synthetic = syntheticSessionRefusal(id, { write: true });
    if (synthetic) return synthetic;
    const service = await requireSessionAnalysisService();
    const result = await service.create({
      tenantId: access.tenantId,
      userId: access.userId,
      sessionId: id,
      report: body,
      originDeviceId: access.deviceId ?? null,
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return v1Json(result, { status: 201 });
  } catch (error) {
    return sessionAnalysisFailure(error);
  }
}

/**
 * `GET /v1/sessions/{id}/analyses`: the night's analysis, report included
 * (404 `analysis_not_found` when it has none). Never gated by a capability.
 */
export async function GET(request, { params }) {
  const access = await eitherV1Access(request);
  if (access.response) return access.response;
  try {
    const { id } = await params;
    const synthetic = syntheticSessionRefusal(id, { write: false });
    if (synthetic) return synthetic;
    const service = await requireSessionAnalysisService();
    return v1Json(
      await service.get({ tenantId: access.tenantId, sessionId: id }),
    );
  } catch (error) {
    return sessionAnalysisFailure(error);
  }
}

/**
 * `DELETE /v1/sessions/{id}/analyses` (« Supprimer cette analyse »):
 * the owner removes the night's analysis — its measures and its
 * guiding; the steps stay. By the owner's web session or a device token
 * of the space; never gated by a capability. 204.
 */
export async function DELETE(request, { params }) {
  const access = await eitherV1WriteAccess(request);
  if (access.response) return access.response;
  try {
    const { id } = await params;
    const synthetic = syntheticSessionRefusal(id, { write: true });
    if (synthetic) return synthetic;
    const service = await requireSessionAnalysisService();
    await service.remove({
      tenantId: access.tenantId,
      sessionId: id,
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return sessionAnalysisFailure(error);
  }
}
