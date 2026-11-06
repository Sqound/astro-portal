import {
  requestJson,
  responseData,
} from "portal/components/sessions/portal-fetch.js";
import { sessionPassages } from "portal/session-passages.js";
import { previousNightNote as unknownNote } from "./previous-night-note.js";

// The minutes a target was observed in the passages of a night: the time
// counted (pauses deducted), else the passage itself.
function observedMinutes(passages) {
  const minutes = new Map();
  for (const passage of passages) {
    if (!passage.targetId || !passage.end || passage.endedBy === "skipped")
      continue;
    const ms = Number.isFinite(passage.countedMs)
      ? passage.countedMs
      : Date.parse(passage.end) - Date.parse(passage.start) || 0;
    minutes.set(
      passage.targetId,
      (minutes.get(passage.targetId) || 0) + Math.round(ms / 60000),
    );
  }
  return minutes;
}

const finite = (value) => typeof value === "number" && Number.isFinite(value);

// Read the existing journal; no writes and no capture-derived night inference.
//
// One row per target and night, `{id, date, outcome, mode,
// acquiredMinutes?, plannedMinutes?, placeId?, latitude?, longitude?,
// noteThen?}` — what the malus of the suggestions reads. `outcome` is `done`
// (the debriefing's), `observed` (a visual night's passages) or `partial` (the
// debriefing's, which counts at what was done); `abandoned` never enters.
// `noteThen` comes from `previousNightNote(date, place)`, asked once per night
// and place; `null` (offline, no data) leaves the row without it.
export async function loadSuggestionHistory({
  read = async (path) =>
    responseData(await requestJson(path), "suggestion_history_failed"),
  previousNightNote = unknownNote,
} = {}) {
  const plans = (await read("/api/v1/plans")).plans || [];
  const byId = new Map(plans.map((plan) => [plan.id, plan.payload]));
  const history = [];
  let since = null;
  const seen = new Set();
  for (;;) {
    const query = new URLSearchParams({ limit: "200" });
    if (since) query.set("since", since);
    const page = await read(`/api/v1/sessions?${query}`);
    for (const session of page.sessions || []) {
      if (session.status !== "finished" || seen.has(session.id)) continue;
      seen.add(session.id);
      const detail = await read(
        `/api/v1/sessions/${encodeURIComponent(session.id)}`,
      );
      const plan = byId.get(session.planId);
      const date =
        plan?.date ||
        new Intl.DateTimeFormat("en-CA", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          timeZone: session.timeZone || "UTC",
        }).format(new Date(session.startedAt));
      const visual = plan?.equipment?.mode === "visual";
      const targets = new Map();
      for (const target of detail.debriefSummary?.perTarget || [])
        if (target.targetId) targets.set(target.targetId, target);
      let observed = new Map();
      if (visual) {
        const events = [];
        let cursor = null;
        const cursors = new Set();
        for (;;) {
          const q = new URLSearchParams({ limit: "500" });
          if (cursor) q.set("since", cursor);
          const result = await read(
            `/api/v1/sessions/${encodeURIComponent(session.id)}/events?${q}`,
          );
          events.push(...(result.events || []));
          if (!result.nextSince || cursors.has(result.nextSince)) break;
          cursor = result.nextSince;
          cursors.add(cursor);
        }
        observed = observedMinutes(
          sessionPassages({ events, windowEnd: session.finishedAt }),
        );
      }
      const place = plan?.location || {};
      const latitude = Number(place.latitude);
      const longitude = Number(place.longitude);
      for (const id of new Set([...targets.keys(), ...observed.keys()])) {
        const target = targets.get(id) || {};
        // A target done outweighs one observed, which outweighs one partly
        // done (the same rows, the same exclusions, as before the malus).
        const outcome =
          target.outcome === "done"
            ? "done"
            : observed.has(id)
              ? "observed"
              : target.outcome === "partial"
                ? "partial"
                : null;
        if (!outcome) continue;
        const acquired =
          outcome === "observed" ? observed.get(id) : target.acquiredMinutes;
        history.push({
          id,
          date,
          outcome,
          mode: visual ? "visual" : "photo",
          ...(finite(acquired) ? { acquiredMinutes: acquired } : {}),
          ...(finite(target.plannedMinutes)
            ? { plannedMinutes: target.plannedMinutes }
            : {}),
          ...(typeof place.id === "string" && place.id
            ? { placeId: place.id }
            : {}),
          ...(place.latitude != null && Number.isFinite(latitude)
            ? { latitude }
            : {}),
          ...(place.longitude != null && Number.isFinite(longitude)
            ? { longitude }
            : {}),
        });
      }
    }
    if (
      !page.nextSince ||
      page.nextSince === since ||
      !(page.sessions || []).length
    )
      break;
    since = page.nextSince;
  }
  const notes = new Map();
  const rows = [];
  for (const row of history) {
    if (!row.placeId && !finite(row.latitude)) {
      rows.push(row);
      continue;
    }
    const key = JSON.stringify([
      row.date,
      row.placeId ?? null,
      row.latitude ?? null,
      row.longitude ?? null,
    ]);
    if (!notes.has(key)) {
      try {
        notes.set(
          key,
          await previousNightNote(row.date, {
            ...(row.placeId ? { id: row.placeId } : {}),
            ...(finite(row.latitude) ? { latitude: row.latitude } : {}),
            ...(finite(row.longitude) ? { longitude: row.longitude } : {}),
          }),
        );
      } catch {
        notes.set(key, null);
      }
    }
    const note = notes.get(key);
    rows.push(finite(note) ? { ...row, noteThen: note } : row);
  }
  return rows;
}
