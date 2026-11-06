import { adminAuthorization } from "../../../../lib/admin.server.js";
import { authEnabled, authService } from "../../../../lib/auth.server.js";
import { requireDefaultEquipmentAdministration } from "../../../../lib/v1/manage-equipment-service.js";
import { readJsonBody } from "portal/api/json-body.js";

// « Matériel par défaut » of the administration: the default rows,
// proposed to every space in the group « Matériel par défaut ». The same
// gestures as « Mon espace » → « Matériel » (add, edit, order, archive,
// restore), for the administration only. The operator's file gallery keeps
// reading `/api/admin/equipment`.

function refused(access) {
  return Response.json(
    {
      error: "Administration non autorisée depuis cette adresse.",
      ip: access.ip || null,
    },
    { status: 403 },
  );
}

async function accessFor(request, { mutation = false } = {}) {
  const access = await adminAuthorization(request.headers);
  if (!access.allowed) return { response: refused(access) };
  if (mutation && authEnabled())
    await authService().verifyCsrf(request.headers, access.session);
  return { userId: access.session?.user_id || null };
}

function failure(error) {
  return Response.json(
    { error: error?.message || "Equipment storage is unavailable." },
    {
      status:
        error?.code === "payload_too_large"
          ? 413
          : Number.isInteger(error?.status)
            ? error.status
            : 400,
    },
  );
}

export async function GET(request) {
  try {
    const access = await accessFor(request);
    if (access.response) return access.response;
    const administration = await requireDefaultEquipmentAdministration();
    return Response.json(
      { equipment: await administration.list() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}

/** `{ equipment }`: a new default row, or the edit of one (its `id`). */
export async function POST(request) {
  try {
    const access = await accessFor(request, { mutation: true });
    if (access.response) return access.response;
    const administration = await requireDefaultEquipmentAdministration();
    const equipment = await administration.save({
      userId: access.userId,
      body: await readJsonBody(request),
    });
    return Response.json({ equipment });
  } catch (error) {
    return failure(error);
  }
}

/** `?id=`: « Archiver » a default row. */
export async function DELETE(request) {
  try {
    const access = await accessFor(request, { mutation: true });
    if (access.response) return access.response;
    const administration = await requireDefaultEquipmentAdministration();
    const equipment = await administration.archive({
      userId: access.userId,
      equipmentId: new URL(request.url).searchParams.get("id") || "",
    });
    return Response.json({ equipment });
  } catch (error) {
    return failure(error);
  }
}

/** `{ action: "restore", id }` or `{ action: "reorder", type, ids }`. */
export async function PATCH(request) {
  try {
    const access = await accessFor(request, { mutation: true });
    if (access.response) return access.response;
    const administration = await requireDefaultEquipmentAdministration();
    const body = await readJsonBody(request);
    if (body?.action === "restore")
      return Response.json({
        equipment: await administration.restore({
          userId: access.userId,
          equipmentId: String(body.id || ""),
        }),
      });
    if (body?.action === "reorder")
      return Response.json({
        ids: await administration.reorder({ userId: access.userId, body }),
      });
    return Response.json(
      { error: "Unsupported equipment action." },
      { status: 400 },
    );
  } catch (error) {
    return failure(error);
  }
}
