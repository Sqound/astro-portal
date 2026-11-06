"use client";

import { clientInstanceHeaders } from "portal/planner/change-subscription.js";
import { csrfCookieValue } from "portal/csrf-cookie.js";
import { headerStale } from "portal/components/header-refresh.js";

// A tiny shared client-side helper for the /v1 writes the debriefing UI
// makes (the decision, a supplement's accept/dismiss): the same
// cookie-CSRF pattern AccountPage.js and LocaleSwitcher.js already carry
// locally, factored out once because this task adds a second and third
// caller of it (DebriefScreen.js, SessionDetailPage.js).

export function csrfToken() {
  return csrfCookieValue() || "";
}

/** Reads a fetch Response's JSON body and throws with its error message on a non-2xx status. */
export async function responseData(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);
  if (response.ok) return payload;
  const error = new Error(payload?.error?.message || fallbackMessage);
  error.code = payload?.error?.code || null;
  // Why a refusal was given (`plan_not_debriefable`: `night_in_future` or
  // `session_has_events`), when the service says it.
  error.reason = payload?.error?.reason || null;
  error.status = response.status;
  return Promise.reject(error);
}

/** POSTs a JSON body to a same-origin /api/v1/... route with the browser's own CSRF token. */
export async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-astro-csrf": csrfToken(),
      ...clientInstanceHeaders(),
    },
    body: JSON.stringify(body ?? {}),
  });
  // A night debriefed leaves the header's « Journal » badge (the header is
  // kept across navigations).
  if (response.ok && /\/debrief(?:\?|$)/.test(String(path))) headerStale();
  return response;
}

// The framing
// resource routes need `GET`/`PUT`/`DELETE` with an `If-Match` header, which
// `postJson` (POST only, no extra headers) cannot express. Same cookie
// session + CSRF pattern, generalised.
export async function requestJson(
  path,
  { method = "GET", body, ifMatch } = {},
) {
  const headers = { ...clientInstanceHeaders() };
  if (method !== "GET") headers["x-astro-csrf"] = csrfToken();
  if (body !== undefined) headers["content-type"] = "application/json";
  if (ifMatch !== undefined) headers["if-match"] = ifMatch;
  return fetch(path, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
