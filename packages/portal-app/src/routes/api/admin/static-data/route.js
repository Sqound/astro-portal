import { adminAuthorization } from "../../../../lib/admin.server.js";
import { authEnabled, authService } from "../../../../lib/auth.server.js";
import { staticDataRepository } from "../../../../lib/static-data.server.js";
import { targetLibraryAdministrationSearch } from "../../../../lib/target-library.server.js";
import { targetCatalogueRepository } from "../../../../lib/target-library-database.server.js";
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

async function accessFor(request, { mutation = false } = {}) {
  const access = await adminAuthorization(request.headers);
  if (!access.allowed) return { response: forbidden(access) };
  if (mutation && authEnabled())
    await authService().verifyCsrf(request.headers, access.session);
  return { access };
}

async function repository() {
  const result = await staticDataRepository();
  if (!result)
    throw new Error(
      "ASTRO_PORTAL_DATABASE_URL or ASTRO_PORTAL_DATABASE_PATH is required for static data administration.",
    );
  return result;
}

export async function GET(request) {
  try {
    const access = await accessFor(request);
    if (access.response) return access.response;
    const store = await repository();
    await store.seed();
    const id = new URL(request.url).searchParams.get("id");
    const document = id ? await store.get(id) : null;
    if (id && !document)
      return Response.json({ error: "Donnée introuvable." }, { status: 404 });
    return Response.json(
      id ? { document } : { documents: await store.list() },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: error?.code === "payload_too_large" ? 413 : 400 },
    );
  }
}

export async function PUT(request) {
  try {
    const access = await accessFor(request, { mutation: true });
    if (access.response) return access.response;
    const body = await readJsonBody(request, { limit: 8 * 1024 * 1024 });
    if (JSON.stringify(body).length > 5_100_000)
      return Response.json(
        { error: "Requête trop volumineuse." },
        { status: 413 },
      );
    const store = await repository();
    await store.seed();
    return Response.json({
      document: await store.save({
        dataKey: body?.document?.key,
        nextTitle: body?.document?.title,
        schemaVersion: body?.document?.schemaVersion,
        nextPayload: body?.document?.payload,
      }),
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Enregistrement impossible." },
      { status: 400 },
    );
  }
}

export async function POST(request) {
  try {
    const access = await accessFor(request, { mutation: true });
    if (access.response) return access.response;
    const store = await repository();
    await store.seed();
    const targets = await targetCatalogueRepository();
    // The target catalogue uses its own normalized row model but belongs to the
    // same initialization package. Initialize only an empty instance: an
    // export must not replace its current, edited source state.
    if (!(await targets.list({ limit: 1 })).total)
      await targetLibraryAdministrationSearch({ locale: "en", limit: 1 });
    const targetCatalogue = await targets.exportSeed({
      source: "PlanAstro exported target catalogue",
    });
    return Response.json({
      export: await store.export({
        additionalDocuments: [
          {
            key: "target-library",
            title: "Catalogue local de cibles",
            schemaVersion: 1,
            revision: targetCatalogue.exportedAt,
            path: "target-library/catalogue.json",
          },
        ],
      }),
      targetCatalogue,
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Export impossible." },
      { status: 400 },
    );
  }
}
