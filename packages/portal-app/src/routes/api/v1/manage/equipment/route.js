import { publishChange } from "portal/api/change-bus.js";
import {
  clientInstanceIdFrom,
  deviceOrSessionReadV1Access,
} from "../../../../../lib/v1/access.js";
import {
  createEquipmentResponse,
  jsonBody,
  manageEquipmentFailure,
  manageEquipmentWriteAccess,
  requireManageEquipment,
} from "../../../../../lib/v1/manage-equipment-service.js";
import { v1Json } from "../../../../../lib/v1/response.js";

/**
 * GET /v1/manage/equipment (« Mon espace » → « Matériel »): the space's
 * own equipment, archived items included, the active « Matériel par
 * défaut » and the option « Masquer le matériel par défaut ». A web
 * session, or a paired device for the read.
 */
export async function GET(request) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    const service = await requireManageEquipment();
    return v1Json(await service.read({ tenantId: access.tenantId }));
  } catch (error) {
    return manageEquipmentFailure(error);
  }
}

/**
 * POST /v1/manage/equipment `{ equipment }`: a new item of the space. Every
 * write takes the web session with its CSRF token, or a paired device's
 * bearer (« Mon matériel » on the phone): either way the space is the
 * credential's own, never one the body names. The same write as a paired
 * device's `POST /v1/equipment`.
 */
export async function POST(request) {
  const access = await manageEquipmentWriteAccess(request);
  if (access.response) return access.response;
  return createEquipmentResponse(request, access);
}

/**
 * PATCH /v1/manage/equipment `{ hideDefaultEquipment }`, `{ action:
 * "reorder", type, ids }` or `{ action: "import", items }` (a phone's own
 * list, without duplicates): the option, the order of a kind, or the items
 * sent; answers the whole read (and `imported` for an import).
 */
export async function PATCH(request) {
  const access = await manageEquipmentWriteAccess(request);
  if (access.response) return access.response;
  const { body, response } = await jsonBody(request);
  if (response) return response;
  try {
    const service = await requireManageEquipment();
    const result = await service.change({
      tenantId: access.tenantId,
      userId: access.userId,
      body,
    });
    publishChange({
      tenantId: access.tenantId,
      domains: ["equipment"],
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return v1Json(result);
  } catch (error) {
    return manageEquipmentFailure(error);
  }
}
