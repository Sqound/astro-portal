/**
 * The single source of truth for a framing's usage state, proven by the
 * fixtures at `packages/astro-contracts/fixtures/framing-usage.json`.
 *
 * The server (`packages/portal/src/persistence/framing-repository.js`) is the
 * only place this function's result is ever enforced; every client only
 * calls it to show the right warning/label before writing, including
 * offline.
 */

export type FramingResourceState = "free" | "shared" | "locked" | "archived";

/** One plan that references a framing, in the shape the caller already has
 * on hand after joining `plan_framings` with `plans` (server) or the cached
 * plan table (mobile). Only plans that still exist (`deletedAt` absent or
 * null) should be passed in; a defensive filter is applied here too. */
export interface FramingPlanRef {
  planId: string;
  name: string;
  planDate: string | null;
  /** The API spelling: "active" | "executed" | "partial" | "abandoned" |
   * "archived" (never the internal "pending"). */
  status: string;
  deletedAt?: string | null;
}

export interface FramingUsageInput {
  framingId: string;
  /** Every non-deleted plan that references this framing. */
  plans: FramingPlanRef[];
  /** The subset of `plans`' `planId`s that have at least one observation
   * session (`observation_sessions.plan_id`), regardless of that session's
   * own status. */
  sessionPlanIds: string[];
  /** The framing's own `archived_at`, when the caller already knows it. A
   * truthy value always wins: an `archived` framing is a stored gesture, never
   * computed from usage. */
  archivedAt?: string | null;
}

export interface FramingUsageResult {
  state: FramingResourceState;
  executedPlans: FramingPlanRef[];
  pendingPlans: FramingPlanRef[];
}

/**
 * A plan counts as "executed" for framing-locking purposes if its
 * status is `executed`, `partial` or `archived`, OR it already has an
 * observation session UNLESS its status is `abandoned` (the API refuses to
 * abandon a plan whose session holds field events, so an abandoned plan's
 * session, if any, is empty by construction).
 */
function planIsExecutedForFraming(
  plan: FramingPlanRef,
  hasSession: boolean,
): boolean {
  if (
    plan.status === "executed" ||
    plan.status === "partial" ||
    plan.status === "archived"
  )
    return true;
  if (plan.status === "abandoned") return false;
  return hasSession;
}

/** A framing's usage state and the two plan lists a warning sheet
 * names, computed from the plans and sessions that currently reference it. */
export function framingUsage(args: FramingUsageInput): FramingUsageResult {
  const sessionSet = new Set(args.sessionPlanIds || []);
  const livePlans = (args.plans || []).filter((plan) => !plan?.deletedAt);
  const executedPlans: FramingPlanRef[] = [];
  const pendingPlans: FramingPlanRef[] = [];
  for (const plan of livePlans) {
    const ref: FramingPlanRef = {
      planId: plan.planId,
      name: plan.name,
      planDate: plan.planDate ?? null,
      status: plan.status,
    };
    if (planIsExecutedForFraming(plan, sessionSet.has(plan.planId)))
      executedPlans.push(ref);
    else pendingPlans.push(ref);
  }
  let state: FramingResourceState;
  if (args.archivedAt) state = "archived";
  else if (executedPlans.length > 0) state = "locked";
  else if (pendingPlans.length > 0) state = "shared";
  else state = "free";
  return { state, executedPlans, pendingPlans };
}
