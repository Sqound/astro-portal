const noStore = { "Cache-Control": "no-store" };

export function v1Json(body, { status = 200, headers = {} } = {}) {
  return Response.json(body, {
    status,
    headers: { ...noStore, ...headers },
  });
}

export function v1Error(
  error,
  {
    code = "request_failed",
    message = "The request could not be completed.",
    status = 400,
  } = {},
) {
  const conflict =
    Number.isInteger(error?.serverRevision) && error?.serverPayload
      ? {
          serverRevision: error.serverRevision,
          serverPayload: error.serverPayload,
        }
      : {};
  return v1Json(
    {
      error: {
        code: error?.code || code,
        message: error?.message || message,
      },
      ...conflict,
    },
    { status: error?.status || status },
  );
}

/** A route that does not exist on this kind of service. */
export function v1NotFound() {
  return v1Json(
    { error: { code: "not_found", message: "Not found." } },
    { status: 404 },
  );
}

export function v1Unavailable() {
  return v1Error(
    Object.assign(new Error("Private API authentication is unavailable."), {
      code: "authentication_unavailable",
      status: 503,
    }),
  );
}
