// A plan whose night is carried out on another device, read by the web: it is "Nuit en
// cours" here too, with the slots as they were launched, read-only, and it is
// not edited, deleted or executed from the web while the execution runs. The
// state is the service's (`executionByPlanId` of the planner document, derived
// from the open session; `api/v1.md`, "A night that runs on a device"): the web
// never decides it, never stores it, and reads it again at every change signal.
// Pure, no DOM.
import { planTargetLabel } from "./tonight-overview.js";

const states = new Set(["running", "paused"]);

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * `{ [planId]: { state, sessionId } }` from what the service served (a
 * planner document or the whole answer of a save), keeping the entries it
 * understands only; `{}` when no night runs.
 */
export function executionByPlanIdOf(source) {
  const raw = source?.executionByPlanId;
  if (!isObject(raw)) return {};
  const result = {};
  for (const [planId, entry] of Object.entries(raw))
    if (isObject(entry) && states.has(entry.state))
      result[planId] = {
        state: entry.state,
        sessionId: typeof entry.sessionId === "string" ? entry.sessionId : null,
      };
  return result;
}

/** `{ state, sessionId }` of the plan's running night, `null` when there is none. */
export function planExecutionOf(executionByPlanId, plan) {
  const id = typeof plan === "string" ? plan : plan?.id;
  if (!id || !isObject(executionByPlanId)) return null;
  const entry = executionByPlanId[id];
  return isObject(entry) && states.has(entry.state) ? entry : null;
}

/** Whether the plan's night runs on a device (open or paused). */
export const planIsExecuting = (executionByPlanId, plan) =>
  planExecutionOf(executionByPlanId, plan) !== null;

/**
 * The slots of the plan as they were launched, in the order of the launch:
 * `{ key, planItemId, targetId, startMinute, endMinute, label }`. The label is
 * the target's name in the plan as it stands now (the item the slot names),
 * else the launch's own `targetId`. `[]` before a launch was written.
 */
export function launchedSlotsOf(plan) {
  const launched = Array.isArray(plan?.launchedSchedule)
    ? plan.launchedSchedule
    : [];
  const items = Array.isArray(plan?.items) ? plan.items : [];
  return launched
    .filter(
      (entry) =>
        isObject(entry) &&
        Number.isFinite(entry.startMinute) &&
        Number.isFinite(entry.endMinute) &&
        entry.endMinute > entry.startMinute,
    )
    .map((entry, index) => {
      const item = items.find(
        (candidate) => candidate?.id === entry.planItemId,
      );
      return {
        key: `launched-${index}`,
        planItemId: entry.planItemId,
        targetId: entry.targetId,
        startMinute: entry.startMinute,
        endMinute: entry.endMinute,
        label:
          (item && planTargetLabel(item)) ||
          String(entry.targetId || "").trim(),
      };
    });
}

/**
 * The plan seen as launched: the same plan whose items are the launched slots
 * (each keeps the target of the item it names), for the frise of the night —
 * the web's "Prévu" rail. `null` when no launch was written.
 */
export function launchedPlanOf(plan) {
  const slots = launchedSlotsOf(plan);
  if (!slots.length) return null;
  const items = Array.isArray(plan?.items) ? plan.items : [];
  return {
    ...plan,
    items: slots.map((slot) => {
      const item = items.find((candidate) => candidate?.id === slot.planItemId);
      return {
        ...(item ?? { id: slot.planItemId, title: slot.label }),
        id: slot.key,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
      };
    }),
  };
}
