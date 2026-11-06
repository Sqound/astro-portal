import { publishChange } from "portal/api/change-bus.js";
import {
  clientInstanceIdFrom,
  deviceOrSessionReadV1Access,
} from "../../../../../lib/v1/access.js";
import {
  jsonBody,
  manageEquipmentFailure,
  manageEquipmentWriteAccess,
  requireManageEquipment,
} from "../../../../../lib/v1/manage-equipment-service.js";
import { v1Json } from "../../../../../lib/v1/response.js";

/**
 * GET /v1/manage/default-configuration: « Ma configuration par défaut » of the space, the mode and the equipment
 * that fill every new plan — `{ configuration, updatedAt }`, both null when
 * none is set. A web session, or a paired device.
 */
export async function GET(request) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    const service = await requireManageEquipment();
    return v1Json(await service.configuration({ tenantId: access.tenantId }));
  } catch (error) {
    return manageEquipmentFailure(error);
  }
}

/**
 * PUT /v1/manage/default-configuration `{ configuration }` (an object, or
 * null to set none): « Enregistrer ma configuration » and « Enregistrer
 * comme configuration par défaut ». The writes of « Mon matériel »: the web
 * session with its CSRF token, or a paired device's bearer, always in the
 * credential's own space. Publishes a change of the domain `equipment`, so
 * the other devices of the space read it again.
 */
export async function PUT(request) {
  const access = await manageEquipmentWriteAccess(request);
  if (access.response) return access.response;
  const { body, response } = await jsonBody(request);
  if (response) return response;
  try {
    const service = await requireManageEquipment();
    const result = await service.saveConfiguration({
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
