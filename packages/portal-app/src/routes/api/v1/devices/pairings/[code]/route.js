import {
  authEnabled,
  authService,
  pairingMode,
} from "../../../../../../lib/auth.server.js";
import {
  v1Error,
  v1Json,
  v1NotFound,
  v1Unavailable,
} from "../../../../../../lib/v1/response.js";

// The account page's own pairing panel polls this route, so that the pairing page updates itself, to learn
// whether a code it is showing has been claimed yet, without exposing the
// device token or which device claimed it — see `v1.md`'s own "Device
// pairing" section.
export async function GET(request, { params }) {
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
    const { code } = await params;
    return v1Json(
      await auth.pairingStatus({
        session,
        code: decodeURIComponent(code || ""),
      }),
    );
  } catch (error) {
    return v1Error(error, {
      code: "pairing_not_found",
      message: "Pairing code not found.",
      status: 404,
    });
  }
}
