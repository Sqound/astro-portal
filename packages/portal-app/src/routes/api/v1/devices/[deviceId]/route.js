import { authEnabled, authService } from "../../../../../lib/auth.server.js";
import { spaceSignIn } from "../../../../../lib/space-sign-in.server.js";
import { deviceOrSessionWriteV1Access } from "../../../../../lib/v1/access.js";
import {
  v1Error,
  v1NotFound,
  v1Unavailable,
} from "../../../../../lib/v1/response.js";

const deviceIdOf = async (params) => {
  try {
    return decodeURIComponent((await params)?.deviceId || "");
  } catch {
    // A malformed escape names no device.
    return "";
  }
};

/**
 * PATCH /v1/devices/{deviceId} `{ "name": … }`: renames a device of the
 * space, with either credential (CSRF for a web session). Wherever a
 * person signs in by e-mail code; a private server signing
 * in by password answers 404.
 */
export async function PATCH(request, { params }) {
  const handlers = spaceSignIn();
  if (!handlers) return v1NotFound();
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  return await handlers.renameDevice(request, access, await deviceIdOf(params));
}

/**
 * DELETE /v1/devices/{deviceId}: « Détacher ». Wherever a person signs in
 * by e-mail code, with either credential (CSRF for a web session), under
 * the rule of one device, one space; on a private server signing in by
 * password, with a web session.
 */
export async function DELETE(request, { params }) {
  if (!authEnabled()) return v1Unavailable();
  const handlers = spaceSignIn();
  if (handlers) {
    const access = await deviceOrSessionWriteV1Access(request);
    if (access.response) return access.response;
    return await handlers.detachDevice(
      request,
      access,
      await deviceIdOf(params),
    );
  }
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
    const clientInstanceIdHeader = request.headers
      .get("x-astro-client-instance")
      ?.trim();
    await auth.revokeDevice({
      session,
      deviceId: await deviceIdOf(params),
      originClientInstanceId: clientInstanceIdHeader
        ? clientInstanceIdHeader.slice(0, 200)
        : null,
    });
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return v1Error(error, {
      code: "device_not_found",
      message: "Device not found.",
      status: 404,
    });
  }
}
