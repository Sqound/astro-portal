/**
 * The answers of a private server's own authentication routes
 * (`/api/auth/login`, `/api/auth/bootstrap/*`; docs/PRIVATE_NOTEBOOK_AUTH.md):
 * `{ error, code, … }` with the refusal's own status and its extra fields
 * (`retryAt`, also sent as `Retry-After` in seconds; `attemptsRemaining`;
 * `bootstrapPath`), so that the page can say what happened and until when.
 * An error without a status takes `fallbackStatus`.
 */
export function authFailureResponse(
  error,
  { fallbackStatus = 400, clock = () => new Date() } = {},
) {
  const status =
    Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
      ? error.status
      : fallbackStatus;
  const extra =
    error?.extra && typeof error.extra === "object" ? error.extra : {};
  const headers = { "Cache-Control": "no-store" };
  if (extra.retryAt) {
    const seconds = Math.ceil(
      (Date.parse(extra.retryAt) - clock().getTime()) / 1000,
    );
    if (Number.isFinite(seconds))
      headers["Retry-After"] = String(Math.max(1, seconds));
  }
  return Response.json(
    {
      error: error?.message || "The request failed.",
      ...(typeof error?.code === "string" ? { code: error.code } : {}),
      ...extra,
    },
    { status, headers },
  );
}

/** A JSON answer that also sets the cookies of a web session. */
export function withCookies(body, cookies = [], { status = 200 } = {}) {
  const response = Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
  for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
  return response;
}
