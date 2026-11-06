// The web client for the `/api/v1/framings...` routes. A framing is now an
// account-level resource, never copied into a plan — the plan only keeps a
// `framingId` reference. This module is the only place the web planner talks to
// that resource; `framings.js` keeps the framework-free helpers (draft
// assembly, payload shape).
//
// Errors are rejected with `.status` and `.code` set from the response body
// (same convention as `portal/components/sessions/portal-fetch.js`'s
// `responseData`), so callers can branch on `framing_conflict` /
// `framing_locked` / `framing_archived` / `framing_in_use` without parsing
// text.

import { requestJson } from "portal/components/sessions/portal-fetch.js";

async function parse(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);
  if (response.status === 204) return null;
  if (response.ok) return payload;
  const error = new Error(payload?.error?.message || fallbackMessage);
  error.code = payload?.error?.code || null;
  error.status = response.status;
  error.framing = payload?.framing || null;
  error.pendingPlans =
    payload?.pendingPlans || payload?.error?.pendingPlans || null;
  return Promise.reject(error);
}

/** `GET /api/v1/framings` — the complete library (archived included, deleted excluded). */
export async function listFramings() {
  const response = await requestJson("/api/v1/framings");
  const data = await parse(response, "framing_list_failed");
  return data?.framings || [];
}

/** `GET /api/v1/framings/{id}` — a single resource. */
export async function getFraming(framingId) {
  const response = await requestJson(
    `/api/v1/framings/${encodeURIComponent(framingId)}`,
  );
  return parse(response, "framing_not_found");
}

/**
 * `PUT /api/v1/framings/{id}` — create (`ifMatch: '"0"'`) or update. Never
 * throws away the caller's content on a `409`: the rejected error carries
 * `.framing` (the server's current resource) and `.code`, so the caller can
 * turn its own version into an unlinked copy.
 */
export async function putFraming({ id, name, payload, ifMatch }) {
  const response = await requestJson(
    `/api/v1/framings/${encodeURIComponent(id)}`,
    { method: "PUT", body: { name, payload }, ifMatch },
  );
  return parse(response, "framing_write_failed");
}

/**
 * `DELETE /api/v1/framings/{id}` — `204` on a free framing, `200
 * {archived:true, framing}` when the server archived it instead (locked),
 * `409 framing_in_use` with `.pendingPlans` when shared plans must be
 * confirmed first.
 */
export async function deleteFraming({ id, ifMatch }) {
  const response = await requestJson(
    `/api/v1/framings/${encodeURIComponent(id)}`,
    { method: "DELETE", ifMatch },
  );
  return parse(response, "framing_delete_failed");
}

/** `POST /api/v1/framings/{id}/restore` — brings an archived framing back. */
export async function restoreFraming(id) {
  const response = await requestJson(
    `/api/v1/framings/${encodeURIComponent(id)}/restore`,
    { method: "POST", body: {} },
  );
  return parse(response, "framing_restore_failed");
}
