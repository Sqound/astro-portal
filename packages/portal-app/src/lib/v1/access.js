import { authEnabled, authService } from "../auth.server.js";
import { requestOrigin } from "../rate-limit.server.js";
import { enabledServiceExtension } from "../service-extensions.js";
import { v1Error, v1Unavailable } from "./response.js";

function deviceAuthenticationError(error) {
  return v1Error(error, {
    code: "device_authentication_required",
    message: "Device authentication required.",
    status: 401,
  });
}

function sessionAuthenticationError(error) {
  return v1Error(error, {
    code: "authentication_required",
    message: "Authentication required.",
    status: 401,
  });
}

function csrfError(error) {
  return v1Error(error, {
    code: "csrf_invalid",
    message: "A valid CSRF token is required.",
    status: 403,
  });
}

/**
 * The reactive change signal's writer identity (the private plan's task
 * 6b.5, `packages/astro-contracts/schemas/api/
 * v1.md` "Reactive change signal"): a random id the writing client instance
 * generated for itself, not a device or session id. Absent on an older
 * client, in which case the resulting event is authored by no instance and
 * therefore reaches every instance on the account, including the writer's
 * own other tabs/devices.
 */
export function clientInstanceIdFrom(request) {
  const value = request.headers.get("x-astro-client-instance");
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.slice(0, 200) : null;
}

/**
 * The plans a device moves to another place plan by plan, in one
 * synchronisation (`X-Astro-Night-Move`: their resource ids, comma-separated).
 * The service does not count them as the « other plans of the night » when it
 * checks that a night has one place: the first write of a move is never
 * refused for the plans that are about to follow. Absent: none.
 */
export function movingPlanIdsFrom(request) {
  const value = request.headers.get("x-astro-night-move");
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id && id.length <= 200)
    .slice(0, 100);
}

/** Authenticates an endpoint that only a paired device may call. */
export async function deviceV1Access(request, { synchronize = true } = {}) {
  if (!authEnabled()) return { response: v1Unavailable() };
  try {
    const device = await authService().requireDeviceAuth(request.headers, {
      synchronize,
    });
    return {
      device,
      tenantId: device.tenant_id,
      userId: device.user_id,
      deviceId: device.id,
    };
  } catch (error) {
    return { response: deviceAuthenticationError(error) };
  }
}

/**
 * The composition's anonymous devices (`devices.anonymous` of
 * `../service-extensions.js`), when the service takes them. A private
 * server registers none: an anonymous bearer is then an unknown one.
 */
const anonymousDeviceExtension = () =>
  enabledServiceExtension("devices.anonymous");

/**
 * Whether the request's `Authorization` names a device with no space (by its
 * form alone: the extension decides whether it is still valid). Always
 * `false` where no composition takes such devices.
 */
export function isAnonymousDeviceBearer(headers) {
  return Boolean(anonymousDeviceExtension()?.owns(headers));
}

/**
 * Authenticates an endpoint whose data is public but personalized for a
 * paired device. A supplied Authorization header is always an intentional
 * device attempt: an invalid bearer answers 401 instead of falling back to
 * the anonymous reading.
 */
export async function optionalDeviceV1Access(request, { synchronize } = {}) {
  // A device with no space sends its anonymous bearer to the
  // public reads too: it personalizes nothing, and is read as no device.
  if (
    !request.headers.get("authorization") ||
    isAnonymousDeviceBearer(request.headers)
  )
    return { device: null, tenantId: null, userId: null, deviceId: null };
  return await deviceV1Access(request, { synchronize });
}

/**
 * Authenticates a device with no space: its anonymous bearer
 * (`devices.anonymous`), never a space's device nor a web session.
 * `anonymousDeviceId` names it; `tenantId`, `userId` and `deviceId` are
 * `null`, so that nothing personal can be read with it. Without the
 * extension, the answer of an unknown bearer.
 */
export async function anonymousDeviceV1Access(request) {
  if (!authEnabled()) return { response: v1Unavailable() };
  const extension = anonymousDeviceExtension();
  if (!extension) return { response: deviceAuthenticationError() };
  try {
    const anonymousDevice = await extension.authenticate(request.headers);
    return {
      anonymousDevice,
      anonymousDeviceId: anonymousDevice.id,
      device: null,
      session: null,
      tenantId: null,
      userId: null,
      deviceId: null,
    };
  } catch (error) {
    return { response: deviceAuthenticationError(error) };
  }
}

/**
 * A route that reads nothing personal, but may be gated: a device with no space by its anonymous bearer —
 * its rights are the purchases it proved — or a space's device
 * or web session (`eitherV1Access`). The route asks the rights of whichever
 * came (`capabilitiesOfAccess` in `./access-capabilities.js`).
 */
export async function anonymousOrEitherV1Access(
  request,
  { synchronize = false } = {},
) {
  if (isAnonymousDeviceBearer(request.headers))
    return await anonymousDeviceV1Access(request);
  return await eitherV1Access(request, { synchronize });
}

/**
 * `GET /v1/capabilities` and the other device reads open to a device with no
 * space: its anonymous bearer, or a space's device (`deviceV1Access`).
 */
export async function anonymousOrDeviceV1Access(
  request,
  { synchronize = false } = {},
) {
  if (isAnonymousDeviceBearer(request.headers))
    return await anonymousDeviceV1Access(request);
  return await deviceV1Access(request, { synchronize });
}

/**
 * A plan read can use either credential style. If a caller supplied an
 * Authorization header, it is treated as an intentional device attempt: an
 * invalid bearer must not silently fall through to a browser session.
 */
export async function planReadV1Access(request) {
  if (!authEnabled()) return { response: v1Unavailable() };
  const deviceAttempt = Boolean(request.headers.get("authorization"));
  try {
    const auth = authService();
    if (deviceAttempt) {
      const device = await auth.requireDeviceAuth(request.headers, {
        synchronize: true,
      });
      return {
        device,
        tenantId: device.tenant_id,
        userId: device.user_id,
        deviceId: device.id,
      };
    }
    const session = await auth.requireSession(request.headers);
    return {
      session,
      tenantId: session.tenant_id,
      userId: session.user_id,
      deviceId: null,
    };
  } catch (error) {
    return {
      response: deviceAttempt
        ? deviceAuthenticationError(error)
        : sessionAuthenticationError(error),
    };
  }
}

/**
 * Sessions and their events, the debrief queue, the debriefing decision,
 * session supplements, uploads and the private capture list all accept
 * EITHER credential (api/v1.md, "Authentication"). Sessions and debriefing
 * are also plan synchronization and update the device's `lastSyncAt` — reads
 * included, on the precedent already followed by `planReadV1Access` above —
 * which is why `synchronize` defaults to `true`;
 * uploads and the capture list pass `false` (see the two wrappers below).
 */
export async function eitherV1Access(request, { synchronize = true } = {}) {
  if (!authEnabled()) return { response: v1Unavailable() };
  const deviceAttempt = Boolean(request.headers.get("authorization"));
  try {
    const auth = authService();
    if (deviceAttempt) {
      const device = await auth.requireDeviceAuth(request.headers, {
        synchronize,
      });
      return {
        device,
        session: null,
        tenantId: device.tenant_id,
        userId: device.user_id,
        deviceId: device.id,
      };
    }
    const session = await auth.requireSession(request.headers);
    return {
      device: null,
      session,
      tenantId: session.tenant_id,
      userId: session.user_id,
      deviceId: null,
    };
  } catch (error) {
    return {
      response: deviceAttempt
        ? deviceAuthenticationError(error)
        : sessionAuthenticationError(error),
    };
  }
}

/**
 * The write variant of `eitherV1Access`: a device bearer carries no browser
 * cookie, so no CSRF token applies to it (it already went through a
 * capability a stolen cookie alone cannot forge); a cookie session
 * presenting a write additionally carries one, exactly as
 * `POST /v1/devices/pairings` already does. A missing session and an invalid
 * CSRF token answer with their own distinct codes.
 */
export async function eitherV1WriteAccess(request, options) {
  const access = await eitherV1Access(request, options);
  if (access.response) return access;
  if (access.session) {
    try {
      await authService().verifyCsrf(request.headers, access.session);
    } catch (error) {
      return { response: csrfError(error) };
    }
  }
  return access;
}

/**
 * A capture read (`GET /v1/captures`) and a capture write
 * (`POST /v1/uploads`) accept either credential like the routes above, but
 * are NOT plan/session synchronization: sending a photo does not prove the
 * field notes were pushed, and counting it would put out an
 * "unsynchronized device" warning that is still true. They therefore never
 * touch `lastSyncAt`.
 */
/**
 * Who sends, for the captures: a device (with its application,
 * `planner` or `sync`, when it said so) or the web session.
 */
export function captureCallerOf(access) {
  return access?.device
    ? { kind: "device", application: access.device.application ?? null }
    : { kind: "web" };
}

/**
 * The `source` the service gives the events a call writes
 * (`session-event-ingest.schema.json` $defs.source): `astro-sync` for
 * a device of the application Astro Sync, `declared` for anything
 * else.
 */
export function eventSourceOf(access) {
  return access?.device?.application === "sync" ? "astro-sync" : "declared";
}

export function deviceOrSessionReadV1Access(request) {
  return eitherV1Access(request, { synchronize: false });
}

export function deviceOrSessionWriteV1Access(request) {
  return eitherV1WriteAccess(request, { synchronize: false });
}

/**
 * A read open to anyone, personalized by an authenticated web session when
 * one is present (`viewer`), anonymous otherwise (`viewer: null`); the route
 * decides what each viewer sees, never this function. A device
 * Authorization header is ignored rather than treated as a device attempt.
 * Never synchronizes (`lastSyncAt`). An invalid or expired cookie degrades
 * to anonymous rather than refusing the read.
 */
export async function optionalSessionV1Access(request) {
  if (!authEnabled()) return { viewer: null };
  try {
    const session = await authService().session(request.headers);
    return {
      viewer: session
        ? { tenantId: session.tenant_id, userId: session.user_id }
        : null,
    };
  } catch {
    return { viewer: null };
  }
}

/**
 * A route of « Mon espace »: the web session of the person, never a
 * device. A request that carries a device bearer is refused as such
 * (`web_session_required`), even with a cookie beside it; a write
 * (`write: true`) also carries the session's CSRF token.
 */
export async function webSessionV1Access(request, { write = false } = {}) {
  if (!authEnabled()) return { response: v1Unavailable() };
  if (request.headers.get("authorization"))
    return {
      response: v1Error(null, {
        code: "web_session_required",
        message: "This route answers a web session only.",
        status: 403,
      }),
    };
  const auth = authService();
  let session;
  try {
    session = await auth.requireSession(request.headers);
  } catch (error) {
    return { response: sessionAuthenticationError(error) };
  }
  if (write)
    try {
      await auth.verifyCsrf(request.headers, session);
    } catch (error) {
      return { response: csrfError(error) };
    }
  return {
    session,
    tenantId: session.tenant_id,
    userId: session.user_id,
  };
}

/**
 * A message to the service that touches nothing personal (a report, a missing object): a
 * device with no space by its anonymous bearer, a space's device or web
 * session (+CSRF, `eitherV1WriteAccess`), or a web visitor with neither —
 * `visitor: { origin }`, its network origin, which its limits count
 * against. An `Authorization` header is always a device attempt, and a
 * live web session always that session's, CSRF included; an absent or
 * ended one is a visitor.
 */
export async function anonymousSpaceOrVisitorWriteAccess(request) {
  if (!authEnabled()) return { response: v1Unavailable() };
  if (isAnonymousDeviceBearer(request.headers))
    return await anonymousDeviceV1Access(request);
  if (request.headers.get("authorization"))
    return await eitherV1WriteAccess(request, { synchronize: false });
  let session = null;
  try {
    session = await authService().session(request.headers);
  } catch {
    session = null;
  }
  if (session)
    return await eitherV1WriteAccess(request, { synchronize: false });
  return {
    visitor: { origin: requestOrigin(request) },
    device: null,
    session: null,
    tenantId: null,
    userId: null,
    deviceId: null,
  };
}

/**
 * Who sends without a space: `anonymous:<device id>` or
 * `visitor:<network origin>`; `null` for a space's device or session.
 */
export function actorWithoutSpace(access) {
  if (access?.anonymousDeviceId) return `anonymous:${access.anonymousDeviceId}`;
  if (access?.visitor) return `visitor:${access.visitor.origin}`;
  return null;
}
