import { readJsonBody } from "portal/api/json-body.js";
import { authFailureResponse, withCookies } from "portal/auth/http.js";
import {
  authEnabled,
  authService,
  hostedSignInMode,
} from "../../../../lib/auth.server.js";

/**
 * POST /api/auth/login — a private server's own sign-in
 * (docs/PRIVATE_NOTEBOOK_AUTH.md): `{ email, password }` in the `password`
 * mode, or `{ recoveryCode[, newPassword] }` in either private mode. A
 * refusal says why and until when (`code`, `retryAt`,
 * `attemptsRemaining`). Where spaces are open, a person signs in by e-mail
 * code only (POST /api/v1/sign-in/verify).
 */
export async function POST(request) {
  if (!authEnabled() || hostedSignInMode())
    return Response.json({ error: "Not found." }, { status: 404 });
  try {
    const result = await authService().login({
      ...(await readJsonBody(request)),
      headers: request.headers,
    });
    return withCookies({ ok: true }, result.cookies);
  } catch (error) {
    return authFailureResponse(error, { fallbackStatus: 401 });
  }
}
