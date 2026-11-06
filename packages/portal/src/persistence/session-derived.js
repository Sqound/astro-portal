import { parseJson } from "./planner-state-repository.js";
import {
  DEBRIEF_PLAN_OUTCOMES,
  debriefedStatusOf,
} from "./plan-session-flags.js";
import { nightEveningDate } from "./project-night-repository.js";

// "Session" here is always an OBSERVATION session; see the naming note at the
// top of persistence/observation-session-repository.js.

/**
 * The fields of a session the service works out when it answers, rather than
 * stores (`session.schema.json`, `resource`):
 *
 * - `outcome`: the outcome of the debriefing of the session's plan
 *   (`executed`, `partial`, `abandoned`), `null` for a session not debriefed
 *   yet and for a session without a plan. Nothing is stored on the session:
 *   a session created before the Journal reads its outcome from its plan,
 *   and no script migrates anything.
 * - `projectId`: the multi-night plan the session belongs to: the link of the
 *   first plan item that carries one, else the link of the session itself
 *   (`observation_sessions.project_id`), else `null`. `projectIds` lists
 *   every plan the night is linked to (a night of two targets may serve two
 *   plans), `projectId` being the first.
 * - `eveningDate`: the date of the night, the definition of the integrations
 *   (`nightEveningDate`).
 */

export const DEBRIEF_OUTCOMES = DEBRIEF_PLAN_OUTCOMES;

/**
 * The outcome a plan row was debriefed with, or `null` (an archived plan
 * keeps the one it had: `archived_from`).
 */
export function debriefOutcomeOfPlanRow(plan) {
  return debriefedStatusOf(plan);
}

/** The items of a plan row's payload, objects only. */
export function planItemsOfRow(plan) {
  const payload = parseJson(plan?.payload_json, null);
  return (Array.isArray(payload?.items) ? payload.items : []).filter(
    (item) => item && typeof item === "object" && !Array.isArray(item),
  );
}

const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** The longitude of the place a session names itself, or `null`. */
export function sessionLongitude(row) {
  const longitude = Number(parseJson(row?.place_json, null)?.longitude);
  return Number.isFinite(longitude) ? longitude : null;
}

/**
 * Every multi-night plan a night is linked to: the links of its plan items
 * (each item may point at a different plan: a night of two targets), in the
 * order of the items, else the link of the session itself. `projectId`, the
 * first, stays the plan the night is drawn under.
 */
export function projectIdsOf(row, plan = null) {
  const ids = [];
  for (const item of planItemsOfRow(plan)) {
    const id = text(item.projectId);
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (!ids.length && row?.project_id) ids.push(row.project_id);
  return ids;
}

/** `{ outcome, projectId, projectIds, eveningDate }` of a session row and its plan row. */
export function derivedFieldsOf(row, plan = null) {
  const projectIds = projectIdsOf(row, plan);
  return {
    outcome: debriefOutcomeOfPlanRow(plan),
    projectId: projectIds[0] ?? null,
    projectIds,
    eveningDate: nightEveningDate({
      planDate: plan?.plan_date ?? null,
      startedAt: row.started_at,
      longitude: sessionLongitude(row),
    }),
  };
}

/** The plan rows (any state, deleted ones included) by id, one query. */
export async function planRowsById(executor, tenantId, planIds) {
  const ids = [...new Set(planIds.filter(Boolean))];
  const plans = new Map();
  for (let at = 0; at < ids.length; at += 500) {
    const chunk = ids.slice(at, at + 500);
    for (const plan of (
      await executor.query(
        `SELECT * FROM plans WHERE tenant_id = ? AND id IN (${chunk
          .map(() => "?")
          .join(", ")})`,
        [tenantId, ...chunk],
      )
    ).rows)
      plans.set(plan.id, plan);
  }
  return plans;
}

/** The derived fields of many session rows of a space: `Map(sessionId -> fields)`. */
export async function derivedFieldsForRows(executor, tenantId, rows) {
  const plans = await planRowsById(
    executor,
    tenantId,
    rows.map((row) => row.plan_id),
  );
  return new Map(
    rows.map((row) => [
      row.id,
      derivedFieldsOf(
        row,
        row.plan_id ? (plans.get(row.plan_id) ?? null) : null,
      ),
    ]),
  );
}
