import { authEnabled, authService } from "../../../../lib/auth.server.js";

export async function GET(request) {
  if (!authEnabled())
    return Response.json({
      enabled: false,
      initialized: false,
      authenticated: false,
    });
  try {
    return Response.json(await authService().status(request.headers), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { enabled: true, ready: false, error: error.message },
      { status: 503 },
    );
  }
}
