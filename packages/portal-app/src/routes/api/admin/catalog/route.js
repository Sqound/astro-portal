import { adminAuthorization } from "../../../../lib/admin.server.js";
import { authEnabled, authService } from "../../../../lib/auth.server.js";
import {
  adminCatalogData,
  archiveMetadataRecord,
  restoreArchivedMetadataRecord,
  saveMetadataRecord,
} from "../../../../lib/metadata-store.server.js";
import { readJsonBody } from "portal/api/json-body.js";

function forbidden(access) {
  return Response.json(
    {
      error: "Administration non autorisée depuis cette adresse.",
      ip: access.ip || null,
    },
    { status: 403 },
  );
}

export async function GET(request) {
  const access = await adminAuthorization(request.headers);
  if (!access.allowed) return forbidden(access);
  return Response.json(await adminCatalogData(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(request) {
  const access = await adminAuthorization(request.headers);
  if (!access.allowed) return forbidden(access);
  try {
    if (authEnabled())
      await authService().verifyCsrf(request.headers, access.session);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 1_000_000)
      return Response.json(
        { error: "Requête trop volumineuse." },
        { status: 413 },
      );
    const { record, originalId } = await readJsonBody(request, {
      limit: 2 * 1024 * 1024,
    });
    return Response.json({
      record: await saveMetadataRecord(record, originalId),
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Enregistrement impossible." },
      { status: 400 },
    );
  }
}

export async function DELETE(request) {
  const access = await adminAuthorization(request.headers);
  if (!access.allowed) return forbidden(access);
  try {
    if (authEnabled())
      await authService().verifyCsrf(request.headers, access.session);
    const { searchParams } = new URL(request.url);
    return Response.json({
      archive: await archiveMetadataRecord(searchParams.get("id")),
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Archivage impossible." },
      { status: 400 },
    );
  }
}

export async function PATCH(request) {
  const access = await adminAuthorization(request.headers);
  if (!access.allowed) return forbidden(access);
  try {
    if (authEnabled())
      await authService().verifyCsrf(request.headers, access.session);
    const { id } = await readJsonBody(request, { limit: 2 * 1024 * 1024 });
    return Response.json({ record: await restoreArchivedMetadataRecord(id) });
  } catch (error) {
    return Response.json(
      { error: error.message || "Restauration impossible." },
      { status: 400 },
    );
  }
}
