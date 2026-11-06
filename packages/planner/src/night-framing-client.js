// "Créer un cadrage sur la carte…" of the night's "Cibles": the web client of
// what a framing made for a night gives back to it. The editor is the planner's
// (`PlannerPage`); when it was opened for a night (`nightFramingRequest`), the
// framing's catalogue target joins the night's targets and the person lands
// back on the night's page, which says what happened once
// (`nightFramingNoticeKey`). The rules are `night-targets-search.js`'s; this is
// only the two requests and the note.

import { requestJson } from "portal/components/sessions/portal-fetch.js";
import {
  nightFramingNoticeKey,
  nightTargetIdsWithFraming,
} from "./night-targets-search.js";

/**
 * Adds the target a new framing frames to the night, by `PATCH
 * /v1/sessions/{id}/night` with the night's list as it stands (`GET
 * /v1/sessions/{id}`). Resolves to `{ added, target }` — `added` false for a
 * framing on no catalogue object or on a target the night already holds —
 * and rejects when the night cannot be read or changed (the framing itself
 * is saved either way).
 */
export async function addFramingTargetToNight({
  sessionId,
  catalogueTargetId,
  request = requestJson,
}) {
  const base = `/api/v1/sessions/${encodeURIComponent(sessionId)}`;
  const detail = await request(base);
  if (!detail.ok) throw new Error("night_unavailable");
  const night = (await detail.json())?.night;
  const { targetIds, added } = nightTargetIdsWithFraming(
    night?.targetIds?.value,
    catalogueTargetId,
  );
  if (!added) return { added: false, targetIds };
  const patch = await request(`${base}/night`, {
    method: "PATCH",
    body: { targetIds },
  });
  if (!patch.ok) throw new Error("night_not_saved");
  return { added: true, targetIds };
}

/** Leaves the note the night's page reads once: the framing's name and the target it added, if any. */
export function rememberNightFraming(sessionId, note, storage) {
  try {
    (storage ?? window.sessionStorage).setItem(
      nightFramingNoticeKey(sessionId),
      JSON.stringify(note),
    );
  } catch {
    // The note is a courtesy; the night's targets are what matters.
  }
}

/** Reads and removes the note (null when there is none). */
export function takeNightFraming(sessionId, storage) {
  try {
    const store = storage ?? window.sessionStorage;
    const raw = store.getItem(nightFramingNoticeKey(sessionId));
    if (raw === null) return null;
    store.removeItem(nightFramingNoticeKey(sessionId));
    const note = JSON.parse(raw);
    return note && typeof note.name === "string"
      ? { name: note.name, target: note.target || null, failed: !!note.failed }
      : null;
  } catch {
    return null;
  }
}
