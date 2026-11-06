import { publishChange } from "portal/api/change-bus.js";
import { clientInstanceIdFrom } from "../../../../../../lib/v1/access.js";
import {
  jsonBody,
  manageEquipmentFailure,
  manageEquipmentWriteAccess,
  requireManageEquipment,
} from "../../../../../../lib/v1/manage-equipment-service.js";
import { v1Error, v1Json } from "../../../../../../lib/v1/response.js";

const equipmentIdOf = async (params) => {
  try {
    return decodeURIComponent((await params)?.equipmentId || "");
  } catch {
    return "";
  }
};

/**
 * PATCH /v1/manage/equipment/{id} `{ equipment }` edits an item of the
 * space; `{ action: "restore" }` brings an archived one back. A default
 * row or another space's item is unknown here: 404. The web session with
 * its CSRF token, or a paired device's bearer — but a device never
 * restores: an archived item is no longer seen in the app, « Archives »
 * lives on the web alone.
 */
export async function PATCH(request, { params }) {
  const access = await manageEquipmentWriteAccess(request);
  if (access.response) return access.response;
  const { body, response } = await jsonBody(request);
  if (response) return response;
  if (access.device && body?.action === "restore")
    return v1Error(null, {
      code: "web_session_required",
      message: "An archived item is brought back on the web.",
      status: 403,
    });
  try {
    const service = await requireManageEquipment();
    const equipment = await service.update({
      tenantId: access.tenantId,
      userId: access.userId,
      equipmentId: await equipmentIdOf(params),
      body,
    });
    publishChange({
      tenantId: access.tenantId,
      domains: ["equipment"],
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return v1Json({ equipment });
  } catch (error) {
    return manageEquipmentFailure(error);
  }
}

/** DELETE /v1/manage/equipment/{id}: « Archiver » (nothing is deleted). */
export async function DELETE(request, { params }) {
  const access = await manageEquipmentWriteAccess(request);
  if (access.response) return access.response;
  try {
    const service = await requireManageEquipment();
    const equipment = await service.archive({
      tenantId: access.tenantId,
      userId: access.userId,
      equipmentId: await equipmentIdOf(params),
    });
    publishChange({
      tenantId: access.tenantId,
      domains: ["equipment"],
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return v1Json({ equipment });
  } catch (error) {
    return manageEquipmentFailure(error);
  }
}
