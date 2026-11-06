import { adminAuthorization } from "../../../../lib/admin.server.js";
import { authEnabled, authService } from "../../../../lib/auth.server.js";
import {
  portalConfig,
  updatePortalLocales,
} from "../../../../lib/config.server.js";
import { readJsonBody } from "portal/api/json-body.js";

function forbidden(access) {
  return Response.json(
    { error: "Administration non autorisée.", ip: access.ip || null },
    { status: 403 },
  );
}

export async function GET(request) {
  const access = await adminAuthorization(request.headers);
  if (!access.allowed) return forbidden(access);
  return Response.json(await portalConfig(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PATCH(request) {
  const access = await adminAuthorization(request.headers);
  if (!access.allowed) return forbidden(access);
  try {
    if (authEnabled())
      await authService().verifyCsrf(request.headers, access.session);
    const {
      supportedLocales,
      defaultLocale,
      localeNames,
      translationOverrides,
      customTranslationKeys,
    } = await readJsonBody(request);
    return Response.json(
      await updatePortalLocales({
        supportedLocales,
        defaultLocale,
        localeNames,
        translationOverrides,
        customTranslationKeys,
      }),
    );
  } catch (error) {
    return Response.json(
      { error: error.message || "Configuration impossible." },
      { status: 400 },
    );
  }
}
