// What a plan of the library says of its session: the one status of a past plan
// ("À débriefer" is the Journal's `to_debrief`), the line of what its session
// gave, and the page "Voir la session" opens. Read from the Journal list (`GET
// /api/v1/journal`, a read no right holds back) and from the space's plans
// (`GET /api/v1/plans`: the server id of each plan the planner holds under its
// own id). Pure parts and the loader are apart from the component so they are
// tested without a page.
import { message } from "portal/i18n.js";
import { durationText } from "portal/written-forms.js";
import { requestJson } from "portal/components/sessions/portal-fetch.js";

const PAGE = 100;
// 10 pages of 100 lines: a thousand sessions is more than a library shows.
const MAX_PAGES = 10;

const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** What the library keeps of a Journal line, by the planner's plan id. */
function entryOf(line, serverPlanId) {
  return {
    planId: serverPlanId,
    sessionId: line.sessionId ?? null,
    state: line.state,
    acquiredSeconds: finite(line.acquiredSeconds),
    plannedSeconds: finite(line.plannedSeconds),
    frameCount: finite(line.frameCount),
  };
}

/**
 * The sessions of the plans of this browser, `Map<plannerPlanId, entry>`:
 * `entry` = `{ planId, sessionId | null, state, acquiredSeconds,
 * plannedSeconds, frameCount }`, `state` the Journal's (`to_debrief`,
 * `executed`, `partial`, `abandoned`). A plan that is not in the space, or
 * whose night is not over, has none. Nothing is thrown: a visitor, a network
 * that fails or an old service read as "no session".
 */
export async function loadPlanSessions({ request = requestJson } = {}) {
  const sessions = new Map();
  // `sessions.groups`, `Map<projectId, group>` (`GET /v1/journal`,
  // `groups[]`): what the library's card of a multi-night plan says of it.
  const groups = new Map();
  sessions.groups = groups;
  try {
    const plans = await request("/api/v1/plans");
    if (!plans.ok) return sessions;
    const resources = ((await plans.json())?.plans ?? []).filter(
      (plan) => plan?.id && plan?.payload?.id,
    );
    const plannerIdOf = new Map(
      resources.map((plan) => [plan.id, plan.payload.id]),
    );
    if (!plannerIdOf.size) return sessions;
    // A plan debriefed whose session was deleted or erased ("Session
    // manquante") says so; the library offers to make it again.
    for (const plan of resources)
      if (plan.sessionMissing === true)
        sessions.set(plan.payload.id, {
          planId: plan.id,
          sessionId: null,
          state: "missing",
          deletedSessionId: plan.deletedSessionId ?? null,
        });
    let cursor = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams({ limit: String(PAGE) });
      if (cursor) query.set("cursor", cursor);
      const response = await request(`/api/v1/journal?${query}`);
      if (!response.ok) break;
      const body = await response.json();
      // The groups of the multi-night plans (their state,
      // their figures, the whole plan's), kept beside the sessions.
      for (const group of body?.groups ?? [])
        if (group?.projectId && !groups.has(group.projectId))
          groups.set(group.projectId, group);
      for (const line of body?.sessions ?? []) {
        const plannerId = plannerIdOf.get(line?.planId);
        if (plannerId && !sessions.has(plannerId))
          sessions.set(plannerId, entryOf(line, line.planId));
      }
      cursor = body?.nextCursor ?? null;
      if (!cursor) break;
    }
  } catch {
    // Read as "no session": the library still lists its plans.
  }
  return sessions;
}

/** Whether the plan waits for its debriefing (the Journal's `to_debrief`). */
export const planToDebrief = (entry) => entry?.state === "to_debrief";

/**
 * The page "Voir la session" opens: the session's own, or — a plan carried
 * out without the application, not debriefed — the plan's own night, where
 * its debriefing is.
 */
export function planSessionHref(locale, entry) {
  if (!entry || entry.state === "missing") return null;
  if (entry.sessionId)
    return `/${locale}/sessions/${encodeURIComponent(entry.sessionId)}`;
  if (entry.planId)
    return `/${locale}/sessions/debrief/${encodeURIComponent(entry.planId)}`;
  return null;
}

const minutesOf = (seconds) => Math.round(seconds / 60);

/**
 * The line of what the plan's session gave ("Sa session : 3 h 05 sur
 * 4 h"), or that its debriefing waits; `null` when the plan has no session
 * to say or nothing known of it. `plannedMinutes` is what the plan placed:
 * the session's own figure first, then the plan's.
 */
export function planSessionLine(locale, entry, plannedMinutes = 0) {
  if (!entry || entry.state === "missing") return null;
  if (planToDebrief(entry)) return message(locale, "planSheetSessionAwaiting");
  if (entry.acquiredSeconds === null) return null;
  const planned =
    entry.plannedSeconds > 0
      ? minutesOf(entry.plannedSeconds)
      : Number(plannedMinutes) || 0;
  const acquired = durationText(minutesOf(entry.acquiredSeconds), locale);
  return planned > 0
    ? message(locale, "planSheetSessionGave")
        .replace("{acquired}", acquired)
        .replace("{planned}", durationText(planned, locale))
    : message(locale, "planSheetSessionAcquired").replace(
        "{acquired}",
        acquired,
      );
}
