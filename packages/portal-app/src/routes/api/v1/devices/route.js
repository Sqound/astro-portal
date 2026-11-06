import { authEnabled, authService } from "../../../../lib/auth.server.js";
import { spaceSignIn } from "../../../../lib/space-sign-in.server.js";
import { deviceOrSessionReadV1Access } from "../../../../lib/v1/access.js";
import { v1Error, v1Json, v1Unavailable } from "../../../../lib/v1/response.js";

/**
 * GET /v1/devices. Wherever a person signs in by e-mail code, « Mes appareils »
 * with either credential (space-devices.schema.json); on a private server signing
 * in by password, the account page's list of paired devices, with a web
 * session.
 */
export async function GET(request) {
  if (!authEnabled()) return v1Unavailable();
  const handlers = spaceSignIn();
  if (handlers) {
    const access = await deviceOrSessionReadV1Access(request);
    if (access.response) return access.response;
    return await handlers.listDevices(request, access);
  }
  try {
    const auth = authService();
    const session = await auth.requireSession(request.headers);
    return v1Json(await auth.listDevices({ session }));
  } catch (error) {
    return v1Error(error, {
      code: "authentication_required",
      message: "Authentication required.",
      status: 401,
    });
  }
}
