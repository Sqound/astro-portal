import { deviceV1Access } from "../../../../lib/v1/access.js";
import { writeAccessFor } from "../../../../lib/v1/entitlement-provider.js";
import { v1Error, v1Json } from "../../../../lib/v1/response.js";
import {
  createEquipmentResponse,
  requireManageEquipment,
} from "../../../../lib/v1/manage-equipment-service.js";

/**
 * The paired device reads its own owner's equipment inventory, read-only,
 * with the « Matériel par défaut » every space is offered (`defaults`,
 * without the organisation that holds it nor its notes) and the option
 * « Masquer le matériel par défaut » of the space.
 */
export async function GET(request) {
  // A private profile, not plan synchronization.
  const access = await deviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  try {
    const service = await requireManageEquipment();
    return v1Json(await service.plannerRead({ tenantId: access.tenantId }));
  } catch (error) {
    return v1Error(error, {
      code: "equipment_storage_unavailable",
      message: "Equipment storage is unavailable.",
      status: 503,
    });
  }
}

/**
 * POST /v1/equipment `{ equipment }` (the import of an old portal's
 * inventory): a paired device allowed to write adds one item to its owner's
 * space — the body, the rules, the change signal and the answer of
 * `POST /v1/manage/equipment`. The device's write guard is the one of its
 * other writes (`PUT /v1/favorites/{id}`, `POST /v1/uploads` from a device):
 * its bearer, never `lastSyncAt` (a private profile, not plan
 * synchronization), and the soft-downgrade gate — an account in the
 * read-only window of an ended subscription answers
 * `403 entitlement_read_only`, exactly as its plans and uploads do. A device
 * never edits nor archives an item: « Mon espace » does.
 */
export async function POST(request) {
  const access = await deviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  const writeAccess = await writeAccessFor(access.userId);
  if (writeAccess.readOnly)
    return v1Error(
      Object.assign(
        new Error(
          "This account's subscription has ended: new equipment is suspended; existing equipment remains readable and exportable.",
        ),
        { code: "entitlement_read_only", status: 403 },
      ),
    );
  return createEquipmentResponse(request, access);
}
