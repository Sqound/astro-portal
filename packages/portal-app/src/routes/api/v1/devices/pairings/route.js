import {
  authEnabled,
  authService,
  pairingMode,
} from "../../../../../lib/auth.server.js";
import {
  v1Error,
  v1Json,
  v1NotFound,
  v1Unavailable,
} from "../../../../../lib/v1/response.js";

export async function POST(request) {
  if (!authEnabled()) return v1Unavailable();
  // Devices are paired with a code on a private server signing in by
  // password only; wherever a person signs in by e-mail code, a device
  // signs in by itself (docs/PRIVATE_NOTEBOOK_AUTH.md).
  if (!pairingMode()) return v1NotFound();
  const auth = authService();
  let session;
  try {
    session = await auth.requireSession(request.headers);
  } catch (error) {
    return v1Error(error, {
      code: "authentication_required",
      message: "Authentication required.",
      status: 401,
    });
  }
  try {
    await auth.verifyCsrf(request.headers, session);
  } catch (error) {
    return v1Error(error, {
      code: "csrf_invalid",
      message: "A valid CSRF token is required.",
      status: 403,
    });
  }
  try {
    return v1Json(await auth.createDevicePairing({ session }), { status: 201 });
  } catch (error) {
    return v1Error(error, {
      code: "pairing_creation_failed",
      message: "A pairing code could not be created.",
      status: 503,
    });
  }
}
