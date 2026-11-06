import { publishChange } from "portal/api/change-bus.js";
import { readJsonBody } from "portal/api/json-body.js";
import {
  ManageEquipmentError,
  createDefaultEquipmentAdministration,
  createManageEquipment,
} from "portal/equipment/manage-equipment.js";
import { equipmentReader } from "../equipment-reader.server.js";
import {
  clientInstanceIdFrom,
  deviceOrSessionWriteV1Access,
} from "./access.js";
import { writeAccessFor } from "./entitlement-provider.js";
import { v1Error, v1Json } from "./response.js";

// « Mon espace » → « Matériel » and « Matériel par défaut », on the
// equipment reader of the process.

const unavailable = () =>
  Object.assign(new Error("Equipment storage is unavailable."), {
    code: "equipment_storage_unavailable",
    status: 503,
  });

export async function requireManageEquipment() {
  const reader = await equipmentReader();
  if (!reader) throw unavailable();
  return createManageEquipment(reader);
}

export async function requireDefaultEquipmentAdministration() {
  const reader = await equipmentReader();
  if (!reader) throw unavailable();
  return createDefaultEquipmentAdministration(reader);
}

/** The v1 error envelope of a refusal; anything else is the storage's. */
export function manageEquipmentFailure(error) {
  if (
    error instanceof ManageEquipmentError ||
    error?.code === "equipment_storage_unavailable"
  )
    return v1Error(error);
  return v1Error(null, {
    code: "equipment_storage_unavailable",
    message: "Equipment storage is unavailable.",
    status: 503,
  });
}

/**
 * The JSON body of a write, or a refusal: past the common ceiling of a JSON
 * body, `413 payload_too_large`; anything that is not JSON, `400`.
 */
export async function jsonBody(request) {
  try {
    return { body: await readJsonBody(request) };
  } catch (error) {
    return {
      response:
        error?.code === "payload_too_large"
          ? v1Error(error)
          : v1Error(null, {
              code: "invalid_request",
              message: "The body is a JSON object.",
              status: 400,
            }),
    };
  }
}

/**
 * « Nouveau matériel »: one new item of the space, whoever asks — the web
 * session of « Mon espace » (`POST /v1/manage/equipment`) or a paired
 * device allowed to write (`POST /v1/equipment`, the import of an old
 * portal's inventory). The same body, the same rules
 * (`createManageEquipment().create`), the same change of the domain
 * `equipment`, the same answer: `201 { equipment }`.
 */
export async function createEquipmentResponse(request, access) {
  const { body, response } = await jsonBody(request);
  if (response) return response;
  try {
    const service = await requireManageEquipment();
    const equipment = await service.create({
      tenantId: access.tenantId,
      userId: access.userId,
      body,
    });
    publishChange({
      tenantId: access.tenantId,
      domains: ["equipment"],
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return v1Json({ equipment }, { status: 201 });
  } catch (error) {
    return manageEquipmentFailure(error);
  }
}

/**
 * Who may write « Mon matériel »: the web
 * session of the space with its CSRF token, or the bearer of a paired
 * device — which writes only in its owner's space. Either one passes the
 * soft-downgrade gate of every write (`POST /v1/equipment`,
 * `PUT /v1/favorites/{id}`): an account in the read-only window of an ended
 * subscription answers `403` `entitlement_read_only` (a web session too: the
 * gate is the space's, not the credential's, and `POST /v1/manage/equipment`
 * answers it too). A static profile (a
 * private server) never enters that window.
 */
export async function manageEquipmentWriteAccess(request) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access;
  const writeAccess = await writeAccessFor(access.userId);
  if (writeAccess.readOnly)
    return {
      response: v1Error(
        Object.assign(
          new Error(
            "This account's subscription has ended: equipment changes are suspended; existing equipment remains readable and exportable.",
          ),
          { code: "entitlement_read_only", status: 403 },
        ),
      ),
    };
  return access;
}
