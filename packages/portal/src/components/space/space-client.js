import { DEVICE_NAME_MAX } from "./space-copy.js";

/**
 * What the space page asks of the service, and what each answer means to the
 * page (the host application may add its own calls). Every function takes the `fetch` to use, so that the same code runs
 * in the browser and, in the tests, against the real routes of the service
 * (SQLite and PostgreSQL); none touches the page.
 *
 * An answer is `{ kind, … }`. The kinds every call can end with:
 *
 * - `offline`: the browser could not reach the service at all;
 * - `unreachable`: a gateway or a service that is still starting (`502`,
 *   `503`, `504`, `service_starting`);
 * - `signed-out`: `401` — the web session ended; the page goes back to the
 *   sign-in;
 * - `space-deleted`: `401` `space_deleted` — the space was deleted, from
 *   another browser or from an application; the page says so;
 * - `failed`: anything else the page cannot use.
 *
 * The routes and their answers are `packages/astro-contracts/schemas/api/
 * v1.md`, « Space devices » and « The current space ».
 */

// A write of a web session carries its CSRF token in `x-astro-csrf`, as the
// header's own calls do: the page reads it with the portal's one helper
// (`portal/csrf-cookie.js`), which knows the name of the cookie whichever way
// the service sets it, and gives it to each call as `csrf`.

/**
 * One call of the page: `{ status, body, code }`, or `{ offline: true }` when
 * the browser could not reach the service. Exported for the calls a
 * host application adds.
 */
export async function callService(
  fetcher,
  path,
  { method = "GET", body, csrf, headers = {} } = {},
) {
  let response;
  try {
    response = await fetcher(path, {
      method,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(method !== "GET" ? { "x-astro-csrf": csrf || "" } : {}),
        // More headers of the call, such as `If-Match` (a write against a
        // revision) or the instance of this tab.
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    return { offline: true };
  }
  let payload = null;
  if (response.status !== 204)
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  return {
    status: response.status,
    body: payload,
    code: payload?.error?.code || null,
  };
}

/** The kind every call shares when it did not succeed. */
export function failureKind(answer) {
  if (answer.offline) return { kind: "offline" };
  if (answer.status === 401)
    return {
      kind: answer.code === "space_deleted" ? "space-deleted" : "signed-out",
    };
  if (
    [502, 503, 504].includes(answer.status) ||
    answer.code === "service_starting"
  )
    return { kind: "unreachable" };
  return { kind: "failed", status: answer.status, code: answer.code };
}

/** `GET /api/v1/space`: the address of the space. */
export async function loadSpace(fetcher) {
  const answer = await callService(fetcher, "/api/v1/space");
  if (answer.status === 200 && typeof answer.body?.space?.email === "string")
    return { kind: "ok", space: answer.body.space };
  return failureKind(answer);
}

/** `GET /api/v1/devices`: « Mes appareils », in the service's own order. */
export async function loadDevices(fetcher) {
  const answer = await callService(fetcher, "/api/v1/devices");
  if (answer.status === 200 && Array.isArray(answer.body?.devices))
    return { kind: "ok", devices: answer.body.devices };
  return failureKind(answer);
}

/** What a name must be before it is sent: `null` when it may be. */
export function nameProblem(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "empty";
  if (trimmed.length > DEVICE_NAME_MAX) return "too-long";
  return null;
}

/**
 * `PATCH /api/v1/devices/{id}`. A name that is empty or too long is never
 * sent (`empty`, `too-long`); `not-found` is a device that was detached
 * meanwhile (`404` `device_not_found`).
 */
export async function renameDevice(fetcher, { id, name, csrf }) {
  const problem = nameProblem(name);
  if (problem) return { kind: problem };
  const answer = await callService(
    fetcher,
    `/api/v1/devices/${encodeURIComponent(id)}`,
    { method: "PATCH", body: { name: String(name).trim() }, csrf },
  );
  if (answer.status === 200 && answer.body?.id)
    return { kind: "ok", device: answer.body };
  if (answer.status === 404 && answer.code === "device_not_found")
    return { kind: "not-found" };
  if (answer.status === 400) return { kind: "invalid" };
  return failureKind(answer);
}

/**
 * `DELETE /api/v1/devices/{id}`. From a web session it is a cut, never
 * refused for the 24 hours of the rule; `not-found` is a device that was
 * already detached, which is what the person wanted.
 */
export async function detachDevice(fetcher, { id, csrf }) {
  const answer = await callService(
    fetcher,
    `/api/v1/devices/${encodeURIComponent(id)}`,
    { method: "DELETE", csrf },
  );
  if (answer.status === 204) return { kind: "ok" };
  if (answer.status === 404 && answer.code === "device_not_found")
    return { kind: "not-found" };
  return failureKind(answer);
}

/**
 * Signs this browser out (`POST /api/auth/logout`, the route of the
 * header's « Déconnexion »): a session is not a device, nothing is detached.
 * That route answers `403` for every session it cannot close, whatever the
 * reason, so the space is asked once more: the session ended (`signed-out`),
 * or its space was deleted meanwhile (`space-deleted`).
 */
export async function signOutBrowser(fetcher, { csrf }) {
  const answer = await callService(fetcher, "/api/auth/logout", {
    method: "POST",
    body: {},
    csrf,
  });
  if (answer.status === 200) return { kind: "ok" };
  if (answer.status === 403) {
    const probe = await loadSpace(fetcher);
    return probe.kind === "ok" ? { kind: "failed", status: 403 } : probe;
  }
  return failureKind(answer);
}

/** Where a person whose session ended goes to sign in again, and back. */
export const signInPathFor = (returnTo) =>
  `/auth/sign-in?next=${encodeURIComponent(returnTo)}`;

/**
 * `GET /api/v1/space/calibration`: the consent of the space to the
 * project's calibration set. `not-available` on a service that keeps none
 * (a private server answers `404` `not_available`).
 */
export async function loadCalibration(fetcher) {
  const answer = await callService(fetcher, "/api/v1/space/calibration");
  if (answer.status === 200 && answer.body?.consent)
    return { kind: "ok", consent: answer.body.consent };
  if (answer.status === 404 && answer.code === "not_available")
    return { kind: "not-available" };
  return failureKind(answer);
}

/** `PUT /api/v1/space/calibration` `{ enabled }`: the switch. */
export async function setCalibration(fetcher, { enabled, csrf }) {
  const answer = await callService(fetcher, "/api/v1/space/calibration", {
    method: "PUT",
    body: { enabled: Boolean(enabled) },
    csrf,
  });
  if (answer.status === 200 && answer.body?.consent)
    return { kind: "ok", consent: answer.body.consent };
  if (answer.status === 404 && answer.code === "not_available")
    return { kind: "not-available" };
  return failureKind(answer);
}

/**
 * `DELETE /api/v1/space/calibration` — « Retirer mes contributions »: the
 * space's records are deleted and the consent switched off.
 */
export async function withdrawCalibration(fetcher, { csrf }) {
  const answer = await callService(fetcher, "/api/v1/space/calibration", {
    method: "DELETE",
    csrf,
  });
  if (answer.status === 200 && answer.body?.consent)
    return {
      kind: "ok",
      consent: answer.body.consent,
      withdrawn: Number(answer.body.withdrawn || 0),
    };
  if (answer.status === 404 && answer.code === "not_available")
    return { kind: "not-available" };
  return failureKind(answer);
}
