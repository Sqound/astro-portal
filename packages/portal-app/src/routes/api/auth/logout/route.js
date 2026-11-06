import { authService } from "../../../../lib/auth.server.js";

export async function POST(request) {
  try {
    const session = await authService().requireSession(request.headers);
    await authService().verifyCsrf(request.headers, session);
    const result = await authService().logout(request.headers);
    const response = Response.json({ ok: true });
    result.cookies.forEach((cookie) =>
      response.headers.append("Set-Cookie", cookie),
    );
    return response;
  } catch (error) {
    return Response.json({ error: error.message }, { status: 403 });
  }
}
