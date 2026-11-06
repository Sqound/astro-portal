import { adminAuthorization } from "../../../../lib/admin.server.js";
import { authEnabled, authService } from "../../../../lib/auth.server.js";
import { equipmentReader } from "../../../../lib/equipment-reader.server.js";
import { publishChange } from "portal/api/change-bus.js";
import { readJsonBody } from "portal/api/json-body.js";

function clientInstanceIdFrom(request) {
  const value = request.headers.get("x-astro-client-instance")?.trim();
  return value ? value.slice(0, 200) : null;
}

function forbidden(access) {
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
  if (!access.allowed) return { response: forbidden(access) };
  if (mutation && authEnabled())
    await authService().verifyCsrf(request.headers, access.session);
  return { access };
}

export async function GET(request) {
  try {
    const result = await accessFor(request);
    if (result.response) return result.response;
    const { session } = result.access;
    if (!session)
      return Response.json(
        { error: "L'inventaire privé nécessite une session authentifiée." },
        { status: 403 },
      );
    const repository = await equipmentReader();
    if (!repository) throw new Error("Equipment storage is unavailable.");
    return Response.json(
      {
        equipment: await repository.listEquipment(session.tenant_id, {
          includeArchived: true,
        }),
        assignments: await repository.captureEquipmentAssignments(
          session.tenant_id,
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: error?.code === "payload_too_large" ? 413 : 400 },
    );
  }
}

export async function POST(request) {
  try {
    const result = await accessFor(request, { mutation: true });
    if (result.response) return result.response;
    const { session } = result.access;
    if (!session) throw new Error("Authenticated session required.");
    const body = await readJsonBody(request);
    if (JSON.stringify(body).length > 100_000)
      throw new Error("Equipment payload is too large.");
    const repository = await equipmentReader();
    if (!repository) throw new Error("Equipment storage is unavailable.");
    const equipment = await repository.saveEquipment({
      tenantId: session.tenant_id,
      userId: session.user_id,
      equipment: body?.equipment,
    });
    publishChange({
      tenantId: session.tenant_id,
      domains: ["equipment"],
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return Response.json({ equipment });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: error?.code === "payload_too_large" ? 413 : 400 },
    );
  }
}

export async function PUT(request) {
  try {
    const result = await accessFor(request, { mutation: true });
    if (result.response) return result.response;
    const { session } = result.access;
    if (!session) throw new Error("Authenticated session required.");
    const body = await readJsonBody(request);
    const repository = await equipmentReader();
    if (!repository) throw new Error("Equipment storage is unavailable.");
    const equipmentIds = await repository.setCaptureEquipment({
      tenantId: session.tenant_id,
      userId: session.user_id,
      captureId: body?.captureId,
      equipmentIds: body?.equipmentIds,
      assignments: body?.assignments,
    });
    publishChange({
      tenantId: session.tenant_id,
      domains: ["equipment"],
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return Response.json({
      equipmentIds,
      assignments:
        (await repository.captureEquipmentAssignments(session.tenant_id))[
          body?.captureId
        ] || [],
    });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: error?.code === "payload_too_large" ? 413 : 400 },
    );
  }
}

export async function DELETE(request) {
  try {
    const result = await accessFor(request, { mutation: true });
    if (result.response) return result.response;
    const { session } = result.access;
    if (!session) throw new Error("Authenticated session required.");
    const { searchParams } = new URL(request.url);
    const repository = await equipmentReader();
    if (!repository) throw new Error("Equipment storage is unavailable.");
    await repository.archiveEquipment({
      tenantId: session.tenant_id,
      userId: session.user_id,
      equipmentId: searchParams.get("id"),
    });
    publishChange({
      tenantId: session.tenant_id,
      domains: ["equipment"],
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return Response.json({ archived: true });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: error?.code === "payload_too_large" ? 413 : 400 },
    );
  }
}

export async function PATCH(request) {
  try {
    const result = await accessFor(request, { mutation: true });
    if (result.response) return result.response;
    const { session } = result.access;
    if (!session) throw new Error("Authenticated session required.");
    const body = await readJsonBody(request);
    const repository = await equipmentReader();
    if (!repository) throw new Error("Equipment storage is unavailable.");
    if (body?.action === "restore") {
      await repository.restoreEquipment({
        tenantId: session.tenant_id,
        userId: session.user_id,
        equipmentId: body.id,
      });
      publishChange({
        tenantId: session.tenant_id,
        domains: ["equipment"],
        originClientInstanceId: clientInstanceIdFrom(request),
      });
      return Response.json({ restored: true });
    }
    if (body?.action === "reorder") {
      const equipmentIds = await repository.reorderEquipment({
        tenantId: session.tenant_id,
        userId: session.user_id,
        equipmentType: body.type,
        equipmentIds: body.equipmentIds,
      });
      publishChange({
        tenantId: session.tenant_id,
        domains: ["equipment"],
        originClientInstanceId: clientInstanceIdFrom(request),
      });
      return Response.json({ equipmentIds });
    }
    throw new Error("Unsupported equipment action.");
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: error?.code === "payload_too_large" ? 413 : 400 },
    );
  }
}
