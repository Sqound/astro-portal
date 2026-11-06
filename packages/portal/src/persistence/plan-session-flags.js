// What a plan says of its session: the plan of a
// deleted session stays, « exécuté », and says its session is missing. Pure
// reading of rows, shared by the plan routes and the Journal; it imports no
// repository (`planner-state-repository.js` imports this one).

/** The outcomes a debriefing freezes a plan with. */
export const DEBRIEF_PLAN_OUTCOMES = Object.freeze([
  "executed",
  "partial",
  "abandoned",
]);

/**
 * The outcome a debriefed plan row carries, or `null`: its own `status`, or,
 * for a plan archived after its debriefing, the status it had before
 * (`archived_from`), so that archiving a plan never changes what its session
 * reads. A plan that was not frozen by a decision has none.
 */
export function debriefedStatusOf(plan) {
  if (!plan?.frozen_at) return null;
  const status = plan.status === "archived" ? plan.archived_from : plan.status;
  return DEBRIEF_PLAN_OUTCOMES.includes(status) ? status : null;
}

const chunks = (list, size = 500) => {
  const parts = [];
  for (let at = 0; at < list.length; at += size)
    parts.push(list.slice(at, at + size));
  return parts;
};

/** An executed or archived plan: it goes to the trash once no live session names it. */
const historyPlanRow = (row) =>
  ["executed", "partial", "archived"].includes(row?.status);

/**
 * `Map(planId -> { sessionMissing: true, deletedSessionId? } | {
 * liveSessionId })` for the plan rows that were debriefed and hold **no live
 * session**: the session was deleted (`deletedSessionId`: the one the trash
 * can restore, the most recently deleted) or is gone. An executed or archived
 * plan that a live session still names carries that session
 * (`liveSessionId`, the oldest): the plan goes to the trash once it is
 * there. A plan still an intention, and a plan that was never debriefed nor
 * archived, are not in the map.
 */
export async function sessionFlagsForPlanRows(executor, tenantId, rows) {
  const flags = new Map();
  const read = rows.filter(
    (row) => debriefedStatusOf(row) || historyPlanRow(row),
  );
  if (!read.length) return flags;
  const live = new Map();
  const deleted = new Map();
  for (const part of chunks(read.map((row) => row.id)))
    for (const session of (
      await executor.query(
        `SELECT id, plan_id, deleted_at FROM observation_sessions
         WHERE tenant_id = ? AND plan_id IN (${part.map(() => "?").join(", ")})
         ORDER BY deleted_at, started_at, id`,
        [tenantId, ...part],
      )
    ).rows)
      if (!session.deleted_at) {
        if (!live.has(session.plan_id)) live.set(session.plan_id, session.id);
      } else deleted.set(session.plan_id, session.id);
  for (const row of read) {
    if (live.has(row.id)) {
      if (historyPlanRow(row))
        flags.set(row.id, { liveSessionId: live.get(row.id) });
      continue;
    }
    if (!debriefedStatusOf(row)) continue;
    flags.set(row.id, {
      sessionMissing: true,
      ...(deleted.has(row.id) ? { deletedSessionId: deleted.get(row.id) } : {}),
    });
  }
  return flags;
}

const instantOf = (text) => {
  const at = Date.parse(text);
  return Number.isFinite(at) ? at : 0;
};
const textOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Session events in the order of their instants, then of their arrival. */
const byInstant = (a, b) =>
  instantOf(a.recorded_at) - instantOf(b.recorded_at) ||
  instantOf(a.received_at) - instantOf(b.received_at) ||
  textOrder(String(a.event_id), String(b.event_id));

/**
 * `Map(planId -> { executionState: "running" | "paused", executionSessionId })`
 * for the plan rows whose night is being carried out on a device: a live
 * session of the plan is open or paused. A plan with no such session is not in
 * the map (its execution state reads `none`). The session's own `status` is not
 * read (a stale copy of it made a night that runs read paused): the night is
 * paused while the last `pause` event of the session has no `resume` after it
 * (the phone's own rule), the events taken in the order of the instants they
 * were recorded at -- two spellings of one instant (`Z`, `+09:00`) sort apart
 * as text.
 */
export async function executionStatesForPlanRows(executor, tenantId, rows) {
  const states = new Map();
  if (!rows.length) return states;
  const sessionByPlan = new Map();
  for (const part of chunks(rows.map((row) => row.id)))
    for (const session of (
      await executor.query(
        `SELECT id, plan_id, status FROM observation_sessions
         WHERE tenant_id = ? AND plan_id IN (${part.map(() => "?").join(", ")})
           AND deleted_at IS NULL AND finished_at IS NULL
           AND status IN ('open', 'paused')
         ORDER BY started_at, id`,
        [tenantId, ...part],
      )
    ).rows)
      sessionByPlan.set(session.plan_id, session);
  if (!sessionByPlan.size) return states;
  const lastBreak = new Map();
  for (const part of chunks([...sessionByPlan.values()].map((s) => s.id)))
    for (const event of (
      await executor.query(
        `SELECT session_id, type, recorded_at, received_at, event_id
         FROM session_events
         WHERE session_id IN (${part.map(() => "?").join(", ")})
           AND type IN ('pause', 'resume')`,
        part,
      )
    ).rows.sort(byInstant))
      lastBreak.set(event.session_id, event.type);
  for (const [planId, session] of sessionByPlan)
    states.set(planId, {
      executionState:
        lastBreak.get(session.id) === "pause" ? "paused" : "running",
      executionSessionId: session.id,
    });
  return states;
}
