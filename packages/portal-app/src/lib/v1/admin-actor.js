import { adminAuthorization } from "../admin.server.js";
import { authService } from "../auth.server.js";
import { v1Json } from "./response.js";

const refusal = (code, message, status) =>
  v1Json({ error: { code, message } }, { status });

/**
 * The administrator behind a request of the administration's API:
 * `{ actorUserId }`, or `{ response }` (`403 admin_forbidden` for anyone the
 * administration does not let in, `403 csrf_invalid` for a write of a web
 * session without its token). Where spaces are open a person who administers
 * the service is let in, on a private server its owner (`adminAuthorization`).
 */
export async function adminActor(request, { write = false } = {}) {
  const access = await adminAuthorization(request.headers);
  if (!access.allowed)
    return {
      response: refusal(
        "admin_forbidden",
        "Administration not authorized.",
        403,
      ),
    };
  if (write && access.session) {
    try {
      await authService().verifyCsrf(request.headers, access.session);
    } catch {
      return {
        response: refusal(
          "csrf_invalid",
          "A valid CSRF token is required.",
          403,
        ),
      };
    }
  }
  return { actorUserId: access.session?.user_id ?? null };
}
