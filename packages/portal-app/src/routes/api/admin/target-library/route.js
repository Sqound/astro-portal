import { isShippedLocale } from "astro-contracts/locales";
import { adminAuthorization } from "../../../../lib/admin.server.js";
import { authEnabled, authService } from "../../../../lib/auth.server.js";
import {
  saveTargetLibraryAdministrationEntry,
  targetLibraryAdministrationEntry,
  targetLibraryAdministrationSearch,
} from "../../../../lib/target-library.server.js";
import { readJsonBody } from "portal/api/json-body.js";

function localeFor(request) {
  const locale = new URL(request.url).searchParams.get("locale");
  return isShippedLocale(locale) ? locale : "fr";
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

export async function GET(request) {
  try {
    const access = await adminAuthorization(request.headers);
    if (!access.allowed) return forbidden(access);
    const url = new URL(request.url);
    const locale = localeFor(request);
    const id = url.searchParams.get("id");
    const result = id
      ? await targetLibraryAdministrationEntry(id, locale)
      : await targetLibraryAdministrationSearch({
          locale,
          query: url.searchParams.get("q") || "",
          type: url.searchParams.get("type") || "",
          catalogue: url.searchParams.get("catalogue") || "",
          selection: url.searchParams.get("selection") || "",
          hemisphere: url.searchParams.get("hemisphere") || "",
          season: url.searchParams.get("season") || "",
          offset: url.searchParams.get("offset") || 0,
          limit: url.searchParams.get("limit") || 48,
        });
    if (id && !result)
      return Response.json({ error: "Cible introuvable." }, { status: 404 });
    return Response.json(id ? { entry: result } : result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: error?.code === "payload_too_large" ? 413 : 400 },
    );
  }
}

export async function PUT(request) {
  try {
    const access = await adminAuthorization(request.headers);
    if (!access.allowed) return forbidden(access);
    if (authEnabled())
      await authService().verifyCsrf(request.headers, access.session);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 100_000)
      return Response.json(
        { error: "Requête trop volumineuse." },
        { status: 413 },
      );
    const body = await readJsonBody(request);
    return Response.json({
      entry: await saveTargetLibraryAdministrationEntry(
        body?.entry,
        localeFor(request),
      ),
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Enregistrement impossible." },
      { status: 400 },
    );
  }
}
