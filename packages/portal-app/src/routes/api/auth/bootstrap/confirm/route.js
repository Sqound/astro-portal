import { readJsonBody } from "portal/api/json-body.js";
import { authFailureResponse, withCookies } from "portal/auth/http.js";
import { privateInstallation } from "../../../../../lib/space-sign-in.server.js";

/**
 * POST /api/auth/bootstrap/confirm — the second step of the installation
 * of a private server signing in by e-mail code: the secret again, the
 * address and the code it received. The account is created, the browser
 * signed in, and the recovery codes answered once. No other mode has it.
 */
export async function POST(request) {
  const installation = privateInstallation();
  if (!installation)
    return Response.json({ error: "Not found." }, { status: 404 });
  try {
    const body = (await readJsonBody(request)) || {};
    const result = await installation.confirm({
      bootstrapSecret: body.bootstrapSecret,
      email: body.email,
      code: body.code,
      organizationName: body.organizationName,
      headers: request.headers,
    });
    return withCookies({ recoveryCodes: result.recoveryCodes }, result.cookies);
  } catch (error) {
    return authFailureResponse(error, { fallbackStatus: 400 });
  }
}
