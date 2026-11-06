import { clientOrigin } from "../api/client-origin.js";
import { readJsonBody } from "../api/json-body.js";
import { SignInRefusal, isDatabaseUnavailable } from "./service.js";

/**
 * The HTTP side of the sign-in by e-mail code: its API routes turned into
 * `Request → Response` functions, so that the application's route files
 * stay one line long. Bodies follow `sign-in.schema.json`; extra fields of
 * a refusal (`attemptsRemaining`, `retryAt`, `bootstrapPath`) sit beside
 * `error`, and `retryAt` is also sent as `Retry-After` in seconds. The
 * network origin the limits count against is the core's
 * (`api/client-origin.js`), the one every other limit of the service reads.
 */
const STARTING_RETRY_SECONDS = 10;

export const json = (body, { status = 200, headers = {} } = {}) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });

const envelope = (code, message, status, extra = {}, headers = {}) =>
  json({ error: { code, message }, ...extra }, { status, headers });

export const notFoundResponse = () => envelope("not_found", "Not found.", 404);

function retryAfterSeconds(retryAt, now) {
  return String(
    Math.max(1, Math.ceil((Date.parse(retryAt) - now.getTime()) / 1000)),
  );
}

async function readJson(request) {
  const type = request.headers.get("content-type") || "";
  if (!/^application\/json\b/i.test(type))
    throw new SignInRefusal(
      "invalid_request",
      "A JSON sign-in request is required.",
      400,
    );
  let body;
  try {
    body = await readJsonBody(request, { limit: 64 * 1024 });
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new SignInRefusal(
      "invalid_request",
      "A JSON sign-in request is required.",
      400,
    );
  return body;
}

const instanceOf = (request) => {
  const instance = request.headers.get("x-astro-client-instance")?.trim();
  return instance ? instance.slice(0, 200) : null;
};

/**
 * What every route of the sign-in shares, also for the routes a
 * composition adds: the
 * credential of a request and the answer to a failure.
 */
export function createSignInResponder({
  auth,
  clock = () => new Date(),
  log = (message) => console.error(`[Astro Portal] ${message}`),
}) {
  /**
   * The credential of a request: a device token, or a web session (with
   * its CSRF token when `csrf`). A credential of a deleted space is refused
   * with `space_deleted`, any other one the core does not accept with
   * `authentication_required`.
   */
  async function credentialOf(request, { csrf = false } = {}) {
    const refusal = (error) => {
      if (isDatabaseUnavailable(error)) return error;
      // The two refusals after which the application erases its copy of
      // the space: its space was deleted, or this device was detached.
      if (["space_deleted", "device_detached"].includes(error?.code))
        return new SignInRefusal(error.code, error.message, 401);
      return new SignInRefusal(
        "authentication_required",
        "Authentication required.",
        401,
      );
    };
    if (request.headers.get("authorization")) {
      let device;
      try {
        device = await auth.requireDeviceAuth(request.headers);
      } catch (error) {
        throw refusal(error);
      }
      return {
        device,
        session: null,
        tenantId: device.tenant_id,
        userId: device.user_id,
      };
    }
    let session;
    try {
      session = await auth.requireSession(request.headers);
    } catch (error) {
      throw refusal(error);
    }
    if (csrf)
      try {
        await auth.verifyCsrf(request.headers, session);
      } catch {
        throw new SignInRefusal(
          "csrf_invalid",
          "A valid CSRF token is required.",
          403,
        );
      }
    return {
      device: null,
      session,
      tenantId: session.tenant_id,
      userId: session.user_id,
    };
  }

  function failure(error) {
    if (error instanceof SignInRefusal) {
      const headers = error.extra?.retryAt
        ? { "Retry-After": retryAfterSeconds(error.extra.retryAt, clock()) }
        : {};
      return envelope(
        error.code,
        error.message,
        error.status,
        error.extra,
        headers,
      );
    }
    if (error?.code === "space_unavailable")
      return envelope(
        "space_unavailable",
        "This address cannot open a space.",
        403,
      );
    // A private server: the right code of an address that owns nothing
    // here (repository.js, no `openSpace`).
    if (error?.code === "not_owner")
      return envelope("not_owner", "This portal belongs to someone else.", 403);
    // The technical ceiling on a space's active devices: the person removes a device from the space, then signs in again.
    if (error?.code === "device_limit_reached")
      return envelope("device_limit_reached", error.message, 409);
    if (isDatabaseUnavailable(error)) {
      const retryAt = new Date(
        clock().getTime() + STARTING_RETRY_SECONDS * 1000,
      ).toISOString();
      return envelope(
        "service_starting",
        "The service is starting. Try again in a moment.",
        503,
        { retryAt },
        { "Retry-After": String(STARTING_RETRY_SECONDS) },
      );
    }
    log(`sign-in.failed: ${error?.message || "unknown error"}`);
    return envelope(
      "request_failed",
      "The request could not be completed.",
      500,
    );
  }

  return { credentialOf, failure, readJson };
}

export function createSpaceSignInHandlers({
  spaces,
  auth,
  configuration,
  clock = () => new Date(),
  log = (message) => console.error(`[Astro Portal] ${message}`),
}) {
  const { credentialOf, failure } = createSignInResponder({ auth, clock, log });

  return {
    async requestCode(request) {
      try {
        const body = await readJson(request);
        return json(
          await spaces.requestCode({
            email: body.email,
            language: body.language,
            client: body.client,
            origin: clientOrigin(request.headers, configuration),
          }),
          { status: 202 },
        );
      } catch (error) {
        return failure(error);
      }
    },

    async verify(request) {
      try {
        const body = await readJson(request);
        const result = await spaces.verify({
          email: body.email,
          code: body.code,
          linkToken: body.linkToken,
          client: body.client,
          device: body.device,
          origin: clientOrigin(request.headers, configuration),
          originClientInstanceId: instanceOf(request),
        });
        const { cookies = [], ...answer } = result;
        const response = json(answer);
        for (const cookie of cookies)
          response.headers.append("Set-Cookie", cookie);
        return response;
      } catch (error) {
        return failure(error);
      }
    },

    async currentSpace(request) {
      try {
        const credential = await credentialOf(request);
        return json(
          await spaces.currentSpace({
            tenantId: credential.tenantId,
            userId: credential.userId,
            email: credential.session?.email || null,
            device: credential.device,
          }),
        );
      } catch (error) {
        return failure(error);
      }
    },

    /** POST /v1/sign-in/attach: « Rattacher cet appareil à mon espace ». */
    async attach(request) {
      try {
        const body = await readJson(request);
        return json(
          await spaces.attach({
            attachToken: body.attachToken,
            device: body.device,
            origin: clientOrigin(request.headers, configuration),
            originClientInstanceId: instanceOf(request),
          }),
        );
      } catch (error) {
        return failure(error);
      }
    },

    /*
     * The devices of the space (« Mes appareils »). The caller's route has
     * already authenticated the request with either credential (and checked
     * the CSRF token of a web session's write): `access` holds its space
     * and, for a device, the device's own identifier.
     */

    /** GET /v1/devices. */
    async listDevices(request, access) {
      try {
        return json(
          await spaces.listDevices({
            tenantId: access.tenantId,
            currentDeviceId: access.deviceId || null,
          }),
        );
      } catch (error) {
        return failure(error);
      }
    },

    /** PATCH /v1/devices/{deviceId} `{ "name": … }`. */
    async renameDevice(request, access, deviceId) {
      try {
        const body = await readJson(request);
        return json(
          await spaces.renameDevice({
            tenantId: access.tenantId,
            deviceId,
            name: body.name,
            currentDeviceId: access.deviceId || null,
            originClientInstanceId: instanceOf(request),
          }),
        );
      } catch (error) {
        return failure(error);
      }
    },

    /** DELETE /v1/devices/{deviceId}: « Détacher ». */
    async detachDevice(request, access, deviceId) {
      try {
        await spaces.detachDevice({
          tenantId: access.tenantId,
          deviceId,
          byDeviceId: access.deviceId || null,
          originClientInstanceId: instanceOf(request),
        });
        return new Response(null, {
          status: 204,
          headers: { "Cache-Control": "no-store" },
        });
      } catch (error) {
        return failure(error);
      }
    },
  };
}
