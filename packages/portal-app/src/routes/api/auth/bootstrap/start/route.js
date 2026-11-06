import { readJsonBody } from "portal/api/json-body.js";
import { authFailureResponse, withCookies } from "portal/auth/http.js";
import {
  authService,
  hostedSignInMode,
  pairingMode,
} from "../../../../../lib/auth.server.js";
import { privateInstallation } from "../../../../../lib/space-sign-in.server.js";

/**
 * POST /api/auth/bootstrap/start — the installation of a private server
 * (docs/PRIVATE_NOTEBOOK_AUTH.md, « Installing »), with the bootstrap
 * secret. `password`: the address and the password create the account and
 * sign in at once, and the recovery codes are answered. `email-code`: a
 * code leaves for the address at once; `confirm` finishes. Where spaces
 * are open there is no installation: they are created by the e-mail
 * sign-in.
 */
export async function POST(request) {
  if (hostedSignInMode())
    return Response.json({ error: "Not found." }, { status: 404 });
  try {
    const body = (await readJsonBody(request)) || {};
    if (pairingMode()) {
      const result = await authService().installWithPassword({
        bootstrapSecret: body.bootstrapSecret,
        email: body.email,
        password: body.password,
        organizationName: body.organizationName,
      });
      return withCookies(
        { recoveryCodes: result.recoveryCodes },
        result.cookies,
      );
    }
    const installation = privateInstallation();
    if (!installation)
      return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json(
      await installation.start({
        bootstrapSecret: body.bootstrapSecret,
        email: body.email,
        language: body.language,
        headers: request.headers,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return authFailureResponse(error, { fallbackStatus: 400 });
  }
}
